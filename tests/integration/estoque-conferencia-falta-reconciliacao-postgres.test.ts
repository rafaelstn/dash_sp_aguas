/**
 * Reconciliação de divergência NEGATIVA (falta) contra POSTGRES REAL.
 *
 * NÃO MEDIDO nesta bancada: a máquina de 06/10/2026 não tem Docker, PostgreSQL,
 * psql nem pg_isready (decisão do Rafael de 01/10/2026), então NENHUM caso deste
 * arquivo foi executado aqui; quem executa é o job `integracao` do CI.
 *
 * POR QUE ESTE ARQUIVO EXISTE
 * ---------------------------
 * O `estoque-conferencia-postgres.test.ts` cobre a reconciliação, mas o caminho
 * que ele exercita com SUCESSO é sempre o POSITIVO (sobra): medido em 06/10/2026,
 * as seis chamadas de `prepararDivergencia` daquele arquivo são (10,12), (10,15),
 * (10,4), (10,12), (10,10) e (10,12). A única negativa, a (10,4) da linha 180
 * ("falha no meio faz rollback do carimbo E da movimentação"), existe para
 * FALHAR: o cenário derruba o saldo real para 2 antes de reconciliar, e o caso
 * mede o rollback. Ou seja: a falta que dá certo, que é a que mexe no patrimônio
 * do órgão, nunca foi medida de ponta a ponta contra banco real.
 *
 * Caminho sob medição (`resolverReconciliacao`, diferenca < 0): `saida` de
 * `abs(diferenca)` do local esperado, sem solicitante, isenta do CHECK
 * `ck_estoque_mov_saida_solicitante` (0075) por `conferencia_id IS NOT NULL`.
 * O `estoque-movimentacoes-solicitante-postgres.test.ts` prova essa isenção por
 * INSERT à mão, com `conferencia_id` escrito no teste; aqui ela é exercitada pelo
 * PRODUTO, que é quem precisa continuar passando.
 *
 * O QUE CADA CASO JULGA: o ESTADO DO BANCO (ledger, saldo, item, resumo), nunca
 * o objeto devolvido pela função. O retorno entra só como âncora de que a
 * chamada aconteceu.
 *
 * Roda apenas com `TEST_DATABASE_URL` apontando para um Postgres descartável com
 * as migrations aplicadas; sem a variável, o arquivo inteiro é pulado e nunca
 * toca produção.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

// O repositório .pg lê a conexão de `getEnv()`, que cacheia no primeiro uso:
// setar antes de importar o módulo faz o singleton nascer apontando para o banco
// de teste.
process.env.DATABASE_URL = URL_TESTE;

// Três atores DISTINTOS de propósito. Com um único uuid, "o usuario_id vem do
// ator" passaria por coincidência: qualquer coluna que o código copiasse (quem
// abriu, quem contou) daria o mesmo valor.
// Não reusam o uuid do `estoque-conferencia-postgres.test.ts` (que é o
// `1111...`): `auth.users` não é truncado entre suítes, e id repetido com e-mail
// diferente deixaria a leitura do log ambígua sobre qual suíte escreveu a linha.
const ABRIU = '44444444-4444-4444-8444-444444444444';
const CONTOU = '55555555-5555-4555-8555-555555555555';
const RECONCILIOU = '66666666-6666-4666-8666-666666666666';

/** Colunas do ledger que descrevem o FATO, sem id, carimbo de tempo e vínculo. */
interface FatoLedger {
  tipo: string;
  unidade_id: string | null;
  material_id: string | null;
  quantidade: number;
  local_origem: string | null;
  local_destino: string | null;
  estado_anterior: string | null;
  estado_novo: string | null;
  status_anterior: string | null;
  status_novo: string | null;
  usuario_id: string;
  solicitante_matricula: string | null;
}

interface LinhaLedger extends FatoLedger {
  id: string;
  motivo: string | null;
  conferencia_id: string | null;
  criado_em: Date;
}

rodar('reconciliação de FALTA contra Postgres real', () => {
  let sql: Sql;
  let repo: typeof import('@/infrastructure/db/estoque-conferencias-repository.pg')['estoqueConferenciasRepository'];
  let movRepo: typeof import('@/infrastructure/db/estoque-movimentacoes-repository.pg')['estoqueMovimentacoesRepository'];

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false, transform: { undefined: null } });
    repo = (await import('@/infrastructure/db/estoque-conferencias-repository.pg'))
      .estoqueConferenciasRepository;
    movRepo = (await import('@/infrastructure/db/estoque-movimentacoes-repository.pg'))
      .estoqueMovimentacoesRepository;
    // Domínio reservado de propósito (`.test` nunca resolve): e-mail de teste não
    // leva domínio real, nem do órgão. `auth.users` é o shim de `db/auth-compat.sql`.
    for (const id of [ABRIU, CONTOU, RECONCILIOU]) {
      await sql`INSERT INTO auth.users (id, email)
                VALUES (${id}::uuid, ${`ator-${id.slice(0, 2)}@exemplo-dmo.test`})
                ON CONFLICT (id) DO NOTHING`;
    }
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    // Mesma ordem e mesmo conjunto das outras suítes de integração do estoque: as
    // FKs mandam, e TRUNCATE não dispara o gatilho de linha da 0074.
    await sql`TRUNCATE estoque_conferencia_itens, estoque_conferencias,
                       estoque_movimentacoes, estoque_saldos, estoque_unidades,
                       estoque_materiais, estoque_locais RESTART IDENTITY CASCADE`;
  });

  async function criarLocal(unidade: 'PENHA' | 'ARARAQUARA', sala: string): Promise<string> {
    const [linha] = await sql<{ id: string }[]>`
      INSERT INTO estoque_locais (unidade, sala, rotulo)
      VALUES (${unidade}, ${sala}, ${`${unidade} / ${sala}`})
      RETURNING id
    `;
    return linha!.id;
  }

  async function criarMaterial(descricao: string): Promise<string> {
    const [linha] = await sql<{ id: string }[]>`
      INSERT INTO estoque_materiais (descricao, natureza) VALUES (${descricao}, 'quantificavel')
      RETURNING id
    `;
    return linha!.id;
  }

  async function darEntrada(materialId: string, localId: string, quantidade: number) {
    await movRepo.registrar({
      tipo: 'entrada',
      alvo: { natureza: 'quantificavel', materialId },
      quantidade,
      localOrigemId: null,
      localDestinoId: localId,
      tamanho: null,
      motivo: 'carga inicial do cenário',
      usuarioId: ABRIU,
      solicitanteMatricula: null,
    });
  }

  /** Saldo e EXISTÊNCIA da linha: "zero" e "não há linha" são estados diferentes. */
  async function saldo(
    materialId: string,
    localId: string,
  ): Promise<{ linhas: number; quantidade: number | null }> {
    const linhas = await sql<{ quantidade: number }[]>`
      SELECT quantidade FROM estoque_saldos
       WHERE material_id = ${materialId}::uuid AND local_id = ${localId}::uuid
         AND COALESCE(tamanho, '') = ''
    `;
    return {
      linhas: linhas.length,
      quantidade: linhas.length > 0 ? Number(linhas[0]!.quantidade) : null,
    };
  }

  const COLUNAS_LEDGER = () => sql`
    id, tipo, unidade_id, material_id, quantidade, local_origem, local_destino,
    estado_anterior, estado_novo, status_anterior, status_novo, motivo, usuario_id,
    conferencia_id, solicitante_matricula, criado_em
  `;

  async function ledgerDaConferencia(conferenciaId: string): Promise<LinhaLedger[]> {
    return sql<LinhaLedger[]>`
      SELECT ${COLUNAS_LEDGER()} FROM estoque_movimentacoes
       WHERE conferencia_id = ${conferenciaId}::uuid
       ORDER BY criado_em ASC
    `;
  }

  /**
   * Conta TODO lançamento do material, e não só o carimbado com a conferência.
   * Contar por `conferencia_id` deixaria passar uma segunda saída gravada sem o
   * carimbo, que é justamente o defeito que a idempotência tem que impedir.
   */
  async function lancamentosDoMaterial(materialId: string, tipo: string): Promise<number> {
    const [linha] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM estoque_movimentacoes
       WHERE material_id = ${materialId}::uuid AND tipo = ${tipo}
    `;
    return linha!.n;
  }

  function fato(linha: LinhaLedger): FatoLedger {
    return {
      tipo: linha.tipo,
      unidade_id: linha.unidade_id,
      material_id: linha.material_id,
      quantidade: Number(linha.quantidade),
      local_origem: linha.local_origem,
      local_destino: linha.local_destino,
      estado_anterior: linha.estado_anterior,
      estado_novo: linha.estado_novo,
      status_anterior: linha.status_anterior,
      status_novo: linha.status_novo,
      usuario_id: linha.usuario_id,
      solicitante_matricula: linha.solicitante_matricula,
    };
  }

  /**
   * Motivo gravado na trilha, escrito LITERAL aqui em vez de importado de
   * `motivoReconciliacao`: reusar o gerador tornaria a asserção tautológica, e
   * este texto é o que o almoxarife lê na tela da trilha
   * (`TrilhaMovimentacoes.tsx`, coluna `motivo`). Se o texto mudar (por exemplo
   * para receber acento, que é o padrão da casa), ESTE é o lugar de atualizar,
   * no mesmo commit da mudança.
   */
  const motivoEsperado = (conferenciaId: string) =>
    `Conferencia fisica #${conferenciaId.slice(0, 8)} (ajuste de inventario)`;

  /**
   * Cenário de falta: entrada de `sistema`, sessão aberta, contagem de `contada`
   * (< sistema). `concluir` controla a sessão ficar aberta ou concluída, porque
   * um dos casos mede exatamente a ordem entre concluir e reconciliar.
   *
   * Três atores diferentes em três papéis: quem dá entrada e abre, quem conta, e
   * (no caso) quem reconcilia.
   */
  async function prepararFalta(
    sistema: number,
    contada: number,
    opcoes: { concluir?: boolean; sala?: string; materialId?: string; localId?: string } = {},
  ) {
    const localId = opcoes.localId ?? (await criarLocal('PENHA', opcoes.sala ?? 'SALA 1'));
    const materialId = opcoes.materialId ?? (await criarMaterial('Cabo coaxial 10m'));
    const saldoAntes = (await saldo(materialId, localId)).quantidade ?? 0;
    if (sistema > saldoAntes) await darEntrada(materialId, localId, sistema - saldoAntes);

    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: ABRIU,
    });
    const { itens } = await repo.listarItens(sessao.id, {});
    const item = itens.find((i) => i.materialId === materialId && i.localEsperadoId === localId)!;
    expect(item.quantidadeSistema).toBe(sistema);

    await repo.registrarContagem(
      sessao.id,
      item.id,
      { tipo: 'quantificavel', quantidadeContada: contada, observacao: null },
      CONTOU,
    );
    if (opcoes.concluir !== false) await repo.concluir(sessao.id, ABRIU, null);
    return { sessao, item, materialId, localId };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // O evento na trilha append-only
  // ───────────────────────────────────────────────────────────────────────────

  it('falta gera UMA saída no ledger, com os campos do ajuste e nada além dela', async () => {
    const { sessao, item, materialId, localId } = await prepararFalta(10, 4);

    const r = await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);
    expect(r.movimentacaoId).not.toBeNull();

    const linhas = await ledgerDaConferencia(sessao.id);
    expect(linhas).toHaveLength(1);
    // Projeção INTEIRA do fato, e não campo a campo: assim uma coluna que passe a
    // ser preenchida (status, estado, matrícula) reprova aqui em vez de passar
    // calada. `estado_*` e `status_*` são do serializado e têm que ficar nulos.
    expect(fato(linhas[0]!)).toEqual({
      tipo: 'saida',
      unidade_id: null,
      material_id: materialId,
      quantidade: 6, // abs(4 - 10)
      local_origem: localId, // sai do local ESPERADO (congelado no snapshot)
      local_destino: null,
      estado_anterior: null,
      estado_novo: null,
      status_anterior: null,
      status_novo: null,
      usuario_id: RECONCILIOU,
      // null é o par exato da isenção do CHECK ck_estoque_mov_saida_solicitante
      // (0075): ninguém retirou material, foi ajuste de inventário. Preencher
      // matrícula aqui seria inventar quem pediu.
      solicitante_matricula: null,
    });
    expect(linhas[0]!.motivo).toBe(motivoEsperado(sessao.id));
    expect(linhas[0]!.conferencia_id).toBe(sessao.id);
    expect(linhas[0]!.id).toBe(r.movimentacaoId);

    // Nada fora da conferência: só a entrada do cenário e esta saída existem.
    const [total] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM estoque_movimentacoes
    `;
    expect(total!.n).toBe(2);
    expect(await lancamentosDoMaterial(materialId, 'saida')).toBe(1);
  });

  it('o usuario_id da saída é o ATOR da reconciliação, não quem abriu nem quem contou', async () => {
    const { sessao, item } = await prepararFalta(10, 4);

    await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);

    // O ledger diz quem AJUSTOU o patrimônio. A origem é o argumento do
    // repositório (que a rota preenche com `auth.id` e nunca com o corpo), e os
    // outros dois uuids presentes no cenário são o controle: se o código copiasse
    // `criada_por` ou `contado_por`, o valor aqui seria um deles.
    const [mov] = await sql<{ usuario_id: string }[]>`
      SELECT usuario_id FROM estoque_movimentacoes WHERE conferencia_id = ${sessao.id}::uuid
    `;
    expect(mov!.usuario_id).toBe(RECONCILIOU);
    expect(mov!.usuario_id).not.toBe(ABRIU);
    expect(mov!.usuario_id).not.toBe(CONTOU);

    // E cada papel fica com o seu dono no banco: a trilha separa contar de ajustar.
    const [linhas] = await sql<
      {
        contado_por: string;
        reconciliado_por: string;
        criada_por: string;
        concluida_por: string;
      }[]
    >`
      SELECT i.contado_por, i.reconciliado_por, c.criada_por, c.concluida_por
        FROM estoque_conferencia_itens i
        JOIN estoque_conferencias c ON c.id = i.conferencia_id
       WHERE i.id = ${item.id}::uuid
    `;
    expect(linhas!.contado_por).toBe(CONTOU);
    expect(linhas!.reconciliado_por).toBe(RECONCILIOU);
    expect(linhas!.criada_por).toBe(ABRIU);
    expect(linhas!.concluida_por).toBe(ABRIU);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O saldo
  // ───────────────────────────────────────────────────────────────────────────

  it('o saldo depois da reconciliação é o CONTADO, não o anterior', async () => {
    const { sessao, item, materialId, localId } = await prepararFalta(10, 4);
    expect(await saldo(materialId, localId)).toEqual({ linhas: 1, quantidade: 10 });

    await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);

    expect(await saldo(materialId, localId)).toEqual({ linhas: 1, quantidade: 4 });
  });

  it('contagem ZERO zera o saldo e a linha CONTINUA existindo (zero não é ausente)', async () => {
    // Borda do fundo da escala: a saída é do total congelado. Se a reconciliação
    // apagasse a linha de saldo, o material desapareceria do local em vez de
    // constar com zero, e a próxima conferência não o listaria.
    const { sessao, item, materialId, localId } = await prepararFalta(10, 0);

    await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);

    expect(await saldo(materialId, localId)).toEqual({ linhas: 1, quantidade: 0 });
    const linhas = await ledgerDaConferencia(sessao.id);
    expect(linhas).toHaveLength(1);
    expect(Number(linhas[0]!.quantidade)).toBe(10);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O estado do item e da sessão
  // ───────────────────────────────────────────────────────────────────────────

  it('o item fica carimbado e a diferença CONTINUA gravada (evidência não se apaga)', async () => {
    const { sessao, item } = await prepararFalta(10, 4);

    const r = await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);

    const [linha] = await sql<
      {
        quantidade_sistema: number;
        quantidade_contada: number;
        diferenca: number;
        movimentacao_id: string | null;
        reconciliado_por: string | null;
        reconciliado_em: Date | null;
        origem: string;
      }[]
    >`
      SELECT quantidade_sistema, quantidade_contada, diferenca, movimentacao_id,
             reconciliado_por, reconciliado_em, origem
        FROM estoque_conferencia_itens WHERE id = ${item.id}::uuid
    `;
    expect(linha!.movimentacao_id).toBe(r.movimentacaoId);
    expect(linha!.reconciliado_por).toBe(RECONCILIOU);
    expect(linha!.reconciliado_em).toBeInstanceOf(Date);
    // O congelado e a contagem permanecem: reconciliar não "conserta" o item para
    // diferença zero, senão o inventário perderia a prova do que foi apurado.
    expect(Number(linha!.quantidade_sistema)).toBe(10);
    expect(Number(linha!.quantidade_contada)).toBe(4);
    expect(Number(linha!.diferenca)).toBe(-6);
    expect(linha!.origem).toBe('snapshot');
  });

  it('reconciliar exige sessão CONCLUÍDA, e concluir NÃO olha pendência (ordem real do fluxo)', async () => {
    // A ordem do produto é contar -> CONCLUIR -> reconciliar item por item, e não
    // o contrário: `reconciliarItem` recusa sessão aberta (passo 3 do
    // repositório) e `concluir` é uma transição de status que não consulta
    // pendência nenhuma. Medido em 06/10/2026: `TRANSICOES_STATUS` trata
    // 'concluida' como terminal, o CHECK ck_estoque_conf_concluida só exige
    // quem/quando, e nenhum índice ou constraint olha `reconciliado_em` na hora
    // de concluir. Então "a conferência só conclui quando não há pendência de
    // reconciliação" é FALSO neste produto, e este caso grava isso em asserção em
    // vez de descrever o contrário.
    const { sessao, item, materialId, localId } = await prepararFalta(10, 4, { concluir: false });

    await expect(repo.reconciliarItem(sessao.id, item.id, RECONCILIOU)).rejects.toMatchObject({
      name: 'ConferenciaNaoConcluida',
    });
    expect(await ledgerDaConferencia(sessao.id)).toHaveLength(0);
    expect(await saldo(materialId, localId)).toEqual({ linhas: 1, quantidade: 10 });

    const concluida = await repo.concluir(sessao.id, ABRIU, null);
    expect(concluida.status).toBe('concluida');
    // Concluiu COM a pendência em aberto. É o estado em que a sessão fica no órgão
    // entre a contagem e o despacho do ajuste, e nada no banco o impede.
    const antes = await repo.resumoDivergencias(sessao.id);
    expect(antes.divergentes).toBe(1);
    expect(antes.reconciliados).toBe(0);
    expect(antes.pendentesReconciliacao).toBe(1);

    await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);

    const depois = await repo.resumoDivergencias(sessao.id);
    expect(depois.pendentesReconciliacao).toBe(0);
    expect(depois.reconciliados).toBe(1);
    // A divergência não desaparece do resumo: ela foi TRATADA, não desfeita.
    expect(depois.divergentes).toBe(1);

    // E o item sai da fila de pendências sem sair da lista de divergentes.
    const pendentes = await repo.listarItens(sessao.id, { apenasPendentesRecon: true });
    expect(pendentes.itens).toHaveLength(0);
    const divergentes = await repo.listarItens(sessao.id, { apenasDivergentes: true });
    expect(divergentes.itens.map((i) => i.id)).toEqual([item.id]);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Rodar o caminho duas vezes (aprendizado da casa: upsert duas vezes)
  // ───────────────────────────────────────────────────────────────────────────

  it('reconciliar a MESMA falta duas vezes: um evento, um ajuste, carimbo intacto', async () => {
    const { sessao, item, materialId, localId } = await prepararFalta(10, 4);

    const primeira = await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);
    expect(primeira.jaReconciliado).toBe(false);
    const [antes] = await sql<{ reconciliado_em: Date }[]>`
      SELECT reconciliado_em FROM estoque_conferencia_itens WHERE id = ${item.id}::uuid
    `;

    const segunda = await repo.reconciliarItem(sessao.id, item.id, RECONCILIOU);
    expect(segunda.jaReconciliado).toBe(true);
    expect(segunda.movimentacaoId).toBe(primeira.movimentacaoId);

    expect(await ledgerDaConferencia(sessao.id)).toHaveLength(1);
    // Contagem por MATERIAL, não só pela conferência: uma segunda saída sem o
    // carimbo de conferência passaria pela contagem de cima.
    expect(await lancamentosDoMaterial(materialId, 'saida')).toBe(1);
    expect(await saldo(materialId, localId)).toEqual({ linhas: 1, quantidade: 4 });

    // O no-op não reescreve a autoria nem a data: se reescrevesse, a trilha
    // passaria a dizer que o ajuste aconteceu na segunda chamada.
    const [depois] = await sql<{ reconciliado_em: Date; reconciliado_por: string }[]>`
      SELECT reconciliado_em, reconciliado_por FROM estoque_conferencia_itens
       WHERE id = ${item.id}::uuid
    `;
    expect(depois!.reconciliado_em.getTime()).toBe(antes!.reconciliado_em.getTime());
    expect(depois!.reconciliado_por).toBe(RECONCILIOU);
  });

  it('duas reconciliações CONCORRENTES da mesma falta não tiram o dobro do saldo', async () => {
    // Gêmeo negativo do caso de sobra que já existe. Aqui o defeito seria visível
    // de duas formas: saldo 10 - 6 - 6, que o guard de não-negativo recusaria com
    // SaldoInsuficiente (daí o allSettled, que diz QUAL falhou), ou duas saídas no
    // ledger com o mesmo ajuste.
    const { sessao, item, materialId, localId } = await prepararFalta(10, 4);

    const resultados = await Promise.allSettled([
      repo.reconciliarItem(sessao.id, item.id, RECONCILIOU),
      repo.reconciliarItem(sessao.id, item.id, RECONCILIOU),
    ]);
    expect(
      resultados.map((r) => (r.status === 'fulfilled' ? 'ok' : String((r.reason as Error).name))),
    ).toEqual(['ok', 'ok']);

    expect(await ledgerDaConferencia(sessao.id)).toHaveLength(1);
    expect(await lancamentosDoMaterial(materialId, 'saida')).toBe(1);
    expect(await saldo(materialId, localId)).toEqual({ linhas: 1, quantidade: 4 });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // O QUE A TRILHA NÃO AFIRMA
  // ───────────────────────────────────────────────────────────────────────────

  it('a trilha NÃO distingue perda de erro de contagem: as duas faltas gravam a mesma linha', async () => {
    // Dois cenários com significados opostos para o órgão:
    //   (A) material que sumiu do estoque (perda, que em tese pede apuração);
    //   (B) contagem anterior errada, descoberta agora (nada sumiu).
    // Os rótulos acima existem SÓ nesta intenção de teste. O produto não pergunta
    // a causa, não tem campo para ela, e produz o MESMO fato nos dois casos. Este
    // caso não propõe conclusão sobre o que deveria existir: ele fixa o que a
    // trilha hoje afirma, para a lacuna ser visível a quem for ler o inventário.
    const localId = await criarLocal('PENHA', 'SALA 1');
    const materialId = await criarMaterial('Cabo coaxial 10m');

    const a = await prepararFalta(10, 4, { materialId, localId });
    await repo.reconciliarItem(a.sessao.id, a.item.id, RECONCILIOU);

    // Repõe o estoque para o segundo cenário partir do mesmo número.
    await darEntrada(materialId, localId, 6);
    const b = await prepararFalta(10, 4, { materialId, localId });
    await repo.reconciliarItem(b.sessao.id, b.item.id, RECONCILIOU);

    const [faltaA] = await ledgerDaConferencia(a.sessao.id);
    const [faltaB] = await ledgerDaConferencia(b.sessao.id);
    // Identidade do FATO: tipo, quantidade, de/para, autor e matrícula iguais.
    expect(fato(faltaB!)).toEqual(fato(faltaA!));
    // E o texto que o leitor vê só diferencia QUAL conferência, nunca a causa.
    expect(faltaA!.motivo).toBe(motivoEsperado(a.sessao.id));
    expect(faltaB!.motivo).toBe(motivoEsperado(b.sessao.id));

    // Nenhuma palavra sobre causa sobra nos itens: a observação da contagem é
    // opcional e continua nula, e a falta quantificável (ao contrário do
    // serializado `nao_encontrado`, que recebe 'nao localizado: requer apuracao')
    // não ganha marca de apuração nenhuma.
    const observacaoDe = async (itemId: string) => {
      const [linha] = await sql<{ observacao: string | null }[]>`
        SELECT observacao FROM estoque_conferencia_itens WHERE id = ${itemId}::uuid
      `;
      return linha!.observacao;
    };
    expect([await observacaoDe(a.item.id), await observacaoDe(b.item.id)]).toEqual([null, null]);
  });

  it('o ledger não tem coluna para a causa da falta (asserção que INVERTE quando tiver)', async () => {
    // Régua pelo catálogo, não pelo texto da migration. Se alguém acrescentar a
    // coluna que classifica a falta (perda, furto, erro de contagem), este caso
    // reprova: o lugar certo é INVERTER a asserção e passar a exigir o valor,
    // nunca apagá-la. Coluna nova não relacionada também reprova aqui, de
    // propósito: mexer no ledger do órgão é para ser lido por alguém.
    const colunas = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'estoque_movimentacoes'
    `;
    // A ordenação é em JS de propósito: `ORDER BY column_name` dependeria da
    // colação efetiva do banco, que não é a mesma na alpine (musl) e na Debian.
    expect([...colunas.map((c) => c.column_name)].sort()).toEqual([
      'conferencia_id',
      'criado_em',
      'estado_anterior',
      'estado_novo',
      'id',
      'local_destino',
      'local_origem',
      'material_id',
      'motivo',
      'quantidade',
      'solicitante_matricula',
      'status_anterior',
      'status_novo',
      'tipo',
      'unidade_id',
      'usuario_id',
    ]);
  });
});

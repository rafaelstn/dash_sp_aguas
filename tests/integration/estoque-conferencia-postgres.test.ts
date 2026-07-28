/**
 * Integracao da conferencia fisica contra POSTGRES REAL.
 *
 * A ADR 0021 exige, por escrito, que o fluxo transacional seja provado em
 * Postgres (secao 9, passos 2 e 4): atomicidade, idempotencia, coluna
 * `diferenca` GENERATED, snapshot por `INSERT ... SELECT` e nao-negativo
 * herdado do ledger. Ate 27/07/2026 nada disso tinha teste: a "regressao"
 * existente le o fonte com regex e o mock in-memory nao tem transacao, entao
 * rollback e concorrencia eram impossiveis de exercitar.
 *
 * Roda apenas quando `TEST_DATABASE_URL` aponta para um Postgres descartavel
 * com as migrations aplicadas (o job `integracao` do CI sobe um; local, veja o
 * README). Sem a variavel, o arquivo inteiro e pulado, e nunca toca producao.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { mudancasDesdeContagem } from '@/domain/estoque/conferencia';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

// O repositorio .pg le a conexao de `getEnv()`, que cacheia no primeiro uso:
// setar antes de importar o modulo faz o singleton nascer apontando para o
// banco de teste.
process.env.DATABASE_URL = URL_TESTE;

const USUARIO = '11111111-1111-4111-8111-111111111111';

rodar('conferencia fisica contra Postgres real', () => {
  let sql: Sql;
  let repo: typeof import('@/infrastructure/db/estoque-conferencias-repository.pg')['estoqueConferenciasRepository'];
  let movRepo: typeof import('@/infrastructure/db/estoque-movimentacoes-repository.pg')['estoqueMovimentacoesRepository'];

  beforeAll(async () => {
    sql = postgres(URL_TESTE, { max: 3, prepare: false, transform: { undefined: null } });
    repo = (await import('@/infrastructure/db/estoque-conferencias-repository.pg'))
      .estoqueConferenciasRepository;
    movRepo = (await import('@/infrastructure/db/estoque-movimentacoes-repository.pg'))
      .estoqueMovimentacoesRepository;
    await sql`INSERT INTO auth.users (id, email) VALUES (${USUARIO}::uuid, 'teste@sp.gov.br')
              ON CONFLICT (id) DO NOTHING`;
  });

  afterAll(async () => {
    await sql.end({ timeout: 5 });
  });

  beforeEach(async () => {
    // Ordem respeita as FKs. TRUNCATE ... CASCADE deixa a base limpa entre casos.
    await sql`TRUNCATE estoque_conferencia_itens, estoque_conferencias,
                       estoque_movimentacoes, estoque_saldos, estoque_unidades,
                       estoque_materiais, estoque_locais RESTART IDENTITY CASCADE`;
  });

  // A chave natural do local e (unidade, sala, prateleira, armario), nao o
  // rotulo: dois locais da mesma unidade precisam diferir na sala.
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
      motivo: 'seed de teste',
      usuarioId: USUARIO,
    });
  }

  async function saldoDe(materialId: string, localId: string): Promise<number> {
    const linhas = await sql<{ quantidade: number }[]>`
      SELECT quantidade FROM estoque_saldos
       WHERE material_id = ${materialId}::uuid AND local_id = ${localId}::uuid
         AND COALESCE(tamanho, '') = ''
    `;
    return linhas.length > 0 ? Number(linhas[0]!.quantidade) : 0;
  }

  async function movimentacoesDaConferencia(conferenciaId: string): Promise<number> {
    const [linha] = await sql<{ n: number }[]>`
      SELECT COUNT(*)::int AS n FROM estoque_movimentacoes
       WHERE conferencia_id = ${conferenciaId}::uuid
    `;
    return linha!.n;
  }

  async function prepararDivergencia(sistema: number, contada: number) {
    const localId = await criarLocal('PENHA', 'SALA 1');
    const materialId = await criarMaterial('Cabo coaxial');
    await darEntrada(materialId, localId, sistema);
    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const { itens } = await repo.listarItens(sessao.id, {});
    const item = itens[0]!;
    await repo.registrarContagem(
      sessao.id,
      item.id,
      { tipo: 'quantificavel', quantidadeContada: contada, observacao: null },
      USUARIO,
    );
    await repo.concluir(sessao.id, USUARIO, null);
    return { sessao, item, materialId, localId };
  }

  it('snapshot congela a quantidade via INSERT ... SELECT e a coluna diferenca e GENERATED', async () => {
    const localId = await criarLocal('PENHA', 'SALA 1');
    const materialId = await criarMaterial('Cabo');
    await darEntrada(materialId, localId, 10);

    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const { itens } = await repo.listarItens(sessao.id, {});
    expect(itens).toHaveLength(1);
    expect(itens[0]!.quantidadeSistema).toBe(10);

    // Movimentacao depois do snapshot nao mexe no congelado.
    await darEntrada(materialId, localId, 5);
    const congelado = await repo.obterItem(sessao.id, itens[0]!.id);
    expect(congelado?.quantidadeSistema).toBe(10);

    // `diferenca` e coluna GENERATED: o banco calcula, ninguem escreve nela.
    await repo.registrarContagem(
      sessao.id,
      itens[0]!.id,
      { tipo: 'quantificavel', quantidadeContada: 7, observacao: null },
      USUARIO,
    );
    const [linha] = await sql<{ diferenca: number; is_generated: string }[]>`
      SELECT i.diferenca,
             (SELECT is_generated FROM information_schema.columns
               WHERE table_name = 'estoque_conferencia_itens' AND column_name = 'diferenca') AS is_generated
        FROM estoque_conferencia_itens i WHERE i.id = ${itens[0]!.id}::uuid
    `;
    expect(linha!.is_generated).toBe('ALWAYS');
    expect(Number(linha!.diferenca)).toBe(-3);
  });

  it('reconciliar duas vezes gera UMA movimentacao (idempotencia no banco)', async () => {
    const { sessao, item, materialId, localId } = await prepararDivergencia(10, 12);

    const primeira = await repo.reconciliarItem(sessao.id, item.id, USUARIO);
    expect(primeira.jaReconciliado).toBe(false);
    const segunda = await repo.reconciliarItem(sessao.id, item.id, USUARIO);
    expect(segunda.jaReconciliado).toBe(true);
    expect(segunda.movimentacaoId).toBe(primeira.movimentacaoId);

    expect(await movimentacoesDaConferencia(sessao.id)).toBe(1);
    expect(await saldoDe(materialId, localId)).toBe(12);
  });

  it('reconciliacoes concorrentes do mesmo item nao dobram o ajuste (FOR UPDATE)', async () => {
    const { sessao, item, materialId, localId } = await prepararDivergencia(10, 15);

    await Promise.all([
      repo.reconciliarItem(sessao.id, item.id, USUARIO),
      repo.reconciliarItem(sessao.id, item.id, USUARIO),
    ]);

    expect(await movimentacoesDaConferencia(sessao.id)).toBe(1);
    expect(await saldoDe(materialId, localId)).toBe(15);
  });

  it('falha no meio faz rollback do carimbo E da movimentacao (atomicidade)', async () => {
    // Falta de 6 sobre base congelada 10, mas o saldo real caiu para 2 por uma
    // saida legitima durante a contagem: a saida de 6 estoura o nao-negativo.
    const { sessao, item, materialId, localId } = await prepararDivergencia(10, 4);
    await movRepo.registrar({
      tipo: 'saida',
      alvo: { natureza: 'quantificavel', materialId },
      quantidade: 8,
      localOrigemId: localId,
      localDestinoId: null,
      tamanho: null,
      motivo: 'saida legitima durante a contagem',
      usuarioId: USUARIO,
    });
    expect(await saldoDe(materialId, localId)).toBe(2);

    await expect(repo.reconciliarItem(sessao.id, item.id, USUARIO)).rejects.toMatchObject({
      name: 'SaldoInsuficiente',
    });

    // Nada pela metade: item sem carimbo, sem movimentacao, saldo intacto.
    const depois = await repo.obterItem(sessao.id, item.id);
    expect(depois?.reconciliadoEm).toBeNull();
    expect(depois?.movimentacaoId).toBeNull();
    expect(await movimentacoesDaConferencia(sessao.id)).toBe(0);
    expect(await saldoDe(materialId, localId)).toBe(2);
  });

  it('avisa base_alterada quando o saldo mudou desde a contagem', async () => {
    const { sessao, item, materialId, localId } = await prepararDivergencia(10, 12);
    await darEntrada(materialId, localId, 5); // saldo real vai a 15

    const r = await repo.reconciliarItem(sessao.id, item.id, USUARIO);
    expect(r.aviso).toBe('base_alterada');
    // O ajuste e por delta (+2), aplicado sobre o saldo atual.
    expect(await saldoDe(materialId, localId)).toBe(17);
    const [mov] = await sql<{ motivo: string }[]>`
      SELECT motivo FROM estoque_movimentacoes WHERE conferencia_id = ${sessao.id}::uuid
    `;
    expect(mov!.motivo).toContain('base congelada 10, atual 15');
  });

  it('item sem divergencia e recusado sem carimbar (regra pos-auditoria)', async () => {
    const { sessao, item } = await prepararDivergencia(10, 10);

    await expect(repo.reconciliarItem(sessao.id, item.id, USUARIO)).rejects.toMatchObject({
      name: 'ItemSemDivergencia',
    });
    const depois = await repo.obterItem(sessao.id, item.id);
    expect(depois?.reconciliadoEm).toBeNull();
    expect(await movimentacoesDaConferencia(sessao.id)).toBe(0);
  });

  it('sobra fora do escopo e recusada, e dentro do escopo congela o saldo real', async () => {
    const l1 = await criarLocal('PENHA', 'SALA 1');
    const l2 = await criarLocal('PENHA', 'SALA 2');
    const outraUnidade = await criarLocal('ARARAQUARA', 'SALA 1');
    const materialId = await criarMaterial('Antena');
    await darEntrada(materialId, l2, 200);

    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: l1,
      observacao: null,
      criadaPor: USUARIO,
    });

    await expect(
      repo.adicionarSobra(
        sessao.id,
        { tipo: 'quantificavel', materialId, localId: outraUnidade, tamanho: null, quantidadeContada: 3 },
        USUARIO,
      ),
    ).rejects.toMatchObject({ name: 'DadosInvalidos' });

    await expect(
      repo.adicionarSobra(
        sessao.id,
        { tipo: 'quantificavel', materialId, localId: l2, tamanho: null, quantidadeContada: 200 },
        USUARIO,
      ),
    ).rejects.toMatchObject({ name: 'DadosInvalidos' });

    const item = await repo.adicionarSobra(
      sessao.id,
      { tipo: 'quantificavel', materialId, localId: l1, tamanho: null, quantidadeContada: 4 },
      USUARIO,
    );
    expect(item.quantidadeSistema).toBe(0);
    expect(item.diferenca).toBe(4);

    await repo.concluir(sessao.id, USUARIO, null);
    await repo.reconciliarItem(sessao.id, item.id, USUARIO);
    expect(await saldoDe(materialId, l1)).toBe(4);
    // O local fora do escopo continua intocado: era o bug das unidades fantasma.
    expect(await saldoDe(materialId, l2)).toBe(200);
  });

  it('guarda de IDOR vale no banco: item de outra conferencia nao e alcancavel', async () => {
    const { sessao, item } = await prepararDivergencia(10, 12);
    const outra = await repo.abrir({
      unidade: 'ARARAQUARA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    await repo.concluir(outra.id, USUARIO, null);

    expect(await repo.obterItem(outra.id, item.id)).toBeNull();
    await expect(repo.reconciliarItem(outra.id, item.id, USUARIO)).rejects.toMatchObject({
      name: 'ItemConferenciaNaoEncontrado',
    });
    expect(await movimentacoesDaConferencia(sessao.id)).toBe(0);
  });

  it('serializado movido durante a contagem: origem sai do local ATUAL, com aviso', async () => {
    const l1 = await criarLocal('PENHA', 'SALA 1');
    const l2 = await criarLocal('PENHA', 'SALA 2');
    const l3 = await criarLocal('PENHA', 'SALA 3');
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO estoque_unidades (descricao, status, local_id)
      VALUES ('Pluviometro', 'ativo', ${l1}::uuid) RETURNING id
    `;
    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'serializado',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const item = (await repo.listarItens(sessao.id, {})).itens.find((i) => i.unidadeId === u!.id)!;
    await repo.registrarContagem(
      sessao.id,
      item.id,
      { tipo: 'serializado', situacao: 'encontrado_em_outro_local', localEncontradoId: l2, observacao: null },
      USUARIO,
    );
    await repo.concluir(sessao.id, USUARIO, null);

    // Outra pessoa transfere a unidade para L3 antes da reconciliacao: a origem
    // congelada (L1) ja nao e verdadeira.
    await movRepo.registrar({
      tipo: 'transferencia',
      alvo: { natureza: 'serializado', unidadeId: u!.id },
      quantidade: 1,
      localOrigemId: l1,
      localDestinoId: l3,
      tamanho: null,
      motivo: 'transferencia paralela',
      usuarioId: USUARIO,
    });

    const r = await repo.reconciliarItem(sessao.id, item.id, USUARIO);
    expect(r.aviso).toBe('base_alterada');
    const [mov] = await sql<{ local_origem: string; local_destino: string }[]>`
      SELECT local_origem, local_destino FROM estoque_movimentacoes
       WHERE conferencia_id = ${sessao.id}::uuid
    `;
    expect(mov!.local_origem).toBe(l3); // origem real, nao a congelada
    expect(mov!.local_destino).toBe(l2);
    const [unidade] = await sql<{ local_id: string }[]>`
      SELECT local_id FROM estoque_unidades WHERE id = ${u!.id}::uuid
    `;
    expect(unidade!.local_id).toBe(l2);
  });

  it('serializado achado na outra unidade fisica gera transferencia entre predios', async () => {
    const penha = await criarLocal('PENHA', 'SALA 1');
    const araraquara = await criarLocal('ARARAQUARA', 'SALA 1');
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO estoque_unidades (descricao, status, local_id)
      VALUES ('Medidor de vazao', 'ativo', ${penha}::uuid) RETURNING id
    `;
    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'serializado',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const item = (await repo.listarItens(sessao.id, {})).itens.find((i) => i.unidadeId === u!.id)!;

    // A tela so oferecia locais da unidade da sessao, entao este caso virava
    // "nao encontrado" e abria apuracao de item que ninguem perdeu.
    await repo.registrarContagem(
      sessao.id,
      item.id,
      {
        tipo: 'serializado',
        situacao: 'encontrado_em_outro_local',
        localEncontradoId: araraquara,
        observacao: null,
      },
      USUARIO,
    );
    await repo.concluir(sessao.id, USUARIO, null);

    const r = await repo.reconciliarItem(sessao.id, item.id, USUARIO);
    expect(r.movimentacaoId).not.toBeNull();
    const [mov] = await sql<{ tipo: string; local_origem: string; local_destino: string }[]>`
      SELECT tipo, local_origem, local_destino FROM estoque_movimentacoes
       WHERE conferencia_id = ${sessao.id}::uuid
    `;
    expect(mov!.tipo).toBe('transferencia');
    expect(mov!.local_origem).toBe(penha);
    expect(mov!.local_destino).toBe(araraquara);
    const [unidade] = await sql<{ local_id: string }[]>`
      SELECT local_id FROM estoque_unidades WHERE id = ${u!.id}::uuid
    `;
    expect(unidade!.local_id).toBe(araraquara);
  });

  it('serializado que saiu de operacao durante a contagem nao e transferido', async () => {
    const l1 = await criarLocal('PENHA', 'SALA 1');
    const l2 = await criarLocal('PENHA', 'SALA 2');
    const [u] = await sql<{ id: string }[]>`
      INSERT INTO estoque_unidades (descricao, status, local_id)
      VALUES ('Sensor', 'ativo', ${l1}::uuid) RETURNING id
    `;
    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'serializado',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const item = (await repo.listarItens(sessao.id, {})).itens.find((i) => i.unidadeId === u!.id)!;
    await repo.registrarContagem(
      sessao.id,
      item.id,
      { tipo: 'serializado', situacao: 'encontrado_em_outro_local', localEncontradoId: l2, observacao: null },
      USUARIO,
    );
    await repo.concluir(sessao.id, USUARIO, null);

    await movRepo.registrar({
      tipo: 'baixa',
      alvo: { natureza: 'serializado', unidadeId: u!.id },
      quantidade: 1,
      localOrigemId: l1,
      localDestinoId: null,
      tamanho: null,
      motivo: 'descarte por dano irreparavel',
      usuarioId: USUARIO,
    });

    // Transferir ressuscitaria a unidade num local e falsificaria o inventario.
    await expect(repo.reconciliarItem(sessao.id, item.id, USUARIO)).rejects.toMatchObject({
      name: 'DadosInvalidos',
    });
    expect(await movimentacoesDaConferencia(sessao.id)).toBe(0);
  });

  it('listagem traz o estado ATUAL junto do congelado (aviso antes do commit)', async () => {
    const { sessao, materialId, localId } = await prepararDivergencia(10, 12);
    await darEntrada(materialId, localId, 5); // saldo real vai a 15

    const item = (await repo.listarItens(sessao.id, {})).itens[0]!;
    expect(item.quantidadeSistema).toBe(10); // congelado
    expect(item.saldoAtual).toBe(15); // atual, para a tela avisar antes
    expect(mudancasDesdeContagem(item)).toEqual(['saldo']);
  });

  it('grava quem contou e quando (trilha exigida para orgao publico)', async () => {
    const localId = await criarLocal('PENHA', 'SALA 1');
    const materialId = await criarMaterial('Cabo');
    await darEntrada(materialId, localId, 10);
    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const item = (await repo.listarItens(sessao.id, {})).itens[0]!;
    // Snapshot nasce sem autoria: ninguem contou ainda.
    expect(item.contadoPor).toBeNull();
    expect(item.contadoEm).toBeNull();

    const contado = await repo.registrarContagem(
      sessao.id,
      item.id,
      { tipo: 'quantificavel', quantidadeContada: 7, observacao: null },
      USUARIO,
    );
    expect(contado.contadoPor).toBe(USUARIO);
    expect(contado.contadoEm).toBeInstanceOf(Date);

    // E o CHECK do banco nao aceita data de contagem sem autor.
    await expect(
      sql`UPDATE estoque_conferencia_itens SET contado_por = NULL WHERE id = ${item.id}::uuid`,
    ).rejects.toMatchObject({ constraint_name: 'ck_estoque_conf_item_contagem_autor' });
  });

  it('observacao do item: preserva sem o campo, limpa com null, define com texto', async () => {
    const localId = await criarLocal('PENHA', 'SALA 1');
    const materialId = await criarMaterial('Cabo');
    await darEntrada(materialId, localId, 10);
    const sessao = await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    const item = (await repo.listarItens(sessao.id, {})).itens[0]!;
    const contar = (quantidadeContada: number, observacao?: string | null) =>
      repo.registrarContagem(
        sessao.id,
        item.id,
        { tipo: 'quantificavel', quantidadeContada, ...(observacao === undefined ? {} : { observacao }) },
        USUARIO,
      );

    expect((await contar(10, 'Caixa molhada')).observacao).toBe('Caixa molhada');
    // Campo ausente: recontagem sem comentario nao apaga o que foi registrado.
    expect((await contar(11)).observacao).toBe('Caixa molhada');
    // null LIMPA: sem isso o COALESCE tornava a observacao permanente.
    expect((await contar(11, null)).observacao).toBeNull();

    const [linha] = await sql<{ observacao: string | null }[]>`
      SELECT observacao FROM estoque_conferencia_itens WHERE id = ${item.id}::uuid
    `;
    expect(linha!.observacao).toBeNull();
  });

  it('indice unico parcial barra duas sessoes abertas no mesmo escopo', async () => {
    await criarLocal('PENHA', 'SALA 1');
    await repo.abrir({
      unidade: 'PENHA',
      natureza: 'quantificavel',
      localId: null,
      observacao: null,
      criadaPor: USUARIO,
    });
    await expect(
      repo.abrir({
        unidade: 'PENHA',
        natureza: 'quantificavel',
        localId: null,
        observacao: null,
        criadaPor: USUARIO,
      }),
    ).rejects.toMatchObject({ name: 'EscopoConferenciaEmAberto' });
  });
});

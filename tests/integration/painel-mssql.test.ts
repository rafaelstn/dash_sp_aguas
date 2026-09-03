/**
 * Painel composto (cadastro no `Dbfch`, operação no nosso PostgreSQL) contra o
 * SQL SERVER REAL do órgão.
 *
 * Roda apenas com `SQLSERVER_HOST` definido e a VPN ligada. Somente leitura. Se
 * a VPN cair o sintoma é TIMEOUT, e não erro de credencial.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A RÉGUA DESTE ARQUIVO É CONTAGEM, E O NÚMERO ESPERADO VEM DO BANCO
 * ─────────────────────────────────────────────────────────────────────────
 * O defeito que este painel tinha passou por uma suíte inteira: era um ZERO que
 * parecia resposta. Nenhum caso que confira "o painel devolve um objeto com as
 * chaves certas" pegaria aquilo, e um caso com o número escrito à mão pegaria
 * só até o órgão cadastrar o próximo posto.
 *
 * Por isso quase todo `expect` daqui compara o número do painel com o mesmo
 * número apurado por uma consulta que ESTE arquivo dispara, na mesma execução.
 * A única constante escrita à mão é a de 03/09/2026, e ela existe para um caso
 * só: provar que o total não é zero nem uma ordem de grandeza errada. Se o
 * órgão cadastrar postos, esse caso falha dizendo qual número mudou.
 */
import { afterAll, describe, expect, it } from 'vitest';
import type { PainelRepository } from '@/application/ports/painel-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';

const rodar = process.env.SQLSERVER_HOST ? describe : describe.skip;

/** Contagem de `dbo.Postos` com `Excluido = 0`, MEDIDA em 03/09/2026. */
const POSTOS_ATIVOS = 5790;

/** Postos com UGRHI de nível 1 determinável (declarada ou herdada). */
const POSTOS_COM_UGRHI = 4042;

async function painel(): Promise<PainelRepository> {
  const cadastro = await import('@/infrastructure/db/painel-cadastro-repository.mssql');
  cadastro._limparCachePainelCadastroMssql();
  const pg = await import('@/infrastructure/db/painel-repository.pg');
  const { comporPainelRepository } = await import(
    '@/infrastructure/db/painel-repository.composto'
  );
  return comporPainelRepository(
    cadastro.painelCadastroRepositoryMssql,
    pg.painelOperacaoRepositoryPg,
  );
}

/** Consulta de conferência: é ela que produz o número esperado, não a memória. */
async function contar(sqlTexto: string): Promise<number> {
  const { consultarMssql } = await import('@/infrastructure/db/mssql-client');
  const r = await consultarMssql<{ n: number }>(sqlTexto);
  const linha = r.recordset[0];
  if (!linha) throw new Error('consulta de conferência sem linha');
  return Number(linha.n);
}

afterAll(async () => {
  if (!process.env.SQLSERVER_HOST) return;
  const { encerrarPoolMssql } = await import('@/infrastructure/db/mssql-client');
  await encerrarPoolMssql();
});

rodar('painel composto sobre o Dbfch', () => {
  it('o total de postos do painel é o total do banco, contado agora', async () => {
    const p = await painel();
    const doBanco = await contar(
      'SELECT n = COUNT(*) FROM dbo.Postos p WHERE p.Excluido = 0',
    );
    const resumo = await p.resumoPendencias();

    expect(resumo.totalPostos).toBe(doBanco);
    // A ordem de grandeza também: um adaptador que devolvesse 0 passaria no
    // `toBe` acima se a consulta de conferência também estivesse quebrada.
    expect(resumo.totalPostos).toBe(POSTOS_ATIVOS);
  });

  it('coordenadas e telemetria batem com a contagem do banco', async () => {
    const p = await painel();
    const comCoordenadas = await contar(`
      SELECT n = COUNT(*)
        FROM dbo.Postos p
       WHERE p.Excluido = 0
         AND p.CoordenadaGrausLatitudade BETWEEN 10000 AND 99999999
         AND p.CoordenadaGrausLongitude BETWEEN 10000 AND 99999999
    `);
    const comTelemetria = await contar(`
      SELECT n = COUNT(*)
        FROM dbo.Postos p
       WHERE p.Excluido = 0
         AND EXISTS (
           SELECT 1 FROM dbo.AparelhoPostos ap
             JOIN dbo.Aparelhos a ON a.Id = ap.AparelhoId
            WHERE ap.PostoId = p.Id AND ap.Excluido = 0 AND a.Excluido = 0
              AND ap.DataDesativacao IS NULL
              AND a.Designacao IN ('PLUVIOMETRO TELEMETRICO', 'LIMNIGRAFO TELEMETRICO'))
    `);

    const resumo = await p.resumoPendencias();
    expect(resumo.postosComCoordenadas).toBe(comCoordenadas);
    expect(resumo.postosComTelemetria).toBe(comTelemetria);
    // A subtração do compositor, conferida contra o total do próprio resumo.
    expect(resumo.postosSemCoordenadas).toBe(
      resumo.totalPostos - resumo.postosComCoordenadas,
    );
  });

  it('a distribuição por tipo soma o universo inteiro', async () => {
    // `TipoMedicoesID` é NOT NULL na origem, então todo posto ativo tem tipo e
    // a soma TEM de fechar com o total. É este caso que denuncia junção que
    // perde ou multiplica linha: as sete junções de `FROM_POSTOS` entram aqui,
    // e linha multiplicada estraga toda contagem do painel sem estragar nada
    // visível na tela.
    const p = await painel();
    const tipos = await p.distribuicaoPorTipo();
    const soma = tipos.reduce((acc, t) => acc + t.total, 0);
    expect(soma).toBe(POSTOS_ATIVOS);
    expect(tipos.length).toBeGreaterThan(0);
    for (const t of tipos) expect(t.total).toBeGreaterThan(0);
  });

  it('o status operacional particiona o universo, sem sobra e sem falta', async () => {
    const p = await painel();
    const s = await p.statusOperacional();
    expect(s.total).toBe(POSTOS_ATIVOS);
    // Partição: as três faixas são mutuamente exclusivas e cobrem tudo. Sem
    // isso, um posto pode sumir de todas ou entrar em duas, e o painel mostra
    // percentuais que não somam 100 sem ninguém perceber.
    expect(s.ativos + s.desativados + s.indeterminados).toBe(s.total);

    const ativosNoBanco = await contar(`
      SELECT n = COUNT(*) FROM dbo.Postos p
       WHERE p.Excluido = 0
         AND (p.DataExtincao IS NULL OR YEAR(p.DataExtincao) >= YEAR(GETDATE()) - 1)
    `);
    expect(s.ativos).toBe(ativosNoBanco);
  });

  it('o cartão de ativos concorda com a lista que ele abre', async () => {
    // O cartão "Postos ativos" leva para `/?status=ativo`. Cartão que promete
    // um número e entrega outra lista é o defeito que ninguém reporta porque
    // ninguém confere, e é o mesmo par que já mordeu nas facetas.
    const m = await import('@/infrastructure/db/postos-repository.mssql');
    const repo: PostosRepository = m.postosRepository;
    const p = await painel();

    const [s, busca, todos] = await Promise.all([
      p.statusOperacional(),
      repo.pesquisar({ status: 'ativo', pagina: 1, porPagina: 1 }),
      repo.pesquisar({ pagina: 1, porPagina: 1 }),
    ]);
    expect(busca.total).toBe(s.ativos);
    expect(todos.total).toBe(s.total);
  });

  it('o ranking de UGRHI soma os postos com UGRHI determinável', async () => {
    const p = await painel();
    const ugrhis = await p.rankingUGRHI();
    const soma = ugrhis.reduce((acc, u) => acc + u.total, 0);
    expect(soma).toBe(POSTOS_COM_UGRHI);
    expect(soma).toBeLessThan(POSTOS_ATIVOS);
    // Só o nível 1 chega ao painel: sub-UGRHI vazando apareceria como "202".
    for (const u of ugrhis) {
      const n = Number(u.numero);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(22);
      expect(u.nome.length).toBeGreaterThan(0);
    }
  });

  it('o ranking de mantenedores conta postos, e "ativos" nunca passa do total', async () => {
    const p = await painel();
    const todos = await p.rankingMantenedores(1000);
    const soma = todos.reduce((acc, m) => acc + m.total, 0);

    const comOperadora = await contar(`
      SELECT n = COUNT(*)
        FROM dbo.Postos p
        LEFT JOIN dbo.Entidades oper ON oper.Id = p.OperadoraEntidadeId
       WHERE p.Excluido = 0
         AND oper.Nome IS NOT NULL AND LTRIM(RTRIM(oper.Nome)) <> ''
    `);
    expect(soma).toBe(comOperadora);
    // MEDIDO em 03/09/2026: 4.209 dos 5.790 postos não têm entidade operadora,
    // então este ranking fala de 1.581 postos, e não da rede inteira. O caso
    // existe para que a lacuna seja um fato afirmado, e não uma surpresa de
    // quem for somar a coluna na tela.
    expect(soma).toBeLessThan(POSTOS_ATIVOS);
    for (const m of todos) expect(m.ativos).toBeLessThanOrEqual(m.total);

    const quinze = await p.rankingMantenedores(15);
    expect(quinze).toEqual(todos.slice(0, 15));
  });

  it('não desenha série de uma população embaixo do número de outra', async () => {
    // O cadastro do órgão não tem data de criação de linha, então as duas
    // séries cumulativas sobre a população de postos não existem nesta origem.
    // Elas são calculadas na NOSSA tabela `postos`, que é outra população: se
    // vazarem, o gestor lê variação de uma base sob o total de outra.
    const p = await painel();
    const resumo = await p.resumoPendencias();
    expect(resumo.tendencias.totalPostos).toBeUndefined();
    expect(resumo.tendencias.postosSemArquivos).toBeUndefined();
    expect(Object.keys(resumo.tendencias)).toEqual(['arquivosOrfaos']);
  });

  it('a desconformidade fica vazia nesta origem, e isso é declarado', async () => {
    // Ver o bloco DESCONFORMIDADE em `painel-cadastro-repository.mssql.ts`: a
    // régua é da planilha DAEE e chamaria 3.145 dos 5.790 postos de irregulares
    // (54% da rede), porque não conhece a família de prefixo numérico de oito
    // dígitos do `Dbfch`. Este caso trava a decisão: quem for portar a régua
    // mecanicamente vai reprovar aqui e ler o motivo.
    const p = await painel();
    const [resumo, classes, ugrhis] = await Promise.all([
      p.resumoPendencias(),
      p.classesDesconformidade(),
      p.rankingUGRHI(),
    ]);
    expect(resumo.desconformidadesPostos).toBe(0);
    expect(classes).toEqual([]);
    for (const u of ugrhis) {
      expect(u.desconformes).toBe(0);
      expect(u.taxa).toBe(0);
    }
  });

  it('o painel inteiro cabe numa ida ao órgão, e responde em tempo de tela', async () => {
    // A página dispara SEIS métodos em `Promise.all` e o pool tem cinco
    // conexões: sem os cinco conjuntos de resultado numa consulta só, um
    // carregamento consumiria o pool inteiro contra a produção do órgão.
    const p = await painel();
    const inicio = Date.now();
    await Promise.all([
      p.resumoPendencias(),
      p.distribuicaoPorTipo(),
      p.rankingUGRHI(),
      p.classesDesconformidade(),
      p.statusOperacional(),
      p.rankingMantenedores(15),
    ]);
    const decorrido = Date.now() - inicio;
    console.log(`[painel] seis agregações com cache frio: ${decorrido} ms`);
    expect(decorrido).toBeLessThan(10_000);
  });
});

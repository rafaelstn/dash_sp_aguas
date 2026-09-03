/**
 * GUARDA DE CONTAGEM DA BUSCA, contra o SQL Server REAL do órgão (`Dbfch`).
 *
 * Existe por causa de um defeito que chegou a PRODUÇÃO em 03/09/2026: buscar
 * `rio` devolvia ZERO com 175 postos ativos com "RIO" no nome, e buscar `agua`
 * devolvia ZERO com 136. Typecheck, lint, 875 testes de unidade e 24 casos de
 * integração passaram por cima, porque nenhum deles afirmava CONTAGEM de
 * resultado para um termo que a base tem aos montes.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE OS TERMOS E O `N` SAEM DO BANCO NA HORA
 * ─────────────────────────────────────────────────────────────────────────
 * Um caso escrito como `expect(buscar('rio').total).toBeGreaterThan(0)` cobre
 * `rio` e mais nada: o defeito era de CLASSE (todo termo curto sem dígito ia
 * para a busca por prefixo em vez da textual), e uma lista escolhida por mim
 * cobriria os termos de que eu me lembrei. Por isso esta guarda:
 *
 *   1. lê os nomes dos postos ativos e apura as palavras MAIS FREQUENTES;
 *   2. para cada uma, pergunta ao banco quantos postos a contêm no `Nome`;
 *   3. exige que o caminho de PRODUÇÃO (o use case, o mesmo que a rota
 *      `/api/postos/search` e a tela `/` chamam) devolva ao menos aquilo.
 *
 * O `>=` é invariante, e não folga: a busca cobre dez campos, entre eles
 * `p.Nome`, então o resultado é por construção um superconjunto do que casa só
 * no nome. Se ele ficar abaixo, algum termo está sendo engolido no caminho.
 *
 * A guarda mede o USE CASE, e não o repositório. É deliberado: o defeito de
 * 03/09 estava no roteamento do use case, com o adaptador respondendo certo
 * (medido: 2.580 para `rio`), então uma guarda apontada para o repositório
 * teria ficado verde com a produção devolvendo zero.
 *
 * Roda apenas com `SQLSERVER_HOST` no ambiente e a VPN do governo ligada. Sem
 * a variável o arquivo é pulado, e é por isso que ela NÃO é a única barreira:
 * a barreira que roda sempre, inclusive no CI sem VPN, é
 * `tests/unit/use-cases/buscar-postos-roteamento.test.ts`.
 */
import { afterAll, describe, expect, it } from 'vitest';

const rodar = process.env.SQLSERVER_HOST ? describe : describe.skip;

/** Quantas das palavras mais frequentes entram na medição. */
const PALAVRAS_MEDIDAS = 10;

/**
 * Piso de frequência para uma palavra entrar. Abaixo disso a medição vira
 * ruído: um nome só é fácil de casar por acidente, e o que interessa aqui é
 * termo que o usuário do órgão realmente digita.
 */
const OCORRENCIAS_MINIMAS = 20;

afterAll(async () => {
  if (!process.env.SQLSERVER_HOST) return;
  const { encerrarPoolMssql } = await import('@/infrastructure/db/mssql-client');
  await encerrarPoolMssql();
});

rodar('contagem da busca contra o Dbfch', () => {
  it('termo de alta frequência devolve ao menos o que casa no nome', async () => {
    const { consultarMssql, TiposMssql } = await import('@/infrastructure/db/mssql-client');
    const { postosRepository } = await import('@/infrastructure/db/postos-repository.mssql');
    const { buscarPostos } = await import('@/application/use-cases/buscar-postos');

    const nomes = await consultarMssql<{ Nome: string | null }>(
      'SELECT p.Nome FROM dbo.Postos p WHERE p.Excluido = 0',
    );

    // Palavra é sequência de letras e dígitos. O corte separa em não letra para
    // que "1D-008" não vire uma palavra e polua a apuração com código.
    const frequencia = new Map<string, number>();
    for (const linha of nomes.recordset) {
      const nome = (linha.Nome ?? '').trim();
      if (nome.length === 0) continue;
      const vistas = new Set(
        nome
          .split(/[^\p{L}\p{N}]+/u)
          .filter((p) => p.length >= 2)
          .map((p) => p.toUpperCase()),
      );
      for (const palavra of vistas) {
        frequencia.set(palavra, (frequencia.get(palavra) ?? 0) + 1);
      }
    }

    const candidatas = [...frequencia]
      .filter(([, n]) => n >= OCORRENCIAS_MINIMAS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, PALAVRAS_MEDIDAS)
      .map(([palavra]) => palavra);

    // Se a apuração não achar palavra nenhuma, a guarda não mediu nada e não
    // pode passar em silêncio: sem isto ela ficaria verde com a base vazia.
    expect(
      candidatas.length,
      'nenhuma palavra frequente apurada: a guarda não mediu nada',
    ).toBe(PALAVRAS_MEDIDAS);

    const falhas: string[] = [];
    const relatorio: string[] = [];

    for (const palavra of candidatas) {
      const cru = await consultarMssql<{ Total: number }>(
        `SELECT Total = COUNT(*) FROM dbo.Postos p
          WHERE p.Excluido = 0
            AND p.Nome COLLATE Latin1_General_CI_AI LIKE @t ESCAPE '\\'`,
        [{ nome: 't', tipo: TiposMssql.texto, valor: `%${palavra}%` }],
      );
      const esperadoMinimo = cru.recordset[0]?.Total ?? 0;

      const resultado = await buscarPostos(postosRepository, {
        termo: palavra,
        pagina: 1,
        porPagina: 5,
      });

      relatorio.push(
        `${palavra.padEnd(14)} nome=${String(esperadoMinimo).padStart(5)}` +
          `  busca=${String(resultado.total).padStart(5)}` +
          `  itens=${resultado.itens.length}`,
      );

      if (resultado.total < esperadoMinimo) {
        falhas.push(
          `"${palavra}": o nome de ${esperadoMinimo} postos ativos contém o termo ` +
            `e a busca devolveu ${resultado.total}`,
        );
      }
      // Contagem sem item é o outro lado do mesmo defeito, e passa mais fácil
      // porque o número na tela fica certo enquanto a lista fica vazia.
      if (resultado.total > 0 && resultado.itens.length === 0) {
        falhas.push(`"${palavra}": total ${resultado.total} com a lista vazia`);
      }
    }

    expect(
      falhas,
      `termos engolidos pela busca:\n  ${falhas.join('\n  ')}\n` +
        `medição completa:\n  ${relatorio.join('\n  ')}`,
    ).toEqual([]);
  }, 180_000);

  /**
   * O outro lado da correção de 03/09/2026, e é ele que impede que consertar
   * `rio` quebre a busca por código.
   *
   * A régua passou a exigir dígito para tratar o termo como prefixo, e existem
   * 93 prefixos ativos SÓ COM LETRAS (`BT`, `PR`, `BRJ`, `BAURU`). Eles deixaram
   * de ir pela busca por início de prefixo e passaram a ir pela textual. A
   * afirmação de que "não se perde nada" repousa em `CAMPOS_BUSCA` cobrir
   * `p.Prefixo`, e afirmação assim se MEDE: quem digita o próprio prefixo tem
   * de encontrar o posto.
   */
  it('prefixo só com letras continua achável digitando o próprio prefixo', async () => {
    const { consultarMssql } = await import('@/infrastructure/db/mssql-client');
    const { postosRepository } = await import('@/infrastructure/db/postos-repository.mssql');
    const { buscarPostos } = await import('@/application/use-cases/buscar-postos');

    const r = await consultarMssql<{ Prefixo: string }>(
      'SELECT p.Prefixo FROM dbo.Postos p WHERE p.Excluido = 0',
    );
    const soLetras = r.recordset
      .map((l) => l.Prefixo.trim())
      .filter((p) => /^[A-Za-z]{2,}$/.test(p));

    expect(
      soLetras.length,
      'nenhum prefixo só com letras apurado: este caso não mediu nada',
    ).toBeGreaterThan(0);

    // Uma amostra determinística (a cada N) em vez dos 93: o custo é uma
    // consulta por prefixo contra o banco de PRODUÇÃO do órgão, e a amostra
    // ordenada cobre o conjunto sem depender de sorteio que muda a cada
    // execução e transforma falha em intermitência.
    const passo = Math.max(1, Math.floor(soLetras.length / 12));
    const amostra = soLetras.filter((_, i) => i % passo === 0).slice(0, 12);

    const naoAchados: string[] = [];
    for (const prefixo of amostra) {
      const resultado = await buscarPostos(postosRepository, {
        termo: prefixo,
        pagina: 1,
        porPagina: 100,
      });
      const achou = resultado.itens.some((p) => p.prefixo === prefixo);
      if (!achou) {
        naoAchados.push(`${prefixo} (total devolvido: ${resultado.total})`);
      }
    }

    expect(
      naoAchados,
      `prefixos que sumiram da busca ao serem digitados:\n  ${naoAchados.join('\n  ')}`,
    ).toEqual([]);
  }, 180_000);
});

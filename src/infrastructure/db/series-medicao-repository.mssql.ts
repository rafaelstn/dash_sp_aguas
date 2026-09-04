import 'server-only';
import type {
  DiaDaSerie,
  JanelaPeriodo,
  LeituraSerie,
  PaginaLeituras,
  Paginacao,
  ResumoSerie,
  SeriesMedicaoRepository,
} from '@/application/ports/series-medicao-repository';
import {
  SERIES_MEDICAO,
  TODAS_AS_SERIES,
  type SerieMedicao,
  valorUtil,
  vazaoUtil,
} from '@/domain/monitor/serie-medicao';
import { FalhaRepositorio } from '@/domain/errors';
import { consultarMssql, TiposMssql, type ParametroMssql } from './mssql-client';
import { CI_AI } from './postos-dbfch-sql';

/**
 * Séries históricas de medição lidas AO VIVO do SQL Server do órgão (`Dbfch`).
 *
 * ADR-0023. Somente leitura, sem cópia, sem cache, sem junção entre os dois
 * armazenamentos. Implementa `SeriesMedicaoRepository` sem alterar a porta.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * O ÍNDICE QUE NÃO EXISTE, E POR QUE ISSO NÃO VIROU PROBLEMA
 * ═════════════════════════════════════════════════════════════════════════
 * A primeira coisa medida, antes de escrever consulta, foi o catálogo de
 * índices das cinco tabelas (`sys.indexes` com `sys.index_columns`, 03/09/2026).
 * O resultado contraria o que se esperaria de tabela de série temporal:
 *
 *   **Não existe índice em `(PostoId, Data)` em nenhuma das cinco.**
 *   O que existe em todas é o agrupado da chave primária, em `(Id)`, mais um
 *   não agrupado em `(PostoId)` SOZINHO, sem coluna incluída.
 *
 * A consequência é concreta e vale conhecer antes de mexer aqui: filtrar por
 * `PostoId` é uma busca no índice, mas `Data`, `Excluido` e a coluna de valor
 * NÃO estão nele, então o servidor faz uma pesquisa de chave no agrupado para
 * cada linha do posto. Acrescentar `Data BETWEEN` ao `WHERE` **não reduz esse
 * trabalho**: ele continua alcançando todas as linhas do posto e só depois
 * descarta as de fora da janela. Ou seja, restringir o período melhora o que
 * TRAFEGA, não o que o servidor lê.
 *
 * O acesso é SOMENTE LEITURA e o banco é de produção do órgão, então criar
 * índice está fora de questão. A pergunta passou a ser se o custo cabe, e a
 * resposta veio da medição, não da teoria: o posto com mais leituras da base
 * (`E3-036`, 41.002) é 0,15% de 27,2 milhões, muito abaixo do ponto em que o
 * otimizador desiste da busca e varre a tabela. Ele escolhe a busca, e por isso
 * os números abaixo são de dezenas a centenas de milissegundos, e não de
 * minutos.
 *
 * TEMPOS MEDIDOS EM 03/09/2026, pela VPN, contra a produção do órgão:
 *
 *   resumo das cinco séries, `E3-036` (41.002 leituras) ....... 197, 182, 179 ms
 *   resumo das cinco séries, `C5-018` (44.927 nas duas) ................ 192 ms
 *   resumo das cinco séries, pior posto de chuva automática (78.978) ... 276 ms
 *   resumo das cinco séries, pior posto de cota (70.068) ............... 289 ms
 *   resumo das cinco séries, pior posto de piezômetro manual (6.585) .... 35 ms
 *   página de 500 leituras numa janela de 10 anos ...................... 74 ms
 *   contagem da mesma janela ........................................... 54 ms
 *   página com deslocamento 30.000 ..................................... 75 ms
 *   resumo diário de 10 anos (3.652 dias) ............................. 108 ms
 *   resumo diário da série INTEIRA do pior posto de cota (35.034 dias) . 473 ms
 *
 * O pior caso medido é 289 ms, e é o número que sustenta a tela abrir com o
 * resumo. **Se alguém acrescentar consulta aqui, mede de novo:** a folga que
 * existe hoje vem da seletividade do posto, e some no dia em que uma consulta
 * deixar de filtrar por `PostoId`.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * A COLUNA `Validacao` NÃO FILTRA NADA, E ISSO É DECISÃO ESCRITA
 * ═════════════════════════════════════════════════════════════════════════
 * Duas das cinco tabelas têm `Validacao` (`tinyint`), e o catálogo de séries
 * alerta que ignorá-la seria publicar dado não validado como oficial. O
 * caminho óbvio seria filtrar por "validada". MEDIDO na base inteira, ele não
 * se sustenta:
 *
 *   `MedicaoPluviometricas`: 26.767.057 linhas com `0`, 480.348 nulas,
 *                            22.806 com `2` e 9.070 com `1`.
 *   `CotaEscalaFluviometricas`: 10.976.471 NULAS e 10.104 com `1`.
 *
 * Três leituras saem daí. A primeira: as duas tabelas usam padrões DIFERENTES
 * para a esmagadora maioria (`0` numa, nulo na outra), o que já é evidência de
 * que o valor não significa a mesma coisa nas duas. A segunda: valor diferente
 * de zero e de nulo aparece em TRÊS postos apenas, de 2.096 que têm chuva. A
 * terceira, decisiva: qualquer régua de "só o validado" descartaria 99,9% da
 * cota e 98% da chuva.
 *
 * Então a decisão é: **não filtrar, entregar a coluna crua, e não inventar
 * significado.** O que o significado é de fato está na lista de pendências do
 * órgão (catálogo §4.3), e é pergunta deles, não nossa. Filtrar por um
 * significado suposto esvaziaria a tela sem ninguém entender por quê, e o
 * defeito seria invisível, porque tela vazia parece "este posto não tem dado".
 */

// ─────────────────────────────────────────────────────────────────────────
// Mapa das cinco séries para o schema do órgão
// ─────────────────────────────────────────────────────────────────────────

interface OrigemSerie {
  /** Tabela em `dbo`, sem o esquema. */
  readonly tabela: string;
  /** Coluna que guarda o valor da leitura. */
  readonly colunaValor: string;
  /** A tabela tem a coluna `Validacao`? */
  readonly temValidacao: boolean;
  /** A tabela tem `VazaoMainframe`? Só a de cota tem. */
  readonly temVazao: boolean;
}

/**
 * Onde cada série mora. Nomes conferidos contra `sys.columns` em 03/09/2026.
 *
 * `MedicaoLoggerPluviograficas.Acumulado` existe e NÃO é exposta de propósito:
 * ela é o total corrido do registrador, e não o valor do intervalo. Entregá-la
 * no mesmo campo de `Medicao` faria a soma do dia contar cada milímetro tantas
 * vezes quantas leituras houvesse, e o número resultante pareceria plausível.
 */
const ORIGEM: Readonly<Record<SerieMedicao, OrigemSerie>> = {
  chuva_manual: {
    tabela: 'MedicaoPluviometricas',
    colunaValor: 'Medicao',
    temValidacao: true,
    temVazao: false,
  },
  chuva_logger: {
    tabela: 'MedicaoLoggerPluviograficas',
    colunaValor: 'Medicao',
    temValidacao: false,
    temVazao: false,
  },
  cota_rio: {
    tabela: 'CotaEscalaFluviometricas',
    colunaValor: 'Valor',
    temValidacao: true,
    temVazao: true,
  },
  piezo_manual: {
    tabela: 'LeituraManualPiezometricas',
    colunaValor: 'Valor',
    temValidacao: false,
    temVazao: false,
  },
  piezo_eletronico: {
    tabela: 'LeituraEletronicaPiezometricas',
    colunaValor: 'Valor',
    temValidacao: false,
    temVazao: false,
  },
};

/**
 * Condição SQL que reconhece o valor sentinela da série, ou `1 = 0` quando a
 * série não tem sentinela medida.
 *
 * O número entra no TEXTO do SQL, e não como parâmetro, por um motivo de
 * exatidão. `Medicao` é `decimal(6,1)` e a sentinela é `999.9`: escrita como
 * literal, o servidor compara decimal com decimal, exato. Passada como
 * parâmetro do tipo `Float`, os dois lados passam por ponto flutuante binário,
 * onde `999.9` não é representável, e a comparação vira aposta.
 *
 * Isto NÃO abre porta para concatenação de valor: a fonte é o catálogo de
 * domínio, nunca a requisição, e a linha abaixo recusa qualquer coisa que não
 * seja número finito antes de compor o texto.
 */
function condicaoSentinela(serie: SerieMedicao, apelido: string): string {
  const sentinela = SERIES_MEDICAO[serie].valorSentinela;
  if (sentinela === null) return '1 = 0';
  if (!Number.isFinite(sentinela)) {
    throw new Error(`Sentinela inválida na definição da série ${serie}.`);
  }
  return `${apelido}.${ORIGEM[serie].colunaValor} = ${sentinela}`;
}

/**
 * Sentinela da vazão, pelo mesmo raciocínio. `VazaoMainframe` é
 * `decimal(11,3)` e a sentinela é `99999.999`.
 */
const SENTINELA_VAZAO_SQL = 'm.VazaoMainframe = 99999.999';

// ─────────────────────────────────────────────────────────────────────────
// Conversões de fronteira
// ─────────────────────────────────────────────────────────────────────────

/**
 * Formata a porção de data em UTC.
 *
 * O `datetime` do SQL Server não carrega fuso, e o driver entrega o valor como
 * se fosse UTC (`useUTC`, padrão do `mssql`). Ler as partes com os métodos
 * locais deslocaria a data em três horas e faria toda leitura de meia-noite
 * cair no dia anterior, que é o defeito clássico deste tipo de fronteira. O
 * projeto já resolve assim no lado do SIBH (`obter-serie-nivel`), e divergir
 * aqui produziria duas datas diferentes para o mesmo dia nas duas metades do
 * comparativo.
 */
function diaIso(valor: Date | string | null): string | null {
  if (valor === null) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(d.getUTCDate()).padStart(2, '0');
  return `${d.getUTCFullYear()}-${mes}-${dia}`;
}

/** Momento completo em ISO 8601 UTC. */
function momentoIso(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  return d.toISOString();
}

/** `decimal` chega como número ou como texto conforme a precisão. Normaliza. */
function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/** Arredonda a 2 casas, mesma convenção da agregação do SIBH. */
function duasCasas(valor: number): number {
  return Math.round(valor * 100) / 100;
}

/**
 * Fim EXCLUSIVO da janela.
 *
 * A porta promete `ate` inclusivo no DIA, e a coluna é `datetime` com hora. Um
 * `Data <= @ate` com `@ate` na meia-noite excluiria toda leitura do próprio dia
 * feita depois da meia-noite, e a cota tem até seis leituras por dia (MEDIDO).
 * O dia inteiro entra somando 24 horas e comparando com `<`.
 */
function fimExclusivo(ate: Date): Date {
  return new Date(
    Date.UTC(ate.getUTCFullYear(), ate.getUTCMonth(), ate.getUTCDate() + 1),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Resolução do posto
// ─────────────────────────────────────────────────────────────────────────

/**
 * Traduz o prefixo no `uniqueidentifier` da origem.
 *
 * Fica numa consulta separada, e não numa expressão comum de tabela dentro de
 * cada consulta de série, por previsibilidade de plano: `dbo.Postos` tem 5.790
 * linhas e nenhum índice em `Prefixo`, então a tradução é uma varredura curta e
 * constante. Embutida na união das cinco séries, ela apareceria cinco vezes no
 * plano e o custo dela deixaria de ser visível na medição.
 *
 * `CI_AI` pelo mesmo motivo do adaptador de cadastro: a collation do banco é
 * sensível a acento, e quem digita o prefixo em minúscula quer o mesmo posto.
 */
async function idDoPosto(prefixo: string): Promise<string | null> {
  const r = await consultarMssql<{ Id: string }>(
    `SELECT TOP 1 p.Id
       FROM dbo.Postos p
      WHERE p.Excluido = 0 AND p.Prefixo ${CI_AI} = @prefixo`,
    [{ nome: 'prefixo', tipo: TiposMssql.texto, valor: prefixo.trim() }],
  );
  return r.recordset[0]?.Id ?? null;
}

// ─────────────────────────────────────────────────────────────────────────
// Consultas
// ─────────────────────────────────────────────────────────────────────────

interface LinhaResumo {
  serie: string;
  leituras: number;
  primeira: Date | null;
  ultima: Date | null;
  futuras: number;
  semValor: number;
}

/**
 * Uma consulta só, cinco agregações, uma passada por tabela.
 *
 * Cada ramo carrega o SEU `m.Excluido = 0`, e a guarda de `mssql-client` confere
 * isso referência a referência, com o apelido: sem essa régua, bastaria um dos
 * cinco ter o filtro para os outros quatro contarem linha excluída.
 *
 * `primeira` e `ultima` ignoram data futura de propósito (ver a porta), e
 * `futuras` conta quantas foram ignoradas, para que o dado sujo apareça em vez
 * de sumir.
 */
function sqlResumo(): string {
  return TODAS_AS_SERIES.map((serie) => {
    const origem = ORIGEM[serie];
    return `
      SELECT serie = '${serie}',
             leituras = COUNT(*),
             primeira = MIN(CASE WHEN m.Data <= @agora THEN m.Data END),
             ultima   = MAX(CASE WHEN m.Data <= @agora THEN m.Data END),
             futuras  = SUM(CASE WHEN m.Data > @agora THEN 1 ELSE 0 END),
             semValor = SUM(CASE WHEN ${condicaoSentinela(serie, 'm')} THEN 1 ELSE 0 END)
        FROM dbo.${origem.tabela} m
       WHERE m.PostoId = @posto AND m.Excluido = 0`;
  }).join('\n      UNION ALL\n');
}

function resumoVazio(serie: SerieMedicao): ResumoSerie {
  const def = SERIES_MEDICAO[serie];
  return {
    serie,
    rotulo: def.rotulo,
    unidade: def.unidade,
    unidadeInferida: def.unidadeInferida,
    criterioDiario: def.criterioDiario,
    leituras: 0,
    primeiraData: null,
    ultimaData: null,
    leiturasComDataFutura: 0,
    leiturasSemValor: 0,
  };
}

export const seriesMedicaoRepositoryMssql: SeriesMedicaoRepository = {
  async resumoPorPosto(prefixo: string): Promise<readonly ResumoSerie[] | null> {
    try {
      const posto = await idDoPosto(prefixo);
      if (posto === null) return null;

      const r = await consultarMssql<LinhaResumo>(sqlResumo(), [
        { nome: 'posto', tipo: TiposMssql.guid, valor: posto },
        { nome: 'agora', tipo: TiposMssql.dataHora, valor: new Date() },
      ]);

      const porSerie = new Map(r.recordset.map((l) => [l.serie, l]));

      // A saída é montada a partir do catálogo, e não do que o banco devolveu.
      // Assim a porta cumpre a promessa de trazer sempre as cinco, inclusive se
      // um ramo da união deixar de responder: série ausente vira série zerada e
      // explícita, nunca some da lista.
      return TODAS_AS_SERIES.map((serie) => {
        const linha = porSerie.get(serie);
        if (!linha) return resumoVazio(serie);
        const def = SERIES_MEDICAO[serie];
        return {
          serie,
          rotulo: def.rotulo,
          unidade: def.unidade,
          unidadeInferida: def.unidadeInferida,
          criterioDiario: def.criterioDiario,
          leituras: Number(linha.leituras),
          primeiraData: diaIso(linha.primeira),
          ultimaData: diaIso(linha.ultima),
          leiturasComDataFutura: Number(linha.futuras ?? 0),
          leiturasSemValor: Number(linha.semValor ?? 0),
        };
      });
    } catch (e) {
      throw new FalhaRepositorio('resumoPorPosto', e);
    }
  },

  async listarLeituras(
    prefixo: string,
    serie: SerieMedicao,
    janela: JanelaPeriodo,
    paginacao: Paginacao,
  ): Promise<PaginaLeituras> {
    try {
      const posto = await idDoPosto(prefixo);
      if (posto === null) return { total: 0, itens: [] };

      const origem = ORIGEM[serie];
      const parametros: ParametroMssql[] = [
        { nome: 'posto', tipo: TiposMssql.guid, valor: posto },
        { nome: 'de', tipo: TiposMssql.dataHora, valor: janela.desde },
        { nome: 'ate', tipo: TiposMssql.dataHora, valor: fimExclusivo(janela.ate) },
      ];
      const onde = `m.PostoId = @posto AND m.Excluido = 0
                      AND m.Data >= @de AND m.Data < @ate`;

      // Colunas ausentes na origem viram NULL literal, e não campo omitido:
      // assim o consumidor recebe a mesma forma para as cinco séries e não
      // precisa saber qual tabela tem `Validacao`.
      const colunaValidacao = origem.temValidacao ? 'm.Validacao' : 'CAST(NULL AS tinyint)';
      const colunaVazao = origem.temVazao
        ? `CASE WHEN ${SENTINELA_VAZAO_SQL} THEN NULL ELSE m.VazaoMainframe END`
        : 'CAST(NULL AS decimal(11,3))';

      const [pagina, contagem] = await Promise.all([
        consultarMssql<{
          Data: Date;
          Bruto: unknown;
          Validacao: number | null;
          Vazao: unknown;
        }>(
          `SELECT m.Data,
                  Bruto = m.${origem.colunaValor},
                  Validacao = ${colunaValidacao},
                  Vazao = ${colunaVazao}
             FROM dbo.${origem.tabela} m
            WHERE ${onde}
            ORDER BY m.Data, m.Id
            OFFSET @deslocamento ROWS FETCH NEXT @limite ROWS ONLY`,
          [
            ...parametros,
            {
              nome: 'deslocamento',
              tipo: TiposMssql.inteiro,
              valor: (paginacao.pagina - 1) * paginacao.porPagina,
            },
            { nome: 'limite', tipo: TiposMssql.inteiro, valor: paginacao.porPagina },
          ],
        ),
        consultarMssql<{ Total: number }>(
          `SELECT Total = COUNT(*) FROM dbo.${origem.tabela} m WHERE ${onde}`,
          parametros,
        ),
      ]);

      const itens: LeituraSerie[] = pagina.recordset.map((l) => {
        const bruto = numero(l.Bruto);
        return {
          momento: momentoIso(l.Data),
          valor: valorUtil(serie, bruto),
          bruto,
          validacao: l.Validacao === null ? null : Number(l.Validacao),
          vazaoM3s: vazaoUtil(numero(l.Vazao)),
        };
      });

      return { total: Number(contagem.recordset[0]?.Total ?? 0), itens };
    } catch (e) {
      throw new FalhaRepositorio('listarLeituras', e);
    }
  },

  async agregarPorDia(
    prefixo: string,
    serie: SerieMedicao,
    janela: JanelaPeriodo,
  ): Promise<readonly DiaDaSerie[]> {
    try {
      const posto = await idDoPosto(prefixo);
      if (posto === null) return [];

      const origem = ORIGEM[serie];
      const coluna = `m.${origem.colunaValor}`;
      const sentinela = condicaoSentinela(serie, 'm');
      // O valor só entra na conta quando NÃO é sentinela. É esta linha que
      // impede um mês com dez dias sem leitura de virar 9.999 mm de chuva.
      const util = `CASE WHEN ${sentinela} THEN NULL ELSE ${coluna} END`;

      const r = await consultarMssql<{
        Dia: Date;
        Leituras: number;
        SemValor: number;
        Soma: unknown;
        Media: number | null;
        Minimo: unknown;
        Maximo: unknown;
      }>(
        `SELECT Dia = CAST(m.Data AS date),
                Leituras = COUNT(*),
                SemValor = SUM(CASE WHEN ${sentinela} THEN 1 ELSE 0 END),
                Soma = SUM(${util}),
                Media = AVG(CAST(${util} AS float)),
                Minimo = MIN(${util}),
                Maximo = MAX(${util})
           FROM dbo.${origem.tabela} m
          WHERE m.PostoId = @posto AND m.Excluido = 0
            AND m.Data >= @de AND m.Data < @ate
          GROUP BY CAST(m.Data AS date)
          ORDER BY CAST(m.Data AS date)`,
        [
          { nome: 'posto', tipo: TiposMssql.guid, valor: posto },
          { nome: 'de', tipo: TiposMssql.dataHora, valor: janela.desde },
          { nome: 'ate', tipo: TiposMssql.dataHora, valor: fimExclusivo(janela.ate) },
        ],
      );

      const criterio = SERIES_MEDICAO[serie].criterioDiario;

      return r.recordset.flatMap((l): DiaDaSerie[] => {
        const dia = diaIso(l.Dia);
        if (dia === null) return [];
        const bruto = criterio === 'soma' ? numero(l.Soma) : numero(l.Media);
        return [
          {
            dia,
            valor: bruto === null ? null : duasCasas(bruto),
            leituras: Number(l.Leituras),
            leiturasSemValor: Number(l.SemValor ?? 0),
            minimo: numero(l.Minimo),
            maximo: numero(l.Maximo),
          },
        ];
      });
    } catch (e) {
      throw new FalhaRepositorio('agregarPorDia', e);
    }
  },
};

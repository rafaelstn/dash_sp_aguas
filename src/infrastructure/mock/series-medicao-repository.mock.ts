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
} from '@/domain/monitor/serie-medicao';

/**
 * Séries históricas em memória, para o MODO DEMO.
 *
 * O que este mock existe para reproduzir NÃO é volume, é FORMA: as cinco séries
 * sempre presentes, a série que existe e a que não existe, o valor sentinela
 * virando `null` sem sumir da contagem, e o dia inteiro sem medida. São
 * justamente os estados que a tela precisa distinguir e que um mock "bonito",
 * com série cheia e limpa, esconderia até a primeira execução contra o órgão.
 *
 * Determinístico por construção: mesma entrada, mesma saída, sem relógio e sem
 * sorteio. Teste que depende deste mock não fica intermitente.
 */

/** Posto de demonstração com as duas séries de chuva. */
const POSTO_COM_CHUVA = '1D-008';
/** Posto de demonstração com cota de rio, para exercitar a régua de nível. */
const POSTO_COM_COTA = '2D-006';

const MS_DIA = 24 * 60 * 60 * 1000;
/** Primeiro dia da série de demonstração. Data fixa, nunca `Date.now()`. */
const INICIO = Date.UTC(2025, 0, 1);
const DIAS = 90;

/**
 * Valor do dia `i`, em milímetros. A cada sete dias devolve a sentinela, para
 * que o consumidor encontre o caso "existe leitura e não existe medida" já em
 * demonstração, e não só em produção.
 */
function chuvaDoDia(i: number): number {
  if (i % 7 === 0) return 999.9;
  return ((i * 37) % 45) / 2;
}

/** Cota do dia `i`, em centímetros, oscilando numa faixa plausível de régua. */
function cotaDoDia(i: number): number {
  if (i % 11 === 0) return 9999;
  return 380 + ((i * 13) % 90);
}

function seriesDoPosto(prefixo: string): Map<SerieMedicao, number[]> {
  const p = prefixo.trim().toUpperCase();
  const series = new Map<SerieMedicao, number[]>();
  if (p === POSTO_COM_CHUVA) {
    series.set(
      'chuva_manual',
      Array.from({ length: DIAS }, (_, i) => chuvaDoDia(i)),
    );
    series.set(
      'chuva_logger',
      Array.from({ length: DIAS }, (_, i) => chuvaDoDia(i + 3)),
    );
  } else if (p === POSTO_COM_COTA) {
    series.set(
      'cota_rio',
      Array.from({ length: DIAS }, (_, i) => cotaDoDia(i)),
    );
  }
  return series;
}

/** Prefixos que o modo demo reconhece como posto existente. */
const POSTOS_CONHECIDOS = new Set([
  POSTO_COM_CHUVA,
  POSTO_COM_COTA,
  '1E-001',
  '2D-013',
  'A6-001',
  'A7-001',
  'A7-002',
]);

function diaIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function resumoDaSerie(serie: SerieMedicao, valores: number[] | undefined): ResumoSerie {
  const def = SERIES_MEDICAO[serie];
  const base = {
    serie,
    rotulo: def.rotulo,
    unidade: def.unidade,
    unidadeInferida: def.unidadeInferida,
    criterioDiario: def.criterioDiario,
    leiturasComDataFutura: 0,
  };
  if (!valores || valores.length === 0) {
    return { ...base, leituras: 0, primeiraData: null, ultimaData: null, leiturasSemValor: 0 };
  }
  return {
    ...base,
    leituras: valores.length,
    primeiraData: diaIso(INICIO),
    ultimaData: diaIso(INICIO + (valores.length - 1) * MS_DIA),
    leiturasSemValor: valores.filter((v) => valorUtil(serie, v) === null).length,
  };
}

function dentroDaJanela(ms: number, janela: JanelaPeriodo): boolean {
  const inicio = Date.UTC(
    janela.desde.getUTCFullYear(),
    janela.desde.getUTCMonth(),
    janela.desde.getUTCDate(),
  );
  const fim = Date.UTC(
    janela.ate.getUTCFullYear(),
    janela.ate.getUTCMonth(),
    janela.ate.getUTCDate() + 1,
  );
  return ms >= inicio && ms < fim;
}

export const seriesMedicaoRepositoryMock: SeriesMedicaoRepository = {
  async resumoPorPosto(prefixo: string): Promise<readonly ResumoSerie[] | null> {
    if (!POSTOS_CONHECIDOS.has(prefixo.trim().toUpperCase())) return null;
    const series = seriesDoPosto(prefixo);
    return TODAS_AS_SERIES.map((serie) => resumoDaSerie(serie, series.get(serie)));
  },

  async listarLeituras(
    prefixo: string,
    serie: SerieMedicao,
    janela: JanelaPeriodo,
    paginacao: Paginacao,
  ): Promise<PaginaLeituras> {
    const valores = seriesDoPosto(prefixo).get(serie);
    if (!valores) return { total: 0, itens: [] };

    const todas: LeituraSerie[] = valores
      .map((bruto, i) => ({ ms: INICIO + i * MS_DIA, bruto }))
      .filter(({ ms }) => dentroDaJanela(ms, janela))
      .map(({ ms, bruto }) => ({
        momento: new Date(ms).toISOString(),
        valor: valorUtil(serie, bruto),
        bruto,
        validacao: null,
        vazaoM3s: null,
      }));

    const inicio = (paginacao.pagina - 1) * paginacao.porPagina;
    return { total: todas.length, itens: todas.slice(inicio, inicio + paginacao.porPagina) };
  },

  async agregarPorDia(
    prefixo: string,
    serie: SerieMedicao,
    janela: JanelaPeriodo,
  ): Promise<readonly DiaDaSerie[]> {
    const valores = seriesDoPosto(prefixo).get(serie);
    if (!valores) return [];

    return valores
      .map((bruto, i) => ({ ms: INICIO + i * MS_DIA, bruto }))
      .filter(({ ms }) => dentroDaJanela(ms, janela))
      .map(({ ms, bruto }) => {
        const util = valorUtil(serie, bruto);
        return {
          dia: diaIso(ms),
          valor: util === null ? null : Math.round(util * 100) / 100,
          leituras: 1,
          leiturasSemValor: util === null ? 1 : 0,
          minimo: util,
          maximo: util,
        };
      });
  },
};

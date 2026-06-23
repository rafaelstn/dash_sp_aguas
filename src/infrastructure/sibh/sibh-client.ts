import 'server-only';

import { format } from 'date-fns';
import type {
  EstacaoSibh,
  LeituraSibh,
  MedicaoSibh,
  SibhGateway,
  TipoEstacaoSibh,
} from '@/application/ports/sibh-gateway';

/**
 * Adapter da API oficial do SIBH (v2). Implementa `SibhGateway` consumindo
 * `https://apps.spaguas.sp.gov.br/sibh/api/v2` via fetch server-side.
 *
 * DECISÕES
 *   - Cache em memória das estações (TTL 1h): são dados estáveis e a lista é
 *     grande. Dedup de fetch concorrente via promise compartilhada, pra dois
 *     requests simultâneos não baterem na API duas vezes.
 *   - Medições NÃO têm cache: o módulo Monitor e o "ao vivo" dos Diagramas
 *     querem o dado mais recente; cachear mascararia atualização horária.
 *   - Erro de rede/HTTP vira `SibhIndisponivelError` com mensagem limpa; a
 *     causa crua fica em `cause` pro log, nunca vaza pro cliente HTTP.
 *
 * O SIBH não exige autenticação; o gate de sessão fica nas rotas que
 * consomem este adapter.
 */

const SIBH_BASE_URL = 'https://apps.spaguas.sp.gov.br/sibh/api/v2';
const TTL_ESTACOES_MS = 60 * 60 * 1000; // 1 hora
const TIMEOUT_MS = 15_000;

// Cache curto da leitura "ao vivo" por prefixo. O dado do SIBH atualiza a cada
// ~10-30 min; um diagrama aberto tem vários nós e pode ser revisto várias
// vezes seguidas. 2 min equilibra frescor com não martelar a API.
const TTL_LEITURA_MS = 2 * 60 * 1000;

// Janela varrida para achar a leitura mais recente. Estações ativas reportam
// de hora em hora; 3 dias cobre fins de semana e atrasos de transmissão sem
// puxar histórico desnecessário.
const JANELA_LEITURA_DIAS = 3;

/**
 * Mapeia o `station_type_id` cru do SIBH para o tipo de domínio.
 */
function mapearTipo(stationTypeId: string | number | null | undefined): TipoEstacaoSibh {
  switch (String(stationTypeId ?? '')) {
    case '1':
      return 'fluviometrico';
    case '2':
      return 'pluviometrico';
    case '3':
      return 'piezometrico';
    case '5':
      return 'qualidade';
    default:
      return 'desconhecido';
  }
}

/**
 * Erro de domínio do adapter: o SIBH está indisponível ou respondeu fora do
 * contrato esperado. Mensagem segura para exibir; `cause` guarda o detalhe.
 */
export class SibhIndisponivelError extends Error {
  constructor(mensagem: string, cause?: unknown) {
    super(mensagem);
    this.name = 'SibhIndisponivelError';
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Shape cru de uma estação como vem do endpoint `/stations`.
 */
interface EstacaoBruta {
  prefix?: string;
  station_name?: string;
  name?: string;
  id?: string | number;
  station_type_id?: string | number;
}

/**
 * Shape cru de uma medição como vem do endpoint `/measurements`.
 *
 * `value`      -> chuva acumulada em mm (pluviométrico) ou valor cru do logger
 *                 (fluviométrico, sem unidade física direta).
 * `read_value` -> leitura física convertida; em fluviométrico é a cota/nível
 *                 em metros. `null` em pluviométrico.
 */
interface MedicaoBruta {
  prefix?: string;
  station_name?: string;
  value?: number;
  read_value?: number | null;
  station_type_id?: string | number;
  date?: string;
  measurement_gap?: number;
}

let estacoesCache: EstacaoSibh[] | null = null;
let estacoesCacheTs = 0;
let estacoesEmVoo: Promise<EstacaoSibh[]> | null = null;

// Cache curto de leitura ao vivo por prefixo (TTL_LEITURA_MS). Guarda também
// `null` (prefixo sem leitura recente) pra não repetir a consulta a cada nó.
const leituraCache = new Map<string, { ts: number; valor: LeituraSibh | null }>();

/**
 * Faz um GET no SIBH com timeout e erro normalizado. Retorna o JSON parseado.
 */
async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let resposta: Response;
  try {
    resposta = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } catch (erro) {
    const motivo =
      erro instanceof Error && erro.name === 'AbortError'
        ? 'Tempo de resposta excedido ao consultar o SIBH.'
        : 'Falha de rede ao consultar o SIBH.';
    throw new SibhIndisponivelError(motivo, erro);
  } finally {
    clearTimeout(timer);
  }

  if (!resposta.ok) {
    throw new SibhIndisponivelError(
      `O SIBH respondeu com status ${resposta.status}.`,
    );
  }

  try {
    return await resposta.json();
  } catch (erro) {
    throw new SibhIndisponivelError('Resposta do SIBH não é JSON válido.', erro);
  }
}

/**
 * Extrai o array de medições de uma resposta que pode vir como array direto
 * ou embrulhada em `{ measurements: [...] }`.
 */
function extrairMedicoesBrutas(payload: unknown): MedicaoBruta[] {
  if (Array.isArray(payload)) return payload as MedicaoBruta[];
  if (payload && typeof payload === 'object' && 'measurements' in payload) {
    const lista = (payload as { measurements?: unknown }).measurements;
    if (Array.isArray(lista)) return lista as MedicaoBruta[];
  }
  return [];
}

/**
 * Carrega e cacheia a lista de estações do SIBH. Dedup de fetch concorrente.
 */
async function carregarEstacoes(): Promise<EstacaoSibh[]> {
  const agora = Date.now();
  if (estacoesCache && agora - estacoesCacheTs < TTL_ESTACOES_MS) {
    return estacoesCache;
  }
  if (estacoesEmVoo) return estacoesEmVoo;

  estacoesEmVoo = (async () => {
    try {
      const payload = await getJson(`${SIBH_BASE_URL}/stations`);
      if (!Array.isArray(payload)) {
        throw new SibhIndisponivelError(
          'Lista de estações do SIBH veio em formato inesperado.',
        );
      }

      const estacoes: EstacaoSibh[] = [];
      for (const bruta of payload as EstacaoBruta[]) {
        const prefixo = bruta.prefix?.trim();
        const id = bruta.id != null ? String(bruta.id) : '';
        if (!prefixo || !id) continue;
        estacoes.push({
          prefixo,
          nome: (bruta.station_name ?? bruta.name ?? prefixo).trim(),
          id,
          tipo: mapearTipo(bruta.station_type_id),
        });
      }

      estacoesCache = estacoes;
      estacoesCacheTs = Date.now();
      return estacoes;
    } finally {
      estacoesEmVoo = null;
    }
  })();

  return estacoesEmVoo;
}

/**
 * Mapeia medição crua para o tipo normalizado, validando os campos mínimos.
 * Retorna `null` quando o registro está incompleto.
 */
function normalizarMedicao(bruta: MedicaoBruta): MedicaoSibh | null {
  const prefixo = bruta.prefix?.trim();
  const momento = bruta.date?.trim();
  if (!prefixo || !momento) return null;
  if (typeof bruta.value !== 'number' || !Number.isFinite(bruta.value)) {
    return null;
  }
  return {
    prefixo,
    nome: (bruta.station_name ?? prefixo).trim(),
    valorMm: bruta.value,
    momento,
    gapMinutos: typeof bruta.measurement_gap === 'number' ? bruta.measurement_gap : 0,
  };
}

/**
 * Implementação concreta do `SibhGateway`. Singleton stateless (o cache vive
 * em módulo), seguro para reuso entre requests no mesmo processo.
 */
export const sibhClient: SibhGateway = {
  async listarEstacoes(): Promise<EstacaoSibh[]> {
    return carregarEstacoes();
  },

  async medicoesPorPrefixo(
    prefixo: string,
    desde: Date,
    ate: Date,
  ): Promise<MedicaoSibh[]> {
    const alvo = prefixo.trim();
    if (!alvo) return [];

    const estacoes = await carregarEstacoes();
    const estacao = estacoes.find((e) => e.prefixo === alvo);
    if (!estacao) return [];

    const inicio = format(desde, 'yyyy-MM-dd');
    const fim = format(ate, 'yyyy-MM-dd');
    const url =
      `${SIBH_BASE_URL}/measurements` +
      `?start_date=${inicio}&end_date=${fim}` +
      `&station_prefix_ids[]=${encodeURIComponent(estacao.id)}`;

    const payload = await getJson(url);
    const brutas = extrairMedicoesBrutas(payload);

    const medicoes: MedicaoSibh[] = [];
    for (const bruta of brutas) {
      // A resposta pode misturar prefixos quando o mesmo id atende tipos
      // diferentes; filtra pelo prefixo pedido.
      if (bruta.prefix?.trim() !== alvo) continue;
      const normalizada = normalizarMedicao(bruta);
      if (normalizada) medicoes.push(normalizada);
    }
    return medicoes;
  },

  async valorAtualPorPrefixo(prefixo: string): Promise<LeituraSibh | null> {
    const alvo = prefixo.trim();
    if (!alvo) return null;

    const cacheado = leituraCache.get(alvo);
    if (cacheado && Date.now() - cacheado.ts < TTL_LEITURA_MS) {
      return cacheado.valor;
    }

    const estacoes = await carregarEstacoes();
    const estacao = estacoes.find((e) => e.prefixo === alvo);
    if (!estacao) {
      leituraCache.set(alvo, { ts: Date.now(), valor: null });
      return null;
    }

    const ate = new Date();
    const desde = new Date(ate.getTime() - JANELA_LEITURA_DIAS * 24 * 60 * 60 * 1000);
    const url =
      `${SIBH_BASE_URL}/measurements` +
      `?start_date=${format(desde, 'yyyy-MM-dd')}&end_date=${format(ate, 'yyyy-MM-dd')}` +
      `&station_prefix_ids[]=${encodeURIComponent(estacao.id)}`;

    const payload = await getJson(url);
    const brutas = extrairMedicoesBrutas(payload);

    let maisRecente: MedicaoBruta | null = null;
    for (const bruta of brutas) {
      if (bruta.prefix?.trim() !== alvo) continue;
      const momento = bruta.date?.trim();
      if (!momento) continue;
      // `date` vem como 'YYYY/MM/DD HH:mm', cuja ordenação lexicográfica
      // coincide com a cronológica — comparar string é suficiente e evita
      // parse de timezone.
      if (!maisRecente || momento > (maisRecente.date?.trim() ?? '')) {
        maisRecente = bruta;
      }
    }

    const leitura = maisRecente
      ? normalizarLeitura(maisRecente, estacao)
      : null;
    leituraCache.set(alvo, { ts: Date.now(), valor: leitura });
    return leitura;
  },
};

/**
 * Monta a `LeituraSibh` a partir da medição bruta mais recente e da estação.
 *
 * O `value` cru vira `valorMm` apenas em estação pluviométrica (lá o número é
 * mm de chuva). O `read_value` vira `valorNivel` em estação fluviométrica (a
 * cota em metros). Para outros tipos, ambos podem ficar nulos quando não há
 * leitura física interpretável.
 */
function normalizarLeitura(
  bruta: MedicaoBruta,
  estacao: EstacaoSibh,
): LeituraSibh {
  const tipo = estacao.tipo;
  const value =
    typeof bruta.value === 'number' && Number.isFinite(bruta.value)
      ? bruta.value
      : null;
  const readValue =
    typeof bruta.read_value === 'number' && Number.isFinite(bruta.read_value)
      ? bruta.read_value
      : null;

  return {
    prefixo: estacao.prefixo,
    nome: (bruta.station_name?.trim() || estacao.nome),
    tipoEstacao: tipo,
    valorMm: tipo === 'pluviometrico' ? value : null,
    valorNivel: tipo === 'fluviometrico' ? readValue : null,
    momento: (bruta.date ?? '').trim(),
    gapMinutos:
      typeof bruta.measurement_gap === 'number' ? bruta.measurement_gap : 0,
  };
}

/**
 * Limpa o cache de estações. Uso restrito a testes; não chamar em produção.
 */
export function _resetSibhCache(): void {
  estacoesCache = null;
  estacoesCacheTs = 0;
  estacoesEmVoo = null;
  leituraCache.clear();
}

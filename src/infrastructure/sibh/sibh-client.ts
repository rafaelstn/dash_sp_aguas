import 'server-only';

import { format } from 'date-fns';
import type {
  EstacaoSibh,
  MedicaoSibh,
  SibhGateway,
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
}

/**
 * Shape cru de uma medição como vem do endpoint `/measurements`.
 */
interface MedicaoBruta {
  prefix?: string;
  station_name?: string;
  value?: number;
  date?: string;
  measurement_gap?: number;
}

let estacoesCache: EstacaoSibh[] | null = null;
let estacoesCacheTs = 0;
let estacoesEmVoo: Promise<EstacaoSibh[]> | null = null;

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
};

/**
 * Limpa o cache de estações. Uso restrito a testes; não chamar em produção.
 */
export function _resetSibhCache(): void {
  estacoesCache = null;
  estacoesCacheTs = 0;
  estacoesEmVoo = null;
}

import type { CodigoTipoDocumento } from './tipo-documento';

/**
 * Estados do ciclo de vida da ficha de triagem (spec §4.1).
 *   - pendente   : submetida pelo técnico, aguarda revisor.
 *   - em_revisao : aprovador iniciou revisão (lock vivo).
 *   - aprovada   : promovida pra `fichas_visita`. Imutável.
 *   - rejeitada  : recusa final, ciclo encerrado. Imutável.
 *   - devolvida  : devolvida pro técnico pra correção; pode virar `pendente`
 *                  via re-envio (caso especial — gera nova linha com
 *                  `ficha_origem_id` apontando pra essa).
 */
export type EstadoTriagem =
  | 'pendente'
  | 'em_revisao'
  | 'aprovada'
  | 'rejeitada'
  | 'devolvida';

export const ESTADOS_TRIAGEM: readonly EstadoTriagem[] = Object.freeze([
  'pendente',
  'em_revisao',
  'aprovada',
  'rejeitada',
  'devolvida',
]);

/** Tabela de transições válidas (spec §4.3). */
const TRANSICOES_VALIDAS: ReadonlyMap<EstadoTriagem, ReadonlySet<EstadoTriagem>> =
  new Map([
    ['pendente', new Set<EstadoTriagem>(['em_revisao'])],
    ['em_revisao', new Set<EstadoTriagem>(['pendente', 'aprovada', 'rejeitada', 'devolvida'])],
    // estados terminais e devolvida (devolvida → pendente é via re-envio,
    // que cria NOVA linha — não transição na linha existente).
    ['aprovada', new Set<EstadoTriagem>()],
    ['rejeitada', new Set<EstadoTriagem>()],
    ['devolvida', new Set<EstadoTriagem>()],
  ]);

/** Função pura que valida transição de estado. */
export function podeTransitar(
  de: EstadoTriagem,
  para: EstadoTriagem,
): boolean {
  const permitidos = TRANSICOES_VALIDAS.get(de);
  return permitidos?.has(para) ?? false;
}

/**
 * Value Object para motivo de rejeição/devolução.
 * Regra: ≥ 20 chars (spec §4.3 / migration 0024 chk_fichas_triagem_motivo).
 */
export class MotivoDecisao {
  private constructor(public readonly valor: string) {}

  static criar(bruto: string | null | undefined): MotivoDecisao {
    const texto = (bruto ?? '').trim();
    if (texto.length < 20) {
      // Lança erro tipado importado pra evitar ciclo (definido em errors.ts).
      throw new MotivoDecisaoInsuficienteError(texto.length);
    }
    return new MotivoDecisao(texto);
  }
}

/**
 * Erro local pro VO. Re-exportado de `errors.ts` com mesmo nome simbólico
 * pra manter o `domain/errors.ts` como ponto canônico de erros do domínio.
 */
export class MotivoDecisaoInsuficienteError extends Error {
  constructor(public readonly tamanhoRecebido: number) {
    super(
      `Motivo de decisão precisa ter ao menos 20 caracteres (recebido: ${tamanhoRecebido}).`,
    );
    this.name = 'MotivoDecisaoInsuficienteError';
  }
}

/** Origem da ficha — por ora só app_campo no fluxo de triagem. */
export type OrigemTriagem = 'app_campo' | 'web_simulada' | 'importacao';

/**
 * Ficha em estado de triagem. Estrutura espelha tabela `fichas_triagem`.
 */
export interface FichaTriagem {
  id: string;
  prefixo: string;
  codTipoDocumento: CodigoTipoDocumento;

  dataVisita: Date;
  horaInicio: string | null;
  horaFim: string | null;

  tecnicoId: string;
  tecnicoNome: string;

  latitudeCapturada: number | null;
  longitudeCapturada: number | null;
  precisaoGpsM: number | null;

  observacoes: string | null;
  dados: Record<string, unknown>;

  origem: OrigemTriagem;

  estado: EstadoTriagem;
  motivoDecisao: string | null;
  decididaPor: string | null;
  decididaEm: Date | null;

  fichaVisitaId: string | null;
  fichaOrigemId: string | null;

  idempotencyKey: string | null;

  criadaEm: Date;
  atualizadaEm: Date;
}

/**
 * Helper: a ficha está em estado "decidido" (terminal) e portanto imutável?
 */
export function estadoEhTerminal(estado: EstadoTriagem): boolean {
  return estado === 'aprovada' || estado === 'rejeitada';
}

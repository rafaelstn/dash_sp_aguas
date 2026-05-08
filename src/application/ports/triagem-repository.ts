import type {
  EstadoTriagem,
  FichaTriagem,
  OrigemTriagem,
} from '@/domain/triagem';
import type {
  EntradaEventoTriagem,
  EventoTriagem,
} from '@/domain/triagem-evento';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

/**
 * Entrada para submeter ficha (use case `submeterFichaTriagem`).
 * `idempotencyKey` opcional vem do header `Idempotency-Key` (UUID v4 do cliente).
 */
export interface EntradaSubmeterTriagem {
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
  origem?: OrigemTriagem;
  fichaOrigemId?: string | null;
  idempotencyKey?: string | null;
}

export interface FiltrosListarPendentes {
  estado?: EstadoTriagem | EstadoTriagem[];
  codTipoDocumento?: CodigoTipoDocumento;
  prefixo?: string;
  tecnicoId?: string;
  desde?: Date;
  ate?: Date;
  limite?: number;
  offset?: number;
}

/**
 * Resultado da operação de aquisição de lock — devolvida pelo método
 * `iniciarRevisao` do repositório. O use case decide o que fazer com isso.
 */
export type ResultadoIniciarRevisao =
  | { adquirido: true; ficha: FichaTriagem; expiraEm: Date }
  | { adquirido: false; motivo: 'lock_em_uso'; revisorAtualId: string; expiraEm: Date }
  | { adquirido: false; motivo: 'estado_invalido'; estadoAtual: EstadoTriagem };

/** Resultado da promoção atômica `aprovarFicha`. */
export interface ResultadoAprovacao {
  triagem: FichaTriagem;
  fichaVisitaId: string;
}

export interface TriagemRepository {
  /** Submete nova ficha (estado `pendente`) + grava evento `submetida`. Atômico. */
  submeter(
    entrada: EntradaSubmeterTriagem,
    metadata: { ip: string | null; userAgent: string | null },
  ): Promise<FichaTriagem>;

  /** Re-envia ficha previamente devolvida (cria NOVA linha apontando pra original). */
  reenviarAposDevolucao(
    fichaOrigemId: string,
    entrada: EntradaSubmeterTriagem,
    metadata: { ip: string | null; userAgent: string | null },
  ): Promise<FichaTriagem>;

  listarPendentes(filtros: FiltrosListarPendentes): Promise<{
    itens: FichaTriagem[];
    total: number;
  }>;

  obterPorId(id: string): Promise<FichaTriagem | null>;

  /**
   * Adquire lock pessimista de revisão. Atômico:
   *   1) verifica estado = 'pendente'
   *   2) INSERT em triagem_locks (UNIQUE em triagem_id evita race)
   *   3) UPDATE fichas_triagem.estado = 'em_revisao'
   *   4) INSERT em triagem_eventos
   * Se já houver lock vivo, não levanta exceção — devolve resultado tipado.
   */
  iniciarRevisao(
    triagemId: string,
    revisorId: string,
    metadata: { ip: string | null; userAgent: string | null },
  ): Promise<ResultadoIniciarRevisao>;

  /**
   * Promoção atômica para `fichas_visita`. Em uma transação:
   *   - valida estado = 'em_revisao' AND lock pertence a `aprovadorId`
   *   - INSERT em fichas_visita
   *   - UPDATE fichas_triagem (estado, ficha_visita_id, decidida_em, decidida_por)
   *   - DELETE do lock
   *   - INSERT em triagem_eventos
   * Qualquer falha → ROLLBACK total.
   */
  aprovar(
    triagemId: string,
    aprovadorId: string,
    metadata: { ip: string | null; userAgent: string | null },
  ): Promise<ResultadoAprovacao>;

  rejeitar(
    triagemId: string,
    aprovadorId: string,
    motivo: string,
    metadata: { ip: string | null; userAgent: string | null },
  ): Promise<FichaTriagem>;

  devolver(
    triagemId: string,
    aprovadorId: string,
    motivo: string,
    metadata: { ip: string | null; userAgent: string | null },
  ): Promise<FichaTriagem>;

  /**
   * Cron job: deleta locks com `expira_em < NOW()` e volta as fichas a `pendente`.
   * Cada lock liberado gera evento `lock_expirado`. Idempotente — retorna
   * a lista de IDs liberados.
   */
  liberarLocksExpirados(): Promise<{ liberados: string[] }>;

  /** Lista eventos de uma ficha (audit trail). */
  listarEventos(triagemId: string): Promise<EventoTriagem[]>;

  /** Insere evento avulso (uso interno do use case quando a operação principal já está numa tx). */
  registrarEvento(entrada: EntradaEventoTriagem): Promise<EventoTriagem>;

  /** Procura ficha existente por par (tecnico_id, idempotency_key). Null se não houver. */
  obterPorIdempotency(
    tecnicoId: string,
    idempotencyKey: string,
  ): Promise<FichaTriagem | null>;
}

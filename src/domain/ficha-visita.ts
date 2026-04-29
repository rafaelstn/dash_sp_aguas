import type { CodigoTipoDocumento } from './tipo-documento';

/**
 * Fonte da ficha — qual sistema gerou a entrada.
 *   - web_simulada : preenchida por humano via formulário interno (debug/seed)
 *   - app_campo    : enviada pelo app mobile do técnico em campo (futuro)
 *   - importacao   : carregada em massa de origem externa (script/migração)
 */
export type OrigemFicha = 'web_simulada' | 'app_campo' | 'importacao';

/**
 * Status do ciclo de vida da ficha.
 *   - rascunho : criada mas ainda não submetida (técnico em edição)
 *   - enviada  : submetida e disponível pra consulta — estado padrão
 *   - aprovada : revisada por supervisor (workflow opcional, futuro)
 */
export type StatusFicha = 'rascunho' | 'enviada' | 'aprovada';

/**
 * Ficha digital de visita a um posto. O payload específico de cada tipo
 * (Inspeção / PCD / Medição / etc.) vai em `dados` — schema definido em
 * `domain/fichas/schemas.ts` por tipo de documento.
 */
export interface FichaVisita {
  id: string;
  prefixo: string;
  codTipoDocumento: CodigoTipoDocumento;

  dataVisita: Date;
  horaInicio: string | null; // 'HH:MM' ou 'HH:MM:SS'
  horaFim: string | null;

  tecnicoNome: string;
  tecnicoId: string | null;

  latitudeCapturada: number | null;
  longitudeCapturada: number | null;

  observacoes: string | null;
  /** Payload específico por tipo. Validar via schema do tipo antes de gravar. */
  dados: Record<string, unknown>;

  origem: OrigemFicha;
  status: StatusFicha;

  criadaEm: Date;
  atualizadaEm: Date;
}

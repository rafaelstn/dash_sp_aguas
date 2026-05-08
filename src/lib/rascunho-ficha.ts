/**
 * Persistência de rascunho de ficha do app móvel.
 *
 * Decisão (Fernanda, Sprint 3): usar **localStorage** no MVP.
 *  - Tamanho do payload: ≤ 4 KB típico (objeto plano com ~30 chaves).
 *    Cabe folgado em localStorage (5 MB de quota).
 *  - Síncrono — a UX exige ler/escrever a cada `change` sem latência;
 *    IndexedDB pediria `await` em todo handler.
 *  - Fila de envios offline (que vai pra IndexedDB conforme ADR-0007 §2.3)
 *    é assunto da Sprint 4. Esta sprint implementa só o auto-save do
 *    formulário em edição.
 *
 * Chave: `spaguas:rascunho:<usuarioId>:<prefixo>:<codigo>`
 * Quando a ficha é re-envio de uma devolvida, a chave fica:
 *   `spaguas:rascunho:<usuarioId>:<prefixo>:<codigo>:reenvio:<fichaOrigemId>`
 *
 * Estrutura persistida:
 *   - dados (Record<string, unknown>) — preenchimento dos campos do schema
 *   - cabecalho — campos comuns (data, hora, observações, GPS, foto base64)
 *   - idempotencyKey — UUID v4 reutilizável entre tentativas (cumprimenta
 *     `submeterFichaTriagem`).
 *   - atualizadoEm — timestamp ISO.
 *   - versao — número da estrutura para futuras migrações compatíveis.
 *
 * O auto-save é feito pelo componente `FormularioFichaMobile` e
 * **não** roda em SSR (guarda `typeof window === 'undefined'`).
 */

const PREFIXO_CHAVE = 'spaguas:rascunho';
const VERSAO_ATUAL = 1;

export interface CabecalhoRascunho {
  dataVisita: string;
  horaInicio: string | null;
  horaFim: string | null;
  tecnicoNome: string;
  observacoes: string | null;
  latitudeCapturada: number | null;
  longitudeCapturada: number | null;
  precisaoGpsM: number | null;
  /** Foto da ficha física (data URL JPEG/PNG). Limitada a ~2 MB após compressão. */
  fotoDataUrl: string | null;
  /** Indica se o usuário consentiu com captura de GPS pelo menos uma vez nesta ficha. */
  consentiuGps: boolean;
}

export interface RascunhoFicha {
  versao: number;
  usuarioId: string;
  prefixo: string;
  codigo: number;
  fichaOrigemId: string | null;
  idempotencyKey: string;
  cabecalho: CabecalhoRascunho;
  dados: Record<string, unknown>;
  atualizadoEm: string;
}

export interface ChaveRascunho {
  usuarioId: string;
  prefixo: string;
  codigo: number;
  fichaOrigemId?: string | null;
}

function montarChave(c: ChaveRascunho): string {
  const base = `${PREFIXO_CHAVE}:${c.usuarioId}:${c.prefixo}:${c.codigo}`;
  return c.fichaOrigemId ? `${base}:reenvio:${c.fichaOrigemId}` : base;
}

function podeUsarStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function carregarRascunho(c: ChaveRascunho): RascunhoFicha | null {
  if (!podeUsarStorage()) return null;
  try {
    const bruto = window.localStorage.getItem(montarChave(c));
    if (!bruto) return null;
    const obj = JSON.parse(bruto) as Partial<RascunhoFicha>;
    if (
      typeof obj !== 'object' ||
      obj === null ||
      typeof obj.versao !== 'number' ||
      obj.versao !== VERSAO_ATUAL ||
      typeof obj.idempotencyKey !== 'string' ||
      typeof obj.cabecalho !== 'object' ||
      typeof obj.dados !== 'object'
    ) {
      // Estrutura inválida ou versão futura — descarta sem risco.
      return null;
    }
    return obj as RascunhoFicha;
  } catch {
    return null;
  }
}

export function salvarRascunho(rascunho: RascunhoFicha): void {
  if (!podeUsarStorage()) return;
  try {
    const payload: RascunhoFicha = {
      ...rascunho,
      versao: VERSAO_ATUAL,
      atualizadoEm: new Date().toISOString(),
    };
    window.localStorage.setItem(
      montarChave({
        usuarioId: rascunho.usuarioId,
        prefixo: rascunho.prefixo,
        codigo: rascunho.codigo,
        fichaOrigemId: rascunho.fichaOrigemId,
      }),
      JSON.stringify(payload),
    );
  } catch {
    // QuotaExceededError ou storage bloqueado: silencioso por ora.
    // Toast de aviso seria barulhento; o usuário ainda consegue submeter.
  }
}

export function descartarRascunho(c: ChaveRascunho): void {
  if (!podeUsarStorage()) return;
  try {
    window.localStorage.removeItem(montarChave(c));
  } catch {
    /* ignore */
  }
}

export function montarRascunhoInicial(args: {
  usuarioId: string;
  prefixo: string;
  codigo: number;
  fichaOrigemId?: string | null;
  tecnicoNomeSugerido: string;
  idempotencyKey: string;
  cabecalho?: Partial<CabecalhoRascunho>;
  dados?: Record<string, unknown>;
}): RascunhoFicha {
  const hojeIso = new Date().toISOString().slice(0, 10);
  return {
    versao: VERSAO_ATUAL,
    usuarioId: args.usuarioId,
    prefixo: args.prefixo,
    codigo: args.codigo,
    fichaOrigemId: args.fichaOrigemId ?? null,
    idempotencyKey: args.idempotencyKey,
    cabecalho: {
      dataVisita: args.cabecalho?.dataVisita ?? hojeIso,
      horaInicio: args.cabecalho?.horaInicio ?? null,
      horaFim: args.cabecalho?.horaFim ?? null,
      tecnicoNome: args.cabecalho?.tecnicoNome ?? args.tecnicoNomeSugerido,
      observacoes: args.cabecalho?.observacoes ?? null,
      latitudeCapturada: args.cabecalho?.latitudeCapturada ?? null,
      longitudeCapturada: args.cabecalho?.longitudeCapturada ?? null,
      precisaoGpsM: args.cabecalho?.precisaoGpsM ?? null,
      fotoDataUrl: args.cabecalho?.fotoDataUrl ?? null,
      consentiuGps: args.cabecalho?.consentiuGps ?? false,
    },
    dados: args.dados ?? {},
    atualizadoEm: new Date().toISOString(),
  };
}

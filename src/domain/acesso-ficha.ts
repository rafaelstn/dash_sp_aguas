export type AcaoAcessoFicha = 'visualizou_ficha' | 'listou_arquivos';

export interface AcessoFicha {
  prefixo: string;
  acao: AcaoAcessoFicha;
  ip: string | null;
  userAgent: string | null;
  /** Nullable no MVP — autenticação é Fase 2. */
  usuarioId: string | null;
}

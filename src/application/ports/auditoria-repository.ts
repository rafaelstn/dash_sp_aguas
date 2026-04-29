import type { AcessoFicha } from '@/domain/acesso-ficha';

/** Prefixo + timestamp do último acesso ('visualizou_ficha') daquele usuário. */
export interface AcessoRecente {
  prefixo: string;
  ocorreuEm: Date;
}

export interface AuditoriaRepository {
  registrarAcesso(evento: AcessoFicha): Promise<void>;

  /**
   * Últimos N postos visualizados pelo usuário, deduplicados por prefixo
   * (mantém o acesso mais recente de cada um) e ordenados do mais recente
   * pro mais antigo. Usado em "Acesso rápido" na home — só faz sentido pra
   * usuário autenticado.
   */
  listarRecentesDoUsuario(usuarioId: string, limite: number): Promise<AcessoRecente[]>;
}

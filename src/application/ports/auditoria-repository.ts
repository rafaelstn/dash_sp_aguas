import type { AcessoFicha } from '@/domain/acesso-ficha';

/** Prefixo + timestamp do último acesso ('visualizou_ficha') daquele usuário. */
export interface AcessoRecente {
  prefixo: string;
  ocorreuEm: Date;
}

/** Quantas linhas de cada tabela da trilha tiveram a PII de rede anonimizada. */
export interface AnonimizacaoTrilha {
  tabela: string;
  linhasAnonimizadas: number;
}

export interface AuditoriaRepository {
  registrarAcesso(evento: AcessoFicha): Promise<void>;

  /**
   * Anonimiza `ip` e `user_agent` dos eventos de trilha mais antigos que o
   * prazo de retencao (LGPD-4, art. 15 e 16). O EVENTO permanece: quem, quando
   * e o que sao imutaveis e sustentam a auditoria exigida pela rule de governo;
   * so os metadados de rede, que sao dado pessoal indireto, sao zerados quando
   * deixam de ser necessarios.
   *
   * Idempotente: reexecutar so alcanca linhas que ainda tenham PII acima do
   * prazo. Delega a funcao `anonimizar_trilha_auditoria` da migration 0048,
   * que e `SECURITY DEFINER` porque UPDATE esta revogado do PUBLIC nessas
   * tabelas.
   */
  anonimizarPiiRetida(diasRetencao: number): Promise<AnonimizacaoTrilha[]>;

  /**
   * Últimos N postos visualizados pelo usuário, deduplicados por prefixo
   * (mantém o acesso mais recente de cada um) e ordenados do mais recente
   * pro mais antigo. Usado em "Acesso rápido" na home — só faz sentido pra
   * usuário autenticado.
   */
  listarRecentesDoUsuario(usuarioId: string, limite: number): Promise<AcessoRecente[]>;
}

import 'server-only';
import type {
  AcessoRecente,
  AuditoriaRepository,
} from '@/application/ports/auditoria-repository';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

export const auditoriaRepository: AuditoriaRepository = {
  async registrarAcesso(evento) {
    try {
      await sql`
        INSERT INTO acesso_ficha (usuario_id, prefixo, acao, ip, user_agent)
        VALUES (
          ${evento.usuarioId},
          ${evento.prefixo},
          ${evento.acao},
          ${evento.ip},
          ${evento.userAgent}
        )
      `;
    } catch (e) {
      throw new FalhaRepositorio('registrarAcesso', e);
    }
  },

  async listarRecentesDoUsuario(usuarioId, limite) {
    try {
      // GROUP BY prefixo + MAX(ocorreu_em) deduplica e mantém o último
      // acesso de cada posto. Índice `idx_acesso_usuario` cobre o WHERE.
      const linhas = await sql<{ prefixo: string; ocorreu_em: Date }[]>`
        SELECT prefixo, MAX(ocorreu_em) AS ocorreu_em
          FROM acesso_ficha
         WHERE usuario_id = ${usuarioId}
           AND acao = 'visualizou_ficha'
         GROUP BY prefixo
         ORDER BY ocorreu_em DESC
         LIMIT ${limite}
      `;
      const recentes: AcessoRecente[] = linhas.map((r) => ({
        prefixo: r.prefixo,
        ocorreuEm: r.ocorreu_em,
      }));
      return recentes;
    } catch (e) {
      throw new FalhaRepositorio('listarRecentesDoUsuario', e);
    }
  },
};

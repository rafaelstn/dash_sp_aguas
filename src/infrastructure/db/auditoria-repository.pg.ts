import 'server-only';
import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';
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
};

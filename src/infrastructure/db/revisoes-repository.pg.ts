import 'server-only';
import type { RevisoesRepository } from '@/application/ports/revisoes-repository';
import type {
  ParametrosNovaRevisao,
  RevisaoDesconformidade,
  StatusRevisao,
  TipoEntidadeRevisada,
} from '@/domain/revisao-desconformidade';
import type { CategoriaDesconformidade } from '@/domain/desconformidade';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaRevisao = {
  id: string;
  tipo_entidade: TipoEntidadeRevisada;
  id_entidade: string;
  categoria: CategoriaDesconformidade;
  status: StatusRevisao;
  nota: string | null;
  ip: string | null;
  usuario_id: string | null;
  revisado_em: Date | null;
  created_at: Date;
};

function mapear(linha: LinhaRevisao): RevisaoDesconformidade {
  return {
    id: linha.id,
    tipoEntidade: linha.tipo_entidade,
    idEntidade: linha.id_entidade,
    categoria: linha.categoria,
    status: linha.status,
    nota: linha.nota,
    ip: linha.ip,
    usuarioId: linha.usuario_id,
    revisadoEm: linha.revisado_em,
    createdAt: linha.created_at,
  };
}

export const revisoesRepository: RevisoesRepository = {
  async marcarRevisado(params: ParametrosNovaRevisao) {
    try {
      const linhas = await sql<LinhaRevisao[]>`
        INSERT INTO revisoes_desconformidade
          (tipo_entidade, id_entidade, categoria, status, nota, ip, usuario_id, revisado_em)
        VALUES
          (${params.tipoEntidade}, ${params.idEntidade}, ${params.categoria},
           'revisado', ${params.nota}, ${params.ip}, ${params.usuarioId}, NOW())
        ON CONFLICT (tipo_entidade, id_entidade, categoria)
        DO UPDATE SET
          status = 'revisado',
          nota = COALESCE(EXCLUDED.nota, revisoes_desconformidade.nota),
          ip = EXCLUDED.ip,
          usuario_id = EXCLUDED.usuario_id,
          revisado_em = NOW()
        RETURNING id, tipo_entidade, id_entidade, categoria, status,
                  nota, ip, usuario_id, revisado_em, created_at
      `;
      const linha = linhas[0];
      if (!linha) {
        throw new Error('UPSERT não retornou linha');
      }
      return mapear(linha);
    } catch (e) {
      throw new FalhaRepositorio('marcarRevisado', e);
    }
  },

  async reabrir(id: string) {
    try {
      await sql`
        UPDATE revisoes_desconformidade
           SET status = 'pendente',
               revisado_em = NULL
         WHERE id = ${id}
      `;
    } catch (e) {
      throw new FalhaRepositorio('reabrir', e);
    }
  },
};

import 'server-only';
import type {
  PostosFotosRepository,
  RegistroFotoPosto,
} from '@/application/ports/postos-fotos-repository';
import type { PostoFoto } from '@/domain/posto-foto';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaFoto = {
  id: string;
  prefixo: string;
  storage_path: string;
  tirada_em: Date;
  tirada_por: string | null;
  created_at: Date;
};

function mapear(linha: LinhaFoto): PostoFoto {
  return {
    id: linha.id,
    prefixo: linha.prefixo,
    storagePath: linha.storage_path,
    tiradaEm: linha.tirada_em,
    tiradaPor: linha.tirada_por,
    criadaEm: linha.created_at,
  };
}

export const postosFotosRepository: PostosFotosRepository = {
  async registrar(registro: RegistroFotoPosto) {
    try {
      const tiradaEm = registro.tiradaEm ?? new Date();
      const linhas = await sql<LinhaFoto[]>`
        INSERT INTO postos_fotos (prefixo, storage_path, tirada_em, tirada_por)
        VALUES (
          ${registro.prefixo},
          ${registro.storagePath},
          ${tiradaEm},
          ${registro.tiradaPor ? sql`${registro.tiradaPor}::uuid` : null}
        )
        RETURNING id, prefixo, storage_path, tirada_em, tirada_por, created_at
      `;
      const linha = linhas[0];
      if (!linha) throw new Error('INSERT não retornou linha');
      return mapear(linha);
    } catch (e) {
      throw new FalhaRepositorio('postosFotos.registrar', e);
    }
  },

  async capaAtual(prefixo: string) {
    try {
      const linhas = await sql<LinhaFoto[]>`
        SELECT id, prefixo, storage_path, tirada_em, tirada_por, created_at
          FROM postos_fotos
         WHERE prefixo = ${prefixo}
         ORDER BY tirada_em DESC
         LIMIT 1
      `;
      const linha = linhas[0];
      return linha ? mapear(linha) : null;
    } catch (e) {
      throw new FalhaRepositorio('postosFotos.capaAtual', e);
    }
  },

  async listarDoPosto(prefixo: string) {
    try {
      const linhas = await sql<LinhaFoto[]>`
        SELECT id, prefixo, storage_path, tirada_em, tirada_por, created_at
          FROM postos_fotos
         WHERE prefixo = ${prefixo}
         ORDER BY tirada_em DESC
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('postosFotos.listarDoPosto', e);
    }
  },
};

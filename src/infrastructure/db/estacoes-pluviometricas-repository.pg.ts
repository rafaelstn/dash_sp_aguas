import 'server-only';
import type { EstacoesPluviometricasRepository } from '@/application/ports/estacoes-pluviometricas-repository';
import type { EstacaoPluviometrica } from '@/domain/monitor/estacao-pluviometrica';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaEstacao = {
  id: string;
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: 'manual' | 'automatico';
  bacia: string | null;
  owner: string | null;
  posto_id: string | null;
  sibh_id: string | null;
  criado_em: Date;
};

function mapear(linha: LinhaEstacao): EstacaoPluviometrica {
  return {
    id: linha.id,
    prefixo: linha.prefixo,
    nome: linha.nome,
    lat: Number(linha.lat),
    lng: Number(linha.lng),
    tipo: linha.tipo,
    bacia: linha.bacia,
    owner: linha.owner,
    postoId: linha.posto_id,
    sibhId: linha.sibh_id,
    criadoEm: linha.criado_em,
  };
}

const COLUNAS = sql`id, prefixo, nome, lat, lng, tipo, bacia, owner, posto_id, sibh_id, criado_em`;

export const estacoesPluviometricasRepository: EstacoesPluviometricasRepository = {
  async listar(filtros) {
    const condBacia = filtros?.bacia
      ? sql`AND bacia = ${filtros.bacia}`
      : sql``;
    const condTipo = filtros?.tipo
      ? sql`AND tipo = ${filtros.tipo}`
      : sql``;
    const condOwner = filtros?.owner
      ? sql`AND owner = ${filtros.owner}`
      : sql``;
    try {
      const linhas = await sql<LinhaEstacao[]>`
        SELECT ${COLUNAS} FROM estacoes_pluviometricas
         WHERE true
         ${condBacia}
         ${condTipo}
         ${condOwner}
         ORDER BY nome
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('estacoesPluviometricas.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaEstacao[]>`
        SELECT ${COLUNAS} FROM estacoes_pluviometricas
         WHERE id = ${id}::uuid
         LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estacoesPluviometricas.obterPorId', e);
    }
  },

  async upsertPorPrefixo(estacao) {
    try {
      const linhas = await sql<LinhaEstacao[]>`
        INSERT INTO estacoes_pluviometricas
          (prefixo, nome, lat, lng, tipo, bacia, owner, posto_id, sibh_id)
        VALUES (
          ${estacao.prefixo},
          ${estacao.nome},
          ${estacao.lat},
          ${estacao.lng},
          ${estacao.tipo},
          ${estacao.bacia ?? null},
          ${estacao.owner ?? null},
          ${estacao.postoId ?? null}::uuid,
          ${estacao.sibhId ?? null}
        )
        ON CONFLICT (prefixo) WHERE prefixo IS NOT NULL DO UPDATE SET
          nome     = EXCLUDED.nome,
          lat      = EXCLUDED.lat,
          lng      = EXCLUDED.lng,
          tipo     = EXCLUDED.tipo,
          bacia    = EXCLUDED.bacia,
          owner    = EXCLUDED.owner,
          posto_id = EXCLUDED.posto_id,
          sibh_id  = EXCLUDED.sibh_id
        RETURNING ${COLUNAS}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estacoesPluviometricas.upsertPorPrefixo', e);
    }
  },
};

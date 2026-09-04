import 'server-only';
import type { EstacoesPluviometricasRepository } from '@/application/ports/estacoes-pluviometricas-repository';
import type { EstacaoPluviometrica } from '@/domain/monitor/estacao-pluviometrica';
import { normalizarTimestampSibh } from '@/domain/monitor/timestamp-sibh';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaEstacao = {
  id: string;
  prefixo: string | null;
  nome: string;
  lat: number;
  lng: number;
  tipo: 'manual' | 'automatico';
  tipo_estacao: 'pluviometrico' | 'fluviometrico' | 'piezometrico';
  bacia: string | null;
  owner: string | null;
  transmission_status: string | null;
  // timestamptz volta como Date (postgres-js); null quando ausente.
  ultima_transmissao: Date | null;
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
    tipoEstacao: linha.tipo_estacao,
    bacia: linha.bacia,
    owner: linha.owner,
    transmissionStatus: linha.transmission_status,
    // Date do banco -> ISO 8601 (contrato do dominio); null preserva null.
    ultimaTransmissao: linha.ultima_transmissao
      ? linha.ultima_transmissao.toISOString()
      : null,
    postoId: linha.posto_id,
    sibhId: linha.sibh_id,
    criadoEm: linha.criado_em,
  };
}

const COLUNAS = () => sql`id, prefixo, nome, lat, lng, tipo, tipo_estacao, bacia, owner, transmission_status, ultima_transmissao, posto_id, sibh_id, criado_em`;

export const estacoesPluviometricasRepository: EstacoesPluviometricasRepository = {
  async listar(filtros) {
    const condBacia = filtros?.bacia
      ? sql`AND bacia = ${filtros.bacia}`
      : sql``;
    const condTipo = filtros?.tipo
      ? sql`AND tipo = ${filtros.tipo}`
      : sql``;
    const condTipoEstacao = filtros?.tipoEstacao
      ? sql`AND tipo_estacao = ${filtros.tipoEstacao}`
      : sql``;
    const condOwner = filtros?.owner
      ? sql`AND owner = ${filtros.owner}`
      : sql``;
    try {
      const linhas = await sql<LinhaEstacao[]>`
        SELECT ${COLUNAS()} FROM estacoes_pluviometricas
         WHERE true
         ${condBacia}
         ${condTipo}
         ${condTipoEstacao}
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
        SELECT ${COLUNAS()} FROM estacoes_pluviometricas
         WHERE id = ${id}::uuid
         LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estacoesPluviometricas.obterPorId', e);
    }
  },

  async upsertPorSibhId(estacao) {
    try {
      // `ultima_transmissao` chega como string crua do SIBH (formato
      // Date#toString()), que o timestamptz NAO casta. Normaliza pra ISO 8601
      // UTC antes (null se ausente/invalido: nunca grava lixo). O ::timestamptz
      // e explicito porque o parametro pode ser null.
      const ultimaTransmissaoIso = normalizarTimestampSibh(estacao.ultimaTransmissao);
      const linhas = await sql<LinhaEstacao[]>`
        INSERT INTO estacoes_pluviometricas
          (prefixo, nome, lat, lng, tipo, tipo_estacao, bacia, owner, transmission_status, ultima_transmissao, posto_id, sibh_id)
        VALUES (
          ${estacao.prefixo},
          ${estacao.nome},
          ${estacao.lat},
          ${estacao.lng},
          ${estacao.tipo},
          ${estacao.tipoEstacao},
          ${estacao.bacia ?? null},
          ${estacao.owner ?? null},
          ${estacao.transmissionStatus ?? null},
          ${ultimaTransmissaoIso}::timestamptz,
          ${estacao.postoId ?? null}::uuid,
          ${estacao.sibhId}
        )
        ON CONFLICT (sibh_id) WHERE sibh_id IS NOT NULL DO UPDATE SET
          prefixo             = EXCLUDED.prefixo,
          nome                = EXCLUDED.nome,
          lat                 = EXCLUDED.lat,
          lng                 = EXCLUDED.lng,
          tipo                = EXCLUDED.tipo,
          tipo_estacao        = EXCLUDED.tipo_estacao,
          bacia               = EXCLUDED.bacia,
          owner               = EXCLUDED.owner,
          transmission_status = EXCLUDED.transmission_status,
          ultima_transmissao  = EXCLUDED.ultima_transmissao,
          posto_id            = EXCLUDED.posto_id
        RETURNING ${COLUNAS()}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estacoesPluviometricas.upsertPorSibhId', e);
    }
  },
};

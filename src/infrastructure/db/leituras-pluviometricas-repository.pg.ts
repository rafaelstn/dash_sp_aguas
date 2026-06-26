import 'server-only';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type { LeituraPluviometrica } from '@/domain/monitor/leitura-pluviometrica';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

type LinhaLeitura = {
  id: string;
  estacao_id: string;
  momento: Date;
  manual_mm: number;
  automatico_mm: number;
  criado_em: Date;
};

function mapear(linha: LinhaLeitura): LeituraPluviometrica {
  return {
    // id é BIGSERIAL: o driver entrega como string para não perder precisão.
    // A série pluviométrica não chega perto de 2^53, então Number é seguro.
    id: Number(linha.id),
    estacaoId: linha.estacao_id,
    momento: linha.momento,
    manualMm: Number(linha.manual_mm),
    automaticoMm: Number(linha.automatico_mm),
    criadoEm: linha.criado_em,
  };
}

export const leiturasPluviometricasRepository: LeiturasPluviometricasRepository = {
  async listarPorEstacaoEPeriodo(estacaoId, desde, ate) {
    try {
      const linhas = await sql<LinhaLeitura[]>`
        SELECT id, estacao_id, momento, manual_mm, automatico_mm, criado_em
          FROM leituras_pluviometricas
         WHERE estacao_id = ${estacaoId}::uuid
           AND momento >= ${desde}
           AND momento <= ${ate}
         ORDER BY momento ASC
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('leiturasPluviometricas.listarPorEstacaoEPeriodo', e);
    }
  },

  async upsertLote(leituras) {
    if (leituras.length === 0) return 0;
    try {
      const valores = leituras.map((l) => ({
        estacao_id: l.estacaoId,
        momento: l.momento,
        manual_mm: l.manualMm,
        automatico_mm: l.automaticoMm,
      }));
      // INSERT multi-linha parametrizado (helper do postgres.js infere as
      // colunas das chaves dos objetos). ON CONFLICT no índice único
      // (estacao_id, momento) torna o reprocessamento de lote idempotente: a
      // mesma janela pode ser reenviada sem duplicar a série.
      const linhas = await sql<{ id: string }[]>`
        INSERT INTO leituras_pluviometricas ${sql(valores)}
        ON CONFLICT (estacao_id, momento) DO UPDATE SET
          manual_mm     = EXCLUDED.manual_mm,
          automatico_mm = EXCLUDED.automatico_mm
        RETURNING id
      `;
      return linhas.length;
    } catch (e) {
      throw new FalhaRepositorio('leiturasPluviometricas.upsertLote', e);
    }
  },
};

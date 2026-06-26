import 'server-only';
import type { LeiturasPluviometricasRepository } from '@/application/ports/leituras-pluviometricas-repository';
import type { LeituraPluviometrica } from '@/domain/monitor/leitura-pluviometrica';

/**
 * Adapter in-memory de LeiturasPluviometricasRepository (MODO DEMO).
 * Chave de unicidade `estacaoId|momento` (ISO) espelha o UNIQUE da tabela,
 * pra reproduzir a idempotência do upsert. Perde dados ao reiniciar.
 */
const armazenamento = new Map<string, LeituraPluviometrica>();
let proximoId = 1;

function chave(estacaoId: string, momento: Date): string {
  return `${estacaoId}|${momento.toISOString()}`;
}

/** Reset de estado entre testes (segue o padrão `_resetTriagemMock`). */
export function _resetLeiturasPluviometricasMock(): void {
  armazenamento.clear();
  proximoId = 1;
}

export const leiturasPluviometricasRepository: LeiturasPluviometricasRepository = {
  async listarPorEstacaoEPeriodo(estacaoId, desde, ate) {
    return Array.from(armazenamento.values())
      .filter(
        (l) =>
          l.estacaoId === estacaoId &&
          l.momento.getTime() >= desde.getTime() &&
          l.momento.getTime() <= ate.getTime(),
      )
      .sort((a, b) => a.momento.getTime() - b.momento.getTime());
  },

  async upsertLote(leituras) {
    let afetadas = 0;
    for (const l of leituras) {
      const k = chave(l.estacaoId, l.momento);
      const existente = armazenamento.get(k);
      armazenamento.set(k, {
        id: existente?.id ?? proximoId++,
        estacaoId: l.estacaoId,
        momento: l.momento,
        manualMm: l.manualMm,
        automaticoMm: l.automaticoMm,
        criadoEm: existente?.criadoEm ?? new Date(),
      });
      afetadas += 1;
    }
    return afetadas;
  },
};

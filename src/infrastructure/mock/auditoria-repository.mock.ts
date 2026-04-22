import 'server-only';

import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';
import type { AcessoFicha } from '@/domain/acesso-ficha';

/**
 * Adapter in-memory de AuditoriaRepository (MODO DEMO).
 *
 * Mantemos uma trilha local em memória só para comprovar visualmente que o
 * pipeline LGPD está acoplado (obter-ficha exige esse append). O array é
 * exposto via `trilhaAuditoriaDemo()` para facilitar debug em dev.
 */

interface EventoTrilha extends AcessoFicha {
  registradoEm: Date;
}

const trilha: EventoTrilha[] = [];

export const auditoriaRepository: AuditoriaRepository = {
  async registrarAcesso(evento) {
    trilha.push({ ...evento, registradoEm: new Date() });
    // Mantém apenas os últimos 500 eventos para não inflar memória em sessão longa.
    if (trilha.length > 500) {
      trilha.splice(0, trilha.length - 500);
    }
  },
};

export function trilhaAuditoriaDemo(): readonly EventoTrilha[] {
  return trilha;
}

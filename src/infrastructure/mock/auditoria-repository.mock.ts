import 'server-only';

import type {
  AcessoRecente,
  AuditoriaRepository,
} from '@/application/ports/auditoria-repository';
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

  async listarRecentesDoUsuario(usuarioId, limite) {
    // Filtra do final pro começo (mais recente primeiro) e deduplica por prefixo.
    const visto = new Set<string>();
    const recentes: AcessoRecente[] = [];
    for (let i = trilha.length - 1; i >= 0 && recentes.length < limite; i -= 1) {
      const ev = trilha[i];
      if (!ev) continue;
      if (ev.usuarioId !== usuarioId) continue;
      if (ev.acao !== 'visualizou_ficha') continue;
      if (visto.has(ev.prefixo)) continue;
      visto.add(ev.prefixo);
      recentes.push({ prefixo: ev.prefixo, ocorreuEm: ev.registradoEm });
    }
    return recentes;
  },
};

export function trilhaAuditoriaDemo(): readonly EventoTrilha[] {
  return trilha;
}

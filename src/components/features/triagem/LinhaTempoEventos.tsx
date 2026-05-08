import type {
  EventoTriagem,
  TipoEventoTriagem,
} from '@/domain/triagem-evento';
import { formatarDataHora } from '@/lib/format';

const ROTULO_EVENTO: Record<TipoEventoTriagem, string> = {
  submetida: 'Ficha submetida pelo técnico',
  reenvio_apos_devolucao: 'Re-enviada após devolução',
  revisao_iniciada: 'Revisão iniciada',
  revisao_liberada: 'Revisão liberada manualmente',
  lock_expirado: 'Lock de revisão expirado (TTL)',
  aprovada: 'Ficha aprovada',
  rejeitada: 'Ficha rejeitada',
  devolvida: 'Ficha devolvida ao técnico',
};

const COR_EVENTO: Record<TipoEventoTriagem, string> = {
  submetida: 'bg-blue-500',
  reenvio_apos_devolucao: 'bg-blue-500',
  revisao_iniciada: 'bg-amber-500',
  revisao_liberada: 'bg-app-fg-muted',
  lock_expirado: 'bg-app-fg-muted',
  aprovada: 'bg-green-600',
  rejeitada: 'bg-red-600',
  devolvida: 'bg-orange-500',
};

export interface LinhaTempoEventosProps {
  eventos: ReadonlyArray<EventoTriagem>;
}

export function LinhaTempoEventos({ eventos }: LinhaTempoEventosProps) {
  if (eventos.length === 0) {
    return (
      <p className="text-xs text-app-fg-muted">
        Nenhum evento registrado para esta ficha.
      </p>
    );
  }

  // Ordem cronológica crescente — mais antigos primeiro.
  const ordenados = [...eventos].sort(
    (a, b) => a.ocorreuEm.getTime() - b.ocorreuEm.getTime(),
  );

  return (
    <ol
      className="relative ml-2 space-y-3 border-l border-app-border-subtle pl-4"
      aria-label="Linha do tempo de eventos da triagem"
    >
      {ordenados.map((e) => (
        <li key={e.id} className="relative">
          <span
            aria-hidden="true"
            className={[
              'absolute -left-[1.30rem] top-1 h-2.5 w-2.5 rounded-full ring-2 ring-app-surface',
              COR_EVENTO[e.evento],
            ].join(' ')}
          />
          <p className="text-sm font-medium text-app-fg">
            {ROTULO_EVENTO[e.evento]}
          </p>
          <p className="mt-0.5 text-2xs text-app-fg-muted tabular">
            {formatarDataHora(e.ocorreuEm)}
            {e.atorId ? (
              <span className="mono"> · ator {e.atorId.slice(0, 8)}</span>
            ) : null}
          </p>
          {e.motivo ? (
            <p className="mt-1 whitespace-pre-wrap rounded border border-app-border-subtle bg-app-surface-2 p-2 text-xs text-app-fg">
              {e.motivo}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

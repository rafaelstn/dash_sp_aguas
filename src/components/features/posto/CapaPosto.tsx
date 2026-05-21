import { obterCapaPosto } from '@/application/use-cases/foto-posto';
import { postosFotosRepository } from '@/infrastructure/repositories';

/**
 * Foto de capa do posto no detalhe do dashboard (abaixo do mapa). A foto é
 * registrada pelo agente em campo via app. Server Component: busca a capa
 * (signed URL) direto pelo use case. Se o Storage estiver indisponível,
 * degrada para placeholder sem quebrar a página.
 */
export async function CapaPosto({ prefixo }: { prefixo: string }) {
  let capa;
  try {
    capa = await obterCapaPosto(postosFotosRepository, prefixo);
  } catch {
    return null;
  }

  return (
    <figure className="mt-4 rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
      <figcaption className="mb-2 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
        Foto do posto
      </figcaption>
      {capa.url ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capa.url}
            alt={`Foto de capa do posto ${prefixo}`}
            className="w-full rounded border border-app-border object-cover"
          />
          <p className="mt-2 text-xs text-app-fg-muted">
            Registrada em{' '}
            {capa.tiradaEm?.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
            {capa.precisaAtualizar ? (
              <span className="ml-1 text-amber-700">· desatualizada (mais de 1 ano)</span>
            ) : null}
          </p>
        </>
      ) : (
        <p className="text-xs text-app-fg-subtle">
          Sem foto registrada. O agente pode capturar uma no app, ao visitar o posto.
        </p>
      )}
    </figure>
  );
}

import { listarFotosPosto } from '@/application/use-cases/foto-posto';
import {
  fotoStorageGateway,
  postosFotosRepository,
} from '@/infrastructure/repositories';

/**
 * Registro fotográfico do posto ao longo dos anos (abaixo do mapa, no painel
 * do posto). A ideia é uma foto por ano: o agente registra no app e aqui o
 * gestor acompanha a evolução. A vigente (mais recente) fica em destaque e as
 * anteriores em uma faixa de histórico. Server Component: busca direto pelo
 * use case (signed URLs); degrada sem quebrar se o Storage estiver fora.
 */
export async function HistoricoFotosPosto({ prefixo }: { prefixo: string }) {
  let fotos;
  try {
    fotos = await listarFotosPosto(
      postosFotosRepository,
      fotoStorageGateway,
      prefixo,
    );
  } catch {
    return null;
  }

  const formatarData = (d: Date) =>
    d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <section className="mt-4 rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
      <h3 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
        Registro fotográfico do posto
      </h3>

      {fotos.length === 0 ? (
        <p className="text-xs text-app-fg-subtle">
          Sem fotos registradas. O agente captura uma no app ao visitar o posto.
        </p>
      ) : (
        <FotosGaleria fotos={fotos} formatarData={formatarData} />
      )}
    </section>
  );
}

function FotosGaleria({
  fotos,
  formatarData,
}: {
  fotos: Awaited<ReturnType<typeof listarFotosPosto>>;
  formatarData: (d: Date) => string;
}) {
  const vigente = fotos[0];
  if (!vigente) return null;
  const anteriores = fotos.slice(1);

  return (
    <div className="space-y-3">
      <figure>
        {vigente.url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={vigente.url}
            alt={`Foto vigente do posto, registrada em ${formatarData(vigente.tiradaEm)}`}
            className="w-full rounded border border-app-border object-cover"
          />
        ) : (
          <div className="flex h-40 items-center justify-center rounded border border-app-border bg-app-surface-2 text-xs text-app-fg-subtle">
            Imagem indisponível
          </div>
        )}
        <figcaption className="mt-1 text-xs text-app-fg-muted">
          <span className="font-medium text-app-fg">Vigente</span> · {formatarData(vigente.tiradaEm)}
          {vigente.idadeDias !== null && vigente.idadeDias > 365 ? (
            <span className="ml-1 text-amber-700">(há mais de 1 ano)</span>
          ) : null}
        </figcaption>
      </figure>

      {anteriores.length > 0 ? (
        <div>
          <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle">
            Histórico ({anteriores.length})
          </p>
          <ul className="grid grid-cols-3 gap-2">
            {anteriores.map((f) => (
              <li key={f.id}>
                {f.url ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={f.url}
                    alt={`Foto do posto registrada em ${formatarData(f.tiradaEm)}`}
                    className="aspect-square w-full rounded border border-app-border object-cover"
                  />
                ) : (
                  <div className="aspect-square rounded border border-app-border bg-app-surface-2" />
                )}
                <span className="mt-0.5 block text-center text-2xs text-app-fg-muted">
                  {formatarData(f.tiradaEm)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

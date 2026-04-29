import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fichasVisitaRepository } from '@/infrastructure/repositories';
import { obterFichaVisita } from '@/application/use-cases/fichas-visita';
import { obterSchema } from '@/domain/fichas/schemas';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';
import { FormularioFicha } from '@/components/features/fichas/FormularioFicha';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ prefixo: string; id: string }>;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditarFichaPage({ params }: PageProps) {
  const { prefixo: prefixoRaw, id } = await params;
  let prefixo: string;
  try {
    prefixo = decodeURIComponent(prefixoRaw);
  } catch {
    notFound();
  }
  if (!UUID_REGEX.test(id)) notFound();

  let ficha: Awaited<ReturnType<typeof obterFichaVisita>>;
  try {
    ficha = await obterFichaVisita(fichasVisitaRepository, id);
  } catch (e) {
    console.error('[fichas/editar] Falha', { id, prefixo, e });
    throw e;
  }
  if (!ficha || ficha.prefixo !== prefixo) notFound();

  const schema = obterSchema(ficha.codTipoDocumento);
  const tipo = TIPOS_DOCUMENTO[ficha.codTipoDocumento];

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-xs text-app-fg-muted">
        <Link href="/" className="hover:text-gov-azul hover:underline">
          Buscar postos
        </Link>
        <span className="mx-1.5 text-app-fg-subtle">/</span>
        <Link
          href={`/postos/${encodeURIComponent(prefixo)}`}
          className="mono font-semibold text-app-fg hover:text-gov-azul hover:underline"
        >
          {prefixo}
        </Link>
        <span className="mx-1.5 text-app-fg-subtle">/</span>
        <Link
          href={`/postos/${encodeURIComponent(prefixo)}/fichas/${id}`}
          className="hover:text-gov-azul hover:underline"
        >
          {tipo?.rotulo ?? 'Ficha'}
        </Link>
        <span className="mx-1.5 text-app-fg-subtle">/</span>
        <span className="text-app-fg">Editar</span>
      </nav>

      <header className="border-b border-app-border-subtle pb-2">
        <h1 className="text-xl font-semibold text-app-fg">
          Editar ficha de {schema.rotulo}
        </h1>
      </header>

      <FormularioFicha
        prefixo={prefixo}
        schema={schema}
        fichaExistente={ficha}
      />
    </div>
  );
}

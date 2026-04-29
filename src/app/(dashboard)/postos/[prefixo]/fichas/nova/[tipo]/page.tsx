import { notFound } from 'next/navigation';
import Link from 'next/link';
import { FormularioFicha } from '@/components/features/fichas/FormularioFicha';
import { obterSchema } from '@/domain/fichas/schemas';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ prefixo: string; tipo: string }>;
}

export default async function NovaFichaPage({ params }: PageProps) {
  const { prefixo: prefixoRaw, tipo: tipoRaw } = await params;
  const prefixo = decodeURIComponent(prefixoRaw);
  const codigo = Number(tipoRaw);

  if (!Number.isInteger(codigo) || codigo < 1 || codigo > 7) notFound();
  const schema = obterSchema(codigo as CodigoTipoDocumento);
  if (!schema.disponivel) notFound();

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
        <span className="text-app-fg">Nova ficha — {schema.rotulo}</span>
      </nav>

      <header className="border-b border-app-border-subtle pb-2">
        <h1 className="text-xl font-semibold text-app-fg">
          Nova ficha de {schema.rotulo}
        </h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Posto <span className="mono font-medium text-app-fg">{prefixo}</span>
          . Os campos marcados com * são obrigatórios. Esta entrada simula
          o que o app de campo enviará no futuro.
        </p>
      </header>

      <FormularioFicha prefixo={prefixo} schema={schema} />
    </div>
  );
}

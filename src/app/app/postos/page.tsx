import { Suspense } from 'react';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { BuscaPostosMobile } from './BuscaPostosMobile';

/**
 * Busca de posto — US-MOB-003.
 *
 * Recebe `?tipo=<codigo>` da home; ao selecionar um posto, navega pra
 * `/app/postos/[prefixo]/fichas/nova/[tipo]`.
 *
 * Não reimplementa busca: consome /api/postos/search (já existente).
 *
 * Server Component como shell; o componente cliente faz debounce + fetch.
 */
export default async function PostosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { tipo } = await searchParams;
  const tipoNumero = tipo ? Number(tipo) : null;
  const tipoValido =
    tipoNumero !== null &&
    Number.isInteger(tipoNumero) &&
    tipoNumero >= 1 &&
    tipoNumero <= 7;

  return (
    <>
      <HeaderMobile
        titulo="Buscar posto"
        subtitulo={tipoValido ? `Tipo ${tipoNumero}` : undefined}
        voltarHref="/app"
      />
      <div className="mx-auto w-full max-w-content px-4 py-4">
        <Suspense fallback={<p className="text-sm text-app-fg-muted">Carregando…</p>}>
          <BuscaPostosMobile tipo={tipoValido ? tipoNumero : null} />
        </Suspense>
      </div>
    </>
  );
}

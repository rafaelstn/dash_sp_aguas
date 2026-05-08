import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import {
  rotuloTipoDocumento,
  type CodigoTipoDocumento,
} from '@/domain/tipo-documento';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { BuscaPostosMobile } from './BuscaPostosMobile';

/**
 * Busca de posto — US-MOB-003.
 *
 * Recebe `?tipo=<codigo>` da home; ao selecionar um posto, navega para
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

  const subtitulo = tipoValido
    ? `Ficha selecionada: ${rotuloTipoDocumento(tipoNumero as CodigoTipoDocumento)}`
    : undefined;

  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/app/login');
  }

  return (
    <>
      <HeaderMobile
        titulo="Selecionar posto"
        subtitulo={subtitulo}
        voltarHref="/app"
      />
      <div className="mx-auto w-full max-w-content px-4 py-4">
        <Suspense
          fallback={
            <p className="text-sm text-app-fg-muted">Carregando consulta…</p>
          }
        >
          <BuscaPostosMobile
            tipo={tipoValido ? tipoNumero : null}
            usuarioId={usuario.id}
          />
        </Suspense>
      </div>
    </>
  );
}

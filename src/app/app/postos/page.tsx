import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import {
  rotuloTipoDocumento,
  type CodigoTipoDocumento,
} from '@/domain/tipo-documento';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  favoritosRepository,
  auditoriaRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { listarFavoritos } from '@/application/use-cases/listar-favoritos';
import { listarPostosRecentes } from '@/application/use-cases/listar-postos-recentes';
import {
  BuscaPostosMobile,
  type PostoLista,
} from './BuscaPostosMobile';

/**
 * Reduz o objeto Posto (37+ campos) ao mínimo que o card mobile precisa.
 * Mantém a fronteira server/client enxuta: só serializa o necessário.
 */
function paraItemLista(posto: {
  prefixo: string;
  nomeEstacao: string | null;
  municipio: string | null;
}): PostoLista {
  return {
    prefixo: posto.prefixo,
    nomeEstacao: posto.nomeEstacao,
    municipio: posto.municipio,
  };
}

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
    redirect('/login?returnTo=/app/postos');
  }

  // Favoritos e recentes alimentam as abas. Degrada para vazio se o repo
  // falhar: a aba Buscar continua funcional e a tela não quebra.
  let favoritos: PostoLista[] = [];
  let recentes: PostoLista[] = [];
  try {
    const itens = await listarFavoritos(
      favoritosRepository,
      postosRepository,
      usuario.id,
    );
    favoritos = itens.map((i) => paraItemLista(i.posto));
  } catch (erro) {
    console.error('[postos] Falha ao listar favoritos do usuário', erro);
  }
  try {
    const itens = await listarPostosRecentes(
      auditoriaRepository,
      postosRepository,
      usuario.id,
    );
    recentes = itens.map((i) => paraItemLista(i.posto));
  } catch (erro) {
    console.error('[postos] Falha ao listar postos recentes do usuário', erro);
  }

  return (
    <>
      <HeaderMobile
        titulo="Selecionar posto"
        subtitulo={subtitulo}
        voltarHref="/app"
      />
      <div className="px-safe mx-auto w-full max-w-content py-4">
        <Suspense
          fallback={
            <p className="text-sm text-app-fg-muted">Carregando consulta…</p>
          }
        >
          <BuscaPostosMobile
            tipo={tipoValido ? tipoNumero : null}
            usuarioId={usuario.id}
            favoritos={favoritos}
            recentes={recentes}
          />
        </Suspense>
      </div>
    </>
  );
}

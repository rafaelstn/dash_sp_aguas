import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { FichaPosto } from '@/components/features/ficha/FichaPosto';
import { ListaArquivos } from '@/components/features/arquivos/ListaArquivos';
import { HistoricoFichas } from '@/components/features/fichas/HistoricoFichas';
import { MapaPosto } from '@/components/features/posto/MapaPosto';
import { Alerta } from '@/components/ui/Alerta';
import { Skeleton } from '@/components/ui/Skeleton';
import { BadgeIndexacao } from '@/components/features/posto/BadgeIndexacao';
import { StatusIndexacaoArquivos } from '@/components/features/arquivos/StatusIndexacaoArquivos';
import { obterFicha } from '@/application/use-cases/obter-ficha';
import { listarArquivosAgrupados } from '@/application/use-cases/listar-arquivos-agrupados';
import {
  postosRepository,
  arquivosRepository,
  auditoriaRepository,
  fichasVisitaRepository,
} from '@/infrastructure/repositories';
import { listarFichasDoPosto } from '@/application/use-cases/fichas-visita';
import { IndexacaoPendente, PostoNaoEncontrado } from '@/domain/errors';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { favoritosRepository } from '@/infrastructure/repositories';
import { BotaoFavoritar } from '@/components/features/favoritos/BotaoFavoritar';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ prefixo: string }>;
}

/**
 * Histórico de visitas — fichas digitais (vindas do app de campo ou do
 * formulário web). Aparece logo abaixo da Ficha do posto. Carrega rápido
 * (1 query no Postgres com índice (prefixo, data_visita DESC)).
 */
async function BlocoFichas({ prefixo }: { prefixo: string }) {
  try {
    const fichas = await listarFichasDoPosto(fichasVisitaRepository, prefixo);
    return <HistoricoFichas prefixo={prefixo} fichas={fichas} />;
  } catch (e) {
    console.error('[posto.page] Falha ao listar fichas digitais', {
      prefixo,
      erro: e,
    });
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar histórico de visitas">
        Tente recarregar a página em instantes.
      </Alerta>
    );
  }
}

/**
 * Acervo histórico do posto — PDFs antigos do HD de rede agrupados por
 * tipo de documento. Renderiza header com título + contagem + ações
 * (Exportar) JUNTOS pra evitar texto solto na UI. O `prefixoJaIndexado`
 * decide se mostra abas ou alerta de varredura pendente.
 */
async function BlocoArquivos({
  prefixo,
  posto,
}: {
  prefixo: string;
  posto: Awaited<ReturnType<typeof obterFicha>>;
}) {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent');
  const usuario = await obterUsuarioAtual();

  try {
    const { grupos, total, prefixoJaIndexado } = await listarArquivosAgrupados(
      arquivosRepository,
      auditoriaRepository,
      { prefixo, ip, userAgent, usuarioId: usuario?.id ?? null },
    );
    return (
      <>
        <CabecalhoAcervo
          prefixo={prefixo}
          total={total}
          numeroGrupos={grupos.length}
          prefixoJaIndexado={prefixoJaIndexado}
          posto={posto}
        />
        <ListaArquivos
          grupos={grupos}
          total={total}
          prefixoJaIndexado={prefixoJaIndexado}
        />
      </>
    );
  } catch (e) {
    // Backend respondeu 202 Accepted — varredura assíncrona.
    // Frontend faz polling via GET /api/jobs/{id}.
    if (e instanceof IndexacaoPendente) {
      return (
        <>
          <CabecalhoAcervo
            prefixo={prefixo}
            total={null}
            numeroGrupos={null}
            prefixoJaIndexado={false}
            posto={posto}
          />
          <StatusIndexacaoArquivos prefixo={prefixo} jobId={e.jobId} />
        </>
      );
    }
    return (
      <Alerta tipo="erro" titulo="Falha ao listar arquivos">
        Não foi possível carregar os arquivos indexados. Tente novamente em instantes.
      </Alerta>
    );
  }
}

function CabecalhoAcervo({
  prefixo,
  total,
  numeroGrupos,
  prefixoJaIndexado,
  posto,
}: {
  prefixo: string;
  total: number | null;
  numeroGrupos: number | null;
  prefixoJaIndexado: boolean;
  posto: Awaited<ReturnType<typeof obterFicha>>;
}) {
  return (
    <header className="space-y-2 border-b border-app-border-subtle pb-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2
            id="sec-arquivos"
            className="text-base font-semibold text-app-fg"
          >
            Acervo histórico do posto
          </h2>
          <p className="mt-0.5 text-xs text-app-fg-muted tabular">
            {total !== null && numeroGrupos !== null ? (
              <>
                <span className="font-medium text-app-fg">
                  {total.toLocaleString('pt-BR')}
                </span>{' '}
                {total === 1 ? 'arquivo' : 'arquivos'} em {numeroGrupos}{' '}
                {numeroGrupos === 1 ? 'grupo' : 'grupos'}
                {' · '}
              </>
            ) : null}
            PDFs e planilhas escaneadas do HD de rede, agrupados pelos tipos
            oficiais de documento.
          </p>
        </div>
        {/* Botão "Exportar relatório" oculto até a rota
            /api/postos/[prefixo]/relatorio existir. Sem ela, clique gera
            404 opaco. Reativar quando a feature for implementada. */}
      </div>

      {/* Linha do badge separada — ocupa toda a largura do card. */}
      <BadgeIndexacao
        prefixo={prefixo}
        indexadoEm={posto.indexadoEm ?? null}
        expiraEm={posto.indexExpiraEm ?? null}
        status={posto.statusIndexacao ?? 'ausente'}
      />

      {/* Suprime warning de variável não usada quando indexação está pendente. */}
      <span className="hidden">{prefixoJaIndexado ? 'ok' : 'pendente'}</span>
    </header>
  );
}

export default async function PaginaPosto({ params }: PageProps) {
  const { prefixo: prefixoRaw } = await params;
  // URL com `%` solto (ex: /postos/1D%) lança URIError — captura aqui
  // pra cair em notFound em vez de Application error.
  let prefixo: string;
  try {
    prefixo = decodeURIComponent(prefixoRaw);
  } catch {
    notFound();
  }

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent');
  const usuario = await obterUsuarioAtual();

  try {
    const posto = await obterFicha(postosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: usuario?.id ?? null,
    });

    let favoritadoInicial = false;
    if (usuario) {
      try {
        const set = await favoritosRepository.prefixosFavoritos(usuario.id);
        favoritadoInicial = set.has(posto.prefixo);
      } catch {
        /* ignora — botão inicia como não-favoritado */
      }
    }

    return (
      <div className="space-y-8">
        <nav aria-label="Breadcrumb" className="text-xs text-app-fg-muted">
          <Link href="/" className="hover:text-gov-azul hover:underline">
            Buscar postos
          </Link>
          <span className="mx-1.5 text-app-fg-subtle">/</span>
          <span className="mono font-semibold text-app-fg">{posto.prefixo}</span>
        </nav>

        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-app-border-subtle pb-3">
          <div>
            <p className="text-2xs uppercase tracking-wider text-app-fg-subtle">
              Prefixo
            </p>
            <div className="flex items-baseline gap-3">
              <h1 className="mono text-2xl font-bold text-gov-azul">
                {posto.prefixo}
              </h1>
              {posto.nomeEstacao ? (
                <span className="text-lg font-medium text-app-fg">
                  {posto.nomeEstacao}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-app-fg-muted">
              {[posto.municipio, posto.ugrhiNome, posto.tipoPosto]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <BotaoFavoritar
            prefixo={posto.prefixo}
            favoritadoInicial={favoritadoInicial}
            autenticado={Boolean(usuario)}
          />
        </header>

        {/* Grid: ficha ocupa 2/3, mapa fica na direita em desktop */}
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <FichaPosto posto={posto} />
          </div>
          <aside
            aria-label="Localização geográfica"
            className="lg:self-start"
          >
            <MapaPosto
              latitude={posto.latitude}
              longitude={posto.longitude}
              nomeEstacao={posto.nomeEstacao}
              prefixo={posto.prefixo}
            />
          </aside>
        </div>

        {/* Fichas digitais — histórico de visitas estruturadas, vindas do
            app de campo (futuro) ou formulário web. Aparecem ANTES dos
            arquivos do HD por serem o fluxo principal daqui pra frente. */}
        <section
          aria-label="Histórico de visitas"
          className="space-y-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                aria-label="Carregando histórico de visitas"
                className="space-y-2"
              >
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-5/6" />
              </div>
            }
          >
            <BlocoFichas prefixo={posto.prefixo} />
          </Suspense>
        </section>

        {/* Acervo histórico — PDFs antigos do HD de rede agrupados por tipo
            de documento. Cabeçalho (título + contagem + Exportar + Badge)
            é renderizado dentro do BlocoArquivos pra unificar tudo numa
            seção visualmente coesa. */}
        <section
          aria-labelledby="sec-arquivos"
          className="space-y-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <Suspense
            fallback={
              <div
                role="status"
                aria-live="polite"
                aria-label="Carregando acervo do posto"
                className="space-y-2"
              >
                <Skeleton className="h-6 w-2/3" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-5/6" />
              </div>
            }
          >
            <BlocoArquivos prefixo={posto.prefixo} posto={posto} />
          </Suspense>
        </section>
      </div>
    );
  } catch (e) {
    if (e instanceof PostoNaoEncontrado) {
      notFound();
    }
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar ficha do posto">
        Não foi possível carregar os dados. Tente novamente em instantes.
      </Alerta>
    );
  }
}

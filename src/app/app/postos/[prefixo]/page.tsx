import Link from 'next/link';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { CardTipoFicha } from '@/components/mobile/CardTipoFicha';
import { postosRepository } from '@/infrastructure/repositories';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';

/**
 * Detalhes do posto + grade de tipos de ficha (US-MOB-003 + US-MOB-004).
 *
 * Carrega o posto pelo prefixo (caminho oficial) e exibe um cabeçalho
 * compacto com identificação, município e classe operacional. Em seguida,
 * a grade de tipos de ficha disponíveis — toque navega pra
 * `/app/postos/[prefixo]/fichas/nova/[tipo]`.
 *
 * Hoje **todos** os tipos do schema ativo são exibidos. A regra de
 * negócio "tipo X só pra classe Y" entra na Fase 2.B (decisão Camila).
 *
 * Server Component — sem cache. O endpoint /api/postos/[prefixo] usa
 * lazy indexing (8s budget); aqui não chamamos o indexador, só o
 * repositório de cadastro pra evitar bloqueio em UX mobile.
 */

export const dynamic = 'force-dynamic';

export default async function DetalhePostoPage({
  params,
}: {
  params: Promise<{ prefixo: string }>;
}) {
  const { prefixo: prefixoRaw } = await params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const posto = await postosRepository.buscarPorPrefixo(prefixo);

  if (!posto) {
    return (
      <>
        <HeaderMobile titulo="Posto não encontrado" voltarHref="/app/postos" />
        <div className="mx-auto w-full max-w-content px-4 py-4">
          <div
            role="alert"
            className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            Não foi possível localizar o posto com prefixo{' '}
            <code className="font-mono">{prefixo}</code>. Verifique o valor ou
            contate o gestor — o cadastro de postos não é realizado pelo
            aplicativo.
          </div>
          <Link
            href="/app/postos"
            className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded border border-app-border px-3 text-sm font-medium text-app-fg hover:bg-app-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
          >
            Voltar à busca
          </Link>
        </div>
      </>
    );
  }

  const linhasIdentificacao: Array<{ rotulo: string; valor: string | null }> = [
    { rotulo: 'Município', valor: posto.municipio ?? null },
    { rotulo: 'Bacia hidrográfica', valor: posto.baciaHidrografica ?? null },
    { rotulo: 'UGRHI', valor: posto.ugrhiNome ?? null },
    { rotulo: 'Tipo', valor: posto.tipoPosto ?? null },
    { rotulo: 'Mantenedor', valor: posto.mantenedor ?? null },
  ];

  return (
    <>
      <HeaderMobile
        titulo={posto.nomeEstacao ?? posto.prefixo}
        subtitulo={`Posto ${posto.prefixo}`}
        voltarHref="/app/postos"
      />
      <div className="mx-auto w-full max-w-content px-4 py-5 pb-24 space-y-4">
        <section
          aria-labelledby="ident-titulo"
          className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
        >
          <h2
            id="ident-titulo"
            className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted"
          >
            Identificação
          </h2>
          <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {linhasIdentificacao
              .filter((l) => l.valor && l.valor.trim().length > 0)
              .map((l) => (
                <div key={l.rotulo} className="flex flex-col">
                  <dt className="text-2xs uppercase text-app-fg-muted">
                    {l.rotulo}
                  </dt>
                  <dd className="text-sm text-app-fg">{l.valor}</dd>
                </div>
              ))}
          </dl>
        </section>

        <section aria-labelledby="tipos-titulo" className="space-y-2">
          <h2
            id="tipos-titulo"
            className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted"
          >
            Tipos de ficha disponíveis para este posto
          </h2>
          <ul
            className="grid grid-cols-2 gap-3 md:grid-cols-3"
            aria-label="Tipos de ficha disponíveis"
          >
            {CODIGOS_TIPO_DOCUMENTO.map((codigo) => {
              const schema = SCHEMAS_FICHA[codigo];
              return (
                <li key={codigo}>
                  <CardTipoFicha
                    codigo={codigo}
                    rotulo={schema.rotulo}
                    href={`/app/postos/${encodeURIComponent(posto.prefixo)}/fichas/nova/${codigo}`}
                    disponivel={schema.disponivel}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </>
  );
}

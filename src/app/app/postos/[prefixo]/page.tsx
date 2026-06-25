import Link from 'next/link';
import { headers } from 'next/headers';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { CardTipoFicha } from '@/components/mobile/CardTipoFicha';
import { FotoCapaPosto } from '@/components/mobile/FotoCapaPosto';
import {
  postosRepository,
  auditoriaRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { SCHEMAS_FICHA } from '@/domain/fichas/schemas';
import { CODIGOS_TIPO_DOCUMENTO } from '@/domain/tipo-documento';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import { logger } from '@/infrastructure/logging/logger';

/**
 * Registra o acesso ao detalhe ('visualizou_ficha') para alimentar a aba
 * Recentes. Best-effort: nunca bloqueia nem quebra o render. Erro de auditoria
 * é logado e engolido, pois aqui a trilha é UX (acesso rápido), não a trilha
 * LGPD obrigatória do use case obter-ficha.
 */
async function registrarAcessoRecente(prefixo: string): Promise<void> {
  try {
    const h = await headers();
    const ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      h.get('x-real-ip') ??
      null;
    const userAgent = h.get('user-agent');
    const usuario = await obterUsuarioAtual();
    await auditoriaRepository.registrarAcesso({
      prefixo,
      acao: 'visualizou_ficha',
      ip,
      userAgent,
      usuarioId: usuario?.id ?? null,
    });
  } catch (erro) {
    logger.warn(
      'posto.acesso-recente.falha',
      { prefixo, motivo: erro instanceof Error ? erro.message : String(erro) },
      'Falha ao registrar acesso recente',
    );
  }
}

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
  searchParams,
}: {
  params: Promise<{ prefixo: string }>;
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { prefixo: prefixoRaw } = await params;
  const { tipo: tipoRaw } = await searchParams;
  const prefixo = decodeURIComponent(prefixoRaw);

  const tipoNumero = Number(tipoRaw);
  const tipoSelecionado: CodigoTipoDocumento | null =
    Number.isInteger(tipoNumero) &&
    (CODIGOS_TIPO_DOCUMENTO as readonly number[]).includes(tipoNumero)
      ? (tipoNumero as CodigoTipoDocumento)
      : null;

  const posto = await postosRepository.buscarPorPrefixo(prefixo);

  if (!posto) {
    return (
      <>
        <HeaderMobile titulo="Posto não encontrado" voltarHref="/app/postos" />
        <div className="px-safe mx-auto w-full max-w-content py-4">
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

  // Best-effort: alimenta a aba Recentes. Aguardamos a escrita pra garantir a
  // persistência (fire-and-forget em server component pode ser cortado no fim
  // do request); falhas são engolidas dentro da função, não bloqueiam o render.
  await registrarAcessoRecente(posto.prefixo);

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
      <div className="px-safe pb-safe-nav mx-auto w-full max-w-content space-y-4 py-5">
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

        <FotoCapaPosto prefixo={posto.prefixo} />

        {tipoSelecionado ? (
          <Link
            href={`/app/postos/${encodeURIComponent(posto.prefixo)}/fichas/nova/${tipoSelecionado}`}
            className="flex min-h-[48px] items-center justify-center gap-2 rounded bg-gov-azul px-4 text-sm font-semibold text-white shadow-gov-card transition-[background-color,transform] duration-150 hover:bg-gov-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2 active:scale-[0.99]"
          >
            Preencher ficha de {SCHEMAS_FICHA[tipoSelecionado].rotulo}
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        ) : null}

        <section aria-labelledby="tipos-titulo" className="space-y-2">
          <h2
            id="tipos-titulo"
            className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted"
          >
            {tipoSelecionado
              ? 'Ou escolha outro tipo de ficha'
              : 'Tipos de ficha disponíveis para este posto'}
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

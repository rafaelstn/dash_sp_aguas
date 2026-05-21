import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeaderMobile } from '@/components/mobile/HeaderMobile';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { triagemRepository } from '@/infrastructure/repositories';
import { TIPOS_DOCUMENTO } from '@/domain/tipo-documento';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import type { EstadoTriagem, FichaTriagem } from '@/domain/triagem';
import { tempoRelativo } from '@/lib/triagem-api';

/**
 * Lista de submissões do técnico autenticado (US-MOB-006).
 *
 * Lê direto via repository (não via /api/triagem porque aquele endpoint
 * exige papel de aprovador — ver _helpers.ts da triagem). O técnico só
 * vê as fichas que ele mesmo submeteu (filtro `tecnicoId`).
 *
 * Server Component — sem cache. Cobre os estados:
 *  - vazio (técnico ainda não submeteu nada)
 *  - listagem agrupada por estado (devolvida no topo, depois pendente,
 *    em_revisao, aprovada, rejeitada)
 *  - destaque para devolvidas com link de reenvio (US-MOB-006 + reenvio)
 */

export const dynamic = 'force-dynamic';

const ORDEM_ESTADOS: readonly EstadoTriagem[] = [
  'devolvida',
  'pendente',
  'em_revisao',
  'aprovada',
  'rejeitada',
];

const ROTULO_ESTADO: Record<EstadoTriagem, string> = {
  pendente: 'Aguardando triagem',
  em_revisao: 'Em revisão pelo aprovador',
  devolvida: 'Devolvidas para correção',
  aprovada: 'Aprovadas',
  rejeitada: 'Rejeitadas',
};

export default async function MinhasFichasPage() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    redirect('/app/login');
  }

  let itens: FichaTriagem[] = [];
  let falhouCarga = false;
  try {
    const resp = await triagemRepository.listarPendentes({
      estado: ['pendente', 'em_revisao', 'devolvida', 'aprovada', 'rejeitada'],
      tecnicoId: usuario.id,
      limite: 200,
    });
    itens = resp.itens;
  } catch (e) {
    falhouCarga = true;
    console.error('[minhas-fichas] Falha ao carregar triagem do tecnico', e);
  }

  const agrupado = agruparPorEstado(itens);
  const total = itens.length;

  return (
    <>
      <HeaderMobile titulo="Minhas fichas" voltarHref="/app" />
      <div className="px-safe pb-safe-nav mx-auto w-full max-w-content py-5">
        {total === 0 ? (
          <section
            aria-labelledby="vazio-titulo"
            className="rounded-gov-card border border-app-border-subtle bg-app-surface p-6 text-center"
          >
            <h2 id="vazio-titulo" className="text-md font-semibold text-app-fg">
              {falhouCarga
                ? 'Não foi possível carregar suas fichas no momento.'
                : 'Nenhuma ficha submetida pelo aplicativo até o momento.'}
            </h2>
            <p className="mt-2 text-sm text-app-fg-muted">
              {falhouCarga
                ? 'Tente novamente em instantes. Se o problema persistir, contate o administrador do sistema.'
                : 'As fichas submetidas em campo aparecerão nesta lista com a situação atual da triagem (pendente, em revisão, devolvida, aprovada ou rejeitada).'}
            </p>
            <Link
              href="/app"
              className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded bg-gov-azul px-4 text-sm font-semibold text-white hover:bg-gov-azul-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-2"
            >
              Selecionar tipo de ficha
            </Link>
          </section>
        ) : (
          <div className="space-y-5">
            <p className="text-xs text-app-fg-muted">
              {total} ficha{total === 1 ? '' : 's'} submetida{total === 1 ? '' : 's'} por esta conta.
            </p>

            {ORDEM_ESTADOS.map((estado) => {
              const lista = agrupado[estado];
              if (!lista || lista.length === 0) return null;
              return (
                <section
                  key={estado}
                  aria-labelledby={`grupo-${estado}-titulo`}
                  className="space-y-2"
                >
                  <h2
                    id={`grupo-${estado}-titulo`}
                    className="text-xs font-semibold uppercase tracking-wider text-app-fg-muted"
                  >
                    {ROTULO_ESTADO[estado]} ({lista.length})
                  </h2>
                  <ul className="space-y-2" aria-label={ROTULO_ESTADO[estado]}>
                    {lista.map((ficha) => (
                      <li key={ficha.id}>
                        <CardFicha ficha={ficha} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

function CardFicha({ ficha }: { ficha: FichaTriagem }) {
  const tipo = TIPOS_DOCUMENTO[ficha.codTipoDocumento as CodigoTipoDocumento];
  const dataVisitaTxt = ficha.dataVisita.toISOString().slice(0, 10);
  const criadaTxt = tempoRelativo(ficha.criadaEm);

  if (ficha.estado === 'devolvida') {
    return (
      <Link
        href={`/app/postos/${encodeURIComponent(ficha.prefixo)}/fichas/${ficha.id}/reenviar`}
        className="flex min-h-[64px] flex-col gap-1 rounded-gov-card border-2 border-amber-400 bg-amber-50 p-3 hover:border-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-amber-900">
            {tipo?.rotulo}
          </span>
          <span className="rounded bg-amber-200 px-2 py-0.5 text-2xs font-semibold uppercase text-amber-900">
            Devolvida
          </span>
        </div>
        <p className="text-xs text-amber-900">
          Posto {ficha.prefixo} · Visita de {dataVisitaTxt}
        </p>
        {ficha.motivoDecisao ? (
          <p className="line-clamp-2 text-xs text-amber-900">
            <span className="font-semibold">Justificativa do aprovador:</span>{' '}
            {ficha.motivoDecisao}
          </p>
        ) : null}
        <p className="text-2xs text-amber-800">
          Selecione para revisar e re-submeter a ficha.
        </p>
      </Link>
    );
  }

  return (
    <div
      className={`flex min-h-[64px] flex-col gap-1 rounded-gov-card border bg-app-surface p-3 ${
        ficha.estado === 'aprovada'
          ? 'border-green-300'
          : ficha.estado === 'rejeitada'
            ? 'border-red-300'
            : 'border-app-border-subtle'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-app-fg">
          {tipo?.rotulo}
        </span>
        <BadgeEstado estado={ficha.estado} />
      </div>
      <p className="text-xs text-app-fg-muted">
        Posto {ficha.prefixo} · Visita de {dataVisitaTxt}
      </p>
      <p className="text-2xs text-app-fg-muted">
        Submetida {criadaTxt}
        {ficha.decididaEm
          ? ` · Decisão registrada ${tempoRelativo(ficha.decididaEm)}`
          : ''}
      </p>
      {ficha.estado === 'rejeitada' && ficha.motivoDecisao ? (
        <p className="line-clamp-2 text-xs text-red-800">
          <span className="font-semibold">Justificativa:</span>{' '}
          {ficha.motivoDecisao}
        </p>
      ) : null}
    </div>
  );
}

function BadgeEstado({ estado }: { estado: EstadoTriagem }) {
  const cores: Record<EstadoTriagem, string> = {
    pendente: 'bg-blue-100 text-blue-900',
    em_revisao: 'bg-blue-100 text-blue-900',
    devolvida: 'bg-amber-200 text-amber-900',
    aprovada: 'bg-green-100 text-green-900',
    rejeitada: 'bg-red-100 text-red-900',
  };
  return (
    <span
      className={`rounded px-2 py-0.5 text-2xs font-semibold uppercase ${cores[estado]}`}
    >
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

function agruparPorEstado(
  itens: FichaTriagem[],
): Partial<Record<EstadoTriagem, FichaTriagem[]>> {
  const agrupado: Partial<Record<EstadoTriagem, FichaTriagem[]>> = {};
  for (const ficha of itens) {
    const lista = agrupado[ficha.estado] ?? [];
    lista.push(ficha);
    agrupado[ficha.estado] = lista;
  }
  for (const estado of Object.keys(agrupado) as EstadoTriagem[]) {
    agrupado[estado]?.sort(
      (a, b) => b.criadaEm.getTime() - a.criadaEm.getTime(),
    );
  }
  return agrupado;
}

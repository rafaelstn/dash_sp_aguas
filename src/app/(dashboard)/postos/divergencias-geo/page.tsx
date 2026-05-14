import Link from 'next/link';
import { sql } from '@/infrastructure/db/client';
import { papeisRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Alerta } from '@/components/ui/Alerta';
import { Paginador } from '@/components/ui/Paginador';
import { BadgeDivergencia } from '@/components/features/inventario-ana/BadgeDivergencia';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Divergências geográficas em postos — SPÁguas',
};

const POR_PAGINA = 50;

type Divergencia = 'ok' | 'margem_aceitavel' | 'divergente' | 'sem_coordenada';

interface LinhaPosto {
  id: string;
  prefixo: string;
  nome_estacao: string | null;
  municipio: string | null;
  latitude: string | null;
  longitude: string | null;
  divergencia_municipio: Divergencia | null;
  distancia_municipio_m: string | null;
  municipio_correto_ibge: string | null;
  operacao_fim_ano: number | null;
  tipo_posto: string | null;
}

interface PageProps {
  searchParams: Promise<{
    classificacao?: string;
    operando?: string;
    busca?: string;
    pagina?: string;
  }>;
}

const CLAS_VALIDOS: Divergencia[] = [
  'divergente',
  'margem_aceitavel',
  'ok',
  'sem_coordenada',
];

export default async function DivergenciasGeoPage({ searchParams }: PageProps) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return (
      <Alerta tipo="aviso" titulo="Sessão necessária">
        Acesse o sistema com uma conta autorizada.
      </Alerta>
    );
  }
  const ehAprovador = await papeisRepository.ehAprovador(usuario.id);
  if (!ehAprovador) {
    return (
      <Alerta tipo="aviso" titulo="Acesso restrito">
        Acesso restrito ao papel de aprovador.
      </Alerta>
    );
  }

  const sp = await searchParams;
  const classificacao =
    sp.classificacao && (CLAS_VALIDOS as string[]).includes(sp.classificacao)
      ? (sp.classificacao as Divergencia)
      : 'divergente';
  const operando = sp.operando;
  const busca = sp.busca?.trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);
  const offset = (pagina - 1) * POR_PAGINA;

  const condClassif = sql`AND p.divergencia_municipio = ${classificacao}`;
  const condOperando =
    operando === 'sim'
      ? sql`AND (p.operacao_fim_ano IS NULL OR p.operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1)`
      : operando === 'nao'
        ? sql`AND p.operacao_fim_ano > 0 AND p.operacao_fim_ano < EXTRACT(YEAR FROM CURRENT_DATE)::int - 1`
        : sql``;
  const condBusca = busca
    ? sql`AND (
        p.prefixo ILIKE ${`%${busca}%`}
        OR p.nome_estacao ILIKE ${`%${busca}%`}
        OR p.municipio ILIKE ${`%${busca}%`}
      )`
    : sql``;

  const total = await sql<Array<{ total: number }>>`
    SELECT COUNT(*)::int AS total FROM postos p
     WHERE p.deleted_at IS NULL
       ${condClassif}
       ${condOperando}
       ${condBusca}
  `;
  const totalNum = Number(total[0]?.total ?? 0);

  const itens = await sql<LinhaPosto[]>`
    SELECT p.id, p.prefixo, p.nome_estacao, p.municipio,
           p.latitude::text, p.longitude::text,
           p.divergencia_municipio,
           p.distancia_municipio_m::text,
           p.municipio_correto_ibge,
           p.operacao_fim_ano,
           p.tipo_posto
      FROM postos p
     WHERE p.deleted_at IS NULL
       ${condClassif}
       ${condOperando}
       ${condBusca}
     ORDER BY p.distancia_municipio_m DESC NULLS LAST, p.prefixo
     LIMIT ${POR_PAGINA} OFFSET ${offset}
  `;

  // Resumo geral pros badges das abas
  const resumo = await sql<Array<{
    divergente: number;
    margem_aceitavel: number;
    ok: number;
    sem_coordenada: number;
    divergente_ativo: number;
  }>>`
    SELECT
      COUNT(*) FILTER (WHERE divergencia_municipio = 'divergente')::int AS divergente,
      COUNT(*) FILTER (WHERE divergencia_municipio = 'margem_aceitavel')::int AS margem_aceitavel,
      COUNT(*) FILTER (WHERE divergencia_municipio = 'ok')::int AS ok,
      COUNT(*) FILTER (WHERE divergencia_municipio = 'sem_coordenada')::int AS sem_coordenada,
      COUNT(*) FILTER (
        WHERE divergencia_municipio = 'divergente'
          AND (operacao_fim_ano IS NULL OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1)
      )::int AS divergente_ativo
      FROM postos
     WHERE deleted_at IS NULL
  `;
  const r = resumo[0]!;

  function hrefAba(cls: Divergencia): string {
    const u = new URLSearchParams();
    u.set('classificacao', cls);
    if (operando) u.set('operando', operando);
    if (busca) u.set('busca', busca);
    return `/postos/divergencias-geo?${u.toString()}`;
  }

  function hrefPagina(n: number): string {
    const u = new URLSearchParams();
    u.set('classificacao', classificacao);
    if (operando) u.set('operando', operando);
    if (busca) u.set('busca', busca);
    if (n > 1) u.set('pagina', String(n));
    return `/postos/divergencias-geo?${u.toString()}`;
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">
          <span aria-hidden="true">⚠</span> Divergências geográficas nos postos
        </h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Análise automática PostGIS contra a malha municipal IBGE. Mostra
          postos cuja coordenada cai fora do município declarado,
          independente de a ANA ter apontado. Re-calculado quando lat/lng/município
          é editado.
        </p>
      </header>

      {/* Abas por classificação */}
      <nav aria-label="Filtrar por classificação" className="flex flex-wrap gap-1 border-b border-app-border-subtle">
        {CLAS_VALIDOS.map((cls) => {
          const ativa = classificacao === cls;
          const total =
            cls === 'divergente'
              ? r.divergente
              : cls === 'margem_aceitavel'
                ? r.margem_aceitavel
                : cls === 'ok'
                  ? r.ok
                  : r.sem_coordenada;
          const rotulos: Record<Divergencia, string> = {
            divergente: 'Divergente ≥10km',
            margem_aceitavel: 'Margem <10km',
            ok: 'OK',
            sem_coordenada: 'Sem coordenada',
          };
          return (
            <Link
              key={cls}
              href={hrefAba(cls)}
              aria-current={ativa ? 'page' : undefined}
              className={`rounded-t border-b-2 px-3 py-1.5 text-sm font-medium ${ativa ? 'border-gov-azul bg-app-surface text-gov-azul' : 'border-transparent text-app-fg-muted hover:bg-app-surface-2'}`}
            >
              {rotulos[cls]}{' '}
              <span className="tabular text-2xs">
                ({total.toLocaleString('pt-BR')})
              </span>
            </Link>
          );
        })}
      </nav>

      {classificacao === 'divergente' && r.divergente_ativo > 0 ? (
        <Alerta tipo="aviso" titulo={`${r.divergente_ativo} postos divergentes estão ATIVOS`}>
          Esses são os mais críticos: a estação ainda transmite dado e tem
          coordenada errada. Corrija primeiro.
        </Alerta>
      ) : null}

      <form
        method="get"
        role="search"
        className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-3 sm:grid-cols-3"
      >
        <input type="hidden" name="classificacao" value={classificacao} />
        <label className="block text-xs">
          <span className="mb-0.5 block font-medium text-app-fg-muted">Busca</span>
          <input
            name="busca"
            type="text"
            defaultValue={busca ?? ''}
            placeholder="prefixo, nome ou município"
            className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          />
        </label>
        <label className="block text-xs">
          <span className="mb-0.5 block font-medium text-app-fg-muted">Operação</span>
          <select
            name="operando"
            defaultValue={operando ?? ''}
            className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          >
            <option value="">Todos</option>
            <option value="sim">Ativos (prioridade)</option>
            <option value="nao">Desativados</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Link
            href={`/postos/divergencias-geo?classificacao=${classificacao}`}
            className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2"
          >
            Limpar
          </Link>
          <button
            type="submit"
            className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Aplicar
          </button>
        </div>
      </form>

      <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Postos com {classificacao} de coordenada vs município, ordenados pela maior distância da fronteira
          </caption>
          <thead>
            <tr className="bg-app-surface-2 text-left">
              <Th>Prefixo</Th>
              <Th>Nome</Th>
              <Th>Tipo</Th>
              <Th>Coord</Th>
              <Th>Município declarado</Th>
              <Th>Distância fronteira</Th>
              <Th>Município que contém</Th>
              <Th>Op</Th>
              <Th>Ação</Th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-app-fg-muted">
                  Nenhum posto nesta classificação.
                </td>
              </tr>
            ) : (
              itens.map((p) => {
                const distKm = p.distancia_municipio_m
                  ? (Number(p.distancia_municipio_m) / 1000).toFixed(1)
                  : null;
                const ativo =
                  p.operacao_fim_ano === null ||
                  p.operacao_fim_ano >= new Date().getFullYear() - 1;
                return (
                  <tr
                    key={p.id}
                    className="border-b border-app-border-subtle last:border-0 hover:bg-app-surface-2"
                  >
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/postos/${encodeURIComponent(p.prefixo)}`}
                        className="mono text-gov-azul hover:underline"
                        aria-label={`Abrir ficha do posto ${p.prefixo}`}
                      >
                        {p.prefixo}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">{p.nome_estacao ?? '—'}</td>
                    <td className="px-3 py-1.5 text-2xs">{p.tipo_posto ?? '—'}</td>
                    <td className="px-3 py-1.5 text-2xs mono tabular">
                      {p.latitude && p.longitude
                        ? `${Number(p.latitude).toFixed(4)}, ${Number(p.longitude).toFixed(4)}`
                        : '—'}
                    </td>
                    <td className="px-3 py-1.5">{p.municipio ?? '—'}</td>
                    <td className="px-3 py-1.5">
                      <BadgeDivergencia
                        divergencia={p.divergencia_municipio}
                        distanciaM={
                          p.distancia_municipio_m !== null
                            ? Number(p.distancia_municipio_m)
                            : null
                        }
                      />
                      {distKm && classificacao === 'divergente' ? (
                        <span className="ml-1 text-2xs tabular text-app-fg-muted">
                          {distKm}km
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5">
                      {p.municipio_correto_ibge &&
                      p.municipio_correto_ibge !== p.municipio ? (
                        <span className="text-amber-900">
                          {p.municipio_correto_ibge}
                        </span>
                      ) : (
                        <span className="text-app-fg-subtle">—</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-2xs">
                      {ativo ? (
                        <span className="text-green-800">Ativo</span>
                      ) : (
                        <span className="text-app-fg-muted">Inativo</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <Link
                        href={`/postos/${encodeURIComponent(p.prefixo)}/editar`}
                        className="text-2xs text-gov-azul hover:underline"
                        aria-label={`Editar posto ${p.prefixo}`}
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Paginador
        pagina={pagina}
        porPagina={POR_PAGINA}
        total={totalNum}
        hrefPagina={hrefPagina}
        rotuloAria="Paginação de postos com divergência geográfica"
      />

      <p className="text-2xs text-app-fg-muted">
        Re-análise é automática quando lat/lng/município de um posto é editado.
        Para recalcular tudo após mudanças massivas, rodar{' '}
        <code className="mono">scripts/recalcular_divergencia_postos.py</code>.
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-app-border-subtle px-3 py-1.5 text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
    >
      {children}
    </th>
  );
}

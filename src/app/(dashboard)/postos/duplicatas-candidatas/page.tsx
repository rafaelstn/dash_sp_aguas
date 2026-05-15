import Link from 'next/link';
import { sql } from '@/infrastructure/db/client';
import { papeisRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Duplicatas candidatas em postos — SPÁguas',
};

interface ParCandidato {
  id_a: string;
  prefixo_a: string;
  nome_a: string | null;
  mun_a: string | null;
  id_b: string;
  prefixo_b: string;
  nome_b: string | null;
  mun_b: string | null;
  dist_m: number;
  similaridade: number;
  ambos_ativos: boolean;
}

export default async function DuplicatasCandidatasPage() {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return (
      <Alerta tipo="aviso" titulo="Sessão necessária">
        Acesse com conta autorizada.
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

  const pares = await sql<
    Array<{
      id_a: string;
      prefixo_a: string;
      nome_a: string | null;
      mun_a: string | null;
      ativo_a: boolean;
      id_b: string;
      prefixo_b: string;
      nome_b: string | null;
      mun_b: string | null;
      ativo_b: boolean;
      dist_m: number;
      similaridade: number;
    }>
  >`
    SELECT p1.id AS id_a, p1.prefixo AS prefixo_a, p1.nome_estacao AS nome_a,
           p1.municipio AS mun_a,
           (p1.operacao_fim_ano IS NULL OR p1.operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) AS ativo_a,
           p2.id AS id_b, p2.prefixo AS prefixo_b, p2.nome_estacao AS nome_b,
           p2.municipio AS mun_b,
           (p2.operacao_fim_ano IS NULL OR p2.operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1) AS ativo_b,
           ST_DistanceSphere(
             ST_MakePoint(p1.longitude::float, p1.latitude::float),
             ST_MakePoint(p2.longitude::float, p2.latitude::float)
           ) AS dist_m,
           similarity(
             LOWER(unaccent(COALESCE(p1.nome_estacao, ''))),
             LOWER(unaccent(COALESCE(p2.nome_estacao, '')))
           ) AS similaridade
      FROM postos p1
      JOIN postos p2 ON p2.id > p1.id
     WHERE p1.deleted_at IS NULL AND p2.deleted_at IS NULL
       AND p1.latitude IS NOT NULL AND p1.longitude IS NOT NULL
       AND p2.latitude IS NOT NULL AND p2.longitude IS NOT NULL
       AND ST_DistanceSphere(
             ST_MakePoint(p1.longitude::float, p1.latitude::float),
             ST_MakePoint(p2.longitude::float, p2.latitude::float)
           ) < 100
       AND similarity(LOWER(unaccent(COALESCE(p1.nome_estacao, ''))),
                      LOWER(unaccent(COALESCE(p2.nome_estacao, '')))) > 0.5
     ORDER BY similaridade DESC, dist_m
  `;

  const lista: ParCandidato[] = pares.map((p) => ({
    id_a: p.id_a,
    prefixo_a: p.prefixo_a,
    nome_a: p.nome_a,
    mun_a: p.mun_a,
    id_b: p.id_b,
    prefixo_b: p.prefixo_b,
    nome_b: p.nome_b,
    mun_b: p.mun_b,
    dist_m: Number(p.dist_m ?? 0),
    similaridade: Number(p.similaridade ?? 0),
    ambos_ativos: Boolean(p.ativo_a && p.ativo_b),
  }));

  const totalAtivos = lista.filter((p) => p.ambos_ativos).length;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">
          Duplicatas candidatas em postos
        </h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Pares de postos com mesma coordenada (&lt;100m) E nome similar
          (similaridade &gt;0.5). Padrão comum: prefixo invertido (ex:{' '}
          <span className="mono">6D-001</span> vs{' '}
          <span className="mono">D6-039</span>). Marcio decide qual manter.
        </p>
      </header>

      {totalAtivos > 0 ? (
        <Alerta
          tipo="aviso"
          titulo={`${totalAtivos} par(es) com AMBOS ativos`}
        >
          São os mais críticos. Se for duplicata real, os dois estão
          transmitindo dado pro mesmo lugar.
        </Alerta>
      ) : null}

      <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Pares de postos candidatos a duplicata
          </caption>
          <thead>
            <tr className="bg-app-surface-2 text-left">
              <Th>Posto A</Th>
              <Th>Posto B</Th>
              <Th>Distância</Th>
              <Th>Similar</Th>
              <Th>Estado</Th>
              <Th>Ação</Th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-app-fg-muted">
                  Sem pares candidatos.
                </td>
              </tr>
            ) : (
              lista.map((p) => (
                <tr
                  key={`${p.id_a}-${p.id_b}`}
                  className={`border-b border-app-border-subtle last:border-0 ${p.ambos_ativos ? 'bg-red-50' : 'hover:bg-app-surface-2'}`}
                >
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/postos/${encodeURIComponent(p.prefixo_a)}`}
                      className="mono text-gov-azul hover:underline"
                    >
                      {p.prefixo_a}
                    </Link>
                    <p className="text-2xs text-app-fg-muted">
                      {p.nome_a ?? '—'}
                      {p.mun_a ? ` · ${p.mun_a}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-1.5">
                    <Link
                      href={`/postos/${encodeURIComponent(p.prefixo_b)}`}
                      className="mono text-gov-azul hover:underline"
                    >
                      {p.prefixo_b}
                    </Link>
                    <p className="text-2xs text-app-fg-muted">
                      {p.nome_b ?? '—'}
                      {p.mun_b ? ` · ${p.mun_b}` : ''}
                    </p>
                  </td>
                  <td className="px-3 py-1.5 tabular text-2xs mono">
                    {p.dist_m.toFixed(0)}m
                  </td>
                  <td className="px-3 py-1.5 tabular text-2xs mono">
                    {(p.similaridade * 100).toFixed(0)}%
                  </td>
                  <td className="px-3 py-1.5 text-2xs">
                    {p.ambos_ativos ? (
                      <span className="rounded bg-red-100 px-1.5 font-semibold text-gov-perigo">
                        Ambos ATIVOS
                      </span>
                    ) : (
                      <span className="text-app-fg-muted">um inativo</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-2xs">
                      <Link
                        href={`/postos/${encodeURIComponent(p.prefixo_a)}/editar`}
                        className="text-gov-azul hover:underline"
                      >
                        Editar A
                      </Link>
                      <Link
                        href={`/postos/${encodeURIComponent(p.prefixo_b)}/editar`}
                        className="text-gov-azul hover:underline"
                      >
                        Editar B
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-2xs text-app-fg-muted">
        Pra marcar como duplicada, abra a tela de edição do posto que vai
        sair e use a remoção (soft-delete). O outro permanece. Audit
        registrado em <code className="mono">postos_evento</code>.
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

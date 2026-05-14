import Link from 'next/link';
import { AlertTriangle, ArrowRight, Database, FolderX } from 'lucide-react';
import { painelRepository } from '@/infrastructure/db/painel-repository.pg';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { sql } from '@/infrastructure/db/client';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Alerta } from '@/components/ui/Alerta';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Painel — Ficha Técnica SPÁguas',
};

interface ProximaAcao {
  tipo: 'ana' | 'divergencia_geo';
  prefixo?: string;
  codigoAna?: string;
  nome: string | null;
  municipio: string | null;
  municipioCorreto?: string | null;
  distanciaKm?: number;
  href: string;
}

interface Contagens {
  totalPostos: number;
  ativos: number;
  semCoord: number;
  postosDivergentes: number;
  postosDivergentesAtivos: number;
  anaPendencias: number;
  anaOperando: number;
}

export default async function PaginaPainel() {
  const usuario = await obterUsuarioAtual();
  let ehAprovador = false;
  if (usuario) {
    try {
      ehAprovador = await papeisRepository.ehAprovador(usuario.id);
    } catch {
      /* sem papel é OK */
    }
  }

  // 1. Próxima ação (CTA principal). Prioriza: divergente ativo > ANA operando.
  let proxima: ProximaAcao | null = null;
  if (ehAprovador) {
    try {
      const r = await sql<
        Array<{
          prefixo: string;
          nome_estacao: string | null;
          municipio: string | null;
          municipio_correto_ibge: string | null;
          distancia_municipio_m: string | null;
        }>
      >`
        SELECT prefixo, nome_estacao, municipio,
               municipio_correto_ibge, distancia_municipio_m::text
          FROM postos
         WHERE deleted_at IS NULL
           AND divergencia_municipio = 'divergente'
           AND (operacao_fim_ano IS NULL OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1)
         ORDER BY distancia_municipio_m DESC
         LIMIT 1
      `;
      if (r[0]) {
        proxima = {
          tipo: 'divergencia_geo',
          prefixo: r[0].prefixo,
          nome: r[0].nome_estacao,
          municipio: r[0].municipio,
          municipioCorreto: r[0].municipio_correto_ibge,
          distanciaKm: r[0].distancia_municipio_m
            ? Math.round(Number(r[0].distancia_municipio_m) / 1000)
            : undefined,
          href: `/postos/${encodeURIComponent(r[0].prefixo)}/editar`,
        };
      } else {
        // Fallback ANA
        const lote = await anaRevisaoRepository.loteAtual();
        if (lote) {
          const fila = await anaRevisaoRepository.listar(lote.id, {
            operando: 'sim',
            divergenciaMunicipio: 'divergente',
            status: 'pendente',
            porPagina: 1,
          });
          if (fila.itens[0]) {
            proxima = {
              tipo: 'ana',
              codigoAna: fila.itens[0].codigoAna,
              nome: fila.itens[0].nome,
              municipio: fila.itens[0].municipioNome,
              href: `/inventario-ana/${encodeURIComponent(fila.itens[0].codigoAna)}`,
            };
          }
        }
      }
    } catch {
      /* tolera */
    }
  }

  // 2. Contagens consolidadas (só o essencial)
  let contagens: Contagens | null = null;
  let falha = false;
  try {
    const [r1, r2, ana] = await Promise.all([
      painelRepository.resumoPendencias(),
      painelRepository.statusOperacional(),
      ehAprovador && (await anaRevisaoRepository.loteAtual())
        ? anaRevisaoRepository.resumoPainel(
            (await anaRevisaoRepository.loteAtual())!.id,
          )
        : null,
    ]);

    const divs = ehAprovador
      ? await sql<Array<{ total: number; ativos: number }>>`
          SELECT COUNT(*)::int AS total,
                 COUNT(*) FILTER (
                   WHERE operacao_fim_ano IS NULL
                     OR operacao_fim_ano >= EXTRACT(YEAR FROM CURRENT_DATE)::int - 1
                 )::int AS ativos
            FROM postos
           WHERE deleted_at IS NULL
             AND divergencia_municipio = 'divergente'
        `
      : null;

    contagens = {
      totalPostos: r1.totalPostos,
      ativos: r2.ativos,
      semCoord: r1.postosSemCoordenadas,
      postosDivergentes: divs?.[0]?.total ?? 0,
      postosDivergentesAtivos: divs?.[0]?.ativos ?? 0,
      anaPendencias: ana?.totalPendencias ?? 0,
      anaOperando: ana?.operando ?? 0,
    };
  } catch (e) {
    console.error('[painel]', e);
    falha = true;
  }

  if (falha || !contagens) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-app-fg">Painel</h1>
        <Alerta tipo="erro" titulo="Falha ao carregar">
          Não foi possível conectar ao banco. Tente novamente.
        </Alerta>
      </div>
    );
  }

  const totalPendencias =
    contagens.postosDivergentes + contagens.anaPendencias;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">Painel</h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          {usuario?.email
            ? `Logado como ${usuario.email}.`
            : 'Visão geral da rede SPÁguas.'}
        </p>
      </header>

      {/* CTA principal: o que precisa ser feito agora */}
      {ehAprovador && proxima ? (
        <section
          aria-labelledby="sec-cta"
          className="rounded-gov-card border-l-4 border-gov-perigo bg-app-surface p-5"
        >
          <p className="text-2xs font-semibold uppercase tracking-wider text-gov-perigo">
            Próxima ação
          </p>
          <h2 id="sec-cta" className="mt-1 text-lg font-semibold text-app-fg">
            {proxima.tipo === 'divergencia_geo' ? (
              <>
                Posto <span className="mono">{proxima.prefixo}</span> está com
                coord errada
              </>
            ) : (
              <>
                Estação ANA <span className="mono">{proxima.codigoAna}</span>{' '}
                pendente
              </>
            )}
          </h2>
          <p className="mt-1 text-sm text-app-fg">
            {proxima.nome ?? 'Sem nome'}
            {proxima.municipio ? ` · declarado em ${proxima.municipio}` : ''}
            {proxima.municipioCorreto &&
            proxima.municipioCorreto !== proxima.municipio
              ? ` · coord cai em ${proxima.municipioCorreto}`
              : ''}
            {proxima.distanciaKm
              ? ` · ${proxima.distanciaKm}km da fronteira`
              : ''}
          </p>
          <p className="mt-2 text-2xs text-app-fg-muted">
            {contagens.postosDivergentesAtivos > 0
              ? `${contagens.postosDivergentesAtivos} posto(s) ativo(s) com divergência. `
              : ''}
            {contagens.anaOperando > 0
              ? `${contagens.anaOperando} estação(ões) ANA operando pendente(s).`
              : ''}
          </p>
          <Link
            href={proxima.href}
            className="mt-3 inline-flex items-center gap-1.5 rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            Resolver agora
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ) : ehAprovador && totalPendencias === 0 ? (
        <section className="rounded-gov-card border-l-4 border-gov-sucesso bg-green-50 p-4">
          <p className="text-sm font-medium text-green-900">
            Sem pendências críticas. Tudo em ordem.
          </p>
        </section>
      ) : null}

      {/* 3 listas curtas pra ele clicar e ir resolver */}
      {ehAprovador ? (
        <section aria-labelledby="sec-pend" className="space-y-2">
          <h2
            id="sec-pend"
            className="text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
          >
            Filas de correção
          </h2>
          <ul className="rounded-gov-card border border-app-border-subtle bg-app-surface divide-y divide-app-border-subtle">
            <LinhaFila
              titulo="Postos com coord errada"
              valor={contagens.postosDivergentes}
              destaque={contagens.postosDivergentesAtivos}
              destaqueRotulo="ativos"
              href="/postos/divergencias-geo?classificacao=divergente&operando=sim"
              icone={AlertTriangle}
            />
            <LinhaFila
              titulo="Auditoria ANA"
              valor={contagens.anaPendencias}
              destaque={contagens.anaOperando}
              destaqueRotulo="operando"
              href="/inventario-ana?operando=sim&divergencia=divergente"
              icone={AlertTriangle}
            />
            <LinhaFila
              titulo="Postos sem coordenada"
              valor={contagens.semCoord}
              destaque={null}
              destaqueRotulo=""
              href="/postos/divergencias-geo?classificacao=sem_coordenada"
              icone={FolderX}
            />
          </ul>
        </section>
      ) : null}

      {/* Panorama da rede — 1 linha enxuta, sem distrair */}
      <section
        aria-labelledby="sec-pano"
        className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
      >
        <h2
          id="sec-pano"
          className="mb-2 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Rede SPÁguas
        </h2>
        <dl className="grid gap-3 sm:grid-cols-3">
          <KV
            rotulo="Total de postos"
            valor={contagens.totalPostos.toLocaleString('pt-BR')}
            icone={Database}
          />
          <KV
            rotulo="Postos ativos"
            valor={contagens.ativos.toLocaleString('pt-BR')}
            icone={Database}
          />
          <KV
            rotulo="Sem coordenada"
            valor={contagens.semCoord.toLocaleString('pt-BR')}
            icone={Database}
          />
        </dl>
      </section>

      <p className="text-2xs text-app-fg-muted">
        Detalhes por UGRHI, mantenedor e tipo de inconsistência ficam em{' '}
        <Link href="/desconformidades" className="text-gov-azul hover:underline">
          Desconformidades
        </Link>
        .
      </p>
    </div>
  );
}

function LinhaFila({
  titulo,
  valor,
  destaque,
  destaqueRotulo,
  href,
  icone: Icone,
}: {
  titulo: string;
  valor: number;
  destaque: number | null;
  destaqueRotulo: string;
  href: string;
  icone: typeof AlertTriangle;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
      >
        <Icone
          className="h-4 w-4 shrink-0 text-app-fg-muted"
          aria-hidden="true"
        />
        <span className="flex-1 text-sm font-medium text-app-fg">{titulo}</span>
        <span className="flex items-baseline gap-2 text-sm tabular">
          {destaque !== null && destaque > 0 ? (
            <span className="rounded bg-red-100 px-1.5 text-2xs font-semibold text-gov-perigo">
              {destaque} {destaqueRotulo}
            </span>
          ) : null}
          <span className="mono font-semibold text-app-fg">
            {valor.toLocaleString('pt-BR')}
          </span>
          <ArrowRight
            className="h-3.5 w-3.5 text-app-fg-muted"
            aria-hidden="true"
          />
        </span>
      </Link>
    </li>
  );
}

function KV({
  rotulo,
  valor,
  icone: Icone,
}: {
  rotulo: string;
  valor: string;
  icone: typeof Database;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-2xs uppercase tracking-wide text-app-fg-muted">
        <Icone className="h-3 w-3" aria-hidden="true" />
        {rotulo}
      </dt>
      <dd className="mt-0.5 text-xl font-semibold tabular text-app-fg">
        {valor}
      </dd>
    </div>
  );
}

import { Suspense } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock, Search, FileWarning, Download } from 'lucide-react';
import {
  anaRevisaoRepository,
  papeisRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { Alerta } from '@/components/ui/Alerta';
import { Paginador } from '@/components/ui/Paginador';
import { Skeleton } from '@/components/ui/Skeleton';
import { CardKPI } from '@/components/features/painel/CardKPI';
import { FiltrosInventario } from '@/components/features/inventario-ana/FiltrosInventario';
import { TabelaInventario } from '@/components/features/inventario-ana/TabelaInventario';
import type {
  DivergenciaMunicipio,
  StatusRevisao,
} from '@/domain/ana-revisao';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Auditoria ANA — SPÁguas',
};

const POR_PAGINA = 50;

interface PageProps {
  searchParams: Promise<{
    busca?: string;
    operando?: string;
    status?: string;
    divergencia?: string;
    semMatch?: string;
    pagina?: string;
  }>;
}

interface FiltrosResolvidos {
  pagina: number;
  busca: string | undefined;
  operando: 'sim' | 'nao' | 'todos' | undefined;
  status: StatusRevisao | undefined;
  divergencia: DivergenciaMunicipio | undefined;
  semMatch: 'true' | 'false' | undefined;
}

const STATUS_VALIDOS: StatusRevisao[] = [
  'pendente',
  'em_revisao',
  'revisada',
  'descartada',
  'sem_match',
  'promovida_a_posto',
];

const DIVERG_VALIDOS: DivergenciaMunicipio[] = [
  'ok',
  'margem_aceitavel',
  'divergente',
  'sem_coordenada',
];

function resolverFiltros(sp: Awaited<PageProps['searchParams']>): FiltrosResolvidos {
  return {
    pagina: Math.max(1, Number(sp.pagina ?? 1) || 1),
    busca: sp.busca?.trim() || undefined,
    operando:
      sp.operando === 'sim' || sp.operando === 'nao' || sp.operando === 'todos'
        ? sp.operando
        : undefined,
    status:
      sp.status && (STATUS_VALIDOS as string[]).includes(sp.status)
        ? (sp.status as StatusRevisao)
        : undefined,
    divergencia:
      sp.divergencia && (DIVERG_VALIDOS as string[]).includes(sp.divergencia)
        ? (sp.divergencia as DivergenciaMunicipio)
        : undefined,
    semMatch:
      sp.semMatch === 'true' || sp.semMatch === 'false'
        ? sp.semMatch
        : undefined,
  };
}

function paramsBase(f: FiltrosResolvidos): URLSearchParams {
  const u = new URLSearchParams();
  if (f.busca) u.set('busca', f.busca);
  if (f.operando) u.set('operando', f.operando);
  if (f.status) u.set('status', f.status);
  if (f.divergencia) u.set('divergencia', f.divergencia);
  if (f.semMatch) u.set('semMatch', f.semMatch);
  return u;
}

function SkeletonLista() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 12 }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-full" />
      ))}
    </div>
  );
}

async function ResumoEFila({ filtros }: { filtros: FiltrosResolvidos }) {
  const lote = await anaRevisaoRepository.loteAtual();
  if (!lote) {
    return (
      <Alerta tipo="aviso" titulo="Sem inventário carregado">
        Nenhum lote do PROGESTÃO foi importado ainda. Carregue a planilha de
        dúvidas da ANA via{' '}
        <code className="mono">scripts/importar_inventario_ana.py</code>.
      </Alerta>
    );
  }

  const [resumo, resultado] = await Promise.all([
    anaRevisaoRepository.resumoPainel(lote.id),
    anaRevisaoRepository.listar(lote.id, {
      busca: filtros.busca,
      operando: filtros.operando,
      status: filtros.status,
      divergenciaMunicipio: filtros.divergencia,
      semMatch:
        filtros.semMatch === 'true'
          ? true
          : filtros.semMatch === 'false'
            ? false
            : undefined,
      pagina: filtros.pagina,
      porPagina: POR_PAGINA,
    }),
  ]);

  function hrefPagina(n: number): string {
    const p = paramsBase(filtros);
    if (n > 1) p.set('pagina', String(n));
    const qs = p.toString();
    return qs ? `/inventario-ana?${qs}` : '/inventario-ana';
  }

  const prazo = resumo.prazoResposta
    ? new Intl.DateTimeFormat('pt-BR').format(new Date(resumo.prazoResposta))
    : null;

  return (
    <div className="space-y-6">
      {/* ═══════════════════════════════════════════════════
          KPIs
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-kpis" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="sec-kpis" className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle">
            Lote: {resumo.loteNome}
          </h2>
          {prazo ? (
            <p className="text-2xs text-app-fg-subtle">
              Prazo de resposta: <span className="font-semibold text-gov-perigo tabular">{prazo}</span>
            </p>
          ) : null}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CardKPI
            titulo="Pendências ANA"
            valor={resumo.totalPendencias}
            contexto={`de ${resumo.totalEstacoes.toLocaleString('pt-BR')} estações no inventário`}
            severidade="alta"
            icone={FileWarning}
          />
          <CardKPI
            titulo="Operando (prioridade)"
            valor={resumo.operando}
            contexto="estações ativas com observação ANA"
            severidade={resumo.operando > 0 ? 'critica' : 'sucesso'}
            icone={AlertTriangle}
            href="/inventario-ana?operando=sim"
            rotuloAcao="Filtrar"
          />
          <CardKPI
            titulo="Sem match no banco"
            valor={resumo.semMatch}
            contexto="estações ANA não cadastradas como posto"
            severidade={resumo.semMatch > 0 ? 'alta' : 'sucesso'}
            icone={Search}
            href="/inventario-ana?semMatch=true"
            rotuloAcao="Investigar"
          />
          <CardKPI
            titulo="Divergência geo (≥10km)"
            valor={resumo.divergenciaDivergente}
            contexto={`+ ${resumo.divergenciaMargem.toLocaleString('pt-BR')} em margem aceitável`}
            severidade={resumo.divergenciaDivergente > 0 ? 'alta' : 'sucesso'}
            icone={AlertTriangle}
            href="/inventario-ana?divergencia=divergente"
            rotuloAcao="Ver mapa"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          ANDAMENTO
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-andamento" className="space-y-3">
        <h2 id="sec-andamento" className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle">
          Andamento da revisão
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CardKPI titulo="Pendente" valor={resumo.statusPendente} severidade="info" icone={Clock} />
          <CardKPI titulo="Em revisão" valor={resumo.statusEmRevisao} severidade="info" icone={Clock} />
          <CardKPI titulo="Revisadas" valor={resumo.statusRevisada} severidade="sucesso" icone={CheckCircle2} />
          <CardKPI titulo="Descartadas" valor={resumo.statusDescartada} severidade="info" icone={CheckCircle2} />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          FILTROS + TABELA
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-fila" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sec-fila" className="text-sm font-semibold text-app-fg">
            Fila de revisão · {resultado.total.toLocaleString('pt-BR')} estações
          </h2>
          <Link
            href="/api/inventario-ana/exportar"
            className="inline-flex items-center gap-1.5 rounded border border-gov-azul bg-white px-3 py-1.5 text-xs font-medium text-gov-azul hover:bg-app-surface-2"
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            Exportar planilha ANA
          </Link>
        </div>
        <FiltrosInventario
          filtros={{
            busca: filtros.busca,
            operando: filtros.operando,
            status: filtros.status,
            divergencia: filtros.divergencia,
            semMatch: filtros.semMatch,
          }}
        />
        <TabelaInventario itens={resultado.itens} />
        <Paginador
          pagina={filtros.pagina}
          porPagina={POR_PAGINA}
          total={resultado.total}
          hrefPagina={hrefPagina}
          rotuloAria="Paginação do inventário ANA"
        />
      </section>
    </div>
  );
}

export default async function InventarioAnaPage({ searchParams }: PageProps) {
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
        Acesso restrito ao papel de aprovador. Solicite ao gestor.
      </Alerta>
    );
  }

  const sp = await searchParams;
  const filtros = resolverFiltros(sp);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">Auditoria ANA · Meta I.6 PROGESTÃO</h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          A ANA aponta estações com inconsistência; você corrige direto em
          <code className="mono"> postos</code> (fonte da verdade) e exporta o
          relatório com as células alteradas em amarelo.
        </p>
      </header>

      <Suspense fallback={<SkeletonLista />}>
        <ResumoEFila filtros={filtros} />
      </Suspense>
    </div>
  );
}

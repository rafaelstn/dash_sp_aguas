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
import { CENARIOS_ANA } from '@/domain/ana-cenarios';
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
    cenario?: string;
  }>;
}

interface FiltrosResolvidos {
  pagina: number;
  busca: string | undefined;
  operando: 'sim' | 'nao' | 'todos' | undefined;
  status: StatusRevisao | undefined;
  divergencia: DivergenciaMunicipio | undefined;
  semMatch: 'true' | 'false' | undefined;
  cenario: string | undefined;
}

interface CenarioChip {
  chave: string;
  rotulo: string;
  pattern: string;
  total: number;
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
    cenario: typeof sp.cenario === 'string' && sp.cenario.trim() ? sp.cenario : undefined,
  };
}

function paramsBase(f: FiltrosResolvidos): URLSearchParams {
  const u = new URLSearchParams();
  if (f.busca) u.set('busca', f.busca);
  if (f.operando) u.set('operando', f.operando);
  if (f.cenario) u.set('cenario', f.cenario);
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
      cenario: filtros.cenario,
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

  // Contagens por cenário (só pendentes/em_revisao). Lista canônica vem
  // de src/domain/ana-cenarios.ts para garantir que o repository usa
  // exatamente o mesmo pattern que mostramos aqui.
  const chipsContagem: Array<CenarioChip> = [];
  for (const c of CENARIOS_ANA) {
    const total = await anaRevisaoRepository.contarPorCenario(lote.id, c.pattern);
    chipsContagem.push({
      chave: c.chave,
      rotulo: c.rotulo,
      pattern: c.pattern,
      total,
    });
  }

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
            contexto="estações com coordenada fora do município declarado"
            severidade={resumo.divergenciaDivergente > 0 ? 'alta' : 'sucesso'}
            icone={AlertTriangle}
            href="/inventario-ana?divergencia=divergente"
            rotuloAcao="Ver mapa"
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          ANDAMENTO — só mostra o que ainda tem trabalho.
          Resolvidos viram linha de resumo no rodapé do painel.
          ═══════════════════════════════════════════════════ */}
      {resumo.statusPendente + resumo.statusEmRevisao > 0 ? (
        <section aria-labelledby="sec-andamento" className="space-y-3">
          <h2
            id="sec-andamento"
            className="text-2xs font-semibold uppercase tracking-wider text-app-fg-subtle"
          >
            Pendente de revisão
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {resumo.statusPendente > 0 ? (
              <CardKPI
                titulo="Pendente"
                valor={resumo.statusPendente}
                contexto="aguardando aprovador"
                severidade="info"
                icone={Clock}
                href="/inventario-ana?status=pendente"
                rotuloAcao="Abrir fila"
              />
            ) : null}
            {resumo.statusEmRevisao > 0 ? (
              <CardKPI
                titulo="Em revisão"
                valor={resumo.statusEmRevisao}
                contexto="já iniciada, falta concluir"
                severidade="info"
                icone={Clock}
                href="/inventario-ana?status=em_revisao"
                rotuloAcao="Continuar"
              />
            ) : null}
          </div>
        </section>
      ) : (
        <section
          aria-labelledby="sec-andamento"
          className="rounded-gov-card border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-900"
        >
          <h2 id="sec-andamento" className="font-medium">
            <CheckCircle2 className="mr-1.5 inline h-4 w-4 -translate-y-px" aria-hidden />
            Nenhuma pendência ANA aberta neste lote.
          </h2>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════
          FILTROS + TABELA
          ═══════════════════════════════════════════════════ */}
      <section aria-labelledby="sec-fila" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="sec-fila" className="text-sm font-semibold text-app-fg">
            Fila de revisão · {resultado.total.toLocaleString('pt-BR')} estações
            {!filtros.status ? (
              <span className="ml-2 text-2xs font-normal text-app-fg-muted">
                (apenas pendente/em revisão; para ver fechadas use o filtro de status)
              </span>
            ) : null}
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

        {/* Chips de cenário: filtra a fila por categoria de problema apontada pela ANA */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="group" aria-label="Filtrar por cenário ANA">
          <span className="mr-1 text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
            Cenário:
          </span>
          {!filtros.cenario ? (
            <span className="rounded-full bg-gov-azul px-2 py-0.5 font-medium text-white">
              Todos
            </span>
          ) : (
            <Link
              href="/inventario-ana"
              className="rounded-full border border-app-border-subtle bg-app-surface px-2 py-0.5 text-app-fg-muted hover:bg-app-surface-2"
            >
              Todos
            </Link>
          )}
          {chipsContagem
            .filter((c) => c.total > 0 || c.chave === filtros.cenario)
            .map((c) => {
              const ativo = filtros.cenario === c.chave;
              const u = paramsBase(filtros);
              if (ativo) u.delete('cenario');
              else u.set('cenario', c.chave);
              u.delete('pagina');
              const href = `/inventario-ana?${u.toString()}`;
              return (
                <Link
                  key={c.chave}
                  href={href}
                  aria-current={ativo ? 'true' : undefined}
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    ativo
                      ? 'bg-gov-azul font-medium text-white'
                      : 'border border-app-border-subtle bg-app-surface text-app-fg hover:bg-app-surface-2'
                  }`}
                >
                  {c.rotulo}
                  <span
                    className={`mono tabular text-2xs ${ativo ? 'text-white/90' : 'text-app-fg-muted'}`}
                  >
                    {c.total}
                  </span>
                </Link>
              );
            })}
        </div>

        <TabelaInventario itens={resultado.itens} />
        <Paginador
          pagina={filtros.pagina}
          porPagina={POR_PAGINA}
          total={resultado.total}
          hrefPagina={hrefPagina}
          rotuloAria="Paginação do inventário ANA"
        />
      </section>

      {resumo.statusRevisada + resumo.statusPromovida + resumo.statusDescartada > 0 ? (
        <p className="text-2xs text-app-fg-subtle">
          Já fechadas neste lote:{' '}
          {resumo.statusRevisada > 0 ? (
            <Link
              href="/inventario-ana?status=revisada"
              className="text-gov-azul hover:underline"
            >
              {resumo.statusRevisada.toLocaleString('pt-BR')} revisada{resumo.statusRevisada === 1 ? '' : 's'}
            </Link>
          ) : null}
          {resumo.statusRevisada > 0 && (resumo.statusPromovida > 0 || resumo.statusDescartada > 0) ? ' · ' : ''}
          {resumo.statusPromovida > 0 ? (
            <Link
              href="/inventario-ana?status=promovida_a_posto"
              className="text-gov-azul hover:underline"
            >
              {resumo.statusPromovida.toLocaleString('pt-BR')} promovida{resumo.statusPromovida === 1 ? '' : 's'} a posto
            </Link>
          ) : null}
          {resumo.statusPromovida > 0 && resumo.statusDescartada > 0 ? ' · ' : ''}
          {resumo.statusDescartada > 0 ? (
            <Link
              href="/inventario-ana?status=descartada"
              className="text-gov-azul hover:underline"
            >
              {resumo.statusDescartada.toLocaleString('pt-BR')} descartada{resumo.statusDescartada === 1 ? '' : 's'}
            </Link>
          ) : null}
          .
        </p>
      ) : null}
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

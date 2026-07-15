'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, ClipboardList, Plus } from 'lucide-react';
import { Alerta } from '@/components/ui/Alerta';
import { Button } from '@/components/ui/Button';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { SkeletonGrupo } from '@/components/ui/Skeleton';
import { LiveRegion } from '@/components/a11y/LiveRegion';
import { ROTULO_NATUREZA, formatarDataHora } from '../rotulos';
import { ROTULO_UNIDADE_FISICA } from '../rotulos';
import { listarConferencias, obterConferencia } from '../conferencia-api';
import { ErroEstoque } from '../erros';
import { progressoContagem, ROTULO_STATUS_CONFERENCIA } from '../conferencia-ui';
import type {
  ConferenciaDTO,
  ResumoDivergenciasDTO,
  NaturezaConferida,
  StatusConferencia,
} from '../conferencia-dtos';
import type { UnidadeFisica } from '../dtos';
import { UNIDADES_FISICAS } from '@/domain/estoque/local';
import { BadgeStatusConferencia } from './BadgeConferencia';
import { AbrirConferenciaDialog } from './AbrirConferenciaDialog';

interface Props {
  podeGerenciar: boolean;
}

const POR_PAGINA = 15;

const CLASSE_SELECT =
  'w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface';

interface FiltrosLista {
  unidade: '' | UnidadeFisica;
  natureza: '' | NaturezaConferida;
  status: '' | StatusConferencia;
}

const FILTROS_INICIAIS: FiltrosLista = { unidade: '', natureza: '', status: '' };

type Carga =
  | { fase: 'carregando' }
  | { fase: 'erro'; mensagem: string }
  | { fase: 'ok'; itens: ConferenciaDTO[]; total: number };

/**
 * Lista de sessoes de conferencia (inventario). Filtros por unidade, natureza e
 * status; cada linha leva ao detalhe. "Nova conferencia" (admin) abre o dialog de
 * abertura com snapshot. Leitura para todos; escrita escondida de quem so
 * consulta. Progresso por linha resolvido do resumo (tolerante a falha).
 */
export function ConferenciaLista({ podeGerenciar }: Props) {
  const [filtros, setFiltros] = useState<FiltrosLista>(FILTROS_INICIAIS);
  const [pagina, setPagina] = useState(1);
  const [carga, setCarga] = useState<Carga>({ fase: 'carregando' });
  const [resumos, setResumos] = useState<Map<string, ResumoDivergenciasDTO>>(new Map());
  const [versao, setVersao] = useState(0);
  const [dialogAberto, setDialogAberto] = useState(false);
  const [anuncio, setAnuncio] = useState('');

  const idBase = useId();
  const recarregar = useCallback(() => setVersao((v) => v + 1), []);

  useEffect(() => {
    setPagina(1);
  }, [filtros.unidade, filtros.natureza, filtros.status]);

  useEffect(() => {
    let ativo = true;
    const c = new AbortController();
    setCarga({ fase: 'carregando' });
    listarConferencias(
      {
        unidade: filtros.unidade || undefined,
        natureza: filtros.natureza || undefined,
        status: filtros.status || undefined,
        pagina,
        porPagina: POR_PAGINA,
      },
      c.signal,
    )
      .then((r) => {
        if (ativo) setCarga({ fase: 'ok', itens: r.itens, total: r.total });
      })
      .catch((e) => {
        if (!ativo || c.signal.aborted) return;
        setCarga({
          fase: 'erro',
          mensagem:
            e instanceof ErroEstoque ? e.message : 'Não foi possível carregar as conferências.',
        });
      });
    return () => {
      ativo = false;
      c.abort();
    };
  }, [filtros.unidade, filtros.natureza, filtros.status, pagina, versao]);

  // Progresso por linha: o DTO da lista nao traz contagens, entao buscamos o
  // resumo de cada linha visivel em paralelo (tolerante: linha sem resumo mostra
  // "—"). Reavaliar quando a lista incluir contagens no proprio DTO.
  useEffect(() => {
    if (carga.fase !== 'ok' || carga.itens.length === 0) {
      setResumos(new Map());
      return;
    }
    let ativo = true;
    const c = new AbortController();
    const alvos = carga.itens.filter((i) => i.status !== 'cancelada');
    Promise.allSettled(alvos.map((alvo) => obterConferencia(alvo.id, c.signal).then((d) => ({ id: alvo.id, resumo: d.resumo })))).then(
      (res) => {
        if (!ativo) return;
        const mapa = new Map<string, ResumoDivergenciasDTO>();
        for (const r of res) {
          if (r.status === 'fulfilled') mapa.set(r.value.id, r.value.resumo);
        }
        setResumos(mapa);
      },
    );
    return () => {
      ativo = false;
      c.abort();
    };
  }, [carga]);

  const totalPaginas = useMemo(
    () => (carga.fase === 'ok' ? Math.max(1, Math.ceil(carga.total / POR_PAGINA)) : 1),
    [carga],
  );

  return (
    <div className="space-y-4">
      <LiveRegion mensagem={anuncio} />

      {/* Cabecalho + voltar ao Estoque */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/estoque"
            className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Voltar ao Estoque
          </Link>
          <h1 className="text-xl font-semibold text-app-fg">Conferências de estoque</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted">
            Inventário físico por unidade e natureza. Abra uma sessão, conte os itens no local e
            reconcilie as divergências com trilha de auditoria
          </p>
        </div>
        {podeGerenciar ? (
          <Button
            type="button"
            onClick={() => setDialogAberto(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nova conferência
          </Button>
        ) : null}
      </div>

      {/* Filtros */}
      <div className="rounded-gov-card border border-app-border-subtle bg-app-surface p-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <FiltroSelect
            id={`${idBase}-unidade`}
            rotulo="Unidade"
            valor={filtros.unidade}
            aoMudar={(v) => setFiltros((f) => ({ ...f, unidade: v as FiltrosLista['unidade'] }))}
            opcoes={[
              { valor: '', rotulo: 'Todas' },
              ...UNIDADES_FISICAS.map((u) => ({ valor: u, rotulo: ROTULO_UNIDADE_FISICA[u] })),
            ]}
          />
          <FiltroSelect
            id={`${idBase}-natureza`}
            rotulo="Natureza"
            valor={filtros.natureza}
            aoMudar={(v) => setFiltros((f) => ({ ...f, natureza: v as FiltrosLista['natureza'] }))}
            opcoes={[
              { valor: '', rotulo: 'Todas' },
              { valor: 'serializado', rotulo: ROTULO_NATUREZA.serializado },
              { valor: 'quantificavel', rotulo: ROTULO_NATUREZA.quantificavel },
            ]}
          />
          <FiltroSelect
            id={`${idBase}-status`}
            rotulo="Status"
            valor={filtros.status}
            aoMudar={(v) => setFiltros((f) => ({ ...f, status: v as FiltrosLista['status'] }))}
            opcoes={[
              { valor: '', rotulo: 'Todos' },
              { valor: 'aberta', rotulo: ROTULO_STATUS_CONFERENCIA.aberta },
              { valor: 'concluida', rotulo: ROTULO_STATUS_CONFERENCIA.concluida },
              { valor: 'cancelada', rotulo: ROTULO_STATUS_CONFERENCIA.cancelada },
            ]}
          />
        </div>
      </div>

      {/* Conteudo */}
      {carga.fase === 'carregando' ? (
        <SkeletonGrupo rotulo="Carregando conferências">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-gov-card bg-app-border-subtle" />
            ))}
          </div>
        </SkeletonGrupo>
      ) : carga.fase === 'erro' ? (
        <div className="space-y-3">
          <Alerta tipo="erro" titulo="Erro ao carregar">
            {carga.mensagem}
          </Alerta>
          <Button type="button" variante="secundario" onClick={recarregar}>
            Tentar novamente
          </Button>
        </div>
      ) : carga.itens.length === 0 ? (
        <EstadoVazio
          icone={ClipboardList}
          titulo="Nenhuma conferência"
          descricao={
            podeGerenciar
              ? 'Abra uma nova conferência para iniciar o inventário físico de uma unidade.'
              : 'Ainda não há conferências para consultar. Ajuste os filtros ou volte mais tarde.'
          }
        />
      ) : (
        <>
          <ul className="space-y-2">
            {carga.itens.map((conf) => (
              <li key={conf.id}>
                <LinhaConferencia conferencia={conf} resumo={resumos.get(conf.id)} />
              </li>
            ))}
          </ul>
          <Paginacao
            pagina={pagina}
            totalPaginas={totalPaginas}
            total={carga.total}
            aoPaginar={setPagina}
          />
        </>
      )}

      <AbrirConferenciaDialog
        aberto={dialogAberto}
        aoFechar={() => setDialogAberto(false)}
        aoAbrir={(msg) => {
          setDialogAberto(false);
          setAnuncio(msg);
          recarregar();
        }}
      />
    </div>
  );
}

function LinhaConferencia({
  conferencia,
  resumo,
}: {
  conferencia: ConferenciaDTO;
  resumo: ResumoDivergenciasDTO | undefined;
}) {
  const prog = resumo ? progressoContagem(resumo.contados, resumo.totalItens) : null;
  return (
    <Link
      href={`/estoque/conferencias/${conferencia.id}`}
      className="group flex items-center gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-3 transition-colors hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-app-fg">
            {ROTULO_UNIDADE_FISICA[conferencia.unidade]} · {ROTULO_NATUREZA[conferencia.natureza]}
          </span>
          <BadgeStatusConferencia status={conferencia.status} />
          {conferencia.localId ? (
            <span className="text-2xs text-app-fg-muted">Local específico</span>
          ) : (
            <span className="text-2xs text-app-fg-muted">Unidade inteira</span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-app-fg-muted">
          <span>Aberta em {formatarDataHora(conferencia.criadaEm)}</span>
          {prog ? (
            <span className="tabular">
              {prog.texto}
              {resumo && resumo.pendentesReconciliacao > 0
                ? ` · ${resumo.pendentesReconciliacao.toLocaleString('pt-BR')} pendente(s) de reconciliação`
                : ''}
            </span>
          ) : conferencia.status !== 'cancelada' ? (
            <span aria-hidden="true">—</span>
          ) : null}
        </div>
        {prog ? (
          <div
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-app-surface-2"
            role="progressbar"
            aria-valuenow={prog.pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso da contagem: ${prog.texto}`}
          >
            <div
              className="h-full rounded-full bg-gov-azul transition-[width]"
              style={{ width: `${prog.pct}%` }}
            />
          </div>
        ) : null}
      </div>
      <ChevronRight
        className="h-5 w-5 shrink-0 text-app-fg-subtle group-hover:text-app-fg"
        aria-hidden="true"
      />
    </Link>
  );
}

function FiltroSelect({
  id,
  rotulo,
  valor,
  opcoes,
  aoMudar,
}: {
  id: string;
  rotulo: string;
  valor: string;
  opcoes: { valor: string; rotulo: string }[];
  aoMudar: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-app-fg">
        {rotulo}
      </label>
      <div className="relative">
        <select
          id={id}
          value={valor}
          onChange={(e) => aoMudar(e.target.value)}
          className={CLASSE_SELECT}
        >
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-app-fg-muted"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

function Paginacao({
  pagina,
  totalPaginas,
  total,
  aoPaginar,
}: {
  pagina: number;
  totalPaginas: number;
  total: number;
  aoPaginar: (p: number) => void;
}) {
  if (totalPaginas <= 1) return null;
  return (
    <nav
      aria-label="Paginação das conferências"
      className="flex flex-wrap items-center justify-between gap-3 border-t border-app-border-subtle pt-3"
    >
      <p className="text-xs text-app-fg-muted tabular">
        Página {pagina} de {totalPaginas} — {total.toLocaleString('pt-BR')} conferências
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => aoPaginar(Math.max(1, pagina - 1))}
          disabled={pagina <= 1}
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Anterior
        </button>
        <button
          type="button"
          onClick={() => aoPaginar(Math.min(totalPaginas, pagina + 1))}
          disabled={pagina >= totalPaginas}
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Próxima
        </button>
      </div>
    </nav>
  );
}

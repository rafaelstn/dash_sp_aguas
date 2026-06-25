import { Suspense } from 'react';
import Link from 'next/link';
import {
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  listarTriagemPendentes,
} from '@/application/use-cases/triagem/listar-triagem-pendentes';
import {
  CODIGOS_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  type CodigoTipoDocumento,
  rotuloTipoDocumento,
} from '@/domain/tipo-documento';
import { UsuarioNaoEhAprovador } from '@/domain/errors';
import { Tabela, type ColunaTabela } from '@/components/ui/Tabela';
import { Paginador } from '@/components/ui/Paginador';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alerta } from '@/components/ui/Alerta';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { BadgeEstado } from '@/components/features/triagem/BadgeEstado';
import { AtalhosListaTriagem } from '@/components/features/triagem/AtalhosListaTriagem';
import { tempoRelativo } from '@/lib/triagem-api';
import { logger } from '@/infrastructure/logging/logger';
import type { FichaTriagem } from '@/domain/triagem';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Triagem de fichas — SP Águas - DMO',
};

const POR_PAGINA = 25;

interface PageProps {
  searchParams: Promise<{
    pagina?: string;
    tipo?: string;
    prefixo?: string;
    desde?: string;
    ate?: string;
  }>;
}

interface FiltrosResolvidos {
  pagina: number;
  codTipoDocumento: CodigoTipoDocumento | undefined;
  prefixo: string | undefined;
  desde: string | undefined;
  ate: string | undefined;
}

function resolverFiltros(sp: Awaited<PageProps['searchParams']>): FiltrosResolvidos {
  const pagina = Math.max(1, Number(sp.pagina ?? 1) || 1);
  const tipoNum = sp.tipo ? Number(sp.tipo) : undefined;
  const tipoValido =
    tipoNum !== undefined &&
    Number.isInteger(tipoNum) &&
    (CODIGOS_TIPO_DOCUMENTO as readonly number[]).includes(tipoNum)
      ? (tipoNum as CodigoTipoDocumento)
      : undefined;

  const ehData = (s: string | undefined) =>
    s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;

  return {
    pagina,
    codTipoDocumento: tipoValido,
    prefixo: sp.prefixo?.trim() || undefined,
    desde: ehData(sp.desde),
    ate: ehData(sp.ate),
  };
}

function paramsBase(filtros: FiltrosResolvidos): URLSearchParams {
  const u = new URLSearchParams();
  if (filtros.codTipoDocumento) u.set('tipo', String(filtros.codTipoDocumento));
  if (filtros.prefixo) u.set('prefixo', filtros.prefixo);
  if (filtros.desde) u.set('desde', filtros.desde);
  if (filtros.ate) u.set('ate', filtros.ate);
  return u;
}

function Filtros({ filtros }: { filtros: FiltrosResolvidos }) {
  return (
    <form
      method="get"
      role="search"
      aria-label="Filtrar fichas em triagem"
      className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <div>
        <label htmlFor="filtro-tipo" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Tipo de ficha
        </label>
        <select
          id="filtro-tipo"
          name="tipo"
          defaultValue={filtros.codTipoDocumento ? String(filtros.codTipoDocumento) : ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <option value="">Todos</option>
          {CODIGOS_TIPO_DOCUMENTO.map((c) => (
            <option key={c} value={c}>
              {TIPOS_DOCUMENTO[c].rotulo}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="filtro-prefixo" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Prefixo do posto
        </label>
        <input
          id="filtro-prefixo"
          name="prefixo"
          type="text"
          inputMode="text"
          autoComplete="off"
          maxLength={32}
          defaultValue={filtros.prefixo ?? ''}
          placeholder="3D-001"
          className="mono block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        />
      </div>

      <div>
        <label htmlFor="filtro-desde" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Submetidas a partir de
        </label>
        <input
          id="filtro-desde"
          name="desde"
          type="date"
          defaultValue={filtros.desde ?? ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        />
      </div>

      <div>
        <label htmlFor="filtro-ate" className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
          Submetidas até
        </label>
        <input
          id="filtro-ate"
          name="ate"
          type="date"
          defaultValue={filtros.ate ?? ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        />
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4 lg:justify-end">
        <Link
          href="/triagem"
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          Limpar
        </Link>
        <button
          type="submit"
          className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Aplicar filtros
        </button>
      </div>
    </form>
  );
}

function SkeletonLista() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

async function Lista({ filtros }: { filtros: FiltrosResolvidos }) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return (
      <Alerta tipo="aviso" titulo="Sessão necessária">
        Acesse o sistema com uma conta autorizada para visualizar a fila de
        triagem.
      </Alerta>
    );
  }

  let resultado: { itens: FichaTriagem[]; total: number };
  try {
    resultado = await listarTriagemPendentes(
      triagemRepository,
      papeisRepository,
      usuario.id,
      {
        codTipoDocumento: filtros.codTipoDocumento,
        prefixo: filtros.prefixo,
        desde: filtros.desde
          ? new Date(`${filtros.desde}T00:00:00Z`)
          : undefined,
        ate: filtros.ate ? new Date(`${filtros.ate}T23:59:59Z`) : undefined,
        limite: POR_PAGINA,
        offset: (filtros.pagina - 1) * POR_PAGINA,
      },
    );
  } catch (e) {
    if (e instanceof UsuarioNaoEhAprovador) {
      return (
        <Alerta tipo="aviso" titulo="Acesso restrito">
          Acesso restrito ao papel de aprovador. Solicite ao gestor a
          atribuição do papel para revisar fichas em triagem.
        </Alerta>
      );
    }
    logger.error(
      'triagem.listar.falha',
      { motivo: e instanceof Error ? e.message : String(e) },
      'Falha ao listar a fila de triagem',
    );
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar a fila de triagem">
        Não foi possível concluir a operação. Tente novamente em instantes. Se
        o erro persistir, contate o administrador do sistema.
      </Alerta>
    );
  }

  if (resultado.itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhuma ficha pendente de triagem no momento."
        descricao="As fichas submetidas pelos técnicos de campo pelo aplicativo móvel serão exibidas nesta tela para revisão."
      />
    );
  }

  const colunas: ColunaTabela<FichaTriagem>[] = [
    {
      chave: 'submissao',
      cabecalho: 'Submissão',
      largura: '170px',
      render: (f) => (
        <div className="flex flex-col">
          <span className="font-medium text-app-fg tabular">
            {f.criadaEm.toLocaleString('pt-BR', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
          </span>
          <span className="text-2xs text-app-fg-muted">
            {tempoRelativo(f.criadaEm)}
          </span>
        </div>
      ),
    },
    {
      chave: 'tecnico',
      cabecalho: 'Técnico',
      render: (f) => (
        <div className="flex flex-col">
          <span className="text-app-fg">{f.tecnicoNome}</span>
        </div>
      ),
    },
    {
      chave: 'tipo',
      cabecalho: 'Tipo',
      largura: '170px',
      render: (f) => (
        <span className="text-app-fg">
          {rotuloTipoDocumento(f.codTipoDocumento)}
        </span>
      ),
    },
    {
      chave: 'posto',
      cabecalho: 'Posto',
      largura: '120px',
      render: (f) => <span className="mono text-app-fg">{f.prefixo}</span>,
    },
    {
      chave: 'estado',
      cabecalho: 'Estado',
      largura: '130px',
      render: (f) => <BadgeEstado estado={f.estado} />,
    },
  ];

  function hrefPagina(n: number): string {
    const p = paramsBase(filtros);
    if (n > 1) p.set('pagina', String(n));
    const qs = p.toString();
    return qs ? `/triagem?${qs}` : '/triagem';
  }

  return (
    <div className="space-y-3">
      <Tabela<FichaTriagem>
        legenda="Fichas pendentes ou em revisão"
        colunas={colunas}
        itens={resultado.itens}
        chaveItem={(f) => f.id}
        hrefLinha={(f) => `/triagem/${f.id}`}
      />

      <Paginador
        pagina={filtros.pagina}
        porPagina={POR_PAGINA}
        total={resultado.total}
        hrefPagina={hrefPagina}
        rotuloAria="Paginação da fila de triagem"
      />
    </div>
  );
}

export default async function TriagemListaPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filtros = resolverFiltros(sp);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">
          Triagem de fichas
        </h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Fichas submetidas pelos técnicos de campo, ordenadas por data de
          submissão (mais antigas primeiro).
        </p>
      </header>

      <Filtros filtros={filtros} />

      <Suspense fallback={<SkeletonLista />}>
        <Lista filtros={filtros} />
      </Suspense>

      <AtalhosListaTriagem />
    </div>
  );
}

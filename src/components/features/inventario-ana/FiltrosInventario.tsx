import Link from 'next/link';

export interface FiltrosUI {
  operando: 'sim' | 'nao' | 'todos' | undefined;
  status: string | undefined;
  divergencia: string | undefined;
  semMatch: 'true' | 'false' | undefined;
  busca: string | undefined;
}

interface Props {
  filtros: FiltrosUI;
}

export function FiltrosInventario({ filtros }: Props) {
  return (
    <form
      method="get"
      role="search"
      aria-label="Filtrar estações ANA"
      className="grid gap-3 rounded-gov-card border border-app-border-subtle bg-app-surface p-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      <div className="lg:col-span-2">
        <label
          htmlFor="busca"
          className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Busca
        </label>
        <input
          id="busca"
          name="busca"
          type="text"
          autoComplete="off"
          maxLength={80}
          defaultValue={filtros.busca ?? ''}
          placeholder="código ANA, prefixo ou nome"
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        />
      </div>

      <div>
        <label
          htmlFor="operando"
          className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Operando
        </label>
        <select
          id="operando"
          name="operando"
          defaultValue={filtros.operando ?? ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <option value="">Todos</option>
          <option value="sim">Sim (prioridade)</option>
          <option value="nao">Não</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="divergencia"
          className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Município ↔ coord
        </label>
        <select
          id="divergencia"
          name="divergencia"
          defaultValue={filtros.divergencia ?? ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <option value="">Todos</option>
          <option value="divergente">Divergente (≥10km)</option>
          <option value="margem_aceitavel">Margem (&lt;10km)</option>
          <option value="ok">OK</option>
          <option value="sem_coordenada">Sem coordenada</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="status"
          className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={filtros.status ?? ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <option value="">Todos</option>
          <option value="pendente">Pendente</option>
          <option value="em_revisao">Em revisão</option>
          <option value="revisada">Revisada</option>
          <option value="descartada">Descartada</option>
        </select>
      </div>

      <div>
        <label
          htmlFor="semMatch"
          className="mb-1 block text-2xs font-semibold uppercase tracking-wider text-app-fg-muted"
        >
          Match
        </label>
        <select
          id="semMatch"
          name="semMatch"
          defaultValue={filtros.semMatch ?? ''}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
        >
          <option value="">Todos</option>
          <option value="false">Com match em postos</option>
          <option value="true">Sem match</option>
        </select>
      </div>

      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
        <Link
          href="/inventario-ana"
          className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
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
  );
}

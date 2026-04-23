import Link from 'next/link';
import type { FacetasPostos } from '@/application/ports/facetas-repository';

export interface ValoresFiltros {
  q?: string;
  ugrhi?: string;
  municipio?: string;
  bacia?: string;
  tipo?: string;
  tem_fd?: boolean;
  tem_fi?: boolean;
  tem_telem?: boolean;
  favoritos?: boolean;
}

export interface PainelFiltrosProps {
  facetas: FacetasPostos;
  valores: ValoresFiltros;
  /** Mostra o checkbox "Apenas favoritos" quando o usuário está autenticado. */
  mostrarFavoritos?: boolean;
}

/**
 * Painel de filtros URL-driven. É um <form GET> que navega pra "/" com os
 * query params preenchidos. Zero JavaScript no cliente — funciona com JS off.
 *
 * Remover um filtro individualmente é feito pelo <ChipsFiltrosAtivos> (client).
 */
export function PainelFiltros({
  facetas,
  valores,
  mostrarFavoritos = false,
}: PainelFiltrosProps) {
  return (
    <form
      role="search"
      aria-label="Filtrar postos"
      method="GET"
      action="/"
      className="bg-white border border-gov-borda rounded-gov-card shadow-gov-card p-4 space-y-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gov-texto">UGRHI</span>
          <select
            name="ugrhi"
            defaultValue={valores.ugrhi ?? ''}
            className="px-3 py-2 border border-gov-borda rounded bg-white text-gov-texto"
          >
            <option value="">Todas</option>
            {facetas.ugrhis.map((u) => (
              <option key={u.numero} value={u.numero}>
                {u.numero} — {u.nome} ({u.total})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-gov-texto">Tipo de posto</span>
          <select
            name="tipo"
            defaultValue={valores.tipo ?? ''}
            className="px-3 py-2 border border-gov-borda rounded bg-white text-gov-texto"
          >
            <option value="">Todos</option>
            {facetas.tiposPosto.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} ({t.total})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-gov-texto">Município</span>
          <input
            type="text"
            name="municipio"
            list="lista-municipios"
            defaultValue={valores.municipio ?? ''}
            placeholder="Comece a digitar…"
            className="px-3 py-2 border border-gov-borda rounded bg-white text-gov-texto"
          />
          <datalist id="lista-municipios">
            {facetas.municipios.slice(0, 500).map((m) => (
              <option key={m.nome} value={m.nome} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-sm font-medium text-gov-texto">Bacia hidrográfica</span>
          <input
            type="text"
            name="bacia"
            list="lista-bacias"
            defaultValue={valores.bacia ?? ''}
            placeholder="Comece a digitar…"
            className="px-3 py-2 border border-gov-borda rounded bg-white text-gov-texto"
          />
          <datalist id="lista-bacias">
            {facetas.bacias.slice(0, 300).map((b) => (
              <option key={b.nome} value={b.nome} />
            ))}
          </datalist>
        </label>
      </div>

      <fieldset className="grid gap-2 sm:grid-cols-2">
        <legend className="text-sm font-medium text-gov-texto mb-1">
          Com cadastro de:
        </legend>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="tem_fd"
            value="1"
            defaultChecked={Boolean(valores.tem_fd)}
            className="w-4 h-4 accent-gov-azul"
          />
          Ficha Descritiva
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="tem_fi"
            value="1"
            defaultChecked={Boolean(valores.tem_fi)}
            className="w-4 h-4 accent-gov-azul"
          />
          Ficha de Inspeção
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="tem_telem"
            value="1"
            defaultChecked={Boolean(valores.tem_telem)}
            className="w-4 h-4 accent-gov-azul"
          />
          Telemetria
        </label>
        {mostrarFavoritos ? (
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="favoritos"
              value="1"
              defaultChecked={Boolean(valores.favoritos)}
              className="w-4 h-4 accent-gov-azul"
            />
            Apenas meus favoritos
          </label>
        ) : null}
      </fieldset>

      {/* preserva o termo de busca atual ao aplicar filtros */}
      <input type="hidden" name="q" value={valores.q ?? ''} />

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          className="px-4 py-2 rounded bg-gov-azul text-white text-sm font-medium hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          Aplicar filtros
        </button>
        <Link
          href="/"
          className="text-sm text-gov-muted hover:text-gov-texto underline-offset-4 hover:underline"
        >
          Limpar
        </Link>
      </div>
    </form>
  );
}

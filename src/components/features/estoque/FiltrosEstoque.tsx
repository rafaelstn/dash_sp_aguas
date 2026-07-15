'use client';

import { useId } from 'react';
import { Search, X } from 'lucide-react';
import { ESTADOS } from '@/domain/estoque/estado';
import { STATUS } from '@/domain/estoque/status-unidade';
import { UNIDADES_FISICAS } from '@/domain/estoque/local';
import type { CategoriaDTO, Estado, LocalDTO, Natureza, Status, UnidadeFisica } from './dtos';
import { ROTULO_ESTADO, ROTULO_STATUS, ROTULO_UNIDADE_FISICA } from './rotulos';

export interface FiltrosEstoqueUI {
  busca: string;
  unidade: '' | UnidadeFisica;
  local: string;
  estado: '' | Estado;
  status: '' | Status;
  categoria: string;
  /** So quantificaveis: exibe apenas os materiais abaixo do minimo (reposicao). */
  somenteAbaixoMinimo: boolean;
}

export const FILTROS_ESTOQUE_INICIAIS: FiltrosEstoqueUI = {
  busca: '',
  unidade: '',
  local: '',
  estado: '',
  status: '',
  categoria: '',
  somenteAbaixoMinimo: false,
};

interface Props {
  valor: FiltrosEstoqueUI;
  aoMudar: (v: FiltrosEstoqueUI) => void;
  /** Aba ativa: define quais filtros aparecem. */
  natureza: Natureza;
  locais: readonly LocalDTO[];
  categorias: readonly CategoriaDTO[];
}

const CLASSE_SELECT =
  'w-full appearance-none rounded border border-app-border-input bg-app-surface px-3 py-2 pr-8 text-sm text-app-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface';

/**
 * Filtros do estoque, no mesmo estilo do Monitor. Adapta-se a natureza ativa:
 * serializados filtram por estado/situacao; quantificaveis por categoria. Local
 * lista apenas os da unidade escolhida (ou todos). A11y: label em todo controle,
 * botao de limpar busca, foco visivel.
 */
export function FiltrosEstoque({ valor, aoMudar, natureza, locais, categorias }: Props) {
  const idBase = useId();
  const idBusca = `${idBase}-busca`;
  const idUnidade = `${idBase}-unidade`;
  const idLocal = `${idBase}-local`;
  const idEstado = `${idBase}-estado`;
  const idStatus = `${idBase}-status`;
  const idCategoria = `${idBase}-categoria`;
  const idReposicao = `${idBase}-reposicao`;
  const serializado = natureza === 'serializado';

  const locaisVisiveis = valor.unidade
    ? locais.filter((l) => l.unidade === valor.unidade)
    : locais;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {/* Busca */}
      <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1">
        <label htmlFor={idBusca} className="text-sm font-medium text-app-fg">
          {serializado ? 'Buscar por descrição, patrimônio ou série' : 'Buscar por descrição'}
        </label>
        <div className="relative">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-app-fg-muted"
          />
          <input
            id={idBusca}
            type="text"
            inputMode="search"
            value={valor.busca}
            onChange={(e) => aoMudar({ ...valor, busca: e.target.value })}
            placeholder={serializado ? 'Descrição, patrimônio, série ou IMEI' : 'Descrição do material'}
            className="w-full rounded border border-app-border-input bg-app-surface py-2 pl-8 pr-8 text-sm text-app-fg placeholder:text-app-fg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gov-azul focus-visible:ring-offset-1 focus-visible:ring-offset-app-surface"
          />
          {valor.busca ? (
            <button
              type="button"
              onClick={() => aoMudar({ ...valor, busca: '' })}
              aria-label="Limpar busca"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Unidade fisica */}
      <div className="flex flex-col gap-1">
        <label htmlFor={idUnidade} className="text-sm font-medium text-app-fg">
          Unidade
        </label>
        <div className="relative">
          <select
            id={idUnidade}
            value={valor.unidade}
            onChange={(e) =>
              // Ao trocar de unidade, zera o local (evita local de outra unidade).
              aoMudar({ ...valor, unidade: e.target.value as FiltrosEstoqueUI['unidade'], local: '' })
            }
            className={CLASSE_SELECT}
          >
            <option value="">Todas as unidades</option>
            {UNIDADES_FISICAS.map((u) => (
              <option key={u} value={u}>
                {ROTULO_UNIDADE_FISICA[u]}
              </option>
            ))}
          </select>
          <SetaSelect />
        </div>
      </div>

      {/* Local */}
      <div className="flex flex-col gap-1">
        <label htmlFor={idLocal} className="text-sm font-medium text-app-fg">
          Local
        </label>
        <div className="relative">
          <select
            id={idLocal}
            value={valor.local}
            onChange={(e) => aoMudar({ ...valor, local: e.target.value })}
            className={CLASSE_SELECT}
          >
            <option value="">Todos os locais</option>
            {locaisVisiveis.map((l) => (
              <option key={l.id} value={l.id}>
                {l.rotulo}
              </option>
            ))}
          </select>
          <SetaSelect />
        </div>
      </div>

      {serializado ? (
        <>
          {/* Estado fisico */}
          <div className="flex flex-col gap-1">
            <label htmlFor={idEstado} className="text-sm font-medium text-app-fg">
              Estado
            </label>
            <div className="relative">
              <select
                id={idEstado}
                value={valor.estado}
                onChange={(e) =>
                  aoMudar({ ...valor, estado: e.target.value as FiltrosEstoqueUI['estado'] })
                }
                className={CLASSE_SELECT}
              >
                <option value="">Todos os estados</option>
                {ESTADOS.map((es) => (
                  <option key={es} value={es}>
                    {ROTULO_ESTADO[es]}
                  </option>
                ))}
              </select>
              <SetaSelect />
            </div>
          </div>

          {/* Situacao / status */}
          <div className="flex flex-col gap-1">
            <label htmlFor={idStatus} className="text-sm font-medium text-app-fg">
              Situação
            </label>
            <div className="relative">
              <select
                id={idStatus}
                value={valor.status}
                onChange={(e) =>
                  aoMudar({ ...valor, status: e.target.value as FiltrosEstoqueUI['status'] })
                }
                className={CLASSE_SELECT}
              >
                <option value="">Todas as situações</option>
                {STATUS.map((st) => (
                  <option key={st} value={st}>
                    {ROTULO_STATUS[st]}
                  </option>
                ))}
              </select>
              <SetaSelect />
            </div>
          </div>
        </>
      ) : (
        <>
          {/* Categoria (quantificaveis) */}
          <div className="flex flex-col gap-1">
            <label htmlFor={idCategoria} className="text-sm font-medium text-app-fg">
              Categoria
            </label>
            <div className="relative">
              <select
                id={idCategoria}
                value={valor.categoria}
                onChange={(e) => aoMudar({ ...valor, categoria: e.target.value })}
                className={CLASSE_SELECT}
              >
                <option value="">Todas as categorias</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
              <SetaSelect />
            </div>
          </div>

          {/* Reposicao: so os materiais abaixo do minimo. */}
          <div className="flex items-end">
            <label
              htmlFor={idReposicao}
              className="inline-flex cursor-pointer items-center gap-2 py-2 text-sm text-app-fg"
            >
              <input
                id={idReposicao}
                type="checkbox"
                checked={valor.somenteAbaixoMinimo}
                onChange={(e) =>
                  aoMudar({ ...valor, somenteAbaixoMinimo: e.target.checked })
                }
                className="h-4 w-4 rounded border-app-border-input text-gov-azul focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
              />
              Somente abaixo do mínimo
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function SetaSelect() {
  return (
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
  );
}

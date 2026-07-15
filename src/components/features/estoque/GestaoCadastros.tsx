'use client';

import { MapPin, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { Drawer } from './Drawer';
import { ROTULO_UNIDADE_FISICA } from './rotulos';
import type { CategoriaDTO, LocalDTO } from './dtos';

interface Props {
  aberto: boolean;
  locais: readonly LocalDTO[];
  categorias: readonly CategoriaDTO[];
  aoFechar: () => void;
  aoNovoLocal: () => void;
  aoEditarLocal: (l: LocalDTO) => void;
  aoExcluirLocal: (l: LocalDTO) => void;
  aoNovaCategoria: () => void;
  aoEditarCategoria: (c: CategoriaDTO) => void;
  aoExcluirCategoria: (c: CategoriaDTO) => void;
}

/**
 * Cadastros auxiliares (admin): locais e categorias, com CRUD completo. Excluir
 * confirma no fluxo do PainelEstoque; local em uso retorna 409 e vira mensagem
 * clara. Drawer para nao poluir a visao principal.
 */
export function GestaoCadastros({
  aberto,
  locais,
  categorias,
  aoFechar,
  aoNovoLocal,
  aoEditarLocal,
  aoExcluirLocal,
  aoNovaCategoria,
  aoEditarCategoria,
  aoExcluirCategoria,
}: Props) {
  return (
    <Drawer aberto={aberto} titulo="Cadastros auxiliares" aoFechar={aoFechar}>
      <div className="space-y-8">
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-app-fg">
              <MapPin className="h-4 w-4 text-app-fg-muted" aria-hidden="true" />
              Locais
            </h3>
            <BotaoAdicionar rotulo="Novo local" onClick={aoNovoLocal} />
          </div>
          {locais.length === 0 ? (
            <p className="text-sm text-app-fg-muted">Nenhum local cadastrado.</p>
          ) : (
            <ul className="divide-y divide-app-border-subtle rounded-gov-card border border-app-border-subtle">
              {locais.map((l) => (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-app-fg">{l.rotulo}</p>
                    <p className="text-2xs text-app-fg-muted">{ROTULO_UNIDADE_FISICA[l.unidade]}</p>
                  </div>
                  <BotaoIcone rotulo={`Editar ${l.rotulo}`} icone={Pencil} onClick={() => aoEditarLocal(l)} />
                  <BotaoIcone
                    rotulo={`Excluir ${l.rotulo}`}
                    icone={Trash2}
                    perigo
                    onClick={() => aoExcluirLocal(l)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-app-fg">
              <Tag className="h-4 w-4 text-app-fg-muted" aria-hidden="true" />
              Categorias
            </h3>
            <BotaoAdicionar rotulo="Nova categoria" onClick={aoNovaCategoria} />
          </div>
          {categorias.length === 0 ? (
            <p className="text-sm text-app-fg-muted">Nenhuma categoria cadastrada.</p>
          ) : (
            <ul className="divide-y divide-app-border-subtle rounded-gov-card border border-app-border-subtle">
              {categorias.map((c) => (
                <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-app-fg">{c.nome}</p>
                  <BotaoIcone rotulo={`Editar ${c.nome}`} icone={Pencil} onClick={() => aoEditarCategoria(c)} />
                  <BotaoIcone
                    rotulo={`Excluir ${c.nome}`}
                    icone={Trash2}
                    perigo
                    onClick={() => aoExcluirCategoria(c)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}

function BotaoAdicionar({ rotulo, onClick }: { rotulo: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded border border-gov-azul px-2.5 py-1 text-xs font-medium text-gov-azul hover:bg-app-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
    >
      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
      {rotulo}
    </button>
  );
}

function BotaoIcone({
  rotulo,
  icone: Icone,
  onClick,
  perigo,
}: {
  rotulo: string;
  icone: typeof Pencil;
  onClick: () => void;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={[
        'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul',
        perigo
          ? 'border-red-300 text-gov-perigo hover:bg-red-50'
          : 'border-app-border-subtle text-app-fg-muted hover:bg-app-surface-2 hover:text-app-fg',
      ].join(' ')}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

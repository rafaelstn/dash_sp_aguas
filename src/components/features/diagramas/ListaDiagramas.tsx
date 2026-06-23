'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Workflow, Copy, Pencil, Trash2, Plus } from 'lucide-react';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DialogNomeDiagrama } from './DialogNomeDiagrama';
import type { DiagramaResumo } from '@/domain/diagramas/diagrama';

interface Props {
  diagramasIniciais: DiagramaResumo[];
}

type DialogNome =
  | { modo: 'criar' }
  | { modo: 'renomear'; id: string; nome: string }
  | null;

const formatadorData = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Lista de diagramas com CRUD completo: criar, abrir, renomear, duplicar e
 * excluir. Toda confirmação/entrada usa dialog do projeto (sem window.*).
 * Após cada mutação, `router.refresh()` revalida a lista server-side.
 */
export function ListaDiagramas({ diagramasIniciais }: Props) {
  const router = useRouter();
  const [pendente, iniciarTransicao] = useTransition();
  const [dialogNome, setDialogNome] = useState<DialogNome>(null);
  const [aExcluir, setAExcluir] = useState<DiagramaResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function aoFalhar(mensagem: string) {
    setErro(mensagem);
  }

  async function criar(nome: string) {
    const resp = await fetch('/api/diagramas', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    if (!resp.ok) throw new Error('Não foi possível criar o diagrama.');
    const { diagrama } = (await resp.json()) as { diagrama: { id: string } };
    setDialogNome(null);
    router.push(`/diagramas/${diagrama.id}`);
  }

  async function renomear(id: string, nome: string) {
    const resp = await fetch(`/api/diagramas/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ nome }),
    });
    if (!resp.ok) throw new Error('Não foi possível renomear o diagrama.');
    setDialogNome(null);
    iniciarTransicao(() => router.refresh());
  }

  function duplicar(id: string) {
    setErro(null);
    iniciarTransicao(async () => {
      const resp = await fetch(`/api/diagramas/${id}/duplicar`, {
        method: 'POST',
      });
      if (!resp.ok) {
        aoFalhar('Não foi possível duplicar o diagrama.');
        return;
      }
      router.refresh();
    });
  }

  async function excluir() {
    if (!aExcluir) return;
    const resp = await fetch(`/api/diagramas/${aExcluir.id}`, {
      method: 'DELETE',
    });
    if (!resp.ok) throw new Error('Não foi possível excluir o diagrama.');
    setAExcluir(null);
    iniciarTransicao(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-app-fg">Diagramas unifilares</h1>
          <p className="mt-0.5 text-xs text-app-fg-muted tabular">
            {diagramasIniciais.length.toLocaleString('pt-BR')}{' '}
            {diagramasIniciais.length === 1 ? 'diagrama' : 'diagramas'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setErro(null);
            setDialogNome({ modo: 'criar' });
          }}
          className="inline-flex items-center gap-1.5 rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Novo diagrama
        </button>
      </header>

      {erro ? (
        <div
          role="alert"
          className="rounded border-l-4 border-gov-perigo bg-red-50 p-3 text-sm text-gov-perigo"
        >
          {erro}
        </div>
      ) : null}

      {diagramasIniciais.length === 0 ? (
        <div className="rounded-gov-card border border-dashed border-app-border-subtle bg-app-surface p-8 text-center">
          <Workflow
            className="mx-auto h-8 w-8 text-app-fg-subtle"
            aria-hidden="true"
          />
          <p className="mt-2 font-medium text-app-fg">Nenhum diagrama ainda.</p>
          <p className="mt-1 text-xs text-app-fg-muted">
            Crie o primeiro diagrama da rede hidrológica para começar.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-app-border-subtle overflow-hidden rounded-gov-card border border-app-border-subtle bg-app-surface">
          {diagramasIniciais.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-app-surface-2"
            >
              <Link
                href={`/diagramas/${d.id}`}
                className="min-w-0 flex-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
              >
                <span className="block truncate font-medium text-app-fg">
                  {d.nome}
                </span>
                <span className="mt-0.5 block text-xs text-app-fg-muted">
                  {d.bacia ? `${d.bacia} · ` : ''}
                  Atualizado em {formatadorData.format(d.atualizadoEm)}
                </span>
              </Link>

              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    setDialogNome({ modo: 'renomear', id: d.id, nome: d.nome })
                  }
                  disabled={pendente}
                  aria-label={`Renomear ${d.nome}`}
                  title="Renomear"
                  className="rounded p-1.5 text-app-fg-muted hover:bg-app-surface hover:text-app-fg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => duplicar(d.id)}
                  disabled={pendente}
                  aria-label={`Duplicar ${d.nome}`}
                  title="Duplicar"
                  className="rounded p-1.5 text-app-fg-muted hover:bg-app-surface hover:text-app-fg disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErro(null);
                    setAExcluir(d);
                  }}
                  disabled={pendente}
                  aria-label={`Excluir ${d.nome}`}
                  title="Excluir"
                  className="rounded p-1.5 text-app-fg-muted hover:bg-red-50 hover:text-gov-perigo disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-perigo"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <DialogNomeDiagrama
        aberto={dialogNome !== null}
        titulo={dialogNome?.modo === 'renomear' ? 'Renomear diagrama' : 'Novo diagrama'}
        rotuloConfirmar={dialogNome?.modo === 'renomear' ? 'Salvar' : 'Criar'}
        nomeInicial={dialogNome?.modo === 'renomear' ? dialogNome.nome : ''}
        aoConfirmar={async (nome) => {
          if (dialogNome?.modo === 'renomear') {
            await renomear(dialogNome.id, nome);
          } else {
            await criar(nome);
          }
        }}
        aoCancelar={() => setDialogNome(null)}
      />

      <ConfirmDialog
        aberto={aExcluir !== null}
        titulo="Excluir diagrama"
        variante="perigo"
        rotuloConfirmar="Excluir"
        descricao={
          <span>
            Tem certeza que deseja excluir{' '}
            <strong>{aExcluir?.nome}</strong>? Esta ação não pode ser desfeita.
          </span>
        }
        aoConfirmar={excluir}
        aoCancelar={() => setAExcluir(null)}
      />
    </div>
  );
}

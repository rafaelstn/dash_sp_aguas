'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnaRevisaoEstacao } from '@/domain/ana-revisao';
import { BadgeDivergencia } from './BadgeDivergencia';
import { BadgeStatus } from './BadgeStatus';

interface Props {
  itens: AnaRevisaoEstacao[];
}

type AcaoBulk =
  | 'marcar_revisada'
  | 'descartar'
  | 'aceitar_sugestao_municipio'
  | 'restaurar';

const ROTULOS_ACAO: Record<AcaoBulk, string> = {
  marcar_revisada: 'Marcar como revisadas',
  descartar: 'Descartar selecionadas',
  aceitar_sugestao_municipio: 'Aceitar sugestão de município',
  restaurar: 'Restaurar para pendente',
};

export function TabelaInventario({ itens }: Props) {
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [enviando, setEnviando] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmacao, setConfirmacao] = useState<AcaoBulk | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (confirmacao && !d.open) d.showModal();
    else if (!confirmacao && d.open) d.close();
  }, [confirmacao]);

  const todasSelecionadas = useMemo(
    () => itens.length > 0 && itens.every((i) => selecionadas.has(i.id)),
    [itens, selecionadas],
  );
  const algumaSelecionada = selecionadas.size > 0;

  function toggleUma(id: string) {
    setSelecionadas((s) => {
      const novo = new Set(s);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function toggleTodas() {
    setSelecionadas((s) => {
      if (todasSelecionadas) return new Set();
      const novo = new Set(s);
      for (const i of itens) novo.add(i.id);
      return novo;
    });
  }

  function pedirConfirmacao(acao: AcaoBulk) {
    if (selecionadas.size === 0) return;
    setConfirmacao(acao);
  }

  async function executarBulk(acao: AcaoBulk) {
    setConfirmacao(null);
    if (selecionadas.size === 0) return;
    setEnviando(true);
    setFeedback(null);
    try {
      const resp = await fetch('/api/inventario-ana/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          estacaoIds: Array.from(selecionadas),
          acao,
        }),
      });
      if (!resp.ok) {
        const body = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
        };
        throw new Error(body.mensagem ?? body.erro ?? `HTTP ${resp.status}`);
      }
      const json = (await resp.json()) as {
        aplicadas: number;
        falhadas: number;
      };
      setFeedback(
        `Aplicadas em ${json.aplicadas}. Falhas: ${json.falhadas}. Recarregue a página para ver as atualizações.`,
      );
      setSelecionadas(new Set());
    } catch (e) {
      setFeedback(
        e instanceof Error
          ? `Falha: ${e.message}`
          : 'Falha ao aplicar ação em lote.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-3">
      {algumaSelecionada ? (
        <div
          role="region"
          aria-label="Ações em lote"
          className="sticky top-[var(--altura-header)] z-20 flex flex-wrap items-center gap-2 rounded-gov-card border border-gov-azul bg-blue-50 p-2 text-sm shadow-sm"
        >
          <span className="mr-2 font-semibold tabular text-gov-azul">
            {selecionadas.size} selecionada(s)
          </span>
          <BotaoBulk
            acao="marcar_revisada"
            cor="bg-green-700 hover:bg-green-800"
            onClick={() => pedirConfirmacao('marcar_revisada')}
            disabled={enviando}
          />
          <BotaoBulk
            acao="descartar"
            cor="bg-gov-perigo hover:bg-red-900"
            onClick={() => pedirConfirmacao('descartar')}
            disabled={enviando}
          />
          <BotaoBulk
            acao="restaurar"
            cor="bg-stone-600 hover:bg-stone-700"
            onClick={() => pedirConfirmacao('restaurar')}
            disabled={enviando}
          />
          <button
            type="button"
            onClick={() => setSelecionadas(new Set())}
            className="ml-auto rounded border border-app-border-subtle bg-app-surface px-2 py-1 text-xs text-app-fg hover:bg-app-surface-2"
            disabled={enviando}
          >
            Limpar seleção
          </button>
        </div>
      ) : null}

      {feedback ? (
        <div className="rounded border-l-4 border-gov-azul bg-blue-50 p-2 text-sm text-blue-900">
          {feedback}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-gov-card border border-app-border-subtle bg-app-surface">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Estações ANA pendentes de revisão, ordenadas por divergência
          </caption>
          <thead>
            <tr className="bg-app-surface-2">
              <th scope="col" className="w-10 border-b border-app-border-subtle px-3 py-1.5 text-left">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  aria-label="Selecionar todas"
                  checked={todasSelecionadas}
                  onChange={toggleTodas}
                />
              </th>
              <Th>Código ANA</Th>
              <Th>Nome</Th>
              <Th>Município (ANA)</Th>
              <Th>Município ↔ coord</Th>
              <Th>Município SPÁguas</Th>
              <Th>Op</Th>
              <Th>Match</Th>
              <Th>Status</Th>
              <Th>Ação</Th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-6 text-center text-sm text-app-fg-muted">
                  Nenhuma estação com os filtros aplicados.
                </td>
              </tr>
            ) : (
              itens.map((it) => {
                const checked = selecionadas.has(it.id);
                return (
                  <tr
                    key={it.id}
                    className={`border-b border-app-border-subtle last:border-0 ${checked ? 'bg-blue-50' : 'hover:bg-app-surface-2'}`}
                  >
                    <Td>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar estação ${it.codigoAna}`}
                        checked={checked}
                        onChange={() => toggleUma(it.id)}
                      />
                    </Td>
                    <Td>
                      <Link
                        href={`/inventario-ana/${encodeURIComponent(it.codigoAna)}`}
                        className="mono text-gov-azul hover:underline"
                      >
                        {it.codigoAna}
                      </Link>
                    </Td>
                    <Td>{it.nome ?? '—'}</Td>
                    <Td>{it.municipioNome ?? '—'}</Td>
                    <Td>
                      <BadgeDivergencia
                        divergencia={it.divergenciaEfetiva}
                        distanciaM={it.distanciaEfetivaM}
                      />
                    </Td>
                    <Td>
                      {it.municipioEfetivo &&
                      it.municipioEfetivo !== it.municipioNome ? (
                        <span className="text-amber-900">
                          {it.municipioEfetivo}
                        </span>
                      ) : (
                        <span className="text-app-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td>
                      {it.operando === true ? (
                        <span className="text-green-800">Sim</span>
                      ) : it.operando === false ? (
                        <span className="text-app-fg-subtle">Não</span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      {it.matchTipo === 'sem_match' ? (
                        <span className="text-2xs text-amber-800">sem</span>
                      ) : it.postoPrefixo ? (
                        <span className="mono text-2xs text-app-fg">{it.postoPrefixo}</span>
                      ) : (
                        '—'
                      )}
                    </Td>
                    <Td>
                      <BadgeStatus status={it.status} />
                    </Td>
                    <Td>
                      {it.postoPrefixo ? (
                        <Link
                          href={`/postos/${encodeURIComponent(it.postoPrefixo)}/editar`}
                          className="text-2xs text-gov-azul hover:underline"
                          aria-label={`Editar posto ${it.postoPrefixo}`}
                        >
                          Editar
                        </Link>
                      ) : (
                        <span className="text-2xs text-app-fg-subtle">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="conf-titulo"
        onCancel={() => setConfirmacao(null)}
        className="m-0 max-w-md rounded-gov-card border border-app-border-subtle bg-app-surface p-0 text-app-fg shadow-gov-card-hover backdrop:bg-black/40 sm:m-auto"
      >
        {confirmacao ? (
          <form
            method="dialog"
            onSubmit={(e) => {
              e.preventDefault();
              void executarBulk(confirmacao);
            }}
          >
            <header className="border-b border-app-border-subtle px-5 py-3">
              <h2 id="conf-titulo" className="text-base font-semibold">
                Confirmar ação em lote
              </h2>
            </header>
            <div className="px-5 py-4 text-sm">
              <p>
                Aplicar <strong>{ROTULOS_ACAO[confirmacao].toLowerCase()}</strong> em{' '}
                <strong className="tabular">{selecionadas.size}</strong> estação(ões)?
              </p>
              <p className="mt-2 text-2xs text-app-fg-muted">
                A ação é registrada no histórico de auditoria. Pode ser revertida
                via &quot;restaurar para pendente&quot;.
              </p>
            </div>
            <footer className="flex justify-end gap-2 border-t border-app-border-subtle bg-app-surface-2 px-5 py-3">
              <button
                type="button"
                onClick={() => setConfirmacao(null)}
                className="rounded border border-app-border-subtle bg-app-surface px-3 py-1.5 text-sm text-app-fg hover:bg-app-surface-2"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro"
              >
                Confirmar
              </button>
            </footer>
          </form>
        ) : null}
      </dialog>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th
      scope="col"
      className="border-b border-app-border-subtle px-3 py-1.5 text-left text-2xs font-semibold uppercase tracking-wide text-app-fg-muted"
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-3 py-1.5 text-sm">{children}</td>;
}

function BotaoBulk({
  acao,
  cor,
  onClick,
  disabled,
}: {
  acao: AcaoBulk;
  cor: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded px-2 py-1 text-xs font-medium text-white disabled:opacity-60 ${cor}`}
    >
      {ROTULOS_ACAO[acao]}
    </button>
  );
}

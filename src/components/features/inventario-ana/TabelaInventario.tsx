'use client';

import Link from 'next/link';
import { useMemo, useRef, useState } from 'react';
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
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

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

  async function executarBulk(acao: AcaoBulk) {
    if (selecionadas.size === 0) return;
    if (!confirm(`Confirmar ${ROTULOS_ACAO[acao].toLowerCase()} em ${selecionadas.size} estação(ões)?`)) {
      return;
    }
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
            onClick={() => executarBulk('marcar_revisada')}
            disabled={enviando}
          />
          <BotaoBulk
            acao="aceitar_sugestao_municipio"
            cor="bg-gov-azul hover:bg-gov-azul-escuro"
            onClick={() => executarBulk('aceitar_sugestao_municipio')}
            disabled={enviando}
          />
          <BotaoBulk
            acao="descartar"
            cor="bg-gov-perigo hover:bg-red-900"
            onClick={() => executarBulk('descartar')}
            disabled={enviando}
          />
          <BotaoBulk
            acao="restaurar"
            cor="bg-stone-600 hover:bg-stone-700"
            onClick={() => executarBulk('restaurar')}
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
              <Th>Município (declarado)</Th>
              <Th>Município ↔ coord</Th>
              <Th>Município sugerido</Th>
              <Th>Op</Th>
              <Th>Match</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {itens.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-sm text-app-fg-muted">
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
                        divergencia={it.divergenciaMunicipio}
                        distanciaM={it.distanciaMunicipioDeclaradoM}
                      />
                    </Td>
                    <Td>
                      {it.municipioSugeridoNome &&
                      it.municipioSugeridoNome !== it.municipioNome ? (
                        <span className="text-amber-900">
                          {it.municipioSugeridoNome}
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
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
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

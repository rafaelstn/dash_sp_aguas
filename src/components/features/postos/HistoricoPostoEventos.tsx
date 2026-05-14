import 'server-only';
import { sql } from '@/infrastructure/db/client';

interface LinhaEvento {
  id: string;
  evento: string;
  ator_email: string | null;
  origem_evento: string | null;
  observacao: string | null;
  ocorreu_em: Date;
  /** Diff resumido: lista de "campo: antigo → novo" */
  resumo: string | null;
}

const ROTULOS_EVENTO: Record<string, string> = {
  criado: 'Criado',
  atualizado: 'Atualizado',
  removido: 'Removido (soft delete)',
  restaurado: 'Restaurado',
  promovido_de_ana_revisao: 'Promovido da auditoria ANA',
  corrigido_em_lote: 'Corrigido em lote',
};

function rotulo(ev: string): string {
  return ROTULOS_EVENTO[ev] ?? ev;
}

function corBorda(ev: string): string {
  switch (ev) {
    case 'criado':
      return 'border-l-green-600 bg-green-50';
    case 'removido':
      return 'border-l-gov-perigo bg-red-50';
    case 'restaurado':
    case 'promovido_de_ana_revisao':
      return 'border-l-gov-azul bg-blue-50';
    default:
      return 'border-l-amber-400 bg-amber-50';
  }
}

function diffResumo(antes: unknown, depois: unknown): string | null {
  if (!antes && !depois) return null;
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (depois ?? {}) as Record<string, unknown>;
  const chaves = new Set([...Object.keys(a), ...Object.keys(d)]);
  const partes: string[] = [];
  for (const k of chaves) {
    const va = a[k];
    const vd = d[k];
    if (JSON.stringify(va) === JSON.stringify(vd)) continue;
    const ant = va === null || va === undefined ? '—' : String(va);
    const nov = vd === null || vd === undefined ? '—' : String(vd);
    partes.push(`${k}: ${ant} → ${nov}`);
  }
  if (partes.length === 0) return null;
  if (partes.length > 4) {
    return partes.slice(0, 4).join(' · ') + ` · (+${partes.length - 4})`;
  }
  return partes.join(' · ');
}

interface Props {
  postoId: string;
}

/**
 * Histórico de mudanças do posto. Server component que consulta direto
 * `postos_evento`. Mostra até 20 eventos mais recentes; se houver mais,
 * mostra link "ver todos" (não implementado aqui ainda, futuro).
 *
 * Atende LGPD §4 (governo.md): toda alteração ao cadastro do posto
 * tem trilha audit visível pro responsável.
 */
export async function HistoricoPostoEventos({ postoId }: Props) {
  const linhas = await sql<
    Array<{
      id: string;
      evento: string;
      ator_email: string | null;
      origem_evento: string | null;
      observacao: string | null;
      valores_antes: unknown;
      valores_depois: unknown;
      ocorreu_em: Date;
    }>
  >`
    SELECT e.id, e.evento,
           (SELECT email FROM auth.users WHERE id = e.ator_id) AS ator_email,
           e.origem_evento, e.observacao,
           e.valores_antes, e.valores_depois,
           e.ocorreu_em
      FROM postos_evento e
     WHERE e.posto_id = ${postoId}
     ORDER BY e.ocorreu_em DESC
     LIMIT 20
  `;

  if (linhas.length === 0) {
    return (
      <section
        aria-labelledby="sec-hist"
        className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
      >
        <h2 id="sec-hist" className="text-sm font-semibold text-app-fg">
          Histórico de alterações
        </h2>
        <p className="mt-1 text-xs text-app-fg-muted">
          Nenhuma alteração registrada para este posto.
        </p>
      </section>
    );
  }

  const eventos: LinhaEvento[] = linhas.map((l) => ({
    id: l.id,
    evento: l.evento,
    ator_email: l.ator_email,
    origem_evento: l.origem_evento,
    observacao: l.observacao,
    ocorreu_em: l.ocorreu_em,
    resumo: diffResumo(l.valores_antes, l.valores_depois),
  }));

  return (
    <section
      aria-labelledby="sec-hist"
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4"
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <h2 id="sec-hist" className="text-sm font-semibold text-app-fg">
          Histórico de alterações
        </h2>
        <p className="text-2xs text-app-fg-muted">
          Últimos {eventos.length} evento(s). Audit trail imutável (LGPD §4).
        </p>
      </header>
      <ol className="space-y-2">
        {eventos.map((e) => (
          <li
            key={e.id}
            className={`rounded border-l-4 px-3 py-2 text-sm ${corBorda(e.evento)}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold text-app-fg">{rotulo(e.evento)}</span>
              <time
                dateTime={e.ocorreu_em.toISOString()}
                className="mono text-2xs text-app-fg-muted tabular"
              >
                {new Intl.DateTimeFormat('pt-BR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }).format(e.ocorreu_em)}
              </time>
            </div>
            <p className="mt-0.5 text-2xs text-app-fg-muted">
              {e.ator_email ?? 'Automação (sem ator humano)'}
              {e.origem_evento ? <> · origem: {e.origem_evento}</> : null}
            </p>
            {e.resumo ? (
              <p className="mt-1 text-xs text-app-fg break-words">{e.resumo}</p>
            ) : null}
            {e.observacao ? (
              <p className="mt-1 text-xs italic text-app-fg-muted">
                &ldquo;{e.observacao}&rdquo;
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

import 'server-only';
import { USUARIO_SEM_IDENTIDADE } from '@/domain/auth/usuario-sem-identidade';
import { postosRepository } from '@/infrastructure/repositories';

/**
 * Quem aparece como autor do evento, em três estados e não em dois.
 *
 * O par `atorEmail ?? 'Automação'` só distinguia "tem e-mail" de "não tem", e
 * isso quebra aqui por dois caminhos independentes:
 *
 *  - Antes da linha do usuário institucional em `auth.users`, a subquery de
 *    `postos-repository.pg.ts` devolvia NULL para ação HUMANA, e a trilha
 *    afirmava automação onde houve uma pessoa. Trilha que mente é pior que
 *    trilha ausente.
 *  - Com a linha provisionada, ela devolve `acesso-sem-identidade@dmo.local`,
 *    e endereço técnico cru numa tela de governo é ruído: quem lê não tem como
 *    saber que aquilo não é uma caixa de e-mail de alguém.
 *
 * O terceiro estado resolve os dois com uma frase legível.
 */
function autorDoEvento(atorEmail: string | null): string {
  if (atorEmail === USUARIO_SEM_IDENTIDADE.email) {
    return 'Acesso sem identificação';
  }
  return atorEmail ?? 'Automação (sem ator humano)';
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
 * Histórico de mudanças do posto. Server component que delega a leitura
 * dos eventos ao `postosRepository.listarEventos`, mantendo o componente
 * agnóstico ao schema do banco.
 *
 * Atende LGPD §4 (governo.md): toda alteração ao cadastro do posto
 * tem trilha audit visível pro responsável.
 */
export async function HistoricoPostoEventos({ postoId }: Props) {
  const eventos = await postosRepository.listarEventos(postoId, 20);

  if (eventos.length === 0) {
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
        {eventos.map((e) => {
          const resumo = diffResumo(e.valoresAntes, e.valoresDepois);
          return (
            <li
              key={e.id}
              className={`rounded border-l-4 px-3 py-2 text-sm ${corBorda(e.evento)}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold text-app-fg">{rotulo(e.evento)}</span>
                <time
                  dateTime={e.ocorreuEm.toISOString()}
                  className="mono text-2xs text-app-fg-muted tabular"
                >
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(e.ocorreuEm)}
                </time>
              </div>
              <p className="mt-0.5 text-2xs text-app-fg-muted">
                {autorDoEvento(e.atorEmail)}
                {e.origemEvento ? <> · origem: {e.origemEvento}</> : null}
              </p>
              {resumo ? (
                <p className="mt-1 text-xs text-app-fg break-words">{resumo}</p>
              ) : null}
              {e.observacao ? (
                <p className="mt-1 text-xs italic text-app-fg-muted">
                  &ldquo;{e.observacao}&rdquo;
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

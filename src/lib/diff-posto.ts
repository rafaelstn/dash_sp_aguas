import { rotuloCampoPosto } from '@/lib/rotulos-posto';

/** Quantos campos o resumo mostra antes de contar o restante. */
const CAMPOS_VISIVEIS = 4;

/** Valor ausente na tela. Vale para NULL e para campo que não existia. */
const VAZIO = '—';

/**
 * Resume em uma linha o que mudou entre dois estados do cadastro de posto, para
 * o histórico de alterações da ficha.
 *
 * Saiu de dentro de `HistoricoPostoEventos` em 23/09/2026 por dois motivos, e o
 * segundo é o que decidiu:
 *
 *   1. o componente é Server Component com `import 'server-only'` e busca no
 *      repositório, então a regra de formatação só podia ser exercitada
 *      montando a tela inteira. Cálculo puro mora em `lib/` justamente para ser
 *      medido sozinho;
 *   2. o achado 2 do QA da tela Postos: o resumo imprimia a chave crua do JSON
 *      do audit trail (`nomeEstacao: — → Rio Piracicaba`). O rótulo em
 *      português vem de `rotulos-posto.ts`, a mesma fonte que o formulário de
 *      edição usa.
 *
 * Devolve `null` quando não há nada a mostrar: ou os dois lados estão vazios,
 * ou todos os campos têm valor igual nos dois (o repositório grava o evento
 * mesmo quando a atualização não muda valor nenhum).
 */
export function resumirDiffPosto(antes: unknown, depois: unknown): string | null {
  if (!antes && !depois) return null;
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (depois ?? {}) as Record<string, unknown>;
  const chaves = new Set([...Object.keys(a), ...Object.keys(d)]);
  const partes: string[] = [];
  for (const k of chaves) {
    const va = a[k];
    const vd = d[k];
    if (JSON.stringify(va) === JSON.stringify(vd)) continue;
    const ant = va === null || va === undefined ? VAZIO : String(va);
    const nov = vd === null || vd === undefined ? VAZIO : String(vd);
    partes.push(`${rotuloCampoPosto(k)}: ${ant} → ${nov}`);
  }
  if (partes.length === 0) return null;
  if (partes.length > CAMPOS_VISIVEIS) {
    const restante = partes.length - CAMPOS_VISIVEIS;
    return partes.slice(0, CAMPOS_VISIVEIS).join(' · ') + ` · (+${restante})`;
  }
  return partes.join(' · ');
}

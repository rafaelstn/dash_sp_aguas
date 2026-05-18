'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AnaRevisaoEstacao, StatusRevisao } from '@/domain/ana-revisao';

interface Props {
  estacao: AnaRevisaoEstacao;
}

/**
 * Botões de mudança de status da revisão ANA (FASE 5).
 *
 * Após FASE 5: este componente só muda STATUS na ana_revisao_estacao
 * e gera audit. NÃO edita campos de posto — isso vai por
 * PATCH /api/postos/[prefixo] (botão "Editar posto" no header).
 */
export function AcoesRevisao({ estacao }: Props) {
  const router = useRouter();
  const [observacao, setObservacao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function aplicarStatus(novoStatus: StatusRevisao) {
    setEnviando(true);
    setErro(null);
    setSucesso(null);
    try {
      const resp = await fetch(
        `/api/inventario-ana/${encodeURIComponent(estacao.codigoAna)}/revisar`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({
            novoStatus,
            observacao: observacao.trim() || null,
          }),
        },
      );
      if (!resp.ok) {
        const b = (await resp.json().catch(() => ({}))) as {
          erro?: string;
          mensagem?: string;
        };
        throw new Error(b.mensagem ?? b.erro ?? `HTTP ${resp.status}`);
      }
      setSucesso(`Status atualizado: ${novoStatus}.`);
      setObservacao('');
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao atualizar status.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section
      aria-labelledby="sec-acoes"
      className="rounded-gov-card border border-app-border-subtle bg-app-surface p-4 space-y-3"
    >
      <h2 id="sec-acoes" className="text-sm font-semibold text-app-fg">
        Ações de revisão
      </h2>

      {erro ? (
        <div role="alert" className="rounded border-l-4 border-gov-perigo bg-red-50 p-2 text-sm text-gov-perigo">
          {erro}
        </div>
      ) : null}
      {sucesso ? (
        <div role="status" className="rounded border-l-4 border-green-600 bg-green-50 p-2 text-sm text-green-900">
          {sucesso}
        </div>
      ) : null}

      <label className="block text-xs">
        <span className="mb-0.5 block font-medium text-app-fg-muted">
          Observação (opcional, vai para o histórico de auditoria)
        </span>
        <textarea
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          rows={2}
          maxLength={4000}
          className="block w-full rounded border border-app-border-subtle bg-app-surface px-2 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
          placeholder="Ex.: coordenada confirmada com GPS em campo no dia 14/05."
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => aplicarStatus('revisada')}
          disabled={enviando}
          className="rounded bg-green-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-60"
        >
          Marcar como revisada
        </button>
        <button
          type="button"
          onClick={() => aplicarStatus('em_revisao')}
          disabled={enviando}
          title="Marca esta estação ANA como em análise. Não cria lock da triagem, é só o status do registro de auditoria."
          className="rounded bg-gov-azul px-3 py-1.5 text-sm font-medium text-white hover:bg-gov-azul-escuro disabled:opacity-60"
        >
          Mover para &quot;em análise&quot;
        </button>
        <button
          type="button"
          onClick={() => aplicarStatus('descartada')}
          disabled={enviando}
          className="rounded bg-gov-perigo px-3 py-1.5 text-sm font-medium text-white hover:bg-red-900 disabled:opacity-60"
        >
          Descartar (não é da rede SP)
        </button>
      </div>

      <p className="text-2xs text-app-fg-subtle">
        Status atual: <strong>{estacao.status}</strong>. Todo evento é registrado em <code className="mono">ana_revisao_evento</code>.
      </p>
    </section>
  );
}

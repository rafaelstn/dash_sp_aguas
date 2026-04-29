'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alerta } from '@/components/ui/Alerta';
import { Skeleton } from '@/components/ui/Skeleton';

export interface StatusIndexacaoArquivosProps {
  prefixo: string;
  jobId: string;
}

interface JobStatus {
  status: 'indexando' | 'concluido' | 'erro';
  arquivosEncontrados?: number;
  mensagem?: string;
}

const INTERVALO_POLLING_MS = 2000;
const TIMEOUT_UI_MS = 2 * 60 * 1000; // 2 minutos

/**
 * Polling de job de indexação iniciado pelo backend (resposta 202 Accepted).
 * - Consulta GET /api/jobs/{id} a cada 2s.
 * - Mostra progresso "Arquivos encontrados: X".
 * - Timeout de 2min exibe mensagem para recarregar a página.
 * - Em sucesso, chama router.refresh() para revalidar o Server Component.
 * - Respeita prefers-reduced-motion (Tailwind motion-safe:*).
 */
export function StatusIndexacaoArquivos({
  prefixo,
  jobId,
}: StatusIndexacaoArquivosProps) {
  const router = useRouter();
  const [encontrados, setEncontrados] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const inicioRef = useRef<number>(Date.now());

  useEffect(() => {
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      if (cancelado) return;
      if (Date.now() - inicioRef.current > TIMEOUT_UI_MS) {
        setTimedOut(true);
        return;
      }

      try {
        const resp = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          cache: 'no-store',
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const dados = (await resp.json()) as JobStatus;
        if (cancelado) return;

        if (dados.status === 'concluido') {
          router.refresh();
          return;
        }
        if (dados.status === 'erro') {
          setErro(
            dados.mensagem ??
              'A indexação falhou. Tente reabrir a página em instantes.',
          );
          return;
        }
        if (typeof dados.arquivosEncontrados === 'number') {
          setEncontrados(dados.arquivosEncontrados);
        }
      } catch {
        // Erro transitório de rede — continua tentando até o timeout.
      }

      timer = setTimeout(tick, INTERVALO_POLLING_MS);
    }

    tick();
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId, router]);

  if (erro) {
    return (
      <Alerta tipo="erro" titulo="Falha na indexação">
        {erro}
      </Alerta>
    );
  }

  if (timedOut) {
    return (
      <Alerta tipo="aviso" titulo="Indexação em andamento">
        A varredura ainda não concluiu. Atualize a página em alguns instantes
        para consultar os arquivos.
      </Alerta>
    );
  }

  const mensagem =
    encontrados === null
      ? `Indexando arquivos do posto ${prefixo}. Esta operação pode levar até 30 segundos na primeira visita.`
      : `Indexação em andamento — ${encontrados.toLocaleString('pt-BR')} ${encontrados === 1 ? 'arquivo encontrado' : 'arquivos encontrados'} até o momento.`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="space-y-3"
    >
      <div className="flex items-center gap-3 rounded-gov-card border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <span
          aria-hidden="true"
          className="inline-block h-3 w-3 shrink-0 rounded-full bg-gov-azul motion-safe:animate-pulse"
        />
        <p>{mensagem}</p>
      </div>
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-5/6" />
      <Skeleton className="h-8 w-4/6" />
    </div>
  );
}

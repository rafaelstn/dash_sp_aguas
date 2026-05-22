'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EVENTO_PENDENTES,
  listarPendentes,
  registrarFalhaEnvio,
  removerEnvio,
  type ItemFilaEnvio,
} from '@/lib/fila-envios';
import { descartarRascunho } from '@/lib/rascunho-ficha';
import { ErroTriagemAPI, mensagemErroTriagem, submeterFichaApp } from '@/lib/triagem-api';

interface SyncFichasPendentesProps {
  /** ID do técnico logado. Só as fichas dele são sincronizadas/contadas. */
  usuarioId: string | null;
}

/**
 * Sincronizador da fila de envios offline (ADR-0007 §2.3).
 *
 * Montado uma única vez no layout `/app`. Drena a fila de fichas pendentes
 * (gravada por `FormularioFichaMobile` quando o envio falha offline) assim
 * que há conexão:
 *  - no mount (técnico reabre o app já online), e
 *  - a cada evento `online` (rede volta com o app aberto).
 *
 * Escolhemos o evento `online` em vez da Background Sync API porque esta
 * não é confiável no iOS/WKWebView (Capacitor), que está no escopo da
 * Fase 2.A. O reenvio reusa a `Idempotency-Key` de cada item, então o
 * backend nunca cria ficha duplicada (slug `idempotency_duplicada` é
 * tratado aqui como sucesso).
 *
 * Isolamento por usuário: o envio usa o cookie de sessão atual e o backend
 * grava `tecnico_id` a partir dela. Em dispositivo compartilhado, sincronizar
 * a ficha de outro técnico a atribuiria ao usuário logado. Por isso só
 * drenamos/contamos itens cujo `chaveRascunho.usuarioId` é o usuário atual;
 * os demais ficam parados até o dono logar.
 *
 * Renderiza um banner discreto com a contagem de pendentes e o estado do
 * envio. Não bloqueia nenhuma navegação.
 */
export function SyncFichasPendentes({ usuarioId }: SyncFichasPendentesProps) {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const emExecucao = useRef(false);

  const meusPendentes = useCallback(async (): Promise<ItemFilaEnvio[]> => {
    if (!usuarioId) return [];
    const todos = await listarPendentes();
    return todos.filter((item) => item.chaveRascunho.usuarioId === usuarioId);
  }, [usuarioId]);

  const recomputarTotal = useCallback(async () => {
    setTotal((await meusPendentes()).length);
  }, [meusPendentes]);

  const drenar = useCallback(async () => {
    if (emExecucao.current || !usuarioId) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const pendentes = await meusPendentes();
    if (pendentes.length === 0) return;

    emExecucao.current = true;
    setSincronizando(true);
    let houveSucesso = false;

    try {
      for (const item of pendentes) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) break;
        try {
          await submeterFichaApp(item.corpo, item.idempotencyKey);
          await concluir(item);
          houveSucesso = true;
        } catch (err) {
          if (err instanceof ErroTriagemAPI && err.slug === 'idempotency_duplicada') {
            // Ficha já foi criada num envio anterior — sucesso efetivo.
            await concluir(item);
            houveSucesso = true;
            continue;
          }
          const msg =
            err instanceof ErroTriagemAPI ? mensagemErroTriagem(err) : 'Falha de rede';
          await registrarFalhaEnvio(item, msg);
        }
      }
    } finally {
      emExecucao.current = false;
      setSincronizando(false);
      await recomputarTotal();
      if (houveSucesso) router.refresh();
    }
  }, [usuarioId, meusPendentes, recomputarTotal, router]);

  // Estado inicial + sync no mount (app reaberto já online).
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    void recomputarTotal();
    void drenar();
  }, [recomputarTotal, drenar]);

  // Reconexão e mudança da fila.
  useEffect(() => {
    const aoVoltar = () => {
      setOnline(true);
      void drenar();
    };
    const aoCair = () => setOnline(false);
    const aoMudarFila = () => {
      void recomputarTotal();
    };
    window.addEventListener('online', aoVoltar);
    window.addEventListener('offline', aoCair);
    window.addEventListener(EVENTO_PENDENTES, aoMudarFila);
    return () => {
      window.removeEventListener('online', aoVoltar);
      window.removeEventListener('offline', aoCair);
      window.removeEventListener(EVENTO_PENDENTES, aoMudarFila);
    };
  }, [drenar, recomputarTotal]);

  if (total === 0) return null;

  const plural = total > 1;
  const texto = sincronizando
    ? `Enviando ${total} ficha${plural ? 's' : ''} pendente${plural ? 's' : ''}…`
    : online
      ? `${total} ficha${plural ? 's' : ''} pendente${plural ? 's' : ''} de envio. Tentaremos novamente.`
      : `${total} ficha${plural ? 's' : ''} aguardando conexão para envio.`;

  return (
    <p
      aria-live="polite"
      role="status"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-xs text-amber-900"
    >
      {texto}
    </p>
  );
}

async function concluir(item: ItemFilaEnvio): Promise<void> {
  await removerEnvio(item.id);
  descartarRascunho(item.chaveRascunho);
}

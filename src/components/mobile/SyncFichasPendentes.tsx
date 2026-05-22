'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  EVENTO_PENDENTES,
  contarPendentes,
  listarPendentes,
  registrarFalhaEnvio,
  removerEnvio,
  type ItemFilaEnvio,
} from '@/lib/fila-envios';
import { descartarRascunho } from '@/lib/rascunho-ficha';
import { ErroTriagemAPI, mensagemErroTriagem, submeterFichaApp } from '@/lib/triagem-api';

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
 * Renderiza um banner discreto com a contagem de pendentes e o estado do
 * envio. Não bloqueia nenhuma navegação.
 */
export function SyncFichasPendentes() {
  const router = useRouter();
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);
  const emExecucao = useRef(false);

  const drenar = useCallback(async () => {
    if (emExecucao.current) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    const pendentes = await listarPendentes();
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
      setTotal(await contarPendentes());
      if (houveSucesso) router.refresh();
    }
  }, [router]);

  // Estado inicial + sync no mount (app reaberto já online).
  useEffect(() => {
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    contarPendentes().then(setTotal);
    void drenar();
  }, [drenar]);

  // Reconexão e mudança de contagem.
  useEffect(() => {
    const aoVoltar = () => {
      setOnline(true);
      void drenar();
    };
    const aoCair = () => setOnline(false);
    const aoMudarPendentes = (e: Event) => {
      const detail = (e as CustomEvent<number>).detail;
      if (typeof detail === 'number') setTotal(detail);
    };
    window.addEventListener('online', aoVoltar);
    window.addEventListener('offline', aoCair);
    window.addEventListener(EVENTO_PENDENTES, aoMudarPendentes);
    return () => {
      window.removeEventListener('online', aoVoltar);
      window.removeEventListener('offline', aoCair);
      window.removeEventListener(EVENTO_PENDENTES, aoMudarPendentes);
    };
  }, [drenar]);

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

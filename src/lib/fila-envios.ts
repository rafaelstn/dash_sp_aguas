/**
 * Fila de envios offline de fichas do app móvel (ADR-0007 §2.3).
 *
 * Quando o técnico submete uma ficha sem conexão, o envio entra nesta fila
 * em IndexedDB e é drenado automaticamente quando a rede volta (componente
 * `SyncFichasPendentes`, disparado pelo evento `online`).
 *
 * Decisão: **IndexedDB** (não localStorage). Cada item carrega o corpo
 * completo da ficha — que pode incluir foto base64 de até ~2 MB. Várias
 * fichas pendentes estourariam a quota de 5 MB do localStorage; IndexedDB
 * não tem esse teto prático. Wrapper próprio (sem dependência nova) para
 * manter a auditoria de dependências enxuta em projeto de governo.
 *
 * Idempotência: o `id` do item é a própria `idempotencyKey` da ficha. Logo,
 * reenfileirar a mesma ficha (ex.: técnico reabre o rascunho e tenta de
 * novo) faz `put` por cima — nunca duplica item na fila. E o backend trata
 * a `Idempotency-Key` repetida, então re-sync não cria ficha duplicada.
 */

import type { CorpoSubmissaoApp } from '@/lib/triagem-api';
import type { ChaveRascunho } from '@/lib/rascunho-ficha';

const DB_NOME = 'spaguas-sync';
const DB_VERSAO = 1;
const STORE = 'fila-fichas';

/**
 * Evento global emitido sempre que a fila muda (item adicionado/removido).
 * Serve só de gatilho: o consumidor recomputa a contagem por usuário, já
 * que esta camada não conhece o usuário logado.
 */
export const EVENTO_PENDENTES = 'spaguas:fichas-pendentes';

export interface ItemFilaEnvio {
  /** = idempotencyKey da ficha. Garante 1 item por ficha. */
  id: string;
  corpo: CorpoSubmissaoApp;
  idempotencyKey: string;
  /** Permite descartar o rascunho local após o sync ter sucesso. */
  chaveRascunho: ChaveRascunho;
  criadoEm: string;
  tentativas: number;
  ultimoErro: string | null;
}

function temIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOME, DB_VERSAO);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function comTransacao<T>(
  modo: IDBTransactionMode,
  exec: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T | undefined> {
  return abrirDb().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, modo);
        const store = tx.objectStore(STORE);
        let resultado: T | undefined;
        const req = exec(store);
        if (req) req.onsuccess = () => (resultado = req.result);
        tx.oncomplete = () => {
          db.close();
          resolve(resultado);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** Adiciona ou sobrescreve um item na fila e notifica os ouvintes. */
export async function enfileirarEnvio(item: ItemFilaEnvio): Promise<void> {
  if (!temIndexedDb()) throw new Error('IndexedDB indisponível');
  await comTransacao('readwrite', (store) => store.put(item));
  notificarPendentes();
}

export async function listarPendentes(): Promise<ItemFilaEnvio[]> {
  if (!temIndexedDb()) return [];
  try {
    const itens = await comTransacao<ItemFilaEnvio[]>('readonly', (store) =>
      store.getAll() as IDBRequest<ItemFilaEnvio[]>,
    );
    return itens ?? [];
  } catch {
    return [];
  }
}

export async function removerEnvio(id: string): Promise<void> {
  if (!temIndexedDb()) return;
  await comTransacao('readwrite', (store) => store.delete(id));
  notificarPendentes();
}

/** Atualiza tentativas/erro de um item que falhou no sync. */
export async function registrarFalhaEnvio(
  item: ItemFilaEnvio,
  erro: string,
): Promise<void> {
  if (!temIndexedDb()) return;
  await comTransacao('readwrite', (store) =>
    store.put({ ...item, tentativas: item.tentativas + 1, ultimoErro: erro }),
  );
}

/** Gatilho para a UI recomputar a contagem (por usuário) após mudança na fila. */
export function notificarPendentes(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(EVENTO_PENDENTES));
}

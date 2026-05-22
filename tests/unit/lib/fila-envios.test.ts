/**
 * Cobertura da fila de envios offline (`src/lib/fila-envios.ts`, ADR-0007 §2.3).
 *
 * Usa `fake-indexeddb` para exercitar o storage real (open/put/getAll/delete)
 * em ambiente node. `notificarPendentes` é no-op sem `window`, então o CRUD
 * roda sem DOM. O filtro por usuário — controle de segurança contra
 * atribuição cruzada em dispositivo compartilhado — é função pura e tem
 * teste dedicado.
 */
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  enfileirarEnvio,
  listarPendentes,
  registrarFalhaEnvio,
  removerEnvio,
  selecionarPendentesDoUsuario,
  type ItemFilaEnvio,
} from '@/lib/fila-envios';

function itemFake(id: string, usuarioId: string): ItemFilaEnvio {
  return {
    id,
    idempotencyKey: id,
    corpo: {
      prefixo: 'ABC',
      codTipoDocumento: 1,
      dataVisita: '2026-05-22',
      tecnicoNome: 'Técnico Fulano',
      dados: { campo: 'valor' },
    },
    chaveRascunho: { usuarioId, prefixo: 'ABC', codigo: 1, fichaOrigemId: null },
    criadoEm: new Date().toISOString(),
    tentativas: 0,
    ultimoErro: null,
  };
}

async function limparFila(): Promise<void> {
  for (const item of await listarPendentes()) {
    await removerEnvio(item.id);
  }
}

afterEach(limparFila);

describe('fila de envios offline (IndexedDB)', () => {
  it('enfileira e lista o item persistido', async () => {
    await enfileirarEnvio(itemFake('key-1', 'user-a'));

    const pendentes = await listarPendentes();
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]!.id).toBe('key-1');
    expect(pendentes[0]!.corpo.tecnicoNome).toBe('Técnico Fulano');
  });

  it('não duplica quando reenfileira a mesma idempotency-key', async () => {
    await enfileirarEnvio(itemFake('key-1', 'user-a'));
    const segundo = itemFake('key-1', 'user-a');
    segundo.corpo.dados = { campo: 'editado' };
    await enfileirarEnvio(segundo);

    const pendentes = await listarPendentes();
    expect(pendentes).toHaveLength(1);
    expect(pendentes[0]!.corpo.dados).toEqual({ campo: 'editado' });
  });

  it('remove o item da fila', async () => {
    await enfileirarEnvio(itemFake('key-1', 'user-a'));
    await removerEnvio('key-1');

    expect(await listarPendentes()).toHaveLength(0);
  });

  it('registra falha incrementando tentativas e gravando o erro', async () => {
    const item = itemFake('key-1', 'user-a');
    await enfileirarEnvio(item);

    await registrarFalhaEnvio(item, 'Falha de rede');

    const atualizado = (await listarPendentes())[0]!;
    expect(atualizado.tentativas).toBe(1);
    expect(atualizado.ultimoErro).toBe('Falha de rede');
  });
});

describe('selecionarPendentesDoUsuario (isolamento cross-user)', () => {
  it('retorna apenas as fichas do usuário logado', () => {
    const itens = [
      itemFake('k1', 'user-a'),
      itemFake('k2', 'user-b'),
      itemFake('k3', 'user-a'),
    ];

    const doA = selecionarPendentesDoUsuario(itens, 'user-a');
    expect(doA.map((i) => i.id)).toEqual(['k1', 'k3']);
  });

  it('não vaza fichas de outro técnico em dispositivo compartilhado', () => {
    const itens = [itemFake('k1', 'user-a'), itemFake('k2', 'user-b')];

    const doB = selecionarPendentesDoUsuario(itens, 'user-b');
    expect(doB).toHaveLength(1);
    expect(doB[0]!.chaveRascunho.usuarioId).toBe('user-b');
  });

  it('retorna vazio quando não há usuário logado', () => {
    const itens = [itemFake('k1', 'user-a')];
    expect(selecionarPendentesDoUsuario(itens, null)).toEqual([]);
  });
});

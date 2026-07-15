import { beforeEach, describe, expect, it } from 'vitest';
import { registrarMovimentacao } from '@/application/use-cases/estoque/registrar-movimentacao';
import { estoqueMovimentacoesRepository as repo } from '@/infrastructure/mock/estoque-movimentacoes-repository.mock';
import { estoqueMateriaisRepository as materiais } from '@/infrastructure/mock/estoque-materiais-repository.mock';
import { estoqueUnidadesRepository as unidades } from '@/infrastructure/mock/estoque-unidades-repository.mock';
import { estoqueLocaisRepository as locais } from '@/infrastructure/mock/estoque-locais-repository.mock';
import { estoqueSaldosRepository as saldos } from '@/infrastructure/mock/estoque-saldos-repository.mock';
import { _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';
import {
  AlvoMovimentacaoInvalido,
  SaldoInsuficiente,
  TransicaoStatusInvalida,
} from '@/domain/errors';

const USER = '99999999-9999-9999-9999-999999999999';

async function seedQuantificavel() {
  const material = await materiais.criar({ descricao: 'Cabo coaxial', natureza: 'quantificavel' });
  const l1 = await locais.criar({ unidade: 'PENHA', sala: '2' });
  const l2 = await locais.criar({ unidade: 'ARARAQUARA', sala: '1' });
  return { material, l1, l2 };
}

async function seedSerializado() {
  const l1 = await locais.criar({ unidade: 'PENHA', sala: '2' });
  const unidade = await unidades.criar({ descricao: 'Pluviometro X', status: 'ativo', localId: l1.id });
  return { unidade, l1 };
}

describe('use-case registrarMovimentacao (quantificavel)', () => {
  beforeEach(() => _resetEstoqueMock());

  it('entrada acumula saldo; saida reduz', async () => {
    const { material, l1 } = await seedQuantificavel();
    const e = await registrarMovimentacao(
      repo,
      { tipo: 'entrada', materialId: material.id, quantidade: 10, localDestino: l1.id },
      USER,
    );
    expect(e.saldo?.quantidade).toBe(10);
    expect(e.movimentacao.usuarioId).toBe(USER);

    const s = await registrarMovimentacao(
      repo,
      { tipo: 'saida', materialId: material.id, quantidade: 4, localOrigem: l1.id },
      USER,
    );
    expect(s.saldo?.quantidade).toBe(6);
    const atual = await saldos.obterPorMaterialLocal(material.id, l1.id, null);
    expect(atual?.quantidade).toBe(6);
  });

  it('saida acima do saldo lanca SaldoInsuficiente e nao fica negativo', async () => {
    const { material, l1 } = await seedQuantificavel();
    await registrarMovimentacao(
      repo,
      { tipo: 'entrada', materialId: material.id, quantidade: 5, localDestino: l1.id },
      USER,
    );
    await expect(
      registrarMovimentacao(
        repo,
        { tipo: 'saida', materialId: material.id, quantidade: 6, localOrigem: l1.id },
        USER,
      ),
    ).rejects.toBeInstanceOf(SaldoInsuficiente);
    const atual = await saldos.obterPorMaterialLocal(material.id, l1.id, null);
    expect(atual?.quantidade).toBe(5); // intacto
  });

  it('esvaziar ate zero e entao retirar 1 lanca insuficiente (nao-negativo)', async () => {
    const { material, l1 } = await seedQuantificavel();
    await registrarMovimentacao(repo, { tipo: 'entrada', materialId: material.id, quantidade: 5, localDestino: l1.id }, USER);
    await registrarMovimentacao(repo, { tipo: 'saida', materialId: material.id, quantidade: 5, localOrigem: l1.id }, USER);
    const zero = await saldos.obterPorMaterialLocal(material.id, l1.id, null);
    expect(zero?.quantidade).toBe(0);
    await expect(
      registrarMovimentacao(repo, { tipo: 'saida', materialId: material.id, quantidade: 1, localOrigem: l1.id }, USER),
    ).rejects.toBeInstanceOf(SaldoInsuficiente);
  });

  it('transferencia move saldo entre locais atomicamente', async () => {
    const { material, l1, l2 } = await seedQuantificavel();
    await registrarMovimentacao(repo, { tipo: 'entrada', materialId: material.id, quantidade: 10, localDestino: l1.id }, USER);
    await registrarMovimentacao(
      repo,
      { tipo: 'transferencia', materialId: material.id, quantidade: 3, localOrigem: l1.id, localDestino: l2.id },
      USER,
    );
    expect((await saldos.obterPorMaterialLocal(material.id, l1.id, null))?.quantidade).toBe(7);
    expect((await saldos.obterPorMaterialLocal(material.id, l2.id, null))?.quantidade).toBe(3);
  });

  it('transferencia sem saldo na origem falha e nao credita destino', async () => {
    const { material, l1, l2 } = await seedQuantificavel();
    await registrarMovimentacao(repo, { tipo: 'entrada', materialId: material.id, quantidade: 2, localDestino: l1.id }, USER);
    await expect(
      registrarMovimentacao(
        repo,
        { tipo: 'transferencia', materialId: material.id, quantidade: 5, localOrigem: l1.id, localDestino: l2.id },
        USER,
      ),
    ).rejects.toBeInstanceOf(SaldoInsuficiente);
    expect(await saldos.obterPorMaterialLocal(material.id, l2.id, null)).toBeNull();
  });

  it('baixa de quantificavel reduz saldo com motivo', async () => {
    const { material, l1 } = await seedQuantificavel();
    await registrarMovimentacao(repo, { tipo: 'entrada', materialId: material.id, quantidade: 4, localDestino: l1.id }, USER);
    const r = await registrarMovimentacao(
      repo,
      { tipo: 'baixa', materialId: material.id, quantidade: 1, localOrigem: l1.id, motivo: 'avariado' },
      USER,
    );
    expect(r.saldo?.quantidade).toBe(3);
    expect(r.movimentacao.motivo).toBe('avariado');
  });
});

describe('use-case registrarMovimentacao (serializado)', () => {
  beforeEach(() => _resetEstoqueMock());

  it('baixa muda status para descarte; baixar de novo e transicao invalida', async () => {
    const { unidade } = await seedSerializado();
    const r = await registrarMovimentacao(
      repo,
      { tipo: 'baixa', unidadeId: unidade.id, motivo: 'fim de vida util' },
      USER,
    );
    expect(r.unidade?.status).toBe('descarte');
    expect(r.movimentacao.statusAnterior).toBe('ativo');
    expect(r.movimentacao.statusNovo).toBe('descarte');

    await expect(
      registrarMovimentacao(repo, { tipo: 'baixa', unidadeId: unidade.id, motivo: 'de novo' }, USER),
    ).rejects.toBeInstanceOf(TransicaoStatusInvalida);
  });

  it('transferencia muda o local da unidade', async () => {
    const { unidade, l1 } = await seedSerializado();
    const l2 = await locais.criar({ unidade: 'ARARAQUARA', sala: '9' });
    const r = await registrarMovimentacao(
      repo,
      { tipo: 'transferencia', unidadeId: unidade.id, localOrigem: l1.id, localDestino: l2.id },
      USER,
    );
    expect(r.unidade?.localId).toBe(l2.id);
  });

  it('ajuste reverte descarte com motivo (override auditavel)', async () => {
    const { unidade } = await seedSerializado();
    await registrarMovimentacao(repo, { tipo: 'baixa', unidadeId: unidade.id, motivo: 'baixa' }, USER);
    const r = await registrarMovimentacao(
      repo,
      { tipo: 'ajuste', unidadeId: unidade.id, motivo: 'reavaliado, voltou a operar', status: 'ativo' },
      USER,
    );
    expect(r.unidade?.status).toBe('ativo');
    expect(r.movimentacao.tipo).toBe('ajuste');
  });

  it('alvo ambiguo (unidade e material) e rejeitado antes de tocar o estado', async () => {
    const { unidade } = await seedSerializado();
    const material = await materiais.criar({ descricao: 'X', natureza: 'quantificavel' });
    await expect(
      registrarMovimentacao(
        repo,
        { tipo: 'baixa', unidadeId: unidade.id, materialId: material.id, motivo: 'ambiguo' },
        USER,
      ),
    ).rejects.toBeInstanceOf(AlvoMovimentacaoInvalido);
  });
});

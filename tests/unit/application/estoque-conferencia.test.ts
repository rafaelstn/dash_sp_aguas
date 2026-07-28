import { beforeEach, describe, expect, it } from 'vitest';
import { estoqueConferenciasRepository as conf } from '@/infrastructure/mock/estoque-conferencias-repository.mock';
import { estoqueMovimentacoesRepository as mov } from '@/infrastructure/mock/estoque-movimentacoes-repository.mock';
import { estoqueMateriaisRepository as materiais } from '@/infrastructure/mock/estoque-materiais-repository.mock';
import { estoqueUnidadesRepository as unidades } from '@/infrastructure/mock/estoque-unidades-repository.mock';
import { estoqueLocaisRepository as locais } from '@/infrastructure/mock/estoque-locais-repository.mock';
import { estoqueSaldosRepository as saldos } from '@/infrastructure/mock/estoque-saldos-repository.mock';
import { estoqueStore, _resetEstoqueMock } from '@/infrastructure/mock/estoque-store.mock';
import { abrirConferencia } from '@/application/use-cases/estoque/abrir-conferencia';
import { registrarContagem } from '@/application/use-cases/estoque/registrar-contagem';
import {
  reconciliarItem,
  reconciliarLote,
} from '@/application/use-cases/estoque/reconciliar-conferencia';
import { concluirConferencia } from '@/application/use-cases/estoque/concluir-conferencia';
import { registrarMovimentacao } from '@/application/use-cases/estoque/registrar-movimentacao';
import {
  ConferenciaFechada,
  ConferenciaNaoConcluida,
  DadosInvalidos,
  EscopoConferenciaEmAberto,
  ItemConferenciaNaoEncontrado,
  ItemSemDivergencia,
  LocalNaoEncontrado,
} from '@/domain/errors';

const USER = '99999999-9999-9999-9999-999999999999';

async function seedQuant(qtdInicial: number) {
  const material = await materiais.criar({ descricao: 'Cabo', natureza: 'quantificavel' });
  const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
  const l2 = await locais.criar({ unidade: 'ARARAQUARA', sala: '2' });
  if (qtdInicial > 0) {
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: qtdInicial, localDestino: l1.id },
      USER,
    );
  }
  return { material, l1, l2 };
}

async function seedSerial() {
  const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
  const l2 = await locais.criar({ unidade: 'ARARAQUARA', sala: '2' });
  const unidade = await unidades.criar({ descricao: 'Pluviometro', status: 'ativo', localId: l1.id });
  return { unidade, l1, l2 };
}

function movsComConferencia(): number {
  return estoqueStore.movimentacoes.filter((m) => m.conferenciaId !== null).length;
}

describe('conferencia, abrir + snapshot congelado (quantificavel)', () => {
  beforeEach(() => _resetEstoqueMock());

  it('congela quantidade_sistema no snapshot do escopo', async () => {
    const { material, l1 } = await seedQuant(10);
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    expect(sessao.status).toBe('aberta');

    const { itens } = await conf.listarItens(sessao.id, {});
    expect(itens).toHaveLength(1);
    expect(itens[0]!.materialId).toBe(material.id);
    expect(itens[0]!.localEsperadoId).toBe(l1.id);
    expect(itens[0]!.quantidadeSistema).toBe(10);
    expect(itens[0]!.quantidadeContada).toBeNull();

    // Movimentacao concorrente depois do snapshot NAO muda o congelado.
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: 5, localDestino: l1.id },
      USER,
    );
    const { itens: depois } = await conf.listarItens(sessao.id, {});
    expect(depois[0]!.quantidadeSistema).toBe(10);
  });

  it('barra 2 sessoes abertas no mesmo escopo', async () => {
    await seedQuant(10);
    await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    await expect(
      abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER),
    ).rejects.toBeInstanceOf(EscopoConferenciaEmAberto);
  });

  it('so entra saldo positivo do escopo (unidade fisica)', async () => {
    const { material, l2 } = await seedQuant(10);
    // saldo em ARARAQUARA nao entra numa conferencia de PENHA.
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: 4, localDestino: l2.id },
      USER,
    );
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const { itens } = await conf.listarItens(sessao.id, {});
    expect(itens).toHaveLength(1); // so o de PENHA
  });
});

describe('conferencia, contagem + reconciliacao (quantificavel)', () => {
  beforeEach(() => _resetEstoqueMock());

  async function abrirEContar(contada: number, sistema = 10) {
    const seed = await seedQuant(sistema);
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const { itens } = await conf.listarItens(sessao.id, {});
    const item = itens[0]!;
    await registrarContagem(conf, sessao.id, item.id, { quantidadeContada: contada }, USER);
    return { sessao, item, seed };
  }

  it('sobra: reconciliar gera entrada e ajusta o saldo real; idempotente', async () => {
    const { sessao, item, seed } = await abrirEContar(13, 10);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);

    const r1 = await reconciliarItem(conf, sessao.id, item.id, USER);
    expect(r1.jaReconciliado).toBe(false);
    expect(r1.aviso).toBeNull();
    expect(r1.movimentacaoId).not.toBeNull();
    expect((await saldos.obterPorMaterialLocal(seed.material.id, seed.l1.id, null))?.quantidade).toBe(13);
    expect(movsComConferencia()).toBe(1);

    // Segunda chamada = no-op idempotente (nao gera 2a movimentacao, nao mexe no saldo).
    const r2 = await reconciliarItem(conf, sessao.id, item.id, USER);
    expect(r2.jaReconciliado).toBe(true);
    expect(r2.movimentacaoId).toBe(r1.movimentacaoId);
    expect((await saldos.obterPorMaterialLocal(seed.material.id, seed.l1.id, null))?.quantidade).toBe(13);
    expect(movsComConferencia()).toBe(1);
  });

  it('falta: reconciliar gera saida do modulo da diferenca', async () => {
    const { sessao, item, seed } = await abrirEContar(7, 10);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    const r = await reconciliarItem(conf, sessao.id, item.id, USER);
    expect(r.movimentacaoId).not.toBeNull();
    expect((await saldos.obterPorMaterialLocal(seed.material.id, seed.l1.id, null))?.quantidade).toBe(7);
  });

  it('diferenca zero nao se reconcilia: recusa sem tocar o estoque', async () => {
    // Antes o item batido era carimbado como reconciliado (saia das pendencias
    // e entrava no total de tratados) sem que nada tivesse sido apurado.
    const { sessao, item } = await abrirEContar(10, 10);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    await expect(reconciliarItem(conf, sessao.id, item.id, USER)).rejects.toBeInstanceOf(
      ItemSemDivergencia,
    );
    expect((await conf.obterItem(sessao.id, item.id))?.reconciliadoEm).toBeNull();
    expect(movsComConferencia()).toBe(0);
  });

  it('avisa base_alterada quando o saldo atual difere do congelado', async () => {
    const { sessao, item, seed } = await abrirEContar(12, 10); // dif +2 sobre base 10
    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    // Movimentacao legitima durante/apos a contagem: saldo real vai a 15.
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: seed.material.id, quantidade: 5, localDestino: seed.l1.id },
      USER,
    );
    const r = await reconciliarItem(conf, sessao.id, item.id, USER);
    expect(r.aviso).toBe('base_alterada');
    // Aplica o delta (+2) sobre o saldo atual (15): 17.
    expect((await saldos.obterPorMaterialLocal(seed.material.id, seed.l1.id, null))?.quantidade).toBe(17);
  });

  it('nao reconcilia antes de concluir a sessao', async () => {
    const { sessao, item } = await abrirEContar(13, 10);
    await expect(reconciliarItem(conf, sessao.id, item.id, USER)).rejects.toBeInstanceOf(
      ConferenciaNaoConcluida,
    );
  });
});

describe('conferencia, contagem + reconciliacao (serializado)', () => {
  beforeEach(() => _resetEstoqueMock());

  it('encontrado_em_outro_local gera transferencia e move a unidade', async () => {
    const { unidade, l2 } = await seedSerial();
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'serializado' }, USER);
    const { itens } = await conf.listarItens(sessao.id, {});
    expect(itens[0]!.situacao).toBe('pendente');

    await registrarContagem(
      conf,
      sessao.id,
      itens[0]!.id,
      { situacao: 'encontrado_em_outro_local', localEncontradoId: l2.id },
      USER,
    );
    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    const r = await reconciliarItem(conf, sessao.id, itens[0]!.id, USER);
    expect(r.movimentacaoId).not.toBeNull();
    expect((await unidades.obterPorId(unidade.id))?.localId).toBe(l2.id);
  });

  it('conferido nao gera movimentacao; nao_encontrado so carimba com nota', async () => {
    const { unidade } = await seedSerial();
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'serializado' }, USER);
    const { itens } = await conf.listarItens(sessao.id, {});
    await registrarContagem(conf, sessao.id, itens[0]!.id, { situacao: 'nao_encontrado' }, USER);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);

    const r = await reconciliarItem(conf, sessao.id, itens[0]!.id, USER);
    expect(r.movimentacaoId).toBeNull();
    expect(r.item.observacao).toBe('nao localizado: requer apuracao');
    // nao mexeu na unidade (nao virou baixa automatica).
    expect((await unidades.obterPorId(unidade.id))?.status).toBe('ativo');
  });
});

describe('conferencia, sobra / IDOR / lote / resumo', () => {
  beforeEach(() => _resetEstoqueMock());

  it('sobra quantificavel (material sem saldo) reconcilia como entrada', async () => {
    const material = await materiais.criar({ descricao: 'Antena', natureza: 'quantificavel' });
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const vazio = await conf.listarItens(sessao.id, {});
    expect(vazio.itens).toHaveLength(0); // sem saldo no snapshot

    const item = await conf.adicionarSobra(
      sessao.id,
      { tipo: 'quantificavel', materialId: material.id, localId: l1.id, tamanho: null, quantidadeContada: 4 },
      USER,
    );
    expect(item.diferenca).toBe(4);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    await reconciliarItem(conf, sessao.id, item.id, USER);
    expect((await saldos.obterPorMaterialLocal(material.id, l1.id, null))?.quantidade).toBe(4);
  });

  it('IDOR: item so e acessivel pela conferencia dona (id + conferencia_id juntos)', async () => {
    await seedQuant(10);
    const s1 = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const item = (await conf.listarItens(s1.id, {})).itens[0]!;

    // outra conferencia REAL (existe), mas nao e a dona do item de s1.
    await seedQuant(3); // gera saldo em ARARAQUARA? nao: seedQuant usa PENHA. Basta existir a sessao.
    const s2 = await abrirConferencia(conf, { unidade: 'ARARAQUARA', natureza: 'quantificavel' }, USER);
    await concluirConferencia(conf, s2.id, 'concluir', USER);

    // obterItem valida id + conferencia_id: item de s1 nao aparece por s2.
    expect(await conf.obterItem(s2.id, item.id)).toBeNull();
    // reconciliar pela conferencia errada -> item nao encontrado (guarda de IDOR).
    await expect(reconciliarItem(conf, s2.id, item.id, USER)).rejects.toBeInstanceOf(
      ItemConferenciaNaoEncontrado,
    );
  });

  it('lote: item bom reconcilia, id invalido cai como falha (partial success)', async () => {
    const { material, l1 } = await seedQuant(10);
    void material;
    void l1;
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const item = (await conf.listarItens(sessao.id, {})).itens[0]!;
    await registrarContagem(conf, sessao.id, item.id, { quantidadeContada: 12 }, USER);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);

    const idFantasma = 'ffffffff-0000-0000-0000-000000000000';
    const res = await reconciliarLote(conf, sessao.id, [item.id, idFantasma], USER);
    expect(res.total).toBe(2);
    expect(res.reconciliados).toBe(1);
    expect(res.falhas).toBe(1);
    expect(res.itens.find((i) => i.itemId === item.id)?.sucesso).toBe(true);
    expect(res.itens.find((i) => i.itemId === idFantasma)?.sucesso).toBe(false);
  });

  it('resumo conta divergentes, contados e pendentes de reconciliacao', async () => {
    const { material, l1 } = await seedQuant(10);
    void material;
    void l1;
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const item = (await conf.listarItens(sessao.id, {})).itens[0]!;
    await registrarContagem(conf, sessao.id, item.id, { quantidadeContada: 15 }, USER);
    const resumo = await conf.resumoDivergencias(sessao.id);
    expect(resumo.totalItens).toBe(1);
    expect(resumo.contados).toBe(1);
    expect(resumo.divergentes).toBe(1);
    expect(resumo.pendentesReconciliacao).toBe(1);
    expect(resumo.reconciliados).toBe(0);
  });

  it('cancelar leva a sessao a cancelada sem tocar o estoque', async () => {
    await seedQuant(10);
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const cancelada = await concluirConferencia(conf, sessao.id, 'cancelar', USER);
    expect(cancelada.status).toBe('cancelada');
    expect(movsComConferencia()).toBe(0);
  });
});

describe('conferencia, integridade da sobra e da reconciliacao', () => {
  beforeEach(() => _resetEstoqueMock());

  it('sobra em local COM saldo congela o saldo real, nao zero', async () => {
    // O local L2 tem saldo 200 e esta fora do snapshot (a sessao e escopada em L1).
    // Com `quantidade_sistema = 0` fixo, a contagem 200 viraria uma entrada de 200
    // sobre um saldo que ja era 200: o inventario ganharia 200 unidades fantasma.
    const material = await materiais.criar({ descricao: 'Antena', natureza: 'quantificavel' });
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    const l2 = await locais.criar({ unidade: 'PENHA', sala: '2' });
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: 200, localDestino: l2.id },
      USER,
    );
    const sessao = await abrirConferencia(
      conf,
      { unidade: 'PENHA', natureza: 'quantificavel', localId: l1.id },
      USER,
    );

    const item = await conf.adicionarSobra(
      sessao.id,
      { tipo: 'quantificavel', materialId: material.id, localId: l1.id, tamanho: null, quantidadeContada: 5 },
      USER,
    );
    expect(item.quantidadeSistema).toBe(0); // L1 realmente nao tem saldo
    expect(item.diferenca).toBe(5);

    // E o caso que motivou a correcao: sobra num local que JA tem saldo.
    const s2 = await abrirConferencia(
      conf,
      { unidade: 'PENHA', natureza: 'quantificavel', localId: l2.id },
      USER,
    );
    const doL2 = (await conf.listarItens(s2.id, {})).itens[0]!;
    await registrarContagem(conf, s2.id, doL2.id, { quantidadeContada: 200 }, USER);
    await concluirConferencia(conf, s2.id, 'concluir', USER);
    // Contagem igual ao saldo: nada a reconciliar, e o saldo continua 200.
    await expect(reconciliarItem(conf, s2.id, doL2.id, USER)).rejects.toBeInstanceOf(
      ItemSemDivergencia,
    );
    expect((await saldos.obterPorMaterialLocal(material.id, l2.id, null))?.quantidade).toBe(200);
  });

  it('sobra fora do escopo da sessao e recusada', async () => {
    const material = await materiais.criar({ descricao: 'Antena', natureza: 'quantificavel' });
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    const outraUnidade = await locais.criar({ unidade: 'ARARAQUARA', sala: '9' });
    const sessao = await abrirConferencia(
      conf,
      { unidade: 'PENHA', natureza: 'quantificavel', localId: l1.id },
      USER,
    );

    // Local de outra unidade fisica.
    await expect(
      conf.adicionarSobra(
        sessao.id,
        { tipo: 'quantificavel', materialId: material.id, localId: outraUnidade.id, tamanho: null, quantidadeContada: 3 },
        USER,
      ),
    ).rejects.toBeInstanceOf(DadosInvalidos);

    // Local da mesma unidade, mas fora do local em que a sessao foi escopada.
    const l3 = await locais.criar({ unidade: 'PENHA', sala: '3' });
    await expect(
      conf.adicionarSobra(
        sessao.id,
        { tipo: 'quantificavel', materialId: material.id, localId: l3.id, tamanho: null, quantidadeContada: 3 },
        USER,
      ),
    ).rejects.toBeInstanceOf(DadosInvalidos);

    // Local inexistente vira 404 do modulo, nao falha de repositorio.
    await expect(
      conf.adicionarSobra(
        sessao.id,
        {
          tipo: 'quantificavel',
          materialId: material.id,
          localId: 'ffffffff-0000-0000-0000-000000000000',
          tamanho: null,
          quantidadeContada: 3,
        },
        USER,
      ),
    ).rejects.toBeInstanceOf(LocalNaoEncontrado);
  });

  it('sobra serializada sem local de origem, ou no proprio local, e recusada', async () => {
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    const l2 = await locais.criar({ unidade: 'PENHA', sala: '2' });
    const semLocal = await unidades.criar({ descricao: 'Sensor', status: 'ativo', localId: null });
    const comLocal = await unidades.criar({ descricao: 'Radar', status: 'ativo', localId: l1.id });
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'serializado' }, USER);

    // Sem local atual a reconciliacao montaria transferencia sem origem.
    await expect(
      conf.adicionarSobra(
        sessao.id,
        { tipo: 'serializado', unidadeId: semLocal.id, localEncontradoId: l2.id },
        USER,
      ),
    ).rejects.toBeInstanceOf(DadosInvalidos);

    // Encontrado no mesmo local em que ja consta: transferencia de A para A.
    await expect(
      conf.adicionarSobra(
        sessao.id,
        { tipo: 'serializado', unidadeId: comLocal.id, localEncontradoId: l1.id },
        USER,
      ),
    ).rejects.toBeInstanceOf(DadosInvalidos);
  });

  it('reconciliar item sem divergencia e recusado, e nao carimba o item', async () => {
    const { material, l1 } = await seedQuant(10);
    void material;
    void l1;
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const item = (await conf.listarItens(sessao.id, {})).itens[0]!;

    // Nem contado: nao ha o que apurar.
    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    await expect(reconciliarItem(conf, sessao.id, item.id, USER)).rejects.toBeInstanceOf(
      ItemSemDivergencia,
    );
    const depois = await conf.obterItem(sessao.id, item.id);
    expect(depois?.reconciliadoEm).toBeNull();
    expect(depois?.reconciliadoPor).toBeNull();
    expect(movsComConferencia()).toBe(0);
  });

  it('lote: item sem divergencia cai como falha e nao derruba o item bom', async () => {
    const material = await materiais.criar({ descricao: 'Cabo', natureza: 'quantificavel' });
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    const l2 = await locais.criar({ unidade: 'PENHA', sala: '2' });
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: 10, localDestino: l1.id },
      USER,
    );
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: 7, localDestino: l2.id },
      USER,
    );
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const itens = (await conf.listarItens(sessao.id, {})).itens;
    const divergente = itens.find((i) => i.localEsperadoId === l1.id)!;
    const igual = itens.find((i) => i.localEsperadoId === l2.id)!;
    await registrarContagem(conf, sessao.id, divergente.id, { quantidadeContada: 12 }, USER);
    await registrarContagem(conf, sessao.id, igual.id, { quantidadeContada: 7 }, USER);
    await concluirConferencia(conf, sessao.id, 'concluir', USER);

    const res = await reconciliarLote(conf, sessao.id, [divergente.id, igual.id], USER);
    expect(res.reconciliados).toBe(1);
    expect(res.falhas).toBe(1);
    expect(res.itens.find((i) => i.itemId === igual.id)?.erro).toBe('ItemSemDivergencia');
    expect((await saldos.obterPorMaterialLocal(material.id, l1.id, null))?.quantidade).toBe(12);
    expect((await saldos.obterPorMaterialLocal(material.id, l2.id, null))?.quantidade).toBe(7);
  });

  it('remover sobra: apaga a adicionada por engano e protege o resto', async () => {
    const material = await materiais.criar({ descricao: 'Antena', natureza: 'quantificavel' });
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    await registrarMovimentacao(
      mov,
      { tipo: 'entrada', materialId: material.id, quantidade: 10, localDestino: l1.id },
      USER,
    );
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const doSnapshot = (await conf.listarItens(sessao.id, {})).itens[0]!;

    const outroMaterial = await materiais.criar({ descricao: 'Cabo', natureza: 'quantificavel' });
    const sobra = await conf.adicionarSobra(
      sessao.id,
      { tipo: 'quantificavel', materialId: outroMaterial.id, localId: l1.id, tamanho: null, quantidadeContada: 3 },
      USER,
    );

    // Item do escopo conferido e evidencia: nao se apaga.
    await expect(conf.removerSobra(sessao.id, doSnapshot.id)).rejects.toBeInstanceOf(DadosInvalidos);
    // IDOR: a remocao tambem exige item + conferencia juntos.
    const outra = await abrirConferencia(
      conf,
      { unidade: 'ARARAQUARA', natureza: 'quantificavel' },
      USER,
    );
    await expect(conf.removerSobra(outra.id, sobra.id)).rejects.toBeInstanceOf(
      ItemConferenciaNaoEncontrado,
    );

    await conf.removerSobra(sessao.id, sobra.id);
    const restantes = (await conf.listarItens(sessao.id, {})).itens.map((i) => i.id);
    expect(restantes).toEqual([doSnapshot.id]);
  });

  it('remover sobra: recusa depois de reconciliada e com a sessao fechada', async () => {
    const material = await materiais.criar({ descricao: 'Antena', natureza: 'quantificavel' });
    const l1 = await locais.criar({ unidade: 'PENHA', sala: '1' });
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'quantificavel' }, USER);
    const sobra = await conf.adicionarSobra(
      sessao.id,
      { tipo: 'quantificavel', materialId: material.id, localId: l1.id, tamanho: null, quantidadeContada: 4 },
      USER,
    );

    await concluirConferencia(conf, sessao.id, 'concluir', USER);
    // Sessao fechada: a contagem esta final, nao se mexe mais nos itens.
    await expect(conf.removerSobra(sessao.id, sobra.id)).rejects.toBeInstanceOf(ConferenciaFechada);

    await reconciliarItem(conf, sessao.id, sobra.id, USER);
    // E depois de reconciliada existe movimentacao no ledger: apagar deixaria o
    // ajuste orfao. A correcao ali e uma nova movimentacao.
    await expect(conf.removerSobra(sessao.id, sobra.id)).rejects.toBeInstanceOf(ConferenciaFechada);
    expect((await saldos.obterPorMaterialLocal(material.id, l1.id, null))?.quantidade).toBe(4);
  });

  it('contagem serializada em local inexistente devolve o 404 do modulo', async () => {
    const { unidade } = await seedSerial();
    void unidade;
    const sessao = await abrirConferencia(conf, { unidade: 'PENHA', natureza: 'serializado' }, USER);
    const item = (await conf.listarItens(sessao.id, {})).itens[0]!;
    await expect(
      registrarContagem(
        conf,
        sessao.id,
        item.id,
        {
          situacao: 'encontrado_em_outro_local',
          localEncontradoId: 'ffffffff-0000-0000-0000-000000000000',
        },
        USER,
      ),
    ).rejects.toBeInstanceOf(LocalNaoEncontrado);
  });
});

describe('conferencia, observacao do item na contagem', () => {
  beforeEach(() => _resetEstoqueMock());

  async function itemContadoCom(observacao?: string | null) {
    await seedQuant(10);
    const sessao = await abrirConferencia(
      conf,
      { unidade: 'PENHA', natureza: 'quantificavel' },
      USER,
    );
    const { itens } = await conf.listarItens(sessao.id, {});
    const item = itens[0]!;
    await registrarContagem(
      conf,
      sessao.id,
      item.id,
      { quantidadeContada: 10, ...(observacao === undefined ? {} : { observacao }) },
      USER,
    );
    return { sessao, itemId: item.id };
  }

  async function observacaoDe(sessaoId: string, itemId: string) {
    return (await conf.obterItem(sessaoId, itemId))?.observacao;
  }

  it('grava o texto informado, sem espaco nas pontas', async () => {
    const { sessao, itemId } = await itemContadoCom('  Caixa molhada  ');
    expect(await observacaoDe(sessao.id, itemId)).toBe('Caixa molhada');
  });

  it('recontagem sem o campo preserva a observacao anterior', async () => {
    const { sessao, itemId } = await itemContadoCom('Caixa molhada');
    await registrarContagem(conf, sessao.id, itemId, { quantidadeContada: 11 }, USER);
    expect(await observacaoDe(sessao.id, itemId)).toBe('Caixa molhada');
  });

  it('null limpa a observacao gravada por engano', async () => {
    const { sessao, itemId } = await itemContadoCom('Texto errado');
    await registrarContagem(
      conf,
      sessao.id,
      itemId,
      { quantidadeContada: 10, observacao: null },
      USER,
    );
    expect(await observacaoDe(sessao.id, itemId)).toBeNull();
  });

  it('texto em branco tambem limpa, em vez de gravar espaco', async () => {
    const { sessao, itemId } = await itemContadoCom('Texto errado');
    await registrarContagem(
      conf,
      sessao.id,
      itemId,
      { quantidadeContada: 10, observacao: '   ' },
      USER,
    );
    expect(await observacaoDe(sessao.id, itemId)).toBeNull();
  });
});

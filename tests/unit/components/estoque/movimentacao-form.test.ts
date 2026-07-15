import { describe, it, expect } from 'vitest';
import {
  camposVisiveis,
  estadoInicialForm,
  montarPayload,
  tiposPorNatureza,
  type AlvoMov,
  type EstadoFormMov,
} from '@/components/features/estoque/movimentacao-form';

const UNIDADE_ID = '11111111-1111-1111-1111-111111111111';
const MATERIAL_ID = '22222222-2222-2222-2222-222222222222';
const LOCAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const LOCAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const serial: AlvoMov = { natureza: 'serializado', unidadeId: UNIDADE_ID };
const quant: AlvoMov = { natureza: 'quantificavel', materialId: MATERIAL_ID };

function form(over: Partial<EstadoFormMov>): EstadoFormMov {
  return { ...estadoInicialForm('transferencia'), ...over };
}

describe('tiposPorNatureza', () => {
  it('serializado inclui ajuste; quantificavel nao', () => {
    expect(tiposPorNatureza('serializado')).toContain('ajuste');
    expect(tiposPorNatureza('quantificavel')).not.toContain('ajuste');
  });
});

describe('camposVisiveis', () => {
  it('quantificavel mostra quantidade e tamanho; serializado nao', () => {
    expect(camposVisiveis('entrada', 'quantificavel').quantidade).toBe(true);
    expect(camposVisiveis('entrada', 'quantificavel').tamanho).toBe(true);
    expect(camposVisiveis('entrada', 'serializado').quantidade).toBe(false);
  });
  it('ajuste mostra estado, situacao, motivo e local', () => {
    const v = camposVisiveis('ajuste', 'serializado');
    expect(v.estado && v.status && v.motivo && v.localDestino).toBe(true);
  });
});

describe('montarPayload — serializado', () => {
  it('transferencia exige origem e destino distintos', () => {
    const igual = montarPayload(serial, form({ tipo: 'transferencia', localOrigem: LOCAL_A, localDestino: LOCAL_A }));
    expect(igual.payload).toBeNull();
    expect(igual.erros.localDestino).toBeTruthy();

    const ok = montarPayload(serial, form({ tipo: 'transferencia', localOrigem: LOCAL_A, localDestino: LOCAL_B }));
    expect(ok.payload).toEqual({
      tipo: 'transferencia',
      unidadeId: UNIDADE_ID,
      localOrigem: LOCAL_A,
      localDestino: LOCAL_B,
    });
  });

  it('baixa exige motivo com 3+ caracteres', () => {
    const semMotivo = montarPayload(serial, form({ tipo: 'baixa', motivo: 'ab' }));
    expect(semMotivo.payload).toBeNull();
    expect(semMotivo.erros.motivo).toBeTruthy();

    const ok = montarPayload(serial, form({ tipo: 'baixa', motivo: 'queimado' }));
    expect(ok.payload).toMatchObject({ tipo: 'baixa', unidadeId: UNIDADE_ID, motivo: 'queimado' });
  });

  it('ajuste exige ao menos uma mudanca', () => {
    const nada = montarPayload(serial, form({ tipo: 'ajuste', motivo: 'revisao' }));
    expect(nada.payload).toBeNull();
    expect(nada.erros.geral).toBeTruthy();

    const comStatus = montarPayload(serial, form({ tipo: 'ajuste', motivo: 'revisao', status: 'defeito' }));
    expect(comStatus.payload).toMatchObject({ tipo: 'ajuste', status: 'defeito', motivo: 'revisao' });
  });

  it('serializado nunca envia quantidade', () => {
    const r = montarPayload(serial, form({ tipo: 'entrada', localDestino: LOCAL_A }));
    expect(r.payload).not.toHaveProperty('quantidade');
    expect(r.payload).toMatchObject({ tipo: 'entrada', unidadeId: UNIDADE_ID, localDestino: LOCAL_A });
  });
});

describe('montarPayload — quantificavel', () => {
  it('entrada exige destino e envia quantidade/tamanho', () => {
    const semDestino = montarPayload(quant, form({ tipo: 'entrada', quantidade: 5 }));
    expect(semDestino.payload).toBeNull();
    expect(semDestino.erros.localDestino).toBeTruthy();

    const ok = montarPayload(
      quant,
      form({ tipo: 'entrada', quantidade: 5, tamanho: '10mm', localDestino: LOCAL_A }),
    );
    expect(ok.payload).toEqual({
      tipo: 'entrada',
      materialId: MATERIAL_ID,
      quantidade: 5,
      tamanho: '10mm',
      localDestino: LOCAL_A,
    });
  });

  it('quantidade menor que 1 e invalida', () => {
    const r = montarPayload(quant, form({ tipo: 'entrada', quantidade: 0, localDestino: LOCAL_A }));
    expect(r.payload).toBeNull();
    expect(r.erros.quantidade).toBeTruthy();
  });

  it('saida exige origem', () => {
    const r = montarPayload(quant, form({ tipo: 'saida', quantidade: 2 }));
    expect(r.payload).toBeNull();
    expect(r.erros.localOrigem).toBeTruthy();
  });
});

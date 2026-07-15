import { afterEach, describe, expect, it, vi } from 'vitest';
import { sibhClient, _resetSibhCache } from '@/infrastructure/sibh/sibh-client';

/**
 * Testes do adapter SIBH (`sibh-client`) para a Fase 2 (série de nível) e para o
 * status de transmissão (migration 0053).
 *
 * Estratégia: mocka o `fetch` global. O endpoint `/stations` resolve o id da
 * estação por prefixo; o `/measurements` devolve as medições brutas. Sem tocar a
 * rede real. `_resetSibhCache` limpa o cache de estações entre os testes.
 */

interface StationBruta {
  prefix: string;
  id: string;
  station_type_id: string;
  latitude?: number;
  longitude?: number;
  transmission_status?: string | null;
  date_last_measurement?: string | null;
}

interface MedBruta {
  prefix: string;
  date?: string;
  value?: number | null;
  read_value?: number | null;
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  } as unknown as Response;
}

/**
 * Instala um fetch que responde /stations e /measurements. As medições são
 * devolvidas como array direto (o adapter aceita array ou { measurements }).
 */
function instalarFetch(stations: StationBruta[], measurements: MedBruta[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.includes('/stations')) return jsonResponse(stations);
      if (url.includes('/measurements')) return jsonResponse(measurements);
      throw new Error(`URL inesperada no teste: ${url}`);
    }),
  );
}

const DESDE = new Date('2026-07-01T00:00:00Z');
const ATE = new Date('2026-07-15T00:00:00Z');

const STATION_FLU: StationBruta = {
  prefix: '2D-028',
  id: '821',
  station_type_id: '1',
  latitude: -22.7,
  longitude: -45.1,
  transmission_status: 'ok',
  date_last_measurement: 'Wed Jul 15 2026 13:40:00 GMT+0000 (Coordinated Universal Time)',
};

afterEach(() => {
  _resetSibhCache();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('sibhClient.serieNivelPorPrefixo — mapeamento read_value/value', () => {
  it('usa read_value quando finito (nível físico)', async () => {
    instalarFetch(
      [STATION_FLU],
      [{ prefix: '2D-028', date: '2026/07/05 14:00', value: 25746, read_value: 625 }],
    );
    const serie = await sibhClient.serieNivelPorPrefixo('2D-028', DESDE, ATE);
    expect(serie).toEqual([{ momento: '2026/07/05 14:00', nivelM: 625 }]);
  });

  it('cai para value quando read_value é nulo (caso real de SP Águas)', async () => {
    instalarFetch(
      [STATION_FLU],
      [{ prefix: '2D-028', date: '2026/07/15 00:00', value: 129.4, read_value: null }],
    );
    const serie = await sibhClient.serieNivelPorPrefixo('2D-028', DESDE, ATE);
    expect(serie).toEqual([{ momento: '2026/07/15 00:00', nivelM: 129.4 }]);
  });

  it('descarta medição sem nível finito (read_value e value nulos)', async () => {
    instalarFetch(
      [STATION_FLU],
      [
        { prefix: '2D-028', date: '2026/07/15 00:00', value: null, read_value: null },
        { prefix: '2D-028', date: '2026/07/15 01:00', value: 130.1, read_value: null },
      ],
    );
    const serie = await sibhClient.serieNivelPorPrefixo('2D-028', DESDE, ATE);
    expect(serie).toEqual([{ momento: '2026/07/15 01:00', nivelM: 130.1 }]);
  });

  it('descarta medição sem date e filtra prefixo diferente', async () => {
    instalarFetch(
      [STATION_FLU],
      [
        { prefix: '2D-028', value: 1.1, read_value: null }, // sem date
        { prefix: 'OUTRO', date: '2026/07/15 00:00', value: 9, read_value: null }, // outro prefixo
        { prefix: '2D-028', date: '2026/07/15 02:00', value: 2.2, read_value: null },
      ],
    );
    const serie = await sibhClient.serieNivelPorPrefixo('2D-028', DESDE, ATE);
    expect(serie).toEqual([{ momento: '2026/07/15 02:00', nivelM: 2.2 }]);
  });

  it('prefixo inexistente devolve [] sem chamar /measurements', async () => {
    instalarFetch([STATION_FLU], []);
    const serie = await sibhClient.serieNivelPorPrefixo('NAO-EXISTE', DESDE, ATE);
    expect(serie).toEqual([]);
    // fetch chamado só uma vez (/stations), nunca /measurements.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('prefixo vazio devolve [] sem tocar a rede', async () => {
    instalarFetch([STATION_FLU], []);
    const serie = await sibhClient.serieNivelPorPrefixo('   ', DESDE, ATE);
    expect(serie).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('sibhClient.listarEstacoes — status de transmissão (migration 0053)', () => {
  it('normaliza transmission_status e mantém date_last_measurement cru', async () => {
    instalarFetch([STATION_FLU], []);
    const estacoes = await sibhClient.listarEstacoes();
    expect(estacoes).toHaveLength(1);
    expect(estacoes[0]!.transmissionStatus).toBe('ok');
    // Mantém a STRING crua (a conversão pra ISO/timestamptz é na persistência).
    expect(estacoes[0]!.ultimaTransmissao).toBe(
      'Wed Jul 15 2026 13:40:00 GMT+0000 (Coordinated Universal Time)',
    );
  });

  it('trata date_last_measurement vazia e status ausente como null', async () => {
    instalarFetch(
      [{ ...STATION_FLU, transmission_status: '', date_last_measurement: '' }],
      [],
    );
    const estacoes = await sibhClient.listarEstacoes();
    expect(estacoes[0]!.transmissionStatus).toBeNull();
    expect(estacoes[0]!.ultimaTransmissao).toBeNull();
  });
});

/**
 * Adaptadores `.mssql` do mapa e da vazão por posto, sem banco.
 *
 * `consultarMssql` é trocado por um duplo que PASSA o texto pela guarda real
 * (`conferirConsultaDeLeitura`) antes de devolver as linhas. Assim este arquivo
 * prova duas coisas: que o SQL gerado é aceito pela guarda de somente leitura e
 * de `Excluido = 0`, e que a tradução das linhas em DTO está certa (bits em
 * listas, curva sem equação, coluna obrigatória nula).
 *
 * Pergunta de CONFIGURAÇÃO que este duplo não responde: se o SQL roda no
 * `Dbfch`. Essa é respondida pela chamada real registrada no relatório.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const respostas = vi.hoisted(() => ({
  fila: [] as Array<(sql: string) => unknown[]>,
  sqls: [] as string[],
}));

vi.mock('@/infrastructure/db/mssql-client', async (original) => {
  const real = await original<typeof import('@/infrastructure/db/mssql-client')>();
  return {
    ...real,
    consultarMssql: vi.fn(async (sqlTexto: string) => {
      real.conferirConsultaDeLeitura(sqlTexto);
      respostas.sqls.push(sqlTexto);
      const proxima = respostas.fila.shift();
      if (!proxima) throw new Error('consulta inesperada no teste');
      return { recordset: proxima(sqlTexto) };
    }),
  };
});

import { mapaPostosRepositoryMssql } from '@/infrastructure/db/mapa-postos-repository.mssql';
import { vazaoPostoRepositoryMssql } from '@/infrastructure/db/vazao-posto-repository.mssql';
import { FalhaRepositorio } from '@/domain/errors';

const ID = 'AAAAAAAA-0000-0000-0000-000000000001';

beforeEach(() => {
  respostas.fila = [];
  respostas.sqls = [];
});

describe('mapaPostosRepositoryMssql', () => {
  it('SQL passa pela guarda e as colunas de bit viram listas', async () => {
    respostas.fila.push(() => [
      {
        Prefixo: '2D-013 ',
        Nome: ' Rio X ',
        Latitude: -22.123456789,
        Longitude: -47.987654321,
        TipoPosto: 'FLUVIOMÉTRICO',
        Extinto: 0,
        UgrhiNumero: 5,
        Municipio: ' CRUZEIRO ',
        Uf: 'sp',
        Telemetrico: 1,
        GravacaoLocal: 1,
        Convencional: 0,
        VazaoAparelho: 1,
        Medicao: 0,
        Curva: 1,
      },
      {
        Prefixo: 'B0-001',
        Nome: null,
        Latitude: -23.1,
        Longitude: null,
        TipoPosto: null,
        Extinto: 1,
        UgrhiNumero: null,
        Municipio: '  ',
        Uf: null,
        Telemetrico: null,
        GravacaoLocal: null,
        Convencional: null,
        VazaoAparelho: null,
        Medicao: 0,
        Curva: 0,
      },
    ]);
    const pontos = await mapaPostosRepositoryMssql.listarPontos({});
    expect(pontos[0]).toEqual({
      prefixo: '2D-013',
      nome: 'Rio X',
      lat: -22.12346,
      lon: -47.98765,
      tipo: 'flu',
      situacao: 'em_operacao',
      transmissao: ['telemetrico', 'gravacao_local'],
      vazao: ['aparelho_ativo', 'curva'],
      ugrhi: 5,
      municipio: 'CRUZEIRO',
      uf: 'SP',
      coordenadaSuspeita: false,
    });
    // Meia coordenada não se desenha; posto sem aparelho fica com listas vazias.
    expect(pontos[1]).toMatchObject({
      lat: null,
      lon: null,
      tipo: null,
      situacao: 'extinto',
      transmissao: [],
      vazao: [],
      ugrhi: null,
      municipio: null,
      uf: null,
      coordenadaSuspeita: false,
    });
    const sql = respostas.sqls[0]!;
    expect(sql).toContain('dbo.ResumoMedicaoVazoes rmv');
    expect(sql).toContain('app.DataDesativacao IS NULL');
    expect(sql).not.toMatch(/'[A-Z ]+TELEMETRICO'/);
    // UF do posto, com a do município como reserva: a mesma leitura medida.
    expect(sql).toContain('p.CodigoEstadoMainframe');
    expect(sql).toContain('md.CodigoUnidadeFederacaoMainframe');
  });

  it('UF só vira sigla com duas letras, e grau inteiro nos dois eixos marca suspeita', async () => {
    const linha = (prefixo: string, uf: string | null, lat: number, lon: number) => ({
      Prefixo: prefixo,
      Nome: null,
      Latitude: lat,
      Longitude: lon,
      TipoPosto: null,
      Extinto: 0,
      UgrhiNumero: null,
      Municipio: null,
      Uf: uf,
      Telemetrico: null,
      GravacaoLocal: null,
      Convencional: null,
      VazaoAparelho: null,
      Medicao: 0,
      Curva: 0,
    });
    respostas.fila.push(() => [
      // Os casos medidos no Dbfch em 17/09/2026.
      linha('4G-002', 'SP', -25, -47),
      linha('02650009', ' PR ', -26.21667, -50.93333),
      linha('X-001', 'S', -23.5, -46.6),
      linha('X-002', 'SP1', -23.5, -46.6),
      linha('X-003', '', -23.5, -46.6),
    ]);
    const pontos = await mapaPostosRepositoryMssql.listarPontos({});
    expect(pontos.map((p) => [p.prefixo, p.uf, p.coordenadaSuspeita])).toEqual([
      ['4G-002', 'SP', true],
      ['02650009', 'PR', false],
      ['X-001', null, false],
      ['X-002', null, false],
      ['X-003', null, false],
    ]);
  });

  it('falha do banco vira FalhaRepositorio', async () => {
    respostas.fila.push(() => {
      throw new Error('timeout');
    });
    await expect(mapaPostosRepositoryMssql.listarPontos({})).rejects.toBeInstanceOf(
      FalhaRepositorio,
    );
  });
});

describe('vazaoPostoRepositoryMssql', () => {
  it('prefixo inexistente devolve null sem consultar as tabelas de vazão', async () => {
    respostas.fila.push(() => []);
    expect(await vazaoPostoRepositoryMssql.listarCurvasChave('ZZ-999')).toBeNull();
    expect(respostas.sqls).toHaveLength(1);
  });

  it('medições: SQL aceito pela guarda e campos opcionais nulos preservados', async () => {
    respostas.fila.push(() => [{ Id: ID }]);
    respostas.fila.push((sql) => {
      expect(sql).toContain('OFFSET @deslocamento');
      return [
        {
          DataInicial: new Date('2023-05-10T13:00:00Z'),
          DataFinal: new Date('2023-05-10T14:30:00Z'),
          CotaInicial: 1.25,
          CotaFinal: '1.27',
          VazaoLiquida: 12.345,
          AreaSeccao: null,
          LarguraSeccao: 22.5,
          ProfundidadeMedia: null,
          VelocidadeMedia: 0.41,
          Qualidade: ' B ',
          Entidade: 'DAEE',
        },
      ];
    });
    respostas.fila.push(() => [{ Total: 1 }]);
    const pagina = await vazaoPostoRepositoryMssql.listarMedicoes('2D-006', {
      pagina: 1,
      porPagina: 10,
    });
    expect(pagina).toEqual({
      total: 1,
      itens: [
        {
          dataInicial: '2023-05-10T13:00:00.000Z',
          dataFinal: '2023-05-10T14:30:00.000Z',
          cotaInicial: 1.25,
          cotaFinal: 1.27,
          vazaoLiquida: 12.345,
          areaSeccao: null,
          larguraSeccao: 22.5,
          profundidadeMedia: null,
          velocidadeMedia: 0.41,
          qualidade: 'B',
          entidadeMedidora: 'DAEE',
        },
      ],
    });
  });

  it('medição com coluna obrigatória nula falha em vez de inventar zero', async () => {
    respostas.fila.push(() => [{ Id: ID }]);
    respostas.fila.push(() => [
      {
        DataInicial: new Date(),
        DataFinal: new Date(),
        CotaInicial: 1,
        CotaFinal: 1,
        VazaoLiquida: null,
        AreaSeccao: null,
        LarguraSeccao: null,
        ProfundidadeMedia: null,
        VelocidadeMedia: null,
        Qualidade: null,
        Entidade: null,
      },
    ]);
    respostas.fila.push(() => [{ Total: 1 }]);
    await expect(
      vazaoPostoRepositoryMssql.listarMedicoes('2D-006', { pagina: 1, porPagina: 10 }),
    ).rejects.toBeInstanceOf(FalhaRepositorio);
  });

  it('curvas: agrupa trechos por curva e mantém a curva sem equação', async () => {
    respostas.fila.push(() => [{ Id: ID }]);
    const curva = (id: string, inicio: string, trecho: [number, number, number, number] | null) => ({
      CurvaId: id,
      DataInicio: new Date(inicio),
      DataFinal: new Date('2030-01-01T00:00:00Z'),
      IndiceQualidade: 'REG',
      Consistencia: 'C ',
      Vigente: 1,
      CoeficienteK: trecho?.[0] ?? null,
      CoeficienteH: trecho?.[1] ?? null,
      CoeficienteN: trecho?.[2] ?? null,
      CoeficienteI: trecho?.[3] ?? null,
    });
    respostas.fila.push((sql) => {
      expect(sql).toContain('ON e.CurvaChaveId = c.Id AND e.Excluido = 0');
      return [
        curva('C1', '2020-01-01T00:00:00Z', [10, -0.5, 1.6, 1]),
        curva('c1', '2020-01-01T00:00:00Z', [20, 0.3, 1.2, 5]),
        curva('C2', '2010-01-01T00:00:00Z', null),
      ];
    });
    const curvas = await vazaoPostoRepositoryMssql.listarCurvasChave('2D-006');
    expect(curvas).toHaveLength(2);
    expect(curvas![0]).toMatchObject({ consistencia: 'C', vigente: true });
    expect(curvas![0]!.trechos).toEqual([
      { k: 10, h: -0.5, n: 1.6, i: 1 },
      { k: 20, h: 0.3, n: 1.2, i: 5 },
    ]);
    expect(curvas![1]!.trechos).toEqual([]);
  });
});

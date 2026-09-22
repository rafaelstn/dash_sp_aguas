/**
 * Rotas da fusão Monitor e Postos: mapa, medições de vazão e curvas-chave.
 *
 * Roda sobre os adaptadores MOCK. Cada recusa (400, 404, 401, 501) tem ao lado
 * a chamada legítima que passa, para que uma rota que recusasse tudo não
 * ficasse verde.
 */
import { NextResponse, NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const usuarioAtual = vi.fn();
const repos = vi.hoisted(() => ({ ligado: true }));

vi.mock('@/app/api/_helpers/auth', () => ({
  exigirUsuario: () => usuarioAtual(),
}));

vi.mock('@/infrastructure/security/rate-limit', () => ({
  POLITICAS: { leituraMonitor: {} },
  consumirRateLimit: () => ({ permitido: true, restante: 99, resetEm: 0 }),
  aplicarHeadersRateLimit: () => {},
}));

vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/infrastructure/repositories', async () => {
  const m = await import('@/infrastructure/mock/mapa-postos-repository.mock');
  const v = await import('@/infrastructure/mock/vazao-posto-repository.mock');
  return {
    get mapaPostosRepository() {
      return repos.ligado ? m.mapaPostosRepositoryMock : null;
    },
    get vazaoPostoRepository() {
      return repos.ligado ? v.vazaoPostoRepositoryMock : null;
    },
  };
});

import { GET as getMapa } from '@/app/api/postos/mapa/route';
import { GET as getMedicoes } from '@/app/api/postos/[prefixo]/medicoes-vazao/route';
import { GET as getCurvas } from '@/app/api/postos/[prefixo]/curvas-chave/route';

const USUARIO = { id: '22222222-2222-4222-8222-222222222222', email: 'leitor@exemplo-dmo.test', nome: null };

function req(caminho: string) {
  return new NextRequest(`http://localhost${caminho}`);
}

function ctx(prefixo: string) {
  return { params: Promise.resolve({ prefixo }) };
}

beforeEach(() => {
  repos.ligado = true;
  usuarioAtual.mockReset();
  usuarioAtual.mockResolvedValue(USUARIO);
});

describe('GET /api/postos/mapa', () => {
  it('sem filtro devolve todos os pontos com facetas', async () => {
    const res = await getMapa(req('/api/postos/mapa'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(body.pontos.length);
    expect(body.total).toBeGreaterThan(0);
    expect(body.facetas.tipo).toHaveProperty('plu');
    expect(body.facetas.vazao).toHaveProperty('qualquer');
    expect(Object.keys(body.pontos[0]).sort()).toEqual(
      [
        'coordenadaSuspeita',
        'lat',
        'lon',
        'municipio',
        'nome',
        'prefixo',
        'situacao',
        'tipo',
        'transmissao',
        'uf',
        'ugrhi',
        'vazao',
      ].sort(),
    );
  });

  it('aceita chave repetida e lista por vírgula, com o mesmo resultado', async () => {
    const repetida = await (await getMapa(req('/api/postos/mapa?tipo=plu&tipo=piezo'))).json();
    const virgula = await (await getMapa(req('/api/postos/mapa?tipo=plu,piezo'))).json();
    expect(repetida.total).toBeGreaterThan(0);
    expect(virgula.pontos).toEqual(repetida.pontos);
    expect(
      repetida.pontos.every((p: { tipo: string }) => p.tipo === 'plu' || p.tipo === 'piezo'),
    ).toBe(true);
  });

  it('combina dimensões com E', async () => {
    const body = await (
      await getMapa(req('/api/postos/mapa?tipo=flu&vazao=curva&ugrhi=2'))
    ).json();
    expect(body.pontos.map((p: { prefixo: string }) => p.prefixo)).toEqual(['2D-006']);
  });

  it('valor desconhecido responde 400 com o motivo', async () => {
    const res = await getMapa(req('/api/postos/mapa?tipo=plu,sedimento'));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.erro).toBe('query_invalida');
    expect(body.motivos.join(' ')).toContain('tipo');
    expect((await getMapa(req('/api/postos/mapa?ugrhi=23'))).status).toBe(400);
    expect((await getMapa(req('/api/postos/mapa?ugrhi=22'))).status).toBe(200);
  });

  it('ugrhi aceita só dígito decimal, e recusa a notação que o JS converteria', async () => {
    // `z.coerce.number()` passa pelo `Number()`, que aceita hexadecimal,
    // notação científica e sinal. A rota documenta "1 a 22" e prometia 400
    // para o desconhecido, mas `ugrhi=0x10` respondia 200 filtrando a 16.
    for (const invalido of ['0x10', '1e1', '+5', '2.0', 'Infinity', '0', '123']) {
      const res = await getMapa(req(`/api/postos/mapa?ugrhi=${encodeURIComponent(invalido)}`));
      expect(res.status, invalido).toBe(400);
    }
    // Controle: o que é dígito continua passando, com e sem zero à esquerda.
    for (const valido of ['2', '02', '22']) {
      expect((await getMapa(req(`/api/postos/mapa?ugrhi=${valido}`))).status, valido).toBe(200);
    }
    // `?ugrhi=` (vazio) não é valor inválido: `multiplos()` descarta o vazio e
    // o filtro deixa de existir, que é o mesmo que não mandar a chave.
    const vazio = await getMapa(req('/api/postos/mapa?ugrhi='));
    expect(vazio.status).toBe(200);
    expect((await vazio.json()).total).toBe((await (await getMapa(req('/api/postos/mapa'))).json()).total);
  });

  it('motivo de query inválida sai em português, inclusive nos ramos do union', async () => {
    // O `z.union` descarta as mensagens dos ramos e devolve "Invalid input".
    // Numa API de órgão público quem depura um link recebia inglês genérico.
    for (const [caminho, esperado] of [
      ['uf=SPX', 'sigla de UF'],
      ['ugrhi=abc', 'UGRHI'],
    ] as const) {
      const res = await getMapa(req(`/api/postos/mapa?${caminho}`));
      expect(res.status, caminho).toBe(400);
      const motivos = (await res.json()).motivos.join(' ');
      expect(motivos, caminho).toContain(esperado);
      expect(motivos, caminho).not.toContain('Invalid input');
    }
  });

  it('ugrhi=sem devolve só os postos sem UGRHI, e combina com número', async () => {
    const todos = await (await getMapa(req('/api/postos/mapa'))).json();
    const semUgrhi = todos.pontos.filter((p: { ugrhi: number | null }) => p.ugrhi === null);
    // Presença: a base de demonstração tem posto sem UGRHI, senão o caso é vazio.
    expect(semUgrhi.length).toBeGreaterThan(0);
    const res = await getMapa(req('/api/postos/mapa?ugrhi=sem'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pontos).toEqual(semUgrhi);
    const combinado = await (await getMapa(req('/api/postos/mapa?ugrhi=sem,2'))).json();
    expect(combinado.total).toBeGreaterThan(body.total);
    expect(
      combinado.pontos.every((p: { ugrhi: number | null }) => p.ugrhi === null || p.ugrhi === 2),
    ).toBe(true);
  });

  it('uf aceita sigla em qualquer caixa e `sem`; valor que não é sigla responde 400', async () => {
    const maiuscula = await getMapa(req('/api/postos/mapa?uf=SP'));
    expect(maiuscula.status).toBe(200);
    const sp = await maiuscula.json();
    expect(sp.total).toBeGreaterThan(0);
    expect(sp.pontos.every((p: { uf: string | null }) => p.uf === 'SP')).toBe(true);
    const minuscula = await (await getMapa(req('/api/postos/mapa?uf=sp'))).json();
    expect(minuscula.pontos).toEqual(sp.pontos);
    expect(sp.facetas.uf).toContainEqual({ uf: 'SP', total: sp.total });

    const outroEstado = await getMapa(req('/api/postos/mapa?uf=PR'));
    expect(outroEstado.status).toBe(200);
    expect((await outroEstado.json()).total).toBe(0);
    expect((await getMapa(req('/api/postos/mapa?uf=sem'))).status).toBe(200);

    for (const invalido of ['SPX', '1', 'S', 'S1']) {
      const res = await getMapa(req(`/api/postos/mapa?uf=${invalido}`));
      expect(res.status, invalido).toBe(400);
      expect((await res.json()).motivos.join(' ')).toContain('uf');
    }
  });

  it('termo de um caractere responde 400 termo_invalido', async () => {
    const res = await getMapa(req('/api/postos/mapa?q=a'));
    expect(res.status).toBe(400);
    expect((await res.json()).erro).toBe('termo_invalido');
  });

  it('sem sessão devolve a resposta de auth e não consulta', async () => {
    usuarioAtual.mockResolvedValue(
      NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 }),
    );
    expect((await getMapa(req('/api/postos/mapa'))).status).toBe(401);
  });

  it('sem origem configurada responde 501', async () => {
    repos.ligado = false;
    const res = await getMapa(req('/api/postos/mapa'));
    expect(res.status).toBe(501);
    expect((await res.json()).erro).toBe('origem_indisponivel');
  });
});

describe('GET /api/postos/[prefixo]/medicoes-vazao', () => {
  it('pagina as medições do posto', async () => {
    const res = await getMedicoes(
      req('/api/postos/2D-006/medicoes-vazao?pagina=2&porPagina=20'),
      ctx('2D-006'),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ prefixo: '2D-006', pagina: 2, porPagina: 20, total: 30 });
    expect(body.itens).toHaveLength(10);
    expect(body.itens[0]).toHaveProperty('vazaoLiquida');
  });

  it('prefixo inexistente responde 404; posto sem medição responde 200 vazio', async () => {
    const inexistente = await getMedicoes(req('/api/postos/ZZ-999/medicoes-vazao'), ctx('ZZ-999'));
    expect(inexistente.status).toBe(404);
    const vazio = await getMedicoes(req('/api/postos/A6-001/medicoes-vazao'), ctx('A6-001'));
    expect(vazio.status).toBe(200);
    expect(await vazio.json()).toMatchObject({ total: 0, itens: [] });
  });

  it('paginação fora do limite responde 400', async () => {
    const res = await getMedicoes(
      req('/api/postos/2D-006/medicoes-vazao?porPagina=201'),
      ctx('2D-006'),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).erro).toBe('paginacao_invalida');
  });

  it('sem origem configurada responde 501', async () => {
    repos.ligado = false;
    const res = await getMedicoes(req('/api/postos/2D-006/medicoes-vazao'), ctx('2D-006'));
    expect(res.status).toBe(501);
  });
});

describe('GET /api/postos/[prefixo]/curvas-chave', () => {
  it('lista as curvas com trechos', async () => {
    const res = await getCurvas(req('/api/postos/2D-006/curvas-chave'), ctx('2D-006'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prefixo).toBe('2D-006');
    expect(body.total).toBe(body.curvas.length);
    expect(body.curvas[0].trechos[0]).toEqual({ k: 14.5, h: 0.2, n: 1.59, i: 1.2 });
  });

  it('prefixo inexistente responde 404; posto sem curva responde 200 vazio', async () => {
    expect((await getCurvas(req('/api/postos/ZZ-999/curvas-chave'), ctx('ZZ-999'))).status).toBe(404);
    const vazio = await getCurvas(req('/api/postos/A6-001/curvas-chave'), ctx('A6-001'));
    expect(vazio.status).toBe(200);
    expect(await vazio.json()).toEqual({ prefixo: 'A6-001', total: 0, curvas: [] });
  });
});

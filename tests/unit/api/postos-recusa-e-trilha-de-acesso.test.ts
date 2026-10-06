/**
 * As três rotas de posto que o André achou descobertas em 06/10/2026, e o que
 * elas gravam na trilha de acesso ao acervo do órgão.
 *
 * O defeito tinha duas metades, e cada caso aqui reprova uma:
 *
 * 1. NENHUMA das três recusava no handler. `/api/postos/[prefixo]` e
 *    `/api/postos/[prefixo]/arquivos` liam `obterUsuarioAtual()` sem checar o
 *    resultado e serviam a ficha gravando `usuarioId: null`; `/api/postos/facetas`
 *    não tinha checagem nenhuma. A única barreira era o middleware, que
 *    REDIRECIONA para `/login` com 307, e redirecionar não é recusar: para
 *    chamada de API o cliente recebe o HTML do login com status de sucesso, e a
 *    rota fica descoberta no dia que o `matcher` mudar.
 *
 * 2. O IP da trilha saía do PRIMEIRO elemento de `x-forwarded-for`, que é
 *    justamente o pedaço que o cliente controla: quem chamasse escolhia o IP que
 *    a trilha do órgão ia registrar, sem deixar rastro.
 *
 * Cada recusa tem ao lado a chamada LEGÍTIMA que passa, para que uma rota que
 * recusasse tudo não ficasse verde aqui. E o 401 é conferido junto da trilha
 * VAZIA: devolver 401 depois de gravar a linha anônima consertaria a resposta e
 * deixaria o defeito de auditoria no lugar.
 *
 * O resolvedor de IP é o real (`rate-limit.ts`), não dublê: o que se mede é o
 * valor que CHEGA na trilha.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const obterUsuarioAtualMock = vi.fn();

vi.mock('@/infrastructure/auth/current-user', () => ({
  obterUsuarioAtual: () => obterUsuarioAtualMock(),
}));

/** O que a trilha recebeu, que é o objeto de medição desta régua. */
interface LinhaDeAcesso {
  prefixo: string;
  acao: string;
  ip: string | null;
  userAgent: string | null;
  usuarioId: string | null;
}

// A assinatura vai no GENÉRICO, não em parâmetro nomeado e ignorado: o
// `no-unused-vars` que vem de `next/typescript` não tem `argsIgnorePattern`, e
// `_linha` reprova o lint do CI com `--max-warnings 0`. Sem a assinatura,
// `vi.fn(async () => {})` infere zero argumentos e `mock.calls[0]![0]` nem
// compila.
const registrarAcesso = vi.fn<(linha: LinhaDeAcesso) => Promise<void>>(async () => {});
const buscarPorPrefixo = vi.fn<(prefixo: string) => Promise<unknown>>(async () => null);
const listarPorPrefixo = vi.fn<(prefixo: string) => Promise<unknown[]>>(async () => []);
const foiIndexadoAlgumaVez = vi.fn<(prefixo: string) => Promise<boolean>>(async () => true);
const listarFacetasRepo = vi.fn(async () => ({
  ugrhis: [{ numero: '06', nome: 'Alto Tietê', total: 3 }],
  municipios: [],
  bacias: [],
  tiposPosto: [],
  mantenedores: [],
}));

vi.mock('@/infrastructure/repositories', () => ({
  postosRepository: { buscarPorPrefixo: (p: string) => buscarPorPrefixo(p) },
  auditoriaRepository: {
    registrarAcesso: (linha: LinhaDeAcesso) => registrarAcesso(linha),
  },
  arquivosRepository: {
    listarPorPrefixo: (p: string) => listarPorPrefixo(p),
    foiIndexadoAlgumaVez: (p: string) => foiIndexadoAlgumaVez(p),
  },
  facetasRepository: { listar: () => listarFacetasRepo() },
  papeisRepository: { ehAprovador: async () => false },
}));

// Cache fresh: a ficha não depende do indexador neste teste, que é sobre recusa
// e trilha. O 202 do lazy indexing tem régua própria.
vi.mock('@/infrastructure/indexer/lazy-indexer', () => ({
  checarCache: async () => 'fresh',
  tentarLock: async () => ({ sucesso: true, resultado: {} }),
  dispararWorkerSync: async () => ({}),
  dispararWorkerBackground: () => 'job',
  IndexadorIndisponivelError: class extends Error {},
  WorkerTimeoutError: class extends Error {},
}));

vi.mock('@/infrastructure/logging/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { GET as getFicha } from '@/app/api/postos/[prefixo]/route';
import { GET as getArquivos } from '@/app/api/postos/[prefixo]/arquivos/route';
import { GET as getFacetas } from '@/app/api/postos/facetas/route';

const USUARIO = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'tecnico@spaguas.sp.gov.br',
  nome: 'Técnico',
};

const PREFIXO = '3D-007';

/** Cadeia com IP forjado na frente e o IP real anexado pela borda no fim. */
const CADEIA_FORJADA = '1.2.3.4, 10.0.0.9';

function req(caminho: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${caminho}`, { headers });
}

function ctx(prefixo: string) {
  return { params: Promise.resolve({ prefixo }) };
}

beforeEach(() => {
  obterUsuarioAtualMock.mockReset();
  registrarAcesso.mockClear();
  buscarPorPrefixo.mockReset();
  buscarPorPrefixo.mockResolvedValue({ prefixo: PREFIXO, nomeEstacao: 'Posto de prova' });
});

describe('GET /api/postos/[prefixo] (ficha, grava acesso_ficha)', () => {
  it('sem sessão recusa com 401 e NÃO grava linha na trilha', async () => {
    obterUsuarioAtualMock.mockResolvedValue(null);

    const res = await getFicha(req(`/api/postos/${PREFIXO}`), ctx(PREFIXO));

    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ erro: 'nao_autenticado' });
    expect(registrarAcesso).not.toHaveBeenCalled();
    // Recusa antes de qualquer leitura do acervo, não depois de servir.
    expect(buscarPorPrefixo).not.toHaveBeenCalled();
  });

  it('com sessão serve a ficha e grava a trilha com o ator, nunca nulo', async () => {
    obterUsuarioAtualMock.mockResolvedValue(USUARIO);

    const res = await getFicha(req(`/api/postos/${PREFIXO}`), ctx(PREFIXO));

    expect(res.status).toBe(200);
    expect(registrarAcesso).toHaveBeenCalledTimes(1);
    expect(registrarAcesso.mock.calls[0]![0]).toMatchObject({
      prefixo: PREFIXO,
      acao: 'visualizou_ficha',
      usuarioId: USUARIO.id,
    });
  });

  it('ignora o IP que o cliente põe na frente do x-forwarded-for', async () => {
    obterUsuarioAtualMock.mockResolvedValue(USUARIO);

    await getFicha(
      req(`/api/postos/${PREFIXO}`, { 'x-forwarded-for': CADEIA_FORJADA }),
      ctx(PREFIXO),
    );

    const gravado = registrarAcesso.mock.calls[0]![0];
    expect(gravado.ip).toBe('10.0.0.9');
    expect(gravado.ip).not.toBe('1.2.3.4');
  });

  it('prefere o header que a borda sobrescreve sobre a cadeia forjável', async () => {
    obterUsuarioAtualMock.mockResolvedValue(USUARIO);

    await getFicha(
      req(`/api/postos/${PREFIXO}`, {
        'x-forwarded-for': CADEIA_FORJADA,
        'x-real-ip': '192.168.18.170',
      }),
      ctx(PREFIXO),
    );

    expect(registrarAcesso.mock.calls[0]![0].ip).toBe(
      '192.168.18.170',
    );
  });

  it('sem header nenhum a trilha grava ausência, e não a string "unknown"', async () => {
    obterUsuarioAtualMock.mockResolvedValue(USUARIO);

    await getFicha(req(`/api/postos/${PREFIXO}`), ctx(PREFIXO));

    expect(registrarAcesso.mock.calls[0]![0].ip).toBeNull();
  });
});

describe('GET /api/postos/[prefixo]/arquivos (grava listou_arquivos)', () => {
  it('sem sessão recusa com 401 e NÃO grava linha na trilha', async () => {
    obterUsuarioAtualMock.mockResolvedValue(null);

    const res = await getArquivos(req(`/api/postos/${PREFIXO}/arquivos`), ctx(PREFIXO));

    expect(res.status).toBe(401);
    expect(registrarAcesso).not.toHaveBeenCalled();
    expect(listarPorPrefixo).not.toHaveBeenCalled();
  });

  it('com sessão lista e grava a trilha com o ator e com o IP da borda', async () => {
    obterUsuarioAtualMock.mockResolvedValue(USUARIO);

    const res = await getArquivos(
      req(`/api/postos/${PREFIXO}/arquivos`, { 'x-forwarded-for': CADEIA_FORJADA }),
      ctx(PREFIXO),
    );

    expect(res.status).toBe(200);
    expect(registrarAcesso).toHaveBeenCalledTimes(1);
    expect(registrarAcesso.mock.calls[0]![0]).toMatchObject({
      prefixo: PREFIXO,
      acao: 'listou_arquivos',
      usuarioId: USUARIO.id,
      ip: '10.0.0.9',
    });
  });
});

describe('GET /api/postos/facetas', () => {
  it('sem sessão recusa com 401 e não consulta o cadastro', async () => {
    obterUsuarioAtualMock.mockResolvedValue(null);

    const res = await getFacetas();

    expect(res.status).toBe(401);
    expect(listarFacetasRepo).not.toHaveBeenCalled();
  });

  it('com sessão devolve as facetas', async () => {
    obterUsuarioAtualMock.mockResolvedValue(USUARIO);

    const res = await getFacetas();

    expect(res.status).toBe(200);
    expect((await res.json()).ugrhis[0].nome).toBe('Alto Tietê');
  });
});

describe('contrato da recusa', () => {
  it('as três recusas são NextResponse 401, e não exceção nem redirecionamento', async () => {
    obterUsuarioAtualMock.mockResolvedValue(null);

    const respostas = [
      await getFicha(req(`/api/postos/${PREFIXO}`), ctx(PREFIXO)),
      await getArquivos(req(`/api/postos/${PREFIXO}/arquivos`), ctx(PREFIXO)),
      await getFacetas(),
    ];

    for (const r of respostas) {
      expect(r).toBeInstanceOf(NextResponse);
      expect(r.status).toBe(401);
      // 3xx aqui seria o middleware devolvendo o login com cara de sucesso.
      expect(r.headers.get('location')).toBeNull();
    }
  });
});

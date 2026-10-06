/**
 * POST /api/estoque/movimentacoes com a matrícula do solicitante (migration
 * 0075, decidido em 06/10/2026).
 *
 * O que estes casos travam, em ordem de gravidade:
 *   1. Saída sem solicitante não entra no ledger. A guarda definitiva é o CHECK
 *      `ck_estoque_mov_saida_solicitante` no banco, provado contra Postgres em
 *      tests/integration/estoque-movimentacoes-solicitante-postgres.test.ts;
 *      aqui se mede que a recusa chega como erro de CAMPO (400) e não como falha
 *      de infraestrutura, que é o que o balcão veria se só o banco recusasse.
 *   2. O campo guarda IDENTIFICADOR. Nome digitado é recusado, e foi por isso
 *      que a primeira versão do contrato caiu na revisão.
 *   3. A matrícula fica FORA do log, por LISTA DE PERMISSÃO. Lista de negação é
 *      fail-open: campo novo no ledger entraria no log sozinho.
 *   4. Nem a resposta de erro nem o log carregam o VALOR digitado. Valor em
 *      mensagem de erro acaba no log pelo ramo genérico de
 *      `src/app/api/_helpers/erros.ts`, que registra `erro: String(erro)`.
 *
 * Roda sobre o repositório MOCK de movimentações, que espelha o fluxo do adapter
 * pg. A autorização é mockada neste arquivo (o gestor sempre passa), porque o
 * que ele mede é o campo; quem mede a camada de autorização das LEITURAS é
 * tests/unit/api/estoque-leitura-gestor-rotas.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const gestor = vi.fn();

vi.mock('@/app/api/_helpers/auth', () => ({
  exigirUsuario: () => gestor(),
  exigirGestorEstoque: () => gestor(),
}));

vi.mock('@/infrastructure/security/rate-limit', () => ({
  POLITICAS: { leituraEstoque: {}, movimentacaoEstoque: {}, conferenciaEstoque: {} },
  consumirRateLimit: () => ({ permitido: true, restante: 99, resetEm: 0 }),
  aplicarHeadersRateLimit: () => {},
}));

const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();

// Os espiões entram por função de repasse, e não como valor direto da fábrica:
// o `vi.mock` é içado para o topo do arquivo e roda ANTES destes `const`, então
// `{ info: logInfo }` estoura com "Cannot access 'logInfo' before
// initialization" (medido em 06/10/2026). Dentro do corpo da arrow o acesso só
// acontece na chamada, que é no teste.
vi.mock('@/infrastructure/logging/logger', () => ({
  logger: {
    info: (...args: unknown[]) => logInfo(...args),
    warn: (...args: unknown[]) => logWarn(...args),
    error: (...args: unknown[]) => logError(...args),
    debug: () => {},
  },
}));

vi.mock('@/infrastructure/repositories', async () => {
  const mov = await import('@/infrastructure/mock/estoque-movimentacoes-repository.mock');
  const ident = await import('@/infrastructure/mock/usuarios-identidade-repository.mock');
  return {
    estoqueMovimentacoesRepository: mov.estoqueMovimentacoesRepository,
    usuariosIdentidadeRepository: ident.usuariosIdentidadeRepository,
  };
});

import { POST as postMovimentacao } from '@/app/api/estoque/movimentacoes/route';
import { _resetEstoqueMock, estoqueStore } from '@/infrastructure/mock/estoque-store.mock';
import { estoqueMateriaisRepository } from '@/infrastructure/mock/estoque-materiais-repository.mock';
import { estoqueLocaisRepository } from '@/infrastructure/mock/estoque-locais-repository.mock';
import { estoqueMovimentacoesRepository } from '@/infrastructure/mock/estoque-movimentacoes-repository.mock';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'gestor@exemplo-dmo.test',
  nome: null,
};

/** Campos que o log da movimentação PODE carregar. Lista fechada, não exemplo. */
const CHAVES_LOG_PERMITIDAS = [
  'materialId',
  'movimentacaoId',
  'quantidade',
  'tipo',
  'unidadeId',
  'usuarioId',
];

type Handler = (req: never, ctx: never) => Promise<Response>;

function post(corpo: unknown) {
  const req = new Request('http://localhost/api/estoque/movimentacoes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return (postMovimentacao as Handler)(req as never, undefined as never);
}

let materialId = '';
let localId = '';

beforeEach(async () => {
  _resetEstoqueMock();
  gestor.mockResolvedValue(USUARIO);
  logInfo.mockReset();
  logWarn.mockReset();
  logError.mockReset();

  const material = await estoqueMateriaisRepository.criar({
    descricao: 'Cabo coaxial',
    natureza: 'quantificavel',
  });
  const local = await estoqueLocaisRepository.criar({ unidade: 'PENHA', sala: '2' });
  materialId = material.id;
  localId = local.id;
  // Saldo de partida: sem ele a saída falharia por saldo e não pela matrícula, e
  // os casos abaixo ficariam verdes medindo outra recusa.
  await estoqueMovimentacoesRepository.registrar({
    tipo: 'entrada',
    alvo: { natureza: 'quantificavel', materialId },
    quantidade: 50,
    localOrigemId: null,
    localDestinoId: localId,
    tamanho: null,
    motivo: 'seed do teste',
    usuarioId: USUARIO.id,
    solicitanteMatricula: null,
  });
  logInfo.mockReset();
});

const saida = (extra: Record<string, unknown>) => ({
  tipo: 'saida',
  materialId,
  quantidade: 2,
  localOrigem: localId,
  ...extra,
});

describe('POST movimentacoes: saída exige a matrícula de quem solicitou', () => {
  it('saída SEM o campo responde 400 e nada entra no ledger', async () => {
    const antes = estoqueStore.movimentacoes.length;
    const r = await post(saida({}));
    expect(r.status).toBe(400);
    const corpo = (await r.json()) as { erro: string; motivos: string[] };
    expect(corpo.erro).toBe('body_invalido');
    // A mensagem tem de dizer QUAL campo falta, senão o balcão não sabe o que
    // preencher. Ela nomeia o campo e diz que é matrícula, não nome.
    expect(corpo.motivos.join(' ')).toMatch(/solicitanteMatricula/);
    // Âncora de EFEITO: 400 que não gravasse nada por outro motivo também daria
    // status 400, então o ledger é contado antes e depois.
    expect(estoqueStore.movimentacoes.length).toBe(antes);
  });

  it('saída com NOME digitado é recusada, e o valor não aparece na resposta', async () => {
    const nome = 'Maria Antônia Gonçalves';
    const r = await post(saida({ solicitanteMatricula: nome }));
    expect(r.status).toBe(400);
    const corpo = (await r.json()) as { erro: string; motivos: string[] };
    const texto = JSON.stringify(corpo);
    expect(corpo.erro).toBe('body_invalido');
    // Diz o que o campo é, sem devolver o que foi digitado.
    expect(texto).toMatch(/matrícula/);
    expect(texto).not.toContain(nome);
    expect(texto).not.toContain('Antônia');
  });

  it('saída com matrícula válida entra no ledger com o campo gravado', async () => {
    const r = await post(saida({ solicitanteMatricula: 'SP-482913' }));
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { movimentacao: { id: string } };
    const gravada = estoqueStore.movimentacoes.find((m) => m.id === corpo.movimentacao.id);
    expect(gravada).toBeDefined();
    expect(gravada!.solicitanteMatricula).toBe('SP-482913');
    expect(gravada!.tipo).toBe('saida');
    // Operador e solicitante são papéis diferentes: o operador continua vindo do
    // auth, e nunca do corpo.
    expect(gravada!.usuarioId).toBe(USUARIO.id);
  });

  it('entrada continua passando sem o campo, e não grava solicitante', async () => {
    // Âncora de PRESENÇA: sem este caso, uma guarda que recusasse TODA
    // movimentação deixaria os casos de recusa acima verdes.
    const r = await post({
      tipo: 'entrada',
      materialId,
      quantidade: 3,
      localDestino: localId,
    });
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { movimentacao: { id: string } };
    const gravada = estoqueStore.movimentacoes.find((m) => m.id === corpo.movimentacao.id);
    expect(gravada!.solicitanteMatricula).toBeNull();
  });

  it('matrícula enviada em tipo que não é saída é descartada pelo parse', async () => {
    // Minimização: identificador sem finalidade não se grava. O ramo do zod que
    // declara o campo é só o de saída, e os outros ramos descartam a chave.
    const r = await post({
      tipo: 'entrada',
      materialId,
      quantidade: 3,
      localDestino: localId,
      solicitanteMatricula: '482913',
    });
    expect(r.status).toBe(201);
    const corpo = (await r.json()) as { movimentacao: { id: string } };
    const gravada = estoqueStore.movimentacoes.find((m) => m.id === corpo.movimentacao.id);
    expect(gravada!.solicitanteMatricula).toBeNull();
  });
});

describe('POST movimentacoes: a matrícula fica fora do log', () => {
  it('o contexto do log tem EXATAMENTE a lista de permissão', async () => {
    const r = await post(saida({ solicitanteMatricula: 'SP-482913' }));
    expect(r.status).toBe(201);
    expect(logInfo).toHaveBeenCalledTimes(1);
    const [evento, contexto] = logInfo.mock.calls[0] as [string, Record<string, unknown>];
    expect(evento).toBe('estoque.movimentacoes.registrada');
    // Igualdade de lista, e não `not.toContain('solicitanteMatricula')`: lista de
    // negação é fail-open, e campo novo do ledger entraria no log sozinho sem
    // ninguém reprovar.
    expect(Object.keys(contexto).sort()).toEqual(CHAVES_LOG_PERMITIDAS);
  });

  it('nenhuma chamada de log carrega o valor da matrícula', async () => {
    const matricula = 'SP-482913';
    expect((await post(saida({ solicitanteMatricula: matricula }))).status).toBe(201);
    // Medido pelo EFEITO e em TODOS os níveis: info, warn e error. Asserção só
    // sobre as chaves deixaria passar o valor interpolado na mensagem.
    const tudo = JSON.stringify([
      logInfo.mock.calls,
      logWarn.mock.calls,
      logError.mock.calls,
    ]);
    expect(tudo).toContain('estoque.movimentacoes.registrada');
    expect(tudo).not.toContain(matricula);
    expect(tudo).not.toContain('482913');
  });

  it('a recusa por formato também não loga o valor', async () => {
    const valor = 'MATRICULA SECRETA 99';
    expect((await post(saida({ solicitanteMatricula: valor }))).status).toBe(400);
    const tudo = JSON.stringify([
      logInfo.mock.calls,
      logWarn.mock.calls,
      logError.mock.calls,
    ]);
    expect(tudo).not.toContain(valor);
    expect(tudo).not.toContain('SECRETA');
  });
});

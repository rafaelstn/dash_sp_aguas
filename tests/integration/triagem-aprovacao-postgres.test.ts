/**
 * Aprovação de triagem contra POSTGRES REAL, com `postos` VAZIA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE, E POR QUE OS TESTES QUE JÁ HAVIA NÃO BASTAM
 * ─────────────────────────────────────────────────────────────────────────
 * Todos os testes de triagem importam `@/infrastructure/mock/triagem-repository.mock`
 * e NUNCA tocam o Postgres. O defeito corrigido em 10/09/2026 morava numa
 * consulta SQL dentro da transação do adaptador PostgreSQL:
 *
 *     SELECT deleted_at FROM postos WHERE prefixo = ...
 *     if (!postos[0] || ...) throw EstadoTriagemInvalido('posto_inativo')
 *
 * Com o ADR-0023 a tabela `postos` ficou VAZIA por desenho (o cadastro é lido
 * ao vivo do banco do órgão), então `postos[0]` era sempre `undefined` e TODA
 * aprovação respondia 409 dizendo que o posto está inativo. A suíte inteira
 * ficava verde com o defeito presente, porque o mock não tem tabela nenhuma.
 *
 * O primeiro caso daqui é o que REPROVA a versão anterior do código e passa na
 * corrigida. Os demais provam a composição entre os dois armazenamentos, que é
 * o que o ADR-0023 §2.3 prescreve no lugar da junção.
 *
 * Roda apenas com `TEST_DATABASE_URL` (o job `integracao` do CI sobe um
 * Postgres descartável). Sem a variável o arquivo é pulado e nunca toca
 * produção.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import postgres, { type Sql } from 'postgres';
import { triagemRepository as triagemPg } from '@/infrastructure/db/triagem-repository.pg';
import { aprovarFichaTriagem } from '@/application/use-cases/triagem/aprovar-ficha-triagem';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { PapeisRepository } from '@/application/ports/papeis-repository';
import type { Posto } from '@/domain/posto';
import { EstadoTriagemInvalido } from '@/domain/errors';

const URL_TESTE = process.env.TEST_DATABASE_URL ?? '';
const rodar = URL_TESTE.length > 0 ? describe : describe.skip;

const TECNICO = '11111111-1111-4111-8111-111111111111';
const APROVADOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** Prefixo próprio deste arquivo, para a limpeza não alcançar dado de ninguém. */
const PREFIXO = 'ZZ-TESTE-APROVACAO';
const META = { ip: '127.0.0.1', userAgent: 'vitest' };

/** Papéis: só o `APROVADOR` aprova. */
const papeis: PapeisRepository = {
  async obterPapel(id) {
    return id === APROVADOR ? 'admin' : 'user';
  },
  async ehAprovador(id) {
    return id === APROVADOR;
  },
};

/**
 * O CADASTRO respondendo, e ele é outro armazenamento.
 *
 * `ativo` imita o adaptador do `Dbfch`: devolve o posto com `deletedAt` sempre
 * nulo, porque soft delete é conceito nosso. `ausente` imita o mesmo adaptador
 * diante de um posto que o órgão marcou como excluído: o `WHERE Excluido = 0`
 * faz a linha simplesmente não voltar.
 */
function cadastro(modo: 'ativo' | 'ausente'): PostosRepository {
  return {
    async buscarPorPrefixo(prefixo: string): Promise<Posto | null> {
      if (modo === 'ausente') return null;
      return {
        id: '99999999-9999-4999-8999-999999999999',
        prefixo,
        deletedAt: null,
      } as Posto;
    },
  } as PostosRepository;
}

rodar('aprovação de triagem com o cadastro fora do nosso banco', () => {
  let sql: Sql;

  beforeAll(async () => {
    // O adaptador PostgreSQL lê `DATABASE_URL` na PRIMEIRA query (o cliente é
    // preguiçoso de propósito, ver `db/client.ts`). Apontar aqui, e não no
    // topo do arquivo, deixa o import sem efeito colateral.
    process.env.DATABASE_URL = URL_TESTE;
    sql = postgres(URL_TESTE, { max: 3, prepare: false });

    await sql`
      INSERT INTO auth.users (id, email) VALUES
        (${TECNICO}::uuid, 'tecnico.aprovacao@exemplo-nx.test'),
        (${APROVADOR}::uuid, 'aprovador.aprovacao@exemplo-nx.test')
      ON CONFLICT (id) DO NOTHING`;
  });

  afterEach(async () => {
    await limpar();
  });

  afterAll(async () => {
    await limpar();
    await sql`DELETE FROM auth.users WHERE id IN (${TECNICO}::uuid, ${APROVADOR}::uuid)`;
    await sql.end({ timeout: 5 });
  });

  async function limpar() {
    // Ordem obrigatória: `triagem_eventos` referencia `fichas_triagem` com
    // ON DELETE RESTRICT, então apagar a ficha primeiro seria recusado.
    await sql`DELETE FROM triagem_eventos WHERE triagem_id IN (
      SELECT id FROM fichas_triagem WHERE prefixo = ${PREFIXO})`;
    await sql`DELETE FROM triagem_locks WHERE triagem_id IN (
      SELECT id FROM fichas_triagem WHERE prefixo = ${PREFIXO})`;
    await sql`DELETE FROM fichas_triagem WHERE prefixo = ${PREFIXO}`;
    await sql`DELETE FROM fichas_visita WHERE prefixo = ${PREFIXO}`;
  }

  /** Ficha em `em_revisao` com o lock nas mãos do aprovador. */
  async function fichaEmRevisao(): Promise<string> {
    const linhas = await sql<{ id: string }[]>`
      INSERT INTO fichas_triagem
        (prefixo, cod_tipo_documento, data_visita, tecnico_id, tecnico_nome,
         dados, origem, estado)
      VALUES
        (${PREFIXO}, 3, '2026-05-08', ${TECNICO}::uuid, 'Técnico de teste',
         ${sql.json({ tipo_inspecao: 'fluviometrica' })}, 'app_campo', 'em_revisao')
      RETURNING id`;
    const id = linhas[0]!.id;
    await sql`
      INSERT INTO triagem_locks (triagem_id, revisor_id)
      VALUES (${id}::uuid, ${APROVADOR}::uuid)`;
    return id;
  }

  it('a premissa é real: `postos` está VAZIA neste banco', async () => {
    // Guarda da guarda. Se a tabela tivesse linhas, o caso seguinte passaria
    // sem provar nada: ele existe justamente para o estado de produção, em que
    // `count(*) = 0` (medido em 10/09/2026).
    const [linha] = await sql<{ total: string }[]>`SELECT count(*)::text AS total FROM postos`;
    expect(linha!.total).toBe('0');
  });

  it('o repositório promove a ficha com `postos` vazia — era aqui que o 409 nascia', async () => {
    const id = await fichaEmRevisao();

    const resultado = await triagemPg.aprovar(id, APROVADOR, META);

    expect(resultado.fichaVisitaId).toBeTruthy();
    expect(resultado.triagem.estado).toBe('aprovada');

    // O efeito no banco, e não o retorno: a promoção tem de estar gravada.
    const [ficha] = await sql<{ estado: string; ficha_visita_id: string | null }[]>`
      SELECT estado, ficha_visita_id FROM fichas_triagem WHERE id = ${id}::uuid`;
    expect(ficha!.estado).toBe('aprovada');
    expect(ficha!.ficha_visita_id).toBe(resultado.fichaVisitaId);

    const [visita] = await sql<{ total: string }[]>`
      SELECT count(*)::text AS total FROM fichas_visita WHERE id = ${resultado.fichaVisitaId}::uuid`;
    expect(visita!.total).toBe('1');
  });

  it('com o órgão dizendo ATIVO e a tabela local vazia, a aprovação CONCLUI', async () => {
    const id = await fichaEmRevisao();

    const r = await aprovarFichaTriagem(
      triagemPg,
      papeis,
      cadastro('ativo'),
      id,
      APROVADOR,
      META,
    );

    expect(r.triagem.estado).toBe('aprovada');
    const [ficha] = await sql<{ estado: string }[]>`
      SELECT estado FROM fichas_triagem WHERE id = ${id}::uuid`;
    expect(ficha!.estado).toBe('aprovada');
  });

  it('com o órgão dizendo INATIVO, recusa com 409 e NÃO grava nada', async () => {
    const id = await fichaEmRevisao();

    await expect(
      aprovarFichaTriagem(triagemPg, papeis, cadastro('ausente'), id, APROVADOR, META),
    ).rejects.toMatchObject({ de: 'posto_inativo', para: 'aprovada' });

    // Sem estas três linhas, o caso ficaria verde com a recusa acontecendo
    // DEPOIS da escrita, que é o defeito que ele existe para impedir.
    const [ficha] = await sql<{ estado: string; ficha_visita_id: string | null }[]>`
      SELECT estado, ficha_visita_id FROM fichas_triagem WHERE id = ${id}::uuid`;
    expect(ficha!.estado).toBe('em_revisao');
    expect(ficha!.ficha_visita_id).toBeNull();

    const [visita] = await sql<{ total: string }[]>`
      SELECT count(*)::text AS total FROM fichas_visita WHERE prefixo = ${PREFIXO}`;
    expect(visita!.total).toBe('0');

    // O lock continua de pé: a recusa é do cadastro, e não abandono da revisão.
    const [lock] = await sql<{ total: string }[]>`
      SELECT count(*)::text AS total FROM triagem_locks WHERE triagem_id = ${id}::uuid`;
    expect(lock!.total).toBe('1');
  });

  it('a recusa do cadastro é 409 tipado, e não erro de repositório', async () => {
    // Se a pergunta voltasse para dentro do SQL, o erro que sairia com a tabela
    // vazia seria o mesmo tipo — por isso o caso acima afirma o `de`, e este
    // afirma a classe. Juntos separam "recusa de regra" de "falha de banco",
    // que na tela viram 409 e 500.
    const id = await fichaEmRevisao();
    await expect(
      aprovarFichaTriagem(triagemPg, papeis, cadastro('ausente'), id, APROVADOR, META),
    ).rejects.toBeInstanceOf(EstadoTriagemInvalido);
  });
});

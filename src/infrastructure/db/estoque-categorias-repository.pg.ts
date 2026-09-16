import 'server-only';
import type { EstoqueCategoriasRepository } from '@/application/ports/estoque-categorias-repository';
import type { Categoria } from '@/domain/estoque/categoria';
import { CategoriaDuplicada, CategoriaNaoEncontrada, FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';
import { violouUnicidade } from './violacao-unicidade';

const INDICE_NOME = 'uq_estoque_categorias_nome';

type LinhaCategoria = { id: string; nome: string; criado_em: Date };

function mapear(l: LinhaCategoria): Categoria {
  return { id: l.id, nome: l.nome, criadoEm: l.criado_em };
}

const COLUNAS = () => sql`id, nome, criado_em`;

export const estoqueCategoriasRepository: EstoqueCategoriasRepository = {
  async listar() {
    try {
      const linhas = await sql<LinhaCategoria[]>`
        SELECT ${COLUNAS()} FROM estoque_categorias ORDER BY nome
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('estoqueCategorias.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaCategoria[]>`
        SELECT ${COLUNAS()} FROM estoque_categorias WHERE id = ${id}::uuid LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueCategorias.obterPorId', e);
    }
  },

  async criar(dados) {
    try {
      const linhas = await sql<LinhaCategoria[]>`
        INSERT INTO estoque_categorias (nome) VALUES (${dados.nome.trim()})
        RETURNING ${COLUNAS()}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      if (violouUnicidade(e, INDICE_NOME)) throw new CategoriaDuplicada(dados.nome.trim());
      throw new FalhaRepositorio('estoqueCategorias.criar', e);
    }
  },

  async atualizar(id, dados) {
    try {
      if (dados.nome === undefined) {
        const atual = await this.obterPorId(id);
        if (!atual) throw new CategoriaNaoEncontrada(id);
        return atual;
      }
      const linhas = await sql<LinhaCategoria[]>`
        UPDATE estoque_categorias SET nome = ${dados.nome.trim()}
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS()}
      `;
      if (!linhas[0]) throw new CategoriaNaoEncontrada(id);
      return mapear(linhas[0]);
    } catch (e) {
      if (e instanceof CategoriaNaoEncontrada) throw e;
      if (dados.nome !== undefined && violouUnicidade(e, INDICE_NOME)) {
        throw new CategoriaDuplicada(dados.nome.trim());
      }
      throw new FalhaRepositorio('estoqueCategorias.atualizar', e);
    }
  },

  async remover(id) {
    try {
      // FK ON DELETE SET NULL desvincula os materiais automaticamente.
      await sql`DELETE FROM estoque_categorias WHERE id = ${id}::uuid`;
    } catch (e) {
      throw new FalhaRepositorio('estoqueCategorias.remover', e);
    }
  },

  async obterOuCriarPorNome(nome) {
    try {
      // Get-or-create idempotente pela chave natural lower(nome). DO UPDATE no-op
      // (qualificado com o nome da tabela, nunca cru — evita AmbiguousColumn no
      // Postgres, aprendizado do projeto) so para o RETURNING devolver a linha.
      const linhas = await sql<LinhaCategoria[]>`
        INSERT INTO estoque_categorias (nome) VALUES (${nome.trim()})
        ON CONFLICT (lower(nome)) DO UPDATE SET nome = estoque_categorias.nome
        RETURNING ${COLUNAS()}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estoqueCategorias.obterOuCriarPorNome', e);
    }
  },
};

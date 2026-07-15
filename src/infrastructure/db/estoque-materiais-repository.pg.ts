import 'server-only';
import type { EstoqueMateriaisRepository } from '@/application/ports/estoque-materiais-repository';
import type { Material, Natureza } from '@/domain/estoque/material';
import { FalhaRepositorio, MaterialNaoEncontrado } from '@/domain/errors';
import { sql } from './client';

type LinhaMaterial = {
  id: string;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  natureza: Natureza;
  unidade_medida: string | null;
  categoria_id: string | null;
  quantidade_minima: number | null;
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
};

function mapear(l: LinhaMaterial): Material {
  return {
    id: l.id,
    descricao: l.descricao,
    marca: l.marca,
    modelo: l.modelo,
    natureza: l.natureza,
    unidadeMedida: l.unidade_medida,
    categoriaId: l.categoria_id,
    quantidadeMinima: l.quantidade_minima,
    ativo: l.ativo,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

const COLUNAS = sql`id, descricao, marca, modelo, natureza, unidade_medida, categoria_id, quantidade_minima, ativo, criado_em, atualizado_em`;

export const estoqueMateriaisRepository: EstoqueMateriaisRepository = {
  async listar(filtros) {
    try {
      const wheres: ReturnType<typeof sql>[] = [sql`true`];
      if (filtros.natureza) wheres.push(sql`natureza = ${filtros.natureza}`);
      if (filtros.categoriaId) wheres.push(sql`categoria_id = ${filtros.categoriaId}::uuid`);
      if (filtros.apenasAtivos) wheres.push(sql`ativo = true`);
      if (filtros.busca) {
        const termo = `%${filtros.busca}%`;
        wheres.push(
          sql`(descricao ILIKE ${termo} OR marca ILIKE ${termo} OR modelo ILIKE ${termo})`,
        );
      }
      let where = wheres[0]!;
      for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;

      const pagina = Math.max(filtros.pagina ?? 1, 1);
      const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
      const offset = (pagina - 1) * porPagina;

      const itens = await sql<LinhaMaterial[]>`
        SELECT ${COLUNAS} FROM estoque_materiais
         WHERE ${where}
         ORDER BY descricao
         LIMIT ${porPagina} OFFSET ${offset}
      `;
      const totalRows = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM estoque_materiais WHERE ${where}
      `;
      return { itens: itens.map(mapear), total: Number(totalRows[0]?.total ?? '0') };
    } catch (e) {
      throw new FalhaRepositorio('estoqueMateriais.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaMaterial[]>`
        SELECT ${COLUNAS} FROM estoque_materiais WHERE id = ${id}::uuid LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueMateriais.obterPorId', e);
    }
  },

  async criar(dados) {
    try {
      const linhas = await sql<LinhaMaterial[]>`
        INSERT INTO estoque_materiais (descricao, marca, modelo, natureza, unidade_medida, categoria_id, quantidade_minima, ativo)
        VALUES (
          ${dados.descricao.trim()}, ${dados.marca ?? null}, ${dados.modelo ?? null},
          ${dados.natureza}, ${dados.unidadeMedida ?? null},
          ${dados.categoriaId ?? null}, ${dados.quantidadeMinima ?? null}, ${dados.ativo ?? true}
        )
        RETURNING ${COLUNAS}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estoqueMateriais.criar', e);
    }
  },

  async atualizar(id, dados) {
    try {
      const sets: ReturnType<typeof sql>[] = [];
      if (dados.descricao !== undefined) sets.push(sql`descricao = ${dados.descricao.trim()}`);
      if (dados.marca !== undefined) sets.push(sql`marca = ${dados.marca}`);
      if (dados.modelo !== undefined) sets.push(sql`modelo = ${dados.modelo}`);
      if (dados.natureza !== undefined) sets.push(sql`natureza = ${dados.natureza}`);
      if (dados.unidadeMedida !== undefined) sets.push(sql`unidade_medida = ${dados.unidadeMedida}`);
      if (dados.categoriaId !== undefined) sets.push(sql`categoria_id = ${dados.categoriaId}`);
      // quantidade_minima aceita null (limpa o minimo) de forma explicita.
      if (dados.quantidadeMinima !== undefined)
        sets.push(sql`quantidade_minima = ${dados.quantidadeMinima}`);
      if (dados.ativo !== undefined) sets.push(sql`ativo = ${dados.ativo}`);
      sets.push(sql`atualizado_em = NOW()`);

      let setClause = sets[0]!;
      for (let i = 1; i < sets.length; i += 1) setClause = sql`${setClause}, ${sets[i]!}`;

      const linhas = await sql<LinhaMaterial[]>`
        UPDATE estoque_materiais SET ${setClause}
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS}
      `;
      if (!linhas[0]) throw new MaterialNaoEncontrado(id);
      return mapear(linhas[0]);
    } catch (e) {
      if (e instanceof MaterialNaoEncontrado) throw e;
      throw new FalhaRepositorio('estoqueMateriais.atualizar', e);
    }
  },

  async inativar(id) {
    try {
      const linhas = await sql<LinhaMaterial[]>`
        UPDATE estoque_materiais SET ativo = false, atualizado_em = NOW()
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS}
      `;
      if (!linhas[0]) throw new MaterialNaoEncontrado(id);
      return mapear(linhas[0]);
    } catch (e) {
      if (e instanceof MaterialNaoEncontrado) throw e;
      throw new FalhaRepositorio('estoqueMateriais.inativar', e);
    }
  },

  async possuiVinculos(id) {
    try {
      const linhas = await sql<{ existe: boolean }[]>`
        SELECT (
          EXISTS(SELECT 1 FROM estoque_unidades WHERE material_id = ${id}::uuid) OR
          EXISTS(SELECT 1 FROM estoque_saldos WHERE material_id = ${id}::uuid) OR
          EXISTS(SELECT 1 FROM estoque_movimentacoes WHERE material_id = ${id}::uuid)
        ) AS existe
      `;
      return linhas[0]?.existe ?? false;
    } catch (e) {
      throw new FalhaRepositorio('estoqueMateriais.possuiVinculos', e);
    }
  },

  async remover(id) {
    try {
      const linhas = await sql<{ id: string }[]>`
        DELETE FROM estoque_materiais WHERE id = ${id}::uuid RETURNING id
      `;
      if (!linhas[0]) throw new MaterialNaoEncontrado(id);
    } catch (e) {
      if (e instanceof MaterialNaoEncontrado) throw e;
      throw new FalhaRepositorio('estoqueMateriais.remover', e);
    }
  },
};

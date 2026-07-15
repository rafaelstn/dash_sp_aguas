import 'server-only';
import type { EstoqueUnidadesRepository } from '@/application/ports/estoque-unidades-repository';
import { FalhaRepositorio, UnidadeNaoEncontrada } from '@/domain/errors';
import { sql } from './client';
import {
  COLUNAS_UNIDADE as COLUNAS,
  mapearUnidadeLinha as mapear,
  type LinhaUnidadePg as LinhaUnidade,
} from './estoque-unidades-mapper';

export const estoqueUnidadesRepository: EstoqueUnidadesRepository = {
  async listar(filtros) {
    try {
      const wheres: ReturnType<typeof sql>[] = [sql`true`];
      if (filtros.unidade) {
        wheres.push(
          sql`EXISTS (SELECT 1 FROM estoque_locais l WHERE l.id = u.local_id AND l.unidade = ${filtros.unidade})`,
        );
      }
      if (filtros.localId) wheres.push(sql`u.local_id = ${filtros.localId}::uuid`);
      if (filtros.estado) wheres.push(sql`u.estado = ${filtros.estado}`);
      if (filtros.status) wheres.push(sql`u.status = ${filtros.status}`);
      if (filtros.materialId) wheres.push(sql`u.material_id = ${filtros.materialId}::uuid`);
      if (filtros.busca) {
        const termo = `%${filtros.busca}%`;
        wheres.push(
          sql`(u.descricao ILIKE ${termo} OR u.numero_serie ILIKE ${termo} OR u.codigo_spaguas ILIKE ${termo} OR u.pat_daee ILIKE ${termo} OR u.codigo ILIKE ${termo})`,
        );
      }
      let where = wheres[0]!;
      for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;

      const pagina = Math.max(filtros.pagina ?? 1, 1);
      const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
      const offset = (pagina - 1) * porPagina;

      const itens = await sql<LinhaUnidade[]>`
        SELECT ${COLUNAS} FROM estoque_unidades u
         WHERE ${where}
         ORDER BY u.descricao, u.criado_em DESC
         LIMIT ${porPagina} OFFSET ${offset}
      `;
      const totalRows = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM estoque_unidades u WHERE ${where}
      `;
      return { itens: itens.map(mapear), total: Number(totalRows[0]?.total ?? '0') };
    } catch (e) {
      throw new FalhaRepositorio('estoqueUnidades.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaUnidade[]>`
        SELECT ${COLUNAS} FROM estoque_unidades u WHERE u.id = ${id}::uuid LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueUnidades.obterPorId', e);
    }
  },

  async criar(dados) {
    try {
      const linhas = await sql<LinhaUnidade[]>`
        INSERT INTO estoque_unidades (
          material_id, codigo, codigo_spaguas, pat_daee, outros_pat, numero_serie,
          helice, descricao, marca, modelo, estado, status, local_id,
          data_aquisicao, observacao, chave_import
        ) VALUES (
          ${dados.materialId ?? null}, ${dados.codigo ?? null}, ${dados.codigoSpaguas ?? null},
          ${dados.patDaee ?? null}, ${dados.outrosPat ?? null}, ${dados.numeroSerie ?? null},
          ${dados.helice ?? null}, ${dados.descricao.trim()}, ${dados.marca ?? null},
          ${dados.modelo ?? null}, ${dados.estado ?? null}, ${dados.status ?? 'ativo'},
          ${dados.localId ?? null}, ${dados.dataAquisicao ?? null}, ${dados.observacao ?? null},
          ${dados.chaveImport ?? null}
        )
        RETURNING ${COLUNAS}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estoqueUnidades.criar', e);
    }
  },

  async atualizar(id, dados) {
    try {
      const sets: ReturnType<typeof sql>[] = [];
      if (dados.materialId !== undefined) sets.push(sql`material_id = ${dados.materialId}`);
      if (dados.codigo !== undefined) sets.push(sql`codigo = ${dados.codigo}`);
      if (dados.codigoSpaguas !== undefined) sets.push(sql`codigo_spaguas = ${dados.codigoSpaguas}`);
      if (dados.patDaee !== undefined) sets.push(sql`pat_daee = ${dados.patDaee}`);
      if (dados.outrosPat !== undefined) sets.push(sql`outros_pat = ${dados.outrosPat}`);
      if (dados.numeroSerie !== undefined) sets.push(sql`numero_serie = ${dados.numeroSerie}`);
      if (dados.helice !== undefined) sets.push(sql`helice = ${dados.helice}`);
      if (dados.descricao !== undefined) sets.push(sql`descricao = ${dados.descricao.trim()}`);
      if (dados.marca !== undefined) sets.push(sql`marca = ${dados.marca}`);
      if (dados.modelo !== undefined) sets.push(sql`modelo = ${dados.modelo}`);
      if (dados.estado !== undefined) sets.push(sql`estado = ${dados.estado}`);
      if (dados.status !== undefined) sets.push(sql`status = ${dados.status}`);
      if (dados.localId !== undefined) sets.push(sql`local_id = ${dados.localId}`);
      if (dados.dataAquisicao !== undefined) sets.push(sql`data_aquisicao = ${dados.dataAquisicao}`);
      if (dados.observacao !== undefined) sets.push(sql`observacao = ${dados.observacao}`);
      if (dados.chaveImport !== undefined) sets.push(sql`chave_import = ${dados.chaveImport}`);
      sets.push(sql`atualizado_em = NOW()`);

      let setClause = sets[0]!;
      for (let i = 1; i < sets.length; i += 1) setClause = sql`${setClause}, ${sets[i]!}`;

      const linhas = await sql<LinhaUnidade[]>`
        UPDATE estoque_unidades SET ${setClause}
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS}
      `;
      if (!linhas[0]) throw new UnidadeNaoEncontrada(id);
      return mapear(linhas[0]);
    } catch (e) {
      if (e instanceof UnidadeNaoEncontrada) throw e;
      throw new FalhaRepositorio('estoqueUnidades.atualizar', e);
    }
  },

  async possuiMovimentacao(id) {
    try {
      const linhas = await sql<{ existe: boolean }[]>`
        SELECT EXISTS(SELECT 1 FROM estoque_movimentacoes WHERE unidade_id = ${id}::uuid) AS existe
      `;
      return linhas[0]?.existe ?? false;
    } catch (e) {
      throw new FalhaRepositorio('estoqueUnidades.possuiMovimentacao', e);
    }
  },

  async remover(id) {
    try {
      const linhas = await sql<{ id: string }[]>`
        DELETE FROM estoque_unidades WHERE id = ${id}::uuid RETURNING id
      `;
      if (!linhas[0]) throw new UnidadeNaoEncontrada(id);
    } catch (e) {
      if (e instanceof UnidadeNaoEncontrada) throw e;
      throw new FalhaRepositorio('estoqueUnidades.remover', e);
    }
  },
};

import 'server-only';
import type { EstoqueSaldosRepository } from '@/application/ports/estoque-saldos-repository';
import type { FiltrosSaldo, Saldo, SaldoComContexto } from '@/domain/estoque/saldo';
import type { UnidadeFisica } from '@/domain/estoque/local';
import type { SaldoExport } from '@/domain/estoque/export';
import { TETO_EXPORT } from '@/domain/estoque/export';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

/** WHERE compartilhado por `listar` e `listarParaExport` (alias s/l). */
function montarWhere(filtros: FiltrosSaldo): ReturnType<typeof sql> {
  const wheres: ReturnType<typeof sql>[] = [sql`true`];
  if (filtros.materialId) wheres.push(sql`s.material_id = ${filtros.materialId}::uuid`);
  if (filtros.localId) wheres.push(sql`s.local_id = ${filtros.localId}::uuid`);
  if (filtros.unidade) wheres.push(sql`l.unidade = ${filtros.unidade}`);
  let where = wheres[0]!;
  for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;
  return where;
}

type LinhaSaldoContexto = {
  id: string;
  material_id: string;
  local_id: string;
  quantidade: number;
  tamanho: string | null;
  atualizado_em: Date;
  material_descricao: string;
  local_rotulo: string;
  unidade: UnidadeFisica;
};

type LinhaSaldo = {
  id: string;
  material_id: string;
  local_id: string;
  quantidade: number;
  tamanho: string | null;
  atualizado_em: Date;
};

export const estoqueSaldosRepository: EstoqueSaldosRepository = {
  async listar(filtros) {
    try {
      const where = montarWhere(filtros);

      const linhas = await sql<LinhaSaldoContexto[]>`
        SELECT s.id, s.material_id, s.local_id, s.quantidade, s.tamanho, s.atualizado_em,
               m.descricao AS material_descricao, l.rotulo AS local_rotulo, l.unidade AS unidade
          FROM estoque_saldos s
          JOIN estoque_materiais m ON m.id = s.material_id
          JOIN estoque_locais l ON l.id = s.local_id
         WHERE ${where}
         ORDER BY m.descricao, l.rotulo
      `;
      return linhas.map(
        (l): SaldoComContexto => ({
          id: l.id,
          materialId: l.material_id,
          localId: l.local_id,
          quantidade: Number(l.quantidade),
          tamanho: l.tamanho,
          atualizadoEm: l.atualizado_em,
          materialDescricao: l.material_descricao,
          localRotulo: l.local_rotulo,
          unidade: l.unidade,
        }),
      );
    } catch (e) {
      throw new FalhaRepositorio('estoqueSaldos.listar', e);
    }
  },

  async listarParaExport(filtros) {
    try {
      const where = montarWhere(filtros);
      const linhas = await sql<
        {
          material_descricao: string;
          marca: string | null;
          modelo: string | null;
          categoria: string | null;
          unidade_fisica: UnidadeFisica;
          local_rotulo: string;
          tamanho: string | null;
          quantidade: number;
        }[]
      >`
        SELECT m.descricao AS material_descricao, m.marca AS marca, m.modelo AS modelo,
               c.nome AS categoria, l.unidade AS unidade_fisica, l.rotulo AS local_rotulo,
               s.tamanho AS tamanho, s.quantidade AS quantidade
          FROM estoque_saldos s
          JOIN estoque_materiais m ON m.id = s.material_id
          JOIN estoque_locais l ON l.id = s.local_id
          LEFT JOIN estoque_categorias c ON c.id = m.categoria_id
         WHERE ${where}
         ORDER BY m.descricao, l.rotulo
         LIMIT ${TETO_EXPORT}
      `;
      return linhas.map(
        (l): SaldoExport => ({
          materialDescricao: l.material_descricao,
          marca: l.marca,
          modelo: l.modelo,
          categoria: l.categoria,
          unidadeFisica: l.unidade_fisica,
          localRotulo: l.local_rotulo,
          tamanho: l.tamanho,
          quantidade: Number(l.quantidade),
        }),
      );
    } catch (e) {
      throw new FalhaRepositorio('estoqueSaldos.listarParaExport', e);
    }
  },

  async obterPorMaterialLocal(materialId, localId, tamanho) {
    try {
      const linhas = await sql<LinhaSaldo[]>`
        SELECT id, material_id, local_id, quantidade, tamanho, atualizado_em
          FROM estoque_saldos
         WHERE material_id = ${materialId}::uuid
           AND local_id = ${localId}::uuid
           AND COALESCE(tamanho, '') = COALESCE(${tamanho}, '')
         LIMIT 1
      `;
      const l = linhas[0];
      if (!l) return null;
      const saldo: Saldo = {
        id: l.id,
        materialId: l.material_id,
        localId: l.local_id,
        quantidade: Number(l.quantidade),
        tamanho: l.tamanho,
        atualizadoEm: l.atualizado_em,
      };
      return saldo;
    } catch (e) {
      throw new FalhaRepositorio('estoqueSaldos.obterPorMaterialLocal', e);
    }
  },
};

import 'server-only';
import type { EstoqueSaldosRepository } from '@/application/ports/estoque-saldos-repository';
import type { Saldo, SaldoComContexto } from '@/domain/estoque/saldo';
import type { UnidadeFisica } from '@/domain/estoque/local';
import { FalhaRepositorio } from '@/domain/errors';
import { sql } from './client';

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
      const wheres: ReturnType<typeof sql>[] = [sql`true`];
      if (filtros.materialId) wheres.push(sql`s.material_id = ${filtros.materialId}::uuid`);
      if (filtros.localId) wheres.push(sql`s.local_id = ${filtros.localId}::uuid`);
      if (filtros.unidade) wheres.push(sql`l.unidade = ${filtros.unidade}`);
      let where = wheres[0]!;
      for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;

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

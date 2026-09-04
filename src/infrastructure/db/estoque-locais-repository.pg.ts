import 'server-only';
import type { EstoqueLocaisRepository } from '@/application/ports/estoque-locais-repository';
import type { Local, UnidadeFisica } from '@/domain/estoque/local';
import { normalizarLocal, montarRotulo } from '@/domain/estoque/local';
import { FalhaRepositorio, LocalEmUso, LocalNaoEncontrado } from '@/domain/errors';
import { sql } from './client';

type LinhaLocal = {
  id: string;
  unidade: UnidadeFisica;
  sala: string | null;
  prateleira: string | null;
  armario: string | null;
  rotulo: string;
  observacao: string | null;
  criado_em: Date;
};

function mapear(l: LinhaLocal): Local {
  return {
    id: l.id,
    unidade: l.unidade,
    sala: l.sala,
    prateleira: l.prateleira,
    armario: l.armario,
    rotulo: l.rotulo,
    observacao: l.observacao,
    criadoEm: l.criado_em,
  };
}

const COLUNAS = () => sql`id, unidade, sala, prateleira, armario, rotulo, observacao, criado_em`;

export const estoqueLocaisRepository: EstoqueLocaisRepository = {
  async listar(filtros) {
    try {
      const cond = filtros?.unidade ? sql`WHERE unidade = ${filtros.unidade}` : sql``;
      const linhas = await sql<LinhaLocal[]>`
        SELECT ${COLUNAS()} FROM estoque_locais ${cond} ORDER BY rotulo
      `;
      return linhas.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('estoqueLocais.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaLocal[]>`
        SELECT ${COLUNAS()} FROM estoque_locais WHERE id = ${id}::uuid LIMIT 1
      `;
      return linhas[0] ? mapear(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueLocais.obterPorId', e);
    }
  },

  async criar(dados) {
    try {
      const norm = normalizarLocal(dados);
      const linhas = await sql<LinhaLocal[]>`
        INSERT INTO estoque_locais (unidade, sala, prateleira, armario, rotulo, observacao)
        VALUES (${norm.unidade}, ${norm.sala}, ${norm.prateleira}, ${norm.armario}, ${norm.rotulo}, ${dados.observacao ?? null})
        RETURNING ${COLUNAS()}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estoqueLocais.criar', e);
    }
  },

  async atualizar(id, dados) {
    try {
      const atual = await this.obterPorId(id);
      if (!atual) throw new LocalNaoEncontrado(id);
      const norm = normalizarLocal({
        unidade: dados.unidade ?? atual.unidade,
        sala: dados.sala !== undefined ? dados.sala : atual.sala,
        prateleira: dados.prateleira !== undefined ? dados.prateleira : atual.prateleira,
        armario: dados.armario !== undefined ? dados.armario : atual.armario,
      });
      const rotulo = montarRotulo(norm.unidade, norm.sala, norm.prateleira, norm.armario);
      const observacao = dados.observacao !== undefined ? dados.observacao : atual.observacao;
      const linhas = await sql<LinhaLocal[]>`
        UPDATE estoque_locais
           SET unidade = ${norm.unidade}, sala = ${norm.sala}, prateleira = ${norm.prateleira},
               armario = ${norm.armario}, rotulo = ${rotulo}, observacao = ${observacao}
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS()}
      `;
      if (!linhas[0]) throw new LocalNaoEncontrado(id);
      return mapear(linhas[0]);
    } catch (e) {
      if (e instanceof LocalNaoEncontrado) throw e;
      throw new FalhaRepositorio('estoqueLocais.atualizar', e);
    }
  },

  async remover(id) {
    try {
      // Guarda de uso: saldo (FK RESTRICT) e movimentacao/unidade (FK SET NULL,
      // mas manter historico do local e melhor que orfanizar). Bloqueia antes.
      const uso = await sql<{ em_uso: boolean }[]>`
        SELECT (
          EXISTS(SELECT 1 FROM estoque_saldos WHERE local_id = ${id}::uuid) OR
          EXISTS(SELECT 1 FROM estoque_unidades WHERE local_id = ${id}::uuid) OR
          EXISTS(SELECT 1 FROM estoque_movimentacoes WHERE local_origem = ${id}::uuid OR local_destino = ${id}::uuid)
        ) AS em_uso
      `;
      if (uso[0]?.em_uso) throw new LocalEmUso(id);
      await sql`DELETE FROM estoque_locais WHERE id = ${id}::uuid`;
    } catch (e) {
      if (e instanceof LocalEmUso) throw e;
      throw new FalhaRepositorio('estoqueLocais.remover', e);
    }
  },

  async obterOuCriar(normalizado) {
    try {
      // Get-or-create pela chave natural (unique index uq_estoque_locais_chave).
      // DO UPDATE no-op qualificado (evita AmbiguousColumn) so pro RETURNING.
      const linhas = await sql<LinhaLocal[]>`
        INSERT INTO estoque_locais (unidade, sala, prateleira, armario, rotulo)
        VALUES (${normalizado.unidade}, ${normalizado.sala}, ${normalizado.prateleira}, ${normalizado.armario}, ${normalizado.rotulo})
        ON CONFLICT (unidade, COALESCE(sala, ''), COALESCE(prateleira, ''), COALESCE(armario, ''))
        DO UPDATE SET rotulo = estoque_locais.rotulo
        RETURNING ${COLUNAS()}
      `;
      return mapear(linhas[0]!);
    } catch (e) {
      throw new FalhaRepositorio('estoqueLocais.obterOuCriar', e);
    }
  },
};

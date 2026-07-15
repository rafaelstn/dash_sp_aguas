import 'server-only';
import type { Sql } from 'postgres';
import type { EstoqueMovimentacoesRepository } from '@/application/ports/estoque-movimentacoes-repository';
import type {
  ComandoMovimentacao,
  FiltrosMovimentacao,
  Movimentacao,
  ResultadoMovimentacao,
  TipoMovimentacao,
} from '@/domain/estoque/movimentacao';
import type { Saldo } from '@/domain/estoque/saldo';
import type { Estado } from '@/domain/estoque/estado';
import type { Status } from '@/domain/estoque/status-unidade';
import { TETO_EXPORT, type MovimentacaoExport } from '@/domain/estoque/export';
import { transicaoValida } from '@/domain/estoque/status-unidade';
import {
  FalhaRepositorio,
  MaterialNaoEncontrado,
  NaturezaIncompativel,
  SaldoInsuficiente,
  TransicaoStatusInvalida,
  UnidadeNaoEncontrada,
} from '@/domain/errors';
import { sql } from './client';
import { COLUNAS_UNIDADE, mapearUnidadeLinha, type LinhaUnidadePg } from './estoque-unidades-mapper';

type LinhaMov = {
  id: string;
  tipo: TipoMovimentacao;
  unidade_id: string | null;
  material_id: string | null;
  quantidade: number;
  local_origem: string | null;
  local_destino: string | null;
  estado_anterior: Estado | null;
  estado_novo: Estado | null;
  status_anterior: Status | null;
  status_novo: Status | null;
  motivo: string | null;
  usuario_id: string;
  criado_em: Date;
};

type LinhaSaldo = {
  id: string;
  material_id: string;
  local_id: string;
  quantidade: number;
  tamanho: string | null;
  atualizado_em: Date;
};

function mapearMov(l: LinhaMov): Movimentacao {
  return {
    id: l.id,
    tipo: l.tipo,
    unidadeId: l.unidade_id,
    materialId: l.material_id,
    quantidade: Number(l.quantidade),
    localOrigemId: l.local_origem,
    localDestinoId: l.local_destino,
    estadoAnterior: l.estado_anterior,
    estadoNovo: l.estado_novo,
    statusAnterior: l.status_anterior,
    statusNovo: l.status_novo,
    motivo: l.motivo,
    usuarioId: l.usuario_id,
    criadoEm: l.criado_em,
  };
}

function mapearSaldo(l: LinhaSaldo): Saldo {
  return {
    id: l.id,
    materialId: l.material_id,
    localId: l.local_id,
    quantidade: Number(l.quantidade),
    tamanho: l.tamanho,
    atualizadoEm: l.atualizado_em,
  };
}

const COLUNAS_MOV = sql`
  id, tipo, unidade_id, material_id, quantidade, local_origem, local_destino,
  estado_anterior, estado_novo, status_anterior, status_novo, motivo, usuario_id, criado_em
`;
const COLUNAS_SALDO = sql`id, material_id, local_id, quantidade, tamanho, atualizado_em`;

/**
 * WHERE compartilhado por `listar` e `listarParaExport`. Colunas QUALIFICADAS com
 * o alias `em` (estoque_movimentacoes): o export faz JOIN com unidades/materiais/
 * locais, onde `criado_em`/`id` existem em varias tabelas e ficariam ambiguos.
 * O `listar` (sem join) tambem usa o alias `em` para reaproveitar este helper.
 */
function montarWhere(filtros: FiltrosMovimentacao): ReturnType<typeof sql> {
  const wheres: ReturnType<typeof sql>[] = [sql`true`];
  if (filtros.tipo) wheres.push(sql`em.tipo = ${filtros.tipo}`);
  if (filtros.unidadeId) wheres.push(sql`em.unidade_id = ${filtros.unidadeId}::uuid`);
  if (filtros.materialId) wheres.push(sql`em.material_id = ${filtros.materialId}::uuid`);
  if (filtros.usuarioId) wheres.push(sql`em.usuario_id = ${filtros.usuarioId}::uuid`);
  if (filtros.localId) {
    wheres.push(
      sql`(em.local_origem = ${filtros.localId}::uuid OR em.local_destino = ${filtros.localId}::uuid)`,
    );
  }
  if (filtros.de) wheres.push(sql`em.criado_em >= ${filtros.de}`);
  if (filtros.ate) wheres.push(sql`em.criado_em <= ${filtros.ate}`);
  let where = wheres[0]!;
  for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;
  return where;
}

/**
 * Saida/baixa/transferencia: UPDATE GUARDADO ATOMICO. O `WHERE quantidade >= q`
 * impede saldo negativo SEM janela de corrida (somado ao CHECK(quantidade>=0)):
 * duas saidas concorrentes competem pela mesma linha; a que perde ve `quantidade`
 * ja decrementada e, se insuficiente, afeta 0 linhas -> SaldoInsuficiente. NUNCA
 * ler-depois-escrever (isso reabriria a corrida). Feature de Postgres provada no
 * banco real (aprendizado do projeto: SQLite esconderia isso).
 */
async function retirarGuardado(
  tx: Sql,
  materialId: string,
  localId: string,
  tamanho: string | null,
  q: number,
): Promise<Saldo> {
  const linhas = await tx<LinhaSaldo[]>`
    UPDATE estoque_saldos
       SET quantidade = quantidade - ${q}, atualizado_em = NOW()
     WHERE material_id = ${materialId}::uuid
       AND local_id = ${localId}::uuid
       AND COALESCE(tamanho, '') = COALESCE(${tamanho}, '')
       AND quantidade >= ${q}
     RETURNING ${COLUNAS_SALDO}
  `;
  if (linhas.length === 0) {
    // 0 linhas afetadas = saldo inexistente OU insuficiente. Ambos = nao ha o que
    // retirar. Rollback da transacao inteira ao propagar.
    throw new SaldoInsuficiente(materialId, localId, q);
  }
  return mapearSaldo(linhas[0]!);
}

/**
 * Entrada/destino-da-transferencia: upsert que ACUMULA. O DO UPDATE qualifica
 * `estoque_saldos.quantidade` (nunca a coluna crua) para nao dar AmbiguousColumn
 * no Postgres (existe na tabela E em EXCLUDED — aprendizado do projeto).
 */
async function acrescentarUpsert(
  tx: Sql,
  materialId: string,
  localId: string,
  tamanho: string | null,
  q: number,
): Promise<Saldo> {
  const linhas = await tx<LinhaSaldo[]>`
    INSERT INTO estoque_saldos (material_id, local_id, quantidade, tamanho)
    VALUES (${materialId}::uuid, ${localId}::uuid, ${q}, ${tamanho})
    ON CONFLICT (material_id, local_id, COALESCE(tamanho, ''))
    DO UPDATE SET quantidade = estoque_saldos.quantidade + EXCLUDED.quantidade,
                  atualizado_em = NOW()
    RETURNING ${COLUNAS_SALDO}
  `;
  return mapearSaldo(linhas[0]!);
}

export const estoqueMovimentacoesRepository: EstoqueMovimentacoesRepository = {
  async registrar(cmd: ComandoMovimentacao): Promise<ResultadoMovimentacao> {
    try {
      // Toda a movimentacao numa unica transacao: ledger + saldo/unidade, tudo
      // ou nada (mesmo padrao de triagem-repository.pg / favoritos).
      return await sql.begin(async (tx) => {
        if (cmd.alvo.natureza === 'serializado') {
          return registrarSerializado(tx as unknown as Sql, cmd);
        }
        return registrarQuantificavel(tx as unknown as Sql, cmd);
      });
    } catch (e) {
      if (
        e instanceof UnidadeNaoEncontrada ||
        e instanceof MaterialNaoEncontrado ||
        e instanceof NaturezaIncompativel ||
        e instanceof SaldoInsuficiente ||
        e instanceof TransicaoStatusInvalida
      ) {
        throw e;
      }
      throw new FalhaRepositorio('estoqueMovimentacoes.registrar', e);
    }
  },

  async listar(filtros) {
    try {
      const where = montarWhere(filtros);

      const pagina = Math.max(filtros.pagina ?? 1, 1);
      const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
      const offset = (pagina - 1) * porPagina;

      const itens = await sql<LinhaMov[]>`
        SELECT ${COLUNAS_MOV} FROM estoque_movimentacoes em
         WHERE ${where}
         ORDER BY em.criado_em DESC
         LIMIT ${porPagina} OFFSET ${offset}
      `;
      const totalRows = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM estoque_movimentacoes em WHERE ${where}
      `;
      return { itens: itens.map(mapearMov), total: Number(totalRows[0]?.total ?? '0') };
    } catch (e) {
      throw new FalhaRepositorio('estoqueMovimentacoes.listar', e);
    }
  },

  async listarParaExport(filtros) {
    try {
      const where = montarWhere(filtros);
      // JOINs para trazer descricao/identificacao do item e rotulos dos locais.
      // Operador NAO resolve aqui (fica no UsuariosIdentidadeRepository, batch).
      const linhas = await sql<
        (LinhaMov & {
          unidade_descricao: string | null;
          unidade_identificacao: string | null;
          material_descricao: string | null;
          local_origem_rotulo: string | null;
          local_destino_rotulo: string | null;
        })[]
      >`
        SELECT em.id, em.tipo, em.unidade_id, em.material_id, em.quantidade,
               em.local_origem, em.local_destino, em.estado_anterior, em.estado_novo,
               em.status_anterior, em.status_novo, em.motivo, em.usuario_id, em.criado_em,
               u.descricao AS unidade_descricao,
               COALESCE(u.pat_daee, u.numero_serie, u.codigo, u.codigo_spaguas) AS unidade_identificacao,
               mat.descricao AS material_descricao,
               lo.rotulo AS local_origem_rotulo,
               ld.rotulo AS local_destino_rotulo
          FROM estoque_movimentacoes em
          LEFT JOIN estoque_unidades u ON u.id = em.unidade_id
          LEFT JOIN estoque_materiais mat ON mat.id = em.material_id
          LEFT JOIN estoque_locais lo ON lo.id = em.local_origem
          LEFT JOIN estoque_locais ld ON ld.id = em.local_destino
         WHERE ${where}
         ORDER BY em.criado_em DESC
         LIMIT ${TETO_EXPORT}
      `;
      return linhas.map(
        (l): MovimentacaoExport => ({
          ...mapearMov(l),
          itemDescricao: l.unidade_descricao ?? l.material_descricao ?? null,
          itemIdentificacao: l.unidade_identificacao ?? null,
          localOrigemRotulo: l.local_origem_rotulo,
          localDestinoRotulo: l.local_destino_rotulo,
        }),
      );
    } catch (e) {
      throw new FalhaRepositorio('estoqueMovimentacoes.listarParaExport', e);
    }
  },
};

/** Fluxo serializado: trava a unidade, aplica local/status/estado + ledger. */
async function registrarSerializado(
  tx: Sql,
  cmd: ComandoMovimentacao,
): Promise<ResultadoMovimentacao> {
  const unidadeId = (cmd.alvo as { unidadeId: string }).unidadeId;
  // FOR UPDATE: serializa duas movimentacoes concorrentes na mesma unidade.
  const linhas = await tx<LinhaUnidadePg[]>`
    SELECT ${COLUNAS_UNIDADE} FROM estoque_unidades u WHERE u.id = ${unidadeId}::uuid FOR UPDATE
  `;
  const atual = linhas[0];
  if (!atual) throw new UnidadeNaoEncontrada(unidadeId);

  const estadoAnterior = atual.estado;
  const statusAnterior = atual.status;
  let estadoNovo: Estado | null = estadoAnterior;
  let statusNovo: Status = statusAnterior;
  let localNovo: string | null = atual.local_id;
  let localOrigem: string | null = null;
  let localDestino: string | null = null;

  switch (cmd.tipo) {
    case 'entrada':
      localDestino = cmd.localDestinoId;
      localNovo = cmd.localDestinoId;
      break;
    case 'saida':
      localOrigem = cmd.localOrigemId;
      localNovo = null;
      break;
    case 'transferencia':
      localOrigem = cmd.localOrigemId;
      localDestino = cmd.localDestinoId;
      localNovo = cmd.localDestinoId;
      break;
    case 'baixa':
      // Maquina de estados validada AQUI, dentro da tx, contra o status real.
      if (!transicaoValida(statusAnterior, 'descarte')) {
        throw new TransicaoStatusInvalida(statusAnterior, 'descarte');
      }
      statusNovo = 'descarte';
      break;
    case 'ajuste':
      // Override auditavel (ja veio com motivo): aceita qualquer status valido,
      // inclusive reverter descarte, fora da tabela de transicoes normais.
      if (cmd.novoStatus !== undefined) statusNovo = cmd.novoStatus;
      if (cmd.novoEstado !== undefined) estadoNovo = cmd.novoEstado;
      if (cmd.localDestinoId) {
        localOrigem = atual.local_id;
        localDestino = cmd.localDestinoId;
        localNovo = cmd.localDestinoId;
      }
      break;
  }

  const unidadesAtualizadas = await tx<LinhaUnidadePg[]>`
    UPDATE estoque_unidades
       SET estado = ${estadoNovo}, status = ${statusNovo}, local_id = ${localNovo},
           atualizado_em = NOW()
     WHERE id = ${unidadeId}::uuid
     RETURNING ${COLUNAS_UNIDADE}
  `;

  const movs = await tx<LinhaMov[]>`
    INSERT INTO estoque_movimentacoes (
      tipo, unidade_id, material_id, quantidade, local_origem, local_destino,
      estado_anterior, estado_novo, status_anterior, status_novo, motivo, usuario_id
    ) VALUES (
      ${cmd.tipo}, ${unidadeId}::uuid, NULL, 1, ${localOrigem}, ${localDestino},
      ${estadoAnterior}, ${estadoNovo}, ${statusAnterior}, ${statusNovo},
      ${cmd.motivo}, ${cmd.usuarioId}::uuid
    )
    RETURNING ${COLUNAS_MOV}
  `;

  return {
    movimentacao: mapearMov(movs[0]!),
    saldo: null,
    unidade: mapearUnidadeLinha(unidadesAtualizadas[0]!),
  };
}

/** Fluxo quantificavel: upsert/UPDATE guardado de saldo + ledger. */
async function registrarQuantificavel(
  tx: Sql,
  cmd: ComandoMovimentacao,
): Promise<ResultadoMovimentacao> {
  const materialId = (cmd.alvo as { materialId: string }).materialId;
  const materiais = await tx<{ natureza: string }[]>`
    SELECT natureza FROM estoque_materiais WHERE id = ${materialId}::uuid
  `;
  const material = materiais[0];
  if (!material) throw new MaterialNaoEncontrado(materialId);
  if (material.natureza !== 'quantificavel') {
    throw new NaturezaIncompativel('quantificavel', material.natureza);
  }

  const q = cmd.quantidade;
  let saldo: Saldo | null = null;
  let localOrigem: string | null = null;
  let localDestino: string | null = null;

  switch (cmd.tipo) {
    case 'entrada':
      saldo = await acrescentarUpsert(tx, materialId, cmd.localDestinoId!, cmd.tamanho, q);
      localDestino = cmd.localDestinoId;
      break;
    case 'saida':
    case 'baixa':
      saldo = await retirarGuardado(tx, materialId, cmd.localOrigemId!, cmd.tamanho, q);
      localOrigem = cmd.localOrigemId;
      break;
    case 'transferencia':
      await retirarGuardado(tx, materialId, cmd.localOrigemId!, cmd.tamanho, q);
      saldo = await acrescentarUpsert(tx, materialId, cmd.localDestinoId!, cmd.tamanho, q);
      localOrigem = cmd.localOrigemId;
      localDestino = cmd.localDestinoId;
      break;
    case 'ajuste':
      // Barrado no dominio (validarComandoEstrutural). Guard defensivo.
      throw new NaturezaIncompativel('serializado', 'quantificavel');
  }

  const movs = await tx<LinhaMov[]>`
    INSERT INTO estoque_movimentacoes (
      tipo, unidade_id, material_id, quantidade, local_origem, local_destino,
      motivo, usuario_id
    ) VALUES (
      ${cmd.tipo}, NULL, ${materialId}::uuid, ${q}, ${localOrigem}, ${localDestino},
      ${cmd.motivo}, ${cmd.usuarioId}::uuid
    )
    RETURNING ${COLUNAS_MOV}
  `;

  return { movimentacao: mapearMov(movs[0]!), saldo, unidade: null };
}

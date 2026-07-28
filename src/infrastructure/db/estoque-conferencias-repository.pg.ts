import 'server-only';
import type { Sql } from 'postgres';
import type { EstoqueConferenciasRepository } from '@/application/ports/estoque-conferencias-repository';
import type {
  Conferencia,
  ConferenciaItem,
  NaturezaConferida,
  OrigemItem,
  ResultadoReconciliacao,
  ResumoDivergencias,
  SituacaoItem,
  StatusConferencia,
} from '@/domain/estoque/conferencia';
import type { UnidadeFisica } from '@/domain/estoque/local';
import {
  calcularDivergencia,
  motivoReconciliacao,
  resolverReconciliacao,
  statusConferenciaValido,
} from '@/domain/estoque/conferencia';
import { validarComandoEstrutural } from '@/domain/estoque/movimentacao';
import {
  ConferenciaFechada,
  ConferenciaNaoConcluida,
  ConferenciaNaoEncontrada,
  DadosInvalidos,
  EscopoConferenciaEmAberto,
  FalhaRepositorio,
  ItemConferenciaNaoEncontrado,
  ItemSemDivergencia,
  LocalNaoEncontrado,
  MaterialNaoEncontrado,
  MovimentacaoInvalida,
  NaturezaIncompativel,
  SaldoInsuficiente,
  TransicaoStatusInvalida,
  UnidadeNaoEncontrada,
} from '@/domain/errors';
import { sql } from './client';
import { aplicarMovimentacaoNaTx } from './estoque-movimentacoes-repository.pg';

// ── Linhas cruas + mapeadores ───────────────────────────────────────────────────

type LinhaConf = {
  id: string;
  unidade: UnidadeFisica;
  natureza: NaturezaConferida;
  local_id: string | null;
  status: StatusConferencia;
  observacao: string | null;
  criada_por: string;
  criada_em: Date;
  concluida_por: string | null;
  concluida_em: Date | null;
  atualizada_em: Date;
};

type LinhaItem = {
  id: string;
  conferencia_id: string;
  unidade_id: string | null;
  material_id: string | null;
  local_esperado_id: string | null;
  tamanho: string | null;
  origem: OrigemItem;
  situacao: SituacaoItem | null;
  local_encontrado_id: string | null;
  quantidade_sistema: number | null;
  quantidade_contada: number | null;
  diferenca: number | null;
  observacao: string | null;
  movimentacao_id: string | null;
  reconciliado_por: string | null;
  reconciliado_em: Date | null;
  criado_em: Date;
  atualizado_em: Date;
};

const COLUNAS_CONF = sql`
  id, unidade, natureza, local_id, status, observacao, criada_por, criada_em,
  concluida_por, concluida_em, atualizada_em
`;
const COLUNAS_ITEM = sql`
  id, conferencia_id, unidade_id, material_id, local_esperado_id, tamanho, origem,
  situacao, local_encontrado_id, quantidade_sistema, quantidade_contada, diferenca,
  observacao, movimentacao_id, reconciliado_por, reconciliado_em, criado_em, atualizado_em
`;

function mapConf(l: LinhaConf): Conferencia {
  return {
    id: l.id,
    unidade: l.unidade,
    natureza: l.natureza,
    localId: l.local_id,
    status: l.status,
    observacao: l.observacao,
    criadaPor: l.criada_por,
    criadaEm: l.criada_em,
    concluidaPor: l.concluida_por,
    concluidaEm: l.concluida_em,
    atualizadaEm: l.atualizada_em,
  };
}

function mapItem(l: LinhaItem): ConferenciaItem {
  return {
    id: l.id,
    conferenciaId: l.conferencia_id,
    unidadeId: l.unidade_id,
    materialId: l.material_id,
    localEsperadoId: l.local_esperado_id,
    tamanho: l.tamanho,
    origem: l.origem,
    situacao: l.situacao,
    localEncontradoId: l.local_encontrado_id,
    quantidadeSistema: l.quantidade_sistema === null ? null : Number(l.quantidade_sistema),
    quantidadeContada: l.quantidade_contada === null ? null : Number(l.quantidade_contada),
    diferenca: l.diferenca === null ? null : Number(l.diferenca),
    observacao: l.observacao,
    movimentacaoId: l.movimentacao_id,
    reconciliadoPor: l.reconciliado_por,
    reconciliadoEm: l.reconciliado_em,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

function ehUniqueViolation(e: unknown): boolean {
  return (
    typeof e === 'object' &&
    e !== null &&
    'code' in e &&
    (e as { code?: string }).code === '23505'
  );
}

/**
 * Carrega o local DENTRO da transacao, lancando o 404 do modulo em vez de deixar
 * a violacao de FK virar 500. Devolve a unidade fisica, usada para checar escopo.
 */
async function exigirLocal(tx: Sql, localId: string): Promise<{ unidade: UnidadeFisica }> {
  const rows = await tx<{ unidade: UnidadeFisica }[]>`
    SELECT unidade FROM estoque_locais WHERE id = ${localId}::uuid
  `;
  if (rows.length === 0) throw new LocalNaoEncontrado(localId);
  return rows[0]!;
}

// ── Repositorio ─────────────────────────────────────────────────────────────────

export const estoqueConferenciasRepository: EstoqueConferenciasRepository = {
  async abrir(comando) {
    try {
      return await sql.begin(async (txRaw) => {
        const tx = txRaw as unknown as Sql;
        // Guarda amigavel de escopo (o indice unico parcial e o guard real; esta
        // checagem da o erro 409 no caso comum). Race residual cai no catch 23505.
        const abertas = await tx<{ id: string }[]>`
          SELECT id FROM estoque_conferencias
           WHERE status = 'aberta'
             AND unidade = ${comando.unidade}
             AND natureza = ${comando.natureza}
             AND COALESCE(local_id, '00000000-0000-0000-0000-000000000000'::uuid)
                 = COALESCE(${comando.localId}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
           LIMIT 1
        `;
        if (abertas.length > 0) {
          throw new EscopoConferenciaEmAberto(comando.unidade, comando.natureza, comando.localId);
        }

        const confRows = await tx<LinhaConf[]>`
          INSERT INTO estoque_conferencias (unidade, natureza, local_id, observacao, criada_por)
          VALUES (${comando.unidade}, ${comando.natureza}, ${comando.localId}, ${comando.observacao}, ${comando.criadaPor}::uuid)
          RETURNING ${COLUNAS_CONF}
        `;
        const conf = mapConf(confRows[0]!);

        // Snapshot congelado numa unica query (INSERT ... SELECT), nao N round-trips.
        if (comando.natureza === 'serializado') {
          // Unidades presentes (ativo|defeito) no escopo, com o local esperado.
          // Unidades sem local NAO entram (JOIN em estoque_locais exclui).
          await tx`
            INSERT INTO estoque_conferencia_itens
              (conferencia_id, unidade_id, local_esperado_id, situacao, origem)
            SELECT ${conf.id}::uuid, u.id, u.local_id, 'pendente', 'snapshot'
              FROM estoque_unidades u
              JOIN estoque_locais l ON l.id = u.local_id
             WHERE u.status IN ('ativo', 'defeito')
               AND l.unidade = ${comando.unidade}
               AND (${comando.localId}::uuid IS NULL OR u.local_id = ${comando.localId}::uuid)
          `;
        } else {
          // Saldos positivos no escopo, com quantidade_sistema CONGELADA.
          await tx`
            INSERT INTO estoque_conferencia_itens
              (conferencia_id, material_id, local_esperado_id, tamanho, quantidade_sistema, origem)
            SELECT ${conf.id}::uuid, s.material_id, s.local_id, s.tamanho, s.quantidade, 'snapshot'
              FROM estoque_saldos s
              JOIN estoque_locais l ON l.id = s.local_id
             WHERE l.unidade = ${comando.unidade}
               AND (${comando.localId}::uuid IS NULL OR s.local_id = ${comando.localId}::uuid)
               AND s.quantidade > 0
          `;
        }

        return conf;
      });
    } catch (e) {
      if (e instanceof EscopoConferenciaEmAberto) throw e;
      if (ehUniqueViolation(e)) {
        throw new EscopoConferenciaEmAberto(comando.unidade, comando.natureza, comando.localId);
      }
      throw new FalhaRepositorio('estoqueConferencias.abrir', e);
    }
  },

  async listar(filtros) {
    try {
      const wheres: ReturnType<typeof sql>[] = [sql`true`];
      if (filtros.unidade) wheres.push(sql`unidade = ${filtros.unidade}`);
      if (filtros.natureza) wheres.push(sql`natureza = ${filtros.natureza}`);
      if (filtros.status) wheres.push(sql`status = ${filtros.status}`);
      let where = wheres[0]!;
      for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;

      const pagina = Math.max(filtros.pagina ?? 1, 1);
      const porPagina = Math.min(Math.max(filtros.porPagina ?? 50, 1), 200);
      const offset = (pagina - 1) * porPagina;

      const itens = await sql<LinhaConf[]>`
        SELECT ${COLUNAS_CONF} FROM estoque_conferencias
         WHERE ${where}
         ORDER BY criada_em DESC
         LIMIT ${porPagina} OFFSET ${offset}
      `;
      const totalRows = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM estoque_conferencias WHERE ${where}
      `;
      return { itens: itens.map(mapConf), total: Number(totalRows[0]?.total ?? '0') };
    } catch (e) {
      throw new FalhaRepositorio('estoqueConferencias.listar', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaConf[]>`
        SELECT ${COLUNAS_CONF} FROM estoque_conferencias WHERE id = ${id}::uuid LIMIT 1
      `;
      return linhas[0] ? mapConf(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueConferencias.obterPorId', e);
    }
  },

  async resumoDivergencias(id) {
    try {
      const existe = await sql<{ id: string }[]>`
        SELECT id FROM estoque_conferencias WHERE id = ${id}::uuid LIMIT 1
      `;
      if (existe.length === 0) throw new ConferenciaNaoEncontrada(id);

      // Um unico aggregate (COUNT FILTER, feature de Postgres). Divergente:
      // quantificavel contado com diferenca<>0, ou serializado nao_encontrado/
      // encontrado_em_outro_local. Contado: serializado != pendente, ou
      // quantificavel com quantidade_contada preenchida.
      const rows = await sql<
        {
          total: string;
          contados: string;
          divergentes: string;
          reconciliados: string;
          pendentes_recon: string;
          pendente: string;
          conferido: string;
          nao_encontrado: string;
          encontrado_outro: string;
        }[]
      >`
        SELECT
          COUNT(*)::text AS total,
          COUNT(*) FILTER (
            WHERE (unidade_id IS NOT NULL AND situacao IS NOT NULL AND situacao <> 'pendente')
               OR (material_id IS NOT NULL AND quantidade_contada IS NOT NULL)
          )::text AS contados,
          COUNT(*) FILTER (
            WHERE (material_id IS NOT NULL AND quantidade_contada IS NOT NULL AND diferenca <> 0)
               OR (unidade_id IS NOT NULL AND situacao IN ('nao_encontrado', 'encontrado_em_outro_local'))
          )::text AS divergentes,
          COUNT(*) FILTER (WHERE reconciliado_em IS NOT NULL)::text AS reconciliados,
          COUNT(*) FILTER (
            WHERE reconciliado_em IS NULL AND (
              (material_id IS NOT NULL AND quantidade_contada IS NOT NULL AND diferenca <> 0)
               OR (unidade_id IS NOT NULL AND situacao IN ('nao_encontrado', 'encontrado_em_outro_local'))
            )
          )::text AS pendentes_recon,
          COUNT(*) FILTER (WHERE situacao = 'pendente')::text AS pendente,
          COUNT(*) FILTER (WHERE situacao = 'conferido')::text AS conferido,
          COUNT(*) FILTER (WHERE situacao = 'nao_encontrado')::text AS nao_encontrado,
          COUNT(*) FILTER (WHERE situacao = 'encontrado_em_outro_local')::text AS encontrado_outro
          FROM estoque_conferencia_itens
         WHERE conferencia_id = ${id}::uuid
      `;
      const r = rows[0]!;
      const total = Number(r.total);
      const contados = Number(r.contados);
      const porSituacao: Record<SituacaoItem, number> = {
        pendente: Number(r.pendente),
        conferido: Number(r.conferido),
        nao_encontrado: Number(r.nao_encontrado),
        encontrado_em_outro_local: Number(r.encontrado_outro),
      };
      return {
        totalItens: total,
        contados,
        naoContados: total - contados,
        divergentes: Number(r.divergentes),
        reconciliados: Number(r.reconciliados),
        pendentesReconciliacao: Number(r.pendentes_recon),
        porSituacao,
      } satisfies ResumoDivergencias;
    } catch (e) {
      if (e instanceof ConferenciaNaoEncontrada) throw e;
      throw new FalhaRepositorio('estoqueConferencias.resumoDivergencias', e);
    }
  },

  async listarItens(conferenciaId, filtros) {
    try {
      const existe = await sql<{ id: string }[]>`
        SELECT id FROM estoque_conferencias WHERE id = ${conferenciaId}::uuid LIMIT 1
      `;
      if (existe.length === 0) throw new ConferenciaNaoEncontrada(conferenciaId);

      const wheres: ReturnType<typeof sql>[] = [sql`conferencia_id = ${conferenciaId}::uuid`];
      if (filtros.situacao) wheres.push(sql`situacao = ${filtros.situacao}`);
      // divergente (mesma regra do resumo).
      const condDivergente: ReturnType<typeof sql> = sql`(
        (material_id IS NOT NULL AND quantidade_contada IS NOT NULL AND diferenca <> 0)
         OR (unidade_id IS NOT NULL AND situacao IN ('nao_encontrado', 'encontrado_em_outro_local'))
      )`;
      if (filtros.apenasDivergentes) wheres.push(condDivergente);
      if (filtros.apenasPendentesRecon) {
        wheres.push(sql`${condDivergente} AND reconciliado_em IS NULL`);
      }
      let where = wheres[0]!;
      for (let i = 1; i < wheres.length; i += 1) where = sql`${where} AND ${wheres[i]!}`;

      const pagina = Math.max(filtros.pagina ?? 1, 1);
      const porPagina = Math.min(Math.max(filtros.porPagina ?? 100, 1), 500);
      const offset = (pagina - 1) * porPagina;

      const itens = await sql<LinhaItem[]>`
        SELECT ${COLUNAS_ITEM} FROM estoque_conferencia_itens
         WHERE ${where}
         ORDER BY criado_em ASC
         LIMIT ${porPagina} OFFSET ${offset}
      `;
      const totalRows = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM estoque_conferencia_itens WHERE ${where}
      `;
      return { itens: itens.map(mapItem), total: Number(totalRows[0]?.total ?? '0') };
    } catch (e) {
      if (e instanceof ConferenciaNaoEncontrada) throw e;
      throw new FalhaRepositorio('estoqueConferencias.listarItens', e);
    }
  },

  async obterItem(conferenciaId, itemId) {
    try {
      // Guarda de IDOR: id + conferencia_id juntos, nunca so o itemId.
      const linhas = await sql<LinhaItem[]>`
        SELECT ${COLUNAS_ITEM} FROM estoque_conferencia_itens
         WHERE id = ${itemId}::uuid AND conferencia_id = ${conferenciaId}::uuid
         LIMIT 1
      `;
      return linhas[0] ? mapItem(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('estoqueConferencias.obterItem', e);
    }
  },

  async registrarContagem(conferenciaId, itemId, contagem) {
    try {
      return await sql.begin(async (txRaw) => {
        const tx = txRaw as unknown as Sql;
        const confRows = await tx<{ status: StatusConferencia }[]>`
          SELECT status FROM estoque_conferencias WHERE id = ${conferenciaId}::uuid FOR UPDATE
        `;
        if (confRows.length === 0) throw new ConferenciaNaoEncontrada(conferenciaId);
        if (confRows[0]!.status !== 'aberta') {
          throw new ConferenciaFechada(conferenciaId, confRows[0]!.status);
        }

        const itemRows = await tx<LinhaItem[]>`
          SELECT ${COLUNAS_ITEM} FROM estoque_conferencia_itens
           WHERE id = ${itemId}::uuid AND conferencia_id = ${conferenciaId}::uuid
           FOR UPDATE
        `;
        if (itemRows.length === 0) throw new ItemConferenciaNaoEncontrado(itemId);
        const item = mapItem(itemRows[0]!);
        const serializado = item.unidadeId !== null;

        if (serializado && contagem.tipo !== 'serializado') {
          throw new NaturezaIncompativel('serializado', 'quantificavel');
        }
        if (!serializado && contagem.tipo !== 'quantificavel') {
          throw new NaturezaIncompativel('quantificavel', 'serializado');
        }

        let atualizadas: LinhaItem[];
        if (contagem.tipo === 'serializado') {
          const localEncontrado =
            contagem.situacao === 'encontrado_em_outro_local' ? contagem.localEncontradoId : null;
          // Local removido entre o carregamento da tela e a contagem viraria
          // violacao de FK (500 opaco). O contrato do modulo e 404.
          if (localEncontrado !== null) await exigirLocal(tx, localEncontrado);
          atualizadas = await tx<LinhaItem[]>`
            UPDATE estoque_conferencia_itens
               SET situacao = ${contagem.situacao},
                   local_encontrado_id = ${localEncontrado},
                   observacao = COALESCE(${contagem.observacao}, observacao),
                   atualizado_em = NOW()
             WHERE id = ${itemId}::uuid
             RETURNING ${COLUNAS_ITEM}
          `;
        } else {
          atualizadas = await tx<LinhaItem[]>`
            UPDATE estoque_conferencia_itens
               SET quantidade_contada = ${contagem.quantidadeContada},
                   observacao = COALESCE(${contagem.observacao}, observacao),
                   atualizado_em = NOW()
             WHERE id = ${itemId}::uuid
             RETURNING ${COLUNAS_ITEM}
          `;
        }
        return mapItem(atualizadas[0]!);
      });
    } catch (e) {
      if (
        e instanceof ConferenciaNaoEncontrada ||
        e instanceof ConferenciaFechada ||
        e instanceof ItemConferenciaNaoEncontrado ||
        e instanceof LocalNaoEncontrado ||
        e instanceof NaturezaIncompativel
      ) {
        throw e;
      }
      throw new FalhaRepositorio('estoqueConferencias.registrarContagem', e);
    }
  },

  async adicionarSobra(conferenciaId, sobra) {
    try {
      return await sql.begin(async (txRaw) => {
        const tx = txRaw as unknown as Sql;
        const confRows = await tx<
          {
            status: StatusConferencia;
            natureza: NaturezaConferida;
            unidade: UnidadeFisica;
            local_id: string | null;
          }[]
        >`
          SELECT status, natureza, unidade, local_id
            FROM estoque_conferencias WHERE id = ${conferenciaId}::uuid FOR UPDATE
        `;
        if (confRows.length === 0) throw new ConferenciaNaoEncontrada(conferenciaId);
        const conf = confRows[0]!;
        if (conf.status !== 'aberta') {
          throw new ConferenciaFechada(conferenciaId, conf.status);
        }
        // A sobra tem que ser da MESMA natureza da sessao (sessao single-natureza).
        if (conf.natureza !== sobra.tipo) {
          throw new NaturezaIncompativel(conf.natureza, sobra.tipo);
        }

        if (sobra.tipo === 'serializado') {
          const uRows = await tx<{ local_id: string | null }[]>`
            SELECT local_id FROM estoque_unidades WHERE id = ${sobra.unidadeId}::uuid
          `;
          if (uRows.length === 0) throw new UnidadeNaoEncontrada(sobra.unidadeId);
          const localAtual = uRows[0]!.local_id;
          // O local encontrado precisa existir: a FK sozinha viraria 500 opaco.
          await exigirLocal(tx, sobra.localEncontradoId);
          // Sem local de origem a reconciliacao montaria uma transferencia sem
          // origem, que o CHECK do ledger recusa (500 opaco, item travado).
          if (localAtual === null) {
            throw new DadosInvalidos(
              'Esta unidade nao tem local cadastrado no sistema. Aloque-a por uma movimentacao antes de conferir.',
            );
          }
          // Origem igual a destino nao e sobra: e item ja no lugar certo.
          if (localAtual === sobra.localEncontradoId) {
            throw new DadosInvalidos(
              'A unidade ja consta neste local no sistema; nao ha divergencia a registrar.',
            );
          }
          const inseridas = await tx<LinhaItem[]>`
            INSERT INTO estoque_conferencia_itens
              (conferencia_id, unidade_id, local_esperado_id, situacao, local_encontrado_id, origem)
            VALUES (${conferenciaId}::uuid, ${sobra.unidadeId}::uuid, ${localAtual},
                    'encontrado_em_outro_local', ${sobra.localEncontradoId}::uuid, 'sobra')
            RETURNING ${COLUNAS_ITEM}
          `;
          return mapItem(inseridas[0]!);
        }

        // quantificavel
        const mRows = await tx<{ natureza: string }[]>`
          SELECT natureza FROM estoque_materiais WHERE id = ${sobra.materialId}::uuid
        `;
        if (mRows.length === 0) throw new MaterialNaoEncontrado(sobra.materialId);
        if (mRows[0]!.natureza !== 'quantificavel') {
          throw new NaturezaIncompativel('quantificavel', mRows[0]!.natureza);
        }
        // O local da sobra tem que estar DENTRO do escopo da sessao. Fora dele o
        // snapshot nao cobre o local, entao a reconciliacao somaria a contagem
        // inteira a um saldo que ninguem conferiu (inflaria o patrimonio).
        const local = await exigirLocal(tx, sobra.localId);
        if (local.unidade !== conf.unidade) {
          throw new DadosInvalidos(
            'O local informado e de outra unidade fisica; a sobra tem que estar no escopo da conferencia.',
          );
        }
        if (conf.local_id !== null && conf.local_id !== sobra.localId) {
          throw new DadosInvalidos(
            'Esta conferencia esta escopada em um local; a sobra tem que ser desse mesmo local.',
          );
        }
        // Le o saldo REAL do alvo em vez de assumir 0: material fora do snapshot
        // pode ter saldo (ex.: entrada durante a contagem). Com 0 fixo a
        // reconciliacao somaria a contagem inteira ao saldo existente.
        const saldoRows = await tx<{ quantidade: number }[]>`
          SELECT quantidade FROM estoque_saldos
           WHERE material_id = ${sobra.materialId}::uuid
             AND local_id = ${sobra.localId}::uuid
             AND COALESCE(tamanho, '') = COALESCE(${sobra.tamanho ?? null}, '')
        `;
        const quantidadeSistema = saldoRows.length > 0 ? Number(saldoRows[0]!.quantidade) : 0;
        const inseridas = await tx<LinhaItem[]>`
          INSERT INTO estoque_conferencia_itens
            (conferencia_id, material_id, local_esperado_id, tamanho, quantidade_sistema, quantidade_contada, origem)
          VALUES (${conferenciaId}::uuid, ${sobra.materialId}::uuid, ${sobra.localId}::uuid,
                  ${sobra.tamanho}, ${quantidadeSistema}, ${sobra.quantidadeContada}, 'sobra')
          RETURNING ${COLUNAS_ITEM}
        `;
        return mapItem(inseridas[0]!);
      });
    } catch (e) {
      if (ehUniqueViolation(e)) {
        throw new DadosInvalidos('Este item ja consta na conferencia.');
      }
      if (
        e instanceof ConferenciaNaoEncontrada ||
        e instanceof ConferenciaFechada ||
        e instanceof UnidadeNaoEncontrada ||
        e instanceof MaterialNaoEncontrado ||
        e instanceof LocalNaoEncontrado ||
        e instanceof DadosInvalidos ||
        e instanceof NaturezaIncompativel
      ) {
        throw e;
      }
      throw new FalhaRepositorio('estoqueConferencias.adicionarSobra', e);
    }
  },

  async concluir(id, usuarioId, observacao) {
    return transicionar(id, 'concluida', usuarioId, observacao);
  },

  async cancelar(id, usuarioId, observacao) {
    return transicionar(id, 'cancelada', usuarioId, observacao);
  },

  async reconciliarItem(conferenciaId, itemId, usuarioId) {
    try {
      return await sql.begin(async (txRaw) => {
        const tx = txRaw as unknown as Sql;
        // 1. Trava o item (serializa reconciliacoes concorrentes do mesmo item).
        const itemRows = await tx<LinhaItem[]>`
          SELECT ${COLUNAS_ITEM} FROM estoque_conferencia_itens
           WHERE id = ${itemId}::uuid AND conferencia_id = ${conferenciaId}::uuid
           FOR UPDATE
        `;
        if (itemRows.length === 0) throw new ItemConferenciaNaoEncontrado(itemId);
        const item = mapItem(itemRows[0]!);

        // 2. Idempotencia: ja reconciliado -> no-op (nao gera segunda movimentacao).
        if (item.reconciliadoEm !== null) {
          return {
            item,
            movimentacaoId: item.movimentacaoId,
            aviso: null,
            jaReconciliado: true,
          } satisfies ResultadoReconciliacao;
        }

        // 3. So reconcilia com a sessao concluida.
        const confRows = await tx<{ status: StatusConferencia }[]>`
          SELECT status FROM estoque_conferencias WHERE id = ${conferenciaId}::uuid
        `;
        if (confRows.length === 0) throw new ConferenciaNaoEncontrada(conferenciaId);
        if (confRows[0]!.status !== 'concluida') {
          throw new ConferenciaNaoConcluida(conferenciaId, confRows[0]!.status);
        }

        // 3a. Item sem divergencia nao se reconcilia: carimbar marcaria como
        // tratado (e tiraria das pendencias) algo que ninguem apurou. Vale
        // tambem para o item nunca contado, que o lote poderia arrastar junto.
        const divergencia = calcularDivergencia(item);
        if (!divergencia.divergente) {
          throw new ItemSemDivergencia(itemId, divergencia.tipo);
        }

        // 4. Mapeamento (puro) divergencia -> movimentacao (ou null = so carimba).
        const comando = resolverReconciliacao(item);
        let movimentacaoId: string | null = null;
        let aviso: 'base_alterada' | null = null;
        let observacaoFinal = item.observacao;

        if (comando === null) {
          if (item.situacao === 'nao_encontrado' && observacaoFinal === null) {
            observacaoFinal = 'nao localizado: requer apuracao';
          }
        } else {
          let cmd = comando;
          // 4a. Aviso de base alterada (quantificavel): re-le o saldo ATUAL e
          // compara com o congelado. Nunca reconcilia em silencio (governo).
          if (item.materialId && item.localEsperadoId) {
            const saldoRows = await tx<{ quantidade: number }[]>`
              SELECT quantidade FROM estoque_saldos
               WHERE material_id = ${item.materialId}::uuid
                 AND local_id = ${item.localEsperadoId}::uuid
                 AND COALESCE(tamanho, '') = COALESCE(${item.tamanho}, '')
            `;
            const saldoAtual = saldoRows.length > 0 ? Number(saldoRows[0]!.quantidade) : 0;
            if (saldoAtual !== item.quantidadeSistema) {
              aviso = 'base_alterada';
              cmd = {
                ...cmd,
                motivo: `${motivoReconciliacao(conferenciaId)} [base congelada ${item.quantidadeSistema}, atual ${saldoAtual}]`,
              };
            }
          }
          // 4b. Mesma validacao estrutural da movimentacao direta. Sem ela o
          // comando so encontraria o CHECK do banco (transferencia com origem
          // nula ou igual ao destino), que sai como 500 opaco e trava o item.
          const cmdCompleto = { ...cmd, usuarioId };
          validarComandoEstrutural(cmdCompleto);

          // 5. Aplica a movimentacao na MESMA transacao (reusa o nucleo do ledger,
          // sem abrir outra sql.begin/conexao). Carimba conferencia_id.
          const resultado = await aplicarMovimentacaoNaTx(
            tx,
            cmdCompleto,
            conferenciaId,
          );
          movimentacaoId = resultado.movimentacao.id;
        }

        // 6. Carimba o item (chave de idempotencia: reconciliado_em + movimentacao_id).
        const carimbadas = await tx<LinhaItem[]>`
          UPDATE estoque_conferencia_itens
             SET movimentacao_id = ${movimentacaoId},
                 reconciliado_por = ${usuarioId}::uuid,
                 reconciliado_em = NOW(),
                 observacao = ${observacaoFinal},
                 atualizado_em = NOW()
           WHERE id = ${itemId}::uuid
           RETURNING ${COLUNAS_ITEM}
        `;
        return {
          item: mapItem(carimbadas[0]!),
          movimentacaoId,
          aviso,
          jaReconciliado: false,
        } satisfies ResultadoReconciliacao;
      });
    } catch (e) {
      if (
        e instanceof ItemConferenciaNaoEncontrado ||
        e instanceof ItemSemDivergencia ||
        e instanceof ConferenciaNaoEncontrada ||
        e instanceof ConferenciaNaoConcluida ||
        e instanceof SaldoInsuficiente ||
        e instanceof TransicaoStatusInvalida ||
        e instanceof MovimentacaoInvalida ||
        e instanceof LocalNaoEncontrado ||
        e instanceof NaturezaIncompativel ||
        e instanceof UnidadeNaoEncontrada ||
        e instanceof MaterialNaoEncontrado
      ) {
        throw e;
      }
      throw new FalhaRepositorio('estoqueConferencias.reconciliarItem', e);
    }
  },
};

/** aberta -> concluida|cancelada, com carimbo de quem/quando na conclusao. */
async function transicionar(
  id: string,
  para: 'concluida' | 'cancelada',
  usuarioId: string,
  observacao: string | null,
): Promise<Conferencia> {
  try {
    return await sql.begin(async (txRaw) => {
      const tx = txRaw as unknown as Sql;
      const confRows = await tx<LinhaConf[]>`
        SELECT ${COLUNAS_CONF} FROM estoque_conferencias WHERE id = ${id}::uuid FOR UPDATE
      `;
      if (confRows.length === 0) throw new ConferenciaNaoEncontrada(id);
      const atual = mapConf(confRows[0]!);
      if (!statusConferenciaValido(atual.status, para)) {
        throw new ConferenciaFechada(id, atual.status);
      }
      const concluidaPor = para === 'concluida' ? usuarioId : null;
      const atualizadas = await tx<LinhaConf[]>`
        UPDATE estoque_conferencias
           SET status = ${para},
               concluida_por = ${concluidaPor}::uuid,
               concluida_em = CASE WHEN ${para} = 'concluida' THEN NOW() ELSE NULL END,
               observacao = COALESCE(${observacao}, observacao),
               atualizada_em = NOW()
         WHERE id = ${id}::uuid
         RETURNING ${COLUNAS_CONF}
      `;
      return mapConf(atualizadas[0]!);
    });
  } catch (e) {
    if (e instanceof ConferenciaNaoEncontrada || e instanceof ConferenciaFechada) throw e;
    throw new FalhaRepositorio('estoqueConferencias.transicionar', e);
  }
}

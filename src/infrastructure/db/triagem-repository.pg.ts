import 'server-only';
import type {
  ResultadoAprovacao,
  ResultadoIniciarRevisao,
  TriagemRepository,
} from '@/application/ports/triagem-repository';
import type {
  EstadoTriagem,
  FichaTriagem,
  OrigemTriagem,
} from '@/domain/triagem';
import {
  podeTransitar,
} from '@/domain/triagem';
import type {
  EntradaEventoTriagem,
  EventoTriagem,
  TipoEventoTriagem,
} from '@/domain/triagem-evento';
import type { CodigoTipoDocumento } from '@/domain/tipo-documento';
import {
  EstadoTriagemInvalido,
  FalhaRepositorio,
  FichaTriagemNaoEncontrada,
  LockRevisaoNegado,
} from '@/domain/errors';
import { sql } from './client';

type LinhaTriagem = {
  id: string;
  prefixo: string;
  cod_tipo_documento: number;
  data_visita: Date;
  hora_inicio: string | null;
  hora_fim: string | null;
  tecnico_id: string;
  tecnico_nome: string;
  latitude_capturada: string | null;
  longitude_capturada: string | null;
  precisao_gps_m: string | null;
  observacoes: string | null;
  dados: Record<string, unknown>;
  origem: string;
  estado: string;
  motivo_decisao: string | null;
  decidida_por: string | null;
  decidida_em: Date | null;
  ficha_visita_id: string | null;
  ficha_origem_id: string | null;
  idempotency_key: string | null;
  criada_em: Date;
  atualizada_em: Date;
};

type LinhaEvento = {
  id: string;
  triagem_id: string;
  evento: string;
  estado_anterior: string | null;
  estado_novo: string | null;
  ator_id: string | null;
  motivo: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  ocorreu_em: Date;
};

function mapearTriagem(l: LinhaTriagem): FichaTriagem {
  return {
    id: l.id,
    prefixo: l.prefixo,
    codTipoDocumento: l.cod_tipo_documento as CodigoTipoDocumento,
    dataVisita: l.data_visita,
    horaInicio: l.hora_inicio,
    horaFim: l.hora_fim,
    tecnicoId: l.tecnico_id,
    tecnicoNome: l.tecnico_nome,
    latitudeCapturada:
      l.latitude_capturada !== null ? Number(l.latitude_capturada) : null,
    longitudeCapturada:
      l.longitude_capturada !== null ? Number(l.longitude_capturada) : null,
    precisaoGpsM: l.precisao_gps_m !== null ? Number(l.precisao_gps_m) : null,
    observacoes: l.observacoes,
    dados: l.dados ?? {},
    origem: l.origem as OrigemTriagem,
    estado: l.estado as EstadoTriagem,
    motivoDecisao: l.motivo_decisao,
    decididaPor: l.decidida_por,
    decididaEm: l.decidida_em,
    fichaVisitaId: l.ficha_visita_id,
    fichaOrigemId: l.ficha_origem_id,
    idempotencyKey: l.idempotency_key,
    criadaEm: l.criada_em,
    atualizadaEm: l.atualizada_em,
  };
}

function mapearEvento(l: LinhaEvento): EventoTriagem {
  return {
    id: l.id,
    triagemId: l.triagem_id,
    evento: l.evento as TipoEventoTriagem,
    estadoAnterior: l.estado_anterior as EstadoTriagem | null,
    estadoNovo: l.estado_novo as EstadoTriagem | null,
    atorId: l.ator_id,
    motivo: l.motivo,
    payload: l.payload,
    ip: l.ip,
    userAgent: l.user_agent,
    ocorreuEm: l.ocorreu_em,
  };
}

const COLUNAS_TRIAGEM = sql`
  id, prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
  tecnico_id, tecnico_nome, latitude_capturada, longitude_capturada,
  precisao_gps_m, observacoes, dados, origem, estado, motivo_decisao,
  decidida_por, decidida_em, ficha_visita_id, ficha_origem_id,
  idempotency_key, criada_em, atualizada_em
`;

const COLUNAS_EVENTO = sql`
  id, triagem_id, evento, estado_anterior, estado_novo, ator_id,
  motivo, payload, ip, user_agent, ocorreu_em
`;

function dataVisitaParaSQL(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const triagemRepository: TriagemRepository = {
  async submeter(entrada, metadata) {
    try {
      return await sql.begin(async (tx) => {
        // Idempotência: se o cliente retentou com a mesma idempotency_key
        // antes da resposta chegar, devolve a ficha existente em vez de
        // tentar INSERT que vai falhar no UNIQUE e estourar FalhaRepositorio.
        if (entrada.idempotencyKey) {
          const existentes = await tx<LinhaTriagem[]>`
            SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
             WHERE tecnico_id = ${entrada.tecnicoId}::uuid
               AND idempotency_key = ${entrada.idempotencyKey}
             LIMIT 1
          `;
          if (existentes[0]) {
            return mapearTriagem(existentes[0]);
          }
        }

        const linhas = await tx<LinhaTriagem[]>`
          INSERT INTO fichas_triagem (
            prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
            tecnico_id, tecnico_nome, latitude_capturada, longitude_capturada,
            precisao_gps_m, observacoes, dados, origem, estado,
            ficha_origem_id, idempotency_key
          ) VALUES (
            ${entrada.prefixo},
            ${entrada.codTipoDocumento},
            ${dataVisitaParaSQL(entrada.dataVisita)},
            ${entrada.horaInicio},
            ${entrada.horaFim},
            ${entrada.tecnicoId}::uuid,
            ${entrada.tecnicoNome},
            ${entrada.latitudeCapturada},
            ${entrada.longitudeCapturada},
            ${entrada.precisaoGpsM},
            ${entrada.observacoes},
            ${JSON.stringify(entrada.dados)}::jsonb,
            ${entrada.origem ?? 'app_campo'},
            'pendente',
            ${entrada.fichaOrigemId ?? null},
            ${entrada.idempotencyKey ?? null}
          )
          RETURNING ${COLUNAS_TRIAGEM}
        `;
        const inserida = linhas[0];
        if (!inserida) throw new Error('INSERT triagem não retornou linha');

        await tx`
          INSERT INTO triagem_eventos (
            triagem_id, evento, estado_anterior, estado_novo, ator_id,
            payload, ip, user_agent
          ) VALUES (
            ${inserida.id}::uuid, 'submetida', NULL, 'pendente',
            ${entrada.tecnicoId}::uuid,
            ${JSON.stringify({ origem: inserida.origem, idempotencyKey: inserida.idempotency_key })}::jsonb,
            ${metadata.ip}::inet,
            ${metadata.userAgent}
          )
        `;

        return mapearTriagem(inserida);
      });
    } catch (e) {
      throw new FalhaRepositorio('triagem.submeter', e);
    }
  },

  async reenviarAposDevolucao(fichaOrigemId, entrada, metadata) {
    try {
      return await sql.begin(async (tx) => {
        // Re-confirma estado da origem dentro da transação (race-safe).
        const origens = await tx<LinhaTriagem[]>`
          SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
           WHERE id = ${fichaOrigemId}::uuid
           FOR UPDATE
        `;
        const origem = origens[0];
        if (!origem) throw new FichaTriagemNaoEncontrada(fichaOrigemId);
        if (origem.estado !== 'devolvida') {
          throw new EstadoTriagemInvalido(origem.estado, 'pendente');
        }

        const linhas = await tx<LinhaTriagem[]>`
          INSERT INTO fichas_triagem (
            prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
            tecnico_id, tecnico_nome, latitude_capturada, longitude_capturada,
            precisao_gps_m, observacoes, dados, origem, estado,
            ficha_origem_id, idempotency_key
          ) VALUES (
            ${entrada.prefixo},
            ${entrada.codTipoDocumento},
            ${dataVisitaParaSQL(entrada.dataVisita)},
            ${entrada.horaInicio},
            ${entrada.horaFim},
            ${entrada.tecnicoId}::uuid,
            ${entrada.tecnicoNome},
            ${entrada.latitudeCapturada},
            ${entrada.longitudeCapturada},
            ${entrada.precisaoGpsM},
            ${entrada.observacoes},
            ${JSON.stringify(entrada.dados)}::jsonb,
            ${entrada.origem ?? 'app_campo'},
            'pendente',
            ${fichaOrigemId}::uuid,
            ${entrada.idempotencyKey ?? null}
          )
          RETURNING ${COLUNAS_TRIAGEM}
        `;
        const inserida = linhas[0];
        if (!inserida) throw new Error('INSERT reenvio não retornou linha');

        await tx`
          INSERT INTO triagem_eventos (
            triagem_id, evento, estado_anterior, estado_novo, ator_id,
            payload, ip, user_agent
          ) VALUES (
            ${inserida.id}::uuid, 'reenvio_apos_devolucao', NULL, 'pendente',
            ${entrada.tecnicoId}::uuid,
            ${JSON.stringify({ fichaOrigemId })}::jsonb,
            ${metadata.ip}::inet,
            ${metadata.userAgent}
          )
        `;

        return mapearTriagem(inserida);
      });
    } catch (e) {
      if (
        e instanceof FichaTriagemNaoEncontrada ||
        e instanceof EstadoTriagemInvalido
      ) {
        throw e;
      }
      throw new FalhaRepositorio('triagem.reenviarAposDevolucao', e);
    }
  },

  async listarPendentes(filtros) {
    try {
      const estados: EstadoTriagem[] = Array.isArray(filtros.estado)
        ? filtros.estado
        : filtros.estado
          ? [filtros.estado]
          : ['pendente', 'em_revisao'];

      const limite = Math.min(Math.max(filtros.limite ?? 50, 1), 200);
      const offset = Math.max(filtros.offset ?? 0, 0);

      // Constrói filtros opcionais em fragmentos seguros (parametrizados).
      const wheres: ReturnType<typeof sql>[] = [];
      wheres.push(sql`estado IN ${sql(estados)}`);
      if (filtros.codTipoDocumento !== undefined) {
        wheres.push(sql`cod_tipo_documento = ${filtros.codTipoDocumento}`);
      }
      if (filtros.prefixo) {
        wheres.push(sql`prefixo = ${filtros.prefixo}`);
      }
      if (filtros.tecnicoId) {
        wheres.push(sql`tecnico_id = ${filtros.tecnicoId}::uuid`);
      }
      if (filtros.desde) {
        wheres.push(sql`criada_em >= ${filtros.desde}`);
      }
      if (filtros.ate) {
        wheres.push(sql`criada_em <= ${filtros.ate}`);
      }

      // Junta WHEREs com AND.
      let whereClause = wheres[0]!;
      for (let i = 1; i < wheres.length; i += 1) {
        const frag = wheres[i];
        if (!frag) continue;
        whereClause = sql`${whereClause} AND ${frag}`;
      }

      const itens = await sql<LinhaTriagem[]>`
        SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
         WHERE ${whereClause}
         ORDER BY criada_em ASC
         LIMIT ${limite} OFFSET ${offset}
      `;

      const totalRows = await sql<{ total: string }[]>`
        SELECT COUNT(*)::text AS total FROM fichas_triagem WHERE ${whereClause}
      `;
      const total = Number(totalRows[0]?.total ?? '0');

      return { itens: itens.map(mapearTriagem), total };
    } catch (e) {
      throw new FalhaRepositorio('triagem.listarPendentes', e);
    }
  },

  async obterPorId(id) {
    try {
      const linhas = await sql<LinhaTriagem[]>`
        SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
         WHERE id = ${id}::uuid
         LIMIT 1
      `;
      return linhas[0] ? mapearTriagem(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('triagem.obterPorId', e);
    }
  },

  async iniciarRevisao(triagemId, revisorId, metadata) {
    try {
      return await sql.begin(async (tx) => {
        // Trava a linha pra evitar race entre 2 aprovadores.
        const fichas = await tx<LinhaTriagem[]>`
          SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
           WHERE id = ${triagemId}::uuid
           FOR UPDATE
        `;
        const ficha = fichas[0];
        if (!ficha) throw new FichaTriagemNaoEncontrada(triagemId);

        const estadoAtual = ficha.estado as EstadoTriagem;

        if (estadoAtual === 'em_revisao') {
          // Pode haver lock vivo de outro — devolve resultado tipado.
          const locks = await tx<{ revisor_id: string; expira_em: Date }[]>`
            SELECT revisor_id, expira_em FROM triagem_locks
             WHERE triagem_id = ${triagemId}::uuid
             LIMIT 1
          `;
          const lock = locks[0];
          if (lock && lock.expira_em > new Date()) {
            return {
              adquirido: false,
              motivo: 'lock_em_uso',
              revisorAtualId: lock.revisor_id,
              expiraEm: lock.expira_em,
            } satisfies ResultadoIniciarRevisao;
          }
          // Lock expirado mas estado ainda em_revisao — corrige antes.
          await tx`DELETE FROM triagem_locks WHERE triagem_id = ${triagemId}::uuid`;
        }

        if (!podeTransitar(estadoAtual, 'em_revisao')) {
          return {
            adquirido: false,
            motivo: 'estado_invalido',
            estadoAtual,
          } satisfies ResultadoIniciarRevisao;
        }

        // Tenta inserir lock — UNIQUE em triagem_id pega a race.
        try {
          await tx`
            INSERT INTO triagem_locks (triagem_id, revisor_id)
            VALUES (${triagemId}::uuid, ${revisorId}::uuid)
          `;
        } catch (errLock) {
          // Conflito de UNIQUE — outro aprovador acabou de pegar.
          const locks = await tx<{ revisor_id: string; expira_em: Date }[]>`
            SELECT revisor_id, expira_em FROM triagem_locks
             WHERE triagem_id = ${triagemId}::uuid
             LIMIT 1
          `;
          const lock = locks[0];
          if (lock) {
            return {
              adquirido: false,
              motivo: 'lock_em_uso',
              revisorAtualId: lock.revisor_id,
              expiraEm: lock.expira_em,
            } satisfies ResultadoIniciarRevisao;
          }
          throw errLock;
        }

        const expiraQuery = await tx<{ expira_em: Date }[]>`
          SELECT expira_em FROM triagem_locks
           WHERE triagem_id = ${triagemId}::uuid
        `;
        const expiraEm = expiraQuery[0]?.expira_em ?? new Date(Date.now() + 60 * 60 * 1000);

        const atualizadas = await tx<LinhaTriagem[]>`
          UPDATE fichas_triagem
             SET estado = 'em_revisao'
           WHERE id = ${triagemId}::uuid
           RETURNING ${COLUNAS_TRIAGEM}
        `;
        const atualizada = atualizadas[0];
        if (!atualizada) throw new Error('UPDATE estado em_revisao não retornou linha');

        await tx`
          INSERT INTO triagem_eventos (
            triagem_id, evento, estado_anterior, estado_novo, ator_id, ip, user_agent
          ) VALUES (
            ${triagemId}::uuid, 'revisao_iniciada', ${estadoAtual}, 'em_revisao',
            ${revisorId}::uuid,
            ${metadata.ip}::inet,
            ${metadata.userAgent}
          )
        `;

        return {
          adquirido: true,
          ficha: mapearTriagem(atualizada),
          expiraEm,
        } satisfies ResultadoIniciarRevisao;
      });
    } catch (e) {
      if (e instanceof FichaTriagemNaoEncontrada) throw e;
      throw new FalhaRepositorio('triagem.iniciarRevisao', e);
    }
  },

  async aprovar(triagemId, aprovadorId, metadata) {
    try {
      return await sql.begin(async (tx) => {
        const fichas = await tx<LinhaTriagem[]>`
          SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
           WHERE id = ${triagemId}::uuid
           FOR UPDATE
        `;
        const ficha = fichas[0];
        if (!ficha) throw new FichaTriagemNaoEncontrada(triagemId);

        if (ficha.estado !== 'em_revisao') {
          throw new EstadoTriagemInvalido(ficha.estado, 'aprovada');
        }

        const locks = await tx<{ revisor_id: string; expira_em: Date }[]>`
          SELECT revisor_id, expira_em FROM triagem_locks
           WHERE triagem_id = ${triagemId}::uuid
           FOR UPDATE
        `;
        const lock = locks[0];
        if (!lock) {
          throw new LockRevisaoNegado(triagemId, 'lock_expirado');
        }
        if (lock.revisor_id !== aprovadorId) {
          throw new LockRevisaoNegado(triagemId, 'nao_dono_do_lock');
        }
        if (lock.expira_em <= new Date()) {
          throw new LockRevisaoNegado(triagemId, 'lock_expirado');
        }

        // Verifica posto ativo (regra ADR-0008 §2.4). O esquema usa
        // deleted_at IS NULL como flag de atividade (migration 0002), nao
        // existe coluna `ativo` separada. Aprovar uma ficha cujo posto foi
        // removido (soft delete) viola a invariante de auditoria.
        const postos = await tx<{ deleted_at: Date | null }[]>`
          SELECT deleted_at FROM postos WHERE prefixo = ${ficha.prefixo}
        `;
        if (!postos[0] || postos[0].deleted_at !== null) {
          throw new EstadoTriagemInvalido('posto_inativo', 'aprovada');
        }

        // INSERT em fichas_visita.
        const fvLinhas = await tx<{ id: string }[]>`
          INSERT INTO fichas_visita (
            prefixo, cod_tipo_documento, data_visita, hora_inicio, hora_fim,
            tecnico_nome, tecnico_id, latitude_capturada, longitude_capturada,
            observacoes, dados, origem, status
          ) VALUES (
            ${ficha.prefixo},
            ${ficha.cod_tipo_documento},
            ${ficha.data_visita.toISOString().slice(0, 10)},
            ${ficha.hora_inicio},
            ${ficha.hora_fim},
            ${ficha.tecnico_nome},
            ${ficha.tecnico_id}::uuid,
            ${ficha.latitude_capturada},
            ${ficha.longitude_capturada},
            ${ficha.observacoes},
            ${JSON.stringify(ficha.dados)}::jsonb,
            'app_campo',
            'aprovada'
          )
          RETURNING id
        `;
        const fichaVisitaId = fvLinhas[0]?.id;
        if (!fichaVisitaId) throw new Error('INSERT fichas_visita não retornou id');

        const triagemAtualizada = await tx<LinhaTriagem[]>`
          UPDATE fichas_triagem
             SET estado = 'aprovada',
                 ficha_visita_id = ${fichaVisitaId}::uuid,
                 decidida_em = NOW(),
                 decidida_por = ${aprovadorId}::uuid
           WHERE id = ${triagemId}::uuid
           RETURNING ${COLUNAS_TRIAGEM}
        `;
        const triagem = triagemAtualizada[0];
        if (!triagem) throw new Error('UPDATE triagem aprovada não retornou linha');

        await tx`DELETE FROM triagem_locks WHERE triagem_id = ${triagemId}::uuid`;

        await tx`
          INSERT INTO triagem_eventos (
            triagem_id, evento, estado_anterior, estado_novo, ator_id,
            payload, ip, user_agent
          ) VALUES (
            ${triagemId}::uuid, 'aprovada', 'em_revisao', 'aprovada',
            ${aprovadorId}::uuid,
            ${JSON.stringify({ fichaVisitaId })}::jsonb,
            ${metadata.ip}::inet,
            ${metadata.userAgent}
          )
        `;

        return {
          triagem: mapearTriagem(triagem),
          fichaVisitaId,
        } satisfies ResultadoAprovacao;
      });
    } catch (e) {
      if (
        e instanceof FichaTriagemNaoEncontrada ||
        e instanceof EstadoTriagemInvalido ||
        e instanceof LockRevisaoNegado
      ) {
        throw e;
      }
      throw new FalhaRepositorio('triagem.aprovar', e);
    }
  },

  async rejeitar(triagemId, aprovadorId, motivo, metadata) {
    return decidir(triagemId, aprovadorId, motivo, metadata, 'rejeitada', 'rejeitar');
  },

  async devolver(triagemId, aprovadorId, motivo, metadata) {
    return decidir(triagemId, aprovadorId, motivo, metadata, 'devolvida', 'devolver');
  },

  async liberarLocksExpirados() {
    try {
      return await sql.begin(async (tx) => {
        const expirados = await tx<{ triagem_id: string; revisor_id: string }[]>`
          DELETE FROM triagem_locks
           WHERE expira_em < NOW()
           RETURNING triagem_id, revisor_id
        `;

        const liberados: string[] = [];
        for (const lock of expirados) {
          // Volta a triagem a 'pendente' SE ainda estiver em_revisao.
          const atualizadas = await tx<{ id: string; estado: string }[]>`
            UPDATE fichas_triagem
               SET estado = 'pendente'
             WHERE id = ${lock.triagem_id}::uuid
               AND estado = 'em_revisao'
             RETURNING id, estado
          `;
          if (atualizadas.length === 0) continue;

          await tx`
            INSERT INTO triagem_eventos (
              triagem_id, evento, estado_anterior, estado_novo, ator_id, motivo
            ) VALUES (
              ${lock.triagem_id}::uuid, 'lock_expirado', 'em_revisao', 'pendente',
              ${lock.revisor_id}::uuid,
              'TTL 1h sem ação'
            )
          `;
          liberados.push(lock.triagem_id);
        }

        return { liberados };
      });
    } catch (e) {
      throw new FalhaRepositorio('triagem.liberarLocksExpirados', e);
    }
  },

  async listarEventos(triagemId, limite = 50) {
    try {
      const linhas = await sql<LinhaEvento[]>`
        SELECT ${COLUNAS_EVENTO} FROM triagem_eventos
         WHERE triagem_id = ${triagemId}::uuid
         ORDER BY ocorreu_em DESC
         LIMIT ${limite}
      `;
      return linhas.map(mapearEvento);
    } catch (e) {
      throw new FalhaRepositorio('triagem.listarEventos', e);
    }
  },

  async registrarEvento(entrada: EntradaEventoTriagem) {
    try {
      const linhas = await sql<LinhaEvento[]>`
        INSERT INTO triagem_eventos (
          triagem_id, evento, estado_anterior, estado_novo, ator_id, motivo,
          payload, ip, user_agent
        ) VALUES (
          ${entrada.triagemId}::uuid,
          ${entrada.evento},
          ${entrada.estadoAnterior},
          ${entrada.estadoNovo},
          ${entrada.atorId}::uuid,
          ${entrada.motivo ?? null},
          ${entrada.payload ? JSON.stringify(entrada.payload) : null}::jsonb,
          ${entrada.ip ?? null}::inet,
          ${entrada.userAgent ?? null}
        )
        RETURNING ${COLUNAS_EVENTO}
      `;
      const inserida = linhas[0];
      if (!inserida) throw new Error('INSERT evento não retornou linha');
      return mapearEvento(inserida);
    } catch (e) {
      throw new FalhaRepositorio('triagem.registrarEvento', e);
    }
  },

  async obterPorIdempotency(tecnicoId, idempotencyKey) {
    try {
      const linhas = await sql<LinhaTriagem[]>`
        SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
         WHERE tecnico_id = ${tecnicoId}::uuid
           AND idempotency_key = ${idempotencyKey}::uuid
         LIMIT 1
      `;
      return linhas[0] ? mapearTriagem(linhas[0]) : null;
    } catch (e) {
      throw new FalhaRepositorio('triagem.obterPorIdempotency', e);
    }
  },

  async registrarHeartbeat(job, duracaoMs, payload) {
    // NUNCA quebra o cron — heartbeat é apenas sinal. Se DB caiu, a ausência
    // de heartbeat já é o próprio alerta (A3 monitora `MAX(ocorreu_em)`).
    // INSERT + DELETE de retenção em uma operação curta. Sem transação
    // (perda de uma das duas é aceitável).
    try {
      await sql`
        INSERT INTO cron_heartbeats (job, duracao_ms, payload)
        VALUES (
          ${job},
          ${duracaoMs},
          ${payload ? JSON.stringify(payload) : null}::jsonb
        )
      `;
      // Limpeza de retenção: descarta heartbeats > 7 dias do MESMO job.
      // Janela de alerta é 10min — qualquer coisa antiga é log histórico.
      await sql`
        DELETE FROM cron_heartbeats
         WHERE job = ${job}
           AND ocorreu_em < NOW() - INTERVAL '7 days'
      `;
    } catch {
      // Engole erro: heartbeat falhou. Saúde do cron é reportada pelos
      // logs estruturados (logger.error) que o handler já emite.
      // Não relançamos — o cron principal já fez seu trabalho.
    }
  },
};

/**
 * Helper interno: rejeição e devolução têm a mesma estrutura, mudando só o
 * estado-alvo e a string do evento. Mantém uma única função pra evitar drift.
 */
async function decidir(
  triagemId: string,
  aprovadorId: string,
  motivo: string,
  metadata: { ip: string | null; userAgent: string | null },
  estadoAlvo: 'rejeitada' | 'devolvida',
  rotuloOperacao: 'rejeitar' | 'devolver',
): Promise<FichaTriagem> {
  try {
    return await sql.begin(async (tx) => {
      const fichas = await tx<LinhaTriagem[]>`
        SELECT ${COLUNAS_TRIAGEM} FROM fichas_triagem
         WHERE id = ${triagemId}::uuid
         FOR UPDATE
      `;
      const ficha = fichas[0];
      if (!ficha) throw new FichaTriagemNaoEncontrada(triagemId);

      if (ficha.estado !== 'em_revisao') {
        throw new EstadoTriagemInvalido(ficha.estado, estadoAlvo);
      }

      const locks = await tx<{ revisor_id: string; expira_em: Date }[]>`
        SELECT revisor_id, expira_em FROM triagem_locks
         WHERE triagem_id = ${triagemId}::uuid
         FOR UPDATE
      `;
      const lock = locks[0];
      if (!lock) throw new LockRevisaoNegado(triagemId, 'lock_expirado');
      if (lock.revisor_id !== aprovadorId)
        throw new LockRevisaoNegado(triagemId, 'nao_dono_do_lock');
      if (lock.expira_em <= new Date())
        throw new LockRevisaoNegado(triagemId, 'lock_expirado');

      const atualizadas = await tx<LinhaTriagem[]>`
        UPDATE fichas_triagem
           SET estado = ${estadoAlvo},
               motivo_decisao = ${motivo},
               decidida_em = NOW(),
               decidida_por = ${aprovadorId}::uuid
         WHERE id = ${triagemId}::uuid
         RETURNING ${COLUNAS_TRIAGEM}
      `;
      const atualizada = atualizadas[0];
      if (!atualizada) throw new Error(`UPDATE ${rotuloOperacao} não retornou linha`);

      await tx`DELETE FROM triagem_locks WHERE triagem_id = ${triagemId}::uuid`;

      await tx`
        INSERT INTO triagem_eventos (
          triagem_id, evento, estado_anterior, estado_novo, ator_id, motivo, ip, user_agent
        ) VALUES (
          ${triagemId}::uuid, ${estadoAlvo}, 'em_revisao', ${estadoAlvo},
          ${aprovadorId}::uuid, ${motivo},
          ${metadata.ip}::inet,
          ${metadata.userAgent}
        )
      `;

      return mapearTriagem(atualizada);
    });
  } catch (e) {
    if (
      e instanceof FichaTriagemNaoEncontrada ||
      e instanceof EstadoTriagemInvalido ||
      e instanceof LockRevisaoNegado
    ) {
      throw e;
    }
    throw new FalhaRepositorio(`triagem.${rotuloOperacao}`, e);
  }
}

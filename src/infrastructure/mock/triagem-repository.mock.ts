import { randomUUID } from 'node:crypto';
import type {
  EntradaSubmeterTriagem,
  FiltrosListarPendentes,
  ResultadoAprovacao,
  ResultadoIniciarRevisao,
  TriagemRepository,
} from '@/application/ports/triagem-repository';
import type {
  EstadoTriagem,
  FichaTriagem,
  OrigemTriagem,
} from '@/domain/triagem';
import { podeTransitar } from '@/domain/triagem';
import type {
  EntradaEventoTriagem,
  EventoTriagem,
} from '@/domain/triagem-evento';
import {
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
  LockRevisaoNegado,
} from '@/domain/errors';

interface LockMem {
  triagemId: string;
  revisorId: string;
  criadoEm: Date;
  expiraEm: Date;
}

const fichas = new Map<string, FichaTriagem>();
const eventos: EventoTriagem[] = [];
const locks = new Map<string, LockMem>(); // chave = triagemId

function clonar<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function novoEvento(entrada: EntradaEventoTriagem): EventoTriagem {
  const ev: EventoTriagem = {
    id: randomUUID(),
    triagemId: entrada.triagemId,
    evento: entrada.evento,
    estadoAnterior: entrada.estadoAnterior,
    estadoNovo: entrada.estadoNovo,
    atorId: entrada.atorId,
    motivo: entrada.motivo ?? null,
    payload: entrada.payload ?? null,
    ip: entrada.ip ?? null,
    userAgent: entrada.userAgent ?? null,
    ocorreuEm: new Date(),
  };
  eventos.push(ev);
  return ev;
}

function novaFichaBase(entrada: EntradaSubmeterTriagem): FichaTriagem {
  const id = randomUUID();
  const agora = new Date();
  return {
    id,
    prefixo: entrada.prefixo,
    codTipoDocumento: entrada.codTipoDocumento,
    dataVisita: entrada.dataVisita,
    horaInicio: entrada.horaInicio,
    horaFim: entrada.horaFim,
    tecnicoId: entrada.tecnicoId,
    tecnicoNome: entrada.tecnicoNome,
    latitudeCapturada: entrada.latitudeCapturada,
    longitudeCapturada: entrada.longitudeCapturada,
    precisaoGpsM: entrada.precisaoGpsM,
    observacoes: entrada.observacoes,
    dados: clonar(entrada.dados),
    origem: (entrada.origem ?? 'app_campo') as OrigemTriagem,
    estado: 'pendente',
    motivoDecisao: null,
    decididaPor: null,
    decididaEm: null,
    fichaVisitaId: null,
    fichaOrigemId: entrada.fichaOrigemId ?? null,
    idempotencyKey: entrada.idempotencyKey ?? null,
    criadaEm: agora,
    atualizadaEm: agora,
  };
}

export const triagemRepository: TriagemRepository = {
  async submeter(entrada, metadata) {
    // Idempotência: retry com mesma idempotency_key devolve a ficha já
    // gravada em vez de tentar criar duplicata. Espelha o comportamento
    // do adapter Postgres (ver triagem-repository.pg.ts).
    if (entrada.idempotencyKey) {
      for (const f of fichas.values()) {
        if (
          f.tecnicoId === entrada.tecnicoId &&
          f.idempotencyKey === entrada.idempotencyKey
        ) {
          return clonar(f);
        }
      }
    }

    const ficha = novaFichaBase(entrada);
    fichas.set(ficha.id, ficha);
    novoEvento({
      triagemId: ficha.id,
      evento: 'submetida',
      estadoAnterior: null,
      estadoNovo: 'pendente',
      atorId: entrada.tecnicoId,
      payload: { origem: ficha.origem, idempotencyKey: ficha.idempotencyKey },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    });
    return clonar(ficha);
  },

  async reenviarAposDevolucao(fichaOrigemId, entrada, metadata) {
    const origem = fichas.get(fichaOrigemId);
    if (!origem) throw new FichaTriagemNaoEncontrada(fichaOrigemId);
    if (origem.estado !== 'devolvida') {
      throw new EstadoTriagemInvalido(origem.estado, 'pendente');
    }
    const ficha = novaFichaBase({ ...entrada, fichaOrigemId });
    fichas.set(ficha.id, ficha);
    novoEvento({
      triagemId: ficha.id,
      evento: 'reenvio_apos_devolucao',
      estadoAnterior: null,
      estadoNovo: 'pendente',
      atorId: entrada.tecnicoId,
      payload: { fichaOrigemId },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    });
    return clonar(ficha);
  },

  async listarPendentes(filtros: FiltrosListarPendentes) {
    const estados: EstadoTriagem[] = Array.isArray(filtros.estado)
      ? filtros.estado
      : filtros.estado
        ? [filtros.estado]
        : ['pendente', 'em_revisao'];

    let itens = Array.from(fichas.values()).filter((f) =>
      estados.includes(f.estado),
    );
    if (filtros.codTipoDocumento !== undefined) {
      itens = itens.filter((f) => f.codTipoDocumento === filtros.codTipoDocumento);
    }
    if (filtros.prefixo) {
      itens = itens.filter((f) => f.prefixo === filtros.prefixo);
    }
    if (filtros.tecnicoId) {
      itens = itens.filter((f) => f.tecnicoId === filtros.tecnicoId);
    }
    if (filtros.desde) {
      itens = itens.filter((f) => f.criadaEm >= filtros.desde!);
    }
    if (filtros.ate) {
      itens = itens.filter((f) => f.criadaEm <= filtros.ate!);
    }

    itens.sort((a, b) => a.criadaEm.getTime() - b.criadaEm.getTime());
    const total = itens.length;
    const limite = Math.min(Math.max(filtros.limite ?? 50, 1), 200);
    const offset = Math.max(filtros.offset ?? 0, 0);
    return {
      itens: itens.slice(offset, offset + limite).map(clonar),
      total,
    };
  },

  async obterPorId(id) {
    const f = fichas.get(id);
    return f ? clonar(f) : null;
  },

  async iniciarRevisao(triagemId, revisorId, metadata) {
    const ficha = fichas.get(triagemId);
    if (!ficha) throw new FichaTriagemNaoEncontrada(triagemId);

    const lockExistente = locks.get(triagemId);
    if (lockExistente && lockExistente.expiraEm > new Date()) {
      return {
        adquirido: false,
        motivo: 'lock_em_uso',
        revisorAtualId: lockExistente.revisorId,
        expiraEm: new Date(lockExistente.expiraEm),
      } satisfies ResultadoIniciarRevisao;
    }
    if (lockExistente) {
      // expirado — limpa
      locks.delete(triagemId);
    }

    if (!podeTransitar(ficha.estado, 'em_revisao')) {
      return {
        adquirido: false,
        motivo: 'estado_invalido',
        estadoAtual: ficha.estado,
      } satisfies ResultadoIniciarRevisao;
    }

    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + 60 * 60 * 1000);
    locks.set(triagemId, {
      triagemId,
      revisorId,
      criadoEm: agora,
      expiraEm,
    });

    const estadoAnterior = ficha.estado;
    ficha.estado = 'em_revisao';
    ficha.atualizadaEm = agora;

    novoEvento({
      triagemId,
      evento: 'revisao_iniciada',
      estadoAnterior,
      estadoNovo: 'em_revisao',
      atorId: revisorId,
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    });

    return {
      adquirido: true,
      ficha: clonar(ficha),
      expiraEm,
    } satisfies ResultadoIniciarRevisao;
  },

  async aprovar(triagemId, aprovadorId, metadata) {
    const ficha = fichas.get(triagemId);
    if (!ficha) throw new FichaTriagemNaoEncontrada(triagemId);
    if (ficha.estado !== 'em_revisao') {
      throw new EstadoTriagemInvalido(ficha.estado, 'aprovada');
    }
    const lock = locks.get(triagemId);
    if (!lock) throw new LockRevisaoNegado(triagemId, 'lock_expirado');
    if (lock.revisorId !== aprovadorId)
      throw new LockRevisaoNegado(triagemId, 'nao_dono_do_lock');
    if (lock.expiraEm <= new Date())
      throw new LockRevisaoNegado(triagemId, 'lock_expirado');

    const fichaVisitaId = randomUUID();

    ficha.estado = 'aprovada';
    ficha.fichaVisitaId = fichaVisitaId;
    ficha.decididaEm = new Date();
    ficha.decididaPor = aprovadorId;
    ficha.atualizadaEm = new Date();

    locks.delete(triagemId);

    novoEvento({
      triagemId,
      evento: 'aprovada',
      estadoAnterior: 'em_revisao',
      estadoNovo: 'aprovada',
      atorId: aprovadorId,
      payload: { fichaVisitaId },
      ip: metadata.ip,
      userAgent: metadata.userAgent,
    });

    return {
      triagem: clonar(ficha),
      fichaVisitaId,
    } satisfies ResultadoAprovacao;
  },

  async rejeitar(triagemId, aprovadorId, motivo, metadata) {
    return decidirMock(triagemId, aprovadorId, motivo, metadata, 'rejeitada');
  },

  async devolver(triagemId, aprovadorId, motivo, metadata) {
    return decidirMock(triagemId, aprovadorId, motivo, metadata, 'devolvida');
  },

  async liberarLocksExpirados() {
    const agora = new Date();
    const liberados: string[] = [];
    for (const [triagemId, lock] of locks.entries()) {
      if (lock.expiraEm < agora) {
        const ficha = fichas.get(triagemId);
        if (ficha && ficha.estado === 'em_revisao') {
          ficha.estado = 'pendente';
          ficha.atualizadaEm = new Date();
          novoEvento({
            triagemId,
            evento: 'lock_expirado',
            estadoAnterior: 'em_revisao',
            estadoNovo: 'pendente',
            atorId: lock.revisorId,
            motivo: 'TTL 1h sem ação',
          });
          liberados.push(triagemId);
        }
        locks.delete(triagemId);
      }
    }
    return { liberados };
  },

  async listarEventos(triagemId) {
    return eventos
      .filter((e) => e.triagemId === triagemId)
      .map(clonar)
      .sort((a, b) => b.ocorreuEm.getTime() - a.ocorreuEm.getTime());
  },

  async registrarEvento(entrada) {
    return clonar(novoEvento(entrada));
  },

  async obterPorIdempotency(tecnicoId, idempotencyKey) {
    for (const f of fichas.values()) {
      if (f.tecnicoId === tecnicoId && f.idempotencyKey === idempotencyKey) {
        return clonar(f);
      }
    }
    return null;
  },

  async registrarHeartbeat() {
    // No-op no mock — heartbeat é puramente operacional.
    // Em modo demo (sem DB), o cron dispara sem persistir nada e a alerta
    // A3 fica aplicável só no ambiente real.
  },
};

function decidirMock(
  triagemId: string,
  aprovadorId: string,
  motivo: string,
  metadata: { ip: string | null; userAgent: string | null },
  estadoAlvo: 'rejeitada' | 'devolvida',
): FichaTriagem {
  const ficha = fichas.get(triagemId);
  if (!ficha) throw new FichaTriagemNaoEncontrada(triagemId);
  if (ficha.estado !== 'em_revisao') {
    throw new EstadoTriagemInvalido(ficha.estado, estadoAlvo);
  }
  const lock = locks.get(triagemId);
  if (!lock) throw new LockRevisaoNegado(triagemId, 'lock_expirado');
  if (lock.revisorId !== aprovadorId)
    throw new LockRevisaoNegado(triagemId, 'nao_dono_do_lock');
  if (lock.expiraEm <= new Date())
    throw new LockRevisaoNegado(triagemId, 'lock_expirado');

  ficha.estado = estadoAlvo;
  ficha.motivoDecisao = motivo;
  ficha.decididaEm = new Date();
  ficha.decididaPor = aprovadorId;
  ficha.atualizadaEm = new Date();

  locks.delete(triagemId);

  novoEvento({
    triagemId,
    evento: estadoAlvo,
    estadoAnterior: 'em_revisao',
    estadoNovo: estadoAlvo,
    atorId: aprovadorId,
    motivo,
    ip: metadata.ip,
    userAgent: metadata.userAgent,
  });

  return clonar(ficha);
}

/** Reset interno (para testes ou bypass dev). */
export function _resetTriagemMock(): void {
  fichas.clear();
  eventos.length = 0;
  locks.clear();
}

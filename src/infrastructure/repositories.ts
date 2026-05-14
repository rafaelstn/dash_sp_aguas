import 'server-only';

import { getEnv } from './config/env';

// Implementações PostgreSQL (padrão em produção/banco real).
import { postosRepository as postosPg } from './db/postos-repository.pg';
import { arquivosRepository as arquivosPg } from './db/arquivos-repository.pg';
import { auditoriaRepository as auditoriaPg } from './db/auditoria-repository.pg';
import { desconformidadesRepository as desconformidadesPg } from './db/desconformidades-repository.pg';
import { revisoesRepository as revisoesPg } from './db/revisoes-repository.pg';
import { favoritosRepository as favoritosPg } from './db/favoritos-repository.pg';
import { facetasRepository as facetasPg } from './db/facetas-repository.pg';
import { fichasVisitaRepository as fichasVisitaPg } from './db/fichas-visita-repository.pg';
import { triagemRepository as triagemPg } from './db/triagem-repository.pg';
import { papeisRepository as papeisPg } from './db/papeis-repository.pg';
import { anaRevisaoRepository as anaRevisaoPg } from './db/ana-revisao-repository.pg';

// Implementações in-memory (ativadas apenas em MODO DEMO).
import { postosRepository as postosMock } from './mock/postos-repository.mock';
import { arquivosRepository as arquivosMock } from './mock/arquivos-repository.mock';
import { auditoriaRepository as auditoriaMock } from './mock/auditoria-repository.mock';
import { desconformidadesRepository as desconformidadesMock } from './mock/desconformidades-repository.mock';
import { revisoesRepository as revisoesMock } from './mock/revisoes-repository.mock';
import { favoritosRepository as favoritosMock } from './mock/favoritos-repository.mock';
import { facetasRepository as facetasMock } from './mock/facetas-repository.mock';
import { fichasVisitaRepository as fichasVisitaMock } from './mock/fichas-visita-repository.mock';
import { triagemRepository as triagemMock } from './mock/triagem-repository.mock';
import { papeisRepository as papeisMock } from './mock/papeis-repository.mock';

/**
 * Ponto único de escolha entre repositórios PG (reais) e mock (demo).
 *
 * Toda rota/página deve importar daqui — nunca diretamente de `db/*.pg` ou de
 * `mock/*.mock`. Isso garante que o toggle por `DATABASE_URL` seja respeitado
 * em um único lugar (ver env.ts `isDemoMode`).
 */
const demo = getEnv().isDemoMode;

export const postosRepository = demo ? postosMock : postosPg;
export const arquivosRepository = demo ? arquivosMock : arquivosPg;
export const auditoriaRepository = demo ? auditoriaMock : auditoriaPg;
export const desconformidadesRepository = demo
  ? desconformidadesMock
  : desconformidadesPg;
export const revisoesRepository = demo ? revisoesMock : revisoesPg;
export const favoritosRepository = demo ? favoritosMock : favoritosPg;
export const facetasRepository = demo ? facetasMock : facetasPg;
export const fichasVisitaRepository = demo ? fichasVisitaMock : fichasVisitaPg;
export const triagemRepository = demo ? triagemMock : triagemPg;
export const papeisRepository = demo ? papeisMock : papeisPg;

// Modo demo não tem mock dedicado para ana-revisao (módulo recém-criado).
// Em demo, devolve um stub que sempre informa "sem lote" para não quebrar UI.
import type { AnaRevisaoRepository } from '@/application/ports/ana-revisao-repository';
const anaRevisaoStubDemo: AnaRevisaoRepository = {
  async loteAtual() {
    return null;
  },
  async resumoPainel(loteId) {
    return {
      loteId,
      loteNome: '',
      prazoResposta: null,
      totalEstacoes: 0,
      totalPendencias: 0,
      operando: 0,
      desativadas: 0,
      semMatch: 0,
      statusPendente: 0,
      statusEmRevisao: 0,
      statusRevisada: 0,
      statusDescartada: 0,
      statusPromovida: 0,
      divergenciaOk: 0,
      divergenciaMargem: 0,
      divergenciaDivergente: 0,
      divergenciaSemCoord: 0,
    };
  },
  async listar() {
    return { itens: [], total: 0 };
  },
  async obterPorCodigo() {
    return null;
  },
  async aplicarRevisao() {
    throw new Error('Modo demo: revisão ANA indisponível sem banco.');
  },
  async aplicarBulk() {
    return { aplicadas: 0, falhadas: 0 };
  },
};
export const anaRevisaoRepository = demo ? anaRevisaoStubDemo : anaRevisaoPg;

export const modoDemoAtivo = demo;

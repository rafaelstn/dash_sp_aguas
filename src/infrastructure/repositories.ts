import 'server-only';

import { getEnv } from './config/env';

// Implementações PostgreSQL (padrão em produção/banco real).
import { postosRepository as postosPg } from './db/postos-repository.pg';
import { arquivosRepository as arquivosPg } from './db/arquivos-repository.pg';
import { auditoriaRepository as auditoriaPg } from './db/auditoria-repository.pg';
import { desconformidadesRepository as desconformidadesPg } from './db/desconformidades-repository.pg';
import { revisoesRepository as revisoesPg } from './db/revisoes-repository.pg';
import { favoritosRepository as favoritosPg } from './db/favoritos-repository.pg';
import { postosFotosRepository as postosFotosPg } from './db/postos-fotos-repository.pg';
import { facetasRepository as facetasPg } from './db/facetas-repository.pg';
import { fichasVisitaRepository as fichasVisitaPg } from './db/fichas-visita-repository.pg';
import { triagemRepository as triagemPg } from './db/triagem-repository.pg';
import { papeisRepository as papeisPg } from './db/papeis-repository.pg';
import { anaRevisaoRepository as anaRevisaoPg } from './db/ana-revisao-repository.pg';
import { painelRepository as painelPg } from './db/painel-repository.pg';

// Implementações in-memory (ativadas apenas em MODO DEMO).
import { postosRepository as postosMock } from './mock/postos-repository.mock';
import { arquivosRepository as arquivosMock } from './mock/arquivos-repository.mock';
import { auditoriaRepository as auditoriaMock } from './mock/auditoria-repository.mock';
import { desconformidadesRepository as desconformidadesMock } from './mock/desconformidades-repository.mock';
import { revisoesRepository as revisoesMock } from './mock/revisoes-repository.mock';
import { favoritosRepository as favoritosMock } from './mock/favoritos-repository.mock';
import { postosFotosRepository as postosFotosMock } from './mock/postos-fotos-repository.mock';
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
export const postosFotosRepository = demo ? postosFotosMock : postosFotosPg;
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
  async obterSugestaoMatch() {
    return null;
  },
  async contarPorCenario() {
    return 0;
  },
  async detalheSugestaoMatch() {
    return null;
  },
  async aceitarMatch() {
    throw new Error('Modo demo: aceitar match ANA indisponível sem banco.');
  },
};
export const anaRevisaoRepository = demo ? anaRevisaoStubDemo : anaRevisaoPg;

// Painel é só agregação read-only. Em modo demo, devolve um stub vazio
// que mantém a tela renderizável sem banco.
import type { PainelRepository } from './db/painel-repository.pg';
const painelStubDemo: PainelRepository = {
  async resumoPendencias() {
    return {
      totalPostos: 0,
      postosComArquivos: 0,
      postosSemArquivos: 0,
      postosComCoordenadas: 0,
      postosSemCoordenadas: 0,
      postosComTelemetria: 0,
      desconformidadesPostos: 0,
      arquivosOrfaos: 0,
    };
  },
  async distribuicaoPorTipo() {
    return [];
  },
  async rankingUGRHI() {
    return [];
  },
  async classesDesconformidade() {
    return [];
  },
  async statusOperacional() {
    return { ativos: 0, desativados: 0, indeterminados: 0, total: 0 };
  },
  async rankingMantenedores() {
    return [];
  },
  async atividadeRecente() {
    return {
      ultimaIndexacao: null,
      statusUltimaIndexacao: null,
      totalLotesIndexacao: 0,
      arquivosIndexadosTotal: 0,
      acessosHoje: 0,
      acessos7Dias: 0,
    };
  },
};
export const painelRepository = demo ? painelStubDemo : painelPg;

export const modoDemoAtivo = demo;

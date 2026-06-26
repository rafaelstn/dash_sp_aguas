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
import { diagramasRepository as diagramasPg } from './db/diagramas-repository.pg';
import { inventarioAnaExportRepository as inventarioAnaExportPg } from './db/inventario-ana-export-repository.pg';
import { estacoesPluviometricasRepository as estacoesPluviometricasPg } from './db/estacoes-pluviometricas-repository.pg';
import { leiturasPluviometricasRepository as leiturasPluviometricasPg } from './db/leituras-pluviometricas-repository.pg';

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
import { anaRevisaoRepository as anaRevisaoMock } from './mock/ana-revisao-repository.mock';
import { painelRepository as painelMock } from './mock/painel-repository.mock';
import { diagramasRepository as diagramasMock } from './mock/diagramas-repository.mock';
import { inventarioAnaExportRepository as inventarioAnaExportMock } from './mock/inventario-ana-export-repository.mock';
import { estacoesPluviometricasRepository as estacoesPluviometricasMock } from './mock/estacoes-pluviometricas-repository.mock';
import { leiturasPluviometricasRepository as leiturasPluviometricasMock } from './mock/leituras-pluviometricas-repository.mock';

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

// ana-revisao e painel seguem o mesmo padrão dos demais: mock dedicado em
// mock/*.mock.ts. O mock de ana-revisao é in-memory (sem lote/estação em
// demo, devolve estado vazio); o de painel devolve agregação zerada.
export const anaRevisaoRepository = demo ? anaRevisaoMock : anaRevisaoPg;
export const painelRepository = demo ? painelMock : painelPg;
export const diagramasRepository = demo ? diagramasMock : diagramasPg;
export const inventarioAnaExportRepository = demo
  ? inventarioAnaExportMock
  : inventarioAnaExportPg;

// Monitor Pluviométrico (fase B1.1): estações e leituras persistidas no banco.
export const estacoesPluviometricasRepository = demo
  ? estacoesPluviometricasMock
  : estacoesPluviometricasPg;
export const leiturasPluviometricasRepository = demo
  ? leiturasPluviometricasMock
  : leiturasPluviometricasPg;

// Gateway de Storage (Supabase) das fotos de posto. Sem variação demo: o
// armazenamento real é sempre usado (não há mock de bucket hoje).
export { fotoStorageGateway } from './storage/foto-posto-storage';

export const modoDemoAtivo = demo;

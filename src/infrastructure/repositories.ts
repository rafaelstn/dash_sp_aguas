import 'server-only';

import { getEnv } from './config/env';

// Implementações PostgreSQL (padrão em produção/banco real).
import { postosRepository as postosPg } from './db/postos-repository.pg';
// Cadastro de posto lido AO VIVO do SQL Server do órgão (ADR-0023).
import { postosRepository as postosMssql } from './db/postos-repository.mssql';
import { facetasRepository as facetasMssql } from './db/facetas-repository.mssql';
import { mssqlConfigurado } from './db/mssql-client';
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
import {
  painelRepository as painelPg,
  painelOperacaoRepositoryPg,
} from './db/painel-repository.pg';
import { painelCadastroRepositoryMssql } from './db/painel-cadastro-repository.mssql';
import { seriesMedicaoRepositoryMssql } from './db/series-medicao-repository.mssql';
import { seriesMedicaoRepositoryMock } from './mock/series-medicao-repository.mock';
import { comporPainelRepository } from './db/painel-repository.composto';
import { diagramasRepository as diagramasPg } from './db/diagramas-repository.pg';
import { inventarioAnaExportRepository as inventarioAnaExportPg } from './db/inventario-ana-export-repository.pg';
import { estacoesPluviometricasRepository as estacoesPluviometricasPg } from './db/estacoes-pluviometricas-repository.pg';
import { leiturasPluviometricasRepository as leiturasPluviometricasPg } from './db/leituras-pluviometricas-repository.pg';
import { estoqueCategoriasRepository as estoqueCategoriasPg } from './db/estoque-categorias-repository.pg';
import { estoqueLocaisRepository as estoqueLocaisPg } from './db/estoque-locais-repository.pg';
import { estoqueMateriaisRepository as estoqueMateriaisPg } from './db/estoque-materiais-repository.pg';
import { estoqueUnidadesRepository as estoqueUnidadesPg } from './db/estoque-unidades-repository.pg';
import { estoqueSaldosRepository as estoqueSaldosPg } from './db/estoque-saldos-repository.pg';
import { estoqueMovimentacoesRepository as estoqueMovimentacoesPg } from './db/estoque-movimentacoes-repository.pg';
import { estoqueConferenciasRepository as estoqueConferenciasPg } from './db/estoque-conferencias-repository.pg';
import { usuariosIdentidadeRepository as usuariosIdentidadePg } from './db/usuarios-identidade-repository.pg';

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
import { estoqueCategoriasRepository as estoqueCategoriasMock } from './mock/estoque-categorias-repository.mock';
import { estoqueLocaisRepository as estoqueLocaisMock } from './mock/estoque-locais-repository.mock';
import { estoqueMateriaisRepository as estoqueMateriaisMock } from './mock/estoque-materiais-repository.mock';
import { estoqueUnidadesRepository as estoqueUnidadesMock } from './mock/estoque-unidades-repository.mock';
import { estoqueSaldosRepository as estoqueSaldosMock } from './mock/estoque-saldos-repository.mock';
import { estoqueMovimentacoesRepository as estoqueMovimentacoesMock } from './mock/estoque-movimentacoes-repository.mock';
import { estoqueConferenciasRepository as estoqueConferenciasMock } from './mock/estoque-conferencias-repository.mock';
import { usuariosIdentidadeRepository as usuariosIdentidadeMock } from './mock/usuarios-identidade-repository.mock';

/**
 * Ponto único de escolha entre repositórios PG (reais) e mock (demo).
 *
 * Toda rota/página deve importar daqui — nunca diretamente de `db/*.pg` ou de
 * `mock/*.mock`. Isso garante que o toggle por `DATABASE_URL` seja respeitado
 * em um único lugar (ver env.ts `isDemoMode`).
 */
const demo = getEnv().isDemoMode;

/**
 * Origem do CADASTRO de posto (ADR-0023).
 *
 * Configurou `SQLSERVER_*`? O cadastro é lido AO VIVO do `Dbfch`, o banco do
 * órgão, sem cópia, sem banco intermediário e sem cache. É a instrução do
 * proprietário: "tudo que vamos ler na tela tem que ser diretamente do banco
 * original".
 *
 * O modo demo continua vencendo, e isso é deliberado: quem sobe a aplicação
 * sem banco quer as fixtures, e não uma conexão contra a produção do órgão.
 *
 * O adaptador PostgreSQL fica como está, e some quando o novo passar. Vale
 * lembrar que ele NÃO é equivalente hoje: a tabela `postos` do nosso banco
 * está vazia (0 linhas em 02/09/2026), então cair nele significa tela vazia.
 *
 * Só o cadastro de POSTO troca de origem. Os outros repositórios continuam no
 * nosso PostgreSQL, sem uma linha alterada (ADR-0023 §2.1: dezenove dos vinte
 * e cinco adaptadores nunca tocam em `postos`).
 */
export const origemDoCadastroDePostos: 'mock' | 'dbfch' | 'postgres' = demo
  ? 'mock'
  : mssqlConfigurado()
    ? 'dbfch'
    : 'postgres';

export const postosRepository = demo
  ? postosMock
  : mssqlConfigurado()
    ? postosMssql
    : postosPg;
export const arquivosRepository = demo ? arquivosMock : arquivosPg;
export const auditoriaRepository = demo ? auditoriaMock : auditoriaPg;
export const desconformidadesRepository = demo
  ? desconformidadesMock
  : desconformidadesPg;
export const revisoesRepository = demo ? revisoesMock : revisoesPg;
export const favoritosRepository = demo ? favoritosMock : favoritosPg;
export const postosFotosRepository = demo ? postosFotosMock : postosFotosPg;
// As facetas agregam o MESMO cadastro que a busca filtra, então elas seguem a
// origem do posto. Deixá-las no PostgreSQL enquanto a busca lê o órgão daria
// uma tela que acha posto e não oferece filtro nenhum, sem erro em lugar
// nenhum: a tabela `postos` do nosso banco está vazia.
export const facetasRepository = demo
  ? facetasMock
  : mssqlConfigurado()
    ? facetasMssql
    : facetasPg;
export const fichasVisitaRepository = demo ? fichasVisitaMock : fichasVisitaPg;
export const triagemRepository = demo ? triagemMock : triagemPg;
export const papeisRepository = demo ? papeisMock : papeisPg;

// ana-revisao e painel seguem o mesmo padrão dos demais: mock dedicado em
// mock/*.mock.ts. O mock de ana-revisao é in-memory (sem lote/estação em
// demo, devolve estado vazio); o de painel devolve números determinísticos de
// demonstração nos KPIs e listas vazias nos rankings (não "agregação zerada",
// que era o que esta linha dizia e o arquivo nunca fez).
export const anaRevisaoRepository = demo ? anaRevisaoMock : anaRevisaoPg;

/**
 * O painel segue a origem do posto pela metade CADASTRAL, e continua no nosso
 * PostgreSQL pela metade que é nossa (arquivos indexados, órfãos e trilha).
 *
 * Deixá-lo inteiro no PostgreSQL enquanto a busca lê o órgão dava a tela que o
 * Rafael viu: painel zerado (0 linhas em `postos` no container de produção) ou,
 * pior, painel com o número velho da carga de 23/06/2026 (2.483 postos) ao lado
 * de uma busca que acha 5.790. Nenhum dos dois quebra nada.
 *
 * A junção entre os dois armazenamentos continua proibida (ADR-0023): cada
 * metade resolve inteira na sua origem e o compositor faz a aritmética em
 * TypeScript, sem SQL que enxergue os dois lados.
 */
export const painelRepository = demo
  ? painelMock
  : mssqlConfigurado()
    ? comporPainelRepository(painelCadastroRepositoryMssql, painelOperacaoRepositoryPg)
    : painelPg;
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

/**
 * Séries HISTÓRICAS de medição do posto (chuva, cota de rio, piezômetro).
 *
 * Não há adaptador PostgreSQL, e é deliberado: nosso banco nunca teve essas
 * tabelas, e criá-las significaria copiar 42 milhões de linhas do órgão, que é
 * exatamente o que o ADR-0023 proíbe ("a ideia não é refazer o banco, é começar
 * a transmitir o banco deles"). Fora do modo demo, e sem `SQLSERVER_*`, a porta
 * fica INDISPONÍVEL, e quem consome trata isso como recurso ausente.
 *
 * `null` aqui é a resposta honesta para "não temos como ler isto neste
 * ambiente", e é diferente de um adaptador que devolvesse listas vazias: o
 * segundo diria, sem nada quebrar, que o posto não tem série nenhuma.
 */
export const seriesMedicaoRepository = demo
  ? seriesMedicaoRepositoryMock
  : mssqlConfigurado()
    ? seriesMedicaoRepositoryMssql
    : null;

// Modulo Estoque (almoxarifado / patrimonio, ADR 0020): 6 repositorios atras de
// ports, com adapter mock in-memory (store compartilhado) para o MODO DEMO. A
// escrita de saldo/unidade so acontece dentro do repo de movimentacoes (transacao).
export const estoqueCategoriasRepository = demo ? estoqueCategoriasMock : estoqueCategoriasPg;
export const estoqueLocaisRepository = demo ? estoqueLocaisMock : estoqueLocaisPg;
export const estoqueMateriaisRepository = demo ? estoqueMateriaisMock : estoqueMateriaisPg;
export const estoqueUnidadesRepository = demo ? estoqueUnidadesMock : estoqueUnidadesPg;
export const estoqueSaldosRepository = demo ? estoqueSaldosMock : estoqueSaldosPg;
export const estoqueMovimentacoesRepository = demo
  ? estoqueMovimentacoesMock
  : estoqueMovimentacoesPg;

// Conferencia fisica (inventario, ADR 0021): abre sessao + snapshot congelado,
// contagem, reconciliacao (reusa o ledger na mesma transacao, idempotente).
export const estoqueConferenciasRepository = demo
  ? estoqueConferenciasMock
  : estoqueConferenciasPg;

// Resolucao de identidade de operador (email/nome) para a trilha/export do
// Estoque. `.pg` le de auth.users em lote; `.mock` devolve vazio (sem Auth em demo).
export const usuariosIdentidadeRepository = demo
  ? usuariosIdentidadeMock
  : usuariosIdentidadePg;

// Gateway de Storage (Supabase) das fotos de posto. Sem variação demo: o
// armazenamento real é sempre usado (não há mock de bucket hoje).
export { fotoStorageGateway } from './storage/foto-posto-storage';

// Gestão administrativa de usuários (RBAC). Toca Supabase Auth Admin (service
// role) + Postgres. Sem variação demo: não há Auth real em modo demo — as
// rotas /api/admin/usuarios exigem banco e Supabase configurados. A instância
// é preguiçosa (só abre conexão/cliente no primeiro uso), então importar aqui
// não quebra o boot em modo demo.
export { usuariosAdminRepository } from './db/usuarios-admin-repository.supabase';

export const modoDemoAtivo = demo;

import type { PainelRepository } from '@/application/ports/painel-repository';

/**
 * Mock in-memory do PainelRepository, usado em modo demo.
 *
 * O painel é só agregação read-only; sem banco, devolve um estado vazio
 * que mantém a tela renderizável (todos os cards zerados, listas vazias).
 */
export const painelRepository: PainelRepository = {
  async resumoPendencias() {
    // Números demo determinísticos (sem Math.random) para a demonstração não
    // ficar vazia. As séries são cumulativas e crescentes/decrescentes de modo
    // plausível; valorAnterior = penúltimo ponto (fechamento do mês anterior),
    // batendo com o que o adapter PG produz.
    return {
      totalPostos: 2483,
      postosComArquivos: 1689,
      postosSemArquivos: 794,
      postosComCoordenadas: 2310,
      postosSemCoordenadas: 173,
      postosComTelemetria: 612,
      desconformidadesPostos: 138,
      arquivosOrfaos: 47,
      tendencias: {
        // Cadastro cresce devagar; última posição = totalPostos atual.
        totalPostos: {
          serie: [2401, 2418, 2440, 2461, 2475, 2483],
          valorAnterior: 2475,
        },
        // Cobertura melhora: pendência de "sem arquivo" cai mês a mês.
        postosSemArquivos: {
          serie: [1102, 1010, 947, 882, 831, 794],
          valorAnterior: 831,
        },
        // Órfãos sobem conforme o worker varre mais HD de rede.
        arquivosOrfaos: {
          serie: [12, 19, 26, 33, 41, 47],
          valorAnterior: 41,
        },
      },
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

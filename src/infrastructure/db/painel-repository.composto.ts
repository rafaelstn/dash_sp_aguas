import type {
  PainelCadastroRepository,
  PainelOperacaoRepository,
  PainelRepository,
  ResumoPendencias,
} from '@/application/ports/painel-repository';

/**
 * Compositor do painel: junta a metade CADASTRAL com a metade NOSSA.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE COMPOSIÇÃO DE ADAPTADOR, E NÃO COMPOSIÇÃO NA CAMADA DE APLICAÇÃO
 * ─────────────────────────────────────────────────────────────────────────
 * As duas alternativas resolviam o problema. A escolha é por CUSTO DE BORDA:
 *
 *   1. A regra do ADR-0023 é "nenhum adaptador executa junção entre os dois
 *      armazenamentos", e ela continua respeitada aqui pelo motivo certo:
 *      cada metade resolve inteira na sua origem, e o que cruza é aritmética
 *      em TypeScript sobre dois números já apurados. Não há SQL que enxergue
 *      os dois lados.
 *   2. `PainelRepository` não muda, então a página do painel não muda uma
 *      linha. Compor na camada de aplicação exigiria um caso de uso novo e
 *      trocar os imports da tela, que é território de frontend e vira
 *      sobrescrita quando duas mãos mexem no mesmo arquivo.
 *   3. É o padrão que este repositório JÁ usa para "mesma porta, outra
 *      origem": `postosRepository` e `facetasRepository` escolhem o adaptador
 *      em `repositories.ts` conforme `mssqlConfigurado()`. Um terceiro jeito
 *      de fazer a mesma coisa é dívida no mesmo dia.
 *
 * Este arquivo NÃO importa driver nenhum, de propósito: sem `server-only` e
 * sem `sql`, a aritmética abaixo é exercitável por teste de unidade com dublês,
 * que é onde os erros de composição aparecem (subtração entre populações
 * diferentes, série de um lado desenhada embaixo do número do outro).
 */
export function comporPainelRepository(
  cadastro: PainelCadastroRepository,
  operacao: PainelOperacaoRepository,
): PainelRepository {
  return {
    async resumoPendencias(): Promise<ResumoPendencias> {
      const [resumo, comArquivos, orfaos, tendencias] = await Promise.all([
        cadastro.resumoCadastro(),
        operacao.postosComArquivos(),
        operacao.arquivosOrfaos(),
        operacao.tendencias(),
      ]);

      return {
        totalPostos: resumo.totalPostos,
        postosComArquivos: comArquivos,
        // A ÚNICA subtração que cruza os dois armazenamentos, e a razão do
        // `Math.max`: o total vem do cadastro do órgão e os prefixos indexados
        // vêm do nosso banco, então nada garante que todo prefixo indexado
        // ainda exista no cadastro. Prefixo indexado de posto excluído (ou
        // renomeado) devolveria "menos que zero postos sem arquivo", que é um
        // número impossível chegando à tela sem nada quebrar.
        postosSemArquivos: Math.max(0, resumo.totalPostos - comArquivos),
        postosComCoordenadas: resumo.postosComCoordenadas,
        postosSemCoordenadas: Math.max(
          0,
          resumo.totalPostos - resumo.postosComCoordenadas,
        ),
        postosComTelemetria: resumo.postosComTelemetria,
        desconformidadesPostos: resumo.desconformidadesPostos,
        arquivosOrfaos: orfaos,
        tendencias: cadastro.temHistoricoDeCadastro
          ? tendencias
          : // Origem de cadastro sem data de criação de linha: as duas séries
            // cumulativas sobre a população de postos deixam de existir. Elas
            // são calculadas no nosso PostgreSQL, sobre a NOSSA tabela
            // `postos`, que é outra população — desenhar essa série embaixo do
            // total do órgão seria uma tendência de uma base sob o número de
            // outra, e o gestor leria como variação do cadastro dele.
            // `arquivosOrfaos` sobrevive porque é inteiramente nossa.
            { arquivosOrfaos: tendencias.arquivosOrfaos },
      };
    },

    distribuicaoPorTipo: () => cadastro.distribuicaoPorTipo(),
    rankingUGRHI: () => cadastro.rankingUGRHI(),
    classesDesconformidade: () => cadastro.classesDesconformidade(),
    statusOperacional: () => cadastro.statusOperacional(),
    rankingMantenedores: (limite) => cadastro.rankingMantenedores(limite),
    atividadeRecente: () => operacao.atividadeRecente(),
  };
}

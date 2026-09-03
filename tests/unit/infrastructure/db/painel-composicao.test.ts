/**
 * O compositor do painel (`comporPainelRepository`), exercitado com dublês.
 *
 * Aqui não há banco: o que se mede é a ARITMÉTICA que cruza os dois
 * armazenamentos, que é justamente onde o erro deste desenho mora. Os dois
 * defeitos que este arquivo existe para impedir são silenciosos:
 *
 *   - subtrair uma contagem NOSSA de um total do ÓRGÃO e deixar o resultado
 *     ficar negativo, o que chega à tela como número impossível;
 *   - deixar vazar a série temporal calculada sobre a NOSSA tabela `postos`
 *     para baixo do total do órgão, que é a tendência de uma população
 *     desenhada sob o número de outra.
 *
 * O compositor não importa driver nenhum de propósito, e é o que torna este
 * arquivo possível sem subir banco.
 */
import { describe, expect, it, vi } from 'vitest';
import type {
  PainelCadastroRepository,
  PainelOperacaoRepository,
  ResumoPendencias,
} from '@/application/ports/painel-repository';
import { comporPainelRepository } from '@/infrastructure/db/painel-repository.composto';

const TENDENCIAS_COMPLETAS: ResumoPendencias['tendencias'] = {
  totalPostos: { serie: [2401, 2418, 2440, 2461, 2475, 2483], valorAnterior: 2475 },
  postosSemArquivos: { serie: [1102, 1010, 947, 882, 831, 794], valorAnterior: 831 },
  arquivosOrfaos: { serie: [12, 19, 26, 33, 41, 47], valorAnterior: 41 },
};

function cadastroDuble(
  parcial: Partial<PainelCadastroRepository> & {
    temHistoricoDeCadastro?: boolean;
  } = {},
): PainelCadastroRepository {
  return {
    temHistoricoDeCadastro: parcial.temHistoricoDeCadastro ?? false,
    resumoCadastro: parcial.resumoCadastro ??
      (async () => ({
        totalPostos: 5790,
        postosComCoordenadas: 5784,
        postosComTelemetria: 149,
        desconformidadesPostos: 0,
      })),
    distribuicaoPorTipo:
      parcial.distribuicaoPorTipo ?? (async () => [{ tipo: 'PLUVIOMÉTRICO', total: 3943 }]),
    rankingUGRHI:
      parcial.rankingUGRHI ??
      (async () => [
        { numero: '2', nome: 'PARAIBA DO SUL', total: 450, desconformes: 0, taxa: 0 },
      ]),
    classesDesconformidade: parcial.classesDesconformidade ?? (async () => []),
    statusOperacional:
      parcial.statusOperacional ??
      (async () => ({ total: 5790, ativos: 4416, desativados: 1374, indeterminados: 0 })),
    rankingMantenedores:
      parcial.rankingMantenedores ?? (async () => [{ nome: 'DAEE', total: 894, ativos: 682 }]),
  };
}

function operacaoDuble(
  parcial: Partial<PainelOperacaoRepository> = {},
): PainelOperacaoRepository {
  return {
    postosComArquivos: parcial.postosComArquivos ?? (async () => 0),
    arquivosOrfaos: parcial.arquivosOrfaos ?? (async () => 0),
    tendencias: parcial.tendencias ?? (async () => TENDENCIAS_COMPLETAS),
    atividadeRecente:
      parcial.atividadeRecente ??
      (async () => ({
        ultimaIndexacao: null,
        statusUltimaIndexacao: null,
        totalLotesIndexacao: 0,
        arquivosIndexadosTotal: 0,
        acessosHoje: 0,
        acessos7Dias: 0,
      })),
  };
}

describe('comporPainelRepository, a aritmética entre as duas origens', () => {
  it('deriva "sem arquivo" do total do cadastro menos os indexados no nosso banco', async () => {
    const painel = comporPainelRepository(
      cadastroDuble(),
      operacaoDuble({ postosComArquivos: async () => 1200 }),
    );
    const r = await painel.resumoPendencias();
    expect(r.totalPostos).toBe(5790);
    expect(r.postosComArquivos).toBe(1200);
    expect(r.postosSemArquivos).toBe(4590);
  });

  it('não deixa "sem arquivo" ficar negativo quando o indexado não existe mais no cadastro', async () => {
    // Nada garante que todo prefixo indexado por nós ainda exista no cadastro
    // do órgão: prefixo de posto excluído ou renomeado produz mais indexados
    // que postos. Sem a trava, a tela receberia um número negativo.
    const painel = comporPainelRepository(
      cadastroDuble({
        resumoCadastro: async () => ({
          totalPostos: 100,
          postosComCoordenadas: 100,
          postosComTelemetria: 0,
          desconformidadesPostos: 0,
        }),
      }),
      operacaoDuble({ postosComArquivos: async () => 130 }),
    );
    const r = await painel.resumoPendencias();
    expect(r.postosSemArquivos).toBe(0);
  });

  it('deriva "sem coordenadas" do mesmo total, e também não fica negativo', async () => {
    const painel = comporPainelRepository(cadastroDuble(), operacaoDuble());
    const r = await painel.resumoPendencias();
    expect(r.postosSemCoordenadas).toBe(6);

    const invertido = comporPainelRepository(
      cadastroDuble({
        resumoCadastro: async () => ({
          totalPostos: 10,
          postosComCoordenadas: 12,
          postosComTelemetria: 0,
          desconformidadesPostos: 0,
        }),
      }),
      operacaoDuble(),
    );
    expect((await invertido.resumoPendencias()).postosSemCoordenadas).toBe(0);
  });

  it('descarta as séries cadastrais quando a origem não tem histórico de cadastro', async () => {
    const painel = comporPainelRepository(
      cadastroDuble({ temHistoricoDeCadastro: false }),
      operacaoDuble(),
    );
    const r = await painel.resumoPendencias();
    expect(r.tendencias.totalPostos).toBeUndefined();
    expect(r.tendencias.postosSemArquivos).toBeUndefined();
    // A série que é 100% nossa sobrevive inteira, com o mesmo valor.
    expect(r.tendencias.arquivosOrfaos).toEqual(TENDENCIAS_COMPLETAS.arquivosOrfaos);
    expect(Object.keys(r.tendencias)).toEqual(['arquivosOrfaos']);
  });

  it('mantém as três séries quando cadastro e operação estão no mesmo armazenamento', async () => {
    // É o caminho 100% PostgreSQL, que não pode ter regredido no corte.
    const painel = comporPainelRepository(
      cadastroDuble({ temHistoricoDeCadastro: true }),
      operacaoDuble(),
    );
    const r = await painel.resumoPendencias();
    expect(r.tendencias).toEqual(TENDENCIAS_COMPLETAS);
  });

  it('não busca desconformidade no lado da operação: o número vem do cadastro', async () => {
    // Tentativa de fuga: a metade NOSSA devolve uma série gorda e o cadastro
    // declara zero desconformidades. Se o compositor "ajudasse" lendo o outro
    // lado, o painel mostraria desconformes de uma população sobre o total de
    // outra, que é exatamente a mistura que este desenho existe para impedir.
    const painel = comporPainelRepository(
      cadastroDuble({
        resumoCadastro: async () => ({
          totalPostos: 5790,
          postosComCoordenadas: 5784,
          postosComTelemetria: 149,
          desconformidadesPostos: 0,
        }),
        classesDesconformidade: async () => [],
      }),
      operacaoDuble(),
    );
    const r = await painel.resumoPendencias();
    expect(r.desconformidadesPostos).toBe(0);
    expect(await painel.classesDesconformidade()).toEqual([]);
  });

  it('encaminha cada método para a metade dona dele, e repassa o limite', async () => {
    const rankingMantenedores = vi.fn(async () => [
      { nome: 'DAEE', total: 894, ativos: 682 },
    ]);
    const atividadeRecente = vi.fn(async () => ({
      ultimaIndexacao: null,
      statusUltimaIndexacao: null,
      totalLotesIndexacao: 0,
      arquivosIndexadosTotal: 0,
      acessosHoje: 3,
      acessos7Dias: 9,
    }));
    const painel = comporPainelRepository(
      cadastroDuble({ rankingMantenedores }),
      operacaoDuble({ atividadeRecente }),
    );

    await painel.rankingMantenedores(7);
    expect(rankingMantenedores).toHaveBeenCalledWith(7);

    const atividade = await painel.atividadeRecente();
    expect(atividade.acessosHoje).toBe(3);
    expect(atividadeRecente).toHaveBeenCalledTimes(1);

    expect(await painel.statusOperacional()).toEqual({
      total: 5790,
      ativos: 4416,
      desativados: 1374,
      indeterminados: 0,
    });
    expect((await painel.distribuicaoPorTipo())[0]?.tipo).toBe('PLUVIOMÉTRICO');
    expect((await painel.rankingUGRHI())[0]?.numero).toBe('2');
  });
});

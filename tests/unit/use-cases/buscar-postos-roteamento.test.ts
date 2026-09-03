/**
 * Roteamento do termo de busca: palavra vai para a busca TEXTUAL, código vai
 * para a busca por início de prefixo.
 *
 * Esta é a barreira que roda SEMPRE, inclusive no CI sem VPN. A que mede
 * contagem contra o banco do órgão é
 * `tests/integration/postos-busca-frequencia-mssql.test.ts`, e ela é pulada
 * quando `SQLSERVER_HOST` não está no ambiente, o que é justamente o caso do
 * CI. Uma guarda que só roda com VPN não teria impedido o defeito de
 * 03/09/2026 de chegar a produção.
 *
 * As palavras da lista NÃO foram escolhidas por mim: são as dez mais
 * frequentes nos nomes dos 5.790 postos ativos, apuradas contra o `Dbfch` em
 * 03/09/2026, com a contagem ao lado. Seis delas voltavam ZERO em produção.
 */
import { describe, expect, it } from 'vitest';
import {
  buscarPostos,
  pareceCodigoDePosto,
} from '@/application/use-cases/buscar-postos';
import type {
  ParametrosPesquisa,
  PostosRepository,
} from '@/application/ports/postos-repository';

/**
 * Palavras mais frequentes no `Nome` dos postos ativos, e quantos postos cada
 * uma alcança. MEDIDO em 03/09/2026 contra o `Dbfch`.
 *
 * As seis marcadas com `voltavaZero` são o defeito que chegou ao ar: a busca
 * respondia 0 (ou 1, no caso de `SAO`, pelo prefixo `SAOPAULO`).
 */
const PALAVRAS_DO_CADASTRO = [
  { palavra: 'DA', postos: 1060, voltavaZero: true },
  { palavra: 'DO', postos: 865, voltavaZero: true },
  { palavra: 'FAZENDA', postos: 625, voltavaZero: false },
  { palavra: 'DE', postos: 537, voltavaZero: true },
  { palavra: 'SAO', postos: 348, voltavaZero: true },
  { palavra: 'SANTA', postos: 251, voltavaZero: false },
  { palavra: 'RS', postos: 177, voltavaZero: true },
  { palavra: 'RIO', postos: 175, voltavaZero: true },
  { palavra: 'USINA', postos: 140, voltavaZero: false },
  { palavra: 'BAIRRO', postos: 126, voltavaZero: false },
  { palavra: 'AGUA', postos: 136, voltavaZero: true },
] as const;

/**
 * Prefixos REAIS do cadastro, incluindo os que são só letras. Existem 93 assim
 * entre os 5.790 ativos, e eles são a razão de a régua não poder ser "tem cara
 * de palavra": `PR` é prefixo e `DA` é preposição, com a mesma forma.
 *
 * Depois da correção estes passam pela busca TEXTUAL, e continuam acháveis
 * porque `CAMPOS_BUSCA` cobre `p.Prefixo` com `%termo%`. O que este caso exige
 * é que o termo chegue ao repositório por ALGUM caminho, nunca que ele suma.
 */
const PREFIXOS_SO_LETRAS = ['BT', 'PR', 'BRJ', 'BAURU', 'SAOPAULO', 'IBIPORA'] as const;

/** Códigos de posto que precisam continuar indo para a busca por prefixo. */
const CODIGOS = ['2D', '1D-008', 'D6-N005', '4F-028', '3E-047', '1d-008'] as const;

function repoEspiao(): { repo: PostosRepository; visto: ParametrosPesquisa[] } {
  const visto: ParametrosPesquisa[] = [];
  const repo = {
    async pesquisar(params: ParametrosPesquisa) {
      visto.push(params);
      return { total: 0, itens: [] };
    },
  } as unknown as PostosRepository;
  return { repo, visto };
}

async function rotear(termo: string): Promise<ParametrosPesquisa> {
  const { repo, visto } = repoEspiao();
  await buscarPostos(repo, { termo });
  expect(visto.length, `"${termo}" não chegou ao repositório`).toBe(1);
  return visto[0]!;
}

describe('roteamento do termo de busca', () => {
  it('palavra do cadastro vai para a busca textual, e nunca só para o prefixo', async () => {
    const engolidas: string[] = [];
    for (const { palavra, postos } of PALAVRAS_DO_CADASTRO) {
      const p = await rotear(palavra);
      if (p.termo !== palavra) {
        engolidas.push(
          `"${palavra}" (${postos} postos no cadastro) foi roteada como ` +
            `prefixoComecaCom=${String(p.prefixoComecaCom)} e a busca textual não aconteceu`,
        );
      }
    }
    expect(engolidas, engolidas.join('\n')).toEqual([]);
  });

  it('a mesma palavra em minúscula também vai para a busca textual', async () => {
    // O defeito chegava pela URL (`/?q=rio`) tanto quanto pelo campo da tela.
    for (const { palavra } of PALAVRAS_DO_CADASTRO) {
      const p = await rotear(palavra.toLowerCase());
      expect(p.termo, `"${palavra.toLowerCase()}" deveria ir como termo`).toBe(
        palavra.toLowerCase(),
      );
      expect(p.prefixoComecaCom).toBeUndefined();
    }
  });

  it('prefixo só com letras continua chegando ao repositório, pela busca textual', async () => {
    for (const prefixo of PREFIXOS_SO_LETRAS) {
      const p = await rotear(prefixo);
      // Um dos dois caminhos precisa carregar o texto. Afirmar só
      // `termo === prefixo` prenderia a decisão de roteamento; o que não pode
      // acontecer é o texto não viajar por caminho nenhum.
      const viajou =
        p.termo === prefixo || p.prefixoComecaCom === prefixo.toUpperCase();
      expect(viajou, `"${prefixo}" não chegou nem como termo nem como prefixo`).toBe(
        true,
      );
    }
  });

  it('código de posto continua indo para a busca por início de prefixo', async () => {
    for (const codigo of CODIGOS) {
      const p = await rotear(codigo);
      expect(p.prefixoComecaCom, `"${codigo}" deveria ir como prefixo`).toBe(
        codigo.toUpperCase(),
      );
      expect(p.termo).toBeUndefined();
    }
  });

  it('a régua separa código de palavra pelo dígito', () => {
    // Escrito como tabela para que a régua fique legível sem abrir o use case.
    expect(pareceCodigoDePosto('2D')).toBe(true);
    expect(pareceCodigoDePosto('1D-008')).toBe(true);
    expect(pareceCodigoDePosto('rio')).toBe(false);
    expect(pareceCodigoDePosto('PR')).toBe(false);
    expect(pareceCodigoDePosto('')).toBe(false);
    // Oito dígitos passam da forma e sempre foram busca textual: `{1,4}` nunca
    // os alcançou, e são 2.530 dos 5.790 prefixos ativos.
    expect(pareceCodigoDePosto('02143004')).toBe(false);
  });
});

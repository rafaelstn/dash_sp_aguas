/**
 * O resumo de uma alteração do cadastro de posto, como o técnico do órgão lê.
 *
 * O defeito que trouxe estes casos (achado 2 do QA da tela Postos, 23/09/2026):
 * o histórico imprimia a chave do JSON do audit trail, então a linha em tela era
 * "nomeEstacao: — → Rio Piracicaba". Nome de coluna é texto de programador.
 *
 * Os casos são de EFEITO, e não de forma: cada um confere o texto que aparece na
 * tela, e os dois primeiros conferem também que o nome técnico NÃO aparece, que
 * é a metade que reprova o defeito original.
 */
import { describe, expect, it } from 'vitest';

import { resumirDiffPosto } from '@/lib/diff-posto';

describe('resumo de alteração de posto', () => {
  it('escreve o rótulo em português, e não a chave do banco', () => {
    const resumo = resumirDiffPosto({ nomeEstacao: null }, { nomeEstacao: 'Rio Piracicaba' });

    expect(resumo).toBe('Nome da estação: — → Rio Piracicaba');
    expect(resumo).not.toContain('nomeEstacao');
  });

  it('rotula campo que saiu do cadastro, porque o audit trail é imutável', () => {
    // Evento gravado antes de 03/09/2026 carrega chave de campo que o cadastro
    // não tem mais. Tirar o rótulo junto com o campo faria a tela voltar a
    // mostrar nome cru justamente no evento mais antigo, que é o que ninguém
    // revisita.
    const resumo = resumirDiffPosto({ rede: 'Rede 3' }, { rede: null });

    expect(resumo).toBe('Rede (campo extinto em 03/09/2026): Rede 3 → —');
  });

  it('devolve a chave crua quando ninguém previu o campo', () => {
    // Controle da decisão do módulo de rótulos: chave desconhecida volta como
    // está, em vez de virar texto adivinhado com cara de oficial.
    const resumo = resumirDiffPosto({ campoQueNinguemPreviu: 1 }, { campoQueNinguemPreviu: 2 });

    expect(resumo).toBe('campoQueNinguemPreviu: 1 → 2');
  });

  it('não mostra nada quando a atualização não mudou valor nenhum', () => {
    // O repositório grava o evento mesmo quando o formulário é salvo sem
    // alteração efetiva, então este caso chega em produção.
    expect(resumirDiffPosto({ municipio: 'Campinas' }, { municipio: 'Campinas' })).toBeNull();
    expect(resumirDiffPosto(null, null)).toBeNull();
    expect(resumirDiffPosto({}, {})).toBeNull();
  });

  it('lista os campos mudados separados por ponto médio, sem traço', () => {
    const resumo = resumirDiffPosto(
      { municipio: 'Campinas', proprietario: null },
      { municipio: 'Piracicaba', proprietario: 'DAEE' },
    );

    expect(resumo).toBe('Município: Campinas → Piracicaba · Proprietário: — → DAEE');
  });

  it('corta em quatro campos e conta o restante, para a linha não estourar', () => {
    const antes = {
      municipio: 'a',
      proprietario: 'a',
      mantenedor: 'a',
      tipoPosto: 'a',
      aquifero: 'a',
      nomeEstacao: 'a',
    };
    const depois = {
      municipio: 'b',
      proprietario: 'b',
      mantenedor: 'b',
      tipoPosto: 'b',
      aquifero: 'b',
      nomeEstacao: 'b',
    };

    const resumo = resumirDiffPosto(antes, depois) ?? '';

    expect(resumo.split(' · ')).toHaveLength(5);
    expect(resumo).toContain('(+2)');
  });

  it('atravessa valor que não é texto sem perder o rótulo', () => {
    // Latitude e área chegam como número, e ano como inteiro: o driver do
    // Postgres devolve o JSONB com o tipo original, não tudo em string.
    const resumo = resumirDiffPosto({ latitude: -22.5 }, { latitude: -22.75 });

    expect(resumo).toBe('Latitude: -22.5 → -22.75');
  });
});

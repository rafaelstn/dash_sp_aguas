import { describe, expect, it } from 'vitest';
import { mensagemDeLeitura } from '@/components/features/postos/mapa/useMapaPostos';

/**
 * A tela Postos só LÊ. O tratador comum de `falha_repositorio` responde com um
 * texto de gravação ("Não foi possível gravar agora", "dados preenchidos"),
 * e foi esse texto que apareceu na tela com o Dbfch fora do ar em 17/09/2026.
 */
const CORPO_REAL_500 = {
  erro: 'falha_repositorio',
  mensagem:
    'Não foi possível gravar agora: o banco de dados recusou a operação. ' +
    'Os dados preenchidos continuam nesta tela.',
  correlationId: 'ef1ffb21-3cb5-4919-83f5-0484c317bb09',
};

describe('mensagemDeLeitura', () => {
  it('em 5xx não repete o texto de gravação e mostra o código de correlação', () => {
    const texto = mensagemDeLeitura(500, CORPO_REAL_500);
    expect(texto).toContain('O banco do órgão não respondeu');
    expect(texto).toContain('ef1ffb21-3cb5-4919-83f5-0484c317bb09');
    expect(texto.toLowerCase()).not.toContain('gravar');
    expect(texto.toLowerCase()).not.toContain('preenchidos');
  });

  it('em 5xx sem código não inventa um', () => {
    const texto = mensagemDeLeitura(502, null);
    expect(texto).toContain('O banco do órgão não respondeu');
    expect(texto).not.toContain('Código');
  });

  it('em 501 e 4xx usa a mensagem da API, que descreve o caso', () => {
    expect(mensagemDeLeitura(501, { mensagem: 'Origem X ausente.' })).toBe('Origem X ausente.');
    expect(mensagemDeLeitura(404, { mensagem: 'Posto não encontrado.' })).toBe('Posto não encontrado.');
  });

  it('em 401 pede para entrar de novo, sem depender do corpo', () => {
    expect(mensagemDeLeitura(401, CORPO_REAL_500)).toContain('Entre de novo');
  });
});

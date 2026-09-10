/**
 * `mensagemDeFalha`: qual frase a pessoa lê quando a API recusa.
 *
 * O contrato de erro é `{ erro: <slug>, mensagem: <texto> }`. `erro` existe
 * para o código decidir e `mensagem` para a pessoa ler. O formulário de ficha
 * imprimia `erro`, então quem preenchia a ficha inteira e falhava lia
 * `erro_interno` na tela (rule `padrao-ui`: texto de tela é para a pessoa se
 * achar). As telas do inventário ANA e do estoque já liam `mensagem` primeiro;
 * as de ficha eram as que faltavam.
 */
import { describe, expect, it } from 'vitest';
import { mensagemDeFalha } from '@/lib/mensagem-de-erro';

describe('lib/mensagemDeFalha', () => {
  it('prefere `mensagem` ao slug', () => {
    expect(
      mensagemDeFalha({ erro: 'erro_interno', mensagem: 'Não foi possível gravar.' }, 'padrão'),
    ).toBe('Não foi possível gravar.');
  });

  it('cai no slug só quando não há mensagem, em vez de esconder o motivo', () => {
    // Slug é ruim de ler e ainda assim é melhor que uma frase genérica que
    // apaga a informação: rota antiga sem `mensagem` continua dizendo algo.
    expect(mensagemDeFalha({ erro: 'rate_limit' }, 'padrão')).toBe('rate_limit');
  });

  it('usa a alternativa quando o corpo não tem nem uma coisa nem outra', () => {
    expect(mensagemDeFalha({}, 'Falha 500 ao enviar a ficha.')).toBe(
      'Falha 500 ao enviar a ficha.',
    );
  });

  it('corpo que não é objeto não quebra a tela', () => {
    // `resp.json()` de uma resposta sem corpo JSON cai aqui, e é justamente o
    // caso em que a tela não pode explodir.
    for (const corpo of [null, undefined, 'texto', 42, []]) {
      expect(mensagemDeFalha(corpo, 'alternativa')).toBe('alternativa');
    }
  });

  it('string vazia ou só espaço conta como ausente', () => {
    // `mensagem: ''` existiria e venceria numa comparação por `??`, deixando a
    // tela em branco com a pessoa sem saber o que houve.
    expect(mensagemDeFalha({ mensagem: '   ', erro: 'slug' }, 'alt')).toBe('slug');
    expect(mensagemDeFalha({ mensagem: '', erro: '' }, 'alt')).toBe('alt');
  });

  it('acrescenta o correlationId, que é o que a pessoa informa ao suporte', () => {
    expect(
      mensagemDeFalha(
        { mensagem: 'Não foi possível gravar.', correlationId: 'abc-123' },
        'alt',
      ),
    ).toBe('Não foi possível gravar. (código: abc-123)');
  });

  it('sem correlationId não inventa parêntese vazio', () => {
    expect(mensagemDeFalha({ mensagem: 'Falhou.' }, 'alt')).toBe('Falhou.');
    expect(mensagemDeFalha({ mensagem: 'Falhou.', correlationId: '' }, 'alt')).toBe('Falhou.');
  });
});

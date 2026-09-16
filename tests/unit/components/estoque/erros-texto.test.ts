/**
 * B4: mensagem de erro sem pontuação dobrada e com o código para o suporte
 * quando o servidor devolve `correlationId`.
 */
import { describe, expect, it } from 'vitest';
import { ErroEstoque, comPontoFinal, lancarErro, textoDeErro } from '@/components/features/estoque/erros';

describe('comPontoFinal', () => {
  it('acrescenta o ponto só quando falta', () => {
    expect(comPontoFinal('Falha ao processar a solicitação.')).toBe('Falha ao processar a solicitação.');
    expect(comPontoFinal('Sem permissão')).toBe('Sem permissão.');
    expect(comPontoFinal('Tem certeza?')).toBe('Tem certeza?');
    expect(comPontoFinal('  ')).toBe('');
  });
});

describe('textoDeErro', () => {
  it('erro do servidor com correlationId vira frase única com o código', () => {
    const e = new ErroEstoque('Falha ao processar a solicitação.', 'erro_interno', 500, 'abc-123');
    const t = textoDeErro(e, 'Não foi possível carregar.');
    expect(t).toBe('Falha ao processar a solicitação. Código para o suporte: abc-123.');
    expect(t).not.toMatch(/\(|\.\./);
  });

  it('sem correlationId não inventa código; erro desconhecido usa o padrão', () => {
    expect(textoDeErro(new ErroEstoque('Sem permissão', 'proibido', 403), 'x')).toBe('Sem permissão.');
    expect(textoDeErro(new Error('TypeError interno'), 'Não foi possível carregar')).toBe(
      'Não foi possível carregar.',
    );
  });
});

describe('lancarErro', () => {
  it('lê correlationId do corpo e o carrega no ErroEstoque', async () => {
    const resp = new Response(
      JSON.stringify({ erro: 'erro_interno', mensagem: 'Falha ao processar a solicitação.', correlationId: ' id-9 ' }),
      { status: 500, headers: { 'content-type': 'application/json' } },
    );
    const e = await lancarErro(resp).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ErroEstoque);
    expect((e as ErroEstoque).correlationId).toBe('id-9');
    expect((e as ErroEstoque).status).toBe(500);
  });

  it('corpo sem correlationId deixa null', async () => {
    const resp = new Response('nao json', { status: 502 });
    const e = (await lancarErro(resp).catch((x: unknown) => x)) as ErroEstoque;
    expect(e.correlationId).toBeNull();
    expect(e.codigo).toBe('http_502');
  });
});

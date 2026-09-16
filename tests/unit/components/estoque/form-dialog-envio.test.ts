/**
 * Envio do FormDialog: trava contra dois submits no mesmo tick e a decisão de
 * onde o erro aparece (campo com foco ou alerta geral). Prova pelo efeito:
 * quantas vezes a ação roda e o que o diálogo vai exibir.
 */
import { describe, expect, it } from 'vitest';
import {
  ErroDeCampo,
  MENSAGEM_PADRAO_FALHA,
  enviarUmaVez,
  erroParaExibir,
  type TravaEnvio,
} from '@/components/features/estoque/form-dialog-envio';

function acaoControlada() {
  let chamadas = 0;
  let concluir: () => void = () => {};
  let falhar: (e: unknown) => void = () => {};
  const acao = () => {
    chamadas += 1;
    return new Promise<void>((res, rej) => {
      concluir = res;
      falhar = rej;
    });
  };
  return {
    acao,
    chamadas: () => chamadas,
    concluir: () => concluir(),
    falhar: (e: unknown) => falhar(e),
  };
}

describe('enviarUmaVez: duplo envio no mesmo tick', () => {
  it('dois submits antes de qualquer render executam a ação uma vez só', async () => {
    const trava: TravaEnvio = { current: false };
    const c = acaoControlada();
    const primeiro = enviarUmaVez(trava, c.acao);
    const segundo = enviarUmaVez(trava, c.acao);
    expect(c.chamadas()).toBe(1);
    expect(await segundo).toEqual({ executou: false });
    c.concluir();
    expect(await primeiro).toEqual({ executou: true, erro: null });
    expect(c.chamadas()).toBe(1);
  });

  it('sucesso mantém travado (o diálogo fecha); outro envio não roda', async () => {
    const trava: TravaEnvio = { current: false };
    const c = acaoControlada();
    const p = enviarUmaVez(trava, c.acao);
    c.concluir();
    await p;
    expect(trava.current).toBe(true);
    const outro = enviarUmaVez(trava, c.acao);
    expect(c.chamadas()).toBe(1);
    expect(await outro).toEqual({ executou: false });
  });

  it('falha solta a trava e devolve o erro; a nova tentativa roda', async () => {
    const trava: TravaEnvio = { current: false };
    const c = acaoControlada();
    const falha = new Error('409');
    const p = enviarUmaVez(trava, c.acao);
    c.falhar(falha);
    expect(await p).toEqual({ executou: true, erro: falha });
    expect(trava.current).toBe(false);
    void enviarUmaVez(trava, c.acao);
    expect(c.chamadas()).toBe(2);
  });
});

describe('erroParaExibir', () => {
  const montados = new Set(['descricao', 'nota']);

  it('erro de campo montado aponta o campo e não duplica a leitura quando o foco vem de fora', () => {
    expect(erroParaExibir(new ErroDeCampo('descricao', 'Informe a descrição do item.'), null, montados)).toEqual({
      mensagem: 'Informe a descrição do item.',
      campo: 'descricao',
      anunciar: false,
    });
  });

  it('Enter no próprio campo inválido anuncia, porque o foco não se move', () => {
    expect(erroParaExibir(new ErroDeCampo('nota', 'Escreva a nota.'), 'nota', montados)).toMatchObject({
      campo: 'nota',
      anunciar: true,
    });
  });

  it('campo que não está no formulário vira alerta geral, e a mensagem não some', () => {
    expect(erroParaExibir(new ErroDeCampo('codigo', 'Código inválido.'), null, montados)).toEqual({
      mensagem: 'Código inválido.',
      campo: null,
      anunciar: true,
    });
  });

  it('erro comum (409, rede) é alerta geral; erro sem mensagem usa a padrão', () => {
    expect(erroParaExibir(new Error('Já existe.'), 'descricao', montados)).toEqual({
      mensagem: 'Já existe.',
      campo: null,
      anunciar: true,
    });
    expect(erroParaExibir('x', null, montados).mensagem).toBe(MENSAGEM_PADRAO_FALHA);
  });
});

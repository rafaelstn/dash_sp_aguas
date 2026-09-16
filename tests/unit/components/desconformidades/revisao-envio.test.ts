/**
 * "Marcar como revisado" na janela sem identidade: o 403
 * `identificacao_obrigatoria` vira "indisponível", sem convite a repetir, e com
 * a sessão já sabida sem identidade a requisição nem sai. Prova pelo efeito:
 * quantas requisições saíram e o que a pessoa lê.
 */
import { describe, expect, it } from 'vitest';
import {
  MENSAGEM_FALHA_REVISAO,
  MENSAGEM_REVISAO_INDISPONIVEL,
  registrarRevisao,
  type DadosRevisao,
  type EnviarRevisao,
} from '@/components/features/desconformidades/revisao-envio';

const dados: DadosRevisao = { tipoEntidade: 'posto', idEntidade: '1D-008', categoria: 'PREFIXO_PRINCIPAL' };

function servidor(status: number, corpo: unknown) {
  const enviados: DadosRevisao[] = [];
  const enviar: EnviarRevisao = async (d) => {
    enviados.push(d);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => {
        if (corpo instanceof Error) throw corpo;
        return corpo;
      },
    };
  };
  return { enviar, enviados };
}

describe('registrarRevisao', () => {
  it('403 identificacao_obrigatoria diz que não está disponível e não manda tentar de novo', async () => {
    const s = servidor(403, {
      erro: 'identificacao_obrigatoria',
      mensagem: 'Esta operação exige usuário identificado e está indisponível no acesso sem identificação.',
    });
    const r = await registrarRevisao(dados, true, s.enviar);
    expect(r).toEqual({ tipo: 'indisponivel', mensagem: MENSAGEM_REVISAO_INDISPONIVEL });
    expect(s.enviados).toHaveLength(1);
    if (r.tipo === 'registrada') throw new Error('inesperado');
    expect(r.mensagem).toContain('exige usuário identificado');
    expect(r.mensagem).not.toMatch(/tente/i);
  });

  it('sessão já sabida sem identidade: nenhuma requisição sai', async () => {
    const s = servidor(200, { revisao: {} });
    expect(await registrarRevisao(dados, false, s.enviar)).toEqual({
      tipo: 'indisponivel',
      mensagem: MENSAGEM_REVISAO_INDISPONIVEL,
    });
    expect(s.enviados).toHaveLength(0);
  });

  it('outro 403 (papel) continua falha comum', async () => {
    const s = servidor(403, { erro: 'sem_papel' });
    expect(await registrarRevisao(dados, true, s.enviar)).toEqual({ tipo: 'falha', mensagem: MENSAGEM_FALHA_REVISAO });
  });

  it('500, corpo que não é JSON e erro de rede são falha passageira', async () => {
    expect((await registrarRevisao(dados, true, servidor(500, { erro: 'erro_inesperado' }).enviar)).tipo).toBe('falha');
    expect((await registrarRevisao(dados, true, servidor(403, new Error('html')).enviar)).tipo).toBe('falha');
    const rede: EnviarRevisao = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(await registrarRevisao(dados, true, rede)).toEqual({ tipo: 'falha', mensagem: MENSAGEM_FALHA_REVISAO });
  });

  it('200 registra e envia os dados da linha', async () => {
    const s = servidor(200, { revisao: {} });
    expect(await registrarRevisao(dados, true, s.enviar)).toEqual({ tipo: 'registrada' });
    expect(s.enviados).toEqual([dados]);
  });
});

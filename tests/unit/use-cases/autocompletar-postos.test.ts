import { describe, expect, it, vi } from 'vitest';
import {
  autocompletarPostos,
  LIMITE_AUTOCOMPLETE_MAX,
  LIMITE_AUTOCOMPLETE_PADRAO,
} from '@/application/use-cases/autocompletar-postos';
import type {
  PostosRepository,
  PostoSugestao,
} from '@/application/ports/postos-repository';

/**
 * Testes do use-case de autocomplete de postos (lógica pura sobre o port).
 * Cobre normalização do termo e clamp do limite, sem tocar banco.
 */

function repoFake(): {
  repo: PostosRepository;
  chamadas: Array<{ termo: string; limite: number }>;
} {
  const chamadas: Array<{ termo: string; limite: number }> = [];
  const sugestao: PostoSugestao = {
    prefixo: '2D-001',
    nome: 'Estação Teste',
    tipoPosto: 'Fluviométrico',
    prefixoAna: '00000001',
  };
  const repo = {
    autocompletar: vi.fn(async (termo: string, limite: number) => {
      chamadas.push({ termo, limite });
      return [sugestao];
    }),
  } as unknown as PostosRepository;
  return { repo, chamadas };
}

describe('use-case/autocompletarPostos', () => {
  it('retorna vazio sem chamar o repo quando o termo tem menos de 2 caracteres', async () => {
    const { repo, chamadas } = repoFake();
    expect(await autocompletarPostos(repo, { termo: '1' })).toEqual([]);
    expect(await autocompletarPostos(repo, { termo: '  ' })).toEqual([]);
    expect(await autocompletarPostos(repo, {})).toEqual([]);
    expect(chamadas).toHaveLength(0);
  });

  it('faz trim do termo antes de delegar', async () => {
    const { repo, chamadas } = repoFake();
    await autocompletarPostos(repo, { termo: '  2D ' });
    expect(chamadas[0]?.termo).toBe('2D');
  });

  it('usa limite padrão quando ausente', async () => {
    const { repo, chamadas } = repoFake();
    await autocompletarPostos(repo, { termo: '2D' });
    expect(chamadas[0]?.limite).toBe(LIMITE_AUTOCOMPLETE_PADRAO);
  });

  it('faz clamp do limite no teto máximo', async () => {
    const { repo, chamadas } = repoFake();
    await autocompletarPostos(repo, { termo: '2D', limite: 9999 });
    expect(chamadas[0]?.limite).toBe(LIMITE_AUTOCOMPLETE_MAX);
  });

  it('cai no padrão quando o limite é inválido (NaN/0/negativo)', async () => {
    const { repo, chamadas } = repoFake();
    await autocompletarPostos(repo, { termo: '2D', limite: 0 });
    await autocompletarPostos(repo, { termo: '2D', limite: -5 });
    await autocompletarPostos(repo, { termo: '2D', limite: Number.NaN });
    for (const c of chamadas) {
      expect(c.limite).toBe(LIMITE_AUTOCOMPLETE_PADRAO);
    }
  });

  it('repassa o resultado enxuto do repo', async () => {
    const { repo } = repoFake();
    const itens = await autocompletarPostos(repo, { termo: '2D' });
    expect(itens).toEqual([
      {
        prefixo: '2D-001',
        nome: 'Estação Teste',
        tipoPosto: 'Fluviométrico',
        prefixoAna: '00000001',
      },
    ]);
  });
});

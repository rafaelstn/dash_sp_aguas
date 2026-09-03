import { describe, it, expect } from 'vitest';
import {
  ehIndexadorAusente,
  IndexadorIndisponivelError,
  WorkerTimeoutError,
} from '@/infrastructure/indexer/lazy-indexer';

/**
 * Ausência do indexador NO AMBIENTE não pode derrubar a ficha do posto.
 *
 * Defeito medido em produção em 03/09/2026, assim que os postos passaram a
 * existir: abrir a ficha respondia **HTTP 500** com `Error: spawn python
 * ENOENT` no log. A imagem de produção é `node:24-alpine` e não tem Python nem
 * a pasta `ops/` (pendência de escopo, seção 9.3 do runbook). O defeito estava
 * lá desde a subida e não aparecia porque o banco estava vazio: não havia ficha
 * para abrir, então ninguém alcançava aquele caminho.
 *
 * A distinção que estes casos protegem: **ambiente sem o programa** degrada e
 * serve a ficha sem a varredura; **falha real do indexador** continua subindo
 * como erro. Confundir os dois em qualquer direção é defeito: para um lado
 * derruba a ficha inteira, para o outro esconde indexação quebrada.
 */

function erroComCodigo(code: string): Error & { code: string } {
  const e = new Error(`falso ${code}`) as Error & { code: string };
  e.code = code;
  return e;
}

describe('ehIndexadorAusente', () => {
  it('reconhece ENOENT, que é o programa não existir', () => {
    expect(ehIndexadorAusente(erroComCodigo('ENOENT'))).toBe(true);
  });

  it('reconhece EACCES, que é o arquivo existir e não ser executável', () => {
    expect(ehIndexadorAusente(erroComCodigo('EACCES'))).toBe(true);
  });

  /**
   * O ponto do arquivo. Se qualquer erro passasse por ausência de ambiente, uma
   * indexação genuinamente quebrada seria servida como "tudo bem, sem
   * varredura", e ninguém descobriria.
   */
  it.each(['EPIPE', 'ETIMEDOUT', 'ECONNRESET', 'EPERM', 'EAGAIN'])(
    'NÃO trata %s como ausência de ambiente',
    (codigo) => {
      expect(ehIndexadorAusente(erroComCodigo(codigo))).toBe(false);
    },
  );

  it.each([
    ['erro sem código', new Error('estourou')],
    ['timeout do worker', new WorkerTimeoutError('02145005')],
    ['null', null],
    ['undefined', undefined],
    ['texto solto', 'ENOENT'],
  ])('NÃO trata %s como ausência de ambiente', (_rotulo, valor) => {
    expect(ehIndexadorAusente(valor)).toBe(false);
  });
});

describe('IndexadorIndisponivelError', () => {
  const erro = new IndexadorIndisponivelError('02145005', erroComCodigo('ENOENT'));

  it('preserva o prefixo e a causa, para o log dizer o que houve', () => {
    expect(erro.prefixo).toBe('02145005');
    expect((erro.causa as { code: string }).code).toBe('ENOENT');
  });

  it('diz na mensagem que a ficha É servida, e não que ela falhou', () => {
    expect(erro.message).toContain('02145005');
    expect(erro.message.toLowerCase()).toContain('servida');
  });

  /**
   * A rota distingue os dois por `instanceof`. Se um herdasse do outro, o
   * primeiro `if` capturaria os dois e o desvio de timeout comeria o caso de
   * ambiente ausente, devolvendo 202 para sempre em vez de servir a ficha.
   */
  it('é distinguível de WorkerTimeoutError por instanceof', () => {
    expect(erro).toBeInstanceOf(IndexadorIndisponivelError);
    expect(erro).not.toBeInstanceOf(WorkerTimeoutError);
    expect(new WorkerTimeoutError('x')).not.toBeInstanceOf(IndexadorIndisponivelError);
  });
});

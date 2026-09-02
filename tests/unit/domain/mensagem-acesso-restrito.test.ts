import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  mensagemAcessoRestrito,
  tituloAcessoRestrito,
} from '@/domain/auth/mensagem-acesso-restrito';

const SRC = path.resolve(__dirname, '..', '..', '..', 'src');
const FONTE_UNICA = path.join(SRC, 'domain', 'auth', 'mensagem-acesso-restrito.ts');

function arquivosDe(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const alvo = path.join(dir, nome);
    if (statSync(alvo).isDirectory()) arquivosDe(alvo, acc);
    else if (/\.tsx?$/.test(nome)) acc.push(alvo);
  }
  return acc;
}

describe('mensagemAcessoRestrito', () => {
  it('no estado normal, manda solicitar o papel ao gestor', () => {
    expect(mensagemAcessoRestrito(false)).toContain('Solicite ao gestor');
  });

  /**
   * O ponto do arquivo. Durante a janela sem identidade não existe gestor a
   * quem solicitar, porque ninguém se identifica e não há atribuição de papel.
   * Instrução que não pode ser cumprida é pior que a recusa seca: manda a
   * pessoa procurar uma porta que não existe.
   */
  it('na janela sem identidade, NÃO manda solicitar a ninguém', () => {
    const texto = mensagemAcessoRestrito(true);
    expect(texto).not.toContain('gestor');
    expect(texto).not.toContain('Solicite');
  });

  it('na janela, diz por que e o que continua funcionando', () => {
    const texto = mensagemAcessoRestrito(true);
    expect(texto).toContain('sem autenticação');
    expect(texto.toLowerCase()).toContain('consulta');
  });

  it('o título também muda, porque "Acesso restrito" sugere permissão pessoal', () => {
    expect(tituloAcessoRestrito(false)).toBe('Acesso restrito');
    expect(tituloAcessoRestrito(true)).not.toBe('Acesso restrito');
  });
});

describe('guarda: a frase não volta a ser escrita solta', () => {
  /**
   * Varre por MARCA no disco inteiro, e não por lista de telas conhecidas.
   * Já aconteceu quatro vezes neste projeto e nos irmãos: a correção fica no
   * caminho onde alguém olhou, e a quinta superfície continua com o texto
   * velho. A fonte única só serve enquanto ninguém escreve a frase de novo ao
   * lado dela.
   */
  it('só a fonte única contém o texto literal', () => {
    const infratores = arquivosDe(SRC)
      .filter((f) => path.resolve(f) !== path.resolve(FONTE_UNICA))
      .filter((f) => readFileSync(f, 'utf8').includes('Solicite ao gestor'));

    expect(
      infratores.map((f) => path.relative(SRC, f)),
      'Estes arquivos escrevem a mensagem de acesso restrito diretamente. ' +
        'Use mensagemAcessoRestrito() de domain/auth/mensagem-acesso-restrito, ' +
        'senão o texto diverge durante a janela sem identidade e manda o usuário ' +
        'procurar um gestor que não existe.',
    ).toEqual([]);
  });
});

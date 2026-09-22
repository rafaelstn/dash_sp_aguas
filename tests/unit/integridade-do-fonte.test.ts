/**
 * Nenhum arquivo de código do repositório carrega caractere de controle
 * invisível.
 *
 * POR QUE ISTO É GUARDA, E NÃO ZELO. Em 22/09/2026 um `U+0008` (backspace)
 * entrou no comentário de `TABELAS_COM_EXCLUIDO`, em
 * `src/infrastructure/db/mssql-client.ts`: quem escreveu queria citar a
 * fronteira `\b` de uma expressão regular e acabou gravando o caractere de
 * verdade. Ele atravessou `lint`, `typecheck`, 1.347 testes e o `build`, todos
 * verdes, porque nenhuma dessas etapas olha o BYTE: para o compilador aquilo é
 * comentário, e comentário não tem sintaxe. Foi encontrado por acaso, numa
 * varredura feita por outro motivo, já com o commit pronto.
 *
 * O estrago de um invisível é caro justamente por ser invisível: ele viaja em
 * cópia e recorte, quebra `grep` e `diff` de quem vier depois, e num literal de
 * string (e não num comentário, como desta vez) mudaria silenciosamente o SQL,
 * o texto de tela ou o nome de uma coluna.
 *
 * A régua lê o DISCO e não o índice do git, de propósito: arquivo recém-criado
 * e ainda não commitado é exatamente o caso em que o defeito nasce, e uma
 * guarda que só enxergasse `git ls-files` ficaria cega justamente ali.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const RAIZ = path.resolve(__dirname, '..', '..');

/** Onde mora código e documentação escritos por gente deste projeto. */
const PASTAS = ['src', 'tests', 'scripts', 'docs', 'db'] as const;

const EXTENSOES = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.sql', '.css'];

/**
 * Gerado por ferramenta, não por gente: o que houver dentro não se conserta
 * editando, e varrer isso só produziria reprovação que ninguém pode resolver.
 */
const IGNORADAS = new Set(['node_modules', '.next', '.git', 'coverage', 'dist']);

/**
 * `\n`, `\t` e `\r` são estrutura de texto e passam. Todo o resto da faixa C0,
 * mais o `DEL` e os separadores e marcas de largura zero do Unicode, não tem o
 * que fazer em fonte deste repositório.
 *
 * O `U+FEFF` entra na lista porque BOM no meio do arquivo é o mesmo problema; o
 * BOM inicial também não é bem-vindo aqui, e a CI do projeto grava UTF-8 sem
 * ele.
 */
function eInvisivelProibido(codigo: number): boolean {
  if (codigo === 0x0a || codigo === 0x09 || codigo === 0x0d) return false;
  if (codigo < 0x20 || codigo === 0x7f) return true;
  // Marcas de direção e junções de largura zero, que se escondem em identificador.
  if (codigo >= 0x200b && codigo <= 0x200f) return true;
  if (codigo >= 0x202a && codigo <= 0x202e) return true;
  if (codigo >= 0x2066 && codigo <= 0x2069) return true;
  return codigo === 0xfeff;
}

function arquivosDe(pasta: string): string[] {
  const absoluta = path.join(RAIZ, pasta);
  let entradas: string[];
  try {
    entradas = readdirSync(absoluta);
  } catch {
    return [];
  }

  const achados: string[] = [];
  for (const entrada of entradas) {
    if (IGNORADAS.has(entrada)) continue;
    const caminho = path.join(absoluta, entrada);
    const relativo = path.join(pasta, entrada);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosDe(relativo));
    } else if (EXTENSOES.includes(path.extname(entrada))) {
      achados.push(relativo);
    }
  }
  return achados;
}

interface Ocorrencia {
  arquivo: string;
  linha: number;
  coluna: number;
  ponto: string;
  contexto: string;
}

function invisiveisDe(relativo: string): Ocorrencia[] {
  const conteudo = readFileSync(path.join(RAIZ, relativo), 'utf8');
  const achados: Ocorrencia[] = [];
  let linha = 1;
  let coluna = 1;
  for (const caractere of conteudo) {
    const codigo = caractere.codePointAt(0)!;
    if (eInvisivelProibido(codigo)) {
      achados.push({
        arquivo: relativo,
        linha,
        coluna,
        ponto: `U+${codigo.toString(16).toUpperCase().padStart(4, '0')}`,
        contexto: conteudo.split('\n')[linha - 1]?.replace(caractere, '<aqui>').slice(0, 90) ?? '',
      });
    }
    if (caractere === '\n') {
      linha += 1;
      coluna = 1;
    } else {
      coluna += 1;
    }
  }
  return achados;
}

describe('integridade do fonte', () => {
  const arquivos = PASTAS.flatMap(arquivosDe);

  it('varre um número plausível de arquivos, e não uma lista vazia', () => {
    // Piso contra o pior modo de falha de uma régua de varredura: aprovar tudo
    // porque não leu nada. Se a estrutura de pastas mudar a ponto de derrubar
    // este número, é para o caso reprovar e alguém decidir, não para ele calar.
    expect(arquivos.length).toBeGreaterThan(200);
  });

  it('nenhum arquivo de código carrega caractere de controle ou invisível', () => {
    const achados = arquivos.flatMap(invisiveisDe);
    const legivel = achados.map(
      (o) => `${o.arquivo}:${o.linha}:${o.coluna} ${o.ponto} | ${o.contexto}`,
    );
    expect(legivel).toEqual([]);
  });

  it('reprova de verdade: um invisível plantado é encontrado', () => {
    // A régua nova é suspeita até reprovar o defeito que ela existe para pegar.
    // O caso exercita `invisiveisDe` pelo mesmo caminho, sobre este arquivo de
    // teste acrescido do backspace que motivou a guarda.
    const comDefeito = 'const a = 1;\n// fronteira \u0008 do nome\n';
    const codigos = [...comDefeito].map((c) => c.codePointAt(0)!);
    expect(codigos.some(eInvisivelProibido)).toBe(true);
    expect([...'texto são normal\n\t\r'].map((c) => c.codePointAt(0)!).some(eInvisivelProibido)).toBe(
      false,
    );
  });
});

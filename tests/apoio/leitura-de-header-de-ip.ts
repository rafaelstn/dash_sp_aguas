/**
 * Quem lê header de IP direto da requisição, medido por AST.
 *
 * POR QUE ESTA RÉGUA EXISTE
 * -------------------------
 * Em 06/10/2026 o André achou duas rotas montando o IP da trilha a partir do
 * PRIMEIRO elemento de `x-forwarded-for`. Ao varrer o resto, o inventário real
 * era de SEIS lugares: `GET /api/postos/[prefixo]`,
 * `GET /api/postos/[prefixo]/arquivos`, `POST /api/desconformidades/revisoes` e
 * três Server Components (ficha do posto, impressão de ficha e detalhe mobile).
 * O primeiro elemento da cadeia é justamente o que o cliente controla: quem
 * chamasse escolhia o IP que a trilha do órgão ia registrar, sem deixar rastro.
 *
 * Seis cópias do mesmo defeito não são seis descuidos, são guarda faltando. O
 * resolvedor confiável mora em `src/infrastructure/security/rate-limit.ts`
 * (`extrairIp`, `extrairIpDeHeaders` e os pares `*OuNulo`, que devolvem `null`
 * onde a trilha espera ausência); esta régua reprova quem voltar a ler o header
 * por fora dele.
 *
 * O QUE ELA MEDE
 * --------------
 * Chamada `<alvo>.get('<header de IP>')` com o nome do header em literal de
 * string ou em template literal sem interpolação. Vale para qualquer receptor
 * (`request.headers`, `h`, `req.raw.headers`), porque o que importa é o header
 * lido, não por onde ele chegou.
 *
 * O QUE ELA NÃO MEDE, de propósito:
 *
 * - `get` com expressão dinâmica (`h.get(nome)`): varredura de headers em laço
 *   é legítima e o nome só se conhece em execução. Quem quiser fugir da régua
 *   consegue por aí; a régua fecha o caminho DESCUIDADO, que é o que produziu
 *   as seis cópias, não um atacante interno.
 * - se o resolvedor é usado CORRETAMENTE onde é permitido (isso é das réguas de
 *   rota) nem se o IP resultante vai para a trilha certa.
 *
 * Citação em comentário ou em string solta não é nó de chamada e não chega
 * aqui: é por isso que o medidor é AST e não busca textual. O docblock desta
 * própria régua cita os três headers e não se reprova.
 */
import ts from 'typescript';

export interface ArquivoVarrido {
  /** Caminho relativo à raiz, com barra normal. */
  caminho: string;
  conteudo: string;
}

export interface LeituraDeHeaderDeIp {
  caminho: string;
  /** O header lido, em minúsculas. */
  header: string;
  /** Linha base 1. */
  linha: number;
}

/**
 * Os headers que carregam IP de cliente. `x-vercel-forwarded-for` e `x-real-ip`
 * entram junto do forjável de propósito: a decisão de EM QUEM confiar é uma só
 * e mora no resolvedor, senão a próxima cópia nasce confiando no header errado
 * em vez do elemento errado.
 */
const HEADERS_DE_IP = new Set([
  'x-forwarded-for',
  'x-vercel-forwarded-for',
  'x-real-ip',
  'cf-connecting-ip',
  'true-client-ip',
  'x-client-ip',
]);

function linhaDe(no: ts.Node, fonte: ts.SourceFile): number {
  return fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
}

/** Nome do header se o argumento for literal estático; `null` se dinâmico. */
function headerLiteral(argumento: ts.Node | undefined): string | null {
  if (!argumento) return null;
  if (ts.isStringLiteral(argumento)) return argumento.text.trim().toLowerCase();
  if (ts.isNoSubstitutionTemplateLiteral(argumento)) {
    return argumento.text.trim().toLowerCase();
  }
  return null;
}

/** Todas as leituras de header de IP deste arquivo. */
export function leiturasDeHeaderDeIp(arquivo: ArquivoVarrido): LeituraDeHeaderDeIp[] {
  const fonte = ts.createSourceFile(
    arquivo.caminho,
    arquivo.conteudo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.caminho.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const achados: LeituraDeHeaderDeIp[] = [];

  const visitar = (no: ts.Node): void => {
    if (ts.isCallExpression(no)) {
      const alvo = no.expression;
      const metodo = ts.isPropertyAccessExpression(alvo)
        ? alvo.name.text
        : ts.isElementAccessExpression(alvo) &&
            alvo.argumentExpression &&
            ts.isStringLiteral(alvo.argumentExpression)
          ? alvo.argumentExpression.text
          : null;
      if (metodo === 'get') {
        const header = headerLiteral(no.arguments[0]);
        if (header && HEADERS_DE_IP.has(header)) {
          achados.push({ caminho: arquivo.caminho, header, linha: linhaDe(no, fonte) });
        }
      }
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);

  return achados;
}

/** Leituras em arquivos fora da lista de permissão. */
export function leiturasForaDoResolvedor(
  lista: readonly ArquivoVarrido[],
  permitidos: readonly RegExp[],
): LeituraDeHeaderDeIp[] {
  return lista
    .filter(({ caminho }) => !permitidos.some((p) => p.test(caminho)))
    .flatMap((arquivo) => leiturasDeHeaderDeIp(arquivo));
}

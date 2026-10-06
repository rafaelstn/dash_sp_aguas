/**
 * Acha handler de rota que entrega IDENTIFICAÇÃO DE PESSOA atrás de guarda fraca.
 *
 * POR QUE ESTE APARELHO EXISTE
 * ----------------------------
 * Em 06/10/2026 a mesma projeção de `auth.users` (nome e e-mail do operador) e a
 * mesma trilha de estoque (que desde a migration 0075 carrega a matrícula de
 * quem retirou material) estavam alcançáveis por QUATRO rotas diferentes. Três
 * foram fechadas uma a uma, e cada fechamento revelou a seguinte, porque ninguém
 * tinha a lista dos consumidores da projeção. Nada no projeto reprovava a
 * quinta. Este arquivo é essa lista, derivada do código a cada execução.
 *
 * POR QUE AST, E NÃO EXTRAÇÃO TEXTUAL
 * -----------------------------------
 * Medido no próprio caso: `conferencias/[id]/itens/route.ts` e
 * `unidades/[id]/route.ts` importam `exigirUsuario` E `exigirGestorEstoque` no
 * MESMO arquivo, porque a leitura e a escrita convivem ali. Régua textual por
 * arquivo tem dois resultados possíveis, e os dois estão errados: se exigir a
 * presença da guarda forte, aprova o GET aberto porque o POST a importa; se
 * proibir a guarda fraca, reprova a rota legítima. A decisão é por HANDLER
 * exportado, o que exige saber em qual corpo de função cada chamada está, e
 * exige POSIÇÃO no fonte para julgar o padrão de recusa antecipada
 * (`if (!(await podeGerenciarEstoque(...))) return ...` ANTES da projeção).
 * Fora isso, substring tem porta dos fundos conhecida: import com alias, import
 * de namespace, reexport e acesso computado.
 *
 * O QUE ELE NÃO MEDE
 * ------------------
 * Não resolve tipos nem segue chamada entre arquivos (não é type-checker). Por
 * isso, uso de símbolo sensível FORA de um handler (em helper do próprio
 * arquivo, ou no topo do módulo) não é aprovado "na dúvida": é reprovado como
 * `indecidivel`, porque é exatamente aí que a projeção se esconderia de uma
 * análise por posição. Também não julga a guarda da janela sem identidade: na
 * janela do ADR-0024 o usuário institucional é gestor, e isso é alcance da
 * guarda, não da régua.
 */
import ts from 'typescript';

/**
 * Símbolos cujo alcance é identificação de pessoa. A chave é o nome ORIGINAL
 * exportado (o alias local não muda nada, e é por isso que a resolução passa
 * pelo mapa de imports).
 */
export const SIMBOLOS_SENSIVEIS: Readonly<Record<string, string>> = {
  resolverOperadores: 'resolve id -> nome/e-mail do operador em auth.users',
  mapaOperadores: 'mesma regra de rótulo, em lote (domínio puro)',
  rotuloOperador: 'nome/e-mail de uma pessoa a partir do id',
  usuariosIdentidadeRepository: 'SELECT de nome e e-mail em auth.users',
  usuariosAdminRepository: 'lista nome, e-mail e papel de todo mundo',
  estoqueMovimentacoesRepository:
    'trilha de estoque: operador e solicitante_matricula (migration 0075)',
  exportarEstoque: 'planilha com a coluna Operador e a coluna Solicitante',
};

/**
 * Para binding de REPOSITÓRIO, quais métodos entregam identificação. Medido nos
 * ports em 06/10/2026, e o motivo de existir esta precisão é concreto: sem ela a
 * régua reprovava `usuariosAdminRepository.contarSuperAdmins()`, que devolve um
 * número, e régua que reprova o legítimo manda piorar o código.
 *
 * Fail-closed onde a posição não decide: a referência só é dispensada quando é o
 * OBJETO de um acesso a método que não está na lista. Repositório passado como
 * ARGUMENTO (é assim que `exportarEstoque` e `registrarMovimentacao` o recebem),
 * guardado em variável ou acessado por índice continua sensível, porque daí em
 * diante este aparelho não segue mais o dado.
 *
 * Símbolo sem lista aqui é sensível em qualquer uso.
 */
export const METODOS_SENSIVEIS: Readonly<Record<string, readonly string[]>> = {
  usuariosAdminRepository: ['listar'],
  estoqueMovimentacoesRepository: ['listar', 'listarParaExport'],
};

/**
 * Guardas que já decidem autorização suficiente para a projeção. `exigirUsuario`
 * NÃO está aqui de propósito, e `exigirIdentidadeVerificada` também não: ela
 * exige pessoa identificada, o que não é o mesmo que pessoa autorizada.
 */
export const GUARDAS_FORTES: ReadonlySet<string> = new Set([
  'exigirGestorEstoque',
  'exigirAdmin',
  'exigirSuperAdmin',
  'exigirAprovador',
]);

/**
 * Predicados que servem como recusa antecipada DENTRO do handler, para o caso
 * legítimo em que a rota fica aberta e só a parte identificável sai (contrato de
 * `GET /api/estoque/unidades/[id]` e de `GET /api/estoque/conferencias/[id]/itens`).
 * Valem só se a chamada vier ANTES do primeiro uso sensível.
 */
export const PREDICADOS_FORTES: ReadonlySet<string> = new Set([
  'podeGerenciarEstoque',
  'ehAdmin',
  'ehSuperAdmin',
]);

/** Nomes de handler que o App Router exporta. */
export const HANDLERS_HTTP: ReadonlySet<string> = new Set([
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
]);

export type MotivoAchado =
  /** O handler alcança a projeção e nenhuma guarda forte o precede. */
  | 'sem_guarda_forte'
  /** A guarda existe, mas depois do uso: o dado já foi lido. */
  | 'guarda_depois_do_uso'
  /** A posição não decide (uso fora de handler, acesso computado, reexport). */
  | 'indecidivel';

export interface AchadoProjecao {
  arquivo: string;
  handler: string;
  /** Nome original do símbolo sensível alcançado. */
  simbolo: string;
  /** Linha base 1 do uso, para a mensagem da falha. */
  linha: number;
  motivo: MotivoAchado;
  /** Guarda encontrada no handler, quando havia alguma. */
  guardaEncontrada: string | null;
}

export interface ArquivoDeRota {
  /** Caminho relativo à raiz, como o git o lista. */
  caminho: string;
  codigo: string;
}

interface Ligacao {
  tipo: 'nomeado' | 'namespace' | 'default';
  /** Nome exportado na origem (para `nomeado`). */
  original?: string;
}

function linhaDe(no: ts.Node, fonte: ts.SourceFile): number {
  return fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line + 1;
}

/** Mapa nome local -> o que ele é, lido das declarações de import do arquivo. */
function ligacoesDe(fonte: ts.SourceFile): Map<string, Ligacao> {
  const mapa = new Map<string, Ligacao>();
  for (const stmt of fonte.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause) continue;
    const clausula = stmt.importClause;
    if (clausula.name) mapa.set(clausula.name.text, { tipo: 'default' });
    const b = clausula.namedBindings;
    if (!b) continue;
    if (ts.isNamespaceImport(b)) {
      mapa.set(b.name.text, { tipo: 'namespace' });
      continue;
    }
    for (const el of b.elements) {
      mapa.set(el.name.text, {
        tipo: 'nomeado',
        original: (el.propertyName ?? el.name).text,
      });
    }
  }
  return mapa;
}

/** `export { resolverOperadores } from '...'` dentro de arquivo de rota. */
function reexportaSensivel(fonte: ts.SourceFile): string | null {
  for (const stmt of fonte.statements) {
    if (!ts.isExportDeclaration(stmt) || !stmt.exportClause) continue;
    if (!ts.isNamedExports(stmt.exportClause)) continue;
    for (const el of stmt.exportClause.elements) {
      const nome = (el.propertyName ?? el.name).text;
      if (nome in SIMBOLOS_SENSIVEIS) return nome;
    }
  }
  return null;
}

/** O handler exportado a que este nó pertence, ou null se estiver fora de um. */
function handlerDe(no: ts.Node, fonte: ts.SourceFile): string | null {
  for (let atual: ts.Node | undefined = no; atual; atual = atual.parent) {
    if (atual === fonte) return null;
    if (ts.isFunctionDeclaration(atual) && atual.name && temExport(atual)) {
      return HANDLERS_HTTP.has(atual.name.text) ? atual.name.text : null;
    }
    if (ts.isVariableDeclaration(atual) && ts.isIdentifier(atual.name)) {
      const decl = atual.parent;
      const stmt = decl.parent;
      if (ts.isVariableStatement(stmt) && temExport(stmt)) {
        return HANDLERS_HTTP.has(atual.name.text) ? atual.name.text : null;
      }
    }
  }
  return null;
}

function temExport(no: ts.Node): boolean {
  const mods = ts.canHaveModifiers(no) ? ts.getModifiers(no) : undefined;
  return (mods ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** Nome do símbolo sensível alcançado por este nó, ou null. */
function sensivelEm(no: ts.Node, ligacoes: Map<string, Ligacao>): string | null {
  // `uc.resolverOperadores(...)` com `import * as uc`.
  if (ts.isPropertyAccessExpression(no) && ts.isIdentifier(no.expression)) {
    const lig = ligacoes.get(no.expression.text);
    if (lig?.tipo === 'namespace' && no.name.text in SIMBOLOS_SENSIVEIS) {
      return no.name.text;
    }
    return null;
  }
  if (!ts.isIdentifier(no)) return null;
  // Nome em posição de propriedade (`obj.resolverOperadores`) já foi tratado
  // acima; aqui ele não deve contar duas vezes nem contar por acidente.
  const pai = no.parent;
  if (ts.isPropertyAccessExpression(pai) && pai.name === no) return null;
  if (ts.isImportSpecifier(pai) || ts.isExportSpecifier(pai)) return null;
  if (ts.isPropertyAssignment(pai) && pai.name === no) return null;
  const lig = ligacoes.get(no.text);
  if (!lig) return null;
  if (lig.tipo !== 'nomeado' || !lig.original) return null;
  const original = lig.original;
  if (!(original in SIMBOLOS_SENSIVEIS)) return null;
  // Acesso a método fora da lista do repositório: não alcança identificação.
  const metodos = METODOS_SENSIVEIS[original];
  if (
    metodos &&
    ts.isPropertyAccessExpression(pai) &&
    pai.expression === no &&
    !metodos.includes(pai.name.text)
  ) {
    return null;
  }
  return original;
}

/** Acesso computado sobre namespace sensível: `uc['resolverOperadores']`. */
function acessoComputadoSuspeito(no: ts.Node, ligacoes: Map<string, Ligacao>): boolean {
  if (!ts.isElementAccessExpression(no) || !ts.isIdentifier(no.expression)) return false;
  const lig = ligacoes.get(no.expression.text);
  if (!lig) return false;
  if (lig.tipo === 'namespace') return true;
  return lig.tipo === 'nomeado' && !!lig.original && lig.original in SIMBOLOS_SENSIVEIS;
}

/** Nome da guarda chamada neste nó, ou null. */
function guardaEm(no: ts.Node, ligacoes: Map<string, Ligacao>): string | null {
  if (!ts.isCallExpression(no)) return null;
  const alvo = no.expression;
  const nome = ts.isIdentifier(alvo)
    ? alvo.text
    : ts.isPropertyAccessExpression(alvo)
      ? alvo.name.text
      : null;
  if (!nome) return null;
  const lig = ligacoes.get(nome);
  const original = lig?.tipo === 'nomeado' ? (lig.original ?? nome) : nome;
  if (GUARDAS_FORTES.has(original) || PREDICADOS_FORTES.has(original)) return original;
  return null;
}

interface Ocorrencia {
  pos: number;
  linha: number;
  nome: string;
}

/**
 * Analisa UM arquivo de rota e devolve os achados. Pura: recebe o código, não
 * toca disco, para poder ser exercitada com caso sintético.
 */
export function analisarRota(arquivo: ArquivoDeRota): AchadoProjecao[] {
  const fonte = ts.createSourceFile(
    arquivo.caminho,
    arquivo.codigo,
    ts.ScriptTarget.Latest,
    true,
    arquivo.caminho.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const ligacoes = ligacoesDe(fonte);
  const achados: AchadoProjecao[] = [];

  const reexport = reexportaSensivel(fonte);
  if (reexport) {
    achados.push({
      arquivo: arquivo.caminho,
      handler: '(módulo)',
      simbolo: reexport,
      linha: 1,
      motivo: 'indecidivel',
      guardaEncontrada: null,
    });
  }

  const usos = new Map<string, Ocorrencia[]>();
  const guardas = new Map<string, Ocorrencia[]>();
  const empurrar = (mapa: Map<string, Ocorrencia[]>, chave: string, oc: Ocorrencia) => {
    const lista = mapa.get(chave) ?? [];
    lista.push(oc);
    mapa.set(chave, lista);
  };

  const visitar = (no: ts.Node): void => {
    const guarda = guardaEm(no, ligacoes);
    if (guarda) {
      const h = handlerDe(no, fonte);
      if (h) {
        empurrar(guardas, h, { pos: no.getStart(fonte), linha: linhaDe(no, fonte), nome: guarda });
      }
    }
    const sensivel = sensivelEm(no, ligacoes);
    if (sensivel) {
      const h = handlerDe(no, fonte);
      const oc = { pos: no.getStart(fonte), linha: linhaDe(no, fonte), nome: sensivel };
      if (h) empurrar(usos, h, oc);
      else {
        // Fora de handler a posição não decide nada: fail-closed.
        achados.push({
          arquivo: arquivo.caminho,
          handler: '(fora de handler)',
          simbolo: sensivel,
          linha: oc.linha,
          motivo: 'indecidivel',
          guardaEncontrada: null,
        });
      }
    }
    if (acessoComputadoSuspeito(no, ligacoes)) {
      achados.push({
        arquivo: arquivo.caminho,
        handler: handlerDe(no, fonte) ?? '(fora de handler)',
        simbolo: '(acesso computado)',
        linha: linhaDe(no, fonte),
        motivo: 'indecidivel',
        guardaEncontrada: null,
      });
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);

  for (const [handler, ocorrencias] of usos) {
    const primeiro = ocorrencias.reduce((a, b) => (a.pos <= b.pos ? a: b));
    const doHandler = guardas.get(handler) ?? [];
    const antes = doHandler.filter((g) => g.pos < primeiro.pos);
    if (antes.length > 0) continue;
    achados.push({
      arquivo: arquivo.caminho,
      handler,
      simbolo: primeiro.nome,
      linha: primeiro.linha,
      motivo: doHandler.length > 0 ? 'guarda_depois_do_uso' : 'sem_guarda_forte',
      guardaEncontrada: doHandler[0]?.nome ?? null,
    });
  }

  return achados;
}

/** Quantos handlers de um arquivo alcançam a projeção (âncora de presença). */
export function handlersComProjecao(arquivo: ArquivoDeRota): string[] {
  const fonte = ts.createSourceFile(
    arquivo.caminho,
    arquivo.codigo,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const ligacoes = ligacoesDe(fonte);
  const achados = new Set<string>();
  const visitar = (no: ts.Node): void => {
    if (sensivelEm(no, ligacoes)) {
      const h = handlerDe(no, fonte);
      if (h) achados.add(h);
    }
    ts.forEachChild(no, visitar);
  };
  visitar(fonte);
  return [...achados];
}

/** Exceção declarada: rota que fica aberta por decisão escrita. */
export interface ExcecaoDeclarada {
  /** `caminho/do/route.ts::HANDLER`, para a exceção não valer para o arquivo todo. */
  escopo: string;
  motivo: string;
  /** Documento onde a decisão está escrita, relativo à raiz. */
  doc: string;
}

/** Problemas da PRÓPRIA lista de exceções (a exceção carrega o escopo). */
export function problemasDasExcecoes(
  excecoes: readonly ExcecaoDeclarada[],
  docExiste: (caminho: string) => boolean,
  docCita: (caminho: string, rota: string) => boolean,
): string[] {
  const problemas: string[] = [];
  for (const e of excecoes) {
    const [arquivo, handler] = e.escopo.split('::');
    if (!arquivo || !handler) {
      problemas.push(`escopo sem handler: ${e.escopo}`);
      continue;
    }
    if (!HANDLERS_HTTP.has(handler)) problemas.push(`handler desconhecido: ${e.escopo}`);
    if (e.motivo.trim().length < 40) problemas.push(`motivo curto demais: ${e.escopo}`);
    if (!e.doc.trim()) problemas.push(`sem doc: ${e.escopo}`);
    else if (!docExiste(e.doc)) problemas.push(`doc inexistente: ${e.doc}`);
    else if (!docCita(e.doc, arquivo)) problemas.push(`doc nao cita a rota: ${e.doc}`);
  }
  return problemas;
}

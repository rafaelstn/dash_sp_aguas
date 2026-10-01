#!/usr/bin/env node
/**
 * Régua de efeito: todo `<script>` do HTML servido traz o nonce da CSP daquela
 * resposta.
 *
 * Por que ela existe. A CSP desta aplicação é montada por requisição no
 * `src/middleware.ts` com `script-src 'self' 'nonce-<N>' 'strict-dynamic'`, e o
 * `'strict-dynamic'` DESABILITA o `'self'`. Logo, um `<script>` sem nonce é
 * bloqueado pelo navegador, e a página responde HTTP 200 sem executar uma linha
 * de JavaScript. Foi o que aconteceu em 30/09/2026 em
 * `dmo.spaguas.sp.gov.br`: `/` mostrava só o título e `/app` ficava preso em
 * "Carregando…", ambas com 200 e healthcheck verde. Status, tempo de resposta e
 * certificado válido são propriedades vizinhas: nenhuma delas mede renderização.
 *
 * Duas origens conhecidas para o nonce faltar, e a régua não distingue as duas
 * porque mede o efeito e não a causa:
 *   1. a rota foi prerenderizada em build (o HTML em cache não tem nonce);
 *   2. o `<script>` foi escrito à mão no código (o Next só injeta nonce nos
 *      scripts que ele mesmo gera).
 *
 * O que ela NÃO cobre: `style-src`, `connect-src` e as demais diretivas; se o
 * nonce do HTML é o MESMO da CSP daquela resposta quando ambos existem (ela
 * confere presença, e a conferência de igualdade está abaixo, em `nonceCasa`);
 * se o navegador de fato executou o script; e rota dinâmica com parâmetro, que
 * ela não sabe preencher.
 *
 * Uso:
 *   node scripts/verificar-csp-nonce.mjs [url-base] [rota-extra ...]
 *
 * A url-base também sai de `CSP_URL_BASE`. Sem nenhuma das duas, a régua NÃO
 * mede e sai 2, porque régua cega não tem veredito.
 *
 * Saídas:
 *   0  todas as rotas medidas servem todo script com nonce
 *   1  alguma rota serve script sem nonce (nomeada, com a contagem)
 *   2  não foi possível medir (sem url-base, rede fora, piso do autoteste
 *      falhou, nenhuma rota descoberta)
 */

import { readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAIZ_APP = resolve(import.meta.dirname, '..', 'src', 'app');

/** Conta as tags `<script ...>` de abertura e quantas delas têm `nonce=`. */
export function contarScripts(html) {
  const abrindo = html.match(/<script(?=[\s>])[^>]*>/gi) ?? [];
  const comNonce = abrindo.filter((tag) => /\snonce\s*=\s*["'][^"']+["']/i.test(tag));
  return { total: abrindo.length, comNonce: comNonce.length };
}

/** Extrai o nonce declarado na diretiva `script-src` do cabeçalho da CSP. */
export function nonceDaCsp(csp) {
  const m = /script-src[^;]*'nonce-([^']+)'/i.exec(csp ?? '');
  return m ? m[1] : null;
}

/**
 * Diz se o nonce do cabeçalho aparece em todas as tags que têm nonce. Nonce que
 * existe mas é de outra resposta é bloqueado igual, então presença sozinha não
 * encerra a pergunta.
 */
export function nonceCasa(html, csp) {
  const esperado = nonceDaCsp(csp);
  if (!esperado) return { aplicavel: false, divergentes: 0 };
  const encontrados = [...html.matchAll(/<script(?=[\s>])[^>]*\snonce\s*=\s*["']([^"']+)["'][^>]*>/gi)];
  const divergentes = encontrados.filter(([, valor]) => valor !== esperado).length;
  return { aplicavel: true, divergentes };
}

/**
 * Descobre as rotas servíveis varrendo `src/app` em busca de `page.tsx`, em vez
 * de manter lista à mão, que envelhece calada quando alguém acrescenta tela.
 * Segmento entre parênteses é grupo de rota e sai do caminho; rota com `[param]`
 * sai da lista porque a régua não sabe preencher o parâmetro, e é contada como
 * não medida na saída.
 */
export function descobrirRotas(raiz = RAIZ_APP) {
  const serviveis = [];
  const comParametro = [];

  const andar = (dir, partes) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, entrada.name);
      if (entrada.isDirectory()) {
        if (entrada.name.startsWith('_') || entrada.name === 'api') continue;
        const ehGrupo = entrada.name.startsWith('(') && entrada.name.endsWith(')');
        andar(caminho, ehGrupo ? partes : [...partes, entrada.name]);
      } else if (entrada.name === 'page.tsx' || entrada.name === 'page.ts') {
        const rota = '/' + partes.join('/');
        (partes.some((p) => p.includes('[')) ? comParametro : serviveis).push(
          rota === '/' ? '/' : rota,
        );
      }
    }
  };

  andar(raiz, []);
  return {
    serviveis: [...new Set(serviveis)].sort(),
    comParametro: [...new Set(comParametro)].sort(),
  };
}

/**
 * Piso: antes de julgar qualquer página, a régua se prova contra um HTML que
 * DEVE reprovar e outro que DEVE aprovar. Régua que não reprova o defeito que
 * ela existe para pegar é instrumento quebrado, e sem este piso ela aprovaria
 * tudo em silêncio se o casamento da expressão regular quebrasse.
 */
function pisoDoAutoteste() {
  const falhas = [];

  const deveReprovar = '<html><script src="/a.js"></script><script nonce="abc">1</script></html>';
  const r1 = contarScripts(deveReprovar);
  if (!(r1.total === 2 && r1.comNonce === 1)) {
    falhas.push(`caso que deve reprovar contou total=${r1.total} comNonce=${r1.comNonce}, esperado 2 e 1`);
  }

  const deveAprovar = '<html><script nonce="abc" src="/a.js"></script><script nonce=\'abc\'>1</script></html>';
  const r2 = contarScripts(deveAprovar);
  if (!(r2.total === 2 && r2.comNonce === 2)) {
    falhas.push(`caso que deve aprovar contou total=${r2.total} comNonce=${r2.comNonce}, esperado 2 e 2`);
  }

  // `<scriptlet>` não é `<script>`: sem a fronteira, a contagem infla.
  const semScript = '<html><scriptlet></scriptlet><p>nada</p></html>';
  if (contarScripts(semScript).total !== 0) {
    falhas.push('tag que apenas começa com "script" foi contada como script');
  }

  if (nonceDaCsp("script-src 'self' 'nonce-XYZ123==' 'strict-dynamic'") !== 'XYZ123==') {
    falhas.push('não extraiu o nonce da diretiva script-src');
  }
  if (nonceDaCsp("default-src 'self'") !== null) {
    falhas.push('inventou nonce em CSP que não tem nonce');
  }

  const divergente = nonceCasa('<script nonce="OUTRO">1</script>', "script-src 'nonce-ESPERADO'");
  if (!(divergente.aplicavel && divergente.divergentes === 1)) {
    falhas.push('não acusou nonce de outra resposta');
  }

  return falhas;
}

async function medirRota(base, rota) {
  const alvo = new URL(rota, base).toString();
  const resposta = await fetch(alvo, { redirect: 'manual' });
  const csp = resposta.headers.get('content-security-policy');
  const status = resposta.status;

  if (status >= 300 && status < 400) {
    return { rota, status, veredito: 'redireciona', total: 0, comNonce: 0 };
  }
  if (status >= 400) {
    return { rota, status, veredito: 'erro', total: 0, comNonce: 0 };
  }

  const html = await resposta.text();
  const { total, comNonce } = contarScripts(html);
  const { aplicavel, divergentes } = nonceCasa(html, csp);

  let veredito = 'ok';
  if (!csp) veredito = 'sem csp';
  else if (total === 0) veredito = 'sem script';
  else if (comNonce === 0) veredito = 'todos sem nonce';
  else if (comNonce < total) veredito = 'parcial';
  else if (aplicavel && divergentes > 0) veredito = 'nonce de outra resposta';

  return { rota, status, veredito, total, comNonce, divergentes: aplicavel ? divergentes : 0 };
}

async function principal() {
  const falhasDoPiso = pisoDoAutoteste();
  if (falhasDoPiso.length > 0) {
    console.error('NAO MEDIDO: o piso do autoteste da régua falhou, então ela não tem veredito.');
    for (const f of falhasDoPiso) console.error(`  - ${f}`);
    process.exit(2);
  }

  const [baseArg, ...rotasExtra] = process.argv.slice(2);
  const base = baseArg ?? process.env.CSP_URL_BASE;
  if (!base) {
    console.error('NAO MEDIDO: informe a url-base como argumento ou em CSP_URL_BASE.');
    console.error('  exemplo: node scripts/verificar-csp-nonce.mjs https://dmo.spaguas.sp.gov.br');
    process.exit(2);
  }

  const { serviveis, comParametro } = descobrirRotas();
  const rotas = [...new Set([...serviveis, ...rotasExtra])].sort();
  if (rotas.length === 0) {
    console.error(`NAO MEDIDO: nenhuma rota descoberta em ${RAIZ_APP}.`);
    process.exit(2);
  }

  console.log(`Régua de nonce da CSP contra ${base}`);
  console.log(`${rotas.length} rotas a medir, descobertas em src/app. Piso do autoteste: 6 casos, passou.`);
  console.log('');

  const resultados = [];
  for (const rota of rotas) {
    try {
      resultados.push(await medirRota(base, rota));
    } catch (erro) {
      console.error(`NAO MEDIDO: ${rota} não respondeu (${erro.code ?? erro.message}).`);
      process.exit(2);
    }
  }

  const larg = Math.max(...resultados.map((r) => r.rota.length), 4);
  for (const r of resultados) {
    const quebrada = ['todos sem nonce', 'parcial', 'nonce de outra resposta', 'sem csp'].includes(r.veredito);
    const marca = quebrada ? 'REPROVA' : '   ok  ';
    console.log(
      `${marca}  ${r.rota.padEnd(larg)}  HTTP ${r.status}  scripts ${r.comNonce}/${r.total}  ${r.veredito}`,
    );
  }

  const reprovadas = resultados.filter((r) =>
    ['todos sem nonce', 'parcial', 'nonce de outra resposta', 'sem csp'].includes(r.veredito),
  );
  const medidas = resultados.filter((r) => r.total > 0).length;

  console.log('');
  console.log(`Medidas com script: ${medidas} de ${resultados.length} rotas.`);
  if (comParametro.length > 0) {
    console.log(`NAO medidas (rota com parâmetro, a régua não sabe preencher): ${comParametro.join(', ')}`);
  }
  console.log('NAO coberto: style-src e demais diretivas, e se o navegador executou o script.');

  if (reprovadas.length > 0) {
    console.log('');
    console.error(`REPROVADO: ${reprovadas.length} rota(s) servem script que o navegador bloqueia.`);
    for (const r of reprovadas) {
      console.error(`  ${r.rota}: ${r.total - r.comNonce} de ${r.total} scripts sem nonce (${r.veredito}).`);
    }
    console.error('');
    console.error('Conserto: a rota precisa ser renderizada por requisição (o root layout declara');
    console.error('`force-dynamic`) e todo `<script>` escrito à mão precisa receber o `x-nonce`.');
    process.exit(1);
  }

  console.log('');
  console.log('APROVADO: todo script servido traz o nonce da CSP da própria resposta.');
  process.exit(0);
}

/*
 * Ponto de entrada por `pathToFileURL`, e não por comparação de texto. Medido em
 * 30/09/2026: a primeira versão comparava `import.meta.url` com
 * `file://${process.argv[1]}`, que no Windows nunca casa (o caminho vem como
 * `C:\...` e a URL como `file:///C:/...`), e caía num fallback por NOME de
 * arquivo. Uma cópia renomeada saiu com código 0 sem imprimir uma linha: régua
 * que não roda não reprova nada, e silêncio com exit 0 é indistinguível de
 * aprovação. O fallback por nome saiu de propósito.
 */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await principal();
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Guarda da saída para a internet pelo proxy corporativo do órgão.
 *
 * A rede da PRODESP não deixa o servidor sair direto: tudo passa por um proxy,
 * e o firewall autoriza pelo IP dele. O detalhe que faz isto precisar de uma
 * guarda é que o `fetch` nativo do Node NÃO lê HTTP_PROXY sozinho (o axios lê,
 * e é por isso que o exemplo do desenvolvedor do órgão funciona no código dele
 * e não funcionaria no nosso).
 *
 * Medido em 02/09/2026, com um proxy local contando conexões recebidas:
 *
 *   node:20-alpine (v20.20.2)               0 conexões  -> foi direto
 *   node:24-alpine sem a opção              0 conexões  -> foi direto
 *   node:24-alpine + NODE_USE_ENV_PROXY=1   1 conexão   -> usou o proxy
 *
 * O modo de falhar é o pior possível: nada quebra no build, nada quebra no
 * teste, e em produção a requisição sai direto, o firewall engole o pacote e a
 * chamada fica pendurada até o tempo limite, sem erro que diga o que houve.
 * Parece defeito de código. Por isso a versão do runtime é asserção, e não
 * comentário.
 */

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const DOCKERFILE = readFileSync(path.join(RAIZ, 'Dockerfile'), 'utf8');

/** Versões do Node que sabidamente NÃO respeitam HTTP_PROXY no fetch nativo. */
const VERSAO_MINIMA = 24;

/** Os estágios que partem de uma imagem do Node, na ordem em que aparecem. */
const bases = [...DOCKERFILE.matchAll(/^FROM\s+node:(\d+)[^\s]*/gm)].map((m) => ({
  linha: m[0],
  major: Number(m[1]),
}));

describe('Dockerfile: runtime capaz de usar o proxy do órgão', () => {
  it('declara pelo menos um estágio a partir de uma imagem do Node', () => {
    expect(bases.length).toBeGreaterThan(0);
  });

  it.each([0, 1, 2])('o estágio %i usa Node >= 24', (i) => {
    const base = bases[i];
    if (!base) return;
    expect(
      base.major,
      `"${base.linha}" usa Node ${base.major}. Abaixo de ${VERSAO_MINIMA} o fetch ` +
        'nativo ignora HTTP_PROXY, e no servidor do órgão a chamada ao SIBH sai ' +
        'direto, o firewall engole e ela fica pendurada até o tempo limite, sem ' +
        'erro legível. Ver o bloco no topo do Dockerfile.',
    ).toBeGreaterThanOrEqual(VERSAO_MINIMA);
  });

  /**
   * Fica na IMAGEM, e não no arquivo de ambiente, de propósito: se dependesse
   * de alguém escrevê-la no app.env do servidor, o esquecimento não produziria
   * erro nenhum, apenas requisições que somem.
   */
  it('liga NODE_USE_ENV_PROXY na própria imagem', () => {
    expect(
      /^ENV\s+NODE_USE_ENV_PROXY=1\s*$/m.test(DOCKERFILE),
      'O Dockerfile precisa de "ENV NODE_USE_ENV_PROXY=1". Sem isso o Node 24 ' +
        'também ignora HTTP_PROXY: a versão sozinha não basta, foi medido.',
    ).toBe(true);
  });
});

/**
 * O CI é a outra metade da mesma decisão, e nada os comparava.
 *
 * Entre 02/09 e 22/09/2026 o Dockerfile rodava Node 24 e os dois jobs do CI
 * rodavam Node 20, com o comentário do topo do arquivo afirmando que as versões
 * estavam alinhadas. Nenhuma etapa reprovou, porque cada régua olhava um arquivo
 * só: a divergência durou vinte dias e foi achada por leitura, não por medição.
 *
 * O que ela custa é o contrário de tudo o que o bloco acima mede: testar num
 * runtime que ignora HTTP_PROXY é medir um comportamento que a imagem entregue
 * não tem, e o modo de falhar continua sendo o silêncio.
 */
describe('CI e Dockerfile declaram o mesmo Node', () => {
  const CI = readFileSync(path.join(RAIZ, '.github', 'workflows', 'ci.yml'), 'utf8');

  /**
   * Cada passo `actions/setup-node` do arquivo, com o major que ele declara.
   *
   * `major` vem `null` quando o passo declara a versão de um jeito que esta
   * guarda não sabe ler (`node-version-file`, `lts/*`, matriz). Indecidível
   * REPROVA, e de propósito: guarda que ignora o que não entende tem porta dos
   * fundos, e quem trocasse a forma da declaração passaria por ela em silêncio.
   */
  const passos = CI.split(/uses:\s*actions\/setup-node[^\n]*\n/)
    .slice(1)
    .map((resto, i) => {
      // O passo termina onde começa o próximo item da lista de steps.
      const corpo = resto.split(/\n\s*- /)[0] ?? '';
      const declaracao =
        corpo.match(/^\s*(node-version(?:-file)?:.*)$/m)?.[1]?.trim() ?? '(nada)';
      const major = Number(declaracao.match(/^node-version:\s*'?"?(\d+)/)?.[1]);
      return {
        rotulo: `setup-node ${i + 1}`,
        declaracao,
        major: Number.isInteger(major) ? major : null,
      };
    });

  it('tem ao menos um passo de setup-node para medir', () => {
    // Âncora de presença: sem ela, apagar o setup-node do CI deixaria as
    // asserções abaixo varrendo uma lista vazia e passando.
    expect(passos.length).toBeGreaterThan(0);
  });

  it.each(passos)('$rotulo declara um Node legível e atual', ({ declaracao, major }) => {
    expect(
      major,
      `setup-node com "${declaracao}": esta guarda só sabe ler "node-version: '<major>'". ` +
        'Se a forma mudou de propósito, ensine o extrator a lê-la; enquanto ele não ' +
        'souber, o CI pode divergir do Dockerfile sem ninguém perceber.',
    ).not.toBeNull();
    expect(major).toBeGreaterThanOrEqual(VERSAO_MINIMA);
  });

  it('usa exatamente os majors dos estágios do Dockerfile', () => {
    const noCi = [...new Set(passos.map((p) => p.major))].sort();
    const naImagem = [...new Set(bases.map((b) => b.major))].sort();
    expect(
      noCi,
      `O CI roda Node ${noCi.join(', ')} e a imagem entregue roda ${naImagem.join(', ')}. ` +
        'Testar num runtime diferente do que vai para o servidor do órgão mede um ' +
        'comportamento que a imagem não tem, e foi assim que a divergência de 02/09 ' +
        'a 22/09/2026 passou vinte dias sem reprovar nada.',
    ).toEqual(naImagem);
  });
});

describe('modelo de ambiente: o proxy é declarado e o tráfego interno é excluído', () => {
  const modelo = readFileSync(
    path.join(RAIZ, 'ops', 'producao', 'ambiente-producao.exemplo'),
    'utf8',
  );

  it('declara HTTP_PROXY e HTTPS_PROXY', () => {
    expect(modelo).toMatch(/^HTTP_PROXY=/m);
    expect(modelo).toMatch(/^HTTPS_PROXY=/m);
  });

  /**
   * O que ficar de fora do NO_PROXY sai da máquina para pedir um endereço que
   * só existe dentro dela. O SQL Server do órgão é o caso mais caro: ele é
   * interno, e mandá-lo ao proxy falha de um jeito que parece problema de
   * banco.
   */
  it.each(['localhost', '127.0.0.1', 'db', '10.20.40.62'])(
    'exclui %s do proxy',
    (destino) => {
      const linha = modelo.split(/\r?\n/).find((l) => l.startsWith('NO_PROXY='));
      expect(linha, 'NO_PROXY não declarado no modelo de produção').toBeTruthy();
      expect(linha).toContain(destino);
    },
  );
});

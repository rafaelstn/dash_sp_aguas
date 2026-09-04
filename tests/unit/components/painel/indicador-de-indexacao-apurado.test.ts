import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Todo indicador que depende da INDEXAÇÃO passa pela apuração antes de virar
 * cartão. Nenhum deles é lido cru do resumo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DEFEITO, E POR QUE ELE SOBREVIVEU À CORREÇÃO DO IRMÃO
 * ─────────────────────────────────────────────────────────────────────────
 * Dois cartões saem da mesma população: "Postos sem arquivo" e "Arquivos
 * órfãos". Órfão é arquivo INDEXADO que não casou com posto, então numa base
 * onde o indexador nunca rodou os dois números são artefato da população
 * vazia, e não fatos sobre a rede.
 *
 * Em 04/09/2026 o primeiro já passava pela apuração e o segundo continuava
 * lendo `resumo.arquivosOrfaos` direto, com `severidade` verde no zero. A
 * correção tinha ficado no caminho onde alguém olhou.
 *
 * **E o que sobrou era o pior dos dois, porque era o otimista.** O painel
 * anunciava "nenhum arquivo órfão", em verde, a partir de uma medição que não
 * aconteceu. Alarme falso alguém contesta, porque incomoda; ninguém abre
 * chamado para conferir um cartão verde.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE GUARDA DE FONTE
 * ─────────────────────────────────────────────────────────────────────────
 * O erro é de LIGAÇÃO, não de cálculo: a função de apuração está correta e bem
 * testada, e o defeito é não chamá-la. Nenhum teste da função pode perceber
 * isso, e um teste de renderização precisaria montar uma página inteira de
 * servidor com seis repositórios para afirmar uma linha de JSX.
 */

const PAGINA = path.resolve(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'src',
  'app',
  '(dashboard)',
  'painel',
  'page.tsx',
);

/**
 * Campos do resumo cujo valor só é um fato depois que a indexação rodou.
 *
 * Se um terceiro nascer, ele entra aqui, e é a única manutenção que esta
 * guarda pede.
 */
const DEPENDEM_DA_INDEXACAO = ['postosSemArquivos', 'arquivosOrfaos'] as const;

const fonte = readFileSync(PAGINA, 'utf-8');

describe('indicadores que dependem da indexação', () => {
  it('a página foi encontrada e tem conteúdo, senão a guarda mede o vazio', () => {
    expect(fonte.length).toBeGreaterThan(1000);
    expect(fonte).toContain('CardKPI');
  });

  it.each(DEPENDEM_DA_INDEXACAO)(
    '%s aparece UMA vez fora de `tendencias`, e é na chamada da apuração',
    (campo) => {
      // `resumo.tendencias.<campo>` é outra coisa: é a série histórica, que o
      // cartão desenha como faixa e que não afirma nada sobre o valor de hoje.
      // Por isso ela é descontada antes da contagem.
      const semTendencias = fonte.split(`resumo.tendencias.${campo}`).join('');
      const usosCrus = semTendencias.split(`resumo.${campo}`).length - 1;

      // Exatamente um: o argumento da apuração. Dois ou mais significam que
      // alguém voltou a ler o número direto em `valor=` ou em `severidade=`,
      // que foi precisamente a forma do defeito.
      expect(usosCrus).toBe(1);
      expect(semTendencias).toMatch(
        new RegExp(`apuracaoDe\\w+\\(\\s*atividade,\\s*resumo\\.${campo}`),
      );
    },
  );

  it('nenhum cartão recebe um desses valores direto em `valor=`', () => {
    // Afirmação separada e redundante de propósito: a contagem acima cai se
    // alguém reescrever a chamada da apuração, e aí esta continua de pé.
    for (const campo of DEPENDEM_DA_INDEXACAO) {
      expect(fonte).not.toContain(`valor={resumo.${campo}}`);
    }
  });

  it('a severidade também não sai do número cru', () => {
    // O defeito de 04/09 estava tanto em `valor=` quanto em `severidade=`, e a
    // segunda é a que pintava de verde. Guarda que cobrisse só `valor=`
    // deixaria o cartão anunciar "tudo certo" com o valor não apurado.
    for (const campo of DEPENDEM_DA_INDEXACAO) {
      expect(fonte).not.toMatch(
        new RegExp(`severidade=\\{[^}]*resumo\\.${campo}\\s*>`),
      );
    }
  });
});

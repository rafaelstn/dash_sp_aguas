import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Posto } from '@/domain/posto';
import { montarMarkdownRelatorioPosto } from '@/infrastructure/relatorio/markdown-relatorio';

/**
 * O relatório oficial do posto tem de mostrar a MESMA instrumentação que a
 * ficha na tela.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR
 * ─────────────────────────────────────────────────────────────────────────
 * São cinco campos derivados do vínculo `AparelhoPostos` x `Aparelhos`:
 * convencional, logger, telemétrico, nível e vazão. Até 04/09/2026 a ficha
 * mostrava os cinco e o relatório trazia DOIS. Os outros três eram lidos da
 * origem, chegavam à entidade de domínio, apareciam na tela e sumiam no
 * documento.
 *
 * Isso não quebra nada e não aparece em teste de tipo: o relatório continua
 * válido, só que menor. O sintoma é institucional, e é o pior tipo: **campo
 * ausente no papel é indistinguível de campo vazio na origem.** Quem imprime a
 * ficha oficial de um posto para instruir processo não tem como saber que o
 * documento decidiu não perguntar.
 *
 * A regressão volta pelo caminho mais natural que existe: alguém acrescenta um
 * campo de instrumentação na ficha e não lembra que há um segundo lugar.
 */

/**
 * Posto de teste com os cinco campos de instrumentação preenchidos com valores
 * DISTINGUÍVEIS entre si.
 *
 * O cast existe porque `Posto` tem dezenas de campos e construir todos aqui
 * mediria a paciência de quem escreve, e não o relatório. O que este arquivo
 * afirma depende só dos campos abaixo; qualquer outro ausente sai como "Não
 * informado", que é o comportamento documentado de `valor()`.
 *
 * Os valores são distinguíveis de propósito: se fossem todos "SIM", trocar
 * `nivel` por `vazao` na montagem passaria despercebido, e essa troca é
 * exatamente o erro que uma lista de cinco linhas parecidas convida.
 */
const POSTO = {
  prefixo: 'C5-018',
  prefixoAna: '58230100',
  nomeEstacao: 'POSTO DE ENSAIO',
  convencional: 'PLUVIOMETRO CONVENCIONAL',
  loggerEqp: 'LOGGER DE ENSAIO',
  telemetrico: 'PLUVIOMETRO TELEMETRICO',
  nivel: 'LINIGRAFO DE NIVEL',
  vazao: 'MEDIDOR DE VAZAO',
  latitude: null,
  longitude: null,
} as unknown as Posto;

/** Rótulo exibido para cada campo. Fonte única desta suíte. */
const INSTRUMENTACAO: ReadonlyArray<readonly [keyof Posto, string]> = [
  ['convencional', 'Convencional'],
  ['loggerEqp', 'Logger'],
  ['telemetrico', 'Telemétrico'],
  ['nivel', 'Nível'],
  ['vazao', 'Vazão'],
];

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), 'utf-8');
}

describe('o relatório traz os cinco campos de instrumentação', () => {
  const markdown = montarMarkdownRelatorioPosto(POSTO, new Date('2026-09-04T12:00:00Z'));

  it.each(INSTRUMENTACAO)('%s aparece com rótulo "%s" e com o VALOR', (campo, rotulo) => {
    expect(markdown).toContain(rotulo);
    // O rótulo sozinho não prova nada: uma linha `| Nível | Não informado |`
    // contém o rótulo e não mostra o dado. O que se afirma é o valor.
    expect(markdown).toContain(String(POSTO[campo]));
  });

  it('nenhum dos cinco sai como "Não informado" estando preenchido na origem', () => {
    for (const [, rotulo] of INSTRUMENTACAO) {
      expect(markdown).not.toContain(`| ${rotulo} | Não informado |`);
    }
  });

  it('campo vazio na origem continua saindo como "Não informado"', () => {
    // O par do caso acima. Sem ele, um relatório que imprimisse texto fixo
    // passaria nos anteriores, e a ficha oficial perderia a distinção entre
    // "não há equipamento" e "o documento não perguntou".
    const semAparelho = { ...POSTO, nivel: null, vazao: '' } as unknown as Posto;
    const m = montarMarkdownRelatorioPosto(semAparelho, new Date('2026-09-04T12:00:00Z'));
    expect(m).toContain('| Nível | Não informado |');
    expect(m).toContain('| Vazão | Não informado |');
  });
});

describe('relatório e ficha da tela não divergem', () => {
  it('todo campo de instrumentação da ficha também é impresso', () => {
    // Guarda de FONTE, e é o formato certo aqui: o defeito nasce quando alguém
    // acrescenta um campo na ficha e não lembra do relatório, e nesse instante
    // não existe teste funcional que possa saber do campo novo.
    const ficha = fonte('src/components/features/ficha/FichaPosto.tsx');
    const relatorio = fonte('src/infrastructure/relatorio/markdown-relatorio.ts');

    const naFicha = [...ficha.matchAll(/rotulo:\s*'([^']+)',\s*valor:\s*p\.(\w+)/g)].map(
      (m) => ({ rotulo: m[1]!, campo: m[2]! }),
    );

    // Guarda da guarda: se a expressão parar de casar (alguém troca aspas ou
    // reescreve o componente), esta suíte percorreria lista vazia e ficaria
    // verde sem medir nada.
    expect(naFicha.length).toBeGreaterThanOrEqual(5);

    const camposDeInstrumentacao = new Set(INSTRUMENTACAO.map(([campo]) => campo as string));
    const ausentes = naFicha
      .filter((f) => camposDeInstrumentacao.has(f.campo))
      .filter((f) => !relatorio.includes(`'${f.rotulo}'`));

    expect(ausentes.map((a) => `${a.campo} (${a.rotulo})`)).toEqual([]);
  });

  it('os rótulos são os MESMOS nos dois lugares, e não apenas equivalentes', () => {
    // "Logger" na tela e "Logger de equipamento" no papel seriam dois nomes
    // para o mesmo dado, e quem confere um contra o outro é a mesma pessoa.
    const ficha = fonte('src/components/features/ficha/FichaPosto.tsx');
    const relatorio = fonte('src/infrastructure/relatorio/markdown-relatorio.ts');
    for (const [campo, rotulo] of INSTRUMENTACAO) {
      expect(ficha).toContain(`rotulo: '${rotulo}', valor: p.${String(campo)}`);
      expect(relatorio).toContain(`linhaTabela('${rotulo}', valor(posto.${String(campo)}))`);
    }
  });
});

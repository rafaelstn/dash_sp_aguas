import type { ResumoSerie } from '@/application/ports/series-medicao-repository';

/**
 * Formatação e aritmética de calendário das séries históricas do posto.
 *
 * Módulo puro, sem React e sem I/O, para que o servidor e o cliente escrevam a
 * mesma data com as mesmas letras.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TODA DATA É TRATADA COMO ROTULO, NUNCA COMO INSTANTE
 * ─────────────────────────────────────────────────────────────────────────
 * A API entrega o dia como `'AAAA-MM-DD'`, que é um dia de calendário, e não um
 * momento. Passá-lo por `new Date('2001-09-01')` produz a meia-noite UTC, e
 * exibi-lo com o fuso do navegador no Brasil (UTC-3) devolve 31/08/2001: a
 * série inteira andaria um dia para trás na tela, sem nada quebrar e sem
 * ninguém perceber, exatamente na tela que existe para CONFERIR número com o
 * órgão.
 *
 * Por isso o dia é formatado a partir dos pedaços do próprio texto, e a única
 * aritmética de data acontece em UTC (`Date.UTC`), inclusive a posição do ponto
 * no gráfico. Nenhuma função deste arquivo lê o fuso da máquina.
 *
 * A exceção aparente é `fmtMomento`, e ali vale a mesma disciplina. A leitura
 * crua traz hora (`2001-11-01T07:00:00.000Z`, e o mesmo posto traz `T18:00`,
 * que são as duas leituras diárias de régua). Essa hora é o relógio de parede
 * gravado na origem, e não um instante com fuso declarado: o órgão não publica
 * o fuso das colunas. Formatá-la com o fuso do navegador a deslocaria três
 * horas e, na leitura das sete da manhã, jogaria a data para o dia anterior.
 * Por isso ela também é lida em UTC, o que devolve exatamente os dígitos que
 * estão gravados lá, que é o que quem confere com o órgão precisa ver. A tela
 * rotula a coluna como hora da origem, e não como UTC, porque afirmar o fuso
 * seria afirmar o que não foi medido.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

/** `true` quando o texto tem a forma de um dia de calendário. */
export function ehDia(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

/** `'2001-09-01'` para `'01/09/2001'`. Devolve o próprio texto se não for dia. */
export function fmtDia(dia: string): string {
  if (!ehDia(dia)) return dia;
  const [ano, mes, d] = dia.split('-');
  return `${d}/${mes}/${ano}`;
}

/** `'2001-09-01'` para `'1 de setembro de 2001'`. Usado por leitor de tela. */
export function fmtDiaLongo(dia: string): string {
  if (!ehDia(dia)) return dia;
  const [ano, mes, d] = dia.split('-');
  const nomeMes = MESES[Number(mes) - 1] ?? mes;
  return `${Number(d)} de ${nomeMes} de ${ano}`;
}

/**
 * Instante ISO da leitura crua (ver o cabeçalho sobre o fuso).
 *
 * `comHora` é decidido pela página inteira, e não por linha: a chuva manual do
 * posto `E3-036` grava toda leitura à meia-noite, e repetir "00:00" em noventa
 * linhas é ruído que não distingue nada. A cota do `1D-008` grava às 07:00 e às
 * 18:00, duas leituras por dia, e ali a hora é o que separa uma linha da outra.
 */
export function fmtMomento(iso: string, comHora = true): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  const d = new Date(ms);
  const doisDigitos = (n: number) => String(n).padStart(2, '0');
  const data = `${doisDigitos(d.getUTCDate())}/${doisDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  if (!comHora) return data;
  return `${data} ${doisDigitos(d.getUTCHours())}:${doisDigitos(d.getUTCMinutes())}`;
}

/** `true` quando alguma leitura da página tem hora diferente de meia-noite. */
export function algumaLeituraTemHora(momentos: readonly string[]): boolean {
  return momentos.some((iso) => {
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return false;
    const d = new Date(ms);
    return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
  });
}

/** Dia de calendário para epoch em UTC. */
export function diaParaMs(dia: string): number {
  const [ano, mes, d] = dia.split('-').map(Number);
  return Date.UTC(ano ?? 1970, (mes ?? 1) - 1, d ?? 1);
}

/** Epoch em UTC para dia de calendário. */
export function msParaDia(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Dias de `desde` até `ate`, inclusivos nas duas pontas. */
export function diasNaJanela(desde: string, ate: string): number {
  return Math.round((diaParaMs(ate) - diaParaMs(desde)) / MS_DIA) + 1;
}

/** Soma (ou subtrai) dias a um dia de calendário, sem tocar em fuso. */
export function somarDias(dia: string, dias: number): string {
  return msParaDia(diaParaMs(dia) + dias * MS_DIA);
}

/** Maior dos dois dias. */
export function maiorDia(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Inteiro com separador de milhar do PT-BR. */
export function fmtInteiro(n: number): string {
  return n.toLocaleString('pt-BR');
}

/**
 * Valor de medição com a unidade, ou o travessão de ausência.
 *
 * `null` NUNCA vira zero aqui: num histórico de chuva a diferença entre "não
 * sabemos" e "não choveu" é a razão de existir desta tela.
 */
export function fmtValor(valor: number | null, unidade: string): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${unidade}`;
}

/** Só o número, sem unidade. Para coluna de tabela que já tem a unidade no cabeçalho. */
export function fmtNumero(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return '—';
  return valor.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/** Percentual de `parte` sobre `total`, com uma casa. Devolve `null` se não houver total. */
export function percentual(parte: number, total: number): string | null {
  if (total <= 0) return null;
  const p = (parte / total) * 100;
  // Abaixo de 0,1% o arredondamento devolveria "0,0%", que soa como nenhum. O
  // que existe e é pouco se escreve como pouco, não como zero.
  if (p > 0 && p < 0.1) return 'menos de 0,1%';
  return `${p.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/**
 * Teto de dias por consulta. Espelha `MAX_DIAS_JANELA` de
 * `app/api/_helpers/janela-serie.ts`, que é quem de fato recusa.
 *
 * A cópia existe porque a tela precisa DESABILITAR o atalho que estouraria o
 * teto, em vez de deixar a pessoa pedir e tomar 400. Para que as duas não
 * divirjam em silêncio, `tests/unit/components/series-formato.test.ts`
 * compara este valor com o do helper e reprova se alguém mudar só um lado.
 */
export const MAX_DIAS_JANELA_TELA = 3660;

export interface Janela {
  readonly desde: string;
  readonly ate: string;
}

/**
 * Janela inicial de uma série, e é aqui que mora a decisão mais importante
 * desta tela depois dos estados.
 *
 * MEDIDO em 03/09/2026 contra o banco do órgão: a chuva do posto `E3-036` vai
 * de 1888 a 2004, e a cota do `1D-008` de 1971 a 2001. Um padrão de "últimos 90
 * dias" contados de HOJE devolveria vazio nos dois, e a tela dispararia "sem
 * dado" para postos com dezenas de milhares de leituras. É o defeito que a API
 * se recusa a cometer ao exigir período explícito, e repeti-lo na tela seria
 * cometê-lo do lado de cá.
 *
 * A janela padrão então se ancora no FIM DA SÉRIE, e não no relógio: os últimos
 * `dias` dias que existem, sem passar do começo da série. Assim a ficha abre
 * mostrando dado em qualquer posto, inclusive num que parou há vinte anos.
 */
export function janelaPadrao(resumo: ResumoSerie, dias = 90): Janela | null {
  if (!resumo.ultimaData || !resumo.primeiraData) return null;
  const ate = resumo.ultimaData;
  const recuo = somarDias(ate, -(dias - 1));
  return { desde: maiorDia(recuo, resumo.primeiraData), ate };
}

/** Extensão total da série em dias, ou `null` quando não há série. */
export function extensaoDaSerie(resumo: ResumoSerie): number | null {
  if (!resumo.primeiraData || !resumo.ultimaData) return null;
  return diasNaJanela(resumo.primeiraData, resumo.ultimaData);
}

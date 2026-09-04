'use client';

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DiaDaSerie } from '@/application/ports/series-medicao-repository';
import type { DefinicaoSerie } from '@/domain/monitor/serie-medicao';
import {
  diaParaMs,
  diasNaJanela,
  fmtDia,
  fmtDiaLongo,
  fmtInteiro,
  fmtValor,
  msParaDia,
  type Janela,
} from './formato';

/**
 * Histórico diário da série, no período escolhido.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * LACUNA É DESENHADA COMO LACUNA, E ESTE É O PONTO INTEIRO DESTE ARQUIVO
 * ═════════════════════════════════════════════════════════════════════════
 * A API só devolve dia que EXISTE na origem: dia sem nenhuma linha não vem, e
 * não vem como zero. MEDIDO em 03/09/2026 na chuva do posto `E3-036`, janela de
 * 1995 a 2004: 2.832 dias vieram e **821 dias de calendário não existem**.
 *
 * Entregar essa lista ao eixo categórico do recharts encostaria 31/05/1996 em
 * 01/09/1996 como se fossem vizinhos, e três anos de buraco viravam uma série
 * contínua e bonita. Por isso o eixo é NUMÉRICO, com a data real do dia como
 * coordenada: a lacuna aparece como espaço vazio porque ela é espaço vazio, sem
 * ninguém precisar preencher nada.
 *
 * Preencher com zero seria pior que o eixo categórico: num histórico de chuva,
 * zero é uma AFIRMAÇÃO ("não choveu") no lugar de uma ausência ("não sabemos").
 *
 * ═════════════════════════════════════════════════════════════════════════
 * "O DIA EXISTE E NÃO TEM MEDIDA" É UM TERCEIRO ESTADO, E TEM MARCA PRÓPRIA
 * ═════════════════════════════════════════════════════════════════════════
 * As séries do órgão gravam "não houve leitura" como um NÚMERO (9999 na cota,
 * 999,9 na chuva), e a API traduz isso para `valor: null` com `leituras > 0`.
 * MEDIDO na mesma janela: 46 dias assim, 32 deles só no ano 2000.
 *
 * Esse dia não é lacuna (a linha do órgão existe) nem é zero (não houve
 * medida). Ele ganha uma marca âmbar rente à base, num eixo próprio e oculto,
 * para que quem olha o gráfico veja a diferença entre "o posto não reportou" e
 * "o posto reportou que não mediu". Sem a marca, os dois somem juntos e o
 * gráfico parece completo.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ACESSIBILIDADE
 * ─────────────────────────────────────────────────────────────────────────
 * O gráfico é a representação VISUAL, e o equivalente textual exigido pelo
 * e-MAG e pela WCAG 1.1.1 é a `TabelaDiaria`, renderizada logo abaixo e sempre
 * presente, com os mesmos números e a mesma distinção de estados. Aqui o
 * contêiner recebe `role="img"` e um rótulo que resume o que está desenhado,
 * inclusive as contagens de lacuna e de dia sem medida.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CORES EM HEXADECIMAL, E POR QUÊ
 * ─────────────────────────────────────────────────────────────────────────
 * O recharts desenha em SVG fora do fluxo de classes do Tailwind, então precisa
 * do valor resolvido. Os literais abaixo são os mesmos tokens de `globals.css`
 * (`--gov-azul`, `--status-warn`, `--border-subtle`, `--fg-subtle`), no mesmo
 * padrão já adotado por `GraficoChuva` e `GraficoNivel`. Quando o tema escuro
 * for ligado (o bloco `[data-theme="dark"]` está comentado em `globals.css`),
 * estes quatro valores são o que precisa sair para variável de CSS lida em
 * tempo de execução.
 */

const COR_SERIE = '#1E40AF';
const COR_SEM_MEDIDA = '#92400E';
const COR_GRID = '#E5E7EB';
const COR_EIXO = '#5F6572';

/**
 * Fatia do eixo vertical reservada, abaixo do menor valor, para a faixa de
 * marcas de "dia sem medida". Sem essa reserva a marca nasceria em cima da
 * linha e seria lida como se fosse um valor medido.
 */
const RESERVA_FAIXA_MARCAS = 0.1;

interface GraficoSerieProps {
  definicao: DefinicaoSerie;
  dias: readonly DiaDaSerie[];
  janela: Janela;
}

interface PontoGrafico {
  ts: number;
  /** `null` no ponto sintético que quebra a linha numa lacuna. */
  dia: string | null;
  valor: number | null;
  minimo: number | null;
  maximo: number | null;
  faixa?: [number, number];
  /** Preenchido só quando o dia existe e não tem medida. */
  marca?: number;
  leituras: number;
  leiturasSemValor: number;
}

export function GraficoSerie({ definicao, dias, janela }: GraficoSerieProps) {
  const ehChuva = definicao.grandeza === 'chuva';
  const dominio = calcularDominio(dias, ehChuva);
  const pontos = montarPontos(dias, ehChuva, dominio.linhaDasMarcas);

  const tsDesde = diaParaMs(janela.desde);
  const tsAte = diaParaMs(janela.ate);
  const totalDias = diasNaJanela(janela.desde, janela.ate);

  const comValor = dias.filter((d) => d.valor !== null).length;
  const semMedida = dias.filter((d) => d.valor === null).length;
  const lacunas = Math.max(0, totalDias - dias.length);

  const marcas = pontos.filter((p) => p.marca !== undefined);

  return (
    <figure className="m-0 space-y-2">
      <div
        role="img"
        aria-label={montarDescricao({
          definicao,
          janela,
          totalDias,
          comValor,
          semMedida,
          lacunas,
        })}
        className="h-64 w-full sm:h-72"
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={pontos} margin={{ top: 8, right: 8, bottom: 4, left: -6 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COR_GRID} vertical={false} />
            <XAxis
              type="number"
              dataKey="ts"
              domain={[tsDesde, tsAte]}
              ticks={montarTicks(tsDesde, tsAte)}
              tickFormatter={(ts: number) => rotuloTick(ts, totalDias)}
              tick={{ fontSize: 11, fill: COR_EIXO }}
              tickLine={false}
              axisLine={{ stroke: COR_GRID }}
              allowDataOverflow
            />
            <YAxis
              tick={{ fontSize: 11, fill: COR_EIXO }}
              tickLine={false}
              axisLine={{ stroke: COR_GRID }}
              width={46}
              tickFormatter={fmtEixo}
              domain={[dominio.minimo, dominio.maximo]}
              ticks={dominio.marcasDeEixo}
              allowDataOverflow
            />

            <Tooltip
              cursor={{ stroke: COR_GRID }}
              content={<DicaGrafico definicao={definicao} />}
            />

            {ehChuva ? (
              <Bar
                dataKey="valor"
                fill={COR_SERIE}
                radius={[2, 2, 0, 0]}
                isAnimationActive={false}
                barSize={larguraBarra(totalDias)}
                // Sem isto, "choveu 0 mm" desenha uma barra de altura zero, que
                // é pixel por pixel igual a "não há registro deste dia". O
                // gráfico apagaria justamente a distinção que esta tela existe
                // para mostrar, e o pior é que ele apagaria em silêncio: visto
                // na tela em 03/09/2026, num trimestre de seca em que 78 dos 90
                // dias medidos eram zero e o gráfico parecia vazio. Com o toco
                // de 2 px, dia medido tem marca e dia ausente tem vão.
                minPointSize={2}
              />
            ) : (
              <>
                <Area
                  dataKey="faixa"
                  stroke="none"
                  fill={COR_SERIE}
                  fillOpacity={0.12}
                  isAnimationActive={false}
                  activeDot={false}
                  connectNulls={false}
                />
                <Line
                  dataKey="valor"
                  type="linear"
                  stroke={COR_SERIE}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 3 }}
                  isAnimationActive={false}
                  // A quebra na lacuna depende disto: com `connectNulls` a linha
                  // atravessaria três anos de ausência como se fosse variação.
                  connectNulls={false}
                />
              </>
            )}

            {marcas.length > 0 ? (
              <Scatter
                dataKey="marca"
                fill={COR_SEM_MEDIDA}
                shape="square"
                isAnimationActive={false}
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-app-fg-muted">
        <Chave cor={COR_SERIE} forma={ehChuva ? 'barra' : 'linha'}>
          {definicao.rotulo} ({definicao.unidade})
          {ehChuva ? ', com toco na base quando o dia foi medido em zero' : ''}
        </Chave>
        {semMedida > 0 ? (
          <Chave cor={COR_SEM_MEDIDA} forma="quadrado">
            {fmtInteiro(semMedida)}{' '}
            {semMedida === 1 ? 'dia registrado sem medida' : 'dias registrados sem medida'}
          </Chave>
        ) : null}
        {lacunas > 0 ? (
          <span className="tabular">
            {fmtInteiro(lacunas)} {lacunas === 1 ? 'dia sem registro' : 'dias sem registro'}{' '}
            (espaço vazio no gráfico)
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}

interface DominioVertical {
  minimo: number;
  maximo: number;
  marcasDeEixo: number[];
  /** Altura, na unidade da série, em que as marcas de ausência são desenhadas. */
  linhaDasMarcas: number;
}

/**
 * Domínio vertical calculado à mão, e não por `domain={['auto','auto']}`.
 *
 * MEDIDO na tela em 03/09/2026, e é a razão de esta função existir: com o
 * domínio automático o eixo vertical saiu VAZIO, sem nenhum rótulo e com uma
 * única linha de grade, num gráfico cujos dados desenhavam certo. A série de
 * nível alimenta uma `Area` com pares `[mínimo, máximo]`, e os pontos
 * sintéticos que quebram a linha na lacuna entram sem par nenhum; o cálculo
 * automático não sobrevive a essa mistura. Um gráfico sem eixo vertical não é
 * um gráfico feio, é um gráfico que não informa quanto: exatamente o que esta
 * tela existe para dizer.
 *
 * A conta também reserva uma faixa abaixo do menor valor para as marcas de
 * "dia sem medida". Elas precisam ficar FORA da região onde a linha anda, senão
 * uma marca de ausência seria lida como uma medição baixa.
 */
function calcularDominio(dias: readonly DiaDaSerie[], ehChuva: boolean): DominioVertical {
  const valores: number[] = [];
  for (const dia of dias) {
    if (dia.valor !== null) valores.push(dia.valor);
    if (dia.minimo !== null) valores.push(dia.minimo);
    if (dia.maximo !== null) valores.push(dia.maximo);
  }

  // Sem nenhum valor (a janela só tem dias registrados sem medida) o eixo ainda
  // precisa existir, senão a faixa de marcas não teria onde ser desenhada.
  if (valores.length === 0) {
    return { minimo: 0, maximo: 1, marcasDeEixo: [0, 1], linhaDasMarcas: 0.05 };
  }

  const menor = ehChuva ? 0 : Math.min(...valores);
  const maior = Math.max(...valores);
  const amplitude = maior - menor || Math.max(1, Math.abs(maior) * 0.1);

  const passo = passoBonito(amplitude * (1 + RESERVA_FAIXA_MARCAS), 4);

  // A base desce ABAIXO do menor valor sempre, porque é essa folga que separa a
  // faixa de marcas de ausência da região onde a linha anda.
  const minimo = Math.floor((menor - amplitude * RESERVA_FAIXA_MARCAS) / passo) * passo;
  const maximo = Math.ceil((maior + amplitude * 0.04) / passo) * passo;

  // Em chuva o eixo pode descer abaixo de zero para abrigar a faixa de marcas, e
  // as marcas de EIXO começam no zero mesmo assim: rotular "-5 mm" num gráfico
  // de chuva seria afirmar uma grandeza que não existe.
  const primeiraMarca = ehChuva ? Math.max(0, minimo) : minimo;

  return {
    minimo,
    maximo,
    marcasDeEixo: montarMarcasDeEixo(primeiraMarca, maximo, passo),
    linhaDasMarcas: minimo + (menor - minimo) / 2,
  };
}

/**
 * Passo de eixo legível: 1, 2, 2,5 ou 5 vezes uma potência de dez.
 *
 * Dividir a amplitude em partes iguais produz marcas como 81,5 e 140,5, que a
 * pessoa tem de decodificar antes de comparar com um número do órgão. O passo
 * "bonito" custa a mesma conta e devolve 80, 110, 140.
 */
function passoBonito(amplitude: number, alvoDeMarcas: number): number {
  const bruto = amplitude / Math.max(1, alvoDeMarcas);
  if (!Number.isFinite(bruto) || bruto <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(bruto)));
  const normalizado = bruto / magnitude;
  const escolhido =
    normalizado <= 1 ? 1 : normalizado <= 2 ? 2 : normalizado <= 2.5 ? 2.5 : normalizado <= 5 ? 5 : 10;
  return escolhido * magnitude;
}

/** Marcas de eixo do primeiro múltiplo do passo até o topo. */
function montarMarcasDeEixo(inicio: number, fim: number, passo: number): number[] {
  const marcas: number[] = [];
  // Teto de segurança: eixo com passo minúsculo não pode gerar milhares de
  // marcas e travar o desenho.
  for (let v = inicio; v <= fim + passo / 2 && marcas.length < 12; v += passo) {
    marcas.push(Math.round(v * 1000) / 1000);
  }
  return marcas;
}

/**
 * Rótulo do eixo vertical, SEM a unidade.
 *
 * Repetir "cm" em cada marca estourava a largura do eixo e quebrava o rótulo em
 * duas linhas ("140,5" em cima, "cm" embaixo), medido na tela em 03/09/2026. A
 * unidade é dita uma vez, na legenda logo abaixo do gráfico e no cabeçalho da
 * tabela, que é onde ela basta.
 */
function fmtEixo(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}

/**
 * Constrói os pontos desenhados.
 *
 * Para série de nível, insere um ponto sintético de valor nulo no meio de cada
 * lacuna, porque é ele que faz a linha QUEBRAR: sem isso o recharts liga dois
 * pontos consecutivos por mais distante que estejam no eixo. Para chuva não é
 * preciso: barra de valor nulo simplesmente não é desenhada.
 */
function montarPontos(
  dias: readonly DiaDaSerie[],
  ehChuva: boolean,
  linhaDasMarcas: number,
): PontoGrafico[] {
  const pontos: PontoGrafico[] = [];
  let anterior: number | null = null;

  for (const dia of dias) {
    const ts = diaParaMs(dia.dia);

    if (!ehChuva && anterior !== null && ts - anterior > 86_400_000) {
      pontos.push({
        ts: anterior + (ts - anterior) / 2,
        dia: null,
        valor: null,
        minimo: null,
        maximo: null,
        leituras: 0,
        leiturasSemValor: 0,
      });
    }

    pontos.push({
      ts,
      dia: dia.dia,
      valor: dia.valor,
      minimo: dia.minimo,
      maximo: dia.maximo,
      faixa:
        dia.minimo !== null && dia.maximo !== null
          ? [dia.minimo, dia.maximo]
          : undefined,
      // A marca existe só no terceiro estado: a linha do órgão está lá e a
      // medida não. Dia ausente não chega aqui, e dia com valor não recebe marca.
      marca: dia.valor === null && dia.leituras > 0 ? linhaDasMarcas : undefined,
      leituras: dia.leituras,
      leiturasSemValor: dia.leiturasSemValor,
    });

    anterior = ts;
  }

  return pontos;
}

/** Seis marcas de eixo, distribuídas pelo período. */
function montarTicks(tsDesde: number, tsAte: number): number[] {
  const quantidade = 6;
  if (tsAte <= tsDesde) return [tsDesde];
  const passo = (tsAte - tsDesde) / (quantidade - 1);
  return Array.from({ length: quantidade }, (_, i) => Math.round(tsDesde + i * passo));
}

/**
 * Rótulo da marca de eixo, na resolução que o período comporta.
 *
 * Dia numa janela de dez anos vira uma tarja ilegível de números; ano numa
 * janela de um mês não diz nada.
 *
 * O corte de "só o ano" tem de considerar que são SEIS marcas: numa janela de
 * dois anos, seis marcas rotuladas só pelo ano saem como "1999, 1999, 1999,
 * 2000, 2000, 2000", que não localiza nada. Medido na tela em 03/09/2026, e o
 * corte subiu para cinco anos, que é a partir de onde seis marcas caem em anos
 * distintos.
 */
function rotuloTick(ts: number, totalDias: number): string {
  const dia = msParaDia(ts);
  const [ano, mes, d] = dia.split('-');
  if (totalDias > 1830) return ano ?? dia;
  if (totalDias > 90) return `${mes}/${ano}`;
  return `${d}/${mes}`;
}

/**
 * Largura da barra em pixels.
 *
 * Num eixo numérico o recharts não tem categoria de onde inferir a largura, e
 * sem valor explícito a barra sai larga o bastante para as de dez anos se
 * sobreporem. A conta usa a largura típica da área de desenho.
 */
function larguraBarra(totalDias: number): number {
  const disponivel = 640;
  return Math.max(1, Math.min(22, Math.floor(disponivel / Math.max(1, totalDias))));
}

function montarDescricao({
  definicao,
  janela,
  totalDias,
  comValor,
  semMedida,
  lacunas,
}: {
  definicao: DefinicaoSerie;
  janela: Janela;
  totalDias: number;
  comValor: number;
  semMedida: number;
  lacunas: number;
}): string {
  const forma = definicao.grandeza === 'chuva' ? 'barras' : 'linha';
  const criterio =
    definicao.criterioDiario === 'soma' ? 'total do dia' : 'média do dia, com faixa de mínimo e máximo';

  const partes = [
    `Gráfico de ${forma} de ${definicao.rotulo.toLowerCase()} em ${definicao.unidade},`,
    `por ${criterio}, de ${fmtDia(janela.desde)} a ${fmtDia(janela.ate)},`,
    `${fmtInteiro(totalDias)} dias de período.`,
    `${fmtInteiro(comValor)} dias com medida.`,
  ];
  if (semMedida > 0) {
    partes.push(`${fmtInteiro(semMedida)} dias registrados sem medida.`);
  }
  if (lacunas > 0) {
    partes.push(`${fmtInteiro(lacunas)} dias sem registro nenhum na origem.`);
  }
  partes.push('A tabela abaixo traz os mesmos valores.');
  return partes.join(' ');
}

interface ItemDica {
  payload?: PontoGrafico;
}

function DicaGrafico({
  active,
  payload,
  definicao,
}: {
  active?: boolean;
  payload?: ItemDica[];
  definicao: DefinicaoSerie;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const ponto = payload[0]?.payload;
  // Ponto sintético de quebra: não é dia, não tem o que dizer sobre ele.
  if (!ponto || ponto.dia === null) return null;

  const semMedida = ponto.valor === null && ponto.leituras > 0;

  return (
    <div className="rounded border border-app-border-subtle bg-app-surface px-3 py-2 text-xs shadow-gov-card-hover">
      <p className="font-semibold text-app-fg">{fmtDiaLongo(ponto.dia)}</p>
      {semMedida ? (
        <p className="mt-1 font-medium text-gov-alerta">
          Registrado sem medida
        </p>
      ) : (
        <p className="mt-1 font-medium text-app-fg tabular">
          {definicao.criterioDiario === 'soma' ? 'Total' : 'Média'}:{' '}
          {fmtValor(ponto.valor, definicao.unidade)}
        </p>
      )}
      {definicao.criterioDiario === 'media' && ponto.minimo !== null ? (
        <p className="mt-0.5 text-app-fg-muted tabular">
          Mínimo {fmtValor(ponto.minimo, definicao.unidade)} · Máximo{' '}
          {fmtValor(ponto.maximo, definicao.unidade)}
        </p>
      ) : null}
      <p className="mt-0.5 text-app-fg-subtle tabular">
        {fmtInteiro(ponto.leituras)} {ponto.leituras === 1 ? 'leitura' : 'leituras'}
        {ponto.leiturasSemValor > 0
          ? `, ${fmtInteiro(ponto.leiturasSemValor)} sem medida`
          : ''}
      </p>
    </div>
  );
}

function Chave({
  cor,
  forma,
  children,
}: {
  cor: string;
  forma: 'barra' | 'linha' | 'quadrado';
  children: React.ReactNode;
}) {
  const classe =
    forma === 'linha' ? 'h-0.5 w-4' : forma === 'barra' ? 'h-3 w-2 rounded-sm' : 'h-2 w-2 rounded-sm';
  return (
    <span className="inline-flex items-center gap-1.5 tabular">
      <span aria-hidden="true" className={classe} style={{ background: cor }} />
      {children}
    </span>
  );
}

const NAO_INFORMADO = 'Não informado';

/**
 * Converte valores potencialmente nulos em texto amigável para UI governamental
 * (tom formal). Nunca devolve string vazia, nunca a palavra "null".
 */
export function formatarValor(valor: unknown): string {
  if (valor === null || valor === undefined) return NAO_INFORMADO;
  if (typeof valor === 'string') {
    const aparado = valor.trim();
    return aparado.length === 0 ? NAO_INFORMADO : aparado;
  }
  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? String(valor) : NAO_INFORMADO;
  }
  if (valor instanceof Date) {
    return valor.toLocaleDateString('pt-BR');
  }
  return String(valor);
}

const FORMATADOR_MEDIDA = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

/**
 * Número que representa uma MEDIDA, em pt-BR: `2830.45` vira `2.830,45`.
 *
 * Existe separado de `formatarValor` de propósito, e a razão é que formatar
 * todo número quebraria dois casos reais desta ficha:
 *
 *   - ANO. `operacaoInicioAno` 1941 viraria `1.941`, que está errado.
 *   - COORDENADA. Latitude e longitude são lidas por convenção técnica com
 *     ponto decimal, e o separador de milhar não se aplica (nunca passam
 *     de 180).
 *
 * Ou seja, "todo número da tela é medida" é falso, e por isso a escolha é do
 * chamador, e não do formatador. Use apenas em grandeza física com unidade:
 * altimetria, área, distância, volume.
 */
export function formatarMedida(valor: unknown): string {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    return formatarValor(valor);
  }
  return FORMATADOR_MEDIDA.format(valor);
}

const FORMATADOR_PERCENTUAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Percentual em pt-BR, com uma casa decimal e VÍRGULA.
 *
 * Existe porque `Number.prototype.toFixed` devolve ponto decimal em qualquer
 * idioma, e o painel publicava "99.9% com coordenadas" para órgão público. É o
 * mesmo defeito da acentuação: passa por todo teste, por todo build, e só
 * aparece com a tela aberta.
 *
 * Recebe o percentual JÁ CALCULADO (0 a 100), e não a fração, porque metade
 * das chamadas do painel derivam de uma divisão que precisa tratar total zero
 * antes — embutir isso aqui esconderia essa decisão.
 */
export function formatarPercentual(pct: number): string {
  if (!Number.isFinite(pct)) return NAO_INFORMADO;
  return `${FORMATADOR_PERCENTUAL.format(pct)}%`;
}

const FORMATADOR_BYTES = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export function formatarTamanho(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return NAO_INFORMADO;
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let valor = bytes;
  let idx = 0;
  while (valor >= 1024 && idx < unidades.length - 1) {
    valor /= 1024;
    idx += 1;
  }
  return `${FORMATADOR_BYTES.format(valor)} ${unidades[idx]}`;
}

export function formatarDataHora(data: Date): string {
  return data.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

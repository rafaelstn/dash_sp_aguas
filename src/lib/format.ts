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

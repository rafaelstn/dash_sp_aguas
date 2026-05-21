/**
 * Utilidades de imagem no cliente: leitura como data URL e compressão via
 * canvas (reescala mantendo proporção, JPEG progressivo). Compartilhado pela
 * foto da ficha física e pela foto de capa do posto.
 */

export interface OpcoesCompressao {
  /** Maior dimensão (px) após reescala. */
  maxDimensao?: number;
  /** Alvo de bytes; reduz a qualidade até caber. */
  alvoBytes?: number;
}

export async function arquivoParaDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    reader.readAsDataURL(arquivo);
  });
}

export async function comprimirImagemParaDataUrl(
  arquivo: File,
  opcoes: OpcoesCompressao = {},
): Promise<string> {
  const maxDimensao = opcoes.maxDimensao ?? 1600;
  const alvoBytes = opcoes.alvoBytes ?? 2 * 1024 * 1024;

  const dataUrlOriginal = await arquivoParaDataUrl(arquivo);
  const img = await carregarImagem(dataUrlOriginal);

  const escala = Math.min(1, maxDimensao / Math.max(img.width, img.height));
  const largura = Math.round(img.width * escala);
  const altura = Math.round(img.height * escala);

  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível para compressão.');
  ctx.drawImage(img, 0, 0, largura, altura);

  for (const q of [0.82, 0.7, 0.55, 0.4]) {
    const dataUrl = canvas.toDataURL('image/jpeg', q);
    if (aproximarBytesDataUrl(dataUrl) <= alvoBytes) return dataUrl;
  }
  return canvas.toDataURL('image/jpeg', 0.4);
}

export function aproximarBytesDataUrl(dataUrl: string): number {
  const idx = dataUrl.indexOf(',');
  const base64 = idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
  return Math.floor((base64.length * 3) / 4);
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao decodificar imagem.'));
    img.src = src;
  });
}

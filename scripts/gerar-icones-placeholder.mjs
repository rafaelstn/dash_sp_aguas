// scripts/gerar-icones-placeholder.mjs
//
// Gera PNGs placeholder de cor sólida (gov-azul) com letras "SPÁ" centralizadas,
// para o manifest do PWA. Estes ícones são DESCARTÁVEIS — Fernanda substitui
// pelo ícone definitivo na Sprint 3 ou quando design entregar.
//
// Sem dependências externas: usa zlib do Node + escrita binária do PNG.
// Renderiza tipografia via fonte bitmap embutida (chars 'S', 'P', 'Á').
//
// Uso: node scripts/gerar-icones-placeholder.mjs
//
// Gera:
//   public/icons/icon-192.png         (192x192, full bleed, purpose=any)
//   public/icons/icon-512.png         (512x512, full bleed, purpose=any)
//   public/icons/icon-maskable-512.png (512x512, safe zone 80%, purpose=maskable)
//   public/apple-touch-icon.png       (180x180, full bleed)

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// gov-azul hsl(226, 71%, 40%) = #1E40AF
const COR_FUNDO = [0x1e, 0x40, 0xaf];
// branco para o texto
const COR_TEXTO = [0xff, 0xff, 0xff];

// fonte bitmap 7x7 minimalista para 'S', 'P', 'A' com til.
// 1 = pixel pintado, 0 = vazio.
const GLYPH_S = [
  ' #####',
  '#     ',
  '#     ',
  ' #### ',
  '     #',
  '     #',
  '##### ',
];
const GLYPH_P = [
  '##### ',
  '#    #',
  '#    #',
  '##### ',
  '#     ',
  '#     ',
  '#     ',
];
// 'Á' = A com acento agudo. Renderizamos só 'A' por simplicidade visual.
const GLYPH_A = [
  '  ##  ',
  ' #  # ',
  ' #  # ',
  ' #### ',
  ' #  # ',
  ' #  # ',
  ' #  # ',
];

const GLYPHS = [GLYPH_S, GLYPH_P, GLYPH_A];

function crc32Buf(buf) {
  let table = crc32Buf.table;
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
    crc32Buf.table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Buf(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function gerarPng({ tamanho, safeZone = 1.0 }) {
  // Pixel buffer RGB (3 bytes por pixel)
  const px = Buffer.alloc(tamanho * tamanho * 3);
  // pinta o fundo inteiro
  for (let i = 0; i < tamanho * tamanho; i++) {
    px[i * 3] = COR_FUNDO[0];
    px[i * 3 + 1] = COR_FUNDO[1];
    px[i * 3 + 2] = COR_FUNDO[2];
  }

  // posiciona o texto "SPA" centralizado dentro da safe zone
  const charW = 6; // 6 cols por glyph
  const charH = 7;
  const espaco = 1; // 1 col entre chars
  const totalW = GLYPHS.length * charW + (GLYPHS.length - 1) * espaco;
  const totalH = charH;

  // escala: ocupar safeZone% da menor dimensão
  const safeSize = tamanho * safeZone;
  const escalaPorLargura = Math.floor(safeSize / totalW);
  const escalaPorAltura = Math.floor(safeSize / totalH);
  const escala = Math.max(1, Math.min(escalaPorLargura, escalaPorAltura));

  const renderW = totalW * escala;
  const renderH = totalH * escala;
  const startX = Math.floor((tamanho - renderW) / 2);
  const startY = Math.floor((tamanho - renderH) / 2);

  for (let g = 0; g < GLYPHS.length; g++) {
    const glyph = GLYPHS[g];
    const offsetX = startX + g * (charW + espaco) * escala;
    for (let row = 0; row < charH; row++) {
      const linha = glyph[row];
      for (let col = 0; col < charW; col++) {
        if (linha[col] === '#') {
          // pinta um quadrado escala×escala
          for (let dy = 0; dy < escala; dy++) {
            for (let dx = 0; dx < escala; dx++) {
              const x = offsetX + col * escala + dx;
              const y = startY + row * escala + dy;
              if (x < 0 || x >= tamanho || y < 0 || y >= tamanho) continue;
              const i = (y * tamanho + x) * 3;
              px[i] = COR_TEXTO[0];
              px[i + 1] = COR_TEXTO[1];
              px[i + 2] = COR_TEXTO[2];
            }
          }
        }
      }
    }
  }

  // adiciona acento agudo "´" no terceiro glyph (Á): pequeno traço inclinado
  // acima do A, dentro da safe zone.
  const acentoY = startY - Math.max(2, Math.floor(escala * 1.2));
  const acentoX0 =
    startX + 2 * (charW + espaco) * escala + Math.floor(charW * escala * 0.4);
  const acentoLen = Math.max(2, Math.floor(escala * 1.5));
  for (let i = 0; i < acentoLen; i++) {
    const x = acentoX0 + i;
    const y = acentoY + i;
    if (x < 0 || x >= tamanho || y < 0 || y >= tamanho) continue;
    const idx = (y * tamanho + x) * 3;
    px[idx] = COR_TEXTO[0];
    px[idx + 1] = COR_TEXTO[1];
    px[idx + 2] = COR_TEXTO[2];
  }

  // Monta o stream PNG com filtro 0 (None) por linha.
  const filtrado = Buffer.alloc(tamanho * (tamanho * 3 + 1));
  for (let y = 0; y < tamanho; y++) {
    filtrado[y * (tamanho * 3 + 1)] = 0; // filtro None
    px.copy(filtrado, y * (tamanho * 3 + 1) + 1, y * tamanho * 3, (y + 1) * tamanho * 3);
  }

  const idatData = deflateSync(filtrado);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), // signature
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  return png;
}

const OUT_DIR = resolve(ROOT, 'public/icons');
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(resolve(OUT_DIR, 'icon-192.png'), gerarPng({ tamanho: 192 }));
writeFileSync(resolve(OUT_DIR, 'icon-512.png'), gerarPng({ tamanho: 512 }));
writeFileSync(
  resolve(OUT_DIR, 'icon-maskable-512.png'),
  gerarPng({ tamanho: 512, safeZone: 0.6 }),
);
writeFileSync(
  resolve(ROOT, 'public/apple-touch-icon.png'),
  gerarPng({ tamanho: 180 }),
);

console.log('Ícones placeholder gerados em public/icons/ e public/apple-touch-icon.png');

import 'server-only';
import { isAbsolute, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { marked } from 'marked';

/**
 * Converte o markdown do relatório em um HTML print-ready (A4, identidade
 * visual do Governo de SP). Mesma lógica do CLI scripts/gerar-pdf-relatorio.mjs;
 * o CSS é mantido em paridade com aquele script (a duplicação é deliberada:
 * o .mjs é ESM puro fora do build do Next e não importa este módulo TS).
 *
 * `baseDir` resolve src de imagens relativas (![](foto.jpg)) para file:// quando
 * o relatório embute fotos do acervo; sem ele, imagens relativas ficam como
 * estão (o relatório do posto não usa imagens locais por padrão).
 */
export function montarHtmlRelatorio(
  markdown: string,
  opts: { baseDir?: string } = {},
): string {
  marked.setOptions({ gfm: true, breaks: false });

  let body: string;
  if (opts.baseDir) {
    const baseDir = opts.baseDir;
    const renderer = new marked.Renderer();
    const imageOrig = renderer.image.bind(renderer);
    renderer.image = (token) => {
      const src = token?.href ?? '';
      if (src && !/^[a-z]+:\/\//i.test(src) && !src.startsWith('data:')) {
        const abs = isAbsolute(src) ? src : resolve(baseDir, src);
        if (existsSync(abs)) {
          return imageOrig({ ...token, href: pathToFileURL(abs).href });
        }
      }
      return imageOrig(token);
    };
    body = marked.parse(markdown, { renderer }) as string;
  } else {
    body = marked.parse(markdown) as string;
  }

  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>Relatório</title>
<style>
  @page { size: A4; margin: 22mm 18mm 22mm 18mm; }
  html, body { background: #fff; }
  body {
    font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    color: #1f2937;
    font-size: 11.5pt;
    line-height: 1.55;
    margin: 0;
  }
  h1 {
    font-size: 20pt;
    color: #0b3d91;
    border-bottom: 2px solid #0b3d91;
    padding-bottom: 6pt;
    margin: 0 0 14pt 0;
  }
  h2 {
    font-size: 15pt;
    color: #0b3d91;
    margin-top: 22pt;
    margin-bottom: 8pt;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12.5pt;
    color: #0b3d91;
    margin-top: 16pt;
    margin-bottom: 6pt;
    page-break-after: avoid;
  }
  p { margin: 6pt 0; text-align: justify; }
  ul, ol { margin: 6pt 0 6pt 18pt; padding: 0; }
  li { margin: 3pt 0; }
  strong { color: #111827; }
  code {
    font-family: Consolas, "Courier New", monospace;
    font-size: 10pt;
    background: #f3f4f6;
    padding: 1pt 4pt;
    border-radius: 3pt;
  }
  hr { border: 0; border-top: 1px solid #d1d5db; margin: 18pt 0; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 10pt 0;
    font-size: 10.5pt;
    page-break-inside: avoid;
  }
  th, td {
    border: 1px solid #d1d5db;
    padding: 5pt 8pt;
    text-align: left;
    vertical-align: top;
  }
  th { background: #e5edf8; color: #0b3d91; }
  tr:nth-child(even) td { background: #f9fafb; }
  blockquote {
    border-left: 3px solid #0b3d91;
    background: #f3f6fb;
    margin: 8pt 0;
    padding: 6pt 12pt;
    color: #374151;
  }
</style>
</head>
<body>
${body}
</body>
</html>`;
}

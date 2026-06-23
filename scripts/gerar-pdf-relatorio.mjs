import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname, isAbsolute } from 'node:path'
import { pathToFileURL } from 'node:url'
import { marked } from 'marked'

const [, , mdPath, htmlPath] = process.argv
if (!mdPath || !htmlPath) {
  console.error('uso: node gerar-pdf-relatorio.mjs <md> <html-out>')
  process.exit(1)
}

const mdAbs = resolve(mdPath)
const mdDir = dirname(mdAbs)
const md = readFileSync(mdAbs, 'utf8')

marked.setOptions({ gfm: true, breaks: false })

// Resolve src de <img> ou ![](...) relativos ao diretorio do MD para file://
// absoluto, senao o Chrome headless nao consegue carregar (HTML temp esta em
// outra pasta).
const renderer = new marked.Renderer()
const imageOrig = renderer.image.bind(renderer)
renderer.image = (token) => {
  const src = token?.href ?? ''
  if (src && !/^[a-z]+:\/\//i.test(src) && !src.startsWith('data:')) {
    const abs = isAbsolute(src) ? src : resolve(mdDir, src)
    if (existsSync(abs)) {
      return imageOrig({ ...token, href: pathToFileURL(abs).href })
    }
  }
  return imageOrig(token)
}

const body = marked.parse(md, { renderer })

const html = `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8" />
<title>Relatorio</title>
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

  .capa {
    height: 247mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: center;
    text-align: center;
    page-break-after: always;
    padding: 8mm 0 12mm 0;
    box-sizing: border-box;
  }
  .capa-topo {
    color: #0b3d91;
    font-weight: 700;
    font-size: 13pt;
    letter-spacing: 1pt;
    line-height: 1.6;
  }
  .capa-topo p { margin: 4pt 0; }
  .capa-topo img.logo-capa {
    width: 110px;
    height: auto;
    margin: 0 auto 14pt auto;
    display: block;
    border: 0;
    box-shadow: none;
  }
  .capa-titulo h1 {
    font-size: 36pt;
    color: #0b3d91;
    border: none;
    margin: 0 0 8pt 0;
    padding: 0;
    letter-spacing: 2pt;
  }
  .capa-titulo h2 {
    font-size: 22pt;
    color: #0b3d91;
    margin: 0;
    font-weight: 400;
    letter-spacing: 1pt;
  }
  .capa-projeto {
    font-size: 14pt;
    color: #111827;
  }
  .capa-projeto p { margin: 6pt 0; }
  .capa-rodape {
    font-size: 12pt;
    color: #374151;
    border-top: 2px solid #0b3d91;
    padding-top: 10pt;
    width: 60%;
  }
  .capa-rodape p { margin: 4pt 0; }

  .quebra-pagina { page-break-before: always; }

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
  img {
    max-width: 100%;
    /* A4 util ~ 253mm de altura; deixamos folga pra caber legenda e
       cabecalho da secao sem cortar a imagem entre paginas. */
    max-height: 175mm;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
    margin: 10pt auto;
    border: 1px solid #d1d5db;
    border-radius: 4pt;
    box-shadow: 0 2pt 4pt rgba(11, 61, 145, 0.08);
    page-break-inside: avoid;
    break-inside: avoid;
  }
  /* Capa fica fora desse limite (logo). */
  .capa img { max-height: none; }
  p:has(> img:only-child) {
    text-align: center;
    margin: 12pt 0;
  }
  figcaption, .legenda {
    font-size: 9.5pt;
    color: #6b7280;
    text-align: center;
    margin-top: 2pt;
    margin-bottom: 12pt;
    font-style: italic;
  }
</style>
</head>
<body>
${body}
</body>
</html>`

writeFileSync(resolve(htmlPath), html, 'utf8')
console.log('html ok:', htmlPath)

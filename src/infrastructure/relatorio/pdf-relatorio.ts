import 'server-only';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

/**
 * Conversão HTML -> PDF via navegador headless (Chrome/Edge) em modo
 * `--headless --print-to-pdf`. É o mesmo motor que o pipeline manual do CLI
 * (scripts/gerar-pdf-relatorio.mjs) pressupõe, agora encapsulado pra a rota.
 *
 * O ambiente alvo (PRODESP/on-prem) tem navegador instalado; em serverless
 * puro não haveria binário e a chamada lança `RenderizadorPdfIndisponivel`,
 * tratado como 503 na rota (nunca devolve um "PDF" falso).
 */

export class RenderizadorPdfIndisponivel extends Error {
  constructor() {
    super('Nenhum navegador headless disponível para gerar PDF.');
    this.name = 'RenderizadorPdfIndisponivel';
  }
}

export class FalhaRenderizacaoPdf extends Error {
  constructor(causa: string) {
    super(`Falha ao renderizar PDF: ${causa}`);
    this.name = 'FalhaRenderizacaoPdf';
  }
}

const TIMEOUT_RENDER_MS = 20_000;

/** Binários candidatos, em ordem de preferência. Override por env. */
function candidatosBinario(): string[] {
  const candidatos: string[] = [];
  const override = process.env.CHROME_BIN ?? process.env.CHROMIUM_BIN;
  if (override) candidatos.push(override);
  candidatos.push(
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  );
  return candidatos;
}

function resolverBinario(): string | null {
  for (const bin of candidatosBinario()) {
    // Caminhos absolutos: confirma existência. Nomes no PATH (Linux) entram
    // como tentativa direta no spawn.
    if (bin.includes('/') || bin.includes('\\')) {
      if (existsSync(bin)) return bin;
    } else {
      return bin;
    }
  }
  return null;
}

export async function htmlParaPdf(html: string): Promise<Buffer> {
  const bin = resolverBinario();
  if (!bin) {
    throw new RenderizadorPdfIndisponivel();
  }

  const dir = await mkdtemp(join(tmpdir(), 'spaguas-relatorio-'));
  const htmlPath = join(dir, 'relatorio.html');
  const pdfPath = join(dir, 'relatorio.pdf');
  const perfilDir = join(dir, 'perfil');

  try {
    await writeFile(htmlPath, html, 'utf8');

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        bin,
        [
          '--headless=new',
          '--disable-gpu',
          '--no-sandbox',
          '--no-pdf-header-footer',
          `--user-data-dir=${perfilDir}`,
          `--print-to-pdf=${pdfPath}`,
          `file://${htmlPath.replace(/\\/g, '/')}`,
        ],
        { stdio: 'ignore' },
      );

      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        killTimer = setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 2_000);
        killTimer.unref?.();
        reject(new FalhaRenderizacaoPdf('timeout'));
      }, TIMEOUT_RENDER_MS);

      proc.on('close', (code) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        if (code === 0 && existsSync(pdfPath)) resolve();
        else reject(new FalhaRenderizacaoPdf(`exit ${code}`));
      });
      proc.on('error', (err) => {
        clearTimeout(timer);
        if (killTimer) clearTimeout(killTimer);
        reject(err);
      });
    });

    return await readFile(pdfPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

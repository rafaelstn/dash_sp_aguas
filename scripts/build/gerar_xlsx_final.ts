/**
 * Gera o XLSX final de resposta para a ANA sem subir o servidor.
 *
 * Uso (com tsx):
 *   npx tsx scripts/build/gerar_xlsx_final.ts
 *
 * Escreve em docs/relatorios/SP_AGUAS_Inventario_<data>.xlsx
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Carrega .env.local manualmente (sem dotenv como dependency)
const envText = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (!m) continue;
  const key = m[1];
  const value = m[2];
  if (key && value !== undefined && !process.env[key]) {
    process.env[key] = value.replace(/^["']|["']$/g, '');
  }
}

import { exportarInventarioAna } from '../../src/application/use-cases/inventario-ana/exportar';
import { inventarioAnaExportRepository } from '../../src/infrastructure/db/inventario-ana-export-repository.pg';
import { sql } from '../../src/infrastructure/db/client';

async function main() {
  const lote = await sql<Array<{ id: string; nome: string }>>`
    SELECT id, nome FROM ana_revisao_lote ORDER BY criado_em DESC LIMIT 1
  `;
  if (!lote[0]) {
    console.error('Sem lote ativo.');
    process.exit(1);
  }
  console.log(`Lote: ${lote[0].nome} (${lote[0].id})`);

  const { buffer, nomeArquivo, estatisticas } = await exportarInventarioAna(
    inventarioAnaExportRepository,
    lote[0].id,
  );

  const outDir = join(process.cwd(), 'docs', 'relatorios');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, nomeArquivo);
  writeFileSync(outPath, buffer);

  console.log(`OK: ${outPath}`);
  console.log(`  total linhas: ${estatisticas.total}`);
  console.log(`  linhas com correcao (amarelo): ${estatisticas.comDiff}`);
  console.log(`  bytes: ${buffer.byteLength}`);

  // Encerra o pool postgres
  await (sql as unknown as { end: () => Promise<void> }).end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

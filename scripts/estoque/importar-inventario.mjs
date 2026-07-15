/**
 * Carga inicial UNICA do inventario de estoque da SP Aguas para o modulo novo
 * (migrations 0054-0059). Le `ops/estoque/planilha-inicial.xlsx` (nao versionada)
 * e importa as 6 abas conforme o MAPA DE IMPORTACAO de docs/arquitetura/modulo-estoque.md.
 *
 * Espelha o import do Monitor (scripts/monitor/importar-estacoes-flu-piezo.mjs):
 * parsing fora do banco, upsert idempotente por chave natural. IDEMPOTENTE: rodar
 * 2x NAO duplica (ON CONFLICT em chave_import / material dedup / saldo por chave).
 * Registra `entrada` (ou `baixa` no DESCARTE) no ledger APENAS para linha/saldo
 * efetivamente INSERIDO (detecta via `xmax = 0`), pra o saldo bater com o ledger
 * desde o dia 1 e a reexecucao nao inflar o ledger.
 *
 * O de-para de ESTADO e a normalizacao de LOCAL abaixo ESPELHAM o dominio
 * (src/domain/estoque/estado.ts e local.ts). Como .mjs nao importa .ts sem build,
 * a logica e reimplementada aqui em JS; manter em sincronia se o dominio mudar
 * (mesmo padrao do normalizarTimestamp do import do Monitor).
 *
 * NAO roda sozinho no boot. Uso (apos aplicar as migrations no banco):
 *   node --env-file=.env.local scripts/estoque/importar-inventario.mjs
 */
import postgres from 'postgres';
import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const CAMINHO_PLANILHA = resolve(process.cwd(), 'ops/estoque/planilha-inicial.xlsx');
// usuario_id do ledger para a carga inicial. A coluna NAO tem FK (migration 0059);
// UUID de sistema estavel identifica a origem "import" na trilha de auditoria.
const USUARIO_IMPORT = '00000000-0000-0000-0000-000000000000';

// ── Normalizacao (espelha o dominio) ─────────────────────────────────────────
function norm(v) {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

const REGRAS_ESTADO = [
  ['sucata', ['SUCATA', 'INSERVIVEL', 'IMPRESTAVEL']],
  ['defeito', ['COM DEFEITO', 'DEFEITO', 'COM PROBLEMA', 'QUEIMADO', 'NAO FUNCIONA']],
  ['novo', ['NA CAIXA', 'NOVO', 'NOVA', 'LACRADO', 'VEDADO']],
  ['bom', ['PERFEITO', 'OTIMO', 'BOA', 'BOM', 'OK']],
  ['usado', ['USADO', 'USADA', 'REGULAR', 'DUVIDOSO']],
];

function mapearEstado(bruto) {
  if (bruto === null || bruto === undefined) return null;
  const n = norm(bruto);
  if (n === '' || n === '?') return null;
  const tokens = n.split(' ');
  for (const [estado, palavras] of REGRAS_ESTADO) {
    for (const p of palavras) {
      if (p.includes(' ')) {
        if (n.includes(p)) return estado;
      } else if (tokens.includes(p)) {
        return estado;
      }
    }
  }
  return null;
}

function normalizarCampoLocal(v) {
  if (v === null || v === undefined) return null;
  const limpo = String(v).trim().toUpperCase().replace(/\s+/g, ' ');
  if (limpo === '' || limpo === '?' || limpo === '-' || limpo === 'N/A') return null;
  return limpo;
}

function montarRotulo(unidade, sala, prateleira, armario) {
  const partes = [unidade];
  if (sala) partes.push(`SALA ${sala}`);
  if (prateleira) partes.push(`PRAT ${prateleira}`);
  if (armario) partes.push(`ARM ${armario}`);
  return partes.join(' / ');
}

// Identificador de patrimonio: 'S/N','SN','?' etc NAO contam (viram null).
function limparIdentificador(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (t === '') return null;
  const n = norm(t);
  if (['S N', 'SN', 'N A', 'SEM', 'SEM NUMERO', 'SEM SERIE', 'NAO TEM', '?', '-'].includes(n)) {
    return null;
  }
  return t;
}

function texto(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

function parseData(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  const ms = Date.parse(String(v));
  return Number.isNaN(ms) ? null : new Date(ms).toISOString().slice(0, 10);
}

function parseQuantidade(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 0;
}

// Valor de celula exceljs -> primitivo (trata rich text, hyperlink, formula, data).
function valorCelula(cell) {
  const v = cell?.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if ('text' in v && v.text != null) return v.text;
    if ('result' in v && v.result != null) return v.result;
    if ('richText' in v && Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
    if ('hyperlink' in v && v.hyperlink != null) return v.hyperlink;
    return null;
  }
  return v;
}

// ── Mapa de colunas (aliases normalizados) ───────────────────────────────────
const ALIASES = {
  codigo: ['CODIGO', 'CODIGO MATERIAL', 'COD'],
  codigoSpaguas: ['CODIGOSPAGUAS', 'CODIGO SPAGUAS', 'COD SPAGUAS', 'COD SP AGUAS'],
  patDaee: ['PAT DAEE', 'PATDAEE'],
  outrosPat: ['OUTROS PAT', 'OUTRO PAT'],
  numeroSerie: ['NUMERO DE SERIE', 'NUMERO SERIE', 'N SERIE', 'SERIE', 'IMEI', 'NUMERO DE SERIE IMEI'],
  descricao: ['DESCRICAO DE MATERIAL', 'DESCRICAO DO MATERIAL', 'DESCRICAO MATERIAL', 'DESCRICAO', 'ITEM', 'MATERIAL'],
  marca: ['MARCA'],
  modelo: ['MODELO'],
  helice: ['HELICE'],
  local: ['LOCAL', 'LOCALIZACAO'],
  sala: ['SALA'],
  prateleira: ['PRATELEIRA', 'PRAT'],
  armario: ['ARMARIO', 'ARM'],
  data: ['DATA', 'DATA AQUISICAO', 'DATA DE AQUISICAO'],
  observacao: ['OBSERVACAO', 'OBSERVACOES', 'OBS', 'ESTADO', 'CONDICAO'],
  quantidade: ['QUANTIDADE', 'QTD', 'QTDE', 'QUANT'],
  tamanho: ['TAMANHO', 'BITOLA'],
};

// Descobre a linha de cabecalho (1..6): a que mais casa aliases conhecidos.
function acharCabecalho(ws) {
  let melhor = { linha: 1, casados: -1, mapa: {} };
  const todosAliases = Object.values(ALIASES).flat();
  for (let r = 1; r <= Math.min(6, ws.rowCount || 6); r++) {
    const row = ws.getRow(r);
    const mapa = {};
    let casados = 0;
    row.eachCell({ includeEmpty: false }, (cell, col) => {
      const h = norm(valorCelula(cell));
      if (!h) return;
      if (mapa[h] === undefined) mapa[h] = col;
      if (todosAliases.includes(h)) casados++;
    });
    if (casados > melhor.casados) melhor = { linha: r, casados, mapa };
  }
  return melhor;
}

function fazerLeitor(mapa) {
  return (row, campo) => {
    for (const alias of ALIASES[campo]) {
      const col = mapa[alias];
      if (col !== undefined) {
        const v = valorCelula(row.getCell(col));
        if (v !== null && v !== undefined && String(v).trim() !== '') return v;
      }
    }
    return null;
  };
}

function classificarAba(nome) {
  const n = norm(nome);
  const unidade = n.includes('ARARAQUARA') ? 'ARARAQUARA' : 'PENHA';
  if (n.includes('DESCARTE')) return { tipo: 'descarte', unidade };
  if (n.includes('QUANTIFICAVEL') || n.includes('QUANTIFICAVEIS')) return { tipo: 'quantificavel', unidade };
  if (n.includes('MODEN') || n.includes('MODEM')) return { tipo: 'modens', unidade: 'PENHA' };
  if (n.includes('GERAL') || n.includes('PENHA') || n.includes('ARARAQUARA')) {
    return { tipo: 'serializado', unidade };
  }
  return { tipo: 'ignorar', unidade };
}

// ── Banco ────────────────────────────────────────────────────────────────────
const sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false, connect_timeout: 15 });

const cacheLocal = new Map();
async function obterOuCriarLocal(unidade, salaBruta, prateleiraBruta, armarioBruta, localBruto) {
  const sala = normalizarCampoLocal(salaBruta) ?? normalizarCampoLocal(localBruto);
  const prateleira = normalizarCampoLocal(prateleiraBruta);
  const armario = normalizarCampoLocal(armarioBruta);
  const chave = `${unidade}|${sala ?? ''}|${prateleira ?? ''}|${armario ?? ''}`;
  if (cacheLocal.has(chave)) return cacheLocal.get(chave);
  const rotulo = montarRotulo(unidade, sala, prateleira, armario);
  const linhas = await sql`
    INSERT INTO estoque_locais (unidade, sala, prateleira, armario, rotulo)
    VALUES (${unidade}, ${sala}, ${prateleira}, ${armario}, ${rotulo})
    ON CONFLICT (unidade, COALESCE(sala, ''), COALESCE(prateleira, ''), COALESCE(armario, ''))
    DO UPDATE SET rotulo = estoque_locais.rotulo
    RETURNING id
  `;
  const id = linhas[0].id;
  cacheLocal.set(chave, id);
  return id;
}

const cacheMaterial = new Map();
async function obterOuCriarMaterialQuant(descricao, marca, modelo) {
  const chave = `${norm(descricao)}|${norm(marca)}|${norm(modelo)}`;
  if (cacheMaterial.has(chave)) return cacheMaterial.get(chave);
  const linhas = await sql`
    INSERT INTO estoque_materiais (descricao, marca, modelo, natureza)
    VALUES (${descricao}, ${marca}, ${modelo}, 'quantificavel')
    ON CONFLICT (natureza, lower(descricao), lower(COALESCE(marca, '')), lower(COALESCE(modelo, '')))
    DO UPDATE SET descricao = estoque_materiais.descricao
    RETURNING id
  `;
  const id = linhas[0].id;
  cacheMaterial.set(chave, id);
  return id;
}

function chaveImport(unidade, index, ids, descricao, marca, modelo, serie) {
  // Ordem: `codigo` (CODIGO/CODIGO MATERIAL) e o UNICO identificador POR UNIDADE
  // nessa planilha ("1SPA26PENHA", "001SPA26Arara"). CODIGOSPAGUAS ("SPA26") e um
  // codigo de LOTE/projeto, IGUAL em toda a GERAL PENHA: se preferido, colapsaria
  // as ~800 linhas numa so (colisao do ON CONFLICT). MODENS caem no IMEI (serie).
  const preferida = ids.codigo ?? ids.numeroSerie ?? ids.patDaee ?? ids.codigoSpaguas;
  if (preferida) return `${unidade}:${norm(preferida)}`;
  const h = createHash('sha1')
    .update([unidade, descricao, marca, modelo, serie, index].map((x) => norm(x)).join('|'))
    .digest('hex')
    .slice(0, 16);
  return `${unidade}:H:${h}`;
}

async function upsertUnidade(u) {
  // ON CONFLICT (chave_import): reprocessar NAO duplica. xmax=0 => inserida agora.
  const linhas = await sql`
    INSERT INTO estoque_unidades (
      codigo, codigo_spaguas, pat_daee, outros_pat, numero_serie, helice,
      descricao, marca, modelo, estado, status, local_id, data_aquisicao,
      observacao, chave_import
    ) VALUES (
      ${u.codigo}, ${u.codigoSpaguas}, ${u.patDaee}, ${u.outrosPat}, ${u.numeroSerie}, ${u.helice},
      ${u.descricao}, ${u.marca}, ${u.modelo}, ${u.estado}, ${u.status}, ${u.localId}, ${u.dataAquisicao},
      ${u.observacao}, ${u.chaveImport}
    )
    ON CONFLICT (chave_import) WHERE chave_import IS NOT NULL DO UPDATE SET
      codigo = EXCLUDED.codigo, codigo_spaguas = EXCLUDED.codigo_spaguas,
      pat_daee = EXCLUDED.pat_daee, outros_pat = EXCLUDED.outros_pat,
      numero_serie = EXCLUDED.numero_serie, helice = EXCLUDED.helice,
      descricao = EXCLUDED.descricao, marca = EXCLUDED.marca, modelo = EXCLUDED.modelo,
      estado = EXCLUDED.estado, status = EXCLUDED.status, local_id = EXCLUDED.local_id,
      data_aquisicao = EXCLUDED.data_aquisicao, observacao = EXCLUDED.observacao,
      atualizado_em = NOW()
    RETURNING id, (xmax = 0) AS inserida
  `;
  return linhas[0];
}

async function ledgerSerializado(tipo, unidadeId, localDestino, statusNovo, motivo) {
  await sql`
    INSERT INTO estoque_movimentacoes (
      tipo, unidade_id, quantidade, local_destino, status_novo, motivo, usuario_id
    ) VALUES (
      ${tipo}, ${unidadeId}::uuid, 1, ${localDestino}, ${statusNovo}, ${motivo}, ${USUARIO_IMPORT}::uuid
    )
  `;
}

async function upsertSaldoEntrada(materialId, localId, tamanho, quantidade) {
  // Carga inicial: DO NOTHING no conflito (nao ACUMULA na reexecucao). Ledger
  // entrada so pra saldo efetivamente inserido -> saldo == ledger e idempotente.
  const linhas = await sql`
    INSERT INTO estoque_saldos (material_id, local_id, quantidade, tamanho)
    VALUES (${materialId}::uuid, ${localId}::uuid, ${quantidade}, ${tamanho})
    ON CONFLICT (material_id, local_id, COALESCE(tamanho, '')) DO NOTHING
    RETURNING id
  `;
  const inserido = linhas.length > 0;
  if (inserido && quantidade > 0) {
    await sql`
      INSERT INTO estoque_movimentacoes (
        tipo, material_id, quantidade, local_destino, usuario_id
      ) VALUES (
        'entrada', ${materialId}::uuid, ${quantidade}, ${localId}::uuid, ${USUARIO_IMPORT}::uuid
      )
    `;
  }
  return inserido;
}

// ── Processamento por aba ────────────────────────────────────────────────────
async function processarSerializado(ws, unidade, ehDescarte) {
  const cab = acharCabecalho(ws);
  const ler = fazerLeitor(cab.mapa);
  const rel = { inseridas: 0, atualizadas: 0, puladas: 0 };
  const ehModens = classificarAba(ws.name).tipo === 'modens';

  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ids = {
      codigo: limparIdentificador(ler(row, 'codigo')),
      codigoSpaguas: limparIdentificador(ler(row, 'codigoSpaguas')),
      patDaee: limparIdentificador(ler(row, 'patDaee')),
      numeroSerie: limparIdentificador(ler(row, 'numeroSerie')),
    };
    let descricao = texto(ler(row, 'descricao'));
    const marca = texto(ler(row, 'marca'));
    const modelo = texto(ler(row, 'modelo'));
    const outrosPat = limparIdentificador(ler(row, 'outrosPat'));
    const helice = texto(ler(row, 'helice'));
    const observacaoBruta = texto(ler(row, 'observacao'));

    // Linha REAL de item. Nas abas GERAL a coluna CODIGO vem preenchida em
    // sequencia ate o fim da planilha (template "pra baixo"), entao um CODIGO
    // sozinho NAO e um item: exigir DESCRICAO real, senao pular (evita ingerir
    // centenas de linhas de template como patrimonio fantasma). MODENS
    // identifica pelo IMEI (numeroSerie) e tem descricao fixa "Modem".
    if (ehModens) {
      if (!ids.numeroSerie) {
        rel.puladas++;
        continue;
      }
      if (!descricao) descricao = 'Modem';
    } else if (!descricao) {
      rel.puladas++;
      continue;
    }

    const localId = await obterOuCriarLocal(
      unidade,
      ler(row, 'sala'),
      ler(row, 'prateleira'),
      ler(row, 'armario'),
      ler(row, 'local'),
    );

    const estado = mapearEstado(observacaoBruta);
    const status = ehDescarte ? 'descarte' : estado === 'defeito' ? 'defeito' : 'ativo';
    const chave = chaveImport(unidade, r, ids, descricao, marca, modelo, ids.numeroSerie);

    const res = await upsertUnidade({
      codigo: ids.codigo,
      codigoSpaguas: ids.codigoSpaguas,
      patDaee: ids.patDaee,
      outrosPat,
      numeroSerie: ids.numeroSerie,
      helice,
      descricao,
      marca,
      modelo,
      estado,
      status,
      localId,
      dataAquisicao: parseData(ler(row, 'data')),
      observacao: observacaoBruta, // preserva o bruto (de-para nao substitui)
      chaveImport: chave,
    });

    if (res.inserida) {
      rel.inseridas++;
      if (ehDescarte) {
        await ledgerSerializado('baixa', res.id, null, 'descarte', 'carga inicial: descarte');
      } else {
        await ledgerSerializado('entrada', res.id, localId, null, null);
      }
    } else {
      rel.atualizadas++;
    }
  }
  return rel;
}

async function processarQuantificavel(ws, unidade) {
  const cab = acharCabecalho(ws);
  const ler = fazerLeitor(cab.mapa);
  const rel = { inseridas: 0, atualizadas: 0, puladas: 0 };

  // Agrega por (material, local, tamanho) somando quantidade antes de inserir:
  // duas linhas do mesmo item/local/tamanho viram um saldo unico (o DO NOTHING
  // nao perderia a 2a linha silenciosamente) e um unico ledger de entrada.
  const agregado = new Map();
  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const descricao = texto(ler(row, 'descricao'));
    const quantidade = parseQuantidade(ler(row, 'quantidade'));
    if (!descricao) {
      rel.puladas++;
      continue;
    }
    const modelo = texto(ler(row, 'modelo'));
    const marca = texto(ler(row, 'marca'));
    const tamanho = texto(ler(row, 'tamanho'));
    const localId = await obterOuCriarLocal(
      unidade,
      ler(row, 'sala'),
      ler(row, 'prateleira'),
      ler(row, 'armario'),
      ler(row, 'local'),
    );
    const materialId = await obterOuCriarMaterialQuant(descricao, marca, modelo);
    const chave = `${materialId}|${localId}|${tamanho ?? ''}`;
    const acc = agregado.get(chave) ?? { materialId, localId, tamanho, quantidade: 0 };
    acc.quantidade += quantidade;
    agregado.set(chave, acc);
  }

  for (const acc of agregado.values()) {
    const inserido = await upsertSaldoEntrada(acc.materialId, acc.localId, acc.tamanho, acc.quantidade);
    if (inserido) rel.inseridas++;
    else rel.atualizadas++;
  }
  return rel;
}

// ── Main ─────────────────────────────────────────────────────────────────────
try {
  console.log('lendo planilha:', CAMINHO_PLANILHA);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(CAMINHO_PLANILHA);

  const totais = { inseridas: 0, atualizadas: 0, puladas: 0 };
  for (const ws of wb.worksheets) {
    const { tipo, unidade } = classificarAba(ws.name);
    if (tipo === 'ignorar') {
      console.log(`aba "${ws.name}": ignorada (nao reconhecida)`);
      continue;
    }
    const linhasDados = (ws.rowCount || 0) - 1;
    if (linhasDados <= 0) {
      console.log(`aba "${ws.name}": vazia, pulada`);
      continue;
    }

    let rel;
    if (tipo === 'quantificavel') {
      rel = await processarQuantificavel(ws, unidade);
    } else {
      rel = await processarSerializado(ws, unidade, tipo === 'descarte');
    }
    totais.inseridas += rel.inseridas;
    totais.atualizadas += rel.atualizadas;
    totais.puladas += rel.puladas;
    console.log(
      `aba "${ws.name}" [${tipo}/${unidade}]: inseridas ${rel.inseridas} | atualizadas ${rel.atualizadas} | puladas ${rel.puladas}`,
    );
  }

  console.log(
    `\nTOTAL: inseridas ${totais.inseridas} | atualizadas ${totais.atualizadas} | puladas ${totais.puladas}`,
  );

  // Conciliacao de sanidade: saldo mantido == soma do ledger (por material/local/tamanho).
  const divergencias = await sql`
    WITH ledger AS (
      SELECT material_id, local_destino AS local_id, SUM(quantidade)::int AS soma
        FROM estoque_movimentacoes
       WHERE material_id IS NOT NULL AND tipo = 'entrada'
       GROUP BY material_id, local_destino
    )
    SELECT s.material_id, s.local_id, s.quantidade, COALESCE(l.soma, 0) AS soma_ledger
      FROM estoque_saldos s
      LEFT JOIN ledger l ON l.material_id = s.material_id AND l.local_id = s.local_id
     WHERE s.quantidade <> COALESCE(l.soma, 0)
  `;
  if (divergencias.length === 0) {
    console.log('conciliacao OK: saldo == soma do ledger (entradas de carga inicial).');
  } else {
    console.log(`ATENCAO: ${divergencias.length} divergencia(s) saldo x ledger:`, divergencias);
  }
} catch (e) {
  console.log('ERRO:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

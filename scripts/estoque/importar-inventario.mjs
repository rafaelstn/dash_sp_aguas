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
 * Os avisos de qualidade do dado (tudo que o script NAO tem como decidir sozinho)
 * sao impressos E gravados em `estoque_desconformidades` (migration 0071), onde o
 * operador os ve e trata. A gravacao e idempotente pela `chave` do assunto do
 * aviso e nunca reabre o que ja foi resolvido ou ignorado.
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

// Identificador de patrimonio: 'S/N','S/CHAPA','S/PLACA','S/PATRIMONIO','-' etc
// NAO contam (viram null). Medido na planilha de 16/09/2026: sem isso 106 "S/CHAPA",
// 54 "S/PLACA", 30 "S/PATRIMONIO" e 406 "-" entravam como identificador real.
const SEM_IDENTIFICADOR = /^(S|SEM) ?(N|NUMERO|SERIE|CHAPA|PLACA|PATRIMONIO|PAT|IDENTIFICACAO)?$/;
function limparIdentificador(v) {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  if (t === '') return null;
  const n = norm(t);
  if (n === '' || SEM_IDENTIFICADOR.test(n) || ['N A', 'NAO TEM', 'NAO POSSUI'].includes(n)) {
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
  // Leitura do codigo de barras ja colado, feita pelo orgao com leitor.
  confirmacao: ['CONFIRMACAO DO CODIGO', 'CONFIRMACAO'],
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

// ── Avisos de qualidade do dado ──────────────────────────────────────────────
// Nada aqui altera o que e gravado no inventario: so torna VISIVEL o que antes se
// perdia calado (linha pulada com etiqueta lida, chave repetida sobrescrevendo,
// item suspeito). Cada aviso vira uma desconformidade persistente (0071).
//
// `sujeito` e o que identifica o ASSUNTO do aviso alem de tipo/aba/linha, e entra
// na chave; o `detalhe` NAO entra. Se entrasse, corrigir metade do problema na
// planilha (preencher a marca, mudar a contagem de uma coluna) criaria um registro
// novo e deixaria o antigo aberto para sempre, e dois avisos de mesmo texto (o
// mesmo valor repetido em PAT DAEE e em OUTROS PAT) colidiriam na mesma chave.
const avisos = [];
function avisar(tipo, aba, linha, detalhe, { sujeito = '', dados = {}, chaveSemPosicao = false } = {}) {
  const partes = chaveSemPosicao ? [tipo, sujeito] : [tipo, aba ?? '', linha ?? '', sujeito];
  const hash = createHash('sha256')
    .update(JSON.stringify(partes.map((x) => norm(x))))
    .digest('hex')
    .slice(0, 40);
  avisos.push({ tipo, aba, linha, detalhe, dados, chave: `${tipo}:${hash}` });
}

// Valor bruto de celula serializavel em JSON (Date vira ISO; vazio vira null).
function bruto(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  const t = String(v).trim();
  return t === '' ? null : t;
}

// Falha ANTES de gravar qualquer coisa se a 0071 nao estiver aplicada: sem isso a
// carga inteira terminaria e so os avisos se perderiam.
async function exigirTabelaDesconformidades() {
  const [linha] = await sql`
    SELECT to_regclass('public.estoque_desconformidades') IS NOT NULL AS existe
  `;
  if (!linha?.existe) {
    throw new Error('tabela estoque_desconformidades ausente: aplique a migration 0071 antes da carga');
  }
}

// `dados` vai por `tx.json`, nunca `JSON.stringify(...)::jsonb`: o driver descobre
// que o parametro e jsonb e serializa a string DE NOVO, gravando um jsonb do tipo
// string (medido no ensaio em 16/09/2026; o CHECK jsonb_typeof da 0071 recusou).
//
// Grava os avisos numa transacao. ON CONFLICT (chave) atualiza SO o que descreve a
// deteccao (detalhe, dados, posicao, ultima_deteccao_em) e nunca status, nota,
// unidade_id ou resolvida_*: rodar de novo nao duplica nem reabre.
async function persistirDesconformidades(lista) {
  const porChave = new Map();
  for (const a of lista) porChave.set(a.chave, a);
  if (porChave.size !== lista.length) {
    throw new Error(
      `${lista.length - porChave.size} aviso(s) com a mesma chave nesta carga: a chave nao separa os assuntos`,
    );
  }
  let novas = 0;
  let jaRegistradas = 0;
  await sql.begin(async (tx) => {
    for (const a of porChave.values()) {
      const [r] = await tx`
        INSERT INTO estoque_desconformidades (tipo, origem, aba, linha, detalhe, dados, chave)
        VALUES (
          ${a.tipo}, 'importacao_planilha', ${a.aba}, ${a.linha}, ${a.detalhe},
          ${tx.json(a.dados)}, ${a.chave}
        )
        ON CONFLICT (chave) DO UPDATE SET
          detalhe = EXCLUDED.detalhe,
          dados = EXCLUDED.dados,
          aba = EXCLUDED.aba,
          linha = EXCLUDED.linha,
          ultima_deteccao_em = NOW()
        RETURNING (xmax = 0) AS inserida
      `;
      if (r.inserida) novas++;
      else jaRegistradas++;
    }
  });
  return { novas, jaRegistradas };
}

// Chave de import -> primeira linha que a usou nesta execucao.
const chavesVistas = new Map();
// Identificador (PAT DAEE / OUTROS PAT) -> chaves distintas que o usam.
const identificadoresVistos = new Map();
function registrarIdentificador(campo, valor, chave, aba, linha) {
  if (!valor) return;
  const k = `${campo}:${norm(valor)}`;
  const lista = identificadoresVistos.get(k) ?? [];
  if (!lista.some((x) => x.chave === chave)) lista.push({ campo, chave, aba, linha, valor });
  identificadoresVistos.set(k, lista);
}

// Colunas com valor mas sem cabecalho conhecido sao ignoradas pelo leitor.
function avisarColunasSemCabecalho(ws, cab) {
  const colunasMapeadas = new Set(Object.values(cab.mapa));
  const contagem = new Map();
  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
      if (colunasMapeadas.has(col)) return;
      const v = valorCelula(cell);
      if (v === null || String(v).trim() === '') return;
      contagem.set(col, (contagem.get(col) ?? 0) + 1);
    });
  }
  for (const [col, n] of contagem) {
    avisar('coluna_sem_cabecalho', ws.name, null, `coluna ${col}: ${n} valor(es) ignorado(s)`, {
      sujeito: `coluna ${col}`,
      dados: { coluna: col, valoresIgnorados: n },
    });
  }
}

// ── Processamento por aba ────────────────────────────────────────────────────
async function processarSerializado(ws, unidade, ehDescarte) {
  const cab = acharCabecalho(ws);
  const ler = fazerLeitor(cab.mapa);
  const rel = { inseridas: 0, atualizadas: 0, puladas: 0 };
  const ehModens = classificarAba(ws.name).tipo === 'modens';
  avisarColunasSemCabecalho(ws, cab);

  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const ids = {
      codigo: limparIdentificador(ler(row, 'codigo')),
      codigoSpaguas: limparIdentificador(ler(row, 'codigoSpaguas')),
      patDaee: limparIdentificador(ler(row, 'patDaee')),
      numeroSerie: limparIdentificador(ler(row, 'numeroSerie')),
    };
    const confirmacao = texto(ler(row, 'confirmacao'));
    let descricao = texto(ler(row, 'descricao'));
    const marca = texto(ler(row, 'marca'));
    const modelo = texto(ler(row, 'modelo'));
    const outrosPat = limparIdentificador(ler(row, 'outrosPat'));
    const helice = texto(ler(row, 'helice'));
    const observacaoBruta = texto(ler(row, 'observacao'));

    // Leitura da etiqueta colada que nao bate com o codigo (caixa nao conta:
    // o leitor devolve Araraquara em maiusculas).
    if (confirmacao && ids.codigo && norm(confirmacao) !== norm(ids.codigo)) {
      avisar('leitura_diferente_do_codigo', ws.name, r, `código ${ids.codigo}, leitura ${confirmacao}`, {
        dados: { unidade, codigo: ids.codigo, confirmacao },
      });
    }

    // Linha REAL de item. Nas abas GERAL a coluna CODIGO vem preenchida em
    // sequencia ate o fim da planilha (template "pra baixo"), entao um CODIGO
    // sozinho NAO e um item: exigir DESCRICAO real, senao pular (evita ingerir
    // centenas de linhas de template como patrimonio fantasma). MODENS
    // identifica pelo IMEI (numeroSerie) e tem descricao fixa "Modem".
    // Descricao NAO se inventa: linha com etiqueta LIDA e sem descricao e um
    // item fisico real, entao e pulada com aviso, nunca em silencio.
    if (ehModens) {
      if (!ids.numeroSerie) {
        rel.puladas++;
        continue;
      }
      if (!descricao) descricao = 'Modem';
    } else if (!descricao) {
      rel.puladas++;
      const temConteudo = marca || modelo || ids.numeroSerie || ids.patDaee;
      if (confirmacao || temConteudo) {
        avisar(
          'item_sem_descricao',
          ws.name,
          r,
          [ids.codigo, marca, modelo, ids.numeroSerie].filter(Boolean).join(' | '),
          {
            // Brutos: e o que o operador precisa para cadastrar a unidade a mao.
            dados: {
              unidade,
              codigo: ids.codigo,
              confirmacao,
              marca,
              modelo,
              numeroSerie: ids.numeroSerie,
              patDaee: ids.patDaee,
              sala: bruto(ler(row, 'sala')),
              prateleira: bruto(ler(row, 'prateleira')),
              armario: bruto(ler(row, 'armario')),
              local: bruto(ler(row, 'local')),
            },
          },
        );
      }
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
    const anterior = chavesVistas.get(chave);
    if (anterior) {
      // Mesmo ON CONFLICT: esta linha SOBRESCREVE a anterior e uma unidade some.
      avisar('chave_repetida', ws.name, r, `${chave} já usada em "${anterior.aba}" linha ${anterior.linha}; esta linha sobrescreve aquela`, {
        sujeito: chave,
        dados: {
          unidade,
          chaveImport: chave,
          abaAnterior: anterior.aba,
          linhaAnterior: anterior.linha,
          codigo: ids.codigo,
          numeroSerie: ids.numeroSerie,
          // O valor que formou a chave (codigo, ou serie/IMEI, ou PAT). Termo de
          // busca da tela: `codigo` fica nulo quando a chave veio da serie.
          identificador: ids.codigo ?? ids.numeroSerie ?? ids.patDaee ?? ids.codigoSpaguas ?? null,
          descricao,
        },
      });
    } else {
      chavesVistas.set(chave, { aba: ws.name, linha: r });
    }
    registrarIdentificador('PAT DAEE', ids.patDaee, chave, ws.name, r);
    registrarIdentificador('OUTROS PAT', outrosPat, chave, ws.name, r);

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
  avisarColunasSemCabecalho(ws, cab);
  for (let r = cab.linha + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const descricao = texto(ler(row, 'descricao'));
    const quantidadeBruta = ler(row, 'quantidade');
    const quantidade = parseQuantidade(quantidadeBruta);
    if (!descricao) {
      rel.puladas++;
      continue;
    }
    if (/^https?:\/\//i.test(descricao) || /docs\.google\.com/i.test(descricao)) {
      avisar('descricao_suspeita', ws.name, r, `descrição é um link (quantidade ${quantidade})`, {
        dados: { unidade, descricao, quantidade },
      });
    }
    if (quantidadeBruta === null || String(quantidadeBruta).trim() === '') {
      avisar('quantidade_vazia', ws.name, r, `${descricao}: entra com saldo 0`, {
        dados: { unidade, descricao },
      });
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
  await exigirTabelaDesconformidades();
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

  // Identificador de patrimonio usado por mais de uma unidade.
  for (const lista of identificadoresVistos.values()) {
    if (lista.length < 2) continue;
    const onde = lista.map((x) => `"${x.aba}" linha ${x.linha}`).join(', ');
    // Assunto e o identificador (campo + valor), nao a primeira linha: se a
    // ocorrencia de cima for corrigida, o aviso sobre as outras continua o mesmo.
    avisar(
      'identificador_repetido',
      lista[0].aba,
      lista[0].linha,
      `${lista[0].campo} ${lista[0].valor} em ${lista.length} unidades: ${onde}`,
      {
        sujeito: `${lista[0].campo}:${lista[0].valor}`,
        chaveSemPosicao: true,
        dados: {
          campo: lista[0].campo,
          valor: lista[0].valor,
          ocorrencias: lista.map((x) => ({ aba: x.aba, linha: x.linha })),
        },
      },
    );
  }

  if (avisos.length > 0) {
    console.log(`\nAVISOS: ${avisos.length}`);
    const porTipo = new Map();
    for (const a of avisos) porTipo.set(a.tipo, [...(porTipo.get(a.tipo) ?? []), a]);
    for (const [tipo, lista] of porTipo) {
      console.log(`  ${tipo}: ${lista.length}`);
      for (const a of lista) {
        console.log(`    aba "${a.aba}"${a.linha ? ` linha ${a.linha}` : ''}: ${a.detalhe}`);
      }
    }
  } else {
    console.log('\nAVISOS: 0');
  }

  const gravadas = await persistirDesconformidades(avisos);
  console.log(
    `desconformidades gravadas: ${avisos.length} (novas ${gravadas.novas} | ja registradas ${gravadas.jaRegistradas}; status e nota preservados)`,
  );

  // Conciliacao: o ledger nao carrega tamanho, entao a comparacao e por
  // (material, local) com os saldos AGREGADOS; comparar cada linha de saldo
  // (que tem tamanho) com a soma do par acusava divergencia falsa.
  const divergencias = await sql`
    WITH ledger AS (
      SELECT material_id, local_destino AS local_id, SUM(quantidade)::int AS soma
        FROM estoque_movimentacoes
       WHERE material_id IS NOT NULL AND tipo = 'entrada'
       GROUP BY material_id, local_destino
    ), saldo AS (
      SELECT material_id, local_id, SUM(quantidade)::int AS soma
        FROM estoque_saldos
       GROUP BY material_id, local_id
    )
    SELECT COALESCE(s.material_id, l.material_id) AS material_id,
           COALESCE(s.local_id, l.local_id) AS local_id,
           COALESCE(s.soma, 0) AS saldo, COALESCE(l.soma, 0) AS soma_ledger
      FROM saldo s
      FULL JOIN ledger l ON l.material_id = s.material_id AND l.local_id = s.local_id
     WHERE COALESCE(s.soma, 0) <> COALESCE(l.soma, 0)
  `;
  const pares = await sql`SELECT COUNT(DISTINCT (material_id, local_id))::int AS n FROM estoque_saldos`;
  if (divergencias.length === 0) {
    console.log(`conciliacao OK: ${pares[0].n} par(es) material/local, saldo == soma do ledger.`);
  } else {
    console.log(`ERRO: ${divergencias.length} divergencia(s) saldo x ledger:`, divergencias);
    process.exitCode = 1;
  }
  // --estrito: aviso de dado tambem reprova (para quem quer a carga limpa).
  if (process.argv.includes('--estrito') && avisos.length > 0 && !process.exitCode) {
    console.log('modo estrito: ha avisos, saindo com codigo 2.');
    process.exitCode = 2;
  }
} catch (e) {
  console.log('ERRO:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

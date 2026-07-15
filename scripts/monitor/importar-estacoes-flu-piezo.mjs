/**
 * Importa o CADASTRO de TODOS os tipos hidrologicos do SIBH (pluviometrico,
 * fluviometrico e piezometrico) para `estacoes_pluviometricas`. NAO importa
 * leitura (chuva e agregada por dia hidrologico noutro fluxo; nivel de flu/piezo
 * e lido ao vivo, sem persistir).
 *
 * Passou a incluir o tipo '2' (pluviometrico) para popular o status de
 * transmissao (transmission_status + ultima_transmissao, migration 0053) de
 * TODAS as estacoes, nao so flu/piezo. Continua idempotente por sibh_id: como o
 * conflito e por sibh_id (nao por prefixo), reprocessar plu NAO corrompe as
 * linhas existentes (mesmo sibh_id -> update; prefixo repetido entre tipos
 * coexiste).
 *
 * Espelha o upsert do repositorio testado (estacoes-pluviometricas-repository.pg.ts):
 * mesmo ON CONFLICT (sibh_id) e mesmas colunas (migration 0052 + 0053). posto_id
 * fica via UPDATE por join com `postos` (equivalente ao buscarPorPrefixo do
 * use-case).
 *
 * Idempotente (ON CONFLICT do update). Uso:
 *   node --env-file=.env.local scripts/monitor/importar-estacoes-flu-piezo.mjs
 */
import postgres from 'postgres';

const SIBH = 'https://apps.spaguas.sp.gov.br/sibh/api/v2/stations';
const TENTATIVAS = 4;
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// station_type_id do SIBH -> tipo_estacao do dominio. Os tres tipos
// hidrologicos suportados. Qualidade (5) e desconhecidos ficam de fora.
const TIPO = { '1': 'fluviometrico', '2': 'pluviometrico', '3': 'piezometrico' };

// Normaliza o `date_last_measurement` cru do SIBH (formato Date#toString() do
// JS, ex.: 'Wed Jul 15 2026 13:40:00 GMT+0000 (...)') ou '' para ISO 8601 UTC,
// que o timestamptz aceita. Invalido/ausente -> null (nunca grava lixo). Espelha
// `normalizarTimestampSibh` do dominio (src/domain/monitor/timestamp-sibh.ts).
function normalizarTimestamp(v) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (t === '') return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

async function fetchComRetry(url) {
  let ultimo;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 30000);
      try {
        const r = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      ultimo = e;
      if (t < TENTATIVAS) await espera(500 * 2 ** (t - 1));
    }
  }
  throw ultimo;
}

function parseCoord(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

const sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false, connect_timeout: 15 });

try {
  console.log('baixando estacoes do SIBH...');
  const bruto = await fetchComRetry(SIBH);
  if (!Array.isArray(bruto)) throw new Error('resposta /stations nao e array');
  console.log('total SIBH:', bruto.length);

  const linhas = [];
  let semPrefixo = 0, semCoord = 0, semId = 0;
  for (const s of bruto) {
    const tipoEstacao = TIPO[String(s.station_type_id ?? '')];
    if (!tipoEstacao) continue; // plu, flu e piezo; qualidade/desconhecido fora
    // sibh_id e a chave de conflito (unica em estacoes_pluviometricas). Sem id
    // nao ha o que conflitar: pular e contabilizar, igual ao use-case, senao a
    // reexecucao insere duplicata (linha sem chave escapa do ON CONFLICT).
    const sibhId = s.id != null ? String(s.id).trim() : '';
    if (!sibhId) { semId++; continue; }
    const prefixo = (s.prefix ?? '').trim();
    if (!prefixo) { semPrefixo++; continue; }
    const lat = parseCoord(s.latitude);
    const lng = parseCoord(s.longitude);
    if (lat === null || lng === null) { semCoord++; continue; }
    linhas.push({
      prefixo,
      nome: (s.station_name ?? s.name ?? prefixo).trim(),
      lat,
      lng,
      tipo: 'automatico',
      tipo_estacao: tipoEstacao,
      bacia: (s.ugrhi_name ?? '').trim() || null,
      owner: (s.station_owner ?? '').trim() || null,
      // Status de transmissao (migration 0053). '' -> null; data normalizada
      // pra ISO (o timestamptz nao casta o formato cru do SIBH).
      transmission_status: (s.transmission_status ?? '').trim() || null,
      ultima_transmissao: normalizarTimestamp(s.date_last_measurement),
      sibh_id: sibhId,
    });
  }
  const nPlu = linhas.filter((l) => l.tipo_estacao === 'pluviometrico').length;
  const nFlu = linhas.filter((l) => l.tipo_estacao === 'fluviometrico').length;
  const nPiezo = linhas.filter((l) => l.tipo_estacao === 'piezometrico').length;
  console.log(`a upsertar: ${linhas.length} (plu ${nPlu} | flu ${nFlu} | piezo ${nPiezo}) | sem id ${semId} | sem prefixo ${semPrefixo} | sem coordenada ${semCoord}`);
  if (linhas.length === 0) throw new Error('nada a importar');

  // Chave de conflito = sibh_id (unica), alinhado a migration 0052 e ao
  // repositorio (upsertPorSibhId). prefixo NAO e unico entre tipos, entra no
  // SET como atributo. sibh_id fica fora do SET (e a propria chave).
  const cols = ['prefixo', 'nome', 'lat', 'lng', 'tipo', 'tipo_estacao', 'bacia', 'owner', 'transmission_status', 'ultima_transmissao', 'sibh_id'];
  const res = await sql`
    insert into estacoes_pluviometricas ${sql(linhas, ...cols)}
    on conflict (sibh_id) where sibh_id is not null do update set
      prefixo             = excluded.prefixo,
      nome                = excluded.nome,
      lat                 = excluded.lat,
      lng                 = excluded.lng,
      tipo                = excluded.tipo,
      tipo_estacao        = excluded.tipo_estacao,
      bacia               = excluded.bacia,
      owner               = excluded.owner,
      transmission_status = excluded.transmission_status,
      ultima_transmissao  = excluded.ultima_transmissao
  `;
  console.log('upsert concluido, linhas afetadas:', res.count);

  // Vinculo ao catalogo interno de postos (equivalente ao buscarPorPrefixo).
  // Defensivo: se a coluna/tabela divergir, o cadastro ja esta feito.
  try {
    const vinc = await sql`
      update estacoes_pluviometricas e
         set posto_id = p.id
        from postos p
       where e.prefixo = p.prefixo
         and e.tipo_estacao in ('fluviometrico','piezometrico')
         and e.posto_id is distinct from p.id
    `;
    console.log('vinculo a posto atualizado, linhas:', vinc.count);
  } catch (e) {
    console.log('vinculo a posto pulado (', e.message, ')');
  }

  const cont = await sql`select tipo_estacao, count(*)::int as n from estacoes_pluviometricas group by tipo_estacao order by n desc`;
  console.log('contagem final por tipo_estacao:', cont.map((r) => `${r.tipo_estacao}=${r.n}`).join(' | '));
} catch (e) {
  console.log('ERRO:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

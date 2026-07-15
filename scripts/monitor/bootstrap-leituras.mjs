/**
 * Bootstrap das leituras automaticas (carga inicial do Monitor), AGREGADAS por
 * dia hidrologico (07h-06h59). O SIBH entrega medicoes a cada 10 min; gravar cru
 * seria inviavel (centenas de milhoes de linhas/ano), entao colapsamos em 1 linha
 * por dia/estacao (automatico_mm = total do dia). manual_mm fica 0 (vem do operador).
 * Roda fora do serverless. Idempotente (ON CONFLICT estacao_id, momento).
 *
 * Uso: node --env-file=.env.local scripts/monitor/bootstrap-leituras.mjs [dias] [limite]
 */
import postgres from 'postgres';

const DIAS = Number(process.argv[2] || 30);
const LIMITE = process.argv[3] ? Number(process.argv[3]) : null; // null = todas
const SIBH = 'https://apps.spaguas.sp.gov.br/sibh/api/v2/measurements';
const CONC = 4; // requisicoes concorrentes (o SIBH e instavel; baixo p/ reduzir fetch failed)
const TENTATIVAS = 4; // o SIBH cai intermitentemente (fetch failed); retry com backoff
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchComRetry(url) {
  let ultimo;
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      try {
        const r = await fetch(url, { signal: ctrl.signal });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (e) {
      ultimo = e;
      if (t < TENTATIVAS) await espera(500 * 2 ** (t - 1)); // 0.5s, 1s, 2s
    }
  }
  throw ultimo;
}

// Dia hidrologico de uma medicao 'YYYY/MM/DD HH:mm': se hora < 7, pertence ao dia anterior.
function diaHidrologico(dateStr) {
  const [d, h] = dateStr.split(' ');
  const [ano, mes, dia] = d.split('/').map(Number);
  const hora = Number((h || '00:00').split(':')[0]);
  let base = new Date(Date.UTC(ano, mes - 1, dia));
  if (hora < 7) base = new Date(base.getTime() - 86400000);
  return base.toISOString().slice(0, 10); // YYYY-MM-DD
}

const fmt = (d) => d.toISOString().slice(0, 10);
const sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false, connect_timeout: 15 });

async function processar(est, desde, ate) {
  const url = `${SIBH}?start_date=${desde}&end_date=${ate}&station_prefix_ids[]=${est.sibh_id}`;
  const data = await fetchComRetry(url);
  const med = (Array.isArray(data) ? data : data.measurements || []).filter(
    (m) => (m.prefix || '').trim() === (est.prefixo || '').trim(),
  );
  // agrega total por dia hidrologico
  const porDia = new Map();
  for (const m of med) {
    const dia = diaHidrologico(m.date);
    porDia.set(dia, (porDia.get(dia) || 0) + (Number(m.value) || 0));
  }
  if (porDia.size === 0) return 0;
  const linhas = [...porDia.entries()].map(([dia, total]) => ({
    estacao_id: est.id,
    momento: new Date(dia + 'T00:00:00Z'),
    automatico_mm: Math.round(total * 100) / 100,
    manual_mm: 0,
  }));
  const cols = ['estacao_id', 'momento', 'automatico_mm', 'manual_mm'];
  const res = await sql`
    insert into leituras_pluviometricas ${sql(linhas, ...cols)}
    on conflict (estacao_id, momento) do update set automatico_mm = excluded.automatico_mm
  `;
  return res.count;
}

try {
  const ate = fmt(new Date());
  const desde = fmt(new Date(Date.now() - DIAS * 86400000));
  console.log(`janela ${desde} a ${ate} (${DIAS} dias) | limite: ${LIMITE ?? 'todas'}`);

  // So pluviometrica: a leitura aqui e chuva acumulada (mm). Fluviometrica e
  // piezometrica medem nivel (metros) e terao sincronizacao propria na Fase 2.
  const ests = LIMITE
    ? await sql`select id, prefixo, sibh_id from estacoes_pluviometricas where sibh_id is not null and tipo_estacao = 'pluviometrico' order by prefixo limit ${LIMITE}`
    : await sql`select id, prefixo, sibh_id from estacoes_pluviometricas where sibh_id is not null and tipo_estacao = 'pluviometrico' order by prefixo`;
  console.log('estacoes a processar:', ests.length);

  let ok = 0, semDados = 0, erros = 0, linhas = 0;
  for (let i = 0; i < ests.length; i += CONC) {
    const lote = ests.slice(i, i + CONC);
    const resultados = await Promise.allSettled(lote.map((e) => processar(e, desde, ate)));
    for (const res of resultados) {
      if (res.status === 'fulfilled') { if (res.value > 0) { ok++; linhas += res.value; } else semDados++; }
      else erros++;
    }
    process.stdout.write(`\r processadas ${Math.min(i + CONC, ests.length)}/${ests.length} | com dados ${ok} | linhas ${linhas} | erros ${erros}   `);
  }
  console.log('\nFIM. estacoes com dados:', ok, '| sem dados:', semDados, '| erros:', erros, '| linhas gravadas:', linhas);
  const tot = await sql`select count(*)::int as n from leituras_pluviometricas`;
  console.log('TOTAL leituras na tabela:', tot[0].n);
} catch (e) {
  console.log('\nERRO:', e.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}

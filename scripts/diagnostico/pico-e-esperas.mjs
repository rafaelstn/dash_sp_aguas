// O pico de 5s a 44s nao reproduz sob demanda, e leitura fria explica so 2x a
// 6x. Este medidor roda a consulta do produto em laco sobre postos de grande
// volume e, por uma SEGUNDA conexao, observa o que a sessao da consulta esta
// esperando enquanto ela roda (sys.dm_exec_requests). O wait_type separa as
// causas: LCK_* e espera por bloqueio de escritor, PAGEIOLATCH_* e IO de disco,
// ASYNC_NETWORK_IO e rede ou cliente lento, CXPACKET e paralelismo.
//
// O observador imprime o que LEU a cada volta, e diz quando nao pode medir, em
// vez de ficar calado. Sem permissao de VIEW SERVER STATE a leitura falha, e
// isso tambem e um achado, nao um silencio.
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const RAIZ = 'C:\\Projetos\\gov\\dmo';
const TETO_LENTO_MS = 3000;
const MINUTOS = Number(process.argv[2] || 12);

function carregarEnv(arquivo) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  for (const linha of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/.exec(linha);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

const SERIES = [
  ['chuva_manual', 'MedicaoPluviometricas', 'Medicao', 999.9, null],
  ['chuva_logger', 'MedicaoLoggerPluviograficas', 'Medicao', 999.9, null],
  ['cota_rio', 'CotaEscalaFluviometricas', 'Valor', 9999, null],
  ['piezo_manual', 'LeituraManualPiezometricas', 'Valor', null, null],
  ['piezo_eletronico', 'LeituraEletronicaPiezometricas', 'Valor', null, null],
  [
    'vazao_rio',
    'CotaEscalaFluviometricas',
    'VazaoMainframe',
    99999.999,
    'm.VazaoMainframe IS NOT NULL',
  ],
];

function ramo(def) {
  const [serie, tabela, coluna, sentinelaValor, condicao] = def;
  const sentinela =
    sentinelaValor === null ? '1 = 0' : 'm.' + coluna + ' = ' + sentinelaValor;
  const eDaSerie = condicao === null ? '' : ' AND ' + condicao;
  return (
    "      SELECT serie = '" + serie + "',\n" +
    '             leituras = COUNT(*),\n' +
    '             primeira = MIN(CASE WHEN m.Data <= @agora THEN m.Data END),\n' +
    '             ultima   = MAX(CASE WHEN m.Data <= @agora THEN m.Data END),\n' +
    '             futuras  = SUM(CASE WHEN m.Data > @agora THEN 1 ELSE 0 END),\n' +
    '             semValor = SUM(CASE WHEN ' + sentinela + ' THEN 1 ELSE 0 END),\n' +
    '             ultimaComValor = MAX(CASE WHEN m.Data <= @agora\n' +
    '                                        AND m.' + coluna + ' IS NOT NULL\n' +
    '                                        AND NOT (' + sentinela + ')\n' +
    '                                       THEN m.Data END)\n' +
    '        FROM dbo.' + tabela + ' m\n' +
    '       WHERE m.PostoId = @posto AND m.Excluido = 0' + eDaSerie
  );
}

const UNIAO = SERIES.map(ramo).join('\n      UNION ALL\n');

function cfg() {
  return {
    server: process.env.SQLSERVER_HOST,
    port: Number(process.env.SQLSERVER_PORTA || 1433),
    user: process.env.SQLSERVER_USUARIO,
    password: process.env.SQLSERVER_SENHA,
    database: process.env.SQLSERVER_BANCO,
    pool: { max: 2, min: 0, idleTimeoutMillis: 60000 },
    connectionTimeout: 15000,
    requestTimeout: 300000,
    options: {
      encrypt: process.env.SQLSERVER_ENCRYPT === 'sim',
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'nao',
      enableArithAbort: true,
    },
  };
}

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  carregarEnv(path.join(RAIZ, '.env.local'));

  const trabalho = new sql.ConnectionPool(cfg());
  const olho = new sql.ConnectionPool(cfg());
  await trabalho.connect();
  await olho.connect();

  const idSessao = (
    await trabalho.request().query('SELECT s = @@SPID')
  ).recordset[0].s;
  console.log('sessao de trabalho: ' + idSessao);

  let podeObservar = true;
  try {
    await olho
      .request()
      .query('SELECT TOP 1 session_id FROM sys.dm_exec_requests');
    console.log('observador: sys.dm_exec_requests legivel');
  } catch (e) {
    podeObservar = false;
    console.log(
      'observador: NAO PUDE MEDIR (' + String(e.message).slice(0, 60) + ')',
    );
  }

  const cand = await trabalho.request().query(
    'SELECT TOP 25 p.Prefixo, p.Id, leituras = COUNT(*)\n' +
      '  FROM dbo.LeituraEletronicaPiezometricas m\n' +
      '  JOIN dbo.Postos p ON p.Id = m.PostoId\n' +
      ' WHERE m.Excluido = 0 AND p.Excluido = 0\n' +
      ' GROUP BY p.Prefixo, p.Id\n' +
      ' ORDER BY COUNT(*) DESC',
  );
  const postos = cand.recordset;
  console.log(
    'laco sobre ' + postos.length + ' postos por ' + MINUTOS + ' minutos\n',
  );

  const fim = Date.now() + MINUTOS * 60 * 1000;
  let n = 0;
  let lentas = 0;
  let estouros = 0;
  let pior = { ms: 0, posto: '-' };
  const tempos = [];

  while (Date.now() < fim) {
    const alvo = postos[n % postos.length];
    n += 1;

    let esperas = [];
    let vigiando = podeObservar;
    const vigia = (async () => {
      while (vigiando) {
        await espera(600);
        if (!vigiando) break;
        try {
          const r = await olho
            .request()
            .input('spid', sql.Int, idSessao)
            .query(
              'SELECT wait_type, wait_time, blocking_session_id, status\n' +
                '  FROM sys.dm_exec_requests WHERE session_id = @spid',
            );
          const l = r.recordset[0];
          if (l) {
            esperas.push(
              (l.wait_type || l.status) +
                (l.blocking_session_id ? '/bloq=' + l.blocking_session_id : '') +
                ':' + l.wait_time + 'ms',
            );
          }
        } catch {
          /* o observador nao interrompe a medicao */
        }
      }
    })();

    const t = Date.now();
    let erro = null;
    try {
      await trabalho
        .request()
        .input('posto', sql.UniqueIdentifier, alvo.Id)
        .input('agora', sql.DateTime, new Date())
        .query(UNIAO);
    } catch (e) {
      erro = String(e.message).slice(0, 50);
    }
    const ms = Date.now() - t;
    vigiando = false;
    await vigia;

    tempos.push(ms);
    if (ms > pior.ms) pior = { ms, posto: alvo.Prefixo };
    if (ms >= TETO_LENTO_MS || erro) {
      lentas += 1;
      if (ms >= 30000) estouros += 1;
      const quando = new Date().toISOString().slice(11, 19);
      console.log(
        quando +
          '  ' +
          String(alvo.Prefixo).padEnd(10) +
          String(ms).padStart(8) +
          'ms' +
          (erro ? '  ERRO ' + erro : '') +
          (ms >= 30000 ? '  ESTOURARIA O PRODUTO' : '') +
          '   esperas=' +
          (esperas.length > 0 ? esperas.slice(0, 6).join(' ') : '(nenhuma vista)'),
      );
    }
    await espera(250);
  }

  tempos.sort((a, b) => a - b);
  const p = (q) => tempos[Math.min(tempos.length - 1, Math.floor(tempos.length * q))];
  console.log('\n=== resumo de ' + n + ' consultas em ' + MINUTOS + ' min ===');
  console.log('mediana        ' + p(0.5) + 'ms');
  console.log('p90            ' + p(0.9) + 'ms');
  console.log('p99            ' + p(0.99) + 'ms');
  console.log('pior           ' + pior.ms + 'ms  (' + pior.posto + ')');
  console.log(
    'acima de 3s    ' + lentas + ' de ' + n + '  (' + ((lentas / n) * 100).toFixed(1) + '%)',
  );
  console.log(
    'acima de 30s   ' + estouros + ' de ' + n + '  (' + ((estouros / n) * 100).toFixed(1) + '%)  <- erro na tela do usuario',
  );

  await trabalho.close();
  await olho.close();
}

main().catch((e) => {
  console.error('FALHA: ' + String(e.message).slice(0, 200));
  process.exit(1);
});

// Separa "leitura fria" de "plano ruim": escolhe postos de grande volume que
// esta sessao NUNCA tocou, e mede a MESMA consulta duas vezes seguidas no mesmo
// posto. Se a primeira for muito mais lenta que a segunda, a causa e cache de
// buffer no servidor do orgao (IO), nao o desenho da consulta.
//
// Controle: os postos ja aquecidos nesta sessao (C5-125, 4C-506Z) devem vir
// rapidos JA na primeira medicao.
import fs from 'node:fs';
import path from 'node:path';
import sql from 'mssql';

const RAIZ = 'C:\\Projetos\\gov\\dmo';

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

async function uma(pool, posto) {
  const t = Date.now();
  try {
    const r = await pool
      .request()
      .input('posto', sql.UniqueIdentifier, posto)
      .input('agora', sql.DateTime, new Date())
      .query(UNIAO);
    const total = r.recordset.reduce((a, l) => a + Number(l.leituras), 0);
    return { ms: Date.now() - t, total };
  } catch (e) {
    return { ms: Date.now() - t, erro: String(e.message).slice(0, 40) };
  }
}

async function main() {
  carregarEnv(path.join(RAIZ, '.env.local'));
  const pool = new sql.ConnectionPool({
    server: process.env.SQLSERVER_HOST,
    port: Number(process.env.SQLSERVER_PORTA || 1433),
    user: process.env.SQLSERVER_USUARIO,
    password: process.env.SQLSERVER_SENHA,
    database: process.env.SQLSERVER_BANCO,
    pool: { max: 2, min: 0, idleTimeoutMillis: 20000 },
    connectionTimeout: 15000,
    requestTimeout: 300000,
    options: {
      encrypt: process.env.SQLSERVER_ENCRYPT === 'sim',
      trustServerCertificate: process.env.SQLSERVER_TRUST_CERT !== 'nao',
      enableArithAbort: true,
    },
  });
  await pool.connect();

  // Postos de grande volume, escolhidos pelo banco e nao por mim, tirando os
  // que esta sessao ja aqueceu.
  const JA_AQUECIDOS = ['C5-125', '4C-506Z', 'E3-036', '3D-006', 'B5-003'];
  const esc = JA_AQUECIDOS.map((p) => "'" + p + "'").join(',');
  const cand = await pool.request().query(
    'SELECT TOP 6 p.Prefixo, p.Id, leituras = COUNT(*)\n' +
      '  FROM dbo.LeituraEletronicaPiezometricas m\n' +
      '  JOIN dbo.Postos p ON p.Id = m.PostoId\n' +
      ' WHERE m.Excluido = 0 AND p.Excluido = 0 AND p.Prefixo NOT IN (' + esc + ')\n' +
      ' GROUP BY p.Prefixo, p.Id\n' +
      ' ORDER BY COUNT(*) DESC',
  );

  console.log('posto        leituras   1a vez     2a vez   razao');
  console.log('----------------------------------------------------');
  for (const l of cand.recordset) {
    const a = await uma(pool, l.Id);
    const b = await uma(pool, l.Id);
    const razao = b.ms > 0 ? (a.ms / b.ms).toFixed(1) + 'x' : '-';
    console.log(
      String(l.Prefixo).padEnd(12) +
        String(l.leituras).padStart(8) +
        String(a.erro ? a.erro : a.ms + 'ms').padStart(11) +
        String(b.erro ? b.erro : b.ms + 'ms').padStart(11) +
        '   ' +
        razao +
        (a.ms > 30000 ? '   ESTOURA O TETO DE 30s DO PRODUTO' : ''),
    );
  }

  console.log('\ncontrole, postos ja aquecidos nesta sessao:');
  for (const pref of ['C5-125', '4C-506Z']) {
    const rp = await pool
      .request()
      .input('prefixo', sql.VarChar, pref)
      .query(
        'SELECT TOP 1 p.Id FROM dbo.Postos p WHERE p.Excluido = 0 AND p.Prefixo COLLATE Latin1_General_CI_AI = @prefixo',
      );
    const a = await uma(pool, rp.recordset[0].Id);
    console.log('   ' + pref.padEnd(10) + String(a.ms).padStart(8) + 'ms');
  }

  await pool.close();
}

main().catch((e) => {
  console.error('FALHA: ' + String(e.message).slice(0, 200));
  process.exit(1);
});

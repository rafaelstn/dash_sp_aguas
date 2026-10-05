// Reproduz o SQL EXATO de resumoPorPosto (seis ramos em UNION ALL, com as
// sentinelas e a condicao de serie que o produto usa) e mede com teto de 300s
// em vez dos 30s do produto. Mede tambem cada ramo isolado com a MESMA forma,
// para separar "a tabela e lenta" de "a uniao e lenta".
//
// O controle desta medicao e reproduzir o estouro: se a uniao inteira voltar em
// poucos segundos, eu nao reproduzi o defeito e a medicao nao vale.
//
// Nenhum valor de credencial e impresso.
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

// serie, tabela, colunaValor, valorSentinela (null = sem sentinela), condicaoDaSerie
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
    "      SELECT serie = '" +
    serie +
    "',\n" +
    '             leituras = COUNT(*),\n' +
    '             primeira = MIN(CASE WHEN m.Data <= @agora THEN m.Data END),\n' +
    '             ultima   = MAX(CASE WHEN m.Data <= @agora THEN m.Data END),\n' +
    '             futuras  = SUM(CASE WHEN m.Data > @agora THEN 1 ELSE 0 END),\n' +
    '             semValor = SUM(CASE WHEN ' +
    sentinela +
    ' THEN 1 ELSE 0 END),\n' +
    '             ultimaComValor = MAX(CASE WHEN m.Data <= @agora\n' +
    '                                        AND m.' +
    coluna +
    ' IS NOT NULL\n' +
    '                                        AND NOT (' +
    sentinela +
    ')\n' +
    '                                       THEN m.Data END)\n' +
    '        FROM dbo.' +
    tabela +
    ' m\n' +
    '       WHERE m.PostoId = @posto AND m.Excluido = 0' +
    eDaSerie
  );
}

async function medir(pool, posto, rotulo, texto) {
  const t = Date.now();
  try {
    const r = await pool
      .request()
      .input('posto', sql.UniqueIdentifier, posto)
      .input('agora', sql.DateTime, new Date())
      .query(texto);
    const ms = Date.now() - t;
    const linhas = r.recordset
      .map((l) => l.serie + '=' + l.leituras)
      .join(' ');
    console.log(rotulo.padEnd(22) + String(ms).padStart(9) + 'ms   ' + linhas);
    return ms;
  } catch (e) {
    const ms = Date.now() - t;
    console.log(
      rotulo.padEnd(22) +
        String(ms).padStart(9) +
        'ms   ERRO ' +
        String(e.message).slice(0, 70),
    );
    return ms;
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

  const prefixo = process.argv[2] || 'C5-125';
  const rp = await pool
    .request()
    .input('prefixo', sql.NVarChar, prefixo)
    .query(
      'SELECT TOP 1 p.Id FROM dbo.Postos p WHERE p.Excluido = 0 AND p.Prefixo COLLATE Latin1_General_CI_AI = @prefixo',
    );
  const posto = rp.recordset[0] && rp.recordset[0].Id;
  if (!posto) {
    console.error('posto ' + prefixo + ' nao encontrado');
    process.exit(3);
  }
  console.log('posto ' + prefixo + ', teto do driver 300s (produto usa 30s)\n');

  console.log('=== a uniao inteira, como o produto manda ===');
  const uniao = SERIES.map(ramo).join('\n      UNION ALL\n');
  const msUniao = await medir(pool, posto, 'UNION ALL das 6', uniao);

  console.log('\n=== cada ramo isolado, com a MESMA forma ===');
  let soma = 0;
  for (const def of SERIES) {
    soma += await medir(pool, posto, def[0], ramo(def));
  }

  console.log('\n=== veredito ===');
  console.log('soma dos ramos isolados: ' + soma + 'ms');
  console.log('uniao inteira:           ' + msUniao + 'ms');
  if (msUniao < 25000) {
    console.log(
      'NAO REPRODUZI o estouro de 30s: esta medicao nao explica a falha.',
    );
  } else {
    console.log('REPRODUZI o estouro: a uniao passa dos 30s do produto.');
  }

  await pool.close();
}

main().catch((e) => {
  console.error('FALHA: ' + String(e.message).slice(0, 200));
  process.exit(1);
});

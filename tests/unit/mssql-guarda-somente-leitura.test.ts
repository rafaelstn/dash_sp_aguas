/**
 * Guarda de acesso ao SQL Server do órgão: SOMENTE LEITURA, e `Excluido = 0`
 * em toda leitura de `dbo.Postos`.
 *
 * Este arquivo não fala com banco nenhum: ele exercita `conferirConsultaDeLeitura`,
 * que é a barreira que roda ANTES de a consulta sair do processo. Os casos
 * abaixo foram escritos procurando como ESCAPAR da guarda, e não confirmando
 * que ela funciona no caminho feliz. Três tentativas escaparam da primeira
 * versão dela e estão registradas como caso, para que ninguém "simplifique" a
 * régua de volta:
 *
 *   UPDATE TOP (1) ... SET   MERGE ... AS alvo USING   INSERT sem INTO
 *
 * A segunda metade importa tanto quanto: falso positivo de guarda é pior que
 * falso negativo, porque o próximo a esbarrar nela mexe no código bom ou
 * desliga a guarda. Por isso os casos que DEVEM passar incluem a consulta de
 * aparelhos, que cita `dbo.AparelhoPostos` e não pode ser confundida com
 * `dbo.Postos`.
 */
import { describe, expect, it } from 'vitest';
import {
  ConsultaMssqlProibida,
  conferirConsultaDeLeitura,
} from '@/infrastructure/db/mssql-client';

/** Recusou? Devolve o motivo. Não recusou? Devolve null. */
function recusa(sqlTexto: string): string | null {
  try {
    conferirConsultaDeLeitura(sqlTexto);
    return null;
  } catch (e) {
    if (e instanceof ConsultaMssqlProibida) return e.message;
    throw e;
  }
}

describe('guarda: o acesso ao Dbfch é somente leitura', () => {
  const tentativasDeEscrita: ReadonlyArray<readonly [string, string]> = [
    ['INSERT com INTO', "INSERT INTO dbo.Postos (Prefixo) VALUES ('X')"],
    // `INTO` é OPCIONAL em T-SQL, e foi assim que escapei da primeira régua.
    ['INSERT sem INTO', "INSERT dbo.Postos (Prefixo) VALUES ('X')"],
    ['UPDATE simples', "UPDATE dbo.Postos SET Nome = 'x' WHERE Excluido = 0"],
    // O `TOP (1)` entra entre o verbo e o alvo e derrubou a primeira régua.
    ['UPDATE TOP', "UPDATE TOP (1) dbo.Postos SET Nome = 'x'"],
    ['UPDATE em minúscula', "update dbo.postos set nome = 'x'"],
    ['UPDATE por alias', "UPDATE p SET p.Nome = 'x' FROM dbo.Postos p"],
    ['DELETE', 'DELETE FROM dbo.Postos WHERE Excluido = 0'],
    ['DELETE sem FROM', 'DELETE dbo.Postos'],
    // O `AS alvo` entra entre o alvo e o USING e derrubou a primeira régua.
    ['MERGE com alias', 'MERGE dbo.Postos AS alvo USING dbo.Aparelhos AS o ON 1 = 1'],
    ['TRUNCATE', 'TRUNCATE TABLE dbo.Postos'],
    ['DROP', 'DROP TABLE dbo.Postos'],
    ['CREATE', 'CREATE TABLE dbo.Temporaria (Id int)'],
    ['ALTER', 'ALTER TABLE dbo.Postos ADD Coluna int'],
    ['GRANT', 'GRANT SELECT ON dbo.Postos TO leitor'],
    ['EXEC de procedure', 'EXEC dbo.AlgumaCoisa'],
    ['EXECUTE por extenso', 'EXECUTE dbo.AlgumaCoisa'],
    ['sp_executesql', "EXEC sp_executesql N'SELECT 1'"],
    // Colchete é a fuga sintática óbvia: o normalizador os remove antes de medir.
    ['UPDATE com colchetes', "UPDATE [dbo].[Postos] SET [Nome] = 'x'"],
    ['DELETE com colchetes', 'DELETE FROM [dbo].[Postos]'],
  ];

  it.each(tentativasDeEscrita)('recusa %s', (_rotulo, sqlTexto) => {
    const motivo = recusa(sqlTexto);
    expect(motivo).not.toBeNull();
    expect(motivo).toContain('SOMENTE LEITURA');
  });

  it('recusa ANTES de tocar no banco, e o erro é do adaptador, não do servidor', () => {
    expect(() => conferirConsultaDeLeitura('DELETE FROM dbo.Postos')).toThrow(
      ConsultaMssqlProibida,
    );
  });
});

describe('guarda: toda leitura de dbo.Postos filtra Excluido = 0', () => {
  it('recusa SELECT em dbo.Postos sem o filtro', () => {
    const motivo = recusa('SELECT p.Prefixo FROM dbo.Postos p ORDER BY p.Prefixo');
    expect(motivo).toContain('Excluido = 0');
  });

  it('recusa mesmo com colchetes em volta do nome', () => {
    expect(recusa('SELECT p.Prefixo FROM [dbo].[Postos] p')).toContain('Excluido = 0');
  });

  it('recusa mesmo com espaço em volta do ponto', () => {
    expect(recusa('SELECT p.Prefixo FROM dbo . Postos p')).toContain('Excluido = 0');
  });

  it('recusa quando o filtro está escrito em outra coluna que não Excluido', () => {
    expect(recusa('SELECT p.Prefixo FROM dbo.Postos p WHERE p.Ativo = 0')).toContain(
      'Excluido = 0',
    );
  });

  it('aceita com o filtro, com ou sem alias e com espaçamento variado', () => {
    expect(recusa('SELECT p.Prefixo FROM dbo.Postos p WHERE p.Excluido = 0')).toBeNull();
    expect(recusa('SELECT Prefixo FROM dbo.Postos WHERE Excluido=0')).toBeNull();
    expect(recusa('SELECT Prefixo FROM dbo.Postos WHERE excluido   =   0')).toBeNull();
  });

  it('confere COMANDO A COMANDO, e não o texto inteiro', () => {
    // Furo real da primeira versão desta guarda, achado escrevendo o adaptador
    // de facetas: ele manda cinco agregações numa consulta só, e a régua antiga
    // media o texto todo. Bastava UM comando ter o filtro para os outros quatro
    // passarem sem ele, e os 13 fantasmas entrariam só na contagem de algumas
    // facetas, que é o lugar onde ninguém confere.
    const duasConsultas = `
      SELECT nome = md.Nome, total = COUNT(*)
        FROM dbo.Postos p
        LEFT JOIN dbo.MunicipioDistritos md ON md.Id = p.MunicipioDistritoId
       WHERE p.Excluido = 0
       GROUP BY md.Nome;

      SELECT codigo = tm.Descricao, total = COUNT(*)
        FROM dbo.Postos p
        LEFT JOIN dbo.TipoMedicoes tm ON tm.Id = p.TipoMedicoesID
       GROUP BY tm.Descricao;`;
    expect(recusa(duasConsultas)).toContain('Excluido = 0');
  });

  it('aceita várias consultas quando TODAS filtram', () => {
    const duasCertas = `
      SELECT nome = md.Nome FROM dbo.Postos p
        LEFT JOIN dbo.MunicipioDistritos md ON md.Id = p.MunicipioDistritoId
       WHERE p.Excluido = 0;

      SELECT codigo = tm.Descricao FROM dbo.Postos p
        LEFT JOIN dbo.TipoMedicoes tm ON tm.Id = p.TipoMedicoesID
       WHERE p.Excluido = 0;`;
    expect(recusa(duasCertas)).toBeNull();
  });

  it('a exceção declarada libera, e exige um motivo escrito', () => {
    // Escape hatch com motivo: passa, e aparece em diff por ser texto no SQL.
    expect(
      recusa(
        'SELECT Prefixo FROM dbo.Postos -- inclui-excluidos: relatorio de auditoria',
      ),
    ).toBeNull();
    // Marcador sem motivo NÃO libera: senão vira palavra mágica sem dono.
    expect(
      recusa('SELECT Prefixo FROM dbo.Postos -- inclui-excluidos:'),
    ).toContain('Excluido = 0');
  });
});

describe('guarda: o que deve passar, passa', () => {
  it('não confunde dbo.AparelhoPostos com dbo.Postos', () => {
    // Este é o caso de falso positivo que mais importa: a consulta de
    // instrumentação cita "Postos" no fim de outro nome de tabela e não lê
    // `dbo.Postos` em lugar nenhum, então exigir `Excluido = 0` dela seria
    // reprovar código correto.
    const sqlAparelhos = `
      SELECT ap.PostoId, a.Designacao
        FROM dbo.AparelhoPostos ap
        JOIN dbo.Aparelhos a ON a.Id = ap.AparelhoId
       WHERE ap.Excluido = 0 AND a.Excluido = 0
         AND ap.DataDesativacao IS NULL
         AND ap.PostoId IN (@posto0, @posto1)`;
    expect(recusa(sqlAparelhos)).toBeNull();
  });

  it('aceita a paginação com OFFSET, que contém "set" como pedaço de palavra', () => {
    const sqlPagina = `
      SELECT p.Prefixo FROM dbo.Postos p
       WHERE p.Excluido = 0
       ORDER BY p.Prefixo
       OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY`;
    expect(recusa(sqlPagina)).toBeNull();
  });

  it('aceita a consulta de busca completa, com junções, COLLATE e EXISTS', () => {
    const sqlBusca = `
      SELECT p.Id, p.Prefixo, TipoPosto = tm.Descricao,
             UgrhiNumero = COALESCE(ug.Codigo, subpai.Codigo)
        FROM dbo.Postos p
        LEFT JOIN dbo.TipoMedicoes tm ON tm.Id = p.TipoMedicoesID
        LEFT JOIN dbo.UGRHIs ug ON ug.Id = p.UGRHIId
        OUTER APPLY (SELECT TOP 1 pai.Codigo FROM dbo.UGRHIs pai
                      WHERE pai.Codigo = 2 ORDER BY pai.Codigo) subpai
       WHERE p.Excluido = 0
         AND (p.Nome COLLATE Latin1_General_CI_AI LIKE @f0 ESCAPE '\\')
         AND EXISTS (SELECT 1 FROM dbo.AparelhoPostos ap
                      WHERE ap.PostoId = p.Id AND ap.Excluido = 0)`;
    expect(recusa(sqlBusca)).toBeNull();
  });

  it('aceita consulta que não toca em dbo.Postos', () => {
    expect(recusa('SELECT Codigo, Descricao FROM dbo.UGRHIs')).toBeNull();
  });
});

describe('guarda: as cinco tabelas de medição também filtram Excluido = 0', () => {
  // Entraram na guarda em 03/09/2026, junto com a porta de séries históricas.
  // Aqui o esquecimento é mais caro que no cadastro: são 42 milhões de linhas
  // somando as cinco, e o efeito não é uma linha a mais numa lista, é um número
  // diferente num gráfico, que ninguém confere de olho.
  const TABELAS = [
    'MedicaoPluviometricas',
    'MedicaoLoggerPluviograficas',
    'CotaEscalaFluviometricas',
    'LeituraManualPiezometricas',
    'LeituraEletronicaPiezometricas',
  ];

  it.each(TABELAS)('recusa SELECT em dbo.%s sem o filtro', (tabela) => {
    const motivo = recusa(`SELECT m.Data, m.Valor FROM dbo.${tabela} m WHERE m.PostoId = @p`);
    expect(motivo).toContain('Excluido = 0');
    expect(motivo).toContain(tabela);
  });

  it.each(TABELAS)('aceita SELECT em dbo.%s com o filtro', (tabela) => {
    expect(
      recusa(
        `SELECT m.Data FROM dbo.${tabela} m WHERE m.PostoId = @p AND m.Excluido = 0`,
      ),
    ).toBeNull();
  });

  // ─── As tentativas de escapar ──────────────────────────────────────────
  //
  // Escrever a guarda e tentar vencê-la é o que separa guarda de decoração. A
  // primeira versão desta régua, que exigia a presença do texto `Excluido = 0`
  // em algum lugar do comando, PERDEU para o primeiro caso abaixo, que é
  // exatamente a consulta que o adaptador de séries manda ao banco.

  it('NÃO deixa uma tabela filtrada cobrir as outras quatro da mesma consulta', () => {
    // O adaptador de séries lê as cinco numa consulta só. Com a régua antiga,
    // um `Excluido = 0` num ramo aprovava os cinco, e as leituras excluídas
    // entravam na contagem de quatro séries sem nada quebrar.
    const uniaoTorta = `
      SELECT serie = 'chuva', n = COUNT(*)
        FROM dbo.MedicaoPluviometricas m
       WHERE m.PostoId = @posto AND m.Excluido = 0
      UNION ALL
      SELECT 'cota', COUNT(*)
        FROM dbo.CotaEscalaFluviometricas c
       WHERE c.PostoId = @posto`;
    const motivo = recusa(uniaoTorta);
    expect(motivo).toContain('CotaEscalaFluviometricas');
    // E nomeia o apelido, senão quem esbarra na guarda tem de reler a consulta
    // inteira para descobrir QUAL referência ficou sem filtro.
    expect(motivo).toContain('"c"');
  });

  it('NÃO aceita o filtro de OUTRA tabela no lugar do da tabela guardada', () => {
    // Escapatória de quem lê a mensagem de erro e procura a saída mais curta:
    // pôr `Excluido = 0` de uma tabela de apoio e seguir a vida.
    const filtroDoVizinho = `
      SELECT m.Data
        FROM dbo.MedicaoPluviometricas m
        JOIN dbo.AparelhoPostos ap ON ap.PostoId = m.PostoId
       WHERE ap.Excluido = 0`;
    expect(recusa(filtroDoVizinho)).toContain('MedicaoPluviometricas');
  });

  it('NÃO aceita filtro do apelido errado quando a mesma tabela aparece duas vezes', () => {
    const doisApelidos = `
      SELECT a.Data, b.Data
        FROM dbo.MedicaoPluviometricas a
        JOIN dbo.MedicaoPluviometricas b ON b.PostoId = a.PostoId
       WHERE a.Excluido = 0`;
    const motivo = recusa(doisApelidos);
    expect(motivo).toContain('"b"');
    expect(motivo).not.toContain('"a"');
  });

  it('aceita a união das cinco quando TODAS filtram, que é o caso real', () => {
    const uniaoCerta = [
      'MedicaoPluviometricas',
      'MedicaoLoggerPluviograficas',
      'CotaEscalaFluviometricas',
      'LeituraManualPiezometricas',
      'LeituraEletronicaPiezometricas',
    ]
      .map(
        (t) => `
      SELECT serie = '${t}', n = COUNT(*)
        FROM dbo.${t} m
       WHERE m.PostoId = @posto AND m.Excluido = 0`,
      )
      .join('\n      UNION ALL\n');
    expect(recusa(uniaoCerta)).toBeNull();
  });

  it('aceita o apelido com AS explícito', () => {
    expect(
      recusa('SELECT m.Data FROM dbo.CotaEscalaFluviometricas AS m WHERE m.Excluido = 0'),
    ).toBeNull();
  });

  it('aceita a dica de tabela entre o nome e o filtro', () => {
    // `WITH (NOLOCK)` entra entre o nome da tabela e o apelido em consulta de
    // medição. Sem tratar isso, a guarda leria "WITH" como apelido e passaria a
    // exigir `WITH.Excluido = 0`, reprovando consulta correta.
    expect(
      recusa('SELECT COUNT(*) FROM dbo.MedicaoPluviometricas WITH (NOLOCK) WHERE Excluido = 0'),
    ).toBeNull();
  });

  it('a exceção declarada vale para as tabelas de medição também', () => {
    expect(
      recusa(
        'SELECT COUNT(*) FROM dbo.MedicaoPluviometricas m -- inclui-excluidos: auditoria de exclusao',
      ),
    ).toBeNull();
  });
});

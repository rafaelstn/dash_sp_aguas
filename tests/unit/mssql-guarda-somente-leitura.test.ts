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

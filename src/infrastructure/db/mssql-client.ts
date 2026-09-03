import 'server-only';
import sql, {
  type ConnectionPool,
  type IResult,
  type ISqlType,
  type Request,
} from 'mssql';
import { z } from 'zod';

/**
 * Cliente do SQL Server do órgão (`Dbfch`), SOMENTE LEITURA.
 *
 * Driver: `mssql` (node-mssql) sobre `tedious`, decidido no ADR-0023 §3. O
 * motivo que pesa é operacional, não de recursos: `tedious` implementa o
 * protocolo TDS em JavaScript puro, sem módulo nativo e sem `node-gyp`. O
 * servidor de aplicação do órgão NÃO tem saída para a internet, então
 * dependência que compile ou baixe binário na instalação transforma o deploy
 * em problema. `msnodesqlv8` exigiria o ODBC Driver instalado no sistema
 * operacional do contêiner, o que acrescentaria pacote de sistema a gerir em
 * ambiente sem rede.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE SINGLETON EM `globalThis`, E POR QUE O POOL É EXPLÍCITO
 * ─────────────────────────────────────────────────────────────────────────
 * Comentário de causa transportado de `client.ts` por exigência do ADR-0023
 * §3, porque repeti-lo aqui seria regressão conhecida:
 *
 *   Medido em 19/08/2026, no cliente PostgreSQL: guardar o singleton apenas
 *   fora de produção fazia cada toque no módulo instanciar um cliente novo,
 *   com `max: 5` e sem encerramento. Deram 5 clientes por requisição simulada
 *   e 15 em três requisições, contra 1 em desenvolvimento. Como cada consulta
 *   saía de um cliente recém-criado, cada uma abria conexão nova que só
 *   fechava por tempo ocioso, contra um pooler que aceitava 15 sessões.
 *
 * Aqui o risco é maior, não menor: do outro lado está o banco de PRODUÇÃO do
 * órgão, que não é nosso e cujo limite de sessões não controlamos. Por isso o
 * singleton vale em TODO ambiente, e o que se guarda é a PROMESSA do pool, não
 * o pool pronto. Guardar o pool pronto deixaria uma janela em que duas
 * chamadas concorrentes, antes de o primeiro `connect()` resolver, criariam
 * dois pools, que é exatamente o defeito de 19/08 com outra roupa.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * SOMENTE LEITURA
 * ─────────────────────────────────────────────────────────────────────────
 * Nenhum caminho deste módulo executa INSERT, UPDATE, DELETE ou DDL contra
 * `Dbfch`. A escrita no cadastro de posto fica indisponível até existir a API
 * do órgão (ADR-0023 §3 e §11.2), e os métodos de escrita da porta lançam
 * `EscritaIndisponivel`, que é erro visível. Escrita que não acontece e não
 * avisa é a pior categoria de defeito deste projeto.
 *
 * A guarda que sustenta isso não é este comentário: é
 * `tests/unit/mssql-somente-leitura.test.ts`, que varre os adaptadores `.mssql`
 * procurando verbo de escrita e nomeia o arquivo.
 */

/**
 * Trata string vazia como variável ausente. Mesmo motivo do `env.ts`:
 * `ENV X=$ARG` no Dockerfile, com o argumento não informado, define `X=''` em
 * vez de deixar `X` ausente, e `''` chegaria ao validador de formato.
 */
function vazioComoAusente<T extends z.ZodTypeAny>(esquema: T) {
  return z.preprocess((v) => (v === '' ? undefined : v), esquema);
}

const esquemaMssql = z.object({
  SQLSERVER_HOST: z.string().min(1),
  SQLSERVER_PORTA: vazioComoAusente(z.coerce.number().int().positive().default(1433)),
  SQLSERVER_USUARIO: z.string().min(1),
  SQLSERVER_SENHA: z.string().min(1),
  SQLSERVER_BANCO: z.string().min(1),
  /**
   * Criptografia do transporte TDS. O `mssql` v12 liga por padrão, e o
   * servidor do órgão está numa rede interna, sem internet e sem certificado
   * emitido por autoridade que o Node reconheça: com o padrão ligado a
   * conexão falha no aperto de mão, com mensagem de certificado, que manda
   * procurar credencial no lugar errado.
   *
   * Fica configurável e o padrão é o que FUNCIONA contra a instância deles,
   * medido. Ligar isto é decisão do órgão, e depende de eles publicarem o
   * certificado no contêiner.
   */
  SQLSERVER_ENCRYPT: vazioComoAusente(z.enum(['sim', 'nao']).default('nao')),
  SQLSERVER_TRUST_CERT: vazioComoAusente(z.enum(['sim', 'nao']).default('sim')),
});

export type ConfiguracaoMssql = z.infer<typeof esquemaMssql>;

let configuracaoCache: ConfiguracaoMssql | null = null;

/**
 * Lê e valida a configuração do SQL Server.
 *
 * NÃO passa por `getEnv()` de propósito: aquele módulo valida o ambiente
 * inteiro no boot, e o SQL Server é opcional (o app sobe em modo demo e o
 * adaptador PostgreSQL continua existindo). Misturar as duas coisas faria a
 * ausência da configuração do órgão derrubar a aplicação inteira.
 */
export function configuracaoMssql(): ConfiguracaoMssql {
  if (configuracaoCache) return configuracaoCache;
  const analise = esquemaMssql.safeParse(process.env);
  if (!analise.success) {
    // Só o NOME da variável entra na mensagem. Valor de credencial nunca sai
    // em log, erro ou resposta HTTP.
    const faltando = analise.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(
      `Configuração do SQL Server do órgão inválida ou ausente: ${faltando}. ` +
        'Defina SQLSERVER_HOST, SQLSERVER_PORTA, SQLSERVER_USUARIO, ' +
        'SQLSERVER_SENHA e SQLSERVER_BANCO no ambiente.',
    );
  }
  configuracaoCache = analise.data;
  return configuracaoCache;
}

/** Existe configuração de SQL Server neste ambiente? Não abre conexão. */
export function mssqlConfigurado(): boolean {
  return esquemaMssql.safeParse(process.env).success;
}

declare global {
  var __mssql_pool_dbfch__: Promise<ConnectionPool> | undefined;
}

function criarPool(): Promise<ConnectionPool> {
  const cfg = configuracaoMssql();
  const pool = new sql.ConnectionPool({
    server: cfg.SQLSERVER_HOST,
    port: cfg.SQLSERVER_PORTA,
    user: cfg.SQLSERVER_USUARIO,
    password: cfg.SQLSERVER_SENHA,
    database: cfg.SQLSERVER_BANCO,
    // Pool enxuto e explícito. O banco é de PRODUÇÃO do órgão: o custo de
    // abrir sessão demais é deles, e não temos como medir o teto de lá.
    pool: { max: 5, min: 0, idleTimeoutMillis: 20_000 },
    connectionTimeout: 15_000,
    requestTimeout: 30_000,
    options: {
      encrypt: cfg.SQLSERVER_ENCRYPT === 'sim',
      trustServerCertificate: cfg.SQLSERVER_TRUST_CERT === 'sim',
      // Aparece em `sys.dm_exec_sessions` do lado deles. Quando o DBA do órgão
      // perguntar quem está consultando, a resposta está na própria sessão.
      appName: 'spaguas-dmo (somente leitura)',
    },
  });

  // Erro de pool fora de uma consulta (queda de rede, VPN caindo) chega por
  // evento. Sem este ouvinte o Node derruba o processo por 'error' não
  // tratado, e a queda da VPN passaria a ser queda da aplicação inteira.
  pool.on('error', (e) => {
    console.error('[mssql] erro no pool do Dbfch:', String(e));
  });

  return pool.connect().catch((e) => {
    // Falha de conexão não pode envenenar o singleton: sem isto, uma queda de
    // VPN no primeiro acesso deixaria a promessa rejeitada em `globalThis` e
    // toda requisição seguinte falharia com o erro antigo, mesmo com a rede
    // de volta.
    globalThis.__mssql_pool_dbfch__ = undefined;
    throw e;
  });
}

/** Pool único e preguiçoso. Só abre conexão no primeiro uso. */
export function obterPoolMssql(): Promise<ConnectionPool> {
  if (globalThis.__mssql_pool_dbfch__) return globalThis.__mssql_pool_dbfch__;
  const promessa = criarPool();
  globalThis.__mssql_pool_dbfch__ = promessa;
  return promessa;
}

/** Encerra o pool. Usado por teste de integração; não é caminho de produção. */
export async function encerrarPoolMssql(): Promise<void> {
  const promessa = globalThis.__mssql_pool_dbfch__;
  globalThis.__mssql_pool_dbfch__ = undefined;
  if (!promessa) return;
  const pool = await promessa.catch(() => null);
  if (pool) await pool.close();
}

/** Parâmetro nomeado de consulta. O valor NUNCA entra no texto do SQL. */
export interface ParametroMssql {
  nome: string;
  tipo: ISqlType | (() => ISqlType);
  valor: unknown;
}

// ─────────────────────────────────────────────────────────────────────────
// As duas guardas, e por que elas moram AQUI
// ─────────────────────────────────────────────────────────────────────────
// A primeira versão destas guardas era um teste que varria os arquivos
// `.mssql.ts` procurando verbo de escrita no fonte. Ela não fecha, e o motivo
// é estrutural: o SQL deste adaptador é COMPOSTO em execução (`${FROM_POSTOS}`,
// `${filtro.where}`), então o texto que chega ao servidor do órgão não existe
// em lugar nenhum do fonte. Varredura estática mediria os pedaços e aprovaria
// um todo que ela nunca viu.
//
// Aqui a medição é sobre o texto FINAL, no único ponto por onde toda consulta
// passa. Vale para qualquer adaptador futuro, inclusive um escrito por quem
// nunca leu este comentário.

/** Normaliza para a checagem: tira colchetes, que são a rota de fuga óbvia. */
function textoParaChecagem(sqlTexto: string): string {
  return sqlTexto.replace(/[[\]]/g, '');
}

/**
 * Verbos de escrita e DDL, procurados como PALAVRA SOLTA.
 *
 * A primeira versão exigia o alvo junto do verbo (`update <tabela> set`,
 * `insert into`, `merge <tabela> using`), na intenção de evitar falso positivo.
 * Tentei escapar dela e escapei TRÊS vezes, todas com T-SQL válido:
 *
 *   UPDATE TOP (1) dbo.Postos SET Nome = 'x'   (o `TOP (1)` entra no meio)
 *   MERGE dbo.Postos AS alvo USING ...         (o `AS alvo` entra no meio)
 *   INSERT dbo.Postos VALUES (...)             (o `INTO` é OPCIONAL em T-SQL)
 *
 * Por isso a régua passou a ser a palavra solta, e ela não tem essa saída. O
 * que a torna segura contra falso positivo é uma propriedade do desenho, não
 * uma aposta: **o texto que chega aqui é inteiramente nosso.** Todo valor
 * digitado por usuário viaja como PARÂMETRO nomeado e nunca entra na string, e
 * comentário de TypeScript não faz parte do SQL. Nenhuma consulta de leitura
 * deste projeto contém qualquer uma destas palavras.
 *
 * Case-insensitive porque o SQL Server aceita `update ... set` em minúscula, e
 * guarda que só olha maiúscula protege contra o código que EU escreveria, não
 * contra o que alguém vai escrever.
 */
const VERBOS_PROIBIDOS: readonly string[] = [
  'insert',
  'update',
  'delete',
  'merge',
  'truncate',
  'drop',
  'create',
  'alter',
  'grant',
  'revoke',
  'deny',
  'exec',
  'execute',
  'sp_executesql',
  'bulk',
  'writetext',
  'updatetext',
];

const PADROES_DE_ESCRITA: ReadonlyArray<readonly [RegExp, string]> = VERBOS_PROIBIDOS.map(
  (verbo) => [new RegExp(`\\b${verbo}\\b`, 'i'), verbo.toUpperCase()] as const,
);

/**
 * Toda leitura de `dbo.Postos` filtra `Excluido = 0`.
 *
 * São 13 registros excluídos (MEDIDO em 02/09/2026 contra os 5.790 ativos), e
 * o `WHERE` esquecido não produz erro: produz 13 postos fantasmas na tela. É o
 * tipo de omissão que passa em revisão de código, e por isso vira guarda.
 *
 * A exceção existe e é DECLARADA no próprio SQL, com motivo escrito, para que
 * afrouxar apareça em diff:
 *   SELECT ... FROM dbo.Postos  -- inclui-excluidos: relatório de auditoria
 */
const REFERENCIA_A_POSTOS = /\bdbo\s*\.\s*Postos\b/i;
const FILTRO_DE_EXCLUIDOS = /\bExcluido\s*=\s*0\b/i;
const EXCECAO_DECLARADA = /inclui-excluidos\s*:\s*\S/i;

/** Falha do próprio adaptador, e não do banco: erro de programação, não de dado. */
export class ConsultaMssqlProibida extends Error {
  constructor(motivo: string) {
    super(`Consulta recusada antes de ir ao banco do órgão: ${motivo}`);
    this.name = 'ConsultaMssqlProibida';
  }
}

/**
 * Aplica as duas guardas ao texto final. Exportada para que o teste possa
 * exercitá-la diretamente, inclusive tentando escapar dela.
 */
export function conferirConsultaDeLeitura(sqlTexto: string): void {
  const alvo = textoParaChecagem(sqlTexto);

  for (const [padrao, rotulo] of PADROES_DE_ESCRITA) {
    if (padrao.test(alvo)) {
      throw new ConsultaMssqlProibida(
        `o acesso ao Dbfch é SOMENTE LEITURA e esta consulta contém ${rotulo}.`,
      );
    }
  }

  // A conferência do filtro é POR COMANDO, e não sobre o texto inteiro.
  //
  // A primeira versão media o texto todo, e o adaptador de facetas mostrou o
  // furo: ele manda CINCO agregações numa consulta só, e bastava uma delas ter
  // `Excluido = 0` para as outras quatro passarem sem filtro nenhum. O defeito
  // que escaparia é justo o mais difícil de ver, porque os 13 fantasmas
  // entrariam apenas na contagem de algumas facetas, e ninguém confere soma de
  // filtro contra o total.
  //
  // Separar por ponto e vírgula é seguro AQUI por uma propriedade do desenho,
  // e não por sorte: todo valor viaja como parâmetro nomeado, então o texto não
  // carrega literal de usuário onde um ponto e vírgula pudesse se esconder.
  for (const comando of alvo.split(';')) {
    if (!REFERENCIA_A_POSTOS.test(comando)) continue;
    if (FILTRO_DE_EXCLUIDOS.test(comando)) continue;
    if (EXCECAO_DECLARADA.test(comando)) continue;
    throw new ConsultaMssqlProibida(
      'lê dbo.Postos sem "Excluido = 0". São 13 postos excluídos que ' +
        'apareceriam como fantasmas na tela. Para incluí-los de propósito, ' +
        'escreva no SQL o comentário "inclui-excluidos: <motivo>".',
    );
  }
}

/**
 * Executa consulta parametrizada.
 *
 * Só existe esta porta de execução, e ela só recebe texto de SQL escrito no
 * fonte, com valores por parâmetro nomeado. Concatenar valor em SQL é proibido
 * pela rule `padrao`, e aqui o proibido também é caro: a credencial que usamos
 * é do órgão.
 */
export async function consultarMssql<T>(
  texto: string,
  parametros: readonly ParametroMssql[] = [],
): Promise<IResult<T>> {
  conferirConsultaDeLeitura(texto);
  const pool = await obterPoolMssql();
  const requisicao: Request = pool.request();
  for (const p of parametros) {
    requisicao.input(p.nome, p.tipo, p.valor);
  }
  return requisicao.query<T>(texto);
}

/** Tipos de parâmetro usados pelos adaptadores. Reexporta para não espalhar o import do driver. */
export const TiposMssql = {
  texto: sql.VarChar,
  textoUnicode: sql.NVarChar,
  inteiro: sql.Int,
  decimal: sql.Float,
  guid: sql.UniqueIdentifier,
} as const;

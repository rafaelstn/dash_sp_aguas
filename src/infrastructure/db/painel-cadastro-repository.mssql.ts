import 'server-only';
import type {
  ClasseDesconformidade,
  DistribuicaoTipo,
  PainelCadastroRepository,
  RankingMantenedor,
  RankingUGRHI,
  ResumoCadastroPostos,
  StatusOperacional,
} from '@/application/ports/painel-repository';
import { FalhaRepositorio } from '@/domain/errors';
import { consultarMssql } from './mssql-client';
import { FROM_POSTOS, UGRHI_NOME, UGRHI_NUMERO } from './postos-dbfch-sql';

/**
 * A metade CADASTRAL do painel, lida AO VIVO do SQL Server do órgão (`Dbfch`).
 * ADR-0023, somente leitura.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ADAPTADOR PRECISOU EXISTIR
 * ─────────────────────────────────────────────────────────────────────────
 * O painel lia `painel-repository.pg`, ou seja, a tabela `postos` do NOSSO
 * PostgreSQL, e o cadastro deixou de morar ali. MEDIDO em 03/09/2026: a tabela
 * tem 0 linhas no container de produção e 2.483 linhas velhas na instância
 * legada do Supabase, contra 5.790 postos ativos no `Dbfch`. Os dois estados
 * são ruins e o segundo é pior: zero se parece com defeito, e 2.483 se parece
 * com resposta.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * UMA CONSULTA SÓ, PELO MESMO MOTIVO DAS FACETAS
 * ─────────────────────────────────────────────────────────────────────────
 * A página dispara SEIS métodos em `Promise.all`. Contra o nosso banco, ao
 * lado, isso é barato; contra a produção do órgão, atrás da rede interna, seis
 * conexões simultâneas passam do teto do pool (`max: 5`, em `mssql-client.ts`):
 * um carregamento do painel consumiria o pool inteiro. As cinco agregações
 * cadastrais viajam em conjuntos de resultado de uma consulta só.
 *
 * Todas as cinco passam por `FROM_POSTOS`, as MESMAS junções da busca e das
 * facetas. Não é economia de linha: painel contado por um caminho e lista
 * filtrada por outro divergem no primeiro ajuste, e o sintoma seria um total no
 * painel que a busca não consegue reproduzir.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRÊS COISAS MEDIDAS QUE O SQL ABAIXO NÃO MOSTRA (03/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * 1. `SUM(CASE WHEN EXISTS (...))` é RECUSADO pelo SQL Server ("Cannot perform
 *    an aggregate function on an expression containing an aggregate or a
 *    subquery"). Por isso a telemetria entra por `CROSS APPLY`, que resolve o
 *    `EXISTS` por linha e devolve um inteiro somável.
 * 2. As junções de `FROM_POSTOS` NÃO multiplicam linha: com elas todas, a
 *    contagem continua 5.790, igual à contagem crua de `dbo.Postos` com
 *    `Excluido = 0`. Linha multiplicada estragaria toda contagem deste arquivo
 *    sem estragar nada visível.
 * 3. `Prefixo` é único entre os ativos (5.790 distintos em 5.790 linhas), então
 *    contar linha e contar prefixo distinto dá o mesmo número. O adaptador
 *    PostgreSQL conta `DISTINCT prefixo` porque a origem dele não garantia
 *    isso; aqui a garantia é medida, e está escrita para não virar suposição.
 */

/**
 * Vida do cache em memória, por processo.
 *
 * São 60 segundos, e não os 10 minutos das facetas, porque as duas coisas
 * respondem perguntas diferentes: rótulo de filtro praticamente não muda, e o
 * painel é o lugar onde alguém confere se uma alteração de cadastro apareceu.
 * É a mesma janela que o adaptador PostgreSQL já usava, então o painel não
 * ficou mais velho ao trocar de origem.
 */
const TTL_MS = 60_000;

/** Designações de aparelho que caracterizam telemetria. Mesma lista da busca. */
const DESIGNACOES_TELEMETRICAS = "'PLUVIOMETRO TELEMETRICO', 'LIMNIGRAFO TELEMETRICO'";

/**
 * Regra de status operacional, escrita UMA vez porque ela aparece em dois
 * lugares (o cartão de status e a coluna "ativos" do ranking de mantenedores) e
 * precisa dar o mesmo número nos dois.
 *
 * É a MESMA heurística de recência do filtro `status=ativo` da busca
 * (`postos-repository.mssql.ts`), de propósito: o cartão "Postos ativos" leva
 * para `/?status=ativo`, e um cartão que promete 4.416 e entrega outra
 * contagem é o defeito que ninguém reporta porque ninguém confere.
 */
const EH_ATIVO = '(p.DataExtincao IS NULL OR YEAR(p.DataExtincao) >= YEAR(GETDATE()) - 1)';

const SQL_PAINEL_CADASTRO = `
  SELECT total = COUNT(*),
         comCoordenadas = SUM(CASE WHEN coord.Latitude IS NOT NULL
                                    AND coord.Longitude IS NOT NULL
                               THEN 1 ELSE 0 END),
         comTelemetria = SUM(tel.tem)
    ${FROM_POSTOS}
    CROSS APPLY (
      SELECT tem = CASE WHEN EXISTS (
               SELECT 1
                 FROM dbo.AparelhoPostos ap
                 JOIN dbo.Aparelhos a ON a.Id = ap.AparelhoId
                WHERE ap.PostoId = p.Id
                  AND ap.Excluido = 0
                  AND a.Excluido = 0
                  AND ap.DataDesativacao IS NULL
                  AND a.Designacao IN (${DESIGNACOES_TELEMETRICAS})
             ) THEN 1 ELSE 0 END
    ) tel
   WHERE p.Excluido = 0;

  SELECT total = COUNT(*),
         ativos = SUM(CASE WHEN ${EH_ATIVO} THEN 1 ELSE 0 END),
         desativados = SUM(CASE WHEN NOT ${EH_ATIVO}
                                 AND YEAR(p.DataExtincao) > 0 THEN 1 ELSE 0 END),
         indeterminados = SUM(CASE WHEN p.DataExtincao IS NOT NULL
                                    AND YEAR(p.DataExtincao) = 0 THEN 1 ELSE 0 END)
    FROM dbo.Postos p
   WHERE p.Excluido = 0;

  SELECT tipo = tm.Descricao, total = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND tm.Descricao IS NOT NULL
   GROUP BY tm.Descricao
   ORDER BY total DESC;

  SELECT numero = ${UGRHI_NUMERO},
         nome   = MAX(${UGRHI_NOME}),
         total  = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND ${UGRHI_NUMERO} IS NOT NULL
   GROUP BY ${UGRHI_NUMERO}
   ORDER BY numero;

  SELECT nome = oper.Nome,
         total = COUNT(*),
         ativos = SUM(CASE WHEN ${EH_ATIVO} THEN 1 ELSE 0 END)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND oper.Nome IS NOT NULL AND LTRIM(RTRIM(oper.Nome)) <> ''
   GROUP BY oper.Nome
   ORDER BY total DESC, nome ASC;
`;

interface LinhaResumo {
  total: number;
  comCoordenadas: number;
  comTelemetria: number;
}
interface LinhaStatus {
  total: number;
  ativos: number;
  desativados: number;
  indeterminados: number;
}
interface LinhaTipo {
  tipo: string | null;
  total: number;
}
interface LinhaUgrhi {
  numero: number | null;
  nome: string | null;
  total: number;
}
interface LinhaMantenedor {
  nome: string | null;
  total: number;
  ativos: number;
}

interface PainelCadastroDbfch {
  resumo: ResumoCadastroPostos;
  status: StatusOperacional;
  tipos: DistribuicaoTipo[];
  ugrhis: RankingUGRHI[];
  mantenedores: RankingMantenedor[];
}

let cache: { em: number; dados: PainelCadastroDbfch } | null = null;
let emVoo: Promise<PainelCadastroDbfch> | null = null;

/** Apaga o cache. Existe para o teste medir a consulta, e não a memória. */
export function _limparCachePainelCadastroMssql(): void {
  cache = null;
  emVoo = null;
}

function texto(valor: string | null): string | null {
  if (valor === null) return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}

async function buscar(): Promise<PainelCadastroDbfch> {
  const agora = Date.now();
  if (cache && agora - cache.em < TTL_MS) return cache.dados;
  // A página pede as seis agregações em paralelo. Sem esta guarda, o primeiro
  // carregamento com o cache frio dispara SEIS consultas idênticas ao órgão,
  // porque nenhuma delas terminou a tempo de popular o cache para as outras.
  // Guardar a promessa em voo faz as seis compartilharem uma ida só.
  if (emVoo) return emVoo;

  emVoo = (async () => {
    try {
      const r = await consultarMssql<unknown>(SQL_PAINEL_CADASTRO);

      // O driver não tipa conjunto por conjunto, então há UM ponto de conversão
      // e ele é conferido em execução: se a consulta mudar de forma, a falha é
      // aqui, com o esperado e o recebido, e não três camadas adiante com um
      // campo `undefined`.
      const conjuntos = r.recordsets as unknown[] as [
        LinhaResumo[],
        LinhaStatus[],
        LinhaTipo[],
        LinhaUgrhi[],
        LinhaMantenedor[],
      ];
      if (!Array.isArray(conjuntos) || conjuntos.length !== 5) {
        throw new Error(
          `esperava 5 conjuntos de resultado, recebi ${
            Array.isArray(conjuntos) ? conjuntos.length : typeof conjuntos
          }`,
        );
      }
      const [resumo, status, tipos, ugrhis, mantenedores] = conjuntos;
      const r0 = resumo[0];
      const s0 = status[0];
      if (!r0 || !s0) throw new Error('resumo ou status vieram sem linha');

      const dados: PainelCadastroDbfch = {
        resumo: {
          totalPostos: Number(r0.total),
          postosComCoordenadas: Number(r0.comCoordenadas),
          postosComTelemetria: Number(r0.comTelemetria),
          // ZERO DECLARADO, E NÃO NÚMERO AUSENTE. Ver o bloco
          // `DESCONFORMIDADE` no fim deste arquivo: a régua de desconformidade
          // é da planilha DAEE e não descreve o vocabulário do `Dbfch`.
          desconformidadesPostos: 0,
        },
        status: {
          total: Number(s0.total),
          ativos: Number(s0.ativos),
          desativados: Number(s0.desativados),
          indeterminados: Number(s0.indeterminados),
        },
        tipos: tipos
          .map((l) => ({ tipo: texto(l.tipo), total: Number(l.total) }))
          .filter((l): l is DistribuicaoTipo => l.tipo !== null),
        ugrhis: ugrhis
          .filter((l) => l.numero !== null)
          .map((l) => ({
            // O contrato pede texto; a origem é `int`. Rótulo cai para o número
            // quando não há descrição, mesmo COALESCE das facetas: rótulo vazio
            // na tela é pior que rótulo numérico.
            numero: String(l.numero),
            nome: texto(l.nome) ?? String(l.numero),
            total: Number(l.total),
            desconformes: 0,
            taxa: 0,
          })),
        mantenedores: mantenedores
          .map((l) => ({
            nome: texto(l.nome),
            total: Number(l.total),
            ativos: Number(l.ativos),
          }))
          .filter((l): l is RankingMantenedor => l.nome !== null),
      };

      cache = { em: Date.now(), dados };
      return dados;
    } catch (e) {
      throw new FalhaRepositorio('painel.cadastroDbfch', e);
    } finally {
      emVoo = null;
    }
  })();

  return emVoo;
}

export const painelCadastroRepositoryMssql: PainelCadastroRepository = {
  /**
   * `Dbfch` não tem coluna de criação nem de atualização de linha: as únicas
   * datas de `dbo.Postos` são `DataInstalacao` e `DataExtincao` (ADR §10.7).
   * Sem data de criação não existe série cumulativa da população de postos, e
   * o compositor descarta as duas séries cadastrais por causa desta linha.
   *
   * `DataInstalacao` NÃO serve de substituto, e a tentação é real: ela é a data
   * em que o posto começou a operar no mundo, e não a data em que a linha
   * entrou no cadastro. Uma série montada sobre ela mostraria a rede sendo
   * construída ao longo de décadas, com o rótulo "vs. mês anterior".
   */
  temHistoricoDeCadastro: false,

  async resumoCadastro(): Promise<ResumoCadastroPostos> {
    return (await buscar()).resumo;
  },

  async statusOperacional(): Promise<StatusOperacional> {
    return (await buscar()).status;
  },

  async distribuicaoPorTipo(): Promise<DistribuicaoTipo[]> {
    return (await buscar()).tipos;
  },

  async rankingUGRHI(): Promise<RankingUGRHI[]> {
    return (await buscar()).ugrhis;
  },

  /**
   * O limite corta em memória, e não no SQL, porque são 34 operadoras distintas
   * na base inteira (MEDIDO). Cortar no banco obrigaria uma consulta por valor
   * de limite e uma entrada de cache por valor; cortar aqui deixa uma ida só
   * servindo qualquer limite que a tela peça.
   */
  async rankingMantenedores(limite = 15): Promise<RankingMantenedor[]> {
    return (await buscar()).mantenedores.slice(0, limite);
  },

  /* ────────────────────────────────────────────────────────────────────────
   * DESCONFORMIDADE: POR QUE ESTA ORIGEM DEVOLVE VAZIO, E POR QUE PORTAR A
   * RÉGUA SERIA PIOR QUE NÃO PORTAR
   * ────────────────────────────────────────────────────────────────────────
   * A régua de desconformidade mora na view `v_postos_desconformes`, do nosso
   * PostgreSQL, e nasceu para a planilha do DAEE: prefixo conforme é
   * `1D-008` (fluviometria), `A2-041` (pluviometria), `1D-008P`
   * (piezometria) ou quatro letras mais quatro dígitos (QualiÁgua).
   *
   * TRADUZI a régua para T-SQL e rodei contra o `Dbfch` em 03/09/2026, sobre os
   * 5.790 postos ativos:
   *
   *     outlier_prefixo               3.084
   *     conforme_pluviometria         1.841
   *     conforme_fluviometria           697
   *     conforme_piezometria            107
   *     suspeita_troca_letra_digito      61
   *
   * São 3.145 postos (54% da rede) que o painel chamaria de "cadastro
   * irregular". Olhando os prefixos recusados, a explicação não é o cadastro do
   * órgão estar podre: é a régua não conhecer o vocabulário dele. A maior
   * família recusada são códigos numéricos de oito dígitos (`01947000`,
   * `02043005`), que no `Dbfch` são prefixo legítimo de posto pluviométrico.
   * Conferido que não é artefato de comparação: `Prefixo` é `varchar(8)` sem
   * enchimento, e aparar espaço não muda nenhum dos cinco números acima.
   *
   * Então há três saídas, e duas são armadilha:
   *   - Publicar 3.145 é alarme falso em mais da metade da rede, e alarme que
   *     ninguém consegue resolver é alarme que o gestor aprende a ignorar.
   *   - Ler a view do PostgreSQL enquanto o total vem do `Dbfch` é pior: seriam
   *     489 desconformes (medidos na instância legada) sobre 5.790 postos de
   *     OUTRA população, e a taxa por UGRHI viraria razão entre duas bases
   *     diferentes, com cara de número.
   *   - Devolver vazio, que é o que este adaptador faz, e dizer por quê.
   *
   * A régua nova é decisão de produto com o órgão, e não tradução mecânica:
   * alguém precisa dizer quais famílias de prefixo são oficiais no `Dbfch`.
   * Enquanto isso não existe, "cadastro irregular" fica zerado nesta origem, e
   * fica COERENTE com a tela `/desconformidades`, que lê a mesma view sobre a
   * mesma tabela vazia.
   * ──────────────────────────────────────────────────────────────────────── */
  async classesDesconformidade(): Promise<ClasseDesconformidade[]> {
    return [];
  },
};

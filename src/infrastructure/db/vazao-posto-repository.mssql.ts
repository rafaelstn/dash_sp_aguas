import 'server-only';
import type { Paginacao } from '@/application/ports/series-medicao-repository';
import type {
  CurvaChave,
  MedicaoVazao,
  PaginaMedicoesVazao,
  TrechoCurvaChave,
  VazaoPostoRepository,
} from '@/application/ports/vazao-posto-repository';
import { FalhaRepositorio } from '@/domain/errors';
import { consultarMssql, TiposMssql } from './mssql-client';
import { idDoPosto } from './series-medicao-repository.mssql';

/**
 * Medições de vazão e curvas-chave lidas AO VIVO do `Dbfch` (ADR-0023).
 *
 * Somente leitura. `Excluido = 0` em cada referência às três tabelas com
 * exclusão lógica, conferido pela guarda de `mssql-client`. `Entidades` é
 * tabela de apoio e segue a regra de `FROM_POSTOS`: sem filtro de exclusão,
 * para uma entidade desativada não apagar a sigla de medição antiga.
 *
 * Volume MEDIDO em 17/09/2026: `ResumoMedicaoVazoes` tem 70.157 linhas em 519
 * postos, e `CurvaChaveFluviometricas` tem 2.737 curvas em 375 postos (o maior
 * com 60). As consultas filtram por `PostoId`, então o volume por chamada é
 * pequeno; por isso as medições são paginadas e as curvas não.
 */

function momentoIso(valor: Date | string): string {
  const d = valor instanceof Date ? valor : new Date(valor);
  return d.toISOString();
}

/** `decimal` chega como número ou texto conforme a precisão. */
function numero(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

function obrigatorio(valor: unknown): number {
  // As colunas lidas por aqui são NOT NULL na origem. Se um dia vierem nulas,
  // `NaN` estragaria o JSON em silêncio; zero seria medida inventada.
  const n = numero(valor);
  if (n === null) throw new Error('coluna numérica obrigatória veio vazia na origem');
  return n;
}

function texto(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}

interface LinhaMedicao {
  DataInicial: Date;
  DataFinal: Date;
  CotaInicial: unknown;
  CotaFinal: unknown;
  VazaoLiquida: unknown;
  AreaSeccao: unknown;
  LarguraSeccao: unknown;
  ProfundidadeMedia: unknown;
  VelocidadeMedia: unknown;
  Qualidade: string | null;
  Entidade: string | null;
}

interface LinhaCurva {
  CurvaId: string;
  DataInicio: Date;
  DataFinal: Date;
  IndiceQualidade: string;
  Consistencia: string;
  Vigente: number;
  CoeficienteK: unknown;
  CoeficienteH: unknown;
  CoeficienteN: unknown;
  CoeficienteI: unknown;
}

export const vazaoPostoRepositoryMssql: VazaoPostoRepository = {
  async listarMedicoes(
    prefixo: string,
    paginacao: Paginacao,
  ): Promise<PaginaMedicoesVazao | null> {
    try {
      const posto = await idDoPosto(prefixo);
      if (posto === null) return null;

      const paramPosto = { nome: 'posto', tipo: TiposMssql.guid, valor: posto };
      const [pagina, contagem] = await Promise.all([
        consultarMssql<LinhaMedicao>(
          `SELECT r.DataInicial, r.DataFinal, r.CotaInicial, r.CotaFinal, r.VazaoLiquida,
                  r.AreaSeccao, r.LarguraSeccao, r.ProfundidadeMedia, r.VelocidadeMedia,
                  r.Qualidade, Entidade = ent.Sigla
             FROM dbo.ResumoMedicaoVazoes r
             LEFT JOIN dbo.Entidades ent ON ent.Id = r.EntidadeId
            WHERE r.PostoId = @posto AND r.Excluido = 0
            ORDER BY r.DataInicial DESC, r.Id
            OFFSET @deslocamento ROWS FETCH NEXT @limite ROWS ONLY`,
          [
            paramPosto,
            {
              nome: 'deslocamento',
              tipo: TiposMssql.inteiro,
              valor: (paginacao.pagina - 1) * paginacao.porPagina,
            },
            { nome: 'limite', tipo: TiposMssql.inteiro, valor: paginacao.porPagina },
          ],
        ),
        consultarMssql<{ Total: number }>(
          `SELECT Total = COUNT(*) FROM dbo.ResumoMedicaoVazoes r
            WHERE r.PostoId = @posto AND r.Excluido = 0`,
          [paramPosto],
        ),
      ]);

      const itens: MedicaoVazao[] = pagina.recordset.map((l) => ({
        dataInicial: momentoIso(l.DataInicial),
        dataFinal: momentoIso(l.DataFinal),
        cotaInicial: obrigatorio(l.CotaInicial),
        cotaFinal: obrigatorio(l.CotaFinal),
        vazaoLiquida: obrigatorio(l.VazaoLiquida),
        areaSeccao: numero(l.AreaSeccao),
        larguraSeccao: numero(l.LarguraSeccao),
        profundidadeMedia: numero(l.ProfundidadeMedia),
        velocidadeMedia: numero(l.VelocidadeMedia),
        qualidade: texto(l.Qualidade),
        entidadeMedidora: texto(l.Entidade),
      }));

      return { total: Number(contagem.recordset[0]?.Total ?? 0), itens };
    } catch (e) {
      throw new FalhaRepositorio('listarMedicoesVazao', e);
    }
  },

  async listarCurvasChave(prefixo: string): Promise<readonly CurvaChave[] | null> {
    try {
      const posto = await idDoPosto(prefixo);
      if (posto === null) return null;

      // Uma consulta para curvas e trechos. `LEFT JOIN` porque 135 curvas não
      // têm equação e precisam aparecer mesmo assim. O filtro de exclusão da
      // equação fica NA junção: no `WHERE` ele transformaria a junção externa
      // em interna e sumiria com essas curvas.
      const r = await consultarMssql<LinhaCurva>(
        `SELECT CurvaId = c.Id, c.DataInicio, c.DataFinal, c.IndiceQualidade, c.Consistencia,
                Vigente = CASE WHEN c.DataInicio <= GETDATE() AND c.DataFinal >= GETDATE()
                               THEN 1 ELSE 0 END,
                e.CoeficienteK, e.CoeficienteH, e.CoeficienteN, e.CoeficienteI
           FROM dbo.CurvaChaveFluviometricas c
           LEFT JOIN dbo.EquacoesCurvaChaveFluviometricas e
             ON e.CurvaChaveId = c.Id AND e.Excluido = 0
          WHERE c.PostoId = @posto AND c.Excluido = 0
          ORDER BY c.DataInicio DESC, c.Id, e.CoeficienteI`,
        [{ nome: 'posto', tipo: TiposMssql.guid, valor: posto }],
      );

      const curvas: Array<{ id: string; curva: CurvaChave; trechos: TrechoCurvaChave[] }> = [];
      for (const l of r.recordset) {
        const id = l.CurvaId.toLowerCase();
        let atual = curvas[curvas.length - 1];
        if (!atual || atual.id !== id) {
          const trechos: TrechoCurvaChave[] = [];
          atual = {
            id,
            trechos,
            curva: {
              dataInicio: momentoIso(l.DataInicio),
              dataFinal: momentoIso(l.DataFinal),
              vigente: l.Vigente === 1,
              indiceQualidade: l.IndiceQualidade.trim(),
              consistencia: l.Consistencia.trim(),
              trechos,
            },
          };
          curvas.push(atual);
        }
        if (l.CoeficienteK !== null && l.CoeficienteK !== undefined) {
          atual.trechos.push({
            k: obrigatorio(l.CoeficienteK),
            h: obrigatorio(l.CoeficienteH),
            n: obrigatorio(l.CoeficienteN),
            i: obrigatorio(l.CoeficienteI),
          });
        }
      }
      return curvas.map((c) => c.curva);
    } catch (e) {
      throw new FalhaRepositorio('listarCurvasChave', e);
    }
  },
};

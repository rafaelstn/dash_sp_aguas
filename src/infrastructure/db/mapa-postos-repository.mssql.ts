import 'server-only';
import type {
  FiltroCadastroMapa,
  MapaPostosRepository,
} from '@/application/ports/mapa-postos-repository';
import {
  coordenadaSuspeita,
  tipoDaDescricao,
  type FonteVazao,
  type PontoMapaPosto,
  type Transmissao,
} from '@/domain/mapa-postos';
import { FalhaRepositorio } from '@/domain/errors';
import { consultarMssql, TiposMssql } from './mssql-client';
import { FROM_POSTOS, UGRHI_NUMERO } from './postos-dbfch-sql';
import {
  DESIGNACOES,
  PREFIXOS_VAZAO,
  montarFiltro,
  prefixosFavoritosDoUsuario,
  type ConstrutorFiltro,
} from './postos-repository.mssql';

/**
 * Pontos do mapa lidos do `Dbfch`, em UMA consulta para a base inteira.
 *
 * Reaproveita, sem cópia, o que a busca paginada já usa: o mesmo `FROM`
 * (`FROM_POSTOS`), o mesmo `WHERE` de cadastro (`montarFiltro`), a mesma lista
 * de designações de aparelho (`DESIGNACOES`) e a mesma leitura de favoritos.
 * Uma segunda versão de qualquer um deles faria o mapa e a lista discordarem
 * sobre o mesmo filtro sem nada quebrar.
 *
 * A classificação sai em colunas de bit (0 ou 1) calculadas no servidor, e o
 * TypeScript só as traduz em listas. As regras de cada dimensão estão escritas
 * em `domain/mapa-postos.ts`.
 *
 * `convencional` é a união de três conjuntos que o cadastro já separa:
 * `DESIGNACOES.convencional` (chuva lida por observador), `DESIGNACOES.nivel`
 * (escala e limnígrafo de papel) e `PIEZOMETRO`, que é o piezômetro sem
 * gravação local. O último não está em `DESIGNACOES` porque a ficha do posto
 * nunca o exibiu; aqui ele entra para o piezômetro manual não ficar sem
 * transmissão nenhuma.
 */

const PIEZOMETRO_CONVENCIONAL = 'PIEZOMETRO';

interface LinhaPontoMssql {
  Prefixo: string;
  Nome: string | null;
  Latitude: number | null;
  Longitude: number | null;
  TipoPosto: string | null;
  Extinto: number;
  UgrhiNumero: number | null;
  Municipio: string | null;
  Uf: string | null;
  Telemetrico: number | null;
  GravacaoLocal: number | null;
  Convencional: number | null;
  VazaoAparelho: number | null;
  Medicao: number;
  Curva: number;
}

/** Cinco casas decimais de grau são cerca de 1 m, e cortam o JSON em um terço. */
function coordenada(valor: number | null): number | null {
  if (valor === null || !Number.isFinite(Number(valor))) return null;
  return Math.round(Number(valor) * 1e5) / 1e5;
}

function texto(valor: string | null): string | null {
  if (valor === null) return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}

/**
 * Sigla de UF como o mainframe grava. Só duas letras viram sigla: qualquer
 * outra coisa vira `null`, e não uma unidade da federação inventada.
 */
function siglaUf(valor: string | null): string | null {
  const t = texto(valor)?.toUpperCase() ?? null;
  return t !== null && /^[A-Z]{2}$/.test(t) ? t : null;
}

function marcadores(f: ConstrutorFiltro, valores: Iterable<string>): string {
  return [...valores].map((v) => f.param(TiposMssql.texto, v)).join(', ');
}

function sqlPontos(f: ConstrutorFiltro): string {
  const telemetrico = marcadores(f, DESIGNACOES.telemetrico);
  const gravacaoLocal = marcadores(f, DESIGNACOES.loggerEqp);
  const convencional = marcadores(f, [
    ...DESIGNACOES.convencional,
    ...DESIGNACOES.nivel,
    PIEZOMETRO_CONVENCIONAL,
  ]);
  const vazao = PREFIXOS_VAZAO.map(
    (p) => `LTRIM(apa.Designacao) LIKE ${f.param(TiposMssql.texto, `${p}%`)}`,
  ).join(' OR ');

  return `SELECT p.Prefixo,
          Nome = p.Nome,
          coord.Latitude, coord.Longitude,
          TipoPosto = tm.Descricao,
          Extinto = CASE WHEN p.DataExtincao IS NOT NULL AND p.DataExtincao <= GETDATE()
                         THEN 1 ELSE 0 END,
          UgrhiNumero = ${UGRHI_NUMERO},
          Municipio = md.Nome,
          Uf = COALESCE(NULLIF(LTRIM(RTRIM(p.CodigoEstadoMainframe)), ''),
                        NULLIF(LTRIM(RTRIM(md.CodigoUnidadeFederacaoMainframe)), '')),
          inst.Telemetrico, inst.GravacaoLocal, inst.Convencional, inst.VazaoAparelho,
          Medicao = CASE WHEN EXISTS (
                      SELECT 1 FROM dbo.ResumoMedicaoVazoes rmv
                       WHERE rmv.PostoId = p.Id AND rmv.Excluido = 0) THEN 1 ELSE 0 END,
          Curva = CASE WHEN EXISTS (
                      SELECT 1 FROM dbo.CurvaChaveFluviometricas ccf
                       WHERE ccf.PostoId = p.Id AND ccf.Excluido = 0) THEN 1 ELSE 0 END
     ${FROM_POSTOS}
     OUTER APPLY (
       SELECT Telemetrico   = MAX(CASE WHEN apa.Designacao IN (${telemetrico}) THEN 1 ELSE 0 END),
              GravacaoLocal = MAX(CASE WHEN apa.Designacao IN (${gravacaoLocal}) THEN 1 ELSE 0 END),
              Convencional  = MAX(CASE WHEN apa.Designacao IN (${convencional}) THEN 1 ELSE 0 END),
              VazaoAparelho = MAX(CASE WHEN ${vazao} THEN 1 ELSE 0 END)
         FROM dbo.AparelhoPostos app
         JOIN dbo.Aparelhos apa ON apa.Id = app.AparelhoId
        WHERE app.PostoId = p.Id
          AND app.Excluido = 0
          AND apa.Excluido = 0
          AND app.DataDesativacao IS NULL
     ) inst
    WHERE ${f.where}
    ORDER BY p.Prefixo`;
}

function mapear(l: LinhaPontoMssql): PontoMapaPosto {
  const transmissao: Transmissao[] = [];
  if (l.Telemetrico === 1) transmissao.push('telemetrico');
  if (l.GravacaoLocal === 1) transmissao.push('gravacao_local');
  if (l.Convencional === 1) transmissao.push('convencional');

  const vazao: FonteVazao[] = [];
  if (l.VazaoAparelho === 1) vazao.push('aparelho_ativo');
  if (l.Medicao === 1) vazao.push('medicao');
  if (l.Curva === 1) vazao.push('curva');

  const lat = coordenada(l.Latitude);
  const lon = coordenada(l.Longitude);
  // Meia coordenada não se desenha: as duas ou nenhuma.
  const temAsDuas = lat !== null && lon !== null;
  return {
    prefixo: l.Prefixo.trim(),
    nome: texto(l.Nome),
    lat: temAsDuas ? lat : null,
    lon: temAsDuas ? lon : null,
    tipo: tipoDaDescricao(l.TipoPosto),
    situacao: l.Extinto === 1 ? 'extinto' : 'em_operacao',
    transmissao,
    vazao,
    ugrhi: l.UgrhiNumero === null ? null : Number(l.UgrhiNumero),
    municipio: texto(l.Municipio),
    uf: siglaUf(l.Uf),
    coordenadaSuspeita: coordenadaSuspeita(temAsDuas ? lat : null, temAsDuas ? lon : null),
  };
}

export const mapaPostosRepositoryMssql: MapaPostosRepository = {
  async listarPontos(filtro: FiltroCadastroMapa): Promise<readonly PontoMapaPosto[]> {
    try {
      const favoritos = filtro.apenasFavoritos
        ? await prefixosFavoritosDoUsuario(filtro.usuarioId ?? null)
        : null;
      const f = montarFiltro(
        {
          termo: filtro.termo,
          prefixoComecaCom: filtro.prefixoComecaCom,
          municipio: filtro.municipio,
          baciaHidrografica: filtro.baciaHidrografica,
          mantenedor: filtro.mantenedor,
          apenasFavoritos: filtro.apenasFavoritos,
          usuarioId: filtro.usuarioId,
        },
        favoritos,
      );
      if (f === null) return [];

      // O texto é montado ANTES de ler `f.parametros`: os marcadores das
      // designações são registrados no mesmo construtor durante a montagem.
      const consulta = sqlPontos(f);
      const r = await consultarMssql<LinhaPontoMssql>(consulta, f.parametros);
      return r.recordset.map(mapear);
    } catch (e) {
      throw new FalhaRepositorio('listarPontosMapa', e);
    }
  },
};

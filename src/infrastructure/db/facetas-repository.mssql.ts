import 'server-only';
import type {
  FacetasPostos,
  FacetasRepository,
} from '@/application/ports/facetas-repository';
import { FalhaRepositorio } from '@/domain/errors';
import { consultarMssql } from './mssql-client';
import { FROM_POSTOS, UGRHI_NOME, UGRHI_NUMERO } from './postos-dbfch-sql';

/**
 * Valores disponíveis para os filtros da busca, agregados AO VIVO sobre o SQL
 * Server do órgão (`Dbfch`). ADR-0023.
 *
 * Este adaptador existe porque sem ele a entrega ficaria pela metade de um jeito
 * difícil de ver: o adaptador de postos sozinho faz a busca por texto e a ficha
 * funcionarem, e os cinco seletores de filtro da tela continuariam LENDO O NOSSO
 * PostgreSQL, cuja tabela `postos` está vazia. O resultado seria uma tela que
 * acha posto e não oferece nenhum filtro, sem erro em lugar nenhum.
 *
 * As junções vêm de `postos-dbfch-sql.ts`, as MESMAS que a busca usa. Isso não é
 * economia de linha: lista de filtro montada por um caminho e busca filtrada por
 * outro divergem no primeiro ajuste, e o sintoma seria um filtro que aparece na
 * tela e devolve zero resultado.
 */

/** Espelha o `bacia_hidrografica` do nosso cadastro, que é curso d'água. */
interface LinhaNome {
  nome: string | null;
  total: number;
}

interface LinhaUgrhi {
  numero: number | null;
  nome: string | null;
  total: number;
}

interface LinhaCodigo {
  codigo: string | null;
  total: number;
}

/**
 * Cinco agregações numa ÚNICA ida ao servidor do órgão.
 *
 * O adaptador PostgreSQL dispara cinco consultas em paralelo, o que ali é
 * barato porque o banco é nosso e está ao lado. Aqui do outro lado está a
 * produção do órgão, atrás da rede interna, e cinco conexões simultâneas é
 * justamente o teto do pool: uma tela de filtros consumiria o pool inteiro.
 * Conjuntos de resultado numa consulta só resolvem isso sem pool maior.
 *
 * Toda leitura filtra `p.Excluido = 0`, e a barreira de `consultarMssql` recusa
 * a consulta se alguma das cinco esquecer.
 *
 * `mantenedores` sai só de `Entidades` pela operadora: o campo `btl` do nosso
 * cadastro não tem origem em `Dbfch` (ADR §10.5), então o `UNION ALL` do
 * adaptador PostgreSQL não tem segunda metade aqui.
 */
const SQL_FACETAS = `
  SELECT numero = ${UGRHI_NUMERO},
         nome   = MAX(${UGRHI_NOME}),
         total  = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND ${UGRHI_NUMERO} IS NOT NULL
   GROUP BY ${UGRHI_NUMERO}
   ORDER BY numero;

  SELECT nome = md.Nome, total = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND md.Nome IS NOT NULL AND LTRIM(RTRIM(md.Nome)) <> ''
   GROUP BY md.Nome
   ORDER BY nome;

  SELECT nome = ca.Nome, total = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND ca.Nome IS NOT NULL AND LTRIM(RTRIM(ca.Nome)) <> ''
   GROUP BY ca.Nome
   ORDER BY nome;

  SELECT codigo = tm.Descricao, total = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND tm.Descricao IS NOT NULL
   GROUP BY tm.Descricao
   ORDER BY codigo;

  SELECT nome = oper.Nome, total = COUNT(*)
    ${FROM_POSTOS}
   WHERE p.Excluido = 0 AND oper.Nome IS NOT NULL AND LTRIM(RTRIM(oper.Nome)) <> ''
   GROUP BY oper.Nome
   ORDER BY nome;
`;

/**
 * Cache em memória por processo.
 *
 * Isto NÃO contraria a ordem de não haver cópia nem banco intermediário: são
 * cinco listas de rótulo de filtro, com dez minutos de vida, no processo, que
 * morrem no restart. A regra é sobre não espelhar o cadastro; a ficha e a busca
 * continuam indo ao `Dbfch` a cada requisição.
 *
 * O que ele evita é concreto: as cinco agregações varrem os 5.790 postos com
 * sete junções, e a tela de busca as pede a cada carregamento.
 */
const TTL_MS = 10 * 60 * 1000;
let cache: { em: number; dados: FacetasPostos } | null = null;

/** Apaga o cache. Existe para o teste medir a consulta, e não a memória. */
export function _limparCacheFacetasMssql(): void {
  cache = null;
}

function textoOuNulo(valor: string | null): string | null {
  if (valor === null) return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}

export const facetasRepository: FacetasRepository = {
  async listar(): Promise<FacetasPostos> {
    const agora = Date.now();
    if (cache && agora - cache.em < TTL_MS) return cache.dados;

    try {
      const r = await consultarMssql<unknown>(SQL_FACETAS);

      // O driver devolve `recordsets` sem tipo por conjunto, então há UM ponto
      // de conversão, e ele é conferido em execução em vez de assumido: se a
      // consulta mudar de forma, a falha é aqui, com o número esperado e o
      // recebido, e não três camadas adiante com um campo `undefined`.
      const conjuntos = r.recordsets as unknown[] as [
        LinhaUgrhi[],
        LinhaNome[],
        LinhaNome[],
        LinhaCodigo[],
        LinhaNome[],
      ];
      if (!Array.isArray(conjuntos) || conjuntos.length !== 5) {
        throw new Error(
          `esperava 5 conjuntos de resultado, recebi ${Array.isArray(conjuntos) ? conjuntos.length : typeof conjuntos}`,
        );
      }
      const [ugrhis, municipios, bacias, tiposPosto, mantenedores] = conjuntos;

      const porNome = (linhas: LinhaNome[]) =>
        linhas
          .map((l) => ({ nome: textoOuNulo(l.nome), total: Number(l.total) }))
          .filter((l): l is { nome: string; total: number } => l.nome !== null);

      const dados: FacetasPostos = {
        ugrhis: ugrhis
          .filter((l) => l.numero !== null)
          // O contrato da porta pede `numero` como texto; a origem é `int`.
          // `nome` cai para o número quando a UGRHI não tem descrição, que é o
          // mesmo COALESCE do adaptador PostgreSQL: rótulo vazio na tela é pior
          // que rótulo numérico.
          .map((l) => ({
            numero: String(l.numero),
            nome: textoOuNulo(l.nome) ?? String(l.numero),
            total: Number(l.total),
          })),
        municipios: porNome(municipios),
        bacias: porNome(bacias),
        tiposPosto: tiposPosto
          .map((l) => ({ codigo: textoOuNulo(l.codigo), total: Number(l.total) }))
          .filter((l): l is { codigo: string; total: number } => l.codigo !== null),
        mantenedores: porNome(mantenedores),
      };

      cache = { em: agora, dados };
      return dados;
    } catch (e) {
      throw new FalhaRepositorio('facetas.listar', e);
    }
  },
};

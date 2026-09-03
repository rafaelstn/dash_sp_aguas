import 'server-only';

/**
 * Fragmentos de SQL compartilhados pelos adaptadores que leem o cadastro de
 * posto no SQL Server do órgão (`Dbfch`).
 *
 * Este arquivo existe por um motivo estreito e concreto: `postos-repository` e
 * `facetas-repository` precisam do MESMO conjunto de junções, e o segundo
 * agrega exatamente o que o primeiro exibe. Duas cópias das mesmas junções são
 * uma divergência agendada: bastaria alguém corrigir o caminho da UGRHI num
 * lado para a lista de filtros passar a discordar da tela que ela filtra, sem
 * nada quebrar.
 *
 * Aqui mora só o que os dois compartilham. Regra de leitura e mapeamento
 * continua documentada em `postos-repository.mssql.ts`.
 */

/**
 * Collation explícita em TODA comparação de texto contra `Dbfch`.
 *
 * A collation do banco é `SQL_Latin1_General_CP1_CI_AS`, e o sufixo `AS`
 * significa sensível a acento: `'VARZEA' = 'VÁRZEA'` responde falso. São 62 dos
 * 5.790 nomes com acento (MEDIDO), ou seja, base 99% sem acento, o que faz a
 * busca falhar de forma inconsistente em registros que ninguém consegue prever.
 * Deixar implícito não produz erro: produz resultado errado em 62 registros.
 *
 * Aplicar `COLLATE` a coluna em predicado torna a expressão não pesquisável por
 * índice. Em `Postos` é irrelevante (5.790 linhas, varredura desprezível). A
 * regra vale para busca textual de CADASTRO e NUNCA para chave de junção sobre
 * tabela de medição: `MedicaoPluviometricas` tem 27,3 milhões de linhas.
 */
export const CI_AI = 'COLLATE Latin1_General_CI_AI';

/**
 * Conversão sexagesimal, escrita UMA vez, em SQL.
 *
 * Fica no SQL e não no TypeScript de propósito: o filtro por caixa envolvente
 * precisa da coordenada convertida no `WHERE`, e uma segunda implementação em
 * TypeScript seria uma divergência agendada entre o que filtra e o que exibe.
 *
 * Regra provada pelo Rafael (`coordenadas4.py`), com erro mediano de 0,0 m:
 *   6 dígitos, GGMMSS:   GG + MM/60 + SS/3600
 *   8 dígitos, GGMMSSCC: GG + MM/60 + (SS + CC/100)/3600
 *
 * Três cuidados que a fórmula não mostra:
 *   1. Os inteiros são MAGNITUDES SEM SINAL. São Paulo está a sul e a oeste,
 *      então os dois valores recebem sinal negativo.
 *   2. Distribuição MEDIDA em 02/09/2026, idêntica nos dois eixos: 5.430 com 6
 *      dígitos, 354 com 8, 6 nulos, ZERO fora do padrão. As faixas abaixo são
 *      fechadas dos dois lados justamente para que um valor fora do padrão vire
 *      NULO em vez de virar um ponto errado no mapa.
 *   3. Ausência é NULO, nunca zero. Zero cairia no golfo da Guiné.
 *
 * Conferido contra posto de coordenada conhecida: `1D-008`, município CRUZEIRO,
 * bruto 223533 / 445758, convertido -22,592499 / -44,966111.
 */
export function expressaoCoordenada(colunaInteira: string): string {
  return `CASE
      WHEN ${colunaInteira} BETWEEN 10000000 AND 99999999 THEN
        -1.0 * ( (${colunaInteira} / 1000000)
               + ((${colunaInteira} / 10000) % 100) / 60.0
               + ( ((${colunaInteira} / 100) % 100)
                   + (${colunaInteira} % 100) / 100.0 ) / 3600.0 )
      WHEN ${colunaInteira} BETWEEN 10000 AND 999999 THEN
        -1.0 * ( (${colunaInteira} / 10000)
               + ((${colunaInteira} / 100) % 100) / 60.0
               + (${colunaInteira} % 100) / 3600.0 )
      ELSE NULL
    END`;
}

/**
 * Origem única do FROM. Todo adaptador que lê posto do `Dbfch` passa por aqui,
 * então o conjunto de junções não pode divergir entre a ficha e os filtros.
 *
 * ATENÇÃO A UMA ARMADILHA QUE PARECE CORREÇÃO. A regra do ADR §10.5 manda
 * filtrar `Excluido = 0`, e ela vale para `Postos`. Aplicá-la também às tabelas
 * de apoio, por simetria, apagaria dado em silêncio: as 104 sub-UGRHIs estão
 * TODAS com `Excluido = 1` (MEDIDO em 02/09/2026), então o filtro esvaziaria
 * `sub_ugrhi_*` em 100% dos postos e derrubaria `ugrhi_*` de 4.070 para 2.814.
 * Por isso não há filtro de exclusão nas junções abaixo.
 *
 * `OUTER APPLY` com `TOP 1` em vez de junção comum para o pai da sub-UGRHI:
 * garante no máximo uma linha por posto. Junção comum multiplicaria a linha se
 * houvesse `Codigo` repetido, e linha multiplicada estraga a CONTAGEM da busca
 * sem estragar visivelmente a listagem, que é o defeito difícil de ver.
 *
 * Aliases que os consumidores usam: `p` (posto), `tm` (tipo de medição),
 * `prop` e `oper` (entidades proprietária e operadora), `ca` (curso d'água),
 * `md` (município/distrito), `ug` (UGRHI declarada no posto), `sub` (sub-UGRHI
 * herdada do município), `subpai` (a UGRHI pai da sub) e `coord`.
 */
export const FROM_POSTOS = `
  FROM dbo.Postos p
  LEFT JOIN dbo.TipoMedicoes tm       ON tm.Id   = p.TipoMedicoesID
  LEFT JOIN dbo.Entidades prop        ON prop.Id = p.ProprietariaEntidadeId
  LEFT JOIN dbo.Entidades oper        ON oper.Id = p.OperadoraEntidadeId
  LEFT JOIN dbo.CursoAguas ca         ON ca.Id   = p.CursoAguaId
  LEFT JOIN dbo.MunicipioDistritos md ON md.Id   = p.MunicipioDistritoId
  LEFT JOIN dbo.UGRHIs ug             ON ug.Id   = p.UGRHIId
  LEFT JOIN dbo.UGRHIs sub            ON sub.Id  = md.UgrhiId
  OUTER APPLY (
    SELECT TOP 1 pai.Codigo, pai.Descricao
      FROM dbo.UGRHIs pai
     WHERE sub.Codigo >= 100 AND pai.Codigo = sub.Codigo / 100
     ORDER BY pai.Codigo
  ) subpai
  CROSS APPLY (
    SELECT Latitude  = ${expressaoCoordenada('p.CoordenadaGrausLatitudade')},
           Longitude = ${expressaoCoordenada('p.CoordenadaGrausLongitude')}
  ) coord
`;

/**
 * Número da UGRHI do posto: a declarada no cadastro, e na falta dela a herdada
 * do município pelo pai da sub-UGRHI.
 *
 * A declaração do posto VENCE quando as duas existem. MEDIDO em 02/09/2026: as
 * duas coexistem em 2.810 postos e concordam em 2.571 (91,5%), divergindo em
 * 239 (8,5%). A do posto é o dado do próprio cadastro; a do município é
 * inferência geográfica, e só entra como recurso.
 *
 * Cobertura resultante: 4.042 dos 5.790 postos ativos. O `OUTER APPLY` não
 * resolve o pai em 28 deles, e isso está CERTO: o município aponta para a
 * sub-UGRHI sentinela `9999 FORA DO E.DE S.PAULO (DOMINIO FEDERAL)`, cujo pai
 * aritmético seria a UGRHI 99, que não existe e não deve existir. As UGRHIs são
 * as 22 unidades de São Paulo, e posto fora do estado não tem uma. Quem quiser
 * "consertar" esses 28 estaria inventando uma unidade de gestão.
 */
export const UGRHI_NUMERO = 'COALESCE(ug.Codigo, subpai.Codigo)';
export const UGRHI_NOME = 'COALESCE(ug.Descricao, subpai.Descricao)';

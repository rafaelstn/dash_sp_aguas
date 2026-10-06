/**
 * Classificação dos postos para o mapa da tela Postos (fusão com o Monitor).
 *
 * Domínio puro: sem I/O. Aqui moram as quatro dimensões novas de filtro (tipo,
 * situação, transmissão e vazão), a UGRHI, a regra que decide se um ponto
 * passa no filtro e a contagem cruzada das facetas. O adaptador só entrega os
 * pontos já classificados; filtrar e contar acontecem aqui, uma vez, para o
 * `.mssql` e o `.mock` não divergirem.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * O QUE CADA DIMENSÃO SIGNIFICA (medido no `Dbfch` em 17/09/2026)
 * ═════════════════════════════════════════════════════════════════════════
 * TIPO. Vem de `TipoMedicoes.Descricao`: PLUVIOMÉTRICO 3.943, FLUVIOMÉTRICO
 * 1.588, METEOROLÓGICO 156, PIEZOMÉTRICO 103. O pedido citava PLU, FLU e PIEZO;
 * `meteo` entra porque os 156 postos meteorológicos existem e sem ele ficariam
 * sem tipo nenhum no filtro.
 *
 * SITUAÇÃO. `extinto` quando `Postos.DataExtincao` está preenchida e não é
 * futura (1.376; nenhuma data futura na base), `em_operacao` no resto (4.414).
 * NÃO é a mesma régua do parâmetro antigo `status` da busca, que usa recência
 * do ano de extinção. "Paralisado" e a gerência dependem de informação que o
 * órgão ainda não passou: entram como novo valor em `SITUACOES_POSTO`, e nada
 * mais neste arquivo precisa mudar. Nenhum valor foi inventado para eles.
 *
 * TRANSMISSÃO. Derivada dos aparelhos ATIVOS do posto (`AparelhoPostos` com
 * `DataDesativacao IS NULL`). Um posto pode ter mais de uma, e aparece em cada
 * uma que tiver:
 *   `telemetrico`     PLUVIOMETRO TELEMETRICO, LIMNIGRAFO TELEMETRICO (149)
 *   `gravacao_local`  PLUVIOMETRO, LIMNIGRAFO e PIEZOMETRO COM GRAVACAO LOCAL (380)
 *   `convencional`    aparelho lido por observador ou em registro de papel:
 *                     PLUVIOMETRO, PLUVIOGRAFO, PLUVIOMETRO TOTALIZADOR,
 *                     ESCALA LIMNIMETRICA, LIMNIGRAFO, PIEZOMETRO
 * 6 postos são telemétrico e gravação local ao mesmo tempo; `convencional` tem
 * 3.091. Posto sem aparelho ativo dessas designações fica com a lista vazia (é
 * o caso de 1.130 postos em operação, medido pelo teste de integração
 * `mapa-vazao-mssql`), e não recebe um valor inventado.
 *
 * VAZÃO. Três fontes independentes, e o posto carrega as que tiver:
 *   `aparelho_ativo`  aparelho ativo CURVA-CHAVE* ou MEDICAO DE VAZAO* (326)
 *   `medicao`         medição de campo em `ResumoMedicaoVazoes` (519)
 *   `curva`           curva-chave em `CurvaChaveFluviometricas` (375)
 * O filtro aceita ainda `qualquer`, que é a união das três (595), e as três
 * AUSÊNCIAS pedidas pelo órgão em 29/09/2026 ("COM/SEM curva-chave, COM/SEM
 * medições de vazão"): `sem_curva`, `sem_medicao` e `nenhuma`, o par de
 * `qualquer`. Ausência é afirmação sobre o cadastro, e não sobre o rio: o posto
 * que nunca recebeu curva-chave e o que a perdeu na depuração do cadastro caem
 * os dois em `sem_curva`, porque a tabela do órgão não distingue os dois casos.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * POSTOS FORA DE SÃO PAULO (medido no `Dbfch` em 17/09/2026)
 * ═════════════════════════════════════════════════════════════════════════
 * O `Dbfch` NÃO é só a rede paulista: guarda também estações de outros estados,
 * quase todas com código numérico da ANA (`02650009`, PAULA FREITAS, Paraná).
 * Das 5.784 com coordenada, 1.810 caem fora do contorno das 22 UGRHIs, e a
 * conversão sexagesimal está certa nelas: `02650009` tem bruto 261300/505600,
 * vira -26,21667/-50,93333, e é onde Paula Freitas fica. A planilha do protótipo
 * só tinha 2.484 postos da rede paulista, por isso lá nada saía do estado.
 *
 * A separação vem do PRÓPRIO cadastro, e não de geometria:
 *   `uf` é `Postos.CodigoEstadoMainframe` e, na falta dele,
 *   `MunicipioDistritos.CodigoUnidadeFederacaoMainframe`. Dos 1.810 de fora,
 *   1.458 declaram outro estado (PR 996, MG 378, RJ 51, MS 33), 285 não declaram
 *   estado nenhum (todos de código numérico e sem UGRHI) e 67 declaram SP.
 *   Desses 67, 57 ficam a menos de 5 km da divisa, que em SP é quase toda rio
 *   (Grande, Paraná, Paranapanema), e a estação na margem cai na linha.
 *
 * `coordenadaSuspeita` marca o que o cadastro tem de preenchimento provisório:
 * graus inteiros nos dois eixos, sem minuto nem segundo. São 30 postos, e o
 * caso que o denunciou é `4G-002` (CANANEIA, SP): bruto 250000/470000, que vira
 * -25/-47, no mar, a 53 km do contorno do estado. Estação real exatamente num
 * cruzamento de grau inteiro é improvável ao ponto de não valer a exceção. O
 * posto NÃO sai da
 * lista: a marca existe para a tela avisar, e não para esconder.
 */

/** Sigla da unidade da federação da rede do órgão. */
export const UF_DO_ESTADO = 'SP';

/**
 * `true` quando latitude e longitude são graus inteiros, o padrão de
 * coordenada provisória medido no cadastro (ver o topo do arquivo). Sem
 * coordenada, `false`: ausência já é mostrada como "sem coordenada".
 */
export function coordenadaSuspeita(lat: number | null, lon: number | null): boolean {
  if (lat === null || lon === null) return false;
  return Number.isInteger(lat) && Number.isInteger(lon);
}

export const TIPOS_POSTO_MAPA = ['plu', 'flu', 'piezo', 'meteo'] as const;
export type TipoPostoMapa = (typeof TIPOS_POSTO_MAPA)[number];

/** Ponto de extensão: paralisado entra aqui quando o órgão definir a regra. */
export const SITUACOES_POSTO = ['em_operacao', 'extinto'] as const;
export type SituacaoPosto = (typeof SITUACOES_POSTO)[number];

export const TRANSMISSOES = ['telemetrico', 'gravacao_local', 'convencional'] as const;
export type Transmissao = (typeof TRANSMISSOES)[number];

/** Fontes de vazão que um posto pode ter. */
export const FONTES_VAZAO = ['aparelho_ativo', 'medicao', 'curva'] as const;
export type FonteVazao = (typeof FONTES_VAZAO)[number];

/**
 * Ausências de vazão, na ordem em que a tela as mostra.
 *
 * `nenhuma` é o par de `qualquer`, e `sem_medicao` e `sem_curva` são a negação
 * da fonte de mesmo nome. Não existe `sem_aparelho_ativo`: o órgão não pediu, e
 * opção que ninguém usa em filtro de painel é ruído na lista.
 */
export const AUSENCIAS_VAZAO = ['nenhuma', 'sem_medicao', 'sem_curva'] as const;
export type AusenciaVazao = (typeof AUSENCIAS_VAZAO)[number];

/** Opções do filtro de vazão: as três fontes, a união delas e as ausências. */
export const OPCOES_VAZAO = [...FONTES_VAZAO, 'qualquer', ...AUSENCIAS_VAZAO] as const;
export type OpcaoVazao = (typeof OPCOES_VAZAO)[number];

/**
 * `true` quando o posto atende a opção de vazão pedida.
 *
 * Único lugar que decide isso: o filtro e a contagem de facetas chamam esta
 * função, e foi assim que a opção `qualquer` deixou de ser caso especial
 * espalhado nos dois. Uma segunda régua faria a lista dizer um número e o mapa
 * desenhar outro.
 */
export function atendeOpcaoVazao(
  vazao: readonly FonteVazao[],
  opcao: OpcaoVazao,
): boolean {
  switch (opcao) {
    case 'qualquer':
      return vazao.length > 0;
    case 'nenhuma':
      return vazao.length === 0;
    case 'sem_medicao':
      return !vazao.includes('medicao');
    case 'sem_curva':
      return !vazao.includes('curva');
    default:
      return vazao.includes(opcao);
  }
}

/** Valor de `ugrhi` e `uf` na query que seleciona os postos sem valor. */
export const SEM_VALOR = 'sem';

/** Um posto no mapa. Só o que o mapa e os filtros usam. */
export interface PontoMapaPosto {
  readonly prefixo: string;
  readonly nome: string | null;
  /** Graus decimais, arredondados a 5 casas (cerca de 1 m). `null` sem coordenada válida. */
  readonly lat: number | null;
  readonly lon: number | null;
  readonly tipo: TipoPostoMapa | null;
  readonly situacao: SituacaoPosto;
  readonly transmissao: readonly Transmissao[];
  readonly vazao: readonly FonteVazao[];
  /** Número da UGRHI (1 a 22), ou `null` quando o posto não tem uma. */
  readonly ugrhi: number | null;
  /** Nome do município ou distrito do cadastro, como o órgão grava (caixa alta). */
  readonly municipio: string | null;
  /**
   * Nome da entidade operadora (o "mantenedor" do órgão), como o cadastro
   * grava, ou `null` quando o posto não tem uma. Comparado por
   * `chaveMantenedor`, nunca por igualdade crua.
   */
  readonly mantenedor: string | null;
  /**
   * Sigla da unidade da federação DECLARADA no cadastro, ou `null` sem
   * declaração. Ver "POSTOS FORA DE SÃO PAULO" no topo deste arquivo.
   */
  readonly uf: string | null;
  /** Coordenada com cara de preenchimento provisório. Ver `coordenadaSuspeita`. */
  readonly coordenadaSuspeita: boolean;
}

/**
 * Filtros das dimensões classificadas. Dentro de uma dimensão os valores se
 * somam (OU); entre dimensões, todos precisam valer (E). Lista vazia ou
 * ausente não restringe.
 */
export interface FiltrosClassificacao {
  readonly tipo?: readonly TipoPostoMapa[];
  readonly situacao?: readonly SituacaoPosto[];
  readonly transmissao?: readonly Transmissao[];
  readonly vazao?: readonly OpcaoVazao[];
  /** `null` na lista seleciona os postos sem UGRHI. */
  readonly ugrhi?: readonly (number | null)[];
  /** `null` na lista seleciona os postos sem UF declarada. */
  readonly uf?: readonly (string | null)[];
  /**
   * Nome do mantenedor, comparado sem caixa e sem acento (`chaveMantenedor`).
   * `null` na lista seleciona os postos sem operadora no cadastro.
   */
  readonly mantenedor?: readonly (string | null)[];
}

export type DimensaoMapa = keyof FiltrosClassificacao;

export interface FacetasMapa {
  readonly tipo: Readonly<Record<TipoPostoMapa, number>>;
  readonly situacao: Readonly<Record<SituacaoPosto, number>>;
  readonly transmissao: Readonly<Record<Transmissao, number>>;
  readonly vazao: Readonly<Record<OpcaoVazao, number>>;
  /** Ordenada por número; `numero: null` (sem UGRHI) por último. */
  readonly ugrhi: ReadonlyArray<{ readonly numero: number | null; readonly total: number }>;
  /** Ordenada por sigla, com `SP` primeiro; `uf: null` (sem UF declarada) por último. */
  readonly uf: ReadonlyArray<{ readonly uf: string | null; readonly total: number }>;
  /**
   * Ordenada pelo nome em pt-BR; `mantenedor: null` (sem operadora) por último.
   *
   * Alfabética de propósito, e não por total como o ranking do painel: a lista
   * tem cardinalidade aberta (o cadastro é texto livre e a busca já oferece até
   * 500 nomes em `datalist`), e quem abre este filtro procura UM mantenedor
   * pelo nome. A contagem ao lado é informação, não a ordem.
   *
   * O rótulo é o nome como o CADASTRO grava, mesmo quando o filtro veio da URL
   * com outra caixa: a chave é insensível a caixa e acento, mas `mantenedor=sabesp`
   * num link não deve reescrever o que a lista mostra.
   */
  readonly mantenedor: ReadonlyArray<{
    readonly mantenedor: string | null;
    readonly total: number;
  }>;
}

/**
 * Traduz a descrição do tipo de medição no código do mapa.
 *
 * Compara pelo começo, sem acento e sem caixa, para aceitar tanto a descrição
 * do `Dbfch` ("PLUVIOMÉTRICO") quanto o código curto dos dados de demonstração
 * ("PLU"). Descrição desconhecida devolve `null`, e não um tipo chutado.
 */
export function tipoDaDescricao(descricao: string | null | undefined): TipoPostoMapa | null {
  if (!descricao) return null;
  const t = descricao
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toUpperCase();
  if (t.startsWith('PLU')) return 'plu';
  if (t.startsWith('FLU')) return 'flu';
  if (t.startsWith('PIEZ')) return 'piezo';
  if (t.startsWith('METEO')) return 'meteo';
  return null;
}

/**
 * Chave de comparação de mantenedor: sem caixa, sem acento e sem espaço nas
 * pontas. `null` (posto sem operadora) é chave própria.
 *
 * O `Dbfch` grava o nome da entidade operadora em texto livre, e enquanto o
 * filtro rodava no SQL a comparação era `CI_AI` (insensível a caixa e a
 * acento). Em 05/10/2026 o mantenedor virou dimensão classificada, para ter a
 * contagem cruzada que as outras dimensões já tinham, e o filtro passou a
 * rodar em memória: comparar por igualdade crua faria "Sabesp" e "SABESP"
 * virarem dois mantenedores na lista, com a contagem dividida entre eles, e
 * um link do painel com a caixa trocada deixaria de achar o posto que achava.
 */
export function chaveMantenedor(nome: string | null): string | null {
  if (nome === null) return null;
  const t = nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toUpperCase();
  return t.length > 0 ? t : null;
}

function vazio<T>(lista: readonly T[] | undefined): boolean {
  return lista === undefined || lista.length === 0;
}

/** `true` quando o ponto passa em todos os filtros, exceto na dimensão ignorada. */
export function atendeFiltros(
  ponto: PontoMapaPosto,
  filtros: FiltrosClassificacao,
  ignorar?: DimensaoMapa,
): boolean {
  if (ignorar !== 'tipo' && !vazio(filtros.tipo)) {
    if (ponto.tipo === null || !filtros.tipo!.includes(ponto.tipo)) return false;
  }
  if (ignorar !== 'situacao' && !vazio(filtros.situacao)) {
    if (!filtros.situacao!.includes(ponto.situacao)) return false;
  }
  if (ignorar !== 'transmissao' && !vazio(filtros.transmissao)) {
    if (!ponto.transmissao.some((t) => filtros.transmissao!.includes(t))) return false;
  }
  if (ignorar !== 'vazao' && !vazio(filtros.vazao)) {
    if (!filtros.vazao!.some((o) => atendeOpcaoVazao(ponto.vazao, o))) return false;
  }
  if (ignorar !== 'ugrhi' && !vazio(filtros.ugrhi)) {
    if (!filtros.ugrhi!.includes(ponto.ugrhi)) return false;
  }
  if (ignorar !== 'uf' && !vazio(filtros.uf)) {
    if (!filtros.uf!.includes(ponto.uf)) return false;
  }
  if (ignorar !== 'mantenedor' && !vazio(filtros.mantenedor)) {
    const chave = chaveMantenedor(ponto.mantenedor);
    if (!filtros.mantenedor!.some((m) => chaveMantenedor(m) === chave)) return false;
  }
  return true;
}

function zerado<K extends string>(chaves: readonly K[]): Record<K, number> {
  return Object.fromEntries(chaves.map((c) => [c, 0])) as Record<K, number>;
}

/**
 * Contagem cruzada: cada dimensão é contada com os filtros das OUTRAS
 * aplicados e o dela ignorado.
 *
 * É o que deixa a pessoa ver quantos postos ganharia marcando mais uma opção
 * na mesma dimensão. Contar com o próprio filtro aplicado zeraria as opções não
 * marcadas, e a lista de filtros viraria um espelho da seleção.
 *
 * Nas dimensões de valor múltiplo (transmissão e vazão) as contagens NÃO somam
 * o total: um posto telemétrico e com gravação local conta nas duas, e em vazão
 * cada ausência conta o COMPLEMENTO da fonte de mesmo nome (`curva` mais
 * `sem_curva` dá o total da dimensão, e `qualquer` mais `nenhuma` também).
 */
export function contarFacetas(
  pontos: readonly PontoMapaPosto[],
  filtros: FiltrosClassificacao,
): FacetasMapa {
  const tipo = zerado(TIPOS_POSTO_MAPA);
  const situacao = zerado(SITUACOES_POSTO);
  const transmissao = zerado(TRANSMISSOES);
  const vazao = zerado(OPCOES_VAZAO);
  const ugrhi = new Map<number | null, number>();
  const uf = new Map<string | null, number>();
  const mantenedor = new Map<string | null, { rotulo: string | null; total: number }>();
  // A opção marcada continua na lista mesmo quando os outros filtros a zeram,
  // para o que a pessoa marcou não sumir da tela.
  for (const n of filtros.ugrhi ?? []) ugrhi.set(n, 0);
  for (const u of filtros.uf ?? []) uf.set(u, 0);
  for (const m of filtros.mantenedor ?? []) {
    mantenedor.set(chaveMantenedor(m), { rotulo: m, total: 0 });
  }

  for (const p of pontos) {
    if (p.tipo !== null && atendeFiltros(p, filtros, 'tipo')) tipo[p.tipo] += 1;
    if (atendeFiltros(p, filtros, 'situacao')) situacao[p.situacao] += 1;
    if (atendeFiltros(p, filtros, 'transmissao')) {
      for (const t of p.transmissao) transmissao[t] += 1;
    }
    if (atendeFiltros(p, filtros, 'vazao')) {
      for (const o of OPCOES_VAZAO) if (atendeOpcaoVazao(p.vazao, o)) vazao[o] += 1;
    }
    if (atendeFiltros(p, filtros, 'ugrhi')) {
      ugrhi.set(p.ugrhi, (ugrhi.get(p.ugrhi) ?? 0) + 1);
    }
    if (atendeFiltros(p, filtros, 'uf')) {
      uf.set(p.uf, (uf.get(p.uf) ?? 0) + 1);
    }
    if (atendeFiltros(p, filtros, 'mantenedor')) {
      const chave = chaveMantenedor(p.mantenedor);
      const atual = mantenedor.get(chave);
      if (atual === undefined) {
        mantenedor.set(chave, { rotulo: p.mantenedor, total: 1 });
      } else {
        // Primeiro ponto de uma chave SEMEADA pelo filtro: o rótulo passa a ser
        // o do cadastro, que é o nome que o órgão lê.
        if (atual.total === 0) atual.rotulo = p.mantenedor;
        atual.total += 1;
      }
    }
  }

  const listaUgrhi = [...ugrhi.entries()]
    .map(([numero, total]) => ({ numero, total }))
    .sort((a, b) => {
      if (a.numero === null) return 1;
      if (b.numero === null) return -1;
      return a.numero - b.numero;
    });

  const listaUf = [...uf.entries()]
    .map(([sigla, total]) => ({ uf: sigla, total }))
    .sort((a, b) => {
      if (a.uf === b.uf) return 0;
      if (a.uf === null) return 1;
      if (b.uf === null) return -1;
      if (a.uf === UF_DO_ESTADO) return -1;
      if (b.uf === UF_DO_ESTADO) return 1;
      return a.uf.localeCompare(b.uf);
    });

  const listaMantenedor = [...mantenedor.values()]
    .map(({ rotulo, total }) => ({ mantenedor: rotulo, total }))
    .sort((a, b) => {
      if (a.mantenedor === b.mantenedor) return 0;
      if (a.mantenedor === null) return 1;
      if (b.mantenedor === null) return -1;
      return a.mantenedor.localeCompare(b.mantenedor, 'pt-BR');
    });

  return {
    tipo,
    situacao,
    transmissao,
    vazao,
    ugrhi: listaUgrhi,
    uf: listaUf,
    mantenedor: listaMantenedor,
  };
}

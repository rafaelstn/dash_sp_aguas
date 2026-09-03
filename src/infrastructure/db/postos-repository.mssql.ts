import 'server-only';
import type {
  DadosCriacaoPosto,
  EventoPosto,
  ParametrosPesquisa,
  PostoSugestao,
  PostosRepository,
  ResultadoPesquisa,
} from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';
import { EscritaIndisponivel, FalhaRepositorio } from '@/domain/errors';
import { consultarMssql, TiposMssql, type ParametroMssql } from './mssql-client';
import { CI_AI, FROM_POSTOS, UGRHI_NOME, UGRHI_NUMERO } from './postos-dbfch-sql';
import { postosRepository as postosPg } from './postos-repository.pg';

/**
 * Adaptador de leitura do cadastro de postos sobre o SQL Server do órgão
 * (`Dbfch`), implementando `PostosRepository` sem alterar uma linha da porta.
 *
 * ADR-0023. Nada é copiado, espelhado, importado ou cacheado: a tela mostra o
 * estado atual da base do órgão, lido AO VIVO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TRÊS REGRAS QUE GOVERNAM ESTE ARQUIVO
 * ─────────────────────────────────────────────────────────────────────────
 * 1. SOMENTE LEITURA. Nenhum INSERT, UPDATE, DELETE ou DDL contra `Dbfch`, nem
 *    em teste. Os métodos de escrita lançam `EscritaIndisponivel`, que vira
 *    HTTP 501 e aparece na tela.
 * 2. `WHERE p.Excluido = 0` em TODA leitura de `dbo.Postos`. São 13 registros
 *    excluídos (MEDIDO em 02/09/2026), e um `WHERE` esquecido não produz erro:
 *    produz 13 postos fantasmas na tela. Guarda automatizada em
 *    `tests/unit/mssql-somente-leitura.test.ts`.
 * 3. NENHUMA junção entre os dois armazenamentos. `apenasFavoritos` é o único
 *    ponto que precisa dos dois lados, e resolve buscando os prefixos no nosso
 *    PostgreSQL em UMA consulta e passando o lote como filtro. Nunca uma
 *    consulta por linha.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * O QUE A MEDIÇÃO DE 02/09/2026 CORRIGIU NO ADR, E ESTÁ IMPLEMENTADO AQUI
 * ─────────────────────────────────────────────────────────────────────────
 * O ADR §10.4 concluiu que `UGRHIs` guarda os dois níveis juntos e que
 * `Postos.UGRHIId` alimentaria os dois pares de campos. A tabela guarda os dois
 * níveis, e o resto não se sustentou contra o dado:
 *
 *   - `Postos.UGRHIId` aponta SEMPRE para o nível 1 (`Codigo` de 1 a 22).
 *     ZERO postos ativos apontam para sub-UGRHI.
 *   - Quem aponta para sub-UGRHI é o MUNICÍPIO (`MunicipioDistritos.UgrhiId`),
 *     em 1.642 municípios, sempre com `Codigo >= 100`.
 *   - **As 104 sub-UGRHIs estão todas com `Excluido = 1`.** Aplicar o filtro de
 *     exclusão à tabela de apoio, por simetria com a regra 2 acima, esvaziaria
 *     `sub_ugrhi_*` em 100% dos postos e ainda derrubaria `ugrhi_*` de 4.070
 *     para 2.814. Por isso o filtro de exclusão vale para `Postos`, e NÃO para
 *     `UGRHIs`. Isto está escrito porque é exatamente o tipo de "correção"
 *     que alguém aplica de boa fé e some com dado sem nada quebrar.
 *
 * Cobertura MEDIDA sobre os 5.790 postos ativos, e é ela que dá o número do ADR:
 * UGRHI direta 2.814, só pelo município 1.256, combinado 4.070, sem nenhuma
 * 1.720 (29,7%).
 *
 * Quando os dois caminhos existem, o pai da sub-UGRHI do município concorda com
 * a UGRHI declarada no posto em 2.571 de 2.810 (91,5%) e diverge em 239 (8,5%).
 * **A declaração do posto vence**, porque é o dado do próprio cadastro; o
 * caminho pelo município é inferência geográfica e só entra como recurso.
 */

const ORIGEM = 'Dbfch';
const ORIGEM_CADASTRO = 'dbfch';


const COLUNAS_POSTO = `
  p.Id, p.Prefixo, p.Nome, p.PrefixoDNAEE,
  OperacaoInicioAno = YEAR(p.DataInstalacao),
  OperacaoFimAno    = YEAR(p.DataExtincao),
  coord.Latitude, coord.Longitude,
  p.Altitude, p.AreaDrenagem, p.UnidadeAquifera,
  TipoPosto    = tm.Descricao,
  Proprietario = prop.Nome,
  Mantenedor   = oper.Nome,
  CursoAgua    = ca.Nome,
  Municipio    = md.Nome,
  UgrhiNumero  = ${UGRHI_NUMERO},
  UgrhiNome    = ${UGRHI_NOME},
  SubUgrhiCodigo = sub.Codigo,
  SubUgrhiNome   = sub.Descricao
`;

interface LinhaPostoMssql {
  Id: string;
  Prefixo: string;
  Nome: string | null;
  PrefixoDNAEE: string | null;
  OperacaoInicioAno: number | null;
  OperacaoFimAno: number | null;
  Latitude: number | null;
  Longitude: number | null;
  Altitude: number | null;
  AreaDrenagem: number | null;
  UnidadeAquifera: string | null;
  TipoPosto: string | null;
  Proprietario: string | null;
  Mantenedor: string | null;
  CursoAgua: string | null;
  Municipio: string | null;
  UgrhiNumero: number | null;
  UgrhiNome: string | null;
  SubUgrhiCodigo: number | null;
  SubUgrhiNome: string | null;
}

/** Texto da origem: apara e trata vazio como ausente. */
function texto(valor: string | null | undefined): string | null {
  if (valor === null || valor === undefined) return null;
  const t = valor.trim();
  return t.length > 0 ? t : null;
}

function numero(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined) return null;
  const n = typeof valor === 'number' ? valor : Number(valor);
  return Number.isFinite(n) ? n : null;
}

/**
 * `Dbfch` não tem coluna de criação nem de atualização de linha: as únicas datas
 * de `dbo.Postos` são `DataInstalacao` e `DataExtincao` (ADR §10.7). O tipo do
 * domínio exige `Date`, então entra uma sentinela DECLARADA.
 *
 * Época zero, e não uma data plausível, de propósito: se alguma tela passar a
 * exibir isto, "01/01/1970" denuncia o dado inexistente, enquanto uma data
 * verossímil viraria informação falsa que ninguém questiona. Nenhuma tela
 * renderiza estes campos hoje (MEDIDO por varredura em `src/components` e
 * `src/app`).
 */
function semDataNaOrigem(): Date {
  return new Date(0);
}

/**
 * Formato da sub-UGRHI. O nosso cadastro escreve `2_4` (`N_UGRHI=2`,
 * `N_SUBUGRHI=2_4`) e eles escrevem `204`. Sem esta conversão os dois lados
 * parecem discordar sendo idênticos (ADR §10.4).
 */
function formatarSubUgrhi(codigo: number | null): string | null {
  if (codigo === null || codigo < 100) return null;
  return `${Math.floor(codigo / 100)}_${codigo % 100}`;
}

/**
 * Instrumentação derivada do vínculo `AparelhoPostos` x `Aparelhos`.
 *
 * As designações abaixo foram MEDIDAS no catálogo em 02/09/2026, e três delas
 * NÃO batem com o texto do ADR §10.6, que as citava de forma abreviada. A
 * grafia real é irregular e comparar por igualdade contra a lista do ADR
 * devolveria vazio em silêncio:
 *
 *   'MEDICAO DE VAZAO- MOLINETE HIDRAULICO.'   (sem espaço antes do traço, com ponto final)
 *   'MEDICAO DE VAZAO - CALHA PARSHALL'
 *   'MEDICAO DE VAZAO - METODO COLORIMETRICO'
 *   'MEDICAO DE VAZAO - VERTEDOR'
 *   'CURVA-CHAVE - CONVERTER COTA(M) EM VAZAO(M3/S)'
 *
 * Por isso `vazao` casa por PREFIXO e os outros quatro por igualdade: o
 * vocabulário de vazão tem cinco variantes com pontuação inconsistente, e uma
 * sexta que o órgão cadastre amanhã entraria sozinha.
 */
const DESIGNACOES = {
  telemetrico: new Set(['PLUVIOMETRO TELEMETRICO', 'LIMNIGRAFO TELEMETRICO']),
  loggerEqp: new Set([
    'PLUVIOMETRO COM GRAVACAO LOCAL',
    'LIMNIGRAFO COM GRAVACAO LOCAL',
    'PIEZOMETRO COM GRAVACAO LOCAL',
  ]),
  nivel: new Set(['ESCALA LIMNIMETRICA', 'LIMNIGRAFO']),
  convencional: new Set(['PLUVIOMETRO', 'PLUVIOGRAFO', 'PLUVIOMETRO TOTALIZADOR']),
} as const;

const PREFIXOS_VAZAO = ['CURVA-CHAVE', 'MEDICAO DE VAZAO'] as const;

function ehVazao(designacao: string): boolean {
  return PREFIXOS_VAZAO.some((p) => designacao.startsWith(p));
}

interface Instrumentacao {
  convencional: string | null;
  loggerEqp: string | null;
  telemetrico: string | null;
  nivel: string | null;
  vazao: string | null;
}

const SEM_INSTRUMENTACAO: Instrumentacao = {
  convencional: null,
  loggerEqp: null,
  telemetrico: null,
  nivel: null,
  vazao: null,
};

/**
 * Só aparelho ATIVO conta (`DataDesativacao IS NULL`).
 *
 * O ADR deixou isso como pendência 12.4 ("falta medir quanto isso derruba").
 * MEDIDO em 02/09/2026, postos distintos com e sem o filtro: `convencional`
 * 2.351 contra 3.710, `vazao` 326 contra 595, `telemetrico` 149 contra 150,
 * `logger` 380, `nivel` 636. O filtro derruba `convencional` em 37% e `vazao`
 * em 45%, e ainda assim é o certo: quem lê "telemétrico" numa ficha quer saber
 * o que o posto TEM, não o que ele já teve.
 */
const SQL_APARELHOS = `
  SELECT ap.PostoId, a.Designacao
    FROM dbo.AparelhoPostos ap
    JOIN dbo.Aparelhos a ON a.Id = ap.AparelhoId
   WHERE ap.Excluido = 0
     AND a.Excluido = 0
     AND ap.DataDesativacao IS NULL
     AND ap.PostoId IN (`;

function derivar(designacoes: readonly string[]): Instrumentacao {
  const casar = (conjunto: ReadonlySet<string>) => {
    const achados = designacoes.filter((d) => conjunto.has(d));
    return achados.length > 0 ? achados.join(', ') : null;
  };
  const vazao = designacoes.filter(ehVazao);
  return {
    convencional: casar(DESIGNACOES.convencional),
    loggerEqp: casar(DESIGNACOES.loggerEqp),
    telemetrico: casar(DESIGNACOES.telemetrico),
    nivel: casar(DESIGNACOES.nivel),
    vazao: vazao.length > 0 ? vazao.join(', ') : null,
  };
}

/**
 * Resolve a instrumentação de um LOTE de postos em UMA consulta.
 *
 * O padrão N mais 1 é o que a regra arquitetural do ADR §2.3 proíbe, e aqui ele
 * seria caro de verdade: uma página de 50 postos viraria 50 idas ao servidor do
 * órgão, por cima da rede interna.
 */
async function instrumentacaoPorPosto(
  ids: readonly string[],
): Promise<Map<string, Instrumentacao>> {
  const mapa = new Map<string, Instrumentacao>();
  if (ids.length === 0) return mapa;

  const parametros: ParametroMssql[] = ids.map((id, i) => ({
    nome: `posto${i}`,
    tipo: TiposMssql.guid,
    valor: id,
  }));
  const marcadores = parametros.map((p) => `@${p.nome}`).join(', ');

  const r = await consultarMssql<{ PostoId: string; Designacao: string }>(
    `${SQL_APARELHOS}${marcadores})`,
    parametros,
  );

  const porPosto = new Map<string, string[]>();
  for (const linha of r.recordset) {
    const chave = linha.PostoId.toLowerCase();
    const lista = porPosto.get(chave);
    const designacao = texto(linha.Designacao);
    if (!designacao) continue;
    if (lista) lista.push(designacao);
    else porPosto.set(chave, [designacao]);
  }
  for (const [posto, designacoes] of porPosto) {
    mapa.set(posto, derivar(designacoes));
  }
  return mapa;
}

function mapear(linha: LinhaPostoMssql, instrumentacao: Instrumentacao): Posto {
  // GUID sai MAIÚSCULO do SQL Server e o resto do sistema trata id como texto
  // opaco. Normalizar na fronteira evita que o mesmo posto tenha duas
  // identidades conforme o caminho que o trouxe (ADR §10.1).
  const id = linha.Id.toLowerCase();

  return {
    id,
    prefixo: linha.Prefixo.trim(),
    mantenedor: texto(linha.Mantenedor),
    prefixoAna: texto(linha.PrefixoDNAEE),
    nomeEstacao: texto(linha.Nome),
    operacaoInicioAno: numero(linha.OperacaoInicioAno),
    operacaoFimAno: numero(linha.OperacaoFimAno),
    latitude: numero(linha.Latitude),
    longitude: numero(linha.Longitude),
    municipio: texto(linha.Municipio),
    // Grafia alternativa é campo do nosso CSV e não existe em `Dbfch` (§10.5).
    municipioAlt: null,
    // O nosso `bacia_hidrografica` traz curso d'água ("R. PARAIBA DO SUL"), e
    // não a bacia administrativa do DAEE. A junção correta é `CursoAguaId`;
    // `BaciaHidrograficas`, apesar do nome, é outro eixo (ADR §10.4).
    baciaHidrografica: texto(linha.CursoAgua),
    ugrhiNome: texto(linha.UgrhiNome),
    ugrhiNumero: linha.UgrhiNumero !== null ? String(linha.UgrhiNumero) : null,
    subUgrhiNome: texto(linha.SubUgrhiNome),
    subUgrhiNumero: formatarSubUgrhi(numero(linha.SubUgrhiCodigo)),
    proprietario: texto(linha.Proprietario),
    tipoPosto: texto(linha.TipoPosto),
    areaKm2: numero(linha.AreaDrenagem),
    // Os doze campos que ficavam aqui devolvendo `null` fixo saíram do domínio
    // em 03/09/2026 (ver o cabeçalho de `domain/posto.ts`). O motivo da recusa
    // de cada candidato está preservado lá, porque é ele que impede alguém de
    // "reconectar" `Grupos` a `rede` ou `Historicos` a `observacoes` amanhã.
    convencional: instrumentacao.convencional,
    loggerEqp: instrumentacao.loggerEqp,
    telemetrico: instrumentacao.telemetrico,
    nivel: instrumentacao.nivel,
    vazao: instrumentacao.vazao,
    aquifero: texto(linha.UnidadeAquifera),
    altimetria: numero(linha.Altitude),
    // Os 12 campos de data da ANA são nossos (migration 0031) e não existem
    // em `Dbfch`. Continuam vazios nesta origem.
    anaEscalaInicio: null,
    anaEscalaFim: null,
    anaDescargaLiquidaInicio: null,
    anaDescargaLiquidaFim: null,
    anaSedimentosInicio: null,
    anaSedimentosFim: null,
    anaQualidadeInicio: null,
    anaQualidadeFim: null,
    anaPluviometroInicio: null,
    anaPluviometroFim: null,
    anaTelemetriaInicio: null,
    anaTelemetriaFim: null,
    // Toda leitura filtra `Excluido = 0`, então um posto que chegue aqui está
    // ativo por construção. O soft delete deles é um `bit` sem data, e inventar
    // uma seria pior que declarar ausência.
    deletedAt: null,
    origem: ORIGEM_CADASTRO,
    createdAt: semDataNaOrigem(),
    updatedAt: semDataNaOrigem(),
  };
}

/** Hidrata o lote inteiro: uma consulta de aparelhos para N postos. */
async function montarPostos(linhas: readonly LinhaPostoMssql[]): Promise<Posto[]> {
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.Id);
  const instrumentacoes = await instrumentacaoPorPosto(ids);
  return linhas.map((l) =>
    mapear(l, instrumentacoes.get(l.Id.toLowerCase()) ?? SEM_INSTRUMENTACAO),
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Construção do WHERE da pesquisa
// ─────────────────────────────────────────────────────────────────────────

/**
 * Os nove campos que a busca textual cobre no PostgreSQL (`busca_tsv`,
 * migration 0002), traduzidos para as colunas equivalentes de `Dbfch`.
 *
 * Sai da lista apenas `municipio_alt`, que não tem origem lá. Entra
 * `PrefixoDNAEE`, que o `busca_tsv` não cobria e é como o usuário do órgão
 * chama a estação em documento antigo.
 */
const CAMPOS_BUSCA = [
  'p.Prefixo',
  'p.Nome',
  'p.PrefixoDNAEE',
  'md.Nome',
  'ca.Nome',
  'ug.Descricao',
  'subpai.Descricao',
  'sub.Descricao',
  'prop.Nome',
  'oper.Nome',
] as const;

class ConstrutorFiltro {
  readonly condicoes: string[] = [];
  readonly parametros: ParametroMssql[] = [];
  private contador = 0;

  /** Registra o valor como parâmetro e devolve o marcador. Valor nunca entra no texto. */
  param(tipo: ParametroMssql['tipo'], valor: unknown): string {
    const nome = `f${this.contador++}`;
    this.parametros.push({ nome, tipo, valor });
    return `@${nome}`;
  }

  add(condicao: string): void {
    this.condicoes.push(condicao);
  }

  get where(): string {
    // O filtro de posto excluído é o primeiro e não é opcional.
    return ['p.Excluido = 0', ...this.condicoes].join('\n     AND ');
  }
}

/**
 * Monta o WHERE da pesquisa. `null` significa "o filtro pedido não pode
 * devolver nada", e o chamador devolve resultado vazio SEM ir ao servidor do
 * órgão (caso do usuário que pede só favoritos e não tem nenhum).
 */
function montarFiltro(
  params: ParametrosPesquisa,
  prefixosFavoritos: readonly string[] | null,
): ConstrutorFiltro | null {
  const f = new ConstrutorFiltro();

  if (params.termo && params.termo.trim().length > 0) {
    // O PostgreSQL faz `to_tsquery` com `&` entre os termos, ou seja, o
    // registro precisa casar TODOS os termos. Cada termo pode casar em campos
    // diferentes, e é isso que a estrutura abaixo reproduz.
    for (const termo of params.termo.trim().split(/\s+/).filter(Boolean)) {
      const marcador = f.param(TiposMssql.texto, `%${escaparLike(termo)}%`);
      const alternativas = CAMPOS_BUSCA.map(
        (campo) => `${campo} ${CI_AI} LIKE ${marcador} ESCAPE '\\'`,
      );
      f.add(`(${alternativas.join(' OR ')})`);
    }
  }

  if (params.prefixoComecaCom) {
    const marcador = f.param(
      TiposMssql.texto,
      `${escaparLike(params.prefixoComecaCom.toUpperCase())}%`,
    );
    f.add(`p.Prefixo ${CI_AI} LIKE ${marcador} ESCAPE '\\'`);
  }

  if (params.ugrhiNumero) {
    const n = Number(params.ugrhiNumero);
    if (!Number.isFinite(n)) return null;
    f.add(`${UGRHI_NUMERO} = ${f.param(TiposMssql.inteiro, n)}`);
  }

  if (params.municipio) {
    f.add(`md.Nome ${CI_AI} = ${f.param(TiposMssql.texto, params.municipio)}`);
  }

  if (params.baciaHidrografica) {
    f.add(`ca.Nome ${CI_AI} = ${f.param(TiposMssql.texto, params.baciaHidrografica)}`);
  }

  if (params.tipoPosto) {
    // `CI_AI` aqui não é preciosismo: os valores de `TipoMedicoes` vêm
    // acentuados ("PLUVIOMÉTRICO"), e o valor que chega da tela pode vir de uma
    // faceta antiga, sem acento.
    f.add(`tm.Descricao ${CI_AI} = ${f.param(TiposMssql.texto, params.tipoPosto)}`);
  }

  if (params.mantenedor) {
    // A entidade OPERADORA é o "responsável pelo posto" do `Dbfch`. O adaptador
    // PostgreSQL casava `mantenedor` OU `btl`, e desde que `btl` saiu do domínio
    // (03/09/2026) os dois filtram pela mesma regra.
    f.add(`oper.Nome ${CI_AI} = ${f.param(TiposMssql.texto, params.mantenedor)}`);
  }

  if (params.status === 'ativo') {
    f.add(
      '(p.DataExtincao IS NULL OR YEAR(p.DataExtincao) >= YEAR(GETDATE()) - 1)',
    );
  } else if (params.status === 'desativado') {
    f.add('p.DataExtincao IS NOT NULL AND YEAR(p.DataExtincao) < YEAR(GETDATE()) - 1');
  }

  if (typeof params.latitude === 'number' && typeof params.longitude === 'number') {
    // Mesma tolerância do adaptador PostgreSQL: ±0,01 grau, cerca de 1 km em
    // São Paulo. A coordenada usada é a CONVERTIDA pelo `CROSS APPLY`, que é a
    // mesma que o SELECT devolve: uma implementação só.
    const TOLERANCIA = 0.01;
    const latMin = f.param(TiposMssql.decimal, params.latitude - TOLERANCIA);
    const latMax = f.param(TiposMssql.decimal, params.latitude + TOLERANCIA);
    const lonMin = f.param(TiposMssql.decimal, params.longitude - TOLERANCIA);
    const lonMax = f.param(TiposMssql.decimal, params.longitude + TOLERANCIA);
    f.add(`coord.Latitude BETWEEN ${latMin} AND ${latMax}`);
    f.add(`coord.Longitude BETWEEN ${lonMin} AND ${lonMax}`);
  }

  if (params.temTelemetrico) {
    const marcadores = [...DESIGNACOES.telemetrico]
      .map((d) => f.param(TiposMssql.texto, d))
      .join(', ');
    f.add(`EXISTS (
       SELECT 1 FROM dbo.AparelhoPostos ap
         JOIN dbo.Aparelhos a ON a.Id = ap.AparelhoId
        WHERE ap.PostoId = p.Id AND ap.Excluido = 0 AND a.Excluido = 0
          AND ap.DataDesativacao IS NULL
          AND a.Designacao IN (${marcadores}))`);
  }

  if (params.apenasFavoritos) {
    // DIVERGÊNCIA DELIBERADA contra o adaptador PostgreSQL, registrada porque
    // divergência em silêncio é o que ninguém acha depois: lá, `apenasFavoritos`
    // sem `usuarioId` cai num fragmento vazio e a busca devolve TODOS os postos.
    // Quem pediu "só os meus favoritos" e recebe a base inteira não percebe que
    // o filtro foi ignorado. Aqui a resposta é o conjunto vazio, que é o que a
    // pergunta significa quando não há a quem atribuir favorito. A porta
    // documenta `apenasFavoritos` como "exige usuarioId", e é essa leitura.
    if (prefixosFavoritos === null || prefixosFavoritos.length === 0) return null;
    const marcadores = prefixosFavoritos
      .map((p) => f.param(TiposMssql.texto, p))
      .join(', ');
    f.add(`p.Prefixo IN (${marcadores})`);
  }

  return f;
}

/**
 * Neutraliza os curingas do `LIKE` no texto digitado pelo usuário.
 *
 * Sem isso, quem digita `%` recebe a tabela inteira e quem digita `[` recebe
 * erro de sintaxe de padrão. O `_` é o mais traiçoeiro: prefixos deste cadastro
 * têm traço e o usuário digita `_` sem querer dizer "qualquer caractere".
 */
function escaparLike(valor: string): string {
  return valor.replace(/[\\%_[\]]/g, (c) => `\\${c}`);
}

// ─────────────────────────────────────────────────────────────────────────
// Adaptador
// ─────────────────────────────────────────────────────────────────────────

export const postosRepository: PostosRepository = {
  /**
   * DIVERGÊNCIA DELIBERADA contra o adaptador PostgreSQL: lá a comparação é
   * `prefixo = $1`, sensível a caixa; aqui carrega `CI_AI`, então `1d-008` acha
   * `1D-008`. É consequência da regra de collation explícita da seção acima, e
   * fica porque não há prefixo que difira só por caixa (MEDIDO em 02/09/2026:
   * zero prefixos duplicados entre os 5.790 ativos), e porque quem digita um
   * prefixo em minúscula quer o mesmo posto.
   */
  async buscarPorPrefixo(prefixo: string): Promise<Posto | null> {
    try {
      const r = await consultarMssql<LinhaPostoMssql>(
        `SELECT TOP 1 ${COLUNAS_POSTO} ${FROM_POSTOS}
          WHERE p.Excluido = 0 AND p.Prefixo ${CI_AI} = @prefixo`,
        [{ nome: 'prefixo', tipo: TiposMssql.texto, valor: prefixo }],
      );
      const linha = r.recordset[0];
      if (!linha) return null;
      const [posto] = await montarPostos([linha]);
      return posto ?? null;
    } catch (e) {
      throw new FalhaRepositorio('buscarPorPrefixo', e);
    }
  },

  async mapaIdsPorPrefixo(): Promise<Map<string, string>> {
    try {
      // Só as duas colunas: são milhares de linhas e quem consome quer o
      // vínculo, não a entidade. Sem junção e sem hidratar instrumentação.
      const r = await consultarMssql<{ Prefixo: string; Id: string }>(
        'SELECT p.Prefixo, p.Id FROM dbo.Postos p WHERE p.Excluido = 0',
      );
      const mapa = new Map<string, string>();
      for (const linha of r.recordset) {
        mapa.set(linha.Prefixo.trim(), linha.Id.toLowerCase());
      }
      return mapa;
    } catch (e) {
      throw new FalhaRepositorio('mapaIdsPorPrefixo', e);
    }
  },

  async pesquisar(params: ParametrosPesquisa): Promise<ResultadoPesquisa> {
    try {
      const favoritos = params.apenasFavoritos
        ? await prefixosFavoritosDoUsuario(params.usuarioId ?? null)
        : null;

      const filtro = montarFiltro(params, favoritos);
      if (filtro === null) return { total: 0, itens: [] };

      const offset = (params.pagina - 1) * params.porPagina;
      const paginacao: ParametroMssql[] = [
        { nome: 'offset', tipo: TiposMssql.inteiro, valor: offset },
        { nome: 'limite', tipo: TiposMssql.inteiro, valor: params.porPagina },
      ];

      // Duas consultas com o MESMO `FROM` e o MESMO `WHERE`. O `OUTER APPLY`
      // com `TOP 1` garante 1 linha por posto, então a contagem não infla.
      const [pagina, contagem] = await Promise.all([
        consultarMssql<LinhaPostoMssql>(
          `SELECT ${COLUNAS_POSTO} ${FROM_POSTOS}
            WHERE ${filtro.where}
            ORDER BY p.Prefixo
            OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY`,
          [...filtro.parametros, ...paginacao],
        ),
        consultarMssql<{ Total: number }>(
          `SELECT Total = COUNT(*) ${FROM_POSTOS} WHERE ${filtro.where}`,
          filtro.parametros,
        ),
      ]);

      return {
        total: contagem.recordset[0]?.Total ?? 0,
        itens: await montarPostos(pagina.recordset),
      };
    } catch (e) {
      throw new FalhaRepositorio('pesquisar', e);
    }
  },

  async autocompletar(termo: string, limite: number): Promise<PostoSugestao[]> {
    const t = termo.trim();
    if (t.length < 2) return [];

    try {
      const inicio = `${escaparLike(t.toUpperCase())}%`;
      const contem = `%${escaparLike(t)}%`;
      const r = await consultarMssql<{
        Prefixo: string;
        Nome: string | null;
        TipoPosto: string | null;
        PrefixoDNAEE: string | null;
      }>(
        `SELECT TOP (@limite)
                p.Prefixo, p.Nome, TipoPosto = tm.Descricao, p.PrefixoDNAEE
           FROM dbo.Postos p
           LEFT JOIN dbo.TipoMedicoes tm ON tm.Id = p.TipoMedicoesID
          WHERE p.Excluido = 0
            AND ( p.Prefixo      ${CI_AI} LIKE @inicio ESCAPE '\\'
               OR p.PrefixoDNAEE ${CI_AI} LIKE @inicio ESCAPE '\\'
               OR p.Nome         ${CI_AI} LIKE @contem ESCAPE '\\' )
          ORDER BY p.Prefixo`,
        [
          { nome: 'limite', tipo: TiposMssql.inteiro, valor: limite },
          { nome: 'inicio', tipo: TiposMssql.texto, valor: inicio },
          { nome: 'contem', tipo: TiposMssql.texto, valor: contem },
        ],
      );
      return r.recordset.map((l) => ({
        prefixo: l.Prefixo.trim(),
        nome: texto(l.Nome),
        tipoPosto: texto(l.TipoPosto),
        prefixoAna: texto(l.PrefixoDNAEE),
      }));
    } catch (e) {
      throw new FalhaRepositorio('autocompletar', e);
    }
  },

  // ───────────────────────────────────────────────────────────────────────
  // Escrita: indisponível enquanto a origem for o banco do órgão.
  //
  // O acesso concedido é SOMENTE LEITURA (ADR-0023 §1.2), e a API de escrita
  // deles ainda não existe (§11.2). Quando existir, entra um adaptador
  // `.api.ts` implementando esta mesma porta, e o caso de uso não fica sabendo.
  //
  // Lançar erro tipado, e não devolver silêncio, é decisão explícita do ADR §3:
  // o usuário salvaria a ficha, veria sucesso e nada teria mudado.
  // ───────────────────────────────────────────────────────────────────────

  // Os parâmetros de conteúdo (`campos`, `dados`, `ator`) são omitidos de
  // propósito: o adaptador não tem o que fazer com eles, e declará-los sem uso
  // sugeriria que em algum galho eles chegam a algum lugar. A porta continua
  // satisfeita, porque implementação com menos parâmetros é compatível.
  async atualizar(prefixo: string): Promise<Posto> {
    throw new EscritaIndisponivel(`atualizar posto ${prefixo}`, ORIGEM);
  },

  async criar(dados: DadosCriacaoPosto): Promise<Posto> {
    throw new EscritaIndisponivel(`criar posto ${dados.prefixo}`, ORIGEM);
  },

  async remover(prefixo: string): Promise<void> {
    throw new EscritaIndisponivel(`remover posto ${prefixo}`, ORIGEM);
  },

  async restaurar(prefixo: string): Promise<Posto> {
    throw new EscritaIndisponivel(`restaurar posto ${prefixo}`, ORIGEM);
  },

  /**
   * A trilha de auditoria é NOSSA (`postos_evento`, mais `auth.users`), e o ADR
   * §2.2 é explícito: o repositório se divide por MÉTODO, não migra por
   * arquivo. Este método não toca em `postos` nem em `Dbfch`, então continua
   * lendo o nosso PostgreSQL, sem alteração.
   *
   * A delegação é direta de propósito: duplicar a consulta aqui criaria duas
   * versões da mesma leitura, que divergem no primeiro ajuste.
   */
  async listarEventos(postoId: string, limite?: number): Promise<EventoPosto[]> {
    return postosPg.listarEventos(postoId, limite);
  },
};

/**
 * Prefixos favoritos do usuário, lidos do NOSSO PostgreSQL.
 *
 * Este é o único ponto do adaptador que precisa dos dois armazenamentos, e ele
 * respeita a regra do ADR §2.3 ao pé da letra: busca os identificadores de um
 * lado em UMA consulta e resolve o lote no outro, sem junção e sem uma consulta
 * por linha. `prefixo` é a chave natural do domínio e sobrevive à troca de
 * origem, que é o que torna isto barato.
 *
 * Favoritos por usuário ficam no nosso banco por determinação do ADR §0: é uma
 * das funcionalidades que não têm tabela correspondente no banco do órgão.
 */
async function prefixosFavoritosDoUsuario(
  usuarioId: string | null,
): Promise<readonly string[] | null> {
  if (!usuarioId) return null;
  // Import tardio: mantém o módulo importável sem abrir conexão PostgreSQL em
  // ambiente que só usa o SQL Server.
  const { sql } = await import('./client');
  const linhas = await sql<{ prefixo: string }[]>`
    SELECT prefixo FROM postos_favoritos WHERE usuario_id = ${usuarioId}::uuid
  `;
  return linhas.map((l) => l.prefixo);
}

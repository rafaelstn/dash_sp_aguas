import type { PostosRepository, ResultadoPesquisa } from '@/application/ports/postos-repository';
import { TermoBuscaInvalido } from '@/domain/errors';

export interface EntradaBuscarPostos {
  termo?: string;
  // Filtros categóricos
  ugrhiNumero?: string;
  municipio?: string;
  baciaHidrografica?: string;
  tipoPosto?: string;
  mantenedor?: string;
  status?: 'ativo' | 'desativado';
  latitude?: number;
  longitude?: number;
  // Booleans
  temTelemetrico?: boolean;
  apenasFavoritos?: boolean;
  // Contexto
  usuarioId?: string | null;
  pagina?: number;
  porPagina?: number;
}

export const POR_PAGINA_PADRAO = 25;
export const POR_PAGINA_MAX = 100;

/**
 * FORMA de código de posto: até 4 alfanuméricos, com sufixo opcional de até 5
 * depois do traço. Cobre `2D`, `1D-008`, `D6-N005`.
 */
const FORMA_DE_CODIGO = /^[A-Za-z0-9]{1,4}(-[A-Za-z0-9]{1,5})?$/;

/** Ao menos um dígito no termo. A régua está explicada em `pareceCodigoDePosto`. */
const TEM_DIGITO = /[0-9]/;

/**
 * O termo digitado é um CÓDIGO de posto, e não uma palavra?
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEFEITO DE PRODUÇÃO DE 03/09/2026, E POR QUE O DÍGITO ENTROU NA RÉGUA
 * ─────────────────────────────────────────────────────────────────────────
 * A régua era só a FORMA, e a forma sozinha classificava como código toda
 * palavra de até quatro letras. O efeito, MEDIDO contra o `Dbfch` em
 * 03/09/2026, é que o termo ia para a busca por INÍCIO DE PREFIXO e a busca
 * textual nunca acontecia, então a tela e a API respondiam ZERO:
 *
 *   termo  postos ativos com o termo no Nome   o que a busca devolvia
 *   DA     1060                                0
 *   DO      865                                0
 *   DE      537                                0
 *   SAO     348                                1  (o prefixo `SAOPAULO`)
 *   RS      177                                0
 *   RIO     175                                0
 *   AGUA    136                                0
 *
 * Seis das dez palavras mais frequentes do cadastro. O adaptador estava certo
 * e foi medido junto, no mesmo dia: pedindo a ele a busca TEXTUAL de `rio` ele
 * devolve 2.580 e a de `agua` devolve 4.059. O defeito era de ROTEAMENTO.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POR QUE DÍGITO, E NÃO UMA FORMA MAIS ESPERTA
 * ─────────────────────────────────────────────────────────────────────────
 * Porque a forma NÃO separa as duas coisas, e isso é dado, não opinião: dos
 * 5.790 prefixos ativos, **93 são só letras** (`BT`, `PR`, `BRJ`, `BAURU`,
 * `SAOPAULO`, `IBIPORA`), e 24 têm dois caracteres. Ou seja, `PR` é um prefixo
 * de verdade e `DA` é uma preposição, com a mesma forma. Qualquer régua que
 * tente distinguir os dois pelo desenho do texto vai errar um dos lados.
 *
 * Exigir dígito resolve sem perder nada, e a razão é uma propriedade da busca
 * textual, não uma aposta: `CAMPOS_BUSCA` inclui `p.Prefixo` com `%termo%`,
 * então o resultado textual é SUPERCONJUNTO do resultado por início de
 * prefixo para o mesmo texto. Prefixo só com letras continua achável, agora
 * pela busca textual. É o mesmo caminho que os 2.530 prefixos de oito dígitos
 * já usavam antes deste ajuste, porque `{1,4}` nunca os alcançou.
 *
 * Fica um resíduo CONHECIDO e declarado: termo com dígito e forma de código que
 * não é prefixo de nada (`9Z`) continua devolvendo vazio em vez de cair na
 * busca textual. Não foi corrigido junto porque exigiria uma segunda consulta
 * ao banco do órgão, e a correção urgente é o roteamento. Está registrado para
 * não virar descoberta de novo.
 */
export function pareceCodigoDePosto(termo: string): boolean {
  const t = termo.trim();
  return t.length > 0 && FORMA_DE_CODIGO.test(t) && TEM_DIGITO.test(t);
}

/**
 * Normaliza entrada e delega ao repositório.
 *
 * Regras:
 *  - sem termo + sem filtros → array vazio (busca ociosa);
 *  - só filtros categóricos (sem termo) → consulta normal;
 *  - termo que parece CÓDIGO de posto ("2D", "1D-008") entra como
 *    `prefixoComecaCom`, pela régua de `pareceCodigoDePosto`;
 *  - caso contrário, entra como busca textual (FTS portuguese + unaccent);
 *  - `apenasFavoritos=true` sem `usuarioId` → array vazio silencioso.
 */
export async function buscarPostos(
  repo: PostosRepository,
  entrada: EntradaBuscarPostos,
): Promise<ResultadoPesquisa> {
  const termoBruto = (entrada.termo ?? '').trim();
  const pagina = Math.max(1, entrada.pagina ?? 1);
  const porPagina = Math.min(POR_PAGINA_MAX, Math.max(1, entrada.porPagina ?? POR_PAGINA_PADRAO));

  // Filtro geo só vale se par lat+lng está completo. Um único valor é ignorado
  // pra evitar busca degenerada (uma faixa horizontal/vertical do estado todo).
  const temCoord =
    typeof entrada.latitude === 'number' &&
    Number.isFinite(entrada.latitude) &&
    typeof entrada.longitude === 'number' &&
    Number.isFinite(entrada.longitude);

  const temFiltrosCategoricos = Boolean(
    entrada.ugrhiNumero ||
      entrada.municipio ||
      entrada.baciaHidrografica ||
      entrada.tipoPosto ||
      entrada.mantenedor ||
      entrada.status ||
      temCoord ||
      entrada.temTelemetrico ||
      entrada.apenasFavoritos,
  );

  if (entrada.apenasFavoritos && !entrada.usuarioId) {
    return { total: 0, itens: [] };
  }

  if (termoBruto.length === 0 && !temFiltrosCategoricos) {
    return { total: 0, itens: [] };
  }

  if (termoBruto.length === 1) {
    throw new TermoBuscaInvalido('informe ao menos 2 caracteres');
  }

  const pareceCodigo = pareceCodigoDePosto(termoBruto);

  return repo.pesquisar({
    termo: pareceCodigo || termoBruto.length === 0 ? undefined : termoBruto,
    // Prefixos no cadastro são sempre maiúsculos. Normaliza aqui pra
    // cobrir entradas via URL direta (?q=1d-008) ou API externa — o
    // frontend já envia uppercase, mas este é o último gatekeeper.
    prefixoComecaCom: pareceCodigo ? termoBruto.toUpperCase() : undefined,
    ugrhiNumero: entrada.ugrhiNumero,
    municipio: entrada.municipio,
    baciaHidrografica: entrada.baciaHidrografica,
    tipoPosto: entrada.tipoPosto,
    mantenedor: entrada.mantenedor,
    status: entrada.status,
    latitude: temCoord ? entrada.latitude : undefined,
    longitude: temCoord ? entrada.longitude : undefined,
    temTelemetrico: entrada.temTelemetrico,
    apenasFavoritos: entrada.apenasFavoritos,
    usuarioId: entrada.usuarioId,
    pagina,
    porPagina,
  });
}

import {
  OPCOES_VAZAO,
  SITUACOES_POSTO,
  TIPOS_POSTO_MAPA,
  TRANSMISSOES,
  UF_DO_ESTADO,
  tipoDaDescricao,
  type FiltrosClassificacao,
  type OpcaoVazao,
  type PontoMapaPosto,
  type SituacaoPosto,
  type TipoPostoMapa,
  type Transmissao,
} from '@/domain/mapa-postos';

/**
 * Estado da tela Postos e a sua forma na URL.
 *
 * A URL é o link que alguém cola no chat para mostrar "este posto, nesta
 * UGRHI, com estes filtros". Por isso só vai para ela o que difere do padrão,
 * e os parâmetros da busca antiga (`status`, `tem_telem`, `tipo` por
 * descrição) continuam abrindo a tela certa: há link salvo deles por aí.
 *
 * Puro de propósito: nada de `window` aqui, para o teste cobrir o parse e a
 * serialização sem navegador.
 */

export type UgrhiSelecionada = number | 'sem' | null;

/**
 * UF escolhida: a sigla, `'sem'` para os postos sem UF declarada, ou `null`
 * para todos os estados. O padrão é `SP`: o `Dbfch` guarda também postos do
 * PR, MG, RJ e MS e códigos da ANA sem UF, e a tela abre na rede paulista.
 */
export type UfSelecionada = string | 'sem' | null;

/** Valor de `uf` na URL que pede todos os estados (sem ele, abre em SP). */
export const UF_TODAS = 'todas';

/** Recorte que a API aplica no servidor. O resto dos filtros roda no navegador. */
export interface EscopoServidor {
  readonly municipio: string | null;
  readonly bacia: string | null;
  readonly mantenedor: string | null;
  readonly favoritos: boolean;
}

export interface EstadoTela {
  readonly q: string;
  readonly tipos: readonly TipoPostoMapa[];
  readonly situacoes: readonly SituacaoPosto[];
  readonly transmissoes: readonly Transmissao[];
  readonly vazao: OpcaoVazao | null;
  readonly ugrhi: UgrhiSelecionada;
  readonly uf: UfSelecionada;
  readonly posto: string | null;
  readonly escopo: EscopoServidor;
}

/** Meteorológico começa desligado (decisão de 17/09/2026). */
export const TIPOS_PADRAO: readonly TipoPostoMapa[] = ['plu', 'flu', 'piezo'];
export const SITUACOES_PADRAO: readonly SituacaoPosto[] = ['em_operacao'];

export const ESTADO_PADRAO: EstadoTela = {
  q: '',
  tipos: TIPOS_PADRAO,
  situacoes: SITUACOES_PADRAO,
  transmissoes: [],
  vazao: null,
  ugrhi: null,
  uf: UF_DO_ESTADO,
  posto: null,
  escopo: { municipio: null, bacia: null, mantenedor: null, favoritos: false },
};

interface LeitorParametros {
  get(nome: string): string | null;
  has(nome: string): boolean;
}

const MAX_BUSCA = 60;

function texto(valor: string | null): string | null {
  const t = valor?.trim();
  return t ? t : null;
}

/** Lista por vírgula, mantendo só os valores conhecidos, na ordem canônica. */
function lista<T extends string>(bruto: string, validos: readonly T[]): T[] {
  const pedidos = new Set(bruto.split(',').map((v) => v.trim()));
  return validos.filter((v) => pedidos.has(v));
}

function lerTipos(p: LeitorParametros): readonly TipoPostoMapa[] {
  if (!p.has('tipo')) return TIPOS_PADRAO;
  const bruto = p.get('tipo') ?? '';
  if (bruto === '') return [];
  const codigos = lista(bruto, TIPOS_POSTO_MAPA);
  if (codigos.length) return codigos;
  // Busca antiga: `tipo` era a descrição livre ("PLUVIOMÉTRICO").
  const legado = tipoDaDescricao(bruto);
  return legado ? [legado] : TIPOS_PADRAO;
}

function lerSituacoes(p: LeitorParametros): readonly SituacaoPosto[] {
  if (p.has('situacao')) {
    const bruto = p.get('situacao') ?? '';
    return bruto === '' ? [] : lista(bruto, SITUACOES_POSTO);
  }
  const status = p.get('status');
  if (status === 'ativo') return ['em_operacao'];
  if (status === 'desativado') return ['extinto'];
  return SITUACOES_PADRAO;
}

function lerTransmissoes(p: LeitorParametros): readonly Transmissao[] {
  if (p.has('transmissao')) return lista(p.get('transmissao') ?? '', TRANSMISSOES);
  const telem = p.get('tem_telem');
  return telem === '1' || telem === 'true' ? ['telemetrico'] : [];
}

function lerVazao(p: LeitorParametros): OpcaoVazao | null {
  const v = p.get('vazao');
  return v && (OPCOES_VAZAO as readonly string[]).includes(v) ? (v as OpcaoVazao) : null;
}

function lerUgrhi(p: LeitorParametros): UgrhiSelecionada {
  const v = p.get('ugrhi')?.trim();
  if (!v) return null;
  if (v === 'sem') return 'sem';
  if (!/^\d{1,2}$/.test(v)) return null;
  const n = Number(v);
  return n >= 1 && n <= 22 ? n : null;
}

function lerUf(p: LeitorParametros): UfSelecionada {
  const v = p.get('uf')?.trim();
  if (!v) return UF_DO_ESTADO;
  if (v === UF_TODAS) return null;
  if (v === 'sem') return 'sem';
  return /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : UF_DO_ESTADO;
}

export function lerEstado(p: LeitorParametros): EstadoTela {
  const favoritos = p.get('favoritos');
  return {
    q: (p.get('q') ?? '').slice(0, MAX_BUSCA),
    tipos: lerTipos(p),
    situacoes: lerSituacoes(p),
    transmissoes: lerTransmissoes(p),
    vazao: lerVazao(p),
    ugrhi: lerUgrhi(p),
    uf: lerUf(p),
    posto: texto(p.get('posto')),
    escopo: {
      municipio: texto(p.get('municipio')),
      bacia: texto(p.get('bacia')),
      mantenedor: texto(p.get('mantenedor')),
      favoritos: favoritos === '1' || favoritos === 'true',
    },
  };
}

function mesmoConjunto<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

/** Query string sem o `?`. Só o que difere do padrão, em ordem estável. */
export function serializarEstado(estado: EstadoTela): string {
  const u = new URLSearchParams();
  if (estado.q.trim()) u.set('q', estado.q.trim());
  if (!mesmoConjunto(estado.tipos, TIPOS_PADRAO)) u.set('tipo', estado.tipos.join(','));
  if (!mesmoConjunto(estado.situacoes, SITUACOES_PADRAO)) {
    u.set('situacao', estado.situacoes.join(','));
  }
  if (estado.transmissoes.length) u.set('transmissao', estado.transmissoes.join(','));
  if (estado.vazao) u.set('vazao', estado.vazao);
  if (estado.ugrhi !== null) u.set('ugrhi', String(estado.ugrhi));
  if (estado.uf !== UF_DO_ESTADO) u.set('uf', estado.uf ?? UF_TODAS);
  const { municipio, bacia, mantenedor, favoritos } = estado.escopo;
  if (municipio) u.set('municipio', municipio);
  if (bacia) u.set('bacia', bacia);
  if (mantenedor) u.set('mantenedor', mantenedor);
  if (favoritos) u.set('favoritos', '1');
  if (estado.posto) u.set('posto', estado.posto);
  return u.toString();
}

/** Parâmetros de `/api/postos/mapa`: só o escopo; o resto filtra no navegador. */
export function parametrosDaApi(escopo: EscopoServidor): string {
  const u = new URLSearchParams();
  if (escopo.municipio) u.set('municipio', escopo.municipio);
  if (escopo.bacia) u.set('bacia', escopo.bacia);
  if (escopo.mantenedor) u.set('mantenedor', escopo.mantenedor);
  if (escopo.favoritos) u.set('favoritos', '1');
  return u.toString();
}

export function temEscopo(escopo: EscopoServidor): boolean {
  return Boolean(escopo.municipio || escopo.bacia || escopo.mantenedor || escopo.favoritos);
}

/**
 * Valor que nenhum posto tem. Dimensão com NADA marcado precisa esconder tudo,
 * e o domínio trata lista vazia como "sem restrição"; este marcador dá o
 * efeito certo tanto no filtro quanto na contagem cruzada das outras dimensões.
 */
const NENHUM = '__nenhum__' as never;

/**
 * Filtros de classificação do domínio. Tipos ou situações todos marcados não
 * restringem nada, para o posto de tipo não reconhecido não sumir quando a
 * pessoa pediu "todos".
 */
export function filtrosDoEstado(estado: EstadoTela): FiltrosClassificacao {
  const tipo =
    estado.tipos.length === 0
      ? [NENHUM]
      : estado.tipos.length === TIPOS_POSTO_MAPA.length
        ? undefined
        : estado.tipos;
  const situacao =
    estado.situacoes.length === 0
      ? [NENHUM]
      : estado.situacoes.length === SITUACOES_POSTO.length
        ? undefined
        : estado.situacoes;
  return {
    tipo,
    situacao,
    transmissao: estado.transmissoes.length ? estado.transmissoes : undefined,
    vazao: estado.vazao ? [estado.vazao] : undefined,
    ugrhi: estado.ugrhi === null ? undefined : [estado.ugrhi === 'sem' ? null : estado.ugrhi],
    uf: estado.uf === null ? undefined : [estado.uf === 'sem' ? null : estado.uf],
  };
}

/** Quantos filtros diferem do padrão, para o selo do botão "Filtros". */
export function contarFiltrosAtivos(estado: EstadoTela): number {
  let n = 0;
  if (!mesmoConjunto(estado.tipos, TIPOS_PADRAO)) n++;
  if (!mesmoConjunto(estado.situacoes, SITUACOES_PADRAO)) n++;
  if (estado.transmissoes.length) n++;
  if (estado.vazao) n++;
  if (estado.ugrhi !== null) n++;
  if (estado.uf !== UF_DO_ESTADO) n++;
  return n;
}

/** Sem acento, sem caixa: "sao jose" acha "SÃO JOSÉ". */
export function normalizarBusca(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .trim();
}

export function casaBusca(ponto: PontoMapaPosto, termoNormalizado: string): boolean {
  if (!termoNormalizado) return true;
  if (normalizarBusca(ponto.prefixo).includes(termoNormalizado)) return true;
  if (ponto.nome && normalizarBusca(ponto.nome).includes(termoNormalizado)) return true;
  return ponto.municipio ? normalizarBusca(ponto.municipio).includes(termoNormalizado) : false;
}

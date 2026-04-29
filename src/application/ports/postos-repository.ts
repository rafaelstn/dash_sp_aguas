import type { Posto } from '@/domain/posto';

/**
 * Parâmetros de busca composta (ADR-0005 / filtros combinados).
 * Todos opcionais; podem ser combinados com AND. `termo` e `prefixoComecaCom`
 * são mutuamente exclusivos na origem (ver `buscarPostos` use case).
 */
export interface ParametrosPesquisa {
  termo?: string;
  prefixoComecaCom?: string;

  // Filtros categóricos (valores vêm de /api/postos/facetas)
  ugrhiNumero?: string;
  municipio?: string;
  baciaHidrografica?: string;
  tipoPosto?: string;
  /**
   * Mantenedor — match exato em mantenedor OU btl. Os dois campos do schema
   * representam "responsável pelo posto" na visão do usuário (Polícia
   * Ambiental costuma estar em btl, DAEE/CETESB em mantenedor).
   */
  mantenedor?: string;
  /**
   * Status operacional — heurística de recência sobre `operacao_fim_ano`.
   * A coluna não significa só "ano em que parou": pra postos ativos a
   * planilha-fonte preenche com o ano da última varredura (ex: 2025),
   * pra extintos com o ano real de baixa, e usa 0 como sentinela.
   *
   *   'ativo'      → fim_ano IS NULL OR fim_ano >= ano_corrente - 1
   *   'desativado' → fim_ano > 0 AND fim_ano < ano_corrente - 1
   *   undefined    → qualquer
   *
   * Regra a confirmar com o cliente SPÁguas. Implementação dinâmica via
   * `EXTRACT(YEAR FROM CURRENT_DATE)` pra não envelhecer.
   */
  status?: 'ativo' | 'desativado';
  /**
   * Filtro geográfico por proximidade (sem PostGIS — bounding box em graus).
   * Tolerância fixa de ±0.01° (~1 km em SP). Os dois precisam estar
   * preenchidos pra surtir efeito; senão ambos são ignorados.
   */
  latitude?: number;
  longitude?: number;

  // Checkbox de presença no cadastro
  temFichaDescritiva?: boolean;
  temFichaInspecao?: boolean;
  temTelemetrico?: boolean;

  // Apenas favoritos do usuário autenticado; exige usuarioId
  apenasFavoritos?: boolean;
  usuarioId?: string | null;

  pagina: number;
  porPagina: number;
}

export interface ResultadoPesquisa {
  total: number;
  itens: Posto[];
}

export interface PostosRepository {
  buscarPorPrefixo(prefixo: string): Promise<Posto | null>;
  pesquisar(params: ParametrosPesquisa): Promise<ResultadoPesquisa>;
}

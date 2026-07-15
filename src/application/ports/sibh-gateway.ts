/**
 * Port da integração com a API oficial do SIBH (Sistema Integrado de Bacias
 * Hidrográficas), apps.spaguas.sp.gov.br.
 *
 * Define o contrato que a camada de aplicação/rotas consome, sem acoplar ao
 * `fetch` nem ao formato cru da API v2. O adapter concreto vive em
 * `src/infrastructure/sibh/sibh-client.ts`.
 *
 * Esta integração é compartilhada: serve o módulo Monitor e o modo "ao vivo"
 * dos Diagramas.
 */

import type { AgregacaoDiaria } from '@/domain/monitor/agregacao-hidrologica';

/**
 * Estação pluviométrica do SIBH, na forma já normalizada para o domínio.
 */
export interface EstacaoSibh {
  /** Prefixo da estação (chave natural usada nos postos). */
  prefixo: string;
  /** Nome da estação. */
  nome: string;
  /**
   * Identificador numérico interno do SIBH. Preferir este ao `prefixo` ao
   * buscar medições: o mesmo prefixo pode aparecer em tipos diferentes
   * (pluviométrico/fluviométrico), e o `id` resolve a ambiguidade.
   */
  id: string;
  /** Tipo da estação (pluviométrico, fluviométrico, etc). */
  tipo: TipoEstacaoSibh;
  /**
   * Latitude em graus decimais (WGS84), do campo cru `latitude` do SIBH.
   * `null` quando a estação não traz coordenada válida (não pode ser
   * persistida no Monitor, que exige lat/lng NOT NULL: o sync pula a estação).
   */
  lat: number | null;
  /**
   * Longitude em graus decimais (WGS84), do campo cru `longitude` do SIBH.
   * `null` quando ausente ou inválida (mesmo tratamento de `lat`).
   */
  lng: number | null;
  /**
   * Bacia/UGRHI da estação, do campo cru `ugrhi_name` do SIBH. `null` quando
   * não informado. Persiste em `estacoes_pluviometricas.bacia`.
   */
  bacia: string | null;
  /**
   * Entidade responsável pela estação, do campo cru `station_owner` do SIBH
   * (ex.: 'SP ÁGUAS', 'CEMADEN', 'ANA'). `null` quando não informado. Persiste
   * em `estacoes_pluviometricas.owner` e dá a cor/filtro por entidade no mapa.
   */
  owner: string | null;
  /**
   * Status de transmissão da estação (`transmission_status` cru do SIBH).
   * Valores observados: 'ok' e 'pendente'; `null` quando não informado. NÃO é
   * interpretado aqui: a regra de "online" (que difere por tipo hidrológico)
   * vive no domínio (`estacaoOnline`). Persiste em
   * `estacoes_pluviometricas.transmission_status`.
   */
  transmissionStatus: string | null;
  /**
   * Momento da última medição transmitida (`date_last_measurement` cru do SIBH),
   * mantido como STRING crua (ex.: 'Wed Jul 15 2026 12:10:00 GMT+0000 (...)').
   * `null` quando ausente ou vazia (''). NÃO é convertida para `Date` aqui de
   * propósito: a normalização para ISO 8601/timestamptz acontece na fronteira de
   * persistência (repo/coluna), não no gateway. Persiste em
   * `estacoes_pluviometricas.ultima_transmissao` e alimenta a derivação de "online".
   */
  ultimaTransmissao: string | null;
}

/**
 * Ponto BRUTO de nível (metros) de uma estação fluviométrica ou piezométrica,
 * como vem do SIBH, já normalizado para o domínio.
 *
 * Diferente da chuva, o nível é grandeza INSTANTÂNEA (não acumulado do dia
 * hidrológico): a série NÃO é persistida — é consultada ao vivo e agregada por
 * dia de calendário no use-case. Um ponto por medição (granularidade original do
 * SIBH, tipicamente horária).
 */
export interface PontoNivelSibh {
  /** Momento da medição no formato do SIBH 'YYYY/MM/DD HH:mm'. */
  momento: string;
  /**
   * Nível lido em metros. Ver a DECISÃO DE MAPEAMENTO documentada no adapter
   * (`sibh-client.ts::serieNivelPorPrefixo`): na prática o SIBH entrega o nível
   * físico em `read_value` quando presente e, na maioria das estações de SP
   * Águas, em `value` (com `read_value` nulo). O ponto só existe quando há um
   * número finito; medições sem nível finito são descartadas.
   */
  nivelM: number;
}

/**
 * Medição horária de chuva do SIBH, normalizada para o domínio.
 */
export interface MedicaoSibh {
  /** Prefixo da estação que registrou a medição. */
  prefixo: string;
  /** Nome da estação. */
  nome: string;
  /** Valor acumulado no intervalo, em milímetros. */
  valorMm: number;
  /** Momento da medição no formato 'YYYY/MM/DD HH:mm' (como vem do SIBH). */
  momento: string;
  /** Intervalo da medição em minutos (60 = horária). */
  gapMinutos: number;
}

/**
 * Tipo de estação do SIBH conforme `station_type_id` da API v2.
 *
 *   pluviometrico  (id 2) -> mede chuva acumulada em mm (campo `value`).
 *   fluviometrico  (id 1) -> mede nível/cota; a leitura física em metros
 *                            vem em `read_value` (o `value` é o valor cru
 *                            do logger, sem unidade física direta).
 *   piezometrico   (id 3) -> nível de água subterrânea.
 *   qualidade      (id 5) -> parâmetros de qualidade.
 *   desconhecido          -> id fora do conjunto conhecido.
 */
export type TipoEstacaoSibh =
  | 'pluviometrico'
  | 'fluviometrico'
  | 'piezometrico'
  | 'qualidade'
  | 'desconhecido';

/**
 * Leitura mais recente de uma estação do SIBH, normalizada para o "ao vivo"
 * dos Diagramas.
 *
 * Conforme o tipo da estação, o valor relevante muda:
 *   - chuva (pluviométrico): use `valorMm`;
 *   - nível (fluviométrico): use `valorNivel` (em metros), quando presente.
 *
 * Ambos podem estar presentes em registros mistos; o consumidor escolhe pelo
 * `tipoEstacao` qual exibir.
 */
export interface LeituraSibh {
  /** Prefixo da estação. */
  prefixo: string;
  /** Nome da estação. */
  nome: string;
  /** Tipo da estação (define qual leitura interpretar). */
  tipoEstacao: TipoEstacaoSibh;
  /**
   * Acumulado de chuva em milímetros na medição mais recente. Presente em
   * estações pluviométricas; `null` quando a estação não mede chuva.
   */
  valorMm: number | null;
  /**
   * Nível/cota lido em metros (`read_value` da API). Presente em estações
   * fluviométricas com leitura física; `null` quando indisponível.
   */
  valorNivel: number | null;
  /** Momento da leitura no formato 'YYYY/MM/DD HH:mm' (como vem do SIBH). */
  momento: string;
  /** Intervalo da medição em minutos. */
  gapMinutos: number;
}

/**
 * Contrato de acesso ao SIBH. Server-side apenas (evita CORS no browser).
 */
export interface SibhGateway {
  /**
   * Lista todas as estações do SIBH. O adapter mantém cache (TTL ~1h) por
   * serem dados que mudam pouco.
   */
  listarEstacoes(): Promise<EstacaoSibh[]>;

  /**
   * Busca medições horárias de uma estação (por prefixo) no período
   * [desde, ate]. As datas são tratadas no nível de dia pela API do SIBH.
   * Retorna `[]` quando o prefixo não existe.
   */
  medicoesPorPrefixo(prefixo: string, desde: Date, ate: Date): Promise<MedicaoSibh[]>;

  /**
   * Busca a série BRUTA de nível (metros) de uma estação fluviométrica ou
   * piezométrica (por prefixo) no período [desde, ate]. Um ponto por medição, na
   * granularidade original do SIBH (tipicamente horária), SEM agregar e SEM
   * cache (dado ao vivo). Descarta medições sem nível finito. Retorna `[]`
   * quando o prefixo não existe. A agregação por dia de calendário fica no
   * use-case `obterSerieNivel`.
   */
  serieNivelPorPrefixo(prefixo: string, desde: Date, ate: Date): Promise<PontoNivelSibh[]>;

  /**
   * Retorna a leitura mais recente de uma estação (por prefixo) para o "ao
   * vivo" dos Diagramas: chuva (mm) e/ou nível (m), conforme o tipo. Olha uma
   * janela recente de poucos dias. Retorna `null` quando o prefixo não existe
   * ou não há medição recente.
   */
  valorAtualPorPrefixo(prefixo: string): Promise<LeituraSibh | null>;
}

// Reexporta a agregação de domínio pra quem consome o port ter uma única
// superfície de import (port + função pura + tipo de saída).
export type { AgregacaoDiaria };
export { agregarDiario } from '@/domain/monitor/agregacao-hidrologica';

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

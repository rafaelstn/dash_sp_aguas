/**
 * Entidade Posto Hidrológico — espelho dos 37 campos da planilha oficial SPÁguas.
 *
 * Todos os campos (exceto `prefixo`) são opcionais por invariante do domínio
 * (ver docs/spec.md §3.3 INV-02). Campos originalmente datados na planilha vêm
 * como string por tolerância a formatos heterogêneos.
 */
export interface Posto {
  id: string;
  prefixo: string;
  mantenedor: string | null;
  prefixoAna: string | null;
  nomeEstacao: string | null;
  operacaoInicioAno: number | null;
  operacaoFimAno: number | null;
  latitude: number | null;
  longitude: number | null;
  municipio: string | null;
  municipioAlt: string | null;
  baciaHidrografica: string | null;
  ugrhiNome: string | null;
  ugrhiNumero: string | null;
  subUgrhiNome: string | null;
  subUgrhiNumero: string | null;
  rede: string | null;
  proprietario: string | null;
  tipoPosto: string | null;
  areaKm2: number | null;
  btl: string | null;
  ciaAmbiental: string | null;
  cobacia: string | null;
  observacoes: string | null;
  tempoTransmissao: string | null;
  statusPcd: string | null;
  ultimaTransmissao: string | null;
  convencional: string | null;
  loggerEqp: string | null;
  telemetrico: string | null;
  nivel: string | null;
  vazao: string | null;
  fichaInspecao: string | null;
  ultimaDataFi: string | null;
  fichaDescritiva: string | null;
  ultimaAtualizacaoFd: string | null;
  aquifero: string | null;
  altimetria: number | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Frescor do dado do Monitor.
 *
 * O mapa não tem como distinguir, sozinho, dado de agora de dado de um mês
 * atrás: as duas telas são visualmente idênticas. Em 18/08/2026 o banco estava
 * com a última transmissão de 15/07/2026, e o painel seguia exibindo o número
 * de estações "online" daquela foto como se fosse o momento. A sincronização
 * com o SIBH é manual nesta fase (ver `POST /api/monitor/sync`), então a
 * defasagem não é excepcional: é o comportamento esperado quando ninguém
 * dispara a carga.
 *
 * Esta função existe para que a tela consiga DIZER a idade do que mostra.
 * Pura, sem I/O, recebendo `agora` por parâmetro para ser testável.
 */

/** Acima disso, o dado é tratado como defasado e a tela avisa. */
export const HORAS_ATE_DEFASAR = 24;

export interface Frescor {
  /** Transmissão mais recente entre as estações, ou null se não houver nenhuma. */
  maisRecente: Date | null;
  /** Idade da transmissão mais recente, em horas. null quando não há dado. */
  idadeHoras: number | null;
  /** `true` quando passou de `HORAS_ATE_DEFASAR`, ou quando não há dado algum. */
  defasado: boolean;
}

/**
 * Converte o valor cru de última transmissão em `Date`, tolerando os formatos
 * que chegam: ISO 8601 do nosso banco e `Date` já construído.
 *
 * Retorna null para ausente, vazio ou inválido, em vez de `Invalid Date`, para
 * que uma data quebrada não vire "agora" nem contamine o máximo.
 */
function paraData(valor: string | Date | null | undefined): Date | null {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor;
  const texto = String(valor).trim();
  if (texto === '') return null;
  const d = new Date(texto);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Calcula o frescor a partir das últimas transmissões conhecidas.
 *
 * Data no futuro conta como idade zero, nunca negativa: a fonte já devolveu
 * timestamp adiantado (o SIBH rotula como `GMT+0000` um horário que aparenta
 * ser de Brasília), e "daqui a uma hora" não é uma idade que faça sentido
 * exibir.
 */
export function calcularFrescor(
  ultimasTransmissoes: ReadonlyArray<string | Date | null | undefined>,
  agora: Date,
): Frescor {
  let maisRecente: Date | null = null;

  for (const bruto of ultimasTransmissoes) {
    const d = paraData(bruto);
    if (d === null) continue;
    if (maisRecente === null || d.getTime() > maisRecente.getTime()) {
      maisRecente = d;
    }
  }

  if (maisRecente === null) {
    // Sem nenhuma transmissão conhecida não há como afirmar que o dado está
    // fresco, então o veredito é defasado. O contrário faria a tela calar
    // justamente no caso mais grave.
    return { maisRecente: null, idadeHoras: null, defasado: true };
  }

  const diffMs = agora.getTime() - maisRecente.getTime();
  const idadeHoras = Math.max(0, diffMs / 3_600_000);

  return {
    maisRecente,
    idadeHoras,
    defasado: idadeHoras > HORAS_ATE_DEFASAR,
  };
}

/**
 * Texto curto da idade, para exibir ao lado da data. Sem travessão e sem
 * abreviação obscura: quem lê a tela precisa entender de primeira.
 */
export function descreverIdade(idadeHoras: number | null): string {
  if (idadeHoras === null) return 'sem registro de transmissão';
  if (idadeHoras < 1) return 'há menos de 1 hora';
  if (idadeHoras < 2) return 'há 1 hora';
  if (idadeHoras < 24) return `há ${Math.floor(idadeHoras)} horas`;
  const dias = Math.floor(idadeHoras / 24);
  return dias === 1 ? 'há 1 dia' : `há ${dias} dias`;
}

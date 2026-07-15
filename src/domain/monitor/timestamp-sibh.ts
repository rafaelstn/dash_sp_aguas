/**
 * Normalização do timestamp de transmissão do SIBH para ISO 8601.
 *
 * Domínio puro, sem I/O. O SIBH entrega `date_last_measurement` como string no
 * formato do `Date#toString()` do JS, ex.:
 *   'Wed Jul 15 2026 13:40:00 GMT+0000 (Coordinated Universal Time)'
 * ou como '' (vazia) quando não há medição.
 *
 * DECISÃO (verificada em 2026-07-15): esse formato cru NÃO é aceito pelo parser
 * de `timestamptz` do PostgreSQL (o dia-da-semana textual, o 'GMT+0000' e o
 * parêntese '(Coordinated Universal Time)' quebram o cast). Gravar a string crua
 * geraria erro de cast ou lixo. Por isso normalizamos para ISO 8601 UTC ANTES de
 * persistir — formato que o `timestamptz` aceita de forma canônica. A conversão
 * usa o próprio parser do JS, que lê o formato `toString()` que ele mesmo emite.
 *
 * Fica na fronteira de persistência (repo/mock/script de import), NÃO no gateway
 * (que mantém a string crua, conforme o port). Assim o único ponto que decide o
 * formato de banco é este.
 */

/**
 * Converte um timestamp cru do SIBH para ISO 8601 (UTC), ou `null` quando
 * ausente/vazio/inválido.
 *
 * Aceita tanto o formato cru do SIBH quanto uma string já em ISO (idempotente).
 * Qualquer valor que o JS não consiga parsear vira `null` (não grava lixo).
 *
 * @param valor String crua do SIBH, ISO, ou null/undefined.
 * @returns ISO 8601 UTC ('YYYY-MM-DDTHH:mm:ss.sssZ') ou `null`.
 */
export function normalizarTimestampSibh(
  valor: string | null | undefined,
): string | null {
  if (typeof valor !== 'string') return null;
  const t = valor.trim();
  if (t === '') return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

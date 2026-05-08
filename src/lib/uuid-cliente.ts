/**
 * Geração de UUID v4 no cliente para `Idempotency-Key`.
 *
 * Usa `crypto.randomUUID` quando disponível (todos os browsers
 * modernos em contextos seguros — o app é servido em HTTPS via PWA).
 * Cai num fallback baseado em `crypto.getRandomValues` quando o método
 * direto não está acessível (ex.: WebView Capacitor antiga).
 *
 * NÃO usar em servidor — o backend usa `crypto.randomUUID` do Node.
 *
 * Formato: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (variant 1, version 4).
 */

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function gerarUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    // RFC 4122 §4.4 — set version + variant bits.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return (
      `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
      `${hex.slice(16, 20)}-${hex.slice(20, 32)}`
    );
  }
  throw new Error('crypto.randomUUID/getRandomValues indisponível neste ambiente.');
}

export function ehUuidV4(valor: string): boolean {
  return UUID_V4_REGEX.test(valor);
}

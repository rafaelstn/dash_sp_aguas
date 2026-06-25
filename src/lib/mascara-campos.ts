/**
 * Máscaras progressivas de campo: mantêm só os dígitos digitados e inserem os
 * separadores conforme o usuário escreve. A validação de formato fica no Zod
 * (REGRAS_FORMATO); aqui é só apresentação. Extraído de `CampoFichaMobile`.
 */

/**
 * Insere `separador` após cada posição de corte, limitando a `maxDigitos`.
 * Ex.: `agruparDigitos('19122025', [2, 4], '/', 8)` → `'19/12/2025'`.
 */
export function agruparDigitos(
  bruto: string,
  cortes: number[],
  separador: string,
  maxDigitos: number,
): string {
  const digitos = bruto.replace(/\D/g, '').slice(0, maxDigitos);
  let saida = '';
  for (let i = 0; i < digitos.length; i++) {
    if (cortes.includes(i) && i > 0) saida += separador;
    saida += digitos[i];
  }
  return saida;
}

/** Máscara progressiva de CPF: `XXX.XXX.XXX-XX`. */
export function mascararCpf(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11);
  let saida = d.slice(0, 3);
  if (d.length > 3) saida += `.${d.slice(3, 6)}`;
  if (d.length > 6) saida += `.${d.slice(6, 9)}`;
  if (d.length > 9) saida += `-${d.slice(9, 11)}`;
  return saida;
}

/**
 * Máscara progressiva de telefone: `(XX) XXXXX-XXXX`, aceitando fixo (10) ou
 * celular (11 dígitos).
 */
export function mascararTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  // 8 dígitos (fixo) quebram em 4-4; 9 dígitos (celular) em 5-4.
  const corte = resto.length <= 8 ? 4 : 5;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/**
 * True quando `e` é a violação de unicidade (SQLSTATE 23505) do índice ou
 * restrição `indice`, como o `postgres.js` a entrega (`code` e `constraint_name`).
 *
 * O nome do índice é obrigatório de propósito: uma tabela com dois índices
 * únicos (estoque_unidades tem `codigo` e `chave_import`) traduzida só pelo
 * código diria ao usuário que o CÓDIGO repetiu quando foi a outra chave.
 */
export function violouUnicidade(e: unknown, indice: string): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const erro = e as { code?: unknown; constraint_name?: unknown };
  return erro.code === '23505' && erro.constraint_name === indice;
}

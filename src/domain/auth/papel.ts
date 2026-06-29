/**
 * Papéis de acesso (RBAC) do sistema.
 *
 * Hierarquia (do menor para o maior privilégio):
 *   user        -> assistente: app de campo (preenche/envia fichas) e consulta.
 *   admin       -> equipe operacional: tudo de user + aprova triagem, edita dado
 *                  oficial e gerencia usuários comuns (cria/edita/reseta senha).
 *   super_admin -> dono da operação: tudo de admin + cria/edita Admins e define
 *                  papéis.
 *
 * Tipo puro, sem I/O. Espelha o CHECK da coluna `papel` em `usuarios_papeis`
 * (migration 0050). É a fonte única de verdade da autorização; a antiga flag
 * `aprovador` passou a ser derivada (aprovador == admin ou super_admin).
 */

export type Papel = 'super_admin' | 'admin' | 'user';

/** Papel padrão de quem entra sem atribuição explícita. */
export const PAPEL_PADRAO: Papel = 'user';

/** Todos os papéis válidos, do maior para o menor privilégio. */
export const PAPEIS: readonly Papel[] = ['super_admin', 'admin', 'user'];

/** Rótulo legível em PT-BR para exibição. */
export const ROTULO_PAPEL: Record<Papel, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  user: 'Usuário',
};

/** True se o valor é um papel válido (guarda de entrada não confiável). */
export function ehPapelValido(valor: unknown): valor is Papel {
  return valor === 'super_admin' || valor === 'admin' || valor === 'user';
}

/**
 * "Aprovador" = quem pode aprovar triagem e editar dado oficial: admin ou
 * super_admin. Mantém a semântica do RBAC anterior (flag `aprovador`).
 */
export function ehAdmin(papel: Papel): boolean {
  return papel === 'admin' || papel === 'super_admin';
}

/** Apenas o super_admin (gestão de Admins e de papéis). */
export function ehSuperAdmin(papel: Papel): boolean {
  return papel === 'super_admin';
}

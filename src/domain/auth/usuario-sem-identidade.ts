/**
 * Usuário institucional da janela SEM IDENTIDADE (entrega PRODESP).
 *
 * Mora no domínio, e não na infraestrutura, porque duas camadas precisam dele
 * por motivos diferentes e nenhuma delas pode depender da outra: a
 * infraestrutura o usa como identidade atribuída (`current-user.ts`), e o
 * domínio o usa como sentinela ao rotular o autor de um registro
 * (`domain/estoque/export.ts`). Regra de negócio pura, sem I/O.
 *
 * O contexto completo da janela está em
 * `src/infrastructure/auth/acesso-sem-identidade.ts`.
 */

export interface UsuarioSemIdentidade {
  id: string;
  email: string;
  nome: string;
}

/**
 * Identidade única atribuída a toda requisição enquanto a autenticação está
 * suspensa.
 *
 * O `id` é UUID v4 canônico porque o Postgres recebe `${id}::uuid` e quatro
 * chaves estrangeiras NOT NULL apontam para `auth.users`. A linha
 * correspondente é criada pela migration 0066.
 *
 * O `nome` se anuncia como ausência de identificação de propósito: ele aparece
 * na trilha de auditoria e em planilha exportada, e uma trilha que inventa um
 * nome é pior que uma trilha que declara não saber.
 */
export const USUARIO_SEM_IDENTIDADE: UsuarioSemIdentidade = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'acesso-sem-identidade@dmo.local',
  nome: 'Acesso sem identificação',
};

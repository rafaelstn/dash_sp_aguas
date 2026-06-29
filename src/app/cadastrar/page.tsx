import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Cadastro — Ficha Técnica de Postos Hidrológicos',
};

/**
 * Autocadastro público DESATIVADO (acesso controlado, cliente governo): contas
 * passam a ser criadas pelo Admin/Super Admin na gestão de usuários
 * (/admin/usuarios). A rota é mantida apenas para redirecionar quem chegar por
 * link antigo de volta ao login. O `FormularioCadastro` foi preservado como
 * componente reutilizável para a criação administrativa.
 */
export default function PaginaCadastro() {
  redirect('/login');
}

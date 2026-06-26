import { ChromeDashboard } from '@/components/layout/ChromeDashboard';
import { obterItensNav } from '@/components/layout/nav-itens';

/**
 * Chrome do app autenticado: navegação lateral colapsável (desktop) com a
 * identidade institucional no topo, header como barra de ferramentas
 * (gatilho de colapso + menu do usuário) e drawer com hamburger no mobile
 * (MenuMobile). Aplicado a TODAS as rotas dentro do route group
 * `(dashboard)`, ficha técnica do posto, busca, painel, favoritos, etc.
 *
 * O estado de colapso e a casca interativa vivem no `ChromeDashboard`
 * (client). As páginas seguem Server Components por padrão: chegam aqui
 * já renderizadas e são passadas como `children`. Itens e usuário são
 * calculados server-side por `obterItensNav` e propagados por props.
 *
 * Rotas públicas (`/login`, `/cadastrar`) ficam fora deste group e
 * herdam apenas o root layout, visualizadas centralizadas, sem chrome.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { usuario, itens } = await obterItensNav();

  return (
    <ChromeDashboard itens={itens} usuario={usuario}>
      {children}
    </ChromeDashboard>
  );
}

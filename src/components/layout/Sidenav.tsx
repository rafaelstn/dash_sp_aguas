import Link from 'next/link';
import {
  favoritosRepository,
  desconformidadesRepository,
  papeisRepository,
  triagemRepository,
  anaRevisaoRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { ItemSidenav, type IconeKey } from './ItemSidenav';

/**
 * Navegação lateral fixa (desktop ≥ lg). Em telas menores, oculta-se com
 * `hidden lg:flex` — mobile usa links inline no header (futuro: drawer).
 *
 * Contadores:
 *  - favoritos: do usuário autenticado (0 se deslogado).
 *  - desconformidades: total de postos desconformes (view v_postos_desconformes).
 *  - triagem: total de fichas pendentes/em revisão. Item é visível apenas
 *    para usuários com papel `aprovador` em `usuarios_papeis`.
 */
export async function Sidenav() {
  const usuario = await obterUsuarioAtual();
  let totalFavoritos = 0;
  let totalDesconformidades = 0;
  let ehAprovador = false;
  let totalTriagem = 0;
  let totalInventarioAna = 0;
  let totalDivergenciasGeo = 0;

  try {
    if (usuario) totalFavoritos = await favoritosRepository.contar(usuario.id);
  } catch {
    /* tolera erro — sidenav ainda renderiza */
  }
  try {
    const c = await desconformidadesRepository.contar();
    totalDesconformidades = c.prefixoPrincipal + c.prefixoAna;
  } catch {
    /* idem */
  }
  if (usuario) {
    try {
      ehAprovador = await papeisRepository.ehAprovador(usuario.id);
    } catch {
      /* sem papel ainda assim renderiza sidenav — apenas oculta o item */
    }
    if (ehAprovador) {
      try {
        const r = await triagemRepository.listarPendentes({
          estado: ['pendente', 'em_revisao'],
          limite: 1,
          offset: 0,
        });
        totalTriagem = r.total;
      } catch {
        /* badge ausente é melhor que sidenav quebrado */
      }
      try {
        const lote = await anaRevisaoRepository.loteAtual();
        if (lote) {
          const resumo = await anaRevisaoRepository.resumoPainel(lote.id);
          // Badge mostra apenas pendências ainda não revisadas
          totalInventarioAna =
            resumo.statusPendente + resumo.statusEmRevisao;
        }
      } catch {
        /* idem */
      }
      try {
        const { sql } = await import('@/infrastructure/db/client');
        const r = await sql<Array<{ total: number }>>`
          SELECT COUNT(*)::int AS total FROM postos
           WHERE divergencia_municipio = 'divergente' AND deleted_at IS NULL
        `;
        totalDivergenciasGeo = r[0]?.total ?? 0;
      } catch {
        /* idem */
      }
    }
  }

  type ItemSide = {
    href: string;
    rotulo: string;
    icone: IconeKey;
    contador: number | null;
    atalho?: string;
  };

  type GrupoSide = {
    titulo: string;
    totalContador?: number;
    itens: ItemSide[];
  };

  const grupos: GrupoSide[] = [];

  // Pendências (alta prioridade, no topo, com badge agregado)
  if (ehAprovador) {
    const pendencias: ItemSide[] = [
      {
        href: '/inventario-ana',
        rotulo: 'Auditoria ANA',
        icone: 'alert',
        contador: totalInventarioAna,
        atalho: 'A',
      },
      {
        href: '/triagem',
        rotulo: 'Triagem',
        icone: 'inbox',
        contador: totalTriagem,
        atalho: 'T',
      },
      {
        href: '/postos/divergencias-geo',
        rotulo: 'Divergências geo',
        icone: 'alert',
        contador: totalDivergenciasGeo,
        atalho: 'G',
      },
      {
        href: '/desconformidades',
        rotulo: 'Desconformidades',
        icone: 'alert',
        contador: totalDesconformidades,
        atalho: 'D',
      },
    ];
    grupos.push({
      titulo: 'Pendências',
      totalContador:
        totalInventarioAna +
        totalTriagem +
        totalDivergenciasGeo +
        totalDesconformidades,
      itens: pendencias,
    });
  }

  // Navegação principal (todos os usuários autenticados)
  const navegacao: ItemSide[] = [
    { href: '/painel', rotulo: 'Painel', icone: 'dashboard', contador: null, atalho: 'P' },
    { href: '/', rotulo: 'Buscar postos', icone: 'search', contador: null, atalho: '/' },
    { href: '/favoritos', rotulo: 'Favoritos', icone: 'star', contador: totalFavoritos, atalho: 'F' },
  ];
  if (!ehAprovador) {
    // Para usuário comum, Desconformidades fica em Navegação
    navegacao.push({
      href: '/desconformidades',
      rotulo: 'Desconformidades',
      icone: 'alert',
      contador: totalDesconformidades,
      atalho: 'D',
    });
  }
  grupos.push({ titulo: 'Navegação', itens: navegacao });

  return (
    <aside
      aria-label="Navegação principal"
      className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-sidenav lg:shrink-0 lg:flex-col border-r border-app-border-subtle bg-app-surface"
    >
      <nav className="flex-1 p-2 space-y-4">
        {grupos.map((grupo, gIdx) => (
          <div key={grupo.titulo}>
            <div className="flex items-baseline justify-between px-2 pb-2 pt-1">
              <p className="text-2xs font-semibold uppercase tracking-wider text-app-fg-muted">
                {grupo.titulo}
              </p>
              {grupo.totalContador !== undefined && grupo.totalContador > 0 ? (
                <span
                  aria-label={`${grupo.totalContador} pendência(s) no total`}
                  className="rounded-full bg-gov-perigo px-1.5 text-2xs font-semibold text-white tabular"
                >
                  {grupo.totalContador.toLocaleString('pt-BR')}
                </span>
              ) : null}
            </div>
            <ul className="space-y-0.5" aria-labelledby={`grupo-${gIdx}`}>
              {grupo.itens.map((item) => (
                <li key={item.href}>
                  <ItemSidenav
                    href={item.href}
                    rotulo={item.rotulo}
                    icone={item.icone}
                    contador={item.contador}
                    atalho={item.atalho}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-app-border-subtle px-3 py-2.5 text-xs text-app-fg-muted">
        {usuario ? (
          <>
            {usuario.nome ? (
              <p
                className="truncate font-medium text-app-fg"
                title={usuario.nome}
              >
                {usuario.nome}
              </p>
            ) : null}
            <p className="truncate" title={usuario.email}>
              {usuario.email}
            </p>
            <a
              href="/auth/sair"
              className="mono rounded-sm text-2xs text-gov-azul hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-gov-azul"
            >
              sair
            </a>
          </>
        ) : (
          <div className="flex flex-col gap-0.5">
            <Link href="/login" className="text-gov-azul hover:underline">
              Entrar
            </Link>
            <Link href="/cadastrar" className="text-gov-azul hover:underline">
              Cadastrar
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}

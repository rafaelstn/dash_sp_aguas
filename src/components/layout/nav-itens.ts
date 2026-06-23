import 'server-only';

import {
  favoritosRepository,
  desconformidadesRepository,
  papeisRepository,
  triagemRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual, type UsuarioAutenticado } from '@/infrastructure/auth/current-user';
import type { IconeKey } from './ItemSidenav';

/**
 * Item de navegação principal compartilhado entre o Sidenav desktop e o
 * MenuMobile drawer. Calculado server-side e propagado como dado puro
 * pra evitar duplicação de queries e divergência entre as duas telas.
 */
export interface ItemNav {
  href: string;
  rotulo: string;
  icone: IconeKey;
  contador: number | null;
  atalho?: string;
}

export interface ResultadoNav {
  usuario: UsuarioAutenticado | null;
  itens: ItemNav[];
}

/**
 * Lê o usuário, conta favoritos, desconformidades, triagem e papel
 * aprovador para montar a lista de itens. Tolera falhas pontuais
 * (badge zerado é melhor que tela quebrada).
 */
export async function obterItensNav(): Promise<ResultadoNav> {
  const usuario = await obterUsuarioAtual();
  let totalFavoritos = 0;
  let totalDesconformidades = 0;
  let ehAprovador = false;
  let totalTriagem = 0;

  try {
    if (usuario) totalFavoritos = await favoritosRepository.contar(usuario.id);
  } catch {
    /* tolera */
  }
  try {
    const c = await desconformidadesRepository.contar();
    totalDesconformidades = c.prefixoPrincipal + c.prefixoAna;
  } catch {
    /* tolera */
  }
  if (usuario) {
    try {
      ehAprovador = await papeisRepository.ehAprovador(usuario.id);
    } catch {
      /* tolera */
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
        /* tolera */
      }
    }
  }

  const itens: ItemNav[] = [
    { href: '/painel', rotulo: 'Painel', icone: 'dashboard', contador: null, atalho: 'P' },
    { href: '/', rotulo: 'Buscar postos', icone: 'search', contador: null, atalho: '/' },
    { href: '/favoritos', rotulo: 'Favoritos', icone: 'star', contador: totalFavoritos, atalho: 'F' },
    { href: '/desconformidades', rotulo: 'Desconformidades', icone: 'alert', contador: totalDesconformidades, atalho: 'D' },
    { href: '/diagramas', rotulo: 'Diagramas', icone: 'workflow', contador: null, atalho: 'G' },
  ];
  if (ehAprovador) {
    itens.push({
      href: '/triagem',
      rotulo: 'Triagem',
      icone: 'inbox',
      contador: totalTriagem,
      atalho: 'T',
    });
  }

  return { usuario, itens };
}

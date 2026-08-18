import { PainelMonitor } from '@/components/features/monitor/PainelMonitor';
import { papeisRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Monitor hidrológico — SP Águas - DMO',
};

/**
 * Monitor hidrológico: mapa das estações da rede.
 *
 * Server Component fino: a interatividade (mapa Leaflet, filtros, seletor de
 * tipo hidrológico, alternância mapa/lista) vive em PainelMonitor (client), que
 * busca as estações na API já existente e carrega o mapa via next/dynamic
 * ssr:false. O seletor de tipo alterna entre estações pluviométricas,
 * fluviométricas e piezométricas.
 *
 * O papel do usuário é resolvido aqui, no servidor, só para decidir se a ação
 * de sincronizar aparece na tela. Isso é conveniência, nunca proteção: quem
 * autoriza de verdade é `POST /api/monitor/sync`, que exige aprovador e
 * responde 403 para qualquer outro, independentemente do que a tela mostre.
 */
export default async function PaginaMonitor() {
  let podeSincronizar = false;
  try {
    const usuario = await obterUsuarioAtual();
    if (usuario) podeSincronizar = await papeisRepository.ehAprovador(usuario.id);
  } catch {
    // Falha ao resolver o papel esconde a ação, nunca libera. O mapa continua
    // funcionando: a sincronização é acessória à leitura.
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">Monitor hidrológico</h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Rede de estações pluviométricas, fluviométricas e piezométricas no
          estado de São Paulo, sobre as bacias e UGRHIs oficiais do DAEE
        </p>
      </header>

      <PainelMonitor podeSincronizar={podeSincronizar} />
    </div>
  );
}

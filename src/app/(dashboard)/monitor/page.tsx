import { PainelMonitor } from '@/components/features/monitor/PainelMonitor';

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
 */
export default function PaginaMonitor() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">Monitor hidrológico</h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Rede de estações pluviométricas, fluviométricas e piezométricas no
          estado de São Paulo, sobre as bacias e UGRHIs oficiais do DAEE
        </p>
      </header>

      <PainelMonitor />
    </div>
  );
}

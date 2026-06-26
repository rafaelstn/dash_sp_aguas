import { PainelMonitor } from '@/components/features/monitor/PainelMonitor';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Monitor pluviométrico — SP Águas - DMO',
};

/**
 * Monitor pluviométrico, fase B2: mapa das estações.
 *
 * Server Component fino: a interatividade (mapa Leaflet, filtros, alternância
 * mapa/lista) vive em PainelMonitor (client), que busca as estações na API
 * já existente e carrega o mapa via next/dynamic ssr:false. Gráficos e detalhe
 * de estação são a fase B3, fora deste escopo.
 */
export default function PaginaMonitor() {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-app-fg">Monitor pluviométrico</h1>
        <p className="mt-0.5 text-xs text-app-fg-muted">
          Rede de estações pluviométricas no estado de São Paulo, sobre as bacias
          e UGRHIs oficiais do DAEE
        </p>
      </header>

      <PainelMonitor />
    </div>
  );
}

import { Suspense } from 'react';
import { TelaPostos } from '@/components/features/postos/mapa/TelaPostos';

export const metadata = {
  title: 'Postos | SP Águas - DMO',
};

/**
 * Postos: mapa, lista e detalhe numa tela só. Substitui a busca antiga e o
 * Monitor, que redireciona para cá. Os parâmetros da busca antiga continuam
 * abrindo a tela certa: quem os traduz é o estado de URL da própria tela.
 */
export default function PaginaPostos() {
  return (
    <>
      <h1 className="sr-only">Postos</h1>
      {/* useSearchParams exige Suspense para a rota não cair inteira no cliente. */}
      <Suspense
        fallback={
          <div className="h-[36rem] animate-pulse rounded-gov-card bg-app-surface-2" aria-hidden="true" />
        }
      >
        <TelaPostos />
      </Suspense>
    </>
  );
}

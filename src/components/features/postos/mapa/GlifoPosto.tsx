import type { TipoPostoMapa } from '@/domain/mapa-postos';
import { estiloDoTipo, type Forma } from './simbolos';

/**
 * O mesmo símbolo do mapa, em SVG, para lista, legenda, filtros e detalhe.
 * Decorativo: quem usa escreve o tipo e a situação em texto ao lado.
 */
export function GlifoPosto({
  tipo,
  extinto = false,
  tamanho = 12,
}: {
  tipo: TipoPostoMapa | null;
  extinto?: boolean;
  tamanho?: number;
}) {
  const estilo = estiloDoTipo(tipo);
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 12 12"
      className="shrink-0"
    >
      <Forma
        forma={estilo.forma}
        fill={extinto ? '#FFFFFF' : estilo.cor}
        stroke={extinto ? estilo.cor : 'none'}
        strokeWidth={extinto ? 1.6 : 0}
      />
    </svg>
  );
}

function Forma({
  forma,
  ...pintura
}: {
  forma: Forma;
  fill: string;
  stroke: string;
  strokeWidth: number;
}) {
  switch (forma) {
    case 'circulo':
      return <circle cx="6" cy="6" r="4.6" {...pintura} />;
    case 'quadrado':
      return <rect x="1.8" y="1.8" width="8.4" height="8.4" {...pintura} />;
    case 'triangulo':
      return <polygon points="6,1.2 11,10.2 1,10.2" strokeLinejoin="round" {...pintura} />;
    case 'losango':
      return <polygon points="6,0.8 11.2,6 6,11.2 0.8,6" strokeLinejoin="round" {...pintura} />;
  }
}

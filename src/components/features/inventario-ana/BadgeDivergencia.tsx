import type { DivergenciaMunicipio } from '@/domain/ana-revisao';
import { formatarMedida } from '@/lib/format';

interface Props {
  divergencia: DivergenciaMunicipio | null;
  distanciaM?: number | null;
}

const ROTULOS: Record<DivergenciaMunicipio, string> = {
  ok: 'OK',
  margem_aceitavel: 'Margem',
  divergente: 'Divergente',
  sem_coordenada: 'Sem coord',
};

const CORES: Record<DivergenciaMunicipio, string> = {
  ok: 'bg-green-100 text-green-900 border-green-300',
  margem_aceitavel: 'bg-amber-100 text-amber-900 border-amber-300',
  divergente: 'bg-red-100 text-red-900 border-red-300',
  sem_coordenada: 'bg-gray-100 text-gray-900 border-gray-300',
};

export function BadgeDivergencia({ divergencia, distanciaM }: Props) {
  if (!divergencia) {
    return <span className="text-2xs text-app-fg-subtle">—</span>;
  }
  const rotulo = ROTULOS[divergencia];
  const classe = CORES[divergencia];
  const titulo =
    distanciaM !== null && distanciaM !== undefined && divergencia !== 'ok'
      ? `${rotulo}: ${formatarMedida(Number((distanciaM / 1000).toFixed(1)))} km da fronteira`
      : rotulo;
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium tabular ${classe}`}
      title={titulo}
    >
      {rotulo}
      {distanciaM !== null && distanciaM !== undefined && divergencia === 'divergente' ? (
        <span className="ml-1 mono">{(distanciaM / 1000).toFixed(0)}km</span>
      ) : null}
    </span>
  );
}

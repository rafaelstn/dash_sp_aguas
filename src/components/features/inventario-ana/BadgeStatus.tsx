import type { StatusRevisao } from '@/domain/ana-revisao';

interface Props {
  status: StatusRevisao;
}

const ROTULOS: Record<StatusRevisao, string> = {
  pendente: 'Pendente',
  em_revisao: 'Em revisão',
  revisada: 'Revisada',
  descartada: 'Descartada',
  sem_match: 'Sem match',
  promovida_a_posto: 'Promovida',
};

const CORES: Record<StatusRevisao, string> = {
  pendente: 'bg-gray-100 text-gray-900 border-gray-300',
  em_revisao: 'bg-blue-100 text-blue-900 border-blue-300',
  revisada: 'bg-green-100 text-green-900 border-green-300',
  descartada: 'bg-stone-200 text-stone-700 border-stone-300',
  sem_match: 'bg-amber-100 text-amber-900 border-amber-300',
  promovida_a_posto: 'bg-purple-100 text-purple-900 border-purple-300',
};

export function BadgeStatus({ status }: Props) {
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-2xs font-medium ${CORES[status]}`}
    >
      {ROTULOS[status]}
    </span>
  );
}

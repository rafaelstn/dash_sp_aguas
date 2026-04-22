import Link from 'next/link';
import type { Posto } from '@/domain/posto';
import { formatarValor } from '@/lib/format';
import { EstadoVazio } from '@/components/ui/EstadoVazio';

export interface ListaResultadosProps {
  itens: Posto[];
  total: number;
  termo: string;
}

export function ListaResultados({ itens, total, termo }: ListaResultadosProps) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum posto encontrado"
        descricao={`Nenhum resultado para "${termo}". Revise o termo ou tente pelo prefixo.`}
      />
    );
  }

  return (
    <section aria-label={`Resultados da busca: ${total} posto(s) encontrado(s)`}>
      <p className="text-sm text-gov-muted mb-3">
        {total} {total === 1 ? 'posto encontrado' : 'postos encontrados'}
      </p>
      <ul className="divide-y divide-gov-borda border border-gov-borda rounded bg-white">
        {itens.map((posto) => (
          <li key={posto.id}>
            <Link
              href={{ pathname: `/postos/${encodeURIComponent(posto.prefixo)}` }}
              className="block p-4 hover:bg-gov-superficie focus-visible:bg-gov-superficie"
            >
              <p className="font-mono text-gov-azul font-semibold">{posto.prefixo}</p>
              <p className="text-gov-texto">{formatarValor(posto.nomeEstacao)}</p>
              <p className="text-sm text-gov-muted">
                {formatarValor(posto.municipio)} · {formatarValor(posto.baciaHidrografica)} · {formatarValor(posto.tipoPosto)}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

import Link from 'next/link';
import type { Posto } from '@/domain/posto';
import { formatarValor } from '@/lib/format';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { BotaoFavoritar } from '@/components/features/favoritos/BotaoFavoritar';

export interface ListaResultadosProps {
  itens: Posto[];
  total: number;
  termo: string;
  /** Prefixos favoritos do usuário atual — usado pra render inicial do botão. */
  prefixosFavoritos?: Set<string>;
  /** Usuário autenticado? — se não, botão favoritar manda pra /login. */
  autenticado?: boolean;
}

function Pilula({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  if (!valor) return null;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gov-superficie-2 text-xs text-gov-texto">
      <span className="text-gov-muted">{rotulo}:</span>
      <span className="font-medium">{valor}</span>
    </span>
  );
}

export function ListaResultados({
  itens,
  total,
  termo,
  prefixosFavoritos,
  autenticado = false,
}: ListaResultadosProps) {
  if (itens.length === 0) {
    return (
      <EstadoVazio
        titulo="Nenhum posto encontrado"
        descricao={
          termo
            ? `Nenhum resultado para "${termo}". Revise o termo ou tente pelo prefixo.`
            : 'Nenhum posto corresponde aos filtros aplicados. Ajuste os filtros ou limpe-os para ver todos os resultados.'
        }
      />
    );
  }

  const favoritos = prefixosFavoritos ?? new Set<string>();

  return (
    <section aria-label={`Resultados da busca: ${total} posto(s) encontrado(s)`}>
      <p className="text-sm text-gov-muted mb-3" aria-live="polite">
        {total.toLocaleString('pt-BR')}{' '}
        {total === 1 ? 'posto encontrado' : 'postos encontrados'}
      </p>
      <ul className="space-y-2">
        {itens.map((posto) => {
          const favoritado = favoritos.has(posto.prefixo);
          return (
            <li
              key={posto.id}
              className="relative border border-gov-borda rounded-gov-card bg-white shadow-gov-card hover:shadow-gov-card-hover transition-shadow motion-safe:duration-150"
            >
              <Link
                href={{ pathname: `/postos/${encodeURIComponent(posto.prefixo)}` }}
                className="block p-4 pr-14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul rounded-gov-card"
                aria-label={`Abrir ficha do posto ${posto.prefixo}: ${formatarValor(posto.nomeEstacao)}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-gov-azul font-semibold text-base">
                    {posto.prefixo}
                  </span>
                  <span className="text-gov-texto font-medium text-lg">
                    {formatarValor(posto.nomeEstacao)}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Pilula rotulo="Município" valor={posto.municipio} />
                  <Pilula rotulo="Bacia" valor={posto.baciaHidrografica} />
                  <Pilula rotulo="UGRHI" valor={posto.ugrhiNome} />
                  <Pilula rotulo="Tipo" valor={posto.tipoPosto} />
                </div>
              </Link>
              <div className="absolute top-3 right-3">
                <BotaoFavoritar
                  prefixo={posto.prefixo}
                  favoritadoInicial={favoritado}
                  autenticado={autenticado}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

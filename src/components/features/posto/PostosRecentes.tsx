import Link from 'next/link';
import type { PostoRecente } from '@/application/use-cases/listar-postos-recentes';
import { formatarValor } from '@/lib/format';
import { BotaoFavoritar } from '@/components/features/favoritos/BotaoFavoritar';

export interface PostosRecentesProps {
  itens: PostoRecente[];
  /**
   * Conjunto de prefixos já favoritados pelo usuário. Determina o estado
   * inicial de cada estrela. Se vazio (ou ausente), todos começam como
   * "não favoritado".
   */
  prefixosFavoritos?: Set<string>;
  /**
   * Usuário autenticado. Controla o comportamento do BotaoFavoritar: se
   * `false`, click manda pro login. Default `true` porque essa seção só
   * aparece pra autenticados (use case retorna [] sem usuário).
   */
  autenticado?: boolean;
}

/**
 * Acesso rápido: postos visualizados recentemente pelo usuário autenticado.
 * Lê de `acesso_ficha` via use case `listarPostosRecentes` — append-only,
 * mas com SELECT permitido pro próprio usuário (LGPD art. 18 — direito de
 * acesso ao próprio dado pessoal).
 *
 * Cada card mostra estrela de favoritar no canto superior direito.
 * O botão fica em `position: absolute z-10` sobre o `<Link>` que cobre
 * o card — mesmo padrão de stretched-link reverso usado na tabela de
 * resultados de busca, garantindo que o click na estrela alterna o
 * favorito sem disparar a navegação pra ficha.
 *
 * Renderiza nada quando o histórico está vazio: usuário novo não vê uma
 * seção "Recentes" sem itens — vira ruído.
 */
export function PostosRecentes({
  itens,
  prefixosFavoritos,
  autenticado = true,
}: PostosRecentesProps) {
  if (itens.length === 0) return null;
  const favoritos = prefixosFavoritos ?? new Set<string>();

  return (
    <section aria-labelledby="postos-recentes" className="space-y-3">
      <h2
        id="postos-recentes"
        className="text-sm font-semibold uppercase tracking-wider text-gov-muted"
      >
        Vistos recentemente
      </h2>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {itens.map(({ posto, visualizadoEm }) => (
          <li key={posto.id} className="relative">
            <Link
              href={`/postos/${encodeURIComponent(posto.prefixo)}`}
              className="block rounded-gov-card border border-gov-borda bg-white p-3 pr-12 shadow-gov-card transition-shadow hover:shadow-gov-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
            >
              <p className="mono text-sm font-semibold text-gov-azul">
                {posto.prefixo}
              </p>
              <p
                className="mt-0.5 truncate text-sm font-medium text-gov-texto"
                title={posto.nomeEstacao ?? undefined}
              >
                {formatarValor(posto.nomeEstacao)}
              </p>
              <p className="mt-1 truncate text-xs text-gov-muted">
                {[posto.municipio, posto.tipoPosto]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </p>
              <p className="mt-1 text-2xs uppercase tracking-wider text-gov-muted tabular">
                {formatarRelativo(visualizadoEm)}
              </p>
            </Link>

            {/* Estrela de favoritar — absoluto z-10 sobre o Link.
                stopPropagation interno do BotaoFavoritar evita navegar. */}
            <div className="absolute right-1.5 top-1.5 z-10">
              <BotaoFavoritar
                prefixo={posto.prefixo}
                favoritadoInicial={favoritos.has(posto.prefixo)}
                autenticado={autenticado}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Format curto e estável de "tempo desde". Roda no Server Component (toda
 * a árvore aqui é server) — nenhum risco de hydration mismatch porque o
 * cálculo só acontece no server e o resultado já vai serializado no HTML.
 */
function formatarRelativo(quando: Date): string {
  const agora = Date.now();
  const delta = Math.max(0, agora - quando.getTime());
  const minutos = Math.floor(delta / 60_000);
  if (minutos < 1) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `há ${horas} h`;
  const dias = Math.floor(horas / 24);
  if (dias < 30) return `há ${dias} d`;
  return quando.toLocaleDateString('pt-BR');
}

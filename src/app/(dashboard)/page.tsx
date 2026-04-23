import { Suspense } from 'react';
import { CampoBusca } from '@/components/features/busca/CampoBusca';
import { ListaResultados } from '@/components/features/busca/ListaResultados';
import { EstadoVazio } from '@/components/ui/EstadoVazio';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alerta } from '@/components/ui/Alerta';
import { buscarPostos } from '@/application/use-cases/buscar-postos';
import {
  postosRepository,
  favoritosRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { TermoBuscaInvalido } from '@/domain/errors';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{ q?: string; pagina?: string }>;
}

async function Resultados({ termo, pagina }: { termo: string; pagina: number }) {
  const usuario = await obterUsuarioAtual();
  try {
    const { itens, total } = await buscarPostos(postosRepository, {
      termo,
      pagina,
      usuarioId: usuario?.id ?? null,
    });

    let prefixosFavoritos = new Set<string>();
    if (usuario) {
      try {
        prefixosFavoritos = await favoritosRepository.prefixosFavoritos(usuario.id);
      } catch {
        /* ignora — lista sem marcação de favorito */
      }
    }

    return (
      <ListaResultados
        itens={itens}
        total={total}
        termo={termo}
        prefixosFavoritos={prefixosFavoritos}
        autenticado={Boolean(usuario)}
      />
    );
  } catch (e) {
    if (e instanceof TermoBuscaInvalido) {
      return (
        <Alerta tipo="aviso" titulo="Termo inválido">
          {e.message}
        </Alerta>
      );
    }
    return (
      <Alerta tipo="erro" titulo="Falha ao consultar postos">
        Tente novamente em instantes. Se o erro persistir, procure o operador do sistema.
      </Alerta>
    );
  }
}

function SkeletonResultados() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;
  const termo = (sp.q ?? '').trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1));

  return (
    <div className="space-y-8">
      <CampoBusca />

      {termo.length === 0 ? (
        <EstadoVazio
          titulo="Consulte um posto hidrológico"
          descricao="Informe o prefixo do posto ou parte do nome do município / bacia / UGRHI para iniciar a busca."
        />
      ) : (
        <Suspense fallback={<SkeletonResultados />}>
          <Resultados termo={termo} pagina={pagina} />
        </Suspense>
      )}
    </div>
  );
}

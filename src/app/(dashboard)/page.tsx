import { Suspense } from 'react';
import Link from 'next/link';
import { CampoBusca } from '@/components/features/busca/CampoBusca';
import { ListaResultados } from '@/components/features/busca/ListaResultados';
import { PainelFiltros } from '@/components/features/busca/PainelFiltros';
import { ChipsFiltrosAtivos } from '@/components/features/busca/ChipsFiltrosAtivos';
import { Skeleton } from '@/components/ui/Skeleton';
import { Alerta } from '@/components/ui/Alerta';
import { buscarPostos } from '@/application/use-cases/buscar-postos';
import { listarFacetas } from '@/application/use-cases/listar-facetas';
import {
  postosRepository,
  favoritosRepository,
  facetasRepository,
  desconformidadesRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { TermoBuscaInvalido } from '@/domain/errors';

export const dynamic = 'force-dynamic';

interface PageProps {
  searchParams: Promise<{
    q?: string;
    pagina?: string;
    ugrhi?: string;
    municipio?: string;
    bacia?: string;
    tipo?: string;
    tem_fd?: string;
    tem_fi?: string;
    tem_telem?: string;
    favoritos?: string;
  }>;
}

async function Resultados(props: {
  termo: string;
  pagina: number;
  ugrhi?: string;
  municipio?: string;
  bacia?: string;
  tipo?: string;
  temFd: boolean;
  temFi: boolean;
  temTelem: boolean;
  apenasFavoritos: boolean;
}) {
  const usuario = await obterUsuarioAtual();
  try {
    const { itens, total } = await buscarPostos(postosRepository, {
      termo: props.termo,
      pagina: props.pagina,
      ugrhiNumero: props.ugrhi,
      municipio: props.municipio,
      baciaHidrografica: props.bacia,
      tipoPosto: props.tipo,
      temFichaDescritiva: props.temFd,
      temFichaInspecao: props.temFi,
      temTelemetrico: props.temTelem,
      apenasFavoritos: props.apenasFavoritos,
      usuarioId: usuario?.id ?? null,
    });

    let prefixosFavoritos = new Set<string>();
    if (usuario) {
      try {
        prefixosFavoritos = await favoritosRepository.prefixosFavoritos(usuario.id);
      } catch {
        /* ignora */
      }
    }

    return (
      <ListaResultados
        itens={itens}
        total={total}
        termo={props.termo}
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
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function QuickLinks({
  autenticado,
  totalFavoritos,
  totalDesconformidades,
}: {
  autenticado: boolean;
  totalFavoritos: number;
  totalDesconformidades: number;
}) {
  return (
    <section aria-labelledby="acesso-rapido" className="space-y-3">
      <h2
        id="acesso-rapido"
        className="text-sm font-semibold text-gov-muted uppercase tracking-wider"
      >
        Acesso rápido
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          href="/desconformidades"
          className="block p-4 bg-white border border-gov-borda rounded-gov-card shadow-gov-card hover:shadow-gov-card-hover transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
        >
          <p className="text-xs uppercase tracking-wider text-gov-muted">Curadoria</p>
          <p className="mt-1 text-base font-semibold text-gov-texto">
            Desconformidades cadastrais
          </p>
          <p className="mt-2 text-sm text-gov-muted">
            {totalDesconformidades.toLocaleString('pt-BR')} casos registrados
          </p>
        </Link>

        {autenticado ? (
          <Link
            href="/favoritos"
            className="block p-4 bg-white border border-gov-borda rounded-gov-card shadow-gov-card hover:shadow-gov-card-hover transition-shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul"
          >
            <p className="text-xs uppercase tracking-wider text-gov-muted">
              Atalho pessoal
            </p>
            <p className="mt-1 text-base font-semibold text-gov-texto">
              Meus favoritos
            </p>
            <p className="mt-2 text-sm text-gov-muted">
              {totalFavoritos.toLocaleString('pt-BR')} postos marcados
            </p>
          </Link>
        ) : null}

        <div className="block p-4 bg-gov-superficie-2 border border-gov-borda rounded-gov-card">
          <p className="text-xs uppercase tracking-wider text-gov-muted">Dica</p>
          <p className="mt-1 text-base font-semibold text-gov-texto">
            Busca por prefixo
          </p>
          <p className="mt-2 text-sm text-gov-muted">
            Digite <code className="font-mono">1D-008</code>,{' '}
            <code className="font-mono">2D</code> ou{' '}
            <code className="font-mono">Guaratinguetá</code> pra começar.
          </p>
        </div>
      </div>
    </section>
  );
}

export default async function Home({ searchParams }: PageProps) {
  const sp = await searchParams;
  const termo = (sp.q ?? '').trim();
  const pagina = Math.max(1, Number(sp.pagina ?? 1));

  const ugrhi = sp.ugrhi || undefined;
  const municipio = sp.municipio || undefined;
  const bacia = sp.bacia || undefined;
  const tipo = sp.tipo || undefined;
  const temFd = sp.tem_fd === '1';
  const temFi = sp.tem_fi === '1';
  const temTelem = sp.tem_telem === '1';
  const apenasFavoritos = sp.favoritos === '1';

  const temAlgumFiltro =
    termo.length > 0 ||
    Boolean(ugrhi) ||
    Boolean(municipio) ||
    Boolean(bacia) ||
    Boolean(tipo) ||
    temFd ||
    temFi ||
    temTelem ||
    apenasFavoritos;

  const [facetas, usuario] = await Promise.all([
    listarFacetas(facetasRepository),
    obterUsuarioAtual(),
  ]);

  let totalFavoritos = 0;
  let totalDesconformidades = 0;
  if (!temAlgumFiltro) {
    if (usuario) {
      try {
        totalFavoritos = await favoritosRepository.contar(usuario.id);
      } catch {
        /* ignora */
      }
    }
    try {
      const c = await desconformidadesRepository.contar();
      totalDesconformidades = c.prefixoPrincipal + c.prefixoAna;
    } catch {
      /* ignora */
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-display font-bold text-gov-texto">
          Consultar postos hidrológicos
        </h1>
        <p className="mt-1 text-gov-muted">
          Busque por prefixo, nome, município, bacia ou UGRHI. Combine filtros
          para refinar.
        </p>
      </header>

      <CampoBusca />

      <ChipsFiltrosAtivos mostrarFavoritos={Boolean(usuario)} />

      <details className="bg-white border border-gov-borda rounded-gov-card shadow-gov-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gov-texto hover:bg-gov-superficie rounded-gov-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gov-azul">
          Filtros avançados
        </summary>
        <div className="border-t border-gov-borda p-4">
          <PainelFiltros
            facetas={facetas}
            valores={{
              q: termo,
              ugrhi,
              municipio,
              bacia,
              tipo,
              tem_fd: temFd,
              tem_fi: temFi,
              tem_telem: temTelem,
              favoritos: apenasFavoritos,
            }}
            mostrarFavoritos={Boolean(usuario)}
          />
        </div>
      </details>

      {temAlgumFiltro ? (
        <Suspense fallback={<SkeletonResultados />}>
          <Resultados
            termo={termo}
            pagina={pagina}
            ugrhi={ugrhi}
            municipio={municipio}
            bacia={bacia}
            tipo={tipo}
            temFd={temFd}
            temFi={temFi}
            temTelem={temTelem}
            apenasFavoritos={apenasFavoritos}
          />
        </Suspense>
      ) : (
        <QuickLinks
          autenticado={Boolean(usuario)}
          totalFavoritos={totalFavoritos}
          totalDesconformidades={totalDesconformidades}
        />
      )}
    </div>
  );
}

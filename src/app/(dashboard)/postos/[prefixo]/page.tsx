import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { Suspense } from 'react';
import { FichaPosto } from '@/components/features/ficha/FichaPosto';
import { ListaArquivos } from '@/components/features/arquivos/ListaArquivos';
import { Alerta } from '@/components/ui/Alerta';
import { Skeleton } from '@/components/ui/Skeleton';
import { obterFicha } from '@/application/use-cases/obter-ficha';
import { listarArquivosAgrupados } from '@/application/use-cases/listar-arquivos-agrupados';
import {
  postosRepository,
  arquivosRepository,
  auditoriaRepository,
} from '@/infrastructure/repositories';
import { PostoNaoEncontrado } from '@/domain/errors';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ prefixo: string }>;
}

async function BlocoArquivos({ prefixo }: { prefixo: string }) {
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent');

  try {
    const { grupos, total, prefixoJaIndexado } = await listarArquivosAgrupados(
      arquivosRepository,
      auditoriaRepository,
      { prefixo, ip, userAgent, usuarioId: null },
    );
    return (
      <ListaArquivos
        grupos={grupos}
        total={total}
        prefixoJaIndexado={prefixoJaIndexado}
      />
    );
  } catch {
    return (
      <Alerta tipo="erro" titulo="Falha ao listar arquivos">
        Não foi possível carregar os arquivos indexados. Tente novamente em instantes.
      </Alerta>
    );
  }
}

export default async function PaginaPosto({ params }: PageProps) {
  const { prefixo: prefixoRaw } = await params;
  const prefixo = decodeURIComponent(prefixoRaw);

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent');

  try {
    const posto = await obterFicha(postosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: null,
    });

    return (
      <div className="space-y-8">
        <nav aria-label="Breadcrumb">
          <Link href="/" className="text-gov-azul hover:underline">
            &larr; Voltar à busca
          </Link>
        </nav>

        <header>
          <p className="text-sm text-gov-muted">Prefixo</p>
          <h1 className="font-mono text-2xl font-bold text-gov-azul">{posto.prefixo}</h1>
        </header>

        <FichaPosto posto={posto} />

        <section aria-labelledby="sec-arquivos" className="space-y-3">
          <h2
            id="sec-arquivos"
            className="text-lg font-semibold text-gov-texto border-b border-gov-borda pb-1"
          >
            Arquivos do posto
          </h2>
          <p className="text-sm text-gov-muted">
            Os arquivos são agrupados pelos tipos oficiais de documento
            (Ficha Descritiva, PCD, Inspeção, Nivelamento, Levantamento de Seção,
            Troca de Observador, Vazão). Dentro de cada grupo, a ordenação é
            por data do documento, decrescente.
          </p>
          <Suspense fallback={<Skeleton className="h-32 w-full" />}>
            <BlocoArquivos prefixo={posto.prefixo} />
          </Suspense>
        </section>
      </div>
    );
  } catch (e) {
    if (e instanceof PostoNaoEncontrado) {
      notFound();
    }
    return (
      <Alerta tipo="erro" titulo="Falha ao carregar ficha do posto">
        Não foi possível carregar os dados. Tente novamente em instantes.
      </Alerta>
    );
  }
}

import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import {
  postosRepository,
  auditoriaRepository,
  fichasVisitaRepository,
} from '@/infrastructure/repositories';
import { obterFicha } from '@/application/use-cases/obter-ficha';
import { obterFichaVisita } from '@/application/use-cases/fichas-visita';
import { obterSchema } from '@/domain/fichas/schemas';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { TemplateImpressao } from '@/components/features/fichas/TemplateImpressao';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ prefixo: string; id: string }>;
  searchParams: Promise<{ auto?: string }>;
}

export default async function ImprimirFichaPage({
  params,
  searchParams,
}: PageProps) {
  const [{ prefixo: prefixoRaw, id }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  const prefixo = decodeURIComponent(prefixoRaw);

  const ficha = await obterFichaVisita(fichasVisitaRepository, id);
  if (!ficha || ficha.prefixo !== prefixo) notFound();

  const schema = obterSchema(ficha.codTipoDocumento);

  // Carrega o posto (compartilha o mesmo use case da ficha do posto pra
  // garantir audit trail consistente). `obter-ficha` é o nome do use case
  // de POSTO, não da ficha de visita — não confundir.
  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent');
  const usuario = await obterUsuarioAtual();

  const posto = await obterFicha(postosRepository, auditoriaRepository, {
    prefixo,
    ip,
    userAgent,
    usuarioId: usuario?.id ?? null,
  });

  return (
    <TemplateImpressao
      ficha={ficha}
      posto={posto}
      schema={schema}
      imprimirAoCarregar={sp.auto === '1'}
    />
  );
}

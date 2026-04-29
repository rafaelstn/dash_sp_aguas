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

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function ImprimirFichaPage({
  params,
  searchParams,
}: PageProps) {
  const [{ prefixo: prefixoRaw, id }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  let prefixo: string;
  try {
    prefixo = decodeURIComponent(prefixoRaw);
  } catch {
    notFound();
  }
  if (!UUID_REGEX.test(id)) notFound();

  let ficha: Awaited<ReturnType<typeof obterFichaVisita>>;
  try {
    ficha = await obterFichaVisita(fichasVisitaRepository, id);
  } catch (e) {
    console.error('[fichas/imprimir] Falha ao obter ficha', { id, prefixo, e });
    throw e;
  }
  if (!ficha || ficha.prefixo !== prefixo) notFound();

  const schema = obterSchema(ficha.codTipoDocumento);

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;
  const userAgent = h.get('user-agent');
  const usuario = await obterUsuarioAtual();

  let posto: Awaited<ReturnType<typeof obterFicha>>;
  try {
    posto = await obterFicha(postosRepository, auditoriaRepository, {
      prefixo,
      ip,
      userAgent,
      usuarioId: usuario?.id ?? null,
    });
  } catch (e) {
    console.error('[fichas/imprimir] Falha ao obter posto', { prefixo, e });
    throw e;
  }

  return (
    <TemplateImpressao
      ficha={ficha}
      posto={posto}
      schema={schema}
      imprimirAoCarregar={sp.auto === '1'}
    />
  );
}

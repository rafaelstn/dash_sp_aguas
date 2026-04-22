import 'server-only';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { revisoesRepository } from '@/infrastructure/repositories';
import { marcarRevisaoDesconformidade } from '@/application/use-cases/marcar-revisao-desconformidade';
import type { CategoriaDesconformidade } from '@/domain/desconformidade';
import type { TipoEntidadeRevisada } from '@/domain/revisao-desconformidade';

export const dynamic = 'force-dynamic';

interface Payload {
  tipoEntidade: TipoEntidadeRevisada;
  idEntidade: string;
  categoria: CategoriaDesconformidade;
  nota?: string | null;
}

const CATEGORIAS_VALIDAS: readonly CategoriaDesconformidade[] = [
  'PREFIXO_PRINCIPAL',
  'PREFIXO_ANA',
  'ARQUIVO_ORFAO',
  'ARQUIVO_MALFORMADO',
];

const TIPOS_VALIDOS: readonly TipoEntidadeRevisada[] = ['posto', 'arquivo'];

function validar(body: unknown): Payload | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.tipoEntidade !== 'string' || !TIPOS_VALIDOS.includes(b.tipoEntidade as TipoEntidadeRevisada)) return null;
  if (typeof b.idEntidade !== 'string' || b.idEntidade.trim() === '') return null;
  if (typeof b.categoria !== 'string' || !CATEGORIAS_VALIDAS.includes(b.categoria as CategoriaDesconformidade)) return null;
  if (b.nota !== undefined && b.nota !== null && typeof b.nota !== 'string') return null;
  return {
    tipoEntidade: b.tipoEntidade as TipoEntidadeRevisada,
    idEntidade: b.idEntidade.trim(),
    categoria: b.categoria as CategoriaDesconformidade,
    nota: typeof b.nota === 'string' ? b.nota.trim() : null,
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ erro: 'corpo_invalido' }, { status: 400 });
  }

  const payload = validar(body);
  if (!payload) {
    return NextResponse.json({ erro: 'payload_invalido' }, { status: 400 });
  }

  const h = await headers();
  const ip =
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    h.get('x-real-ip') ??
    null;

  try {
    const revisao = await marcarRevisaoDesconformidade(revisoesRepository, {
      tipoEntidade: payload.tipoEntidade,
      idEntidade: payload.idEntidade,
      categoria: payload.categoria,
      nota: payload.nota,
      ip,
    });
    return NextResponse.json({ revisao }, { status: 200 });
  } catch {
    return NextResponse.json({ erro: 'falha_interna' }, { status: 500 });
  }
}

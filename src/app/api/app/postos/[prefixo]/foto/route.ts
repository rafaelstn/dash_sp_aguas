import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  fotoStorageGateway,
  postosFotosRepository,
  postosRepository,
} from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  obterCapaPosto,
  registrarFotoCapa,
} from '@/application/use-cases/foto-posto';
import { DadosInvalidos } from '@/domain/errors';
import {
  POLITICAS,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Foto de capa do posto.
 *   GET  → capa atual (signed URL + data + se precisa atualizar).
 *   POST → registra nova capa a partir de um data URL JPEG.
 * Auth: qualquer usuário autenticado.
 */

// Teto de chars: 5 MB binário viram ~6,67 MB em base64; com folga pro prefixo
// do data URL ficamos em 7 MB. Barra ANTES de o regex varrer um base64 gigante
// e antes de materializar/decodificar o conteúdo (o cap real de 5 MB em bytes
// continua no use-case, depois do decode).
const MAX_CHARS_DATA_URL = 7 * 1024 * 1024;

const corpoSchema = z.object({
  fotoDataUrl: z
    .string()
    .max(MAX_CHARS_DATA_URL, 'foto excede o tamanho máximo')
    .regex(/^data:image\/(jpeg|jpg|png|webp);base64,/, 'data URL de imagem inválido'),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ prefixo: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }
  const { prefixo } = await params;
  try {
    const capa = await obterCapaPosto(
      postosFotosRepository,
      fotoStorageGateway,
      decodeURIComponent(prefixo),
    );
    return NextResponse.json(capa);
  } catch {
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao obter a foto do posto.' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ prefixo: string }> },
) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json({ erro: 'nao_autenticado' }, { status: 401 });
  }

  const ip = extrairIp(request);
  const rl = consumirRateLimit(POLITICAS.submeterFicha, usuario.id);
  const rlIp = consumirRateLimit(POLITICAS.submeterFichaIp, ip);
  if (!rl.permitido || !rlIp.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente novamente.' },
      { status: 429 },
    );
  }

  const { prefixo } = await params;

  let corpoBruto: unknown;
  try {
    corpoBruto = await request.json();
  } catch {
    return NextResponse.json(
      { erro: 'json_invalido', mensagem: 'Body deve ser JSON válido.' },
      { status: 400 },
    );
  }

  const parseado = corpoSchema.safeParse(corpoBruto);
  if (!parseado.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parseado.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400 },
    );
  }

  const prefixoDecodificado = decodeURIComponent(prefixo);

  // Confirma que o posto existe antes de subir ao Storage: evita arquivo
  // órfão no bucket caso o prefixo seja inválido (a FK barraria só no INSERT).
  const posto = await postosRepository.buscarPorPrefixo(prefixoDecodificado);
  if (!posto) {
    return NextResponse.json(
      { erro: 'posto_nao_encontrado', mensagem: 'Posto não encontrado.' },
      { status: 404 },
    );
  }

  try {
    const foto = await registrarFotoCapa(postosFotosRepository, fotoStorageGateway, {
      prefixo: prefixoDecodificado,
      fotoDataUrl: parseado.data.fotoDataUrl,
      tiradaPor: usuario.id,
    });
    return NextResponse.json(
      { id: foto.id, prefixo: foto.prefixo, tiradaEm: foto.tiradaEm },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof DadosInvalidos) {
      return NextResponse.json({ erro: 'foto_invalida', mensagem: e.message }, { status: 400 });
    }
    return NextResponse.json(
      { erro: 'erro_interno', mensagem: 'Falha ao salvar a foto do posto.' },
      { status: 500 },
    );
  }
}

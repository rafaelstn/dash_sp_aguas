import { NextResponse, type NextRequest } from 'next/server';
import { buscarPostos } from '@/application/use-cases/buscar-postos';
import { postosRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import { TermoBuscaInvalido } from '@/domain/errors';
import type { RespostaBusca, RespostaErro } from '@/types/dto';

function bool(valor: string | null): boolean | undefined {
  if (valor === null) return undefined;
  if (valor === '1' || valor === 'true') return true;
  if (valor === '0' || valor === 'false') return false;
  return undefined;
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const termo = sp.get('q') ?? undefined;
  const paginaParsed = Number(sp.get('pagina') ?? 1);
  const porPaginaParsed = Number(sp.get('porPagina') ?? 25);
  // Sem isFinite vira NaN propagado pro OFFSET, gerando comportamento
  // imprevisivel no postgres.js. Clamp em range razoavel evita DOS por
  // porPagina absurdo.
  const pagina = Number.isFinite(paginaParsed) && paginaParsed >= 1
    ? Math.floor(paginaParsed)
    : 1;
  const porPagina = Number.isFinite(porPaginaParsed) && porPaginaParsed >= 1
    ? Math.min(100, Math.floor(porPaginaParsed))
    : 25;

  const ugrhiNumero = sp.get('ugrhi') ?? undefined;
  const municipio = sp.get('municipio') ?? undefined;
  const baciaHidrografica = sp.get('bacia') ?? undefined;
  const tipoPosto = sp.get('tipo') ?? undefined;
  // `tem_fd` e `tem_fi` saíram em 03/09/2026 com os campos que liam, que não
  // têm origem no `Dbfch`. Quem mandar os parâmetros antigos recebe a busca sem
  // eles, e não uma lista vazia: parâmetro desconhecido nunca restringiu nada
  // nesta rota, e passar a restringir agora seria mudar a resposta em silêncio.
  const temTelemetrico = bool(sp.get('tem_telem'));
  const apenasFavoritos = bool(sp.get('favoritos'));

  const usuario = apenasFavoritos ? await obterUsuarioAtual() : null;

  try {
    const { total, itens } = await buscarPostos(postosRepository, {
      termo,
      ugrhiNumero,
      municipio,
      baciaHidrografica,
      tipoPosto,
      temTelemetrico,
      apenasFavoritos,
      usuarioId: usuario?.id ?? null,
      pagina,
      porPagina,
    });
    const body: RespostaBusca = { total, pagina, porPagina, itens };
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof TermoBuscaInvalido) {
      const body: RespostaErro = {
        erro: { codigo: 'TERMO_INVALIDO', mensagem: e.message },
      };
      return NextResponse.json(body, { status: 400 });
    }
    const body: RespostaErro = {
      erro: { codigo: 'ERRO_INTERNO', mensagem: 'Falha ao consultar postos.' },
    };
    return NextResponse.json(body, { status: 500 });
  }
}

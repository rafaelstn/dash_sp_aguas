import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { exigirUsuario } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { listarPontosMapa } from '@/application/use-cases/listar-pontos-mapa';
import {
  OPCOES_VAZAO,
  SEM_VALOR,
  SITUACOES_POSTO,
  TIPOS_POSTO_MAPA,
  TRANSMISSOES,
} from '@/domain/mapa-postos';
import { mapaPostosRepository } from '@/infrastructure/repositories';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Número de UGRHIs do Estado de São Paulo. */
const UGRHI_MAXIMA = 22;

/**
 * Valores de um parâmetro de múltipla escolha. Aceita a chave repetida
 * (`?tipo=plu&tipo=flu`) e a lista por vírgula (`?tipo=plu,flu`), e as duas
 * formas juntas. Sem valor nenhum, o filtro não existe (`undefined`).
 */
function multiplos(sp: URLSearchParams, chave: string): string[] | undefined {
  const valores = sp
    .getAll(chave)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return valores.length > 0 ? [...new Set(valores)] : undefined;
}

function booleano(valor: string | null): boolean | undefined {
  if (valor === null) return undefined;
  return valor === '1' || valor === 'true';
}

const textoOpcional = z.string().trim().min(1).max(120).optional();

/**
 * Dimensão que aceita `sem` (o valor ausente) além do valor normal.
 *
 * O `z.union` descarta as mensagens dos ramos e reporta um `invalid_union`
 * cru: `uf=SPX` respondia `"uf.0: Invalid input"`, em inglês, numa API de
 * órgão público. O `errorMap` do próprio union é o que sobrevive à união, e é
 * por isso que a frase útil mora aqui e não dentro de cada ramo.
 */
function ouSemValor<T extends z.ZodTypeAny>(valor: T, mensagem: string) {
  return z.union([z.literal(SEM_VALOR).transform(() => null), valor], {
    errorMap: () => ({ message: mensagem }),
  });
}

/**
 * Número de UGRHI como texto de dígitos, nunca por `z.coerce.number()`.
 *
 * A coerção passa pelo `Number()`, que aceita hexadecimal, notação científica
 * e sinal: `ugrhi=0x10` respondia 200 filtrando pela UGRHI 16, e `ugrhi=1e1`
 * pela 10, contrariando o "1 a 22" que esta mesma rota documenta. O cliente já
 * validava assim em `estado-url.ts`.
 */
const numeroUgrhi = z
  .string()
  .regex(/^\d{1,2}$/)
  .transform(Number)
  .pipe(z.number().int().min(1).max(UGRHI_MAXIMA));

const querySchema = z.object({
  q: z.string().trim().max(60).optional(),
  municipio: textoOpcional,
  bacia: textoOpcional,
  mantenedor: textoOpcional,
  favoritos: z.boolean().optional(),
  tipo: z.array(z.enum(TIPOS_POSTO_MAPA)).optional(),
  situacao: z.array(z.enum(SITUACOES_POSTO)).optional(),
  transmissao: z.array(z.enum(TRANSMISSOES)).optional(),
  vazao: z.array(z.enum(OPCOES_VAZAO)).optional(),
  ugrhi: z
    .array(ouSemValor(numeroUgrhi, `número de UGRHI, de 1 a ${UGRHI_MAXIMA}, ou "sem"`))
    .optional(),
  uf: z
    .array(
      ouSemValor(
        z
          .string()
          .regex(/^[A-Za-z]{2}$/)
          .transform((v) => v.toUpperCase()),
        'sigla de UF com duas letras, ou "sem"',
      ),
    )
    .optional(),
});

/**
 * GET /api/postos/mapa
 *
 * TODOS os postos que casam com o filtro, sem paginação, em formato enxuto
 * para desenhar o mapa, com as facetas em contagem cruzada (cada dimensão
 * conta ignorando o próprio filtro e respeitando os outros).
 *
 * Query (todos opcionais):
 *   q            termo livre ou código de posto (mesma regra da busca)
 *   municipio, bacia, mantenedor   igualdade, como na busca
 *   favoritos    `1` ou `true`
 *   tipo         plu, flu, piezo, meteo
 *   situacao     em_operacao, extinto
 *   transmissao  telemetrico, gravacao_local, convencional
 *   vazao        aparelho_ativo, medicao, curva, qualquer
 *   ugrhi        1 a 22, ou `sem` para os postos sem UGRHI
 *   uf           sigla de duas letras (SP, PR, MG...), ou `sem` para os postos
 *                sem UF declarada. O `Dbfch` tem postos de outros estados: a
 *                tela que quer só a rede paulista pede `uf=SP`
 * Múltipla escolha: chave repetida ou lista por vírgula. Dentro da dimensão
 * vale OU, entre dimensões vale E. Valor desconhecido responde 400.
 */
export async function GET(request: NextRequest) {
  const auth = await exigirUsuario();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const headers = new Headers();
  const rl = consumirRateLimit(POLITICAS.leituraMonitor, usuario.id);
  aplicarHeadersRateLimit(headers, POLITICAS.leituraMonitor, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limit', mensagem: 'Muitas requisições. Tente em instantes.' },
      { status: 429, headers },
    );
  }

  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    q: sp.get('q') ?? undefined,
    municipio: sp.get('municipio') ?? undefined,
    bacia: sp.get('bacia') ?? undefined,
    mantenedor: sp.get('mantenedor') ?? undefined,
    favoritos: booleano(sp.get('favoritos')),
    tipo: multiplos(sp, 'tipo'),
    situacao: multiplos(sp, 'situacao'),
    transmissao: multiplos(sp, 'transmissao'),
    vazao: multiplos(sp, 'vazao'),
    ugrhi: multiplos(sp, 'ugrhi'),
    uf: multiplos(sp, 'uf'),
  });
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'query_invalida',
        motivos: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }

  if (mapaPostosRepository === null) {
    return NextResponse.json(
      {
        erro: 'origem_indisponivel',
        mensagem:
          'O mapa de postos vem do banco do órgão, que não está configurado neste ambiente.',
      },
      { status: 501, headers },
    );
  }

  const q = parsed.data;
  try {
    const inicio = Date.now();
    const resultado = await listarPontosMapa(mapaPostosRepository, {
      termo: q.q,
      municipio: q.municipio,
      baciaHidrografica: q.bacia,
      mantenedor: q.mantenedor,
      apenasFavoritos: q.favoritos,
      usuarioId: usuario.id,
      tipo: q.tipo,
      situacao: q.situacao,
      transmissao: q.transmissao,
      vazao: q.vazao,
      ugrhi: q.ugrhi,
      uf: q.uf,
    });

    logger.info(
      'postos.mapa.listar',
      {
        usuarioId: usuario.id,
        total: resultado.total,
        semCoordenada: resultado.semCoordenada,
        filtros: {
          termo: q.q !== undefined && q.q.length > 0,
          tipo: q.tipo,
          situacao: q.situacao,
          transmissao: q.transmissao,
          vazao: q.vazao,
          ugrhi: q.ugrhi,
          uf: q.uf,
          favoritos: q.favoritos === true,
        },
        duracaoMs: Date.now() - inicio,
      },
      'Pontos do mapa de postos listados',
    );

    return NextResponse.json(resultado, { status: 200, headers });
  } catch (e) {
    return respostaDeErro('GET /api/postos/mapa', { usuarioId: usuario.id }, e);
  }
}

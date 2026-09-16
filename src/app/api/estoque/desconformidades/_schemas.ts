import { z } from 'zod';
import {
  NOTA_DESCONFORMIDADE_MAX,
  NOTA_DESCONFORMIDADE_MIN,
} from '@/domain/estoque/desconformidade';

/**
 * Validação de borda da aba "Desconformidades". As listas literais abaixo têm
 * paridade com o domínio garantida por teste
 * (tests/unit/api/estoque-desconformidades-schemas.test.ts).
 */

export const tipoDesconformidadeEnum = z.enum([
  'item_sem_descricao',
  'chave_repetida',
  'identificador_repetido',
  'leitura_diferente_do_codigo',
  'descricao_suspeita',
  'quantidade_vazia',
  'coluna_sem_cabecalho',
]);

export const statusDesconformidadeEnum = z.enum(['aberta', 'resolvida', 'ignorada']);

/** Querystring vazia (`?status=`) vale como ausente: a tela manda "todos" assim. */
const vazioComoAusente = (v: unknown) => (v === '' || v === null ? undefined : v);

const inteiroDaQuery = (padrao: number, max: number) =>
  z.preprocess(
    vazioComoAusente,
    z.coerce
      .number({ message: 'deve ser um número inteiro' })
      .int('deve ser um número inteiro')
      .min(1, 'deve ser no mínimo 1')
      .max(max, `deve ser no máximo ${max}`)
      .default(padrao),
  );

export const listarDesconformidadesQuerySchema = z.object({
  status: z.preprocess(vazioComoAusente, statusDesconformidadeEnum.optional()),
  tipo: z.preprocess(vazioComoAusente, tipoDesconformidadeEnum.optional()),
  pagina: inteiroDaQuery(1, 100_000),
  porPagina: inteiroDaQuery(50, 200),
});

export const decidirDesconformidadeSchema = z
  .object({
    status: statusDesconformidadeEnum,
    nota: z.string({ message: 'a nota deve ser texto' }).trim().nullish(),
    unidadeId: z.string().uuid('unidadeId deve ser um identificador válido').nullish(),
    // Status que a tela mostrava quando a pessoa decidiu. Presente, o servidor
    // recusa com 409 se o banco já tiver outro (decisão concorrente).
    statusEsperado: statusDesconformidadeEnum.optional(),
  })
  // Tamanho só se cobra de quem decide: reabrir descarta nota e unidade enviadas
  // (montarDecisao), então não recusa por causa delas. O trim vem antes da conta.
  .superRefine((d, ctx) => {
    if (d.status === 'aberta') return;
    if (!d.nota) {
      ctx.addIssue({
        code: 'custom',
        path: ['nota'],
        message: 'a nota é obrigatória para resolver ou ignorar',
      });
    } else if (d.nota.length < NOTA_DESCONFORMIDADE_MIN) {
      ctx.addIssue({
        code: 'custom',
        path: ['nota'],
        message: `a nota deve ter no mínimo ${NOTA_DESCONFORMIDADE_MIN} caracteres`,
      });
    } else if (d.nota.length > NOTA_DESCONFORMIDADE_MAX) {
      ctx.addIssue({
        code: 'custom',
        path: ['nota'],
        message: `a nota deve ter no máximo ${NOTA_DESCONFORMIDADE_MAX} caracteres`,
      });
    }
  });

/** Uma frase legível a partir das issues do zod, para `{ erro, mensagem }`. */
export function mensagemZod(erro: z.ZodError): string {
  return erro.issues
    .map((i) => (i.path.length > 0 ? `${i.path.join('.')}: ${i.message}` : i.message))
    .join('; ');
}

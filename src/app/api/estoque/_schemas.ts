import { z } from 'zod';

/**
 * Schemas zod compartilhados pelas rotas do modulo Estoque. Zod valida a FORMA
 * do input (tipos, enums, obrigatoriedade estrutural); as regras de negocio que
 * dependem do estado no banco (transicao de status, saldo, XOR do alvo) vivem no
 * dominio/use-case e sao validadas la (mesma divisao do resto do projeto).
 */

export const naturezaEnum = z.enum(['serializado', 'quantificavel']);
export const estadoEnum = z.enum(['novo', 'bom', 'usado', 'defeito', 'sucata']);
export const statusEnum = z.enum(['ativo', 'defeito', 'descarte']);
export const unidadeFisicaEnum = z.enum(['PENHA', 'ARARAQUARA']);
export const tipoMovEnum = z.enum(['entrada', 'saida', 'transferencia', 'baixa', 'ajuste']);

const textoOpcional = z.string().trim().max(200).nullish();
const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data deve ser YYYY-MM-DD')
  .nullish();

// ── Material ────────────────────────────────────────────────────────────────
export const materialCriarSchema = z.object({
  descricao: z.string().trim().min(1).max(300),
  marca: z.string().trim().max(120).nullish(),
  modelo: z.string().trim().max(120).nullish(),
  natureza: naturezaEnum,
  unidadeMedida: z.string().trim().max(20).nullish(),
  categoriaId: z.string().uuid().nullish(),
  // Estoque minimo (nivel de reposicao). null limpa o minimo; ausente = nao mexe.
  // So faz sentido em quantificavel; nao bloqueia em serializado (fica ignorado).
  quantidadeMinima: z.number().int().min(0).nullable().optional(),
  ativo: z.boolean().optional(),
});
export const materialPatchSchema = materialCriarSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo.' });

// ── Unidade serializada ──────────────────────────────────────────────────────
export const unidadeCriarSchema = z.object({
  descricao: z.string().trim().min(1).max(300),
  materialId: z.string().uuid().nullish(),
  codigo: textoOpcional,
  codigoSpaguas: textoOpcional,
  patDaee: textoOpcional,
  outrosPat: textoOpcional,
  numeroSerie: textoOpcional,
  helice: textoOpcional,
  marca: z.string().trim().max(120).nullish(),
  modelo: z.string().trim().max(120).nullish(),
  estado: estadoEnum.nullish(),
  status: statusEnum.optional(),
  localId: z.string().uuid().nullish(),
  dataAquisicao: dataISO,
  observacao: z.string().trim().max(2000).nullish(),
});
export const unidadePatchSchema = unidadeCriarSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo.' });

// ── Local ────────────────────────────────────────────────────────────────────
export const localCriarSchema = z.object({
  unidade: unidadeFisicaEnum,
  sala: textoOpcional,
  prateleira: textoOpcional,
  armario: textoOpcional,
  observacao: z.string().trim().max(2000).nullish(),
});
export const localPatchSchema = localCriarSchema
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: 'Informe ao menos um campo.' });

// ── Categoria ────────────────────────────────────────────────────────────────
export const categoriaSchema = z.object({
  nome: z.string().trim().min(1).max(120),
});

// ── Movimentacao (nucleo): discriminated union por tipo ──────────────────────
// XOR do alvo (unidadeId/materialId) e obrigatoriedade de local por natureza sao
// validados no dominio (resolverAlvo / validarComandoEstrutural).
const alvoBase = {
  unidadeId: z.string().uuid().optional(),
  materialId: z.string().uuid().optional(),
  quantidade: z.number().int().min(1).max(1_000_000).default(1),
  tamanho: z.string().trim().min(1).max(60).optional(),
};

export const movimentacaoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('entrada'), ...alvoBase, localDestino: z.string().uuid() }),
  z.object({ tipo: z.literal('saida'), ...alvoBase, localOrigem: z.string().uuid() }),
  z.object({
    tipo: z.literal('transferencia'),
    ...alvoBase,
    localOrigem: z.string().uuid(),
    localDestino: z.string().uuid(),
  }),
  z.object({
    tipo: z.literal('baixa'),
    ...alvoBase,
    motivo: z.string().trim().min(3).max(500),
    localOrigem: z.string().uuid().optional(),
  }),
  z.object({
    tipo: z.literal('ajuste'),
    ...alvoBase,
    motivo: z.string().trim().min(3).max(500),
    estado: estadoEnum.optional(),
    status: statusEnum.optional(),
    localDestino: z.string().uuid().optional(),
  }),
]);

/** Parse tolerante de paginacao a partir de querystring. */
export function lerPaginacao(sp: URLSearchParams): { pagina: number; porPagina: number } {
  const pagina = Math.max(Number(sp.get('pagina') ?? '1') || 1, 1);
  const porPagina = Math.min(Math.max(Number(sp.get('porPagina') ?? '50') || 50, 1), 200);
  return { pagina, porPagina };
}

/** Formata issues do zod no mesmo formato `motivos: string[]` do projeto. */
export function motivosZod(erro: z.ZodError): string[] {
  return erro.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

import { z } from 'zod';
import { naturezaEnum, unidadeFisicaEnum } from '../_schemas';

/**
 * Schemas zod das rotas de conferencia fisica (inventario, ADR 0021). Zod valida
 * a FORMA (tipos, enums, obrigatoriedade estrutural); as regras que dependem do
 * estado no banco (sessao aberta/concluida, natureza do item, escopo em aberto)
 * vivem no dominio/use-case/repositorio. Reusa `naturezaEnum`/`unidadeFisicaEnum`
 * do modulo de Estoque.
 */

const observacao = z.string().trim().max(2000).optional();

/**
 * Teto de quantidade, igual ao da movimentacao direta (`_schemas.ts` do modulo).
 * Sem ele a contagem seria o caminho mais frouxo para o mesmo ledger: uma
 * contagem absurda vira ajuste de inventario "auditado", e acima do INTEGER do
 * Postgres estoura em 500 no lugar de 400.
 */
const QUANTIDADE_MAXIMA = 1_000_000;

export const abrirConferenciaSchema = z.object({
  unidade: unidadeFisicaEnum, // PENHA | ARARAQUARA
  natureza: naturezaEnum, // serializado | quantificavel
  localId: z.string().uuid().optional(), // escopo opcional
  observacao,
});

// Contagem: a forma depende da natureza da SESSAO (validada no use-case contra a
// sessao). Serializado usa `situacao`; quantificavel usa `quantidadeContada`.
export const contagemItemSchema = z.union([
  z.object({
    situacao: z.enum(['conferido', 'nao_encontrado', 'encontrado_em_outro_local']),
    localEncontradoId: z.string().uuid().optional(), // exigido se encontrado_em_outro_local
    observacao,
  }),
  z.object({
    quantidadeContada: z.number().int().min(0).max(QUANTIDADE_MAXIMA),
    observacao,
  }),
]);

// Item "sobra" (contado fora do snapshot; alvo JA cadastrado).
export const sobraItemSchema = z.union([
  z.object({
    // serializado: unidade ja cadastrada, encontrada num local
    unidadeId: z.string().uuid(),
    localEncontradoId: z.string().uuid(),
  }),
  z.object({
    // quantificavel: material sem saldo no snapshot
    materialId: z.string().uuid(),
    localId: z.string().uuid(),
    tamanho: z.string().trim().min(1).max(60).optional(),
    quantidadeContada: z.number().int().min(1).max(QUANTIDADE_MAXIMA),
  }),
]);

export const acaoConferenciaSchema = z.object({
  acao: z.enum(['concluir', 'cancelar']),
  observacao,
});

export const reconciliarLoteSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1).max(500), // itens que o almoxarife revisou
});

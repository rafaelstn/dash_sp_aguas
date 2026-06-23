import { z } from 'zod';
import type { ElementoDiagrama } from './tipos';

/**
 * Validação zod dos elementos de um diagrama. O backend nunca confia no array
 * que o editor envia: cada elemento é validado contra o seu tipo antes de
 * persistir no JSONB. Mantido no domínio para servir rota e (futuro) editor.
 *
 * `satisfies` garante em tempo de compilação que o schema produz exatamente o
 * tipo `ElementoDiagrama` do domínio — schema e tipo não podem divergir.
 */

const posicaoSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const limiaresSchema = z.object({
  atencao: z.number().nullable().optional(),
  alerta: z.number().nullable().optional(),
  emergencia: z.number().nullable().optional(),
  extravasamento: z.number().nullable().optional(),
});

const reservatorioSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal('reservatorio'),
  posicao: posicaoSchema,
  nome: z.string().max(200),
});

const nivelSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal('nivel'),
  posicao: posicaoSchema,
  codigo: z.string().max(40),
  nome: z.string().max(200),
  valor: z.number().nullable(),
  unidade: z.string().max(20).nullable().optional(),
  limiares: limiaresSchema,
});

const chuvaSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal('chuva'),
  posicao: posicaoSchema,
  codigo: z.string().max(40),
  nome: z.string().max(200),
  valor: z.number().nullable(),
});

const linhaSchema = z.object({
  id: z.string().min(1),
  tipo: z.literal('linha'),
  posicao: posicaoSchema,
  pontos: z.array(posicaoSchema).min(2),
  label: z.string().max(200).nullable().optional(),
  direcaoSeta: z.enum(['nenhuma', 'direta', 'reversa']),
});

export const elementoSchema = z.discriminatedUnion('tipo', [
  reservatorioSchema,
  nivelSchema,
  chuvaSchema,
  linhaSchema,
]) satisfies z.ZodType<ElementoDiagrama>;

export const elementosSchema = z.array(elementoSchema);

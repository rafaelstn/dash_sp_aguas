import 'server-only';
import type { Unidade } from '@/domain/estoque/unidade';
import type { Estado } from '@/domain/estoque/estado';
import type { Status } from '@/domain/estoque/status-unidade';
import { sql } from './client';

/** Linha crua de `estoque_unidades` (migration 0057). */
export type LinhaUnidadePg = {
  id: string;
  material_id: string | null;
  codigo: string | null;
  codigo_spaguas: string | null;
  pat_daee: string | null;
  outros_pat: string | null;
  numero_serie: string | null;
  helice: string | null;
  descricao: string;
  marca: string | null;
  modelo: string | null;
  estado: Estado | null;
  status: Status;
  local_id: string | null;
  data_aquisicao: Date | string | null;
  observacao: string | null;
  chave_import: string | null;
  criado_em: Date;
  atualizado_em: Date;
};

/** Fragmento de colunas reutilizado pelo repo de unidades e pelo de movimentacao. */
export const COLUNAS_UNIDADE = sql`
  id, material_id, codigo, codigo_spaguas, pat_daee, outros_pat, numero_serie,
  helice, descricao, marca, modelo, estado, status, local_id, data_aquisicao,
  observacao, chave_import, criado_em, atualizado_em
`;

/** Formata DATE (Date ou string do postgres-js) para ISO 'YYYY-MM-DD' sem shift. */
export function formatarDataISO(v: Date | string | null): string | null {
  if (v === null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  const ano = v.getUTCFullYear();
  const mes = String(v.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(v.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

export function mapearUnidadeLinha(l: LinhaUnidadePg): Unidade {
  return {
    id: l.id,
    materialId: l.material_id,
    codigo: l.codigo,
    codigoSpaguas: l.codigo_spaguas,
    patDaee: l.pat_daee,
    outrosPat: l.outros_pat,
    numeroSerie: l.numero_serie,
    helice: l.helice,
    descricao: l.descricao,
    marca: l.marca,
    modelo: l.modelo,
    estado: l.estado,
    status: l.status,
    localId: l.local_id,
    dataAquisicao: formatarDataISO(l.data_aquisicao),
    observacao: l.observacao,
    chaveImport: l.chave_import,
    criadoEm: l.criado_em,
    atualizadoEm: l.atualizado_em,
  };
}

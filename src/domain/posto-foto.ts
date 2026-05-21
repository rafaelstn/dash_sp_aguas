/**
 * Foto de capa de um posto. O histórico fica em `postos_fotos`; a capa exibida
 * é sempre a mais recente por prefixo. O arquivo vive no Supabase Storage e
 * aqui referenciamos pelo `storagePath`.
 */
export interface PostoFoto {
  id: string;
  prefixo: string;
  storagePath: string;
  tiradaEm: Date;
  tiradaPor: string | null;
  criadaEm: Date;
}

/** Idade máxima da foto de capa antes de o app sugerir atualização. */
export const VALIDADE_FOTO_CAPA_DIAS = 365;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Idade da foto em dias inteiros, ou null se não houver foto. */
export function idadeFotoEmDias(
  foto: Pick<PostoFoto, 'tiradaEm'> | null,
  agora: Date = new Date(),
): number | null {
  if (!foto) return null;
  return Math.floor((agora.getTime() - foto.tiradaEm.getTime()) / MS_POR_DIA);
}

/**
 * Decide se o app deve sugerir uma foto atualizada: quando não há foto, ou
 * quando a mais recente passou de `VALIDADE_FOTO_CAPA_DIAS`. Não bloqueia o
 * preenchimento da ficha (sugestão, não obrigação).
 */
export function precisaAtualizarFotoCapa(
  foto: Pick<PostoFoto, 'tiradaEm'> | null,
  agora: Date = new Date(),
): boolean {
  const idade = idadeFotoEmDias(foto, agora);
  return idade === null || idade > VALIDADE_FOTO_CAPA_DIAS;
}

import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getEnv } from '@/infrastructure/config/env';
import { FalhaRepositorio } from '@/domain/errors';

/**
 * Armazenamento da foto de capa do posto no Supabase Storage.
 *
 * Usa a service role key (server-only) para gravar no bucket privado
 * `postos-fotos`. As leituras voltam como signed URL de curta duração, pra
 * não expor o bucket. O Postgres guarda só o `storagePath` (ver migration
 * 0042 e `postos-fotos-repository`).
 */

export const BUCKET_FOTOS_POSTO = 'postos-fotos';
const VALIDADE_SIGNED_URL_S = 60 * 10; // 10 min, suficiente pra render

let clienteAdmin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (clienteAdmin) return clienteAdmin;
  const env = getEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      'Storage indisponível: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.',
    );
  }
  clienteAdmin = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return clienteAdmin;
}

/** Caminho determinístico por posto + timestamp, dentro do bucket. */
export function montarCaminhoFoto(prefixo: string, tiradaEm: Date): string {
  const seguro = prefixo.replace(/[^A-Za-z0-9_-]/g, '_');
  return `${seguro}/${tiradaEm.getTime()}.jpg`;
}

/** Faz upload do JPEG (buffer) e retorna o caminho gravado. */
export async function subirFotoPosto(
  caminho: string,
  conteudo: Buffer,
  contentType = 'image/jpeg',
): Promise<string> {
  const { error } = await admin()
    .storage.from(BUCKET_FOTOS_POSTO)
    .upload(caminho, conteudo, { contentType, upsert: true });
  if (error) throw new FalhaRepositorio('storage.subirFotoPosto', error);
  return caminho;
}

/** Gera signed URL temporária pra exibir a foto; null se o caminho falhar. */
export async function urlAssinadaFotoPosto(caminho: string): Promise<string | null> {
  const { data, error } = await admin()
    .storage.from(BUCKET_FOTOS_POSTO)
    .createSignedUrl(caminho, VALIDADE_SIGNED_URL_S);
  if (error || !data) return null;
  return data.signedUrl;
}

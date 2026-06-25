/**
 * Port de armazenamento de fotos de posto. Isola os use cases de foto do
 * Storage concreto (Supabase), respeitando o DIP e permitindo stub em teste.
 */
export interface FotoStorageGateway {
  /** Caminho determinístico por posto + timestamp, dentro do bucket. */
  montarCaminho(prefixo: string, tiradaEm: Date): string;
  /** Sobe o JPEG (buffer) e retorna o caminho gravado. */
  subir(caminho: string, conteudo: Buffer): Promise<string>;
  /** Signed URL temporária para exibir a foto; null se o caminho falhar. */
  urlAssinada(caminho: string): Promise<string | null>;
}

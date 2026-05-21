import type { PostoFoto } from '@/domain/posto-foto';

/** Entrada para registrar uma nova foto de capa (já enviada ao Storage). */
export interface RegistroFotoPosto {
  prefixo: string;
  storagePath: string;
  tiradaPor: string | null;
  tiradaEm?: Date;
}

export interface PostosFotosRepository {
  /** Registra a foto no histórico e a torna a capa atual (mais recente). */
  registrar(registro: RegistroFotoPosto): Promise<PostoFoto>;
  /** Capa atual do posto (foto mais recente), ou null se não houver. */
  capaAtual(prefixo: string): Promise<PostoFoto | null>;
}

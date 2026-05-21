import type { PostoFoto } from '@/domain/posto-foto';

/** Entrada para registrar uma nova foto de capa (já enviada ao Storage). */
export interface RegistroFotoPosto {
  prefixo: string;
  storagePath: string;
  tiradaPor: string | null;
  tiradaEm?: Date;
}

export interface PostosFotosRepository {
  /** Registra a foto no histórico do posto e a torna a vigente (mais recente). */
  registrar(registro: RegistroFotoPosto): Promise<PostoFoto>;
  /** Foto vigente do posto (mais recente), ou null se não houver. */
  capaAtual(prefixo: string): Promise<PostoFoto | null>;
  /** Histórico completo do posto, da mais recente para a mais antiga. */
  listarDoPosto(prefixo: string): Promise<PostoFoto[]>;
}

import type {
  PostosFotosRepository,
  RegistroFotoPosto,
} from '@/application/ports/postos-fotos-repository';
import type { PostoFoto } from '@/domain/posto-foto';

/** Modo demo: guarda fotos em memória, a capa é a mais recente por prefixo. */
const memoria: PostoFoto[] = [];

export const postosFotosRepository: PostosFotosRepository = {
  async registrar(registro: RegistroFotoPosto) {
    const foto: PostoFoto = {
      id: crypto.randomUUID(),
      prefixo: registro.prefixo,
      storagePath: registro.storagePath,
      tiradaEm: registro.tiradaEm ?? new Date(),
      tiradaPor: registro.tiradaPor,
      criadaEm: new Date(),
    };
    memoria.push(foto);
    return foto;
  },

  async capaAtual(prefixo: string) {
    const doPosto = memoria
      .filter((f) => f.prefixo === prefixo)
      .sort((a, b) => b.tiradaEm.getTime() - a.tiradaEm.getTime());
    return doPosto[0] ?? null;
  },
};

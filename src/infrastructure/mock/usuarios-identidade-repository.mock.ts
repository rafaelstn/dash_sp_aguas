import 'server-only';
import type { UsuariosIdentidadeRepository } from '@/application/ports/usuarios-identidade-repository';
import type { IdentidadeUsuario } from '@/domain/estoque/export';

/**
 * Mock (MODO DEMO): nao ha Supabase Auth real, entao nenhuma identidade e
 * resolvida. Devolve mapa vazio; o rotulo do operador cai no fallback do
 * dominio (`rotuloOperador`: "Importacao" pro UUID de sistema, senao o id cru).
 */
export const usuariosIdentidadeRepository: UsuariosIdentidadeRepository = {
  async resolver(): Promise<Map<string, IdentidadeUsuario>> {
    return new Map();
  },
};

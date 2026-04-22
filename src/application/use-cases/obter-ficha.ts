import type { PostosRepository } from '@/application/ports/postos-repository';
import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';
import type { Posto } from '@/domain/posto';
import { PostoNaoEncontrado } from '@/domain/errors';

export interface EntradaObterFicha {
  prefixo: string;
  ip: string | null;
  userAgent: string | null;
  usuarioId: string | null;
}

/**
 * Obter ficha completa de um posto.
 * Regra obrigatória: registro LGPD em `acesso_ficha` antes do retorno.
 * Se a auditoria falhar, o caso de uso propaga o erro — resposta não é servida
 * sem trilha registrada.
 */
export async function obterFicha(
  postosRepo: PostosRepository,
  auditoriaRepo: AuditoriaRepository,
  entrada: EntradaObterFicha,
): Promise<Posto> {
  const posto = await postosRepo.buscarPorPrefixo(entrada.prefixo);
  if (!posto) {
    throw new PostoNaoEncontrado(entrada.prefixo);
  }

  await auditoriaRepo.registrarAcesso({
    prefixo: entrada.prefixo,
    acao: 'visualizou_ficha',
    ip: entrada.ip,
    userAgent: entrada.userAgent,
    usuarioId: entrada.usuarioId,
  });

  return posto;
}

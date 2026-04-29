import type { AuditoriaRepository } from '@/application/ports/auditoria-repository';
import type { PostosRepository } from '@/application/ports/postos-repository';
import type { Posto } from '@/domain/posto';

export interface PostoRecente {
  posto: Posto;
  visualizadoEm: Date;
}

/**
 * Últimos N postos visualizados pelo usuário, prontos pra serem exibidos como
 * acesso rápido na home. Resolve cada prefixo no cadastro `postos` em paralelo;
 * postos que sumiram do cadastro (raro — FK lógica, sem CASCADE) são filtrados
 * silenciosamente pra não estourar a UI por causa de um item órfão.
 */
export async function listarPostosRecentes(
  auditoriaRepo: AuditoriaRepository,
  postosRepo: PostosRepository,
  usuarioId: string | null,
  limite = 10,
): Promise<PostoRecente[]> {
  if (!usuarioId) return [];
  if (limite <= 0) return [];

  const acessos = await auditoriaRepo.listarRecentesDoUsuario(usuarioId, limite);
  if (acessos.length === 0) return [];

  // Resolução em paralelo. N=10 — tradeoff aceitável vs. fazer JOIN cruzando
  // repositórios (quebraria a separação postos ↔ auditoria).
  const postos = await Promise.all(
    acessos.map((a) => postosRepo.buscarPorPrefixo(a.prefixo)),
  );

  const itens: PostoRecente[] = [];
  acessos.forEach((acesso, i) => {
    const posto = postos[i];
    if (posto) {
      itens.push({ posto, visualizadoEm: acesso.ocorreuEm });
    }
  });
  return itens;
}

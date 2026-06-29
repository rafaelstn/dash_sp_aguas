import type { Papel } from '@/domain/auth/papel';
import { podeCriar, podeGerenciar } from '@/domain/auth/gestao-acesso';
import type { UsuarioGerenciadoDTO } from './api-usuarios';

/**
 * Regras de exibição da gestão de usuários no cliente. Espelham
 * `domain/auth/gestao-acesso.ts` reusando as MESMAS funções puras, para a UI
 * não divergir do backend (que continua sendo a fonte de verdade e reforça
 * tudo de novo). Sem I/O.
 *
 * Importante: o cliente NÃO conhece a contagem de super_admins, então a regra
 * do "último super admin" (motivo `ultimo_super_admin`, HTTP 409) não é
 * antecipada aqui — ela é tratada quando o backend responde. A UI cobre o que
 * é decidível só com papéis e ids: privilégio, auto-papel e auto-remoção.
 */

/** Capacidades calculadas para uma linha (um usuário-alvo) na tabela. */
export interface CapacidadesLinha {
  /** O ator pode alterar o papel deste alvo? (sem mexer no próprio papel) */
  podeAlterarPapel: boolean;
  /** O ator pode resetar a senha deste alvo? */
  podeResetarSenha: boolean;
  /** O ator pode excluir este alvo? */
  podeExcluir: boolean;
  /** É a própria conta do ator. */
  ehProprio: boolean;
}

/**
 * Papéis que o ator pode atribuir ao criar/editar. Admin só enxerga `user`;
 * super_admin enxerga os três. Deriva de `podeCriar` para a criação.
 */
export function papeisAtribuiveis(ator: Papel): Papel[] {
  const todos: Papel[] = ['user', 'admin', 'super_admin'];
  return todos.filter((p) => podeCriar(ator, p).permitido);
}

/** O ator pode abrir o fluxo de criação de usuário? Admin e super podem
 * (admin cria ao menos `user`). */
export function podeCriarUsuario(ator: Papel): boolean {
  return papeisAtribuiveis(ator).length > 0;
}

/**
 * Calcula as capacidades da linha. Usa `podeGerenciar` em cada cenário:
 *   - alterar papel: testa contra um papel-alvo diferente possível;
 *   - resetar senha: papel inalterado (não remoção);
 *   - excluir: modo remoção.
 * `ehUltimoSuperAdmin=false` aqui de propósito (ver nota do módulo): se for o
 * último super, o backend devolve 409 e a UI mostra a mensagem.
 */
export function capacidadesDaLinha(
  ator: Papel,
  meuId: string,
  alvo: UsuarioGerenciadoDTO,
): CapacidadesLinha {
  const ehProprio = alvo.id === meuId;

  // "Pode alterar papel" = existe ao menos um papel atribuível diferente do
  // atual que `podeGerenciar` autorize. Própria conta nunca altera o papel.
  const podeAlterarPapel =
    !ehProprio &&
    papeisAtribuiveis(ator).some(
      (destino) =>
        destino !== alvo.papel &&
        podeGerenciar(ator, alvo.papel, destino, meuId, alvo.id, false, false)
          .permitido,
    );

  const podeResetarSenha = podeGerenciar(
    ator,
    alvo.papel,
    alvo.papel,
    meuId,
    alvo.id,
    false,
    false,
  ).permitido;

  const podeExcluir = podeGerenciar(
    ator,
    alvo.papel,
    alvo.papel,
    meuId,
    alvo.id,
    false,
    true,
  ).permitido;

  return { podeAlterarPapel, podeResetarSenha, podeExcluir, ehProprio };
}

/**
 * Opções de papel oferecidas no seletor de uma linha: os papéis atribuíveis
 * pelo ator que `podeGerenciar` autoriza para aquele alvo, sempre incluindo o
 * papel atual (para o seletor refletir o estado e permitir voltar a ele).
 */
export function papeisDestinoParaLinha(
  ator: Papel,
  meuId: string,
  alvo: UsuarioGerenciadoDTO,
): Papel[] {
  const destinos = papeisAtribuiveis(ator).filter(
    (destino) =>
      destino === alvo.papel ||
      podeGerenciar(ator, alvo.papel, destino, meuId, alvo.id, false, false)
        .permitido,
  );
  // Garante o papel atual presente (caso não seja atribuível pelo ator, ex.
  // admin vendo um super_admin — embora nesse caso a linha fique read-only).
  if (!destinos.includes(alvo.papel)) destinos.unshift(alvo.papel);
  return destinos;
}

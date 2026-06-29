/**
 * Autorização da GESTÃO DE USUÁRIOS (RBAC) — lógica pura, sem I/O.
 *
 * Decide se um ator (quem está logado) pode criar, editar (papel/senha) ou
 * remover um usuário-alvo. É a fonte única das regras de quem-mexe-em-quem;
 * as rotas só orquestram (resolvem papéis no banco, contam super_admins) e
 * delegam a decisão para cá. Testável isoladamente.
 *
 * REGRAS (defesa contra privilege escalation e lockout):
 *   1. admin só pode criar/editar/remover usuários de papel `user`.
 *      Criar ou promover alguém a `admin`/`super_admin` exige `super_admin`.
 *   2. Mexer em alvo que JÁ é `admin` ou `super_admin` exige `super_admin`.
 *   3. Ninguém altera o próprio papel nem se auto-remove (anti-lockout e
 *      anti-escalada: um admin não se promove; um super não se rebaixa
 *      sozinho deixando a operação sem dono).
 *   4. O ÚLTIMO `super_admin` nunca é removido nem rebaixado. Esta checagem
 *      depende de contagem (I/O) e por isso a rota a executa ANTES e informa
 *      via `ehUltimoSuperAdmin`; a decisão final continua aqui.
 *
 * Convenção de erro: cada negação carrega um `motivo` (slug estável para log
 * e tradução HTTP) e uma `mensagem` curta em PT-BR. Sem dado sensível.
 */

import type { Papel } from './papel';

/** Slug estável de cada motivo de negação (log + tradução HTTP). */
export type MotivoNegacao =
  | 'auto_alteracao_papel' // tentou mudar o próprio papel
  | 'auto_remocao' // tentou se auto-remover
  | 'exige_super_admin' // ação sobre admin/super ou promoção exige super_admin
  | 'ultimo_super_admin'; // removeria/rebaixaria o último super_admin

export interface Permitido {
  permitido: true;
}

export interface Negado {
  permitido: false;
  motivo: MotivoNegacao;
  mensagem: string;
}

export type ResultadoAutorizacao = Permitido | Negado;

const PERMITIDO: Permitido = { permitido: true };

function negar(motivo: MotivoNegacao, mensagem: string): Negado {
  return { permitido: false, motivo, mensagem };
}

/** True se o papel está na faixa privilegiada (admin ou super_admin). */
function ehPrivilegiado(papel: Papel): boolean {
  return papel === 'admin' || papel === 'super_admin';
}

/**
 * Autoriza a CRIAÇÃO de um usuário com `papelDesejado` pelo `ator`.
 *
 * Não há alvo existente nem id próprio em jogo — só o teto de privilégio:
 * admin cria apenas `user`; criar admin/super exige super_admin.
 */
export function podeCriar(
  ator: Papel,
  papelDesejado: Papel,
): ResultadoAutorizacao {
  if (ehPrivilegiado(papelDesejado) && ator !== 'super_admin') {
    return negar(
      'exige_super_admin',
      'Criar um Admin ou Super Admin requer papel de Super Admin.',
    );
  }
  return PERMITIDO;
}

/**
 * Autoriza GESTÃO (alterar papel e/ou senha, ou remover) de um alvo existente.
 *
 * @param ator papel de quem executa a ação.
 * @param alvoPapelAtual papel atual do alvo.
 * @param papelDesejado papel após a operação. Para reset de senha ou remoção,
 *        passar o próprio `alvoPapelAtual` (não há mudança de papel).
 * @param atorId id de quem executa.
 * @param alvoId id do alvo.
 * @param ehUltimoSuperAdmin se o alvo é o único super_admin restante (a rota
 *        conta no banco). Bloqueia rebaixar/remover o último dono.
 * @param removendo true quando a operação é remoção (DELETE); false em edição.
 */
export function podeGerenciar(
  ator: Papel,
  alvoPapelAtual: Papel,
  papelDesejado: Papel,
  atorId: string,
  alvoId: string,
  ehUltimoSuperAdmin = false,
  removendo = false,
): ResultadoAutorizacao {
  const ehProprio = atorId === alvoId;

  // Regra 3 — anti-lockout/anti-escalada: nada sobre o próprio papel/conta.
  if (ehProprio) {
    if (removendo) {
      return negar(
        'auto_remocao',
        'Você não pode remover a própria conta.',
      );
    }
    if (papelDesejado !== alvoPapelAtual) {
      return negar(
        'auto_alteracao_papel',
        'Você não pode alterar o próprio papel.',
      );
    }
    // Reset da PRÓPRIA senha (papel inalterado, não remoção) é manutenção
    // legítima de qualquer papel — libera aqui antes das regras de privilégio
    // (que de outra forma barrariam um admin/super mexendo no próprio alvo
    // "privilegiado").
    return PERMITIDO;
  }

  // Regra 2 — mexer em alvo já privilegiado exige super_admin.
  if (ehPrivilegiado(alvoPapelAtual) && ator !== 'super_admin') {
    return negar(
      'exige_super_admin',
      'Gerenciar um Admin ou Super Admin requer papel de Super Admin.',
    );
  }

  // Regra 1 — promover a admin/super exige super_admin.
  if (ehPrivilegiado(papelDesejado) && ator !== 'super_admin') {
    return negar(
      'exige_super_admin',
      'Promover a Admin ou Super Admin requer papel de Super Admin.',
    );
  }

  // Regra 4 — não remover nem rebaixar o último super_admin.
  if (alvoPapelAtual === 'super_admin' && ehUltimoSuperAdmin) {
    if (removendo) {
      return negar(
        'ultimo_super_admin',
        'Não é possível remover o último Super Admin do sistema.',
      );
    }
    if (papelDesejado !== 'super_admin') {
      return negar(
        'ultimo_super_admin',
        'Não é possível rebaixar o último Super Admin do sistema.',
      );
    }
  }

  return PERMITIDO;
}

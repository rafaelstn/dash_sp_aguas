import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  AprovadorSemMFA,
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
  IdempotencyKeyDuplicada,
  LockRevisaoNegado,
  MotivoRejeicaoInsuficiente,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import { TipoFichaIndisponivel, DadosFichaInvalidos } from '@/application/use-cases/fichas-visita';
import { criarClienteSupabaseServer } from '@/infrastructure/auth/supabase-server';
import { obterUsuarioBypassDev } from '@/infrastructure/auth/dev-bypass';
import { mfaObrigatorio } from '@/infrastructure/auth/mfa-config';
import { logger } from '@/infrastructure/logging/logger';

/**
 * Erro lançado quando a sessão do aprovador NÃO está em AAL2 (MFA passou neste
 * factor, mas a sessão atual não foi elevada via challenge MFA).
 *
 * Diferença pra `AprovadorSemMFA`:
 *   - `AprovadorSemMFA` = usuário não tem fator MFA configurado nunca.
 *   - `SessaoSemAal2` = tem fator, mas não passou MFA NESTA sessão (cookie
 *     ainda em aal1). Atacante com cookie roubado cai aqui.
 */
export class SessaoSemAal2 extends Error {
  constructor(public readonly aalAtual: string) {
    super(
      `Operação requer sessão MFA-elevada (aal2). Sessão atual: ${aalAtual}.`,
    );
    this.name = 'SessaoSemAal2';
  }
}

/**
 * Camada 3 da defesa de MFA (ver `docs/seguranca/owasp-review-sprint-1.md` §A07):
 *   1. Trigger SQL bloqueia ativar papel aprovador sem fator MFA verificado.
 *   2. Use case checa `papeisRepository.temMFAVerificado` em runtime.
 *   3. ESTA função: confirma que a sessão atual já passou MFA challenge —
 *      ataque com cookie aal1 vazado é bloqueado mesmo se atacante for
 *      aprovador.
 *
 * Lê `aal` do JWT da sessão Supabase. `aal1` = só password; `aal2` = password
 * + MFA factor verificado nesta sessão.
 *
 * Em modo dev com bypass (`DEV_BYPASS_AUTH_EMAIL`) a checagem é skipada — log
 * deixa rastro e prod (NODE_ENV=production) jamais aceita bypass.
 */
export async function exigirSessaoAal2(usuarioId: string): Promise<void> {
  if (obterUsuarioBypassDev()) {
    // Dev bypass — evita exigir MFA no fluxo local. Em produção, o
    // `dev-bypass.ts` recusa ativar (NODE_ENV check).
    return;
  }
  if (!mfaObrigatorio()) {
    // Bypass de homologação (ADR-0009). Logado para auditoria; SIEM tem
    // alerta dedicado em runbook. Default seguro: ausência da env exige MFA.
    logger.security(
      'seg.mfa.bypass_homologacao',
      { usuarioId, camada: 'sessao_aal2' },
      'Camada AAL2 bypassada por MFA_OPCIONAL_HOMOLOGACAO=true',
    );
    return;
  }
  const supabase = await criarClienteSupabaseServer();
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    throw new SessaoSemAal2('sem_sessao');
  }
  // `aal` está no campo `aud` ou via getAuthenticatorAssuranceLevel(). Os SDKs
  // mais recentes expõem mfaAuthenticationLevel — fallback para o claim no JWT.
  const claim = data.session.user?.aud;
  // Mais confiável: chamar getAuthenticatorAssuranceLevel.
  const aalResp = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const aalAtual = aalResp.data?.currentLevel ?? 'aal1';
  if (aalAtual !== 'aal2') {
    // Severity `security` → roteado pelo SIEM para alerta A2 (mfa_rejected)
    // em `docs/runbooks/alertas-siem.md`. Nome `aal_insuficiente` mantido
    // por consistência com `owasp-review-sprint-1.md` §A07 (já documentado).
    logger.security(
      'seg.triagem.aal_insuficiente',
      {
        usuarioId,
        aalAtual,
        audClaim: claim,
      },
      'Sessão sem AAL2 tentou operação destrutiva',
    );
    throw new SessaoSemAal2(aalAtual);
  }
}

/**
 * Tradução centralizada de erros de domínio pra HTTP. Mantém rotas finas.
 *
 * Política:
 *   - Nunca vaza stack trace para o cliente.
 *   - 5xx ganha um correlation ID (UUID v4) — mesmo ID logado no servidor e
 *     devolvido no body, sem detalhes do erro. Permite o usuário relatar e o
 *     time encontrar o trace exato sem expor stack.
 *   - Body fixo: { erro: <slug>, mensagem: <texto curto pro usuário> }.
 */
export function respostaDeErro(rota: string, contexto: Record<string, unknown>, erro: unknown) {
  if (erro instanceof DadosFichaInvalidos) {
    return NextResponse.json(
      { erro: 'dados_invalidos', mensagem: erro.message, motivos: erro.motivos },
      { status: 400 },
    );
  }
  if (erro instanceof MotivoRejeicaoInsuficiente) {
    return NextResponse.json(
      {
        erro: 'motivo_insuficiente',
        mensagem: erro.message,
        tamanhoRecebido: erro.tamanhoRecebido,
      },
      { status: 400 },
    );
  }
  if (erro instanceof TipoFichaIndisponivel) {
    return NextResponse.json(
      { erro: 'tipo_indisponivel', mensagem: erro.message },
      { status: 400 },
    );
  }
  if (erro instanceof FichaTriagemNaoEncontrada) {
    return NextResponse.json(
      { erro: 'nao_encontrada', mensagem: 'Ficha de triagem não encontrada.' },
      { status: 404 },
    );
  }
  if (erro instanceof UsuarioNaoEhAprovador) {
    return NextResponse.json(
      { erro: 'sem_papel_aprovador', mensagem: 'Operação requer papel de aprovador.' },
      { status: 403 },
    );
  }
  if (erro instanceof AprovadorSemMFA) {
    return NextResponse.json(
      { erro: 'mfa_obrigatorio', mensagem: 'MFA verificado é obrigatório para esta operação.' },
      { status: 403 },
    );
  }
  if (erro instanceof SessaoSemAal2) {
    return NextResponse.json(
      {
        erro: 'mfa_nao_validado_na_sessao',
        mensagem:
          'Esta sessão não passou validação MFA. Faça logout e entre novamente confirmando o código MFA.',
      },
      { status: 403 },
    );
  }
  if (erro instanceof EstadoTriagemInvalido) {
    return NextResponse.json(
      {
        erro: 'estado_invalido',
        mensagem: erro.message,
        de: erro.de,
        para: erro.para,
      },
      { status: 409 },
    );
  }
  if (erro instanceof LockRevisaoNegado) {
    return NextResponse.json(
      {
        erro: 'lock_negado',
        mensagem: erro.message,
        motivo: erro.motivo,
      },
      { status: 423 },
    );
  }
  if (erro instanceof IdempotencyKeyDuplicada) {
    return NextResponse.json(
      {
        erro: 'idempotency_duplicada',
        mensagem: 'Idempotency-Key já usada com payload diferente.',
        fichaExistenteId: erro.fichaExistenteId,
      },
      { status: 409 },
    );
  }

  // 5xx — correlation ID pra rastrear sem expor stack.
  const correlationId = randomUUID();
  // String(erro) escapa stack: Error.toString() retorna só "Name: message".
  // Logging estruturado: chave evento + correlationId pra busca SIEM (alerta A4).
  logger.error(
    'erro_inesperado',
    {
      correlationId,
      rota,
      ...contexto,
      erro: String(erro),
    },
    `Erro 5xx em ${rota}`,
  );
  return NextResponse.json(
    {
      erro: 'erro_interno',
      mensagem: 'Falha ao processar a solicitação.',
      correlationId,
    },
    { status: 500 },
  );
}

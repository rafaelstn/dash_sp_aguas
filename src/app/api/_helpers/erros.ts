import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  DadosInvalidos,
  DiagramaNaoEncontrado,
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
  IdempotencyKeyDuplicada,
  IndexacaoPendente,
  LockRevisaoNegado,
  MotivoRejeicaoInsuficiente,
  PostoNaoEncontrado,
  PostoRemovido,
  PrefixoDuplicado,
  TermoBuscaInvalido,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import { TipoFichaIndisponivel, DadosFichaInvalidos } from '@/application/use-cases/fichas-visita';
import { logger } from '@/infrastructure/logging/logger';

/**
 * Tradução centralizada de erros de domínio para HTTP. Mantém as rotas finas e
 * o contrato de erro uniforme em toda a API (ADR-0008 estendido).
 *
 * Política:
 *   - Nunca vaza stack trace para o cliente.
 *   - Erro de domínio conhecido vira o status correto (400/403/404/409/423).
 *   - Erro inesperado vira 5xx com correlation ID (UUID v4): o mesmo ID é
 *     logado no servidor e devolvido no body, sem detalhes, para o usuário
 *     relatar e o time achar o trace exato.
 *   - Body fixo: { erro: <slug>, mensagem: <texto curto>, ...campos }.
 *
 * Uso:
 *   try { ... } catch (e) {
 *     return respostaDeErro('POST /api/postos', { prefixo }, e);
 *   }
 */
export function respostaDeErro(rota: string, contexto: Record<string, unknown>, erro: unknown) {
  // ── 400 Bad Request ──────────────────────────────────────────────────────
  if (erro instanceof DadosFichaInvalidos) {
    return NextResponse.json(
      { erro: 'dados_invalidos', mensagem: erro.message, motivos: erro.motivos },
      { status: 400 },
    );
  }
  if (erro instanceof DadosInvalidos) {
    return NextResponse.json({ erro: 'dados_invalidos', mensagem: erro.message }, { status: 400 });
  }
  if (erro instanceof TermoBuscaInvalido) {
    return NextResponse.json({ erro: 'termo_invalido', mensagem: erro.message }, { status: 400 });
  }
  if (erro instanceof TipoFichaIndisponivel) {
    return NextResponse.json({ erro: 'tipo_indisponivel', mensagem: erro.message }, { status: 400 });
  }
  if (erro instanceof MotivoRejeicaoInsuficiente) {
    return NextResponse.json(
      { erro: 'motivo_insuficiente', mensagem: erro.message, tamanhoRecebido: erro.tamanhoRecebido },
      { status: 400 },
    );
  }

  // ── 403 Forbidden ────────────────────────────────────────────────────────
  if (erro instanceof UsuarioNaoEhAprovador) {
    return NextResponse.json(
      { erro: 'sem_papel_aprovador', mensagem: 'Operação requer papel de aprovador.' },
      { status: 403 },
    );
  }

  // ── 404 Not Found ────────────────────────────────────────────────────────
  if (erro instanceof PostoNaoEncontrado) {
    return NextResponse.json(
      { erro: 'posto_nao_encontrado', mensagem: 'Posto não encontrado.' },
      { status: 404 },
    );
  }
  if (erro instanceof DiagramaNaoEncontrado) {
    return NextResponse.json(
      { erro: 'nao_encontrado', mensagem: 'Diagrama não encontrado.' },
      { status: 404 },
    );
  }
  if (erro instanceof FichaTriagemNaoEncontrada) {
    return NextResponse.json(
      { erro: 'nao_encontrada', mensagem: 'Ficha de triagem não encontrada.' },
      { status: 404 },
    );
  }

  // ── 409 Conflict ─────────────────────────────────────────────────────────
  if (erro instanceof PostoRemovido) {
    return NextResponse.json({ erro: 'posto_removido', mensagem: erro.message }, { status: 409 });
  }
  if (erro instanceof PrefixoDuplicado) {
    return NextResponse.json({ erro: 'prefixo_duplicado', mensagem: erro.message }, { status: 409 });
  }
  if (erro instanceof EstadoTriagemInvalido) {
    return NextResponse.json(
      { erro: 'estado_invalido', mensagem: erro.message, de: erro.de, para: erro.para },
      { status: 409 },
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

  // ── 423 Locked ───────────────────────────────────────────────────────────
  if (erro instanceof LockRevisaoNegado) {
    return NextResponse.json(
      { erro: 'lock_negado', mensagem: erro.message, motivo: erro.motivo },
      { status: 423 },
    );
  }

  // ── 202 Accepted (processamento assíncrono) ──────────────────────────────
  if (erro instanceof IndexacaoPendente) {
    return NextResponse.json(
      {
        erro: 'indexacao_pendente',
        mensagem: 'Indexação em andamento. Consulte o status pelo jobId.',
        jobId: erro.jobId,
        prefixo: erro.prefixo,
      },
      { status: 202 },
    );
  }

  // ── 5xx: erro inesperado, correlation ID para rastrear sem expor stack ────
  // String(erro) escapa stack: Error.toString() retorna só "Name: message".
  const correlationId = randomUUID();
  logger.error(
    'erro_inesperado',
    { correlationId, rota, ...contexto, erro: String(erro) },
    `Erro 5xx em ${rota}`,
  );
  return NextResponse.json(
    { erro: 'erro_interno', mensagem: 'Falha ao processar a solicitação.', correlationId },
    { status: 500 },
  );
}

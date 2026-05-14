import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import {
  EstadoTriagemInvalido,
  FichaTriagemNaoEncontrada,
  IdempotencyKeyDuplicada,
  LockRevisaoNegado,
  MotivoRejeicaoInsuficiente,
  UsuarioNaoEhAprovador,
} from '@/domain/errors';
import { TipoFichaIndisponivel, DadosFichaInvalidos } from '@/application/use-cases/fichas-visita';
import { logger } from '@/infrastructure/logging/logger';

/**
 * Tradução centralizada de erros de domínio pra HTTP. Mantém rotas finas.
 *
 * Política:
 *   Nunca vaza stack trace para o cliente.
 *   5xx ganha um correlation ID (UUID v4), mesmo ID logado no servidor e
 *   devolvido no body, sem detalhes do erro. Permite o usuário relatar e o
 *   time encontrar o trace exato sem expor stack.
 *   Body fixo: { erro: <slug>, mensagem: <texto curto pro usuário> }.
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

  // 5xx: correlation ID pra rastrear sem expor stack.
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

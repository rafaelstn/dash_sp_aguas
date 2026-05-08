import { NextResponse } from 'next/server';
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

/**
 * Tradução centralizada de erros de domínio pra HTTP. Mantém rotas finas.
 *
 * Política: nunca vaza stack trace. Resposta tem `erro` (slug) e `mensagem`
 * (texto curto pro usuário). 5xx só pra falhas inesperadas.
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

  console.error(`[${rota}] erro inesperado`, { ...contexto, erro: String(erro) });
  return NextResponse.json(
    { erro: 'erro_interno', mensagem: 'Falha ao processar a solicitação.' },
    { status: 500 },
  );
}

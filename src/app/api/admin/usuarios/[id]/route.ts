import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import {
  papeisRepository,
  usuariosAdminRepository,
} from '@/infrastructure/repositories';
import { exigirAdmin } from '@/app/api/_helpers/auth';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
} from '@/infrastructure/security/rate-limit';
import { type Papel, ehPapelValido } from '@/domain/auth/papel';
import { podeGerenciar, type ResultadoAutorizacao } from '@/domain/auth/gestao-acesso';
import { validarSenha } from '@/domain/auth/politica-senha';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid('Identificador de usuário inválido.');

/**
 * PATCH aceita papel e/ou nova senha; ao menos um é obrigatório. Senha valida
 * pela política completa em `validarSenha`. Papel restrito aos três conhecidos.
 */
const patchSchema = z
  .object({
    papel: z.string().refine(ehPapelValido).optional(),
    novaSenha: z.string().min(1).max(200).optional(),
  })
  .refine((d) => d.papel !== undefined || d.novaSenha !== undefined, {
    message: 'Informe papel e/ou novaSenha.',
  });

/**
 * Conta super_admins só quando o alvo é super_admin (única situação em que o
 * "último super" importa). Evita um COUNT desnecessário nas demais operações.
 */
async function ehUltimoSuper(alvoPapelAtual: Papel): Promise<boolean> {
  if (alvoPapelAtual !== 'super_admin') return false;
  const total = await usuariosAdminRepository.contarSuperAdmins();
  return total <= 1;
}

function respostaNegacao(
  rota: string,
  atorId: string,
  alvoId: string,
  papelAtor: Papel,
  autorizacao: Extract<ResultadoAutorizacao, { permitido: false }>,
  headers: Headers,
) {
  logger.security(
    'seg.admin.usuarios.acao_negada',
    { rota, atorId, alvoId, papelAtor, motivo: autorizacao.motivo },
    'Ação de gestão de usuário negada por política',
  );
  // 409 para conflito de estado (último super); 403 para falta de privilégio.
  const status = autorizacao.motivo === 'ultimo_super_admin' ? 409 : 403;
  return NextResponse.json(
    { erro: autorizacao.motivo, mensagem: autorizacao.mensagem },
    { status, headers },
  );
}

/**
 * PATCH /api/admin/usuarios/[id]
 *
 * Altera o papel e/ou reseta a senha de um usuário. Aplica `podeGerenciar`:
 * admin só mexe em `user`; promover/mexer em admin/super exige super_admin;
 * ninguém altera o próprio papel; o último super_admin não é rebaixado.
 */
export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const rl = consumirRateLimit(POLITICAS.mutacaoAdminUsuarios, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.mutacaoAdminUsuarios, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  }
  const alvoId = idParsed.data;

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }

  const parsed = patchSchema.safeParse(corpo);
  if (!parsed.success) {
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }
  const novoPapel = parsed.data.papel as Papel | undefined;
  const novaSenha = parsed.data.novaSenha;

  if (novaSenha !== undefined) {
    const erroSenha = validarSenha(novaSenha);
    if (erroSenha) {
      return NextResponse.json(
        { erro: 'senha_fraca', mensagem: erroSenha },
        { status: 400, headers },
      );
    }
  }

  try {
    const papelAtor = await papeisRepository.obterPapel(usuario.id);
    const papelAtual = await papeisRepository.obterPapel(alvoId);
    // papelDesejado = novoPapel se foi pedido, senão mantém o atual (reset de
    // senha não altera papel). Assim a checagem cobre os dois caminhos.
    const papelDesejado = novoPapel ?? papelAtual;

    const autorizacao = podeGerenciar(
      papelAtor,
      papelAtual,
      papelDesejado,
      usuario.id,
      alvoId,
      await ehUltimoSuper(papelAtual),
      false,
    );
    if (!autorizacao.permitido) {
      return respostaNegacao(
        'PATCH /api/admin/usuarios/[id]',
        usuario.id,
        alvoId,
        papelAtor,
        autorizacao,
        headers,
      );
    }

    if (novoPapel !== undefined) {
      await usuariosAdminRepository.definirPapel(alvoId, novoPapel);
    }
    if (novaSenha !== undefined) {
      await usuariosAdminRepository.resetarSenha(alvoId, novaSenha);
    }

    logger.info(
      'admin.usuarios.atualizado',
      {
        atorId: usuario.id,
        alvoId,
        papelAlterado: novoPapel !== undefined,
        senhaResetada: novaSenha !== undefined,
        ...(novoPapel !== undefined ? { novoPapel } : {}),
      },
      'Usuário atualizado pela gestão',
    );
    return NextResponse.json(
      {
        id: alvoId,
        papel: papelDesejado,
        senhaResetada: novaSenha !== undefined,
      },
      { headers },
    );
  } catch (e) {
    return respostaDeErro(
      'PATCH /api/admin/usuarios/[id]',
      { atorId: usuario.id, alvoId },
      e,
    );
  }
}

/**
 * DELETE /api/admin/usuarios/[id]
 *
 * Remove um usuário. Aplica `podeGerenciar` em modo remoção: admin só remove
 * `user`; remover admin/super exige super_admin; ninguém se auto-remove; o
 * último super_admin não é removido.
 */
export async function DELETE(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const rl = consumirRateLimit(POLITICAS.mutacaoAdminUsuarios, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.mutacaoAdminUsuarios, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  const idParsed = idSchema.safeParse((await ctx.params).id);
  if (!idParsed.success) {
    return NextResponse.json({ erro: 'id_invalido' }, { status: 400, headers });
  }
  const alvoId = idParsed.data;

  try {
    const papelAtor = await papeisRepository.obterPapel(usuario.id);
    const papelAtual = await papeisRepository.obterPapel(alvoId);

    const autorizacao = podeGerenciar(
      papelAtor,
      papelAtual,
      papelAtual, // remoção não muda papel
      usuario.id,
      alvoId,
      await ehUltimoSuper(papelAtual),
      true,
    );
    if (!autorizacao.permitido) {
      return respostaNegacao(
        'DELETE /api/admin/usuarios/[id]',
        usuario.id,
        alvoId,
        papelAtor,
        autorizacao,
        headers,
      );
    }

    await usuariosAdminRepository.remover(alvoId);
    logger.info(
      'admin.usuarios.removido',
      { atorId: usuario.id, alvoId, papelRemovido: papelAtual },
      'Usuário removido pela gestão',
    );
    return NextResponse.json({ id: alvoId, removido: true }, { headers });
  } catch (e) {
    return respostaDeErro(
      'DELETE /api/admin/usuarios/[id]',
      { atorId: usuario.id, alvoId },
      e,
    );
  }
}

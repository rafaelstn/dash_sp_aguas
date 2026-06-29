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
import { ehPapelValido } from '@/domain/auth/papel';
import { podeCriar } from '@/domain/auth/gestao-acesso';
import { validarSenha } from '@/domain/auth/politica-senha';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Schema de criação. A senha NÃO é validada aqui só por tamanho: a política
 * completa (12 chars, 3 classes) roda em `validarSenha` para reusar a mesma
 * regra do cadastro self-service. Limite superior de 200 evita DoS por hash
 * de senha gigante. O papel é validado contra os três valores conhecidos.
 */
const criarSchema = z.object({
  email: z.string().trim().email('Email inválido.').max(254),
  senha: z.string().min(1).max(200),
  nome: z.string().trim().min(2, 'Informe o nome (mínimo 2 caracteres).').max(120),
  papel: z.string().refine(ehPapelValido, 'Papel inválido.'),
});

/**
 * GET /api/admin/usuarios
 *
 * Lista todos os usuários do sistema com seu papel. Restrito a Admin/Super
 * Admin. Não retorna nenhum dado sensível (sem senha/hash).
 */
export async function GET() {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const rl = consumirRateLimit(POLITICAS.leituraAdminUsuarios, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.leituraAdminUsuarios, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  try {
    const usuarios = await usuariosAdminRepository.listar();
    return NextResponse.json({ usuarios }, { headers });
  } catch (e) {
    return respostaDeErro('GET /api/admin/usuarios', { usuarioId: usuario.id }, e);
  }
}

/**
 * POST /api/admin/usuarios
 *
 * Cria um usuário. Admin só cria papel `user`; criar Admin/Super Admin exige
 * Super Admin (regra `podeCriar`). A senha segue a política do sistema e nunca
 * é logada.
 */
export async function POST(request: NextRequest) {
  const auth = await exigirAdmin();
  if (auth instanceof NextResponse) return auth;
  const usuario = auth;

  const rl = consumirRateLimit(POLITICAS.mutacaoAdminUsuarios, usuario.id);
  const headers = new Headers();
  aplicarHeadersRateLimit(headers, POLITICAS.mutacaoAdminUsuarios, rl);
  if (!rl.permitido) {
    return NextResponse.json({ erro: 'rate_limit' }, { status: 429, headers });
  }

  let corpo: unknown;
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ erro: 'json_invalido' }, { status: 400, headers });
  }

  const parsed = criarSchema.safeParse(corpo);
  if (!parsed.success) {
    // Não ecoar o corpo (contém senha). Só os caminhos/mensagens do zod.
    return NextResponse.json(
      {
        erro: 'body_invalido',
        motivos: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      },
      { status: 400, headers },
    );
  }
  const { email, senha, nome, papel } = parsed.data;

  const erroSenha = validarSenha(senha);
  if (erroSenha) {
    return NextResponse.json(
      { erro: 'senha_fraca', mensagem: erroSenha },
      { status: 400, headers },
    );
  }

  // Autorização de privilégio: papel do ator vem do banco (não do cliente).
  const papelAtor = await papeisRepository.obterPapel(usuario.id);
  const autorizacao = podeCriar(papelAtor, papel);
  if (!autorizacao.permitido) {
    logger.security(
      'seg.admin.usuarios.criar_negado',
      {
        atorId: usuario.id,
        papelAtor,
        papelDesejado: papel,
        motivo: autorizacao.motivo,
      },
      'Criação de usuário negada por política de privilégio',
    );
    return NextResponse.json(
      { erro: autorizacao.motivo, mensagem: autorizacao.mensagem },
      { status: 403, headers },
    );
  }

  try {
    const id = await usuariosAdminRepository.criar({ email, senha, nome, papel });
    logger.info(
      'admin.usuarios.criado',
      { atorId: usuario.id, novoUsuarioId: id, papel },
      'Usuário criado pela gestão',
    );
    return NextResponse.json({ id, email, nome, papel }, { status: 201, headers });
  } catch (e) {
    // contexto SEM senha — só identificadores e papel.
    return respostaDeErro(
      'POST /api/admin/usuarios',
      { atorId: usuario.id, papel },
      e,
    );
  }
}

import type { Papel } from '@/domain/auth/papel';

/**
 * Cliente da API de gestão de usuários (lado do navegador) com tradução de
 * erros para mensagens amigáveis em PT-BR. A autorização real mora no backend
 * (rotas /api/admin/usuarios); aqui só consumimos e traduzimos o resultado.
 *
 * Convenção: cada chamada resolve com os dados no sucesso ou lança `ErroApi`
 * com `mensagem` pronta para exibição. Nunca trafega nem registra a senha
 * além do corpo do POST/PATCH.
 */

/** Visão de um usuário na tela de gestão. Espelha `UsuarioGerenciado`, mas
 * `criadoEm` chega como string ISO via JSON (não Date). */
export interface UsuarioGerenciadoDTO {
  id: string;
  email: string;
  nome: string | null;
  papel: Papel;
  criadoEm: string;
}

export class ErroApi extends Error {
  /** Slug estável do backend (ex.: 'exige_super_admin', 'rate_limit'). */
  readonly codigo: string;
  readonly status: number;
  /** A mensagem amigável fica em `message` (herdada de Error). */
  constructor(mensagem: string, codigo: string, status: number) {
    super(mensagem);
    this.name = 'ErroApi';
    this.codigo = codigo;
    this.status = status;
  }
}

interface CorpoErro {
  erro?: string;
  mensagem?: string;
  motivos?: string[];
}

/**
 * Traduz uma resposta não-ok em `ErroApi` com mensagem amigável. Prioriza a
 * `mensagem` que o backend já manda em PT-BR; cai em mensagens por status
 * quando ausente.
 */
async function lancarErro(resp: Response): Promise<never> {
  let corpo: CorpoErro = {};
  try {
    corpo = (await resp.json()) as CorpoErro;
  } catch {
    /* corpo não-JSON: usa fallback por status abaixo */
  }
  const codigo = corpo.erro ?? `http_${resp.status}`;

  if (corpo.mensagem) {
    throw new ErroApi(corpo.mensagem, codigo, resp.status);
  }
  if (corpo.motivos && corpo.motivos.length > 0) {
    throw new ErroApi(corpo.motivos.join(' '), codigo, resp.status);
  }

  const porStatus: Record<number, string> = {
    400: 'Dados inválidos. Revise os campos e tente novamente.',
    401: 'Sua sessão expirou. Entre novamente para continuar.',
    403: 'Você não tem privilégio para esta ação.',
    409: 'A operação não pode ser concluída no estado atual.',
    429: 'Muitas operações em sequência. Aguarde alguns instantes e tente de novo.',
  };
  throw new ErroApi(
    porStatus[resp.status] ??
      'Não foi possível concluir a operação. Tente novamente em instantes.',
    codigo,
    resp.status,
  );
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export async function listarUsuarios(): Promise<UsuarioGerenciadoDTO[]> {
  const resp = await fetch('/api/admin/usuarios', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) await lancarErro(resp);
  const dados = (await resp.json()) as { usuarios: UsuarioGerenciadoDTO[] };
  return dados.usuarios;
}

export async function criarUsuario(entrada: {
  nome: string;
  email: string;
  senha: string;
  papel: Papel;
}): Promise<void> {
  const resp = await fetch('/api/admin/usuarios', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(entrada),
  });
  if (!resp.ok) await lancarErro(resp);
}

export async function alterarPapel(id: string, papel: Papel): Promise<void> {
  const resp = await fetch(`/api/admin/usuarios/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ papel }),
  });
  if (!resp.ok) await lancarErro(resp);
}

export async function resetarSenha(id: string, novaSenha: string): Promise<void> {
  const resp = await fetch(`/api/admin/usuarios/${id}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ novaSenha }),
  });
  if (!resp.ok) await lancarErro(resp);
}

export async function excluirUsuario(id: string): Promise<void> {
  const resp = await fetch(`/api/admin/usuarios/${id}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  });
  if (!resp.ok) await lancarErro(resp);
}

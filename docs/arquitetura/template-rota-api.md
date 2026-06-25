# Template padrão de rota de API (BASE-1)

Toda rota nova em `src/app/api/**` nasce com auth, rate limit, `respostaDeErro`
centralizado e logger estruturado. Copiar este esqueleto evita rota que escapa do
padrão de erro (ADR-0017) e do audit trail. Não é boilerplate opcional: em projeto
de governo, auth + trilha + erro semântico são requisito.

## Checklist por rota

1. **Runtime/dynamic** explícitos quando necessário (`export const runtime`,
   `export const dynamic = 'force-dynamic'` em rota autenticada).
2. **Autenticação**: `obterUsuarioAtual()` no início; sem usuário → 401/redirect.
3. **Autorização**: validar papel/ownership quando a ação exige (ex.:
   `permitirDonoOuAprovador`, checagem de papel via `papeisRepository`).
4. **Rate limit**: `consumirRateLimit(POLITICAS.x, chave)` (chave = `userId` e/ou
   `extrairIp(req)`), com `aplicarHeadersRateLimit`. 429 quando estoura.
5. **Validação de input**: Zod no corpo/params antes de tocar o domínio.
6. **Repositórios por injeção**: importar de `@/infrastructure/repositories`
   (nunca de `db/*.pg` ou `mock/*` direto).
7. **Erro**: um único `try/catch` que delega a `respostaDeErro` (não montar
   resposta de erro ad hoc; não devolver 500 genérico para erro de domínio).
8. **Logger estruturado**: `logger.info`/`logger.error` em operação relevante,
   com código de correlação; nunca logar PII ou secret.

## Esqueleto

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { algumRepository } from '@/infrastructure/repositories';
import { obterUsuarioAtual } from '@/infrastructure/auth/current-user';
import {
  POLITICAS,
  aplicarHeadersRateLimit,
  consumirRateLimit,
  extrairIp,
} from '@/infrastructure/security/rate-limit';
import { respostaDeErro } from '@/app/api/_helpers/erros';
import { logger } from '@/infrastructure/logging/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Corpo = z.object({ /* campos */ });

export async function POST(req: NextRequest) {
  const usuario = await obterUsuarioAtual();
  if (!usuario) {
    return NextResponse.json(
      { erro: 'nao_autenticado', mensagem: 'Faça login para continuar.' },
      { status: 401 },
    );
  }

  const headers = new Headers();
  const rl = consumirRateLimit(POLITICAS.decisaoTriagem, usuario.id);
  aplicarHeadersRateLimit(headers, POLITICAS.decisaoTriagem, rl);
  if (!rl.permitido) {
    return NextResponse.json(
      { erro: 'rate_limited', mensagem: 'Muitas requisições. Tente em instantes.' },
      { status: 429, headers },
    );
  }

  try {
    const corpo = Corpo.parse(await req.json());
    const resultado = await algumRepository.fazerAlgo(corpo, usuario.id);
    logger.info('dominio.acao', { usuarioId: usuario.id }, 'Ação concluída');
    return NextResponse.json(resultado, { headers });
  } catch (e) {
    return respostaDeErro(e, { rota: 'dominio.acao', usuarioId: usuario.id });
  }
}
```

Ajustar a política de rate limit, os papéis exigidos e o schema Zod por rota. O
`extrairIp(req)` entra como chave secundária em rotas pré-autenticação (login,
cron). Ver `docs/seguranca/` para as ameaças cobertas.

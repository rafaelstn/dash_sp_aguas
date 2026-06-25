# Rate limit Camada 2 (Upstash Redis) — plano de migração (SEG-5)

Status: **preparado e documentado; ativação ESCALADA ao Rafael** (gera custo
recorrente e exige aprovação de orçamento). Não ativar sem decisão explícita.

## Por que não está ativo

A Camada 1 (in-memory por instância, `src/infrastructure/security/rate-limit.ts`)
é suficiente para o MVP. A Camada 2 só se justifica sob carga real distribuída
(múltiplas instâncias/regions na Vercel), porque a Camada 1 reseta a cada deploy
e não é compartilhada entre instâncias.

Dois bloqueios para ativar agora:

1. **Custo recorrente**: Upstash Redis é serviço externo pago (mesmo no tier
   gratuito, vira dependência operacional e custo ao escalar). Pela matriz de
   autonomia da OS, isso escala para o Rafael.
2. **Contrato síncrono**: `consumirRateLimit` hoje é **síncrono** (Map em
   memória). O Upstash REST é **assíncrono** (I/O de rede). Ativar exige tornar a
   checagem `async` em todas as rotas que a consomem — mudança transversal que só
   vale a pena no momento da ativação real, não antes.

## Pré-requisitos para ativar

1. Rafael aprova o orçamento e cria o projeto Upstash (Redis serverless).
2. Variáveis de ambiente (produção): `UPSTASH_REDIS_REST_URL`,
   `UPSTASH_REDIS_REST_TOKEN`. Nunca versionar; seguir `governo.md` (.env fora do git).

## Passos de implementação (quando aprovado)

1. Introduzir um port `RateLimitStore` **assíncrono**:
   `consumir(config, chave): Promise<ResultadoRateLimit>`.
2. Duas implementações:
   - `MemoriaRateLimitStore` — embrulha o token bucket atual (já pronto).
   - `UpstashRateLimitStore` — token bucket via script Lua atômico no Redis
     (evita race entre `GET`/`SET`), com a MESMA semântica de refil proporcional.
3. Seleção por ambiente: se `UPSTASH_REDIS_REST_URL` presente → Upstash; senão →
   memória (degrada com segurança em dev e se o Redis cair: fail-open vs fail-closed
   é decisão de segurança a registrar — recomendação: fail-open com log SIEM, para
   não derrubar o serviço por indisponibilidade do Redis).
4. Tornar `consumirRateLimit` async e `await` nos ~8 call-sites (rotas de triagem,
   inventário ANA, login, cron). Atualizar testes.
5. Manter as `POLITICAS` e `aplicarHeadersRateLimit` inalteradas (contrato externo
   preservado).

## Limitação da Camada 1 (aceita até a ativação)

- Reset por deploy (cada instância tem seu próprio `Map`).
- Não distribuído entre regions.
- Mitigação atual: limite por-usuário (chave = `userId`) é a defesa primária; o
  IP é camada secundária para tráfego pré-autenticação. Suficiente para o volume
  de um órgão estadual no MVP.

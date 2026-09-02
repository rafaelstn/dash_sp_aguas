# syntax=docker/dockerfile:1.7
#
# Dashboard SP Águas - DMO (Next.js 15 standalone).
# Imagem base da entrega on-prem PRODESP. Multi-stage para imagem final enxuta
# (~150 MB) rodando como usuário sem privilégio. Ver ADR-0015.
#
# Build:  docker build -t spaguas/dashboard .
# (o compose já faz isso; este Dockerfile é referenciado por docker-compose.yml)
#
# ---------------------------------------------------------------------------
# A VERSÃO DO NODE NÃO PODE VOLTAR PARA A 20, e o motivo não é preferência.
# ---------------------------------------------------------------------------
# A rede do órgão só deixa sair pela internet através de um proxy corporativo,
# e o `fetch` nativo do Node NÃO lê HTTP_PROXY/HTTPS_PROXY do ambiente por
# conta própria (diferente do axios, que lê). Medido em 02/09/2026 com um
# proxy local que conta conexões recebidas:
#
#   node:20-alpine (v20.20.2)                        0 conexões  -> foi direto
#   node:24-alpine (v24.20.0) sem a opção            0 conexões  -> foi direto
#   node:24-alpine + NODE_USE_ENV_PROXY=1            1 conexão   -> usou o proxy
#
# "Foi direto" no servidor do órgão significa que o firewall engole o pacote e
# a chamada fica pendurada até estourar o tempo limite, sem erro que diga o que
# houve. Voltar para a 20 devolve exatamente esse sintoma, e ele é caro de
# diagnosticar porque parece defeito de código.

# ---------------------------------------------------------------------------
# Estágio 1 — dependências (cache estável: só reinstala quando lockfile muda)
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
# libc6-compat: o Next/sharp espera glibc; no Alpine é preciso o shim.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Estágio 2 — build (gera .next/standalone com DOCKER_BUILD=1)
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# DOCKER_BUILD=1 ativa `output: 'standalone'` no next.config.ts (no-op na Vercel).
ENV DOCKER_BUILD=1
ENV NEXT_TELEMETRY_DISABLED=1
# NEXT_PUBLIC_* são embutidos no bundle em tempo de build. Se a URL pública
# mudar entre ambientes (homologação/PRODESP), rebuildar com o --build-arg.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Identidade. Estes dois JÁ eram passados pelo docker-compose.yml em `build.args`
# e eram DESCARTADOS em silêncio, porque não existia `ARG` correspondente aqui:
# argumento de build sem ARG declarado não vira variável nenhuma, e o BuildKit
# só avisa. Sem eles, `getEnv()` reprova o build (env.ts, linhas 55-59) e, mesmo
# que passasse, o middleware sairia com a identidade indefinida no pacote.
#
# ATENÇÃO, e isto NÃO é detalhe: ao contrário de DATABASE_URL, estes dois são
# lidos por nome literal em src/middleware.ts (linhas 125-126), que roda no
# runtime Edge. O Next SUBSTITUI a leitura pelo valor no momento do build. O que
# entrar aqui fica GRAVADO no pacote e vence a variável de ambiente do container
# em produção. Por isso eles não podem receber valor de faz de conta: rebuildar
# é a única forma de trocá-los.
ARG NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY

# Banco: valor de fachada, válido SÓ durante o build.
#
# Por que é preciso: `next build` roda com NODE_ENV=production e, na etapa
# "Collecting page data", carrega cada rota de servidor. Isso avalia
# src/infrastructure/repositories.ts na linha 66, que chama `getEnv()` em escopo
# de módulo; sem DATABASE_URL o env.ts joga "DATABASE_URL é obrigatória em
# produção" e o build inteiro cai. Medido em 27/08/2026: falha em
# "Failed to collect page data for /api/cron/anonimizar-trilha".
#
# Por que é seguro, e são três motivos independentes:
#   1. Nenhuma conexão é aberta. O cliente do banco é um Proxy preguiçoso
#      (src/infrastructure/db/client.ts): só o primeiro uso de `sql` instancia,
#      e a coleta de metadados do Next não executa consulta nenhuma.
#   2. Não é NEXT_PUBLIC_, então não é substituída em pacote nenhum. O env.ts lê
#      o objeto `process.env` inteiro, e não por nome literal, o que é leitura
#      em tempo de EXECUÇÃO.
#   3. Não sobrevive ao estágio. O `runner` parte de uma imagem nova e declara
#      só as próprias variáveis. Conferir na imagem pronta, e este comando
#      precisa devolver VAZIO:
#        docker image inspect <imagem> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep DATABASE_URL
#
# Correção definitiva é de aplicação e está apontada, não aplicada: o env.ts
# deveria dispensar a checagem quando `NEXT_PHASE=phase-production-build`, ou o
# repositories.ts deveria escolher a implementação na primeira chamada em vez de
# na carga do módulo. Enquanto isso não for decidido, a fachada é o que mantém a
# imagem construível.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build

# Identidade: mesma mecânica da DATABASE_URL acima, e pelo mesmo motivo.
#
# A etapa "Collecting page data" avalia `getEnv()` com NODE_ENV=production, e
# ali a aplicação exige OU as duas variáveis do Supabase, OU a janela sem
# identidade declarada (ADR-0024). Como o Supabase saiu, sem isto o build para
# com "NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY são
# obrigatórias em produção", e a imagem não se constrói.
#
# Seguro pelos mesmos três motivos da DATABASE_URL, e o segundo é o que mais
# importa: NENHUMA das três leva o prefixo NEXT_PUBLIC_, então não são gravadas
# em pacote nenhum, são lidas em tempo de execução, e o estágio `runner` parte
# de uma imagem nova que não herda estas. Quem decide a janela em produção é o
# /etc/spaguas-dmo/app.env, nunca a imagem. Conferir na imagem pronta, e este
# comando precisa devolver VAZIO:
#   docker image inspect <imagem> --format '{{range .Config.Env}}{{println .}}{{end}}' | grep ACESSO_SEM_IDENTIDADE
ENV ACESSO_SEM_IDENTIDADE=sim
ENV ACESSO_SEM_IDENTIDADE_MOTIVO="Valor de fachada, valido apenas durante o build da imagem."
ENV ACESSO_SEM_IDENTIDADE_REVISAR_EM=2099-12-31

RUN npm run build

# ---------------------------------------------------------------------------
# Estágio 3 — runtime (mínimo, non-root, somente o standalone)
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# HOSTNAME=0.0.0.0 é obrigatório para o server standalone aceitar conexões
# de fora do container (default 'localhost' só responde dentro dele).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
# Faz o `fetch` nativo respeitar HTTP_PROXY / HTTPS_PROXY / NO_PROXY (ver o
# bloco no topo deste arquivo). Fica ligado NA IMAGEM de propósito: se
# dependesse de alguém lembrar de escrevê-la no app.env, o esquecimento não
# produziria erro nenhum, só requisições que somem. Sem HTTP_PROXY definido
# ela não tem efeito, então é inofensiva em ambiente sem proxy.
ENV NODE_USE_ENV_PROXY=1

# Usuário sem privilégio (defesa em profundidade — exigência de hardening gov).
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# O standalone traz server.js + node_modules tracados. public/ e .next/static
# NÃO são incluídos pelo standalone — copiamos à mão (senão faltam assets e SW).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# Healthcheck usa o endpoint real (/api/health faz SELECT 1 no banco).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]

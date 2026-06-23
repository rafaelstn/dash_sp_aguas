# syntax=docker/dockerfile:1.7
#
# Dashboard SP Águas - DMO (Next.js 15 standalone).
# Imagem base da entrega on-prem PRODESP. Multi-stage para imagem final enxuta
# (~150 MB) rodando como usuário sem privilégio. Ver ADR-0015.
#
# Build:  docker build -t spaguas/dashboard .
# (o compose já faz isso; este Dockerfile é referenciado por docker-compose.yml)

# ---------------------------------------------------------------------------
# Estágio 1 — dependências (cache estável: só reinstala quando lockfile muda)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS deps
# libc6-compat: o Next/sharp espera glibc; no Alpine é preciso o shim.
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# Estágio 2 — build (gera .next/standalone com DOCKER_BUILD=1)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder
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

RUN npm run build

# ---------------------------------------------------------------------------
# Estágio 3 — runtime (mínimo, non-root, somente o standalone)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# HOSTNAME=0.0.0.0 é obrigatório para o server standalone aceitar conexões
# de fora do container (default 'localhost' só responde dentro dele).
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

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

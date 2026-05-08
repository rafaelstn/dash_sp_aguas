/**
 * Setup global do Vitest — roda uma vez antes de todos os testes.
 *
 * Responsabilidades:
 *   1. Neutralizar `import 'server-only'` em módulos como `rate-limit.ts`.
 *      O Next exporta `'server-only'` como módulo virtual que jogaria erro
 *      em ambiente de teste fora do bundle Next. Resolvemos via alias
 *      controlado em `vi.mock`.
 *   2. Garantir `process.env.NODE_ENV` previsível.
 *   3. Travar o relógio em horário fixo só nos testes que pedirem
 *      explicitamente — aqui não fazemos `vi.useFakeTimers()` global porque
 *      quebraria o token-bucket do rate-limit que mede tempo real.
 */
import { vi } from 'vitest';

// Mock de `server-only` para evitar erro de import durante teste de
// `rate-limit.ts`. O módulo real é vazio em runtime mas jogaria via Next.
vi.mock('server-only', () => ({}));

// Env mínimas para os testes do cron (compareSecretsConstantTime).
// `CRON_SECRET` precisa ter ≥ 32 chars senão a rota retorna 500.
if (!process.env.CRON_SECRET) {
  process.env.CRON_SECRET = '0123456789abcdef0123456789abcdef';
}

// Bug conhecido do mock (gap em docs/qa/regression-sprint-1.md):
//   `triagem-repository.mock.ts::listarEventos` quebra com TypeError
//   porque `clonar` (JSON.parse/stringify) transforma Date em string,
//   e o `.sort` chama `.getTime()` que não existe em string.
//
// Como Thiago não pode tocar `src/infrastructure/`, os testes evitam
// `listarEventos` nos asserts e validam o efeito do evento via estado
// observável da ficha (motivoDecisao, decididaPor, fichaVisitaId).
// Owner do fix: Lucas — trocar `clonar` por versão que preserve Date.

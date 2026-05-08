import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));

/**
 * Configuração Vitest — Sprint 1.S3 (Thiago/QA).
 *
 * Decisões:
 *   - `environment: 'node'` — todo código sob teste é puro/server-side. Não
 *     mexemos com componentes React nesta sprint.
 *   - alias `@/*` → `src/*` espelha o `tsconfig.json` para os imports dos
 *     use cases / domínio funcionarem dentro dos testes.
 *   - `setupFiles` neutraliza módulos com `import 'server-only'` (rate-limit)
 *     e injeta env mínima de runtime.
 *   - cobertura via v8 — alvo: 90% no domínio, 80% nos use cases.
 *   - `pool: 'forks'` — isola processos pra evitar contaminação entre testes
 *     que mexem com Map/array singleton dos mocks (`_resetTriagemMock`).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    // Vitest 4 trouxe poolOptions pra top-level. Forks com singleFork=true
    // garante isolamento mas mantém estado de mocks consistente entre testes
    // do mesmo arquivo (fileParallelism mantido false para evitar contaminação
    // do `_resetTriagemMock` que vive em singleton de módulo).
    pool: 'forks',
    fileParallelism: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: {
      junit: './coverage/junit.xml',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: [
        'src/domain/triagem.ts',
        'src/domain/triagem-evento.ts',
        'src/application/use-cases/triagem/**/*.ts',
        'src/infrastructure/security/rate-limit.ts',
      ],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',
      ],
      thresholds: {
        // Alvos pedidos no briefing — domínio mais alto, use cases um pouco
        // abaixo. Funções e linhas separadas para detectar branch não testado.
        'src/domain/triagem.ts': {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
        'src/application/use-cases/triagem/**/*.ts': {
          lines: 80,
          functions: 80,
          branches: 75,
          statements: 80,
        },
      },
    },
  },
});

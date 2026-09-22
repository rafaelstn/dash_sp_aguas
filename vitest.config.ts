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
  // O tsconfig do Next usa `jsx: 'preserve'`, porque quem transforma o JSX lá
  // é o SWC. Dentro do Vitest quem transforma é o oxc do Vite 8, que lê o mesmo
  // tsconfig e por isso entregaria JSX cru ao Node ("content contains invalid
  // JS syntax"). O bloco abaixo vale só para a execução de teste e não toca o
  // build de produção. É `oxc` e não `esbuild`: o Vite 8 ignora o segundo e
  // avisa que ignorou, o que deixaria o JSX quebrado do mesmo jeito.
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: 'react',
    },
  },
  test: {
    globals: false,
    // Vitest 4 trouxe poolOptions pra top-level. Forks com singleFork=true
    // garante isolamento mas mantém estado de mocks consistente entre testes
    // do mesmo arquivo (fileParallelism mantido false para evitar contaminação
    // do `_resetTriagemMock` que vive em singleton de módulo).
    pool: 'forks',
    fileParallelism: false,
    // Dois projetos, e não um `environment` único, porque o jsdom custa caro e
    // não serve para nada nos 1300 testes de domínio, rota e SQL. A separação é
    // pela EXTENSÃO do arquivo: `.test.ts` roda em node, `.test.tsx` roda em
    // jsdom. Assim ninguém precisa lembrar de cadastrar caminho novo.
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.test.ts'],
          setupFiles: ['tests/setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'componentes',
          environment: 'jsdom',
          include: ['tests/**/*.test.tsx'],
          setupFiles: ['tests/setup.ts', 'tests/setup-dom.ts'],
        },
      },
    ],
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

// @ts-check
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * ESLint flat config (formato oficial do ESLint 9+). Reaproveita os
 * presets legacy que o Next ainda distribui em eslintrc style via o
 * adaptador FlatCompat. Quando next > 16 publicar configs flat nativas,
 * substituir o `compat.extends` por imports diretos.
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const config = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'public/sw.js',
      'public/sw.js.map',
      'public/workbox-*.js',
      'public/workbox-*.js.map',
      'ops/indexer/**',
      'scripts/*.py',
      'next-env.d.ts',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript', 'plugin:jsx-a11y/recommended'),

  {
    rules: {
      'jsx-a11y/alt-text': 'error',
      'jsx-a11y/anchor-has-content': 'error',
      'jsx-a11y/aria-props': 'error',
      'jsx-a11y/aria-role': 'error',
      'jsx-a11y/heading-has-content': 'error',
      'jsx-a11y/html-has-lang': 'error',
      'jsx-a11y/label-has-associated-control': 'error',
      'jsx-a11y/no-autofocus': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },

  // Clean Architecture: rotas (src/app) e use cases (src/application) não
  // podem importar adapters concretos de `src/infrastructure/db/*`. Devem
  // passar pelo hub `@/infrastructure/repositories`.
  {
    files: ['src/app/**', 'src/application/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/infrastructure/db/*'],
              message:
                'Clean Architecture: rotas e use cases acessam Postgres apenas via @/infrastructure/repositories. Importar @/infrastructure/db/* aqui vaza detalhe do adapter (consulte ADR-0012).',
            },
          ],
        },
      ],
    },
  },

  // Exceções conscientes: o hub e os adapters precisam importar de
  // infrastructure/db, e dois arquivos legacy mantêm sql cru por
  // razões documentadas (ver commit d8e1d37).
  {
    files: [
      'src/infrastructure/repositories.ts',
      'src/infrastructure/db/**',
      'src/app/api/health/route.ts',
      'src/application/use-cases/inventario-ana/exportar.ts',
    ],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

export default config;

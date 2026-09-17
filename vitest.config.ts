// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    setupFiles: [], // optional, see below
    include: ['packages/**/*.(test|spec).{ts,tsx}', 'apps/**/*.(test|spec).{ts,tsx}'],
    // operator-ui owns its own Playwright e2e specs; vitest can't run them
    // (they call @playwright/test's test.use(), which only works under the
    // Playwright runner). Run them via `pnpm --filter @citrineos/operator-ui test:e2e`.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      'apps/operator-ui/**',
      'apps/mock-msp/**',
    ],
    // The testcontainers-backed integration suites annotate their beforeAll
    // with 90s but leave beforeEach/afterAll on the 5s/10s defaults, which CI
    // load intermittently blows (truncate cascade, container stop). Raised
    // globally — passing unit suites never wait on a timeout, this only
    // bounds failures.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    // Keep package-name shims for unbuilt workspace packages and explicit aliases
    // for legacy imports used across packages during transition.
    alias: {
      '@': fileURLToPath(new URL('./packages/core/src', import.meta.url)),
      '@test': fileURLToPath(new URL('./packages/core/test', import.meta.url)),
      '@dal': fileURLToPath(new URL('./packages/core/src/dal', import.meta.url)),
      '@handlers': fileURLToPath(new URL('./packages/core/src/handlers', import.meta.url)),
      '@modules': fileURLToPath(new URL('./packages/core/src/modules', import.meta.url)),
      '@util': fileURLToPath(new URL('./packages/core/src/util', import.meta.url)),
      '@ocpp': fileURLToPath(new URL('./packages/base/src/ocpp', import.meta.url)),
      '@config': fileURLToPath(new URL('./packages/base/src/config', import.meta.url)),
      '@interfaces/dto': fileURLToPath(
        new URL('./packages/types/src/interfaces/dto', import.meta.url),
      ),
      '@interfaces': fileURLToPath(new URL('./packages/base/src/interfaces', import.meta.url)),
      '@base-util': fileURLToPath(new URL('./packages/base/src/util', import.meta.url)),
      '@citrineos/core': fileURLToPath(new URL('./packages/core/index.ts', import.meta.url)),
      '@citrineos/base': fileURLToPath(new URL('./packages/base/index.ts', import.meta.url)),
      '@citrineos/types': fileURLToPath(new URL('./packages/types/index.ts', import.meta.url)),
      '@citrineos/ocpi-base': fileURLToPath(
        new URL('./packages/ocpi-base/src/index.ts', import.meta.url),
      ),
    },
  },
});

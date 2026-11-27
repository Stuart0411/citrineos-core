// SPDX-FileCopyrightText: 2025 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'url';

const posixPath = (relativePath: string) =>
  fileURLToPath(new URL(relativePath, import.meta.url)).replace(/\\/g, '/');

const workspaceAliases = [
  {
    find: /^@interfaces\//,
    replacement: posixPath('./packages/base/src/interfaces/'),
  },
  {
    find: /^@config\//,
    replacement: posixPath('./packages/base/src/config/'),
  },
  {
    find: /^@ocpp\//,
    replacement: posixPath('./packages/base/src/ocpp/'),
  },
  {
    find: /^@base-util\//,
    replacement: posixPath('./packages/base/src/util/'),
  },
  {
    find: '@dal/layers/sequelize/index.js',
    replacement: posixPath('./core/test/shims/dal-sequelize-index.ts'),
  },
  {
    find: '@dal/layers/sequelize/mapper/2.0.1/index.js',
    replacement: posixPath('./core/test/shims/dal-mapper-2.0.1-index.ts'),
  },
  {
    find: /^@dal\//,
    replacement: posixPath('./packages/core/src/dal/'),
  },
  {
    find: /^@handlers\//,
    replacement: posixPath('./packages/core/src/handlers/'),
  },
  {
    find: /^@modules\//,
    replacement: posixPath('./packages/core/src/modules/'),
  },
  {
    find: /^@util\//,
    replacement: posixPath('./packages/core/src/util/'),
  },
  {
    find: /^@test\//,
    replacement: posixPath('./packages/core/test/'),
  },
  {
    find: /^@\//,
    replacement: posixPath('./packages/core/src/'),
  },
  {
    find: '@citrineos/core',
    replacement: posixPath('./packages/core/index.ts'),
  },
  {
    find: '@citrineos/base',
    replacement: posixPath('./core/test/shims/citrineos-base.ts'),
  },
  {
    find: '@citrineos/types',
    replacement: posixPath('./packages/types/dist/index.js'),
  },
];

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: [], // optional, see below
    include: ['**/*.(test|spec).{ts,tsx}'],
    // operator-ui owns its own Playwright e2e specs; vitest can't run them
    // (they call @playwright/test's test.use(), which only works under the
    // Playwright runner). Run them via `pnpm --filter @citrineos/operator-ui test:e2e`.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**', 'apps/operator-ui/**'],
    // The testcontainers-backed integration suites annotate their beforeAll
    // with 90s but leave beforeEach/afterAll on the 5s/10s defaults, which CI
    // load intermittently blows (truncate cascade, container stop). Raised
    // globally — passing unit suites never wait on a timeout, this only
    // bounds failures.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    alias: workspaceAliases,
    coverage: {
      reporter: ['text', 'json', 'html'],
    },
  },
  resolve: {
    // Package aliases used by cross-workspace imports in tests.
    alias: workspaceAliases,
  },
});

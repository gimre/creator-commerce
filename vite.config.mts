// vitest.config.mts
import { defineConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    projects: [
      {
        extends: true,
        // The node environment runs in Vite's `ssr` environment, which reads
        // `ssr.resolve.conditions` — a top-level `resolve.conditions` only
        // reaches the client environment. Setting conditions replaces Vite's
        // server defaults, so they are restated after react-server.
        ssr: {
          resolve: {
            conditions: ['react-server', 'module', 'node', 'development|production'],
          },
        },
        test: {
          name: 'server',
          environment: 'node',
          // server-only lives in node_modules, so Vitest would externalize it
          // and Node would load it with default conditions — its index.js,
          // which throws. Inlining it sends it through Vite's resolver, which
          // picks the react-server export (empty.js), as Next's server
          // bundles do.
          server: { deps: { inline: ['server-only'] } },
          include: ['lib/**/*.test.ts', 'scripts/**/*.test.ts', 'test/**/*.test.ts'],
          exclude: ['lib/client/**'],
        },
      },
      {
        extends: true,
        test: {
          name: 'client',
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
          },
          include: ['components/**/*.test.tsx', 'lib/client/**/*.test.ts'],
        },
      },
    ],
  },
})
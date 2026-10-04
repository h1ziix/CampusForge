import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    ['json', { outputFile: resolve(__dirname, 'docs/releases/R2-evidence/browser-results.json') }],
  ],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:3217',
    viewport: { width: 390, height: 844 },
    // Original date UI follows host locale; use a matching synthetic SSR/browser locale.
    locale: 'ru-RU',
    trace: 'retain-on-failure',
  },
  webServer: {
    cwd: __dirname,
    command: 'node scripts/next-runtime-fixture.mjs dev --webpack --hostname 127.0.0.1 --port 3217',
    url: 'http://127.0.0.1:3217',
    reuseExistingServer: false,
    timeout: 120_000,
  },
});

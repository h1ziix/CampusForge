import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

export const formatPatterns = [
  'apps/*/src/**/*.{ts,tsx,css}',
  'apps/*/tests/**/*.{ts,mjs,cjs}',
  'apps/*/scripts/**/*.{mjs,cjs}',
  'apps/*/{package.json,tsconfig*.json,*.config.{ts,mjs},components.json}',
  'packages/*/src/**/*.ts',
  'packages/*/tests/**/*.{ts,mjs}',
  'packages/*/{package.json,tsconfig*.json}',
  'scripts/**/*.{mjs,cjs,ts}',
  'tests/**/*.{ts,tsx,mjs,cjs,json,css}',
  '.github/workflows/*.{yml,yaml}',
  'docs/releases/**/*.md',
  '{package.json,tsconfig*.json,turbo.json,eslint.config.mjs,playwright.config.ts,README.md}',
  '.prettierrc',
];

const mode = process.argv[2];
if (!['--write', '--check'].includes(mode)) {
  throw new Error('Usage: node scripts/format.mjs --write|--check');
}
const prettier = resolve('node_modules/prettier/bin/prettier.cjs');
const result = spawnSync(
  process.execPath,
  [prettier, mode, '--ignore-unknown', ...formatPatterns],
  {
    stdio: 'inherit',
  },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);

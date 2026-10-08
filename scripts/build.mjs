import { spawnSync } from 'node:child_process';
import { validateEnvironment } from '../packages/shared/src/env.ts';
import { dirname, isAbsolute } from 'node:path';
import { createRequire } from 'node:module';

// Generation and package builds are explicit prerequisites, including a fresh checkout.
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run this command through pnpm build.');
validateEnvironment('build');
const stagedSchema = process.env.R4_PRISMA_STAGED_SCHEMA;
if (stagedSchema && !isAbsolute(stagedSchema))
  throw new Error('Staged Prisma schema must be absolute.');
const generation = stagedSchema
  ? [
      createRequire(new URL('../packages/db/package.json', import.meta.url)).resolve(
        'prisma/build/index.js',
      ),
      'generate',
      '--schema',
      stagedSchema,
    ]
  : [pnpmCli, 'db:generate'];
for (const args of [generation, [pnpmCli, 'exec', 'turbo', 'build', ...process.argv.slice(2)]]) {
  const result = spawnSync(process.execPath, args, {
    stdio: 'inherit',
    env: process.env,
    ...(stagedSchema && args === generation ? { cwd: dirname(stagedSchema) } : {}),
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

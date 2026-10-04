import { spawnSync } from 'node:child_process';
import { validateEnvironment } from '../packages/shared/src/env.ts';

// Generation and package builds are explicit prerequisites, including a fresh checkout.
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run this command through pnpm build.');
validateEnvironment('build');
for (const args of [['db:generate'], ['exec', 'turbo', 'build', ...process.argv.slice(2)]]) {
  const result = spawnSync(process.execPath, [pnpmCli, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

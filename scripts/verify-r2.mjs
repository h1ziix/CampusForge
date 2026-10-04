import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(root, 'docs/releases/R2-evidence');
mkdirSync(evidence, { recursive: true });
const require = createRequire(import.meta.url);
const pnpm = process.env.npm_execpath || require.resolve('pnpm/bin/pnpm.cjs');
const environment = {};
for (const key of [
  'PATH',
  'Path',
  'PATHEXT',
  'ComSpec',
  'COMSPEC',
  'SystemRoot',
  'SYSTEMROOT',
  'WINDIR',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'HOME',
  'APPDATA',
  'LOCALAPPDATA',
]) {
  if (process.env[key]) environment[key] = process.env[key];
}
Object.assign(environment, {
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  TURBO_TELEMETRY_DISABLED: '1',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:65432/synthetic',
});
const artifact = {
  date: '2026-10-05',
  timezone: 'Asia/Qyzylorda',
  node: process.version,
  platform: process.platform,
  boundary:
    'Current checkout; synthetic DATABASE_URL; runtime secrets not inherited; no DB migrations',
  results: [],
};
const checks = [
  ['db:generate'],
  ['db:validate'],
  ['typecheck'],
  ['lint'],
  ['format:check'],
  ['test'],
  ['env:probe'],
  ['build', '--force'],
];
for (const [index, args] of checks.entries()) {
  const began = Date.now();
  console.log(`R2 check ${index + 1}/${checks.length}: pnpm ${args.join(' ')}`);
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const log = `${String(index + 1).padStart(2, '0')}-${args[0].replace(':', '-')}.log`;
  writeFileSync(resolve(evidence, log), (result.stdout ?? '') + (result.stderr ?? ''));
  artifact.results.push({
    command: `pnpm ${args.join(' ')}`,
    exitCode: result.status,
    signal: result.signal,
    durationMs: Date.now() - began,
    log,
    ...(result.error ? { error: result.error.message } : {}),
  });
  writeFileSync(
    resolve(evidence, 'quality-results.json'),
    JSON.stringify(artifact, null, 2) + '\n',
  );
  console.log(`Exit ${result.status}; log docs/releases/R2-evidence/${log}`);
}
if (artifact.results.at(-1)?.exitCode === 0) {
  const began = Date.now();
  console.log('R2 actual compiled middleware/session smoke');
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/probe-r2-middleware.mjs')], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 90_000,
  });
  const log = '09-production-middleware.log';
  writeFileSync(resolve(evidence, log), (result.stdout ?? '') + (result.stderr ?? ''));
  artifact.results.push({
    command: 'node scripts/probe-r2-middleware.mjs',
    exitCode: result.status,
    durationMs: Date.now() - began,
    log,
  });
  writeFileSync(
    resolve(evidence, 'quality-results.json'),
    JSON.stringify(artifact, null, 2) + '\n',
  );
  console.log(`Exit ${result.status}; log docs/releases/R2-evidence/${log}`);
}
if (artifact.results.some((result) => result.exitCode !== 0)) process.exitCode = 1;

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(root, 'docs/releases/R3-evidence');
mkdirSync(evidence, { recursive: true });
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('R3 gate requires Node 24');
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
  BROWSER_RESULTS_PATH: 'docs/releases/R3-evidence/browser-results.json',
  R2_BROWSER_EVIDENCE_PATH: 'docs/releases/R3-evidence/r2-browser-regression',
});
const artifact = {
  date: '2026-10-05',
  timezone: 'Asia/Qyzylorda',
  node: process.version,
  boundary: 'Synthetic gate only; no real .env, migration, or provider calls',
  results: [],
};
for (const [index, args] of [
  ['db:generate'],
  ['db:validate'],
  ['typecheck'],
  ['lint'],
  ['format:check'],
  ['test'],
  ['env:probe'],
  ['build', '--force'],
].entries()) {
  console.log(`R3 check ${index + 1}/8: pnpm ${args.join(' ')}`);
  const began = Date.now();
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    cwd: root,
    env: environment,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 32 * 1024 * 1024,
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
  console.log(`Exit ${result.status}; ${log}`);
}
if (artifact.results.some((result) => result.exitCode !== 0)) process.exitCode = 1;

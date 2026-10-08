import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stagedPrismaMigrations } from '../tests/fixtures/r4-infrastructure.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(root, 'docs/releases/R4-evidence');
mkdirSync(evidence, { recursive: true });
if (Number(process.versions.node.split('.')[0]) !== 24) throw new Error('R4 gate requires Node 24');
const require = createRequire(import.meta.url);
const pnpm = process.env.npm_execpath || require.resolve('pnpm/bin/pnpm.cjs');
const requireDB = createRequire(resolve(root, 'packages/db/package.json'));
const stage = await stagedPrismaMigrations();
// Generation writes only the known generated-code directory. CLI cwd/schema are
// isolated so Prisma cannot discover the real repository .env.
writeFileSync(
  stage.schema,
  readFileSync(stage.schema, 'utf8').replace(
    'output   = "../generated/client"',
    `output   = "${resolve(root, 'packages/db/generated/client').replaceAll('\\', '/')}"`,
  ),
);
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
  BROWSER_RESULTS_PATH: 'docs/releases/R4-evidence/browser-results.json',
  R2_BROWSER_EVIDENCE_PATH: 'docs/releases/R4-evidence/r2-browser-regression',
  R3_BROWSER_EVIDENCE_PATH: 'docs/releases/R4-evidence/r3-browser-regression',
  R4_PRISMA_STAGED_SCHEMA: stage.schema,
});
const artifact = {
  date: '2026-10-08',
  timezone: 'Asia/Qyzylorda',
  node: process.version,
  boundary: 'Synthetic gate only; no real .env, migration, or provider calls',
  results: [],
};
try {
  for (const [index, args] of [
    ['db:generate'],
    ['db:validate'],
    ['build:packages'],
    ['typecheck'],
    ['lint'],
    ['format:check'],
    ['test'],
    ['env:probe'],
    ['build', '--force'],
  ].entries()) {
    console.log(`R4 check ${index + 1}/9: pnpm ${args.join(' ')}`);
    const began = Date.now();
    const isPrisma = ['db:generate', 'db:validate'].includes(args[0]);
    const command = isPrisma
      ? [requireDB.resolve('prisma/build/index.js'), args[0].slice(3), '--schema', stage.schema]
      : [pnpm, ...args];
    const result = spawnSync(process.execPath, command, {
      cwd: isPrisma ? stage.directory : root,
      env: environment,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
    });
    const log = `${String(index + 1).padStart(2, '0')}-${args[0].replace(':', '-')}.log`;
    writeFileSync(resolve(evidence, log), (result.stdout ?? '') + (result.stderr ?? ''));
    artifact.results.push({
      command: isPrisma
        ? `prisma ${args[0].slice(3)} --schema <isolated-copy>`
        : `pnpm ${args.join(' ')}`,
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
} finally {
  await stage.clean();
}
if (artifact.results.some((result) => result.exitCode !== 0)) process.exitCode = 1;

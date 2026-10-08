import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidence = resolve(root, 'docs/releases/R3-evidence');
const release = resolve(tmpdir(), `campusforge-r3-release-${randomUUID()}`);
const pnpm = process.env.npm_execpath;
assert.ok(pnpm, 'Run this probe using pnpm verify:r3:release');
assert.equal(Number(process.versions.node.split('.')[0]), 24);
mkdirSync(evidence, { recursive: true });
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
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:65432/synthetic',
});
const result = {
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  release,
  boundary: 'Fresh compiled artifact; synthetic unavailable endpoints; no user migration or AI',
  checks: [],
};
function save() {
  writeFileSync(resolve(evidence, 'release-results.json'), JSON.stringify(result, null, 2) + '\n');
}
function run(label, cwd, args) {
  console.log(label);
  const started = Date.now();
  const execution = spawnSync(process.execPath, args, {
    cwd,
    env: environment,
    encoding: 'utf8',
    timeout: 600_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  });
  const log = `release-${label}.log`;
  writeFileSync(resolve(evidence, log), (execution.stdout ?? '') + (execution.stderr ?? ''));
  result.checks.push({
    label,
    exitCode: execution.status,
    durationMs: Date.now() - started,
    log,
    ...(execution.error ? { error: execution.error.message } : {}),
  });
  save();
  assert.equal(execution.status, 0, `${label} failed; inspect ${log}`);
}

run('pack', root, [pnpm, 'release:pack', release]);
run('production-install', release, [
  pnpm,
  'install',
  '--prod',
  '--frozen-lockfile',
  '--ignore-scripts',
]);
const runtimeFiles = [
  'apps/worker/dist/index.js',
  'apps/worker/dist/lifecycle/dispatcher.js',
  'apps/worker/dist/lib/dispatch-queue.js',
  'apps/worker/dist/jobs/parse-document.js',
  'packages/db/dist/document-lifecycle.js',
];
result.compiledFiles = runtimeFiles.map((path) => ({
  path,
  sha256: createHash('sha256')
    .update(readFileSync(resolve(release, path)))
    .digest('hex'),
}));
const workerRequire = createRequire(resolve(release, 'apps/worker/package.json'));
assert.equal(typeof workerRequire('@campusforge/db').createDocumentLifecycle, 'function');
assert.equal(
  typeof workerRequire('./dist/lifecycle/dispatcher.js').createDocumentDispatcher,
  'function',
);
result.compiledLifecycleImports = true;
save();
run('runtime-probe', root, [resolve(root, 'scripts/probe-release.mjs'), release]);
result.passed = true;
save();
console.log(JSON.stringify({ passed: true, release, evidence }, null, 2));

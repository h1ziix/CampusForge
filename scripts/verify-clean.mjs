import { spawnSync } from 'node:child_process';
import { access, cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = await mkdtemp(path.join(tmpdir(), 'campusforge-r1-clean-'));
const evidence = path.join(root, 'docs/releases/evidence');
await mkdir(evidence, { recursive: true });
const attemptDirectory = path.join(evidence, 'clean-runs', path.basename(target));
await mkdir(attemptDirectory, { recursive: true });
for (const relative of [
  'apps',
  'packages',
  'scripts',
  'tests',
  '.github',
  'docs/releases',
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'tsconfig.json',
  'tsconfig.build.json',
  'turbo.json',
  '.gitignore',
  '.npmrc',
  '.nvmrc',
  '.prettierrc',
  '.prettierignore',
  'eslint.config.mjs',
  'playwright.config.ts',
  'README.md',
]) {
  await cp(path.join(root, relative), path.join(target, relative), {
    recursive: true,
    filter: (source) =>
      !path
        .relative(root, source)
        .split(path.sep)
        .some(
          (part) =>
            [
              'node_modules',
              '.next',
              '.turbo',
              'dist',
              'generated',
              '.r1-runtime-fixture',
              'evidence',
              'R1-evidence',
              'test-results',
              'playwright-report',
            ].includes(part) ||
            part === '.env' ||
            part === 'next-env.d.ts' ||
            part.startsWith('.env.') ||
            part.endsWith('.tsbuildinfo'),
        ),
  });
}
try {
  await access(path.join(target, '.env'));
  throw new Error('Unexpected .env in isolated snapshot');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const env = {};
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
  if (process.env[key]) env[key] = process.env[key];
}
Object.assign(env, {
  CI: '1',
  NEXT_TELEMETRY_DISABLED: '1',
  TURBO_TELEMETRY_DISABLED: '1',
  PRISMA_SKIP_POSTINSTALL_GENERATE: 'true',
});
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error('Run through pnpm verify:clean.');
const results = [];
console.log(`Clean snapshot: ${target}`);
const commands = [
  ['install', '--frozen-lockfile', '--store-dir', path.join(target, '.pnpm-store')],
  ['db:generate'],
  ['db:validate'],
  ['typecheck'],
  ['lint'],
  ['format:check'],
  ['exec', 'playwright', 'install', 'chromium'],
  ['test'],
  ['env:probe'],
  ['build', '--force'],
];
for (let index = 0; index < commands.length; index++) {
  const args = commands[index];
  const runEnv =
    args[0] === 'db:validate'
      ? { ...env, DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:15432/synthetic' }
      : env;
  console.log(`Running clean gate: pnpm ${args.join(' ')}`);
  const run = spawnSync(process.execPath, [pnpmCli, ...args], {
    cwd: target,
    env: runEnv,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  const commandSlug = args[0].replace(/[^a-z0-9-]/gi, '-');
  const logFile = path.posix.join(
    'clean-runs',
    path.basename(target),
    `${String(index).padStart(2, '0')}-${commandSlug}.log`,
  );
  await writeFile(
    path.join(evidence, logFile),
    (run.stdout ?? '') + (run.stderr ?? '') + (run.error?.message ?? ''),
  );
  results.push({ command: ['pnpm', ...args], exitCode: run.status, logFile });
  const summary = {
    target,
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    envCopied: false,
    oldModulesCopied: false,
    cachesCopied: false,
    dependencyStoreInitiallyEmpty: true,
    results,
  };
  await writeFile(
    path.join(evidence, 'r1-clean-results.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(`Gate exit: ${run.status}; log: docs/releases/evidence/${logFile}`);
  if (run.status !== 0) {
    process.stdout.write((run.stdout ?? '').slice(-7000));
    process.stderr.write((run.stderr ?? '').slice(-3000));
    process.exit(run.status ?? 1);
  }
}
console.log(`All clean gates passed. Built snapshot retained: ${target}`);

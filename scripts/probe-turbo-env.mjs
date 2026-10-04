import { spawnSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = await mkdtemp(path.join(tmpdir(), 'campusforge-r1-env-'));
for (const file of [
  'turbo.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.build.json',
  '.nvmrc',
]) {
  await cp(path.join(root, file), path.join(fixture, file));
}
const manifest = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
await writeFile(
  path.join(fixture, 'package.json'),
  JSON.stringify({
    name: manifest.name,
    private: true,
    packageManager: manifest.packageManager,
  }),
);
for (const scope of ['web', 'worker']) {
  const directory = path.join(fixture, 'apps', scope);
  await mkdir(directory, { recursive: true });
  await cp(path.join(root, 'scripts/probe-env.mjs'), path.join(directory, 'probe-env.mjs'));
  await writeFile(
    path.join(directory, 'package.json'),
    JSON.stringify({
      name: `@campusforge/${scope}`,
      version: '0.0.0',
      scripts: { dev: `node probe-env.mjs ${scope}` },
    }),
  );
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
  TURBO_TELEMETRY_DISABLED: '1',
  S3_ENDPOINT: 'http://127.0.0.1:19000',
  S3_REGION: 'synthetic-region',
  S3_BUCKET: 'synthetic-bucket',
  S3_ACCESS_KEY: 'synthetic-access',
  S3_SECRET_KEY: 'synthetic-secret',
  OPENAI_MODEL: 'synthetic-model',
  AUTH_RATE_LIMIT_TRUST_PROXY: 'false',
  AUTH_RATE_LIMIT_IP_HEADER: 'x-campusforge-client-ip',
});
const result = spawnSync(
  process.execPath,
  [
    path.join(root, 'node_modules/turbo/bin/turbo'),
    'run',
    'dev',
    '--env-mode=strict',
    '--filter=@campusforge/web',
    '--filter=@campusforge/worker',
  ],
  {
    cwd: fixture,
    env,
    encoding: 'utf8',
    timeout: 30000,
  },
);
process.stdout.write(result.stdout ?? '');
process.stderr.write(result.stderr ?? '');
if (result.status !== 0) process.exit(result.status ?? 1);
for (const scope of ['web', 'worker']) {
  if (!result.stdout.includes(`"scope":"${scope}"`))
    throw new Error(`Missing ${scope} probe execution`);
}
console.log('Actual Turbo dev task strict environment probe passed; values not logged.');

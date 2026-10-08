import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'apps/web');
const fixture = resolve(web, '.r1-runtime-fixture');
if (dirname(fixture) !== web)
  throw new Error('Fixture directory must stay inside the web workspace');
const sourceFiles = [
  'components/task/create-task-dialog.tsx',
  'components/task/task-form.tsx',
  'components/ui/button.tsx',
  'components/ui/dialog.tsx',
  'components/ui/input.tsx',
  'components/ui/label.tsx',
  'lib/utils.ts',
  'lib/use-client-ready.ts',
  'components/auth/sign-in-form.tsx',
  'components/auth/sign-up-form.tsx',
  'components/auth/sign-out-button.tsx',
  'components/auth/authenticated-privacy-boundary.tsx',
  'components/onboarding/onboarding-form.tsx',
  'lib/privacy.ts',
  'lib/use-privacy-lease.tsx',
  'lib/auth.ts',
  'lib/auth.config.ts',
  'lib/auth-errors.ts',
  'lib/auth-redirect.ts',
  'lib/auth-rate-limit.ts',
  'lib/markdown-url.ts',
  'lib/request-origin.ts',
  'types/next-auth.d.ts',
  'server/services/auth.ts',
  'server/services/auth-helpers.ts',
  'components/layout/theme-toggle.tsx',
  'components/document/document-detail-view.tsx',
  'components/document/document-status-badge.tsx',
  'components/document/upload-document-dialog.tsx',
  'lib/document-upload.ts',
  'components/workspace/sidebar-workspace-nav.tsx',
  'components/workspace/workspace-switcher.tsx',
  'components/workspace/create-workspace-dialog.tsx',
  'styles/globals.css',
];

// Only this fixed, generated directory is ever removed. No .env or user data is copied.
const command = process.argv[2] ?? 'dev';
if (!['dev', 'build', 'start'].includes(command)) throw new Error('Expected dev, build or start');
if (command !== 'start') {
  await rm(fixture, { recursive: true, force: true });
  await cp(resolve(root, 'tests/fixtures/next-runtime'), fixture, { recursive: true });
  for (const source of sourceFiles) {
    const target = resolve(fixture, 'src', source);
    await mkdir(dirname(target), { recursive: true });
    await cp(resolve(web, 'src', source), target);
  }
  await cp(resolve(root, 'packages/shared/src'), resolve(fixture, 'src/shared'), {
    recursive: true,
  });
  for (const source of [
    'components/ui',
    'components/assistant',
    'lib/assistant',
    'server/queries',
  ]) {
    await cp(resolve(web, 'src', source), resolve(fixture, 'src', source), { recursive: true });
  }
  await cp(resolve(web, 'tailwind.config.ts'), resolve(fixture, 'tailwind.config.ts'));
  await cp(resolve(web, 'postcss.config.mjs'), resolve(fixture, 'postcss.config.mjs'));
  await cp(
    resolve(web, 'src/server/actions/auth.ts'),
    resolve(fixture, 'src/server/actions/r2-auth-entrance.ts'),
  );
  const realOnboardingTarget = resolve(
    fixture,
    'src/components/onboarding/r2-onboarding-real-form.tsx',
  );
  await cp(resolve(web, 'src/components/onboarding/onboarding-form.tsx'), realOnboardingTarget);
  await writeFile(
    realOnboardingTarget,
    (await readFile(realOnboardingTarget, 'utf8')).replace(
      "from '@/server/actions/auth'",
      "from '@/server/actions/r2-auth-entrance'",
    ),
  );
  await cp(resolve(web, 'src/middleware.ts'), resolve(fixture, 'src/fixture/middleware.ts'));
  const uploadTarget = resolve(
    fixture,
    'src/app/api/workspaces/[workspaceId]/documents/upload/route.ts',
  );
  await mkdir(dirname(uploadTarget), { recursive: true });
  await cp(
    resolve(web, 'src/app/api/workspaces/[workspaceId]/documents/upload/route.ts'),
    uploadTarget,
  );
  // Explicit infrastructure mocks in the generated fixture only. The actual auth,
  // actions, provider, callbacks and limiter policy are copied from application source.
  // No production module is changed, no .env/real DB/Redis/S3/queue is loaded.
  for (const [file, original, replacement] of [
    ['lib/auth-rate-limit.ts', "from 'ioredis'", "from '@/fixture/redis'"],
    ['lib/auth.ts', "from 'bcryptjs'", "from '@/fixture/bcrypt'"],
    ['server/services/auth.ts', "from 'bcryptjs'", "from '@/fixture/bcrypt'"],
  ]) {
    const target = resolve(fixture, 'src', file);
    const source = await readFile(target, 'utf8');
    if (!source.includes(original)) throw new Error(`Fixture mock import changed: ${file}`);
    await writeFile(target, source.replace(original, replacement));
  }
}

const require = createRequire(resolve(web, 'package.json'));
const next = resolve(dirname(require.resolve('next/package.json')), 'dist/bin/next');
const systemKeys = [
  'PATH',
  'SystemRoot',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'LOCALAPPDATA',
  'APPDATA',
  'HOME',
];
const fixtureEnvironment = Object.fromEntries(
  systemKeys.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]),
);
const child = spawn(process.execPath, [next, command, ...process.argv.slice(3)], {
  cwd: fixture,
  env: {
    ...fixtureEnvironment,
    NEXT_TELEMETRY_DISABLED: '1',
    LANG: 'ru_RU.UTF-8',
    LC_ALL: 'ru_RU.UTF-8',
    AUTH_URL: 'http://127.0.0.1:3217',
    AUTH_SECRET: 'R2-disposable-fixture-secret-at-least-32-characters',
    AUTH_TRUST_HOST: 'true',
    REDIS_URL: 'redis://r2-in-memory-fixture.invalid:6379',
  },
  stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});

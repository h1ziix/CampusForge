import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const web = resolve(root, 'apps/web');
const evidence = resolve(root, 'docs/releases/R2-evidence');
await mkdir(evidence, { recursive: true });
const require = createRequire(resolve(web, 'package.json'));
const { encode } = await import(pathToFileURL(require.resolve('next-auth/jwt')).href);
const reservation = createServer();
await new Promise((done, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', done);
});
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const origin = `http://127.0.0.1:${port}`;
const secret = 'R2-middleware-only-synthetic-secret-at-least-32-characters';
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
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  AUTH_URL: origin,
  AUTH_SECRET: secret,
  AUTH_TRUST_HOST: 'true',
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:65432/synthetic',
  REDIS_URL: 'redis://127.0.0.1:65433',
  S3_ENDPOINT: 'http://127.0.0.1:65434',
  S3_REGION: 'synthetic-region',
  S3_BUCKET: 'synthetic-bucket',
  S3_ACCESS_KEY: 'synthetic-access',
  S3_SECRET_KEY: 'synthetic-secret',
});

const artifact = {
  node: process.version,
  boundary:
    'Actual compiled production Next server + original middleware matcher. Signed synthetic JWT fixtures minted by test; no credentials login, DB query or real infrastructure.',
  results: [],
};
let logs = '';
const child = spawn(
  process.execPath,
  [resolve(web, 'scripts/start.mjs'), '--port', String(port), '--hostname', '127.0.0.1'],
  {
    cwd: web,
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
child.stdout.on('data', (chunk) => {
  logs += chunk;
});
child.stderr.on('data', (chunk) => {
  logs += chunk;
});
let exited = false;
child.on('exit', () => {
  exited = true;
});
async function request(path, cookie) {
  return fetch(`${origin}${path}`, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
    signal: AbortSignal.timeout(10_000),
  });
}
async function cookieFor(onboardingCompleted) {
  const jwt = await encode({
    secret,
    salt: 'authjs.session-token',
    maxAge: 3600,
    token: {
      sub: 'r2-synthetic-edge-user',
      id: 'r2-synthetic-edge-user',
      role: 'STUDENT',
      name: 'Synthetic edge fixture',
      email: 'edge@example.invalid',
      onboardingCompleted,
    },
  });
  return `authjs.session-token=${jwt}`;
}
try {
  const deadline = Date.now() + 60_000;
  let ready = false;
  while (Date.now() < deadline && !exited) {
    try {
      ready = (await request('/sign-in')).status === 200;
      if (ready) break;
    } catch {
      /* Local child startup only. */
    }
    await new Promise((done) => setTimeout(done, 300));
  }
  assert.ok(ready && !exited, 'Synthetic production server did not become ready');
  const incomplete = await cookieFor(false);
  const complete = await cookieFor(true);
  const cases = [
    ['anonymous-dashboard', '/dashboard', undefined, 307, '/sign-in'],
    ['anonymous-workspace', '/w/cr2syntheticworkspace/tasks', undefined, 307, '/sign-in'],
    ['malformed-cookie', '/dashboard', 'authjs.session-token=malformed', 307, '/sign-in'],
    ['incomplete-dashboard', '/dashboard', incomplete, 307, '/onboarding'],
    ['incomplete-workspace', '/w/cr2syntheticworkspace/tasks', incomplete, 307, '/onboarding'],
    ['complete-onboarding-redirect', '/onboarding', complete, 307, '/dashboard'],
    ['signed-in-auth-page', '/sign-in', incomplete, 307, '/dashboard'],
    ['legitimate-onboarding-render', '/onboarding', incomplete, 200, null],
  ];
  for (const [name, path, cookie, expectedStatus, expectedPath] of cases) {
    const response = await request(path, cookie);
    assert.equal(response.status, expectedStatus, name);
    const location = response.headers.get('location');
    if (expectedPath) assert.equal(new URL(location, origin).pathname, expectedPath, name);
    await response.arrayBuffer();
    artifact.results.push({
      name,
      status: 'PASS',
      httpStatus: response.status,
      redirectPath: expectedPath,
    });
  }
  const response = await request('/api/auth/session', incomplete);
  assert.equal(response.status, 200);
  const session = await response.json();
  assert.equal(session.user.id, 'r2-synthetic-edge-user');
  assert.equal(session.user.onboardingCompleted, false);
  artifact.results.push({
    name: 'Node-session-compatible-with-Edge-cookie',
    status: 'PASS',
    httpStatus: response.status,
  });
  console.log(
    `Production middleware/session smoke: ${artifact.results.length} passed; synthetic cookies, no DB login.`,
  );
} catch (error) {
  artifact.error = error.message;
  process.exitCode = 1;
  console.error(error.message);
} finally {
  if (!exited) {
    child.kill('SIGTERM');
    await new Promise((done) => {
      const timer = setTimeout(done, 5000);
      child.once('exit', () => {
        clearTimeout(timer);
        done();
      });
    });
  }
  await writeFile(
    resolve(evidence, 'production-middleware.json'),
    JSON.stringify(artifact, null, 2) + '\n',
  );
  await writeFile(resolve(evidence, 'production-middleware.log'), logs);
}

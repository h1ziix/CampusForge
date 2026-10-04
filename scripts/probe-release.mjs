import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const releaseArgument = process.argv[2];
const uiOutput = process.argv[3] === '--ui-output' ? process.argv[4] : undefined;
if (!releaseArgument || (process.argv.length !== 3 && !(process.argv.length === 5 && uiOutput))) {
  throw new Error(
    'Usage: node scripts/probe-release.mjs <release-directory> [--ui-output <evidence-directory>]',
  );
}
const release = path.resolve(releaseArgument);
const manifest = JSON.parse(await readFile(path.join(release, 'release-manifest.json'), 'utf8'));
assert.equal(manifest.contract, 'campusforge-r1-built-workspace');
assert.equal(manifest.platform, process.platform, 'Build and runtime OS must match.');
assert.equal(manifest.arch, process.arch, 'Build and runtime architecture must match.');
assert.equal(
  manifest.nodeMajor,
  Number(process.versions.node.split('.')[0]),
  'Build and runtime Node major must match.',
);
const lockfile = await readFile(path.join(release, 'pnpm-lock.yaml'));
assert.equal(createHash('sha256').update(lockfile).digest('hex'), manifest.lockfileSha256);
await assert.rejects(access(path.join(release, '.env')));

const workerRequire = createRequire(path.join(release, 'apps/worker/package.json'));
const webRequire = createRequire(path.join(release, 'apps/web/package.json'));
const rootRequire = createRequire(path.join(release, 'package.json'));
for (const [require, name] of [
  [workerRequire, 'tsx'],
  [workerRequire, 'dotenv-cli'],
  [rootRequire, 'turbo'],
]) {
  assert.throws(() => require.resolve(name), `Unexpected dev-only dependency: ${name}`);
}
const { PrismaClient, prisma } = workerRequire('@campusforge/db');
workerRequire('@campusforge/ai');
workerRequire('@campusforge/shared');
webRequire('next');
await prisma.$disconnect();
const engineProbePort = await unusedPort();
const engineProbeClient = new PrismaClient({
  datasources: {
    db: {
      url: `postgresql://r1_probe:r1_probe@127.0.0.1:${engineProbePort}/r1_probe?connect_timeout=2`,
    },
  },
});
try {
  await assert.rejects(
    engineProbeClient.$connect(),
    (error) => error.errorCode === 'P1001',
    'Expected a database-unavailable error after native Prisma engine loading.',
  );
} finally {
  await engineProbeClient.$disconnect();
}

function samplePdf() {
  const stream = 'BT /F1 18 Tf 40 130 Td (CampusForge production PDF probe) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 180] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1))
    content += `${String(offset).padStart(10, '0')} 00000 n \n`;
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}
const { extractPdfText } = workerRequire('./dist/lib/pdf.js');
assert.match(await extractPdfText(samplePdf()), /CampusForge production PDF probe/);

async function unusedPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
const webPort = await unusedPort();
const redisPort = await unusedPort();
const databasePort = await unusedPort();
const s3Port = await unusedPort();
const syntheticEnv = {
  NODE_ENV: 'production',
  DATABASE_URL: `postgresql://r1_probe:r1_probe@127.0.0.1:${databasePort}/r1_probe`,
  REDIS_URL: `redis://127.0.0.1:${redisPort}`,
  AUTH_SECRET: 'r1-synthetic-only-secret-with-at-least-32-characters',
  NEXTAUTH_SECRET: 'r1-synthetic-only-secret-with-at-least-32-characters',
  NEXTAUTH_URL: `http://127.0.0.1:${webPort}`,
  AUTH_URL: `http://127.0.0.1:${webPort}`,
  AUTH_TRUST_HOST: 'true',
  NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${webPort}`,
  S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'r1-synthetic-bucket',
  S3_ACCESS_KEY: 'r1-synthetic-access',
  S3_SECRET_KEY: 'r1-synthetic-secret',
  OPENAI_API_KEY: 'r1-synthetic-key-never-used',
  OPENAI_MODEL: 'r1-synthetic-model-never-used',
  PORT: String(webPort),
  HOSTNAME: '127.0.0.1',
  NEXT_TELEMETRY_DISABLED: '1',
};
for (const key of [
  'PATH',
  'Path',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'HOME',
  'USERPROFILE',
  'LOCALAPPDATA',
]) {
  if (process.env[key]) syntheticEnv[key] = process.env[key];
}

function launch(app, entry, env = syntheticEnv) {
  const child = spawn(process.execPath, [entry], {
    cwd: path.join(release, `apps/${app}`),
    env,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    output += chunk.toString();
  });
  return { child, output: () => output };
}
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function waitFor(predicate, child, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    assert.equal(child.exitCode, null, `${label} exited before initialization.`);
    await delay(100);
  }
  throw new Error(`${label} initialization did not complete within ${timeout} ms.`);
}

async function checkMissingEnvironment(app, entry) {
  const diagnosticMarker = 'r1-private-diagnostic-marker';
  const missingEnv = { NODE_ENV: 'production', DATABASE_URL: diagnosticMarker };
  for (const key of [
    'PATH',
    'Path',
    'SystemRoot',
    'SYSTEMROOT',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'LOCALAPPDATA',
  ]) {
    if (syntheticEnv[key]) missingEnv[key] = syntheticEnv[key];
  }
  const launched = launch(app, entry, missingEnv);
  const timeout = setTimeout(() => launched.child.kill('SIGKILL'), 10000);
  try {
    const exitCode = await new Promise((resolve, reject) => {
      launched.child.once('error', reject);
      launched.child.once('exit', resolve);
    });
    assert.equal(exitCode, 1, `${app} must fail with missing runtime configuration.`);
    assert.match(launched.output(), new RegExp(`Invalid ${app} configuration:`));
    assert.match(launched.output(), /DATABASE_URL/);
    assert.ok(
      !launched.output().includes(diagnosticMarker),
      'Configuration diagnostic exposed a value.',
    );
    assert.doesNotMatch(launched.output(), /Runtime modules loaded|Ready in/);
  } finally {
    clearTimeout(timeout);
    if (launched.child.exitCode === null) launched.child.kill('SIGKILL');
  }
}
await checkMissingEnvironment('web', 'scripts/start.mjs');
await checkMissingEnvironment('worker', 'scripts/start.mjs');

let web;
let worker;
let status;
try {
  worker = launch('worker', 'scripts/start.mjs');
  await waitFor(
    () => worker.output().includes('Runtime modules loaded; infrastructure readiness pending.'),
    worker.child,
    'Worker',
  );
  assert.doesNotMatch(worker.output(), /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Cannot find module/);
  web = launch('web', 'scripts/start.mjs');
  await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${webPort}/sign-in`, {
          signal: AbortSignal.timeout(2000),
        });
        status = response.status;
        return status === 200;
      } catch {
        return false;
      }
    },
    web.child,
    'Web',
  );
  assert.equal(
    worker.child.exitCode,
    null,
    'Worker did not remain running after module initialization.',
  );
  assert.doesNotMatch(worker.output(), /MODULE_NOT_FOUND|ERR_MODULE_NOT_FOUND|Cannot find module/);
  assert.ok(
    !worker.output().includes('Redis queues ready:'),
    'Synthetic unavailable Redis unexpectedly became ready.',
  );
  if (uiOutput) {
    const script = fileURLToPath(new URL('./probe-public-ui.mjs', import.meta.url));
    const result = spawnSync(
      process.execPath,
      [script, `http://127.0.0.1:${webPort}`, path.resolve(uiOutput)],
      {
        env: syntheticEnv,
        encoding: 'utf8',
        timeout: 60000,
        windowsHide: true,
      },
    );
    assert.equal(
      result.status,
      0,
      'Production public UI probe failed; inspect its evidence directory.',
    );
  }
  console.log(
    JSON.stringify(
      {
        contract: manifest.contract,
        platform: process.platform,
        arch: process.arch,
        node: process.version,
        lockfileSha256: manifest.lockfileSha256,
        devCliAbsent: true,
        missingEnvironmentRejectedBeforeStartup: true,
        environmentDiagnosticsRedacted: true,
        workspaceRuntimeImports: true,
        prismaClientConstructed: true,
        prismaNativeEngineLoaded: true,
        syntheticDatabaseConnectionError: 'P1001',
        compiledPdfParserText: true,
        webHttpStatus: status,
        workerModulesLoaded: true,
        publicUiChecked: Boolean(uiOutput),
        infrastructureReady: false,
        readinessReason:
          'Disposable synthetic configuration points to unavailable local services; no jobs, database queries, S3 calls, or AI calls executed.',
      },
      null,
      2,
    ),
  );
} finally {
  for (const launched of [web, worker]) {
    if (launched && launched.child.exitCode === null) launched.child.kill('SIGKILL');
  }
}

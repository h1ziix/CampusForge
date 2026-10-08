import { createHash } from 'node:crypto';
import { access, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Release packaging requires the configured Node 24 LTS runtime.');
}
const destinationArgument = process.argv[2];
if (!destinationArgument || process.argv.length !== 3) {
  throw new Error('Usage: node scripts/package-release.mjs <new-release-directory>');
}
const destination = path.resolve(destinationArgument);
if (destination === root || root.startsWith(`${destination}${path.sep}`)) {
  throw new Error('The release directory must not replace the source workspace or its parent.');
}
try {
  await access(destination);
  throw new Error('The release directory already exists. Use a fresh path.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

const required = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'apps/web/package.json',
  'apps/web/next.config.mjs',
  'apps/web/.next/BUILD_ID',
  'apps/web/scripts/start.mjs',
  'apps/worker/package.json',
  'apps/worker/dist/index.js',
  'apps/worker/dist/lifecycle/dispatcher.js',
  'packages/db/dist/document-lifecycle.js',
  'packages/db/dist/ai-lifecycle.js',
  'apps/worker/dist/jobs/ai-operation.js',
  'apps/worker/dist/lifecycle/ai-maintenance.js',
  'packages/ai/dist/pricing.js',
  'packages/ai/dist/validation.js',
  'apps/worker/scripts/start.mjs',
  'packages/db/package.json',
  'packages/db/dist/index.js',
  'packages/db/dist/index.d.ts',
  'packages/db/generated/client/index.js',
  'packages/ai/package.json',
  'packages/ai/dist/index.js',
  'packages/ai/dist/index.d.ts',
  'packages/shared/package.json',
  'packages/shared/dist/index.js',
  'packages/shared/dist/index.d.ts',
  'packages/shared/dist/env.js',
  'packages/shared/dist/env.d.ts',
];
for (const relative of required) {
  try {
    await access(path.join(root, relative));
  } catch {
    throw new Error(
      `Required release artifact missing: ${relative}. Run Prisma generation and all builds first.`,
    );
  }
}

const engines = (await readdir(path.join(root, 'packages/db/generated/client'))).filter(
  (name) => name.includes('query_engine') || name.includes('query-engine'),
);
if (engines.length === 0) {
  throw new Error(
    'Generated Prisma Client has no native query engine. Regenerate on the target platform.',
  );
}

await mkdir(path.dirname(destination), { recursive: true });
await mkdir(destination, { recursive: false });
async function copy(relative, optional = false) {
  const source = path.join(root, relative);
  try {
    await access(source);
  } catch (error) {
    if (optional && error.code === 'ENOENT') return;
    throw error;
  }
  await cp(source, path.join(destination, relative), {
    recursive: true,
    dereference: false,
    filter: (candidate) => {
      const parts = path.relative(source, candidate).split(path.sep);
      return !parts.some(
        (part) =>
          part === 'node_modules' ||
          part === 'cache' ||
          part === '.turbo' ||
          part === 'dev' ||
          part === '.env' ||
          part.startsWith('.env.'),
      );
    },
  });
}

for (const relative of ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']) {
  await copy(relative);
}
await copy('.npmrc', true);
for (const app of ['web', 'worker']) {
  await copy(`apps/${app}/package.json`);
  await copy(`apps/${app}/scripts`);
}
await copy('apps/web/next.config.mjs');
await copy('apps/web/.next');
await copy('apps/web/public', true);
await copy('apps/worker/dist');
for (const name of ['db', 'ai', 'shared']) {
  await copy(`packages/${name}/package.json`);
  await copy(`packages/${name}/dist`);
  // The build workspace checks source types before emitting; the release ships
  // declarations beside JavaScript and therefore exports those declarations.
  const manifestPath = path.join(destination, `packages/${name}/package.json`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  manifest.types = './dist/index.d.ts';
  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    entry.types = subpath === '.' ? './dist/index.d.ts' : `./dist/${subpath.slice(2)}.d.ts`;
  }
  manifest.files = name === 'db' ? ['dist', 'generated', 'prisma'] : ['dist'];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}
await copy('packages/db/generated');
await copy('packages/db/prisma');

const lockfile = await readFile(path.join(root, 'pnpm-lock.yaml'));
await writeFile(
  path.join(destination, 'release-manifest.json'),
  `${JSON.stringify(
    {
      contract: 'campusforge-r1-built-workspace',
      node: process.version,
      nodeMajor: Number(process.versions.node.split('.')[0]),
      platform: process.platform,
      arch: process.arch,
      lockfileSha256: createHash('sha256').update(lockfile).digest('hex'),
      prismaEngines: engines,
      install: 'pnpm install --prod --frozen-lockfile --ignore-scripts',
      webStart: 'pnpm --filter @campusforge/web start',
      workerStart: 'pnpm --filter @campusforge/worker start',
    },
    null,
    2,
  )}\n`,
);
console.log(`Release artifact created at ${destination}.`);
console.log(
  'Install production dependencies with the manifest command on the same Node major, OS, and architecture.',
);

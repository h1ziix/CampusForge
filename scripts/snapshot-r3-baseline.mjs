import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';

const evidence = resolve('docs/releases/R3-evidence');
const output = resolve(evidence, 'baseline-source.json');
if (existsSync(output)) throw new Error('R3 baseline already saved; refusing overwrite.');
const git = (...args) => {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args[0]} failed`);
  return result.stdout;
};
const gitRevision = git('rev-parse', 'HEAD').trim();
const paths = [
  'apps/web/src/server/services/document.ts',
  'apps/web/src/lib/queue.ts',
  'apps/web/src/lib/request-origin.ts',
  'apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts',
  'packages/shared/src/schemas/document.ts',
];
const files = paths.map((path) => {
  const source = git('show', `${gitRevision}:${path}`);
  const target = resolve(evidence, 'baseline-source', path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  return { path, sha256: createHash('sha256').update(source).digest('hex') };
});
writeFileSync(output, JSON.stringify({ gitRevision, files }, null, 2) + '\n');
console.log('Saved five pre-R3 baseline modules from immutable Git HEAD.');

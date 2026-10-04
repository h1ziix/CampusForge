import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lint = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/eslint/bin/eslint.js'),
    '--stdin',
    '--stdin-filename',
    'packages/shared/src/r1-negative.ts',
  ],
  {
    cwd: root,
    input: 'const unusedR1Value = 1;\n',
    encoding: 'utf8',
  },
);
assert.equal(lint.status, 1, 'ESLint must reject an actual unused variable');
assert.match(lint.stdout, /no-unused-vars/);

const format = spawnSync(
  process.execPath,
  [
    resolve(root, 'node_modules/prettier/bin/prettier.cjs'),
    '--check',
    '--stdin-filepath',
    'packages/shared/src/r1-negative.ts',
  ],
  {
    cwd: root,
    input: 'export const r1Value={foo:"bar"};\n',
    encoding: 'utf8',
  },
);
assert.equal(format.status, 1, 'Prettier must reject unformatted source');
console.log(
  JSON.stringify({ lintRejectsViolation: true, formatterRejectsViolation: true, filesWritten: 0 }),
);

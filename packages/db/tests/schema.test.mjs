import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('Prisma schema validates in isolation with a synthetic datasource', async () => {
  const temporary = await mkdtemp(join(tmpdir(), 'campusforge-r1-schema-'));
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
  try {
    await cp(
      fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
      join(temporary, 'schema.prisma'),
    );
    const require = createRequire(import.meta.url);
    const result = spawnSync(
      process.execPath,
      [require.resolve('prisma/build/index.js'), 'validate', '--schema', 'schema.prisma'],
      {
        cwd: temporary,
        env: {
          SystemRoot: process.env.SystemRoot,
          PATH: process.env.PATH,
          DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:65432/synthetic',
          CHECKPOINT_DISABLE: '1',
        },
        encoding: 'utf8',
      },
    );
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /schema.*valid/i);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

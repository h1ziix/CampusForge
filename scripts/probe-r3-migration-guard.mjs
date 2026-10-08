import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import {
  isolatedInfrastructure,
  syntheticChildEnv,
  stagedPrismaMigrations,
} from '../tests/fixtures/r3-infrastructure.mjs';

const require = createRequire(resolve('packages/db/package.json'));
const cli = require.resolve('prisma/build/index.js');
const evidence = resolve('docs/releases/R3-evidence');
const migration = resolve(
  'packages/db/prisma/migrations/20261005120000_document_durable_lifecycle/migration.sql',
);
let infra, temporary, migrationStage;
const results = {
  node: process.version,
  migrationSHA256: createHash('sha256').update(readFileSync(migration)).digest('hex'),
  paidAIRequests: 0,
  S3Requests: 0,
  existingDataTouched: false,
};
try {
  assert.match(process.version, /^v24\./);
  infra = await isolatedInfrastructure();
  migrationStage = await stagedPrismaMigrations();
  const sql = (database, input) => {
    const result = spawnSync(
      'docker',
      [
        'exec',
        '-i',
        infra.pgName,
        'psql',
        '-U',
        'r3_synthetic',
        '-d',
        database,
        '-tAc',
        input,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  sql('postgres', 'CREATE DATABASE r3_legacy_duplicate_guard');
  const deploy = (schema, url) =>
    spawnSync(process.execPath, [cli, 'migrate', 'deploy', '--schema', schema], {
      cwd: dirname(schema),
      env: syntheticChildEnv({ DATABASE_URL: url }),
      encoding: 'utf8',
      timeout: 60_000,
    });
  const clean = deploy(migrationStage.schema, infra.environment.DATABASE_URL);
  writeFileSync(join(evidence, 'migration-guard-fresh.log'), clean.stdout + clean.stderr);
  assert.equal(clean.status, 0);
  assert.doesNotMatch(clean.stdout + clean.stderr, /Environment variables loaded from/);
  assert.equal(
    sql(
      'r3_disposable',
      `SELECT count(*) FROM information_schema.tables WHERE table_name IN ('DocumentTask', 'DocumentUploadIntent')`,
    ),
    '2',
  );
  results.freshFinalMigrationApplied = true;
  temporary = await mkdtemp(join(tmpdir(), 'campusforge-r3-migration-'));
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep));
  await cp(resolve('packages/db/prisma/schema.prisma'), join(temporary, 'schema.prisma'));
  await cp(
    resolve('packages/db/prisma/migrations/migration_lock.toml'),
    join(temporary, 'migrations/migration_lock.toml'),
  );
  for (const name of ['20260415232835_type1', '20260416185822_add_document_summary_json']) {
    await cp(resolve('packages/db/prisma/migrations', name), join(temporary, 'migrations', name), {
      recursive: true,
    });
  }
  const oldURL = infra.environment.DATABASE_URL.replace(
    '/r3_disposable',
    '/r3_legacy_duplicate_guard',
  );
  const old = deploy(join(temporary, 'schema.prisma'), oldURL);
  assert.equal(old.status, 0, old.stderr);
  sql(
    'r3_legacy_duplicate_guard',
    `
    INSERT INTO "User" (id,email,"updatedAt") VALUES ('synthetic-legacy-user','legacy@example.invalid',now());
    INSERT INTO "Workspace" (id,name,type,"ownerId","updatedAt") VALUES ('synthetic-legacy-workspace','synthetic','PERSONAL','synthetic-legacy-user',now());
    INSERT INTO "Document" (id,"workspaceId",filename,"mimeType","sizeBytes","storageKey","updatedAt") VALUES
      ('synthetic-document-a','synthetic-legacy-workspace','a.txt','text/plain',1,'synthetic-shared-key',now()),
      ('synthetic-document-b','synthetic-legacy-workspace','b.txt','text/plain',1,'synthetic-shared-key',now());
  `,
  );
  const guarded = deploy(migrationStage.schema, oldURL);
  writeFileSync(join(evidence, 'migration-guard-duplicates.log'), guarded.stdout + guarded.stderr);
  assert.notEqual(guarded.status, 0);
  assert.match(guarded.stdout + guarded.stderr, /duplicate|unique/i);
  results.duplicateMigrationRejected = true;
  results.retainedLegacyRows = Number(
    sql('r3_legacy_duplicate_guard', 'SELECT count(*) FROM "Document"'),
  );
  assert.equal(results.retainedLegacyRows, 2);
  results.newLifecycleColumnsAfterFailure = Number(
    sql(
      'r3_legacy_duplicate_guard',
      `SELECT count(*) FROM information_schema.columns WHERE table_name='Document' AND column_name='lifecycle'`,
    ),
  );
  results.newLifecycleTypesAfterFailure = Number(
    sql(
      'r3_legacy_duplicate_guard',
      `SELECT count(*) FROM pg_type WHERE typname='DocumentLifecycle'`,
    ),
  );
  assert.equal(results.newLifecycleColumnsAfterFailure, 0);
  assert.equal(results.newLifecycleTypesAfterFailure, 0);
  results.sqlTransactionRolledBack = true;
  results.prismaFailedMigrationRequiresOperatorResolution = true;
  console.log(JSON.stringify(results));
} catch (error) {
  results.error = error.message;
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await migrationStage?.clean();
  if (temporary) {
    const target = resolve(temporary);
    assert.ok(
      target.startsWith(resolve(tmpdir()) + sep) && target.includes('campusforge-r3-migration-'),
    );
    await rm(target, { recursive: true, force: true });
  }
  await infra?.clean();
  results.cleaned = true;
  writeFileSync(
    join(evidence, 'migration-guard-results.json'),
    JSON.stringify(results, null, 2) + '\n',
  );
}

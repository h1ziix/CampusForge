import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';

// Every Docker mutation is restricted to freshly created, run-labelled resources.
// No compose project, existing volumes, or repository .env is read.
export async function isolatedInfrastructure() {
  const id = randomUUID();
  const prefix = `campusforge-r3-${id}`;
  const names = [];
  const run = (args) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30_000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Docker ${args[0]} failed: ${result.stderr.trim()}`);
    return result.stdout.trim();
  };
  const launch = (service, image, args) => {
    const name = `${prefix}-${service}`;
    run([
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '--label',
      `campusforge.r3.run=${id}`,
      ...args,
      image,
      ...[],
    ]);
    names.push(name);
    return name;
  };
  const start = (service, image, options, command = []) => {
    const name = `${prefix}-${service}`;
    run([
      'run',
      '--rm',
      '-d',
      '--name',
      name,
      '--label',
      `campusforge.r3.run=${id}`,
      ...options,
      image,
      ...command,
    ]);
    names.push(name);
    return name;
  };
  const port = (name, containerPort) => {
    const binding = run(['port', name, `${containerPort}/tcp`]);
    assert.match(binding, /^127\.0\.0\.1:\d+$/);
    return Number(binding.split(':')[1]);
  };
  const clean = async () => {
    for (const name of [...names].reverse()) {
      assert.ok(name.startsWith(`${prefix}-`));
      const found = spawnSync(
        'docker',
        ['inspect', '--format', '{{index .Config.Labels "campusforge.r3.run"}}', name],
        { encoding: 'utf8' },
      );
      if (found.status !== 0) continue;
      assert.equal(found.stdout.trim(), id);
      run(['rm', '-f', name]);
    }
  };
  try {
    const pgName = launch('postgres', 'postgres:16-alpine', [
      '-p',
      '127.0.0.1::5432',
      '--tmpfs',
      '/var/lib/postgresql/data',
      '-e',
      'POSTGRES_USER=r3_synthetic',
      '-e',
      'POSTGRES_PASSWORD=r3_synthetic_password',
      '-e',
      'POSTGRES_DB=r3_disposable',
    ]);
    const redisName = start(
      'redis',
      'redis:7-alpine',
      ['-p', '127.0.0.1::6379', '--tmpfs', '/data'],
      ['redis-server', '--save', '', '--appendonly', 'no'],
    );
    const minioName = start(
      'minio',
      'minio/minio:latest',
      [
        '-p',
        '127.0.0.1::9000',
        '--tmpfs',
        '/data',
        '-e',
        'MINIO_ROOT_USER=r3synthetic',
        '-e',
        'MINIO_ROOT_PASSWORD=r3syntheticpassword',
      ],
      ['server', '/data'],
    );
    const pgPort = port(pgName, 5432),
      redisPort = port(redisName, 6379),
      s3Port = port(minioName, 9000);
    for (let attempt = 0; attempt < 80; attempt++) {
      const ready = spawnSync(
        'docker',
        ['exec', pgName, 'pg_isready', '-U', 'r3_synthetic', '-d', 'r3_disposable'],
        { encoding: 'utf8' },
      );
      if (ready.status === 0) break;
      if (attempt === 79) throw new Error('Disposable PostgreSQL readiness deadline exceeded');
      await delay(250);
    }
    for (let attempt = 0; attempt < 80; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${s3Port}/minio/health/ready`, {
          signal: AbortSignal.timeout(1000),
        });
        if (response.ok) break;
      } catch {
        /* readiness only */
      }
      if (attempt === 79) throw new Error('Disposable MinIO readiness deadline exceeded');
      await delay(250);
    }
    return {
      id,
      names,
      clean,
      pgName,
      redisName,
      minioName,
      environment: {
        DATABASE_URL: `postgresql://r3_synthetic:r3_synthetic_password@127.0.0.1:${pgPort}/r3_disposable`,
        REDIS_URL: `redis://127.0.0.1:${redisPort}/15`,
        S3_ENDPOINT: `http://127.0.0.1:${s3Port}`,
        S3_REGION: 'us-east-1',
        S3_BUCKET: `r3-${id}`,
        S3_ACCESS_KEY: 'r3synthetic',
        S3_SECRET_KEY: 'r3syntheticpassword',
      },
      ports: { postgres: pgPort, redis: redisPort, minio: s3Port },
      restartRedis() {
        run(['restart', redisName]);
      },
      pauseRedis() {
        run(['pause', redisName]);
      },
      unpauseRedis() {
        run(['unpause', redisName]);
      },
    };
  } catch (error) {
    await clean();
    throw error;
  }
}

export function syntheticChildEnv(environment = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (/^(DATABASE_URL|REDIS_URL|S3_|OPENAI_|AUTH_|NEXTAUTH_|NEXT_PUBLIC_APP_URL)/.test(key))
      delete env[key];
  }
  return { ...env, ...environment };
}

export async function stagedPrismaMigrations() {
  const directory = await mkdtemp(join(tmpdir(), 'campusforge-r3-prisma-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  await cp(resolve('packages/db/prisma/schema.prisma'), join(directory, 'schema.prisma'));
  await cp(resolve('packages/db/prisma/migrations'), join(directory, 'migrations'), {
    recursive: true,
  });
  return {
    directory,
    schema: join(directory, 'schema.prisma'),
    async clean() {
      const target = resolve(directory);
      assert.ok(
        target.startsWith(resolve(tmpdir()) + sep) && target.includes('campusforge-r3-prisma-'),
      );
      await rm(target, { recursive: true, force: true });
    },
  };
}

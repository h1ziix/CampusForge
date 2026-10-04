import assert from 'node:assert/strict';
import test from 'node:test';
import { validateEnvironment, type Environment } from '../src/env';

const synthetic: Environment = {
  DATABASE_URL: 'postgresql://synthetic:synthetic@127.0.0.1:65432/synthetic',
  REDIS_URL: 'redis://127.0.0.1:65433',
  S3_ENDPOINT: 'http://127.0.0.1:65434',
  S3_REGION: 'synthetic-region',
  S3_BUCKET: 'synthetic-bucket',
  S3_ACCESS_KEY: 'synthetic-access',
  S3_SECRET_KEY: 'SYNTHETIC_SECRET_MUST_NOT_LEAK',
  AUTH_URL: 'http://127.0.0.1:3000',
  AUTH_SECRET: 'SYNTHETIC_AUTH_SECRET_32_CHARACTERS',
  OPENAI_API_KEY: 'SYNTHETIC_PROVIDER_SECRET',
  OPENAI_MODEL: 'synthetic-model',
};

test('build needs no runtime secrets and validates only optional public URL', () => {
  assert.doesNotThrow(() => validateEnvironment('build', {}));
  assert.doesNotThrow(() =>
    validateEnvironment('build', { NEXT_PUBLIC_APP_URL: 'https://example.test' }),
  );
  assert.throws(
    () => validateEnvironment('build', { NEXT_PUBLIC_APP_URL: 'not-a-url' }),
    /NEXT_PUBLIC_APP_URL/,
  );
});

test('web and worker accept synthetic runtime configuration; web needs no AI key', () => {
  assert.doesNotThrow(() => validateEnvironment('worker', synthetic));
  assert.doesNotThrow(() =>
    validateEnvironment('web', {
      ...synthetic,
      OPENAI_API_KEY: undefined,
      OPENAI_MODEL: undefined,
    }),
  );
  assert.doesNotThrow(() =>
    validateEnvironment('web', {
      ...synthetic,
      AUTH_URL: undefined,
      AUTH_SECRET: undefined,
      NEXTAUTH_URL: 'https://example.test',
      NEXTAUTH_SECRET: 'SYNTHETIC_LEGACY_SECRET_32_CHARACTERS',
    }),
  );
});

test('runtime rejects missing storage settings and model with names-only errors', () => {
  assert.throws(
    () => validateEnvironment('worker', { ...synthetic, S3_BUCKET: undefined, OPENAI_MODEL: '' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /S3_BUCKET/);
      assert.match(error.message, /OPENAI_MODEL/);
      for (const value of Object.values(synthetic)) {
        if (value)
          assert.ok(!error.message.includes(value), 'configuration values must never be printed');
      }
      return true;
    },
  );
});

test('invalid URL schemes and short auth secrets fail before runtime connects', () => {
  for (const [key, value] of [
    ['DATABASE_URL', 'https://secret@example.test'],
    ['REDIS_URL', 'http://example.test'],
    ['S3_ENDPOINT', 'file:///private/secret'],
  ]) {
    assert.throws(
      () => validateEnvironment('worker', { ...synthetic, [key]: value }),
      new RegExp(key),
    );
  }
  assert.throws(
    () => validateEnvironment('web', { ...synthetic, AUTH_SECRET: 'short' }),
    /minimum 32 characters/,
  );
});

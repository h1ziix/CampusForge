import assert from 'node:assert/strict';
import test from 'node:test';
import { aiEnvironmentKeys, readAIEnvironmentPolicy, validateEnvironment } from '../src/env';

test('AI execution and admission have finite defaults with no runtime secret requirement', () => {
  const policy = readAIEnvironmentPolicy({});
  assert.equal(policy.model, 'gpt-4o-mini');
  assert.equal(policy.parameters.maxAttempts, 3);
  assert.equal(policy.workspaceConcurrency, 2);
  assert.ok(policy.parameters.connectionTimeoutMs <= policy.parameters.requestTimeoutMs);
  assert.ok(policy.parameters.requestTimeoutMs <= policy.parameters.operationTimeoutMs);
  assert.ok(policy.operationBudgetMicros <= policy.workspaceBudgetMicros);
  assert.ok(policy.cleanupBatchSize <= 1000);
});

test('AI environment rejects unbounded, negative, fractional and malformed limits safely', () => {
  for (const key of aiEnvironmentKeys) {
    for (const value of ['', 'NaN', 'Infinity', '-1', '1.5', '999999999999', 'secret=value']) {
      assert.throws(
        () => readAIEnvironmentPolicy({ [key]: value }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.ok(error.message.includes(key));
          assert.ok(!error.message.includes('secret=value'));
          return true;
        },
      );
    }
  }
  assert.throws(() => readAIEnvironmentPolicy({ AI_REQUEST_TIMEOUT_MS: '1000' }), /TIMEOUT/);
  assert.throws(() => readAIEnvironmentPolicy({ AI_WORKSPACE_BUDGET_MICROS: '10' }), /BUDGET/);
  // Pure build remains independent of runtime policy and secrets.
  assert.doesNotThrow(() => validateEnvironment('build', { AI_MAX_ATTEMPTS: 'invalid' }));
});

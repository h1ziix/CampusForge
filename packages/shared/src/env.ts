/** Server-controlled R4 policy. USD micros are conservative internal estimates. */
export const aiEnvironmentKeys = [
  'AI_MAX_INPUT_TOKENS',
  'AI_MAX_OUTPUT_TOKENS',
  'AI_MAX_ATTEMPTS',
  'AI_OPERATION_TIMEOUT_MS',
  'AI_REQUEST_TIMEOUT_MS',
  'AI_CONNECTION_TIMEOUT_MS',
  'AI_LEASE_MS',
  'AI_WORKSPACE_BUDGET_MICROS',
  'AI_OPERATION_BUDGET_MICROS',
  'AI_WORKSPACE_CONCURRENCY',
  'AI_ATTEMPT_RETENTION_DAYS',
  'AI_CLEANUP_BATCH_SIZE',
] as const;

export function readAIEnvironmentPolicy(env: Record<string, string | undefined> = process.env) {
  const integer = (key: string, fallback: number, min: number, max: number): number => {
    if (env[key] === undefined) return fallback;
    const value = Number(env[key]);
    if (!/^\d+$/.test(env[key] ?? '') || !Number.isSafeInteger(value) || value < min || value > max)
      throw new Error(`Invalid AI configuration: ${key}. Values are not logged.`);
    return value;
  };
  const parameters = {
    maxInputTokens: integer('AI_MAX_INPUT_TOKENS', 16_000, 256, 100_000),
    maxOutputTokens: integer('AI_MAX_OUTPUT_TOKENS', 2048, 128, 4096),
    maxAttempts: integer('AI_MAX_ATTEMPTS', 3, 1, 10),
    temperature: 0.3,
    operationTimeoutMs: integer('AI_OPERATION_TIMEOUT_MS', 120_000, 1000, 600_000),
    requestTimeoutMs: integer('AI_REQUEST_TIMEOUT_MS', 30_000, 100, 120_000),
    connectionTimeoutMs: integer('AI_CONNECTION_TIMEOUT_MS', 5000, 100, 60_000),
  };
  if (parameters.connectionTimeoutMs > parameters.requestTimeoutMs)
    throw new Error('Invalid AI configuration: AI_CONNECTION_TIMEOUT_MS / AI_REQUEST_TIMEOUT_MS.');
  if (parameters.requestTimeoutMs > parameters.operationTimeoutMs)
    throw new Error('Invalid AI configuration: AI_REQUEST_TIMEOUT_MS / AI_OPERATION_TIMEOUT_MS.');
  const workspaceBudgetMicros = integer('AI_WORKSPACE_BUDGET_MICROS', 1_000_000, 1, 1_000_000_000);
  const operationBudgetMicros = integer('AI_OPERATION_BUDGET_MICROS', 100_000, 1, 1_000_000_000);
  if (operationBudgetMicros > workspaceBudgetMicros)
    throw new Error(
      'Invalid AI configuration: AI_OPERATION_BUDGET_MICROS / AI_WORKSPACE_BUDGET_MICROS.',
    );
  return {
    model: env.OPENAI_MODEL?.trim() || 'gpt-4o-mini',
    parameters,
    workspaceBudgetMicros,
    operationBudgetMicros,
    workspaceConcurrency: integer('AI_WORKSPACE_CONCURRENCY', 2, 1, 100),
    leaseMs: integer('AI_LEASE_MS', 60_000, 1000, 600_000),
    attemptRetentionDays: integer('AI_ATTEMPT_RETENTION_DAYS', 90, 1, 3650),
    cleanupBatchSize: integer('AI_CLEANUP_BATCH_SIZE', 100, 1, 1000),
  };
}

/** Validate configuration without exposing values in diagnostics. */
export type EnvironmentScope = 'build' | 'web' | 'worker';
export type Environment = Record<string, string | undefined>;

const storageKeys = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
] as const;

export const runtimeEnvironmentKeys = [
  'DATABASE_URL',
  'AUTH_URL',
  'NEXTAUTH_URL',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'AUTH_TRUST_HOST',
  'AUTH_RATE_LIMIT_TRUST_PROXY',
  'AUTH_RATE_LIMIT_IP_HEADER',
  'REDIS_URL',
  ...storageKeys,
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  ...aiEnvironmentKeys,
] as const;

export function validateEnvironment(scope: EnvironmentScope, env: Environment = process.env): void {
  const invalid = new Set<string>();
  const requireValue = (key: string): void => {
    if (!env[key]?.trim()) invalid.add(key);
  };
  const requireUrl = (key: string, protocols: readonly string[]): void => {
    requireValue(key);
    if (!env[key]?.trim()) return;
    try {
      const url = new URL(env[key]);
      if (!protocols.includes(url.protocol) || !url.hostname) invalid.add(key);
    } catch {
      invalid.add(key);
    }
  };

  // Public values are embedded by Next; infrastructure secrets are runtime-only.
  if (scope === 'build') {
    if (env.NEXT_PUBLIC_APP_URL !== undefined) {
      requireUrl('NEXT_PUBLIC_APP_URL', ['http:', 'https:']);
    }
  } else {
    readAIEnvironmentPolicy(env);
    requireUrl('DATABASE_URL', ['postgres:', 'postgresql:']);
    requireUrl('REDIS_URL', ['redis:', 'rediss:']);
    storageKeys.forEach(requireValue);
    requireUrl('S3_ENDPOINT', ['http:', 'https:']);
    if (scope === 'web') {
      const secretKey = env.AUTH_SECRET?.trim() ? 'AUTH_SECRET' : 'NEXTAUTH_SECRET';
      const urlKey = env.AUTH_URL?.trim() ? 'AUTH_URL' : 'NEXTAUTH_URL';
      requireValue(secretKey);
      if ((env[secretKey]?.length ?? 0) < 32)
        invalid.add('AUTH_SECRET or NEXTAUTH_SECRET (minimum 32 characters)');
      requireUrl(urlKey, ['http:', 'https:']);
    } else {
      requireValue('OPENAI_API_KEY');
      requireValue('OPENAI_MODEL');
    }
  }

  if (invalid.size > 0) {
    throw new Error(
      `Invalid ${scope} configuration: ${[...invalid].sort().join(', ')}. Values are not logged.`,
    );
  }
}

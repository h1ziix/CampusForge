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

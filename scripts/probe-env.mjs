// Presence only: this probe is safe with synthetic or real environment values.
const scope = process.argv[2];
const keys = [
  'S3_ENDPOINT',
  'S3_REGION',
  'S3_BUCKET',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  ...[
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
  ],
];
if (scope === 'worker') keys.push('OPENAI_MODEL');
if (scope === 'web') keys.push('AUTH_RATE_LIMIT_TRUST_PROXY', 'AUTH_RATE_LIMIT_IP_HEADER');
const present = Object.fromEntries(keys.map((key) => [key, Boolean(process.env[key])]));
console.log(JSON.stringify({ scope, present }));
if (Object.values(present).some((value) => !value)) process.exitCode = 1;

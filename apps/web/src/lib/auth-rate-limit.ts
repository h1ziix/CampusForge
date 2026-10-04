import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import Redis from 'ioredis';

export type PasswordEndpoint = 'credentials' | 'signup';
export type Budget = { key: string; limit: number; windowMs: number };
export type BudgetDecision = { allowed: boolean; retryAfterSeconds: number };

export const LIMITER_DEADLINE_MS = 1500;

// Every key uses the same hash tag so the atomic script also works in Redis Cluster.
// Denied requests never extend the cooldown. Fixed windows start on first use.
export const PASSWORD_BUDGET_SCRIPT = `
local retry = 0
for index, key in ipairs(KEYS) do
  local limit = tonumber(ARGV[index * 2 - 1])
  local current = tonumber(redis.call('GET', key) or '0')
  if current >= limit then
    local ttl = redis.call('PTTL', key)
    if ttl < 1 then
      ttl = tonumber(ARGV[index * 2])
      redis.call('PEXPIRE', key, ttl)
    end
    if ttl > retry then retry = ttl end
  end
end
if retry > 0 then return {0, retry} end
for index, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if count == 1 or redis.call('PTTL', key) < 0 then
    redis.call('PEXPIRE', key, tonumber(ARGV[index * 2]))
  end
end
return {1, 0}
`;

export class PasswordBudgetError extends Error {
  constructor(
    public readonly reason: 'limited' | 'unavailable',
    public readonly retryAfterSeconds: number,
  ) {
    super(
      reason === 'limited' ? 'Password request budget exceeded' : 'Password limiter unavailable',
    );
    this.name = 'PasswordBudgetError';
  }
}

/** Ingress must strip and overwrite this single-value header; default is shared unknown. */
export function passwordRequestSource(
  headers: Pick<Headers, 'get'>,
  trustProxy = process.env.AUTH_RATE_LIMIT_TRUST_PROXY === 'true',
  headerName = process.env.AUTH_RATE_LIMIT_IP_HEADER ?? 'x-campusforge-client-ip',
): string {
  if (!trustProxy || !/^[a-z][a-z0-9-]{0,63}$/.test(headerName)) return 'unknown';
  const raw = headers.get(headerName);
  if (!raw || raw.length > 45 || !isIP(raw) || raw !== raw.trim()) return 'unknown';
  // URL canonicalizes equivalent IPv6 text forms; IPv4 is already strict via isIP.
  const canonical = isIP(raw) === 6 ? new URL(`http://[${raw}]/`).hostname : raw;
  return `ip:${canonical}`;
}

export function passwordBudgets(
  endpoint: PasswordEndpoint,
  account: string,
  source: string,
  secret: string,
): Budget[] {
  const digest = (value: string) => createHmac('sha256', secret).update(value).digest('hex');
  const sourceId = digest(source);
  const accountId = digest(account.toLowerCase().trim().slice(0, 320));
  const prefix = 'campusforge:auth:{password}:v1';
  const budgets: Budget[] = [
    { key: `${prefix}:source:${sourceId}`, limit: 60, windowMs: 15 * 60_000 },
    {
      key: `${prefix}:${endpoint}:account:${accountId}`,
      limit: endpoint === 'signup' ? 3 : 10,
      windowMs: endpoint === 'signup' ? 60 * 60_000 : 15 * 60_000,
    },
  ];
  if (endpoint === 'signup') {
    budgets.push({ key: `${prefix}:signup:source:${sourceId}`, limit: 5, windowMs: 60 * 60_000 });
  }
  return budgets;
}

export interface BudgetStore {
  eval(script: string, numberOfKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export async function consumePasswordBudgets(
  store: BudgetStore,
  budgets: Budget[],
): Promise<BudgetDecision> {
  const result = await store.eval(
    PASSWORD_BUDGET_SCRIPT,
    budgets.length,
    ...budgets.map((budget) => budget.key),
    ...budgets.flatMap((budget) => [budget.limit, budget.windowMs]),
  );
  if (!Array.isArray(result) || result.length !== 2 || ![0, 1].includes(Number(result[0]))) {
    throw new Error('Invalid password limiter response');
  }
  const retryMs = Number(result[1]);
  if (!Number.isFinite(retryMs) || retryMs < 0 || (Number(result[0]) === 0 && retryMs < 1)) {
    throw new Error('Invalid password limiter TTL');
  }
  return { allowed: Number(result[0]) === 1, retryAfterSeconds: Math.ceil(retryMs / 1000) };
}

let connection: Redis | null = null;
let connecting: Promise<void> | null = null;

async function readyStore(): Promise<Redis> {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error('Missing limiter Redis URL');
  if (!connection) {
    connection = new Redis(url, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      connectTimeout: LIMITER_DEADLINE_MS,
      commandTimeout: LIMITER_DEADLINE_MS,
    });
    // Error details may contain credentials or network locations. Never log them.
    connection.on('error', () => {});
    connecting = connection.connect();
  }
  // Keep a request bound to its original connection even if another request
  // times out and starts recovery while this connect promise is pending.
  const activeConnection = connection;
  const pendingConnection = connecting;
  if (pendingConnection) await pendingConnection;
  if (activeConnection.status !== 'ready') throw new Error('Password limiter Redis not ready');
  return activeConnection;
}

export async function withinPasswordLimiterDeadline<T>(work: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('Password limiter deadline')),
          LIMITER_DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Both actual entrances call this before database or bcrypt work; Redis failure is closed. */
export async function enforcePasswordBudget(
  endpoint: PasswordEndpoint,
  account: string,
  headers: Pick<Headers, 'get'>,
): Promise<void> {
  try {
    const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
    if (!secret || secret.length < 32) throw new Error('Missing limiter key secret');
    const budgets = passwordBudgets(endpoint, account, passwordRequestSource(headers), secret);
    const result = await withinPasswordLimiterDeadline(async () =>
      consumePasswordBudgets(await readyStore(), budgets),
    );
    if (!result.allowed) throw new PasswordBudgetError('limited', result.retryAfterSeconds);
  } catch (error) {
    if (error instanceof PasswordBudgetError) throw error;
    connection?.disconnect();
    connection = null;
    connecting = null;
    console.warn('[CampusForge] Password limiter unavailable; password requests denied');
    throw new PasswordBudgetError('unavailable', 30);
  }
}

export function passwordBudgetMessage(error: PasswordBudgetError): string {
  return error.reason === 'limited'
    ? `Too many attempts. Try again in ${error.retryAfterSeconds} seconds.`
    : 'Sign-in and registration are temporarily unavailable. Please try again in 30 seconds.';
}

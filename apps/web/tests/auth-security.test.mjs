import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const requireModule = createRequire(import.meta.url);
const ts = requireModule('../../../node_modules/typescript');
const realBcrypt = requireModule('../node_modules/bcryptjs');
const __dirname = dirname(fileURLToPath(import.meta.url));

const root = resolve(__dirname, '../../..');
const source = resolve(root, 'apps/web/src');
const syntheticSecret = 'r2-synthetic-secret-never-a-real-secret-0123456789';
process.env.AUTH_SECRET = syntheticSecret;
process.env.REDIS_URL = 'redis://127.0.0.1:1/15';
delete process.env.AUTH_RATE_LIMIT_TRUST_PROXY;
delete process.env.AUTH_RATE_LIMIT_IP_HEADER;

// Explicit mocks: shared atomic JS store and in-memory Prisma. This is NOT Redis/Postgres evidence.
const state = {
  counts: new Map(),
  now: 0,
  outage: false,
  dbReads: 0,
  compares: 0,
  hashes: 0,
  writes: 0,
  members: new Set(['user-a:ws-owned']),
  user: null,
  session: { user: { id: 'user-a' } },
  requestHeaders: new Headers(),
};

class MockRedis {
  status = 'wait';
  on() {}
  async connect() {
    if (state.outage) throw new Error('Synthetic Redis outage');
    this.status = 'ready';
  }
  disconnect() {
    this.status = 'end';
  }
  async eval(script, numberOfKeys, ...args) {
    assert.ok(script.includes("redis.call('INCR', key)"));
    assert.ok(script.includes("redis.call('PEXPIRE', key"));
    if (state.outage) throw new Error('Synthetic Redis outage');
    const keys = args.slice(0, numberOfKeys);
    const rules = args.slice(numberOfKeys);
    let retry = 0;
    for (let index = 0; index < keys.length; index += 1) {
      const item = state.counts.get(keys[index]);
      if (item && item.expiry > state.now && item.count >= rules[index * 2]) {
        retry = Math.max(retry, item.expiry - state.now);
      }
    }
    if (retry) return [0, retry];
    for (let index = 0; index < keys.length; index += 1) {
      let item = state.counts.get(keys[index]);
      if (!item || item.expiry <= state.now) {
        item = { count: 0, expiry: state.now + rules[index * 2 + 1] };
        state.counts.set(keys[index], item);
      }
      item.count += 1;
    }
    return [1, 0];
  }
}

class MockAuthError extends Error {}
class MockCredentialsSignin extends MockAuthError {
  type = 'CredentialsSignin';
  code = 'credentials';
}

function context({ realCrypto = false } = {}) {
  const cache = new Map();
  let authConfiguration;
  const prisma = {
    user: {
      async findUnique({ where }) {
        state.dbReads += 1;
        return state.user && (where.id === state.user.id || where.email === state.user.email)
          ? { ...state.user }
          : null;
      },
      async update({ where, data }) {
        assert.equal(where.id, state.session.user.id);
        state.writes += 1;
        Object.assign(state.user, data);
        return state.user;
      },
    },
    membership: {
      async findUnique({ where }) {
        const pair = where.userId_workspaceId;
        return state.members.has(`${pair.userId}:${pair.workspaceId}`) ? { role: 'OWNER' } : null;
      },
    },
    async $transaction(work) {
      state.writes += 1;
      return work({
        user: { create: async ({ data }) => ({ id: 'synthetic-new-user', ...data }) },
        workspace: { create: async () => ({ id: 'synthetic-new-workspace' }) },
        membership: { create: async () => ({ id: 'synthetic-membership' }) },
      });
    },
  };
  const nextAuth = (config) => {
    authConfiguration = config;
    return {
      auth: (callback) =>
        typeof callback === 'function' ? callback : Promise.resolve(state.session),
      handlers: {},
      signOut: async () => {},
      signIn: async (_provider, credentials) => {
        const user = await config.providers[0].authorize(credentials, {
          headers: state.requestHeaders,
        });
        if (!user) throw new MockCredentialsSignin();
        return '/dashboard';
      },
    };
  };
  const modules = {
    'next-auth': {
      __esModule: true,
      default: nextAuth,
      AuthError: MockAuthError,
      CredentialsSignin: MockCredentialsSignin,
    },
    'next-auth/providers/credentials': { __esModule: true, default: (options) => options },
    '@auth/prisma-adapter': { PrismaAdapter: () => ({}) },
    '@campusforge/db': { prisma },
    'next/headers': { headers: async () => state.requestHeaders },
    'next/server': {
      NextResponse: {
        redirect: (url) => ({ location: url.toString() }),
        next: () => ({ next: true }),
      },
    },
    ioredis: MockRedis,
    bcryptjs: {
      async compare(password, hash) {
        state.compares += 1;
        if (realCrypto) return realBcrypt.compare(password, hash);
        return password === 'synthetic-valid-password';
      },
      async hash(password, rounds) {
        state.hashes += 1;
        if (realCrypto) return realBcrypt.hash(password, rounds);
        return 'synthetic-password-hash';
      },
    },
  };
  function load(file) {
    const path = file.endsWith('.ts') ? file : `${file}.ts`;
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
      fileName: path,
    }).outputText;
    const importModule = (name) => {
      if (Object.hasOwn(modules, name)) return modules[name];
      if (name === '@campusforge/shared') return load(resolve(root, 'packages/shared/src/index'));
      if (name.startsWith('@/')) return load(resolve(source, name.slice(2)));
      if (name.startsWith('.')) {
        const resolved = resolve(dirname(path), name);
        try {
          return load(resolved);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          return load(resolve(resolved, 'index'));
        }
      }
      return requireModule(name);
    };
    new Function('require', 'module', 'exports', compiled)(importModule, module, module.exports);
    return module.exports;
  }
  const auth = load(resolve(source, 'lib/auth'));
  return { auth, config: authConfiguration, load };
}

function reset() {
  state.counts.clear();
  state.now = 0;
  state.outage = false;
  state.dbReads = state.compares = state.hashes = state.writes = 0;
  state.user = {
    id: 'user-a',
    email: 'a@example.invalid',
    name: 'Saved profile',
    role: 'STUDENT',
    onboardingCompleted: false,
    passwordHash: 'synthetic-password-hash',
  };
  state.session = { user: { id: 'user-a' } };
  state.requestHeaders = new Headers();
}
const form = (values) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

test('post-login routes accept same origin and reject ambiguous callbacks', () => {
  const { load } = context();
  const { safePostLoginPath } = load(resolve(source, 'lib/auth-redirect'));
  const origin = 'https://campusforge.example';
  for (const value of [
    '/w/owned/tasks?view=list#due',
    'https://campusforge.example/w/owned/tasks?x=hello%20world',
  ]) {
    assert.equal(
      safePostLoginPath(value, origin),
      new URL(value, origin).pathname + new URL(value, origin).search + new URL(value, origin).hash,
    );
  }
  for (const value of [
    null,
    {},
    'javascript:window.marker=1',
    'JaVaScRiPt:1',
    'https:/dashboard',
    'https:dashboard',
    'data:text/html,x',
    'https://evil.invalid/',
    '//evil.invalid',
    '/\\evil.invalid',
    '/%5cevil.invalid',
    '/%2fevil.invalid',
    '/%252fevil.invalid',
    '/%0aevil',
    '/%7fevil',
    '/%zz',
    '\u0000/dashboard',
    '/dashboard\r\n',
    '/\u0085dashboard',
    '/%C2%85dashboard',
    '/\u2028dashboard',
    '/%E2%80%A8dashboard',
    '/\ufeffdashboard',
    ' https://campusforge.example/',
    'https://a@campusforge.example/',
  ]) {
    assert.equal(safePostLoginPath(value, origin), '/dashboard');
  }
  assert.equal(safePostLoginPath('https://campusforge.example/w/owned'), '/dashboard');
});

test('new UTF-8 password boundary, distinct suffix and documented legacy bcrypt equivalence', async () => {
  const { load } = context();
  const { signUpSchema, signInSchema } = load(resolve(root, 'packages/shared/src/index'));
  const accepted = ['A'.repeat(71), 'A'.repeat(72), '€'.repeat(23) + 'AA', '€'.repeat(24)];
  for (const password of accepted) {
    assert.ok(
      signUpSchema.safeParse({ name: 'Synthetic', email: 'synthetic@example.invalid', password })
        .success,
    );
    const hash = await realBcrypt.hash(password, 12);
    assert.ok(await realBcrypt.compare(password, hash));
    assert.equal(await realBcrypt.compare(password.slice(0, -1) + 'B', hash), false);
  }
  for (const password of ['A'.repeat(73), '€'.repeat(24) + 'A', '1234567\ud800']) {
    assert.equal(
      signUpSchema.safeParse({ name: 'Synthetic', email: 'synthetic@example.invalid', password })
        .success,
      false,
    );
  }
  const legacy = 'A'.repeat(72) + 'original-suffix';
  assert.ok(signInSchema.safeParse({ email: 'legacy@example.invalid', password: legacy }).success);
  assert.ok(
    signInSchema.safeParse({ email: 'legacy@example.invalid', password: '€'.repeat(128) }).success,
  );
  assert.equal(
    signInSchema.safeParse({ email: 'legacy@example.invalid', password: 'A'.repeat(513) }).success,
    false,
  );
  const legacyHash = await realBcrypt.hash(legacy, 12);
  assert.ok(await realBcrypt.compare('A'.repeat(72) + 'different-suffix', legacyHash));
});

test('credentials provider and sign-in action share budget before DB and bcrypt (mock Redis/Prisma)', async () => {
  reset();
  const { config, load } = context();
  const { signInAction } = load(resolve(source, 'server/actions/auth'));
  const credentials = { email: 'a@example.invalid', password: 'synthetic-valid-password' };
  for (let index = 0; index < 5; index += 1)
    await config.providers[0].authorize(credentials, { headers: state.requestHeaders });
  for (let index = 0; index < 5; index += 1)
    assert.ok((await signInAction(form(credentials))).success);
  const blocked = await signInAction(form(credentials));
  assert.equal(blocked.success, false);
  assert.match(blocked.error, /Too many attempts/);
  await assert.rejects(
    config.providers[0].authorize(credentials, { headers: state.requestHeaders }),
    (error) => error.code === 'rate_limited',
  );
  assert.equal(state.dbReads, 10);
  assert.equal(state.compares, 10);
  state.now = 15 * 60_000 + 1;
  assert.ok((await signInAction(form(credentials))).success);
  assert.equal(state.dbReads, 11);
});

test('versioned new hashes reject ignored suffix at real provider; unmarked legacy hashes retain login', async () => {
  reset();
  const { config, load } = context({ realCrypto: true });
  const { strictBcryptPasswordHash } = load(resolve(root, 'packages/shared/src/index'));
  for (const password of ['A'.repeat(72), '€'.repeat(24)]) {
    const rawHash = await realBcrypt.hash(password, 12);
    state.user.passwordHash = strictBcryptPasswordHash(rawHash);
    const login = (value) =>
      config.providers[0].authorize(
        { email: 'a@example.invalid', password: value },
        { headers: state.requestHeaders },
      );
    assert.equal((await login(password)).id, 'user-a');
    assert.equal(await login(password + 'different-suffix'), null);
    state.user.passwordHash = rawHash;
    assert.equal((await login(password + 'legacy-suffix')).id, 'user-a');
  }
});

test('parallel instances share atomic mocked account budget; spoofed forwarding cannot split source', async () => {
  reset();
  const first = context();
  const second = context();
  const attempts = await Promise.allSettled(
    Array.from({ length: 24 }, (_, index) => {
      const config = index % 2 ? first.config : second.config;
      return config.providers[0].authorize(
        { email: 'a@example.invalid', password: 'wrong' },
        {
          headers: new Headers({
            'x-forwarded-for': `192.0.2.${index + 1}`,
            'x-campusforge-client-ip': `192.0.2.${index + 1}`,
          }),
        },
      );
    }),
  );
  assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 10);
  assert.equal(state.dbReads, 10);
  assert.equal(state.compares, 10);
  const limiter = first.load(resolve(source, 'lib/auth-rate-limit'));
  assert.equal(
    limiter.passwordRequestSource(new Headers({ 'x-forwarded-for': '192.0.2.1' }), true),
    'unknown',
  );
  assert.equal(
    limiter.passwordRequestSource(
      new Headers({ 'x-campusforge-client-ip': '192.0.2.1, 192.0.2.2' }),
      true,
    ),
    'unknown',
  );
  assert.equal(
    limiter.passwordRequestSource(new Headers({ 'x-campusforge-client-ip': '192.0.2.1' }), true),
    'ip:192.0.2.1',
  );
  assert.equal(
    limiter.passwordRequestSource(
      new Headers({ 'x-campusforge-client-ip': '2001:0db8:0:0:0:0:0:1' }),
      true,
    ),
    limiter.passwordRequestSource(new Headers({ 'x-campusforge-client-ip': '2001:db8::1' }), true),
  );
});

test('signup rotating emails stop at shared source budget; existing account receives same outcome', async () => {
  reset();
  const { load } = context();
  const { signUpAction } = load(resolve(source, 'server/actions/auth'));
  for (let index = 0; index < 5; index += 1) {
    const result = await signUpAction(
      form({ name: 'Synthetic', email: `new-${index}@example.invalid`, password: 'Synthetic123' }),
    );
    assert.ok(result.success);
  }
  const sixth = await signUpAction(
    form({ name: 'Synthetic', email: 'new-sixth@example.invalid', password: 'Synthetic123' }),
  );
  assert.match(sixth.error, /Too many attempts/);
  assert.equal(state.hashes, 5);
  assert.equal(state.dbReads, 5);
  assert.equal(state.writes, 5);
  reset();
  const existing = await signUpAction(
    form({ name: 'Synthetic', email: 'a@example.invalid', password: 'Synthetic123' }),
  );
  const created = await signUpAction(
    form({ name: 'Synthetic', email: 'new@example.invalid', password: 'Synthetic123' }),
  );
  assert.ok(existing.success && created.success);
  assert.deepEqual(Object.keys(existing), Object.keys(created));
  assert.equal(state.hashes, 2);
  assert.equal(state.writes, 1);
});

test('absent account and wrong password both compare once; rotating login emails consume source budget', async () => {
  reset();
  const { config } = context();
  for (let index = 0; index < 60; index += 1) {
    assert.equal(
      await config.providers[0].authorize(
        { email: `missing-${index}@example.invalid`, password: 'wrong' },
        { headers: state.requestHeaders },
      ),
      null,
    );
  }
  await assert.rejects(
    config.providers[0].authorize(
      { email: 'one-more@example.invalid', password: 'wrong' },
      { headers: state.requestHeaders },
    ),
    (error) => error.code === 'rate_limited',
  );
  assert.equal(state.dbReads, 60);
  assert.equal(state.compares, 60);
});

test('Redis outage denies before expensive work; deadline is finite and recovery is possible (mock store)', async () => {
  reset();
  const { config, load } = context();
  const { signUpAction, signInAction } = load(resolve(source, 'server/actions/auth'));
  state.outage = true;
  await assert.rejects(
    config.providers[0].authorize(
      { email: 'a@example.invalid', password: 'wrong' },
      { headers: state.requestHeaders },
    ),
    (error) => error.code === 'temporarily_unavailable',
  );
  assert.match(
    (await signInAction(form({ email: 'a@example.invalid', password: 'wrong' }))).error,
    /temporarily unavailable/,
  );
  assert.match(
    (
      await signUpAction(
        form({ name: 'Synthetic', email: 'new@example.invalid', password: 'Synthetic123' }),
      )
    ).error,
    /temporarily unavailable/,
  );
  assert.equal(state.dbReads + state.compares + state.hashes + state.writes, 0);
  const limiter = load(resolve(source, 'lib/auth-rate-limit'));
  const started = performance.now();
  await assert.rejects(
    limiter.withinPasswordLimiterDeadline(() => new Promise(() => {})),
    /deadline/,
  );
  assert.ok(performance.now() - started < 2500);
  state.outage = false;
  assert.ok(
    (await signInAction(form({ email: 'a@example.invalid', password: 'synthetic-valid-password' })))
      .success,
  );
});

test('client JWT update cannot change identity or grow cookie claims; trusted DB refresh follows onboarding write', async () => {
  reset();
  const { config, load } = context();
  const token = {
    id: 'user-a',
    sub: 'user-a',
    name: 'Saved profile',
    email: 'a@example.invalid',
    role: 'STUDENT',
    onboardingCompleted: false,
  };
  const injected = {
    id: 'user-b',
    role: 'ADMIN',
    name: 'x'.repeat(100_000),
    onboardingCompleted: true,
  };
  const changed = await config.callbacks.jwt({
    token: { ...token },
    trigger: 'update',
    session: injected,
  });
  assert.deepEqual(changed, token);
  assert.ok(JSON.stringify(changed).length < 500);
  const edge = load(resolve(source, 'lib/auth.config')).authConfig;
  assert.deepEqual(
    await edge.callbacks.jwt({ token: { ...token }, trigger: 'update', session: injected }),
    token,
  );
  const { completeOnboardingAction } = load(resolve(source, 'server/actions/auth'));
  assert.ok(
    (
      await completeOnboardingAction(
        form({
          name: 'Trusted new name',
          university: 'Synthetic university',
          major: 'Synthetic major',
          graduationYear: '2028',
        }),
      )
    ).success,
  );
  const refreshed = await config.callbacks.jwt({
    token: { ...token },
    trigger: 'update',
    session: null,
  });
  assert.equal(refreshed.id, 'user-a');
  assert.equal(refreshed.role, 'STUDENT');
  assert.equal(refreshed.name, 'Trusted new name');
  assert.equal(refreshed.onboardingCompleted, true);
  state.user = null;
  assert.equal(await config.callbacks.jwt({ token, trigger: 'update', session: injected }), null);
});

test('anonymous and foreign workspace boundaries reject before profile mutations', async () => {
  reset();
  const { load } = context();
  const { requireAuth, requireWorkspaceMember } = load(
    resolve(source, 'server/services/auth-helpers'),
  );
  assert.equal((await requireWorkspaceMember('user-a', 'ws-owned')).role, 'OWNER');
  await assert.rejects(requireWorkspaceMember('user-a', 'ws-foreign'), /Not a member/);
  state.session = null;
  await assert.rejects(requireAuth(), /Not authenticated/);
  const { completeOnboardingAction } = load(resolve(source, 'server/actions/auth'));
  await assert.rejects(completeOnboardingAction(form({ name: 'Injected' })), /Not authenticated/);
  assert.equal(state.writes, 0);
});

test('actual middleware redirect decisions enforce valid identity and saved onboarding claims (mock response)', async () => {
  reset();
  const { load } = context();
  const middleware = load(resolve(source, 'middleware')).default;
  const request = (path, user) => ({
    nextUrl: new URL(path, 'https://campusforge.example'),
    auth: user ? { user } : null,
  });
  assert.match(
    (await middleware(request('/w/ws-owned/tasks', null))).location,
    /sign-in\?callbackUrl=/,
  );
  assert.match(
    (await middleware(request('/dashboard', { name: 'malformed' }))).location,
    /sign-in\?callbackUrl=/,
  );
  assert.match(
    (await middleware(request('/dashboard', { id: 'user-a', onboardingCompleted: false })))
      .location,
    /\/onboarding$/,
  );
  assert.deepEqual(
    await middleware(request('/dashboard', { id: 'user-a', onboardingCompleted: true })),
    { next: true },
  );
  assert.match(
    (await middleware(request('/onboarding', { id: 'user-a', onboardingCompleted: true })))
      .location,
    /\/dashboard$/,
  );
});

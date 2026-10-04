import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

// Real Auth.js/Next application entrances; Prisma/Redis/S3/queue are explicitly
// synthetic fixture boundaries. These tests do not establish live infrastructure readiness.
async function control(request: APIRequestContext, input: Record<string, unknown>) {
  return request.post('/api/r2-control', { data: input });
}
async function counters(request: APIRequestContext) {
  return (await (await request.get('/api/r2-control')).json()).counters;
}
async function csrf(request: APIRequestContext): Promise<string> {
  return (await (await request.get('/api/auth/csrf')).json()).csrfToken;
}
async function credentials(
  request: APIRequestContext,
  password = 'wrong',
  extraHeaders = {},
  email = 'r2-user-a@example.test',
) {
  const token = await csrf(request);
  const response = await request.post('/api/auth/callback/credentials', {
    headers: { 'X-Auth-Return-Redirect': '1', ...extraHeaders },
    form: {
      csrfToken: token,
      email,
      password,
      callbackUrl: '/dashboard',
    },
  });
  return { response, body: await response.json() };
}
async function action(page: Page, kind: 'signin' | 'signup' | 'onboarding') {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.request().method() === 'POST' && candidate.url().includes('/auth-entrance'),
  );
  await page.getByRole('button', { name: `Actual ${kind} action`, exact: true }).click();
  await response;
  await expect(
    page.getByRole('button', { name: `Actual ${kind} action`, exact: true }),
  ).toBeEnabled();
  return page.getByTestId('auth-result').innerText();
}

test.beforeEach(async ({ request }) => {
  await control(request, { reset: true });
});

test('actual Auth.js requires CSRF for credentials, session updates and signout', async ({
  page,
}) => {
  const request = page.request;
  const missing = await request.post('/api/auth/callback/credentials', {
    headers: { 'X-Auth-Return-Redirect': '1' },
    form: { email: 'r2-user-a@example.test', password: 'R2 synthetic password' },
  });
  expect((await missing.json()).url).toContain('MissingCSRF');
  expect(await counters(request)).toMatchObject({ lookups: 0, compares: 0 });
  expect((await credentials(request, 'R2 synthetic password')).body.url).toContain('/dashboard');
  const original = await (await request.get('/api/auth/session')).json();
  expect(original.user.id).toBe('r2-user-a');
  await request.post('/api/auth/session', {
    data: { data: { id: 'r2-user-b', onboardingCompleted: true } },
  });
  await request.post('/api/auth/signout', { form: { callbackUrl: '/sign-in' } });
  const unchanged = await (await request.get('/api/auth/session')).json();
  expect(unchanged.user).toEqual(original.user);
});

test('actual session update ignores attacker claims, bounds cookie size and reloads legitimate DB writes', async ({
  page,
}) => {
  const request = page.request;
  await credentials(request, 'R2 synthetic password');
  const initialMiddleware = await request.get('/api/r2-middleware-probe?path=/dashboard', {
    maxRedirects: 0,
  });
  expect(initialMiddleware.status()).toBe(307);
  expect(initialMiddleware.headers().location).toContain('/onboarding');
  const token = await csrf(request);
  for (const data of [
    { id: 'r2-user-b', role: 'ADMIN', onboardingCompleted: true, name: 'forged'.repeat(30_000) },
    ['malformed', { id: 'r2-user-b' }],
    null,
  ]) {
    const response = await request.post('/api/auth/session', { data: { csrfToken: token, data } });
    expect(response.status()).toBe(200);
    const session = await response.json();
    expect(session.user).toMatchObject({
      id: 'r2-user-a',
      role: 'STUDENT',
      onboardingCompleted: false,
      name: 'r2-user-a',
    });
    expect((response.headers()['set-cookie'] ?? '').length).toBeLessThan(5_000);
  }
  const malformed = await request.post('/api/auth/session', {
    headers: { 'Content-Type': 'application/json' },
    data: '{"data":',
  });
  expect(malformed.status()).toBeGreaterThanOrEqual(400);
  expect((malformed.headers()['set-cookie'] ?? '').length).toBeLessThan(5_000);
  await page.goto('/auth-entrance');
  expect(await action(page, 'onboarding')).toContain('"success":true');
  const updated = await request.post('/api/auth/session', {
    data: { csrfToken: await csrf(request), data: { id: 'r2-user-b' } },
  });
  expect((await updated.json()).user).toMatchObject({
    id: 'r2-user-a',
    name: 'R2 trusted onboarding name',
    onboardingCompleted: true,
    role: 'STUDENT',
  });
  const middleware = await request.get('/api/r2-middleware-probe?path=/dashboard', {
    maxRedirects: 0,
  });
  expect(middleware.status()).toBe(200);
});

test('credentials API and actual server action share budget; spoofed forwarding does not bypass it', async ({
  page,
}) => {
  const request = page.request;
  const token = await csrf(request);
  const responses = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      request.post('/api/auth/callback/credentials', {
        headers: {
          'X-Auth-Return-Redirect': '1',
          'X-Forwarded-For': `192.0.2.${index + 1}`,
          'X-CampusForge-Client-IP': `192.0.2.${index + 1}`,
        },
        form: { csrfToken: token, email: 'r2-user-a@example.test', password: 'wrong' },
      }),
    ),
  );
  const urls = await Promise.all(responses.map(async (response) => (await response.json()).url));
  expect(urls.filter((url) => url.includes('rate_limited'))).toHaveLength(2);
  const before = await counters(request);
  expect(before).toMatchObject({ lookups: 10, compares: 10 });
  await page.goto('/auth-entrance');
  expect(await action(page, 'signin')).toContain('Too many attempts');
  expect(await counters(request)).toEqual(before);
  await control(request, { cooldown: true });
  expect((await credentials(request, 'R2 synthetic password')).body.url).toContain('/dashboard');
});

test('signup different emails shares source budget; Redis outage fails closed and recovery works', async ({
  page,
}) => {
  await page.goto('/auth-entrance');
  const form = page.getByTestId('signup');
  for (let index = 0; index < 5; index++) {
    await form.locator('[name=email]').fill(`r2-new-${index}@example.test`);
    expect(await action(page, 'signup')).toContain('"success":true');
  }
  const before = await counters(page.request);
  expect(before.hashes).toBe(5);
  await form.locator('[name=email]').fill('r2-different-email@example.test');
  expect(await action(page, 'signup')).toContain('Too many attempts');
  expect(await counters(page.request)).toEqual(before);
  await control(page.request, { cooldown: true, outage: true });
  expect((await credentials(page.request, 'R2 synthetic password')).body.url).toContain(
    'temporarily_unavailable',
  );
  expect(await action(page, 'signin')).toContain('temporarily unavailable');
  expect(await action(page, 'signup')).toContain('temporarily unavailable');
  expect(await counters(page.request)).toEqual(before);
  await control(page.request, { outage: false });
  expect((await credentials(page.request, 'R2 synthetic password')).body.url).toContain(
    '/dashboard',
  );
});

test('actual Next Server Action rejects cross-origin replay before new work', async ({ page }) => {
  await page.goto('/auth-entrance');
  const captured = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().includes('/auth-entrance'),
  );
  await action(page, 'signup');
  const original = await captured;
  const before = await counters(page.request);
  const headers = await original.allHeaders();
  const replay = await page.request.post('/auth-entrance', {
    headers: { ...headers, origin: 'https://sibling.example.test', 'sec-fetch-site': 'same-site' },
    data: original.postDataBuffer()!,
  });
  expect(replay.status()).toBe(500);
  expect(await counters(page.request)).toEqual(before);
});

test('actual upload handler denies bad origin, anonymous and foreign workspace before mocked upload', async ({
  page,
}) => {
  const request = page.request;
  const path = '/api/workspaces/cr2workspace00000000000001/documents/upload';
  for (const headers of [
    {},
    { Origin: 'https://sibling.example.test', 'Sec-Fetch-Site': 'same-site' },
    { Origin: 'http://127.0.0.1:3217', 'Sec-Fetch-Site': 'same-site' },
    { Origin: 'null' },
  ])
    expect((await request.post(path, { headers })).status()).toBe(403);
  expect(await counters(request)).toMatchObject({ lookups: 0, uploads: 0 });
  expect(
    (await request.post(path, { headers: { Origin: 'http://127.0.0.1:3217' } })).status(),
  ).toBe(401);
  await credentials(request, 'R2 synthetic password');
  const headers = { Origin: 'http://127.0.0.1:3217', 'Sec-Fetch-Site': 'same-origin' };
  expect(
    (await request.post('/api/workspaces/foreign/documents/upload', { headers })).status(),
  ).toBe(403);
  const accepted = await request.post(path, {
    headers,
    multipart: {
      file: { name: 'r2.txt', mimeType: 'text/plain', buffer: Buffer.from('R2 synthetic text') },
    },
  });
  expect(accepted.status()).toBe(201);
  expect(await counters(request)).toMatchObject({ uploads: 1 });
});

test('actual middleware denies anonymous access and routes onboarding/auth consistently', async ({
  page,
}) => {
  const request = page.request;
  const anonymous = await request.get('/api/r2-middleware-probe?path=/w/foreign/tasks', {
    maxRedirects: 0,
  });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location).toContain('/sign-in?callbackUrl=');
  await credentials(request, 'R2 synthetic password');
  const authPage = await request.get('/api/r2-middleware-probe?path=/sign-in', { maxRedirects: 0 });
  expect(authPage.status()).toBe(307);
  expect(authPage.headers().location).toContain('/dashboard');
});

test('actual privacy shell checks current session before showing cached children', async ({
  page,
}) => {
  await page.goto('/r2-private-shell');
  await expect(page.getByRole('status')).toContainText('Local session cleared');
  await expect(page.getByText('R2_A_VERIFIED_PRIVATE_SHELL')).toHaveCount(0);
  await credentials(page.request, 'R2 synthetic password');
  await page.reload();
  await expect(page.getByText('R2_A_VERIFIED_PRIVATE_SHELL')).toBeVisible();
  await page.getByLabel('Synthetic private draft').fill('R2 focus-kept private draft');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Synthetic private draft')).toBeVisible();
  await expect(page.getByLabel('Synthetic private draft')).toHaveValue(
    'R2 focus-kept private draft',
  );
  await page.context().clearCookies();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('status')).toContainText('Local session cleared');
  await expect(page.getByText('R2_A_VERIFIED_PRIVATE_SHELL')).toHaveCount(0);
});

test('actual onboarding form writes verified profile, refreshes session and opens dashboard', async ({
  page,
}) => {
  await credentials(page.request, 'R2 synthetic password');
  await page.goto('/r2-onboarding-real');
  await page.getByLabel('Full Name', { exact: true }).fill('R2 legitimate profile');
  await page.getByLabel('University', { exact: true }).fill('Synthetic university');
  await page.getByLabel('Major', { exact: true }).fill('Computer science');
  await page.getByRole('button', { name: 'Continue to Dashboard', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:3217/dashboard');
  const session = await (await page.request.get('/api/auth/session')).json();
  expect(session.user).toMatchObject({
    id: 'r2-user-a',
    name: 'R2 legitimate profile',
    onboardingCompleted: true,
  });
  expect((await page.request.get('/api/r2-middleware-probe?path=/dashboard')).status()).toBe(200);
});

test('actual signup and credentials enforce marked72-byte hashes and preserve raw legacy compatibility', async ({
  page,
}) => {
  await page.goto('/auth-entrance');
  const signup = page.getByTestId('signup');
  const email = 'r2-new-strict@example.test';
  await signup.locator('[name=email]').fill(email);
  await signup.locator('[name=password]').fill('A'.repeat(73));
  expect(await action(page, 'signup')).toContain('72 UTF-8 bytes');
  expect((await counters(page.request)).hashes).toBe(0);
  await signup.locator('[name=password]').fill('A'.repeat(72));
  expect(await action(page, 'signup')).toContain('"success":true');
  expect((await credentials(page.request, 'A'.repeat(72), {}, email)).body.url).toContain(
    '/dashboard',
  );
  expect(
    (await credentials(page.request, 'A'.repeat(72) + 'ignored suffix', {}, email)).body.url,
  ).toContain('CredentialsSignin');
  expect(
    (
      await credentials(
        page.request,
        'L'.repeat(72) + 'different suffix',
        {},
        'r2-legacy-long@example.test',
      )
    ).body.url,
  ).toContain('/dashboard');
});

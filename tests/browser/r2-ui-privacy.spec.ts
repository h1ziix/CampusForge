import { expect, test, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const evidence = resolve(__dirname, '../../docs/releases/R2-evidence');
const errorMap = new Map<Page, string[]>();
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  errorMap.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => {
  expect(errorMap.get(page)).toEqual([]);
  errorMap.delete(page);
});

async function send(page: Page, marker: string) {
  await page.getByPlaceholder('Message CampusForge AI...').fill(marker);
  await page.getByRole('button', { name: 'Send message', exact: true }).click();
  await expect(
    page.getByText(marker, { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
}
async function storage(page: Page) {
  return page.evaluate(() =>
    Object.fromEntries(Object.keys(localStorage).map((key) => [key, localStorage.getItem(key)])),
  );
}

test('fixture-login callbacks remain same-origin and valid local destinations work', async ({
  page,
}) => {
  const blocked = [
    'javascript:window.__r2Callback=42',
    'data:text/html,marker',
    'https://example.invalid/r2',
    '//example.invalid/r2',
    '/\\example.invalid/r2',
    '/%5cexample.invalid',
    '/%252f%252fexample.invalid',
    '/\u0001evil',
    '/%0aevil',
    'java\tscript:window.__r2Callback=42',
  ];
  for (const callback of blocked) {
    await page.goto(`/sign-in?callbackUrl=${encodeURIComponent(callback)}`);
    await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
    await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL('http://127.0.0.1:3217/dashboard');
    expect(
      await page.evaluate(
        () => (window as typeof window & { __r2Callback?: number }).__r2Callback ?? null,
      ),
    ).toBeNull();
  }
  await page.goto(
    `/sign-in?callbackUrl=${encodeURIComponent('/w/r1-synthetic-workspace/tasks?view=all#owned')}`,
  );
  await page.getByLabel('Email', { exact: true }).fill('synthetic@example.test');
  await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page).toHaveURL(
    'http://127.0.0.1:3217/w/r1-synthetic-workspace/tasks?view=all#owned',
  );
});

test('Markdown allowlist renders dangerous links as text and escapes raw HTML', async ({
  page,
}) => {
  await page.goto('/markdown');
  await expect(page.getByRole('link', { name: 'unsafe-js' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'unsafe-data' })).toHaveCount(0);
  await expect(page.getByText('unsafe-js', { exact: true })).toBeVisible();
  await expect(page.getByText('unsafe-data', { exact: true })).toBeVisible();
  await expect(page.locator('main img')).toHaveCount(0);
  await expect(
    page.getByText('<img src=x onerror=window.__r2RawHtml=1>', { exact: true }),
  ).toBeVisible();
  const external = page.getByRole('link', { name: 'safe-external' });
  await expect(external).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(external).toHaveAttribute('target', '_blank');
  const popup = page.waitForEvent('popup');
  await page.getByRole('link', { name: 'safe-local' }).click();
  const localDestination = await popup;
  await expect(localDestination).toHaveURL(/\/dashboard$/);
  await localDestination.close();
});

test('A/ws1 to A/ws2 to logout to B/ws1 isolates content, attachments and transient drafts across tabs/reload/back', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('r2-fixture-initialized')) return;
    localStorage.setItem('r2-fixture-initialized', 'true');
    localStorage.setItem('unrelated-product', 'preserved');
    localStorage.setItem('campusforge-theme', 'dark');
    localStorage.setItem(
      'campusforge:assistant:v1',
      JSON.stringify({ conversations: [{ title: 'R2 ownerless legacy private marker' }] }),
    );
  });
  await page.goto('/r2-privacy');
  await expect(page.getByText('R2 ownerless legacy private marker')).toHaveCount(0);
  await send(page, 'R2_A_WS1_PRIVATE');
  await expect.poll(async () => JSON.stringify(await storage(page))).toContain('R2_A_WS1_PRIVATE');
  await page.getByRole('button', { name: 'A/ws2', exact: true }).click();
  await expect(page.getByText('R2_A_WS1_PRIVATE', { exact: true })).toHaveCount(0);
  await send(page, 'R2_A_WS2_PRIVATE');
  await expect
    .poll(async () => (await storage(page))['campusforge:assistant:v2:r2-user-a:ws2'])
    .toContain('R2_A_WS2_PRIVATE');
  await page.getByRole('button', { name: 'A/ws1', exact: true }).click();
  await expect(
    page.getByText('R2_A_WS1_PRIVATE', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await expect(page.getByText('R2_A_WS2_PRIVATE', { exact: true })).toHaveCount(0);
  const other = await context.newPage();
  await other.goto('/r2-privacy');
  await expect(
    other.getByText('R2_A_WS1_PRIVATE', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  const stop = page.getByRole('button', { name: 'Stop generating' });
  if (await stop.count()) await stop.click();
  await page.getByPlaceholder('Message CampusForge AI...').fill('R2 unsent private draft');
  await page.locator('input[type=file]').setInputFiles({
    name: 'R2_PRIVATE_ATTACHMENT.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('synthetic'),
  });
  await expect(page.getByText('R2_PRIVATE_ATTACHMENT.txt', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'A/ws2', exact: true }).click();
  await expect(page.getByPlaceholder('Message CampusForge AI...')).toHaveValue('');
  await expect(page.getByText('R2_PRIVATE_ATTACHMENT.txt', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(
    other.getByRole('status').filter({ hasText: 'Local session cleared' }),
  ).toBeVisible();
  await expect(other.getByText('R2_A_WS1_PRIVATE', { exact: true })).toHaveCount(0);
  await page.goto('/r2-privacy?user=b');
  await expect(page.getByPlaceholder('Message CampusForge AI...')).toBeVisible();
  await expect(page.getByText(/R2_A_WS[12]_PRIVATE/)).toHaveCount(0);
  await send(page, 'R2_B_WS1_PRIVATE');
  await expect
    .poll(async () => (await storage(page))['campusforge:assistant:v2:r2-user-b:ws1'])
    .toContain('R2_B_WS1_PRIVATE');
  await page.reload();
  await expect(
    page.getByText('R2_B_WS1_PRIVATE', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  await page.goto('/sign-in');
  await page.goBack();
  await expect(
    page.getByText('R2_B_WS1_PRIVATE', { exact: true }).filter({ visible: true }).first(),
  ).toBeVisible();
  const saved = await storage(page);
  expect(saved['unrelated-product']).toBe('preserved');
  expect(saved['campusforge-theme']).toBe('dark');
  expect(saved['campusforge:assistant:v1']).toBeUndefined();
  expect(JSON.stringify(saved)).not.toContain('R2_A_WS1_PRIVATE');
  expect(JSON.stringify(saved)).not.toContain('R2_A_WS2_PRIVATE');
  await other.close();
});

test('autosave false and blocked storage preserve operation without persisting private conversations', async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'campusforge:assistant:prefs:v2:r2-user-a:ws1',
      JSON.stringify({ autoSave: false, theme: 'light' }),
    );
  });
  await page.goto('/r2-privacy');
  await send(page, 'R2_AUTOSAVE_OFF_PRIVATE');
  await expect
    .poll(async () => (await storage(page))['campusforge:assistant:v2:r2-user-a:ws1'])
    .toBeUndefined();
  expect(JSON.stringify(await storage(page))).not.toContain('R2_AUTOSAVE_OFF_PRIVATE');
  await page.reload();
  await expect(page.getByText('R2_AUTOSAVE_OFF_PRIVATE', { exact: true })).toHaveCount(0);
  await page.addInitScript(() => {
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      Object.defineProperty(Storage.prototype, method, {
        value() {
          throw new DOMException('Synthetic denied storage', 'SecurityError');
        },
      });
    }
  });
  await page.reload();
  await send(page, 'R2_STORAGE_BLOCKED_PRIVATE');
  await page.getByRole('button', { name: 'B/ws1', exact: true }).click();
  await expect(page.getByText('R2_STORAGE_BLOCKED_PRIVATE', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('auth and revoked session UI matrix checks 390/768/1024/1440 light/dark keyboard pending error focus', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await mkdir(evidence, { recursive: true });
  // Explicit network failure: local content stays revoked while logout retries.
  await page.route('**/api/auth/signout', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.abort();
  });
  const results: Record<string, unknown>[] = [];
  for (const width of [390, 768, 1024, 1440]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page.goto('/sign-in');
      await page
        .locator('html')
        .evaluate((html, value) => html.classList.toggle('dark', value === 'dark'), theme);
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Email', { exact: true })).toBeFocused();
      await page.keyboard.type('error@example.test');
      await page.keyboard.press('Tab');
      await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
      await page.keyboard.type('synthetic-password');
      await page.screenshot({
        path: resolve(evidence, `signin-${width}-${theme}-focus.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
      await page.screenshot({
        path: resolve(evidence, `signin-${width}-${theme}-pending.png`),
        animations: 'disabled',
      });
      await expect(page.getByText('Invalid email or password', { exact: true })).toBeVisible();
      await page.screenshot({
        path: resolve(evidence, `signin-${width}-${theme}-error.png`),
        animations: 'disabled',
      });
      await page.goto('/sign-up');
      await page
        .locator('html')
        .evaluate((html, value) => html.classList.toggle('dark', value === 'dark'), theme);
      await page.getByLabel('Name', { exact: true }).fill('R2 synthetic user');
      await page.getByLabel('Email', { exact: true }).fill('error@example.test');
      await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
      await page.getByRole('button', { name: 'Sign Up', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Creating account...' })).toBeDisabled();
      await expect(page.getByText('Please try again later.', { exact: true })).toBeVisible();
      await page.screenshot({
        path: resolve(evidence, `signup-${width}-${theme}-error.png`),
        animations: 'disabled',
      });
      await page.goto('/onboarding');
      await page
        .locator('html')
        .evaluate((html, value) => html.classList.toggle('dark', value === 'dark'), theme);
      await page.getByLabel('Full Name', { exact: true }).focus();
      await page.getByLabel('University', { exact: true }).fill('Synthetic university');
      await page.getByLabel('Major', { exact: true }).fill('Computer science');
      await page.getByRole('button', { name: 'Continue to Dashboard', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Saving...' })).toBeDisabled();
      await page.screenshot({
        path: resolve(evidence, `onboarding-${width}-${theme}-pending.png`),
        animations: 'disabled',
      });
      await expect(page.locator('form [role=alert]')).toHaveText(
        'Synthetic profile save error. Please try again.',
      );
      await page.screenshot({
        path: resolve(evidence, `onboarding-${width}-${theme}-error.png`),
        animations: 'disabled',
      });
      await page.goto('/r2-privacy');
      await page.emulateMedia({ colorScheme: theme });
      await expect(page.getByPlaceholder('Message CampusForge AI...')).toBeVisible();
      await page.screenshot({
        path: resolve(evidence, `assistant-${width}-${theme}.png`),
        animations: 'disabled',
      });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      expect(overflow).toBe(false);
      await page.getByRole('button', { name: 'Sign Out', exact: true }).click();
      await expect(
        page.getByText('Local session cleared. Sign in to continue.', { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: 'Sign Out', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Sign Out', exact: true }).focus();
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Retry sign out', exact: true })).toBeFocused();
      await page.screenshot({
        path: resolve(evidence, `session-cleared-${width}-${theme}-focus.png`),
        animations: 'disabled',
      });
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('button', { name: 'Signing out...', exact: true }),
      ).toBeDisabled();
      await page.screenshot({
        path: resolve(evidence, `session-cleared-${width}-${theme}-pending.png`),
        animations: 'disabled',
      });
      await expect(
        page.getByText('Unable to sign out. Check your connection and try again.', { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: resolve(evidence, `session-cleared-${width}-${theme}-error.png`),
        animations: 'disabled',
      });
      results.push({
        width,
        theme,
        keyboard: true,
        pending: true,
        error: true,
        visibleFocus: true,
        horizontalOverflow: overflow,
        pageErrors: [...errorMap.get(page)!],
      });
    }
  }
  await page.unroute('**/api/auth/signout');
  await writeFile(
    resolve(evidence, 'ui-matrix.json'),
    `${JSON.stringify({ boundary: 'Actual source UI; successful/error auth actions mocked explicitly; server identity synthetic', results }, null, 2)}\n`,
  );
});

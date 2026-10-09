import { expect, test, type Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: { id: 'r2-user-a' } } }),
  );
});

async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
}

for (const width of [390, 768, 1024, 1440]) {
  test(`R3 document rows preserve long names, badges and separate actions ${width}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/r3-ui');
    const document = page.locator('main a[href*="/documents/document-0"]');
    await expect(document).toBeVisible();
    await expect(page.locator('main a button')).toHaveCount(0);
    const remove = page.getByRole('button', { name: /^Delete LongSyntheticFilename/ }).first();
    await document.focus();
    await page.keyboard.press('Tab');
    await expect(remove).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(document).toBeFocused();
    await fits(page);
    const row = document.locator('..');
    await expect(row.getByText('Summary', { exact: true })).toBeVisible();
    await expect(row.getByText('Parsing', { exact: true })).toBeVisible();
    if (width <= 1024) {
      const linkBounds = await document.boundingBox();
      const statusBounds = await row.getByText('Summary', { exact: true }).boundingBox();
      expect(statusBounds!.y).toBeGreaterThanOrEqual(linkBounds!.y + linkBounds!.height);
    }
    await page.screenshot({ path: testInfo.outputPath(`documents-${width}.png`) });
    for (const key of ['Enter', 'Space']) {
      await remove.focus();
      const dialog = page.waitForEvent('dialog').then((dialog) => dialog.dismiss());
      await page.keyboard.press(key);
      await dialog;
      await expect(remove).toBeFocused();
      await expect(page).toHaveURL(/\/r3-ui$/);
    }
  });
}

test('R3 loading list and detail announce progress and fit a mobile shell', async ({ page }) => {
  for (const state of ['loading', 'detail-loading']) {
    await page.goto(`/r3-ui?state=${state}`);
    await expect(page.getByRole('status', { name: /Loading document/ })).toBeVisible();
    await fits(page);
  }
});

test('R3 upload Escape returns focus to each launcher including empty CTA', async ({ page }) => {
  await page.goto('/r3-ui?state=empty');
  await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible();
  for (const name of ['Upload', 'Upload First Document']) {
    const trigger = page.getByRole('button', { name, exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Upload Document' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  }
});

test('R3 upload progress is announced and remains scrollable', async ({ page }) => {
  await page.goto('/r3-ui?state=empty');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/workspaces/*/documents/upload', async (route) => {
    await pending;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Synthetic upload unavailable.' }),
    });
  });
  await page.locator('#doc-file').setInputFiles({
    name: 'allowed.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Allowed synthetic note'),
  });
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Uploading' })).toBeVisible();
  await fits(page);
  release();
  await expect(page.getByRole('alert')).toContainText('Synthetic upload unavailable.');
});

test('R3 long selected filename cannot horizontally scroll the upload dialog on keyboard focus', async ({
  page,
}) => {
  await page.goto('/r3-ui?state=empty');
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await page.locator('#doc-file').setInputFiles({
    name: `${'LongCourseFilename'.repeat(15)}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Synthetic note'),
  });
  await page.getByRole('button', { name: 'Remove selected file' }).focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  const dialog = page.getByRole('dialog', { name: 'Upload Document' });
  expect(
    await dialog.evaluate((element) => ({
      overflow: element.scrollWidth - element.clientWidth,
      offset: element.scrollLeft,
    })),
  ).toEqual({ overflow: 0, offset: 0 });
});

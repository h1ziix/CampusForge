import { expect, test } from '@playwright/test';

const title = 'Synthetic practice set for a permitted source';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'r3-set-list-user' } }),
    }),
  );
});

test('R3 saved set open and delete are separate named keyboard controls', async ({ page }) => {
  await page.goto('/r3-set-list');
  await expect(page.locator('main a button, main a [role="button"]')).toHaveCount(0);
  const open = page.getByRole('link', { name: title });
  const remove = page.getByRole('button', { name: `Delete ${title}`, exact: true });
  await expect(open).toHaveAttribute(
    'href',
    '/w/r3-set-list-workspace/flashcards/r3-synthetic-set',
  );
  let confirmations = 0;
  page.on('dialog', async (dialog) => {
    confirmations++;
    await dialog.dismiss();
  });
  await open.focus();
  await page.keyboard.press('Tab');
  await expect(remove).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(open).toBeFocused();
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => confirmations).toBe(1);
  await expect(remove).toBeFocused();
  await page.keyboard.press('Space');
  await expect.poll(() => confirmations).toBe(2);
  await expect(page).toHaveURL(/\/r3-set-list$/);
});

test('R3 empty saved sets explain current generation and offer a single semantic link', async ({
  page,
}) => {
  await page.goto('/r3-set-list?state=empty');
  await expect(page.getByRole('heading', { name: 'No flashcards yet' })).toBeVisible();
  await expect(page.getByText(/Generate flashcards from a document/)).toBeVisible();
  await expect(page.getByText(/sample previews only/)).toHaveCount(0);
  const documents = page.getByRole('link', { name: 'Go to Documents', exact: true });
  await expect(documents).toHaveAttribute('href', '/w/r3-set-list-workspace/documents');
  await expect(documents.locator('button')).toHaveCount(0);
});

test('R3 saved set loading announces progress and fits the mobile shell', async ({ page }) => {
  await page.goto('/r3-set-list?state=loading');
  const loading = page.getByRole('status', { name: 'Loading flashcard sets', exact: true });
  await expect(loading).toBeVisible();
  await expect(loading).toHaveAttribute('aria-busy', 'true');
  await expect(loading).toContainText('Loading flashcard sets...');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [390, 768, 1024, 1440]) {
  test(`R3 saved set metadata and actions fit at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/r3-set-list');
    await expect(page.getByRole('link', { name: title })).toBeVisible();
    await expect(page.getByRole('button', { name: `Delete ${title}`, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    const clippedText = await page
      .locator('main p')
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent),
      );
    expect(clippedText).toEqual([]);
    await page.screenshot({ path: info.outputPath(`set-list-${width}.png`), fullPage: true });
  });
}

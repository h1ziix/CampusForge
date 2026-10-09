import { expect, test, type Page, type TestInfo } from '@playwright/test';

const controls = '/api/r3-pilot-control';
const documents = '/w/r3-pilot-workspace/documents';
const filename = `Biology-${'longCourseNotes'.repeat(10)}.txt`;

async function capture(page: Page, info: TestInfo, state: string) {
  await expect(page.getByText('Checking session...', { exact: true })).toHaveCount(0);
  await expect(page.locator('main')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({
    path: info.outputPath(`${state}.png`),
    fullPage: true,
    animations: 'disabled',
  });
}

test.beforeEach(async ({ page, request }) => {
  await request.post(controls, { data: { reset: true } });
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ json: { user: { id: 'r2-user-a' } } }),
  );
});

for (const width of [390, 768, 1024, 1440]) {
  test(`R3 keyboard upload processing result Study return ${width}`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // Only infrastructure is synthetic. These are the exact production shell/list/upload/detail/Study components.
    await page.route('**/api/workspaces/r3-pilot-workspace/documents/upload', async (route) => {
      await request.post(controls, { data: { upload: filename } });
      await route.fulfill({
        status: 201,
        json: { documentId: 'botany', processingStatus: 'PENDING' },
      });
    });
    await page.goto(documents);
    await expect(page.getByRole('heading', { name: 'No documents yet' })).toBeVisible();
    await capture(page, info, 'empty');
    const upload = page.getByRole('button', { name: 'Upload', exact: true });
    await upload.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Upload Document' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('#doc-file')).toBeFocused();
    await page.locator('#doc-file').setInputFiles({
      name: filename,
      mimeType: 'text/plain',
      buffer: Buffer.from('Chlorophyll absorbs light so plants can produce sugars.'),
    });
    await page.getByRole('button', { name: 'Remove selected file' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Upload', exact: true })).toBeFocused();
    await capture(page, info, 'upload-focus');
    await page.keyboard.press('Space');
    await expect(dialog).toBeHidden();
    await expect(upload).toBeFocused();
    const open = page.getByRole('link', { name: new RegExp(filename.replaceAll('.', '\\.')) });
    await expect(open).toBeVisible();
    await capture(page, info, 'uploaded');
    await open.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: filename, exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Generate summary', exact: true }),
    ).toBeDisabled();
    await request.post(controls, { data: { parse: 'PROCESSING' } });
    await page.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(page.getByText('Parsing', { exact: true })).toBeVisible();
    await capture(page, info, 'processing');
    await request.post(controls, { data: { parse: 'COMPLETED' } });
    await page.getByRole('button', { name: 'Check status', exact: true }).click();
    const summary = page.getByRole('button', { name: 'Generate summary', exact: true });
    await expect(summary).toBeEnabled();
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('status').filter({ hasText: 'Queued on the server' }),
    ).toBeVisible();
    await request.post(controls, { data: { complete: true } });
    await page.getByRole('button', { name: 'Check status', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Photosynthesis', exact: true })).toBeVisible();
    const cards = page.getByRole('button', { name: 'Generate flashcards', exact: true });
    await cards.focus();
    await page.keyboard.press('Space');
    await expect(
      page.getByRole('status').filter({ hasText: 'Queued on the server' }),
    ).toBeVisible();
    await request.post(controls, { data: { complete: true } });
    await page.getByRole('button', { name: 'Check status', exact: true }).click();
    const study = page.getByRole('link', { name: 'Study', exact: true });
    await expect(study).toBeVisible();
    await capture(page, info, 'result');
    await study.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Study Mode', exact: true })).toBeVisible();
    const reveal = page.getByRole('button', { name: /show answer/i });
    await reveal.focus();
    expect(await reveal.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
      'none',
    );
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: /show question/i })).toContainText(
      'Chlorophyll.',
    );
    await page.keyboard.press('Space');
    await expect(reveal).toBeFocused();
    await capture(page, info, 'study-focus');
    await page.evaluate(() => window.scrollTo(0, 0));
    const scrollable = await page.evaluate(
      () => document.documentElement.scrollHeight > innerHeight,
    );
    await page.mouse.wheel(0, 700);
    if (scrollable) await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
    const source = page.getByRole('link', { name: filename, exact: true });
    await source.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { name: 'Photosynthesis', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back to Documents', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Summary', { exact: true })).toBeVisible();
    await capture(page, info, 'return');
    expect(errors).toEqual([]);
  });

  test(`R3 failure uncertain and parse failure are accessible ${width}`, async ({
    page,
    request,
  }, info) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    for (const mode of ['failed', 'uncertain']) {
      await request.post(controls, {
        data: { reset: true, mode, upload: filename, parse: 'COMPLETED' },
      });
      await page.goto(`${documents}/botany`);
      await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
      const alert = page.getByRole('alert').filter({ hasText: mode.toUpperCase() });
      await expect(alert).toBeVisible();
      if (mode === 'uncertain') await expect(alert).toContainText('A charge may have occurred');
      await expect(
        page.getByRole('button', { name: 'Summary requested', exact: true }),
      ).toBeDisabled();
      await page.getByRole('button', { name: 'Check status', exact: true }).focus();
      await page.keyboard.press('Enter');
      await capture(page, info, mode);
      const state = await (await request.get('/api/r2-generation-control')).json();
      expect(state.requests).toHaveLength(1);
      expect(state.operations).toHaveLength(1);
    }
    await request.post(controls, { data: { reset: true, upload: filename, parse: 'FAILED' } });
    await page.goto(`${documents}/botany`);
    await expect(
      page.getByRole('status').filter({ hasText: 'Text extraction failed' }),
    ).toBeVisible();
    await capture(page, info, 'parse-failed');
  });
}

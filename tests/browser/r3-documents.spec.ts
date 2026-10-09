import { expect, test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

for (const width of [390, 768, 1024, 1440]) {
  for (const theme of ['light', 'dark']) {
    test(`R3 persisted parsing states and upload error ${width} ${theme}`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('campusforge-theme', value), theme);
      await page.goto('/r3-documents');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /^(?!.*dark)/);
      await expect(page.getByText('Queued for parsing', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('status').filter({ hasText: 'Your file is saved' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Generate summary', exact: true }),
      ).toBeDisabled();
      await expect(
        page.getByRole('button', { name: 'Generate flashcards', exact: true }),
      ).toBeDisabled();
      const evidence = resolve(
        __dirname,
        '../..',
        process.env.R3_BROWSER_EVIDENCE_PATH ?? 'docs/releases/R3-evidence/browser',
      );
      await mkdir(evidence, { recursive: true });
      await page.screenshot({ path: resolve(evidence, `pending-${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'PROCESSING', exact: true }).click();
      await expect(page.getByText('Parsing', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: 'FAILED', exact: true }).click();
      await expect(
        page
          .getByRole('status')
          .filter({ hasText: /extraction failed/i })
          .first(),
      ).toBeVisible();
      await page.screenshot({ path: resolve(evidence, `failed-${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'COMPLETED', exact: true }).click();
      await expect(page.getByText('Text extracted', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Generate summary', exact: true }),
      ).toBeEnabled();
      await page.getByRole('button', { name: 'Open upload fixture' }).click();
      await expect(page.getByRole('dialog')).toContainText('Once saved, it is queued');
      await page.route('**/api/workspaces/*/documents/upload', (route) =>
        route.fulfill({
          status: 413,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Upload body exceeds its limit.' }),
        }),
      );
      await page.locator('#doc-file').setInputFiles({
        name: 'synthetic.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from('Synthetic text'),
      });
      await page.getByRole('button', { name: 'Upload', exact: true }).click();
      await expect(page.getByRole('alert')).toContainText('Upload body exceeds its limit.');
      await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled();
      await page.screenshot({ path: resolve(evidence, `upload-error-${width}-${theme}.png`) });
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
      expect(errors).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
}

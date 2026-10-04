import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

/** Inspect public production UI without submitting credentials or invoking actions. */
export async function probePublicUi(baseUrl, outputDirectory) {
  const origin = new URL(baseUrl);
  assert.equal(origin.protocol, 'http:');
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(origin.hostname),
    'Only the isolated local runtime is permitted.',
  );
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const results = [];
  try {
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ]) {
      const context = await browser.newContext({
        viewport: { width, height },
        colorScheme: 'light',
        locale: 'en-US',
      });
      const page = await context.newPage();
      const pageErrors = [];
      const actionRequests = [];
      const externalRequests = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('request', (request) => {
        if (request.headers()['next-action']) actionRequests.push(request.method());
        if (new URL(request.url()).origin !== origin.origin) externalRequests.push(request.url());
      });
      const response = await page.goto(new URL('/sign-in', origin).href, {
        waitUntil: 'networkidle',
      });
      assert.equal(response?.status(), 200);
      await page.getByRole('heading', { name: 'Welcome back', exact: true }).waitFor();
      const email = page.getByLabel('Email', { exact: true });
      const password = page.getByLabel('Password', { exact: true });
      assert.equal(await email.isVisible(), true);
      assert.equal(await password.isVisible(), true);
      assert.equal(await email.isEnabled(), true);
      assert.equal(
        await page.getByRole('button', { name: 'Sign In', exact: true }).isEnabled(),
        true,
      );
      await email.focus();
      assert.equal(await email.evaluate((element) => element === document.activeElement), true);
      await page.keyboard.press('Tab');
      assert.equal(await password.evaluate((element) => element === document.activeElement), true);
      const layout = await page.evaluate(async () => {
        await document.fonts.ready;
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth,
          fontFamily: getComputedStyle(document.body).fontFamily,
        };
      });
      assert.equal(layout.overflow, false, 'Public sign-in must fit the viewport.');
      assert.match(
        layout.fontFamily,
        /sans-serif|system-ui/,
        'The original Tailwind system font contract must remain active.',
      );
      assert.deepEqual(pageErrors, []);
      assert.deepEqual(actionRequests, []);
      assert.deepEqual(
        externalRequests,
        [],
        'Production public UI must not fetch external font assets.',
      );
      const screenshot = path.join(output, `production-sign-in-${width}.png`);
      await page.screenshot({ path: screenshot, fullPage: true, animations: 'disabled' });
      results.push({
        width,
        height,
        status: response.status(),
        ...layout,
        pageErrors: 0,
        actionRequests: 0,
        externalRequests: 0,
        screenshot,
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }
  await writeFile(
    path.join(output, 'public-ui-results.json'),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  assert.equal(
    process.argv.length,
    4,
    'Usage: node scripts/probe-public-ui.mjs <local-runtime-url> <output-directory>',
  );
  console.log(JSON.stringify(await probePublicUi(process.argv[2], process.argv[3]), null, 2));
}

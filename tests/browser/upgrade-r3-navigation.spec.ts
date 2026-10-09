import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

async function screenshot(page: Page, name: string) {
  const directory = resolve(__dirname, '../../output/playwright');
  await mkdir(directory, { recursive: true });
  await page.screenshot({ path: resolve(directory, name) });
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: { id: 'r2-user-a' } }),
    }),
  );
});

async function navigation(page: Page, width: number) {
  if (width < 768) {
    const trigger = page.getByRole('button', { name: 'Open workspace menu', exact: true });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Workspace menu', exact: true });
    await expect(dialog).toBeVisible();
    return dialog;
  }
  return page.locator('aside');
}

for (const width of [390, 768, 1024, 1440]) {
  test(`R3 workspace menu bounds and keyboard access at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/r3-navigation');
    const surface = await navigation(page, width);
    const switcher = surface.getByRole('button', { name: /Primary workspace/ });
    await switcher.focus();
    await page.keyboard.press('Space');
    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    const bounds = await menu.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
    expect(await menu.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(
      true,
    );
    await screenshot(page, `r3-workspace-menu-${width}.png`);
    await page.keyboard.press('End');
    const create = page.getByRole('menuitem', { name: 'Create Workspace', exact: true });
    await expect(create).toBeFocused();
    await expect(create).toBeInViewport({ ratio: 1 });
    expect(await menu.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await screenshot(page, `r3-workspace-menu-scrolled-${width}.png`);
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(switcher).toBeFocused();
    if (width < 768) {
      await expect(surface).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(surface).toBeHidden();
      await expect(page.getByRole('button', { name: 'Open workspace menu' })).toBeFocused();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

test('R3 mobile navigation traps Tab, exposes supported routes and restores menu focus', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/w/r1-study-workspace/documents');
  const surface = await navigation(page, 390);
  await screenshot(page, 'r3-mobile-workspace-navigation.png');
  const links = surface.getByRole('navigation', { name: 'Workspace' }).getByRole('link');
  await expect(links).toHaveText(['Study workspace', 'Documents', 'Flashcards', 'Tasks', 'Notes']);
  await expect(surface.getByRole('link', { name: /Assistant/ })).toHaveCount(0);
  await expect(surface.getByRole('link', { name: 'Documents', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const switcher = surface.getByRole('button', { name: /Synthetic study workspace/ });
  await expect(switcher).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(surface.getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(switcher).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links.first()).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(links.nth(1)).toBeFocused();
  expect(await links.nth(1).evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe(
    'none',
  );
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/w/r1-study-workspace/documents');
  await expect(page.getByRole('dialog', { name: 'Workspace menu' })).toBeHidden();
});

for (const section of ['documents', 'flashcards']) {
  test(`R3 workspace switch from ${section} detail goes to the destination collection`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(
      `/w/r1-study-workspace/${section}/${section === 'documents' ? 'r1-notes-0' : 'r1-saved-set'}`,
    );
    const surface = await navigation(page, 390);
    await surface.getByRole('button', { name: /Synthetic study workspace/ }).click();
    await page.getByRole('menuitem', { name: /Other empty workspace/ }).click();
    await expect(page).toHaveURL(`/w/r1-other-workspace/${section}`, { timeout: 3_000 });
    await expect(page.getByRole('dialog', { name: 'Workspace menu' })).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('R3 create workspace Escape returns focus through nested menu layers', async ({ page }) => {
  await page.goto('/r3-navigation');
  const surface = await navigation(page, 390);
  const switcher = surface.getByRole('button', { name: /Primary workspace/ });
  await switcher.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem', { name: 'Create Workspace', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  const create = page.getByRole('dialog', { name: 'Create Workspace', exact: true });
  await expect(create).toBeVisible();
  await expect(create.getByRole('textbox', { name: 'Name', exact: true })).toBeFocused();
  await screenshot(page, 'r3-create-workspace-mobile.png');
  await page.keyboard.press('Escape');
  await expect(create).toBeHidden();
  await expect(surface).toBeVisible();
  await expect(switcher).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(surface).toBeHidden();
  await expect(page.getByRole('button', { name: 'Open workspace menu' })).toBeFocused();
});

test('R3 resizing an open mobile menu hands focus to desktop navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/r3-navigation');
  const surface = await navigation(page, 390);
  await page.setViewportSize({ width: 768, height: 844 });
  await expect(surface).toBeHidden({ timeout: 3_000 });
  const desktop = page.locator('aside');
  await expect(desktop).toBeVisible();
  await expect(desktop.getByRole('button', { name: /Primary workspace/ })).toBeFocused();
});

import { expect, test } from '@playwright/test';

test('R3 focused study controls use native Enter and Space actions once', async ({ page }) => {
  await page.goto('/r3-study');
  const next = page.getByRole('button', { name: 'Next card', exact: true });
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Second study question', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /show answer/i })).toBeVisible();

  const previous = page.getByRole('button', { name: 'Previous card', exact: true });
  await previous.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();

  await next.focus();
  await page.keyboard.press('Space');
  await expect(page.getByText('Second study question', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restart from beginning' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();
});

test('R3 surrounding button, link, input, form and contenteditable keep browser behavior', async ({
  page,
}) => {
  await page.goto('/r3-study');
  await page.getByRole('button', { name: 'Outside action' }).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Outside actions')).toHaveText('2');

  const input = page.getByRole('textbox', { name: 'Outside input' });
  await input.fill('alpha');
  await input.press('End');
  await input.press('Space');
  await input.press('ArrowRight');
  await expect(input).toHaveValue('alpha ');
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();

  const editable = page.getByRole('textbox', { name: 'Editable notes' });
  await editable.fill('notes');
  await editable.press('End');
  await editable.press('Space');
  await page.keyboard.type('continue');
  await expect(editable).toHaveText('notes continue');
  await editable.press('Enter');
  await page.keyboard.type('new line');
  await expect(editable).toContainText('new line');

  await page.getByRole('textbox', { name: 'Search cards' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByLabel('Search submissions')).toHaveText('1');
  await page.getByRole('link', { name: 'Outside link', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#study-destination$/);
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();
});

test('R3 shortcuts require the study card focus, native flip works and hidden face stays out of accessibility tree', async ({
  page,
}) => {
  await page.goto('/r3-study');
  await page.locator('h1').click();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();

  const reveal = page.getByRole('button', { name: /show answer/i });
  await reveal.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('First study answer', { exact: true })).toBeVisible();
  const conceal = page.getByRole('button', { name: /show question/i });
  await expect(conceal).toBeFocused();
  await expect(conceal).toHaveAttribute('aria-describedby', /.+/);
  await page.keyboard.press('Space');
  await expect(reveal).toBeFocused();
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();
  await expect(page.getByText('First study answer', { exact: true })).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByText('Second study question', { exact: true })).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText('First study question', { exact: true })).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Restart from beginning' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(reveal).toBeFocused();
  const focusRing = await reveal.evaluate((element) => getComputedStyle(element).boxShadow);
  expect(focusRing).not.toBe('none');
  await page.keyboard.press('Escape');
  await expect(reveal).toBeFocused();
});

for (const width of [390, 768, 1024, 1440]) {
  test(`R3 long study content is readable without overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.goto('/r3-study?long=1');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
    const reveal = page.getByRole('button', { name: /show answer/i });
    expect(
      await reveal.evaluate((element) => element.scrollHeight <= element.clientHeight + 1),
    ).toBe(true);
    await reveal.focus();
    await page.keyboard.press('Enter');
    const answer = page.getByRole('button', { name: /show question/i });
    await expect(answer).toContainText('ANSWER-END-');
    await page.getByRole('button', { name: 'Next card', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Next card', exact: true }).click();
    await expect(page.getByText('Second study question', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
    ).toBeLessThanOrEqual(1);
  });
}

test('R3 empty study state exposes status and no inactive study controls', async ({ page }) => {
  await page.goto('/r3-study?empty=1');
  await expect(
    page.getByRole('status').filter({ hasText: 'No flashcards in this set.' }),
  ).toHaveText('No flashcards in this set.');
  await expect(
    page.getByRole('button', { name: /show answer|next card|shuffle cards/i }),
  ).toHaveCount(0);
});

test('R3 actual study detail wraps long source names and reference cards with keyboard links', async ({
  page,
}) => {
  await page.goto('/r3-study?detail=1&long=1');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth),
  ).toBeLessThanOrEqual(1);
  const source = page.getByRole('link', { name: /^SourceFilename/ });
  await expect(source).toHaveAttribute('href', '/w/r3-study-workspace/documents/r3-source');
  const back = page.getByRole('link', { name: 'Back to Flashcards', exact: true });
  await back.focus();
  await page.keyboard.press('Tab');
  await expect(source).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(back).toBeFocused();
  const focus = await back.evaluate((element) => {
    const style = getComputedStyle(element);
    return style.boxShadow !== 'none' || style.outlineStyle !== 'none';
  });
  expect(focus).toBe(true);
  await source.scrollIntoViewIfNeeded();
  expect(
    await source.evaluate((element) => element.getBoundingClientRect().right),
  ).toBeLessThanOrEqual(390);
});

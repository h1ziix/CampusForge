import { expect, test, type Page } from '@playwright/test';

const controls = '/api/r2-generation-control';
const errors = new Map<Page, string[]>();

test.beforeEach(async ({ request, page }) => {
  await request.post(controls, { data: { reset: true } });
  const pageErrors: string[] = [];
  errors.set(page, pageErrors);
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
  errors.delete(page);
});

test('R2 renders saved server summary and study set after reload, ignoring legacy local samples', async ({
  page,
  request,
}) => {
  await request.post(controls, { data: { seed: 'botany' } });
  await page.addInitScript(() =>
    localStorage.setItem(
      'campusforge:doc-ai:v2:r2-generation-user:r2-generation-workspace:botany',
      JSON.stringify({
        epoch: '',
        summary: {
          intro: 'LEGACY_LOCAL_SAMPLE_MUST_NOT_RENDER',
          keyPoints: [],
          assessment: 'old sample',
          readingTime: 'Sample only',
        },
      }),
    ),
  );
  await page.goto('/r2-generation?document=botany');
  await expect(
    page.getByText('Chlorophyll absorbs light so plants can produce sugars.').first(),
  ).toBeVisible();
  await expect(page.getByText('LEGACY_LOCAL_SAMPLE_MUST_NOT_RENDER')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Study/ })).toHaveAttribute(
    'href',
    '/w/r2-generation-workspace/flashcards/saved-botany',
  );
  await page.reload();
  await expect(
    page.getByText('Chlorophyll absorbs light so plants can produce sugars.').first(),
  ).toBeVisible();
  await page.getByRole('link', { name: /Study/ }).click();
  await expect(page.getByRole('heading', { name: 'Study Mode', exact: true })).toBeVisible();
  await expect(page.getByText('What absorbs light during photosynthesis?').first()).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Photosynthesis practice', exact: true }),
  ).toBeVisible();
});

test('R2 generation actions return different source content and persist it across reopening', async ({
  page,
  request,
}) => {
  for (const [document, fact, question] of [
    [
      'botany',
      'Chlorophyll absorbs light so plants can produce sugars.',
      'What absorbs light during photosynthesis?',
    ],
    [
      'physics',
      'Gravity provides the centripetal force that keeps a satellite in orbit.',
      'What force keeps a satellite in orbit?',
    ],
  ]) {
    await page.goto(`/r2-generation?document=${document}`);
    await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
    await expect(page.getByText(fact).first()).toBeVisible();
    await page.getByRole('button', { name: 'Generate flashcards', exact: true }).click();
    const study = page.getByRole('link', { name: /Study/ });
    await expect(study).toHaveAttribute(
      'href',
      `/w/r2-generation-workspace/flashcards/saved-${document}`,
    );
    await page.reload();
    await expect(page.getByText(fact).first()).toBeVisible();
    await study.click();
    await expect(page.getByText(question).first()).toBeVisible();
  }
  const state = await (await request.get(controls)).json();
  expect(state.operations).toHaveLength(4);
  expect(
    new Set(state.requests.map((item: { idempotencyKey: string }) => item.idempotencyKey)).size,
  ).toBe(4);
});

test('R2 retries a lost admission receipt with one stable key and one logical operation', async ({
  page,
  request,
}) => {
  await request.post(controls, { data: { reset: true, mode: 'lost-receipt' } });
  await page.goto('/r2-generation?document=botany');
  await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
  await expect(page.getByText(/Could not confirm AI operation/)).toBeVisible();
  await page.getByRole('button', { name: /Retry request/ }).click();
  await expect
    .poll(async () => (await (await request.get(controls)).json()).requests.length)
    .toBe(2);
  const state = await (await request.get(controls)).json();
  expect(state.requests).toHaveLength(2);
  expect(state.requests[0].idempotencyKey).toBe(state.requests[1].idempotencyKey);
  expect(state.operations).toHaveLength(1);
  await page.reload();
  await page.getByRole('button', { name: /Check status/ }).click();
  expect((await (await request.get(controls)).json()).operations).toHaveLength(1);
});

test('R2 two stale tabs reuse one key and one logical operation', async ({
  page,
  context,
  request,
}) => {
  const other = await context.newPage();
  await Promise.all([
    page.goto('/r2-generation?document=botany'),
    other.goto('/r2-generation?document=botany'),
  ]);
  await Promise.all([
    page.getByRole('button', { name: 'Generate summary', exact: true }).click(),
    other.getByRole('button', { name: 'Generate summary', exact: true }).click(),
  ]);
  for (const tab of [page, other]) {
    await expect(
      tab.getByText('Chlorophyll absorbs light so plants can produce sugars.').first(),
    ).toBeVisible();
  }
  const state = await (await request.get(controls)).json();
  expect(state.requests).toHaveLength(2);
  expect(state.requests[0].idempotencyKey).toBe(state.requests[1].idempotencyKey);
  expect(state.operations).toHaveLength(1);
  await other.close();
});

test('R2 manually confirming a lost receipt clears the stale admission error', async ({
  page,
  request,
}) => {
  await request.post(controls, { data: { reset: true, mode: 'lost-receipt' } });
  await page.goto('/r2-generation?document=botany');
  await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
  await expect(page.getByText(/Could not confirm AI operation/)).toBeVisible();
  await page.getByRole('button', { name: 'Check status', exact: true }).click();
  await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
  await expect(page.getByText('Request not confirmed', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry request', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Summary requested', exact: true })).toBeDisabled();
  const state = await (await request.get(controls)).json();
  expect(state.requests).toHaveLength(1);
  expect(state.operations).toHaveLength(1);
});

for (const [mode, status, message] of [
  ['failed', 'FAILED', 'Synthetic provider output failed validation.'],
  ['uncertain', 'UNCERTAIN', 'Synthetic provider receipt was lost after dispatch.'],
]) {
  test(`R2 ${status} remains an error without a new paid operation on reload or status checks`, async ({
    page,
    request,
  }) => {
    await request.post(controls, { data: { reset: true, mode } });
    await page.clock.install();
    await page.goto('/r2-generation?document=botany');
    await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await expect(page.getByText(/Saved summary/)).toHaveCount(0);
    await expect(
      page.getByText('Chlorophyll absorbs light so plants can produce sugars.'),
    ).toHaveCount(0);
    await page.reload();
    await expect(page.getByText(message, { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /Check status/ }).click();
    await page.clock.fastForward(600_000);
    const state = await (await request.get(controls)).json();
    expect(state.requests).toHaveLength(1);
    expect(state.operations).toHaveLength(1);
    expect(state.operations[0].job.status).toBe(status);
  });
}

test('R2 polling uses backoff, stops after its bound and manual status check remains read only', async ({
  page,
  request,
}) => {
  await request.post(controls, { data: { reset: true, mode: 'pending' } });
  await page.clock.install();
  await page.goto('/r2-generation?document=botany');
  await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
  await expect
    .poll(async () => (await (await request.get(controls)).json()).operations.length)
    .toBe(1);
  await expect
    .poll(async () => (await (await request.get(controls)).json()).reads)
    .toBeGreaterThanOrEqual(1);
  // Each elapsed interval is followed by its network response before advancing again.
  for (const interval of [2000, 4000, 8000, 16000, 30000, 30000]) {
    const before = (await (await request.get(controls)).json()).reads;
    await page.clock.fastForward(interval);
    await expect
      .poll(async () => (await (await request.get(controls)).json()).reads)
      .toBeGreaterThan(before);
  }
  const bounded = (await (await request.get(controls)).json()).reads;
  await page.clock.fastForward(180_000);
  expect((await (await request.get(controls)).json()).reads).toBe(bounded);
  await request.post(controls, { data: { complete: true } });
  await page.getByRole('button', { name: /Check status/ }).click();
  await expect(
    page.getByText('Chlorophyll absorbs light so plants can produce sugars.').first(),
  ).toBeVisible();
  const state = await (await request.get(controls)).json();
  expect(state.reads).toBe(bounded + 1);
  expect(state.requests).toHaveLength(1);
  expect(state.operations).toHaveLength(1);
});

test('R2 Markdown with an empty browser MIME reaches the upload handler', async ({ page }) => {
  await page.goto('/r3-documents');
  await page.getByRole('button', { name: 'Open upload fixture' }).click();
  let uploads = 0;
  await page.route('**/api/workspaces/*/documents/upload', (route) => {
    uploads++;
    return route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Synthetic upload reached the server boundary.' }),
    });
  });
  await page.locator('#doc-file').setInputFiles({
    name: 'permitted-notes.md',
    mimeType: '',
    buffer: Buffer.from('# Synthetic permitted notes\nPhotosynthesis uses chlorophyll.'),
  });
  await expect(page.getByRole('button', { name: 'Upload', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Upload', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Synthetic upload reached the server boundary.',
  );
  expect(uploads).toBe(1);
});

test('R2 unavailable status reads pause polling and recover through a manual read', async ({
  page,
  request,
}) => {
  await request.post(controls, { data: { reset: true, mode: 'pending' } });
  await page.clock.install();
  await page.goto('/r2-generation?document=botany');
  await page.getByRole('button', { name: 'Generate summary', exact: true }).click();
  await expect
    .poll(async () => (await (await request.get(controls)).json()).reads)
    .toBeGreaterThanOrEqual(1);
  await request.post(controls, { data: { readOutage: true } });
  await page.clock.fastForward(2000);
  await expect(page.getByText(/Status could not be checked/)).toBeVisible();
  const stoppedReads = (await (await request.get(controls)).json()).reads;
  await page.clock.fastForward(180_000);
  expect((await (await request.get(controls)).json()).reads).toBe(stoppedReads);
  await request.post(controls, { data: { readOutage: false, complete: true } });
  await page.getByRole('button', { name: /Check status/ }).click();
  await expect(
    page.getByText('Chlorophyll absorbs light so plants can produce sugars.').first(),
  ).toBeVisible();
  const state = await (await request.get(controls)).json();
  expect(state.requests).toHaveLength(1);
  expect(state.operations).toHaveLength(1);
});

test('R2 shows the actual conservative input limit and blocks oversized material without truncation', async ({
  page,
  request,
}) => {
  await page.goto('/r2-generation?document=oversized');
  await expect(
    page.getByText(/Document exceeds the configured AI input budget/).first(),
  ).toBeVisible();
  await expect(page.getByText(/no text is truncated/).first()).toBeVisible();
  await expect(page.getByText(/16[\s,.]?000/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate summary', exact: true })).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Generate flashcards', exact: true }),
  ).toBeDisabled();
  expect((await (await request.get(controls)).json()).requests).toHaveLength(0);
});

import { expect, test, type Page, type TestInfo } from '@playwright/test';

const browserErrors = new Map<Page, string[]>();

test.beforeEach(({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
  browserErrors.delete(page);
});

async function captureRender(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: testInfo.outputPath(`${name}-390.png`), animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath(`${name}-1440.png`), animations: 'disabled' });
}

test('theme hydrates consistently and suggested prompt remains editable and submits once', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('campusforge-theme', 'dark'));
  await page.goto('/lifecycle');
  await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await page.getByRole('button', { name: 'Set synthetic prompt' }).click();
  const input = page.getByPlaceholder('Message CampusForge AI...');
  await expect(input).toHaveValue('R1 suggested prompt');
  await input.fill('R1 edited synthetic prompt');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByTestId('submitted')).toHaveText('R1 edited synthetic prompt');
  await expect(input).toHaveValue('');
  await captureRender(page, testInfo, 'theme-prompt');
});

test('assistant hydrates synthetic stored conversations without replacing them', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'campusforge:assistant:v2:r1-synthetic-user:r1-synthetic-workspace',
      JSON.stringify({
        epoch: '',
        conversations: [
          {
            id: 'r1-conversation',
            title: 'R1 persisted synthetic conversation',
            model: 'gpt-4.1',
            messages: [],
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        activeId: null,
        settings: {},
      }),
    ),
  );
  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Open chats' }).click();
  await expect(
    page.getByText('R1 persisted synthetic conversation', { exact: true }).last(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              'campusforge:assistant:v2:r1-synthetic-user:r1-synthetic-workspace',
            ) ?? '{}',
          ).conversations?.[0]?.id,
      ),
    )
    .toBe('r1-conversation');
  await captureRender(page, testInfo, 'assistant-hydration');
});

test('document preserves stored demo artifacts during hydration', async ({ page }, testInfo) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      'campusforge:doc-ai:v2:r1-synthetic-user:r1-synthetic-workspace:r1-synthetic-document',
      JSON.stringify({
        epoch: '',
        summary: {
          intro: 'R1 persisted synthetic summary',
          keyPoints: ['Synthetic point'],
          assessment: 'Synthetic assessment',
          readingTime: '1 min',
        },
        flashcards: [{ question: 'R1 synthetic question', answer: 'R1 synthetic answer' }],
      }),
    ),
  );
  await page.goto('/document');
  await expect(page.getByText('R1 persisted synthetic summary', { exact: true })).toBeVisible();
  await expect(page.getByText('R1 synthetic question', { exact: true })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(
            localStorage.getItem(
              'campusforge:doc-ai:v2:r1-synthetic-user:r1-synthetic-workspace:r1-synthetic-document',
            ) ?? '{}',
          ).summary?.intro,
      ),
    )
    .toBe('R1 persisted synthetic summary');
  await captureRender(page, testInfo, 'document-hydration');
});

test('workspace navigation derives the current route from Next pathname', async ({
  page,
}, testInfo) => {
  await page.goto('/w/r1-synthetic-workspace/tasks');
  const tasks = page.getByRole('link', { name: 'Tasks', exact: true });
  await expect(tasks).toHaveAttribute('href', '/w/r1-synthetic-workspace/tasks');
  await expect(tasks).toHaveClass(/text-foreground/);
  await captureRender(page, testInfo, 'workspace-pathname');
});

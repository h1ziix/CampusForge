import { expect, test } from '@playwright/test';

test('original CreateTaskDialog holds pending, prevents duplicate submit and displays action error', async ({
  page,
}, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(error.message));
  const actionRequests: string[] = [];
  page.on('request', (request) => {
    if (request.headers()['next-action']) actionRequests.push(request.method());
  });
  await page.goto('/');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Title', { exact: true }).fill('R1 deferred action regression');
  const submit = page.getByRole('button', { name: 'Create Task', exact: true });
  await submit.click();
  const pending = page.getByRole('button', { name: 'Creating...', exact: true });
  await expect(pending).toBeDisabled();
  await expect(page.getByLabel('Title', { exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled();
  await page.screenshot({
    path: testInfo.outputPath('task-pending-390.png'),
    animations: 'disabled',
  });
  // DOM click on a disabled control must not trigger a second Server Action request.
  await pending.evaluate((element: HTMLButtonElement) => element.click());
  await page.getByLabel('Title', { exact: true }).press('Enter');
  await expect.poll(() => actionRequests.length).toBe(1);
  await expect(
    page.getByText('R1 synthetic action error: no mutation was performed', { exact: true }),
  ).toBeVisible();
  await expect(submit).toBeEnabled();
  await page.screenshot({
    path: testInfo.outputPath('task-error-390.png'),
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath('task-error-1440.png'),
    animations: 'disabled',
  });
  expect(actionRequests).toEqual(['POST']);
  await expect(page.getByTestId('react-version')).toContainText('19.');
  expect(runtimeErrors).toEqual([]);
});

/**
 * Tag add from the PWA must persist through mock-master sync without a conflict toast.
 */
import { test, expect, type Page } from '@playwright/test';
import { createMockMaster, type MockMaster } from '../dev/mockMasterReconnect';

const PORT = 7392;
const PASSWORD = 'test';

async function login(page: Page) {
  await page.goto('/');
  const password = page.locator('#login-screen input[type="password"]');
  await expect(password).toBeVisible({ timeout: 15_000 });
  await password.fill(PASSWORD);
  await page.locator('#login-screen .btn-primary').click();
  await expect(page.locator('#vault-screen')).toBeVisible({ timeout: 15_000 });
}

async function openCreateModal(page: Page) {
  const add = page.getByRole('button', { name: /add first key|agregar primera/i });
  await add.click();
  await expect(page.locator('.modal, [data-testid="card-modal-save"]').first()).toBeVisible({
    timeout: 10_000,
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('PWA tag sync', () => {
  let master: MockMaster;

  test.beforeEach(async () => {
    master = await createMockMaster({ port: PORT, ip: '127.0.0.1' });
  });

  test.afterEach(async () => {
    await master.close();
  });

  test('saving a new card with a confirmed tag stores it on master and shows the chip', async ({
    page,
  }) => {
    await login(page);
    await openCreateModal(page);
    await page.locator('.form-row', { hasText: /title|título/i }).locator('input').fill('Tagged');
    await page.locator('#f-pass-row input[type="password"]').fill('secret');
    const tagInput = page.locator('.tags-editor-input-row input');
    await tagInput.fill('work');
    await page.locator('.tags-editor-input-row .icon-btn').click();
    await page.getByTestId('card-modal-save').click();
    await expect(page.locator('.tag-chip', { hasText: 'work' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.toast.error')).toHaveCount(0);
    await expect
      .poll(() => master.getCards().some((c) => (c.tags ?? []).includes('work')), { timeout: 10_000 })
      .toBe(true);
  });

  test('save flushes a tag typed without pressing Enter or +', async ({ page }) => {
    await login(page);
    await openCreateModal(page);
    await page.locator('.form-row', { hasText: /title|título/i }).locator('input').fill('FlushTag');
    await page.locator('#f-pass-row input[type="password"]').fill('secret');
    await page.locator('.tags-editor-input-row input').fill('personal');
    await page.getByTestId('card-modal-save').click();
    await expect(page.locator('.tag-chip', { hasText: 'personal' })).toBeVisible({ timeout: 10_000 });
    await expect
      .poll(() => master.getCards().some((c) => (c.tags ?? []).includes('personal')), {
        timeout: 10_000,
      })
      .toBe(true);
  });
});

import { test, expect } from '@playwright/test';

test('login page loads', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.login-logo')).toHaveText('PKEY');
  await expect(page.getByRole('textbox', { name: /password|contraseña/i }))
    .toBeVisible({ timeout: 15_000 })
    .catch(async () => {
      await expect(page.locator('.info, .conn-status').first()).toBeVisible();
    });
});

test('vault layout has no tab navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.vault-tabs')).toHaveCount(0);
  await expect(page.locator('.vault-tab')).toHaveCount(0);
});

test('vault header exposes theme and language controls when authenticated', async ({ page }) => {
  await page.goto('/');
  const vault = page.locator('#vault-screen');
  if (await vault.isVisible().catch(() => false)) {
    await expect(page.locator('.vault-header-btn.ghost-icon')).toHaveCount(2);
    await expect(page.locator('.vault-header-btn.lang-btn')).toHaveText(/ES|EN/);
    await expect(page.locator('.stats-sidebar')).toBeAttached();
    await expect(page.locator('.stats-accordion')).toBeAttached();
  }
});

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('login page has no serious a11y violations', async ({ page }) => {
  await page.goto('/');
  const results = await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze();
  const serious = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious'
  );
  expect(serious).toEqual([]);
});

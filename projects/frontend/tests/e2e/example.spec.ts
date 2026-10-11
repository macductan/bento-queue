import { test, expect, log } from '../support/merged-fixtures';

test.describe('Hecto API UI Smoke Test', () => {
  test('should load the main application and display title', async ({ page }) => {
    log.step('Navigate to the application');
    await page.goto('/');

    log.step('Verify title');
    // Using Vue 3 frontend
    await expect(page).toHaveTitle(/Hecto|Vite App/i);

    // Let's just wait for a bit to make sure it loads
    await page.waitForLoadState('networkidle');
  });
});

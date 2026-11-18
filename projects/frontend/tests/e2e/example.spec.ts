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

  test('should default to English on fresh launch without configured locale', async ({ page }) => {
    log.step('Navigate to the application with clean state');
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    log.step('Verify English UI elements by default');
    await expect(page.getByLabel('Add new')).toBeVisible();
    await expect(page.getByPlaceholder('Search requests...')).toBeVisible();
  });
});

import { test, expect, log } from '../support/merged-fixtures';
import { Page } from '@playwright/test';

test.describe('Epic 2 UI Smoke Test - Collection Tree', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  async function createTestRequest(page: Page, requestName: string) {
    await page.getByLabel('Request mới').click();
    const activeRequestNode = page.locator('[data-tree-row][data-active="true"]').first();
    await expect(activeRequestNode).toBeVisible();
    
    await activeRequestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    
    const renameInput = page.locator('[data-tree-row] input[type="text"]');
    await renameInput.waitFor({ state: 'visible' });
    await renameInput.fill(requestName);
    await renameInput.press('Enter');
    
    const renamedNode = page.locator('[data-tree-row]').filter({ hasText: requestName }).first();
    await expect(renamedNode).toBeVisible();
    return renamedNode;
  }

  async function deleteTestRequest(page: Page, requestNode: any) {
    if (await requestNode.isVisible()) {
      await requestNode.click({ button: 'right' });
      await page.getByRole('button', { name: 'Xóa', exact: true }).click();
      const dialogConfirmBtn = page.getByRole('button', { name: 'Xóa', exact: true });
      await expect(dialogConfirmBtn).toBeVisible();
      await dialogConfirmBtn.click();
      await expect(page.getByText('Đã xóa')).toBeVisible();
      await expect(requestNode).not.toBeVisible();
    }
  }

  test('should create and rename a new request successfully', async ({ page }) => {
    const timeId = Date.now().toString();
    const requestName = `Request ${timeId}`;

    log.step('Create a new request');
    await page.getByLabel('Request mới').click();
    
    const activeRequestNode = page.locator('[data-tree-row][data-active="true"]').first();
    await expect(activeRequestNode).toBeVisible();

    log.step('Rename the request via context menu');
    await activeRequestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    
    const renameInput = page.locator('[data-tree-row] input[type="text"]');
    await renameInput.waitFor({ state: 'visible' });
    await renameInput.fill(requestName);
    await renameInput.press('Enter');

    const renamedNode = page.locator('[data-tree-row]').filter({ hasText: requestName }).first();
    await expect(renamedNode).toBeVisible();

    // Cleanup
    await deleteTestRequest(page, renamedNode);
  });

  test('should select request and load empty editor', async ({ page }) => {
    const timeId = Date.now().toString();
    const requestName = `Request ${timeId}`;
    const requestNode = await createTestRequest(page, requestName);

    log.step('Select the request and check editor');
    await requestNode.click();
    const requestTitle = page.locator('h1').filter({ hasText: requestName });
    await expect(requestTitle).toBeVisible();
    
    // The URL should be empty initially for a new request
    await expect(page.getByRole('textbox', { name: 'URL' })).toHaveValue('');

    // Cleanup
    await deleteTestRequest(page, requestNode);
  });

  test('should modify request and show unsaved badge', async ({ page }) => {
    const timeId = Date.now().toString();
    const requestName = `Request ${timeId}`;
    const requestNode = await createTestRequest(page, requestName);

    log.step('Modify the request to see unsaved changes dot');
    await requestNode.click();
    await page.getByRole('textbox', { name: 'URL' }).fill('https://api.example.com');
    
    const unsavedDotTitle = page.locator('h1 [aria-label="Chưa lưu"]');
    await expect(unsavedDotTitle).toBeVisible();

    // Cleanup
    await deleteTestRequest(page, requestNode);
  });

  test('should duplicate request correctly', async ({ page }) => {
    const timeId = Date.now().toString();
    const requestName = `Request ${timeId}`;
    const requestNode = await createTestRequest(page, requestName);

    log.step('Duplicate the request');
    await requestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Sao chép' }).click();
    
    const copyNodeName = `${requestName} (bản sao)`;
    const copyNode = page.locator('[data-tree-row]').filter({ hasText: copyNodeName }).first();
    await expect(copyNode).toBeVisible();

    // Cleanup
    await deleteTestRequest(page, copyNode);
    await deleteTestRequest(page, requestNode);
  });

  test('should flush and duplicate unsaved request correctly', async ({ page }) => {
    const timeId = Date.now().toString();
    const requestName = `Request ${timeId}`;
    const requestNode = await createTestRequest(page, requestName);

    log.step('Modify the request');
    await requestNode.click();
    await page.getByRole('textbox', { name: 'URL' }).fill('https://api.example.com');
    
    log.step('Duplicate the unsaved request');
    await requestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Sao chép' }).click();
    
    const copyNodeName = `${requestName} (bản sao)`;
    const copyNode = page.locator('[data-tree-row]').filter({ hasText: copyNodeName }).first();
    await expect(copyNode).toBeVisible();

    // Cleanup
    await deleteTestRequest(page, copyNode);
    await deleteTestRequest(page, requestNode);
  });

  test('should delete request correctly', async ({ page }) => {
    const timeId = Date.now().toString();
    const requestName = `Request ${timeId}`;
    const requestNode = await createTestRequest(page, requestName);

    log.step('Delete the request');
    await requestNode.click({ button: 'right' });
    
    // The context menu delete button
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    
    // Confirm dialog
    const dialogConfirmBtn = page.getByRole('button', { name: 'Xóa', exact: true });
    await expect(dialogConfirmBtn).toBeVisible();
    await dialogConfirmBtn.click();
    
    // Wait for the success toast to confirm backend deletion finished
    await expect(page.getByText('Đã xóa')).toBeVisible();
    
    // Verify it is gone
    await expect(requestNode).not.toBeVisible();
  });
});

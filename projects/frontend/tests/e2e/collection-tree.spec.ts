import { test, expect, log } from '../support/merged-fixtures';
import { Page, Locator } from '@playwright/test';

test.describe('Epic 2 UI Smoke Test - Collection Tree', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  async function createTestRequest(page: Page, requestName: string) {
    await page.getByLabel('Thêm mới').click();
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
    await page.getByLabel('Thêm mới').click();
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

  async function createTestFolder(page: Page, folderName: string) {
    await page.getByLabel('Thêm mới').click();
    await page.getByLabel('Thư mục mới').click();
    const defaultFolderNode = page.locator('[data-tree-row]').filter({ hasText: 'Thư mục mới' }).last();
    await expect(defaultFolderNode).toBeVisible();

    await defaultFolderNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();

    const renameInput = page.locator('[data-tree-row] input[type="text"]');
    await expect(renameInput).toBeVisible();
    await renameInput.fill(folderName);
    await renameInput.press('Enter');

    const renamedFolder = page.locator('[data-tree-row]').filter({ hasText: folderName }).first();
    await expect(renamedFolder).toBeVisible();
    return renamedFolder;
  }

  async function deleteTestNode(page: Page, nodeLocator: Locator) {
    await expect(nodeLocator).toBeVisible();
    await nodeLocator.click({ button: 'right' });
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    const dialogConfirmBtn = page.getByRole('button', { name: 'Xóa', exact: true });
    await expect(dialogConfirmBtn).toBeVisible();
    await dialogConfirmBtn.click();
    await expect(page.getByText('Đã xóa')).toBeVisible();
    await expect(nodeLocator).not.toBeVisible();
  }

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

  test('should create root folder, nested subfolder, nested request, and support cancel & recursive delete', async ({ page }) => {
    const timeId = Date.now().toString();
    const parentFolderName = `Parent Folder ${timeId}`;
    const childFolderName = `Child Folder ${timeId}`;
    const nestedRequestName = `Nested Request ${timeId}`;

    log.step('Create root folder and verify depth 0');
    const parentFolder = await createTestFolder(page, parentFolderName);
    await expect(parentFolder.locator('[title="Cấp độ thư mục"]')).toHaveText('0');

    log.step('Create nested subfolder via context menu and verify depth 1');
    await parentFolder.click({ button: 'right' });
    await page.getByRole('button', { name: 'Thêm thư mục' }).click();

    const rawChildFolder = page.locator('[data-tree-row]').filter({ hasText: 'Thư mục mới' }).first();
    await expect(rawChildFolder).toBeVisible();
    await rawChildFolder.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();

    const folderRenameInput = page.locator('[data-tree-row] input[type="text"]');
    await expect(folderRenameInput).toBeVisible();
    await folderRenameInput.fill(childFolderName);
    await folderRenameInput.press('Enter');

    const childFolder = page.locator('[data-tree-row]').filter({ hasText: childFolderName }).first();
    await expect(childFolder).toBeVisible();
    await expect(childFolder.locator('[title="Cấp độ thư mục"]')).toHaveText('1');

    log.step('Create nested request inside child folder');
    await childFolder.click({ button: 'right' });
    await page.getByRole('button', { name: 'Thêm request' }).click();

    const activeNestedRequest = page.locator('[data-tree-row][data-active="true"]').first();
    await expect(activeNestedRequest).toBeVisible();
    await activeNestedRequest.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();

    const reqRenameInput = page.locator('[data-tree-row] input[type="text"]');
    await expect(reqRenameInput).toBeVisible();
    await reqRenameInput.fill(nestedRequestName);
    await reqRenameInput.press('Enter');

    const nestedRequest = page.locator('[data-tree-row]').filter({ hasText: nestedRequestName }).first();
    await expect(nestedRequest).toBeVisible();

    log.step('Cancel deleting parent folder and verify hierarchy remains intact');
    await parentFolder.click({ button: 'right' });
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    const cancelBtn = page.getByRole('button', { name: 'Hủy', exact: true });
    await expect(cancelBtn).toBeVisible();
    await cancelBtn.click();

    await expect(parentFolder).toBeVisible();
    await expect(childFolder).toBeVisible();
    await expect(nestedRequest).toBeVisible();

    log.step('Confirm deleting parent folder and verify all nested children are removed');
    await parentFolder.click({ button: 'right' });
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    const confirmBtn = page.getByRole('button', { name: 'Xóa', exact: true });
    await expect(confirmBtn).toBeVisible();
    await confirmBtn.click();

    await expect(page.getByText('Đã xóa')).toBeVisible();
    await expect(parentFolder).not.toBeVisible();
    await expect(childFolder).not.toBeVisible();
    await expect(nestedRequest).not.toBeVisible();
  });

  test('should revert inline rename on empty or whitespace input and on Escape key', async ({ page }) => {
    const timeId = Date.now().toString();
    const folderName = `Folder Edge ${timeId}`;
    const requestName = `Request Edge ${timeId}`;

    const folderNode = await createTestFolder(page, folderName);
    const requestNode = await createTestRequest(page, requestName);
    const renameInput = page.locator('[data-tree-row] input[type="text"]');

    log.step('Attempt renaming request to empty string, whitespace-only string, and cancel via Escape');
    await requestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill('');
    await renameInput.press('Enter');

    await expect(renameInput).toHaveCount(0);
    await expect(requestNode).toBeVisible();

    await requestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill('     ');
    await renameInput.press('Enter');

    await expect(renameInput).toHaveCount(0);
    await expect(requestNode).toBeVisible();

    await requestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill(`Aborted Request ${timeId}`);
    await renameInput.press('Escape');

    await expect(renameInput).toHaveCount(0);
    await expect(requestNode).toBeVisible();
    await expect(page.locator('[data-tree-row]').filter({ hasText: `Aborted Request ${timeId}` })).toHaveCount(0);

    log.step('Attempt renaming folder to empty string, whitespace-only string, and cancel via Escape');
    await folderNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill('');
    await renameInput.press('Enter');

    await expect(renameInput).toHaveCount(0);
    await expect(folderNode).toBeVisible();

    await folderNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill('   ');
    await renameInput.press('Enter');

    await expect(renameInput).toHaveCount(0);
    await expect(folderNode).toBeVisible();

    await folderNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill(`Aborted Folder ${timeId}`);
    await renameInput.press('Escape');

    await expect(renameInput).toHaveCount(0);
    await expect(folderNode).toBeVisible();
    await expect(page.locator('[data-tree-row]').filter({ hasText: `Aborted Folder ${timeId}` })).toHaveCount(0);

    // Cleanup
    await deleteTestRequest(page, requestNode);
    await deleteTestNode(page, folderNode);
  });

  test('should allow duplicate sibling names without overwriting items', async ({ page }) => {
    const timeId = Date.now().toString();
    const dupReqName = `Dup Request ${timeId}`;
    const secondReqName = `Second Request ${timeId}`;
    const dupFolderName = `Dup Folder ${timeId}`;
    const secondFolderName = `Second Folder ${timeId}`;

    log.step('Create two sibling requests and rename the second to match the first');
    await createTestRequest(page, dupReqName);
    const secondReq = await createTestRequest(page, secondReqName);

    await secondReq.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    const renameInput = page.locator('[data-tree-row] input[type="text"]');
    await expect(renameInput).toBeVisible();
    await renameInput.fill(dupReqName);
    await renameInput.press('Enter');

    const dupReqRows = page.locator('[data-tree-row]').filter({ hasText: dupReqName });
    await expect(dupReqRows).toHaveCount(2);

    log.step('Create two sibling folders and rename the second to match the first');
    await createTestFolder(page, dupFolderName);
    const secondFolder = await createTestFolder(page, secondFolderName);

    await secondFolder.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await renameInput.fill(dupFolderName);
    await renameInput.press('Enter');

    const dupFolderRows = page.locator('[data-tree-row]').filter({ hasText: dupFolderName });
    await expect(dupFolderRows).toHaveCount(2);

    // Cleanup duplicate requests (count 2 -> 1 -> 0)
    await dupReqRows.first().click({ button: 'right' });
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(dupReqRows).toHaveCount(1);
    await deleteTestRequest(page, dupReqRows.first());

    // Cleanup duplicate folders (count 2 -> 1 -> 0)
    await dupFolderRows.first().click({ button: 'right' });
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await page.getByRole('button', { name: 'Xóa', exact: true }).click();
    await expect(dupFolderRows).toHaveCount(1);
    await deleteTestNode(page, dupFolderRows.first());
  });

  test('should truncate extremely long names (> 255 characters) to 255 characters with truncate styling', async ({ page }) => {
    const timeId = Date.now().toString();
    const initialReqName = `Initial Long Req ${timeId}`;
    const initialFolderName = `Initial Long Folder ${timeId}`;
    const requestNode = await createTestRequest(page, initialReqName);
    const folderNode = await createTestFolder(page, initialFolderName);

    const reqPrefix = `LongReq_${timeId}_`;
    const reqLongInput300 = (reqPrefix + 'A'.repeat(300)).slice(0, 300);
    const reqExpected255 = reqLongInput300.slice(0, 255);

    log.step('Rename request with a 300-character string and verify exact 255-character truncation');
    await requestNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();

    const renameInput = page.locator('[data-tree-row] input[type="text"]');
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveAttribute('maxlength', '255');
    await renameInput.fill(reqLongInput300);
    await renameInput.press('Enter');

    const renamedReqRow = page.locator('[data-tree-row]').filter({ hasText: reqPrefix }).first();
    await expect(renamedReqRow).toBeVisible();

    const reqNameSpan = renamedReqRow.locator('[data-test="tree-row-name"]');
    await expect(reqNameSpan).toBeVisible();
    await expect(reqNameSpan).toHaveClass(/truncate/);
    await expect(reqNameSpan).toHaveText(reqExpected255);

    await renamedReqRow.click();
    const editorTitleSpan = page.locator('h1 > span').first();
    await expect(editorTitleSpan).toHaveText(reqExpected255);

    log.step('Rename folder with a 300-character string and verify exact 255-character truncation');
    const folderPrefix = `LongFolder_${timeId}_`;
    const folderLongInput300 = (folderPrefix + 'B'.repeat(300)).slice(0, 300);
    const folderExpected255 = folderLongInput300.slice(0, 255);

    await folderNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();
    await expect(renameInput).toBeVisible();
    await expect(renameInput).toHaveAttribute('maxlength', '255');
    await renameInput.fill(folderLongInput300);
    await renameInput.press('Enter');

    const renamedFolderRow = page.locator('[data-tree-row]').filter({ hasText: folderPrefix }).first();
    await expect(renamedFolderRow).toBeVisible();

    const folderNameSpan = renamedFolderRow.locator('[data-test="tree-row-name"]');
    await expect(folderNameSpan).toBeVisible();
    await expect(folderNameSpan).toHaveClass(/truncate/);
    await expect(folderNameSpan).toHaveText(folderExpected255);

    // Cleanup
    await deleteTestRequest(page, renamedReqRow);
    await deleteTestNode(page, renamedFolderRow);
  });

  test('should display unsaved amber dot on editor header, active tree row, and context menu, and clear on save', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('hecto_auto_save_enabled', 'false'));
    try {
      await page.reload();
      await expect(page.getByLabel('Thêm mới')).toBeVisible();

      const timeId = Date.now().toString();
      const cleanSiblingName = `Clean Sibling ${timeId}`;
      const requestName = `Dirty Request ${timeId}`;
      const cleanSiblingNode = await createTestRequest(page, cleanSiblingName);
      const requestNode = await createTestRequest(page, requestName);

      log.step('Modify request URL while auto-save is off to keep request dirty');
      await requestNode.click();
      await page.getByRole('textbox', { name: 'URL' }).fill('https://api.example.com/dirty');

      log.step('Verify amber dot indicator on editor header and active sidebar row');
      const editorIndicator = page.locator('[data-test="save-state-indicator"]');
      await expect(editorIndicator).toHaveAttribute('data-status', 'unsaved');
      await expect(editorIndicator.locator('.bg-unsaved-dot')).toBeVisible();
      await expect(editorIndicator).toContainText('Chưa lưu');

      const activeRow = page.locator('[data-tree-row][data-active="true"]').first();
      await expect(activeRow.locator('[data-test="tree-row-unsaved-dot"].bg-unsaved-dot')).toBeVisible();
      await expect(cleanSiblingNode.locator('[data-test="tree-row-unsaved-dot"]')).toHaveCount(0);

      log.step('Verify context menu on unselected clean sibling request does NOT show unsaved indicator');
      const contextMenuIndicator = page.locator('[data-test="context-menu-unsaved-indicator"]');
      await cleanSiblingNode.click({ button: 'right' });
      await expect(page.getByRole('button', { name: 'Đổi tên' })).toBeVisible();
      await expect(contextMenuIndicator).toHaveCount(0);
      await page.keyboard.press('Escape');

      log.step('Open context menu on dirty request and verify amber dot indicator inside context menu');
      await activeRow.click({ button: 'right' });
      await expect(contextMenuIndicator).toBeVisible();
      await expect(contextMenuIndicator.locator('.bg-unsaved-dot')).toBeVisible();
      await expect(contextMenuIndicator).toContainText('Chưa lưu');

      log.step('Close context menu, save with Ctrl+S, and verify all unsaved indicators clear');
      await page.keyboard.press('Escape');
      await expect(contextMenuIndicator).toHaveCount(0);

      await page.keyboard.press('Control+s');
      await expect(editorIndicator).toHaveAttribute('data-status', 'saved');
      await expect(editorIndicator).toContainText('Đã lưu');
      await expect(activeRow.locator('[data-test="tree-row-unsaved-dot"]')).toHaveCount(0);

      await activeRow.click({ button: 'right' });
      await expect(page.getByRole('button', { name: 'Đổi tên' })).toBeVisible();
      await expect(contextMenuIndicator).toHaveCount(0);
      await page.keyboard.press('Escape');

      // Cleanup
      await deleteTestRequest(page, requestNode);
      await deleteTestRequest(page, cleanSiblingNode);
    } finally {
      await page.evaluate(() => localStorage.removeItem('hecto_auto_save_enabled'));
    }
  });

  test('should clear editor state and return to empty screen when active request or its parent folder is deleted', async ({ page }) => {
    const timeId = Date.now().toString();
    const standaloneReqName = `Standalone Active ${timeId}`;

    log.step('Select standalone request, edit URL, then delete it and verify empty state');
    const standaloneReq = await createTestRequest(page, standaloneReqName);
    await standaloneReq.click();
    const urlInput = page.getByRole('textbox', { name: 'URL' });
    await expect(urlInput).toBeVisible();
    await urlInput.fill('https://api.example.com/to-delete');

    await deleteTestRequest(page, standaloneReq);

    await expect(urlInput).toHaveCount(0);
    await expect(page.locator('h1').filter({ hasText: standaloneReqName })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chọn một Request để bắt đầu' })).toBeVisible();

    log.step('Create folder with child request, select child request, delete parent folder and verify empty state');
    const folderName = `Container Folder ${timeId}`;
    const childReqName = `Child Active ${timeId}`;
    const folderNode = await createTestFolder(page, folderName);

    await folderNode.click({ button: 'right' });
    await page.getByRole('button', { name: 'Thêm request' }).click();

    const activeChildReq = page.locator('[data-tree-row][data-active="true"]').first();
    await expect(activeChildReq).toBeVisible();
    await activeChildReq.click({ button: 'right' });
    await page.getByRole('button', { name: 'Đổi tên' }).click();

    const renameInput = page.locator('[data-tree-row] input[type="text"]');
    await expect(renameInput).toBeVisible();
    await renameInput.fill(childReqName);
    await renameInput.press('Enter');

    const childReqNode = page.locator('[data-tree-row]').filter({ hasText: childReqName }).first();
    await expect(childReqNode).toBeVisible();
    await childReqNode.click();
    await expect(page.locator('h1').filter({ hasText: childReqName })).toBeVisible();
    await expect(urlInput).toBeVisible();
    await urlInput.fill('https://api.example.com/nested-delete');

    await deleteTestNode(page, folderNode);

    await expect(childReqNode).not.toBeVisible();
    await expect(urlInput).toHaveCount(0);
    await expect(page.locator('h1').filter({ hasText: childReqName })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Chọn một Request để bắt đầu' })).toBeVisible();
  });
});

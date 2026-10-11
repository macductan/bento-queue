# E2E Collection Tree Analysis

## Overview
This document analyzes the E2E test coverage for the Collection Tree component (`projects/frontend/tests/e2e/collection-tree.spec.ts`).

## Covered Scenarios
The current test suite covers the fundamental CRUD operations for **Requests** within the Collection Tree:

1. **Create & Rename**: `should create and rename a new request successfully`
   - Verifies creating a new request.
   - Verifies the tree row displays correctly.
   - Verifies the context menu rename action and inline renaming.
2. **Select & Load Editor**: `should select request and load empty editor`
   - Verifies clicking a request opens it in the editor.
   - Ensures the editor is correctly initialized with an empty URL.
3. **Unsaved State Recognition**: `should modify request and show unsaved badge`
   - Modifies the URL field and asserts the unsaved dot/badge appears in the editor header.
4. **Duplicate Request**: `should duplicate request correctly`
   - Verifies the context menu duplicate action for a saved request.
   - Checks the naming convention of the duplicated item (e.g., `(bản sao)`).
5. **Duplicate Unsaved Request**: `should prompt for save when duplicating unsaved request`
   - Checks the workflow of modifying a request, duplicating it, handling the save prompt, and completing the duplication.
6. **Delete Request**: `should delete request correctly`
   - Verifies the context menu delete action.
   - Confirms the deletion dialog.
   - Checks for the success toast message and removal from the DOM tree.

## Coverage Gaps and Missing Edge Cases
Based on standard UI/UX practices and the Epic 2 UI Smoke Test Checklist, the following scenarios are currently missing and should be added for a robust test suite:

### 1. Folder Management (Critical)
The current suite entirely misses folder-related operations mentioned in the project checklist:
- **Create Folder**: Verify creating a new folder adds it to the tree.
- **Rename Folder**: Verify renaming a folder.
- **Delete Folder**: Verify deleting an empty folder, and importantly, deleting a folder that contains requests (does it cascade? does it warn?).
- **Duplicate Folder**: Verify duplicating a folder and its contents.
- **Nesting**: Creating a request *inside* a specific folder.
- **Expand/Collapse**: Verify clicking the folder caret expands/collapses the folder contents.

### 2. Deletion Edge Cases
- **Clearing the Editor**: The checklist states *"Deleting a request/folder removes it from the tree and clears the editor if it was selected."* The current delete test does not assert that the main editor is cleared or returns to an empty state after the active request is deleted.
- **Cancel Deletion**: Trigger the delete dialog but click "Cancel" to ensure the request is not removed.

### 3. Renaming Edge Cases
- **Empty Name**: Attempting to rename a request/folder to an empty string (should revert, show validation error, or disable the enter key).
- **Duplicate Name**: Attempting to rename a request to a name that already exists in the same level.
- **Special Characters/Long Names**: Testing text overflow and handling of special characters in node names.
- **Cancel Renaming**: Pressing `Escape` while the inline rename input is active should cancel the rename and revert to the original name.

### 4. Unsaved State & Navigation
- **Tree Context Menu Unsaved Dot**: The checklist explicitly mentions *"Modifying a request shows an amber unsaved changes dot in the context menu"*. The current test (`should modify request and show unsaved badge`) checks the editor `h1`, but does not verify the context menu or tree node badge.
- **Discarding Changes**: When prompting to save (e.g., during duplication or selecting another request), what happens if the user chooses to "Discard" instead of "Save"?
- **Navigating Away**: Selecting a *different* request in the tree while the current one has unsaved changes (should trigger a save/discard prompt).

### 5. Drag and Drop (If Applicable)
- If the tree supports reordering or moving requests between folders via drag and drop, these interactions need test coverage.

### 6. Keyboard Accessibility
- Navigating the tree using Arrow keys (Up/Down to select, Right/Left to expand/collapse).
- Triggering actions via shortcuts (e.g., `F2` or `Enter` to rename, `Delete` key to delete).

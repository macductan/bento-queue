---
title: 'Story 5.2: Import Feedback & Error Handling'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: '29a7791bd31cdc7d0a2e4a4e490d103ce1d76124'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Currently, when importing a Postman collection fails (e.g., invalid JSON, wrong schema version), users only see a brief toast message. Furthermore, there is no visual progress indicator for long-running imports beyond the button becoming disabled.

**Approach:** Implement a detailed Error Modal for import failures that clearly explains the issue and provides a "Try Again" button to immediately reopen the file picker. Enhance the UI to display a clear progress indicator (e.g., a spinning icon or "Đang import...") when the process takes noticeable time.

## Boundaries & Constraints

**Always:**
- Present a clear error modal explaining the specific issue on import failure.
- Ensure the error modal offers a way to try selecting a different file.
- Display a progress indicator (spinner or text change) during the import process.

**Never:**
- Do not remove the success toast; it is still required for successful imports.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Successful Import | Valid Postman JSON selected | Button shows loading state, then success toast appears | No error expected |
| Schema Error | JSON with unsupported schema version | Error modal appears with specific message and "Thử lại" button | User can retry |
| Invalid JSON | Malformed JSON file | Error modal appears indicating invalid format | User can retry |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/uiStore.ts` -- Add state for the import error modal (`importError` and resolution methods).
- `projects/frontend/src/stores/collectionStore.ts` -- Update `importPostman` to open the error modal on failure instead of just a toast.
- `projects/frontend/src/components/AppHeader.vue` -- Update the "Import Postman" button to show a spinner when `isImporting` is true. Add an `ImportErrorModal` component instance to display the error.
- `projects/frontend/src/components/ImportErrorModal.vue` -- New component to render the error dialog and a "Thử lại" button.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/stores/uiStore.ts` -- Add `importError: string | null = null` to state. Add `showImportError(msg: string)` and `clearImportError()` actions.
- `projects/frontend/src/components/ImportErrorModal.vue` -- Create a new Vue component using `<dialog>` (similar to other modals) bound to `uiStore.importError`. It should display the error message and have two buttons: "Hủy" (Cancel, clears error) and "Thử lại" (Try Again, emits a retry event and clears error).
- `projects/frontend/src/components/AppHeader.vue` -- Add `<ImportErrorModal @retry="triggerImport" />`. Update the `<button>` for "Import Postman" to show an inline SVG spinner when `isImporting` is true, and change text to "Đang import...".
- `projects/frontend/src/stores/collectionStore.ts` -- In `importPostman()`, on failure (if `!result.success`), replace `uiStore.showToast` with `uiStore.showImportError(result.error?.message || 'Không thể import Postman collection')`.

**Acceptance Criteria:**
- Given an ongoing import, when the process takes time, then the Import button shows a loading spinner and "Đang import..." text.
- Given an invalid or unsupported Postman file, when imported, then a modal appears with the error message and a "Thử lại" button.
- Given the import error modal is open, when the user clicks "Thử lại", then the file picker opens again.

## Verification

**Commands:**
- `bun run type-check` -- expected: Success (no TypeScript errors in frontend).
- `wails build` -- expected: Success (app builds successfully).

**Manual checks (if no CLI):**
- Run `wails dev`. Trigger an import using an invalid file (e.g., an empty JSON or a non-v2.1 Postman collection).
- Verify the modal appears with the error.
- Verify clicking "Thử lại" re-opens the file picker.
- Select a valid file and verify the success toast appears.

## Auto Run Result

Status: blocked
Blocking condition: matrix test audit failed

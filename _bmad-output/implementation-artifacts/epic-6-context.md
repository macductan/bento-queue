# Epic 6 Context: Test Quality & NFR Hardening

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 6 resolves technical debt and verification gaps identified during NFR audits and E2E test reviews. It establishes comprehensive end-to-end test coverage for collection folder operations, rename/delete edge cases, and unsaved state indicators, while introducing automated performance benchmarking and evidence collection in the CI pipeline to verify that the application consistently boots in under 2 seconds and consumes less than 100 MB of RAM.

## Stories

- Story 6.1: E2E Tests for Folder Operations & Edge Cases
- Story 6.2: NFR Performance Benchmarking & Evidence

## Requirements & Constraints

- **Startup & Memory Budgets**: Application cold start must complete in under 2.0 seconds, and baseline memory (RAM) consumption must remain below 100 MB. Automated CI checks must measure and record both metrics during test execution, fail the pipeline if startup exceeds 2.0 seconds, fail or warn if baseline RAM exceeds 100 MB, and publish collected metrics to the `test-results` artifact directory for auditing.
- **Folder Hierarchy & Persistence**: Folder structures in the sidebar must map 1:1 to directories on disk, supporting nested folders, creation, renaming, and recursive deletion (removing the folder directory and all contained requests).
- **Entity Identity vs. Disk Naming**: Every folder and request uses an immutable UUID v4 generated at creation as its identity. Disk filenames and directory names use lowercase, hyphen-separated, diacritics-stripped slugs (with `-1`, `-2` collision suffixes) generated at creation time. Renaming a request or folder updates only the `name` field inside its JSON file (`_folder.json` for folders) and never changes the slug path on disk.
- **Active Editor Reset on Deletion**: Deleting the currently selected request—either directly or by deleting an ancestor folder—must clear the active selection in state and reset the center and right panes to the empty state.
- **Unsaved State Detection & Protection**: Modifying any request field (method, URL, headers, params, body) marks the request dirty and displays an amber dot indicator (`8px`) next to the request name in the editor header as well as in the sidebar/context menu. Navigating to another request while dirty must trigger a 3-option confirmation prompt (`"Lưu"` / `"Bỏ qua"` / `"Hủy"`).
- **Vietnamese UI Copy**: All user-facing labels, buttons, context menu actions, confirmation modals, empty states, and toast notifications under test must use Vietnamese text, keeping English only for standard technical terms (HTTP methods, status codes, URL, JSON, Headers, Params, Body).

## Technical Decisions

- **Test Frameworks & Execution Environment**: End-to-end UI and performance tests run via Playwright (`bun run test:e2e`), frontend unit/component tests via Vitest (`bun run test`), and backend tests via Go's built-in `testing` package (`go test ./...`). Frontend and Playwright commands require Node 24 (`source ~/.nvm/nvm.sh && nvm use`) and `bun` as the sole package manager.
- **Test Isolation & Determinism**: Tests must run in strict isolation without shared mutable state and must avoid hard waits (`time.Sleep` or fixed timeouts), relying on Playwright auto-waiting, condition polling, and explicit state assertions.
- **Pinia Store Responsibilities**:
  - `collectionStore` owns `tree: Folder[]` and `activeRequestId: string | null`, and invokes `clearActiveIfDeleted()` after folder/request deletion to reset `requestStore` if the active item no longer exists in the reloaded tree.
  - `requestStore` tracks `original` and `current` request objects, computing `isDirty` via a deterministic sorted-key `JSON.stringify` deep comparison.
- **Wails Binding Contract**: All Go backend CRUD bindings (`GetCollectionTree`, `CreateFolder`, `RenameFolder`, `DeleteFolder`, `GetRequest`, `SaveRequest`, `DeleteRequest`, `DuplicateRequest`, `MoveRequest`) return a uniform `Result{Success, Data, Error{Code, Message}}` payload with standardized error codes (`NOT_FOUND`, `VALIDATION`, `IO_ERROR`, `PARSE_ERROR`).

## UX & Interaction Patterns

- **Sidebar Tree Navigation**:
  - Folder rows display an animated caret icon (`150ms ease`, rotating 90° on expand/collapse), folder icon, and folder name. Empty folders render without children.
  - Request rows render indented (`28px`) with a `2px` left border (`brand-primary` when active), color-coded HTTP method badge, and request name.
  - Hovering any sidebar row highlights the background (`surface-hover`) and fades in the `"..."` context menu trigger (`aria-label="Tùy chọn"`).
- **Inline Rename Workflow**: Triggered via `F2`, double-clicking a request name in the sidebar, clicking the editable heading in the request builder, or selecting `"Đổi tên"` from the context menu. Pressing `Enter` or blurring commits the change and shows the `"Đã lưu"` toast; pressing `Escape` cancels and restores the previous name. Edge cases (empty names, duplicate names within the same parent, long names, special characters) must be handled without breaking layout or tree state.
- **Context Menus & Confirm Dialogs**:
  - Folder context menu actions: `"Đổi tên"`, `"Thêm request"`, `"Thêm thư mục"`, `"Cài đặt thư mục"`, separator, `"Xóa"`.
  - Request context menu actions: `"Đổi tên"`, `"Sao chép"`, `"Di chuyển tới..."` (nested folder submenu), separator, `"Xóa"`.
  - Confirmation dialog on request deletion: `"Xóa request '{name}'? Hành động này không thể hoàn tác."`
  - Confirmation dialog on folder deletion: `"Xóa thư mục '{name}'? Tất cả request bên trong sẽ bị xóa. Hành động này không thể hoàn tác."`
  - Both dialogs provide a destructive red `"Xóa"` button and a `"Hủy"` button (`Escape` also cancels without deleting).
- **Workspace Empty State**: When no request is active (on initial launch or after deleting the active request/folder), the main workspace displays `"Chọn một Request để bắt đầu"` with a `Ctrl+N` shortcut badge.

## Cross-Story Dependencies

- Both stories build upon the collection tree, request editor, Wails bindings, and Playwright E2E test harness established in Epics 1–5.
- Story 6.1 (functional E2E coverage for folders and edge cases) and Story 6.2 (CI performance benchmarking and NFR evidence generation) are independent of one another in implementation, but both contribute to the CI quality gate and publish outputs to the `test-results` artifact directory.

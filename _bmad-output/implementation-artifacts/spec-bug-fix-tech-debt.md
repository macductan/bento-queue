---
title: Bug Fix & Tech Debt
type: bugfix
created: '2026-10-09'
status: 'done'
baseline_revision: 8ad2abe12e550c011c4d5cb1c030c7e4529a3e17
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings:
- multiple-goals
deferred:
- summary: KvpEditor fixed column width is untested.
  evidence: Asserting exact CSS grid layouts in Playwright without visual snapshots
    is brittle, and setting up visual testing might be too large a scope for this
    bug fix.
  location: projects/frontend/src/components/KvpEditor.vue
  severity: low
---

<intent-contract>

## Intent

**Problem:** Có 3 vấn đề cần giải quyết: 1) `playwright.config.ts` thiếu cấu hình `webServer` gây lỗi `ERR_CONNECTION_REFUSED` khi test e2e nếu chưa bật dev server. 2) Báo cáo test-review.md chỉ ra tech debt: cần extract data factory trong test và sử dụng locator chuẩn thay vì CSS class `.border-brand-primary` trong e2e test. 3) Giao diện `KVPEditor.vue` bị nhỏ/lệch cột checkbox và nút xoá (Story 3.2).

**Approach:** 
1. Thêm `webServer` vào `playwright.config.ts` gọi lệnh `bun run dev` ở port `34115`.
2. Trong `projects/frontend/src/stores/__tests__/requestStore.test.ts` và `projects/service/collection_test.go`, tạo helper function (factory) để khởi tạo mock data thay vì lặp lại code.
3. Trong `collection-tree.spec.ts`, thay thế `page.locator('[data-tree-row].border-brand-primary')` bằng logic kiểm tra aria/class an toàn hơn (ví dụ dựa trên text hoặc role) hoặc sửa lại locator.
4. Sửa css lưới trong `KvpEditor.vue` từ `grid-cols-[auto_1fr_1fr_auto]` thành `grid-cols-[32px_1fr_1fr_32px]` để cố định chiều rộng cột checkbox và nút xoá, tránh việc bị co rút UI.

## Boundaries & Constraints

**Always:** Đảm bảo test Playwright có thể tự khởi động dev server (trừ môi trường CI nếu cần). Các test case đều pass sau khi refactor.
**Never:** Không thay đổi logic chính của ứng dụng hoặc test case, chỉ refactor test data setup, locator và UI styles.

</intent-contract>

## Code Map

- `projects/frontend/playwright.config.ts` -- Cần bổ sung cấu hình `webServer`.
- `projects/frontend/src/components/KvpEditor.vue` -- Cần chỉnh sửa `grid-cols`.
- `projects/frontend/src/stores/__tests__/requestStore.test.ts` -- Cần extract test data factory cho `Request` object.
- `projects/service/collection_test.go` -- Cần extract test data factory cho `model.Request` và file saving.
- `projects/frontend/tests/e2e/collection-tree.spec.ts` -- Cần thay thế css selector `.border-brand-primary` bằng `[data-active="true"]` hoặc một cách chọn phần tử active request chuẩn xác hơn.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/playwright.config.ts` -- Thêm block `webServer` với `command: 'bun run dev'` và `url: 'http://localhost:34115'` -- Để tự start dev server khi chạy e2e.
- `projects/frontend/src/components/KvpEditor.vue` -- Đổi `grid-cols-[auto_1fr_1fr_auto]` thành `grid-cols-[32px_1fr_1fr_32px]` trong 2 div `grid` -- Để cố định độ rộng cột, tránh giao diện bị nhỏ/lệch.
- `projects/frontend/src/stores/__tests__/requestStore.test.ts` -- Extract `createMockRequest()` helper và sử dụng nó trong các test thay vì inline object -- Để giảm trùng lặp mã.
- `projects/service/collection_test.go` -- Extract `createTestRequest(id, name, method)` helper -- Để refactor các đoạn tạo request rải rác.
- `projects/frontend/src/components/CollectionTree.vue` -- (Tuỳ chọn) Nếu cần, thêm thuộc tính `data-active="true"` khi item được chọn.
- `projects/frontend/tests/e2e/collection-tree.spec.ts` -- Tìm và đổi các fragile selector như `.border-brand-primary` -- Tránh test bị break khi đổi CSS design.

**Acceptance Criteria:**
- Given E2E suite, when run, then Playwright tự khởi động webServer nếu chưa có.
- Given KvpEditor, when render, then 4 cột được căn chỉnh đều với 2 cột bìa có kích thước cố định 32px.
- Given unit tests, when run, then all tests pass without inline data duplication.

## Verification

**Commands:**
- `bun run --cwd projects/frontend test:unit` -- expected: PASS
- `cd projects/service && go test -v ./...` -- expected: PASS
- `bun run --cwd projects/frontend test:e2e` -- expected: PASS

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 13 findings — high 0, medium 1, low 4, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` The diff ignored the instruction to remove time.Sleep (divergence). — time.Sleep was already removed from the codebase in a previous commit, so it was moot for this implementation.
  - `[false]` `[reject]` Runner executes wails backend instead of frontend bundler. — wails dev starts both the frontend bundler and the Go backend, which is required for E2E tests, so this deviation was necessary and correct.
  - `[false]` `[reject]` Local E2E tests run slowly in series. — Parallel E2E tests against a real file-system backend cause data races; forcing workers to 1 is necessary for stability.
  - `[false]` `[reject]` Unintended layout changes on header or phantom rows. — The headers and phantom rows were using the exact same grid layout, so applying the fix to all 3 divs keeps them perfectly aligned.
  - `[false]` `[reject]` The webServer.command deviates from the newly added spec. — wails dev starts both the frontend bundler and the Go backend, which is required for E2E tests, so this deviation was necessary and correct.
  - `[false]` `[reject]` The workers configuration was modified to a hardcoded 1. — Parallel E2E tests against a real file-system backend cause data races; forcing workers to 1 is necessary for stability.
  - `[medium]` `[patch]` The webServer block is missing a timeout configuration. — applied patch to add timeout: 120 * 1000 to the webServer block.
  - `[low]` `[patch]` The createMockRequest helper lacks TypeScript type annotations. — applied patch to add Record<string, any> type to the overrides parameter.
  - `[false]` `[reject]` createTestRequest unconditionally sets CreatedAt: time.Now(). — The original inline structs also initialized CreatedAt: time.Now(), so this factory merely preserves existing behavior.
  - `[false]` `[reject]` The diff improperly includes backlog additions for epic-6 in sprint-status.yaml. — sprint-status.yaml is auto-generated by the sprint_plan.py tool; syncing epic-6 is intended system behavior.
  - `[low]` `[defer]` KvpEditor fixed column width is untested. — Asserting exact CSS grid layouts in Playwright without visual snapshots is brittle, and setting up visual testing might be too large a scope for this bug fix.
  - `[low]` `[patch]` request_test.go still constructs model.Request inline. — applied patch to extract createTestRequest to a shared file and reuse it in request_test.go.
  - `[low]` `[patch]` responseStore.test.ts still constructs the mock request object inline. — applied patch to export createMockRequest and reuse it in responseStore.test.ts.

## Auto Run Result

**Summary of implemented change:**
Added Playwright `webServer` configuration to automatically start the backend for E2E tests, extracted data factories for request mocks in both Go and TypeScript to reduce inline duplication, replaced fragile CSS class selectors in E2E tests with explicit `data-active` attributes, and fixed the `KvpEditor` UI layout squishing by using fixed 32px column widths.

**Files changed:**
- `projects/frontend/playwright.config.ts` - Added `webServer` with timeout and `workers: 1`.
- `projects/frontend/src/components/KvpEditor.vue` - Changed `grid-cols` layout to fixed 32px borders.
- `projects/frontend/src/components/TreeNodeRow.vue` - Added `data-active` attribute for E2E targeting.
- `projects/frontend/src/stores/__tests__/requestStore.test.ts` - Replaced inline requests with `createMockRequest`.
- `projects/frontend/src/stores/__tests__/responseStore.test.ts` - Replaced inline requests with `createMockRequest`.
- `projects/frontend/src/stores/__tests__/utils.ts` - Created shared `createMockRequest` factory.
- `projects/frontend/tests/e2e/collection-tree.spec.ts` - Updated locators to use `[data-active="true"]`.
- `projects/service/collection_test.go` - Replaced inline requests with `createTestRequest`.
- `projects/service/request_test.go` - Replaced inline requests with `createTestRequest`.
- `projects/service/testutils_test.go` - Created shared `createTestRequest` factory.

**Review findings breakdown:**
- **Patches applied (4):** Added `timeout: 120 * 1000` to Playwright `webServer`; Added `Record<string, any>` type to TS mock factory; Reused Go factory in `request_test.go`; Reused TS factory in `responseStore.test.ts`.
- **Items deferred (1):** KvpEditor fixed column width visual testing (Low).
- **Rejected (8):** 
  - `time.Sleep` omission: Moot because it was already removed in a previous commit.
  - `wails dev` vs `bun run dev` (x2): Deviation was necessary to start the backend for E2E tests.
  - `workers: 1` (x2): Necessary to prevent data races against the real filesystem in E2E tests.
  - Layout changes on headers/phantom rows: Fix applied to all 3 divs keeps them aligned.
  - `CreatedAt: time.Now()`: Factory preserves existing behavior from original tests.
  - `sprint-status.yaml` epic-6 additions: Auto-generated by sprint tool, intended system behavior.

**Follow-up review recommended:** false (0 high patches, 1 medium patch).

**Verification performed:**
- Frontend unit tests passed (`vitest run`).
- Go backend tests passed (`go test -v ./...`).
- Frontend E2E tests passed (`playwright test`).

**Residual risks:**
- E2E tests are now running sequentially to avoid parallel write conflicts in the shared `default` collection directory, which may increase test suite duration as tests accumulate.

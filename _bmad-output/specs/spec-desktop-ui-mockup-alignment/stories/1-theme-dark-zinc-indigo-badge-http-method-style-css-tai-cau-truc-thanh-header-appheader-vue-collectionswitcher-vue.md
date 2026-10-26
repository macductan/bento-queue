---
title: 'Theme Dark Zinc + Indigo, Badge HTTP Method (style.css) & Tái cấu trúc Thanh Header (AppHeader.vue, CollectionSwitcher.vue)'
type: 'feature'
created: '2026-10-26'
status: 'done'
story_id: '1'
parent_spec: '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
baseline_revision: 'HEAD'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/ui-mockup-alignment-details.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/stories.yaml'
  - 'projects/frontend/src/style.css'
  - 'projects/frontend/src/components/CollectionSwitcher.vue'
  - 'projects/frontend/src/components/AppHeader.vue'
  - 'projects/frontend/src/components/AppTabBar.vue'
  - 'projects/frontend/src/stores/mockServerStore.ts'
  - 'projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts'
  - 'projects/frontend/src/components/__tests__/ResizableLayout.test.ts'
  - 'projects/frontend/src/components/__tests__/AppTabBar.test.ts'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hệ màu hiện tại trong `style.css` vẫn dùng tông Slate + Blue cũ và badge HTTP Method chưa có nền mờ + viền màu đồng bộ với bản thiết kế mẫu; đồng thời trên `AppHeader.vue`, `CollectionSwitcher.vue` đang nằm bên phải thay vì cạnh Logo ở cụm trái, nút Git Sync và Mock Server chỉ hiển thị icon chấm nhỏ mà thiếu nhãn chữ trạng thái trực quan (`Git Sync` / `Git: <branch>` / `Xung đột Git (n)`, `Mock :<port>` / `Mock Server`), và nút Import Postman chưa có `data-test="import-collection-btn"`, icon upload màu amber cùng badge phím tắt `<kbd>^I</kbd>`.

**Approach:** Cập nhật hệ thống CSS tokens trong `projects/frontend/src/style.css` sang bảng màu Dark Zinc + Indigo và định nghĩa các class badge HTTP Method có nền mờ + viền màu (vẫn bảo toàn `text-method-*`); bổ sung badge `Default` (`data-test="collection-default-badge"`) trên nút mở `CollectionSwitcher.vue` (`data-test="collection-switcher-btn"`); chuyển `CollectionSwitcher` sang cụm trái của `AppHeader.vue` ngăn cách bởi vạch dọc, nâng cấp nút Git Sync và Mock Server thành status pill hiển thị chữ + chấm trạng thái, và bổ sung icon upload amber + `<kbd>^I</kbd>` cho nút Import Postman (`data-test="import-collection-btn"`).

## Boundaries & Constraints

**Always:**
- Bảo toàn 100% các token CSS cũ (`--color-surface-*`, `--color-border-*`, `--color-brand-*`) song song với các biến `--color-bg-*`, `--color-accent-*` mới trong `@theme` của `style.css` để không làm gãy bất kỳ component hiện có nào.
- Giữ nguyên toàn bộ các class `text-method-get`, `text-method-post`, `text-method-put`, `text-method-patch`, `text-method-delete` và bổ sung `text-method-head`, `text-method-options` cùng `.method-badge-*`.
- Giữ nguyên toàn bộ `data-test` hiện hành trên `AppHeader.vue`, `CollectionSwitcher.vue`, `AppTabBar.vue` (`git-config-btn`, `git-status-badge-conflict`, `git-status-badge-configured`, `open-mock-server-btn`, `mock-server-running-indicator`, `open-history-modal-btn`, `collection-variables-btn`, `app-tab-bar`, `app-tab-item`, `tab-method-badge`,...).

**Never:**
- Không xóa hoặc làm hỏng các modal hiện có trong `AppHeader.vue` (`ImportErrorModal`, `SettingsModal`) và `CollectionSwitcher.vue` (`CollectionModal`, `CollectionEnvModal`).
- Không chạy `git commit` hay `git push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Collection mặc định đang chọn | `activeCollection.is_default === true` hoặc `id === 'default'` | Nút `[data-test="collection-switcher-btn"]` hiển thị tên collection kèm badge `[data-test="collection-default-badge"]` có chữ `Default` | Không hiển thị badge khi `collections` rỗng đang tải |
| Collection thường đang chọn | `activeCollection.is_default === false` và `id !== 'default'` | Nút `[data-test="collection-switcher-btn"]` chỉ hiển thị tên collection, ẩn `[data-test="collection-default-badge"]` | No error expected |
| Git Sync có xung đột | `collectionStore.gitConflictError` khác null hoặc `gitSyncStatus?.has_conflicts === true` | Nút `[data-test="git-config-btn"]` có style cảnh báo amber, hiển thị `[data-test="git-status-badge-conflict"]` và nhãn `Xung đột Git (n)` (với `n` là số file xung đột, tối thiểu 1) | Fallback `n = 1` nếu mảng `files`/`conflict_files` rỗng |
| Git Sync đã cấu hình, không xung đột | `activeCollection.git_remote_url` hoặc `gitSyncStatus?.remote_url` có giá trị, không xung đột | Nút `[data-test="git-config-btn"]` hiển thị `[data-test="git-status-badge-configured"]` và nhãn `Git: <branch>` (fallback `'main'` nếu chưa có branch) | Fallback `'main'` khi `gitSyncStatus?.branch` trống |
| Git Sync chưa cấu hình | Không có `git_remote_url` và không có xung đột | Nút `[data-test="git-config-btn"]` hiển thị chấm xám và nhãn `Git Sync` | No error expected |
| Mock Server đang chạy | `mockStore.running === true` (hoặc `mockStore.status.running === true`) với `port = 4010` | Nút `[data-test="open-mock-server-btn"]` có viền/nền emerald, hiển thị `[data-test="mock-server-running-indicator"]` và nhãn `Mock :4010` | No error expected |
| Mock Server đang tắt | `mockStore.running === false` | Nút `[data-test="open-mock-server-btn"]` hiển thị chấm xám và nhãn `Mock Server`, ẩn `[data-test="mock-server-running-indicator"]` | No error expected |
| Nút Import Postman | Trạng thái bình thường vs `isImporting === true` | Nút `[data-test="import-collection-btn"]` hiển thị icon upload `text-amber-400`, chữ `Import Postman` (hoặc tiến độ khi đang import) và `<kbd>^I</kbd>` | Disable nút khi `isImporting === true` |

</intent-contract>

## Code Map

- `projects/frontend/src/style.css` -- Định nghĩa `@theme` CSS variables (Dark Zinc + Indigo) và các class `.method-badge-*` / `.text-method-*`.
- `projects/frontend/src/components/CollectionSwitcher.vue` -- Nút chọn Collection (`data-test="collection-switcher-btn"`) và badge `Default` (`data-test="collection-default-badge"`).
- `projects/frontend/src/components/AppHeader.vue` -- Thanh Header trên cùng: cụm trái (Logo + Version + vạch dọc + `CollectionSwitcher`), cụm phải (Git Sync pill, Mock Server pill, Import Postman `^I`, `EnvSelector`, History, Manage Envs, Settings).
- `projects/frontend/src/components/AppTabBar.vue` -- Đồng bộ badge HTTP Method trên thanh tab có nền mờ + viền màu và hỗ trợ đủ 7 methods (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`) trong khi giữ nguyên class `text-method-*`.
- `projects/frontend/src/stores/mockServerStore.ts` -- Store quản lý trạng thái chạy và cổng của Local Mock Server.
- `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts` -- Unit test cho `CollectionSwitcher.vue`.
- `projects/frontend/src/components/__tests__/ResizableLayout.test.ts` -- Unit test cho `AppHeader.vue` và bố cục chung.
- `projects/frontend/src/components/__tests__/AppTabBar.test.ts` -- Unit test cho `AppTabBar.vue`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/style.css` -- Cập nhật các biến màu trong `@theme` sang bảng màu Dark Zinc + Indigo (`#09090B`, `#18181B`, `#27272A`, `#6366F1`, `#F4F4F5`, `#A1A1AA`, `#71717A`, `#4F46E5`, và `--color-method-get/post/put/patch/delete/head/options`), đồng thời thêm các utility class `.method-badge-get`, `.method-badge-post`, `.method-badge-put`, `.method-badge-patch`, `.method-badge-delete`, `.method-badge-head`, `.method-badge-options` có nền mờ + viền màu -- Đồng bộ CAP-1.
- `projects/frontend/src/components/CollectionSwitcher.vue` -- Thêm `data-test="collection-switcher-btn"` vào nút mở dropdown và hiển thị badge `Default` (`data-test="collection-default-badge"`) khi collection đang chọn là mặc định -- Đồng bộ CAP-2.
- `projects/frontend/src/components/AppHeader.vue` -- Đưa `<CollectionSwitcher />` sang cụm bên trái cạnh Logo (ngăn cách bởi `<div class="h-5 w-px bg-zinc-800"></div>`); nâng cấp nút Git Sync (`data-test="git-config-btn"`), nút Mock Server (`data-test="open-mock-server-btn"`) thành dạng status pill hiển thị chữ + chấm trạng thái; cập nhật nút Import Postman (`data-test="import-collection-btn"`) có icon upload `text-amber-400` + chữ `Import Postman` + `<kbd>^I</kbd>` -- Đồng bộ CAP-2.
- `projects/frontend/src/components/AppTabBar.vue` -- Cập nhật `methodColors` và badge `[data-test="tab-method-badge"]` sử dụng kết hợp `text-method-<method>` và `method-badge-<method>` -- Đồng bộ CAP-1.
- `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts`, `projects/frontend/src/components/__tests__/ResizableLayout.test.ts`, `projects/frontend/src/components/__tests__/AppTabBar.test.ts` -- Bổ sung unit tests kiểm tra toàn bộ các trường hợp trong I/O Matrix -- Đảm bảo độ phủ kiểm thử tự động.

**Acceptance Criteria:**
- Given ứng dụng khởi chạy, when kiểm tra `style.css` và các tab trên `AppTabBar.vue`, then bảng màu Dark Zinc + Indigo và các class `text-method-*` + `method-badge-*` được áp dụng chính xác.
- Given `AppHeader.vue` được render, when kiểm tra cụm bên trái, then `CollectionSwitcher` nằm ngay cạnh cụm Logo ngăn cách bởi vạch dọc `bg-zinc-800` và hiển thị badge `Default` (`data-test="collection-default-badge"`) khi collection đang chọn có `is_default === true`.
- Given `AppHeader.vue` được render, when trạng thái Git và Mock Server thay đổi, then nút `data-test="git-config-btn"` hiển thị đúng `Git Sync` / `Git: <branch>` / `Xung đột Git (n)`, nút `data-test="open-mock-server-btn"` hiển thị đúng `Mock Server` / `Mock :<port>`, và nút `data-test="import-collection-btn"` hiển thị icon upload amber kèm `<kbd>^I</kbd>`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 10 findings — high 0, medium 3, low 3, false 3, maybe-false 1
- findings:
  - `[medium]` `[patch]` `gitConflictCount` in `AppHeader.vue` used `??` on `.length`, short-circuiting to `0` when `conflict_files` is `[]` and `conflicts` is non-empty — Patched `fromStatus` to `Math.max(collectionStore.gitSyncStatus?.conflict_files?.length ?? 0, collectionStore.gitSyncStatus?.conflicts?.length ?? 0)`.
  - `[medium]` `[patch]` `mockPort` in `AppHeader.vue` used `?? 4010`, allowing `0`, `NaN`, or `""` to render as `Mock :0` / `Mock :NaN` — Patched `mockPort` to validate `Number.isFinite(p) && p > 0 ? p : 4010`.
  - `[medium]` `[patch]` Verification gaps in `ResizableLayout.test.ts` and `AppTabBar.test.ts` for `gitSyncStatus` conflicts when `gitConflictError` is `null`, non-default `mockStore.port`, and `method-badge-*` classes — Extended unit tests in `ResizableLayout.test.ts` and `AppTabBar.test.ts` (46/46 tests pass).
  - `[low]` `[patch]` `.method-badge-delete` in `style.css` used `rgba(239, 68, 68, ...)` while `--color-method-delete` is `#F43F5E` (`rgb(244, 63, 94)`) — Updated `.method-badge-delete` RGBA values to `244, 63, 94`.
  - `[low]` `[patch]` `CollectionSwitcher.vue` trigger button lacked a `max-w-*` truncation guard in the left header cluster — Added `max-w-[160px]` to the collection name span inside `[data-test="collection-switcher-btn"]`.
  - `[low]` `[patch]` `getMethodColorClass` in `AppTabBar.vue` did not trim method or apply a fallback badge border/bg — Updated `getMethodColorClass` to `.trim().toLowerCase()` and fallback to `'text-text-secondary method-badge-options'`.
  - `[false]` `[reject]` `TreeNodeRow.vue` and `UrlBar.vue` method badges not updated in Story 1 — By design: `stories.yaml` explicitly assigns `TreeNodeRow.vue` to Story 2 and `UrlBar.vue` to Story 3.
  - `[false]` `[reject]` `--color-bg-hover` and `--color-border-subtle` set to `#27272A` in `style.css` — Explicitly required by the token mapping table in `ui-mockup-alignment-details.md` Section 2.1.
  - `[false]` `[reject]` `Git Sync` pill has leading branch icon while `Mock Server` pill has leading status dot — Matches `ui-mockup-alignment-details.md` Section 3.1.2 specification.
  - `[maybe-false]` `[defer]` Pre-existing `collectionStore` Git status lifecycle across collection switches — Out of scope of `AppHeader.vue` status pill presentation.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: all test suites pass 100%

## Auto Run Result

- **Status**: `done`
- **Summary of implemented change**: Đồng bộ bảng màu CSS tokens trong `style.css` sang Dark Zinc + Indigo và định nghĩa hệ thống `.method-badge-*` có nền mờ + viền màu; bổ sung badge `Default` (`data-test="collection-default-badge"`) trên `CollectionSwitcher.vue`; đưa `CollectionSwitcher` sang cụm bên trái `AppHeader.vue` cạnh Logo và nâng cấp nút Git Sync (`data-test="git-config-btn"`), Mock Server (`data-test="open-mock-server-btn"`), Import Postman (`data-test="import-collection-btn"`).
- **Files changed**:
  - `projects/frontend/src/style.css` — Cập nhật `@theme` Dark Zinc + Indigo và định nghĩa `.method-badge-*`.
  - `projects/frontend/src/components/CollectionSwitcher.vue` — Thêm `data-test="collection-switcher-btn"` và badge `Default` (`data-test="collection-default-badge"`).
  - `projects/frontend/src/components/AppHeader.vue` — Chuyển `CollectionSwitcher` sang cụm trái, nâng cấp Git Sync pill, Mock Server pill và nút Import Postman `^I`.
  - `projects/frontend/src/components/AppTabBar.vue` — Áp dụng `method-badge-*` kết hợp `text-method-*` cho đủ 7 HTTP methods.
  - `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts` — Bổ sung unit test cho `collection-default-badge`.
  - `projects/frontend/src/components/__tests__/ResizableLayout.test.ts` — Bổ sung unit test cho cụm trái/phải của `AppHeader.vue`.
  - `projects/frontend/src/components/__tests__/AppTabBar.test.ts` — Bổ sung kiểm tra `method-badge-*` và `text-method-head`.
- **Review findings breakdown**: 6 patched (`3 medium`, `3 low`), 1 deferred (`maybe-false`), 3 rejected (`false`).
- **Follow-up review recommendation**: `false` (all medium/low patches verified with unit tests).
- **Verification performed**: `bun run type-check` (exit 0) và `bun run test` (55/55 test files, 723/723 tests passed).
- **Residual risks**: Không có.

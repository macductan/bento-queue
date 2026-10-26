---
title: 'Nâng cấp Thanh Sidebar, Banner Cảnh báo Ổ đĩa & Nút Cài đặt Thư mục nhanh (AppSidebar.vue, TreeNodeRow.vue, TreeContextMenu.vue)'
type: 'feature'
created: '2026-10-26'
status: 'done'
story_id: '2'
parent_spec: '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
baseline_revision: 'HEAD'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/ui-mockup-alignment-details.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/stories.yaml'
  - 'projects/frontend/src/components/AppSidebar.vue'
  - 'projects/frontend/src/components/TreeNodeRow.vue'
  - 'projects/frontend/src/components/TreeContextMenu.vue'
  - 'projects/frontend/src/stores/collectionStore.ts'
  - 'projects/frontend/src/components/__tests__/AppSidebar.test.ts'
  - 'projects/frontend/src/components/__tests__/TreeNodeRow.test.ts'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Thanh Sidebar hiện tại gộp chung ô tìm kiếm và 4 nút công cụ trên cùng một hàng chật hẹp, nút chuyển đổi `APIs` / `Flows` chưa có icon trực quan, nút `+` chưa hiển thị dạng pill `+ Tạo mới ▾`, thiếu banner cảnh báo nổi khi ổ đĩa thay đổi từ Git/CLI (`store.hasExternalChanges`), và dòng Folder trên cây thư mục chưa có nút mở nhanh `Cài đặt Thư mục` (icon sliders) khi hover.

**Approach:** Bổ sung icon tia sét (`text-indigo-400`) cho nút `APIs` và icon luồng/cột (`text-pink-400`) cho nút `Flows` trên `AppSidebar.vue`; tách ô tìm kiếm thành hàng 1 chiếm trọn chiều ngang và hàng 2 gồm `[Làm mới | Thu gọn tất cả | Sắp xếp A-Z]` bên trái + nút pill `+ Tạo mới ▾` (`data-test="sidebar-add-btn"`) bên phải; bổ sung banner cảnh báo nổi (`data-test="external-change-banner"`) kèm nút `[Tải lại]` (`data-test="external-change-reload-btn"`) ngay đầu vùng cây thư mục khi `store.hasExternalChanges === true`; thêm nút mở nhanh `Cài đặt Thư mục` (`data-test="folder-settings-btn"`, icon sliders) trên dòng Folder trong `TreeNodeRow.vue` (chế độ `apis`), cập nhật badge HTTP Method trên dòng Request có nền mờ + viền màu (`.method-badge-*` + `.text-method-*`), và đồng bộ mục `Cài đặt thư mục` (`data-test="ctx-folder-settings"`) trong `TreeContextMenu.vue`.

## Boundaries & Constraints

**Always:**
- Giữ nguyên 100% logic tìm kiếm lọc cây (`filterTree`, `filterFlowTree`), bảo toàn trạng thái đóng/mở thư mục khi lọc, kéo-thả cây thư mục (`dragstart`, `dragover`, `dragleave`, `drop`, root drop zone), đổi tên inline (`F2` / double-click), xóa (`Delete`), nhân bản (`Ctrl+D`), và điều hướng bàn phím (`ArrowUp`, `ArrowDown`, `Enter`).
- Giữ nguyên toàn bộ `data-test` hiện có trên `AppSidebar.vue`, `TreeNodeRow.vue`, `TreeContextMenu.vue` (`workspace-mode-apis`, `workspace-mode-flows`, `tree-filter-input`, `clear-filter-btn`, `sidebar-reload-btn`, `external-change-badge`, `tree-collapse-all-btn`, `tree-sort-alphabet-btn`, `sidebar-add-btn`, `sidebar-add-dropdown`, `add-request-item`, `add-folder-item`, `add-flow-item`, `add-flow-folder-item`, `folder-sort-btn`, `context-menu-sort-btn`,...) và giữ nguyên các class `text-method-*` trên badge Method của `TreeNodeRow.vue`.
- Trong `collectionStore.ts`, bổ sung alias action `openFolderSettings(id: string)` gọi `this.setActiveFolderId(id)` để cả `store.openFolderSettings(id)` và `store.setActiveFolderId(id)` đều hoạt động nhất quán.

**Never:**
- Không hiển thị nút `data-test="folder-settings-btn"` hoặc mục `data-test="ctx-folder-settings"` cho `flow_folder` ở chế độ `flows` (vì `FlowFolder` chỉ là thư mục phân nhóm, không có Auth/Headers/Variables).
- Không chạy `git commit` hay `git push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chuyển chế độ `APIs` / `Flows` | Bấm `[data-test="workspace-mode-apis"]` hoặc `[data-test="workspace-mode-flows"]` | Nút `APIs` có icon `<svg>` tia sét (`text-indigo-400`), nút `Flows` có icon `<svg>` cột/luồng (`text-pink-400`), chuyển `uiStore.workspaceMode` tương ứng | Đóng dropdown `+ Tạo mới` nếu đang mở |
| Tách 2 hàng Tìm kiếm & Công cụ | Render `AppSidebar.vue` | Hàng 1 chứa `[data-test="tree-filter-input"]` (`w-full`) + `[data-test="clear-filter-btn"]`; Hàng 2 chứa `[sidebar-reload-btn, tree-collapse-all-btn, tree-sort-alphabet-btn]` bên trái và nút pill `+ Tạo mới` (`[data-test="sidebar-add-btn"]`) bên phải | No error expected |
| Phát hiện ổ đĩa thay đổi (`store.hasExternalChanges === true`) | `store.hasExternalChanges = true` | Hiển thị chấm `[data-test="external-change-badge"]` trên nút làm mới VÀ hiển thị banner nổi `[data-test="external-change-banner"]` có nội dung `"Phát hiện ổ đĩa thay đổi (Git/CLI)"` kèm nút `[data-test="external-change-reload-btn"]` (`Tải lại`); bấm `Tải lại` gọi `store.smartReload()` | Ẩn banner khi `store.hasExternalChanges === false` |
| Mở nhanh Cài đặt Thư mục từ dòng Folder (`TreeNodeRow.vue`) | `node.type === 'folder'` ở chế độ `apis` (`!isFlowMode && !isEditing`) | Hiển thị nút `[data-test="folder-settings-btn"]` (icon sliders, `title="Cài đặt Thư mục (Auth, Headers, Vars, Scripts)"`) cạnh `[data-test="folder-sort-btn"]` và `[data-test="tree-node-menu-btn"]`; bấm nút gọi `store.openFolderSettings(node.id)` (mở `FolderEditor`) mà không toggle đóng/mở thư mục | Ẩn nút khi `isFlowMode === true` (`flow_folder`) hoặc khi `isEditing === true` |
| Mở Cài đặt Thư mục từ `TreeContextMenu.vue` | Chuột phải vào Folder ở chế độ `apis` | Hiển thị nút `[data-test="ctx-folder-settings"]` có icon sliders `text-indigo-400` + chữ `Cài đặt thư mục`; bấm nút mở `FolderEditor` và đóng menu | Ẩn khi `nodeId === ''` (root) hoặc ở chế độ `flows` |
| Badge HTTP Method trên dòng Request (`TreeNodeRow.vue`) | `node.type === 'request'` với `method` (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`) | Badge hiển thị cả class `text-method-<m>` và `method-badge-<m>` có nền mờ + viền màu | Fallback `text-text-secondary method-badge-options` cho custom method |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung action `openFolderSettings(id: string)` gọi `await this.setActiveFolderId(id)`.
- `projects/frontend/src/components/AppSidebar.vue` -- Mode switcher có icon tia sét/luồng, tách 2 hàng Tìm kiếm & Công cụ (với nút pill `+ Tạo mới`), và thêm banner cảnh báo ổ đĩa `data-test="external-change-banner"` + `data-test="external-change-reload-btn"`.
- `projects/frontend/src/components/TreeNodeRow.vue` -- Bổ sung nút hover `data-test="folder-settings-btn"` (icon sliders) cho folder ở chế độ `apis`, thêm `data-test="tree-node-menu-btn"` cho nút `•••`, và cập nhật badge HTTP Method dùng `text-method-*` + `method-badge-*`.
- `projects/frontend/src/components/TreeContextMenu.vue` -- Thêm `data-test="ctx-folder-settings"` và icon sliders `text-indigo-400` cho mục `Cài đặt thư mục`.
- `projects/frontend/src/components/__tests__/AppSidebar.test.ts` -- Unit test cho `AppSidebar.vue`.
- `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` -- Unit test cho `TreeNodeRow.vue` và `TreeContextMenu.vue`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/stores/collectionStore.ts` -- Thêm action `async openFolderSettings(id: string) { await this.setActiveFolderId(id) }` -- Hỗ trợ mở nhanh `FolderEditor` từ `TreeNodeRow.vue` và `TreeContextMenu.vue`.
- `projects/frontend/src/components/AppSidebar.vue` -- Bổ sung icon SVG cho nút `APIs` (`text-indigo-400`) và `Flows` (`text-pink-400`); tách ô tìm kiếm thành hàng 1 và hàng công cụ `[Làm mới | Thu gọn | Sắp xếp A-Z]` + nút pill `+ Tạo mới` (`data-test="sidebar-add-btn"`) thành hàng 2; thêm banner `data-test="external-change-banner"` kèm nút `data-test="external-change-reload-btn"` gọi `handleSmartReload()` (`store.smartReload()`) khi `store.hasExternalChanges === true` -- Đồng bộ CAP-3.
- `projects/frontend/src/components/TreeNodeRow.vue` -- Thêm nút `data-test="folder-settings-btn"` (icon sliders) khi `!isEditing && isFolder && !isFlowMode` gọi `store.openFolderSettings(props.node.id)`; thêm `data-test="tree-node-menu-btn"` vào nút `•••`; cập nhật `methodColors` và badge Method trên dòng request kết hợp `text-method-*` và `method-badge-*` -- Đồng bộ CAP-3 & CAP-1.
- `projects/frontend/src/components/TreeContextMenu.vue` -- Thêm `data-test="ctx-folder-settings"` kèm icon sliders `text-indigo-400` vào nút `Cài đặt thư mục` và gọi `collectionStore.openFolderSettings(uiStore.contextMenu.nodeId)` -- Đồng bộ CAP-3.
- `projects/frontend/src/components/__tests__/AppSidebar.test.ts`, `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` -- Bổ sung unit tests kiểm tra toàn bộ các kịch bản trong I/O Matrix -- Đảm bảo độ phủ kiểm thử tự động.

**Acceptance Criteria:**
- Given `AppSidebar.vue` hiển thị, when kiểm tra phần đầu Sidebar, then bộ chuyển đổi `APIs` / `Flows` có icon màu tương ứng, ô tìm kiếm nằm ở hàng riêng phía trên thanh công cụ, và nút `data-test="sidebar-add-btn"` hiển thị nhãn `+ Tạo mới`.
- Given `store.hasExternalChanges === true`, when xem `AppSidebar.vue`, then banner `data-test="external-change-banner"` hiển thị `"Phát hiện ổ đĩa thay đổi (Git/CLI)"` và bấm `data-test="external-change-reload-btn"` gọi `store.smartReload()`.
- Given dòng Folder ở chế độ `apis` trên `TreeNodeRow.vue`, when bấm nút `data-test="folder-settings-btn"` hoặc mục `data-test="ctx-folder-settings"` trên `TreeContextMenu.vue`, then `store.openFolderSettings(folderId)` (`setActiveFolderId`) được gọi để mở `FolderEditor` của thư mục đó.

## Spec Change Log

## Review Triage Log

### Iteration 1 (2026-10-26)
- **Part 1 (Intent Alignment):**
  - *External change warning banner inside scrollable `tree-root-drop-zone`*: Categorized as `patch` — moved `data-test="external-change-banner"` outside and immediately above `data-test="tree-root-drop-zone"` with `shrink-0` so it remains pinned/floating above the scrolling tree and does not intercept root drag-and-drop events; updated unit test so `smartReload` clears `hasExternalChanges` directly.
- **Part 2 (Implementation Review — Blind Hunter, Edge Case Hunter, Verification Gap):**
  - *`hover:bg-surface-elevated` and `hover:text-text-default` non-existent tokens (`TreeNodeRow.vue`, `AppSidebar.vue`)*: Categorized as `patch` — replaced with valid Tailwind classes `hover:bg-zinc-700/80` and `hover:text-zinc-200 hover:bg-zinc-800`.
  - *Double-clicking `folder-settings-btn` bubbles `dblclick` to row and triggers inline rename (`TreeNodeRow.vue`)*: Categorized as `patch` — added `@dblclick.stop` on `folder-settings-btn`, `folder-sort-btn`, and `tree-node-menu-btn`.
  - *`openFolderSettings` empty-id guard & `handleSmartReload` re-entrancy guard (`collectionStore.ts`, `AppSidebar.vue`)*: Categorized as `patch` — guarded `openFolderSettings` against empty/whitespace IDs (`if (!id || !id.trim()) return`) and guarded `handleSmartReload` against concurrent calls (`if (store.loading || flowStore.loading) return`).
  - *Mode switcher active vs. hover tab styling & `aria-hidden="true"` on icons (`AppSidebar.vue`)*: Categorized as `patch` — updated inactive tab hover to `hover:text-zinc-200 hover:bg-zinc-800/50` and added `aria-hidden="true"` to decorative `<svg>` icons.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0 (Verified: passed)
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: all test suites pass 100% (Verified: 55/55 test files, 727/727 tests passed)

## Auto Run Result
- **Story ID:** 2
- **Final Status:** done
- **Files Changed:**
  - `projects/frontend/src/stores/collectionStore.ts`
  - `projects/frontend/src/components/AppSidebar.vue`
  - `projects/frontend/src/components/TreeNodeRow.vue`
  - `projects/frontend/src/components/TreeContextMenu.vue`
  - `projects/frontend/src/components/__tests__/AppSidebar.test.ts`
  - `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts`
- **Verification Outcome:** Passed (`bun run type-check` exit 0, `bun run test` 55/55 files, 727/727 tests passed)
- **Open Warnings / Deferred Items:** None

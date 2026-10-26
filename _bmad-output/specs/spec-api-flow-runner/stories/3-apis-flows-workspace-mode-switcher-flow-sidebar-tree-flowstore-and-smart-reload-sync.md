---
title: '[ APIs | Flows ] Workspace Mode Switcher, Flow Sidebar Tree, flowStore & Smart Reload Sync'
status: 'done'
story_id: '3'
parent_spec: '_bmad-output/specs/spec-api-flow-runner/SPEC.md'
context:
  - '_bmad-output/specs/spec-api-flow-runner/SPEC.md'
  - '_bmad-output/specs/spec-api-flow-runner/flow-architecture-and-schema.md'
  - '_bmad-output/specs/spec-api-flow-runner/stories.yaml'
  - 'projects/app.go'
  - 'projects/model/types.go'
  - 'projects/frontend/wailsjs/go/main/App.js'
  - 'projects/frontend/wailsjs/go/main/App.d.ts'
  - 'projects/frontend/wailsjs/go/models.ts'
  - 'projects/frontend/src/stores/uiStore.ts'
  - 'projects/frontend/src/stores/collectionStore.ts'
  - 'projects/frontend/src/App.vue'
  - 'projects/frontend/src/components/AppSidebar.vue'
  - 'projects/frontend/src/components/TreeNodeRow.vue'
  - 'projects/frontend/src/components/TreeContextMenu.vue'
  - 'projects/frontend/src/components/GitConflictResolverModal.vue'
  - 'projects/frontend/src/stores/__tests__/collectionStore.test.ts'
  - 'projects/frontend/src/components/__tests__/AppSidebar.test.ts'
  - 'projects/frontend/src/components/__tests__/GitConflictResolverModal.spec.ts'
---

## Why

Hecto API necesita chuyển đổi liền mạch giữa hai chế độ làm việc **`[ APIs | Flows ]`** ngay trên thanh bên (AppSidebar) mà vẫn giữ nguyên cấu trúc giao diện 2 cột quen thuộc (CAP-4). Ở chế độ `Flows`, người dùng cần cây thư mục `Flow Folder` / `Flow` hỗ trợ đầy đủ tìm kiếm lọc nhanh, kéo-thả sắp xếp/di chuyển, đổi tên tại chỗ, menu ngữ cảnh chuột phải và chấm báo hiệu khi có thay đổi từ CLI/Git qua `fsnotify` / `Smart Reload` (`Ctrl+R` / `F5`), đồng thời hiển thị nhãn thực thể chuẩn trong `GitConflictResolverModal.vue` (CAP-4, CAP-1).

## What Changes

1. **Wails Frontend Bindings (`projects/frontend/wailsjs/go/main/App.js`, `App.d.ts`, `models.ts`)**:
   - Đảm bảo `projects/frontend/wailsjs/go/main/App.js` và `App.d.ts` xuất đầy đủ 13 hàm Wails của FlowService đã khai báo trong `projects/app.go`: `GetFlowTree`, `GetFlow`, `CreateFlow`, `SaveFlow`, `RenameFlow`, `DeleteFlow`, `DuplicateFlow`, `CreateFlowFolder`, `RenameFlowFolder`, `DeleteFlowFolder`, `ReorderFlowNodes`, `MoveFlowNode`, `SortFlowNodes`, `ExportFlowTypes`.
   - Đảm bảo `projects/frontend/wailsjs/go/models.ts` có đầy đủ các lớp/interface `FlowBranchCondition`, `FlowBranch`, `FlowStep`, `FlowNode`, `Flow`, `FlowFolder`, `FlowTreeNode`.

2. **Store `uiStore.ts` (`projects/frontend/src/stores/uiStore.ts`)**:
   - Bổ sung state `workspaceMode = ref<'apis' | 'flows'>('apis')` và action `setWorkspaceMode(mode: 'apis' | 'flows')` (đóng contextMenu nếu đang mở khi chuyển mode).
   - Mở rộng `contextMenu` hoặc hỗ trợ `nodeType: 'folder' | 'request' | 'flow_folder' | 'flow'` để menu chuột phải hoạt động chính xác cho cả cây APIs và cây Flows.

3. **Store `flowStore.ts` (`projects/frontend/src/stores/flowStore.ts`)**:
   - Tạo Pinia store `useFlowStore` (`defineStore('flow', ...)`):
     - State:
       - `flowTree: FlowTreeNode[]`
       - `expandedFlowFolders: Set<string>`
       - `activeFlowId: string | null`
       - `currentFlow: model.Flow | null`
       - `savedSnapshot: string | null`
       - `loading: boolean`
       - `error: string | null`
       - `draggingNode: { id: string; type: 'flow_folder' | 'flow' } | null`
       - `sortDirectionMap: Record<string, 'asc' | 'desc'>`
       - State phục vụ chạy Flow (chuẩn bị cho Story 4): `isRunning: boolean`, `stepStates: Record<string, any>`, `selectedStepId: string | null`, `lastRunSummary: any | null`.
     - Getter:
       - `isDirty`: so sánh `JSON.stringify(currentFlow)` với `savedSnapshot` (trả về `false` nếu `!currentFlow || !savedSnapshot`).
     - Actions:
       - `loadFlowTree()`: gọi `GetFlowTree()`, cập nhật `flowTree`.
       - `selectFlow(id: string, opts?: { force?: boolean })`: nếu `currentFlow` đang `isDirty` và khác `id` (và `!opts?.force`), hỏi `uiStore.requestUnsavedPrompt(...)` (`save` -> `saveCurrentFlow()`, `cancel` -> dừng, `discard` -> tiếp tục). Sau đó gọi `GetFlow(id)` và nạp `currentFlow`, `activeFlowId = id`, `savedSnapshot = JSON.stringify(currentFlow)`.
       - `clearCurrentFlow()`: xóa `activeFlowId = null`, `currentFlow = null`, `savedSnapshot = null`, `selectedStepId = null`.
       - `createFlow(folderId = '', name = 'New Flow')`: gọi `CreateFlow(folderId, name)`, nếu có `folderId` thì thêm vào `expandedFlowFolders`, tải lại `loadFlowTree()`, tự động chọn Flow vừa tạo (`selectFlow(created.id, { force: true })`) và kích hoạt `uiStore.triggerRename(created.id)`.
       - `saveCurrentFlow()`: gọi `SaveFlow(currentFlow)`, cập nhật `savedSnapshot = JSON.stringify(currentFlow)`, tải lại `loadFlowTree()` và hiện toast `'Đã lưu Flow'`.
       - `renameFlow(id: string, newName: string)`: gọi `RenameFlow(id, newName)`, nếu `currentFlow?.id === id` thì cập nhật `currentFlow.name = newName` (và cập nhật `savedSnapshot` nếu trước đó không dirty), tải lại `loadFlowTree()`.
       - `deleteFlow(id: string)`: gọi `DeleteFlow(id)`, nếu `activeFlowId === id` thì `clearCurrentFlow()`, tải lại `loadFlowTree()`.
       - `duplicateFlow(id: string)`: gọi `DuplicateFlow(id)`, tải lại `loadFlowTree()`, chọn bản sao vừa tạo.
       - `createFlowFolder(parentId = '', name = 'New Folder')`: gọi `CreateFlowFolder(parentId, name)`, mở rộng `parentId` nếu có, tải lại `loadFlowTree()`, kích hoạt `uiStore.triggerRename(created.id)`.
       - `renameFlowFolder(id: string, newName: string)`: gọi `RenameFlowFolder(id, newName)`, tải lại `loadFlowTree()`.
       - `deleteFlowFolder(id: string)`: gọi `DeleteFlowFolder(id)`, xóa `id` khỏi `expandedFlowFolders`, tải lại `loadFlowTree()`; nếu `activeFlowId` không còn tồn tại trong cây mới thì `clearCurrentFlow()`.
       - `toggleFlowFolder(id: string)`: bật/tắt `id` trong `expandedFlowFolders`.
       - `moveFlowNode(nodeId: string, nodeType: 'flow' | 'flow_folder', targetFolderId: string)`: gọi `MoveFlowNode(nodeId, nodeType === 'flow_folder' ? 'folder' : 'flow', targetFolderId)`, tải lại `loadFlowTree()`.
       - `reorderFlowNodes(parentId: string, orderedIds: string[])` và `reorderNodePosition(dragId, dragType, targetId, position: 'before' | 'after' | 'inside')` cùng các hàm kiểm tra `canMoveNodeTo`, `canReorderNode`, `isDescendantFolder`, `findNode` tương đương `collectionStore`.
       - `sortFlowNodes(parentId = '')`: đảo chiều `'asc' | 'desc'` trong `sortDirectionMap[parentId]`, gọi `SortFlowNodes(parentId, direction)`, tải lại `loadFlowTree()`.

4. **Thanh chuyển đổi `[ APIs | Flows ]` và Cây Flow trên `AppSidebar.vue` (`projects/frontend/src/components/AppSidebar.vue`, `TreeNodeRow.vue`, `TreeContextMenu.vue`)**:
   - Đặt thanh chuyển đổi chế độ `[ APIs | Flows ]` ở đầu `AppSidebar.vue` với 2 nút có `data-test="workspace-mode-apis"` và `data-test="workspace-mode-flows"`.
   - Khi `uiStore.workspaceMode === 'apis'`: giữ nguyên 100% hành vi hiện tại của cây APIs.
   - Khi `uiStore.workspaceMode === 'flows'`:
     - Ô tìm kiếm lọc cây Flow (`data-test="tree-filter-input"`, placeholder `"Tìm kiếm flow..."`), tự động mở rộng các `FlowFolder` chứa kết quả khớp và khôi phục khi xóa từ khóa.
     - Nút `sidebar-reload-btn` gọi `collectionStore.smartReload()` kèm chấm `external-change-badge` khi `collectionStore.hasExternalChanges === true`.
     - Nút `tree-collapse-all-btn` thu gọn toàn bộ `flowStore.expandedFlowFolders`.
     - Nút `tree-sort-alphabet-btn` gọi `flowStore.sortFlowNodes('')`.
     - Nút `+` (`sidebar-add-btn`) mở menu gồm `New Flow` (`data-test="add-flow-item"`) và `New Flow Folder` (`data-test="add-flow-folder-item"`).
     - Hiển thị cây `flowStore.flowTree` (có thể tạo `FlowTreeNodeRow.vue` hoặc mở rộng `TreeNodeRow.vue` + `TreeContextMenu.vue`) hỗ trợ:
       - Click vào `flow_folder` để đóng/mở; click vào `flow` để gọi `flowStore.selectFlow(node.id)`.
       - Biểu tượng luồng (`🔀` hoặc SVG icon) cho `flow` và icon thư mục cho `flow_folder`, kèm chấm `tree-row-unsaved-dot` màu hổ phách khi `flowStore.activeFlowId === node.id && flowStore.isDirty`.
       - Đổi tên tại chỗ (F2 / double-click / context menu "Đổi tên"), xóa (Delete / context menu "Xóa" có `requestConfirm`), sao chép Flow (Ctrl+D / context menu "Sao chép"), sắp xếp thư mục A-Z (`folder-sort-btn` / context menu "Sắp xếp A-Z"), di chuyển tới thư mục khác (context menu "Di chuyển tới"), và kéo-thả sắp xếp (`before`, `after`, `inside`, hoặc thả vào root drop zone).
       - Khi `flowStore.flowTree.length === 0`, hiển thị trạng thái trống kèm nút `"Tạo flow mới"` gọi `flowStore.createFlow()`.

5. **Đồng bộ `collectionStore.ts`, `App.vue`, và `GitConflictResolverModal.vue`**:
   - Trong `projects/frontend/src/stores/collectionStore.ts`:
     - `smartReload()`: nạp song song `flowStore.loadFlowTree()` trong `Promise.all(...)`. Dọn các folder ID đã bị xóa khỏi `flowStore.expandedFlowFolders`. Nếu `flowStore.activeFlowId` không còn tồn tại trong `flowStore.flowTree`, gọi `flowStore.clearCurrentFlow()` (nếu trước đó `flowStore.isDirty` thì hiện toast `'Mục đang chỉnh sửa đã bị xóa khỏi đĩa.'`). Nếu `flowStore.activeFlowId` vẫn tồn tại: khi `!flowStore.isDirty` thì tự động gọi `await flowStore.selectFlow(flowStore.activeFlowId, { force: true })` để tải lại bản mới nhất từ đĩa; khi `flowStore.isDirty === true` thì giữ nguyên `flowStore.currentFlow` trên RAM và hiện toast `'Dữ liệu trên đĩa đã thay đổi, nhưng Flow hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'`.
     - `switchCollection()`: trước khi chuyển collection (khi `!opts?.force && flowStore.isDirty`), hỏi `uiStore.requestUnsavedPrompt('Flow hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển collection?')` (`cancel` -> return `false`, `save` -> `await flowStore.saveCurrentFlow()`, `discard` -> tiếp tục). Sau khi `SwitchCollection` thành công, gọi `flowStore.clearCurrentFlow()`, `flowStore.expandedFlowFolders.clear()`, và nạp `flowStore.loadFlowTree()` trong `Promise.all(...)`.
     - `refresh()` và `deleteCollection()` (khi xóa active collection): cũng xóa trạng thái `flowStore` và gọi `flowStore.loadFlowTree()`.
   - Trong `projects/frontend/src/App.vue`:
     - `onMounted`: nạp song song `flowStore.loadFlowTree()` trong `Promise.all(...)`.
     - `handleKeyDown`:
       - `Ctrl+S` / `Cmd+S`: nếu `uiStore.workspaceMode === 'flows'` thì khi `flowStore.currentFlow` tồn tại gọi `void flowStore.saveCurrentFlow()`; ngược lại ở chế độ `'apis'` giữ nguyên `requestStore.saveCurrent()`.
       - `Ctrl+N` / `Ctrl+Shift+N`: nếu `uiStore.workspaceMode === 'flows'` thì `Ctrl+Shift+N` gọi `flowStore.createFlowFolder()` và `Ctrl+N` gọi `flowStore.createFlow()`; ngược lại ở chế độ `'apis'` giữ nguyên.
   - Trong `projects/frontend/src/components/GitConflictResolverModal.vue`:
     - Cập nhật `entityTypeBadge(entityType: string)` bổ sung:
       - `case 'flow'`: `{ label: 'Flow', classes: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' }`
       - `case 'flow_folder'`: `{ label: 'Flow Folder', classes: 'bg-teal-500/20 text-teal-300 border-teal-500/40' }`

6. **Kiểm thử tự động (Vitest)**:
   - Tạo `projects/frontend/src/stores/__tests__/flowStore.test.ts`: kiểm thử đầy đủ `loadFlowTree`, `selectFlow` (bao gồm cả prompt khi dirty), `createFlow`, `saveCurrentFlow`, `renameFlow`, `deleteFlow`, `duplicateFlow`, `createFlowFolder`, `renameFlowFolder`, `deleteFlowFolder`, `moveFlowNode`, `reorderFlowNodes` / `reorderNodePosition`, `sortFlowNodes`, và `isDirty`.
   - Cập nhật `projects/frontend/src/components/__tests__/AppSidebar.test.ts`: kiểm thử nút chuyển đổi `[ APIs | Flows ]` (`workspace-mode-apis`, `workspace-mode-flows`), hiển thị cây Flow, tìm kiếm lọc cây Flow, thêm mới Flow / Flow Folder, thu gọn, sắp xếp A-Z.
   - Cập nhật `projects/frontend/src/stores/__tests__/collectionStore.test.ts` (và/hoặc `flowStore.test.ts`): kiểm thử `smartReload()` đồng bộ `flowStore.loadFlowTree()`, tự động tải lại `currentFlow` khi `!isDirty`, và bảo vệ `currentFlow` kèm hiện toast khi `flowStore.isDirty === true`.
   - Cập nhật `projects/frontend/src/components/__tests__/GitConflictResolverModal.spec.ts`: kiểm thử hiển thị badge `'Flow'` và `'Flow Folder'` cho `entity_type: 'flow'` và `'flow_folder'`.

## Verification

- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` pass 100%.

## Review Triage Log

### Iteration 1 — 2026-10-25 — Layers: intent-alignment, blind-hunter, edge-case-hunter, verification-gap
- **Patched (`projects/frontend/src/stores/flowStore.ts`):**
  - Guarded `selectFlow` against re-clicking the already-active flow when `!opts?.force` so unsaved edits are preserved, added `selectFlowSeq` concurrency protection, and reset execution state fields (`isRunning`, `abortRequested`, `nodeStates`, `branchStates`, `stepStates`, `stepResults`, `lastRunSummary`) on flow switch/clear.
  - Updated `duplicateFlow` to prompt when another flow is dirty before switching to the duplicated flow, updated `deleteFlowFolder` to check `activeInside` before tree reload, and updated `sortFlowNodes` to verify `reorderFlowNodes` success before setting `sortDirectionMap` or showing `'Đã sắp xếp Z-A'`.
- **Patched (`projects/frontend/src/stores/collectionStore.ts`):**
  - Guarded `smartReload` flow tree walking/clearing with `if (!flowStore.error)` so tree load failures do not wipe dirty active flows.
  - Integrated `flowStore` flushing into `flushDirtyBeforeGitSync` and `flowStore` reloading into `gitPull`, `gitCheckout`, `gitClearAndPull`, `gitStashAndPull`, `gitPush`, `resolveGitConflicts`, and `abortGitMerge`.
- **Patched (`TreeNodeRow.vue`, `TreeContextMenu.vue`, `AppSidebar.vue`, `App.vue`):**
  - Fixed `effectiveRawName` empty-string handling and inline rename/delete name resolution in `TreeNodeRow.vue`; excluded current parent folder from move targets and guarded `handleMove` with `canMoveNodeTo` in `TreeContextMenu.vue`; preserved pre-filter expanded folders across filter changes and `collapseAll()` in `AppSidebar.vue`; gated API-only shortcuts (`Ctrl+W`, `Ctrl+L`, `Ctrl+Enter`) to `apis` mode and enabled `Cmd+N`/`Cmd+Shift+N` in `App.vue`.
- **Patched Tests:**
  - Expanded `flowStore.test.ts`, `treeFilter.test.ts`, `TreeNodeRow.test.ts`, `AppSidebar.test.ts`, `AppTabBar.test.ts`, `collectionStore.test.ts`, and `GitConflictResolverModal.spec.ts` (702/702 tests passing).

## Auto Run Result

- **Result**: `completed`
- **What changed**: Regenerated Wails Flow bindings, added `workspaceMode` to `uiStore.ts`, created `flowStore.ts`, updated `AppSidebar.vue`, `TreeNodeRow.vue`, `TreeContextMenu.vue`, `treeFilter.ts`, `collectionStore.ts`, `App.vue`, and `GitConflictResolverModal.vue`, and added comprehensive unit/component tests.
- **Disposition counts**: 12 patched, 0 deferred, 0 warnings, 0 dismissed.
- **Next**: Proceed to Story 4 (`4-orthogonal-2-axis-structured-flowchart-ui-live-execution-searchable-request-picker-and-step-inspector-panel.md`).


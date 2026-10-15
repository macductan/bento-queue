---
title: 'Folder Sidebar Click Toggle-Only Behavior'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '80dd7ce74cedfcf7fbe3defd3696c598b29eaa54'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-multisession-tabs-and-folder-ux/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-multisession-tabs-and-folder-ux/multisession-tabs-and-folder-architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại khi người dùng click chuột trái (hoặc nhấn phím `Enter`) vào một hàng thư mục trong `TreeNodeRow.vue` trên Sidebar để mở rộng hoặc thu gọn danh sách con, hàm `toggle()` đồng thời gọi `store.selectFolder(props.node.id)`, khiến màn hình chính tự động chuyển sang `FolderEditor` và làm gián đoạn Request đang làm việc (CAP-2).

**Approach:** Cập nhật hàm `toggle()` trong `TreeNodeRow.vue` để khi `isFolder === true` chỉ gọi duy nhất `store.toggleFolder(props.node.id)` (không gọi `store.selectFolder`), đồng thời đảm bảo `isActive` của hàng thư mục chỉ sáng khi `store.activeFolderId === props.node.id && !store.activeRequestId`. Giao diện `FolderEditor` chỉ được mở khi người dùng chủ động chọn `"Cài đặt thư mục"` từ Context Menu (`TreeContextMenu.vue`) của thư mục đó.

## Boundaries & Constraints

**Always:**
- Click chuột trái hoặc nhấn phím `Enter` vào hàng thư mục (`isFolder === true`) trên Sidebar chỉ gọi `store.toggleFolder(props.node.id)` để đóng/mở nhánh cây con mà không thay đổi `store.activeFolderId` hay `store.activeRequestId`.
- Giữ nguyên hành vi chọn Request (`store.selectRequest(props.node.id)`) khi click chuột trái hoặc nhấn `Enter` vào hàng Request (`isFolder === false`).
- Giữ nguyên hành vi mở `FolderEditor` qua mục `"Cài đặt thư mục"` (`handleFolderSettings`) trong `TreeContextMenu.vue` bằng lời gọi `collectionStore.setActiveFolderId(nodeId)`.
- Mọi kiểm thử tự động chỉ thao tác trên `Test-Collection` hoặc dữ liệu mock/tạm thời, tuyệt đối không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không gọi `store.selectFolder` hoặc `store.setActiveFolderId` bên trong hàm `toggle()` của `TreeNodeRow.vue`.
- Không làm mất trạng thái `activeRequestId` hiện tại khi người dùng đóng/mở thư mục trên Sidebar.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Click chuột trái vào thư mục trên Sidebar khi đang mở một Request | `activeRequestId = 'req-1'`, `activeFolderId = null`, click vào hàng thư mục `folder-auth` | `store.toggleFolder('folder-auth')` được gọi để mở rộng/thu gọn nhánh con; `store.selectFolder` và `store.setActiveFolderId` KHÔNG được gọi; `activeRequestId` vẫn giữ nguyên `'req-1'` | Không phát sinh lỗi |
| Nhấn phím `Enter` khi focus vào hàng thư mục trên Sidebar | Focus vào hàng thư mục `folder-auth` (không ở chế độ `isEditing`), nhấn `Enter` | `store.toggleFolder('folder-auth')` được gọi; không kích hoạt `activeFolderId` | Không phát sinh lỗi |
| Chọn `"Cài đặt thư mục"` từ Context Menu (`TreeContextMenu.vue`) trên một thư mục | Mở context menu của thư mục `folder-auth` (`nodeType === 'folder'`, `nodeId === 'folder-auth'`), click nút `"Cài đặt thư mục"` | `collectionStore.setActiveFolderId('folder-auth')` được gọi, `activeFolderId` trở thành `'folder-auth'`, `activeRequestId` là `null`, context menu đóng lại | Không phát sinh lỗi |
| Hiển thị trạng thái active (`data-active="true"`) trên hàng thư mục | `store.activeFolderId === 'folder-auth'` và `store.activeRequestId === null` | Hàng thư mục `folder-auth` có `data-active="true"` và class `border-brand-primary`; nếu `store.activeRequestId` khác `null` thì hàng thư mục không active | Không phát sinh lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/components/TreeNodeRow.vue` -- Component hiển thị từng hàng Folder/Request trên Sidebar; cần sửa `isActive` (lines 25-30) và `toggle()` (lines 32-40) để click/Enter vào Folder chỉ gọi `store.toggleFolder(props.node.id)`.
- `projects/frontend/src/components/TreeContextMenu.vue` -- Component hiển thị Context Menu cho Folder/Request; hàm `handleFolderSettings` (lines 66-71) gọi `collectionStore.setActiveFolderId(uiStore.contextMenu.nodeId)` để mở `FolderEditor`.
- `projects/frontend/src/stores/collectionStore.ts` -- Store quản lý cây Collection; cập nhật guard trong `setActiveFolderId` (`if (this.activeFolderId === id && !this.activeRequestId) return`) để luôn cho phép chuyển lại sang `FolderEditor` nếu `activeRequestId` khác `null`.
- `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` -- Unit test cho `TreeNodeRow.vue` và tương tác mở cài đặt thư mục qua `TreeContextMenu.vue`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/components/TreeNodeRow.vue` -- Trong hàm `toggle()`, xóa lời gọi `void store.selectFolder(props.node.id)` khi `isFolder.value === true` để chỉ gọi `store.toggleFolder(props.node.id)`; cập nhật `isActive` của folder thành `store.activeFolderId === props.node.id && !store.activeRequestId` -- Đảm bảo click chuột trái hoặc nhấn `Enter` vào thư mục chỉ đóng/mở nhánh cây mà không mở `FolderEditor` (CAP-2).
- [x] `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` -- Cập nhật và bổ sung unit tests xác minh click chuột trái và nhấn phím `Enter` vào hàng thư mục chỉ gọi `toggleFolder` (không gọi `selectFolder` / `setActiveFolderId` và giữ nguyên `activeRequestId` đang mở), đồng thời xác minh chọn `"Cài đặt thư mục"` trên `TreeContextMenu.vue` gọi `setActiveFolderId` và kích hoạt trạng thái active của thư mục -- Xác minh đầy đủ CAP-2 và các trường hợp trong I/O Matrix.

**Acceptance Criteria:**
- Given người dùng đang mở một Request (`activeRequestId !== null`) hoặc đang ở màn hình trống, when người dùng click chuột trái hoặc nhấn phím `Enter` vào một hàng thư mục trong `TreeNodeRow.vue`, then chỉ có `collectionStore.toggleFolder(node.id)` được gọi để mở rộng/thu gọn nhánh con và `activeFolderId` không bị kích hoạt.
- Given người dùng mở Context Menu trên một thư mục trong Sidebar (`TreeContextMenu.vue`), when người dùng click chọn `"Cài đặt thư mục"`, then `collectionStore.setActiveFolderId(nodeId)` được gọi để mở `FolderEditor` cho thư mục đó và hàng thư mục hiển thị trạng thái active (`data-active="true"`).

## Spec Change Log

## Review Triage Log

### Round 1 — 2026-10-14

| # | Layer | Severity | Disposition | Location | Summary |
|---|-------|----------|-------------|----------|---------|
| 1 | blind-hunter | medium | patch | `projects/frontend/src/stores/collectionStore.ts:335` | Sửa guard đầu hàm `setActiveFolderId` thành `if (this.activeFolderId === id && !this.activeRequestId) return` để cho phép mở lại `FolderEditor` nếu `activeRequestId` đang khác `null`. |
| 2 | blind-hunter | low | patch | `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` | Bổ sung test xác minh click nút `...` (`aria-label="Tùy chọn"`) trên hàng thư mục mở context menu mà không gọi `toggleFolder` hoặc `selectFolder`. |
| 3 | blind-hunter | low | patch | `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` | Bổ sung test cho phép chọn Request và nhấn `Enter` trên hàng Request trong `TreeNodeRow.test.ts`. |
| 4 | blind-hunter | low | patch | `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` | Bổ sung kiểm tra `wrapper.findAllComponents(TreeNodeRow)` sau khi đóng/mở nhánh thư mục. |
| 5 | blind-hunter | low | reject | `projects/frontend/src/components/TreeNodeRow.vue:76` | Bổ sung `aria-expanded` không nằm trong phạm vi CAP-2 hay I/O Matrix của Story 2. |

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0, không có lỗi TypeScript.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: exit code 0, 100% test suites và unit tests vượt qua.
- `cd projects && go test ./...` -- expected: exit code 0, 100% Go backend tests vượt qua.

## Auto Run Result

- **Outcome**: done
- **Summary**: Hoàn thành Story 2 (CAP-2): Sửa `TreeNodeRow.vue` để click chuột trái hoặc nhấn phím `Enter` vào thư mục trên Sidebar chỉ gọi `store.toggleFolder(props.node.id)` (không gọi `selectFolder`), cập nhật `isActive` của folder và guard trong `collectionStore.setActiveFolderId`, bổ sung bộ unit tests đầy đủ trong `TreeNodeRow.test.ts`. Tất cả 32 test files (421 tests), `type-check`, và `go test ./...` đều pass 100%.
- **Followup review recommended**: false
- **Warnings**: none
- **Deferred items**: none
- **Next action**: Chuyển sang triển khai Story 3 (`/bmad-build-auto _bmad-output/specs/spec-multisession-tabs-and-folder-ux 3`).


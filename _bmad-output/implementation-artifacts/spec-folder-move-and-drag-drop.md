---
title: 'Di chuyển Folder và Kéo thả (Drag & Drop) trong Sidebar Collection Tree'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: 'ee6033eebe4b3835fe14d1692aba44f32389fb81'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-folder-move-and-drag-drop/SPEC.md'
  - '_bmad-output/specs/spec-folder-move-and-drag-drop/folder-move-and-dnd-architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại người dùng chỉ có thể di chuyển từng Request riêng lẻ qua Context Menu, chưa thể di chuyển cả Folder (cùng cây con và request bên trong) sang vị trí khác hoặc kéo thả trực quan trên Sidebar Collection Tree.

**Approach:** Bổ sung phương thức `MoveFolder` ở Backend Go cùng cập nhật index tiền tố UUID path và cycle detection; tích hợp action `moveFolder`, state DnD và kiểm tra hợp lệ trong Pinia `collectionStore`; bổ sung submenu "Di chuyển tới ▸" cho Folder trong `TreeContextMenu.vue`; triển khai HTML5 Drag & Drop trên `TreeNodeRow.vue` và vùng thả gốc trên `AppSidebar.vue`.

## Boundaries & Constraints

**Always:**
- Lưu trữ hoàn toàn dựa trên hệ thống tệp tin JSON/thư mục; bảo toàn nguyên vẹn `_folder.json`, các thư mục con và các file request `.json` bên trong khi di chuyển.
- Bắt buộc chặn chu trình (cycle detection): không cho phép di chuyển folder vào chính nó hoặc vào bất kỳ thư mục con/cháu nào của nó ở cả Backend và UI.
- Chặn di chuyển vào thư mục hệ thống (`environments/`, `.git/`, `.history/`) hoặc ra ngoài collection root.
- Wails binding `MoveFolder` trả về `model.Result` đồng nhất với kiến trúc của dự án.
- Tắt `draggable` trên `TreeNodeRow.vue` khi đang inline rename (`isEditing === true`).
- Tuân thủ quy tắc tooling: dùng `bun` với Node 24 (`nvm use`) cho frontend, `go test ./...` cho backend.

**Never:**
- Không hỗ trợ sắp xếp thứ tự tùy ý giữa các phần tử cùng cấp (vẫn duy trì thứ tự sắp xếp mặc định: Folder trước Request, theo bảng chữ cái).
- Không hỗ trợ kéo thả xuyên Collection hoặc multi-select kéo thả.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Di chuyển folder vào folder khác | `rootPath`, `id="f1"`, `targetFolderID="f2"` | Thư mục `f1` và toàn bộ nội dung chuyển vào trong `f2`, index cập nhật prefix | Không có lỗi (`Success: true`) |
| Di chuyển folder lồng sâu về gốc | `rootPath`, `id="f2"`, `targetFolderID=""` | Thư mục `f2` chuyển về `rootPath`, index cập nhật prefix | Không có lỗi (`Success: true`) |
| Di chuyển vào chính nó | `id == targetFolderID` | Bị từ chối | `ErrValidation`, `ErrFolderMoveCycle` |
| Di chuyển cha vào con/cháu | `id="f1"`, `targetFolderID="f1_sub"` | Bị từ chối qua kiểm tra `filepath.Rel` | `ErrValidation`, `ErrFolderMoveCycle` |
| Di chuyển vào chính parent hiện tại | `filepath.Dir(srcPath) == targetDir` | No-op thành công | `model.NewSuccess(nil)` |
| Trùng tên hiển thị tại đích | Thư mục đích đã có folder cùng display name | Tự động thêm hậu tố `"<Name> (2)"` và cập nhật `_folder.json` | Không có lỗi |
| Trùng đường dẫn vật lý | `targetDir/<dirname>` đã tồn tại | Thử fallback UUID directory `slug.FolderDir(id)`, nếu vẫn trùng báo lỗi | `ErrValidation`, `ErrFolderMoveConflict` |
| Di chuyển vào `environments` | `targetDir` nằm trong `environments/` | Bị từ chối | `ErrValidation`, `ErrMoveFolderToEnvFailed` |
| Kéo thả folder vào chính nó trên UI | Drag folder `F1` hover vào `F1` | UI không cho phép drop, không gọi API | Highlight invalid hoặc dropEffect none |
| Kéo thả ra khoảng trống Sidebar | Drag node trong folder con thả vào `AppSidebar` | Di chuyển node về gốc collection | Gọi `moveFolder(id, '')` hoặc `moveRequest(id, '')` |

</intent-contract>

## Code Map

- `projects/service/errors.go` -- Bổ sung các hằng số thông báo lỗi tiếng Việt cho `MoveFolder` (`ErrFolderNotInRoot`, `ErrFolderMoveCycle`, `ErrMoveFolderToEnvFailed`, `ErrFolderMoveConflict`, `ErrFolderMoveFailed`).
- `projects/storage/filesystem.go` -- Thêm phương thức `IndexUpdatePrefix(oldPrefix, newPrefix string)` để cập nhật đường dẫn các UUID có tiền tố `oldPrefix`.
- `projects/service/collection.go` -- Thêm phương thức `MoveFolder(rootPath, id, targetFolderID string) model.Result` xử lý xác thực, cycle detection, collision handling, di chuyển vật lý và cập nhật index.
- `projects/app.go` -- Thêm method Wails binding `MoveFolder(folderID, targetFolderID string) model.Result` kèm ghi changelog.
- `projects/frontend/wailsjs/go/main/App.d.ts` & `App.js` -- Khai báo và export binding `MoveFolder`.
- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung state `draggingNode`, helpers `setDraggingNode`, `isDescendantFolder`, `findParentFolderId`, `canMoveNodeTo`, và action `moveFolder(id, targetFolderId)`.
- `projects/frontend/src/components/TreeContextMenu.vue` -- Bổ sung submenu "Di chuyển tới ▸" cho Folder, lọc bỏ chính folder và con/cháu qua `isDescendantFolder`.
- `projects/frontend/src/components/TreeNodeRow.vue` -- Tích hợp HTML5 Drag & Drop (`draggable`, `@dragstart`, `@dragend`, `@dragover`, `@drop`), kiểm tra tính hợp lệ qua `canMoveNodeTo`, hiển thị highlight `data-drop-target="valid"`.
- `projects/frontend/src/components/AppSidebar.vue` -- Tích hợp vùng drop zone về gốc collection (`data-test="tree-root-drop-zone"` / `data-root-drop-active`), xử lý `@dragover`, `@dragleave`, `@drop` đưa về Gốc Collection (`targetFolderId = ''`).
- `projects/service/collection_test.go` -- Unit tests cho `MoveFolder` (root move, nested move, cycle check, index update, collision, environments rejection).
- `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` & `AppSidebar.test.ts` -- Unit tests Vitest kiểm thử tương tác DnD và context menu.

## Tasks & Acceptance

**Execution:**
- `projects/service/errors.go` -- Thêm error constants -- Khai báo mã lỗi tiếng Việt cho MoveFolder.
- `projects/storage/filesystem.go` -- Thêm `IndexUpdatePrefix` -- Cập nhật bộ nhớ đệm UUID path khi thư mục đổi vị trí.
- `projects/service/collection.go` -- Thêm `MoveFolder` -- Hiện thực nghiệp vụ di chuyển folder, cycle detection và collision handling.
- `projects/app.go` -- Thêm Wails binding `MoveFolder` -- Cung cấp API cho Frontend gọi xuống Backend.
- `projects/frontend/wailsjs/go/main/App.d.ts` & `App.js` -- Cập nhật bindings -- Khai báo kiểu cho TypeScript.
- `projects/frontend/src/stores/collectionStore.ts` -- Thêm action `moveFolder` và helpers DnD -- Quản lý trạng thái kéo thả và điều phối cập nhật cây thư mục.
- `projects/frontend/src/components/TreeContextMenu.vue` -- Thêm submenu "Di chuyển tới ▸" cho folder -- Cho phép di chuyển bằng chuột phải.
- `projects/frontend/src/components/TreeNodeRow.vue` -- Thêm Drag & Drop cho row -- Kéo thả trực tiếp request và folder vào folder đích.
- `projects/frontend/src/components/AppSidebar.vue` -- Thêm Root drop zone -- Kéo thả đưa về Gốc Collection.
- `projects/service/collection_test.go` -- Unit test Go -- Kiểm thử mọi kịch bản và điều kiện biên của `MoveFolder`.
- `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` -- Unit test Vitest -- Kiểm thử kéo thả và context menu.

**Acceptance Criteria:**
- Given một folder chứa request và subfolder, when di chuyển sang folder khác hoặc về gốc, then toàn bộ thư mục và file con được chuyển, index cập nhật và tìm thấy các UUID con ở đường dẫn mới.
- Given một folder cha, when người dùng cố di chuyển nó vào chính nó hoặc vào thư mục con của nó, then hệ thống trả về `ErrValidation` (`ErrFolderMoveCycle`) và không di chuyển file nào.
- Given context menu của một folder, when mở menu chuột phải, then hiển thị mục "Di chuyển tới ▸" với lựa chọn "Gốc collection" và danh sách các folder hợp lệ (không chứa chính nó hay các con cháu).
- Given một request hoặc folder đang được kéo, when rê chuột qua một folder hợp lệ, then folder đó highlight `data-drop-target="valid"`; khi thả chuột, gọi `moveFolder` hoặc `moveRequest` và tự động mở rộng folder đích.
- Given một node nằm trong folder con đang được kéo, when thả vào vùng trống của sidebar, then node đó được di chuyển về Gốc Collection.

## Spec Change Log

_None._

## Review Triage Log

- **Backend (`projects/service/collection.go` & `projects/service/collection_test.go`):**
  - **Whitespace Target ID:** Áp dụng `strings.TrimSpace(targetFolderID)` đảm bảo target ID chỉ chứa khoảng trắng được xử lý tương đương đưa về collection root (`""`).
  - **Kiểm tra biên environments:** Điều chỉnh điều kiện kiểm tra đường dẫn `environments` thành `targetDir == envDir || strings.HasPrefix(targetDir, envDir+string(filepath.Separator))` để tránh chặn nhầm các thư mục hợp lệ có tên bắt đầu bằng `environments_` (như `environments_prod`).
  - **Giới hạn 255 runes khi trùng tên:** Cắt bớt baseName tính theo độ dài rune khi thêm suffix ` (2)` để không vượt quá giới hạn 255 runes.
  - **Kết quả trả về:** Trả về `model.NewSuccess(srcFolder)` mang tên hiển thị mới (nếu có điều chỉnh) thay vì `nil`.
  - **Kiểm thử va chạm vật lý:** Bổ sung test kiểm tra fallback thư mục UUID `slug.FolderDir(id)` khi trùng tên vật lý và trả về `ErrFolderMoveConflict` khi cả hai đều đã tồn tại trên đĩa.

- **Frontend (`TreeNodeRow.vue`, `AppSidebar.vue`, `collectionStore.ts`, `wails-mock.ts`):**
  - **Chặn nổi bọt sự kiện kéo thả (Event Bubbling):** Trong `TreeNodeRow.vue`, gọi `e.preventDefault()` và `e.stopPropagation()` vô điều kiện ngay đầu hàm `onDrop` để ngăn sự kiện thả trên node không hợp lệ (hoặc request row) bị nổi bọt lên vùng thả root (`AppSidebar.vue`).
  - **Chặn nổi bọt `dragover` trên Request:** Trong `TreeNodeRow.vue`, gọi `e.stopPropagation()` khi `!isFolder.value` để việc rê chuột qua request không làm nổi bọt kích hoạt highlight vùng drop root.
  - **Watcher dọn dẹp trạng thái Drag:** Bổ sung watcher trên `() => store.draggingNode` trong cả `TreeNodeRow.vue` và `AppSidebar.vue` để tự động reset `isDragging`, `isDragOver`, `isInvalidTarget`, `isRootDragOver` khi thao tác kéo kết thúc/bị hủy.
  - **Chống highlight kép trên Sidebar:** Trong `AppSidebar.vue`, kiểm tra `(e.target as HTMLElement).closest('[data-tree-row]')` để không bật highlight root drop zone khi con trỏ đang nằm trên một hàng cây thư mục.
  - **Guard `currentParentId === null`:** Trong `collectionStore.ts`, kiểm tra `currentParentId === null` trong `canMoveNodeTo` để chặn di chuyển node không tồn tại trong tree.
  - **Wails Mock:** Khai báo mock cho `MoveFolder` trong `projects/frontend/tests/support/wails-mock.ts`.
  - **Unit tests:** Bổ sung unit test Vitest cho kéo thả folder vào folder hợp lệ và kiểm tra hủy kéo thả dọn dẹp drop zone trong `TreeNodeRow.test.ts` & `AppSidebar.test.ts`.

## Verification

**Commands:**
- `go test ./...` -- expected: pass 100%
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: pass 100% không có lỗi kiểu
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: pass 100%

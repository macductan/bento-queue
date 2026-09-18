---
title: 'Story 2.7: Context Menu & Unsaved Changes Detection'
type: 'feature'
created: '2026-10-05'
status: 'review'
baseline_commit: '3c3edd5f4f3f50dab3eb391e866a11c5dd6119ba'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Context menu chỉ có ở row request với "Sao chép"/"Di chuyển tới" (Story 2.6); folder chưa có menu, thiếu "Đổi tên"/"Xóa". Chuyển request khi đang có thay đổi chưa lưu sẽ mất dữ liệu im lặng, không có indicator.

**Approach:** Mở rộng context menu thành menu chung cho tree: folder → "Đổi tên", "Tạo request mới", "Tạo thư mục con", separator, "Xóa"; request → "Đổi tên", "Sao chép", "Di chuyển tới ▸", separator, "Xóa". Chặn mọi lần chuyển request khi `requestStore.isDirty` bằng dialog 3 nút "Lưu"/"Bỏ qua"/"Hủy"; amber dot cạnh tên request trong editor.

## Boundaries & Constraints

**Always:**
- "Đổi tên" kích hoạt inline edit có sẵn của `TreeNodeRow` (cùng hành vi F2). "Xóa" dùng chung luồng confirm của phím Delete.
- "Tạo request mới"/"Tạo thư mục con" tạo **bên trong** folder được chuột phải: binding `CreateRequest(parentFolderId)` / `CreateFolder(parentFolderId)`, `""` = gốc collection (Ctrl+N / Ctrl+Shift+N truyền `""`). Parent phải là folder trong root, có `_folder.json`, không thuộc `environments/` → ngược lại `ErrValidation`; UUID không tồn tại → `ErrNotFound`. Sau khi tạo: `loadTree()` + expand folder cha.
- Guard unsaved nằm tập trung trong `collectionStore.selectRequest`: nếu `id !== activeRequestId` và `isDirty` → hiện dialog "Request '{name}' có thay đổi chưa lưu." (name = `current.name`). "Lưu" → `SaveRequest(current)`; thành công thì chuyển, lỗi thì toast và ở lại. "Bỏ qua" → chuyển (load từ disk). "Hủy", Esc, click backdrop → ở lại.
- Mọi đường chuyển request đều qua guard (click sidebar, chọn bản sao sau Ctrl+D/"Sao chép"). Ngoại lệ: khi request active vừa bị xóa (chính nó hoặc folder chứa nó) → chuyển không hỏi.
- Rename request đang active: chỉ cập nhật `name` trong `original` và `current`, không reload từ disk (giữ edit chưa lưu).
- Amber dot `w-2 h-2 rounded-full bg-amber-500` cạnh `<h1>` tên request trong `RequestEditor` khi `isDirty`.
- Menu đóng bằng Esc, click ngoài, hoặc sau khi chọn mục. Item cao ≥32px, style theo menu hiện có.

**Never:**
- Không nút "..." hover, không xử lý tràn viewport của menu (Story 2.8). Không amber dot ở sidebar.
- Không prompt khi đóng cửa sổ app. Không thêm design token, không thêm test framework frontend.
- Không duplicate/move folder.

**Decisions:**
- Editor vẫn chỉ đọc: implement guard + dialog + amber dot ngay, không thêm ô input; kiểm bằng `vue-tsc` + code review, kiểm thủ công dời sang Epic 3.
- Sửa bug `MoveRequest` (Story 2.6) trong story này: đích là folder thì index trả **đường dẫn thư mục**; kiểm `Exists(dir/_folder.json)` + `isDeletableFolderPath`, dùng thẳng thư mục đó làm `targetDir` (không `filepath.Dir`). Giữ cấu trúc thư mục thật, không chuyển sang flat.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo trong folder | `CreateRequest(authId)` | File `auth/request-moi.json`, folder `auth` mở | N/A |
| Tạo thư mục con | `CreateFolder(authId)` | `auth/thu-muc-moi/_folder.json` | N/A |
| Tạo ở gốc | `CreateRequest("")` | Như hiện tại | N/A |
| Parent sai | parent là request UUID / `environments` | Không tạo gì | `ErrValidation` |
| Parent mất | UUID không tồn tại | Toast, reload tree | `ErrNotFound` |
| Dirty → Lưu | Sửa A, click B, "Lưu" | A ghi đĩa, B mở | Save lỗi → toast, ở lại A |
| Dirty → Bỏ qua | Sửa A, click B, "Bỏ qua" | B mở, A trên đĩa không đổi | N/A |
| Dirty → Hủy | Sửa A, click B, "Hủy"/Esc | Vẫn ở A, edit còn nguyên | N/A |
| Không dirty | Click B | Chuyển ngay, không dialog | N/A |
| Xóa active dirty | Xóa A đang dirty | Chuyển sibling, không dialog | N/A |
| Move vào folder | `MoveRequest(root, reqId, authId)` | File nằm ở `auth/`, không ở thư mục cha | N/A |
| Move đích sai | đích là request UUID / thư mục thiếu `_folder.json` | Không di chuyển | `ErrValidation` |

</frozen-after-approval>

## Code Map

- `projects/service/collection.go` -- `CreateFolder` L150, `CreateRequest` L197: thêm tham số `parentFolderID`, resolve qua `FindByUUID` (index lưu **đường dẫn thư mục**), guard bằng `isDeletableFolderPath` L320 + `Exists(dir/_folder.json)` như `DeleteFolder` L294-303. `slug.GenerateUnique(Dir)` theo thư mục cha.
- `projects/app.go` -- `CreateFolder(parentFolderId)`, `CreateRequest(parentFolderId)`; sau đó `wails generate module` (wailsjs gitignored).
- `projects/service/collection.go` -- `MoveRequest` L349-359: thay kiểm hậu tố `_folder.json` + `filepath.Dir(folderPath)` bằng `isDeletableFolderPath(rootPath, folderPath)` + `Exists(folderPath/_folder.json)`, `targetDir = folderPath`. Các kiểm `environments/` và same-dir no-op giữ nguyên.
- `projects/service/collection_test.go` -- `TestCreateRequest` L140, `TestCreateFolder` L175, helper `writeFolder` L231, `setupCollectionService` L15: cập nhật chữ ký, thêm case parent. Thêm `TestMoveRequest` (vào folder, về gốc, đích sai) — dựng tree qua `GetTree` để index giống runtime.
- `projects/frontend/src/stores/collectionStore.ts` -- `createRequest/createFolder(parentId = '')` + expand; `selectRequest` L54 thêm guard (tham số `force` cho đường xóa); `selectNextRequestOrClear` L235 gọi với force; `renameRequest` L100 cập nhật name tại chỗ.
- `projects/frontend/src/stores/requestStore.ts` -- thêm `saveCurrent()` gọi `SaveRequest(current)`, thành công thì `original = clone(current)`. `isDirty` L55 giữ nguyên.
- `projects/frontend/src/stores/uiStore.ts` -- `contextMenu` thêm `nodeType`; `renamingNodeId` + `requestRename(id)`; `unsavedPrompt` + `requestUnsavedChoice(name): Promise<'save'|'discard'|'cancel'>` theo pattern `requestConfirm` L41.
- `projects/frontend/src/components/RequestContextMenu.vue` -- đổi tên thành `TreeContextMenu.vue`; render mục theo `nodeType`; giữ submenu move + `flattenFolders`.
- `projects/frontend/src/components/UnsavedChangesDialog.vue` -- MỚI, style theo `ConfirmDialog.vue` (z-[1100], focus nút "Hủy").
- `projects/frontend/src/components/TreeNodeRow.vue` -- `handleContextMenu` L99 bỏ chặn folder, truyền type; watch `uiStore.renamingNodeId` → `startEdit`; `handleDelete` L66 chuyển vào store để menu dùng chung.
- `projects/frontend/src/components/RequestEditor.vue` L26 -- amber dot.
- `projects/frontend/src/App.vue` -- mount menu mới + dialog; `handleKeyDown` L15 bỏ qua khi `unsavedPrompt !== null`.

## Tasks & Acceptance

**Execution:**
- [ ] `projects/service/collection.go` + `projects/app.go` -- tham số parent cho Create* + guard -- tạo trong folder
- [ ] `projects/service/collection.go` -- sửa `MoveRequest` resolve folder đích -- "Di chuyển tới ▸" hoạt động với folder
- [ ] `projects/service/collection_test.go` -- test theo I/O Matrix (parent hợp lệ/sai/mất/gốc, move vào folder/đích sai)
- [ ] `projects/frontend/src/stores/uiStore.ts`, `requestStore.ts`, `collectionStore.ts` -- state menu/rename/prompt, `saveCurrent`, guard `selectRequest`, create với parent, rename giữ edit, delete dùng chung
- [ ] `projects/frontend/src/components/TreeContextMenu.vue` (rename từ `RequestContextMenu.vue`), `UnsavedChangesDialog.vue`, `TreeNodeRow.vue`, `RequestEditor.vue`, `App.vue` -- UI menu, dialog, dot

**Acceptance Criteria:**
- Given folder trong sidebar, when chuột phải, then menu hiện "Đổi tên", "Tạo request mới", "Tạo thư mục con", separator, "Xóa"
- Given request trong sidebar, when chuột phải, then menu hiện "Đổi tên", "Sao chép", "Di chuyển tới ▸", separator, "Xóa"
- Given chọn "Đổi tên" trong menu, when menu đóng, then row vào chế độ inline edit với tên được chọn sẵn
- Given request active có `isDirty`, when nhìn editor, then amber dot hiện cạnh tên
- Given request ở gốc và folder `auth`, when chọn "Di chuyển tới ▸ auth", then file request nằm trong `auth/` và tree hiển thị nó dưới `auth`

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

**Guard trong `selectRequest`:** một điểm chặn duy nhất thay vì rải ở từng caller; `force` chỉ dùng khi request active không còn tồn tại.

**Không reload sau rename:** `renameRequest` hiện gọi `loadRequest` cho request active, sẽ ghi đè `current` và mất edit chưa lưu — đổi sang patch `name` trên cả `original` và `current` để không tạo dirty giả.

## Verification

**Commands:**
- `cd projects && GOENV_VERSION=1.25.3 go vet ./... && GOENV_VERSION=1.25.3 go test ./...` -- expected: pass
- `cd projects && GOENV_VERSION=1.25.3 go build ./...` -- expected: thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: exit 0

**Manual checks (if no CLI):**
- `wails dev`: chuột phải folder → tạo request/thư mục con (xuất hiện bên trong, folder mở), đổi tên, xóa; chuột phải request → đủ 4 mục

---
title: 'Story 2.5: Delete Request & Delete Folder'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
baseline_commit: '9da65890ff03c68116157db7f75d4a172f8086d8'
route: 'dispatch'
review_loop_iteration: 2
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** User không thể xóa request/folder khỏi sidebar. `CollectionService.DeleteFolder` là stub trả `NewSuccess(nil)` (không xóa gì); `RequestService.Delete` đã có nhưng chưa có UI gọi. Không có confirm dialog nào trong codebase.

**Approach:** Implement `DeleteFolder` (xóa đệ quy trên disk, có guard path nằm trong collection root). Thêm `ConfirmDialog` dùng chung (điều khiển qua `uiStore`). Nhấn phím Delete/Backspace trên row đang focus → confirm → gọi store action `deleteRequest`/`deleteFolder` → reload tree, tự chọn request kế tiếp nếu request đang active bị xóa.

## Boundaries & Constraints

**Always:**
- Confirm dialog: nút "Xóa" (đỏ, destructive) + "Hủy"; Esc / click backdrop / "Hủy" đóng dialog không làm gì. Focus mặc định ở "Hủy" (hành động hủy-không-hoàn-tác phải chủ động).
- Message request: `Xóa request '{name}'? Hành động này không thể hoàn tác.` Message folder: `Xóa thư mục '{name}'? Tất cả request bên trong sẽ bị xóa. Hành động này không thể hoàn tác.`
- `DeleteFolder` chỉ xóa path nằm **bên trong** collection root (không phải root, không phải `environments/`) và là folder có `_folder.json`. Sau khi xóa, dọn mọi entry index có path dưới folder đó.
- `RequestService.Delete` chỉ xóa file `.json`, từ chối nếu UUID trỏ tới directory (tránh `DeleteRequest(folderId)` xóa đệ quy cả folder).
- `buildTree` gọi `fs.IndexSet(folder.ID, fullPath)` cho mỗi folder để folder UUID sống sót sau restart (xử lý deferred item của Story 2.4, cần để `DeleteFolder` hoạt động).
- Sau xóa thành công: toast "Đã xóa", `loadTree()`, bỏ id folder đã xóa khỏi `expandedFolders`.
- Nếu request đang active bị xóa (trực tiếp hoặc nằm trong folder bị xóa): chọn request kế tiếp cùng cấp (sau đó), nếu không có thì request liền trước; nếu không có nữa → `activeRequestId = null` + `requestStore.clearRequest()`.

**Never:**
- Không implement context menu (Story 2.7), duplicate/move (Story 2.6), hay unsaved-changes prompt (Story 2.7).
- Không xóa mềm/thùng rác/undo.
- Không thêm design token mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Xóa request | Focus row request, nhấn Delete, bấm "Xóa" | File `.json` bị xóa, tree reload, toast "Đã xóa" | N/A |
| Xóa request đang active | Request active bị xóa, còn sibling | Sibling kế tiếp (hoặc liền trước) được chọn và load vào editor | N/A |
| Xóa request active cuối cùng | Không còn request sibling | Editor về empty state, `activeRequestId=null` | N/A |
| Xóa folder | Focus row folder, nhấn Delete, bấm "Xóa" | Folder + toàn bộ nội dung bị xóa trên disk, tree reload | N/A |
| Folder chứa request active | Active request nằm trong folder bị xóa | Chọn request kế tiếp ở cấp của folder, hoặc clear editor | N/A |
| Hủy | Esc / "Hủy" / click backdrop | Dialog đóng, không gọi backend | N/A |
| Đang inline edit | Nhấn Delete/Backspace trong input rename | Xóa ký tự bình thường, không mở dialog | N/A |
| UUID không tồn tại | Item đã bị xóa ngoài app | Toast "Không tìm thấy…", reload tree | `ErrNotFound` |
| Folder UUID sau restart | App restart rồi xóa folder | Xóa thành công (index có folder UUID nhờ `GetTree`) | N/A |
| UUID rỗng / path ngoài root | `DeleteFolder("")` hoặc path escape root | Trả error, không xóa gì | `ErrValidation` / `ErrNotFound` |
| Disk error | `RemoveAll` thất bại | Toast lỗi, tree giữ nguyên | `ErrIO` |

</frozen-after-approval>

## Code Map

- `projects/service/collection.go` L251-256 -- `DeleteFolder(id)` stub; đổi sang `DeleteFolder(rootPath, id)` (như `CreateFolder(rootPath)`). L65-88 `buildTree`: thêm `IndexSet(folder.ID, fullPath)`. Pattern tham khảo: `RenameFolder` L213-249 (`FindByUUID` → path folder dir).
- `projects/service/request.go` L56-70 -- `Delete(id)` đã có; thêm guard chỉ cho phép file `.json`.
- `projects/storage/filesystem.go` L112-128 -- `Delete(path)` đã dùng `os.RemoveAll` (reuse). L183-195 -- `IndexSet`/`IndexDelete`; thêm `IndexDeleteByPrefix(dir)` (khớp `dir` hoặc `dir + separator`, tránh `a` khớp `ab`). Không đổi `walkJSONEntities` (test hiện tại assert folder id không vào index khi `IndexRebuild`).
- `projects/app.go` L105-108 -- `DeleteFolder(id)` binding: truyền thêm `a.collRoot`. L80-83 `DeleteRequest` giữ nguyên.
- `projects/frontend/src/stores/uiStore.ts` -- thêm state `confirm` + `requestConfirm(opts): Promise<boolean>` / `resolveConfirm(bool)`. `showToast` tái sử dụng.
- `projects/frontend/src/components/ConfirmDialog.vue` -- MỚI. Mount trong `App.vue` cạnh `ToastNotification`. Tham khảo style ToastNotification (token `surface-overlay`, `border-default`, `text-text-primary`, `text-text-danger`).
- `projects/frontend/src/App.vue` L11-26 -- `handleKeyDown` bỏ qua khi confirm đang mở.
- `projects/frontend/src/stores/collectionStore.ts` L2 import, L100-131 -- thêm `deleteRequest(id)`/`deleteFolder(id)` (import `DeleteRequest`, `DeleteFolder` từ wailsjs, auto-gen); helper tìm vị trí node trong `tree` để chọn kế tiếp. Reuse `selectRequest` (L54), `loadTree` (L31).
- `projects/frontend/src/components/TreeNodeRow.vue` L92-94 -- thêm `@keydown` Delete/Backspace trên row (guard `isEditing`, `e.target === e.currentTarget`); gọi `uiStore.requestConfirm` rồi store action.
- `projects/frontend/src/stores/requestStore.ts` L82 -- `clearRequest()` đã có.
- `projects/service/collection_test.go`, `projects/service/request_test.go` (mới), `projects/storage/filesystem_test.go` -- pattern: real filesystem trong `t.TempDir()`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/storage/filesystem.go` -- Thêm `IndexDeleteByPrefix(dir string)` -- dọn index descendant sau khi xóa folder
- [x] `projects/service/collection.go` -- Implement `DeleteFolder(rootPath, id)`: validate id/root không rỗng, `FindByUUID`, kiểm tra path nằm trong root (`filepath.Rel`, không `..`, không `.`), không phải `environments`, có `_folder.json`; `fs.Delete`; `IndexDeleteByPrefix`. `buildTree` index folder UUID
- [x] `projects/service/request.go` -- `Delete`: từ chối path không phải file `.json`
- [x] `projects/app.go` -- `DeleteFolder` binding truyền `a.collRoot`
- [x] `projects/frontend/src/stores/uiStore.ts` + `components/ConfirmDialog.vue` + `App.vue` -- confirm dialog dùng chung, Esc/backdrop/Hủy = false, focus "Hủy", `role="alertdialog"`, tắt phím tắt toàn cục khi mở
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Actions `deleteRequest`/`deleteFolder` + logic chọn kế tiếp/clear editor + toast
- [x] `projects/frontend/src/components/TreeNodeRow.vue` -- Phím Delete/Backspace → confirm → store action
- [x] `projects/service/collection_test.go`, `projects/service/request_test.go`, `projects/storage/filesystem_test.go` -- Unit test theo I/O Matrix: xóa đệ quy, dọn index, UUID rỗng/không tồn tại, path ngoài root, folder UUID sau `GetTree`, `Delete` từ chối UUID folder, `IndexDeleteByPrefix` không khớp prefix chuỗi (`a` vs `ab`)

**Acceptance Criteria:**
- Given request đang focus trong sidebar, when nhấn Delete và bấm "Xóa", then file bị xóa khỏi disk, tree cập nhật và toast "Đã xóa" hiện
- Given folder có request bên trong, when xác nhận xóa, then folder và toàn bộ nội dung bị xóa trên disk
- Given dialog đang mở, when nhấn Esc hoặc "Hủy", then không có gì bị xóa
- Given request active bị xóa và còn request khác cùng cấp, when xóa xong, then request kế tiếp được chọn và hiển thị trong editor
- Given app vừa restart, when xóa folder (UUID từ tree), then xóa thành công

## Implementation Notes



## Spec Change Log

### Iteration 2 — review (self-review, 3 layers run in one session)

- **Triggering findings:** F2 (`DeleteFolder` missing rootPath guard), F3 (no tests despite `[x]`), F4 (message text/`go build` broken), F5 (folder-delete cleared editor instead of picking sibling), F6 (no tree reload on NOT_FOUND).
- **Amended (non-frozen):** Design Notes — added the keydown-bubbling note below; Verification — `go build` must be run on the real toolchain (`GOENV_VERSION=1.25.3`, `.go-version` points at an uninstalled 1.27.1) and the named tests must exist.
- **Known-bad state avoided:** committed tree did not compile (`strings` not imported in `storage/filesystem.go`); Backspace/Delete typed in the rename `<input>` bubbled to the row handler and opened the delete dialog.
- **KEEP:** `buildFolderNode`/`buildRequestNode` split; `IndexSet(folder.ID)` in `buildFolderNode`; `.json` guard in `RequestService.Delete`; `ConfirmDialog` focus-on-Cancel + `role=alertdialog`; `handleKeyDown` suppression while confirm is open.
- **Note:** code was re-derived by editing the working tree, not by `git revert` (VCS writes need user approval).



## Design Notes

**Folder không có trạng thái "selected":** sidebar chỉ có `activeRequestId`. "Selected" trong AC hiểu là row đang focus (có `tabindex=0`). Vì context menu chưa có (Story 2.7), phím Delete/Backspace là trigger duy nhất; folder dùng cùng cơ chế (epic context liệt kê Delete xóa).

**"Parent auto-select":** parent là folder (không selectable) nên fallback cuối cùng là clear editor thay vì chọn parent.

**Guard xóa folder:** `FindByUUID` giờ có thể trả path folder (sau khi `buildTree` index folder), nên cả `DeleteFolder` (kiểm tra phạm vi) và `RequestService.Delete` (chỉ `.json`) phải guard — nếu không `DeleteRequest(folderId)` sẽ `RemoveAll` cả folder.

**Keydown bubbling từ input rename:** `TreeNodeRow` đặt `@keydown` trên row `div`, còn `<input>` rename là con của row — phím Backspace/Delete/F2 gõ trong input bubble lên row. Handler phải bỏ qua khi `isEditing` hoặc `e.target !== e.currentTarget`.

## Verification

**Commands:**
- `cd projects && go vet ./...` -- expected: không warning
- `cd projects && go test ./...` -- expected: pass
- `cd projects && go build ./...` -- expected: build thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors (cần `npm install` + `wails generate module` để có `wailsjs/`, vốn gitignored)

**Manual checks (if no CLI):**
- `wails dev`: tạo folder + request, Tab/click row, Delete → dialog → xóa; kiểm tra thư mục trên disk

## Review Triage Log

Layers: blind-hunter, edge-case-hunter, verification-gap — chạy tuần tự trong một session (không có subagent độc lập). Verdict theo step-04.

| # | Finding | Verdict | Route | Evidence / outcome |
|---|---------|---------|-------|--------------------|
| F1 | Backspace/Delete/F2 gõ trong input rename bubble lên row `@keydown`, `preventDefault` chặn xóa ký tự và mở dialog xóa | high | patch (fixed) | `TreeNodeRow.vue`: input là con của row div, không `.stop`. Thêm guard `isEditing \|\| e.target !== e.currentTarget` |
| F2 | `DeleteFolder(id)` không nhận `rootPath`, không guard root/`environments/`/ngoài root; `app.go` không đổi | high | bad_spec (fixed in loop) | Vi phạm Always #3 + matrix "UUID rỗng / path ngoài root". Thêm `DeleteFolder(rootPath,id)` + `isDeletableFolderPath`; test `TestDeleteFolder_Guards` |
| F3 | Task test đánh `[x]` nhưng commit không có test nào | high | bad_spec (fixed in loop) | Commit chỉ đổi 11 file, không `_test.go`. Thêm test: recursive+index cleanup, restart, guards, `RequestService.Delete` (3 case), `IndexDeleteByPrefix` (`a` vs `ab`) |
| F4a | Commit không compile: `storage/filesystem.go` dùng `strings` mà chưa import | high | patch (fixed) | `go build` thật báo undefined; Go chưa từng chạy vì `.go-version`=1.27.1 chưa cài. Dùng `GOENV_VERSION=1.25.3` |
| F4b | Message confirm khác text frozen trong spec | medium | bad_spec (fixed in loop) | Sửa thành `Xóa request '{name}'? ...` / `Xóa thư mục '{name}'? Tất cả request bên trong sẽ bị xóa. ...` |
| F5 | Xóa folder chứa request active → chỉ clear editor, không chọn sibling kế tiếp | medium | bad_spec (fixed in loop) | Matrix "Folder chứa request active". `deleteFolder` giờ gọi `selectNextRequestOrClear(folderId)` trên tree trước reload |
| F6 | `NOT_FOUND` từ backend không reload tree | medium | bad_spec (fixed in loop) | Matrix "UUID không tồn tại → toast, reload tree". Thêm `loadTree()` khi `error.code === 'NOT_FOUND'` |
| F7 | `requestConfirm` gọi khi dialog đang mở → promise cũ treo vĩnh viễn | low | patch (fixed) | Key repeat trước khi dialog render. 1 dòng: resolve(false) cái cũ |
| F8 | `IndexDeleteByPrefix` điều kiện thừa (`TrimSuffix` ngược) | low | patch (fixed) | Đơn giản hóa bằng `filepath.Clean` + `dir`/`dir+sep`; có test |
| F9 | `DeleteFolder` dùng literal `"_folder.json"` thay const `folderMetaFile` | low | patch (fixed) | Cosmetic, sửa trực tiếp |
| F10 | `RequestService.Delete` trả `ErrIO` (kèm path thô) khi file đã biến mất, thay vì `ErrNotFound` | medium | defer | Pre-existing mapping lỗi; UI mới là consumer đầu tiên. Ghi vào deferred-work |
| F11 | `.json` guard trượt qua folder có tên kết thúc `.json` | low | rejected | Slug folder không sinh đuôi `.json` trong luồng app; fix cần thêm `IsDir` API (thêm surface) |
| F12 | `ConfirmDialog` không trap focus Tab / không restore focus sau đóng | low | rejected | Cần thêm logic focus-trap; hành vi spec yêu cầu (focus Hủy, Esc/backdrop) đã đúng |
| F13 | `expandedFolders` không dọn id folder con khi xóa folder cha | low | rejected | Chỉ rò id trong Set, không ảnh hưởng hành vi |
| F14 | Dynamic `import('@/stores/uiStore')` trong component | low | rejected | Cùng pattern đã dùng ở `collectionStore`; không có harm cụ thể |
| F15 | Commit chứa `diff-2-5.patch` (artifact tạm) | low | defer | Việc VCS; cần user duyệt trước khi sửa commit |

Verification sau patch: `go vet ./...` (service, storage), `go test ./service/... ./storage/...` pass, `go build .` OK (với `frontend/dist` tạm), `npx vue-tsc --noEmit` exit 0.

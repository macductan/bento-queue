---
title: 'Story 2.6: Duplicate & Move Request'
type: 'feature'
created: '2026-10-03'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8f3b8e578f3a90727ea084bd6a641c7613dd42ca'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** User không thể sao chép request hay chuyển request sang folder khác. Binding `DuplicateRequest`/`MoveRequest` (AR-6) chưa tồn tại; `storage.FileSystem.MoveFile` đã có nhưng chưa được dùng.

**Approach:** Thêm `DuplicateRequest(id)` (clone file JSON cùng thư mục, UUID mới, tên `{original} (bản sao)`) và `MoveRequest(id, targetFolderId)` (di chuyển file trên disk, cập nhật index). Frontend: Ctrl+D trên row request đang focus → duplicate → reload tree → tự chọn bản sao; context menu tối thiểu (chuột phải row request) với "Sao chép" + "Di chuyển tới ▸" submenu folder lồng nhau → move → reload tree.

## Boundaries & Constraints

**Always:**
- **Thứ tự tree (quyết định Q1):** `buildTree` sort mỗi cấp: folder trước, request sau; trong mỗi nhóm sort theo tên hiển thị case-insensitive (tie-break theo filename để ổn định). Nhờ đó bản sao nằm ngay dưới bản gốc.
- Duplicate copy toàn bộ method/url/headers/params/body từ file trên disk; `id` mới (UUID v4), `created_at`/`updated_at` = now; tên cắt tối đa 255 rune. Filename = `slug.GenerateUnique(newName, thư mục của bản gốc)`. Trả `Result{Request}`.
- Move giữ nguyên UUID và nội dung file; giữ basename, chỉ khi trùng ở đích mới thêm hậu tố `-1`, `-2`. Source == target folder → no-op thành công. Sau move: `IndexSet(id, newPath)`.
- Move chỉ chấp nhận source là file `.json` trong collection root, đích là folder có `_folder.json` trong root (không phải `environments/`), hoặc **gốc collection khi `targetFolderId == ""` (quyết định Q3)**.
- **Context menu (quyết định Q2):** chuột phải row request → menu nổi tại con trỏ gồm "Sao chép" và "Di chuyển tới ▸". Submenu: mục đầu "Gốc collection", rồi mọi folder theo cấu trúc lồng (thụt lề theo độ sâu). Đóng bằng Esc, click ngoài, hoặc sau khi chọn. Folder row không có menu (Story 2.7). Component thiết kế để 2.7 mở rộng thêm mục.
- Sau move: `loadTree()`, mở rộng folder đích và các folder cha để request vẫn thấy được; request active vẫn active (UUID không đổi). Toast "Đã di chuyển".
- Ctrl+D chỉ trên row request đang focus, bỏ qua khi đang inline edit (guard `isEditing || e.target !== e.currentTarget` như Delete).
- Lỗi: `NOT_FOUND` → toast + `loadTree()`; lỗi khác → toast message backend, tree giữ nguyên.

**Never:**
- Không duplicate/move folder. Không drag-and-drop. Không unsaved-changes prompt (Story 2.7) — duplicate dùng bản trên disk.
- Không thêm Đổi tên/Xóa/menu folder vào context menu (Story 2.7). Không thêm design token mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Duplicate | Focus request "Login", Ctrl+D hoặc menu "Sao chép" | File mới cùng thư mục, tên "Login (bản sao)", ngay dưới bản gốc, được chọn trong editor | N/A |
| Duplicate lặp | Duplicate "Login" 2 lần | 2 file khác nhau (`login-ban-sao.json`, `login-ban-sao-1.json`) | N/A |
| Duplicate trong folder | Request nằm trong `auth/` | Bản sao nằm trong `auth/` | N/A |
| Move | Request ở root → folder `auth` | File chuyển vào `auth/`, tree cập nhật, `auth` mở | N/A |
| Move về root | Request trong `auth/` → "Gốc collection" | File chuyển về root | N/A |
| Move trùng tên | `auth/login.json` đã tồn tại | File đích `auth/login-1.json` | N/A |
| Move cùng folder | target = folder hiện tại | Không đổi gì, success | N/A |
| UUID không tồn tại | Request bị xóa ngoài app | Toast lỗi, reload tree | `ErrNotFound` |
| Target không hợp lệ | targetFolderId là request UUID / ngoài root / `environments` | Không move | `ErrValidation` |
| ID rỗng | `DuplicateRequest("")` / `MoveRequest("", …)` | Không làm gì | `ErrValidation` |
| Disk error | Ghi/rename thất bại | Toast lỗi, tree giữ nguyên | `ErrIO` |

</frozen-after-approval>

## Code Map

- `projects/service/request.go` -- thêm `Duplicate(id)`. Pattern: `Rename` L77-110 (`FindByUUID` → `ReadJSON` → `WriteJSON`), guard `.json` như `Delete` L63.
- `projects/service/collection.go` -- thêm `MoveRequest(rootPath, id, targetFolderID)` cạnh `DeleteFolder` L268. Reuse `isDeletableFolderPath` L306 (đích folder; source dùng kiểm tra "trong root" tương tự), `folderMetaFile` L28. `buildTree` L51-82: sort `nodes` trước return (`sort.SliceStable`, `strings.ToLower`).
- `projects/storage/filesystem.go` L133 -- `MoveFile(src, dest)` đã có. Không đổi.
- `projects/slug/slug.go` L76 -- `GenerateUnique` cho duplicate. Thêm `UniqueFilename(filename, dir)` cho move (giữ stem, `-N` khi trùng).
- `projects/app.go` -- binding `DuplicateRequest(id)` → `reqSvc.Duplicate`, `MoveRequest(id, targetFolderId)` → `collSvc.MoveRequest(a.collRoot, …)`. Sau đó `wails generate module` (wailsjs gitignored).
- `projects/frontend/src/stores/collectionStore.ts` -- `duplicateRequest(id)`, `moveRequest(id, targetFolderId)`; reuse `loadTree` L31, `selectRequest` L54, `findNode` L184, `expandedFolders`. Helper liệt kê folder phẳng kèm depth (cho submenu) và tìm chuỗi folder cha (để expand).
- `projects/frontend/src/stores/uiStore.ts` -- state `contextMenu: { x, y, nodeId } | null` + `openContextMenu`/`closeContextMenu` (pattern `confirm`).
- `projects/frontend/src/components/RequestContextMenu.vue` -- MỚI. Style theo `ConfirmDialog.vue` (`bg-surface-raised`, `border-border-default`, `hover:bg-surface-hover`, `ui-sm`). Item cao ≥32px. Mount trong `App.vue` cạnh `ConfirmDialog`.
- `projects/frontend/src/App.vue` L14-30 -- `handleKeyDown` bỏ qua khi `uiStore.contextMenu !== null`.
- `projects/frontend/src/components/TreeNodeRow.vue` L84-94, L113-125 -- `onKeyDown` thêm Ctrl+D (request); `@contextmenu.prevent` trên row request → `openContextMenu`.
- Tests: `projects/service/collection_test.go` (helper `setupCollectionService` L15), `request_test.go`, `projects/slug/slug_test.go` -- real filesystem `t.TempDir()`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/slug/slug.go` -- `UniqueFilename(filename, dir)` -- tránh ghi đè khi move
- [x] `projects/service/request.go` -- `Duplicate(id)` theo Boundaries
- [x] `projects/service/collection.go` -- `MoveRequest` + guard + no-op cùng folder + root target; sort trong `buildTree`
- [x] `projects/app.go` -- bindings `DuplicateRequest`, `MoveRequest`; `wails generate module`
- [x] `projects/frontend/src/stores/uiStore.ts` + `collectionStore.ts` -- state context menu; actions duplicate/move, toast, `NOT_FOUND` reload, expand đích
- [x] `projects/frontend/src/components/RequestContextMenu.vue` + `App.vue` + `TreeNodeRow.vue` -- menu chuột phải, submenu folder, Ctrl+D, Esc/click-ngoài đóng
- [x] `projects/service/request_test.go`, `collection_test.go`, `slug/slug_test.go` -- test theo I/O Matrix + thứ tự sort `buildTree`

**Acceptance Criteria:**
- Given request đang focus, when nhấn Ctrl+D, then bản sao "{tên} (bản sao)" xuất hiện ngay dưới bản gốc cùng folder và được chọn trong editor
- Given chuột phải row request, when chọn "Di chuyển tới ▸" → một folder, then file nằm trong folder đó trên disk và tree phản ánh vị trí mới
- Given request vừa move, when app restart, then request vẫn mở/xóa được (UUID không đổi)
- Given context menu đang mở, when nhấn Esc hoặc click ra ngoài, then menu đóng và không có thao tác nào xảy ra

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

**`MoveRequest` ở `CollectionService`:** cần `rootPath` để guard phạm vi đích và resolve root target, giống `DeleteFolder`.

**Chọn bản sao:** `duplicateRequest` gọi `loadTree()` rồi `selectRequest(newId)`; id mới khác active nên không vướng early-return.

**Sort đổi thứ tự hiện có:** test `TestGetTree_NestedStructure` có thể assert theo thứ tự filename — cập nhật kỳ vọng theo thứ tự mới nếu cần.

## Verification

**Commands:**
- `cd projects && GOENV_VERSION=1.25.3 go vet ./...` -- expected: không warning
- `cd projects && GOENV_VERSION=1.25.3 go test ./...` -- expected: pass
- `cd projects && GOENV_VERSION=1.25.3 go build ./...` -- expected: thành công (cần `frontend/dist` tồn tại)
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: exit 0

**Manual checks (if no CLI):**
- `wails dev`: tạo folder + request, Ctrl+D, chuột phải → move vào folder và về root, kiểm tra thư mục trên disk

---
title: 'Story 2.4: Rename Request & Rename Folder'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '8f64e3bef08e9c2275dd69399c97e14a27ca336b'
route: 'dispatch'
followup_review_recommended: false
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Không thể đổi tên request hay folder trong sidebar. `RenameFolder` Go service là stub trả `NewSuccess(nil)`, chưa có `RenameRequest` binding. Frontend không có UI inline edit. User tạo xong request/folder phải chấp nhận tên mặc định "Request mới" / "Thư mục mới" vĩnh viễn.

**Approach:** Implement `RenameFolder` trong Go service (đọc `_folder.json` qua `FindByUUID`, update `name` + `updated_at`, ghi lại — slug giữ nguyên). Thêm `RenameRequest` binding tương tự (đọc request JSON, update `name` + `updated_at`, ghi lại). Frontend: thêm inline edit mode vào `TreeNodeRow` — double-click tên hoặc F2 → text input thay thế tên, Enter/blur → gọi store action `renameRequest(id, name)` hoặc `renameFolder(id, name)` → gọi Go binding → reload tree. Esc hủy edit.

## Boundaries & Constraints

**Always:**
- Slug filename trên disk giữ nguyên khi rename — chỉ update `name` field trong JSON.
- `updated_at` được set bằng `time.Now()` khi rename.
- Validate tên mới: không rỗng, trim whitespace, tối đa 255 ký tự.
- Inline input khi edit: hiển thị tại chỗ thay vì dialog, auto-select toàn bộ text, focus ngay.
- Reload tree sau rename thành công để đồng bộ sidebar.
- Nếu request đang active bị rename → cập nhật tên hiển thị trong `RequestEditor` (reload request từ disk).

**Never:**
- Không rename slug/directory trên disk.
- Không implement drag-and-drop hay move — defer sang Story 2.6.
- Không implement context menu — defer sang Story 2.7.
- Không thêm design token mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename request thành công | Double-click tên request, nhập "Login API", Enter | Tên đổi thành "Login API" trong sidebar + editor, disk JSON cập nhật | N/A |
| Rename folder thành công | Double-click tên folder, nhập "Auth Endpoints", Enter | Tên folder đổi trong sidebar, `_folder.json` cập nhật | N/A |
| Tên rỗng | Nhập chuỗi rỗng hoặc chỉ spaces, Enter | Hủy edit, giữ tên cũ (không gọi backend) | N/A |
| Tên quá dài | Nhập > 255 ký tự | Input maxlength=255, tự cắt | N/A |
| Tên giống tên cũ | Nhập lại đúng tên hiện tại | Hủy edit, không gọi backend | N/A |
| UUID không tìm thấy | Gọi rename trên item đã bị xóa ngoài app | Toast error "Không tìm thấy", giữ tên cũ | Toast error |
| Disk write error | WriteJSON thất bại | Toast error, giữ tên cũ | Toast error |
| Esc cancel | Đang nhập tên mới, nhấn Esc | Hủy edit, quay lại tên cũ | N/A |
| Blur save | Đang nhập tên mới, click ra ngoài | Lưu tên mới (nếu khác tên cũ và hợp lệ), hủy nếu rỗng | N/A |

</frozen-after-approval>

## Code Map

- `projects/service/collection.go` L212-217 -- `RenameFolder` stub — cần implement: `FindByUUID(id)` → `ReadJSON(_folder.json)` → update name/updated_at → `WriteJSON`
- `projects/service/request.go` L39-51 -- `RequestService.Save(req)` — pattern tham khảo: `FindByUUID` + `WriteJSON`
- `projects/app.go` L95-98 -- `RenameFolder(id, newName)` binding — đã có, gọi `collSvc.RenameFolder`
- `projects/app.go` -- Cần thêm `RenameRequest(id, newName)` binding
- `projects/model/types.go` L55-65 -- `Request` struct — `Name` field L57
- `projects/model/types.go` L80-85 -- `Folder` struct — `Name` field L82
- `projects/storage/filesystem.go` L201-225 -- `FindByUUID(uuid)` — trả path, dùng cho cả request và folder
- `projects/storage/filesystem.go` L60-110 -- `WriteJSON(path, data)` — atomic write
- `projects/storage/filesystem.go` L42-56 -- `ReadJSON(path, dest)` — đọc JSON
- `projects/frontend/src/stores/collectionStore.ts` L1-2 -- import bindings — cần thêm `RenameFolder` import (Wails auto-gen sau khi thêm `RenameRequest` Go binding)
- `projects/frontend/src/stores/collectionStore.ts` L86-99 -- `createFolder` action — pattern tham khảo cho `renameFolder`/`renameRequest`
- `projects/frontend/src/components/TreeNodeRow.vue` L87 -- `<span>{{ node.name }}</span>` — thay bằng inline input khi editing
- `projects/frontend/src/stores/requestStore.ts` L61-80 -- `loadRequest` action — cần gọi lại sau rename nếu request đang active
- `projects/frontend/wailsjs/go/main/App.d.ts` L27 -- `RenameFolder` binding đã có
- `projects/frontend/wailsjs/go/main/App.d.ts` -- `RenameRequest` sẽ được auto-gen bởi Wails

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/collection.go` -- Implement `RenameFolder(id, newName)`: validate `newName` (trim, non-empty, ≤255), gọi `FindByUUID(id)` lấy folder path, `ReadJSON(folderPath + "/_folder.json")` vào `model.Folder`, update `Name` = trimmed `newName` và `UpdatedAt` = `time.Now()`, `WriteJSON` lại. Trả `NewSuccess(nil)`. Lưu ý: `FindByUUID` index cho folder trỏ đến folder directory (không phải `_folder.json`), cần append `/_folder.json`.
- [x] `projects/service/request.go` -- Thêm method `Rename(id, newName string) model.Result`: validate `newName` (trim, non-empty, ≤255), `FindByUUID(id)` lấy path, `ReadJSON` vào `model.Request`, update `Name` = trimmed `newName` và `UpdatedAt` = `time.Now()`, `WriteJSON`. Trả `NewSuccess(nil)`.
- [x] `projects/app.go` -- Thêm binding `RenameRequest(id, newName string) model.Result` gọi `reqSvc.Rename(id, newName)`.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Thêm actions `renameRequest(id, name)` và `renameFolder(id, name)`: gọi Wails binding tương ứng, nếu success → `loadTree()`, nếu request đang active → reload request. Nếu fail → toast error.
- [x] `projects/frontend/src/components/TreeNodeRow.vue` -- Thêm inline edit mode: state `isEditing`, `editName`. Double-click tên hoặc F2 trigger → hiện `<input>` thay `<span>`, auto-select, focus. Enter/blur → validate (trim, non-empty, khác tên cũ) → gọi `renameRequest` hoặc `renameFolder` → exit edit. Esc → hủy edit. maxlength=255.

**Acceptance Criteria:**
- Given sidebar có request "Request mới", when double-click tên, nhập "Login API", nhấn Enter, then tên trong sidebar đổi thành "Login API" và disk JSON đã cập nhật name
- Given sidebar có folder "Thư mục mới", when double-click tên, nhập "Auth", nhấn Enter, then tên folder đổi thành "Auth" trong sidebar và `_folder.json` đã cập nhật
- Given request "Login API" đang active trong editor, when rename thành "Auth Login", then tên trong RequestEditor cũng cập nhật
- Given đang inline edit, when nhấn Esc, then hủy edit và giữ tên cũ
- Given đang inline edit, when nhập chuỗi rỗng và nhấn Enter, then hủy edit và giữ tên cũ (không gọi backend)

## Implementation Notes



## Spec Change Log



## Design Notes

**Inline edit thay vì dialog:** Trải nghiệm rename inline (tại chỗ) tự nhiên hơn dialog/modal — giống pattern rename trong VS Code, Finder, Bruno. Double-click + F2 là hai trigger phổ biến nhất. Input thay thế span tại cùng vị trí, giữ nguyên layout.

**Folder FindByUUID trỏ đến directory:** Index `IndexSet(id, folderPath)` lưu path đến thư mục (không phải `_folder.json`). Service `RenameFolder` cần biết: `filepath.Join(path, "_folder.json")` để đọc/ghi metadata. Đây là convention từ `CreateFolder` story 2.2.

**Reload tree thay vì patch local:** Đơn giản hơn patch cây local (tìm node nested, update name). `loadTree()` đảm bảo consistency 1:1 với disk. Cost thấp vì tree nhỏ (local disk read).

## Verification

**Commands:**
- `cd projects && go vet ./...` -- expected: không warning
- `cd projects && go build ./...` -- expected: build thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build

## Review Triage Log

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `import` ở giữa `<script setup>` (TreeNodeRow.vue L26) — hai import blocks riêng | `medium` | `patch` ✅ | Vue SFC compiler yêu cầu import ở đầu block; merged thành 1 import line |
| 2 | `len(newName) > 255` tính byte thay vì rune — tiếng Việt bị cắt giữa ký tự UTF-8 | `low` | `patch` ✅ | Đổi thành `len([]rune(newName))` + `string([]rune(...)[:255])` ở cả collection.go và request.go |
| 3 | Folder UUID không survive restart — walkJSONEntities skip `_folder.json` → FindByUUID trả ErrNotFound | `medium` — pre-existing từ Story 2.2 | `defer` | Ghi vào deferred-work.md; không do diff này tạo ra |
| 4 | Thiếu unit test cho `RequestService.Rename` và `RenameFolder` | `low` — không có request_test.go, pattern thiếu trước | `defer` | Ghi vào deferred-work.md |

---
title: 'Xử lý Action Item 1 và Deferred Work còn lại'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_commit: 5f7171f8ed2d17df92956ad4be62dbeb11265013
route: 'dispatch'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Có 3 hạng mục công việc tồn đọng từ các Epic trước cần giải quyết: (1) Hardcode error message ở service layer gây khó maintain (Action item 1); (2) Thiếu thông tin hiển thị storage path hiện tại trong Settings (Deferred work); (3) Import file lớn không có feedback tiến độ cho người dùng (Deferred work).

**Approach:** 
1. Định nghĩa tập constants cho các lỗi thường gặp trong `projects/service/errors.go` và thay thế toàn bộ string hardcode ở layer service (như `collection.go`, `request.go`, `importer.go`, `config.go`).
2. Expose hàm lấy `CollectionRoot` ra khỏi Wails backend và binding lên giao diện `SettingsModal.vue` để người dùng thấy cấu hình hiện tại.
3. Thêm cơ chế callback `EventsEmit` báo cáo tiến độ (số lượng folder/request, tổng, text) từ Go backend trong quá trình `ImportPostman` và consume/hiển thị trạng thái này ở UI.

## Boundaries & Constraints

**Always:**
- Dùng `model.NewError` hoặc `fmt.Errorf` kết hợp với các constants trong `service/errors.go`.
- Frontend nhận progress event qua `EventsOn` của Wails để update UI real-time thay vì polling.

**Never:**
- Không thay đổi hành vi logic đang có của các luồng import, cấu hình, CRUD request/collection; chỉ thay đổi UX và error strings.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mở Settings Modal | App running | Modal hiển thị đường dẫn thư mục lưu trữ hiện hành phía dưới mục Lưu trữ | N/A |
| Import collection | File JSON Postman valid | Nút Import đổi sang trạng thái đang import và UI hiển thị tiến độ thông qua Wails Events | N/A |

</frozen-after-approval>

## Code Map

- `projects/service/errors.go` -- Tạo mới: Chứa định nghĩa các constants error string cho service layer.
- `projects/service/*.go` -- Các service file: Cần thay thế message lỗi hardcoded bằng constants.
- `projects/app.go` -- Khai báo method `GetCollectionRoot() string` để frontend gọi.
- `projects/frontend/src/components/SettingsModal.vue` -- Thêm logic gọi `GetCollectionRoot` onMount và hiển thị.
- `projects/service/importer.go` -- Cập nhật emit progress context (truyền `context.Context` hoặc setup callback nếu được).
- `projects/frontend/src/stores/collectionStore.ts` -- Bắt event `import:progress` để update state.
- `projects/frontend/src/components/AppHeader.vue` -- Hiển thị progress từ store thay vì chỉ text "Đang import...".

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/errors.go` -- Tạo file chứa constants string cho toàn bộ error message của service.
- [x] `projects/service/collection.go`, `projects/service/request.go`, `projects/service/config.go` -- Thay thế text hardcode thành constants.
- [x] `projects/app.go` -- Thêm func `GetCollectionRoot() string` trả về `a.collRoot`.
- [x] `projects/frontend/src/components/SettingsModal.vue` -- Call `GetCollectionRoot` lúc mounted và sau khi đổi thư mục; hiển thị đường dẫn (path) read-only cho người dùng thấy.
- [x] `projects/app.go` -- Ở method `ImportPostman`, thêm một goroutine hoặc setup event emitter thông qua `wails/v2/pkg/runtime.EventsEmit` để pub progress.
- [x] `projects/service/importer.go` -- Phát event tiến độ (file/số lượng mục) trong quá trình parsing và ghi disk.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Đăng ký `EventsOn` đón `import:progress` và lưu vào state `importProgress`.
- [x] `projects/frontend/src/components/AppHeader.vue` -- Hiển thị `importProgress` text (ví dụ: "Đang import 5/10...") thay cho text loading tĩnh.

**Acceptance Criteria:**
- Given user opens Settings modal, when modal loads, then the current storage path is clearly visible.
- Given a large Postman JSON file, when user clicks import, then the UI shows progress updating real-time as the file is processed.
- Given any error returned by service operations (e.g. not found, validation), when outputting, then it uses the newly defined constant convention without breaking API contract.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **Missing ImportPostman progress callback tests:** `medium` — Thiếu test kiểm chứng hàm onProgress được gọi. (Route: `patch`)
- **Malformed item count mismatch:** `medium` — `countTotalItems` đếm cả malformed items nhưng `processItem` lại skip, làm hụt tiến độ. (Route: `patch`)
- **Root item missed in totalItems:** `high` — `countTotalItems` không đếm rootItem nhưng `processItem` có xử lý, gây quá tải (N+1/N). (Route: `patch`)
- **Skipped progress on IO error:** `medium` — IO error khi MakeDir/WriteJSON làm bỏ qua gọi `onProcessed`, hụt tiến độ. (Route: `patch`)
- **Missing AppHeader.vue changes:** `high` — Bỏ sót chưa tích hợp `importProgress` từ store lên giao diện. (Route: `patch`)
- **Duplicated Doc Comment:** `low` — Comment thừa ở `projects/app.go`. (Route: `patch`)
- **Anti-pattern internal error wrap:** `low` — Error string nội bộ của config nằm trong errors.go. (Route: `patch`)
- **Perpetual Loading State:** `low` — Lỗi fetch GetCollectionRoot làm path hiện "Đang tải" mãi. (Route: `patch`)
- **Static Title Truncated:** `low` — Sai attribute title trên giao diện Vue. (Route: `patch`)
- **Unchecked tasks:** `low` — Chưa check checkbox trong spec. (Route: `patch`)

## Verification

**Commands:**
- `cd projects/frontend && bun run type-check` -- expected: Không có lỗi type do add properties vào store
- `cd projects && go test ./service/...` -- expected: Tests vẫn pass, chứng tỏ refactor error string không phá hỏng tests.

**Manual checks (if no CLI):**
- Mở dev server `wails dev`, vào Settings để xem đường dẫn thư mục đúng chưa.
- Import một file Postman lớn và xem UI có nhảy số tiến độ đều đặn không.

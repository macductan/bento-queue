---
title: 'Story 2: Backend Services, App Bindings & Importer Standardization'
type: 'refactor'
created: '2026-10-13'
status: 'done'
baseline_commit: 'b10d776403d391eb4e1698ddc51df60ad57ef8d8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-pure-uuid-remove-slug/SPEC.md'
  - '_bmad-output/specs/spec-pure-uuid-remove-slug/storage-structure.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các Service backend (`CollectionService`, `ConfigService`, `RequestService`, `ImporterService`) và `App` bindings vẫn đang sử dụng tham số `slug`, gọi các hàm sinh tên dạng `<slug>-<UUID>` cũ và truy cập trường `Slug` trong `model.Collection`, khiến toàn bộ backend không thể biên dịch sau khi Story 1 hoàn tất.

**Approach:** Đổi toàn bộ tham số từ `slug` sang `id` trong `CollectionService`, `ConfigService` và `App` bindings; cập nhật `CreateCollection`, `CreateFolder`, `CreateRequest`, `RequestService.Duplicate` và `ImporterService` sinh thư mục `<uuid>/` và tệp `<uuid>.json` thuần UUID v4; thay thế `ErrCollectionSlugEmpty` bằng `ErrCollectionIDEmpty`; và cập nhật toàn bộ backend unit tests để `go test ./...` pass 100%.

## Boundaries & Constraints

**Always:**
- `CollectionService`: `CreateCollection` sinh folder `<uuid>` (ngoại trừ default là `default`), `CreateFolder` sinh folder `<uuid>`, `CreateRequest` sinh file `<uuid>.json`.
- `RequestService.Duplicate`: sinh file `<uuid>.json`.
- `ImporterService`: sinh thư mục `<uuid>/` cho Folder và `<uuid>.json` cho Request.
- `App` bindings: `SwitchCollection(id string)`, `RenameCollection(id, newName string)`, `DeleteCollection(id string)`, `DuplicateCollection(id string)`.
- Xóa `ErrCollectionSlugEmpty`, thay thế bằng `ErrCollectionIDEmpty`.
- Tương thích ngược: `GetTree`, `FindByUUID` và `ListCollections` đọc và hiển thị chính xác cả dữ liệu cũ lẫn mới.
- Toàn bộ backend unit test (`go test ./...`) phải pass 100%.

**Never:**
- Không sửa frontend (Vue / Pinia) trong Story 2 (dành cho Story 3).
- Không tự ý commit hay push Git mà chưa có sự đồng ý của người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CreateCollection | `name: "My Project"` | Tạo thư mục `<uuid>/` chứa `collection.json` với `id: "<uuid>"` | Validation error nếu name rỗng |
| CreateFolder | `parentID: "", name: "Auth"` | Tạo thư mục `<uuid>/` chứa `_folder.json` | Validation error nếu name rỗng |
| CreateRequest | `name: "Login", method: "POST"` | Tạo tệp `<uuid>.json` | Validation error nếu name/url rỗng |
| Duplicate Request | Gọi Duplicate trên request hiện có | Tạo tệp `<uuid>.json` với ID mới | Error nếu request không tồn tại |
| RenameCollection | `id: "<uuid>", newName: "New Name"` | Cập nhật `name` trong `collection.json`, giữ nguyên folder `<uuid>/` trên đĩa | Error nếu ID không tồn tại |
| DeleteCollection | `id: "<uuid>"` | Xóa thư mục `<uuid>/` trên đĩa | Từ chối xóa collection `"default"` |
| SwitchCollection | `id: "<uuid>"` | Cập nhật `ActiveCollection` và `CollectionRoot` trong config.json | Error nếu collection không tồn tại |
| Import Postman | File Postman v2.1 với folder & request | Tạo folder `<uuid>/` và request `<uuid>.json` | Trả về lỗi nếu file không hợp lệ |

</frozen-after-approval>

## Code Map

- `projects/service/errors.go` -- Thay thế `ErrCollectionSlugEmpty` bằng `ErrCollectionIDEmpty`.
- `projects/service/collection.go` -- Đổi tham số `slug` sang `id`, sinh UUID thuần cho folder/request/collection.
- `projects/service/config.go` -- Đổi `SwitchActiveCollection` từ `slug` sang `id`.
- `projects/service/request.go` -- Cập nhật `Duplicate` sinh file `<uuid>.json`.
- `projects/service/importer.go` -- Cập nhật sinh folder `<uuid>/` và request `<uuid>.json`.
- `projects/app.go` -- Cập nhật các Wails bindings nhận `id` thay vì `slug`.
- `projects/service/collection_test.go` -- Cập nhật các test suite collection.
- `projects/service/config_test.go` -- Cập nhật các test suite config.
- `projects/service/request_test.go` -- Cập nhật các test suite request.
- `projects/app_test.go` -- Cập nhật các test suite app bindings.

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/errors.go` -- Xóa `ErrCollectionSlugEmpty`, bổ sung `ErrCollectionIDEmpty`.
- [x] `projects/service/collection.go` -- Đổi tham số `slug` sang `id` trong `SwitchCollection`, `RenameCollection`, `DeleteCollection`, `DuplicateCollection`; cập nhật `CreateCollection`, `CreateFolder`, `CreateRequest` dùng UUID thuần; cập nhật `ListCollections` gán `coll.ID` và xóa `coll.Slug`.
- [x] `projects/service/config.go` -- Cập nhật `SwitchActiveCollection` nhận `id`.
- [x] `projects/service/request.go` -- Cập nhật `Duplicate` sinh `<uuid>.json`.
- [x] `projects/service/importer.go` -- Cập nhật sinh thư mục `<uuid>/` và file `<uuid>.json`.
- [x] `projects/app.go` -- Đổi tham số `slug` sang `id` ở các hàm bindings.
- [x] `projects/service/collection_test.go` -- Cập nhật kiểm thử `CollectionService`.
- [x] `projects/service/config_test.go` -- Cập nhật kiểm thử `ConfigService`.
- [x] `projects/service/request_test.go` -- Cập nhật kiểm thử `RequestService`.
- [x] `projects/app_test.go` -- Cập nhật kiểm thử `App`.

**Acceptance Criteria:**
- [x] Given backend Go, when chạy `go test -C projects -v -count=1 ./...`, then 100% test suites pass không có lỗi biên dịch hay runtime.
- [x] Given `CreateCollection`, when tạo collection mới, then thư mục được tạo là `<uuid>/` và `collection.json` chứa `id: "<uuid>"`.
- [x] Given `RenameCollection`, when đổi tên, then tên file/thư mục trên đĩa không thay đổi.
- [x] Given `DeleteCollection("default")`, when thực thi, then trả về lỗi cấm xóa collection mặc định.

## Implementation Notes
- All backend services (`CollectionService`, `ConfigService`, `RequestService`, `ImporterService`) and `App` bindings updated to use `id` consistently instead of `slug`.
- Directory and file naming transitioned to pure UUID (`<uuid>/`, `<uuid>.json`).
- All Go tests passing 100% via `go test -C projects ./...`.

## Spec Change Log
- 2026-10-13: Story 2 completed and verified.

## Review Triage Log
- All automated unit test suites passed 100%.

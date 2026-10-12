---
title: 'Backend CRUD Collection & Quy chuẩn Naming Slug-UUID'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_commit: 'c740210e9465f59655dd485d3df9e9519669bf2b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-multi-collection/SPEC.md
  - _bmad-output/specs/spec-multi-collection/storage-structure.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** hecto-api hiện chỉ hỗ trợ một thư mục collection root mặc định, chưa cho phép người dùng quản lý nhiều collection độc lập; đồng thời quy ước đặt tên file/thư mục hiện tại dùng hậu tố đếm số (slug-1, slug-2) dễ xung đột dữ liệu đa máy và thiếu tính duy nhất.

**Approach:** Cập nhật AppConfig và ConfigService để quản lý `collections_root`, `default_collection`, `active_collection`; chuẩn hóa quy tắc sinh tên file/thư mục thành `<slug>-<UUID>`; triển khai đầy đủ các Wails bindings cho Collection CRUD (List, Create, Rename, Delete, Duplicate, Switch) kèm cơ chế bảo vệ an toàn cho collection `default`.

## Boundaries & Constraints

**Always:**
- Định dạng lưu trữ 100% file-based JSON trên disk nội bộ; tuyệt đối không dùng cơ sở dữ liệu.
- Tên thư mục collection mới, folder con, và file request/environment phải tuân theo quy chuẩn `<slug>-<UUID>`.
- Collection mặc định có slug/folder là `default` và luôn luôn tồn tại; tuyệt đối cấm xóa collection `default`.
- Thao tác đổi tên (Rename) chỉ cập nhật trường `name` trong file metadata JSON, giữ nguyên tên thư mục trên disk (tuân thủ AD-4).
- Khi xóa active collection, hệ thống phải tự động chuyển active collection về `default_collection` trước khi xóa thư mục khỏi disk.
- Chuyển đổi collection (`SwitchCollection`) phải cập nhật config, trỏ lại collection root trong App và kích hoạt rebuild index.

**Never:**
- Không hỗ trợ cloud sync, merge/diff giữa các collection, hay mật khẩu/phân quyền (Non-goals).
- Không đổi tên thư mục trên disk khi đổi tên hiển thị (AD-4).
- Không cho phép xóa collection mặc định `default`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List Collections | collections_root có các thư mục collection | Trả về danh sách `[]model.Collection` với đầy đủ `slug`, `name`, `is_default`, `is_active` | Trả về mảng rỗng nếu thư mục trống |
| Create Collection | `name = "Dự án mới"` | Tạo folder `<slug>-<UUID>`, tạo `collection.json`, tạo `environments/`, trả về Collection struct | Tên rỗng -> lỗi VALIDATION |
| Rename Collection | `slug = "<slug>-<UUID>"`, `newName = "Tên mới"` | Cập nhật `name` trong `collection.json`, giữ nguyên thư mục trên disk | `slug` không tồn tại -> lỗi NOT_FOUND; `newName` rỗng -> lỗi VALIDATION |
| Delete Collection thường | `slug = "<slug>-<UUID>"` (không active) | Xóa toàn bộ thư mục collection khỏi disk | `slug` không tồn tại -> lỗi NOT_FOUND |
| Delete Collection active | `slug = "<slug>-<UUID>"` (đang active) | Tự động chuyển `active_collection` về `default`, cập nhật config và collRoot, sau đó xóa thư mục | `slug` không tồn tại -> lỗi NOT_FOUND |
| Delete Collection default | `slug = "default"` | Từ chối thao tác, không xóa bất cứ gì trên disk | Trả về lỗi VALIDATION "Không thể xóa collection mặc định" |
| Duplicate Collection | `slug = "<slug>-<UUID>"` | Nhân bản toàn bộ cây thư mục sang `<slug-ban-sao>-<UUID_mới>`, cập nhật `collection.json` với name mới | `slug` không tồn tại -> lỗi NOT_FOUND |
| Switch Collection | `slug = "<slug>-<UUID>"` hoặc `"default"` | Cập nhật `active_collection` và `collection_root` trong config.json, cập nhật `a.collRoot`, rebuild index | `slug` không tồn tại -> lỗi NOT_FOUND |
| Create Folder / Request / Env Naming | `name` từ người dùng hoặc mặc định | Sinh thư mục con / file với tên dạng `<slug>-<UUID>` / `<slug>-<UUID>.json` | Tên rỗng fallback về "untitled-<UUID>" |

</frozen-after-approval>

## Code Map

- `projects/model/config.go` -- Bổ sung `CollectionsRoot`, `DefaultCollection`, `ActiveCollection` vào `AppConfig`.
- `projects/model/types.go` -- Bổ sung trường `Slug`, `IsDefault`, `IsActive` vào `Collection`.
- `projects/slug/slug.go` -- Thêm tiện ích `EntityDir` và `EntityFilename` sinh định dạng `<slug>-<UUID>` và `<slug>-<UUID>.json`.
- `projects/service/config.go` -- Quản lý `collections_root`, `default_collection`, `active_collection`, khởi tạo chuẩn hóa.
- `projects/service/collection.go` -- Hiện thực các hàm CRUD Collection (List, Create, Rename, Delete, Duplicate), áp dụng `EntityDir` và `EntityFilename` cho Folder và Request.
- `projects/service/request.go` -- Cập nhật `Duplicate` sử dụng `EntityFilename`.
- `projects/storage/environment.go` -- Cập nhật `SaveEnvironment` sử dụng `EntityFilename`.
- `projects/service/importer.go` -- Cập nhật import Postman sử dụng `EntityDir` và `EntityFilename`.
- `projects/app.go` -- Khai báo các Wails bindings: `ListCollections`, `CreateCollection`, `RenameCollection`, `DeleteCollection`, `DuplicateCollection`, `SwitchCollection`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/config.go` -- Cập nhật struct `AppConfig` với các trường `collections_root`, `default_collection`, `active_collection`.
- [x] `projects/model/types.go` -- Cập nhật struct `Collection` với `Slug`, `IsDefault`, `IsActive`.
- [x] `projects/slug/slug.go` -- Thêm hàm sinh tên `<slug>-<UUID>` (`EntityDir`, `EntityFilename`).
- [x] `projects/slug/slug_test.go` -- Viết unit test cho các hàm sinh tên `<slug>-<UUID>`.
- [x] `projects/service/config.go` -- Cập nhật logic `loadOrCreateConfig`, `Initialize` để quản lý `collections_root`, `default_collection`, `active_collection` và tự động fallback về `default`.
- [x] `projects/service/collection.go` -- Hiện thực `ListCollections`, `CreateCollection`, `RenameCollection`, `DeleteCollection`, `DuplicateCollection`; áp dụng naming `<slug>-<UUID>` trong `CreateFolder`, `CreateRequest`.
- [x] `projects/service/request.go` -- Áp dụng naming `<slug>-<UUID>.json` trong `Duplicate`.
- [x] `projects/storage/environment.go` -- Áp dụng naming `<slug>-<UUID>.json` trong `SaveEnvironment`.
- [x] `projects/service/importer.go` -- Áp dụng naming `<slug>-<UUID>` trong `ImportPostman`.
- [x] `projects/app.go` -- Khai báo các Wails bindings cho Collection CRUD và `SwitchCollection`.
- [x] `projects/service/collection_test.go` -- Viết unit test cho Collection CRUD (List, Create, Rename, Delete, Duplicate, Switch, an toàn default).
- [x] `projects/service/config_test.go` -- Cập nhật unit test cho `AppConfig` mới.

**Acceptance Criteria:**
- Given ứng dụng khởi động lần đầu, when `Initialize` chạy, then cấu trúc `{collections_root}/default/collection.json` và `environments/` được tạo đầy đủ với config chứa `collections_root`, `default_collection: "default"`, `active_collection: "default"`.
- Given người dùng gọi `CreateCollection("Dự án Alpha")`, when thực thi, then thư mục `du-an-alpha-<UUID>` được tạo bên trong `collections_root` chứa `collection.json` và `environments/`, trả về Collection struct hợp lệ.
- Given collection đã tạo, when gọi `RenameCollection` với tên mới, then trường `name` trong `collection.json` được cập nhật nhưng tên thư mục trên disk không đổi.
- Given collection "default", when người dùng gọi `DeleteCollection("default")`, then hệ thống từ chối và trả về lỗi VALIDATION.
- Given collection đang active, when gọi `DeleteCollection`, then hệ thống tự động switch active sang `default` trước khi xóa thư mục khỏi disk.
- Given người dùng gọi `DuplicateCollection`, when thực thi, then một bản sao nguyên vẹn của collection được tạo trong thư mục `<slug>-<UUID_mới>` với tên "(bản sao)".
- Given các collection tồn tại, when gọi `SwitchCollection`, then `active_collection` và `collection_root` được cập nhật trong config, `a.collRoot` được cập nhật và index được rebuild.
- Given tạo mới folder, request, hoặc environment, when lưu trên disk, then tên file/thư mục luôn tuân thủ quy chuẩn `<slug>-<UUID>` và `<slug>-<UUID>.json`.

## Implementation Notes

- Added `CollectionsRoot`, `DefaultCollection`, `ActiveCollection` to `AppConfig` in `projects/model/config.go`.
- Added `Slug`, `IsDefault`, `IsActive` to `Collection` in `projects/model/types.go`.
- Added `EntityDir` and `EntityFilename` in `projects/slug/slug.go` implementing `<slug>-<UUID>` and `<slug>-<UUID>.json`.
- Implemented `ListCollections`, `CreateCollection`, `RenameCollection`, `DeleteCollection`, `DuplicateCollection` in `projects/service/collection.go`.
- Implemented `SwitchActiveCollection` and config validation / fallback to `default` in `projects/service/config.go`.
- Updated naming in `service/request.go` (`Duplicate`), `storage/environment.go` (`SaveEnvironment`), and `service/importer.go` (`ImportPostman`).
- Bound all methods in `projects/app.go` (`ListCollections`, `CreateCollection`, `RenameCollection`, `DeleteCollection`, `DuplicateCollection`, `SwitchCollection`).
- Generated / updated frontend Wails bindings in `projects/frontend/wailsjs/go/models.ts`, `App.d.ts`, and `App.js`.
- All Go unit tests (`go test ./...`) and frontend checks (`vue-tsc --noEmit`, `vitest run`) pass 100%.

## Spec Change Log

## Review Triage Log

| Verdict | Evidence | Route |
|---------|----------|-------|
| high | DeleteCollection với slug `.` hoặc path traversal có thể xóa nhầm toàn bộ thư mục `collectionsRoot`. Cần chặn path traversal và `collDir == collectionsRoot`. | patch |
| high | SwitchCollection, RenameCollection, DuplicateCollection chưa kiểm tra slug hợp lệ (`filepath.Base(slug) == slug && !strings.ContainsAny(slug, "/\\")`). | patch |
| medium | `UpdateCollectionRoot` khi `newRoot == ""` làm `a.collectionsRoot` rỗng thay vì default path; chưa reset `active_collection` về `default` khi đổi storage root mới. | patch |
| medium | `slug.EntityDir` và `slug.EntityFilename` không cắt ngắn stem khiến tổng chiều dài vượt quá 255 byte `NAME_MAX` của filesystem khi cộng thêm UUID. Cần clamp stem. | patch |
| medium | `IsDefault` và `IsActive` trong `model.Collection` thiếu tag `omitempty` khiến dữ liệu runtime bị ghi vào file `collection.json` trên disk. | patch |
| medium | `App` struct thiếu `sync.RWMutex` bảo vệ các trường `collRoot`, `collectionsRoot`, `activeCollection` khi có nhiều frontend calls đồng thời. | patch |
| medium | Thiếu assertion kiểm tra cấu trúc tên file/thư mục thực tế trên disk của `CreateFolder` và `CreateRequest` theo chuẩn `<slug>-<UUID>`. | patch |
| medium | Thiếu unit test cho binding adapter `App.UpdateCollectionRoot`. | patch |
| low | `CreateCollection` chưa cleanup thư mục mồ côi nếu bước tạo `environments/` bị lỗi. | patch |
| low | `RenameCollection` chưa gán đúng `IsDefault` theo slug `default` trước khi trả về kết quả. | patch |
| low | `DeleteCollection` nên trả về active collection mới (default) khi fallback để frontend đồng bộ. | patch |
| low | `ListCollections` nên gán fallback `Collection.ID = coll.Slug` nếu ID trong JSON rỗng. | patch |
| low | Dọn dẹp dead code `resolveDefaultCollectionRoot` trong `projects/service/config.go`. | patch |

**Commands:**
- `go test ./...` in `projects/` -- expected: all Go unit tests pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: TypeScript type check passes.

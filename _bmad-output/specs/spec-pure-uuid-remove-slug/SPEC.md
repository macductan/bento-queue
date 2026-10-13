---
id: SPEC-pure-uuid-remove-slug
companions:
  - storage-structure.md
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Pure UUID & Complete Slug Removal

## Why

Hệ thống trước đây sử dụng cơ chế slug và kết hợp `<slug>-<UUID>` cho tên tệp và thư mục trên đĩa nhằm mục đích dễ đọc bằng mắt thường. Tuy nhiên, việc duy trì cơ chế slug gây ra độ phức tạp không cần thiết trong codebase (chuẩn hóa Unicode NFD, xử lý dấu tiếng Việt, regex cắt nối gạch nối, xử lý đụng độ tên) và tạo sự nhập nhằng giữa định danh thực thể (ID/UUID) và tên tệp vật lý (slug). Việc loại bỏ hoàn toàn khái niệm slug và chuẩn hóa toàn bộ định danh (ID) cùng cấu trúc tệp/thư mục trên đĩa sang UUID v4 thuần giúp tối giản hóa triệt để kiến trúc lưu trữ, loại trừ mã nguồn thừa (dead code elimination), tăng tốc độ xử lý I/O và đảm bảo tính nhất quán tuyệt đối giữa backend Go và frontend Vue.

## Capabilities

- **CAP-1**
  - **intent:** Hệ thống lưu trữ toàn bộ Request, Folder, Environment và Collection dưới dạng ID UUID v4 thuần và tên tệp/thư mục tương ứng trên đĩa (Request: `<uuid>.json`, Folder: `<uuid>/`, Environment: `environments/<uuid>.json`, Collection: `<uuid>/`), ngoại trừ duy nhất Collection mặc định giữ ID và tên thư mục là `default`.
  - **success:** Mọi thao tác tạo mới Request, Folder, Environment hoặc Collection sinh ID là UUID v4 thuần và tạo tệp/thư mục trên đĩa trùng khớp với UUID v4 (kèm đuôi `.json` cho tệp), hoàn toàn không còn bất kỳ tiền tố slug hay chuyển ngữ tiếng Việt nào trên hệ thống tệp.
- **CAP-2**
  - **intent:** Người dùng có thể đổi tên hiển thị (name) của Request, Folder hoặc Collection mà không làm thay đổi ID hay đường dẫn tệp/thư mục vật lý trên ổ đĩa.
  - **success:** Thao tác đổi tên (rename) chỉ cập nhật trường `name` và `updated_at` trong tệp JSON metadata (`<uuid>.json`, `_folder.json`, `collection.json`), trong khi ID và tên tệp/thư mục trên đĩa giữ nguyên vĩnh viễn không bị đổi tên hay di chuyển.
- **CAP-3**
  - **intent:** Hệ thống loại bỏ hoàn toàn khái niệm `slug` khỏi backend Go (Model, Services, App runtime, Error codes), chuẩn hóa toàn bộ interface và định danh sang `ID`.
  - **success:** Struct `model.Collection` không còn trường `Slug`, chỉ lưu trữ `ID`; các method `SwitchCollection`, `RenameCollection`, `DeleteCollection`, `DuplicateCollection` nhận tham số `id` thay cho `slug`; mã lỗi `ErrCollectionSlugEmpty` bị xóa bỏ; toàn bộ backend Go biên dịch và kiểm thử thành công không còn tham chiếu tới `slug`.
- **CAP-4**
  - **intent:** Hệ thống loại bỏ toàn bộ các hàm xử lý slug phức tạp (Unicode NFD, regex hyphens, kebab-case, collision suffix) và cập nhật Service Importer sinh trực tiếp UUID v4 thuần.
  - **success:** Package `slug` được dọn sạch các hàm `Generate`, `GenerateUnique`, `GenerateDir`, `GenerateUniqueDir`, `EntityDir`, `EntityFilename`, `UniqueFilename`; `ImporterService` sinh trực tiếp thư mục `<uuid>/` và tệp `<uuid>.json` cho Folder và Request khi import Postman mà không qua bất kỳ logic slug nào.
- **CAP-5**
  - **intent:** Giao diện người dùng và Store Pinia quản lý và định danh Collection thuần túy qua `activeCollectionId` và `id`, loại bỏ hoàn toàn khái niệm `slug` trên toàn bộ frontend.
  - **success:** `collectionStore.ts` thay thế `activeCollectionSlug` bằng `activeCollectionId`, các action và getter (`switchCollection`, `renameCollection`, `deleteCollection`, `duplicateCollection`, `activeCollection`, `isDefaultActive`) nhận và xử lý `id`; `CollectionSwitcher.vue` và `SettingsModal.vue` cùng các test suite tương ứng không còn trường hoặc tham số `slug`.
- **CAP-6**
  - **intent:** Hệ thống duy trì khả năng đọc và lập chỉ mục đối với dữ liệu cũ có cấu trúc tên file/thư mục bất kỳ (kể cả tên cũ mang dạng slug-UUID) thông qua trường `id` trong file JSON, đồng thời toàn bộ kiểm thử tự động của hệ thống đều vượt qua.
  - **success:** `FindByUUID` và `GetTree` đọc và lập chỉ mục chính xác các file/folder bất kể tên file trên đĩa; 100% Go unit tests (`go test ./...`) và Vitest frontend tests (`bun run test`) và type-check (`bun run type-check`) chạy thành công không có lỗi.

## Constraints

- Định dạng lưu trữ 100% tệp tin file-based JSON trên ổ đĩa nội bộ; tuyệt đối không dùng SQLite, hệ quản trị cơ sở dữ liệu và không yêu cầu đăng nhập tài khoản.
- ID của Request, Folder, Environment và Collection mới tạo bắt buộc là UUID v4 thuần; tên file/thư mục trên đĩa phản ánh trực tiếp ID này (Request: `<uuid>.json`, Folder: `<uuid>/`, Environment: `environments/<uuid>.json`, Collection: `<uuid>/`).
- Collection mặc định có ID và tên thư mục bất biến là `"default"`, hệ thống cấm tuyệt đối thao tác xóa collection `"default"`.
- Thao tác đổi tên (Rename) chỉ cập nhật trường `name` trong metadata JSON, tuyệt đối không di chuyển hay đổi tên file/folder vật lý trên đĩa.
- Loại bỏ hoàn toàn trường `slug` trong `model.Collection` và interface API; xóa bỏ hoàn toàn các hàm chuyển đổi tiếng Việt (Unicode NFD, regex hyphens) trong package `projects/slug/`.
- Giữ nguyên cơ chế đọc theo trường `id` bên trong file JSON của `storage.FileSystem` (`walkJSONEntities`, `FindByUUID`) để tương thích ngược 100% với dữ liệu hiện có.
- Frontend package manager bắt buộc dùng `bun` (Node 24 via nvm), backend Go 1.25.0. Không được tự ý commit hay push mà chưa có sự đồng ý của người dùng.

## Non-goals

- Không viết script hoặc cơ chế tự động quét đổi tên hàng loạt các file/folder cũ của người dùng sang UUID thuần (hệ thống tự động tương thích ngược đọc dữ liệu cũ qua trường `id` trong metadata).
- Không thay đổi cấu trúc schema bên trong các file Request, Folder, Environment (chỉ loại bỏ trường `slug` trong `model.Collection`).
- Không can thiệp hay thay đổi logic phân giải biến môi trường, xác thực hoặc flow thực thi HTTP request.

## Success signal

- Khi người dùng tạo một Collection mới "Thanh Toán", thư mục trên đĩa được lưu thuần túy là `<uuid>/` (không có chữ `thanh-toan`), bên trong tạo folder "Xác thực" được lưu là `<uuid>/`, request "Đăng nhập" được lưu là `<uuid>.json`, và environment được lưu là `environments/<uuid>.json`. Khi đổi tên hiển thị của bất kỳ thực thể nào, tên file/thư mục trên đĩa giữ nguyên 100%. Toàn bộ mã nguồn backend và frontend không còn bất kỳ vết tích nào của khái niệm `slug`. Mọi bài test backend (`go test ./...`) và frontend (`bun run test`) đều pass 100%.

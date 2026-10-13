---
title: 'Story 1: Backend Models, Storage & Package slug Cleanup'
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

**Problem:** Hệ thống trước đây sử dụng slug tiếng Việt kết hợp `<slug>-<UUID>` làm phát sinh nhiều mã xử lý Unicode NFD, regex rườm rà trong `projects/slug/`, tạo sự nhập nhằng giữa ID và tên tệp/thư mục, và trường `Slug` trong struct `model.Collection` không còn cần thiết khi toàn bộ hệ thống chuyển sang Pure UUID v4.

**Approach:** Xóa bỏ hoàn toàn trường `Slug` trong `model.Collection`, dọn sạch toàn bộ các hàm xử lý slug tiếng Việt / regex trong package `projects/slug/` để thay bằng các helper tối giản thuần UUID, và chuẩn hóa `storage.SaveEnvironment` để lưu tệp môi trường trực tiếp dưới dạng `environments/<uuid>.json` kèm kiểm thử tương thích ngược.

## Boundaries & Constraints

**Always:**
- Struct `model.Collection` chỉ dùng `ID string json:"id,omitempty"`, các model `Request`, `Folder`, `Environment` chỉ dùng `ID`.
- Package `projects/slug/` chỉ cung cấp các helper sinh UUID và tên tệp/thư mục tối giản (`UUID()`, `Filename()`, `Dir()`), loại bỏ hoàn toàn các hàm chuyển đổi Unicode NFD tiếng Việt và regex.
- `storage.SaveEnvironment` tạo mới file môi trường trực tiếp tại `environments/<uuid>.json` khi `ID` là UUID v4 (hoặc tự sinh UUID v4 mới nếu rỗng).
- Giữ vững tương thích ngược trong `storage.FileSystem`: Đọc, cập nhật và xóa các tệp môi trường cũ có định dạng tên bất kỳ bằng cách khớp trường `id` trong nội dung JSON.
- Toàn bộ unit test cho `projects/model/...`, `projects/slug/...`, `projects/storage/...` phải pass 100%.

**Never:**
- Không sửa đổi logic của Story 2 (`projects/service/`, `projects/app.go`, Importer) hoặc Story 3 (Frontend Pinia Store, Vue components) trong phạm vi Story 1.
- Không tự ý commit hoặc push Git mà không có sự đồng ý rõ ràng từ người dùng.
- Không tự ý xóa bỏ cơ chế quét theo `id` nội dung của `FileSystem` nhằm bảo toàn tương thích ngược cho dữ liệu cũ.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Serialize Collection model | `model.Collection{ID: "col-1", Name: "Col"}` | JSON output có `"id": "col-1"` và không có key `"slug"` | N/A |
| Generate UUID | Gọi `slug.UUID()` | Trả về chuỗi UUID v4 hợp lệ 36 ký tự | N/A |
| Generate Filename với ID cụ thể | Gọi `slug.Filename("abc-123")` | Trả về `"abc-123.json"` | N/A |
| Generate Filename không truyền ID | Gọi `slug.Filename()` | Trả về `<new-uuid>.json` (36 ký tự UUID + `.json`) | N/A |
| Generate Dir với ID cụ thể | Gọi `slug.Dir("folder-123")` | Trả về `"folder-123"` | N/A |
| Generate Dir không truyền ID | Gọi `slug.Dir()` | Trả về `<new-uuid>` (36 ký tự UUID) | N/A |
| SaveEnvironment tạo mới | `env.ID = ""` hoặc `env.ID = "<uuid>"` | Tạo tệp `environments/<uuid>.json` với metadata JSON chuẩn | Trả về lỗi nếu không ghi được tệp |
| SaveEnvironment cập nhật file cũ | File cũ tên `moi-truong-legacy-id.json` có ID `legacy-id` | Cập nhật nội dung tại chính file `moi-truong-legacy-id.json`, không đổi tên file | Trả về lỗi nếu file không thể ghi |
| Get/Delete Environment cũ | ID tồn tại trong file có tên cũ | Tìm thấy và xóa chính xác file cũ dựa theo trường `id` | Trả về `ErrNotFound` nếu ID không tồn tại |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` -- Xóa trường `Slug string json:"slug"` trong `Collection`.
- `projects/model/types_test.go` -- Unit test kiểm tra serialization của `Collection` và các model thực thể.
- `projects/slug/slug.go` -- Loại bỏ toàn bộ hàm slug phức tạp, bổ sung các helper tối giản thuần UUID (`UUID`, `Filename`, `Dir`, `RequestFilename`, `EnvironmentFilename`, `FolderDir`, `CollectionDir`).
- `projects/slug/slug_test.go` -- Viết lại test suite kiểm thử toàn diện các helper pure-UUID mới.
- `projects/storage/environment.go` -- Cập nhật `SaveEnvironment` lưu file `environments/<uuid>.json` cho môi trường mới.
- `projects/storage/environment_test.go` -- Cập nhật kiểm thử CRUD environment với định dạng tên `<uuid>.json` và test tương thích ngược với file cũ.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go` -- Xóa trường `Slug` khỏi struct `Collection`, giữ nguyên `ID string json:"id,omitempty"`.
- [x] `projects/model/types_test.go` -- Viết unit test xác nhận JSON serialize/deserialize của `Collection` không chứa trường `slug`.
- [x] `projects/slug/slug.go` -- Dọn dẹp package `slug`: xóa Unicode NFD, regex hyphens, `Generate`, `GenerateUnique`, `GenerateDir`, `GenerateUniqueDir`, `EntityDir`, `EntityFilename`, `UniqueFilename`; thêm `UUID()`, `Filename(id ...string)`, `Dir(id ...string)`, `RequestFilename(id ...string)`, `EnvironmentFilename(id ...string)`, `FolderDir(id ...string)`, `CollectionDir(id ...string)`.
- [x] `projects/slug/slug_test.go` -- Viết lại unit test cho package `slug` kiểm thử định dạng UUID, tên file `.json` và tên thư mục.
- [x] `projects/storage/environment.go` -- Chuẩn hóa `SaveEnvironment`: tạo mới dùng UUID thuần lưu file `environments/<uuid>.json`, cập nhật giữ nguyên file hiện có.
- [x] `projects/storage/environment_test.go` -- Cập nhật test cases sang định dạng `<id>.json` và bổ sung test case xác thực khả năng đọc/ghi file legacy slug.

**Acceptance Criteria:**
- Given struct `model.Collection`, when serialized to JSON, then trường `slug` không xuất hiện trong JSON output.
- Given package `projects/slug`, when gọi `slug.UUID()`, then trả về chuỗi 36 ký tự UUID v4 hợp lệ.
- Given package `projects/slug`, when gọi `slug.Filename("my-id")`, then trả về `"my-id.json"`.
- Given package `projects/slug`, when gọi `slug.Dir("my-id")`, then trả về `"my-id"`.
- Given một Environment mới chưa có file, when gọi `SaveEnvironment(root, env)`, then file được tạo trực tiếp tại `environments/<uuid>.json`.
- Given một Environment cũ có tên tệp dạng `<slug>-<id>.json`, when gọi `GetEnvironment`, `SaveEnvironment` (cập nhật) hoặc `DeleteEnvironment`, then thao tác thành công trên chính tệp cũ.
- Given bộ kiểm thử backend, when chạy `go test -C projects ./model/... ./slug/... ./storage/...`, then 100% test suites pass không có lỗi.

## Implementation Notes

- `projects/model/types.go`: Xóa bỏ trường `Slug string json:"slug"` trong struct `Collection`. Giữ nguyên `ID string json:"id,omitempty"`.
- `projects/model/types_test.go`: Tạo test suite kiểm thử JSON marshaling/unmarshaling cho `Collection` và các entity models, xác nhận không còn key `slug`.
- `projects/slug/slug.go`: Dọn sạch các hàm Unicode NFD, regex hyphens và các hàm `Generate*`, `EntityDir`, `EntityFilename`, `UniqueFilename`. Triển khai các helper Pure UUID: `UUID()`, `Filename()`, `Dir()`, `RequestFilename()`, `EnvironmentFilename()`, `FolderDir()`, `CollectionDir()`.
- `projects/slug/slug_test.go`: Viết lại unit test toàn diện cho các helper mới.
- `projects/storage/environment.go`: Cập nhật `SaveEnvironment` để lưu file mới dạng `environments/<uuid>.json` bằng `slug.EnvironmentFilename(env.ID)`. Giữ cơ chế cập nhật in-place đối với file legacy.
- `projects/storage/environment_test.go`: Cập nhật các test case theo tên file `<id>.json` và thêm test `TestEnvironmentStorage_LegacySlugFile` kiểm thử backward compatibility.
- Chạy kiểm thử `go test -C projects -v -count=1 ./model/... ./slug/... ./storage/...` pass 100%.

## Spec Change Log

## Review Triage Log

- `low` -- projects/slug/slug.go: Bổ sung strings.TrimSpace và strip suffix .json trước khi sinh tên file để tránh whitespace ID và đuôi .json kép (Đã patch).
- `low` -- projects/slug/slug_test.go: Thêm test case cho whitespace ID và deduplicate .json (Đã patch).
- `low` -- projects/storage/environment.go: Kiểm tra rỗng cho ID trong GetEnvironment, DeleteEnvironment; chỉ quét tìm file cũ khi env.ID không rỗng trong SaveEnvironment (Đã patch).
- `low` -- projects/model/types.go: Cập nhật comment cũ tham chiếu tới slug (Đã patch).
- `defer` -- projects/service: Lỗi biên dịch tạm thời tại projects/service/ và app.go do Story 1 chưa migrate service layer; chuyển tiếp xử lý theo đúng kế hoạch trong Story 2.

## Design Notes

Helper trong `projects/slug/`:
```go
func UUID() string {
    return uuid.NewString()
}

func Filename(id ...string) string {
    if len(id) > 0 && id[0] != "" {
        return id[0] + ".json"
    }
    return uuid.NewString() + ".json"
}

func Dir(id ...string) string {
    if len(id) > 0 && id[0] != "" {
        return id[0]
    }
    return uuid.NewString()
}
```

## Verification

**Commands:**
- `go test -C projects -v ./model/... ./slug/... ./storage/...` -- expected: PASS tất cả test packages
- `git status` -- expected: các tệp thay đổi sạch và nằm trong phạm vi chỉ định

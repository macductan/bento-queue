---
title: 'Story 1: Backend Models, Storage & Services for Collection & Folder Environments'
type: 'feat'
created: '2026-10-13'
status: 'done'
baseline_commit: '9abf400598fe525030bbdca1440de86ad6f8caa2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-folder-collection-env/SPEC.md'
  - '_bmad-output/specs/spec-folder-collection-env/environment-architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại struct `model.Collection` trong Go chưa có trường `Variables` để lưu trữ biến cấp Collection trong `collection.json`, và struct `model.Folder` cũng như `model.TreeNode` chỉ có `Variables []KVPair` (dùng chung cho mọi môi trường) mà chưa có cơ chế lưu trữ biến riêng cho từng môi trường (`folder-env` theo từng Environment ID). Hơn nữa, `CollectionService` chưa hỗ trợ lưu trữ biến Collection vào `collection.json`.

**Approach:** Mở rộng struct `model.Collection` bổ sung `Variables []KVPair json:"variables,omitempty"`; mở rộng struct `model.Folder` và `model.TreeNode` bổ sung `FolderEnvs map[string][]KVPair json:"folder_envs,omitempty"` (giữ nguyên `Variables` làm folder global env). Cập nhật `CollectionService` với phương thức `UpdateCollection` hỗ trợ cập nhật và lưu trữ `name`, `description`, `variables` vào `collection.json`, cập nhật `UpdateFolder` lưu `FolderEnvs` vào `_folder.json`, và cập nhật `buildFolderNode` để truyền `FolderEnvs` vào cây thư mục. Đảm bảo tương thích ngược 100% cho dữ liệu cũ và tuân thủ quy tắc an toàn dữ liệu kiểm thử (Mục 19).

## Boundaries & Constraints

**Always:**
- Struct `model.Collection` có trường `Variables []KVPair json:"variables,omitempty"`.
- Struct `model.Folder` và `model.TreeNode` có trường `FolderEnvs map[string][]KVPair json:"folder_envs,omitempty"` song song với `Variables []KVPair`.
- Tương thích ngược: Đọc tệp `collection.json` cũ không có trường `variables` thì deserialize thành mảng rỗng `[]`; đọc tệp `_folder.json` cũ không có trường `folder_envs` thì deserialize thành map rỗng `{}` mà không báo lỗi.
- `CollectionService.UpdateCollection` đọc `collection.json` hiện tại, cập nhật `name`, `description`, `variables`, cập nhật `updated_at`, và ghi lại tệp an toàn.
- `CollectionService.UpdateFolder` cập nhật và lưu cả `Variables` và `FolderEnvs` vào `_folder.json`.
- **Quy tắc an toàn kiểm thử (Mục 19):** Mọi bài kiểm thử Go backend chỉ được phép chạy trên thư mục tạm `t.TempDir()` hoặc collection mang tên `Test-Collection`. Tuyệt đối không can thiệp vào collection `default` hay dữ liệu người dùng thật. Mọi collection thử nghiệm tạo ra phải tự động xóa dọn dẹp sau khi kiểm thử kết thúc.
- Toàn bộ backend unit tests (`go test ./...`) phải pass 100%.

**Never:**
- Không xóa bỏ hoặc thay đổi kiểu dữ liệu của trường `Variables` trong `Folder` (bảo toàn tính tương thích cho folder global env).
- Không can thiệp sang mã nguồn frontend hay logic giải mã biến của Story 2 và Story 3.
- Không tự ý commit hoặc push Git khi chưa có sự xác nhận của người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Serialize Collection với biến | `Collection{ID: "c-1", Variables: [{Key: "v1", Value: "1", Enabled: true}]}` | JSON chứa `"variables": [{"key": "v1", "value": "1", "enabled": true}]` | N/A |
| Deserialize Collection cũ | JSON không có field `"variables"` | Struct được parse thành công với `Variables` rỗng (`nil` hoặc `len == 0`) | Không trả lỗi |
| Serialize Folder với FolderEnvs | `Folder{ID: "f-1", FolderEnvs: {"env-1": [{Key: "k", Value: "v", Enabled: true}]}}` | `_folder.json` chứa `"folder_envs": {"env-1": [...]}` | N/A |
| Deserialize Folder cũ | `_folder.json` không có field `"folder_envs"` | Struct được parse thành công với `FolderEnvs` rỗng (`nil` hoặc `len == 0`) | Không trả lỗi |
| UpdateCollection thành công | `Collection{ID: "c-1", Name: "New Name", Variables: [...]}` | Tệp `collection.json` được ghi lại với các giá trị mới, trả về `Result{Success: true}` | Báo lỗi `ErrNotFound` nếu collection không tồn tại |
| UpdateFolder với FolderEnvs | Gọi `UpdateFolder` với folder chứa `FolderEnvs` | Tệp `_folder.json` lưu giữ đầy đủ cả `Variables` và `FolderEnvs` | Báo lỗi `ErrNotFound` nếu folder không tồn tại |
| GetTree trả về TreeNode | Folder có `_folder.json` chứa `folder_envs` | `TreeNode` tương ứng có trường `folder_envs` phản ánh chính xác cấu hình | Báo lỗi I/O nếu không đọc được |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` -- Thêm `Variables []KVPair` vào `Collection`, thêm `FolderEnvs map[string][]KVPair` vào `Folder` và `TreeNode`.
- `projects/model/types_test.go` -- Unit tests kiểm thử serialization/deserialization cho `Collection` và `Folder` có và không có các trường mới.
- `projects/service/collection.go` -- Cập nhật `buildFolderNode` gán `FolderEnvs`; cập nhật `UpdateFolder` lưu `FolderEnvs`; triển khai `UpdateCollection` hỗ trợ cập nhật `variables` và metadata vào `collection.json`.
- `projects/service/collection_test.go` -- Unit tests kiểm thử `UpdateCollection`, `UpdateFolder` với `FolderEnvs`, tương thích ngược và quy tắc test cô lập `Test-Collection` / `t.TempDir()`.
- `projects/app.go` -- Điều chỉnh method `App.UpdateCollection` để chuyển tiếp gọi `collSvc.UpdateCollection`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go`: Bổ sung `Variables []KVPair json:"variables,omitempty"` vào struct `Collection`.
- [x] `projects/model/types.go`: Bổ sung `FolderEnvs map[string][]KVPair json:"folder_envs,omitempty"` vào struct `Folder` và `TreeNode`.
- [x] `projects/model/types_test.go`: Viết unit tests kiểm thử JSON marshaling và unmarshaling của `Collection` và `Folder` (bao gồm backward compatibility khi thiếu trường).
- [x] `projects/service/collection.go`: Cập nhật `buildFolderNode` truyền `folder.FolderEnvs` sang `TreeNode.FolderEnvs`.
- [x] `projects/service/collection.go`: Cập nhật `UpdateFolder` cập nhật `existingFolder.FolderEnvs = folder.FolderEnvs` khi ghi vào `_folder.json`.
- [x] `projects/service/collection.go`: Triển khai `UpdateCollection(collectionsRoot string, coll model.Collection) model.Result` đọc `collection.json`, cập nhật `Name`, `Description`, `Variables`, `UpdatedAt`, ghi lại tệp và trả về model cập nhật.
- [x] `projects/app.go`: Cập nhật method `UpdateCollection` gọi `a.collSvc.UpdateCollection(cRoot, collection)`.
- [x] `projects/service/collection_test.go`: Viết unit tests kiểm tra `UpdateCollection` lưu biến, `UpdateFolder` lưu `FolderEnvs`, `GetTree` trả về `FolderEnvs`, đảm bảo sử dụng `t.TempDir()` và dọn dẹp sạch.

**Acceptance Criteria:**
- Given struct `model.Collection`, when serialized and deserialized with `Variables`, then dữ liệu key, value, enabled được bảo toàn nguyên vẹn.
- Given một tệp `collection.json` không có trường `variables`, when đọc qua storage, then struct nạp thành công với `Variables` rỗng không phát sinh lỗi.
- Given struct `model.Folder`, when chứa `FolderEnvs` theo từng environment ID, then `UpdateFolder` ghi chính xác vào `_folder.json`.
- Given `GetTree`, when một thư mục có `folder_envs`, then `TreeNode` trả về cho frontend chứa đầy đủ `folder_envs`.
- Given `UpdateCollection`, when truyền danh sách biến mới, then tệp `collection.json` cập nhật đúng biến và thời gian `updated_at`.
- Given bộ kiểm thử backend, when chạy `go test -C projects -v ./...`, then 100% tests pass và tuân thủ quy tắc cô lập test, không để lại file rác.

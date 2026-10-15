# Spec: Smart JSON Editor, Extended Body Payloads & Environment-Scoped Authentication

## Summary

Giai đoạn 2 nâng cấp trình soạn thảo Request Body và hệ thống xác thực (Authentication) của **hecto-api**:
1. **Smart JSON Editor (Mục 25):** Bổ sung tô màu cú pháp JSON (syntax highlighting) kết hợp hiển thị biến môi trường `{{var}}`, nút **Format / Prettify JSON**, và cảnh báo lỗi cú pháp JSON trực tiếp kèm vị trí dòng/cột.
2. **Đa dạng hóa định dạng Body Payloads (Mục 26):** Mở rộng Body hỗ trợ thêm `xml` (`application/xml`), `urlencoded` (`application/x-www-form-urlencoded` với bảng Key-Value), và `formdata` (`multipart/form-data` với bảng Key-Value và tạo multipart boundary trong Go `ExecutorService`), đồng bộ xuyên suốt với `RequestTabs`, `DefaultHeadersTable`, `buildExecuteRequest`, và công cụ sinh/phân tích `cURL`.
3. **Authentication theo từng Environment hoặc Global (Mục 34):** Cho phép cấu hình Auth riêng cho từng Environment hoặc dùng chung (Global) tại cả 3 cấp **Collection**, **Folder**, và **Request**, tự động phân giải theo chuỗi kế thừa `Request (Env -> Global) > Folder (Env -> Global) > Collection (Env -> Global)`.

## Capabilities

- **CAP-1 — Smart JSON Editor (Syntax Highlighting, Prettify & Syntax Validation - Mục 25):**
  - Khi loại Body là `json`, trình soạn thảo hiển thị tô màu cú pháp cho các thành phần JSON (property keys, string literals, numbers, booleans, `null`) đồng thời giữ nguyên highlight cho các biến `{{variable}}`.
  - Cung cấp nút **Format JSON** (`data-test="prettify-json-btn"`) giúp chuẩn hóa và căn lề JSON (2 spaces) ngay cả khi nội dung có chứa biến `{{variable}}`.
  - Kiểm tra cú pháp JSON theo thời gian thực (hỗ trợ cả các placeholder `{{variable}}` hợp lệ) và hiển thị thanh báo lỗi (`data-test="json-error-banner"`) kèm thông tin dòng/cột khi cú pháp không hợp lệ.

- **CAP-2 — Extended Body Payloads: XML, `x-www-form-urlencoded`, `multipart/form-data` (Mục 26):**
  - Dropdown chọn loại Body trên `RequestTabs.vue` (`data-test="body-type-select"`) hỗ trợ 6 chế độ: `none`, `json`, `xml`, `text`, `urlencoded` (`x-www-form-urlencoded`), và `formdata` (`multipart/form-data`).
  - Tự động gắn header `Content-Type` mặc định tương ứng (`application/json`, `application/xml`, `application/x-www-form-urlencoded`, `multipart/form-data`) khi người dùng chưa ghi đè thủ công.
  - Chế độ `urlencoded` và `formdata` hiển thị bảng Key-Value (`KvpEditor`) hỗ trợ bật/tắt từng dòng và biến môi trường `{{variable}}`.
  - Go `ExecutorService.Send` hỗ trợ đóng gói `multipart/form-data` từ danh sách `FormData` (`[]model.KVPair`) với boundary chuẩn RFC 2046.
  - `generateCurlCommand` và `parseCurlCommand` hỗ trợ đầy đủ `--data-urlencode`, `-F` / `--form`, và `application/xml`.

- **CAP-3 — Environment-Scoped & Global Authentication (Mục 34):**
  - `AuthEditor.vue` cung cấp bộ chọn phạm vi môi trường (`data-test="auth-env-scope-select"`): **Global (Mọi môi trường)** hoặc từng **Environment** cụ thể.
  - Hỗ trợ lưu trữ `auth` (Global) và `auth_envs` (`map[envId]AuthConfig`) trên cả **Request**, **Folder**, và **Collection** (bổ sung tab Auth trong hộp thoại cấu hình Collection `CollectionEnvModal.vue`).
  - Hàm `resolveEffectiveAuth` phân giải cấu hình Auth hiệu lực theo thứ tự:
    1. Request Auth theo `activeEnvId` (nếu khác `'inherit'`) -> Request Global Auth (nếu khác `'inherit'`).
    2. Folder Auth từ thư mục cha gần nhất lên thư mục gốc: tại mỗi Folder xét `auth_envs[activeEnvId]` trước, sau đó đến Folder Global `auth`.
    3. Collection Auth: xét `collection.auth_envs[activeEnvId]` trước, sau đó đến `collection.auth`.
    4. Mặc định `{ type: 'none' }`.

## Non-Goals & Constraints

- **An toàn dữ liệu kiểm thử (Mục 19):** Mọi kiểm thử tự động chỉ sử dụng `Test-Collection` hoặc `t.TempDir()`, tuyệt đối không tác động dữ liệu thật của người dùng.
- **Tương thích ngược JSON trên đĩa:** Các trường mới (`form_data`, `urlencoded`, `auth_envs`, `auth` trong `collection.json`) đều dùng `omitempty` để tương thích 100% với các file JSON hiện có.

##Companion Artifacts

- Architecture & Technical Design: [`smart-editor-and-payloads-architecture.md`](./smart-editor-and-payloads-architecture.md)
- Story Breakdown: [`stories.yaml`](./stories.yaml)

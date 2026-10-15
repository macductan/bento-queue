---
title: "Scripting Engine, Request Execution History & Changelog, and Local Mock HTTP Server"
status: ready-for-build
created: 2026-10-15
updated: 2026-10-15
---

# Specification: Scripting Engine, History & Changelog, and Local Mock Server

## 1. Executive Summary

Giai đoạn 3 hoàn thiện bộ tính năng nâng cao cho **hecto-api** (offline-first desktop API client):
1. **Pre-request & Post-response Script Runner (Mục 32):** Cho phép viết kịch bản JavaScript chạy trước khi gửi request (`pre_request`) và sau khi nhận response (`post_response`) với đối tượng `pm` tương thích Postman (`pm.environment.get(k)`, `pm.environment.set(k, v)`, `pm.response.json()`, `pm.response.text()`, `pm.response.code`).
2. **Request Execution History & Change History / Changelog (Mục 12 & 5):** Lưu trữ lịch sử các lần gọi API (Request Execution History) và lịch sử thay đổi cấu hình/dữ liệu (Changelog) theo từng Collection trên đĩa, cho phép tra cứu và khôi phục lại request/response bất kỳ lúc nào.
3. **Local Mock HTTP Server (Mục 13):** Tích hợp HTTP server cục bộ (`127.0.0.1:<port>`) ngay trong Go backend, cho phép định nghĩa các Mock Route (Method, Path, Status Code, Headers, Response Body, Delay) và trả về mock response thực tế cho client hoặc cho chính hecto-api.

## 2. Capabilities (CAP)

### CAP-1: Pre-request & Post-response Script Runner (Mục 32)
- **Lưu trữ theo Request:** Mở rộng `model.Request` với trường `scripts: { pre_request: string, post_response: string }` (`json:"scripts,omitempty"`).
- **Tab Scripts trên UI:** Bổ sung tab `Scripts` trong `RequestTabs.vue` và component `ScriptEditor.vue` cung cấp trình soạn thảo Pre-request Script (`data-test="pre-request-script-input"`), Post-response Script (`data-test="post-response-script-input"`), các nút chèn nhanh đoạn mã mẫu (`pm.environment.get`, `pm.environment.set`, `pm.response.json()`), và khung hiển thị kết quả log/lỗi thực thi script (`data-test="script-execution-output"`).
- **API `pm` hỗ trợ:**
  - `pm.environment.get(key: string): string | undefined` — Lấy giá trị biến hiệu lực hiện tại.
  - `pm.environment.set(key: string, value: unknown): void` — Cập nhật biến ngay trong bộ nhớ thực thi (để Pre-request script áp dụng ngay vào URL/Headers/Auth/Body của request đang gửi) đồng thời lưu bền vững vào Environment đang kích hoạt (hoặc biến Collection nếu chưa chọn Environment).
  - `pm.variables.get(key)` / `pm.variables.set(key, value)` — Alias tương đương.
  - `pm.response.json(): any` — Parse body JSON của response vừa nhận được (chỉ có trong Post-response script).
  - `pm.response.text(): string`, `pm.response.code: number`, `pm.response.status: string`, `pm.response.headers: Record<string, string[]>`, `pm.response.responseTime: number`.
  - Hỗ trợ `console.log`, `console.warn`, `console.error` ghi nhận vào danh sách log thực thi script.

### CAP-2: Request Execution History & Changelog (Mục 12 & 5)
- **Request Execution History (Mục 12):**
  - Tự động ghi nhận mỗi lần thực thi request vào `<collectionRoot>/.history/executions.json` (giới hạn tối đa 100 bản ghi mới nhất).
  - Lưu trữ: `id`, `collection_id`, `request_id`, `request_name`, `method`, `url`, `status_code`, `status_text`, `time_ms`, `size_bytes`, `timestamp`, `request`, `response`, `error`.
  - Cho phép xem danh sách lịch sử thực thi trong `HistoryModal.vue` (`data-test="history-tab-executions"`), nhấn chọn để nạp lại (`data-test="restore-execution-btn"`) kết quả response/request, hoặc xóa toàn bộ lịch sử (`data-test="clear-executions-btn"`).
- **Change History / Changelog (Mục 5):**
  - Tự động ghi nhận các thao tác thay đổi (`create`, `update`, `rename`, `delete`, `duplicate`) đối với Request, Folder, Collection và Environment vào `<collectionRoot>/.history/changelog.json` (giới hạn tối đa 200 bản ghi mới nhất).
  - Cho phép xem danh sách lịch sử thay đổi trong `HistoryModal.vue` (`data-test="history-tab-changelog"`), lọc theo thực thể và xóa lịch sử thay đổi (`data-test="clear-changelog-btn"`).

### CAP-3: Local Mock HTTP Server (Mục 13)
- **Go Backend Mock HTTP Server (`projects/service/mock_server.go`):**
  - Lưu cấu hình Mock Server theo từng Collection tại `<collectionRoot>/mock-server.json` gồm `port` (mặc định `3456`) và danh sách `routes` (`id`, `method`, `path`, `status_code`, `headers`, `body`, `delay_ms`, `enabled`, `description`).
  - Khởi chạy `net/http.Server` lắng nghe trên `127.0.0.1:<port>` (hỗ trợ cả port động `0` khi chạy kiểm thử tự động).
  - Khớp request theo `Method` (khớp chính xác hoặc `"ANY"`) và `Path` (khớp chính xác hoặc tham số đường dẫn dạng `/users/:id`), hỗ trợ độ trễ `delay_ms`, trả về `status_code`, `headers` tùy chỉnh (kèm CORS headers) và `body`.
- **Giao diện Quản lý Mock Server (`MockServerModal.vue`):**
  - Nút mở nhanh trên `AppHeader.vue` (`data-test="open-mock-server-btn"`) hiển thị trạng thái đang chạy.
  - Cho phép bật/tắt server (`data-test="mock-toggle-server-btn"`), đổi cổng (`data-test="mock-port-input"`), thêm/sửa/xóa các Mock Route (`data-test="add-mock-route-btn"`) và lưu cấu hình (`data-test="save-mock-config-btn"`).

## 3. Non-Functional Requirements & Constraints

- **Offline-first & File-based:** Toàn bộ cấu hình script, lịch sử gọi API, lịch sử thay đổi và cấu hình mock server đều lưu bằng file JSON trên đĩa trong thư mục Collection, không phụ thuộc dịch vụ đám mây.
- **Data Safety in Tests (Mục 19):** Mọi kiểm thử Go (`go test ./...`) và Frontend (`bun run test`) bắt buộc chỉ sử dụng `t.TempDir()` hoặc mock dữ liệu trong bộ nhớ, tuyệt đối không tác động dữ liệu thật của người dùng.
- **Zero Regression:** 100% kiểm thử Go backend và Vue frontend hiện có phải tiếp tục pass.

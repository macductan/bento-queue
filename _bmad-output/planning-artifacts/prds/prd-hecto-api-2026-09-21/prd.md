---
title: hecto-api
status: final
created: 2026-09-21
updated: 2026-09-21
---

# PRD: hecto-api

## 0. Document Purpose

PRD này dành cho tác giả duy nhất (tanmac) — vừa là PM, vừa là dev, vừa là user. Tài liệu xác định rõ hecto-api v1 cần làm gì, không làm gì, và khi nào coi là thành công. Downstream: architecture, epics/stories, implementation. Input chính: `docs/product-brief.md`.

## 1. Vision

**hecto-api** là một ứng dụng desktop gọn nhẹ để gọi và test HTTP API, thay thế Postman và Bruno trong công việc hàng ngày. App hoạt động hoàn toàn offline, không yêu cầu đăng nhập, không phụ thuộc cloud — mở lên là dùng được ngay.

Khác biệt cốt lõi không nằm ở tính năng mà ở quyền sở hữu: đây là tool mình build, mình dùng, mình kiểm soát. Gặp bug thì tự fix, cần tính năng thì tự thêm — không chờ vendor, không bị ép upgrade, không bị giới hạn bởi bản free. Collection lưu dạng file trên disk, đọc được bằng text editor, commit thẳng vào Git.

Xây dựng bằng Wails v2 (Go backend, Vue 3 frontend, native webview), hecto-api nhắm tới trải nghiệm khởi động dưới 2 giây, RAM dưới 100MB — gọn nhẹ như một CLI tool nhưng có giao diện đủ tiện để làm việc mỗi ngày.

## 2. Target User

### 2.1 Jobs To Be Done

- **Functional:** Khi đang code, tôi cần gửi nhanh một HTTP request để test API mà không phải chờ app load hay đăng nhập vào đâu cả.
- **Functional:** Tôi cần lưu lại các request theo project để lần sau mở lên dùng lại, không phải gõ lại từ đầu.
- **Functional:** Khi switch giữa dev/staging/prod, tôi cần đổi base URL + token mà không phải sửa từng request.
- **Contextual:** Tôi hay đổi VPN hoặc mất mạng — tool phải hoạt động bình thường bất kể network state.
- **Emotional:** Tôi muốn dùng tool do mình làm, mình kiểm soát hoàn toàn — không phụ thuộc vendor nào.

### 2.2 Non-Users (v1)

- Team cần collaboration/sharing qua cloud
- Người cần test WebSocket, gRPC, GraphQL
- Người cần pre-request scripts phức tạp hay OAuth2 flow tự động

### 2.3 Key User Journeys

**UJ-1. tanmac gửi nhanh một request trong lúc đang code.**
> tanmac đang code feature mới, cần test endpoint vừa viết. Mở hecto-api (< 2 giây), chọn request đã lưu sẵn hoặc tạo mới. Gõ URL, chọn method POST, paste JSON body, bấm Send. Response hiện ngay: status 201, body JSON được pretty-print, thời gian 45ms. Đúng ý — quay lại IDE tiếp tục code.

**UJ-2. tanmac tổ chức requests cho một project mới.**
> tanmac bắt đầu project mới, cần chỗ lưu các API calls. Tạo folder "auth", "users", "orders" trong app. Thêm từng request vào đúng folder. Mở file explorer — thấy cấu trúc folder rõ ràng trên disk, mỗi request là một file JSON đọc được. Copy cả folder vào Git repo, commit.

**UJ-3. tanmac đổi từ dev sang staging để test.**
> tanmac test xong trên local, cần kiểm tra staging. Click dropdown environment, chọn "staging" — `{{base_url}}` tự chuyển từ `localhost:3000` sang `staging.example.com`, `{{token}}` cũng đổi theo. Gửi lại cùng request, không sửa gì — response trả về từ staging server.

**UJ-4. tanmac import Postman collection cũ để chuyển sang hecto-api.**
> tanmac quyết định bỏ Postman. Export collection từ Postman (v2.1 JSON). Trong hecto-api, chọn Import → chọn file JSON. App chuyển đổi xong — hiện collection mới với đầy đủ requests, giữ nguyên method, URL, headers, body. Mở thử vài request, gửi thử — hoạt động đúng như cũ.

## 3. Glossary

- **Collection** — Nhóm các Request liên quan, ánh xạ 1:1 với một folder trên disk. Chứa metadata (`collection.json`), Environments, Folders, và Requests. v1 chỉ có một default Collection.
- **Request** — Một HTTP request đã lưu. Mỗi Request là một file JSON trong Collection (YAML deferred v2+). Chứa method, URL, Headers, Params, Body.
- **Folder** — Thư mục con trong Collection để phân nhóm Requests. Có thể lồng nhau (sub-folder).
- **Environment** — Tập biến key-value (ví dụ `base_url`, `token`). Mỗi Collection có thể có nhiều Environment (dev, staging, prod). Lưu dưới dạng file trong `environments/`.
- **Variable** — Một cặp key-value trong Environment. Được dùng trong URL, Headers, Body qua cú pháp `{{key}}`.
- **Response** — Kết quả trả về từ server sau khi gửi Request. Gồm status code, headers, body, response time, response size.

## 4. Features

### 4.1 HTTP Request (Core)

**Mô tả:** Khả năng chính của app — soạn và gửi HTTP request, xem response. Người dùng chọn method, nhập URL, cấu hình headers/params/body, bấm Send và nhận kết quả ngay. Realizes UJ-1.

**Functional Requirements:**

#### FR-1: Gửi HTTP request

Người dùng có thể gửi HTTP request với method GET, POST, PUT, DELETE, PATCH tới bất kỳ URL nào.

**Consequences (testable):**
- Request được gửi đúng method, URL, headers, params, body đã cấu hình
- App hoạt động khi không có internet (trả lỗi connection rõ ràng, không crash/đơ)

#### FR-2: Quản lý Headers

Người dùng có thể thêm, sửa, xóa Headers và toggle on/off từng header.

**Consequences (testable):**
- Header bị disable (off) không được gửi trong request
- Header không có value vẫn được gửi nếu enabled

#### FR-3: Quản lý Query Parameters

Người dùng có thể thêm, sửa, xóa query params qua key-value editor.

**Consequences (testable):**
- Params được nối vào URL đúng format `?key=value&key2=value2`
- Param bị disable không xuất hiện trong URL

#### FR-4: Quản lý Body

Người dùng có thể nhập request body dạng raw (JSON, Text).

**Consequences (testable):**
- Content-Type header tự động set tương ứng khi chọn type (JSON → `application/json`)
- Khi method là GET và có body, app hiển thị warning message (không chặn, body vẫn được gửi)

#### FR-5: Hiển thị Response

Sau khi gửi request, app hiển thị response gồm: status code, response headers, body (pretty-print JSON + raw text), response time (ms), response size (bytes).

**Consequences (testable):**
- JSON response được pretty-print với syntax highlighting
- Có thể chuyển giữa pretty view và raw view
- Status code hiển thị với màu phân biệt (2xx xanh, 4xx vàng, 5xx đỏ)
- Response time và size hiển thị dạng số nguyên (không dùng float)

### 4.2 Organization

**Mô tả:** App làm việc với một default Collection duy nhất. Storage design đã hỗ trợ multi-collection để mở rộng sau, nhưng UI v1 bỏ qua bước chọn collection. Realizes UJ-2.

**Functional Requirements:**

#### FR-6: Default Collection

App tự động sử dụng một default Collection. Không có UI chọn/quản lý Collection trong v1.

**Consequences (testable):**
- Mở app → làm việc ngay với default collection, không cần chọn
- Storage trên disk có cấu trúc hỗ trợ multi-collection (mỗi collection là một folder riêng) để mở rộng sau

**Out of Scope:** UI chọn/tạo/switch Collection (v2+).

#### FR-7: Tổ chức bằng Folder

Người dùng có thể tạo, đổi tên, xóa Folder trong Collection. Folder có thể lồng nhau.

**Consequences (testable):**
- Cấu trúc Folder trong app khớp 1:1 với cấu trúc thư mục trên disk

#### FR-8: Quản lý Request

Người dùng có thể tạo, sao chép, đổi tên, xóa, di chuyển Request giữa các Folder.

**Consequences (testable):**
- Mỗi Request lưu thành một file JSON riêng trên disk (YAML deferred v2+)
- File Request đọc được bằng text editor, chứa đầy đủ method, URL, headers, params, body

#### FR-9: Sidebar navigation

App hiển thị tree view Collection → Folder → Request ở sidebar để điều hướng nhanh.

**Consequences (testable):**
- Click vào Request trong sidebar mở request đó trong editor
- Tree view phản ánh đúng cấu trúc file trên disk

### 4.3 Environment

**Mô tả:** Quản lý nhiều bộ biến môi trường để switch nhanh giữa dev/staging/prod mà không sửa từng Request. Realizes UJ-3.

**Functional Requirements:**

#### FR-10: Tạo và quản lý Environment

Người dùng có thể tạo, sửa, đổi tên, xóa Environment. Mỗi Environment là một tập Variable key-value.

**Consequences (testable):**
- Mỗi Environment lưu thành file JSON riêng trong folder `environments/`
- File đọc được bằng text editor

#### FR-11: Switch Environment

Người dùng có thể chuyển Environment đang active qua dropdown/selector.

**Consequences (testable):**
- Switch ngay lập tức, không cần restart hay reload
- Tất cả `{{variable}}` trong Request đang mở cập nhật theo Environment mới

#### FR-12: Variable substitution

Biến dạng `{{key}}` trong URL, Headers, Body được thay thế bằng giá trị từ Environment đang active khi gửi Request.

**Consequences (testable):**
- `{{base_url}}/api/users` với env `dev` có `base_url=http://localhost:3000` → gửi tới `http://localhost:3000/api/users`
- Variable không tồn tại giữ nguyên dạng `{{key}}`, hiển thị highlight đỏ + in nghiêng để dễ nhận biết
- Variable substitution xảy ra lúc gửi, không thay đổi nội dung đã lưu trong file

### 4.4 Import

**Mô tả:** Cho phép chuyển từ Postman sang hecto-api mà không mất dữ liệu. Realizes UJ-4.

**Functional Requirements:**

#### FR-13: Import Postman Collection

Người dùng có thể import file Postman Collection v2.1 (JSON). App chuyển đổi sang format nội bộ.

**Consequences (testable):**
- Import collection có ≥ 10 requests thành công
- Giữ nguyên method, URL, headers, body, folder structure
- Variables dạng `{{var}}` trong Postman được giữ nguyên cú pháp
- File kết quả trên disk đúng format nội bộ của hecto-api

**Out of Scope:** Import từ Bruno, OpenAPI, cURL (v2+).

## 5. Non-Goals (Explicit)

- hecto-api **không phải** Postman replacement đầy đủ — chỉ giải quyết use case gọi HTTP API cơ bản
- **Không** có pre-request scripts / test scripts
- **Không** có authentication helpers tự động (OAuth2, Bearer, Basic) — tự gắn header thủ công
- **Không** hỗ trợ WebSocket, gRPC, GraphQL
- **Không** có cookie management tự động
- **Không** có response history / diff
- **Không** có code generation (cURL, fetch, axios...)
- **Không** có export (Postman, OpenAPI format)
- **Không** có plugin system
- **Không** có themes / customization UI
- **Không** có cloud sync, đăng nhập, tài khoản
- **Không** có multi-language UI (v1 chỉ tiếng Việt)

## 6. MVP Scope

### 6.1 In Scope

- Gửi HTTP request (GET, POST, PUT, DELETE, PATCH) với headers, params, body
- Response viewer (pretty JSON, raw, headers, status, time, size)
- Default collection với folders và request files trên disk
- Environment management + variable substitution
- Import Postman Collection v2.1
- UI tiếng Việt

### 6.2 Out of Scope cho MVP

- Multi-collection UI (v2+ — storage đã sẵn sàng)
- Form-data / multipart body (v2+)
- Keyboard shortcuts nâng cao (v2+)
- Import từ Bruno / OpenAPI (v2+)

## 7. Success Metrics

> Thành công: dùng hecto-api thay Postman/Bruno trong công việc hàng ngày và không quay lại.

**Primary:**
- **SM-1:** Dùng hecto-api làm tool gọi API chính hàng ngày (thay vì mở Postman/Bruno). Validates FR-1, FR-5.
- **SM-2:** Mở app < 2 giây, RAM < 100MB. Validates FR-1.
- **SM-3:** App hoạt động bình thường khi offline / đổi VPN. Validates FR-1.
- **SM-4:** Collection trên disk đọc được và commit vào Git. Validates FR-6, FR-8.

## 8. Open Questions

*Tất cả đã được giải quyết trong quá trình coaching.*

## 9. Assumptions Index

*Tất cả đã được xác nhận:*

- ~~`[ASSUMPTION]`~~ FR-4: GET + body chỉ hiện warning message, body vẫn gửi bình thường. ✅ Confirmed.
- ~~`[ASSUMPTION]`~~ FR-6: App tự tạo metadata file (`collection.json`) nếu chưa có khi mở collection lần đầu. ✅ Confirmed.
- ~~`[ASSUMPTION]`~~ FR-8: Request file format mặc định là JSON. ✅ Confirmed.
- ~~`[ASSUMPTION]`~~ FR-12: Variable không tồn tại giữ nguyên dạng `{{key}}`, hiển thị highlight đỏ + in nghiêng. ✅ Confirmed.

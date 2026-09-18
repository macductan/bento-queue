# Product Brief: hecto-api

> **Status**: Approved  
> **Created**: 2026-09-18  
> **Type**: Hobby / Open-source  

## Tổng quan

**hecto-api** là một ứng dụng desktop gọn nhẹ dùng để gọi và test API, thay thế Postman và Bruno. Được xây dựng với triết lý **offline-first, developer-first**, lưu trữ dạng file, không yêu cầu đăng nhập, không cloud sync.

> Đây là dự án cá nhân / hobby, open-source. Mục tiêu chính là **tự build, tự dùng**.

---

## Vấn đề

| Công cụ hiện tại | Pain points |
|---|---|
| **Postman** | Nặng, tốn RAM, khởi động lâu. Ép đăng nhập + cloud sync. Đổi VPN → đơ máy, phải restart. Bản free bị giới hạn tính năng. |
| **Bruno** | Cũng lag khi dùng. UX nhiều tính năng khó dùng, chưa mượt. |

**Nhu cầu cốt lõi**: Một tool gọi API đơn giản, mở lên là dùng được, không lag, không cần internet, không cần tài khoản.

---

## Giải pháp: hecto-api

### Giá trị cốt lõi

| # | Giá trị | Mô tả |
|---|---------|-------|
| 1 | ⚡ **Nhanh & nhẹ** | Khởi động dưới 2 giây, RAM thấp (target < 100MB). Wails + Go binary, không Electron bloat. |
| 2 | 🔓 **Zero login** | Không đăng nhập, không tài khoản, không cloud. Mở app → dùng ngay. |
| 3 | 📁 **File-based storage** | Collection lưu dạng file trên disk (v1: JSON only, YAML deferred). Git-friendly, portable, dễ backup. |
| 4 | 🎯 **Đơn giản** | Chỉ có những gì cần thiết. Không bloat feature. UX tối giản, developer-friendly. |
| 5 | 📡 **Offline-first** | UI không bao giờ phụ thuộc network. Đổi VPN, mất mạng → app vẫn hoạt động bình thường. |

---

## Tech Stack

| Layer | Công nghệ | Lý do |
|-------|-----------|-------|
| **Desktop framework** | [Wails v2](https://wails.io/) | Go backend, native webview — nhẹ hơn Electron rất nhiều, binary size nhỏ |
| **Backend** | Go | Nhanh, compile thành single binary, HTTP client mạnh (net/http) |
| **Frontend** | Vue 3 | Reactive, nhẹ, ecosystem tốt, phù hợp với Wails |
| **Storage** | File system (JSON; YAML deferred v2+) | Không cần DB, Git-friendly, portable |

---

## Tính năng v1 (MVP)

### Core — Gửi & nhận HTTP Request

- Gửi HTTP request: **GET, POST, PUT, DELETE, PATCH**
- Quản lý **Headers** (thêm/sửa/xóa, toggle on/off)
- Quản lý **Query Parameters** (key-value editor)
- Quản lý **Body**: raw (JSON, XML, Text)
- **Response viewer**:
  - JSON pretty print với syntax highlighting
  - Raw text view
  - Response headers
  - Status code, response time, response size

### Organization — Quản lý request

- **Collection**: nhóm các request thành collection
- **Folder**: tổ chức request trong collection theo folder/sub-folder
- **Lưu trữ dạng file**: mỗi collection là một folder trên disk, mỗi request là một file JSON (YAML deferred v2+)
- Cấu trúc file rõ ràng, đọc được bằng text editor

### Environment — Biến môi trường

- Tạo/quản lý nhiều **environment** (dev, staging, prod)
- Sử dụng biến trong URL, headers, body: `{{base_url}}/api/users`
- Switch environment nhanh

### Import

- **Import từ Postman Collection** (v2.1 format)
- Chuyển đổi sang format file nội bộ của hecto-api

---

## Ngoài scope v1

- Pre-request scripts / test scripts
- Authentication helpers (OAuth2, Bearer, Basic — tự gắn header thủ công vẫn được)
- WebSocket / gRPC / GraphQL
- Cookie management tự động
- Response history / diff
- Code generation (cURL, fetch, axios...)
- Export sang Postman/OpenAPI format
- Plugin system
- Themes / customization UI

---

## Cấu trúc file đề xuất

```
my-api-collection/
├── collection.json              # metadata (name, description)
├── environments/
│   ├── dev.json                 # {"base_url": "http://localhost:3000"}
│   └── prod.json                # {"base_url": "https://api.example.com"}
├── users/
│   ├── get-all-users.json       # request definition
│   ├── get-user-by-id.json
│   └── create-user.json
└── auth/
    └── login.json
```

Mỗi request file:
```json
{
  "name": "Get All Users",
  "method": "GET",
  "url": "{{base_url}}/api/users",
  "headers": [
    { "key": "Authorization", "value": "Bearer {{token}}", "enabled": true }
  ],
  "params": [
    { "key": "page", "value": "1", "enabled": true }
  ],
  "body": {
    "type": "json",
    "content": ""
  }
}
```

---

## Nguyên tắc thiết kế

1. **Ít hơn là nhiều hơn** — Mỗi tính năng phải justify lý do tồn tại. Nếu nghi ngờ, không thêm.
2. **Keyboard-first** — Developer dùng keyboard nhiều. Hỗ trợ shortcut cho mọi thao tác phổ biến.
3. **Instant feedback** — Mọi action phải phản hồi ngay. Không loading spinner khi không cần.
4. **File = Truth** — Những gì trên disk là source of truth. Không hidden state, không cache ẩn.

---

## Thành công trông như thế nào

- ✅ Dùng hecto-api thay Postman/Bruno trong công việc hàng ngày
- ✅ Mở app < 2 giây, RAM < 100MB
- ✅ Không bao giờ cần internet để app hoạt động
- ✅ Collection có thể commit vào Git và đọc được

### Tiêu chí chấp nhận theo nhóm tính năng

| Nhóm | Tiêu chí |
|------|----------|
| **Core** | Gửi được request POST với JSON body và nhận response hiển thị đúng status code, headers, pretty-printed body. |
| **Organization** | Tạo collection, thêm folder/request, lưu xuống disk đúng cấu trúc file đã định nghĩa. |
| **Environment** | Switch environment thay đổi giá trị biến trong URL/headers/body ngay lập tức, không cần restart. |
| **Import** | Import thành công 1 Postman Collection v2.1 có ≥ 10 requests, giữ nguyên method, URL, headers, body. |

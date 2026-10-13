# Cấu trúc lưu trữ và Quy chuẩn đặt tên chuẩn hóa (Storage Structure & Unified Naming Convention)

Tài liệu đặc tả kiến trúc lưu trữ tệp tin trên ổ đĩa và quy chuẩn đặt tên chuẩn hóa toàn hệ thống theo định dạng **`<slug>-<UUID>`**. Codebase được thiết kế trực tiếp theo chuẩn mới này, không cần code migration phức tạp do chưa có dữ liệu người dùng thực tế.

---

## 1. Quy chuẩn đặt tên chuẩn hóa: `<slug>-<UUID>`

Toàn bộ các thực thể trong hecto-api (Collection, Folder, Request, Environment) được chuẩn hóa theo quy tắc:

$$\text{Tên tệp / thư mục trên đĩa} = \langle\text{slug}\rangle\text{-}\langle\text{UUID}\rangle$$

### Ưu điểm vượt trội:
1. **Dễ đọc (Human-readable)**: Mở thư mục bằng Terminal, VS Code hay Git nhìn vào tiền tố `<slug>` là nhận biết ngay ngữ nghĩa nghiệp vụ của request/folder.
2. **Duy nhất toàn cầu (Globally Unique)**: Hậu tố `<UUID>` đảm bảo hai máy khác nhau cùng tạo request/folder trùng tên nghiệp vụ (ví dụ: *"Login"* hay *"Get Users"*) sẽ **không bao giờ bị trùng tên tệp hoặc đụng độ khi đồng bộ qua Git**.
3. **Bỏ vòng lặp kiểm tra trùng tên**: Không còn cần vòng lặp kiểm tra `slug-1.json`, `slug-2.json` do `<slug>-<UUID>` luôn là duy nhất ngay từ thời điểm tạo.

---

## 2. Quy tắc cụ thể cho từng thực thể

| Thực thể | Tên thư mục / tệp tin trên đĩa | File Metadata / Nội dung | Khóa định danh chính (Key) |
|---|---|---|---|
| **Collection mặc định** | `default/` | `collection.json` | `default` |
| **Collection tạo mới** | `<slug>-<UUID>/` | `collection.json` | `<slug>-<UUID>` |
| **Folder con** | `<slug>-<UUID>/` | `_folder.json` (chứa `name`) | `UUID` (lấy từ tên folder) |
| **Request** | `<slug>-<UUID>.json` | `*.json` (chứa `name`, `method`, `url`,...) | `UUID` |
| **Environment** | `<slug>-<UUID>.json` | `environments/*.json` | `UUID` |

---

## 3. Cấu trúc thư mục trên ổ đĩa (Disk Layout)

```text
{collections_root}/
├── default/                                                                  # Collection mặc định
│   ├── collection.json                                                       # Metadata collection
│   ├── environments/                                                         # Môi trường độc lập
│   │   └── local-11111111-2222-3333-4444-555555555555.json
│   ├── authentication-a9b8c7d6-e5f4-3a2b-1c0d-9e8f7a6b5c4d/                  # Folder con (<slug>-<UUID>)
│   │   ├── _folder.json
│   │   └── login-d1c2b3a4-5e6f-7a8b-9c0d-1e2f3a4b5c6d.json                   # Request (<slug>-<UUID>.json)
│   └── ping-healthcheck-7c9e6d8b-4a3f-2e1d-0c9b-8a7f6e5d4c3b.json
│
├── project-ecommerce-b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d/                   # Collection tạo mới
│   ├── collection.json
│   ├── environments/
│   │   ├── staging-3b2a1c0d-9e8f-7a6b-5c4d-3e2f1a0b9c8d.json
│   │   └── production-8a7f6e5d-4c3b-2a1e-0d9c-8b7a6f5e4d3c.json
│   ├── orders-2e1d0c9b-8a7f-6e5d-4c3b-2a1e0d9c8b7a/
│   │   ├── _folder.json
│   │   └── list-orders-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d.json
│   └── get-products-6f5e4d3c-2b1a-0e9d-8c7b-6a5f4e3d2c1b.json
```

---

## 4. Metadata Collection (`collection.json`)

Mỗi thư mục collection chứa file `collection.json`:

```json
{
  "slug": "project-ecommerce-b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "name": "Project E-Commerce",
  "description": "",
  "created_at": "2026-10-12T11:00:00+07:00",
  "updated_at": "2026-10-12T11:00:00+07:00"
}
```

- **`slug` (Key của Collection)**: Trùng khớp với tên thư mục trên đĩa (`<slug>-<UUID>` hoặc `"default"`).
- **`name` (Tên hiển thị / Display Name)**: Đổi tự do qua chức năng Rename, tên thư mục trên đĩa không đổi (tuân thủ AD-4).

---

## 5. Cấu hình ứng dụng (`config.json`)

```json
{
  "collections_root": "/home/dev/.cache/hecto-api/collections",
  "default_collection": "default",
  "active_collection": "project-ecommerce-b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "collection_root": "/home/dev/.cache/hecto-api/collections/project-ecommerce-b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
  "created_at": "2026-10-01T14:46:51.633039948+07:00",
  "updated_at": "2026-10-12T11:30:00.000000000+07:00"
}
```

- `default_collection`: Luôn là `"default"`, được hệ thống bảo vệ cấm xóa.
- `active_collection`: Tên thư mục collection đang active.
- Không cần code migration dữ liệu cũ; khi app khởi động, nếu thiếu thư mục `collections_root` hoặc `default`, app tự khởi tạo cấu trúc sạch theo chuẩn mới.

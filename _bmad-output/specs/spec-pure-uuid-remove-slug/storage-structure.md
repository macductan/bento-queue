# Kiến trúc Định danh Pure UUID & Cấu trúc Lưu trữ Tệp tin (Pure UUID Architecture & Storage Structure)

Tài liệu đặc tả chi tiết kiến trúc chuẩn hóa toàn bộ định danh (ID) và cấu trúc tệp tin/thư mục trên ổ đĩa sang **UUID thuần (Pure UUID v4)**, loại bỏ triệt để khái niệm `slug` và dọn sạch các đoạn mã xử lý slug rườm rà trong hecto-api.

---

## 1. Chuẩn hóa Định danh & Hệ thống Tệp tin sang Pure UUID

Toàn bộ các thực thể trong hecto-api (Request, Folder, Environment, Collection) được quản lý thống nhất bằng ID định dạng UUID v4 thuần và ánh xạ trực tiếp 1-1 lên tên tệp/thư mục trên đĩa:

| Thực thể | Định dạng ID | Đường dẫn / Tên trên đĩa | File Metadata / Nội dung | Ngoại lệ duy nhất |
|---|---|---|---|---|
| **Request** | UUID v4 thuần | `<uuid>.json` | `*.json` (chứa `id`, `name`, `method`, `url`,...) | Không có |
| **Folder** | UUID v4 thuần | `<uuid>/` | `_folder.json` (chứa `id`, `name`, `variables`,...) | Không có |
| **Environment** | UUID v4 thuần | `environments/<uuid>.json` | `*.json` (chứa `id`, `name`, `variables`,...) | Không có |
| **Collection** | UUID v4 thuần | `<uuid>/` | `collection.json` (chứa `id`, `name`,...) | Collection mặc định: ID=`"default"`, thư mục=`default/` |

### Nguyên tắc Đổi tên (Rename Principle):
- Khi đổi tên (rename) Request, Folder hoặc Collection: **CHỈ cập nhật trường `name` và `updated_at` trong tệp JSON metadata**.
- **Tuyệt đối không đổi tên file hoặc thư mục vật lý trên ổ đĩa**.
- ID và đường dẫn tệp tin/thư mục được cố định vĩnh viễn từ thời điểm khởi tạo thực thể.

---

## 2. Cấu trúc Thư mục trên Ổ đĩa (Disk Layout)

```text
{collections_root}/
├── default/                                                                  # Collection mặc định (ID: "default")
│   ├── collection.json                                                       # Metadata: { "id": "default", "name": "Default Collection" }
│   ├── environments/                                                         # Thư mục môi trường của collection
│   │   ├── a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d.json                        # Environment: <uuid>.json
│   │   └── b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e.json
│   ├── c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f/                                 # Folder: <uuid>/
│   │   ├── _folder.json                                                      # Metadata: { "id": "c3d4e5f6...", "name": "Authentication" }
│   │   └── d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a.json                        # Request: <uuid>.json (trong folder)
│   └── e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b.json                            # Request: <uuid>.json (ở root collection)
│
└── f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c/                                     # Collection tạo mới: <uuid>/ (ID: <uuid>)
    ├── collection.json                                                       # Metadata: { "id": "f6a7b8c9...", "name": "E-Commerce Project" }
    ├── environments/
    │   └── 0a1b2c3d-4e5f-4a6b-7c8d-9e0f1a2b3c4d.json                        # Environment: <uuid>.json
    ├── 1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e/                                 # Folder: <uuid>/
    │   ├── _folder.json
    │   └── 2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e6f.json                        # Request: <uuid>.json
    └── 3d4e5f6a-7b8c-4d9e-0f1a-2b3c4d5e6f7a.json                            # Request: <uuid>.json
```

---

## 3. Đối chiếu Thay đổi Codebase: Trước vs Sau (Before vs After)

### 3.1. Go Model (`projects/model/types.go`)

**Trước (Before):**
```go
type Collection struct {
    ID          string    `json:"id,omitempty"`
    Slug        string    `json:"slug"`
    Name        string    `json:"name"`
    Description string    `json:"description"`
    IsDefault   bool      `json:"is_default,omitempty"`
    IsActive    bool      `json:"is_active,omitempty"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}
```

**Sau (After - Pure UUID):**
```go
type Collection struct {
    ID          string    `json:"id"`
    Name        string    `json:"name"`
    Description string    `json:"description"`
    IsDefault   bool      `json:"is_default,omitempty"`
    IsActive    bool      `json:"is_active,omitempty"`
    CreatedAt   time.Time `json:"created_at"`
    UpdatedAt   time.Time `json:"updated_at"`
}
```

### 3.2. Error Codes (`projects/service/errors.go`)

- **Xóa bỏ:** `ErrCollectionSlugEmpty = "Collection slug không được để trống"`
- **Bổ sung/Thay thế:** `ErrCollectionIDEmpty = "Collection ID không được để trống"`

### 3.3. Backend Services & App Bindings (`projects/service/`, `projects/app.go`)

| Tên hàm / Method | Tham số cũ (Before) | Tham số mới (After) | Ghi chú xử lý |
|---|---|---|---|
| `App.SwitchCollection` | `SwitchCollection(slug string)` | `SwitchCollection(id string)` | Kiểm tra ID hợp lệ, chuyển active collection |
| `App.RenameCollection` | `RenameCollection(slug, newName string)` | `RenameCollection(id, newName string)` | Đổi tên trong `collection.json`, giữ nguyên folder ID |
| `App.DeleteCollection` | `DeleteCollection(slug string)` | `DeleteCollection(id string)` | Từ chối xóa `"default"`, xóa thư mục `<id>` |
| `App.DuplicateCollection` | `DuplicateCollection(slug string)` | `DuplicateCollection(id string)` | Sinh UUID mới cho collection sao chép |
| `CollectionService.CreateCollection` | Thư mục `<slug>-<UUID>` | Thư mục `<uuid>` | `coll.ID = uuid.NewString()` |
| `CollectionService.CreateFolder` | `slug.EntityDir(name, id)` | `id` | Thư mục `<uuid>/` chứa `_folder.json` |
| `CollectionService.CreateRequest` | `slug.EntityFilename(name, id)` | `id + ".json"` | Tệp `<uuid>.json` |
| `RequestService.Duplicate` | `slug.EntityFilename(newName, id)` | `id + ".json"` | Tệp `<uuid>.json` |
| `storage.SaveEnvironment` | `slug.EntityFilename(name, id)` | `id + ".json"` | Tệp `environments/<uuid>.json` |
| `ConfigService.SwitchActiveCollection` | `SwitchActiveCollection(ctx, slug)` | `SwitchActiveCollection(ctx, id)` | Cập nhật `ActiveCollection` = `id` |

### 3.4. Package `projects/slug/` (Dead Code Elimination)

- **Xóa bỏ các hàm xử lý slug tiếng Việt rườm rà:**
  - `norm.NFD` Unicode decomposition, strip diacritics, regex `[^a-z0-9-]`, consecutive hyphens collapsing.
  - `Generate(name string) string`
  - `GenerateUnique(name, dir string) string`
  - `GenerateDir(name string) string`
  - `GenerateUniqueDir(name, dir string) string`
  - `EntityDir(name string, id ...string) string`
  - `EntityFilename(name string, id ...string) string`
  - `UniqueFilename(filename, dir string) string`
- **Đơn giản hóa:** Thay thế bằng helper sinh UUID/filename tối giản (ví dụ: `Filename(id string) string { return id + ".json" }`) hoặc trực tiếp sử dụng `uuid.NewString()` tại các service.

### 3.5. Importer Service (`projects/service/importer.go`)

- Khi import Postman v2.1:
  - Folder được tạo trực tiếp với tên thư mục là `folderID` (UUID v4 thuần) thay vì `slug.EntityDir(...)`.
  - Request được ghi trực tiếp thành tệp `reqID + ".json"` (UUID v4 thuần) thay vì `slug.EntityFilename(...)`.
  - Loại bỏ hoàn toàn phụ thuộc vào package `slug`.

### 3.6. Frontend Vue/Pinia (`projects/frontend/src/`)

- **`collectionStore.ts`**:
  - `state.activeCollectionSlug` $\rightarrow$ `state.activeCollectionId`
  - `getters.activeCollection`: so sánh `c.id === state.activeCollectionId`
  - `getters.isDefaultActive`: kiểm tra `state.activeCollectionId === 'default' || c.is_default`
  - Action `switchCollection(targetId: string, opts?: { force?: boolean })`
  - Action `renameCollection(id: string, name: string)`
  - Action `deleteCollection(id: string)`
  - Action `duplicateCollection(id: string)`
- **`CollectionSwitcher.vue`**:
  - Đổi toàn bộ thuộc tính, binding và event handler từ `c.slug` sang `c.id`
  - `targetSlug` $\rightarrow$ `targetId`
  - Check active: `c.id === collectionStore.activeCollectionId`
  - Check default: `c.id === 'default' || c.is_default`
- **`SettingsModal.vue`**:
  - Đổi binding và action handlers từ `c.slug` sang `c.id`
  - Check active: `c.id === collectionStore.activeCollectionId`
  - Check default: `c.id === 'default' || c.is_default`

---

## 4. Cơ chế Tương thích ngược (Backward Compatibility)

1. **`storage.FileSystem.FindByUUID` & `walkJSONEntities`**:
   - Quét qua mọi tệp `.json` trong cây thư mục, unmarshal trường `id` bên trong tệp tin để xây dựng chỉ mục bộ nhớ (`index[uuid] = path`).
   - Các tệp hoặc thư mục cũ mang tên dạng `<slug>-<UUID>.json` hoặc `<slug>-<UUID>/` vẫn được đọc bình thường vì cơ chế chỉ mục dựa trên trường `id` trong nội dung JSON, không phụ thuộc vào tên tệp.
2. **`CollectionService.GetTree`**:
   - Khi duyệt thư mục con, đọc `_folder.json` để lấy `folder.ID` và `folder.Name`.
   - Khi đọc request, đọc `<file>.json` để lấy `req.ID` và `req.Name`.
   - Cây thư mục hiển thị đầy đủ và chính xác bất kể tên tệp trên đĩa là `<uuid>.json` hay `<slug>-<uuid>.json`.
3. **`CollectionService.ListCollections`**:
   - Đọc `collection.json` trong mỗi thư mục con của `collectionsRoot`.
   - Gán `coll.ID = entry.Name()`, `coll.IsDefault = (entry.Name() == "default")`.
   - Tương thích cả thư mục mang tên `default`, `<uuid>` mới lẫn các thư mục cũ mang tên `<slug>-<uuid>`.

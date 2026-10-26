# Forged Idea: Công cụ CLI cho AI Agent tích hợp vào `hecto-api`

## Locked Decisions

- **Đóng gói Binary độc lập trong cùng Repo (`projects/cmd/hecto/main.go`):** Biên dịch ra binary riêng `hecto` (thuần Go, không import Wails/GTK/WebKit) để có thể cài đặt độc lập trên máy chỉ dùng CLI/CI mà không cần cài Desktop App `hecto-api`, nhưng tái sử dụng 100% các package Go sẵn có (`model`, `storage`, `service`, `slug`).
- **Shared TS Execution Engine qua `//go:embed` + `goja`:** Không viết lại 2.300 dòng logic `resolveHierarchyVariables.ts`, `auth.ts`, `buildExecuteRequest.ts`, `scriptRunner.ts` sang Go. Giữ 1 nguồn code TypeScript duy nhất ở `frontend/src/utils/` (để Vue vẫn gọi đồng bộ `computed()` 0ms trên UI), bundle thêm `frontend/dist/headless-engine.js` lúc build và nhúng vào binary `hecto` chạy trên `goja` (pure Go JS engine). Tầng Go chỉ cung cấp polyfill Base64/TextEncoder, gọi `ExecutorService.Send` và lưu `scopedEnvUpdates`/`scopedAuthUpdates` xuống đĩa.
- **Giao thức Stateless CLI (`--json`) + Lệnh tự khám phá `hecto agent-guide`:** Mọi lệnh CLI chạy stateless (đọc đĩa → xử lý → thoát, trả về `model.Result` JSON). Cung cấp lệnh `hecto agent-guide` in trực tiếp nội dung chuẩn `SKILL.md` (nhúng sẵn trong binary) ra `stdout` và nhắc ngay ở dòng đầu `hecto --help` để bất kỳ AI Agent nào cũng tự đọc hoặc tự import vào thư mục skill riêng của nó.
- **Ma trận lệnh trực giao `hecto <entity> <verb>`:**
  - 4 thực thể: `collection`, `env`, `folder`, `req` với các động từ tường minh: `list`/`tree`, `get`, `create`, `update`, `delete`, `move` (đầy đủ CRUD + Move cho cả `folder` để quản lý biến tầng 3, tầng 4, headers và auth kế thừa).
  - 3 lệnh top-level: `hecto run <id|path> [--env] [--var K=V] [--no-save-env]`, `hecto import <file-or-curl>`, `hecto agent-guide`.
  - `create` nhận trọn bộ cấu hình trong 1 lệnh; `update` bắt buộc thực hiện **Read-Merge-Write (patch)** để không ghi đè làm mất các trường sẵn có; hỗ trợ định danh bằng cả UUID lẫn đường dẫn tên (`--folder "Users/Auth"`).
- **Đồng bộ dữ liệu 3 lớp (Atomic Disk + Self-healing Index + Nút Smart Reload riêng):**
  - Tầng đĩa: Dùng chung `FileSystem.WriteJSON` (`.tmp-*` → `fsync` → `rename`).
  - Tầng Go Backend (Wails): Sửa `FileSystem.FindByUUID` kiểm tra `Exists(path)` trước khi trả về từ cache RAM (tự chữa lành khi CLI xóa/di chuyển file) và bỏ lệnh `IndexRebuild` quét đĩa lặp lần 2 trong `GetTree`.
  - Tầng UI (Wails): Cung cấp **nút Reload dữ liệu riêng biệt** (kèm chấm báo hiệu khi `fsnotify` phát hiện thay đổi từ bên ngoài, lọc bỏ self-write của Wails). Khi bấm nút chỉ chạy Smart Data Reload (`loadTree` giữ nguyên `expandedFolders`, `envStore.refresh`, đồng bộ `tabStore`, và tải lại tab đang mở nếu `!isDirty` hoặc hiện cảnh báo nếu `isDirty`).

## Rejected Options & Why

- **Port toàn bộ 4-Tier Variable Resolution, Auth Inheritance & Script Runner sang Go thuần rồi xóa bản TS:** Bị bác bỏ vì `VariableHighlighter.vue`, `VariableHoverPopover.vue`, `AuthEditor.vue` cần gọi đồng bộ (`computed()`) trên từng phím gõ; xóa TS sẽ làm giật UI, còn giữ cả 2 bản Go + TS sẽ dẫn tới lệch hành vi (dual-engine drift).
- **Tách CLI sang một Project/Repository riêng biệt không liên quan:** Bị bác bỏ vì phải viết lại từ đầu `model`, `storage`, `slug`, `service` và tự đồng bộ thủ công mỗi khi nâng cấp schema JSON của `hecto-api`, gây nguy cơ mất dữ liệu (schema drift).
- **Gộp chung CLI vào duy nhất binary Wails Desktop (`hecto-api`):** Bị bác bỏ vì kéo theo phụ thuộc thư viện đồ họa (GTK3/WebKit2GTK) và toàn bộ UI assets, không cài lẻ chỉ CLI được.
- **Làm MCP Server (`hecto mcp` stdio) làm giao thức chính trong MVP:** Bị bác bỏ vì tốn hàng nghìn tokens cố định ở mọi lượt hội thoại (context bloat) và tiến trình chạy ngầm dài hạn dễ bị lệch cache `FileSystem.index` so với CLI stateless.
- **Hardcode đường dẫn cài đặt `SKILL.md` cho từng loại Agent (`hecto skill install`):** Bị bác bỏ vì có quá nhiều Agent/IDE với đường dẫn khác nhau; dùng `hecto agent-guide` xuất ra `stdout` để chính Agent tự đọc/lưu là vạn năng nhất.
- **Tự động reload toàn bộ cửa sổ hoặc tự động reload cây mỗi khi focus/200ms:** Bị bác bỏ vì `GetTree()` quét nhiều file gây khựng UI và làm gián đoạn trải nghiệm người dùng.

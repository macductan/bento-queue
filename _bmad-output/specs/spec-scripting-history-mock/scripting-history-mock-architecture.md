# Architecture: Scripting Engine, Request History & Changelog, and Local Mock Server

## 1. Data Models (`projects/model/types.go` & `projects/frontend/wailsjs/go/models.ts`)

### 1.1 Scripts on `model.Request`
```go
type Scripts struct {
	PreRequest   string `json:"pre_request,omitempty"`
	PostResponse string `json:"post_response,omitempty"`
}
```
- `model.Request` bổ sung `Scripts *Scripts `json:"scripts,omitempty"``.

### 1.2 Execution History & Changelog Models
```go
type ExecutionHistoryEntry struct {
	ID           string           `json:"id"`
	CollectionID string           `json:"collection_id"`
	RequestID    string           `json:"request_id,omitempty"`
	RequestName  string           `json:"request_name"`
	Method       string           `json:"method"`
	URL          string           `json:"url"`
	StatusCode   int              `json:"status_code"`
	StatusText   string           `json:"status_text"`
	TimeMs       int64            `json:"time_ms"`
	SizeBytes    int64            `json:"size_bytes"`
	Timestamp    string           `json:"timestamp"`
	Request      ExecuteRequest   `json:"request"`
	Response     *ExecuteResponse `json:"response,omitempty"`
	Error        string           `json:"error,omitempty"`
}

type ChangelogEntry struct {
	ID           string    `json:"id"`
	CollectionID string    `json:"collection_id"`
	EntityType   string    `json:"entity_type"` // "request" | "folder" | "collection" | "environment"
	EntityID     string    `json:"entity_id"`
	EntityName   string    `json:"entity_name"`
	Action       string    `json:"action"`      // "create" | "update" | "rename" | "delete" | "duplicate"
	Summary      string    `json:"summary"`
	Timestamp    time.Time `json:"timestamp"`
}
```

### 1.3 Local Mock Server Models
```go
type MockRoute struct {
	ID          string   `json:"id"`
	Method      string   `json:"method"`
	Path        string   `json:"path"`
	StatusCode  int      `json:"status_code"`
	Headers     []KVPair `json:"headers"`
	Body        string   `json:"body"`
	DelayMs     int64    `json:"delay_ms,omitempty"`
	Enabled     bool     `json:"enabled"`
	Description string   `json:"description,omitempty"`
}

type MockServerConfig struct {
	Port   int         `json:"port"`
	Routes []MockRoute `json:"routes"`
}

type MockServerStatus struct {
	Running bool        `json:"running"`
	Port    int         `json:"port"`
	BaseURL string      `json:"base_url"`
	Routes  []MockRoute `json:"routes"`
}
```

## 2. Component & Service Design

### 2.1 Frontend Script Runner (`projects/frontend/src/utils/scriptRunner.ts`)
- Cung cấp hàm `executeScript(code: string, context: ScriptExecutionContext): ScriptExecutionResult`:
  - Khởi tạo API `pm`:
    - `pm.environment.get(key)` và `pm.variables.get(key)`: đọc từ `context.variables` (`Map<string, string>`).
    - `pm.environment.set(key, value)` và `pm.variables.set(key, value)`: chuẩn hóa `String(value ?? '')`, ghi vào `context.variables` và đánh dấu trong `envUpdates: Record<string, string>`.
    - `pm.response` (khi chạy Post-response script): cung cấp `.code`, `.status`, `.responseTime`, `.headers`, `.text()`, và `.json()`.
  - Khởi tạo `console` sandbox (`log`, `warn`, `error`, `info`) thu thập chuỗi log vào `logs: string[]`.
  - Thực thi an toàn trong khối `try / catch`, trả về `{ success, logs, envUpdates, error }`.
- Trong `responseStore.ts`:
  - Chạy `pre_request` trước khi gọi `buildExecuteRequest(...)`. Đồng bộ `envUpdates` vào `environmentStore` (nếu đang có `activeEnvId`) hoặc `collectionStore` (biến Collection).
  - Sau khi `SendRequest` trả về thành công, chạy `post_response` với `this.response`, đồng bộ `envUpdates` vào `environmentStore` / `collectionStore`.

### 2.2 Backend HistoryService (`projects/service/history.go`)
- Lưu lịch sử gọi API tại `<collRoot>/.history/executions.json` (tối đa 100 mục) và lịch sử thay đổi tại `<collRoot>/.history/changelog.json` (tối đa 200 mục).
- Tự động bỏ qua thư mục `.history` khi duyệt cây thư mục Collection (`CollectionService.GetTree` đã bỏ qua các thư mục bắt đầu bằng dấu chấm `.`).
- Tích hợp ghi nhận tự động trong `App.SendRequest`, `App.SaveRequest`, `App.CreateRequest`, `App.DeleteRequest`, `App.RenameRequest`, `App.DuplicateRequest`, `App.CreateFolder`, `App.UpdateFolder`, `App.RenameFolder`, `App.DeleteFolder`, `App.SaveEnvironment`, `App.DeleteEnvironment`.

### 2.3 Backend MockServerService (`projects/service/mock_server.go`)
- Quản lý vòng đời `http.Server` và `net.Listener` bảo vệ bằng `sync.Mutex`.
- Lưu và đọc cấu hình từ `<collRoot>/mock-server.json`.
- Khi `Start(collRoot, port)` được gọi:
  - Nếu đang chạy thì dừng instance cũ trước khi mở listener mới trên `127.0.0.1:<port>`.
  - Lưu lại port thực tế (`listener.Addr().(*net.TCPAddr).Port`) để hỗ trợ cả port cố định lẫn port `0`.
  - Khớp route theo `Method` (không phân biệt hoa thường, hoặc `"ANY"`/`"*"`) và `Path` (hỗ trợ khớp chính xác và khớp segment `:param`).
- Khi đổi Collection hoặc đóng ứng dụng, có thể dừng hoặc nạp cấu hình tương ứng.

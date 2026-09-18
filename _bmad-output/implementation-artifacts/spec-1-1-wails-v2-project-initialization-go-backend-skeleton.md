---
title: 'Story 1.1: Wails v2 Project Initialization & Go Backend Skeleton'
type: 'feature'
created: '2026-09-24'
status: 'done'
baseline_commit: 'e7a81449b5fe737a652bd09474b917e394a56789'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dự án hecto-api chưa có code nào — cần Wails v2 project hoạt động với Go backend package structure layered và Vue 3 frontend scaffold để làm foundation cho toàn bộ features.

**Approach:** Khởi tạo Wails v2 project bằng `wails init`, tổ chức Go packages theo AD-5 (app.go → service/ → storage/ → model/), định nghĩa tất cả domain types và error codes, implement storage layer với atomic file write. Frontend dùng Vue 3 scaffold mặc định từ Wails.

**Decision — Go version:** Dùng Go 1.27.1 (đúng spec kiến trúc). Goenv cần update (`cd $(goenv root) && git pull`) trước khi install.

## Boundaries & Constraints

**Always:**
- Go package structure: `app.go` (thin adapter) → `service/` → `storage/` → `model/` (AD-5)
- Mọi domain types trong `model/types.go`: Request, Folder, Environment, Collection, Result, AppError, ExecuteRequest, ExecuteResponse, KVPair, Body
- Error codes: NOT_FOUND, VALIDATION, IO_ERROR, PARSE_ERROR, CONNECTION_ERROR, TIMEOUT, ABORTED
- Result contract: `Result{Success, Data, Error{Code, Message}}` (AD-3)
- Atomic file write: temp file → fsync → os.Rename (AR-9)
- UUID v4 cho entity identity (AD-4)
- Go structured logging: `log/slog` (AR-16)
- JSON tags dùng `snake_case` cho serialization
- `storage/filesystem.go` phải implement: ReadJSON, WriteJSON, Delete, MoveFile, ListDir, MakeDir, Exists, FindByUUID

**Never:**
- Không dùng database hay cloud sync
- Không thêm business logic vào `app.go` — chỉ delegate sang service
- Không thêm Vue 3 components hay design tokens (đó là Story 1.3+)
- Không setup Tailwind, Pinia, hay fonts (Story 1.3)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| WriteJSON thành công | Valid struct + path | File JSON trên disk, atomic write | N/A |
| WriteJSON disk full | Valid struct + full disk | Temp file cleanup | IO_ERROR |
| ReadJSON thành công | Valid JSON file path | Parsed struct | N/A |
| ReadJSON file không tồn tại | Non-existent path | nil + error | NOT_FOUND |
| ReadJSON JSON corrupt | Malformed JSON file | nil + error | PARSE_ERROR |
| Delete file thành công | Existing file path | File removed | N/A |
| Delete file không tồn tại | Non-existent path | No-op hoặc error | NOT_FOUND |
| MoveFile thành công | Source + dest path | File moved | N/A |
| MoveFile source missing | Non-existent source | Error | NOT_FOUND |

</frozen-after-approval>



## Code Map

- `(chưa có)` — Project hoàn toàn mới, không có file code nào
- `.nvmrc` — Đã có, chỉ định Node 24.21.0
- `.gitignore` — Đã có, cần mở rộng cho Go/Wails artifacts
- Wails CLI — Cần cài qua `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- goenv — Quản lý Go version (hiện 1.25.4)
- nvm — Quản lý Node version (v24.21.0 đã cài, cần activate)

## Tasks & Acceptance

**Execution:**
- [x] Setup environment — Go 1.27.1 via goenv, Node 24.21.0 via nvm, Wails v2.16.0 via go install
- [x] `wails init` — Khởi tạo Wails v2 project với Vue 3 TS template trong `projects/`
- [x] `model/types.go` — Định nghĩa tất cả domain types: Request, Folder, Environment, Collection, Result, AppError, ExecuteRequest, ExecuteResponse, KVPair, Body. Error code constants. JSON tags snake_case.
- [x] `storage/filesystem.go` — Implement file I/O: ReadJSON, WriteJSON (atomic: temp→fsync→rename), Delete, MoveFile, ListDir, MakeDir, Exists, FindByUUID (index-based với TODO fallback walk)
- [x] `service/request.go` — CRUD request service với Get/Save/Delete
- [x] `service/collection.go` — CRUD collection/folder service stubs
- [x] `service/environment.go` — CRUD environment service stubs
- [x] `service/executor.go` — HTTP executor service stubs
- [x] `service/importer.go` — Postman importer service stub
- [x] `app.go` — Refactored thành thin Wails adapter, inject service dependencies
- [x] `.gitignore` — Mở rộng cho Go build artifacts, Wails build output, IDE, OS, temp files
- [x] Storage tests — 11 unit tests cho WriteJSON atomic, ReadJSON, Delete, MoveFile, FindByUUID edge cases — all PASS

**Acceptance Criteria:**
- Given project directory, when `wails dev` chạy, then webview window hiển thị thành công
- Given model/types.go, when inspect, then tất cả 10 domain types có đầy đủ fields với JSON tags snake_case
- Given 7 error code constants, when inspect, then match: NOT_FOUND, VALIDATION, IO_ERROR, PARSE_ERROR, CONNECTION_ERROR, TIMEOUT, ABORTED
- Given storage/filesystem.go, when gọi WriteJSON, then file được ghi atomic (temp→fsync→rename)
- Given app.go, when inspect, then chỉ có delegate calls tới service layer, không có business logic
- Given Go code, when `go vet ./...`, then zero warnings
- Given Go code, when `go build ./...`, then build thành công

## Implementation Notes

- Code nằm trong `projects/` (không phải root) theo yêu cầu user.
- Wails v2.16.0, Go 1.27.1, Node 24.21.0.
- go.mod directive là `go 1.25.0` (Wails minimum), runtime thực tế là 1.27.1 via .go-version.
- Storage layer implemented đầy đủ (không chỉ stub). Services là stubs có TODO.
- 11 storage tests pass: WriteJSON, ReadJSON, Delete, MoveFile, FindByUUID edge cases.

## Spec Change Log



## Review Triage Log

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| 1 | Root `.gitignore` duplicate patterns với `projects/.gitignore` | `false` | Git cascade `.gitignore` — root patterns áp dụng toàn repo, `projects/.gitignore` áp dụng trong subdirectory. Cả hai đều cần thiết. |
| 2 | `ReadJSON` NOT_FOUND dùng `%s: %s` thay vì `%s: %w` — inconsistent error wrapping | `low` (rejected) | Cosmetic — callers check bằng string prefix, không dùng `errors.Is()`. Fix sẽ thêm complexity không cần thiết cho pattern hiện tại. |
| 3 | `Delete` dùng `RemoveAll` — có thể xóa directory tree | `false` | Spec không cấm xóa directory. `DeleteFolder` cần recursive delete. `RemoveAll` là intentional. |
| 4 | `FindByUUID` thiếu fallback walk | `false` | Spec task ghi rõ "index-based với TODO fallback walk" — intentional. |
| 5 | Root `.gitignore` `*.test` pattern | `false` | `*.test` là Go test binary pattern chuẩn, đúng scope. |
| 6 | `WriteJSON` thiếu permission validation | `false` | `os.CreateTemp` tự fail với clear error nếu thiếu permission → IO_ERROR. |
| 7 | `App.fs` field stored nhưng không dùng trực tiếp | `low` (rejected) | Cosmetic — field giữ cho future use, không ảnh hưởng runtime. |
| 8 | `startup` không pass context tới services | `false` | Services không cần Wails context ở stub level. Context propagation thuộc Story 3.4+. |
| 9 | `GetCollectionTree("")` hardcoded empty string | `false` | Empty string = root path của default collection, đúng design. |
| 10 | Không có `shutdown` lifecycle method | `false` | Không có resources cần cleanup ở stage này. Index in-memory là ephemeral. |


## Design Notes

**Wails init trong existing directory:** `wails init` mặc định tạo thư mục mới. Cần dùng `-d .` hoặc init trong thư mục tạm rồi copy files vào. Kiểm tra `wails init --help` trước.

**Atomic write pattern:**
```go
func (fs *FileSystem) WriteJSON(path string, data interface{}) error {
    tmpFile, err := os.CreateTemp(filepath.Dir(path), ".tmp-*")
    // write JSON → tmpFile
    // tmpFile.Sync()
    // tmpFile.Close()
    // os.Rename(tmpFile.Name(), path)
}
```

**Wails adapter pattern:**
```go
type App struct {
    ctx     context.Context
    reqSvc  *service.RequestService
    collSvc *service.CollectionService
    // ...
}
func (a *App) GetRequest(id string) model.Result { return a.reqSvc.Get(id) }
```

## Verification

**Commands:**
- `wails dev` -- expected: webview window opens without errors
- `go vet ./...` -- expected: no warnings
- `go build ./...` -- expected: clean build
- `go test ./storage/... -v` -- expected: storage tests pass

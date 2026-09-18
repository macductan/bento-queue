---
title: 'Story 1.2: App Config & Default Collection Initialization'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '7e1dddebcd5ae9840d37e2f7a76a9a75bf1bfafb'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** App chưa có cơ chế tự khởi tạo config và default collection khi chạy lần đầu — user phải tạo thủ công hoặc app crash vì thiếu thư mục/file.

**Approach:** Tạo `ConfigService` khởi tạo trong `App.startup()`: đọc/tạo config tại `{os.UserConfigDir()}/hecto-api/config.json` chứa đường dẫn collection root, tự tạo default collection directory + `collection.json` + `environments/` subdirectory. Nếu `collection.json` bị corrupt thì backup `.bak` rồi recreate. Nếu directory creation thất bại thì log error + emit Wails event `startup-error`.

## Boundaries & Constraints

**Always:**
- Config file tại `{os.UserConfigDir()}/hecto-api/config.json` — atomic write
- Default collection tại `{os.UserCacheDir()}/hecto-api/collections/default/` (Go `os.UserCacheDir()` fallback cho XDG data directory)
- `collection.json` có UUID v4, name "Default Collection", timestamps
- `environments/` subdirectory tạo cùng lúc
- Corrupt `collection.json` (parse error) → backup thành `collection.json.bak` rồi recreate
- Permission failure → log `slog.Error` + `runtime.EventsEmit(ctx, "startup-error", message)`
- `ConfigService` testable không cần Wails context (nhận `storage.FileSystem` và paths đã resolve)

**Never:**
- Không hardcode absolute paths — luôn dùng `os.UserConfigDir()` / `os.UserCacheDir()`
- Không xóa data của user nếu config đã tồn tại
- Không thêm UI components (thuộc Story 1.3+)
- Không thay đổi storage.FileSystem public API

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First launch — nothing exists | No config dir, no data dir | Config + collection dir + collection.json + environments/ created | N/A |
| Config exists, collection exists | Valid config.json + collection.json | Skip creation, load existing paths | N/A |
| Config exists, collection missing | Valid config.json, no collection dir | Recreate collection dir + collection.json + environments/ | N/A |
| collection.json corrupt | Existing file, invalid JSON | Rename to .bak, create fresh collection.json | PARSE_ERROR logged |
| Config dir permission denied | OS blocks mkdir/write | Startup continues, error logged | IO_ERROR + startup-error event |
| Data dir permission denied | OS blocks collection mkdir | Startup continues, error logged | IO_ERROR + startup-error event |
| Config exists nhưng thiếu collection_root | JSON valid, field rỗng/thiếu | Dùng default path, update config file | N/A |

</frozen-after-approval>

## Code Map

- `projects/app.go` L45-48 -- `startup()` hiện chỉ save ctx + log. Cần gọi `ConfigService.Initialize()` ở đây.
- `projects/model/types.go` -- Domain types hiện có. Cần thêm `AppConfig` type.
- `projects/storage/filesystem.go` -- File I/O layer đã implement đầy đủ (ReadJSON, WriteJSON atomic, MakeDir, Exists). Tái sử dụng trực tiếp.
- `projects/service/collection.go` -- Collection service stubs. `ConfigService` sẽ là service riêng.
- `projects/main.go` L27 -- `OnStartup: app.startup` — entry point cho initialization.
- `projects/go.mod` -- Module `hecto-api`, Wails v2 dependency đã có.

## Tasks & Acceptance

**Execution:**
- [x] `model/config.go` -- Thêm `AppConfig` struct: `CollectionRoot string`, `CreatedAt time.Time`, `UpdatedAt time.Time`. JSON tags snake_case.
- [x] `service/config.go` -- Tạo `ConfigService` với `Initialize(ctx context.Context)` method: resolve paths, ensure config, ensure default collection, handle corrupt backup, emit startup-error event khi permission denied.
- [x] `service/config_test.go` -- Unit tests cho tất cả edge cases trong I/O Matrix: first launch, existing config, corrupt collection.json backup, permission denied handling.
- [x] `app.go` -- Inject `ConfigService` vào `App` struct, gọi `cfgSvc.Initialize(ctx)` trong `startup()`.

**Acceptance Criteria:**
- Given app starts lần đầu (no config exists), when `startup()` runs, then config.json created tại `{os.UserConfigDir()}/hecto-api/config.json` với collection_root path
- Given app starts lần đầu, when `startup()` runs, then `{dataDir}/hecto-api/collections/default/collection.json` created với UUID, name "Default Collection", timestamps
- Given app starts lần đầu, when `startup()` runs, then `{dataDir}/hecto-api/collections/default/environments/` directory exists
- Given collection.json bị corrupt, when `startup()` runs, then file gốc renamed thành `collection.json.bak` và collection.json mới được tạo
- Given config.json đã tồn tại và valid, when `startup()` runs, then không overwrite — giữ nguyên
- Given directory creation fails (permission), when `startup()` runs, then error logged và Wails event `startup-error` emitted

## Implementation Notes



## Spec Change Log



## Review Triage Log

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| 1 | `uuid` dependency indirect→direct cần `go mod tidy` | `low` (patched) | `go mod tidy` đã chạy, `go.mod` updated. Cosmetic — không ảnh hưởng runtime. |
| 2 | `loadOrCreateConfig` corrupt config overwrite không backup (khác collection.json) | `false` | Spec nói rõ backup logic chỉ cho `collection.json`. Config corrupt → recreate là intentional. |
| 3 | TOCTOU race giữa `Exists` và `ReadJSON` trong `ensureDefaultCollection` | `false` | Startup code chạy single-threaded, lần đầu duy nhất. Không concurrent access. |
| 4 | `emitStartupError` có thể panic với `context.Background()` | `false` | Tests gọi `loadOrCreateConfig`/`ensureDefaultCollection` trực tiếp, không gọi `Initialize()`. Wails event emit không được gọi trong test paths. |
| 5 | `MoveFile` backup overwrites existing `.bak` file | `false` | Acceptable recovery behavior — backup mới nhất là useful nhất. `os.Rename` replaces destination by design. |
| 6 | `os.UserCacheDir` cho persistent data thay vì `XDG_DATA_HOME` | `false` | Spec AD-7 define rõ convention này. Implementation đúng spec. |

## Design Notes

**Config structure:**
```json
{
  "collection_root": "/home/user/.cache/hecto-api/collections/default",
  "created_at": "2026-10-01T14:00:00Z",
  "updated_at": "2026-10-01T14:00:00Z"
}
```

**Startup flow:**
```
startup(ctx) → cfgSvc.Initialize(ctx)
  ├─ resolveConfigPath() → os.UserConfigDir()/hecto-api/config.json
  ├─ loadOrCreateConfig()
  │   ├─ exists? → ReadJSON
  │   └─ not exists? → create with defaults, WriteJSON
  ├─ ensureDefaultCollection(config.CollectionRoot)
  │   ├─ MakeDir collection root
  │   ├─ MakeDir environments/
  │   ├─ collection.json exists?
  │   │   ├─ valid → skip
  │   │   ├─ corrupt → backup .bak → recreate
  │   │   └─ missing → create
  │   └─ error? → log + EventsEmit("startup-error")
  └─ return config
```

## Verification

**Commands:**
- `go vet ./...` -- expected: no warnings
- `go build ./...` -- expected: clean build
- `go test ./service/... -v -run TestConfig` -- expected: all config tests pass

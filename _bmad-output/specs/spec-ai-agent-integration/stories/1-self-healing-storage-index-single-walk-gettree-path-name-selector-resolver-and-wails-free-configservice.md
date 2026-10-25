---
title: 'Self-Healing Storage Index, Single-Walk GetTree, Path/Name Selector Resolver & Wails-Free ConfigService'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '0b3cf5f7b396676321f8c604c0b6132f0df711a5'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-ai-agent-integration/SPEC.md'
  - '_bmad-output/specs/spec-ai-agent-integration/cli-and-sync-architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại `ConfigService` (`projects/service/config.go`) import trực tiếp `github.com/wailsapp/wails/v2/pkg/runtime` khiến tầng `service` bị ràng buộc vào Wails/GTK và chưa hỗ trợ ghi đè thư mục cấu hình độc lập qua `HECTO_CONFIG_DIR`; đồng thời `FileSystem.FindByUUID` trả về ngay đường dẫn từ cache RAM mà không kiểm tra tệp hoặc `_folder.json` còn tồn tại trên đĩa khi có thay đổi từ CLI bên ngoài, `CollectionService.GetTree` quét đĩa lặp 2 lần (`IndexRebuild` + `buildTree`), và hệ thống thiếu bộ phân giải định danh theo tên/đường dẫn phân cấp tên cho Collection, Environment, Folder, Request.

**Approach:** Tách `wailsRuntime` khỏi `ConfigService` bằng callback `onStartupError` tùy chọn và bổ sung `HECTO_CONFIG_DIR` / `SetCustomConfigDir`; nâng cấp `FileSystem.FindByUUID` tự chữa lành (self-healing) khi tệp hoặc `_folder.json` bị xóa/di chuyển từ bên ngoài; tối ưu `CollectionService.GetTree` nạp index cho cả Folder và Request trong một lượt duyệt `buildTree` duy nhất; và xây dựng `projects/service/selector.go` cung cấp 4 hàm phân giải định danh (`ResolveCollectionSelector`, `ResolveEnvironmentSelector`, `ResolveFolderSelector`, `ResolveRequestSelector`) theo cả UUID lẫn đường dẫn phân cấp tên.

## Boundaries & Constraints

**Always:**
- Xóa hoàn toàn import `github.com/wailsapp/wails/v2/pkg/runtime` khỏi `projects/service/config.go`; sử dụng `SetStartupErrorHandler(fn func(ctx context.Context, message string))` và đăng ký callback trong `projects/app.go`.
- Hỗ trợ ghi đè thư mục cấu hình và dữ liệu thông qua biến môi trường `HECTO_CONFIG_DIR` hoặc `SetCustomConfigDir(dir string)` trên `ConfigService` (`configPath = filepath.Join(customDir, "config.json")`, `defaultCollectionsRoot = filepath.Join(customDir, "collections")`).
- Trong `FileSystem.FindByUUID(uuid string)`: khi tìm thấy `path` trong `f.index`, bắt buộc kiểm tra `f.Exists(path) && (strings.HasSuffix(path, ".json") || f.Exists(filepath.Join(path, "_folder.json")))`; nếu không thỏa mãn thì gọi `f.IndexDelete(uuid)` và thực hiện fallback `f.walkFindUUID(collRoot, uuid)` để tự chữa lành cache RAM.
- Trong `CollectionService.buildRequestNode(fullPath string)`: gọi `s.fs.IndexSet(req.ID, fullPath)` khi `req.ID != ""`; trong `CollectionService.GetTree(rootPath string)`: thay `s.fs.IndexRebuild(rootPath)` bằng `s.fs.SetCollectionRoot(rootPath)` và `s.fs.IndexClear()` để chỉ duyệt đĩa đúng 1 lần trong `buildTree`.
- Trong `projects/service/selector.go`: luôn gọi `fs.SetCollectionRoot(collRoot)` ngay khi xác định được `collRoot`; hỗ trợ tra cứu bằng cả UUID lẫn tên/đường dẫn phân cấp tên (bỏ phần tử rỗng do dấu `/` ở đầu/cuối/lặp, ưu tiên khớp tên trực tiếp nếu tên thực thể chứa dấu `/`); `ResolveRequestSelector` bắt buộc đọc đầy đủ `model.Request` từ đĩa qua `fs.ReadJSON(node.Path, &req)` kèm `pathFolders` và `allFolders`; trả về lỗi `VALIDATION` kèm danh sách UUID khi phát hiện trùng tên ở cùng một cấp.
- Toàn bộ bài kiểm thử bắt buộc sử dụng `t.TempDir()`, tuyệt đối không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không import bất kỳ gói nào thuộc `github.com/wailsapp/wails/v2` trong `projects/service/`, `projects/storage/`, hoặc `projects/model/`.
- Không dựng `model.Request` trả về từ `ResolveRequestSelector` chỉ bằng thông tin rút gọn trên `model.TreeNode` (vì sẽ thiếu `Headers`, `Params`, `PathParams`, `Scripts`).
- Không giữ đường dẫn giả không tồn tại trên đĩa trong `TestFindByUUID_IndexHit`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `ConfigService` với `HECTO_CONFIG_DIR` hoặc `SetCustomConfigDir` | Thiết lập `HECTO_CONFIG_DIR=/tmp/test-hecto` và gọi `Initialize(ctx)` | Tạo `/tmp/test-hecto/config.json` và `/tmp/test-hecto/collections/default/collection.json` | No error expected |
| `FindByUUID` tự chữa lành khi request/folder bị di chuyển bên ngoài | `f.index[uuid]` trỏ tới đường dẫn cũ đã bị `os.Rename` sang thư mục khác trong `collRoot` | Xóa cache cũ, quét `walkFindUUID`, cập nhật `f.index[uuid]` sang đường dẫn mới và trả về đường dẫn mới | No error expected |
| `FindByUUID` tự chữa lành khi folder mất `_folder.json` | Thư mục vẫn tồn tại trên đĩa nhưng tệp `_folder.json` bên trong đã bị xóa | Phát hiện thiếu `_folder.json`, xóa `f.index[uuid]`, fallback walk và trả về lỗi `NOT_FOUND` | Trả về lỗi `NOT_FOUND` |
| Phân giải Folder/Request theo đường dẫn có dấu `/` thừa hoặc tên chứa `/` | Selector `"/Users//Auth/"` hoặc request có tên `"GET /users/profile"` | Chuẩn hóa đường dẫn tìm đúng folder `Auth`; ưu tiên khớp trực tiếp tên `"GET /users/profile"` và đọc đủ `model.Request` từ đĩa | No error expected |
| Trùng tên thực thể ở cùng một cấp | 2 request cùng tên `"Login"` trong thư mục `"Auth"` (hoặc 2 folder/env/collection cùng tên) | Không chọn bừa; báo lỗi rõ ràng | Trả về lỗi `VALIDATION` liệt kê danh sách UUID trùng |

</intent-contract>

## Code Map

- `projects/service/config.go` -- Tách import `wailsRuntime`, thêm `onStartupError`, `customConfigDir`, `SetStartupErrorHandler`, `SetCustomConfigDir`, `GetConfig`, và hỗ trợ `HECTO_CONFIG_DIR` trong `resolveConfigPath` / `resolveDefaultCollectionsRoot`.
- `projects/app.go` -- Đăng ký `a.cfgSvc.SetStartupErrorHandler` trong `NewApp` / `startup` để phát sự kiện Wails `"startup-error"`.
- `projects/storage/filesystem.go` -- Cập nhật `FindByUUID` kiểm tra sự tồn tại của file `.json` hoặc `_folder.json` trên đĩa và tự chữa lành khi cache lỗi thời.
- `projects/storage/filesystem_test.go` -- Cập nhật `TestFindByUUID_IndexHit` dùng file thật trên `t.TempDir()` và thêm các bài test self-healing cho request/folder bị xóa hoặc di chuyển.
- `projects/service/collection.go` -- Thêm `s.fs.IndexSet(req.ID, fullPath)` vào `buildRequestNode` và thay `IndexRebuild` bằng `SetCollectionRoot` + `IndexClear` trong `GetTree`.
- `projects/service/selector.go` -- Hiện thực hóa `ResolveCollectionSelector`, `ResolveEnvironmentSelector`, `ResolveFolderSelector`, `ResolveRequestSelector` (cả phương thức trên `*CollectionService` và hàm mức package).
- `projects/service/selector_test.go` -- Bộ unit test đầy đủ cho 4 hàm selector và các trường hợp biên trên `t.TempDir()`.

## Tasks & Acceptance

**Execution:**
- `projects/service/config.go` -- Xóa import `github.com/wailsapp/wails/v2/pkg/runtime`; thêm `onStartupError`, `customConfigDir`, `SetStartupErrorHandler`, `SetCustomConfigDir`, `GetConfig`; cập nhật `resolveConfigPath` và `resolveDefaultCollectionsRoot` ưu tiên `customConfigDir` và `HECTO_CONFIG_DIR` -- Để tầng `service` hoàn toàn độc lập với Wails và hỗ trợ cô lập dữ liệu khi chạy CLI/test.
- `projects/app.go` -- Đăng ký callback `a.cfgSvc.SetStartupErrorHandler` phát sự kiện `runtime.EventsEmit(ctx, "startup-error", msg)` -- Giữ nguyên hành vi thông báo lỗi khởi động trên Wails Desktop.
- `projects/storage/filesystem.go` -- Cập nhật `FindByUUID` kiểm tra `f.Exists(path) && (strings.HasSuffix(path, ".json") || f.Exists(filepath.Join(path, "_folder.json")))`, tự động `IndexDelete(uuid)` và `walkFindUUID` khi cache không còn hợp lệ -- Đảm bảo cache UUID tự chữa lành khi CLI thao tác xóa/di chuyển file từ tiến trình ngoài.
- `projects/service/collection.go` -- Bổ sung `s.fs.IndexSet(req.ID, fullPath)` trong `buildRequestNode` và đổi `GetTree` sang `SetCollectionRoot` + `IndexClear` trước khi gọi `buildTree` -- Loại bỏ lượt quét đĩa lặp thứ hai khi tải cây thư mục.
- `projects/service/selector.go` -- Tạo mới file chứa `ResolveCollectionSelector`, `ResolveEnvironmentSelector`, `ResolveFolderSelector`, `ResolveRequestSelector` -- Cung cấp bộ phân giải định danh linh hoạt theo UUID hoặc tên/đường dẫn phân cấp tên.
- `projects/storage/filesystem_test.go` -- Cập nhật `TestFindByUUID_IndexHit` và viết thêm unit tests kiểm thử self-healing khi file/folder bị di chuyển, xóa hoặc mất `_folder.json` -- Xác minh cơ chế tự chữa lành hoạt động chính xác.
- `projects/service/selector_test.go` -- Viết unit tests cho `ResolveCollectionSelector`, `ResolveEnvironmentSelector`, `ResolveFolderSelector`, `ResolveRequestSelector` và `ConfigService` (`HECTO_CONFIG_DIR` / `SetCustomConfigDir` / `SetStartupErrorHandler`) -- Đảm bảo bao phủ toàn bộ I/O & Edge-Case Matrix.

**Acceptance Criteria:**
- Given `projects/service/config.go`, when kiểm tra danh sách gói import của `hecto-api/service`, then hoàn toàn không có `github.com/wailsapp/wails/v2/pkg/runtime` và `ConfigService` định vị đúng `config.json` cùng `collections/` bên trong `HECTO_CONFIG_DIR` hoặc `SetCustomConfigDir`.
- Given một Request hoặc Folder đã được lưu trong `FileSystem.index`, when tệp request hoặc thư mục bị di chuyển sang vị trí khác hoặc bị xóa `_folder.json` trực tiếp trên đĩa, then `FindByUUID` tự động xóa mục cache cũ, quét lại `collRoot` để trả về đường dẫn mới (hoặc `NOT_FOUND` nếu đã bị xóa).
- Given một Collection có nhiều thư mục và request, when gọi `CollectionService.GetTree(collRoot)`, then toàn bộ UUID của cả Folder và Request đều được nạp vào `FileSystem` index chỉ qua 1 lượt duyệt `buildTree` mà không gọi `IndexRebuild`.
- Given cây Collection có các thực thể Collection, Environment, Folder lồng nhau và Request, when gọi `ResolveCollectionSelector`, `ResolveEnvironmentSelector`, `ResolveFolderSelector`, `ResolveRequestSelector` bằng UUID hoặc đường dẫn tên (kể cả có dấu `/` dư thừa hoặc tên chứa `/`), then hệ thống thiết lập `fs.SetCollectionRoot(collRoot)`, trả về đúng thực thể (với `model.Request` đầy đủ các trường `Headers`, `Params`, `PathParams`, `Scripts` từ đĩa kèm `pathFolders`, `allFolders`), hoặc trả về lỗi `VALIDATION` kèm danh sách UUID nếu trùng tên ở cùng một cấp.

## Spec Change Log

## Review Triage Log

### Iteration 1

**Fixed:**
- `projects/service/selector.go` -- Nâng cấp `matchFolderNodes` / `matchRequestNodes` sử dụng so khớp đa đoạn (multi-segment prefix matching) để hỗ trợ cả các thư mục có tên chứa dấu `/` chứa các thư mục/request con lồng bên trong (ví dụ `"API v1/v2/SubFolder"`).
- `projects/service/collection.go` -- Kiểm tra `s.fs.ListDir(rootPath)` trước khi gọi `s.fs.SetCollectionRoot(rootPath)` và `s.fs.IndexClear()` trong `GetTree` để không làm mất index của collection đang hoạt động nếu `rootPath` không hợp lệ.
- `projects/storage/filesystem.go` -- Trong `SetCollectionRoot`, tự động xóa `f.index` khi chuyển đổi giữa hai `collectionRoot` khác rỗng khác nhau để tránh nhiễm chéo UUID cache.
- `projects/service/selector_test.go` -- Bổ sung kiểm thử xóa `collectionRoot` sau `GetTree` để chứng minh truy xuất từ index RAM, kiểm thử `ResolveCollectionSelector` theo exact ID, `ResolveRequestSelector` theo UUID, và truy xuất con bên trong thư mục có dấu `/`.

## Verification

**Commands:**
- `cd projects && go test ./storage/... ./service/...` -- expected: PASS 100%
- `cd projects && go test ./...` -- expected: PASS 100%

## Auto Run Result

- **Result:** DONE
- **Summary:** Hoàn thành tách Wails khỏi `ConfigService` (thay bằng callback `onStartupError` + hỗ trợ `HECTO_CONFIG_DIR`/`SetCustomConfigDir`), nâng cấp `FileSystem.FindByUUID` tự chữa lành, tối ưu `CollectionService.GetTree` duyệt đĩa 1 lần, và hiện thực hóa bộ 4 hàm phân giải selector trong `projects/service/selector.go` kèm unit tests đạt 100% pass.
- **Files Changed:** `projects/service/config.go`, `projects/app.go`, `projects/storage/filesystem.go`, `projects/storage/filesystem_test.go`, `projects/service/collection.go`, `projects/service/selector.go`, `projects/service/selector_test.go`
- **Verification:** `cd projects && go test ./...` PASS 100%; `bun run type-check && bun run test` PASS 100%
- **Review Iterations:** 1
- **Deferred Items:** 0
- **Warnings:** 0


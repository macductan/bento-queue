---
title: 'Concurrent HTTP Executor (TimeoutMs), Flow & FlowFolder Storage Models, FlowService CRUD/Tree & Selector/Git Integration'
type: 'feature'
created: '2026-10-25'
status: 'done'
baseline_revision: 'ecd0ff3e9887c1177bf45a16bc8e98ea408e1389'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-api-flow-runner/SPEC.md'
  - '_bmad-output/specs/spec-api-flow-runner/flow-architecture-and-schema.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại `ExecutorService.Send` (`projects/service/executor.go`) sử dụng cờ đơn luồng `inflight bool` chặn mọi HTTP Request gọi đồng thời (`ErrRequestInProgress`) và chưa hỗ trợ ghi đè `timeout_ms` trên từng Request; đồng thời hệ thống chưa có mô hình lưu trữ và quản lý thực thể `Flow` / `FlowFolder` độc lập tại `<collection>/flows/`, bộ phân giải định danh theo đường dẫn cho Flow, cũng như nhận diện `flow` / `flow_folder` trong Git 3-Way JSON Merge.

**Approach:** Nâng cấp `ExecutorService` thay cờ `inflight` bằng `activeCancels map[uint64]context.CancelFunc` có `sync.Mutex` bảo vệ để cho phép bắn nhiều HTTP Request song song, áp dụng `req.TimeoutMs > 0` cho `context.WithTimeout` và hủy toàn bộ Request đang bay khi gọi `Abort()`; cô lập `<collection>/flows/` khỏi `CollectionService.buildTree`; xây dựng `FlowService` (`projects/service/flow.go`) cung cấp trọn bộ CRUD, Tree, Move, Reorder, Sort, Duplicate cùng Wails bindings trong `projects/app.go`; bổ sung `ResolveFlowSelector` và `ResolveFlowFolderSelector` vào `projects/service/selector.go`; và cập nhật `detectEntityMeta` / `fieldLabels` trong `projects/service/git_merge.go`.

## Boundaries & Constraints

**Always:**
- Trong `projects/model/types.go`: bổ sung `TimeoutMs int` (`json:"timeout_ms,omitempty"`) vào `ExecuteRequest`; định nghĩa đầy đủ `FlowBranchCondition`, `FlowBranch`, `FlowStep`, `FlowNode`, `Flow`, `FlowFolder`, `FlowTreeNode` theo đúng schema tại `flow-architecture-and-schema.md`.
- Trong `projects/service/executor.go`: xóa `inflight bool` và `cancelFn` đơn lẻ; dùng `nextReqID uint64` và `activeCancels map[uint64]context.CancelFunc` dưới `sync.Mutex` để hỗ trợ nhiều lệnh `Send` đồng thời; nếu `req.TimeoutMs > 0` thì dùng `time.Duration(req.TimeoutMs) * time.Millisecond`, ngược lại dùng `s.timeout`; `Abort()` hủy toàn bộ `cancelFunc` trong `activeCancels` và xóa rỗng map.
- Trong `projects/service/collection.go`: `buildTree` và `isDeletableFolderPath` bắt buộc bỏ qua thư mục `"flows"` để cây Request bên màn `APIs` hoàn toàn tách biệt với dữ liệu Flow.
- Trong `projects/storage/filesystem.go`: `walkJSONEntities` không đưa tệp gốc `<collection>/flows/_folder.json` (`id: "flows-root"`) vào UUID index của folder, nhưng vẫn index đầy đủ mọi `<flow-uuid>.json` và `_folder.json` của các `FlowFolder` con bên trong `<collection>/flows/`.
- Trong `projects/service/flow.go`: `FlowFolder` chỉ lưu `{ id, name, order, created_at, updated_at }`; `FlowService.GetTree` đăng ký `s.fs.IndexSet(id, fullPath)` cho mọi `Flow` và `FlowFolder` mà không gọi `IndexClear()`; kiểm tra chặt chẽ mọi thao tác ghi/xóa/di chuyển của `FlowService` chỉ diễn ra bên trong `<collection>/flows/`.
- Toàn bộ unit tests bắt buộc chạy trên `t.TempDir()`, không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không thêm `variables`, `folder_envs`, `headers`, `auth`, `auth_envs` vào `FlowFolder` hoặc `FlowStep`.
- Không trả về lỗi `ErrRequestInProgress` khi gọi `ExecutorService.Send` đồng thời.
- Không gọi `s.fs.IndexClear()` bên trong `FlowService.GetTree` vì sẽ xóa mất index UUID của cây Request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gửi đồng thời nhiều HTTP Request qua `ExecutorService.Send` | 3 goroutines gọi `Send(req)` cùng lúc tới server có độ trễ | Cả 3 request chạy song song và đều trả về `Success: true` với `StatusCode: 200` | Không báo lỗi `ErrRequestInProgress` |
| Ghi đè `TimeoutMs` trên `ExecuteRequest` | `s.timeout = 5s`, gửi `req` với `TimeoutMs: 30` tới server sleep `200ms` | Request bị hủy sau ~30ms và trả về mã lỗi `TIMEOUT` | Trả về `model.ErrTimeout` |
| Hủy đồng thời nhiều HTTP Request đang bay qua `ExecutorService.Abort()` | 3 goroutines đang chờ phản hồi từ server, gọi `exec.Abort()` | Toàn bộ 3 goroutines kết thúc ngay lập tức với lỗi `ABORTED` | Trả về `model.ErrAborted` cho cả 3 request |
| Cô lập `<collection>/flows/` khỏi cây Request | Tạo `FlowFolder` và `Flow` trong `<collection>/flows/`, sau đó gọi `CollectionService.GetTree` | `CollectionService.GetTree` không chứa bất kỳ mục nào từ `flows/`; `FlowService.GetTree` trả về đúng cây `FlowFolder` và `Flow` kèm `step_count` | No error expected |
| Quản lý vòng đời `Flow` & `FlowFolder` (CRUD, Duplicate, Move, Reorder, Sort) | Tạo `FlowFolder`, tạo `Flow`, lưu `Nodes`, nhân bản, đổi tên, sắp xếp A-Z, di chuyển `Flow` và `FlowFolder` (kể cả chặn di chuyển vòng lặp vào chính nó/con của nó) | Dữ liệu JSON trên đĩa và thứ tự `order` trong `_folder.json` được cập nhật chính xác; UUID index tự động đồng bộ | Trả về `VALIDATION` / `NOT_FOUND` khi đầu vào không hợp lệ |
| Phân giải `ResolveFlowSelector` & `ResolveFlowFolderSelector` | Tra cứu bằng UUID hoặc đường dẫn `"E2E Checkout/Order Payment Flow"`, hoặc có 2 Flow trùng tên trong cùng thư mục | Trả về đúng `model.Flow` và chuỗi `ancestors` khi duy nhất; báo lỗi `VALIDATION` kèm danh sách UUID khi trùng tên cùng cấp | Trả về `VALIDATION` hoặc `NOT_FOUND` |
| Nhận diện thực thể Flow trong `GitSyncService` | Xung đột Git trên `flows/order-flow.json` và `flows/e2e/_folder.json` | `detectEntityMeta` trả về `entity_type: "flow"` và `"flow_folder"` kèm tên thực thể và nhãn trường tiếng Việt | No error expected |

</intent-contract>

## Code Map

- `projects/model/types.go` -- Thêm `TimeoutMs` vào `ExecuteRequest`; định nghĩa `FlowBranchCondition`, `FlowBranch`, `FlowStep`, `FlowNode`, `Flow`, `FlowFolder`, `FlowTreeNode`.
- `projects/service/executor.go` -- Thay `inflight`/`cancelFn` bằng `nextReqID` và `activeCancels map[uint64]context.CancelFunc`, hỗ trợ `req.TimeoutMs` và hủy hàng loạt trong `Abort()`.
- `projects/service/executor_test.go` -- Cập nhật kiểm thử gửi đồng thời nhiều request, `TimeoutMs` cấp request và `Abort()` nhiều request đang bay.
- `projects/storage/filesystem.go` -- Bỏ qua `<collection>/flows/_folder.json` (file cấu hình thứ tự gốc `flows-root`) khi quét `walkJSONEntities` và thêm `IndexClearExceptSubdir`.
- `projects/service/collection.go` -- Bỏ qua thư mục `"flows"` trong `buildTree`, `isDeletableFolderPath`, `MoveRequest`, `RenameFolder`, `LoadFolder`, `UpdateFolder` và giữ nguyên index `flows/` khi gọi `GetTree`.
- `projects/service/request.go` -- Từ chối các đường dẫn nằm trong `<collection>/flows/` khi gọi `Get`, `Save`, `Delete`, `Rename`, `Duplicate`.
- `projects/service/errors.go` -- Bổ sung các hằng số thông báo lỗi tiếng Việt cho `Flow` và `FlowFolder`.
- `projects/service/flow.go` -- Hiện thực hóa `FlowService` (`GetTree`, `GetFlow`, `CreateFlow`, `CreateFlowWithDetails`, `SaveFlow`, `RenameFlow`, `DeleteFlow`, `DuplicateFlow`, `CreateFlowFolder`, `CreateFlowFolderNamed`, `RenameFlowFolder`, `DeleteFlowFolder`, `ReorderNodes`, `MoveNode`, `SortNodes`, `ListFlows`).
- `projects/service/flow_test.go` -- Unit tests toàn diện cho `FlowService` và cô lập hai chiều với `CollectionService` / `RequestService`.
- `projects/service/selector.go` -- Bổ sung `ResolveFlowSelector` và `ResolveFlowFolderSelector` (hỗ trợ UUID và đường dẫn phân cấp tên, báo lỗi trùng tên cùng cấp).
- `projects/service/selector_test.go` -- Unit tests cho `ResolveFlowSelector` và `ResolveFlowFolderSelector`.
- `projects/service/git_merge.go` -- Cập nhật `detectEntityMeta` nhận diện `"flow"` / `"flow_folder"` và thêm nhãn trường vào `fieldLabels`.
- `projects/service/git_merge_test.go` -- Unit tests kiểm tra `detectEntityMeta` và `MergeJSONObjects` cho `flow` và `flow_folder`.
- `projects/app.go` -- Khởi tạo `flowSvc *service.FlowService`, xuất 13 Wails bindings cho Flow/FlowFolder và `ExportFlowTypes`.

## Tasks & Acceptance

**Execution:**
- `projects/model/types.go` -- Bổ sung `TimeoutMs` vào `ExecuteRequest` và các struct `FlowBranchCondition`, `FlowBranch`, `FlowStep`, `FlowNode`, `Flow`, `FlowFolder`, `FlowTreeNode` -- Cung cấp mô hình dữ liệu chuẩn cho tầng thực thi và lưu trữ Flow.
- `projects/service/executor.go` -- Chuyển sang quản lý `activeCancels map[uint64]context.CancelFunc` và áp dụng `req.TimeoutMs` -- Cho phép thực thi Hàng Song song và hủy đồng thời các Request đang bay.
- `projects/storage/filesystem.go`, `projects/service/collection.go`, `projects/service/request.go` -- Cô lập hai chiều thư mục `"flows"` với `CollectionService` / `RequestService` và bỏ qua `flows/_folder.json` gốc trong `walkJSONEntities` -- Ngăn cây Request đọc nhầm, sửa nhầm hoặc xóa nhầm dữ liệu Flow.
- `projects/service/errors.go` & `projects/service/flow.go` & `projects/app.go` -- Xây dựng `FlowService` quản lý `<collection>/flows/` và kết nối Wails bindings vào `App` -- Cung cấp đầy đủ thao tác CRUD, Tree, Reorder, Move, Sort, Duplicate cho UI và CLI.
- `projects/service/selector.go` & `projects/service/git_merge.go` -- Thêm `ResolveFlowSelector`, `ResolveFlowFolderSelector` và nhận diện `flow`/`flow_folder` trong Git 3-Way Merge -- Đồng bộ tìm kiếm định danh và giải quyết xung đột Git cho Flow.
- `projects/service/executor_test.go`, `projects/service/flow_test.go`, `projects/service/selector_test.go`, `projects/service/git_merge_test.go` -- Viết unit tests bao phủ toàn bộ I/O & Edge-Case Matrix -- Xác minh tính đúng đắn và an toàn luồng (race-free).

**Acceptance Criteria:**
- Given nhiều HTTP Request được gọi `ExecutorService.Send` đồng thời, when một số request có `TimeoutMs` riêng hoặc người dùng gọi `ExecutorService.Abort()`, then các request chạy song song không chặn nhau, request có `TimeoutMs` ngắn tự timeout đúng hạn, và `Abort()` hủy toàn bộ request đang bay với mã `ABORTED`.
- Given một Collection có cả Request/Folder thông thường và `Flow`/`FlowFolder` trong `<collection>/flows/`, when gọi `CollectionService.GetTree` và `FlowService.GetTree` theo bất kỳ thứ tự nào, then hai cây hoàn toàn tách biệt nhau và mọi UUID của cả hai cây đều tra cứu được qua `FileSystem.FindByUUID`.
- Given cây `<collection>/flows/`, when thực hiện tạo, đọc, lưu, đổi tên, nhân bản, xóa, di chuyển, sắp xếp các `Flow` và `FlowFolder` hoặc phân giải qua `ResolveFlowSelector` / `ResolveFlowFolderSelector`, then dữ liệu trên đĩa, thứ tự `_folder.json` và kết quả phân giải đều chính xác.
- Given xung đột Git trên tệp `flows/<uuid>.json` hoặc `flows/<dir>/_folder.json`, when chạy `detectEntityMeta` và `MergeJSONObjects`, then hệ thống nhận diện đúng `entity_type` là `"flow"` hoặc `"flow_folder"` kèm nhãn trường tương ứng.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 10 findings — high 2, medium 5, low 3, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` Cô lập hai chiều giữa `RequestService`/`CollectionService` và `<collection>/flows/` cùng bảo toàn UUID index khi gọi `CollectionService.GetTree` sau `FlowService.GetTree` — Đã bổ sung `IndexClearExceptSubdir("flows")` trong `FileSystem` và chặn đường dẫn `flows/` trong `RequestService` (`Get`, `Save`, `Delete`, `Rename`, `Duplicate`) cùng `CollectionService` (`MoveRequest`, `RenameFolder`, `LoadFolder`, `UpdateFolder`).
  - `[high]` `[patch]` Bổ sung kiểm thử `SaveFlow`, `RenameFlowFolder`, `ReorderNodes` và kiểm thử cô lập hai chiều trong `projects/service/flow_test.go` — Đã thêm đầy đủ các bài test xác minh trong `flow_test.go`.
  - `[medium]` `[patch]` `readOrInitFolderMeta` chỉ khởi tạo `ID: "flows-root"` cho thư mục gốc `<collection>/flows/` và trả về `NOT_FOUND` nếu thiếu `_folder.json` ở thư mục con — Đã sửa qua `isRootFlowsDir`.
  - `[medium]` `[patch]` Neo chặt fallback của `isPathInFlowsDir` vào `collection.json` hoặc `_folder.json` (`flows-root`) khi `effRoot == ""` — Đã sửa qua `isFlowsDirRoot`.
  - `[medium]` `[patch]` Kiểm tra lỗi `buildTree(targetDir)` trước khi ghi thứ tự, chặn ghi đè file đích và tự động đổi tên `" (2)"` khi `MoveNode` di chuyển Flow trùng tên — Đã sửa trong `FlowService.MoveNode`.
  - `[medium]` `[patch]` Bổ sung `ExportFlowTypes` trên `App` để Wails sinh TypeScript model cho `FlowTreeNode` và `FlowFolder` — Đã thêm trong `projects/app.go`.
  - `[medium]` `[patch]` Ghi nhận changelog trong `SortFlowNodes` và dùng tên Flow thực tế trong `DuplicateFlow` — Đã cập nhật trong `projects/app.go`.
  - `[low]` `[patch]` Cắt độ dài tên gốc trước khi nối `" (bản sao)"` trong `DuplicateFlow`, chặn `flow.ID == "flows-root"` trong `buildFlowNode`, chuẩn hóa `Layout` và bảo toàn `existing.CreatedAt` trong `SaveFlow` — Đã sửa trong `projects/service/flow.go`.
  - `[low]` `[patch]` Sắp xếp khóa `byLen` tăng dần trong `projects/service/selector.go` để thứ tự khớp tiền tố luôn tất định — Đã sửa trong `selector.go`.
  - `[low]` `[patch]` Xóa hằng số thừa `ErrRequestInProgress` và giới hạn `MaxTimeoutMs` trong `ExecutorService.Send` chống tràn số `time.Duration` — Đã sửa trong `errors.go` và `executor.go`.

## Verification

**Commands:**
- `cd projects && go test -race ./storage/... ./service/...` -- expected: PASS 100%
- `cd projects && go test ./...` -- expected: PASS 100%

## Auto Run Result

- **Summary:** Hoàn thành nâng cấp `ExecutorService` hỗ trợ bắn nhiều HTTP Request đồng thời kèm `TimeoutMs` và `Abort()` hàng loạt; xây dựng mô hình `Flow`/`FlowFolder`/`FlowTreeNode`, `FlowService` CRUD/Tree/Move/Reorder/Sort/Duplicate cô lập hai chiều tại `<collection>/flows/`, Wails bindings trên `App`, `ResolveFlowSelector`/`ResolveFlowFolderSelector` và tích hợp `GitSyncService`.
- **Files Changed:**
  - `projects/model/types.go` — Thêm `TimeoutMs` vào `ExecuteRequest` và các struct dữ liệu Flow/FlowFolder.
  - `projects/service/executor.go` & `projects/service/executor_test.go` — Hỗ trợ gửi HTTP đồng thời, `TimeoutMs` và `Abort()` đa luồng.
  - `projects/storage/filesystem.go` — Bỏ qua `flows/_folder.json` gốc khi quét index và thêm `IndexClearExceptSubdir`.
  - `projects/service/collection.go` & `projects/service/request.go` — Cô lập hai chiều với `<collection>/flows/`.
  - `projects/service/flow.go`, `projects/service/errors.go`, `projects/service/flow_test.go` — Hiện thực hóa `FlowService` và bộ unit test toàn diện.
  - `projects/service/selector.go` & `projects/service/selector_test.go` — Bổ sung `ResolveFlowSelector` và `ResolveFlowFolderSelector`.
  - `projects/service/git_merge.go` & `projects/service/git_merge_test.go` — Nhận diện `flow` và `flow_folder` trong Git 3-Way Merge.
  - `projects/app.go` — Kết nối `FlowService` và 13 Wails bindings + `ExportFlowTypes`.
- **Review Findings Breakdown:** 10 patched (2 high, 5 medium, 3 low), 0 deferred, 0 rejected.
- **Follow-up Review Recommendation:** `false` (all findings verified and covered by automated unit tests).
- **Verification Performed:** `cd projects && go test -race ./storage/... ./service/...` (PASS 100%), `cd projects && go test ./...` (PASS 100%).
- **Residual Risks:** None.

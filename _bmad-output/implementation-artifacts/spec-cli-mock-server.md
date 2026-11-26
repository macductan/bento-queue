---
title: 'Hỗ trợ Mock HTTP Server trong hecto CLI (hecto mock)'
type: 'feature'
created: '2026-11-18'
status: 'done'
route: 'dispatch'
baseline_commit: '22fb8fe9501f2cb05c9ddfd4c068db651a47154d'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng và AI Agent mới chỉ cấu hình và chạy Mock HTTP Server qua Desktop UI (`MockServerModal.vue`), chưa thể thao tác `<collection>/mock-server.json` hay chạy/dừng server từ `hecto` CLI.

**Approach:** Bổ sung `hecto mock status|config|start|stop` (`serve` alias `start`) và `hecto mock route list|get|create|update|delete` vào `projects/cmd/hecto/main.go`, tái sử dụng `service.MockServerService` cùng 1 file state toàn cục `<configDir>/mock-daemon.json` đảm bảo chỉ 1 Mock Server / 1 port mở tại 1 thời điểm, hỗ trợ `--json`, Read-Merge-Write (`FlagSet.Visit`), vị trí cờ linh hoạt, và cập nhật `projects/cmd/hecto/SKILL.md`.

## Boundaries & Constraints

**Always:**
- Tái sử dụng `service.MockServerService` (`GetStatus`, `SaveConfig`, `Start`, `Stop`, thêm `ReloadRoutes`) và ghi `<collection>/mock-server.json` qua `storage.FileSystem.WriteJSON` (atomic write, kích hoạt `CollectionWatcher`).
- Khớp schema `MockServerConfig`/`MockRoute`/`MockServerStatus`: method `GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|ANY`, `port` `1024..65535` (mặc định `4010`, không dùng port `0`), `status_code` `100..599` (mặc định `200`), `delay_ms` `0..30000` (mặc định `0`), `enabled: true` khi tạo route.
- Selector route nhận `<id>` hoặc `"METHOD /path"` (method in hoa + `CleanMockPath`; báo `VALIDATION` kèm danh sách ID nếu trùng).
- **Single Active Instance:** Chỉ dùng 1 file `<configDir>/mock-daemon.json` (`pid`, `port`, `base_url`, `collection_id`, `coll_root`, `started_at`), không lưu trong `<collection>/`. Mọi `start` (foreground/`--daemon`) tự dừng tiến trình cũ đang sống trước khi bind port mới và tự hot-reload `routes` khi `mock-server.json` đổi.
- `start --daemon` tách stdio con, chờ TCP ready mới in JSON (`running: true`, `pid`, `port`, `base_url`, `routes`) và thoát `0`. `status [-c <coll>]` chỉ đặt `running: true` khi tiến trình sống khớp đúng `<coll>` (nếu ở coll khác trả `running: false` kèm metadata tiến trình đang chạy) và tự dọn stale PID.
- Đăng ký cờ boolean (`daemon`, `enabled`, `disabled`) vào `knownBooleanFlags`; hỗ trợ `-c`, `--data-dir`, `--body <str|@file>`, vị trí cờ linh hoạt, `visitedFlagsMap`.

**Never:**
- Không đổi schema `mock-server.json`, JSON tags ở `types.go`, logic match/CORS/404 của `MockServerService`, hay loại trừ ở `walkJSONEntities`, `buildTree`, `git_merge.go`, `app.go`.
- Không tự đổi port khi port đích bị tiến trình ngoài chiếm (báo `IO_ERROR`); không dùng nguyên `normalizeHTTPMethod` (thiếu `ANY`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `status` | Chưa có file, stale PID, hoặc daemon ở coll khác | `running: false`, `port: 4010`, `routes: []` (dọn stale PID; kèm metadata nếu coll khác chạy) | `VALIDATION`/`NOT_FOUND` nếu `-c` sai |
| `config` & `route` | `config --port`, `route create/update/delete` | Validate port `1024..65535`, method gồm `ANY`, status `100..599`, delay `0..30000`; `update` theo `FlagSet.Visit` (`""` xóa rỗng) | `VALIDATION` ngoài dải/thiếu cờ/trùng; `NOT_FOUND` thiếu route/`@file` |
| `start` / `serve` | Foreground hoặc `--daemon` (dù đã có daemon cũ) | Dừng daemon cũ, bind `127.0.0.1:<p>`, ghi `mock-daemon.json`; foreground flush 1 dòng JSON/banner chờ signal; `--daemon` chờ TCP ready thoát `0`; hot-reload `routes` | `IO_ERROR` nếu cổng bận bởi tiến trình ngoài |
| `stop` & HTTP | `mock stop`; HTTP `:param`/`ANY`/lạ | `stop` dừng tiến trình & xóa `mock-daemon.json`; HTTP trả status, headers, body, CORS, `404 MOCK_ROUTE_NOT_FOUND` | Lỗi dừng → `IO_ERROR` |

</frozen-after-approval>

## Code Map

- `projects/service/mock_server.go` -- Dùng `MockServerService`; thêm `ReloadRoutes(collRoot)` và export `CleanMockPath`.
- `projects/service/config.go` -- Thêm `ConfigDir() (string, error)` trả thư mục chứa `config.json`.
- `projects/model/types.go` (L302–326) -- `MockRoute`, `MockServerConfig`, `MockServerStatus`, `KVPair`.
- `projects/cmd/hecto/main.go` -- Thêm `mockSvc`, router `"mock"`, `knownBooleanFlags`, `printMainUsage`, handlers `hecto mock`, `mock-daemon.json` và watcher.
- `projects/cmd/hecto/SKILL.md` -- Tài liệu `hecto mock` cho `hecto agent-guide`.
- `projects/cmd/hecto/main_test.go` -- Thêm `TestMain` cho `--daemon` và integration tests dùng helper tìm port trống `1024..65535`.
- `projects/frontend/src/components/MockServerModal.vue` & `mockServerStore.ts` -- Đối chiếu tương thích UI.

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/mock_server.go` & `config.go` -- Thêm `ReloadRoutes`, `CleanMockPath`, `ConfigDir()` -- Hot-reload không ghi đĩa, chuẩn hóa path, lấy `<configDir>`.
- [x] `projects/cmd/hecto/main.go` -- Cài `mock status|config|start|stop` & `route list|get|create|update|delete`, `<configDir>/mock-daemon.json` đơn phiên, handshake `--daemon`, foreground signal + watcher, `FlagSet.Visit` -- Hoàn thiện CLI `hecto mock`.
- [x] `projects/cmd/hecto/SKILL.md` -- Bổ sung lệnh, cờ, schema JSON, ví dụ `--daemon`/`stop`, quy tắc 1-instance -- Cập nhật `hecto agent-guide`.
- [x] `projects/cmd/hecto/main_test.go` -- Test I/O Matrix: `status`, `config --port`, `route` CRUD (`FlagSet.Visit`, `<id|"METHOD /path">`, cờ linh hoạt), single-instance `start --daemon`, lỗi port bận, hot-reload, HTTP `:id`/`ANY`/404, `stop`, `agent-guide` -- Chống hồi quy.

**Acceptance Criteria:**
- Given collection lưu config qua `hecto mock`, when đọc qua `MockServerService.GetStatus`, then các trường khớp 100% `MockServerModal.vue`.
- Given `hecto agent-guide`, when chạy lệnh, then stdout chứa đầy đủ tài liệu `hecto mock`.

## Implementation Notes

- Các file đã sửa: [mock_server.go](../../projects/service/mock_server.go), [mock_server_test.go](../../projects/service/mock_server_test.go), [config.go](../../projects/service/config.go), [config_test.go](../../projects/service/config_test.go), [main.go](../../projects/cmd/hecto/main.go), [SKILL.md](../../projects/cmd/hecto/SKILL.md), [main_test.go](../../projects/cmd/hecto/main_test.go).
- `isProcessAlive` bổ sung kiểm tra trạng thái zombie `'Z'`/`'X'` trên `/proc/<pid>/stat` (Linux) để tránh nhận nhầm tiến trình con chưa được wait là đang chạy, kèm goroutine `cmd.Wait()` phía cha khi `--daemon`.
- `hecto mock route` sử dụng `upsertHeaderKVPair`/`removeHeaderKVPair` khớp header không phân biệt hoa thường (tương đồng xử lý `Content-Type` trong `MockServerService.handleHTTP`).
- Lưu ý: Quản lý tiến trình nền dùng `syscall.Kill` và `Setsid` theo chuẩn Unix/Linux/macOS của các script build hiện hữu trong dự án.
- Sau Step 4 review triage: đã áp dụng đầy đủ các bản vá (`MockServerService.Start` chỉ lưu port sau khi bind thành công, chuẩn hóa `filepath.Abs` và bảo toàn routes khi parse lỗi trong `ReloadRoutes`, đăng ký `signal.Notify` trước khi khởi động, dọn daemon lỗi sau handshake, kiểm tra cổng đang listen cho stale/recycled PID, thêm `configured_port`, dùng chung biến cho alias & từ chối positional thừa, validate `--unset-header ""` & chuẩn hóa header trùng, bổ sung `SKILL.md` và full tests) và xác minh `go vet`, `go test -race`, `go test -count=1 ./...` pass 100%.

## Spec Change Log

## Review Triage Log

| ID | Layer | Finding | Verdict | Evidence / Routing |
|---|---|---|---|---|
| BH-01 | blind-hunter | Daemon mồ côi khi fail sau handshake & cửa sổ race trước `signal.Notify` | `medium` | Xác nhận ở `main.go:3747-3753` và `3784-3848`: chưa kill/dọn khi `waitTCPReady` fail sau handshake và `signal.Notify` đăng ký sau `Start`/`WriteJSON` -> `patch`. |
| BH-02 | blind-hunter | `isProcessAlive` dùng PID đơn thuần (`EPERM`/PID tái sử dụng/`/proc` trên macOS) | `medium` | Xác nhận ở `main.go:3225-3265`: nếu daemon crash/reboot và PID tái sử dụng thành process user khác (`EPERM`), `stopExistingMockDaemon` kẹt `IO_ERROR` -> `patch` (kiểm tra port listening + `waitTCPReady` trước khi ghi `mock-daemon.json`). |
| BH-03 | blind-hunter | Dùng `syscall.Kill`/`Setsid` phá biên dịch Windows | `low` | Dự án chỉ đóng gói Linux (`.deb`) và macOS (`.dmg`), không có target/script Windows; hỗ trợ Windows đòi hỏi tách build-tag và cơ chế IPC khác `ExtraFiles` -> reject. |
| BH-04 | blind-hunter | Thiếu `flock` khi khởi động daemon và RMW `mock-server.json` đa tiến trình | `low` | CLI chạy tuần tự và `FileSystem.WriteJSON` đã ghi atomic; dự án không dùng `flock` ở đâu và thêm lock đa tiến trình gây phức tạp/rủi ro deadlock -> reject. |
| BH-05 | blind-hunter | `MockServerService.Start` ghi `cfg.Port` trước `net.Listen` & dừng daemon cũ trước khi bind | `medium` | Phần `Start` ghi `cfg.Port` trước `net.Listen` (`mock_server.go:181-194`) làm port bận lưu đè đĩa -> `patch`. Phần dừng daemon cũ trước khi bind là chủ đích spec (Single Instance & restart cùng port). |
| BH-06 | blind-hunter | `hecto mock stop -c <coll>` bỏ qua phạm vi collection | `false` | Theo quyết định của người dùng và spec, chỉ có 1 daemon toàn cục và `stop` dừng tiến trình duy nhất đó bất kể `-c`; chỉ `status` mới phân biệt theo collection. |
| BH-07 | blind-hunter | `statusLocked` thiếu `filepath.Clean`, hot-reload xóa routes khi JSON hỏng tạm thời, `config --port` in port cũ | `medium` | Xác nhận cả 3 tại `mock_server.go:114,252`, `main.go:3492-3513` và `3622-3626` -> `patch` chuẩn hóa path, giữ routes khi parse lỗi file đang tồn tại, thêm `configured_port`. |
| BH-08 | blind-hunter | Cờ alias bỏ qua nhau khi truyền cả hai & bỏ qua đối số vị trí thừa | `medium` | Xác nhận ở `main.go:3557-4128`: gõ thiếu ngoặc kép `route delete GET /x` hoặc `config 4020` bị im lặng bỏ qua -> `patch` (dùng chung biến cho alias & kiểm tra `len(pos)`). |
| BH-09 | blind-hunter | Header rỗng/trùng khóa, thiếu clear-all/toggle header, và `srv.Serve` thoát âm thầm / `SIGHUP` | `low` | `--unset-header ""` & trim/dedup header là lỗi thật đơn giản -> `patch`. Còn `--clear-headers`/per-header enabled và đổi signature `MockServerService` không thuộc spec CLI hiện tại -> reject phần còn lại. |
| BH-10 | blind-hunter | Thiếu chi tiết trong `SKILL.md` (`OPTIONS`, schema `active_daemon`/`stopped`/`deleted_id`, alias, Desktop UI) | `low` | Xác nhận tại `SKILL.md:298-365`: `handleHTTP` khớp route `ANY`/`OPTIONS` trước khi fallback `204`, thiếu một số field/alias -> `patch`. |
| BH-11 | blind-hunter | Thiếu test case cho nhiều nhánh CLI & `ReloadRoutes` | `medium` | Xác nhận thiếu test cho `status` khi running, `config` read-only, `stop` khi đã tắt, aliases, `delay_ms`, `--disabled`, `*`/`/`, non-JSON banner, `ReloadRoutes` edge cases -> `patch`. |
| ECH-01 | edge-case-hunter | `SIGINT`/`SIGTERM` trước `signal.Notify` (`main.go:3811-3848`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-01 -> `patch`. |
| ECH-02 | edge-case-hunter | `hs.Status == nil` hoặc `waitTCPReady` timeout để lại daemon mồ côi (`main.go:3747-3753`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-01 -> `patch`. |
| ECH-03 | edge-case-hunter | PID trong `mock-daemon.json` bị tái sử dụng / `EPERM` (`main.go:3225-3302`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-02 -> `patch`. |
| ECH-04 | edge-case-hunter | `mock start --port <busyPort>` ghi đè `mock-server.json` (`main.go:3780-3787`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-05 -> `patch`. |
| ECH-05 | edge-case-hunter | So sánh `CollRoot` sai khi dùng `--data-dir` tương đối khác CWD (`main.go:3357`) | `medium` | Xác nhận `config.go:131` giữ nguyên đường dẫn tương đối nên `filepath.Clean` không khớp `Abs` ở CWD khác -> `patch` dùng `filepath.Abs` khi so sánh `collRoot`. |
| ECH-06 | edge-case-hunter | `hecto mock config --port <new>` trả port daemon cũ (`main.go:3622-3626`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-07 -> `patch` (bổ sung `configured_port`). |
| ECH-07 | edge-case-hunter | Bỏ qua đối số vị trí thừa (`main.go:3557-4128`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-08 -> `patch`. |
| ECH-08 | edge-case-hunter | `--unset-header ""` thành công giả & thứ tự `unset` sau `set` (`main.go:4109-4177`) | `low` | `--unset-header ""` không báo `VALIDATION` -> `patch`. Thứ tự `set` rồi `unset` đồng nhất với `req update` và `env update` nên giữ nguyên. |
| ECH-09 | edge-case-hunter | Header có khoảng trắng quanh key hoặc khóa trùng (`main.go:3144-3164`) | `low` | Xác nhận cùng nguyên nhân gốc với BH-09 (`upsertHeaderKVPair`/`removeHeaderKVPair`) -> `patch`. |
| ECH-10 | edge-case-hunter | `ReloadRoutes` trả `running: false` nếu `collRoot` chưa clean (`mock_server.go:252-255`) | `medium` | Xác nhận cùng nguyên nhân gốc với BH-07 (`statusLocked`) -> `patch`. |
| VG-01 | verification-gap | Chưa test `hecto mock status` trên collection đang chạy (`main.go:3356-3367`) | `medium` | Pre-verified: các test hiện có mới kiểm tra `active_daemon` ở collection khác, chưa test nhánh `running: true` của chính collection -> `patch`. |
| VG-02 | verification-gap | Chưa pin `knownBooleanFlags` cho `--daemon` và `--enabled` ngay trước `--json` (`main.go:192-193`) | `medium` | Pre-verified: mọi lời gọi hiện tại đặt flag khác sau `--daemon` và `--enabled` -> `patch`. |
| VG-03 | verification-gap | Chưa test `mock start` không truyền `--port` dùng port cấu hình/mặc định (`main.go:3651-3661`) | `medium` | Pre-verified: mọi test `start`/`serve` đều truyền `--port` -> `patch`. |
| VG-04 | verification-gap | Chưa test `route update` với `--method`/`--path`/`--delay-ms`/`@file` và các alias (`-p`, `--status`, `--delay`, `--desc`) | `medium` | Pre-verified: các nhánh `update` và fallback alias đó chưa được gọi trong test -> `patch`. |
| VG-05 | verification-gap | Chưa test `writeDaemonHandshakeError` khi child fail trước `runMockForeground` (`main.go:3392-3406`) | `low` | Pre-verified: thiếu kiểm thử trực tiếp lỗi handshake sớm qua `HECTO_MOCK_HANDSHAKE_FD`; test bổ sung rất gọn -> `patch`. |

## Design Notes

- `--daemon`: cha tạo `os.Pipe()` truyền đầu ghi qua `cmd.ExtraFiles` (FD 3) cho con tách stdio (`Setsid: true`); con bind TCP xong ghi JSON ready vào FD 3 rồi đóng FD 3 trước khi phục vụ và bắt `SIGINT`/`SIGTERM` dọn `mock-daemon.json`.
- `main_test.go`: `TestMain` nhận env `HECTO_INTERNAL_MOCK_DAEMON=1` gọi `main()` để `execCLI` test trực tiếp `--daemon` trong `go test`.

## Verification

**Commands:**
- `cd projects && go vet ./...` -- expected: exit code 0
- `cd projects && go test ./cmd/hecto/... ./service/...` -- expected: pass 100%

---
title: 'Standalone hecto CLI Binary, Orthogonal Command Matrix & hecto agent-guide'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '0b3cf5f7b396676321f8c604c0b6132f0df711a5'
context:
  - '_bmad-output/specs/spec-ai-agent-integration/SPEC.md'
  - '_bmad-output/specs/spec-ai-agent-integration/cli-and-sync-architecture.md'
---

<intent-contract>

## Intent

**Problem:** Các AI Coding Agent (Claude Code, Gemini CLI, Cursor, Windsurf, Cline,...) và quy trình tự động hóa cần một công cụ dòng lệnh (`hecto`) độc lập, không phụ thuộc Wails/GTK/WebKit, có khả năng tự khám phá hướng dẫn (`hecto agent-guide`), xuất JSON chuẩn `model.Result` trên `stdout`, và cung cấp ma trận lệnh trực giao `hecto <entity> <verb>` cho `collection`, `env`, `folder`, `req` (hỗ trợ tạo 1 bước, cập nhật kiểu Read-Merge-Write patch, xóa, di chuyển) cùng `hecto run` và `hecto import`.

**Approach:** Tạo tài liệu kỹ năng `projects/cmd/hecto/SKILL.md` và nhúng qua `//go:embed SKILL.md` vào binary `projects/cmd/hecto/main.go`. Xây dựng bộ phân tích đối số hỗ trợ cờ đặt ở bất kỳ vị trí nào (trước hoặc sau đối số vị trí `<id|path>`), tắt `slog.Info` ra `stdout`, và triển khai toàn bộ ma trận lệnh trực giao kết nối trực tiếp với `hecto-api/service`, `hecto-api/storage`, và `hecto-api/engine`.

## Boundaries & Constraints

**Always:**
- Binary `projects/cmd/hecto` hoàn toàn không phụ thuộc `github.com/wailsapp/wails/v2` (`go list -deps ./cmd/hecto | grep wails` phải rỗng).
- Khởi tạo `slog.Logger` với `io.Discard` để mọi lời gọi `slog.Info`/`slog.Warn`/`slog.Error` trong các tầng `service`/`storage` không bao giờ in ra `stdout`.
- Dòng đầu tiên của `hecto`, `hecto --help`, `hecto -h` bắt buộc là:
  `🤖 AI AGENT / LLM GUIDE: Run ` + "`hecto agent-guide`" + ` to print the complete SKILL.md manual (command matrix, 4-tier variables, auth inheritance, scripting, and JSON schemas) to stdout.`
- Lệnh `hecto agent-guide` in toàn bộ nội dung `projects/cmd/hecto/SKILL.md` ra `stdout`.
- Chuẩn hóa vị trí cờ trước khi gọi `FlagSet.Parse` để hỗ trợ đặt cờ (`--json`, `-c`, `--collection`, `--data-dir`, `--to`, `--set-var`,...) cả trước và sau đối số vị trí `<id|path>`.
- Thiết lập `fs.SetCollectionRoot(collRoot)` ngay sau khi phân giải collection đích.
- Sử dụng `FlagSet.Visit` cho mọi lệnh `update` (`collection update`, `env update`, `folder update`, `req update`) theo ngữ nghĩa Read-Merge-Write (patch): chỉ cập nhật các trường được truyền cờ trên CLI, cho phép truyền `""` để xóa trắng trường, và bảo toàn các trường không truyền cờ.
- Chuẩn hóa `--auth-type` không phân biệt hoa thường `'apikey'`, `'api-key'`, `'api_key'` thành `'apiKey'` (camelCase).
- Khi `hecto collection delete` xóa collection đang là `active_collection`, tự động gọi `ConfigService.SwitchActiveCollection(ctx, "default")`.
- Khi `hecto env delete` xóa environment đang là `active_env_id` của collection, tự động xóa trắng `active_env_id = ""` trong `collection.json`.
- Trong `hecto import <file-or-curl>`: nếu chuỗi bắt đầu bằng `curl ` (`engine.IsCurlCommand`) thì gọi `engine.ParseCurl`; ngược lại bắt buộc kiểm tra file tồn tại trên đĩa trước (nếu không tồn tại trả về `NOT_FOUND`), sau đó mới đọc file để phân biệt JSON Postman v2.1 hay file chứa lệnh cURL.
- Mọi bài kiểm thử bắt buộc sử dụng thư mục tạm độc lập (`t.TempDir()`, `--data-dir`, `HECTO_CONFIG_DIR`), tuyệt đối không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không import `github.com/wailsapp/wails/v2` trong `projects/cmd/hecto/`.
- Không truyền tên file không tồn tại vào `engine.ParseCurl` trong lệnh `hecto import`.
- Không ghi đè làm mất các trường không được truyền cờ trong các lệnh `update`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chạy `hecto --help` và `hecto agent-guide` | `hecto --help` / `hecto agent-guide` | Dòng 1 của `--help` chứa chỉ dẫn `hecto agent-guide`; `hecto agent-guide` in toàn bộ `SKILL.md` ra `stdout` | Exit code 0 |
| Đặt cờ sau đối số vị trí | `hecto req get "AuthFlow/Login" --json` hoặc `hecto req move "Login" --to "AuthFlow" --json` | Bộ phân tích cờ tự động nhận diện `--json`, `--to` và trả về JSON hợp lệ trên `stdout` | Exit code 0 |
| Cập nhật thực thể theo cơ chế Read-Merge-Write (`update`) | `hecto req update "AuthFlow/Login" --body "" --set-header "X-New: 1" --json` | Xóa trắng `body.content`, thêm/cập nhật header `X-New`, và giữ nguyên `method`, `url`, `auth`, `scripts` cùng các headers khác | Trả về `NOT_FOUND` nếu thực thể không tồn tại |
| Xóa Environment đang active hoặc Collection đang active | `hecto env delete "Staging"` / `hecto collection delete "my-coll"` | Xóa trắng `active_env_id = ""` trong `collection.json` / chuyển `active_collection` về `"default"` trong `config.json` | Chặn xóa collection `default` với lỗi `VALIDATION` |
| Import file không tồn tại so với lệnh cURL trực tiếp | `hecto import nonexistent-file.json --json` | Trả về `{"success":false,"error":{"code":"NOT_FOUND",...}}` với exit code 1 | Không rơi vào `ParseCurl` |

</intent-contract>

## Code Map

- `projects/cmd/hecto/SKILL.md` -- Tài liệu hướng dẫn toàn diện cho AI Agent được nhúng vào binary `hecto`.
- `projects/cmd/hecto/main.go` -- Entrypoint CLI độc lập, bộ phân tích đối số/cờ linh hoạt, và toàn bộ các trình xử lý lệnh (`collection`, `env`, `folder`, `req`, `run`, `import`, `agent-guide`).
- `projects/service/importer.go` -- Bổ sung `ImportPostmanWithOptions` hỗ trợ import vào thư mục đích `--folder` và ghi đè tên thư mục gốc `--name`.
- `projects/cmd/hecto/main_test.go` -- Bộ kiểm thử tích hợp và đơn vị toàn diện cho mọi lệnh CLI trên `t.TempDir()`.

## Tasks & Acceptance

**Execution:**
- `projects/cmd/hecto/SKILL.md` -- Tạo mới tài liệu `SKILL.md` chuẩn cho AI Agent -- Cung cấp hướng dẫn tự khám phá qua `hecto agent-guide`.
- `projects/service/importer.go` -- Bổ sung `ImportPostmanWithOptions(targetDir, filePath, overrideName, onProgress)` -- Hỗ trợ `hecto import` chỉ định `--folder` và `--name`.
- `projects/cmd/hecto/main.go` -- Hiện thực hóa CLI `hecto` với đầy đủ ma trận lệnh `collection`, `env`, `folder`, `req`, `run`, `import`, `agent-guide` -- Đáp ứng CAP-1, CAP-3, CAP-4.
- `projects/cmd/hecto/main_test.go` -- Viết bộ kiểm thử toàn diện cho `hecto` CLI với `--data-dir` dùng `t.TempDir()` -- Xác minh toàn bộ luồng CRUD, Move, Run, Import, Read-Merge-Write, và xử lý lỗi.

**Acceptance Criteria:**
- Given gói `projects/cmd/hecto`, when chạy `go build -o build/bin/hecto ./cmd/hecto` và `go list -deps ./cmd/hecto | grep wails`, then biên dịch thành công và kết quả grep rỗng.
- Given binary `hecto`, when chạy `hecto --help` và `hecto agent-guide`, then dòng 1 của `--help` hiển thị gợi ý `hecto agent-guide` và `hecto agent-guide` in toàn bộ `SKILL.md` ra `stdout`.
- Given thư mục dữ liệu cô lập `--data-dir`, when thực hiện các lệnh `collection`, `env`, `folder`, `req` (`list`, `get`, `create`, `update`, `delete`, `move`, `switch`, `activate`), then mọi thao tác tạo 1 bước, Read-Merge-Write patch (`FlagSet.Visit`), chuẩn hóa `--auth-type apikey` -> `'apiKey'`, xóa active env / active collection đều hoạt động chính xác 100% và xuất JSON chuẩn `model.Result` khi có `--json`.
- Given một local `httptest.Server` và request trong `"AuthFlow/Login"`, when chạy `hecto run "AuthFlow/Login" --json`, then `stdout` chỉ chứa 1 đối tượng JSON hợp lệ duy nhất (`"success": true`, `"status_code": 200`) và các cập nhật biến từ script được lưu xuống đĩa.
- Given lệnh `hecto import`, when truyền chuỗi `curl ...`, file Postman v2.1 JSON, file chứa lệnh `curl`, hoặc đường dẫn file không tồn tại, then lệnh import chính xác vào `--folder` với `--name` hoặc trả về `NOT_FOUND` cho file không tồn tại.

## Spec Change Log

## Review Triage Log

- `[PATCH]` `hecto req list --folder <id|path>` omitted `fNode.Name` from `folder_path` and `path_display`: Appended `fNode.Name` to the ancestor prefix in `handleReq` (`list`) and reused `n.URL` from `TreeNode` in `flattenRequests`.
- `[PATCH]` `hecto run --env none` fell back to `coll.ActiveEnvID` inside `ExecuteRequestFlow`: Cleared `coll.ActiveEnvID = ""` on the in-memory `coll` copy when `--env none` is passed, and validated `--timeout > 0`.
- `[PATCH]` `hecto req update` with both `--url` and `--set-param`/`--unset-param` or body-type inference: Reconciled `--url` query params into `req.Params` before applying `--set-param`/`--unset-param`, made `stripURLQuery` ignore `?`/`#` inside `{{...}}` templates, validated HTTP methods via `normalizeHTTPMethod`, and inferred `req.Body.Type` when `--set-form`/`--set-urlencoded`/`--body` are passed on a `"none"` body.
- `[PATCH]` `applyAuthFlags` stale credentials & `--env-auth` isolation: Cleared non-active auth sub-structs (`Bearer`, `Basic`, `APIKey`) when switching auth types and prevented `--env-auth` credential flags from mutating entity-level `Auth` when `--auth-type` is not passed.
- `[PATCH]` Validation before disk creation & global flag parsing: Validated flags before creating collections/folders/requests on disk, preserved `--` in `reorderFlagsBeforePositionals`, validated missing values for `--data-dir`/`-c`, and expanded `main_test.go` and `SKILL.md`.

## Verification

**Commands:**
- `cd projects && go build -o build/bin/hecto ./cmd/hecto` -- expected: exit code 0
- `cd projects && go list -deps ./cmd/hecto | grep wails` -- expected: empty output
- `cd projects && go test -v ./cmd/hecto/...` -- expected: PASS 100%
- `cd projects && go test ./...` -- expected: PASS 100%

## Auto Run Result

- Status: `done`
- Review lenses executed: `blind-hunter`, `edge-case-hunter`, `verification-gap`
- Verification: `go build -o build/bin/hecto ./cmd/hecto` and `go test ./...` passed 100%.


---
title: 'Shared TypeScript Headless Execution Engine (headless-engine.js) & Pure-Go goja Runtime'
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

**Problem:** Hiện tại toàn bộ logic tiền xử lý Request (đồng bộ hai chiều URL ↔ Query Params/Path Params, kế thừa phân cấp biến và xác thực Folder/Collection/Environment, nội suy `{{variable}}`, loại bỏ comment JSONC, thực thi Pre-request / Post-response Script `ha.*`, và phân tích cú pháp cURL) đều nằm trong các tệp TypeScript của Frontend (`projects/frontend/src/utils/`), khiến CLI độc lập bằng Go không thể thực thi Request hoặc import cURL với hành vi đồng nhất 100% như giao diện Wails Desktop nếu viết lại bằng Go.

**Approach:** Tạo điểm nhập hợp nhất `projects/frontend/src/utils/headless-engine.ts` (`prepareHeadlessExecution`, `runHeadlessPostResponse`, và re-export các hàm lõi), đóng gói thành bundle IIFE `projects/engine/headless-engine.js` (`--global-name=HectoEngine`) thông qua script `bun run build:headless` (được track trong Git và tự động chạy trước `vite build`), và xây dựng gói `projects/engine/headless.go` nhúng `//go:embed headless-engine.js` chạy trên máy ảo JS thuần Go `github.com/dop251/goja` kèm polyfill đầy đủ (`btoa`/`atob` chuẩn Latin-1 byte-per-rune, `TextEncoder`, `TextDecoder`, `console`), hàm `ExecuteRequestFlow` thực thi trọn vẹn luồng Pre-request -> HTTP -> Post-response -> cập nhật RAM & đĩa (`ApplyScriptUpdatesToDisk`), và `ParseCurl`.

## Boundaries & Constraints

**Always:**
- Tạo `projects/frontend/src/utils/headless-engine.ts` re-export `resolveVariables`, `resolveHeaders`, `resolveAuth`, `resolveHierarchyVariables`, `resolveEffectiveAuth`, `runPreRequestScript`, `runPostResponseScript`, `parseCurlCommand`, `stripJsonComments`, `reconcileUrlAndParams` và cung cấp `prepareHeadlessExecution(input: HeadlessPreExecutionInput)` cùng `runHeadlessPostResponse(input: HeadlessPostResponseInput)`.
- Trong `prepareHeadlessExecution`: thực hiện `reconcileUrlAndParams(req.url, req.params, req.pathParams)` cả trước và sau `runPreRequestScript` (nếu `scriptRes.request` thay đổi URL/params); áp dụng `envUpdates`, `scopedEnvUpdates` (hỗ trợ `'__nearest__'`, `'__active__'`, hoặc tên/UUID của Folder/Environment), và `scopedAuthUpdates` (hỗ trợ `'__nearest__'`, `'collection'`, hoặc tên/UUID của Folder) ngay trên bản sao dữ liệu trong bộ nhớ trước khi gọi `resolveHierarchyVariables` và `resolveEffectiveAuth`; tự động gọi `stripJsonComments(resolvedBody)` khi `resolvedBodyType === 'json'`.
- Thêm `"build:headless": "bun build src/utils/headless-engine.ts --outfile ../engine/headless-engine.js --target browser --format iife"` và cập nhật `"build": "bun run build:headless && vue-tsc --noEmit && vite build"` trong `projects/frontend/package.json`; file `projects/engine/headless-engine.js` được track trong Git.
- Trong `projects/engine/headless.go`: nhúng `//go:embed headless-engine.js` và khởi tạo `goja.New()` với polyfill `btoa` (kiểm tra từng rune `r > 0xFF` báo lỗi `InvalidCharacterError`, ép `byte(r)` trước khi `base64.StdEncoding.EncodeToString` để tương thích tuyệt đối với `encodeURIComponent` + `unescape` trong `auth.ts` cho mật khẩu tiếng Việt/Unicode), `atob` (giải mã từng byte sang rune `rune(b)`), `TextEncoder`, `TextDecoder`, và `console` (`log`, `info`, `warn`, `error` nối tham số bằng khoảng trắng vào mảng log).
- Hiện thực hóa `ExecuteRequestFlow`, `ParseCurl`, và `ApplyScriptUpdatesToDisk` trong `projects/engine/headless.go`, trả về cấu trúc `RunOutput` chuẩn (`status_code`, `status_text`, `time_ms`, `size_bytes`, `headers`, `body`, `resolved_request`, `script_tests`, `console_logs`, `env_updates`, `scoped_env_updates`, `scoped_auth_updates`, `script_error`, `network_error`) và lưu lịch sử thực thi qua `HistoryService`.
- Toàn bộ bài kiểm thử bắt buộc sử dụng `t.TempDir()`, tuyệt đối không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không sử dụng `base64.StdEncoding.EncodeToString([]byte(str))` trực tiếp trên chuỗi UTF-8 của Go trong polyfill `btoa` (vì sẽ gây sai lệch double-UTF8 khi kết hợp với `unescape(encodeURIComponent(str))` của `auth.ts`).
- Không import bất kỳ gói nào của `github.com/wailsapp/wails/v2` trong `projects/engine/`.
- Không ghi log hoặc dữ liệu console của JS script trực tiếp ra `os.Stdout`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pre-request script cập nhật biến/auth rồi dùng ngay trong cùng Request | Pre-request gọi `ha.variables.set("token", "abc")`, `ha.folderVariables.set("org", "acme")`, `ha.collectionAuth.setBearer("abc")` trên request có URL `{{base_url}}/{{org}}` và Auth `inherit` | `prepareHeadlessExecution` cập nhật biến/auth trên RAM trước khi nội suy, tạo ra URL và header `Authorization: Bearer abc` chính xác cho HTTP call, đồng thời `ApplyScriptUpdatesToDisk` lưu xuống đĩa | No error expected |
| Basic Auth với mật khẩu ASCII và tiếng Việt / Unicode trong `goja` | Username `"admin"`, Password `"mật khẩu tiếng Việt 123"` | Polyfill `btoa` Latin-1 byte-per-rune kết hợp với `auth.ts` tạo ra header `Authorization: Basic ...` giống hệt 100% trên trình duyệt | Nếu truyền ký tự `> 0xFF` trực tiếp vào `btoa` mà chưa qua `unescape(encodeURIComponent(...))`, ném `InvalidCharacterError` chuẩn DOM |
| Body JSON chứa comment JSONC (`//`, `/* */`) và dấu phẩy thừa (trailing comma) | Request có `body.type = "json"` và `body.content` chứa comment + `{{var}}` | Nội suy biến trước, sau đó `stripJsonComments` loại bỏ comment và trailing comma trước khi gửi HTTP | No error expected |
| Post-response script thực thi `ha.test(...)` và `console.log(...)` | Server trả về HTTP 200 JSON, Post-response script kiểm tra `ha.response.json()` và cập nhật biến môi trường | `RunOutput` ghi nhận đầy đủ `script_tests`, `console_logs` (cả pre và post), cập nhật biến xuống đĩa qua `ApplyScriptUpdatesToDisk`, và trả về `RunOutput` | Nếu script có lỗi cú pháp/runtime, ghi vào `RunOutput.ScriptError` mà không làm crash tiến trình |
| Phân tích lệnh cURL qua `engine.ParseCurl` | Chuỗi lệnh `curl -X POST https://api.example.com/v1/login -H "Content-Type: application/json" -d '{"u":"a"}'` | Trả về `model.Request` đầy đủ Method, URL, Headers, Body giống hệt hàm `parseCurlCommand` trên UI | Trả về `error` nếu lệnh cURL rỗng hoặc không hợp lệ |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/headless-engine.ts` -- Entrypoint TypeScript hợp nhất cho Headless Execution Engine (`prepareHeadlessExecution`, `runHeadlessPostResponse`, và re-exports).
- `projects/frontend/src/utils/__tests__/headless-engine.test.ts` -- Bộ unit test Vitest cho `prepareHeadlessExecution` và `runHeadlessPostResponse`.
- `projects/frontend/package.json` -- Bổ sung script `build:headless` và tích hợp vào `build`.
- `projects/engine/headless-engine.js` -- Bundle IIFE sinh tự động từ `bun run build:headless` và được nhúng vào Go binary.
- `projects/engine/headless.go` -- Máy ảo `goja` nhúng `headless-engine.js`, polyfill `btoa`/`atob`/`TextEncoder`/`TextDecoder`/`console`, `ExecuteRequestFlow`, `ParseCurl`, và `ApplyScriptUpdatesToDisk`.
- `projects/engine/headless_test.go` -- Bộ unit/integration test Go với `httptest.NewServer` và `t.TempDir()` kiểm thử toàn diện `ExecuteRequestFlow`, Basic Auth Unicode, JSONC, `ha.*` script, `ApplyScriptUpdatesToDisk`, và `ParseCurl`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/utils/headless-engine.ts` -- Tạo mới file xuất `prepareHeadlessExecution`, `runHeadlessPostResponse` và các hàm tiện ích liên quan -- Hợp nhất toàn bộ quy trình tiền xử lý và hậu xử lý Request của UI để dùng chung với Go `goja`.
- [x] `projects/frontend/package.json` -- Thêm script `"build:headless"` và cập nhật `"build"` gọi `bun run build:headless` trước `vue-tsc --noEmit && vite build` -- Tự động hóa việc đóng gói `projects/engine/headless-engine.js`.
- [x] `projects/frontend/src/utils/__tests__/headless-engine.test.ts` -- Viết unit tests Vitest cho `prepareHeadlessExecution` và `runHeadlessPostResponse` -- Xác minh hành vi đồng bộ URL/params, nội suy phân cấp, cập nhật biến/auth trong script, và strip JSONC.
- [x] `projects/engine/headless.go` -- Thêm `github.com/dop251/goja` vào `projects/go.mod` và hiện thực hóa runtime `goja` nhúng `headless-engine.js`, các polyfill chuẩn trình duyệt, `ExecuteRequestFlow`, `ParseCurl`, `ApplyScriptUpdatesToDisk` -- Cho phép Go backend/CLI thực thi toàn bộ chu trình Request & Script độc lập với Wails.
- [x] `projects/engine/headless_test.go` -- Viết unit/integration tests bằng `httptest.NewServer` và `t.TempDir()` kiểm thử end-to-end `ExecuteRequestFlow`, Basic Auth Unicode, JSONC, cập nhật biến/auth xuống đĩa và `ParseCurl` -- Đảm bảo độ tin cậy 100% của engine.

**Acceptance Criteria:**
- Given `projects/frontend/src/utils/headless-engine.ts` và `projects/frontend/package.json`, when chạy `bun run build:headless`, then trình đóng gói sinh thành công `projects/engine/headless-engine.js` định dạng IIFE với global `HectoEngine`.
- Given một Request có Pre-request script sửa đổi URL/Query Params/Path Params và gọi `ha.variables.set`, `ha.folderVariables.set`, `ha.collectionVariables.set`, `ha.collectionAuth.setBearer`, when gọi `prepareHeadlessExecution` hoặc `ExecuteRequestFlow`, then các giá trị biến và cấu hình xác thực mới có hiệu lực ngay trong chính Request hiện tại và được lưu bền vững xuống đĩa (`environment`, `_folder.json`, `collection.json`).
- Given một Request cấu hình Basic Auth chứa ký tự tiếng Việt / Unicode (ví dụ `"mật khẩu tiếng Việt 123"`), when thực thi qua `ExecuteRequestFlow` trên `goja`, then header `Authorization: Basic ...` sinh ra khớp 100% với kết quả của trình duyệt UI.
- Given một Request gửi tới local `httptest.Server` có Post-response script thực thi `ha.test(...)`, `console.log(...)`, và cập nhật biến theo tên hoặc `'__nearest__'`/`'__active__'`, when gọi `ExecuteRequestFlow`, then hàm trả về `RunOutput` đầy đủ (`status_code`, `time_ms`, `size_bytes`, `resolved_request`, `script_tests`, `console_logs`, `env_updates`, `scoped_env_updates`, `scoped_auth_updates`), lưu kết quả biến/auth xuống đĩa và ghi lịch sử vào `.history/`.
- Given một chuỗi lệnh `curl` hợp lệ (bao gồm multiline backslash, headers, body, auth), when gọi `engine.ParseCurl(rawCommand)`, then hàm trả về `model.Request` khớp chính xác với bộ phân tích cURL trên giao diện.

## Spec Change Log

## Review Triage Log
### Iteration 1
- **Patch**: Pre-compile `headlessPolyfillJS + "\n" + headlessBundleJS` once using `sync.Once` + `goja.Compile` (`blind-hunter`).
- **Patch**: Support `ArrayBuffer` and `ArrayBufferView` in `TextDecoder.decode` polyfill (`blind-hunter`).
- **Patch**: Sync `mutatedPathFolders` into `mutatedAllFolders` by folder ID in `applyScriptUpdatesInMemory` (`blind-hunter`, `edge-case-hunter`).
- **Patch**: Handle directional URL vs params reconciliation when pre-request script mutates only URL or only params (`blind-hunter`, `edge-case-hunter`).
- **Patch**: Re-apply `cliVarOverrides` after `resolveHierarchyVariables` in `prepareHeadlessExecution` and `runHeadlessPostResponse`, and propagate post-script `resolvedVariables` (`edge-case-hunter`).
- **Patch**: Resolve `activeEnvId` by ID or case-insensitive Name, auto-populate `pathFolders`/`allFolders` when omitted, deduplicate merged scoped updates, check persistence errors, and normalize network-failure `RunOutput` (`blind-hunter`, `edge-case-hunter`).
- **Patch**: Expand Vitest and Go tests to assert `ScopedEnvUpdates`, `ScopedAuthUpdates`, failing `ha.test` assertions, `collection.json`/named-env/`Folder.AuthEnvs` disk persistence, and network failure handling (`verification-gap`).

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless && bun run type-check && bun run test` -- expected: PASS 100%
- `cd projects && go test ./engine/...` -- expected: PASS 100%
- `cd projects && go test ./...` -- expected: PASS 100%

## Auto Run Result
- **Status**: done
- **Iterations**: 1
- **Tests**: 100% PASS (`go test ./...` and `bun run type-check && bun run test`)


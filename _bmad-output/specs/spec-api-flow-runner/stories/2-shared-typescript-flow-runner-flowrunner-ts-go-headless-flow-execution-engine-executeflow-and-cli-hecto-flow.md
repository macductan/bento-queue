---
title: 'Shared TypeScript Flow Runner (flowRunner.ts), Go Headless Flow Execution (engine.ExecuteFlow) & CLI hecto flow'
type: 'feature'
created: '2026-10-25'
status: 'done'
baseline_revision: 'ecd0ff3e9887c1177bf45a16bc8e98ea408e1389'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-api-flow-runner/SPEC.md'
  - '_bmad-output/specs/spec-api-flow-runner/flow-architecture-and-schema.md'
  - '_bmad-output/specs/spec-api-flow-runner/stories/1-concurrent-http-executor-timeoutms-flow-and-flowfolder-storage-models-flowservice-crud-tree-and-selector-git-integration.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hệ thống đã có mô hình lưu trữ `Flow`/`FlowFolder` và `ExecutorService` đa luồng từ Story 1, nhưng chưa có bộ hàm đánh giá kết quả Step (`Passed`/`Failed`), kiểm tra điều kiện rẽ nhánh 3 chế độ (`Success`, `Error`, `Custom` 3 ô) và gom biến Hàng Song song dùng chung giữa Wails UI và CLI; đồng thời package `projects/engine` chưa có hàm `ExecuteFlow` để thực thi sơ đồ Flow trên `goja` và binary `hecto` chưa có hệ lệnh `hecto flow`.

**Approach:** Xây dựng `projects/frontend/src/utils/flowRunner.ts` chứa các hàm thuần `evaluateStepVerdict`, `evaluateCustomBranchCondition`, `selectMatchingBranch`, `mergeParallelScriptUpdates` cùng các kiểu dữ liệu Flow, xuất qua `headless-engine.ts` và biên dịch ra `projects/engine/headless-engine.js`; hiện thực hóa `engine.ExecuteFlow` trong `projects/engine/flow.go` hỗ trợ chạy tuần tự, chạy Hàng Song song bằng goroutines trên bản sao ngữ cảnh rồi gom biến lưu đĩa 1 lần, rẽ nhánh đệ quy và giới hạn `max_steps`; bổ sung hệ lệnh trực giao `hecto flow` (`list`, `tree`, `get`, `create`, `update`, `delete`, `move`, `folder`, `run`) vào `projects/cmd/hecto/main.go` và cập nhật `SKILL.md`.

## Boundaries & Constraints

**Always:**
- Trong `projects/frontend/src/utils/flowRunner.ts`:
  - `evaluateStepVerdict`: trả về `passed: false` nếu `requestMissing === true` (`failureCategory: 'deleted_request'`), `networkError` khác rỗng (`'network_or_timeout'`), `scriptError` khác rỗng (`'script_error'`), hoặc có bất kỳ `scriptTests` nào `passed === false` (`'test_failed'`); nếu `scriptTests` rỗng và `statusCode >= 400` thì trả về `passed: false` (`'http_status'`); ngược lại (kể cả khi `statusCode >= 400` nhưng có ít nhất 1 `ha.test()` và tất cả đều `passed === true`) trả về `passed: true`.
  - `evaluateCustomBranchCondition`: giải biến `{{var}}` trong `condition.value` qua `ctx.variables`; hỗ trợ `source` gồm `"status_code"`, `"body_json"` (hỗ trợ cả chấm `a.b.c` và chỉ số mảng `items[0].id`), `"variable"`; hỗ trợ `operator` gồm `"=="`, `"!="`, `">"`, `"<"`, `"contains"`, `"exists"`.
  - `selectMatchingBranch`: kiểm tra các nhánh có `condition.type === "custom"` theo đúng thứ tự khai báo trước; nếu không có nhánh custom nào khớp thì chọn nhánh đầu tiên có `condition.type === "success"` (khi `nodePassed === true`) hoặc `condition.type === "error"` (khi `nodePassed === false`); trả về `{ matchedBranchId, skippedBranchIds }`.
  - `mergeParallelScriptUpdates`: nhận trạng thái nền (`collection`, `environments`, `activeEnvId`, `allFolders`, `cliVarOverrides`) và danh sách kết quả của các step trong Hàng Song song theo đúng thứ tự khai báo trong `node.Steps`; chuẩn hóa `"__nearest__"` theo `pathFolders` của từng step, áp dụng tuần tự các cập nhật biến/auth vào trạng thái bộ nhớ và trả về cả trạng thái đã gộp lẫn `mergedScriptResult` để ghi xuống đĩa đúng 1 lần duy nhất.
- Xuất toàn bộ hàm của `flowRunner.ts` qua `projects/frontend/src/utils/headless-engine.ts` (`HectoEngine` / `HectoHeadless`) và chạy `bun run build:headless` để cập nhật `projects/engine/headless-engine.js`.
- Trong `projects/engine/flow.go`:
  - `ExecuteFlow(opts FlowRunOptions) (*FlowRunOutput, error)` thực thi cây `FlowNode[]` với giới hạn `maxSteps` (`flow.MaxSteps > 0 ? flow.MaxSteps : 100`), bỏ qua step có `enabled == false` (`status: "skipped"`), áp dụng `effectiveTimeoutMs = step.TimeoutMs > 0 ? step.TimeoutMs : (flow.TimeoutMs > 0 ? flow.TimeoutMs : 30000)` (nếu CLI truyền `--timeout-ms > 0` thì ghi đè timeout mặc định cấp Flow).
  - Với Hàng Song song (`len(enabledSteps) >= 2`): chạy đồng thời các step bằng goroutines trên bản sao sâu (`deepCopy`) của ngữ cảnh đầu vào với `NoSaveEnv: true` trong lúc từng step chạy, đợi toàn bộ hoàn tất rồi gọi `mergeParallelScriptUpdates` trên `goja` và gọi `ApplyScriptUpdatesToDisk` đúng 1 lần duy nhất (nếu `!opts.NoSaveEnv`).
  - Xử lý rẽ nhánh: nếu `len(node.Branches) == 0` và `nodePassed == false` thì dừng toàn bộ Flow ngay lập tức (`status: "failed"`, đánh dấu các node/step còn lại là `"skipped"`). Nếu `len(node.Branches) > 0`, gọi `selectMatchingBranch`: nếu có `matchedBranch` thì đệ quy thực thi `matchedBranch.Nodes` (nếu nhánh xử lý lỗi chạy thành công hết thì lỗi tại node chia nhánh được coi là đã xử lý `handledByBranch = true` và đi tiếp sang node kế tiếp sau khối rẽ nhánh); nếu `matchedBranch == null` và `nodePassed == false` thì dừng Flow ngay lập tức với `status: "failed"`.
- Trong `projects/cmd/hecto/main.go`:
  - Hỗ trợ đầy đủ: `hecto flow list`, `hecto flow tree`, `hecto flow get`, `hecto flow create`, `hecto flow update` (Read-Merge-Write qua `FlagSet.Visit`), `hecto flow delete`, `hecto flow move`, `hecto flow folder create|update|delete|move`, và `hecto flow run`.
  - Hỗ trợ cờ `--steps "<req1>,<req2>||<req3>,..."` (phân giải từng selector Request qua `ResolveRequestSelector` để lấy UUID chuẩn) và `--nodes-json <json|@file>`.
  - `hecto flow run` trả về `{ "success": true, "data": FlowRunOutput }` khi có `--json`, và trả về exit code `1` nếu `status == "failed"` ở chế độ CLI thường (hoặc `success: false` nếu không tìm thấy Flow/Collection/Environment).
- Toàn bộ bài kiểm thử chạy trên `t.TempDir()`, không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không ghi trực tiếp biến/auth xuống đĩa bên trong từng goroutine riêng lẻ của Hàng Song song trước khi toàn bộ hàng hoàn tất.
- Không cho phép vòng lặp vượt quá `max_steps`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Phán quyết Step: Negative Test (`status_code >= 400` nhưng `ha.test()` pass) | Request trả về HTTP `400 Bad Request`, Post-script có `ha.test("Expect 400", ...)` đạt `passed: true` | `evaluateStepVerdict` trả về `{ passed: true }`; khi không có `ha.test()` nào thì HTTP `400` trả về `{ passed: false, failureCategory: 'http_status' }` | No error expected |
| Phán quyết Step: Request gốc đã bị xóa (Deleted Request) | `FlowStep.RequestID` không tồn tại trong Collection | Step có `status: "failed"`, `failure_category: "deleted_request"`, dừng Flow (hoặc rẽ vào nhánh `error` nếu có) | Không panic, ghi nhận lỗi rõ ràng trong `FlowStepRunOutput` |
| Hàng Song song (`[Req 1 \|\| Req 2]`) gom biến tất định không race condition | `Req 1` đặt `ha.collectionVariables.set("shared", "from1")` và `varA="1"`, `Req 2` đặt `ha.collectionVariables.set("shared", "from2")` và `varB="2"` | Cả 2 chạy đồng thời; sau khi hàng kết thúc, biến được merge theo thứ tự `[Req 1, Req 2]` (`shared == "from2"`, `varA == "1"`, `varB == "2"`) và ghi đĩa đúng 1 lần | No error expected |
| Rẽ nhánh 3 chế độ (`custom` ưu tiên trước `success`/`error`) | Node có nhánh `custom` (`status_code == 429` hoặc `body_json` `data.items[0].code == "{{expected_code}}"`), nhánh `success` và nhánh `error` | Kiểm tra các nhánh `custom` theo thứ tự trước; nếu khớp nhánh `custom` (kể cả khi step HTTP 429) thì chạy nhánh `custom` và đánh dấu các nhánh còn lại là `skipped`, sau khi nhánh xử lý thành công thì Flow tiếp tục và đạt `status: "passed"` | No error expected |
| Chặn vượt ngưỡng `max_steps` | Flow có `max_steps: 2` nhưng chứa 3 bước `enabled: true` | Thực thi đúng 2 bước đầu, dừng ngay trước bước thứ 3 với `halted_error` thông báo vượt quá `max_steps` và `status: "failed"` | Dừng an toàn với `status: "failed"` |
| Hệ lệnh CLI `hecto flow` (`create --steps`, `update`, `folder`, `run`) | Tạo `FlowFolder`, tạo `Flow` với `--steps "Auth/Login,Users/Profile\|\|Catalog/Cart"`, cập nhật `--nodes-json`, chạy `hecto flow run --json` | Tạo đúng cấu trúc `FlowNode[]` với UUID Request đã phân giải, cập nhật Read-Merge-Write chuẩn xác, và `hecto flow run` trả về `FlowRunOutput` đầy đủ | Trả về lỗi `VALIDATION` / `NOT_FOUND` khi selector không hợp lệ |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/flowRunner.ts` -- Hiện thực hóa các kiểu dữ liệu và hàm `evaluateStepVerdict`, `evaluateCustomBranchCondition`, `selectMatchingBranch`, `mergeParallelScriptUpdates`, `countStepsInNodes`.
- `projects/frontend/src/utils/__tests__/flowRunner.test.ts` -- Bộ Vitest unit tests kiểm thử toàn diện `flowRunner.ts`.
- `projects/frontend/src/utils/headless-engine.ts` -- Xuất toàn bộ hàm và kiểu từ `flowRunner.ts` vào bundle `HectoEngine` / `HectoHeadless`.
- `projects/engine/headless-engine.js` -- Bundle JS sinh tự động từ `bun run build:headless` để `goja` nạp trong Go.
- `projects/engine/flow.go` -- Định nghĩa `FlowStepRunOutput`, `FlowNodeRunOutput`, `FlowRunOutput`, `FlowRunOptions` và hiện thực hóa `ExecuteFlow` trên `goja` + `ExecutorService`.
- `projects/engine/flow_test.go` -- Unit tests Go kiểm thử `ExecuteFlow` (tuần tự, song song gom biến, rẽ nhánh 3 chế độ, deleted request, `timeout_ms`, `max_steps`).
- `projects/cmd/hecto/main.go` -- Bổ sung `flowSvc` vào `cliContext`, thêm lệnh `hecto flow` (`list`, `tree`, `get`, `create`, `update`, `delete`, `move`, `folder`, `run`) và xử lý exit code `1` khi `FlowRunOutput.Status == "failed"` ở chế độ CLI thường.
- `projects/cmd/hecto/main_test.go` -- Integration tests cho toàn bộ ma trận lệnh `hecto flow` và `hecto flow run`.
- `projects/cmd/hecto/SKILL.md` -- Cập nhật tài liệu hướng dẫn `hecto flow` cho AI Coding Agent.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/flowRunner.ts` & `projects/frontend/src/utils/headless-engine.ts` -- Viết các hàm `evaluateStepVerdict`, `evaluateCustomBranchCondition`, `selectMatchingBranch`, `mergeParallelScriptUpdates` và xuất vào `headless-engine.ts`, sau đó chạy `bun run build:headless` -- Đảm bảo Single Source of Truth cho logic phán quyết Step, rẽ nhánh 3 chế độ và gom biến Hàng Song song giữa Wails UI và CLI.
- `projects/frontend/src/utils/__tests__/flowRunner.test.ts` -- Viết Vitest unit tests cho toàn bộ hàm trong `flowRunner.ts` -- Xác minh mọi trường hợp biên của đánh giá Step, JSON path, toán tử so sánh, giải biến `{{var}}` và merge biến song song.
- `projects/engine/flow.go` & `projects/engine/flow_test.go` -- Hiện thực hóa `ExecuteFlow` và viết Go unit tests -- Thực thi sơ đồ Flow trên `goja` với goroutines song song an toàn luồng và ghi đĩa 1 lần sau mỗi hàng.
- `projects/cmd/hecto/main.go`, `projects/cmd/hecto/main_test.go`, `projects/cmd/hecto/SKILL.md` -- Bổ sung hệ lệnh `hecto flow`, viết CLI tests và cập nhật tài liệu `SKILL.md` -- Cho phép người dùng và AI Agent thiết kế và chạy Flow từ dòng lệnh.

**Acceptance Criteria:**
- Given `flowRunner.ts` được đóng gói qua `bun run build:headless`, when kiểm tra `projects/engine/headless-engine.js`, then các hàm `evaluateStepVerdict`, `evaluateCustomBranchCondition`, `selectMatchingBranch`, `mergeParallelScriptUpdates` có mặt trên `globalThis.HectoEngine` và vượt qua toàn bộ Vitest tests.
- Given một Flow có bước tuần tự, Hàng Song song (`len(node.Steps) >= 2`) cập nhật biến 4 tầng/Auth và các nhánh `custom`/`success`/`error`, when gọi `engine.ExecuteFlow`, then các bước trong Hàng Song song bay đồng thời, cập nhật biến được gom tuần tự theo đúng thứ tự khai báo rồi mới ghi đĩa 1 lần, nhánh khớp đầu tiên được thực thi và các nhánh không khớp được đánh dấu `skipped`.
- Given binary CLI `hecto`, when chạy các lệnh `hecto flow folder create|update|delete|move`, `hecto flow create|update|list|tree|get|move|delete` (với `--steps` hoặc `--nodes-json`) và `hecto flow run`, then mọi thao tác hoạt động chính xác, trả về chuẩn `model.Result` khi có `--json` và `hecto agent-guide` hiển thị đầy đủ tài liệu `hecto flow`.

## Spec Change Log

## Review Triage Log

### Iteration 1 — 2026-10-25 — Layers: intent-alignment, blind-hunter, edge-case-hunter, verification-gap
- **Patched (`flowRunner.ts` & `flowRunner.test.ts`):**
  - Fixed variable tier precedence in `mergeParallelScriptUpdates` so Tier 2 `envUpdates` never overwrite higher-priority Tier 3 (`folderGlobals` / `folderEnvs`) variables, preserved `orderedStepFolderIds` across nodes, and allowed runtime script mutations to win over initial CLI `--var` overrides.
  - Updated `resolveFolderIdInMemory` to support slash-separated folder paths and return `null` when no folder matches.
  - Hardened `valuesAreEqual` (`isLosslessNumericString`) against leading-zero strings (`"0123"` vs `"123"`) and 64-bit integer precision loss, and updated `extractJsonPathValue` / `evaluateCustomBranchCondition` to reject unclosed `[` brackets and distinguish `null` JSON properties in `exists` vs `!=` operators.
- **Patched (`projects/engine/flow.go` & `projects/engine/flow_test.go`):**
  - Restored `coll.ActiveEnvID = activeEnvID` after `ApplyScriptUpdatesToDisk` so `--env none` does not re-activate the on-disk environment on subsequent steps.
  - Pruned script-mutated variable keys from `runtimeVarOverrides` so script updates propagate across steps even when initial `--var` overrides were passed.
  - Evaluated `custom` branch conditions against all executed steps in a parallel row when the representative step does not match, cached resolved selectors in `reqCatalog`, and added Go unit tests for mid-row `MaxSteps` truncation on parallel rows, unmatched branch failure halting, and failing child nodes inside a matched `error` branch.
- **Patched (`projects/cmd/hecto/main.go` & `projects/cmd/hecto/main_test.go`):**
  - Added validation in `parseFlowStepsFlag` (rejecting empty comma tokens), `convertRawFlowNodes` (rejecting negative `timeout_ms` and invalid branch condition `type`/`source`/`operator`), and `hecto flow update` (requiring at least one update flag).
  - Extended CLI tests in `main_test.go` to cover `hecto flow get` with nested branch `referenced_requests` and `"missing": true`, plus `hecto flow run` with `--env none`, `--var`, `--timeout-ms`, and `--no-save-env`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless && bun run type-check && bun run test` -- expected: PASS 100%
- `cd projects && go test -race ./engine/... ./cmd/hecto/...` -- expected: PASS 100%
- `cd projects && go test ./...` -- expected: PASS 100%

## Auto Run Result

- **Result**: `completed`
- **What changed**: Implemented `flowRunner.ts`, exported via `headless-engine.ts` & rebuilt `projects/engine/headless-engine.js`, implemented `engine.ExecuteFlow` in `projects/engine/flow.go`, added full `hecto flow` CLI command matrix in `projects/cmd/hecto/main.go` + `SKILL.md`, and added unit/integration tests in `flowRunner.test.ts`, `flow_test.go`, and `main_test.go`.
- **Disposition counts**: 11 patched, 0 deferred, 0 warnings, 0 dismissed.
- **Next**: Proceed to Story 3 (`3-apis-flows-workspace-mode-switcher-flow-sidebar-tree-flowstore-and-smart-reload-sync.md`).


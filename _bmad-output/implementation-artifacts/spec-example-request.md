---
title: 'Example Request (Kịch bản đầu vào cho Request)'
type: 'feature'
created: '2026-11-25'
status: 'done'
route: 'dispatch'
baseline_commit: 'c945240521d3be85115328efc6e1c98635eb0bf3'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng cần lưu và chuyển đổi nhanh nhiều kịch bản đầu vào khác nhau (như JSON payload, query params, headers, biến) trên cùng một API Request mà không phải Duplicate thành nhiều Request rời rạc dễ lệch URL, Auth hoặc Scripts khi sửa bản gốc.

**Approach:** Nhúng mảng `examples` trực tiếp vào `model.Request` (`<req-uuid>.json`) theo mô hình **Snapshot đầy đủ + Cờ đồng bộ theo nhóm trường** (`url`, `method`, `auth`, `scripts`, `body`, `params`, `path_params`, `headers`, `variables`), trong đó Request gốc giữ vai trò kịch bản **`Default`**. Bổ sung Example Switcher trong `RequestEditor` (khóa chỉ đọc các nhóm đang đồng bộ, tách Base URL khỏi Query Params, lưu `active_example_id` local kèm cache response theo `(requestId, exampleId)`), hỗ trợ merge 3 chiều theo `id` trong Git, chọn `example_id` trong Flow, và parity 100% trên CLI (`hecto run`, `hecto flow`, `hecto req`).

## Boundaries & Constraints

**Always:**
- Tương thích ngược: Request cũ không có `examples` hoặc `examples: []` hoạt động như `Default` đơn thuần; mỗi Example là snapshot đầy đủ kèm `sync_flags` (mặc định khi clone: `url`, `method`, `auth`, `scripts` = `true`; `body`, `params`, `path_params`, `headers`, `variables` = `false`).
- Tách Base URL vs Query Params: Khi `sync_flags.url == true` và `sync_flags.params == false`, đồng bộ chỉ cập nhật phần Base URL trước `?` và danh sách key `:path_param` (giữ nguyên value `:path_param` và toàn bộ `?query`/`params` riêng của Example); `UrlBar` ghép hiển thị `<Base URL> + <Query của kịch bản đang chọn>` và **khóa toàn bộ ô nhập `UrlBar` ở trạng thái Linked / Chỉ đọc** (chỉnh `?query` qua tab Params, hoặc bỏ tích đồng bộ `URL` để sửa Base URL).
- Hành động **"Tách thành Request độc lập" (Detach / Promote)** tạo Request mới cùng thư mục chứa cấu hình hiệu lực của Example và **xóa** Example đó khỏi Request gốc (Move/Extract).
- Cấp lại UUID mới cho mọi `example.id` khi `RequestService.Duplicate` nhân bản Request.
- Lưu `active_example_id` và response cache theo `(requestId, exampleId)` ở UI local (`tabStore`/`localStorage`), tuyệt đối không ghi `active_example_id` xuống `<req-uuid>.json`.
- Trong Flow (`FlowStep.example_id`) và CLI (`--example <id|name>`), nếu `example_id`/selector khác rỗng nhưng Example không tồn tại (hoặc trùng tên không phân định được), phải báo lỗi rõ ràng, không âm thầm fallback về `Default`.

**Never:**
- Không thêm Example làm node con trên Sidebar hay tab riêng trên `AppTabBar`.
- Không lưu Response snapshot mẫu kiểu Docs/Mock, không khóa cứng không cho bỏ đồng bộ, và không thay đổi `projects/service/importer.go` (Postman Examples nằm ngoài phạm vi).
- Không ghi đè toàn bộ `Body`/`Params`/`Headers` riêng của Example khi Sync All.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clone Example mới | Request `Default` có URL `https://a.com/users/:id?page=1`, Method `POST`, Body JSON | Tạo Example với UUID mới, clone snapshot, `sync_flags` mặc định (`url,method,auth,scripts=true`, còn lại `false`) | N/A |
| Sửa `Default` / Sync có chọn lọc | `Default` đổi URL thành `https://b.com/v2/users/:id?page=2`; Example có `url=true, params=false`, `:id="42"`, `params=[q=abc]` | URL hiệu lực của Example thành `https://b.com/v2/users/:id?q=abc`, giữ nguyên `params=[q=abc]` và `:id="42"` | N/A |
| Đứng ở Example có nhóm Linked | `sync_flags.auth == true` hoặc `scripts == true` hoặc `url == true` | Nhóm tương ứng hiển thị trạng thái Linked / Chỉ đọc trong `RequestEditor` (khóa toàn bộ ô nhập `UrlBar` khi `url == true`), `VariableHoverPopover` tôn trọng cờ `variables`; bỏ tích cờ sẽ mở khóa sửa riêng | N/A |
| Tách thành Request độc lập | Kích hoạt Detach trên Example A của Request R | Tạo Request mới cùng thư mục với cấu hình hiệu lực của Example A, đồng thời xóa Example A khỏi `R.examples` | N/A |
| Duplicate Request | Request có 2 Examples (`id1`, `id2`) | Tạo Request mới với `req.ID` mới và 2 Example có UUID mới (`id1' != id1`, `id2' != id2`) | N/A |
| cURL Preview & Execute | Đứng ở Example đang chọn `POST` + body riêng + `url` link `Default` | `resolvedCurlPreview` và `responseStore.send()` build từ effective Request đã áp dụng nhóm link | N/A |
| Git Merge 3 chiều | `ours` sửa Example A `body`, `theirs` sửa Example B `params` hoặc thêm Example C | `MergeJSONObjects` merge mảng `examples` theo `id` không xung đột; cùng sửa 1 trường của Example A mới báo conflict | Sửa vs xóa cùng `id` -> conflict |
| Flow & CLI thiếu Example | `FlowStep.example_id = "missing"` hoặc `hecto run req --example missing` | Trả lỗi `NOT_FOUND` / đánh dấu step fail rõ nguyên nhân | Không fallback về `Default` |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` -- Thêm `ExampleSyncFlags`, `RequestExample`, `Request.Examples []RequestExample`, `FlowStep.ExampleID string`.
- `projects/service/request.go` -- Cập nhật `Duplicate` (tái sinh UUID cho từng `example.id`), bổ sung helper đồng bộ/resolve effective request nếu dùng phía Go.
- `projects/service/git_merge.go` -- Thêm 3-way merge cho mảng `examples` theo `id` (tái sử dụng `mergeKVPairList`, `mergeBodyObject3Way`, `mergeNestedObject3Way`, `fieldLabels`).
- `projects/engine/headless.go`, `projects/engine/flow.go` -- Hỗ trợ `ExampleSelector`/`ExampleID` trong `RunOptions`, `FlowRunOptions`, `ExecuteFlow` (overlay effective example trước `ExecuteRequestFlow`, báo lỗi rõ nếu `ExampleID` bị xóa).
- `projects/cmd/hecto/main.go`, `projects/cmd/hecto/SKILL.md` -- Thêm `--example <id|name>` cho `hecto run`/`hecto flow`, hỗ trợ `example_id` trong `--steps`/`--nodes-json`, thêm `hecto req example <list|get|create|update|delete|sync|detach>`, cập nhật `knownBooleanFlags` & tài liệu `SKILL.md`.
- `projects/frontend/src/utils/requestExamples.ts` (mới) & `urlParams.ts` -- Tách helper Base URL vs Query, merge effective Request theo `sync_flags`, sync `Default` → `examples`, tạo/duplicate/detach Example; tái sử dụng `urlParams.ts`.
- `projects/frontend/src/utils/headless-engine.ts`, `flowRunner.ts`, `projects/engine/headless-engine.js` -- Đồng bộ logic `FlowStep.example_id` và rebuild headless bundle (`bun run build:headless`).
- `projects/frontend/src/stores/{requestStore,tabStore,responseStore,flowStore}.ts` -- Quản lý `activeExampleId` (UI local + `localStorage`), projection/editing cho kịch bản đang chọn mà không ghi `active_example_id` ra JSON, response cache theo `(requestId, exampleId)`, auto-sync nhóm linked khi sửa `Default`, và chạy Flow step theo `example_id`.
- `projects/frontend/src/composables/useUrlParamsSync.ts` -- Tôn trọng ranh giới `url` linked vs `params` độc lập khi đồng bộ `url ↔ params/path_params`.
- `projects/frontend/src/components/{RequestEditor.vue,ExampleSwitcher.vue(mới),UrlBar.vue,RequestTabs.vue,KvpEditor.vue,BodyEditor.vue,AuthEditor.vue,ScriptEditor.vue,VariableHoverPopover.vue,FlowStepCard.vue}` & `i18n/locales/{en,vi}.ts` -- UI Example Switcher, popover Sync/Sync All & chỉnh cờ đồng bộ, trạng thái Linked/Read-only theo nhóm trường, `resolvedCurlPreview`, chọn Example trong `FlowStepCard`, và i18n EN/VI.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go`, `projects/service/request.go`, `projects/service/git_merge.go` -- Định nghĩa `RequestExample` + `ExampleSyncFlags` + `FlowStep.ExampleID`, tái sinh `example.id` khi `Duplicate`, và bổ sung 3-way merge theo `id` cho `examples[]` -- Bảo toàn dữ liệu, nhân bản và Git merge không conflict giả.
- [x] `projects/frontend/src/utils/requestExamples.ts`, `urlParams.ts`, `headless-engine.ts`, `projects/engine/headless-engine.js` -- Cài đặt pure helpers tách Base URL/Query, resolve effective Request theo `sync_flags`, sync có chọn lọc từ `Default`, tích hợp `flowRunner` và rebuild `headless-engine.js` -- Dùng chung giữa UI và Goja engine.
- [x] `projects/engine/headless.go`, `projects/engine/flow.go`, `projects/cmd/hecto/main.go`, `projects/cmd/hecto/SKILL.md` -- Thêm `--example <id|name>` trên `run`/`flow`, `example_id` trên `FlowStep`, nhóm lệnh `hecto req example` (kèm `sync`/`detach`) và cập nhật `SKILL.md` -- Đạt 100% parity Desktop ↔ CLI.
- [x] `projects/frontend/src/stores/{requestStore,tabStore,responseStore,flowStore}.ts`, `projects/frontend/src/composables/useUrlParamsSync.ts` -- Hỗ trợ chọn/lưu/tạo/sync/detach Example, lưu `active_example_id` local, cache response theo `(requestId, exampleId)`, giữ `useUrlParamsSync` không ghi đè query khi `url` linked và `params` độc lập -- Đảm bảo state sạch và reactive.
- [x] `projects/frontend/src/components/` (`ExampleSwitcher.vue`, `RequestEditor.vue`, `UrlBar.vue`, `RequestTabs.vue`, `KvpEditor.vue`, `BodyEditor.vue`, `AuthEditor.vue`, `ScriptEditor.vue`, `VariableHoverPopover.vue`, `FlowStepCard.vue`) & `i18n/locales/{en,vi}.ts` -- Dựng Example Switcher, UI chỉnh `sync_flags` & Sync All có chọn lọc, khóa Linked/Read-only theo từng nhóm, `resolvedCurlPreview` theo Example, selector Example ở `FlowStepCard` -- Hoàn thiện UX chống sửa nhầm.
- [x] Go tests (`types_test.go`, `request_test.go`, `git_merge_test.go`, `flow_test.go`, `main_test.go`) & Vitest tests (`requestExamples.test.ts`, `requestStore.test.ts`, `RequestEditor.test.ts`, `flowStore.test.ts`) -- Kiểm thử đầy đủ các case trong I/O Matrix và edge cases -- Khóa hồi quy toàn stack.

**Acceptance Criteria:**
- Given một Request có các Examples lưu trong `<req-uuid>.json`, when chuyển đổi giữa `Default` và các Examples trong `RequestEditor`, then UI hiển thị đúng snapshot hiệu lực, `active_example_id` không xuất hiện trong JSON trên đĩa, và response cache giữ riêng cho từng `(requestId, exampleId)`.
- Given người dùng đứng ở một Example có `sync_flags` bật trên nhóm bất kỳ, when xem các tab/trường tương ứng, then nhóm bật đồng bộ bị khóa chỉ đọc với chỉ báo Linked, còn các nhóm độc lập sửa và lưu bình thường mà không ảnh hưởng `Default`.
- Given người dùng sửa `Default` hoặc dùng `Sync / Sync All` (hoặc `hecto req example sync`), when đồng bộ chạy, then chỉ các nhóm trường bật cờ (hoặc được tích chọn) được đẩy sang Example, và trường hợp `url=true, params=false` giữ nguyên `?query` và giá trị `:path_param` của Example.
- Given `Flow` hoặc CLI `hecto run`/`hecto flow` chỉ định `example_id` / `--example <id|name>`, when thực thi, then chạy đúng payload/cấu hình của Example đó và báo lỗi tường minh nếu Example không còn tồn tại.

## Implementation Notes

- **Go Backend & Storage**: Mở rộng [types.go](../../projects/model/types.go) (`ExampleSyncFlags`, `RequestExample`, `Request.Examples`, `TreeNode.Examples`, `FlowStep.ExampleID`), [collection.go](../../projects/service/collection.go), [request.go](../../projects/service/request.go) (`Duplicate` cấp lại UUID cho từng `example.id`), bổ sung [request_examples.go](../../projects/service/request_examples.go) (tách Base URL/Query, resolve effective Request, sync có chọn lọc, `DetachExample`), và cập nhật [git_merge.go](../../projects/service/git_merge.go) (`mergeExamples3Way`, đồng thời vá lỗi đệ quy tại `friendlyFieldLabel` cho nhánh `sync_flags.*`).
- **Headless Engine, Flow & CLI**: Cập nhật [headless.go](../../projects/engine/headless.go), [flow.go](../../projects/engine/flow.go) (`FailureCategory: "deleted_example"`), [main.go](../../projects/cmd/hecto/main.go) (`hecto req example <list|get|create|update|delete|sync|detach>`, `hecto run --example`, `hecto flow create/update/run`), [SKILL.md](../../projects/cmd/hecto/SKILL.md), và rebuild [headless-engine.js](../../projects/engine/headless-engine.js).
- **Frontend Stores, Composables & UI**: Tạo [requestExamples.ts](../../projects/frontend/src/utils/requestExamples.ts) và [ExampleSwitcher.vue](../../projects/frontend/src/components/ExampleSwitcher.vue); cập nhật [requestStore.ts](../../projects/frontend/src/stores/requestStore.ts), [tabStore.ts](../../projects/frontend/src/stores/tabStore.ts), [responseStore.ts](../../projects/frontend/src/stores/responseStore.ts), [collectionStore.ts](../../projects/frontend/src/stores/collectionStore.ts), [flowStore.ts](../../projects/frontend/src/stores/flowStore.ts), [useUrlParamsSync.ts](../../projects/frontend/src/composables/useUrlParamsSync.ts), [RequestEditor.vue](../../projects/frontend/src/components/RequestEditor.vue), [UrlBar.vue](../../projects/frontend/src/components/UrlBar.vue), [RequestTabs.vue](../../projects/frontend/src/components/RequestTabs.vue), [KvpEditor.vue](../../projects/frontend/src/components/KvpEditor.vue), [BodyEditor.vue](../../projects/frontend/src/components/BodyEditor.vue), [AuthEditor.vue](../../projects/frontend/src/components/AuthEditor.vue), [ScriptEditor.vue](../../projects/frontend/src/components/ScriptEditor.vue), [VariableHoverPopover.vue](../../projects/frontend/src/components/VariableHoverPopover.vue), [FlowStepCard.vue](../../projects/frontend/src/components/flow/FlowStepCard.vue) và i18n [en.ts](../../projects/frontend/src/i18n/locales/en.ts), [vi.ts](../../projects/frontend/src/i18n/locales/vi.ts).
- **Matrix Test Audit & Diff**: Đã đối chiếu toàn bộ 8 dòng I/O Matrix; bổ sung thêm assert cho `auth-linked-banner`, `scripts-linked-banner`, `url-unlink-btn`, `curl-preview-code` trong [RequestEditor.test.ts](../../projects/frontend/src/components/__tests__/RequestEditor.test.ts), khóa `sync_flags.variables` trong [VariableHighlighter.test.ts](../../projects/frontend/src/components/__tests__/VariableHighlighter.test.ts), và `responseStore.send()` với Example trong [responseStore.test.ts](../../projects/frontend/src/stores/__tests__/responseStore.test.ts). Diff tổng lưu tại `/tmp/spec-example-request-diff-M16m58.patch` (10.407 dòng).
- **Kiểm tra sau edit cuối**: Chạy `./scripts/verify-local-ci.sh` pass 100% cả 6 bước (`bun run build:headless`, `bun run lint`, `bun run type-check`, `bun run test` 57/57 files / 804/804 tests, `go vet ./... && go test ./...`, và `bun run test:e2e` 16/16 tests).
- **Review Step 4 & Kết quả sau vá**: Đã triage toàn bộ 37 finding từ 3 lớp (`blind-hunter`, `edge-case-hunter`, `verification-gap`), ghi nhận 2 mục sang `deferred-work.md`, áp dụng toàn bộ bản vá `patch` (`requestExamples.ts`, `request_examples.go`, `GitConflictResolverModal.vue`, `RequestEditor.vue`, `ScriptEditor.vue`, `UrlBar.vue`, `VariableHoverPopover.vue`, `KvpEditor.vue`, `requestStore.ts`, `flowStore.ts`, `StepInspectorPanel.vue`, `engine/flow.go`, `cmd/hecto/main.go`) kèm regression tests. Chạy lại `./scripts/verify-local-ci.sh` pass 100% (`57/57` Vitest files / `814/814` tests, Go `ok`, `16/16` Playwright E2E tests), diff cuối lưu tại `/tmp/spec-example-request-diff-M16m58.patch` (11.786 dòng).

## Spec Change Log

## Review Triage Log

| Nguồn | Finding | Verdict | Bằng chứng & Định tuyến |
|---|---|---|---|
| blind-hunter | Thiếu `projects/engine/headless-engine.js` trong diff | `false` | File `projects/engine/headless-engine.js` đã được build lại qua `bun run build:headless` (`git status` xác nhận modified, chỉ loại khỏi `.patch` tạm bằng `:!projects/engine/headless-engine.js`). |
| blind-hunter | Đổi tên Request khi đang chọn Example làm lệch `requestStore.draft.name` (`RequestEditor.vue:125-131`) | `high` | Đúng tại `RequestEditor.vue:125-130`: `commitRenameRequest` chỉ cập nhật `req.value.name` (`current`) và `original.name`, bỏ quên `draft.name` nên `isDirty` bật và save sau sẽ ghi đè tên cũ. Route: `patch`. |
| blind-hunter | `ScriptEditor.vue` vẫn cho sửa khi `sync_flags.scripts` bật qua phím tắt, snippet và `runScriptPreview` | `high` | Đúng tại `ScriptEditor.vue:125-186,312-443,558-573`: `insertTemplate`, `insertSnippet`, `formatCurrentScript` (phím tắt), `onEditorKeydown`, `applySuggestion`, và `runScriptPreview` chưa kiểm tra `isReadonly`/`activeSyncFlags`. Route: `patch`. |
| blind-hunter | `UrlBar.vue` thiếu kiểm tra linked cho `onButtonKeyDown`/`applyCustomMethod` và `onUrlPaste` ghi đè nhóm đang link | `medium` | Đúng tại `UrlBar.vue:73-86,188-212`: `onButtonKeyDown`/`applyCustomMethod` thiếu guard `isMethodLinked`, và `onUrlPaste` khi `url` unlinked ghi đè `method`/`params`/`path_params`/`headers`/`body`/`auth` bất kể `activeSyncFlags`. Route: `patch`. |
| blind-hunter | `VariableHoverPopover.vue` để `<KvpValueSelectControl>` tương tác được khi scope bị khóa readonly | `medium` | Đúng tại `VariableHoverPopover.vue:615-627`: chỉ `<input>` slot có `:readonly="isCurrentScopeReadonly"`, còn `<KvpValueSelectControl>` thiếu `:readonly="isCurrentScopeReadonly"`. Route: `patch`. |
| blind-hunter | Không có tab/bảng UI quản lý Tier-5 `request.variables` trong `RequestTabs.vue`/`RequestEditor.vue` | `low` | Thiết kế sẵn từ `env-select-variable`: `RequestTabs.vue` chỉ có 6 tab, biến Request quản lý qua `VariableHoverPopover.vue` và `ExampleSwitcher.vue` có toggle `sync_flags.variables`; thêm tab mới mở rộng surface UI. Route: `defer`. |
| blind-hunter | CLI `req create`/`req update` chưa hỗ trợ `--set-var`/`--unset-var` cho Tier-5 `request.variables` | `low` | Tiền tồn tại từ `env-select-variable`: `handleReq` (`main.go:2162-2359`) chưa có flag `--set-var`/`--unset-var` như `req example update`; thêm flag CLI mới vượt phạm vi vá cục bộ. Route: `defer`. |
| blind-hunter | CLI `req example create` trùng tên mặc định và `req example update` lỗi đồng bộ `--url`/`--set-param`/`--sync` | `high` | Đúng tại `main.go:2515,2632-2720`: `Example N` trùng khi xóa example cũ; `--url ?a=1` + `--set-param b=2` bị `stripURLQuery` xóa `a=1`; `--url` + `--sync url=true` xóa `Params`; `--set-param` khi `PathParams` linked vẫn ghi đè `PathParams`. Route: `patch`. |
| blind-hunter | CLI `flow run --redact` bỏ sót custom `apiKey` trong `req.Examples` (`main.go:3086-3111`) | `high` | Đúng tại `main.go:3086-3111`: `collectFlowAPIKeyNames` chỉ đọc `req.Auth` và `req.AuthEnvs`, bỏ qua `req.Examples[*].Auth`/`AuthEnvs`. Route: `patch`. |
| blind-hunter | Store Example actions bỏ qua `uiStore.autoSaveEnabled` và unlink `url` làm tụt về Base URL cũ | `medium` | Đúng tại `requestStore.ts:413-435,708-733`: `scheduleAutoSave` không kiểm tra `uiStore.autoSaveEnabled`, và `setExampleSyncFlag(..., 'url', false)` commit `example.url` cũ trước khi hủy liên kết làm mất URL hiển thị từ Default chưa lưu. Route: `patch`. |
| blind-hunter | `DetachExample` / `detachExample` không có rollback nếu lưu Request nguồn thất bại | `low` | Đúng tại `request_examples.go:10125-10134` và `requestStore.ts:6482-6514`: nếu ghi Request mới xong mà lưu Request gốc lỗi thì để lại file Request mồ côi. Route: `patch`. |
| edge-case-hunter | Xóa sạch query params khi `url` linked và `params` unlinked bị hồi sinh query cũ (`requestExamples.ts:163-179`) | `high` | Đúng tại `requestExamples.ts:170-173` và `request_examples.go:9865-9868`: nhánh `!qs && exampleParams.length === 0 && exRawQuery` phục hồi `exRawQuery` cũ sau khi xóa hết params. Route: `patch`. |
| edge-case-hunter | `GitConflictResolverModal.vue:264-280` phá hủy mảng `examples[]` thành `{}` khi resolve conflict `examples.*` | `high` | Đúng tại `GitConflictResolverModal.vue:191-280`: `applyFieldToMergedObject` gặp `Array.isArray(curr['examples'])` liền ghi đè `curr['examples'] = {}`, đồng thời thiếu xử lý `examples.<id>.body.content.*` và KVPair bên trong example. Route: `patch`. |
| edge-case-hunter | `ScriptEditor.vue:312-443` phím tắt/snippet vẫn sửa được script khi `sync_flags.scripts` bật | `high` | Đúng tại `ScriptEditor.vue:125-186,312-443` (trùng nguyên nhân gốc với `blind-hunter` #3). Route: `patch`. |
| edge-case-hunter | `ScriptEditor.vue:559-572` `runScriptPreview` ghi đè các nhóm đang linked trên `req` | `high` | Đúng tại `ScriptEditor.vue:559-572` (trùng nguyên nhân gốc với `blind-hunter` #3). Route: `patch`. |
| edge-case-hunter | `VariableHoverPopover.vue:615-627` `<KvpValueSelectControl>` tương tác được khi readonly | `medium` | Đúng tại `VariableHoverPopover.vue:615-627` (trùng với `blind-hunter` #5). Route: `patch`. |
| edge-case-hunter | `flowStore.ts:1104-1109` đổi `request_id` của step giữ nguyên `example_id` cũ gây lỗi `deleted_example` | `medium` | Đúng tại `flowStore.ts:1104-1109`: `changeStepRequest` gán `request_id` mới mà không xóa `step.example_id` cũ. Route: `patch`. |
| edge-case-hunter | Lưu khi đang đứng ở Example sau khi sửa Default làm snapshot `examples` giữ giá trị Default cũ (`requestStore.ts:288-315`) | `medium` | Đúng tại `requestStore.ts:288-315`: `_commitProjectionToDraft({ touchTimestamp: true })` khi `activeExampleId` khác rỗng không đồng bộ nhóm linked từ `draft` xuống `draft.examples`. Route: `patch`. |
| edge-case-hunter | `engine/flow.go:632-652` nhánh node toàn bộ step disabled thiếu `ExampleID`/`ExampleName`/effective `Method` | `medium` | Đúng tại `projects/engine/flow.go:632-652`: vòng lặp node có `len(enabledIndices) == 0` không resolve `example_id`/`ExampleSelector` như `markNodesSkipped`. Route: `patch`. |
| edge-case-hunter | `main.go:2632-2720` truyền cả `--url ?...` và `--set-param` bị `stripURLQuery` xóa query của `--url` | `high` | Đúng tại `main.go:2632-2720` (trùng nguyên nhân gốc với `blind-hunter` #8). Route: `patch`. |
| edge-case-hunter | `main.go:2632-2641` truyền cả `--url` và `--sync url=true` vẫn xóa `ex.Params` | `high` | Đúng tại `main.go:2632-2641` (trùng nguyên nhân gốc với `blind-hunter` #8). Route: `patch`. |
| edge-case-hunter | `main.go:3086-3111` `collectFlowAPIKeyNames` bỏ sót `apiKey` ở unlinked Example | `high` | Đúng tại `main.go:3086-3111` (trùng với `blind-hunter` #9). Route: `patch`. |
| edge-case-hunter | Claim: `ScriptEditor` & `VariableHoverPopover` còn chỗ sửa được khi locked | `high` | Đúng (bao phủ bởi các finding đã xác minh ở `ScriptEditor.vue` và `VariableHoverPopover.vue`). Route: `patch`. |
| edge-case-hunter | Claim: `GitConflictResolverModal` phá hỏng mảng `examples[]` khi resolve conflict | `high` | Đúng (bao phủ bởi finding `GitConflictResolverModal.vue:191-280` đã xác minh). Route: `patch`. |
| verification-gap | Thiếu test cho `FlowRunOptions.ExampleSelector` và `hecto flow run --example` | `medium` | Pre-verified: chưa có test trong `flow_test.go` và `main_test.go` truyền `ExampleSelector` / `--example` vào `flow run`. Route: `patch`. |
| verification-gap | `collectFlowAPIKeyNames` thiếu xử lý `req.Examples` và thiếu test `--redact`/`--compact` cho Example | `high` | Pre-verified: `main.go:3086-3111` bỏ qua `req.Examples` và `main_test.go` chưa test `--redact`/`--compact` với `apiKey` ở Example. Route: `patch`. |
| verification-gap | Disabled-node skipped steps trong `ExecuteFlow` thiếu Example metadata & thiếu test skipped-step | `medium` | Pre-verified: `flow.go:632-652` bỏ sót Example resolution và `flow_test.go` chưa assert `ExampleID`/`ExampleName`/`Method` trên step `skipped`. Route: `patch`. |
| verification-gap | Thiếu CLI test cho `req get --example`, `req example create --from`, `update --sync/--url/--set-var`, `delete`, `sync`, `flow --nodes-json` | `medium` | Pre-verified: `main_test.go` chưa phủ các subcommand/flag mới nêu trên. Route: `patch`. |
| verification-gap | Thiếu component test cho `ExampleSwitcher.vue`, trạng thái readonly ở `BodyEditor`/`AuthEditor`/`ScriptEditor`/`KvpEditor`/`RequestTabs`, và `select` ở `VariableHoverPopover` | `medium` | Pre-verified: `ExampleSwitcher` CRUD/sync popover, readonly/unlink từng editor, `tab-linked-dot-*` và `select` readonly ở `VariableHoverPopover` chưa có test riêng. Route: `patch`. |
| verification-gap | Thiếu unit test cho `canMutateGroup` ở `responseStore`, `tabStore` metadata/cache cleanup, và `deleteExample`/`duplicateExample`/Default auto-sync ở `requestStore` | `medium` | Pre-verified: các nhánh trong `requestStore.ts`, `responseStore.ts`, `tabStore.ts` chưa được test phủ hết. Route: `patch`. |
| verification-gap | `GitConflictResolverModal.vue` format `select`/`options` chưa có test trong `GitConflictResolverModal.spec.ts` | `low` | Pre-verified: `GitConflictResolverModal.spec.ts` chưa kiểm thử hiển thị `type: 'select'` và `options`. Route: `patch`. |
| verification-gap | `VariableHoverPopover.vue:615-627` `<KvpValueSelectControl>` thiếu `:readonly="isCurrentScopeReadonly"` | `medium` | Đúng (trùng với `blind-hunter` #5). Route: `patch`. |
| verification-gap | `ScriptEditor.vue` shortcuts/snippets/`runScriptPreview` chưa kiểm tra `isReadonly`/`activeSyncFlags` | `high` | Đúng (trùng với `blind-hunter` #3). Route: `patch`. |
| verification-gap | `KvpEditor.vue:159-200` `addRow`/`removeRow`/`onValueTab` chỉ check `props.readonlyKeys` thay vì `keysLocked.value` | `low` | Đúng tại `KvpEditor.vue:159-200`: nút UI đã ẩn bởi `keysLocked`, nhưng hàm vẫn nên guard bằng `keysLocked.value` để nhất quán. Route: `patch`. |
| verification-gap | `main.go:3086-3111` `collectFlowAPIKeyNames` bỏ sót `req.Examples[*].Auth` | `high` | Đúng (trùng với `blind-hunter` #9). Route: `patch`. |
| verification-gap | `flow.go:632-652` nhánh node toàn bộ step disabled thiếu Example metadata | `medium` | Đúng (trùng với `edge-case-hunter` #8). Route: `patch`. |
| verification-gap | `StepInspectorPanel.vue:47-63,137-150` chưa resolve `selectedStep.example_id` khi idle và khi mở Request gốc | `medium` | Đúng tại `StepInspectorPanel.vue:47-63,137-150`: khi step idle vẫn hiện `method`/`url` của Default và `handleOpenOriginalRequest` không chọn `selectedStep.example_id`. Route: `patch`. |

## Design Notes

- **Cơ chế Effective Request + Snapshot:** Lưu snapshot đầy đủ trên mỗi `RequestExample` giúp chuyển trạng thái Linked → Unlinked không làm mất dữ liệu hiện hành, đồng thời khi đọc/hiển thị/chạy bất kỳ Example nào ta luôn áp dụng lớp phủ (overlay) các nhóm có `sync_flags[group] == true` từ `Default` để đảm bảo dữ liệu luôn nhất quán kể cả sau Git merge hoặc sửa bằng CLI.
- **Tách Base URL vs `:path_param` vs Query:** Khi đồng bộ `url` từ `Default` sang Example (`params == false`), lấy phần trước `?` của `Default.url`, nối lại phần `?query` hiện có của Example, đồng bộ danh sách key `:path_param` theo URL mới nhưng giữ nguyên `value` (và `type`/`options`) của các key `:path_param` đã có trên Example.

## Verification

**Commands:**
- `cd projects && go vet ./... && go test ./...` -- expected: mọi package Go pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless && bun run lint && bun run type-check && bun run test` -- expected: bundle headless, lint, type-check và Vitest pass 100%.

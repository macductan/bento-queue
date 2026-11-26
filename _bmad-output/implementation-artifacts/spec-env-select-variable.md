---
title: 'Biến & KVPair dạng Select Box'
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

**Problem:** Người dùng phải gõ lặp lại và dễ sai các giá trị xoay vòng trong biến môi trường và trường Request KV (`Params`, `PathParams`, `Headers`, `FormData`, `URLEncoded`).

**Approach:** Mở rộng `KVPair` với `type?: "text" | "select"` và `options?: string[]` (`omitempty`, mặc định `"text"`), thêm nút `Text ↔ Select`, chỉnh `options` và dropdown 1-click (`+ Thêm lựa chọn...`, nhãn ngoài danh sách) trên `KvpEditor.vue`, `EnvModal.vue`, `VariableHoverPopover.vue` (kế thừa 4 tầng), đồng thời bảo toàn qua Git merge, script và CLI.

## Boundaries & Constraints

**Always:**
- Tương thích ngược: `type` rỗng = `"text"`; `options` là `string[]` thuần, `omitempty`.
- Áp dụng mọi `KVPair` (4 tầng Variables + Request `Params`, `PathParams`, `Headers`, `FormData`, `URLEncoded`), trừ `_isAuto`.
- Giá trị ngoài `options` (từ script/CLI) hiển thị nguyên vẹn kèm nhãn `"(ngoài danh sách)"`.
- Lưu thẳng `value` và `options` vào JSON trên đĩa; dùng `Teleport` cho dropdown/popover trong bảng.

**Never:**
- Không dùng `{ label, value }`, không thêm Quick-Switch trên Header, không thêm flag CLI `--type`/`--options`.
- Không xóa giá trị ngoài danh sách và không làm rơi `type`/`options` ở `git_merge.go`, `EnvModal.vue`, `VariableHoverPopover.vue`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tương thích ngược | JSON thiếu `type`, `options` | Coi là `"text"`, render input/textarea thường | N/A |
| Text ↔ Select | Row `value: "dev"`, chuyển `select` | Đặt `type = "select"`, seed `options = ["dev"]` nếu rỗng và `value` khác rỗng | N/A |
| Chọn & thêm nhanh | `options: ["a", "b"]` + `+ Thêm lựa chọn...` | Click `"b"` đặt `value = "b"` (Popover lưu ngay); thêm `"c"` nối vào `options` (chống trùng) và chọn | Từ chối chuỗi rỗng |
| Ngoài danh sách | `type: "select"`, `options: ["a"]`, `value: "x"` | Hiện `"x (ngoài danh sách)"`, giữ nguyên `"x"` | N/A |
| Kế thừa 4 tầng | `Global Env` có `select` `["admin", "user"]`; `Folder` chưa có | Popover scope `Folder` kế thừa `options` đó; thêm `"guest"` lưu `type: "select"`, `options: ["admin", "user", "guest"]` lên `Folder` | N/A |
| Merge & Dirty check | Git merge hoặc `EnvModal` chỉ sửa `type`/`options` | `kvToMap` giữ `type`/`options`; `kvEqual` chuẩn hóa `"" == "text"` & `slices.Equal`; `EnvModal` kích hoạt `save` | Conflict báo chuẩn |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` -- Thêm `Type string` (`json:"type,omitempty"`), `Options []string` (`json:"options,omitempty"`) vào `KVPair`.
- `projects/service/git_merge.go` -- Sửa `kvEqual` (chuẩn hóa `""`/`"text"`, `slices.Equal`) và `kvToMap` (ghi `type`, `options`); giữ `parseKVPairs`.
- `projects/cmd/hecto/main.go`, `projects/engine/headless.go` -- `upsertKVPair`/`upsertKVPairs` đã giữ `Type`/`Options`; chỉ bổ sung test.
- `projects/frontend/src/stores/requestStore.ts` -- Thêm `type?: 'text' | 'select'`, `options?: string[]` vào `KVPair`.
- `projects/frontend/src/utils/resolveHierarchyVariables.ts` -- Mở rộng `VariableKVPair` và `inspectVariableHierarchy` trả metadata `type`/`options` từng scope + fallback kế thừa.
- `projects/frontend/src/utils/urlParams.ts` -- Giữ `{ ...item, ... }` trong `reconcile*FromUrl`; rebuild `projects/engine/headless-engine.js`.
- `projects/frontend/src/components/KvpValueSelectControl.vue` (mới) -- Control dùng chung (`Teleport`): toggle `Text ↔ Select`, popover sửa `options`, dropdown 1-click + `+ Thêm lựa chọn...`.
- `projects/frontend/src/components/KvpEditor.vue` -- Gắn `KvpValueSelectControl` cuối ô Value (trừ `_isAuto`; materialize `_isPhantom`).
- `projects/frontend/src/components/environment/EnvModal.vue` -- Gắn `KvpValueSelectControl` (giữ `<input placeholder="Value">` khi `text` & `ensureEmptyRow`), thêm `type`/`options` vào `closeAndSave`.
- `projects/frontend/src/components/VariableHoverPopover.vue` -- Sửa `upsertVariable` giữ `type`/`options`; dropdown 1-click tự lưu + `+ Thêm lựa chọn...` + ngoài danh sách + kế thừa `options`.
- `projects/frontend/src/stores/collectionStore.ts`, `FolderEditor.vue`, `CollectionEnvModal.vue`, `i18n/locales/{en,vi}.ts` -- Đồng bộ type KV và khóa `kvp.*`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go`, `projects/service/git_merge.go` -- Thêm `Type`/`Options` vào `KVPair`, sửa `kvEqual`/`kvToMap` -- Bảo toàn metadata qua JSON và Git merge.
- [x] `projects/model/types_test.go`, `projects/service/git_merge_test.go`, `projects/engine/headless_test.go`, `projects/cmd/hecto/main_test.go` -- Thêm Go tests serialize, merge, `upsertKVPair`/`upsertKVPairs` -- Khẳng định không mất dữ liệu.
- [x] `projects/frontend/src/stores/requestStore.ts`, `resolveHierarchyVariables.ts`, `collectionStore.ts`, `FolderEditor.vue`, `CollectionEnvModal.vue`, `i18n/locales/{en,vi}.ts` -- Cập nhật TS types, kế thừa 4 tầng trong `inspectVariableHierarchy`, i18n -- Chuẩn hóa model frontend.
- [x] `projects/frontend/src/components/KvpValueSelectControl.vue`, `KvpEditor.vue`, `EnvModal.vue` -- Xây control Select/Options (`Teleport`) gắn vào `KvpEditor` (trừ `_isAuto`) và `EnvModal` (sửa dirty check) -- Hoàn thiện UI bảng.
- [x] `projects/frontend/src/components/VariableHoverPopover.vue` -- Sửa `upsertVariable`, dropdown 1-click tự lưu, `+ Thêm lựa chọn...`, ngoài danh sách, kế thừa 4 tầng -- Hoàn thiện popover.
- [x] `projects/engine/headless-engine.js`, Vitest tests (`resolveHierarchyVariables`, `KvpEditor`, `EnvModal`, `VariableHighlighter`) -- Rebuild headless bundle và viết test phủ I/O matrix -- Khóa hồi quy.

**Acceptance Criteria:**
- Given `KVPair` ở 4 tầng Variables hoặc Request (`Params`, `PathParams`, `Headers`, `FormData`, `URLEncoded`), when chọn `select`, sửa `options` và chọn giá trị, then JSON lưu đủ `value`, `type`, `options` và khôi phục đúng sau reload.
- Given header `_isAuto: true` trong `KvpEditor.vue`, when hiển thị, then không có nút `Text ↔ Select` hay popover `options`.
- Given option chứa `{{var}}`, when chạy request/flow, then được resolve qua bộ giải 4 tầng bình thường.

## Implementation Notes

- **Go Backend & Merge**: Mở rộng [types.go](../../projects/model/types.go) (`KVPair.Type`, `KVPair.Options` với `omitempty`) và cập nhật [git_merge.go](../../projects/service/git_merge.go) (`normalizeKVType`, `kvEqual`, `kvToMap`); thêm test trong [types_test.go](../../projects/model/types_test.go), [git_merge_test.go](../../projects/service/git_merge_test.go), [headless_test.go](../../projects/engine/headless_test.go), [main_test.go](../../projects/cmd/hecto/main_test.go).
- **Frontend TS & Hierarchy**: Cập nhật `KVPair` trong [requestStore.ts](../../projects/frontend/src/stores/requestStore.ts), [collectionStore.ts](../../projects/frontend/src/stores/collectionStore.ts), [FolderEditor.vue](../../projects/frontend/src/components/FolderEditor.vue), [CollectionEnvModal.vue](../../projects/frontend/src/components/CollectionEnvModal.vue); mở rộng `inspectVariableHierarchy` trong [resolveHierarchyVariables.ts](../../projects/frontend/src/utils/resolveHierarchyVariables.ts) trả metadata từng scope và fallback kế thừa; bảo toàn `type`/`options` trong [headless-engine.ts](../../projects/frontend/src/utils/headless-engine.ts) và rebuild [headless-engine.js](../../projects/engine/headless-engine.js); bổ sung i18n `kvp.*` trong [en.ts](../../projects/frontend/src/i18n/locales/en.ts) và [vi.ts](../../projects/frontend/src/i18n/locales/vi.ts).
- **UI & Popover**: Tạo [KvpValueSelectControl.vue](../../projects/frontend/src/components/KvpValueSelectControl.vue) (`Teleport` dropdown + options popover) và tích hợp vào [KvpEditor.vue](../../projects/frontend/src/components/KvpEditor.vue), [EnvModal.vue](../../projects/frontend/src/components/environment/EnvModal.vue) (kèm sửa `closeAndSave`), [VariableHoverPopover.vue](../../projects/frontend/src/components/VariableHoverPopover.vue); cập nhật [VariableHighlighter.vue](../../projects/frontend/src/components/VariableHighlighter.vue) giữ focus khi thao tác portal `[data-kvp-portal="true"]`.
- **Lưu ý nhỏ**: File sinh tự động `projects/frontend/wailsjs/go/models.ts` sẽ được cập nhật khi chạy `wails dev`/`wails build`; hiện tại [EnvModal.vue](../../projects/frontend/src/components/environment/EnvModal.vue) dùng kiểu cục bộ `LocalEnvironment` nên `vue-tsc` pass sạch.
- **Unified diff tạm**: `/tmp/spec-env-select-variable-diff-na5Lyw.patch` (3.103 dòng).
- **Kiểm tra sau edit cuối**: `go vet ./... && go test ./...` pass toàn bộ 6 package có test; `bun run build:headless && bun run lint && bun run type-check && bun run test` pass 56/56 test files (781/781 tests).

## Spec Change Log

## Review Triage Log

| Nguồn | Finding | Verdict | Bằng chứng & Định tuyến |
|---|---|---|---|
| blind-hunter | Capture-phase mousedown & Escape làm rơi sửa option / đóng nhầm dropdown inline-add trong `KvpValueSelectControl.vue` | `medium` | Đúng tại `KvpValueSelectControl.vue:242-269,535,546`: `handleWindowMousedown` chạy capture làm unmount input trước khi `@change` bắn; `handleWindowKeydown` chặn `@keydown.esc` của `kvp-add-option-input`; `:key="${idx}-${opt}"` hủy DOM input khi sửa. Route: `patch`. |
| blind-hunter | Thiếu cập nhật vị trí portal khi scroll/resize, thiếu keyboard nav listbox, `div` ngoài danh sách, `:key="opt"` trùng trong `KvpValueSelectControl.vue` | `low` | Đúng tại `KvpValueSelectControl.vue:156,166,411,427`: scroll modal/editor làm lệch portal `fixed`; `:key="opt"` có thể đụng nếu JSON có duplicate; `kvp-dropdown-out-of-list` là `<div>`. Route: `patch` (cập nhật vị trí scroll/resize, `:key="${idx}-${opt}"`, `<button>`). |
| blind-hunter | `:key="index"` trong `KvpEditor.vue` rò state portal và không forward `readonly`/`disabled` | `false` | `:key="index"` đã có sẵn ở `KvpEditor.vue:188`; dòng `_isAuto` đi nhánh `v-if="row._isAuto"` không dùng `KvpValueSelectControl`, `readonlyKeys` chỉ khóa cột Key (cột Value vẫn sửa được), và dòng `!enabled` cho phép sửa bình thường. |
| blind-hunter | Toggle/options trong `VariableHoverPopover.vue` không tự lưu/chưa báo chưa lưu, và `buildUpdated` rò `options` kế thừa sang `text` | `medium` | Đúng phần rò `options` tại `VariableHoverPopover.vue:252-256` (ghi `meta.options` kế thừa vào scope mới khi lưu `text`) và thiếu chỉ báo chưa lưu trên nút Lưu khi chỉ sửa `type`/`options`. Route: `patch`. |
| blind-hunter | Biến `enabled: false` bị `findEnabledVariable` bỏ qua trong `resolveHierarchyVariables.ts` | `false` | Thiết kế có chủ đích trong `resolveHierarchyVariables.ts:132-145`: biến tắt (`enabled: false`) không tham gia resolve 4 tầng để nhường tầng cha, tránh áp nhầm metadata của dòng đang tắt. |
| blind-hunter | Lỗi ưu tiên `inheritedType`/`inheritedOptions` khi tầng trên ghi đè `text` và bỏ qua `path-param` `text` rỗng | `medium` | Đúng phần `fallbackScopeOrder` (`resolveHierarchyVariables.ts:467-474`) bỏ qua tầng trên đang định nghĩa `text` và rơi xuống lấy `select` ở tầng thấp hơn. Phần bỏ qua `path_params` `text` rỗng là cố ý để `:param` kế thừa được `options`. Route: `patch`. |
| blind-hunter | `GitConflictResolverModal.vue` ẩn khác biệt `type`/`options` trong `formatConflictValue` | `medium` | Đúng tại `GitConflictResolverModal.vue:372-376`: `formatConflictValue` chỉ hiển thị `key`, `value`, `enabled`, `description`, khiến conflict chỉ khác `type`/`options` trông giống hệt nhau. Route: `patch`. |
| blind-hunter | `projects/frontend/wailsjs/go/models.ts` chưa sinh lại | `false` | `wailsjs/` nằm trong `.gitignore` (sinh tự động khi chạy `wails dev`/`build` theo `AGENTS.md`); `EnvModal.vue` parse JSON nguyên gốc và dùng `LocalEnvironment` nên không làm mất `type`/`options`. |
| blind-hunter | CLI `--redact` lộ `Options` và `req update --url` xóa `Params` | `low` | Đúng phần `redactHeaderKVPairs`/`redactVarKVPairs` (`cmd/hecto/main.go:2578-2592`) chưa che `Options` khi key nhạy cảm (`patch`). Phần `req update --url` (`main.go:2206`) cố ý thay tập query params theo URL mới (`false`). |
| blind-hunter | `areParamsEqual` bỏ qua `type`/`options` và `reconcileParamsFromUrl` đối chiếu theo vị trí | `false` | `areParamsEqual` (`urlParams.ts:214`) chỉ dùng trong `useUrlParamsSync.ts` để đồng bộ chuỗi URL (không chứa `type`/`options`); `reconcileParamsFromUrl` spread `{ ...item }` giữ `type`/`options` và ghép theo vị trí là hành vi sẵn có để hỗ trợ key lặp. |
| blind-hunter | Thiếu test popover add/rename options, vài editor khác và CLI `--set-param`/`--set-path-param` | `low` | Đúng: thiếu test cho `kvp-popover-add-option-*`, `kvp-option-item-input-*`, `requestStore.isDirty`, và `--set-param`/`--set-path-param`. Route: `patch`. |
| edge-case-hunter | Tầng ưu tiên cao hơn ghi đè `text` nhưng tầng con chưa định nghĩa vẫn kế thừa `select` từ tầng thấp hơn (`resolveHierarchyVariables.ts:467-474`) | `medium` | Đúng: vòng lặp `fallbackScopeOrder` không `break` khi gặp `meta` có `type === 'text'`. Route: `patch`. |
| edge-case-hunter | Nhấn `Escape` trong `kvp-add-option-input` đóng cả dropdown (`KvpValueSelectControl.vue:255-262`) | `medium` | Đúng: listener `keydown` capture-phase trên `window` gọi `stopImmediatePropagation()` trước handler `@keydown.esc` của input. Route: `patch`. |
| edge-case-hunter | Sửa option trong popover rồi click ra ngoài bị mất giá trị (`KvpValueSelectControl.vue:242-253`) | `medium` | Đúng: listener `mousedown` capture-phase đóng popover trước khi blur kích hoạt `@change`. Route: `patch`. |
| edge-case-hunter | Xóa hết `options`, chuyển về `text` và lưu trong `VariableHoverPopover.vue:252-256` vẫn giữ mảng `options` cũ | `medium` | Đúng: khi `meta.options` là `[]` và `existing.options` khác rỗng, nhánh `else if (!existing?.options?.length)` không xóa `next.options`. Route: `patch`. |
| verification-gap | Thiếu test component `VariableHoverPopover` cho `:param` (`variableKind="path"`) với `select` | `medium` | Pre-verified: chỉ mới test pure function ở `resolveHierarchyVariables.test.ts`, chưa mount `VariableHoverPopover` với `variableKind="path"`. Route: `patch`. |
| verification-gap | Thiếu test giữ focus trên `VariableHighlighter` khi activeElement nằm trong `[data-kvp-portal="true"]` | `medium` | Pre-verified: chưa có test kiểm tra `handlePopoverFocusOut` sau `>200ms` khi focus ở portal. Route: `patch`. |
| verification-gap | Thiếu test `confirmPopoverAdd`, `updateOptionAt` và cách ly phím `Escape` khi portal mở trong `EnvModal` | `medium` | Pre-verified: chưa có test tương tác `kvp-popover-add-option-*`, `kvp-option-item-input-*`, hoặc nhấn `Escape` trong `EnvModal`. Route: `patch`. |
| verification-gap | Thiếu test `VariableHoverPopover` chuyển biến `select` về `text` và bấm Lưu | `medium` | Pre-verified: các test mới trong `VariableHighlighter.test.ts` chỉ test giữ nguyên `select`. Route: `patch`. |
| verification-gap | Thiếu Go test ranh giới Go-JS `ReconcileRequestURLAndParams` và CLI `req update --set-param`/`--set-path-param` | `medium` | Pre-verified: `headless_test.go` và `main_test.go` chưa test `Params`/`PathParams` có `Type: "select"` và `Options`. Route: `patch`. |

## Design Notes

- Giữ bảng riêng trong `EnvModal.vue` (`<input placeholder="Value">` ở mode `text`) và dùng chung `KvpValueSelectControl.vue` để không vỡ `EnvModal.test.ts`.
- Dropdown và popover `options` dùng `<Teleport to="body">` + `fixed` tránh bị cắt bởi `overflow-hidden` của `KvpEditor.vue`.
- `inspectVariableHierarchy` trả metadata `type`/`options` từng scope và fallback theo thứ tự `path-param` → `folder-env` → `folder-global` → `global-env` → `collection`.

## Verification

**Commands:**
- `cd projects && go vet ./... && go test ./...` -- expected: mọi package Go pass.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless && bun run lint && bun run type-check && bun run test` -- expected: build, lint, type-check và Vitest pass 100%.

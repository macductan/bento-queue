---
title: 'Key Input Visibility Fix in KvpEditor & Folder Settings Environment Variable Resolution'
type: 'bugfix'
created: '2026-10-14'
status: 'done'
baseline_revision: '80dd7ce74cedfcf7fbe3defd3696c598b29eaa54'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/specs/spec-multisession-tabs-and-folder-ux/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-multisession-tabs-and-folder-ux/multisession-tabs-and-folder-architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Trong `KvpEditor.vue`, ô `<input placeholder="Key">` ở cột `Key` đang bọc bởi `VariableHighlighter` kèm class `text-transparent`, khiến văn bản gõ vào tên biến/tên header bị ẩn (CAP-3). Đồng thời, trong `FolderEditor.vue` và `AuthEditor.vue`, các trường cấu hình xác thực (`Bearer Token`, `Basic Username/Password`, `API Key Value`) và bảng `DefaultHeadersTable` kế thừa từ thư mục cha chưa hiển thị highlight/hover preview biến môi trường 4 tầng (`Collection Env -> Active Global Env -> Folder Global Env -> Folder-Env`), và watcher trên `props.modelValue` trong `AuthEditor.vue` tự động reset trạng thái hiển thị mật khẩu/token về `type="password"` sau mỗi ký tự gõ (CAP-4).

**Approach:** Tháo bỏ hoàn toàn `VariableHighlighter` và class `text-transparent` / `transparent-selection` khỏi ô `<input>` cột `Key` trong `KvpEditor.vue`, chuyển sang hiển thị trực tiếp với `text-text-primary` trong khi giữ nguyên `VariableHighlighter` ở cột `Value`. Trong `AuthEditor.vue`, xóa watcher reset `showBearerToken`/`showBasicPassword`/`showApiKeyValue` trên `props.modelValue` (chỉ reset khi đổi `activeRequestId` hoặc `activeFolderId`), và tích hợp `VariableHighlighter` vào các ô `Basic Username`, `Bearer Token`, `Basic Password`, `API Key Value` (khi ở chế độ hiện văn bản hoặc chứa cú pháp `{{...}}`). Trong `FolderEditor.vue` và `RequestEditor.vue`, đảm bảo `currentScopeVariables` luôn gắn kết mảng thực của `folder_envs[selectedEnvScope]`, cung cấp đầy đủ `effectiveVariables` + `variableHierarchyFolders` 4 tầng, và hiển thị `DefaultHeadersTable` kế thừa đã phân giải biến trong tab `Headers` của `FolderEditor.vue`.

## Boundaries & Constraints

**Always:**
- Giữ nguyên `<VariableHighlighter>` trên cột `Value` (`<textarea placeholder="Value">`) của `KvpEditor.vue` để tiếp tục highlight biến (`text-variable-valid` / `text-variable-missing`) và mở `VariableHoverPopover`.
- Giữ nguyên đầy đủ các sự kiện `@compositionstart="ensureRealRow(index)"`, `@input`, `@compositionend` và ref `keyInputs[index]` trên ô `<input placeholder="Key">` của `KvpEditor.vue` để bảo toàn phần tử DOM khi gõ tiếng Việt IME ở dòng trống (phantom row).
- Tuân thủ thứ tự ưu tiên phân giải biến 4 tầng: `Collection Env -> Active Global Env -> Folder Global Env (Root..Leaf) -> Folder-Env (Active, Root..Leaf)`.
- Khi giá trị trong `Bearer Token`, `Basic Password`, hoặc `API Key Value` không chứa cú pháp biến `{{...}}` và người dùng chưa bật nút hiện mật khẩu (`show... === false`), giữ `<input type="password">` với `text-text-primary` và ẩn lớp overlay của `VariableHighlighter` để bảo mật.
- Mọi kiểm thử tự động chỉ thao tác trên `Test-Collection` hoặc dữ liệu mock/tạm thời, tuyệt đối không chạm vào dữ liệu thật của người dùng.

**Never:**
- Không bọc `<VariableHighlighter>` hoặc dùng `text-transparent` cho cột `Key` trong `KvpEditor.vue` hay ô `#api-key-name-input` trong `AuthEditor.vue`.
- Không reset `showBearerToken`, `showBasicPassword`, `showApiKeyValue` khi `props.modelValue` cập nhật do người dùng đang gõ phím.
- Không tháo/gắn lại (unmount/remount) phần tử `<input>` của `AuthEditor.vue` khi chuyển đổi giữa chế độ ẩn mật khẩu và chế độ highlight biến lúc đang nhập liệu (tránh mất focus và vị trí con trỏ).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gõ tên khóa vào cột `Key` trong `KvpEditor.vue` (kể cả dòng phantom row và bộ gõ IME) | Người dùng gõ `Authorization` hoặc tiếng Việt có dấu vào `input[placeholder="Key"]` | Ô input hiển thị trực tiếp bằng class `text-text-primary`, không có class `text-transparent` và không bọc `VariableHighlighter`; giá trị cập nhật tức thì vào model | Không phát sinh lỗi |
| Bật con mắt hiện Token/Password trong `AuthEditor.vue` rồi gõ liên tiếp từng ký tự | Click nút toggle visibility (`showBearerToken = true`), sau đó nhập `my-secret-123` | `input#bearer-token-input` giữ nguyên `type="text"` xuyên suốt quá trình gõ; chỉ reset về ẩn khi đổi sang Request hoặc Folder khác | Không phát sinh lỗi |
| Nhập biến `{{bearer_token}}` vào ô `Bearer Token`, `Basic Password`, `API Key Value`, hoặc `Basic Username` trong `FolderEditor` / `RequestEditor` | `Collection Env`, `Active Global Env`, `Folder cha` hoặc `Folder hiện tại` có định nghĩa `bearer_token` | Ô input tự động chuyển sang `type="text"` với lớp phủ `VariableHighlighter` tô màu `span.text-variable-valid` (hoặc `span.italic.text-variable-missing` nếu chưa định nghĩa) và di chuột vào mở `VariableHoverPopover` với đầy đủ các cấp thư mục cha + thư mục hiện tại | Biến chưa định nghĩa hiển thị `text-variable-missing` |
| Chuỗi mật khẩu tĩnh không chứa `{{...}}` và đang ở chế độ ẩn (`show... === false`) | `bearerToken = "static-secret"`, `showBearerToken = false` | Ô input giữ `type="password"` với `text-text-primary`, lớp overlay của `VariableHighlighter` bị ẩn (`hidden`) | Không lộ mật khẩu dạng rõ trên overlay |
| Xem tab `Headers` trong `FolderEditor.vue` của thư mục con có kế thừa Headers/Auth từ thư mục cha | Thư mục cha có header `X-Env: {{env_name}}` hoặc Auth `Bearer {{token}}` | Bảng `DefaultHeadersTable` trong `FolderEditor.vue` hiển thị các header kế thừa từ thư mục cha và Auth với giá trị biến đã được phân giải từ `effectiveVariables` 4 tầng | Không phát sinh lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/components/KvpEditor.vue` -- Bảng chỉnh sửa cặp Key-Value dùng chung cho Params, Headers, Variables; cần tháo `VariableHighlighter` và `text-transparent` khỏi cột `Key` (lines 34, 121, 204-228).
- `projects/frontend/src/components/AuthEditor.vue` -- Trình chỉnh sửa cấu hình Auth cho Request và Folder; cần bỏ watcher reset trên `props.modelValue` (lines 23-27), chỉ reset khi đổi `activeRequestId`/`activeFolderId`, và bọc `VariableHighlighter` quanh `#bearer-token-input`, `#basic-username-input`, `#basic-password-input`, `#api-key-val-input`.
- `projects/frontend/src/components/FolderEditor.vue` -- Trình chỉnh sửa cài đặt thư mục (Headers, Auth, Variables); đảm bảo `currentScopeVariables` luôn tham chiếu mảng thực trong `folder_envs`, provide `effectiveVariables` + `variableHierarchyFolders`, và hiển thị `DefaultHeadersTable` cho các header kế thừa từ thư mục cha/Auth.
- `projects/frontend/src/components/RequestEditor.vue` -- Trình chỉnh sửa Request; đảm bảo `defaultHeaders` phân giải biến môi trường trong giá trị header kế thừa từ thư mục cha thông qua `resolveVariables(h.value, effectiveVariables.value)`.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Component hiển thị lớp phủ highlight biến `{{...}}` và mở `VariableHoverPopover`; bảo vệ truy cập Pinia store qua `getActivePinia()` để an toàn trong mọi ngữ cảnh mount.
- `projects/frontend/src/components/__tests__/KvpEditor.test.ts` -- Unit test cho `KvpEditor.vue`.
- `projects/frontend/src/components/__tests__/AuthEditor.test.ts` -- Unit test cho `AuthEditor.vue`.
- `projects/frontend/src/components/__tests__/FolderEditor.test.ts` -- Unit test cho `FolderEditor.vue`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/components/KvpEditor.vue` -- Xóa `keyHighlighterRefs` và tháo `<VariableHighlighter>` khỏi ô `<input placeholder="Key">` ở cột `Key`; thay class `transparent-selection` và `text-transparent` bằng `text-text-primary` trong khi giữ nguyên `<VariableHighlighter>` ở cột `Value` -- Khắc phục triệt để lỗi gõ tên khóa bị ẩn chữ (CAP-3).
- [x] `projects/frontend/src/components/VariableHighlighter.vue` -- Kiểm tra `getActivePinia()` trước khi gọi `useEnvironmentStore()` và `useCollectionStore()`, đồng thời bổ sung `min-h-full` cho khối `singleLine` -- Đảm bảo `VariableHighlighter` hoạt động ổn định cả khi component cha được mount độc lập trong unit test và hiển thị đúng chiều cao dòng đơn.
- [x] `projects/frontend/src/components/AuthEditor.vue` -- Xóa `watch(() => props.modelValue, ...)` đang reset `showBearerToken`/`showBasicPassword`/`showApiKeyValue` khi gõ phím và thay bằng watcher theo dõi `[collectionStore?.activeRequestId, collectionStore?.activeFolderId]`; tích hợp `VariableHighlighter` cho `#basic-username-input`, `#bearer-token-input`, `#basic-password-input`, `#api-key-val-input` (hiển thị text + highlight khi bật nút con mắt hoặc khi giá trị chứa `{{...}}`, giữ `type="password"` khi là chuỗi tĩnh đang ẩn) -- Đảm bảo highlight/hover preview biến môi trường 4 tầng và không tự ẩn mật khẩu khi đang gõ (CAP-4).
- [x] `projects/frontend/src/components/FolderEditor.vue` -- Đảm bảo `currentScopeVariables` luôn khởi tạo và trả về mảng thực của `folder_envs.value[selectedEnvScope.value]`; tích hợp `DefaultHeadersTable` vào tab `Headers` của `FolderEditor.vue` kèm phân giải biến `effectiveVariables` 4 tầng cho các header kế thừa từ thư mục cha và Auth -- Đồng bộ trải nghiệm kế thừa và phân giải biến 4 tầng trong `FolderEditor` (CAP-3, CAP-4).
- [x] `projects/frontend/src/components/RequestEditor.vue` -- Phân giải biến môi trường bằng `resolveVariables(h.value || '', effectiveVariables.value)` cho các header kế thừa từ thư mục cha trong `defaultHeaders` -- Đảm bảo bảng `DefaultHeadersTable` hiển thị đúng giá trị biến kế thừa (CAP-4).
- [x] `projects/frontend/src/components/__tests__/KvpEditor.test.ts` -- Cập nhật và bổ sung unit tests kiểm tra cột `Key` dùng `text-text-primary` (không dùng `text-transparent` hay `VariableHighlighter`), trong khi cột `Value` vẫn highlight biến `text-variable-valid` / `text-variable-missing` -- Xác minh CAP-3 và các trường hợp biên trong I/O Matrix.
- [x] `projects/frontend/src/components/__tests__/AuthEditor.test.ts` -- Bổ sung unit tests kiểm tra giữ nguyên trạng thái hiện mật khẩu/token khi gõ phím liên tiếp, tự động highlight biến `{{...}}` (`text-variable-valid` / `text-variable-missing`) trên Bearer Token, Basic Username/Password, API Key Value, và mở `VariableHoverPopover` với ngữ cảnh biến 4 tầng -- Xác minh CAP-4.
- [x] `projects/frontend/src/components/__tests__/FolderEditor.test.ts` -- Bổ sung unit tests kiểm tra gõ `Key`/`Value` trong `FolderEditor`, cung cấp `effectiveVariables` + `variableHierarchyFolders` 4 tầng (`Collection Env + Active Global Env + Folder cha + Folder hiện tại`) xuống `AuthEditor`, `KvpEditor` và `DefaultHeadersTable` -- Xác minh CAP-3 và CAP-4 tích hợp trong `FolderEditor`.

**Acceptance Criteria:**
- Given người dùng mở `FolderEditor`, `RequestEditor`, `EnvModal` hoặc `CollectionEnvModal` có bảng `KvpEditor`, when gõ tên khóa vào ô `input[placeholder="Key"]` (bao gồm cả dòng trống phantom row và bộ gõ IME), then ô input hiển thị trực tiếp văn bản bằng class `text-text-primary` (không có `text-transparent` và không bọc `VariableHighlighter`), trong khi cột `Value` vẫn highlight đúng biến `{{variable}}`.
- Given người dùng mở tab `Auth` trong `FolderEditor` hoặc `RequestEditor` và bật nút hiện mật khẩu/token (con mắt), when người dùng gõ từng ký tự vào ô `Bearer Token`, `Basic Password`, hoặc `API Key Value`, then ô input vẫn giữ nguyên `type="text"` mà không bị reset về `type="password"`.
- Given biến môi trường được định nghĩa tại `Collection Env`, `Active Global Env`, `Folder cha`, hoặc `Folder hiện tại`, when người dùng nhập `{{variable}}` vào cột `Value` của `KvpEditor` hoặc các trường `Bearer Token`, `Basic Username`, `Basic Password`, `API Key Value` trong `FolderEditor.vue`, then biến được tô màu `text-variable-valid` (hoặc `text-variable-missing` nếu chưa tồn tại) theo đúng thứ tự ưu tiên 4 tầng và di chuột vào sẽ mở `VariableHoverPopover` hiển thị đầy đủ các cấp thư mục.
- Given thư mục con kế thừa header hoặc Auth có chứa biến `{{variable}}` từ thư mục cha, when người dùng mở tab `Headers` trong `FolderEditor.vue` và mở bảng `DefaultHeadersTable`, then giá trị header kế thừa được hiển thị với biến đã phân giải theo `effectiveVariables` 4 tầng.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 15 findings — high 0, medium 7, low 4, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` `AuthEditor.vue` eye toggle button could not hide values containing `{{variable}}` and displayed inverted icon/title state — Patched `showBearerToken`/`showBasicPassword`/`showApiKeyValue` to `ref<boolean | null>(null)` (`null` = auto-detect variable syntax, boolean = explicit user override) and bound eye buttons to `is*Visible`.
  - `[medium]` `[patch]` `AuthEditor.vue` `hasVariableSyntax` required closing `}}` before switching to `type="text"`, causing mid-edit masking when typing `{{` or backspacing `}` — Updated `hasVariableSyntax` to `/\{\{/.test(val || '')` so typing `{{` immediately enters text mode.
  - `[medium]` `[patch]` `RequestEditor.vue` and `FolderEditor.vue` overwrote raw `{{variable}}` templates with resolved values when disabling an inherited folder header via `toggleDefaultHeader` — Added `rawValue?: string` to `DefaultHeaderItem` in `src/utils/headers.ts` and preserved `rawValue` when pushing disabled headers in `toggleDefaultHeader`.
  - `[false]` `[reject]` `FolderEditor.vue` `toggleDefaultHeader` claimed `getInheritedHeaders` drops disabled folder headers — Disproved by `src/utils/headers.ts:38-41` (`mergeHeaders`), where a disabled subfolder header explicitly suppresses the ancestor folder header for all child requests.
  - `[low]` `[reject]` `DefaultHeadersTable.vue` tooltip text displays existing badge strings when rendered in `FolderEditor` — Cosmetic tooltip wording governed by existing `DefaultHeadersTable.test.ts` assertions; not worth adding branching complexity.
  - `[low]` `[reject]` `FolderEditor.vue` `currentScopeVariables.get()` initializes `folder_envs.value[selectedEnvScope.value] = []` if missing — Safe fallback for direct array mutation by `KvpEditor`; `watch(selectedEnvScope)` already initializes on scope switch and `getCleanSnapshot` ignores empty arrays.
  - `[false]` `[reject]` `FolderEditor.vue` `syncExternalFolderVariables` bails out when `isDirty` is `true` — Pre-existing behavior explicitly required and tested by `FolderEditor.test.ts:496` to prevent overwriting unsaved folder edits.
  - `[false]` `[reject]` Removing `VariableHighlighter` from `KvpEditor` Key column and `#api-key-name-input` removes variable highlighting on keys — Directly contradicted by CAP-3 in `SPEC.md` and `multisession-tabs-and-folder-architecture.md`, which mandate removing `VariableHighlighter` from Key inputs.
  - `[low]` `[reject]` `AuthEditor.vue` single-line `VariableHighlighter` overlay clipping near `pr-10` — Negligible visual edge case on extremely long tokens; `overflow-hidden` and `syncScroll` are already applied.
  - `[low]` `[patch]` `AuthEditor.test.ts` hover popover test mounted to `document.body` with fake timers without `try/finally` cleanup — Wrapped test body in `try / finally` to guarantee `wrapper.unmount()` and `vi.useRealTimers()`.
  - `[medium]` `[patch]` Edge case: secret field with `{{var}}` could not be masked by eye button in `AuthEditor.vue` — Grouped with BH-1 and fixed via `ref<boolean | null>(null)` visibility state.
  - `[medium]` `[patch]` Edge case: typing opening `{{` or deleting closing `}}` flipped input to `type="password"` mid-edit in `AuthEditor.vue` — Grouped with BH-2 and fixed via `/\{\{/.test(val || '')`.
  - `[medium]` `[patch]` Edge case: disabling an inherited folder header containing `{{var}}` in `DefaultHeadersTable` stored the resolved value instead of raw template — Grouped with BH-3 and fixed by preserving `rawValue` on `DefaultHeaderItem`.
  - `[medium]` `[patch]` Verification gap: unverified variable resolution for inherited folder headers in `RequestEditor.vue` — Added unit test in `RequestEditor.test.ts` verifying 4-tier variable resolution in `defaultHeaders` and `rawValue` preservation in `toggleDefaultHeader`.
  - `[medium]` `[patch]` Verification gap: unverified `toggleDefaultHeader` and 4-tier `VariableHoverPopover` inspection inside `FolderEditor.vue` — Extended `FolderEditor.test.ts` to test `toggleDefaultHeader` disable/re-enable cycles and hover popover with all 4 tiers including `folder_envs[activeEnvId]`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0, không có lỗi TypeScript.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: exit code 0, 100% test suites và unit tests vượt qua.
- `cd projects && go test ./...` -- expected: exit code 0, 100% Go backend tests vượt qua.

## Auto Run Result

- **Summary of implemented change:** Đã sửa lỗi ẩn chữ khi nhập cột `Key` trong `KvpEditor.vue` bằng cách tháo bỏ `VariableHighlighter` và `text-transparent`, chuyển sang `text-text-primary` (CAP-3). Đồng thời cập nhật `AuthEditor.vue`, `FolderEditor.vue`, `RequestEditor.vue` và `VariableHighlighter.vue` để hỗ trợ đầy đủ phân giải biến môi trường 4 tầng (`Collection Env -> Active Global Env -> Folder Global Env -> Folder-Env`), highlight biến và mở `VariableHoverPopover` trên các trường Auth/Headers/Variables, hiển thị `DefaultHeadersTable` kế thừa đã phân giải biến trong `FolderEditor.vue`, và giữ nguyên trạng thái hiện mật khẩu/token khi đang gõ phím (CAP-4).
- **Files changed:**
  - `projects/frontend/src/components/KvpEditor.vue` — Tháo bỏ `VariableHighlighter` và `text-transparent` khỏi ô input cột `Key`, dùng `text-text-primary`.
  - `projects/frontend/src/components/AuthEditor.vue` — Bỏ watcher reset visibility trên `props.modelValue`, dùng `ref<boolean | null>(null)` chỉ reset khi đổi Request/Folder, tích hợp `VariableHighlighter` cho `#bearer-token-input`, `#basic-username-input`, `#basic-password-input`, `#api-key-val-input`.
  - `projects/frontend/src/components/FolderEditor.vue` — Đảm bảo `currentScopeVariables` luôn tham chiếu mảng thực của `folder_envs`, tích hợp `DefaultHeadersTable` và `toggleDefaultHeader` với phân giải biến 4 tầng.
  - `projects/frontend/src/components/RequestEditor.vue` — Phân giải biến 4 tầng cho các header kế thừa trong `defaultHeaders` và bảo toàn `rawValue` khi toggle.
  - `projects/frontend/src/utils/headers.ts` — Bổ sung `rawValue?: string` vào `DefaultHeaderItem` để bảo toàn chuỗi mẫu `{{variable}}` khi bật/tắt default header.
  - `projects/frontend/src/components/VariableHighlighter.vue` — Bảo vệ truy cập Pinia store qua `getActivePinia()` và thêm `min-h-full` cho chế độ `singleLine`.
  - `projects/frontend/src/components/__tests__/KvpEditor.test.ts` — Cập nhật unit test xác minh cột `Key` dùng `text-text-primary` và cột `Value` highlight biến.
  - `projects/frontend/src/components/__tests__/AuthEditor.test.ts` — Bổ sung unit test cho việc giữ trạng thái hiện mật khẩu khi gõ liên tiếp, gõ `{{` chuyển sang text mode, bật/tắt con mắt với biến, và mở `VariableHoverPopover` 4 tầng.
  - `projects/frontend/src/components/__tests__/FolderEditor.test.ts` — Bổ sung integration test cho phân giải biến 4 tầng trên `DefaultHeadersTable`, `KvpEditor`, `AuthEditor`, `toggleDefaultHeader` và `VariableHoverPopover`.
  - `projects/frontend/src/components/__tests__/RequestEditor.test.ts` — Bổ sung unit test xác minh `defaultHeaders` phân giải biến kế thừa từ thư mục cha và bảo toàn `rawValue` khi disable.
- **Review findings breakdown:**
  - Patches applied: 5 nhóm (`high`: 0, `medium`: 4 nhóm / 7 findings, `low`: 1 nhóm / 1 finding) — đã sửa trong `AuthEditor.vue`, `headers.ts`, `RequestEditor.vue`, `FolderEditor.vue`, `AuthEditor.test.ts`, `RequestEditor.test.ts`, `FolderEditor.test.ts`.
  - Items deferred: 0.
  - Rejected findings: 7 findings (`false`: 4 — đã bác bỏ bằng bằng chứng trong `headers.ts`, `FolderEditor.test.ts`, và yêu cầu CAP-3 trong `SPEC.md`; `low`: 3 — cosmetic/negligible không cần tăng độ phức tạp).
- **Follow-up review recommendation:** `true` (do có >= 2 nhóm `medium` được vá ở lượt review đầu tiên; rủi ro cần lưu ý nếu review bổ sung: tương tác giữa trạng thái toggle thủ công nút con mắt và việc xóa toàn bộ chuỗi biến trong `AuthEditor.vue`).
- **Verification performed:**
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -> Pass (exit code 0).
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -> Pass (32 test files, 419 tests passed).
  - `cd projects && go test ./...` -> Pass (exit code 0).
- **Residual risks:** Không còn rủi ro chặn (blocking risk).


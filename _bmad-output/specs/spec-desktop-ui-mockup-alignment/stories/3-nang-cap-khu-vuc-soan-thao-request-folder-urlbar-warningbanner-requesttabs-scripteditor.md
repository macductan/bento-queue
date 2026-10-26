---
title: 'Nâng cấp Khu vực Soạn thảo Request/Folder, UrlBar, WarningBanner, RequestTabs & ScriptEditor'
type: 'feature'
created: '2026-10-26'
status: 'done'
story_id: '3'
parent_spec: '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
baseline_revision: 'HEAD'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/ui-mockup-alignment-details.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/stories.yaml'
  - 'projects/frontend/src/components/RequestEditor.vue'
  - 'projects/frontend/src/components/FolderEditor.vue'
  - 'projects/frontend/src/components/UrlBar.vue'
  - 'projects/frontend/src/components/WarningBanner.vue'
  - 'projects/frontend/src/components/RequestTabs.vue'
  - 'projects/frontend/src/components/ScriptEditor.vue'
  - 'projects/frontend/src/stores/collectionStore.ts'
  - 'projects/frontend/src/stores/requestStore.ts'
  - 'projects/frontend/src/composables/useAutoSave.ts'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Khu vực soạn thảo Request và Folder hiện tại chưa hỗ trợ sửa tên nhanh trực tiếp (inline rename) trên thanh Breadcrumb và chưa có nút `Lưu (Ctrl+S)` thủ công cạnh chỉ báo trạng thái lưu; `UrlBar.vue` chưa áp dụng class `.method-badge-*` cho nút chọn HTTP Method và nút `Gửi` chưa hiển thị chữ `'Gửi'` kèm phím tắt `<kbd>^Enter</kbd>`; `WarningBanner.vue` chỉ có nút `'Bỏ qua'` mà thiếu nút hành động nhanh `'Chuyển Body sang None'`; `RequestTabs.vue` mới chỉ hiển thị badge số lượng Params/Headers tùy chỉnh mà chưa hiển thị badge kiểu `Auth`, kiểu `Body`, và tổng số `Headers` đang bật (gồm cả `DefaultHeadersTable`); và nút chạy thử Pre-request script trong `ScriptEditor.vue` chưa mang nhãn `'▶ Chạy thử Script'` chuẩn theo mockup.

**Approach:**
1. **`collectionStore.ts` & `useAutoSave.ts` & `requestStore.ts`**:
   - Bổ sung action `renameNode(id: string, newName: string, type: 'request' | 'folder' = 'request')` trên `collectionStore.ts` ủy quyền sang `this.renameRequest(id, newName)` hoặc `this.renameFolder(id, newName)` (và cập nhật `requestStore.current.name` / `requestStore.original.name` nếu đang mở chính request đó).
   - Bổ sung `saveNow: () => requestStore.saveCurrent()` vào kết quả trả về của `useAutoSave.ts`.
   - Bổ sung getter `showGetBodyWarning(state): boolean` trên `requestStore.ts` trả về `Boolean(state.current && state.current.method === 'GET' && state.current.body && state.current.body.type !== 'none')`.
2. **`RequestEditor.vue` & `FolderEditor.vue`**:
   - Trên thanh Breadcrumb: giữ nguyên click đơn vào `[data-test="breadcrumb-request"]` (hoặc `[data-test="breadcrumb-folder"]` / `[data-test="breadcrumb-current-folder"]`) để gọi `collectionStore.revealNodeInTree(...)`, đồng thời thêm nút bút chì `[data-test="breadcrumb-rename-btn"]` (và hỗ trợ `@dblclick`) để mở ô `<input data-test="breadcrumb-name-input">` sửa tên inline. Khi nhấn `Enter` hoặc `@blur`, gọi `collectionStore.renameNode(...)` với tên mới (bỏ qua nếu rỗng hoặc không đổi); khi nhấn `Escape`, hủy sửa và khôi phục tên cũ.
   - Bên phải thanh Breadcrumb: đặt cụm `[data-test="save-state-indicator"]` (trên `FolderEditor.vue` có cả `data-test="folder-save-state-indicator"` và `data-test="save-state-indicator"` hoặc giữ nguyên `data-test="folder-save-state-indicator"`) nằm cạnh nút `Lưu (Ctrl+S)` (`data-test="request-save-btn"` trên `RequestEditor.vue` gọi `autoSave.saveNow()`, và `data-test="folder-save-btn"` trên `FolderEditor.vue` gọi `saveFolderData(false)`).
3. **`UrlBar.vue`**:
   - Thêm `id="http-method-select"` và `data-test="method-selector"` trên nút chọn HTTP Method, đồng thời kết hợp cả `.text-method-<m>` và `.method-badge-<m>` (ví dụ `method-badge-get text-method-get`).
   - Cập nhật nút Gửi (`data-test="send-request-btn"`, `aria-label="Gửi"`) hiển thị icon gửi + `<span>Gửi</span>` + `<kbd>^Enter</kbd>`.
   - Cập nhật nút Hủy (`data-test="abort-request-btn"`) hiển thị spinner SVG (`animate-spin`) + `<span>Hủy</span>`. Bảo toàn 100% `VariableHighlighter` inline và `VariableHoverPopover`.
4. **`WarningBanner.vue`**:
   - Hiển thị khi `requestStore.showGetBodyWarning && !dismissedForCurrent` (tự động reset `dismissed` khi đổi request).
   - Giữ nút `Bỏ qua` và bổ sung nút hành động nhanh `Chuyển Body sang None` (`data-test="switch-body-none-btn"`) gọi `requestStore.setBodyType('none')`.
5. **`RequestTabs.vue`**:
   - Thêm `data-test="request-tab-${tab.id}"` trên từng nút tab (`params`, `auth`, `headers`, `body`, `scripts`).
   - Hiển thị các badge động:
     - `Params`: `data-test="tab-params-badge"` hiển thị tổng số `params` + `path_params` có `enabled && key.trim() !== ''` (khi `> 0`).
     - `Auth`: `data-test="tab-auth-badge"` hiển thị kiểu Auth hiệu lực hiện tại của request (`'inherit'`, `'bearer'`, `'basic'`, `'apiKey'`, `'none'`).
     - `Headers`: `data-test="tab-headers-badge"` hiển thị tổng số headers đang bật = số custom headers có `!h._isAuto && h.enabled && h.key.trim() !== ''` + số default/inherited headers đang bật và chưa bị override (`defaultHeadersCount` truyền qua prop hoặc tính toán từ `requestStore` + `collectionStore`).
     - `Body`: `data-test="tab-body-badge"` hiển thị kiểu Body hiện tại (`'json'`, `'xml'`, `'form-data'`/`'formdata'`, `'urlencoded'`, `'text'`, `'none'`).
     - `Scripts`: `data-test="tab-scripts-badge"` (chấm xanh `bg-emerald-400`) khi có `pre_request` hoặc `post_response` khác rỗng.
6. **`ScriptEditor.vue`**:
   - Nâng cấp nút `[data-test="run-pre-script-btn"]` hiển thị nhãn `'▶ Chạy thử Script'` với style pill emerald (`bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30`), đồng thời hiển thị toast thông báo kết quả chạy thử qua `uiStore.showToast(...)`.

## Boundaries & Constraints

**Always:**
- Bảo toàn 100% `VariableHighlighter` + `VariableHoverPopover` trên `#url-input` (`UrlBar.vue`), `KvpEditor.vue`, `AuthEditor.vue`, `BodyEditor.vue`.
- Bảo toàn 100% tự động đồng bộ 2 chiều URL <-> Query Params / Path Params (`:param`), tự động parse lệnh `cURL` khi dán vào `#url-input`, và hỗ trợ chọn `HEAD`, `OPTIONS` hoặc nhập Custom HTTP Method (`PURGE`, `PROPFIND`,...).
- Bảo toàn 100% cơ chế tính toán 4-tier variables (`effectiveVariables`) và kế thừa `defaultHeaders` từ Collection/Folder trong `RequestEditor.vue`.
- Giữ nguyên toàn bộ `data-test` hiện có (`breadcrumb-collection`, `breadcrumb-folder`, `breadcrumb-request`, `save-state-indicator`, `folder-save-state-indicator`, `send-request-btn`, `abort-request-btn`, `custom-method-input`, `custom-method-apply`, `script-editor`, `script-phase-select`, `run-pre-script-btn`, `script-error-banner`, `clear-script-logs-btn`,...).

**Never:**
- Không thay thế `#url-input` + `VariableHighlighter` bằng `<input type="text">` đơn giản.
- Không chạy `git commit` hay `git push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sửa tên nhanh Request trên Breadcrumb (`RequestEditor.vue`) | Bấm `[data-test="breadcrumb-rename-btn"]` hoặc double-click `[data-test="breadcrumb-request"]` | Hiển thị `<input data-test="breadcrumb-name-input">` với tên hiện tại; nhấn `Enter` hoặc `@blur` với tên hợp lệ sẽ gọi `collectionStore.renameNode(req.id, trimmed, 'request')` và cập nhật `req.name` | Nếu tên rỗng/chỉ khoảng trắng hoặc nhấn `Escape`: hủy sửa, giữ nguyên tên cũ |
| Sửa tên nhanh Folder trên Breadcrumb (`FolderEditor.vue`) | Bấm `[data-test="breadcrumb-rename-btn"]` hoặc double-click tên folder trên Breadcrumb | Hiển thị `<input data-test="breadcrumb-name-input">` với tên folder hiện tại; nhấn `Enter` hoặc `@blur` gọi `collectionStore.renameNode(folderId, trimmed, 'folder')` | Nếu tên rỗng hoặc nhấn `Escape`: hủy sửa, giữ nguyên tên cũ |
| Bấm nút `Lưu (Ctrl+S)` thủ công | Bấm `[data-test="request-save-btn"]` hoặc `[data-test="folder-save-btn"]` | Gọi `autoSave.saveNow()` (`requestStore.saveCurrent()`) hoặc `saveFolderData(false)` ngay lập tức và hiển thị toast xác nhận | Disable nút khi `saveStatus === 'saving'` |
| Hiển thị `UrlBar.vue` & Nút Gửi/Hủy | `req.method = 'POST'`, `responseStore.loading = false` / `true` | Nút `#http-method-select` có class `method-badge-post text-method-post`; khi không chạy hiển thị `[data-test="send-request-btn"]` (`Gửi` + `^Enter`); khi đang chạy hiển thị `[data-test="abort-request-btn"]` (spinner `animate-spin` + `Hủy`) | Custom method (vd `PURGE`) dùng fallback `method-badge-options text-text-primary` |
| Cảnh báo `GET` kèm `Body !== 'none'` (`WarningBanner.vue`) | `req.method === 'GET'` và `req.body.type === 'json'` | Banner hiển thị cảnh báo kèm nút `[data-test="switch-body-none-btn"]` (`Chuyển Body sang None`) và nút `Bỏ qua`; bấm `Chuyển Body sang None` gọi `requestStore.setBodyType('none')` và ẩn banner | Tự động ẩn banner khi `req.body.type === 'none'` hoặc `req.method !== 'GET'` |
| Hiển thị Badges trên `RequestTabs.vue` | Request có `params`, `auth`, `headers` (+ `defaultHeaders`), `body`, `scripts` | Hiển thị `[data-test="tab-params-badge"]`, `[data-test="tab-auth-badge"]`, `[data-test="tab-headers-badge"]`, `[data-test="tab-body-badge"]`, `[data-test="tab-scripts-badge"]` phản ánh đúng trạng thái hiện tại | Không lỗi khi `req.headers`, `req.params`, `req.auth`, `req.body` là `undefined` |
| Chạy thử Pre-request Script (`ScriptEditor.vue`) | Bấm `[data-test="run-pre-script-btn"]` (`▶ Chạy thử Script`) | Thực thi `pre_request` script trong sandbox, ghi log vào `responseStore.scriptLogs`, áp dụng biến môi trường và hiển thị toast thông báo | Nếu script lỗi: ghi `responseStore.scriptError` và hiển thị `[data-test="script-error-banner"]` |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung action `renameNode(id: string, newName: string, type?: 'request' | 'folder')`.
- `projects/frontend/src/stores/requestStore.ts` -- Bổ sung getter `showGetBodyWarning`.
- `projects/frontend/src/composables/useAutoSave.ts` -- Bổ sung `saveNow: () => requestStore.saveCurrent()`.
- `projects/frontend/src/components/RequestEditor.vue` -- Inline rename trên Breadcrumb (`breadcrumb-rename-btn`, `breadcrumb-name-input`), nút `Lưu (Ctrl+S)` (`request-save-btn`), truyền `defaultHeadersCount` vào `<RequestTabs />`.
- `projects/frontend/src/components/FolderEditor.vue` -- Inline rename trên Breadcrumb (`breadcrumb-rename-btn`, `breadcrumb-name-input`) và nút `Lưu (Ctrl+S)` (`folder-save-btn`).
- `projects/frontend/src/components/UrlBar.vue` -- Thêm `id="http-method-select"`, class `.method-badge-*`, nút `Gửi` kèm `<kbd>^Enter</kbd>`, nút `Hủy` kèm spinner.
- `projects/frontend/src/components/WarningBanner.vue` -- Thêm nút `Chuyển Body sang None` (`data-test="switch-body-none-btn"`).
- `projects/frontend/src/components/RequestTabs.vue` -- Thêm `data-test="request-tab-${tab.id}"` và các badge `tab-params-badge`, `tab-auth-badge`, `tab-headers-badge`, `tab-body-badge`, `tab-scripts-badge`.
- `projects/frontend/src/components/ScriptEditor.vue` -- Cập nhật nút `data-test="run-pre-script-btn"` hiển thị `'▶ Chạy thử Script'` với style emerald pill và toast.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/stores/collectionStore.ts`, `projects/frontend/src/stores/requestStore.ts`, `projects/frontend/src/composables/useAutoSave.ts` -- Thêm `renameNode`, `showGetBodyWarning`, và `saveNow` -- Hỗ trợ các thao tác trong CAP-4.
- `projects/frontend/src/components/RequestEditor.vue`, `projects/frontend/src/components/FolderEditor.vue` -- Thêm inline rename trên Breadcrumb (`data-test="breadcrumb-rename-btn"`, `data-test="breadcrumb-name-input"`) và nút `Lưu (Ctrl+S)` (`data-test="request-save-btn"`, `data-test="folder-save-btn"`) -- Đồng bộ CAP-4.
- `projects/frontend/src/components/UrlBar.vue` -- Cập nhật `#http-method-select` với `.method-badge-*` + `.text-method-*`, nút `data-test="send-request-btn"` (`Gửi` + `^Enter`), và nút `data-test="abort-request-btn"` (spinner + `Hủy`) -- Đồng bộ CAP-4.
- `projects/frontend/src/components/WarningBanner.vue` -- Bổ sung nút `data-test="switch-body-none-btn"` (`Chuyển Body sang None`) gọi `requestStore.setBodyType('none')` -- Đồng bộ CAP-4.
- `projects/frontend/src/components/RequestTabs.vue` -- Bổ sung `data-test="request-tab-${tab.id}"` và các badge `tab-params-badge`, `tab-auth-badge`, `tab-headers-badge` (tổng custom headers đang bật + default/inherited headers đang bật chưa bị override), `tab-body-badge`, `tab-scripts-badge` -- Đồng bộ CAP-4.
- `projects/frontend/src/components/ScriptEditor.vue` -- Cập nhật nút `data-test="run-pre-script-btn"` hiển thị `'▶ Chạy thử Script'` với style emerald pill -- Đồng bộ CAP-4.
- `projects/frontend/src/components/__tests__/RequestEditor.test.ts`, `projects/frontend/src/components/__tests__/FolderEditor.test.ts`, `projects/frontend/src/components/__tests__/UrlBar.test.ts`, `projects/frontend/src/components/__tests__/ScriptEditor.test.ts` -- Bổ sung unit tests cho toàn bộ tính năng mới -- Đảm bảo độ phủ kiểm thử.

**Acceptance Criteria:**
- Given `RequestEditor.vue` hoặc `FolderEditor.vue` đang mở, when bấm `data-test="breadcrumb-rename-btn"` và nhập tên mới + nhấn `Enter`, then `collectionStore.renameNode(...)` được gọi; when bấm nút `Lưu (Ctrl+S)`, then dữ liệu được lưu ngay lập tức.
- Given `UrlBar.vue` đang hiển thị, when kiểm tra nút chọn Method và nút Gửi, then `#http-method-select` mang class `.method-badge-<method>` và `[data-test="send-request-btn"]` hiển thị `'Gửi'` kèm `^Enter` trong khi vẫn giữ nguyên `VariableHighlighter` inline.
- Given `req.method === 'GET'` và `req.body.type === 'json'`, when bấm `[data-test="switch-body-none-btn"]` trên `WarningBanner.vue`, then `req.body.type` chuyển về `'none'` và banner biến mất.
- Given `RequestTabs.vue` đang hiển thị, when kiểm tra các tab, then hiển thị đầy đủ `tab-auth-badge`, `tab-headers-badge` (tính cả default/inherited headers đang bật), và `tab-body-badge`.
- Given `ScriptEditor.vue` đang mở tab Pre-request, when kiểm tra nút chạy thử, then `[data-test="run-pre-script-btn"]` có nhãn `'▶ Chạy thử Script'`.

## Spec Change Log

## Review Triage Log

### Iteration 1 (2026-10-26)
- **Part 1 (Intent Alignment):**
  - *`collectionStore.renameNode` / `renameRequest` / `renameFolder` return value & backend-resolved name sync*: Categorized as `patch` — updated `renameRequest`, `renameFolder`, and `renameNode` to return `Promise<boolean>` reflecting backend success, and updated `commitRenameRequest` / `commitRenameFolder` to cancel pending auto-saves and only update local names when `ok === true` while preserving backend-normalized `resolvedName`.
  - *Double-click on `breadcrumb-request` triggering `revealNodeInTree` focus steal*: Categorized as `patch` — guarded `handleRequestClick` when `isRenamingRequest` is true and guarded `revealNodeInTree` against stealing focus when an input (`breadcrumb-name-input`) is focused.
  - *Unlayered `.method-badge-*` CSS overriding Tailwind v4 utilities in `UrlBar.vue`*: Categorized as `patch` — wrapped `.method-badge-*` rules in `style.css` inside `@layer components { ... }`.
  - *`RequestTabs.vue` `authBadge` ignoring environment-scoped auth (`auth_envs`)*: Categorized as `patch` — updated `authBadge` to check `req.value.auth_envs?.[envStore.activeEnvId]` before falling back to `req.value.auth?.type`.
  - *`WarningBanner.vue` `dismissed` state not resetting when leaving/re-entering GET+Body state*: Categorized as `patch` — watched `() => [requestStore.current?.id, requestStore.showGetBodyWarning]` to reset `dismissed.value = false`.
- **Part 2 (Implementation Review — Blind Hunter, Edge Case Hunter, Verification Gap):**
  - *`FolderEditor.vue` external sidebar rename sync & `activeFolderId` rename reset*: Categorized as `patch` — added watchers on `folderName` and `collectionStore.activeFolderId`.
  - *Unit test coverage for `renameNode`, `@blur` rename, `WarningBanner` dismiss/re-arm, `auth_envs` badge, disabled params/headers exclusion, `folder-save-btn` toast, and `run-pre-script-btn` error toast*: Categorized as `patch` — added assertions across `RequestEditor.test.ts`, `FolderEditor.test.ts`, and `ScriptEditor.test.ts`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0 (Verified: passed)
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: all test suites pass 100% (Verified: 55/55 test files, 732/732 tests passed)

## Auto Run Result
- **Story ID:** 3
- **Final Status:** done
- **Files Changed:**
  - `projects/frontend/src/style.css`
  - `projects/frontend/src/stores/collectionStore.ts`
  - `projects/frontend/src/stores/requestStore.ts`
  - `projects/frontend/src/composables/useAutoSave.ts`
  - `projects/frontend/src/components/RequestEditor.vue`
  - `projects/frontend/src/components/FolderEditor.vue`
  - `projects/frontend/src/components/UrlBar.vue`
  - `projects/frontend/src/components/WarningBanner.vue`
  - `projects/frontend/src/components/RequestTabs.vue`
  - `projects/frontend/src/components/ScriptEditor.vue`
  - `projects/frontend/src/components/__tests__/RequestEditor.test.ts`
  - `projects/frontend/src/components/__tests__/FolderEditor.test.ts`
  - `projects/frontend/src/components/__tests__/UrlBar.test.ts`
  - `projects/frontend/src/components/__tests__/ScriptEditor.test.ts`
- **Verification Outcome:** Passed (`bun run type-check` exit 0, `bun run test` 55/55 files, 732/732 tests passed)
- **Open Warnings / Deferred Items:** None

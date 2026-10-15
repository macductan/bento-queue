---
title: 'Fix & Enhance 8 UI/Git/JSONC Issues (Request Dirty State, Git Stash/Clear & Branch Push, Sidebar Controls, JSON/JSONC Editor)'
type: 'bugfix'
created: '2026-10-15'
status: 'done'
route: 'dispatch'
baseline_commit: 'ef8cdb4379db0899cd8c5390c2924a60fd498771'
review_loop_iteration: 1
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trong ứng dụng hecto-api hiện tồn tại 8 lỗi và điểm cần cải tiến: (1) chuyển qua lại giữa các request chưa chỉnh sửa bị báo nhầm dot "unsaved changes" do thứ tự đồng bộ `original`/`current` và watcher; (2) đổi Git Remote URL mới chưa có tuỳ chọn xử lý dữ liệu local (Clear local data hoặc Stash & merge); (3) Git Push chưa cho phép chọn local branch; (4) thanh công cụ AppSidebar hiển thị 5 icon rời gây chật chội; (5) khung soạn thảo JSON trong BodyEditor không giãn hết chiều cao panel; (6) gõ dấu ngoặc kép/nhọn trên hệ điều hành bật Smart Quotes bị biến thành ký tự Unicode cong/fullwidth; (7) thông báo lỗi cú pháp JSON hiện khối banner đỏ quá nặng nề; (8) chưa hỗ trợ định dạng và gửi JSONC (JSON có comments và trailing comma).

**Approach:** Khắc phục đồng bộ trạng thái `isDirty`/`saveStatus` trong `requestStore.ts` và `useUrlParamsSync.ts`; bổ sung `ClearAndPull`, `StashAndPull`, `ListLocalBranches`, `Push(..., branch)` ở Go backend (`service/git_sync.go`, `app.go`) cùng giao diện xác nhận và chọn branch trong `GitSyncModal.vue`; gom nhóm nút trên `AppSidebar.vue` thành 2 nút (Git và `+` dropdown); chuẩn hóa chuỗi flex `h-full min-h-0` cho `RequestEditor.vue` → `BodyEditor.vue` → `VariableHighlighter.vue`; thêm `normalizeSmartChars` giữ vị trí con trỏ và tinh chỉnh cảnh báo lỗi JSON sang inline amber trong `BodyEditor.vue`; tích hợp `jsonc-parser` vào `utils/jsonEditor.ts` để hỗ trợ validate/format JSONC (giữ nguyên comment & trailing comma khi format, strip sạch thành pure JSON khi gửi request).

## Boundaries & Constraints

**Always:**
- Tuân thủ kiến trúc Wails v2 (`app.go` chỉ làm thin adapter, toàn bộ nghiệp vụ Git nằm trong `service/git_sync.go`, trả về `model.Result`).
- Giữ tương thích ngược cho `GitPushCollection(collectionID)` bằng cách gọi `GitPushCollectionToBranch(collectionID, "")`.
- Giữ nguyên thuộc tính `data-test="git-config-btn"` trên nút Git ở Sidebar và `data-test="json-error-banner"` trên span báo lỗi JSON mới.
- Giữ nguyên hành vi scroll ngang (`wrap="off"`) của textarea trong `BodyEditor.vue` và phím tắt `Ctrl+N` / `Ctrl+Shift+N`.
- Dùng `bun` với Node 24 (`source ~/.nvm/nvm.sh && nvm use`) cho mọi thao tác package/test frontend.
- Không tự ý chạy `git commit` hay `git push` khi chưa có xác nhận của người dùng.

**Never:**
- Không strip comments/trailing comma khi người dùng nhấn nút "Format JSON" trong editor (Format phải giữ nguyên comments và trailing comma).
- Không gửi comments hoặc trailing comma lên server khi thực thi HTTP request (`bodyType === 'json'`).
- Không làm mất biến môi trường dạng `{{var}}` (cả trong chuỗi lẫn dạng bare value không ngoặc kép) khi validate, format hoặc strip JSONC.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chuyển từ Request A (chưa sửa) sang Request B | Request A đang mở, `isDirty === false`, click chọn Request B | Tab A và Request B đều có `isDirty = false`, `saveStatus = 'saved'`, không hiện chấm cam | Nếu `loadReqSeq` đã tăng do race condition thì bỏ qua kết quả cũ |
| Lưu Git Remote URL mới khác URL cũ | Nhập URL mới khác `activeCollection.git_remote_url` và nhấn "Lưu Remote" | Hiện dialog xác nhận với 2 lựa chọn: "Clear local data" (`GitClearAndPullCollection`) và "Stash & merge" (`GitStashAndPullCollection`) | Nếu `StashAndPull` gặp xung đột khi pull hoặc `stash pop`, trả `ErrGitConflict` kèm danh sách file và hiển thị cảnh báo conflict |
| Lưu Git Remote URL giống URL cũ (hoặc lần đầu chưa có) | URL không đổi so với cấu hình hiện tại (hoặc người dùng chỉ lưu URL giống cũ) | Lưu bình thường qua `SaveCollectionGitRemote`, không hiện confirm dialog Clear/Stash | Hiển thị toast lỗi nếu URL không hợp lệ |
| Chọn branch và thực hiện Git Push | Mở `GitSyncModal`, chọn branch từ `<select>` (mặc định là `gitSyncStatus.branch`), nhấn "↑ Git Push" | Gọi `GitPushCollectionToBranch(collectionID, branch)` đẩy `HEAD:<branch>` lên `origin` với `-u` | Nếu remote từ chối (non-fast-forward), trả `ErrGitConflict` |
| Gõ ký tự Smart Quotes / Fullwidth trong BodyEditor | OS/IME chèn `\u201C`, `\u201D`, `\u2018`, `\u2019`, `\uFF5B`, `\uFF5D`, `\u300C`, `\u300D` | `normalizeSmartChars` chuyển ngay về `"`, `'`, `{`, `}`, `[`, `]` và giữ nguyên vị trí con trỏ `selectionStart`/`selectionEnd` | N/A |
| Validate & Format JSONC có `{{var}}` | Body JSON có `// comment`, `/* block */`, trailing comma và `{{bare_var}}` | Validate trả `{ valid: true, isJsonc: true }`, badge hiện `✓ JSONC`; nhấn Format giữ nguyên comment, trailing comma và `{{bare_var}}`, re-indent 2 spaces | Nếu cú pháp lỗi thật sự, trả `{ valid: false, isJsonc: false, error, line, column }` và hiện inline amber `data-test="json-error-banner"` |
| Gửi Request với Body JSONC | Body (`type === 'json'`) chứa `// comment`, trailing comma (nhiều cấp) và string literal chứa `"http://example.com // not comment"` | `stripJsoncToJson` xóa sạch comment và trailing comma ngoài string literal, bảo toàn nội dung bên trong string literal, gửi pure JSON | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/stores/requestStore.ts` -- Quản lý state `original`, `current`, `isDirty`, `saveStatus`, `loadRequest()`, `stringifySorted()`.
- `projects/frontend/src/composables/useUrlParamsSync.ts` -- Đồng bộ 2 chiều URL và `params`; cần tránh mutate `req.value` gây dirty giả khi vừa load request.
- `projects/frontend/src/stores/tabStore.ts` -- Đồng bộ `isDirty` lên tab qua watcher `_ensureRequestStoreSync()` và `setTabDirty()`.
- `projects/service/git_sync.go` -- Dịch vụ Git backend: thêm `ClearAndPull`, `StashAndPull`, `ListLocalBranches`, cập nhật `Push` hỗ trợ tham số branch (`PushToBranch`).
- `projects/app.go` -- Wails bindings: expose `GitClearAndPullCollection`, `GitStashAndPullCollection`, `GitListLocalBranches`, `GitPushCollectionToBranch` (giữ `GitPushCollection`).
- `projects/frontend/src/stores/collectionStore.ts` -- Actions gọi Wails bindings cho Git (`clearAndPull`, `stashAndPull`, `fetchLocalBranches`, `gitPush(branch?: string, collectionId?: string)`).
- `projects/frontend/src/components/GitSyncModal.vue` -- UI cấu hình Git Remote, confirm dialog Clear/Stash khi đổi URL, dropdown chọn branch khi Push.
- `projects/frontend/src/components/AppSidebar.vue` -- Gom 5 nút thành 2 nút: nút Git (`data-test="git-config-btn"` có badge trạng thái) và nút `+` mở dropdown "📄 New Request" / "📁 New Folder" có clickaway listener.
- `projects/frontend/src/components/RequestEditor.vue` -- Chuỗi flex layout (`flex-1 flex flex-col min-h-0`) bao quanh `BodyEditor`.
- `projects/frontend/src/components/BodyEditor.vue` -- Khung soạn thảo body: flex full height, `autocorrect="off" autocapitalize="off"`, `@input` gọi `normalizeSmartChars`, inline amber error indicator (`data-test="json-error-banner"`), badge `✓ JSONC`.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Wrapper hiển thị syntax highlight + variable pills; đảm bảo `h-full` và slot textarea giãn đầy khung.
- `projects/frontend/src/utils/jsonEditor.ts` -- Các hàm `normalizeSmartChars`, `validateJsonWithPlaceholders`, `prettifyJsonWithPlaceholders`, `stripJsoncToJson` sử dụng `jsonc-parser`.
- `projects/frontend/src/utils/buildExecuteRequest.ts` & `projects/frontend/src/stores/responseStore.ts` -- Pipeline chuẩn bị request trước khi gửi (`SendRequest`) hoặc tạo cURL: áp dụng `stripJsoncToJson` khi `bodyType === 'json'`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/package.json` -- Cài đặt thư viện `jsonc-parser` bằng `bun add jsonc-parser` -- Cung cấp parser/scanner chuẩn cho JSONC.
- [x] `projects/frontend/src/stores/requestStore.ts` & `projects/frontend/src/composables/useUrlParamsSync.ts` -- Chuẩn hóa `original` trong `loadRequest()` trước khi clone sang `current`, reset `current = null` trước khi gán `original` mới và kiểm tra `state.original.id === state.current.id` trong `isDirty` để watcher `{ flush: 'sync' }` của `tabStore` không đánh dấu nhầm tab cũ là dirty; đặt `saveStatus = 'saved'` và gọi `tabStore.setTabDirty('request', this.current.id, false)` có bảo toàn guard `loadReqSeq` -- Khắc phục triệt để Bug 1.
- [x] `projects/service/git_sync.go` & `projects/app.go` -- Cài đặt `ClearAndPull`, `StashAndPull`, `ListLocalBranches` và mở rộng `Push` nhận `branch ...string`; expose các hàm Wails binding tương ứng trong `app.go` và cập nhật file `wailsjs` declarations -- Đáp ứng phần Backend của Bug 2 và Enhancement 3.
- [x] `projects/frontend/src/stores/collectionStore.ts` & `projects/frontend/src/components/GitSyncModal.vue` -- Cập nhật store và modal: khi nhấn "Lưu Remote" với URL khác URL hiện tại thì hiện confirm dialog chọn "Clear local data" hoặc "Stash & merge"; khi mở modal thì tải danh sách local branches vào `<select>` (mặc định là branch hiện tại) và truyền branch khi gọi `gitPush` -- Đáp ứng phần Frontend của Bug 2 và Enhancement 3.
- [x] `projects/frontend/src/components/AppSidebar.vue` -- Thay 5 icon button bằng 2 control: nút Git (`data-test="git-config-btn"`, hiển thị chấm badge đỏ khi `store.gitConflictError` và xanh emerald khi `store.activeCollection?.git_remote_url` đã cấu hình, xóa `git-pull-btn` và `git-push-btn`) và nút `+` mở dropdown "📄 New Request" / "📁 New Folder" kèm xử lý clickaway đóng menu và gỡ listener trong `onUnmounted` -- Đáp ứng Enhancement 4.
- [x] `projects/frontend/src/components/RequestEditor.vue`, `projects/frontend/src/components/BodyEditor.vue` & `projects/frontend/src/components/VariableHighlighter.vue` -- Sửa chuỗi class flex/height (`flex-1 flex flex-col min-h-0`, `h-full`) từ `RequestEditor.vue` xuống `BodyEditor.vue` và `VariableHighlighter.vue` để textarea chiếm trọn chiều rộng/cao của panel mà vẫn giữ `wrap="off"` -- Khắc phục Bug 5.
- [x] `projects/frontend/src/utils/jsonEditor.ts` & `projects/frontend/src/components/BodyEditor.vue` -- Thêm `normalizeSmartChars(el: HTMLTextAreaElement)` thay thế smart quotes/fullwidth brackets (`\u201C`, `\u201D`, `\u2018`, `\u2019`, `\uFF5B`, `\uFF5D`, `\u300C`, `\u300D`) và bảo toàn vị trí con trỏ; gắn `autocorrect="off" autocapitalize="off"` vào textarea; đổi banner lỗi đỏ thành span inline `text-amber-400/70` (`data-test="json-error-banner"`) và viền `border-amber-500/40`; nâng cấp `validateJsonWithPlaceholders`, `prettifyJsonWithPlaceholders`, `stripJsoncToJson` bằng `jsonc-parser` và tích hợp vào `buildExecuteRequest.ts` -- Đáp ứng Bug 6, Bug 7 và Enhancement 8.
- [x] `projects/service/git_sync_test.go`, `projects/frontend/src/utils/__tests__/jsonEditor.test.ts`, `projects/frontend/src/components/__tests__/GitSyncModal.test.ts`, `projects/frontend/src/components/__tests__/RequestEditor.test.ts`, `projects/frontend/src/components/__tests__/ResizableLayout.test.ts`, `projects/frontend/src/stores/__tests__/requestStore.test.ts` -- Cập nhật và bổ sung unit tests bao phủ toàn bộ các kịch bản trong I/O & Edge-Case Matrix -- Đảm bảo chất lượng và không hồi quy.

### Review Findings
- [x] `projects/service/git_sync.go` & `projects/service/git_sync_test.go` -- Sửa `Push` tới local branch khác `HEAD` bằng cách cập nhật ref branch đích (`git branch -f <targetBranch> HEAD`) và dùng `HEAD:refs/heads/<targetBranch>` để auto-commit trên `HEAD` được đẩy lên đúng branch; thêm `--prune` cho `git fetch` và fallback `for-each-ref` trong `resolveTargetRemoteBranch`; xóa sạch dữ liệu tracked local khi `ClearAndPull` từ remote rỗng; bảo toàn local variables/auth của `collection.json` trong `StashAndPull`, kiểm tra `stashErr != nil`, và chạy `rebuildIndex` khi phát sinh conflict.
- [x] `projects/frontend/src/components/GitSyncModal.vue` & `projects/frontend/src/stores/collectionStore.ts` -- Chặn bypass dialog Clear/Stash khi người dùng sửa `remoteUrlInput` rồi bấm thẳng "↓ Git Pull" hoặc "↑ Git Push"; đóng request đang mở nếu request đó bị xóa sau `gitPull` / `gitClearAndPull` / `gitStashAndPull`; sửa điều kiện tương thích ngược của `gitPush(branchOrCollectionId, collectionId)` để tránh nhầm tên branch trùng ID collection.
- [x] `projects/frontend/src/stores/requestStore.ts` & `projects/frontend/src/composables/useUrlParamsSync.ts` -- Trì hoãn việc reset `saveStatus` / `contentTypeAuto` trong `loadRequest` tới sau khi `GetRequest` hoàn tất và kiểm tra `reqSeq === loadReqSeq`; bảo vệ `saveCurrent` bằng `saveSeq === loadReqSeq` để tránh race condition khi chuyển request trong lúc đang lưu; watch cả tham chiếu `() => req.value` trong `useUrlParamsSync.ts`.
- [x] `projects/frontend/src/utils/jsonEditor.ts`, `projects/frontend/src/utils/buildExecuteRequest.ts`, `projects/frontend/src/components/BodyEditor.vue` & `projects/frontend/src/components/AppSidebar.vue` -- Strip JSONC trước khi resolve `{{variables}}` trong `buildExecuteRequest.ts`; hỗ trợ JSONC chỉ chứa comments (`errors.length === 0`); lặp xóa multi-trailing commas trong `stripJsoncToJson`; nhận diện comments trong `tokenizeJsonTextSegment`; bảo toàn `scrollTop`/`scrollLeft` và guard `isComposing` + dùng `:value` thay vì `v-model` trong `BodyEditor.vue`; hỗ trợ phím `Escape` đóng dropdown `+` và hiển thị badge đỏ khi `gitSyncStatus?.has_conflicts` trong `AppSidebar.vue`.
- [x] `projects/frontend/tests/e2e/performance.spec.ts`, `projects/frontend/src/stores/__tests__/requestStore.test.ts` & `projects/frontend/src/components/__tests__/ResizableLayout.test.ts` -- Cập nhật E2E test mở menu `Thêm mới` trước khi chọn `Thư mục mới` / `Request mới`; gắn `useUrlParamsSync` thực tế vào unit test Bug 1; kiểm thử click vào item trong dropdown `+` của `AppSidebar.vue`.

**Acceptance Criteria:**
- Given user mở request A (không sửa gì), when user click sang request B, then không hiển thị "unsaved" dot trên tab A.
- Given remote URL thay đổi, when nhấn "Lưu Remote", then hiện dialog chọn Clear/Stash → thực thi đúng (`GitClearAndPullCollection` hoặc `GitStashAndPullCollection`) → hiện conflict nếu có.
- Given `GitSyncModal` mở, when nhìn vào khu vực Push, then thấy dropdown chọn branch (mặc định là branch hiện tại) và push lên đúng branch đã chọn.
- Given sidebar hiển thị, when quan sát thanh công cụ, then chỉ thấy 2 button (Git + "+"), không còn 5 icon rời; khi click "+" thấy dropdown "📄 New Request" / "📁 New Folder".
- Given body JSON có nhiều dòng, when nhìn vào editor ở tab Body, then editor fill full chiều cao và chiều rộng của panel, không bị clip.
- Given OS bật smart quotes, when gõ `"` hoặc `{` vào textarea, then ký tự ASCII thường xuất hiện và con trỏ giữ đúng vị trí.
- Given JSON body đang có lỗi cú pháp, when nhìn vào BodyEditor, then thấy indicator amber nhỏ inline (`data-test="json-error-banner"`) và border amber nhẹ, không thấy box đỏ to.
- Given JSON body có `// comment` và trailing comma, when nhấn "Format JSON", then editor giữ nguyên comments + trailing comma và re-indent đẹp; badge hiển thị `✓ JSONC`; when nhấn Send, server nhận pure JSON đã strip sạch comments và trailing comma.

## Implementation Notes

- **Bug 1 (`requestStore.ts`)**: Phát hiện nguyên nhân gốc rễ thứ hai ngoài việc chuẩn hóa URL/`_isAuto` header: `tabStore` đăng ký watcher `{ flush: 'sync' }` trên `[reqStore.current.id, ..., reqStore.isDirty]`. Khi `loadRequest('req-b')` gán `this.original = loaded` trong khi `this.current` vẫn đang trỏ tới `req-a`, watcher đồng bộ chạy ngay lập tức và so sánh `original` (`req-b`) với `current` (`req-a`), làm tab `req-a` bị set `isDirty = true`. Đã khắc phục bằng cách: (1) chuẩn hóa `loaded` bằng `normalizeLoadedRequest(loaded)` trước khi gán; (2) kiểm tra `state.original.id !== state.current.id` trong getter `isDirty`; (3) gán `this.current = null` trước khi cập nhật `this.original = loaded` rồi mới gán `this.current = JSON.parse(JSON.stringify(this.original))`, `this.saveStatus = 'saved'`, và `tabStore.setTabDirty('request', this.current.id, false)`.
- **Bug 2 & Enh 3 (`git_sync.go`, `app.go`, `collectionStore.ts`, `GitSyncModal.vue`)**: Bổ sung `ClearAndPull`, `StashAndPull`, `ListLocalBranches`, và mở rộng `Push` nhận tham số `branch`. Trong `StashAndPull`, xử lý tách biệt `collection.json` trước khi `git stash push -u` và khôi phục `GitRemoteURL` + local variables/auth sau khi `pull`/`stash pop` để tránh xung đột giả trên file metadata `collection.json`.
- **Enh 4 (`AppSidebar.vue`)**: Gom 5 nút thành 2 nút (`git-config-btn` có chấm trạng thái đỏ/emerald và `sidebar-add-btn` mở menu dropdown "📄 New Request" / "📁 New Folder" kèm clickaway `mousedown` + `Escape` keydown listener được dọn dẹp trong `onUnmounted`).
- **Bug 5, 6, 7 & Enh 8 (`RequestEditor.vue`, `BodyEditor.vue`, `jsonEditor.ts`, `buildExecuteRequest.ts`)**: Chuẩn hóa chuỗi flex `h-full min-h-0`; thêm `autocorrect="off" autocapitalize="off"` và `normalizeSmartChars(el)` (giữ nguyên vị trí con trỏ + scroll và tôn trọng IME `isComposing`); chuyển cảnh báo lỗi JSON sang `span` inline amber (`text-amber-400/70`, `border-amber-500/40`); tích hợp `jsonc-parser` (dùng numeric token constants và `printParseErrorCode` để tương thích với `isolatedModules` của `vue-tsc`).

## Spec Change Log

## Review Triage Log

### Iteration 1 — 2026-10-15
- **Reviewers spawned**: `blind-hunter` (`5c90180b-f264-4b1e-a32c-69944950e584`), `edge-case-hunter` (`34eeb527-1d7b-4587-b364-bdd8882168ec`), `verification-gap` (`1480b098-c2a2-436b-87f8-562896b6a963`).
- **Accepted as Patch (8 groups, all applied & verified)**:
  1. `Push` tới local branch khác `HEAD` đẩy commit cũ thay vì auto-commit mới → cập nhật `git branch -f <targetBranch> HEAD` và dùng `HEAD:refs/heads/<targetBranch>`.
  2. `ClearAndPull` / `StashAndPull` edge cases (remote rỗng, stale remote refs, mất local variables/auth trong `collection.json`, thiếu `rebuildIndex` khi conflict, thiếu kiểm tra `stashErr`) → đã khắc phục toàn bộ và bổ sung Go unit tests.
  3. `GitSyncModal.vue` bypass dialog Clear/Stash khi sửa URL rồi bấm thẳng Pull/Push; `collectionStore.ts` giữ request đã bị xóa trên UI sau khi pull/clear/stash; `gitPush` nhầm tên branch trùng ID collection → đã khắc phục.
  4. `requestStore.ts` race condition giữa `saveCurrent` và `loadRequest`, hoặc mutate `saveStatus` trước khi `GetRequest` trả về; `useUrlParamsSync.ts` khi load lại cùng request ID → đã khắc phục.
  5. `buildExecuteRequest.ts` biến chứa xuống dòng nằm trong `// comment` thoát khỏi comment; `validateJsonWithPlaceholders` với body chỉ có comment; `stripJsoncToJson` với nhiều dấu phẩy thừa liên tiếp; `tokenizeJsonTextSegment` với comment có dấu ngoặc kép/số → đã khắc phục.
  6. `BodyEditor.vue` + `normalizeSmartChars` mất `scrollTop`/`scrollLeft`, xung đột IME composition (`isComposing`) và double setter do dùng cả `v-model` lẫn `@input` → đã khắc phục.
  7. `AppSidebar.vue` thiếu kiểm tra `store.gitSyncStatus?.has_conflicts` cho chấm đỏ trên nút Git và thiếu đóng menu `+` khi nhấn `Escape` → đã khắc phục.
  8. Cập nhật `tests/e2e/performance.spec.ts` cho dropdown `Thêm mới`, bổ sung `useUrlParamsSync` vào `requestStore.test.ts` và bổ sung test click menu item trong `ResizableLayout.test.ts`.

## Verification

**Commands:**
- `cd /home/dev/mdt/hecto-api/projects && go test ./...` -- expected: exit code 0, toàn bộ Go tests (bao gồm `service/git_sync_test.go`) pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` -- expected: exit code 0, không có lỗi TypeScript.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test --run` -- expected: exit code 0, toàn bộ 42 file test (504 tests) pass 100%.



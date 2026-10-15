---
title: 'Input/Textarea Ctrl+Z Undo/Redo, Custom HTTP Method & Inline Body Type Dropdown'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '967e5d21a648ff78d128da5ed141e769a99ed85a'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/specs/spec-git-sync-and-request-productivity/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-git-sync-and-request-productivity/git-sync-and-request-productivity-architecture.md'
warnings:
  - 'multiple-goals'
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại người dùng đang gặp 3 điểm bất tiện trên trình soạn thảo Request: (1) phím tắt `Ctrl+Z` (Undo) và `Ctrl+Y` / `Ctrl+Shift+Z` (Redo) hoạt động không ổn định trên các ô `<input>` và `<textarea>` được điều khiển bởi Vue / WebKitGTK hoặc khi chèn ký tự bằng JS như phím `Tab` trong `BodyEditor.vue` (CAP-6); (2) dropdown chọn HTTP Method trong `UrlBar.vue` chỉ cố định 5 method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), chưa có `HEAD`, `OPTIONS` và chưa cho phép nhập Custom HTTP Method như `PURGE`, `PROPFIND`, `LINK` (CAP-4); và (3) bộ chọn loại Body (`None`, `JSON`, `Text`) đang chiếm nguyên một dòng riêng bên trong `BodyEditor.vue` thay vì nằm gọn bên phải cùng hàng với thanh `RequestTabs.vue` (CAP-5).

**Approach:** Xây dựng bộ quản lý lịch sử Undo/Redo theo từng phần tử DOM (`projects/frontend/src/utils/inputUndo.ts`) sử dụng `WeakMap` lưu trạng thái `{ value, selectionStart, selectionEnd }`, gắn kết toàn cục tại `App.vue` và tích hợp `recordInputSnapshot` vào `BodyEditor.vue`. Mở rộng danh sách method chuẩn trong `UrlBar.vue` thêm `HEAD`, `OPTIONS` (kèm màu sắc đồng bộ trên `UrlBar.vue`, `TreeNodeRow.vue`, `AppTabBar.vue`) và bổ sung ô nhập Custom HTTP Method ngay trong menu dropdown của `UrlBar.vue`. Đồng thời chuyển bộ chọn loại Body sang dạng dropdown nằm bên phải cùng hàng với các tab trong `RequestTabs.vue` và gỡ bỏ hàng nút radio cũ trong `BodyEditor.vue`.

## Boundaries & Constraints

**Always:**
- Khi nhấn `Ctrl+Z` (hoặc `Cmd+Z` trên macOS) để Undo và `Ctrl+Y` / `Ctrl+Shift+Z` (hoặc `Cmd+Shift+Z`) để Redo trong bất kỳ `<input>` hoặc `<textarea>` nào, phải khôi phục đúng giá trị `value` và vị trí con trỏ (`selectionStart`, `selectionEnd`), đồng thời phát sự kiện `new Event('input', { bubbles: true })` để Vue `v-model`, `VariableHighlighter`, và `useUrlParamsSync` đồng bộ tức thì.
- Chuẩn hóa Custom HTTP Method thành chữ in hoa (`UPPERCASE`) và loại bỏ khoảng trắng / ký tự không thuộc tập HTTP token hợp lệ (`A-Z`, `0-9`, `-`, `_`); khi đổi method trên `UrlBar.vue`, cập nhật đồng bộ `req.value.method`, `AppTabBar.vue` và `TreeNodeRow.vue`.
- Đặt dropdown chọn loại Body (`data-test="body-type-select"`) nằm bên phải cùng hàng với các tab trong `RequestTabs.vue`; khi người dùng chọn loại Body từ dropdown, gọi `requestStore.setBodyType(type)` và tự động kích hoạt tab `Body` (`uiStore.activeRequestTab = 'body'`).
- Mọi kiểm thử tự động chỉ thao tác trên dữ liệu mock hoặc `Test-Collection`, tuyệt đối không đụng chạm dữ liệu thật của người dùng.

**Never:**
- Không giữ lại thanh chọn `role="radiogroup" aria-label="Body type"` chiếm chiều cao riêng bên trong `BodyEditor.vue`.
- Không cho phép gán chuỗi rỗng hoặc chuỗi chỉ chứa khoảng trắng làm HTTP Method của Request.
- Không kích hoạt Undo/Redo của input khi phần tử đang trong quá trình gõ tổ hợp tiếng Việt IME (`isComposing === true`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nhấn `Ctrl+Z` và `Ctrl+Y` / `Ctrl+Shift+Z` trong `<input>` hoặc `<textarea>` (`UrlBar`, `KvpEditor`, `BodyEditor`, `AuthEditor`) | Người dùng gõ `"https://api.test/v1"` rồi sửa thành `"https://api.test/v2"`, sau đó nhấn `Ctrl+Z` rồi `Ctrl+Shift+Z` | Nhấn `Ctrl+Z` khôi phục giá trị `"https://api.test/v1"` vào DOM và model Vue; nhấn `Ctrl+Shift+Z` (hoặc `Ctrl+Y`) làm lại thành `"https://api.test/v2"` | Nếu đã ở đầu/cuối lịch sử Undo/Redo thì giữ nguyên giá trị hiện tại |
| Nhấn `Tab` chèn 2 khoảng trắng trong `BodyEditor.vue` rồi nhấn `Ctrl+Z` | Nội dung body là `"{\n}"`, đặt con trỏ giữa và nhấn `Tab` rồi nhấn `Ctrl+Z` | Nhấn `Tab` chèn 2 khoảng trắng; nhấn `Ctrl+Z` hoàn tác lại đúng chuỗi `"{\n}"` trước khi nhấn `Tab` | Không phát sinh lỗi |
| Chọn `HEAD` / `OPTIONS` hoặc nhập Custom HTTP Method trong `UrlBar.vue` | Mở dropdown Method, gõ `"purge"` vào ô `data-test="custom-method-input"` và nhấn `Enter` (hoặc click `data-test="custom-method-apply"`) | `req.method` cập nhật thành `"PURGE"`, dropdown đóng lại, nút Method trên `UrlBar` và badge trên `AppTabBar` hiển thị `"PURGE"` | Nếu ô custom method rỗng hoặc chỉ chứa ký tự không hợp lệ thì không thay đổi method hiện tại |
| Chọn loại Body từ dropdown trên `RequestTabs.vue` | Đang ở tab `Params` hoặc `Body`, chọn `"json"` từ `<select data-test="body-type-select">` | `requestStore.setBodyType('json')` được thực thi (tự thêm header `Content-Type: application/json`), `uiStore.activeRequestTab` chuyển sang `'body'`, và `BodyEditor.vue` hiển thị khung soạn thảo JSON mà không còn thanh radio cũ | Không phát sinh lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/inputUndo.ts` -- Module mới quản lý ngăn xếp Undo/Redo (`WeakMap<HTMLInputElement | HTMLTextAreaElement, UndoHistory>`) và xử lý sự kiện `focusin`, `input`, `keydown` (`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`).
- `projects/frontend/src/App.vue` -- Cài đặt trình lắng nghe toàn cục `installGlobalInputUndo()` trong `onMounted` / `onUnmounted` (lines 122-140).
- `projects/frontend/src/components/BodyEditor.vue` -- Xóa khối `<div role="radiogroup" aria-label="Body type">` (lines 57-79) và gọi `recordInputSnapshot(el)` trong `handleTab` (lines 39-51) để hỗ trợ Undo sau khi nhấn `Tab`.
- `projects/frontend/src/components/RequestTabs.vue` -- Bổ sung dropdown `<select data-test="body-type-select" aria-label="Body type">` ở bên phải cùng hàng với các tab `Params`, `Auth`, `Headers`, `Body` (lines 43-70).
- `projects/frontend/src/components/UrlBar.vue` -- Mở rộng mảng `methods` thêm `'HEAD'`, `'OPTIONS'` (line 35), bổ sung màu cho `head` / `options` (lines 123-129), và thêm ô input `data-test="custom-method-input"` + nút `data-test="custom-method-apply"` trong listbox dropdown (lines 238-259).
- `projects/frontend/src/components/AppTabBar.vue` -- Bổ sung màu badge cho `head` và `options` trong `methodColors` (lines 6-12).
- `projects/frontend/src/components/TreeNodeRow.vue` -- Bổ sung màu badge cho `head` và `options` trong `methodColors` (lines 141-147) và hiển thị `effectiveMethod` đồng bộ tức thì với `requestStore.current.method`.
- `projects/service/executor.go` -- Mở rộng `ExecutorService.Send` hỗ trợ thực thi `HEAD`, `OPTIONS` và các custom HTTP token methods (`PURGE`, `PROPFIND`,...).

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/utils/inputUndo.ts` -- Tạo bộ quản lý lịch sử Undo/Redo cho `<input>` và `<textarea>` sử dụng `WeakMap`, cung cấp `recordInputSnapshot`, `undoInput`, `redoInput`, và `installGlobalInputUndo` -- Đảm bảo `Ctrl+Z` và `Ctrl+Y` / `Ctrl+Shift+Z` hoạt động ổn định trên mọi ô nhập liệu (CAP-6).
- [x] `projects/frontend/src/App.vue` -- Gắn `installGlobalInputUndo()` khi khởi tạo ứng dụng và dọn dẹp khi unmount -- Kích hoạt Undo/Redo toàn cục cho mọi input/textarea trong ứng dụng (CAP-6).
- [x] `projects/frontend/src/components/UrlBar.vue` -- Thêm `'HEAD'`, `'OPTIONS'` vào danh sách method chuẩn, bổ sung bảng màu tương ứng và thêm ô nhập Custom HTTP Method (`data-test="custom-method-input"`, `data-test="custom-method-apply"`) chuẩn hóa UPPERCASE trong dropdown listbox -- Hỗ trợ chọn nhanh `HEAD`/`OPTIONS` và gõ custom method bất kỳ (CAP-4).
- [x] `projects/frontend/src/components/AppTabBar.vue` -- Bổ sung màu sắc cho method `head` và `options` trong `methodColors` -- Đồng bộ màu hiển thị method badge trên thanh Tab Bar (CAP-4).
- [x] `projects/frontend/src/components/TreeNodeRow.vue` -- Bổ sung màu sắc cho method `head` và `options` trong `methodColors` và tính toán `effectiveMethod` theo `requestStore.current.method` -- Đồng bộ tức thì màu và tên method badge trên cây Sidebar (CAP-4).
- [x] `projects/service/executor.go` -- Thay thế switch cố định 5 method bằng hàm `isValidHTTPMethod(method)` cho phép `HEAD`, `OPTIONS` và các custom HTTP token hợp lệ (`PURGE`, `PROPFIND`,...) -- Đảm bảo Go backend thực thi được các request dùng custom HTTP method (CAP-4).
- [x] `projects/frontend/src/components/RequestTabs.vue` -- Đưa dropdown chọn loại Body (`data-test="body-type-select"`, gồm `None`, `JSON`, `Text`) lên bên phải cùng hàng với các tab Request; khi chọn sẽ gọi `requestStore.setBodyType` và chuyển sang tab `Body` -- Tiết kiệm không gian dọc theo Mục 24 (CAP-5).
- [x] `projects/frontend/src/components/BodyEditor.vue` -- Gỡ bỏ hàng nút radio chọn loại Body ở phía trên và tích hợp `recordInputSnapshot` vào `handleTab` -- Nhường toàn bộ chiều cao cho vùng soạn thảo Body và hỗ trợ Undo khi nhấn `Tab` (CAP-5, CAP-6).
- [x] `projects/frontend/src/utils/__tests__/inputUndo.test.ts` -- Viết unit test kiểm tra lịch sử Undo (`Ctrl+Z` / `Cmd+Z`), Redo (`Ctrl+Y` / `Ctrl+Shift+Z`), `recordInputSnapshot` khi chèn Tab, và bỏ qua khi đang IME composing -- Xác minh CAP-6 và các trường hợp biên trong I/O Matrix.
- [x] `projects/frontend/src/components/__tests__/UrlBar.test.ts` -- Bổ sung unit test cho việc chọn `HEAD`, `OPTIONS` và nhập Custom HTTP Method (`PURGE`, `PROPFIND`) trong `UrlBar.vue` -- Xác minh CAP-4.
- [x] `projects/frontend/src/components/__tests__/RequestEditor.test.ts` -- Cập nhật và bổ sung unit test kiểm tra dropdown chọn loại Body (`data-test="body-type-select"`) nằm trên cùng hàng với `RequestTabs.vue` và không còn thanh radio trong `BodyEditor.vue` -- Xác minh CAP-5.

**Acceptance Criteria:**
- Given người dùng đang nhập liệu trong bất kỳ ô `<input>` hoặc `<textarea>` nào (`UrlBar`, `KvpEditor`, `BodyEditor`, `AuthEditor`), when người dùng gõ văn bản mới (hoặc nhấn `Tab` trong `BodyEditor`) rồi nhấn `Ctrl+Z` và sau đó nhấn `Ctrl+Shift+Z` (hoặc `Ctrl+Y`), then giá trị ô nhập liệu và model Vue được hoàn tác về trạng thái trước đó rồi làm lại chính xác.
- Given người dùng mở dropdown chọn Method trên `UrlBar.vue`, when người dùng chọn `HEAD`/`OPTIONS` hoặc nhập `"purge"` vào ô `data-test="custom-method-input"` và nhấn `Enter`, then `req.method` chuyển thành `"HEAD"`/`"OPTIONS"`/`"PURGE"` và hiển thị đồng bộ trên `UrlBar`, `AppTabBar` và `TreeNodeRow`.
- Given người dùng đang xem `RequestEditor.vue`, when quan sát thanh `RequestTabs.vue` và chọn `"json"` từ dropdown `data-test="body-type-select"` nằm ở bên phải cùng hàng tab, then `requestStore.setBodyType('json')` được kích hoạt, tab `Body` mở ra với khung soạn thảo chiếm toàn bộ chiều cao (không còn thanh radio riêng bên trong `BodyEditor.vue`).

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 3 findings — high 1, medium 2, low 0, false 0, maybe-false 0
- findings:
  - `[high]` `[patch]` `projects/service/executor.go:58-64` hardcoded switch only accepted `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, rejecting `HEAD`, `OPTIONS` and custom HTTP methods (`PURGE`, `PROPFIND`) with `ErrMethodInvalid` when sending a request — Patched `ExecutorService.Send` to validate via `isValidHTTPMethod` (`A-Z`, `0-9`, `-`, `_`, max 32 chars) and added `TestExecutorService_Send_CustomMethods` in `projects/service/executor_test.go`.
  - `[medium]` `[patch]` `projects/frontend/src/components/TreeNodeRow.vue:150-215` displayed `props.node.method` from the last saved tree snapshot rather than the live `requestStore.current.method`, delaying Sidebar badge updates until auto-save completed — Added `effectiveMethod` computed property in `TreeNodeRow.vue` and changed `w-9` to `min-w-9` to accommodate longer method names like `OPTIONS` / `PROPFIND`.
  - `[medium]` `[patch]` Verification gap: custom HTTP method execution at `ExecutorService.Send` was unverified — Added `TestExecutorService_Send_CustomMethods` in `projects/service/executor_test.go` verifying `HEAD`, `OPTIONS`, `PURGE`, and `PROPFIND`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0, không có lỗi TypeScript.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: exit code 0, 100% test suites vượt qua.
- `cd projects && go test ./...` -- expected: exit code 0, 100% Go backend tests vượt qua.

## Auto Run Result

- **Summary of implemented change:** Đã triển khai bộ quản lý lịch sử Undo/Redo toàn cục (`inputUndo.ts`) cho mọi `<input>` và `<textarea>` (hỗ trợ `Ctrl+Z` / `Cmd+Z` và `Ctrl+Y` / `Ctrl+Shift+Z`, tích hợp snapshot khi nhấn `Tab` trong `BodyEditor.vue`), mở rộng `UrlBar.vue` và `ExecutorService.Send` hỗ trợ `HEAD`, `OPTIONS` cùng bất kỳ Custom HTTP Method nào (`PURGE`, `PROPFIND`,...), đồng bộ màu sắc/nhãn trên `AppTabBar.vue` + `TreeNodeRow.vue`, và đưa dropdown chọn loại Body (`data-test="body-type-select"`) lên cùng hàng bên phải của `RequestTabs.vue`.
- **Files changed:**
  - `projects/frontend/src/utils/inputUndo.ts` — Bộ quản lý ngăn xếp Undo/Redo cho `<input>` và `<textarea>` bằng `WeakMap`.
  - `projects/frontend/src/App.vue` — Cài đặt `installGlobalInputUndo(window)` khi khởi chạy ứng dụng.
  - `projects/frontend/src/components/UrlBar.vue` — Bổ sung `HEAD`, `OPTIONS` và ô nhập Custom HTTP Method (`data-test="custom-method-input"`, `data-test="custom-method-apply"`).
  - `projects/frontend/src/components/AppTabBar.vue` — Bổ sung màu badge cho `HEAD` và `OPTIONS`.
  - `projects/frontend/src/components/TreeNodeRow.vue` — Bổ sung màu badge cho `HEAD`, `OPTIONS` và hiển thị `effectiveMethod` theo thời gian thực.
  - `projects/frontend/src/components/RequestTabs.vue` — Đưa dropdown chọn loại Body (`data-test="body-type-select"`) lên bên phải cùng hàng với các tab.
  - `projects/frontend/src/components/BodyEditor.vue` — Gỡ bỏ thanh radio chọn loại Body và ghi nhận snapshot Undo khi nhấn `Tab`.
  - `projects/service/executor.go` — Cho phép thực thi `HEAD`, `OPTIONS` và các custom HTTP method hợp lệ qua `isValidHTTPMethod`.
  - `projects/service/executor_test.go` — Bổ sung `TestExecutorService_Send_CustomMethods`.
  - `projects/frontend/src/utils/__tests__/inputUndo.test.ts` — Unit test cho Undo/Redo, Tab snapshot, và IME composition.
  - `projects/frontend/src/components/__tests__/UrlBar.test.ts` — Unit test cho `HEAD`, `OPTIONS` và Custom HTTP Method.
  - `projects/frontend/src/components/__tests__/RequestEditor.test.ts` — Unit test cho dropdown Body Type trên `RequestTabs.vue` và `BodyEditor.vue`.
- **Review findings breakdown:**
  - Patches applied: 2 nhóm (`high`: 1, `medium`: 2).
  - Items deferred: 0.
  - Rejected findings: 0.
- **Follow-up review recommendation:** `true` (do có 1 finding `high` được vá trong `executor.go`).
- **Verification performed:**
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -> Pass (exit code 0).
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -> Pass (35 test files, 441 tests passed).
  - `cd projects && go test ./...` -> Pass (exit code 0).
- **Residual risks:** Không còn rủi ro chặn.

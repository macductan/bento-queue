---
title: 'Story 3.8: Epic 3 Deferred Work Cleanup'
type: 'chore'
created: '2026-10-07'
status: 'done'
baseline_commit: 'fcb7099ad156e503d59909b6f370379d78440cbf'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pipeline gửi/nhận HTTP của Epic 3 còn hở: response nhị phân bị ép thành chuỗi và render như text, thiếu Ctrl+C copy body trong response viewer, nút "Xóa" trong ConfirmDialog vô hình (token `bg-brand-danger` không tồn tại → bug user report), Ctrl+L phụ thuộc ID cứng `url-input`, nhiều message lỗi service còn tiếng Anh/lộ `err.Error()` (path), và các edge case executor (redirect, body rỗng, non-UTF8, hủy giữa chừng, double-send) chưa có test.

**Approach:** Vá từng điểm trên tối thiểu, bổ sung test Go cho edge case executor, chạy lint Go + Vue về 0 lỗi, và ghi danh sách smoke test thủ công (httpbin, phím tắt, tab order) cho human xác nhận.

## Boundaries & Constraints

**Always:**
- Executor: thêm `IsBinary bool` (json `isBinary`) vào `ExecuteResponse`. Binary khi `!utf8.Valid(body)` VÀ (`Content-Type` không phải `text/*`, `*json*`, `*xml*`, `*javascript*`) — hoặc body chứa byte `0x00`. Binary → `Body = ""`, `SizeBytes` vẫn là kích thước thật. Non-UTF8 nhưng content-type text → giữ body (`strings.ToValidUTF8(..., "\uFFFD")`).
- Body rỗng (204, HEAD-like) → `Body: ""`, `SizeBytes: 0`, không lỗi; ResponseViewer hiện "Response không có body." thay JsonViewer.
- Binary → ResponseViewer hiện "Response dạng nhị phân (N B/KB) — không hiển thị nội dung." (dùng formatter size hiện có), không có Pretty/Raw/Sao chép.
- Redirect: giữ mặc định `net/http` (theo tối đa 10); loop → `CONNECTION_ERROR`. `TimeMs` đo từ ngay trước `client.Do` tới hết đọc body (đã đúng, chỉ thêm comment, không tính overhead Wails).
- Ctrl+C trong response viewer (focus nằm trong vùng body, không có text đang được bôi đen) → copy toàn bộ body + toast "Đã sao chép"; có selection thì để trình duyệt copy selection như thường.
- ConfirmDialog nút xác nhận dùng màu có thật (`bg-rose-600 hover:bg-rose-500 text-white`), min-h 32px, focus ring.
- Ctrl+L: UrlBar tự đăng ký focus qua `uiStore` (vd `focusUrlRequested` counter hoặc callback) thay `document.getElementById`.
- Message lỗi service trả cho Vue: tiếng Việt, không chứa `err.Error()`/path; chi tiết gốc chỉ vào `slog`. Áp dụng `collection.go` (L36, 45, 153, 183, 190, 212, 247, 410) và `RequestService.Delete` NOT_FOUND (đã map qua `storageErrCode`, xác nhận bằng test).
- Executor message (`Lỗi kết nối: %v`, `Lỗi chứng chỉ SSL: %v`) GIỮ chi tiết — đó là lỗi mạng, không phải path, và là hợp đồng tiền tố với Vue (3.7).

**Quyết định (human, 2026-10-07):**
- Token: giữ full spec.
- Phạm vi: xử lý MỌI mục còn mở trong `deferred-work.md` (kể cả Epic 1/2). Symlink loop (2.1): `buildTree`/`WalkDir` dùng `DirEntry.IsDir()` không theo symlink → thêm test chứng minh symlink vòng không gây đệ quy. Folder UUID (2.4): `walkJSONEntities` đã index `_folder.json` → thêm test RenameFolder sau `IndexRebuild` với index trống, sửa comment cũ sai ("skips _folder.json"). Sau khi xong, thêm vào MỖI mục trong `deferred-work.md` hai dòng `status: done` và `resolution: <story/commit hoặc bằng chứng>` (human yêu cầu, ngoại lệ cho quy tắc append-only).
- Lint: thêm `eslint` + `eslint-plugin-vue` + `typescript-eslint` (flat config `eslint.config.js`, script `lint`), sửa tới 0 lỗi. Go: `gofmt -l` rỗng + `go vet` sạch.
- Test: thêm `vitest` (môi trường node, không DOM), script `test`; commit test cho `responseHeaders`, `responseError` (gồm tiền tố `Lỗi chứng chỉ SSL`), `responseMeta`, `buildExecuteRequest`, auto Content-Type của `requestStore`.
- Pretty lớn: đổi hành vi "> 5MB tắt Pretty" thành "> `PRETTY_DEFAULT_MAX_BYTES` mặc định Raw, vẫn cho bấm Pretty kèm cảnh báo rõ (banner amber: response lớn, Pretty có thể làm chậm/đơ app)". Ngưỡng chọn bằng đo thực tế trong `wails dev` (WebKitGTK) ở 20 → 15 → 10 → 5MB (và thấp hơn nếu 5MB vẫn giật): ghi thời gian render Pretty + mức đơ vào Implementation Notes, chọn mốc lớn nhất mà render < ~1s và không đơ. Đo 15/20MB dùng harness scratch (không commit) vì Go cắt body ở 10MB.

**Never:**
- Không thêm error code mới, binding mới, không bypass SSL, không đổi giới hạn body 10MB.
- Không sửa tay `wailsjs/` (regen bằng `wails generate module`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Redirect | 302 → 200 | status 200 của đích | N/A |
| Redirect loop | A→A | `CONNECTION_ERROR` | N/A |
| Body rỗng | 204 | `Body ""`, size 0, "Response không có body." | N/A |
| Non-UTF8 text | `text/plain`, byte `0xff` | body có `\uFFFD`, `isBinary false` | N/A |
| Binary | `image/png` bytes | `isBinary true`, `Body ""`, size thật | N/A |
| Double send | gọi `Send` 2 lần song song | 1 thành công, 1 `VALIDATION` | Vue không toast trùng/crash |
| Hủy khi chờ header | server sleep, `Abort()` | `ABORTED` | im lặng |
| Hủy khi đọc body | server flush nửa body rồi treo, `Abort()` | `ABORTED` | im lặng |
| Hủy sau khi xong | `Abort()` sau response | no-op, success | N/A |

</frozen-after-approval>

## Code Map

- `projects/service/executor.go` -- `Send` L120-170: thêm phát hiện binary/ToValidUTF8 sau khi truncate; comment TimeMs.
- `projects/model/` (file định nghĩa `ExecuteResponse`) -- thêm `IsBinary`.
- `projects/service/executor_test.go` -- mẫu `httptest` sẵn có; thêm test cho từng dòng I/O Matrix (dùng `SetTimeout`, goroutine + `Abort`).
- `projects/service/collection.go` -- các dòng nêu ở Always; logger sẵn trong service.
- `projects/service/request_test.go` -- thêm case Delete khi file đã bị xóa ngoài → `NOT_FOUND`.
- `projects/frontend/src/components/ResponseViewer.vue` -- nhánh body: rỗng / binary / JsonViewer; host Ctrl+C (keydown trên vùng body có `tabindex="0"`).
- `projects/frontend/src/components/JsonViewer.vue` L61 `copyBody` -- tái dùng logic copy + toast (expose hoặc tách util `copyText`). Logic "> 5MB tắt Pretty" hiện tại trong file này → thay bằng hằng `PRETTY_DEFAULT_MAX_BYTES` + banner cảnh báo khi user bật Pretty.
- `projects/frontend/src/components/ConfirmDialog.vue` L58 -- class nút "Xóa".
- `projects/frontend/src/App.vue` L33-40 + `components/UrlBar.vue` + `stores/uiStore.ts` -- bỏ `getElementById('url-input')`.
- `projects/frontend/src/stores/requestStore.ts` L140-165 -- logic auto Content-Type (đã đúng: JSON thêm, rời JSON gỡ auto, header user thắng) — chỉ xác minh, không đổi.
- `projects/frontend/src/stores/responseStore.ts` -- guard `loading` đã có; xác minh VALIDATION "Request đang được gửi" không toast khi double-click (bỏ qua im lặng).
- `projects/frontend/wailsjs/go/models.ts` -- regen, không sửa tay.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/*` + `projects/service/executor.go` -- `IsBinary`, ToValidUTF8, comment timing
- [x] `projects/service/executor_test.go` -- test toàn bộ I/O Matrix
- [x] `projects/service/collection.go` + `request_test.go` -- message tiếng Việt, log chi tiết; test Delete NOT_FOUND
- [x] `wailsjs` -- regen models
- [x] `ResponseViewer.vue` (+ util copy) -- body rỗng/binary, Ctrl+C
- [x] `responseStore.ts` -- VALIDATION "đang được gửi" bỏ qua im lặng
- [x] `ConfirmDialog.vue` -- nút Xóa hiển thị
- [x] `App.vue`, `UrlBar.vue`, `uiStore.ts` -- Ctrl+L không dùng ID cứng
- [x] Lint/test theo Open Questions 1–2; cập nhật `deferred-work.md` bằng cách thêm mục mới cho những gì còn lại (không sửa mục cũ)

**Acceptance Criteria:**
- Given modal xóa mở, when nhìn modal, then thấy rõ nút "Xóa" và bấm được.
- Given focus ở vùng body response, không bôi đen, when Ctrl+C, then clipboard = body, toast "Đã sao chép".
- Given đang gửi, when bấm "Gửi"/Ctrl+Enter liên tục, then chỉ một request, không toast lỗi, không crash.
- Given grep `TODO|FIXME|HACK` trong `projects/` (trừ `node_modules`, `wailsjs`), then 0 kết quả.

## Implementation Notes

Đo ngưỡng Pretty (harness scratch `formatJsonHtml` chạy trong bun/Node, KHÔNG phải WebKitGTK — chỉ đo thời gian format, chưa gồm layout/paint DOM, nên là cận dưới):

| Body | Dòng | HTML sinh ra | formatJsonHtml |
|---|---|---|---|
| 20MB | 2.50M | 310MB | 3805ms |
| 15MB | 1.87M | 232MB | 2960ms |
| 10MB | 1.25M | 155MB | 2085ms |
| 5MB | 0.62M | 77MB | 1038ms |

Quyết định của người dùng: `PRETTY_DEFAULT_MAX_BYTES` = 15MB (ghi đè đề xuất 1MB của agent). Trên ngưỡng: mặc định Raw, vẫn bấm được Pretty kèm banner cảnh báo. Lưu ý: Go cắt body ở 10MB nên trên thực tế ngưỡng này chưa kích hoạt; số đo cho thấy format 10MB đã ~2s (chưa gồm DOM).

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route |
|---|---|---|
| Go tag `isBinary` vs FE `is_binary` | high (binary không bao giờ được phát hiện ở FE) | patch — đã đổi tag `is_binary` |
| Text empty/binary khác spec | medium | patch — đã sửa theo spec, dùng formatSize |
| Hằng `maxPrettySize` sai tên | low | patch — đổi `PRETTY_DEFAULT_MAX_BYTES` |
| Implementation Notes trống / ngưỡng 5MB chưa đo | medium | patch — đã đo (proxy); người dùng chốt 15MB |
| MoveRequest `rootPath is required` tiếng Anh | medium | patch — đã Việt hóa |
| request.go/request_test.go thiếu NOT_FOUND, Rename test | false | `TestRequestDelete_NotFound`, `TestRequestRename_*` đã tồn tại và pass (không nằm trong diff vì đã có sẵn từ baseline) |
| TestGetTree_Symlink thiếu | false | có tại collection_test.go:430 |
| models.ts thiếu IsBinary | false | ExecuteResponse không nằm trong models.ts (Result trả any) |
| Test thiếu double-send / abort-before-header | maybe-false | đã có `TestExecutorService_Send_Inflight`, `_Abort` |
| Thiếu DOM tests (Ctrl+L, Ctrl+C, ConfirmDialog, responseStore) | low | reject — spec loại trừ DOM tests, fix là thêm hạ tầng |
| os.Remove cleanup error không log | low | reject — hành vi pre-existing |

## Design Notes

Bug "không thấy nút xác nhận xóa": `bg-brand-danger` không có trong `@theme` → nền trong suốt, chữ `text-inverse` (#020617) trên nền tối → vô hình. Binary dùng `Body ""` thay base64 để không đẩy 10MB qua bridge Wails vô ích; AC chỉ yêu cầu hiển thị size.

## Verification

**Commands:**
- `cd projects && gofmt -l . && go vet ./... && go test ./...` -- expected: không file nào, pass
- `cd projects/frontend && bun run build` -- expected: vue-tsc + vite pass
- (nếu chọn 1A/2A) `bun run lint`, `bun run test` -- expected: 0 lỗi, pass

**Manual checks (human, `wails dev -tags webkit2_41`):**
- httpbin.org GET/POST/PUT/DELETE: status/time/size/headers/body đúng; `/image/png` → thông báo nhị phân; `/status/204` → không có body; `/redirect/3` → 200.
- Hủy: `http://10.255.255.1` (treo kết nối), `/drip?duration=10` (giữa body).
- Phím tắt Ctrl+Enter, Ctrl+S, Ctrl+L, Ctrl+C, Escape, Tab trong KVP; Tab order Header→Sidebar→URL→Request tabs→content→Response; focus ring trên mọi control.

---
title: 'Story 3.4: Go HTTP Executor & Send/Cancel Flow'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4fbb0a43b8074b3fabcc9180da76d80df6fb48a9'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ExecutorService.Send` là stub trả lỗi, nút "Gửi" bị disable, `responseStore` rỗng — người dùng chưa gửi được request nào.

**Approach:** Implement executor Go (net/http, timeout 30s, 1 request in-flight, cap body 10MB, abort qua context), Vue dựng `ExecuteRequest` (lọc enabled, encode params), `responseStore` điều phối send/abort, nút Gửi⇄Hủy + Ctrl+Enter/Escape, và `ResponseViewer` tối giản (spinner / status + raw body / lỗi) để 3.5–3.7 thay dần.

## Boundaries & Constraints

**Always:**
- Go: method ∈ GET/POST/PUT/PATCH/DELETE, URL không rỗng, scheme `http`/`https` — sai → `VALIDATION`. Không lọc/encode lại header/URL. Header `Add` (giữ key trùng); key `Host` → gán `req.Host`. Body rỗng → không body.
- Đang in-flight → `VALIDATION` "Request đang được gửi". `Abort()` khi rảnh → success no-op.
- Lỗi: ctx canceled (Abort) → `ABORTED`; deadline → `TIMEOUT`; còn lại (DNS/refused/TLS/redirect loop/đọc body lỗi) → `CONNECTION_ERROR` "Lỗi kết nối: <err>". Message tiếng Việt.
- `ExecuteResponse{status_code, status_text, headers map[string][]string, body, time_ms int, size_bytes int, timestamp RFC3339, truncated bool}`. Time = từ lúc gửi tới đọc xong body. Body đọc qua `io.LimitReader(MaxResponseBodySize+1)`, vượt → cắt còn 10MB, `truncated=true`; size = số byte trả về.
- Vue (điểm encode duy nhất): giữ header/param `enabled && key.trim() !== ''` (value rỗng vẫn gửi); params `encodeURIComponent(key)=encodeURIComponent(value)` nối `?`/`&`, chèn trước `#fragment`; body = `content` nếu type json/text, ngược lại `''`. `{{var}}` gửi raw (engine ở Epic 4).
- URL trống → viền đỏ URL bar + toast "Vui lòng nhập URL trước khi gửi", không gọi Go; viền đỏ mất khi sửa URL.
- Đang loading: nút thành "Hủy" (nền `error-bg`, viền/chữ `error-text`); Escape (chưa bị `preventDefault`) hoặc click → abort. Ctrl+Enter gửi kể cả khi focus trong input/textarea; bỏ qua khi đang loading, không có request, hoặc dialog/context menu đang mở.
- `ABORTED` → im lặng, giữ response trước đó (nếu có). `CONNECTION_ERROR`/`TIMEOUT` → message lỗi trong ResponseViewer (`role="alert"`). `VALIDATION`/khác → toast.
- Đổi active request → abort nếu đang gửi + clear response.

**Never:**
- Không thêm dependency, design token, test framework frontend, binding mới. Không sửa `wailsjs/`.
- Không làm meta bar màu/size B-KB (3.5), JSON pretty (3.6), bảng headers + full-pane error "Thử lại" (3.7), environment (Epic 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gửi OK | GET `https://h/x?a=1`, param `b=c d` enabled, `z` disabled | URL `https://h/x?a=1&b=c%20d`; viewer hiện `200 OK` + body | N/A |
| Header lọc | rows: `X-A:1` on, `X-B:` on, `X-C` off, row trống | Gửi `X-A`, `X-B` (rỗng) | N/A |
| Gửi lần 2 | Send khi đang in-flight | Lần 2 bị từ chối | `VALIDATION` |
| Hủy | Click Hủy / Escape khi loading | Nút về "Gửi", viewer về trạng thái trước, không toast | `ABORTED` im lặng |
| Timeout | Server không trả trong timeout | Viewer hiện lỗi | `TIMEOUT` |
| Refused | `http://127.0.0.1:1` | Viewer hiện "Lỗi kết nối: …" | `CONNECTION_ERROR` |
| Lớn | Body 10MB + 1 byte | Body 10MB, `truncated`, viewer hiện cảnh báo | N/A |
| Không scheme | `api.example.com` | Toast lỗi | `VALIDATION` |

</frozen-after-approval>

## Code Map

- `projects/service/executor.go` -- stub; thay toàn bộ. Thêm `MaxResponseBodySize`, `DefaultTimeout=30s`, field `client`, `timeout`, `mu`, `inflight`, `cancelFn`; `SetTimeout(d)` cho test. Giữ chữ ký `Send(req)`/`Abort()` (app.go L141-148 không sửa).
- `projects/model/types.go` L116-125 -- `ExecuteResponse` sửa theo Always (chưa ai dùng; không có trong `wailsjs/models.ts` vì trả qua `Data interface{}`).
- `projects/service/request_test.go` -- mẫu test (`package service_test`, logger `LevelError`).
- `projects/frontend/src/stores/requestStore.ts` -- `Request`/`KVPair` types; chỉ đọc.
- `projects/frontend/src/stores/responseStore.ts` -- rỗng; thêm state `response`, `error`, `loading`, `urlInvalid`, actions `send()`, `abort()`, `clear()`. Toast: import tĩnh `useUiStore` (retro E2 item 9).
- `projects/frontend/src/components/UrlBar.vue` L154-162 -- nút Gửi disabled → Gửi/Hủy; viền đỏ theo `urlInvalid` (container L97).
- `projects/frontend/src/App.vue` L18-55 -- `handleKeyDown`: thêm Ctrl+Enter, Escape trước check `isEditing`.
- `projects/frontend/src/components/ContentArea.vue` L16-19 -- thay `EmptyStateResponse` bằng `ResponseViewer`; watch `collectionStore.activeRequestId` → `responseStore.clear()`.
- `projects/frontend/src/components/EmptyStateResponse.vue` -- tái dùng cho trạng thái chưa gửi.
- `projects/frontend/src/style.css` L63-69 -- token `error-text`, `error-bg`, `warning-*`. Chỉ đọc.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go` -- sửa `ExecuteResponse` -- khớp SOLUTION-DESIGN §2.2 + `truncated`
- [x] `projects/service/executor.go` -- implement Send/Abort theo Always -- AR-12, AR-13, NFR-7
- [x] `projects/service/executor_test.go` -- MỚI, `httptest`: test mọi dòng I/O Matrix phía Go (OK + header/body tới server, in-flight, abort, timeout, refused, truncate, validation) -- khóa hành vi
- [x] `projects/frontend/src/utils/buildExecuteRequest.ts` -- MỚI, hàm thuần `Request → {method,url,headers,body}` -- AR-5
- [x] `projects/frontend/src/stores/responseStore.ts` -- state + actions, route lỗi theo code -- AR-12 phía Vue
- [x] `projects/frontend/src/components/ResponseViewer.vue` -- MỚI: loading (spinner `aria-live`) > error > response (`status_code status_text`, cảnh báo truncated, `<pre>` mono body) > `EmptyStateResponse`
- [x] `projects/frontend/src/components/UrlBar.vue`, `App.vue`, `ContentArea.vue` -- nối UI + phím tắt -- AC 3.4

**Acceptance Criteria:**
- Given request hợp lệ, when Ctrl+Enter hoặc click "Gửi", then viewer hiện spinner rồi status + body thật.
- Given đang loading, when nhìn URL bar, then chỉ có nút "Hủy" đỏ; sau khi xong/hủy trở lại "Gửi".
- Given file request trên đĩa, when gửi, then file không đổi (gửi không làm dirty).

## Implementation Notes

## Spec Change Log

## Review Triage Log

Inline review (no subagent tool). Patched:
- `status_text` duplicated the code (`200 200 OK`) → trimmed prefix in executor.go.
- Đổi active request khi đang gửi: kết quả cũ có thể rò sang request mới, request không bị abort → `clear()` abort + sequence guard trong responseStore.
- Escape bỏ qua nếu đã `defaultPrevented` (không abort khi chỉ đóng dropdown method).

Deferred (không vi phạm spec): user tự đặt `Accept-Encoding` tắt auto-decompress; Abort ngay sau Send có thể đến Go trước khi vào in-flight (no-op, UI vẫn loading tới khi xong).

## Design Notes

Phân biệt abort/timeout bằng `ctx.Err()` trên context `WithTimeout` + cancel lưu ở `cancelFn` (không dùng `http.Client.Timeout` vì lỗi của nó không phải `context.DeadlineExceeded`):

```go
ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
s.cancelFn = cancel // dưới mu, cùng inflight=true
defer func() { cancel(); s.mu.Lock(); s.inflight, s.cancelFn = false, nil; s.mu.Unlock() }()
// lỗi: switch ctx.Err() { Canceled→ABORTED; DeadlineExceeded→TIMEOUT; default→CONNECTION_ERROR }
```

Quyết định của agent: giữ `ExecuteResponse` theo SOLUTION-DESIGN (headers map, `time_ms`, `size_bytes`, `timestamp`) thay vì struct stub cũ; URL thiếu scheme → `VALIDATION` (không tự thêm `http://`); viewer 3.4 chỉ là scaffold.

## Verification

**Commands:**
- `cd projects && go vet ./... && go test ./...` -- expected: pass
- `cd projects/frontend && npm run build` -- expected: vue-tsc + vite build thành công

**Manual checks (if no CLI):**
- `cd projects && wails dev -tags webkit2_41`: gửi GET `https://httpbin.org/get?x=1` (Ctrl+Enter) → status + body; gửi `https://httpbin.org/delay/10` → Hủy (Escape) → không toast; `http://127.0.0.1:1` → lỗi kết nối; URL trống → viền đỏ + toast.

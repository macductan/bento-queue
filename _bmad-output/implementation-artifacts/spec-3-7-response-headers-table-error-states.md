---
title: 'Story 3.7: Response Headers Table & Error States'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_commit: '4f6f591d924cc51abdcdb1a04fdb36e68e799655'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Response pane chỉ có body, không xem được response headers; mọi lỗi kết nối/timeout/SSL hiện chung một hộp đỏ "Lỗi" với message thô, không có cách gửi lại nhanh.

**Approach:** Thêm tab bar Body / Headers (badge) trong response pane và component `HeadersTable`; thay hộp lỗi bằng `ResponseErrorState` full-pane phân loại connection / timeout / SSL (icon + tiêu đề + gợi ý + chi tiết + nút "Thử lại"). Go executor nhận diện lỗi TLS/chứng chỉ và trả message có tiền tố cố định để Vue chọn biến thể SSL.

## Boundaries & Constraints

**Always:**
- Tab bar: "Body" | "Headers" + badge số dòng header (ẩn khi 0); `role="tablist"/"tab"`, `aria-selected`; active `border-b-2` emerald + chữ emerald, inactive `text-secondary`, cao 40px. Tab chọn được giữ qua các lần gửi (state nằm trong `ResponseViewer`, mặc định Body). Cảnh báo truncated chỉ hiện trong tab Body.
- HeadersTable: mỗi value của `headers[key]` là một dòng (vd nhiều `Set-Cookie`); sắp theo key không phân biệt hoa thường, giữ thứ tự value. Cột Key `w-1/3 mono-sm text-slate-300`, Value `w-2/3 mono-sm text-slate-400 break-all`; hover dòng → key `text-blue-300` có `transition-colors`; ngăn dòng `border-b border-border-subtle`; vùng tự cuộn dọc. Không có header → "Không có header nào." (`ui-sm text-text-muted`).
- `responseStore.error` đổi thành `{ code: string; message: string } | null`. `CONNECTION_ERROR`/`TIMEOUT` → error state; exception ném từ binding → `{ code: 'UNKNOWN', message: String(err) }` → error state chung. `ABORTED` im lặng, `VALIDATION`/khác → toast như cũ.
- Biến thể error state (icon Phosphor inline 48px, viewBox 256, `fill="currentColor"`, `aria-hidden`; tiêu đề `heading-sm`; gợi ý `ui-sm text-text-muted`; chi tiết = message từ Go, `mono-sm text-text-muted break-all`):
  - connection: wifi-slash, "Không thể kết nối tới server", "Kiểm tra URL hoặc kết nối mạng".
  - SSL (code `CONNECTION_ERROR` và message bắt đầu bằng `Lỗi chứng chỉ SSL`): shield-warning, "Lỗi chứng chỉ SSL", "Kiểm tra chứng chỉ của server hoặc dùng HTTP cho môi trường local".
  - timeout: clock, "Request đã hết thời gian chờ (timeout)", "Server không phản hồi trong 30 giây".
  - unknown: warning-circle, "Đã xảy ra lỗi", không có gợi ý.
- Mọi biến thể có nút "Thử lại" outlined (viền `border-default`, nền trong suốt, hover `surface-hover`, min-h 32px, focus ring) gọi `responseStore.send()`. Container `role="alert"`.
- Go: lỗi từ `client.Do` (không phải canceled/deadline) mà `errors.As` khớp `*tls.CertificateVerificationError`, `x509.UnknownAuthorityError`, `x509.HostnameError`, `x509.CertificateInvalidError`, `tls.RecordHeaderError` hoặc `tls.AlertError` → giữ code `CONNECTION_ERROR`, message `Lỗi chứng chỉ SSL: <err>`. Lỗi khác giữ nguyên.
- URL rỗng/chỉ khoảng trắng: viền đỏ (đã có) + toast đúng "Vui lòng nhập URL", không gọi Go.

**Never:**
- Không thêm error code mới (kiến trúc cố định 7 code), dependency, test framework frontend, binding mới; không bypass SSL.
- Không sửa `wailsjs/` (sinh tự động), `JsonViewer`, `ResponseMetaBar`; không thêm phím tắt.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Headers đa giá trị | `{"Set-Cookie":["a=1","b=2"],"content-type":["x"]}` | 3 dòng: `content-type`, `Set-Cookie` ×2 (đúng thứ tự); badge 3 | N/A |
| Headers rỗng | `{}` | Badge ẩn; "Không có header nào." | N/A |
| Value dài | value 500 ký tự không khoảng trắng | Xuống dòng (break-all), không cuộn ngang | N/A |
| Refused | `http://127.0.0.1:1` | Biến thể connection + chi tiết Go | N/A |
| Cert lạ | `httptest.NewTLSServer` / `https://self-signed.badssl.com` | Biến thể SSL | N/A |
| Timeout | server chậm > timeout | Biến thể timeout | N/A |
| Thử lại | đang ở error state, bấm "Thử lại" | spinner → response hoặc error state mới | N/A |
| URL "   " | bấm Gửi | viền đỏ + toast "Vui lòng nhập URL"; không gọi `SendRequest` | N/A |

</frozen-after-approval>

## Code Map

- `projects/service/executor.go` L113-123 -- nhánh `default` của lỗi `client.Do`; thêm helper `isTLSError(err) bool` ngay dưới file. Nhánh đọc body (L129-138) giữ nguyên.
- `projects/service/executor_test.go` L188 `TestExecutorService_Refused` -- mẫu test lỗi kết nối; thêm `TestExecutorService_TLSError` dùng `httptest.NewTLSServer`.
- `projects/frontend/src/stores/responseStore.ts` L23, L36-65 -- type `error`, toast URL rỗng (L38), phân nhánh code; `clear()` giữ nguyên ngữ nghĩa.
- `projects/frontend/src/components/ResponseViewer.vue` -- L17-20 hộp lỗi cũ → `<ResponseErrorState :error>`; L22-33 nhánh response → meta bar + tab bar + `v-show` Body (truncated + `JsonViewer`) / Headers (`HeadersTable`). Dùng `v-show` để JsonViewer giữ scroll/mode khi đổi tab.
- `projects/frontend/src/components/RequestTabs.vue` -- mẫu tab bar + badge (đổi brand → emerald: `border-emerald-500 text-emerald-400`, badge active `bg-emerald-500/20 text-emerald-300`).
- `projects/frontend/src/components/ResponseMetaBar.vue` -- mẫu SVG Phosphor inline + map class tĩnh.
- `projects/frontend/src/style.css` -- token `border-subtle`, `surface-hover`, typography `heading-sm`, `mono-sm`, `ui-sm`.
- `projects/frontend/src/utils/` -- thêm `responseHeaders.ts` (hàm thuần) và `responseError.ts` (hàm thuần chọn biến thể).

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/executor.go` -- thêm `isTLSError` + message SSL -- Vue cần phân biệt SSL mà không thêm code mới
- [x] `projects/service/executor_test.go` -- `TestExecutorService_TLSError`: code `CONNECTION_ERROR`, message có tiền tố `Lỗi chứng chỉ SSL`; Refused vẫn không có tiền tố
- [x] `projects/frontend/src/utils/responseHeaders.ts` -- MỚI `flattenHeaders(headers): {key,value}[]` theo Always
- [x] `projects/frontend/src/utils/responseError.ts` -- MỚI `errorVariant(err): 'connection'|'ssl'|'timeout'|'unknown'`
- [x] `projects/frontend/src/stores/responseStore.ts` -- error object, toast "Vui lòng nhập URL", catch → UNKNOWN
- [x] `projects/frontend/src/components/HeadersTable.vue` -- MỚI, prop `headers`
- [x] `projects/frontend/src/components/ResponseErrorState.vue` -- MỚI, prop `error`, emit-free (gọi store trực tiếp)
- [x] `projects/frontend/src/components/ResponseViewer.vue` -- tab bar + tích hợp hai component
- [x] scratch script (artifact dir, không commit) chạy `node --experimental-strip-types` -- assert hàng Headers và phân loại biến thể trong I/O Matrix

**Acceptance Criteria:**
- Given đang ở tab Headers, when gửi lại và response mới về, then vẫn ở tab Headers với dữ liệu mới.
- Given đã cuộn trong Body, when sang Headers rồi về Body, then JsonViewer giữ vị trí cuộn và mode Pretty/Raw.
- Given response cũ đang hiển thị, when lần gửi sau lỗi kết nối, then pane hiện error state (không còn response cũ); sau "Thử lại" thành công hiện response mới.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| `headersCount` không guard null, lặp logic `flattenHeaders` (BH, EC, VG) | low | patch (đã sửa) | Dùng `flattenHeaders(...).length`; build pass |
| Gợi ý timeout hardcode "30 giây" (BH, EC, VG) | false | rejected | Văn bản do spec chỉ định; executor mặc định 30s |
| `isTLSError` quá rộng / RecordHeaderError (BH, EC, VG) | false | rejected | Danh sách kiểu lỗi do spec chỉ định |
| Thiếu `strings` import trong test (BH, EC) | false | rejected | `executor_test.go` L8 đã import `strings` |
| Refused không assert thiếu tiền tố (EC, VG) | false | rejected | Test Refused đã assert message chứa "Lỗi kết nối"; không thể đồng thời có tiền tố SSL |
| Store không reset error khi gửi lại (EC) | false | rejected | `send()` có `this.error = null` trước khi gọi |
| Token `surface-hover`, `border-subtle`, `brand-primary`, `ui-sm`... (BH, VG) | false | rejected | Có trong `style.css` |
| Bàn phím tab (roving tabindex) (BH, EC) | low | rejected | Ngoài spec, sửa thêm hành vi/độ phức tạp |
| `type="button"`, ids trùng, table semantic (BH) | low | rejected | Không gây hại trong dùng thực tế, sửa thêm phức tạp |
| Layout `absolute inset-0` có thể collapse (BH) | false | rejected | Wrapper là `flex-1 min-h-0` trong flex column có chiều cao xác định |
| Hợp đồng chuỗi Go↔Vue và `flattenHeaders`/`errorVariant` chưa có test commit (VG, BH) | medium | defer | Spec cấm thêm test framework frontend; scratch script là artifact không commit |
| Trạng thái spec/sprint "in-progress" (BH) | false | rejected | Đã chuyển sang `in-review`/`review` |

## Design Notes

Kiến trúc yêu cầu TLS map vào `CONNECTION_ERROR` và "Go phân biệt trong Message"; AC lại cần icon riêng cho SSL, nên Vue đọc tiền tố message cố định `Lỗi chứng chỉ SSL` — hợp đồng duy nhất giữa hai bên, ghi trong cả test Go và `responseError.ts`. Nút "Thử lại" có cho cả timeout/SSL/unknown (UX flow gửi lại sau timeout). Tab state đặt ở `ResponseViewer` vì nhánh response bị unmount khi loading.

## Verification

**Commands:**
- `cd projects && go test ./service/ -run Executor` -- expected: pass, gồm TLS test
- `node --experimental-strip-types <scratch>/response_utils_check.ts` -- expected: mọi assert pass
- `cd projects/frontend && npm run build` -- expected: vue-tsc + vite build thành công

**Manual checks (if no CLI):**
- `wails dev -tags webkit2_41`: `https://httpbin.org/response-headers?a=1&a=2` (tab Headers, 2 dòng `a`), `http://127.0.0.1:1` (connection + Thử lại), `https://self-signed.badssl.com` (SSL), `https://httpbin.org/delay/40` (timeout), URL rỗng (viền đỏ + toast).

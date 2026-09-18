---
title: 'Story 3.6: JSON Viewer with Syntax Highlighting & Raw Toggle'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
baseline_commit: '2d212fa65ca673ae915126716ac1b392958139b1'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ResponseViewer` hiện body trong một `<pre>` trơn: JSON minified khó đọc, không highlight, không line number, không có cách copy nhanh body.

**Approach:** Thêm `JsonViewer.vue` dưới meta bar: thanh công cụ (segmented Pretty/Raw + nút ghost "Sao chép"), view Pretty = JSON format lại thụt 2 space, highlight theo token `syntax-*`, cột line number; view Raw = text gốc. Logic format/highlight là hàm thuần trong `utils/jsonHighlight.ts`.

## Boundaries & Constraints

**Always:**
- Pretty format bằng tokenizer riêng trên chuỗi gốc (sau khi `JSON.parse` xác nhận hợp lệ): giữ nguyên literal số và escape trong string (không mất chính xác số lớn); `{}`/`[]` rỗng giữ một dòng; thụt 2 space.
- Màu: key `syntax-key`, string `syntax-string`, number `syntax-number`, `true/false` `syntax-boolean`, `null` `syntax-null`; dấu câu `text-secondary`. Mọi text được escape HTML trước khi đưa vào `v-html`.
- Code area nền `#0b0f19`, `<pre><code>` font `mono-base`. Pretty: gutter 48px nền `#090d15`, viền phải, `text-muted`, `select-none`, căn phải, sticky trái trong cùng container cuộn; code `whitespace-pre` (cuộn ngang). Raw: không highlight, không gutter, `whitespace-pre-wrap break-all`.
- Pretty khả dụng chỉ khi `size_bytes ≤ 5*1024*1024` và body là JSON hợp lệ. Mặc định Pretty khi khả dụng và header `Content-Type` (tra không phân biệt hoa thường) chứa `json`; ngược lại mặc định Raw. Pretty bị tắt → nút disabled kèm `title` lý do; >5MB hiện thêm dòng `ui-sm text-text-muted` "Phản hồi lớn hơn 5MB — chỉ hiển thị Raw."
- Toggle Pretty↔Raw giữ vị trí cuộn riêng của từng view (hai view cùng mounted, ẩn bằng `v-show`; Pretty chỉ render khi được chọn lần đầu). Response mới → reset mode về mặc định và cuộn về đầu.
- Toggle: nền `surface-base`, viền `border-default`, active `surface-overlay` chữ trắng, inactive `text-secondary`, font `ui-xs`, `role="radiogroup"`/`role="radio"` + `aria-checked`, click target ≥ 32px.
- "Sao chép" copy nội dung tương ứng mode hiện tại (Raw/Pretty) qua Wails `ClipboardSetText`; thành công → `showToast('Đã sao chép', 2000)` và icon copy → check 1.5s rồi trở lại; thất bại/throw → toast "Không thể sao chép".
- Cảnh báo truncated (3.4) giữ nguyên, nằm trên viewer.

**Never:**
- Không thêm dependency, binding Go, test framework; không sửa Go, `wailsjs/`, store.
- Không làm tabs Body/Headers, bảng headers, error state "Thử lại" (3.7); không thêm phím tắt Ctrl+C.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| JSON object | `{"a":1,"b":[true,null],"c":"x"}`, CT `application/json` | Mặc định Pretty; 8 dòng thụt 2 space; mỗi loại token đúng class | N/A |
| Rỗng lồng nhau | `{"a":{},"b":[]}` | `"a": {}` và `"b": []` mỗi cái một dòng | N/A |
| Số lớn / escape | `{"n":12345678901234567890,"s":"a\"<b>"}` | Giữ nguyên `12345678901234567890`; `<b>` hiện dạng text, không thành thẻ | N/A |
| Không phải JSON | `<html>…`, CT `text/html` | Raw; nút Pretty disabled | không throw |
| CT JSON nhưng body hỏng | `{"a":` | Raw; Pretty disabled | không throw |
| JSON với CT khác | `[1,2]`, CT `text/plain` | Mặc định Raw; Pretty bật được | N/A |
| Body rỗng | `""` | Raw rỗng; Pretty disabled | N/A |
| >5MB | `size_bytes` = 5MB+1 | Chỉ Raw + dòng giải thích | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/ResponseViewer.vue` L27-33 -- vùng truncated + `<pre>` body; thay `<pre>` bằng `<JsonViewer :response>`; vùng này đang `p-spacing-4 overflow-y-auto` → chuyển thành `flex-1 flex flex-col min-h-0`, viewer tự cuộn.
- `projects/frontend/src/components/ResponseMetaBar.vue` -- mẫu: SVG Phosphor inline (viewBox 256, `fill="currentColor"`, `aria-hidden`), map class tĩnh cho Tailwind.
- `projects/frontend/src/components/BodyEditor.vue` L20-23, L84-90 -- mẫu chip radio + line numbers dạng một `<pre>` nối `\n`.
- `projects/frontend/src/stores/responseStore.ts` L7-16 -- `ExecuteResponse` (`headers: Record<string,string[]>`, `body`, `size_bytes`); chỉ đọc.
- `projects/frontend/src/stores/uiStore.ts` L15 -- `showToast(text, durationMs)`.
- `projects/frontend/wailsjs/runtime/runtime.d.ts` L235 -- `ClipboardSetText(text): Promise<boolean>`; import từ `../../wailsjs/runtime/runtime` (cùng kiểu đường dẫn tương đối như responseStore).
- `projects/frontend/src/style.css` L53-57 -- token `--color-syntax-*` có sẵn → class `text-syntax-key` v.v.; typography `.mono-base`, `.ui-xs`, `.ui-sm`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/utils/jsonHighlight.ts` -- MỚI: `isJsonContentType(headers)`, `tryParseJson(body): boolean`, `formatJsonHtml(body): { html: string; lines: number }`, `escapeHtml(s)`; hàm thuần
- [x] `projects/frontend/src/components/JsonViewer.vue` -- MỚI: prop `response: ExecuteResponse`; toolbar + view Pretty/Raw + copy theo Always
- [x] `projects/frontend/src/components/ResponseViewer.vue` -- dùng `JsonViewer`, bỏ `<pre>` cũ
- [x] scratch script (artifact dir, không commit) chạy bằng `node --experimental-strip-types` -- assert mọi dòng I/O Matrix trên `jsonHighlight.ts`

**Acceptance Criteria:**
- Given đang xem Pretty đã cuộn xuống, when chuyển Raw rồi về Pretty, then Pretty ở đúng vị trí cuộn cũ.
- Given nhấn "Sao chép", when clipboard ghi xong, then toast "Đã sao chép" 2s và icon check 1.5s rồi về icon copy; clipboard chứa nội dung theo mode hiện tại (Raw = body gốc, Pretty = bản đã format thụt 2 space).
- Given gửi lại request, when response mới về, then mode reset theo mặc định của response mới và cuộn về đầu.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Route | Evidence |
|---|-------|---------|---------|-------|----------|
| 1 | edge-case | Response mới không cuộn về đầu (không có key/reset scroll) | medium | patch | AC 3 yêu cầu reset cuộn; hai container cuộn tồn tại xuyên suốt các response. Đã thêm reset scrollTop/Left trong watch. |
| 2 | blind | Click target nút toggle 24px < 32px của spec | low | patch | `min-h-[24px]`; đã đổi `min-h-[32px]`. |
| 3 | edge-case | `JSON.parse` chạy trên body tới 10MB dù đã quá 5MB (không dùng) | low | patch | `isValidJson` parse vô điều kiện; đã short-circuit khi oversized. |
| 4 | blind | Biến chết `inString`/`escaped` trong `formatJsonHtml` | low | patch | Đã xoá. |
| 5 | verification-gap | Không có kiểm tra khớp giữa text hiển thị (Pretty) và text copy | medium | patch | Hai hàm trùng logic tokenizer; thêm scratch test parity (8 mẫu) — pass. |
| 6 | blind | `formatJsonText` và `formatJsonHtml` nhân đôi logic format | low | rejected | Chưa có harm hiện hữu, parity test đã chốt; fix là refactor lớn hơn sửa trực tiếp. |
| 7 | edge-case | Bấm Sao chép liên tiếp: timeout cũ reset icon sớm | low | rejected | Chỉ lệch cosmetic ≤1.5s, fix thêm state/timer. |
| 8 | edge-case | Pretty 5MB render qua `v-html` hàng trăm nghìn span có thể giật WebKitGTK | maybe-false | defer | Chưa đo được; cần thử file ~5MB bằng `wails dev`. |
| 9 | verification-gap | Cuộn riêng từng view, copy clipboard, reset mode chỉ kiểm tay (không có framework test UI) | medium | defer | Spec cấm thêm test framework; cần E2E UI về sau. |
| 10 | blind | Toggle `role=radio` thiếu điều hướng mũi tên | low | rejected | Ngoài spec; không ảnh hưởng chức năng cốt lõi. |

## Design Notes

Quyết định của agent: mode mặc định theo Content-Type như AC epic; Pretty vẫn bật được cho body JSON hợp lệ dù Content-Type khác (API hay trả sai CT). Formatter dùng tokenizer thay vì `JSON.stringify(JSON.parse())` để không làm tròn số > 2^53. `v-html` thay cho `v-for` span vì body tới 5MB sinh hàng trăm nghìn vnode. Copy dùng Wails runtime vì `navigator.clipboard` trên WebKitGTK không ổn định ngoài secure context.

```ts
// Một pass: string giữ nguyên (escape HTML), là key nếu ký tự không-trắng kế tiếp là ':'
// '{'/'[' → nếu ký tự kế là '}'/']' thì in liền, ngược lại xuống dòng + indent++
// ',' → xuống dòng; ':' → ': '; whitespace ngoài string bỏ qua
```

## Verification

**Commands:**
- `node --experimental-strip-types <scratch>/json_highlight_check.ts` -- expected: mọi assert pass
- `cd projects/frontend && npm run build` -- expected: vue-tsc + vite build thành công

**Manual checks (if no CLI):**
- `wails dev -tags webkit2_41`: gửi `https://httpbin.org/json` (Pretty có màu, line number), `https://httpbin.org/html` (Raw, Pretty disabled), file JSON 6MB phục vụ bằng `python3 -m http.server` (chỉ Raw + dòng giải thích; httpbin giới hạn `/bytes` 100KB); bấm "Sao chép" rồi dán vào editor.

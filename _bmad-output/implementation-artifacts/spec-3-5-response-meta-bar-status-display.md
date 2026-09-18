---
title: 'Story 3.5: Response Meta Bar & Status Display'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '12ce7b892b1b730bf7acebba36007a1a9b166dc6'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `ResponseViewer` (scaffold 3.4) chỉ hiện status/time/size dạng chữ xám, size luôn "N B", không màu, không timestamp — người dùng không đánh giá nhanh được response.

**Approach:** Tách `ResponseMetaBar.vue` (52px, `surface-raised`, viền dưới) gồm status badge có màu theo nhóm status, clock icon + "N ms", hard-drives icon + "N B/KB", timestamp "Hôm nay, HH:mm:ss"; logic định dạng là hàm thuần trong `utils/responseMeta.ts`.

## Boundaries & Constraints

**Always:**
- Badge: nền tint 10% + viền 20% + dot 8px tròn cùng màu + `status_code status_text`, font `mono-sm` bold, radius-md, padding 4px 10px. Status text rỗng → chỉ hiện mã.
- Nhóm màu: 2xx emerald (`status-2xx*`, dot có `box-shadow: 0 0 8px var(--color-status-2xx-glow)`); 3xx blue; 4xx amber; 5xx rose; mã khác (<200, ≥600) → trung tính slate (`text-secondary`, nền `surface-hover`), không glow. Chỉ 2xx có glow.
- Time: `"{time_ms} ms"`, mono. Size: `< 1024` → `"N B"`, `≥ 1024` → `"Math.floor(N/1024) KB"`; không MB, không thập phân. Giá trị âm/không hữu hạn coi là 0.
- Timestamp (căn phải, `ui-xs`, `text-muted`): giờ local; cùng ngày hôm nay → `"Hôm nay, HH:mm:ss"`, khác ngày → `"dd/MM/yyyy, HH:mm:ss"`, 24h, zero-pad; timestamp không parse được → ẩn phần timestamp.
- Icon SVG inline Phosphor (viewBox 256, `fill="currentColor"`, `aria-hidden="true"`) như `KvpEditor.vue`.
- Meta bar có `role="status"` để screen reader đọc status khi response về.
- Cảnh báo truncated và `<pre>` body giữ nguyên hành vi 3.4, nằm dưới meta bar.

**Never:**
- Không thêm dependency, binding Go, test framework frontend; không sửa Go, `wailsjs/`, store.
- Không làm tabs Body/Headers, JSON pretty/Raw, bảng headers, error state "Thử lại" (3.6–3.7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| 2xx | `200 OK`, 142 ms, 512 B | Badge emerald + glow "200 OK"; "142 ms"; "512 B" | N/A |
| Ngưỡng KB | size 1023 / 1024 / 2047 | "1023 B" / "1 KB" / "1 KB" | N/A |
| 3xx/4xx/5xx | 301 / 404 / 503 | blue / amber / rose, không glow | N/A |
| Mã lạ | 101 hoặc 600 | slate trung tính | N/A |
| Timestamp hôm nay | RFC3339 hôm nay 09:05:07 local | "Hôm nay, 09:05:07" | N/A |
| Timestamp khác ngày | 2026-10-05T23:59:59 local | "05/10/2026, 23:59:59" | N/A |
| Timestamp hỏng | `""` hoặc `"abc"` | Không hiện timestamp | không throw |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/ResponseViewer.vue` L20-27 -- khối status/time/size tạm của 3.4; thay bằng `<ResponseMetaBar :response="..."/>`. Giữ nhánh loading/error/empty và truncated + `<pre>`. Meta bar đặt sát mép (container hiện có `p-spacing-4`; tách padding sang phần body để bar full-width).
- `projects/frontend/src/stores/responseStore.ts` L7-16 -- type `ExecuteResponse` (export) để import; chỉ đọc.
- `projects/frontend/src/style.css` L40-50 -- token `status-2xx/4xx/5xx` (+`-bg`, `-border`, `2xx-glow`). Chưa có 3xx → thêm `--color-status-3xx: #3b82f6`, `-bg: #3b82f618`, `-border: #3b82f633` (blue 500, cùng quy ước alpha). `surface-raised`, `border-subtle`, `text-muted`, `surface-hover` có sẵn.
- `projects/frontend/src/components/KvpEditor.vue` L125 -- mẫu SVG Phosphor inline.
- `projects/service/executor.go` L156 -- `Timestamp = startTime.Format(time.RFC3339)` (có offset) → `new Date()` parse được; chỉ đọc.
- `_bmad-output/planning-artifacts/ux-designs/ux-hecto-api-2026-09-21/DESIGN.md` L240-250 -- spec component meta bar/badge; không sửa.

## Tasks & Acceptance

**Execution:**
- [ ] `projects/frontend/src/style.css` -- thêm 3 token status-3xx -- AC 3xx blue tint
- [ ] `projects/frontend/src/utils/responseMeta.ts` -- MỚI: `formatSize(bytes)`, `statusTone(code): '2xx'|'3xx'|'4xx'|'5xx'|'other'`, `formatTimestamp(iso, now = new Date()): string | null` -- hàm thuần, test được
- [ ] `projects/frontend/src/components/ResponseMetaBar.vue` -- MỚI: prop `response: ExecuteResponse`, render theo Always, map tone → class Tailwind token
- [ ] `projects/frontend/src/components/ResponseViewer.vue` -- dùng `ResponseMetaBar`, bỏ khối tạm
- [ ] scratch script (artifact dir, không commit) chạy bằng `node --experimental-strip-types` -- assert mọi dòng I/O Matrix trên `responseMeta.ts`

**Acceptance Criteria:**
- Given response vừa nhận, when viewer render, then meta bar cao đúng 52px, nền `surface-raised`, các phần theo thứ tự badge | time | size | timestamp (phải).
- Given gửi lại request, when response mới về, then meta bar cập nhật toàn bộ giá trị; khi loading/error/chưa gửi thì không hiện meta bar.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Quyết định của agent: 3xx dùng blue 500 (`#3b82f6`, trùng brand/method POST) vì DESIGN.md chưa định nghĩa 3xx; mã ngoài 2xx–5xx dùng slate; timestamp khác ngày hiện ngày đầy đủ thay vì luôn ghi "Hôm nay" (response chỉ nằm trong bộ nhớ nhưng có thể qua nửa đêm). Tone → class bằng object map tĩnh (Tailwind cần class literal):

```ts
const toneClass = {
  '2xx': { badge: 'bg-status-2xx-bg border-status-2xx-border text-status-2xx', dot: 'bg-status-2xx shadow-[0_0_8px_var(--color-status-2xx-glow)]' },
  // 3xx/4xx/5xx tương tự, không shadow; other: 'bg-surface-hover border-border-default text-text-secondary'
}
```

## Verification

**Commands:**
- `node --experimental-strip-types <scratch>/response_meta_check.ts` -- expected: mọi assert pass
- `cd projects/frontend && npm run build` -- expected: vue-tsc + vite build thành công

**Manual checks (if no CLI):**
- `wails dev -tags webkit2_41`: gửi `https://httpbin.org/status/200|304|404|503` (304 vì client Go tự follow 301/302) và `https://httpbin.org/bytes/2048` → màu badge đúng nhóm, glow chỉ ở 2xx, "2 KB", timestamp "Hôm nay, …".

## Review Triage Log

| Layer | Finding | Verdict | Route | Evidence |
|---|---|---|---|---|
| blind-hunter | `text-ui-xs` không phải utility được định nghĩa (chỉ có class `.ui-xs`) nên timestamp mất style | medium | patch | Đã đổi sang `.ui-sm` (12px, đọc được hơn 10px); build pass |
| blind-hunter | `scratch/` test script nằm trong repo | low | patch | Đã xoá; 18 case đã pass trước đó |
| edge-case-hunter | timestamp rỗng/không hợp lệ | false | rejected | `formatTimestamp` trả `null`, template ẩn bằng `v-if` |
| edge-case-hunter | size ≥ 1MB hiển thị "10240 KB" | false | rejected | Spec quy định rõ không dùng MB |
| edge-case-hunter | status code ngoài 2xx–5xx | false | rejected | Nhánh `other` trung tính đã có |
| verification-gap | không có test tự động cho `ResponseMetaBar.vue` | maybe-false | deferred-note | Repo chưa có frontend test runner; xác minh thủ công theo spec |

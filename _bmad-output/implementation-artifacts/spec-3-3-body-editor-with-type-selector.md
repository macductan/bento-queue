---
title: 'Story 3.3: Body Editor with Type Selector'
type: 'feature'
created: '2026-10-06'
status: 'done'
baseline_commit: '395354a27beed8bdd6d8805b7bc64dedfdcf37a7'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tab Body trong `RequestEditor.vue` chỉ hiển thị body dạng `<pre>` chỉ đọc; người dùng không chọn được loại body, không soạn được JSON/Text, và không có Content-Type tự động hay cảnh báo GET + body.

**Approach:** Thêm `BodyEditor.vue` (chip None/JSON/Text + textarea có cột số dòng) ghi thẳng vào `requestStore.current.body`, action `setBodyType` trong `requestStore` xử lý Content-Type tự động (AR-14), và `WarningBanner.vue` dưới URL bar khi method GET + body ≠ none.

## Boundaries & Constraints

**Always:**
- Chip radio `rounded-full`, viền `border-default`, `ui-xs`, padding `4px 10px`; active: nền `surface-overlay`, chữ `text-primary`; inactive `text-secondary`. `role="radiogroup"` + `role="radio"` + `aria-checked`, click target ≥ 32px chiều cao (padding ngoài / min-h).
- None (hoặc `body` null/thiếu, hoặc type lạ) → hiện "Request này không có body.", ẩn editor. Type lạ không có chip nào active.
- JSON/Text → container nền `surface-input`, viền `border-default`, `rounded-md`; cột số dòng 40px nền `surface-raised`, `mono-base`, `text-muted`, `select-none`, viền phải; textarea `mono-base`, `spellcheck="false"`, `autocomplete="off"`, `wrap="off"` (không ngắt dòng để số dòng khớp), số dòng = `content.split('\n').length`, cuộn dọc đồng bộ với textarea.
- Đổi type chỉ đổi `body.type`; `body.content` giữ nguyên (kể cả qua None). `body` null → lần ghi đầu gán `{type, content:''}`.
- AR-14 trong `requestStore.setBodyType(type)`: header Content-Type = dòng có `key.trim().toLowerCase() === 'content-type'` (bất kể enabled).
  - Sang `json` và chưa có Content-Type → chèn `{key:'Content-Type', value:'application/json', enabled:true, _isAuto:true}` lên đầu mảng (index 0). Đánh dấu `contentTypeAuto = true`.
  - Đã có Content-Type (user tạo) → không đụng.
  - Rời `json` → gỡ dòng Content-Type chỉ khi đang auto-added (thường nằm ở index 0 và có `_isAuto`).
- Khôi phục `_isAuto` khi load: `loadRequest` re-derive nếu `body.type === 'json'` và header đầu tiên là `Content-Type: application/json` → gán `_isAuto = true` và `contentTypeAuto = true`.
- WarningBanner giữa `UrlBar` và `RequestTabs`: hiện khi `method === 'GET'` và `body.type` ∈ {json, text}; nền `warning-bg`, viền `warning-border`, chữ `warning-text` `ui-xs`, `rounded-md`, padding `spacing-2 spacing-3`, icon Phosphor warning inline (aria-hidden), text "Cảnh báo: Request GET không nên đi kèm Body. Body vẫn được gửi nhưng nhiều server sẽ bỏ qua.", `role="status"`. Không chặn gì.

**Never:**
- Không sửa Go, `wailsjs/`, không thêm binding/dependency/design token/test framework.
- Không validate/format JSON, không syntax highlight. Được phép bắt phím Tab trong textarea để chèn 2 khoảng trắng (spaces) thay vì nhảy focus mặc định.
- Không gửi request, không lọc header (3.4). Không highlight `{{variable}}` (Epic 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mở request | `body:{type:'none',content:''}` | Chip None active, message, không dirty | N/A |
| Body null | `"body": null` trên đĩa | Như None; chọn Text → `body = {type:'text',content:''}` | N/A |
| Round-trip None | JSON content `{"a":1}` → None → JSON | Content vẫn `{"a":1}`; nếu không đổi gì khác → hết dirty | N/A |
| Auto thêm | headers `[]`, chọn JSON | Headers có `Content-Type: application/json` enabled, badge Headers = 1, dirty | N/A |
| User thắng | Có header `content-type: text/plain`, chọn JSON | Header giữ nguyên, không thêm dòng | N/A |
| Auto gỡ | Vừa auto thêm, chọn Text | Dòng Content-Type bị gỡ | N/A |
| User sửa value | Auto thêm, sửa value thành `application/json; charset=utf-8`, chọn None | Header giữ nguyên | N/A |
| Load re-derive | Trên đĩa JSON + `Content-Type: application/json` ở index 0, chọn Text rồi JSON | Gỡ rồi chèn lại đúng index 0 → hết dirty | N/A |
| Cảnh báo | GET + Text | Banner hiện; đổi method POST hoặc chọn None → banner ẩn | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/RequestEditor.vue` -- L47-57 khối body chỉ đọc trong panel Body → thay bằng `<BodyEditor />`; chèn `<WarningBanner />` sau `<UrlBar />` (L32).
- `projects/frontend/src/components/BodyEditor.vue` -- MỚI. Đọc `requestStore.current.body`; chip gọi `requestStore.setBodyType`; textarea `v-model` vào `body.content`. Mẫu mutate trực tiếp: `UrlBar.vue` (`req.value.method = ...`).
- `projects/frontend/src/components/WarningBanner.vue` -- MỚI. Computed từ `requestStore.current.method` + `.body?.type`.
- `projects/frontend/src/stores/requestStore.ts` -- options store. Thêm state `contentTypeAuto: boolean` và `contentTypeIndex: number | null` (index để chèn lại); action `setBodyType(type: 'none'|'json'|'text')`; re-derive trong `loadRequest` (sau L70) và reset trong `clearRequest`. `isDirty`/`stringifySorted` không sửa.
- `projects/frontend/src/components/KvpEditor.vue` -- Sửa input `key` và `value` thành read-only (có thể dùng `:readonly="row._isAuto"` hoặc `:disabled="row._isAuto"`) cho dòng tự động chèn. Ô checkbox `enabled` vẫn hoạt động bình thường.
- `projects/frontend/src/components/RequestTabs.vue` -- badge Headers tự cập nhật từ `current.headers`. Không sửa.
- `projects/frontend/src/style.css` -- token sẵn có: `surface-input`, `surface-raised`, `surface-overlay`, `warning-bg/-border/-text`, `.mono-base`, `.ui-xs`. Chỉ đọc. (`bg-surface-sunken` trong RequestEditor cũ không phải token — bị xóa cùng khối body.)
- `projects/model/types.go` L47-51 -- `Body{Type,Content}`, type `"none"|"json"|"text"`. Không sửa.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/stores/requestStore.ts` -- thêm state cờ auto + index, `setBodyType`, re-derive khi load, reset khi clear -- AR-14
- [x] `projects/frontend/src/components/BodyEditor.vue` -- chip + message None + editor số dòng theo Always -- AC 3.3
- [x] `projects/frontend/src/components/WarningBanner.vue` -- banner GET + body -- UX-DR8
- [x] `projects/frontend/src/components/RequestEditor.vue` -- thay khối body chỉ đọc bằng `BodyEditor`, chèn `WarningBanner` dưới URL bar -- tích hợp

**Acceptance Criteria:**
- Given tab Body active, when editor render, then có 3 chip tròn None | JSON | Text và đúng 1 chip active theo `body.type`.
- Given body JSON nhiều dòng, when gõ thêm dòng mới, then cột số dòng tăng tương ứng và cuộn dọc khớp textarea.
- Given đang sửa body, when Ctrl+S, then file trên đĩa có `body.type`/`body.content` mới và hết dirty.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Review chạy inline trong conversation chính (không có subagent), 3 lớp: blind-hunter, edge-case-hunter, verification-gap (lần 2, đọc đủ diff + KvpEditor/RequestEditor). `vue-tsc --noEmit` exit 0, `npm run build` thành công (cả sau patch).

| # | Finding | Verdict | Route | Evidence |
|---|---------|---------|-------|----------|
| 1 | `<pre class="font-inherit">` — class không tồn tại, cột số dòng không dùng `mono-base`/`--font-mono` như textarea | low | patch (đã áp) | `font-inherit` không có trong `style.css`; preflight chỉ áp font mặc định. Đổi thành `mono-base`. |
| 2 | Auto Content-Type load từ đĩa `content-type: application/json` (khác hoa/thường) → JSON→Text→JSON chèn lại `Content-Type`, vẫn dirty | low | reject | Hiếm; sửa cần lưu header gốc, thêm state. |
| 3 | Thanh cuộn ngang textarea làm cột số dòng lệch tối đa ~15px ở cuối | low | reject | Chỉ cosmetic khi cuộn hết cỡ; sửa cần thêm tính toán padding. |
| 4 | `handleTab` bắt cả Shift+Tab, tạo keyboard trap và mất undo | low | reject | Spec cho phép bắt Tab; sửa thêm nhánh. |
| 5 | Radiogroup thiếu điều hướng phím mũi tên | low | reject | Ngoài yêu cầu spec; thêm hành vi mới. |
| 6 | User xóa dòng auto khi đang JSON → cờ `contentTypeAuto` còn true | false | — | Row auto không còn nút xóa (`v-if="!row._isAuto"`); đổi type vẫn reset cờ an toàn. |
| 7 | `_isAuto` gửi xuống Go qua SaveRequest | false | — | Go không dùng `DisallowUnknownFields`; load lại re-derive. |
| 8 | Load re-derive coi header user-tạo ở index 0 là auto | false | — | Đúng spec Always. |
| 9 | Setter `bodyContent` khi body null | false | — | Editor chỉ render khi type json/text. |
| 10 | Ma trận "User sửa value" không thực hiện được do KvpEditor read-only | low | reject | Code Map yêu cầu read-only; không sửa spec. |
| 11 | Không có test tự động / chưa chạy manual check | low | reject | Spec cấm thêm test framework; manual check (`wails dev`) còn lại cho human. |

Không có defer/loopback. 1 patch đã áp và đã verify lại.

## Design Notes

Cờ auto-added dùng thuộc tính phụ `_isAuto` để KvpEditor.vue dễ dàng xác định dòng read-only. Lúc so sánh `isDirty`, hàm `stringifySorted` tự bỏ qua `_isAuto` (hoặc backend tự ignore) nên không lo dirty giả. Gỡ ra lúc đổi type thì tìm cái nào `_isAuto === true` để gỡ.

```ts
setBodyType(type) {
  const cur = this.current!; cur.body ??= { type: 'none', content: '' }
  const hs = cur.headers ?? (cur.headers = [])
  const i = hs.findIndex(h => h.key.trim().toLowerCase() === 'content-type')
  if (type === 'json' && i < 0) { hs.splice(this.contentTypeIndex ?? hs.length, 0, ct); this.contentTypeAuto = true }
  else if (type !== 'json' && cur.body.type === 'json' && this.contentTypeAuto && i >= 0 && isJsonValue(hs[i])) { hs.splice(i, 1); this.contentTypeIndex = i; this.contentTypeAuto = false }
  cur.body.type = type
}
```

## Verification

**Commands:**
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: exit 0
- `cd projects/frontend && npm run build` -- expected: build thành công

**Manual checks (if no CLI):**
- `cd projects && wails dev -tags webkit2_41`: mở request GET → tab Body → chọn JSON (banner hiện, Headers badge +1) → gõ nhiều dòng (số dòng khớp) → None (banner ẩn, header auto gỡ) → JSON (content còn) → đổi method POST (banner ẩn) → Ctrl+S → mở file JSON kiểm tra body + header.

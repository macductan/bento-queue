---
title: 'Story 3.2: KVP Editor for Params & Headers'
type: 'feature'
created: '2026-10-06'
status: 'in-review'
baseline_commit: '4e03086a0e71d2009076eca71be7836fe221cf0e'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Params và headers trong editor chỉ hiển thị dạng bảng đọc (`RequestEditor.vue`), người dùng không thêm/sửa/xóa/bật-tắt được.

**Approach:** Thêm thanh tab request (Params | Headers | Body) dưới URL bar và component KVP editor dùng chung cho Params/Headers, ghi thẳng vào `requestStore.current.params` / `.headers` để `isDirty` tự tính. Tab Body tạm giữ khối body chỉ đọc hiện có cho tới story 3.3.

## Boundaries & Constraints

**Always:**
- Grid 4 cột: checkbox 24px | Key | Value | nút xóa 32px. Header cột "KEY" / "VALUE" dùng `ui-xs uppercase text-text-muted`.
- Checkbox `accent-brand-primary`, `aria-label="Bật/tắt dòng"`; dòng disabled mờ (`opacity-50`).
- Input: nền `surface-base`, `mono-sm`, viền trong suốt, có viền `border-focus` khi focus; `spellcheck="false"`, `autocomplete="off"`, placeholder "Key" / "Value".
- Nút xóa (icon X Phosphor inline, `text-red-400`, `aria-label="Xóa dòng"`) ẩn mặc định, hiện khi hover dòng hoặc khi nút có focus (`group-hover` + `focus-visible`).
- Luôn có đúng 1 dòng trống "ảo" cuối grid, **không** nằm trong mảng store (mở request không bị dirty). Gõ vào key hoặc value của dòng ảo → push `{key, value, enabled: true}` vào mảng, focus giữ ở ô đang gõ, dòng ảo mới xuất hiện bên dưới. Dòng ảo không có checkbox tương tác (disabled) và không có nút xóa.
- Nút "Thêm mới" dưới grid push một dòng thật rỗng `{key:'', value:'', enabled:true}` và focus ô Key của nó.
- Tab trong ô Value → focus ô Key dòng kế tiếp (kể cả dòng ảo), `preventDefault`; Tab ở Value của dòng ảo và Shift+Tab giữ hành vi mặc định.
- Mảng `null`/thiếu trên đĩa hiển thị như rỗng; lần ghi đầu tiên gán mảng mới.
- Tab bar: Params (badge = số dòng có key `trim() !== ''`, kể cả dòng disabled; ẩn badge khi 0), Headers (badge tương tự), Body. Tab active: `border-b-2 border-brand-primary text-blue-400`; tab khác `text-text-secondary`, viền trong suốt. `role="tablist"` / `role="tab"` + `aria-selected`, panel `role="tabpanel"`. Click target tab ≥ 32px chiều cao.
- Tab active lưu ở `uiStore.activeRequestTab` (`'params' | 'headers' | 'body'`, mặc định `'params'`), giữ nguyên khi chuyển request.

**Never:**
- Không sửa Go, `wailsjs/`, không thêm binding, dependency, design token hay test framework frontend.
- Không làm body editor/type selector/Content-Type tự động (3.3), không encode/nối params vào URL hay đồng bộ URL ↔ params (3.4).
- Không lọc dòng rỗng khi lưu; không highlight `{{variable}}` (Epic 4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mở request | `params: []` | 1 dòng ảo, không dirty, badge Params ẩn | N/A |
| Gõ dòng ảo | Gõ "a" vào Key dòng ảo | Mảng có `{key:"a",value:"",enabled:true}`, focus giữ ở ô, dòng ảo mới bên dưới, dirty | N/A |
| Hoàn tác | Xóa dòng vừa thêm bằng nút xóa | Mảng về như gốc, hết dirty | N/A |
| Bật/tắt | Bỏ tick dòng `enabled:true` | `enabled:false`, dòng mờ, dirty; badge không đổi | N/A |
| Mảng null | `"headers": null` trên đĩa | Hiển thị dòng ảo; gõ → `headers` thành mảng 1 phần tử | N/A |
| Tab điều hướng | Focus Value dòng 1 (có 2 dòng thật) | Tab → Key dòng 2; Tab ở Value dòng 2 → Key dòng ảo | N/A |
| Thêm mới | Click "Thêm mới" | Thêm dòng thật rỗng, focus Key của nó, dirty | N/A |
| Ctrl+S | Sau khi sửa header | Lưu, hết dirty, dòng ảo không được ghi xuống đĩa | Lỗi → toast (sẵn có) |
| Chuyển request | Đang ở tab Headers | Request mới mở vẫn ở tab Headers | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/RequestEditor.vue` -- L30-70 hai bảng headers/params chỉ đọc → thay bằng `<RequestTabs />` + panel; L72-78 khối body chỉ đọc → chuyển vào panel Body (giữ nguyên markup, hiện "Request này không có body." khi `type === 'none'` hoặc thiếu).
- `projects/frontend/src/components/KvpEditor.vue` -- MỚI. Prop `field: 'params' | 'headers'`; đọc/ghi `requestStore.current[field]` trực tiếp (mẫu: `UrlBar.vue` mutate `req.value.method`). Ref các ô Key theo index để focus sau push/Tab (`nextTick`).
- `projects/frontend/src/components/RequestTabs.vue` -- MỚI. Tab bar + badge, đọc/ghi `uiStore.activeRequestTab`.
- `projects/frontend/src/stores/uiStore.ts` -- setup store; thêm `activeRequestTab = ref<'params'|'headers'|'body'>('params')` và export trong object return cuối file.
- `projects/frontend/src/stores/requestStore.ts` -- `KVPair`/`Request` type; `isDirty` (deep compare sorted-key) đã đúng, không sửa.
- `projects/frontend/src/style.css` -- dùng sẵn `ui-xs`, `mono-sm`, `--color-text-muted`, `--color-brand-primary`, `--color-border-focus`, `--color-surface-base`. Tailwind v4 → `text-blue-400`, `text-red-400`, `accent-*` có sẵn. Chỉ đọc.
- `projects/frontend/src/components/EmptyStateRequest.vue` -- mẫu SVG Phosphor inline (`viewBox="0 0 256 256"`, `fill="currentColor"`, `aria-hidden`).
- `projects/model/types.go` L41-45, L58-68 -- `KVPair{key,value,enabled}`, `Headers`/`Params` không `omitempty` (có thể `null`). Không sửa.
- `projects/frontend/src/App.vue` -- `handleKeyDown` bỏ qua phím khi focus trong input (trừ Ctrl+S/L) → không xung đột với Tab trong KVP. Không sửa.

## Tasks & Acceptance

**Execution:**
- [ ] `projects/frontend/src/stores/uiStore.ts` -- thêm `activeRequestTab` -- giữ tab qua chuyển request
- [ ] `projects/frontend/src/components/KvpEditor.vue` -- tạo editor theo Always (grid, dòng ảo, Thêm mới, Tab, xóa, null-safe) -- AC 3.2
- [ ] `projects/frontend/src/components/RequestTabs.vue` -- tạo tab bar + badge + ARIA -- AC 3.2
- [ ] `projects/frontend/src/components/RequestEditor.vue` -- thay bảng chỉ đọc bằng tabs + panel (Params/Headers dùng `KvpEditor`, Body giữ khối đọc) -- editor sửa được

**Acceptance Criteria:**
- Given request đã load, when nhìn dưới URL bar, then có 3 tab Params | Headers | Body, tab active viền dưới brand-primary chữ blue-400.
- Given tab Params active, when nhìn grid, then cột theo thứ tự checkbox 24px | Key | Value | nút xóa 32px, header "KEY"/"VALUE".
- Given chuột hover một dòng thật, when nhìn cột cuối, then nút xóa đỏ hiện; rời chuột thì ẩn.
- Given request có 2 header key không rỗng và 1 header key rỗng, when nhìn tab Headers, then badge hiển thị 2.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Dòng ảo tách khỏi store vì `isDirty` so sánh sâu `original` với `current`: nếu chèn dòng trống vào mảng lúc load, mọi request mở ra đều dirty và dòng rác bị ghi xuống đĩa khi Ctrl+S.

```ts
const rows = computed(() => requestStore.current?.[props.field] ?? [])
function onPhantomInput(part: 'key' | 'value', v: string) {
  const cur = requestStore.current!
  const arr = cur[props.field] ?? (cur[props.field] = [])
  arr.push({ key: part === 'key' ? v : '', value: part === 'value' ? v : '', enabled: true })
  nextTick(() => focusCell(arr.length - 1, part)) // giữ caret ở ô vừa gõ
}
```

## Verification

**Commands:**
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: exit 0
- `cd projects/frontend && npm run build` -- expected: build thành công

**Manual checks (if no CLI):**
- `cd projects && wails dev -tags webkit2_41`: mở request → không dirty → gõ dòng ảo Params → dòng mới + chấm "Chưa lưu" → Tab key→value→key kế → bỏ tick (mờ) → xóa dòng → hết dirty → Headers tab badge đúng → Ctrl+S → mở lại file JSON không có dòng rỗng thừa → chuyển request vẫn giữ tab.

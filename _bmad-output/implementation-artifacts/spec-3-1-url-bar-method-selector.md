---
title: 'Story 3.1: URL Bar & Method Selector'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Editor hiện chỉ đọc (`RequestEditor.vue` hiển thị method/URL dạng text), người dùng không đổi được method hay URL của request, và chưa có cách lưu nhanh.

**Approach:** Thay khối "URL Bar Mock" bằng component URL bar chỉnh sửa được: dropdown method có màu, ô URL mono, nút "Gửi" ở cuối. Mọi thay đổi ghi thẳng vào `requestStore.current` nên `isDirty` tự bật. Thêm Ctrl+L (focus URL), Ctrl+S (lưu), chấm "Chưa lưu" trong editor, và sửa lỗi F-2 của retro Epic 2 vì editor sửa được làm lỗi này xảy ra thật.

## Boundaries & Constraints

**Always:**
- Method chỉ gồm GET, POST, PUT, PATCH, DELETE (đúng thứ tự này), mỗi method tô màu bằng token `--color-method-*` và luôn có text label.
- Dropdown method là listbox tự làm (không dùng `<select>` gốc, vì popup GTK bỏ qua màu option): nền `surface-overlay`, viền phải, `mono-sm` bold; mở bằng click/Enter/Space/↓, chọn bằng ↑/↓ + Enter, Escape hoặc click ngoài để đóng và trả focus về nút; có `aria-haspopup="listbox"`, `aria-expanded`, `role="option"` + `aria-selected`.
- Method trên đĩa không thuộc danh sách (ví dụ chữ thường) vẫn hiển thị nguyên văn, màu `text-secondary`; chỉ thay khi người dùng chọn.
- Container URL bar: `rounded-md`, nền `surface-base`, viền `border-default`; khi bất kỳ phần tử con có focus → viền + `ring-1` màu `border-focus`.
- Ô URL: `mono-base`, `font-variant-ligatures: none`, `spellcheck="false"`, `autocomplete="off"`, placeholder `https://api.example.com/v1/...`, `aria-label="URL"`.
- Ctrl+L focus và chọn toàn bộ text ô URL; Ctrl+S gọi `saveCurrent()` khi có request active. Cả hai chạy kể cả khi focus đang ở input, `preventDefault`, và bị bỏ qua khi confirm dialog, context menu hoặc dialog unsaved đang mở.
- Lưu không được unmount editor: `saveCurrent` dùng cờ `saving` riêng, không bật `loading` (skeleton chỉ dành cho lúc load request); snapshot `current` trước khi gọi `SaveRequest` và gán `original = snapshot` để chữ gõ thêm trong lúc lưu vẫn là dirty. Bỏ qua Ctrl+S khi đang `saving`.

**Never:**
- Không gửi HTTP, không thêm binding Go, không sửa file Go (story 3.4).
- Không làm KVP editor, body editor, request tabs (3.2/3.3); khối headers/params/body chỉ đọc hiện có giữ nguyên.
- Không thêm design token, dependency hay test framework frontend.
- Không highlight `{{variable}}` trong URL (Epic 4).

**Decisions:**
- Ctrl+S nằm trong story này (người dùng chọn).
- Sửa F-2 trong story này: `selectRequest(id, opts?: { force?: boolean })` — `force` bỏ qua guard unsaved; `selectNextRequestOrClear` luôn gọi với `force: true`.
- Chấm "Chưa lưu": thêm chấm `w-2 h-2 rounded-full bg-unsaved-dot` cạnh `<h1>` trong editor (`title="Chưa lưu"`, `aria-label="Chưa lưu"`), và đổi chấm sidebar từ `bg-brand-tertiary` (token không tồn tại) sang `bg-unsaved-dot`.
- Nút "Gửi" trước story 3.4: hiển thị nhưng `disabled`, mờ (`opacity-50`, `cursor-not-allowed`), `title="Gửi request sẽ có ở bản sau"`.
- Giữ toàn bộ phạm vi trong một spec (~2.500 token, người dùng chấp nhận rủi ro).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đổi method | GET → chọn POST | Nhãn POST màu `method-post`, chấm "Chưa lưu" hiện | N/A |
| Đổi lại như cũ | POST → GET (giá trị gốc) | `isDirty` = false, chấm biến mất | N/A |
| Gõ URL | Thêm ký tự vào URL | `isDirty` = true; xóa đúng ký tự đó → false | N/A |
| Method lạ trên đĩa | `"method": "get"` | Hiển thị `get`, màu `text-secondary`, không dirty khi mở | N/A |
| Ctrl+L | Focus ở sidebar hoặc input khác | Focus vào ô URL, text được chọn | Bỏ qua nếu dialog/menu đang mở |
| Ctrl+S khi dirty | Đã đổi URL, focus trong ô URL | Toast "Đã lưu", chấm biến mất, ô URL giữ focus, sidebar cập nhật method | Lỗi → toast message lỗi, vẫn dirty |
| Ctrl+S khi không có request | Empty state | Không làm gì | N/A |
| Gõ trong lúc lưu | Gõ thêm ký tự trước khi `SaveRequest` trả về | Sau khi lưu xong vẫn dirty | N/A |
| Xóa request active đang dirty | Context menu → Xóa → xác nhận | Chuyển sang sibling (hoặc empty state), **không** hiện dialog unsaved | N/A |
| Xóa folder chứa request active đang dirty | Như trên với folder | Như trên | N/A |
| Escape trong dropdown | Dropdown đang mở | Đóng dropdown, focus về nút method, không đổi giá trị | N/A |
| Chuyển request khi dirty | Đã đổi method, click request khác | Dialog unsaved hiện (guard sẵn có) | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/RequestEditor.vue` -- L28-32 "URL Bar Mock" → thay bằng `<UrlBar />`; `methodColor` L9-12 chuyển vào UrlBar; `<h1>` L25 thêm chấm "Chưa lưu" theo `requestStore.isDirty`. Skeleton L18 dựa vào `requestStore.loading`.
- `projects/frontend/src/components/UrlBar.vue` -- MỚI. `v-model` trực tiếp trên `requestStore.current.method` / `.url` (Pinia cho phép mutate state; getter `isDirty` tự tính lại). Ô URL có `id="url-input"` để App.vue focus.
- `projects/frontend/src/stores/requestStore.ts` -- `RequestState` thêm `saving: boolean`; `saveCurrent` L88-114 đổi `loading` → `saving`, snapshot trước `await SaveRequest`. `isDirty` L55 giữ nguyên.
- `projects/frontend/src/stores/collectionStore.ts` -- `selectRequest` L54-82 thêm tham số `opts`, guard L62 thành `if (!opts?.force && reqStore.isDirty)`; `selectNextRequestOrClear` L273 gọi `selectRequest(next.id, { force: true })`. Không đổi chỗ khác.
- `projects/frontend/src/components/TreeNodeRow.vue` -- L206: `bg-brand-tertiary` → `bg-unsaved-dot`.
- `projects/frontend/src/App.vue` -- `handleKeyDown` L15-33: tách check dialog/menu (`uiStore.confirm`, `contextMenu`, `unsavedPrompt`) ra trước; xử lý Ctrl+L / Ctrl+S trước check input đang focus; Ctrl+N giữ nguyên hành vi cũ.
- `projects/frontend/src/style.css` -- token `--color-method-*` L34-38, `--color-surface-overlay`, `--color-border-focus`, `--color-unsaved-dot` L67; class `mono-base`/`mono-sm`. Chỉ đọc.
- `projects/frontend/src/components/EmptyStateRequest.vue` -- mẫu SVG Phosphor inline (`viewBox="0 0 256 256"`, `fill="currentColor"`, `aria-hidden`).
- `projects/frontend/src/components/TreeContextMenu.vue` L102 -- mẫu xử lý Escape/click ngoài cho dropdown.
- Không đổi: Go code, `wailsjs/`. Retro F-4 (import tĩnh `uiStore`): story này không thêm action store mới gọi toast → không đụng; làm trước 3.4.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/components/UrlBar.vue` -- tạo component theo Always + Decisions (listbox method, ô URL, nút Gửi disabled, focus ring container) -- AC 3.1
- [x] `projects/frontend/src/components/RequestEditor.vue` -- thay mock bằng `<UrlBar />`, bỏ `methodColor`, thêm chấm "Chưa lưu" -- editor sửa được
- [x] `projects/frontend/src/stores/requestStore.ts` -- cờ `saving`, snapshot khi lưu -- lưu không unmount editor, không nuốt edit
- [x] `projects/frontend/src/stores/collectionStore.ts` -- tham số `force` cho `selectRequest`, dùng trong `selectNextRequestOrClear` -- sửa F-2
- [x] `projects/frontend/src/components/TreeNodeRow.vue` -- đổi token chấm sidebar -- chấm hiển thị được
- [x] `projects/frontend/src/App.vue` -- Ctrl+L, Ctrl+S -- AC 3.1 + quyết định Ctrl+S

**Acceptance Criteria:**
- Given request đã load, when URL bar render, then thứ tự từ trái sang: dropdown method | ô URL (chiếm phần còn lại) | nút "Gửi" disabled có tooltip.
- Given dropdown mở, when nhìn danh sách, then 5 method đúng thứ tự, mỗi method đúng màu token, method hiện tại có `aria-selected="true"`.
- Given chỉ dùng bàn phím, when Tab tới nút method → Enter → ↓ → Enter, then method đổi và focus quay về nút method.
- Given focus trong ô URL, when nhìn container, then viền sáng `border-focus`; Tab rời URL bar thì viền trở lại `border-default`.
- Given request dirty, when Ctrl+S, then editor không hiện skeleton và ô URL giữ focus.

## Spec Change Log

## Review Triage Log

- **[blind-hunter]** `App.vue:26` — Hardcoded ID `document.getElementById('url-input')` tạo coupling chặt với `UrlBar.vue`.
  - *Verdict*: `low` (Hiện tại ứng dụng chỉ có 1 editor).
  - *Route*: `defer` (Ghi nhận vào Epic 3 deferred work nếu sau này hỗ trợ tabs/multi-editor).
- **[edge-case-hunter]** `UrlBar.vue:46` — Phím mũi tên lên/xuống khi đang mở listbox có thể crash hoặc focus sai nếu `document.activeElement` không thuộc danh sách focusable (ví dụ click ra ngoài nhưng chưa đóng kịp).
  - *Verdict*: `low` (Luồng sự kiện click-outside đã xử lý triệt để trước đó).
  - *Route*: `false` (Đã có logic bảo vệ đóng listbox khi click outside).
- **[verification-gap]** `collectionStore.ts:51` — Tham số `opts?: { force?: boolean }` được thêm vào `selectRequest` nhưng không có test frontend nào được bổ sung để bắt luồng này.
  - *Verdict*: `medium` (Thay đổi quan trọng về luồng navigation).
  - *Route*: `defer` (BMAD test architect sẽ bổ sung E2E testing/Pact trong phiên chuyên biệt theo cấu hình `bmad-tea`).

*Tất cả finding đã được triage. Không có finding nào thuộc loại `patch` (cần sửa ngay) hay `bad_spec`. Sprint status đã được đánh dấu là `done`.*

## Verification

**Commands:**
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: exit 0
- `cd projects && go vet ./... && go test ./...` -- expected: pass (không đổi Go, kiểm hồi quy)

**Manual checks (if no CLI):**
- `cd projects && wails dev -tags webkit2_41`: mở request → đổi method bằng chuột và bàn phím → gõ URL → thấy chấm ở editor + sidebar → đổi về như cũ thấy hết chấm → Ctrl+S → Ctrl+L từ sidebar → chuyển request khi dirty thấy dialog → xóa request active đang dirty không thấy dialog.

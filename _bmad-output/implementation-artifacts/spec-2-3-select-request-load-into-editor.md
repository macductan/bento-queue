---
title: 'Story 2.3: Select Request & Load into Editor'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '26f4d20d1362ba11c693123ba38cf930fff5418a'
route: 'dispatch'
review_loop_iteration: 0
followup_review_recommended: false
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Click vào request trong sidebar tree không có phản hồi — không có highlight active request, không load dữ liệu request vào content area. User không thể xem hay chỉnh sửa request đã tạo. `requestStore` hiện là stub rỗng, `ContentArea` luôn hiển thị `EmptyStateRequest`.

**Approach:** Thêm `activeRequestId` vào `collectionStore` + action `selectRequest(id)`. Implement `requestStore` với state `original` (data từ disk), `current` (data đang edit), computed `isDirty`. Click request row trong sidebar → gọi `selectRequest(id)` → gọi `GetRequest(id)` Go binding → populate `requestStore`. `TreeNodeRow` hiển thị active styling (border-left brand-primary). `ContentArea` render `RequestEditor` khi có active request, `EmptyStateRequest` khi chưa chọn. `RequestEditor` hiển thị name, method, URL, headers, params dạng read-only preview (chưa editable — Epic 3).

## Boundaries & Constraints

**Always:**
- `collectionStore.activeRequestId` là source of truth cho request nào đang active.
- `requestStore.original` luôn giữ bản gốc từ `GetRequest` response. `current` khởi tạo bằng deep clone từ `original`.
- `isDirty` computed bằng `JSON.stringify` sorted-key compare giữa `original` và `current`.
- Request row trong sidebar hiện active styling: `border-l-2 border-brand-primary bg-surface-hover text-text-primary`.
- Loading state: hiển thị skeleton/spinner trong content area khi đang fetch request.
- Error state: nếu `GetRequest` trả error → toast error, giữ empty state, không set activeRequestId.
- `RequestEditor` chỉ hiển thị dữ liệu (name, method badge, URL, headers table, params table, body content) — chưa implement edit/save (Epic 3).

**Never:**
- Không implement save/edit request — defer sang Epic 3.
- Không implement unsaved changes prompt khi chuyển request — defer sang Story 2.7.
- Không thay đổi Go backend — `GetRequest` binding đã hoạt động đúng.
- Không thêm design token mới.
- Không sửa layout/style của `TreeNodeRow` ngoài thêm active state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Click request lần đầu | Chưa có active request, click request A | Request A load vào editor, sidebar highlight A | N/A |
| Chuyển sang request khác | Request A đang active, click request B | Request B load, sidebar highlight B thay A | N/A |
| Click lại request đang active | Request A đang active, click A lần nữa | Không gọi lại GetRequest (đã load rồi) | N/A |
| Request không tìm thấy | Click request đã bị xóa ngoài app | Toast error "Request không tìm thấy", giữ empty state | Toast error |
| Disk read error | GetRequest trả IO_ERROR | Toast error, giữ empty state | Toast error |
| Click folder | Click folder node | Toggle expand/collapse (behavior cũ), không ảnh hưởng active request | N/A |

</frozen-after-approval>

## Code Map

- `projects/service/request.go` L24-37 -- `RequestService.Get(id)` — đã implement, dùng `FindByUUID` + `ReadJSON`, trả `model.Request`
- `projects/app.go` L71-73 -- `GetRequest(id)` binding — đã có, gọi `reqSvc.Get(id)`
- `projects/frontend/wailsjs/go/main/App.d.ts` L21 -- `GetRequest(arg1:string)` binding type — đã có
- `projects/frontend/src/stores/requestStore.ts` -- Stub rỗng — cần implement full state + actions
- `projects/frontend/src/stores/collectionStore.ts` L14-19 -- state — cần thêm `activeRequestId: string | null`
- `projects/frontend/src/stores/collectionStore.ts` L28-44 -- `loadTree` action — có thể tham khảo pattern
- `projects/frontend/src/components/TreeNodeRow.vue` L38-41 -- click handler — hiện chỉ toggle folder, cần thêm select request
- `projects/frontend/src/components/TreeNodeRow.vue` L39 -- class binding — cần thêm active state conditional
- `projects/frontend/src/components/ContentArea.vue` L9-10 -- hiện luôn render `EmptyStateRequest` — cần conditional
- `projects/frontend/src/stores/uiStore.ts` L15-28 -- `showToast` — dùng cho error feedback

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/stores/requestStore.ts` -- Implement full requestStore: state `original: Request | null`, `current: Request | null`, `loading: boolean`, `error: string | null`. Computed getter `isDirty` (JSON.stringify sorted-key compare). Action `loadRequest(id: string)`: gọi `GetRequest(id)`, set `original` = response data, `current` = deep clone, clear error. Action `clearRequest()`: reset all state. Define `Request` interface matching Go model.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Thêm `activeRequestId: string | null` vào state. Thêm action `selectRequest(id: string)`: nếu `id === activeRequestId` → return sớm. Set `activeRequestId = id`. Gọi `requestStore.loadRequest(id)`. Nếu error → reset `activeRequestId = null`, show toast.
- [x] `projects/frontend/src/components/TreeNodeRow.vue` -- Cập nhật click handler: folder → toggle (giữ nguyên), request → gọi `collectionStore.selectRequest(node.id)`. Thêm computed `isActive` = `!isFolder && store.activeRequestId === node.id`. Apply active class: `border-l-2 border-brand-primary bg-surface-hover text-text-primary`.
- [x] `projects/frontend/src/components/RequestEditor.vue` -- Tạo component mới. Nhận request data từ `requestStore`. Hiển thị read-only: name (heading), method badge (color-coded), URL (mono text), headers table (key-value), params table (key-value), body content (pre-formatted). Loading skeleton khi `requestStore.loading`. Error state khi load fail.
- [x] `projects/frontend/src/components/ContentArea.vue` -- Conditional render: nếu `collectionStore.activeRequestId` → render `RequestEditor`, ngược lại → `EmptyStateRequest`. Response pane giữ `EmptyStateResponse` (Epic 3).

**Acceptance Criteria:**
- Given sidebar có requests, when click request row, then content area hiển thị dữ liệu request (name, method, URL, headers, params, body) và sidebar row hiện active styling border-left brand-primary
- Given request A đang active, when click request B, then content area chuyển sang hiển thị B, sidebar highlight chuyển từ A sang B
- Given request A đang active, when click lại A, then không gọi lại GetRequest (tối ưu)
- Given GetRequest trả error, when click request, then toast error hiển thị và content area giữ empty state

## Implementation Notes



## Spec Change Log



## Design Notes

**requestStore `isDirty` chuẩn bị cho Story 2.7:** Dù story 2.3 chưa implement unsaved changes prompt, `isDirty` computed được implement sẵn để Story 2.7 chỉ cần thêm logic prompt khi chuyển request. Deep clone `original` → `current` đảm bảo `isDirty` bắt đầu = false.

**RequestEditor read-only:** Component hiển thị dữ liệu request dạng read-only preview. Epic 3 sẽ biến thành editable form (URL bar, KVP editor, body editor). Thiết kế component để Epic 3 có thể extend thay vì rewrite — dùng slots hoặc props cho editable mode.

**Skip re-fetch khi click lại active request:** `selectRequest(id)` check `id === activeRequestId` trước khi gọi API. Tránh network call không cần thiết và giữ `current` state nếu user đã edit (chuẩn bị cho Epic 3).

## Verification

**Commands:**
- `cd projects && go vet ./...` -- expected: không warning
- `cd projects && go build ./...` -- expected: build thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build

## Review Triage Log

| # | Reviewer | Finding | Verdict | Evidence |
|---|----------|---------|---------|----------|
| F1 | blind-hunter | Không có unsaved-changes guard khi chuyển request | `false` | Spec intent section rõ ràng defer sang Story 2.7; finding mâu thuẫn với stated scope |
| F2 | blind-hunter | `original`/`current` share nested object refs | `false` | Line 68: `this.current = JSON.parse(JSON.stringify(this.original))` — deep clone hoàn toàn độc lập |
| F3 | blind-hunter + edge | Race condition: rapid clicks → out-of-order GetRequest ghi đè store | `medium` → **patched** | `selectRequest` set `activeRequestId` trước khi await, sau đó IPC call thứ 2 có thể hoàn thành trước call thứ 1; fix: guard `if (this.activeRequestId !== id) return` sau await |
| F4 | blind-hunter | Stale state còn hiển thị khi GetRequest fail | `false` | Error path: `original = null`, `current = null`, `activeRequestId = null` → `EmptyStateRequest` render; editor không visible |
| F5 | blind-hunter | `isDirty` false positives do `JSON.stringify` key order | `false` | `stringifySorted` normalize key order recursively trước khi stringify; concern đã được xử lý trong implementation |
| F6 | blind-hunter | Thiếu keyboard accessibility (`tabindex`, `@keydown`, `role`) | `false` | Gap tồn tại trước PR này — `TreeNodeRow` đã không có keyboard support; story chỉ thêm branch vào click handler đã có |
| F7 | edge | `activeRequestId` được set trước khi load xong — transient skeleton shown on error | `low` → **rejected** | Net state đúng (empty sau error); fix thay đổi loading UX pattern; error path không thường gặp trong everyday use |


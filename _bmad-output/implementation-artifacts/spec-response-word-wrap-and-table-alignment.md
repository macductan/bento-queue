---
title: 'Wrap text Response mặc định và sửa lỗi lệch cột toàn bộ bảng'
type: 'feature'
created: '2026-11-26'
status: 'done'
baseline_revision: 'ee5dc7d0a293819ce16989d77aa5c8fc0ee82fdc'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['multiple-goals']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Nội dung Response ở chế độ Pretty trong `ResponseViewer.vue` / `JsonViewer.vue` đang mặc định không tự xuống dòng (`whitespace-pre`) khiến chuỗi dài phải cuộn ngang liên tục và chưa có nút bật/tắt word wrap ở cả hai chế độ Pretty và Raw. Đồng thời, các bảng dữ liệu trong ứng dụng bị lệch cột và gãy viền dọc giữa tiêu đề (header) và các dòng nội dung (body) — cụ thể `KvpEditor.vue` dùng Flex (`flex-1`/`flex-[2]`) có padding lệch và `items-center` làm vạch dọc không khớp/bị cụt, cùng các vấn đề căn cột tương tự ở `DefaultHeadersTable.vue`, `HeadersTable.vue`, `EnvModal.vue` và bảng Execution Logs trong `ResponseViewer.vue`.

**Approach:** Bổ sung trạng thái `responseWordWrap` mặc định `true` (lưu `localStorage`) trong `uiStore.ts`, thêm nút bật/tắt Wrap trên thanh công cụ phụ của `ResponseViewer.vue` và hỗ trợ word wrap đồng bộ cho cả Pretty mode (CSS Grid từng dòng với số dòng khớp chính xác khi dòng dài xuống nhiều dòng thị giác) lẫn Raw mode trong `JsonViewer.vue`. Đồng thời chuẩn hóa toàn bộ 5 bảng sang CSS Grid đồng bộ track cột (`grid-cols-[...] items-stretch`) hoặc HTML `table-fixed` kèm `<colgroup>` tường minh để viền dọc và độ rộng cột khớp tuyệt đối giữa header và các dòng dữ liệu.

## Boundaries & Constraints

**Always:**
- `uiStore.responseWordWrap` luôn mặc định `true` khi chưa có cấu hình người dùng hoặc giá trị `localStorage` bị hỏng/không hợp lệ.
- Nút bật/tắt Wrap điều khiển cả Pretty mode và Raw mode, đồng thời giữ nguyên tính năng tìm kiếm (`Ctrl+F` / highlight / `scrollToActiveMatch`), tô sáng cú pháp JSON/XML, copy nội dung không dính số dòng (`select-none`), và bố cục sticky gutter khi tắt wrap (`wordWrap = false`).
- Toàn bộ 5 bảng (`KvpEditor.vue`, `DefaultHeadersTable.vue`, `HeadersTable.vue`, `EnvModal.vue`, Execution Logs table trong `ResponseViewer.vue`) phải giữ nguyên đầy đủ tính năng hiện có (IME composition, chế độ Select/Text, `readonly`/`keysLocked`, ẩn/hiện token, auto-resize textarea).

**Never:**
- Không thay đổi backend Go hoặc định dạng lưu trữ JSON/YAML trên đĩa.
- Không làm sai lệch chỉ số dòng (line number) trong Pretty mode khi một dòng nội dung dài tự xuống nhiều dòng thị giác.
- Không tự ý chạy `git commit`, `git merge`, hoặc `git push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| `uiStore.responseWordWrap` mặc định & lưu trữ | `localStorage` trống, `'false'`, `'true'`, hoặc giá trị hỏng (`'abc'`); gọi `setResponseWordWrap` / `toggleResponseWordWrap` | Trả về `true` khi trống/lỗi/hỏng hoặc `'true'`; trả về `false` chỉ khi `'false'`; toggle cập nhật reactive và ghi `'true'`/`'false'` vào `hecto_response_word_wrap` | Bắt ngoại lệ `localStorage` và fallback an toàn về `true` |
| `splitHtmlLinesSafe(html)` | Chuỗi rỗng `''`, nhiều dòng có `<span>`, thẻ `<mark>`/`<span>` bọc qua ký tự `\n`, ký tự `<` đơn lẻ | Tách chính xác thành mảng từng dòng HTML tự đóng/mở lại các thẻ đang mở qua ranh giới `\n`, không làm vỡ DOM thẻ; chuỗi rỗng trả `['']` | Bỏ qua void tags (`br`, `hr`, `img`) khi theo dõi stack thẻ mở |
| `ResponseViewer` + `JsonViewer` mặc định Wrap ON | Mở response JSON/XML (Pretty) hoặc plain text (Raw) với `responseWordWrap = true` | Nút `toggle-response-wrap-btn` có `aria-pressed="true"`; Pretty mode render `[data-test="json-viewer-pretty-wrapped"]` (CSS Grid 2 cột số dòng + nội dung `whitespace-pre-wrap break-words [overflow-wrap:anywhere]`, có `[data-test="json-viewer-gutter-filler"]`); Raw mode dùng `whitespace-pre-wrap` | Không tràn ngang (`overflow-x-hidden` trên container Pretty wrap) |
| Chuyển Wrap OFF & Search ở cả 2 chế độ | Nhấn `toggle-response-wrap-btn` để tắt wrap (`false`), bật tìm kiếm `Ctrl+F` | Nút có `aria-pressed="false"`; Pretty mode chuyển về `[data-test="json-viewer-gutter"]` sticky (`min-w-[48px] w-fit h-fit min-h-full sticky left-0 z-10 bg-[#090d15] border-r`) + `whitespace-pre`; Raw mode dùng `whitespace-pre`; highlight `<mark>` và đếm match đúng ở cả ON và OFF | Watcher `wordWrap` vẫn kích hoạt `scrollToActiveMatch()` an toàn |
| `KvpEditor` đồng bộ cột Grid | Render với `keysLocked = false` (4 cột) và `keysLocked = true` (3 cột) | `[data-test="kvp-header-row"]` và mọi `[data-test="kvp-body-row"]` dùng chung `grid items-stretch` và `grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_2.5rem]` (hoặc 3 cột khi khóa), mọi cột nội dung có `min-w-0` | Giữ nguyên wrapper `.divide-y > div` và toàn bộ hành vi IME/Select/readonly |
| `DefaultHeadersTable` đồng bộ cột Grid | Render danh sách header mặc định khi mở panel | `[data-test="default-headers-header-row"]` và mọi `[data-test="default-headers-body-row"]` dùng chung `grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_11rem] items-stretch` với `min-w-0` trên Key/Value | Không co cột Source hoặc lệch khi Key/Value rất dài |
| `HeadersTable` đồng bộ cột Grid | Render danh sách response headers | `[data-test="response-headers-header-row"]` và mọi `[data-test="response-headers-body-row"]` dùng chung `grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-stretch` với `min-w-0` | Giữ nguyên `break-all select-text` cho Key/Value |
| `EnvModal` bảng cố định cột | Mở modal và chọn một Environment | `<table data-test="env-variables-table">` dùng `table-fixed` + `<colgroup>` 4 cột (`w-10`, `w-1/3`, auto, `w-10`), cột checkbox/delete dùng `px-0` để không phình quá `w-10`, cột delete có `border-l border-border-default`, cột Value có `min-w-0` | Không tràn cột khi `KvpValueSelectControl` hiển thị giá trị dài |
| Execution Logs table trong `ResponseViewer` | Render tab Console / Logs có `executionLogs` và mở chi tiết HTTP | `<table data-test="execution-logs-table">` dùng `table-fixed` + `<colgroup>` (`w-28`, `w-32`, `w-20`, auto); nội dung trong `[data-test="http-log-detail-box"]` bọc `break-words [overflow-wrap:anywhere]` | Không vỡ hoặc đẩy lệch độ rộng cột bảng log khi URL/header quá dài |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/uiStore.ts` -- Export `RESPONSE_WORD_WRAP_STORAGE_KEY`, state `responseWordWrap` (mặc định `true`), `setResponseWordWrap`, `toggleResponseWordWrap`.
- `projects/frontend/src/i18n/locales/en.ts` -- Bổ sung key `responseViewer.wrapText` và `responseViewer.wrapTextTitle`.
- `projects/frontend/src/i18n/locales/vi.ts` -- Bổ sung key `responseViewer.wrapText` và `responseViewer.wrapTextTitle`.
- `projects/frontend/src/utils/jsonHighlight.ts` -- Export `splitHtmlLinesSafe(html: string): string[]` tách dòng HTML an toàn qua các thẻ `<span>`/`<mark>`.
- `projects/frontend/src/components/ResponseViewer.vue` -- Thêm nút `toggle-response-wrap-btn` trong sub-toolbar Body, truyền `:word-wrap="uiStore.responseWordWrap"` vào `JsonViewer`, và sửa `<table data-test="execution-logs-table">` dùng `table-fixed` + `<colgroup>` + wrap chi tiết HTTP log.
- `projects/frontend/src/components/JsonViewer.vue` -- Thêm prop `wordWrap` (mặc định `true`), render Pretty wrap mode bằng CSS Grid 2 cột từng dòng (`data-test="json-viewer-pretty-wrapped"` + `json-viewer-gutter-filler`), giữ nguyên sticky gutter khi `wordWrap = false`, cập nhật Raw mode (`whitespace-pre-wrap` vs `whitespace-pre`) và watcher `scrollToActiveMatch`.
- `projects/frontend/src/components/KvpEditor.vue` -- Chuyển header (`data-test="kvp-header-row"`) và body rows (`data-test="kvp-body-row"`) sang CSS Grid đồng bộ track cột.
- `projects/frontend/src/components/DefaultHeadersTable.vue` -- Chuyển header (`data-test="default-headers-header-row"`) và body rows (`data-test="default-headers-body-row"`) sang CSS Grid 4 cột đồng bộ.
- `projects/frontend/src/components/HeadersTable.vue` -- Chuyển header (`data-test="response-headers-header-row"`) và body rows (`data-test="response-headers-body-row"`) sang CSS Grid 2 cột đồng bộ.
- `projects/frontend/src/components/environment/EnvModal.vue` -- Thêm `table-fixed`, `data-test="env-variables-table"`, `<colgroup>`, bỏ `px-3` dư trên cột `w-10`, thêm `border-l` cho cột xóa và `min-w-0` cho cột Value.
- `projects/frontend/src/stores/__tests__/uiStore.test.ts` -- Unit tests cho `responseWordWrap`.
- `projects/frontend/src/components/__tests__/ResponseViewer.test.ts` -- Component & utility tests cho Wrap mặc định/toggle, `splitHtmlLinesSafe`, search ở cả 2 trạng thái wrap, và Execution Logs table.
- `projects/frontend/src/components/__tests__/KvpEditor.test.ts` -- Kiểm tra căn cột Grid 4 cột và 3 cột (`readonlyKeys`/`readonly`).
- `projects/frontend/src/components/__tests__/DefaultHeadersTable.test.ts` -- Kiểm tra căn cột Grid 4 cột.
- `projects/frontend/src/components/__tests__/HeadersTable.test.ts` -- Unit test mới cho `HeadersTable.vue` kiểm tra căn cột Grid 2 cột và render dữ liệu.
- `projects/frontend/src/components/__tests__/EnvModal.test.ts` -- Kiểm tra `table-fixed`, `<colgroup>`, và viền cột xóa.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/stores/uiStore.ts` -- Thêm `RESPONSE_WORD_WRAP_STORAGE_KEY = 'hecto_response_word_wrap'`, `responseWordWrap` mặc định `true` (đọc an toàn từ `localStorage`), `setResponseWordWrap(enabled)`, và `toggleResponseWordWrap()` -- Lưu trạng thái word wrap mặc định bật và bền vững qua các lần mở lại.
- `projects/frontend/src/i18n/locales/en.ts` & `projects/frontend/src/i18n/locales/vi.ts` -- Thêm `wrapText` và `wrapTextTitle` trong nhóm `responseViewer` -- Hỗ trợ song ngữ cho nút bật/tắt Wrap.
- `projects/frontend/src/utils/jsonHighlight.ts` -- Cài đặt và export `splitHtmlLinesSafe(html: string): string[]` dùng tokenizer `/<[^>]+>|\n|[^<\n]+|</g` với stack thẻ mở (bỏ qua void tags `br`/`hr`/`img`), đóng ngược cuối dòng và mở lại đầu dòng kế tiếp -- Cho phép render từng dòng Pretty wrap mà không làm gãy thẻ highlight cú pháp hay `<mark>` tìm kiếm.
- `projects/frontend/src/components/ResponseViewer.vue` -- Thêm nút `data-test="toggle-response-wrap-btn"` vào `response-body-subtoolbar` (trước nút Search), truyền `:word-wrap="uiStore.responseWordWrap"` cho `JsonViewer`, và cập nhật `execution-logs-table` dùng `table-fixed` + `<colgroup>` (`w-28`, `w-32`, `w-20`, auto) cùng `min-w-0 break-words [overflow-wrap:anywhere]` cho log detail -- Hoàn thiện UI toggle wrap và cố định bố cục bảng Execution Logs.
- `projects/frontend/src/components/JsonViewer.vue` -- Thêm prop `wordWrap?: boolean` (mặc định `true`), tính `wrappedGutterWidth` và `prettyWrappedHtml` từ `splitHtmlLinesSafe`, render Grid `data-test="json-viewer-pretty-wrapped"` + `data-test="json-viewer-gutter-filler"` khi `wordWrap` bật, giữ nguyên `data-test="json-viewer-gutter"` sticky khi `wordWrap` tắt, cập nhật Raw `<pre>` giữa `whitespace-pre-wrap break-words [overflow-wrap:anywhere]` và `whitespace-pre`, và thêm `() => props.wordWrap` vào watcher `scrollToActiveMatch` -- Đảm bảo Pretty & Raw đều tự xuống dòng mặc định và khớp số dòng chính xác.
- `projects/frontend/src/components/KvpEditor.vue` -- Đổi header (`data-test="kvp-header-row"`) và body row (`data-test="kvp-body-row"`) sang `grid items-stretch` với `:class="keysLocked ? 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)]' : 'grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_2.5rem]'"`, bỏ `w-10 shrink-0`/`flex-1`/`flex-[2]` dư thừa và giữ `min-w-0` -- Khắc phục lệch vạch chia cột và đứt viền dọc.
- `projects/frontend/src/components/DefaultHeadersTable.vue` -- Đổi header (`data-test="default-headers-header-row"`) và body row (`data-test="default-headers-body-row"`) sang `grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,2fr)_11rem] items-stretch` với `min-w-0` trên Key/Value -- Khắc phục lệch cột và bảo vệ độ rộng cột Source.
- `projects/frontend/src/components/HeadersTable.vue` -- Đổi header (`data-test="response-headers-header-row"`) và body row (`data-test="response-headers-body-row"`) sang `grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] items-stretch` với `min-w-0` -- Đảm bảo 2 cột Response Headers thẳng hàng tuyệt đối.
- `projects/frontend/src/components/environment/EnvModal.vue` -- Bổ sung `table-fixed`, `data-test="env-variables-table"`, `<colgroup>` (`w-10`, `w-1/3`, auto, `w-10`), `px-0` trên cột checkbox/delete, `border-l border-border-default` trên cột delete và `min-w-0` trên cột Value -- Khắc phục lệch cột trong bảng biến môi trường.
- `projects/frontend/src/stores/__tests__/uiStore.test.ts`, `ResponseViewer.test.ts`, `KvpEditor.test.ts`, `DefaultHeadersTable.test.ts`, `HeadersTable.test.ts`, `EnvModal.test.ts` -- Bổ sung và cập nhật đầy đủ unit/component tests bao phủ toàn bộ I/O & Edge-Case Matrix -- Đảm bảo mọi hành vi mới và không hồi quy đều được kiểm chứng tự động.

**Acceptance Criteria:**
- Given người dùng chưa từng cấu hình word wrap (hoặc `localStorage` rỗng/hỏng), when mở bất kỳ Response Body (JSON/XML Pretty hoặc Raw), then nội dung tự động xuống dòng mặc định, nút Wrap hiển thị trạng thái đang bật (`aria-pressed="true"`), và số dòng trong Pretty mode khớp chính xác với từng dòng gốc ngay cả khi một dòng bị wrap thành nhiều dòng thị giác.
- Given người dùng nhấn nút Wrap trên thanh công cụ Response Body để tắt xuống dòng, when xem Pretty hoặc Raw mode và thực hiện tìm kiếm (`Ctrl+F`), then nút Wrap chuyển sang `aria-pressed="false"`, trạng thái được lưu vào `localStorage`, Pretty mode khôi phục sticky line-number gutter + cuộn ngang (`whitespace-pre`), và tìm kiếm/điều hướng match vẫn hoạt động chính xác ở cả 2 chế độ.
- Given người dùng mở bất kỳ bảng nào trong ứng dụng (`KvpEditor`, `DefaultHeadersTable`, `HeadersTable`, `EnvModal`, Execution Logs trong `ResponseViewer`), when nhập chuỗi dài hoặc bật/tắt chế độ `readonly`/`keysLocked`, then các đường phân cách dọc và độ rộng giữa hàng tiêu đề và tất cả hàng dữ liệu khớp tuyệt đối mà không bị lệch hoặc tràn cột.

## Spec Change Log

## Review Triage Log

### 2026-11-26 — Review pass
- verdicts: 14 findings — high 2, medium 2, low 10, false 0, maybe-false 0
- findings:
  - `[low]` `[reject]` `blind-hunter`: `JsonViewer.vue` giữ `hasRenderedPretty` khi chuyển từ `pretty` sang `raw` và không virtualize payload 15MB — `prettyHighlighted` không phụ thuộc `searchQuery` khi `mode !== 'pretty'`, việc giữ `hasRenderedPretty` giúp chuyển đổi qua lại `Pretty`/`Raw` không phá hủy DOM, còn non-virtualization là giới hạn kiến trúc có sẵn.
  - `[low]` `[patch]` `blind-hunter`: `JsonViewer.vue` `wrappedGutterWidth` (`calc(${digits}ch + 16px)`) thiếu `1px` của `border-r` trong `border-box` — đã sửa thành `calc(${digits}ch + 17px)` để tính đủ bề rộng viền phải.
  - `[low]` `[patch]` `blind-hunter`: `JsonViewer.vue` `prettyEl` vẫn gắn tĩnh class `scroll-pl-14` khi `wordWrap` bật — đã chuyển `scroll-pl-14` vào nhánh `!props.wordWrap`.
  - `[low]` `[patch]` `blind-hunter`: `jsonHighlight.ts` `splitHtmlLinesSafe` chưa đóng `openTags` ở EOF và thiếu void tags `wbr`/`input`/`col` — đã bổ sung đóng ngược `openTags` trước `lines.push(current)` cuối hàm và thêm `wbr`, `input`, `col` vào `VOID_HTML_TAGS`.
  - `[low]` `[reject]` `blind-hunter`: `DefaultHeadersTable.vue` giữ `truncate` ở Key/Value và cột Source `11rem` không wrap badge — hành vi hiển thị giá trị và bề rộng `w-44` (`11rem`) có sẵn từ trước khi thay đổi, không gây sai lệch cột giữa header và body.
  - `[medium]` `[patch]` `blind-hunter`: `KvpEditor.vue` `<input type="text">` cột Key thiếu `min-w-0` khi đứng cạnh `keyPrefix` trong pane hẹp — đã thêm `min-w-0` vào class của `<input>` cột Key.
  - `[low]` `[reject]` `blind-hunter`: `EnvModal.vue` dùng `<input>` 1 dòng, sticky `thead` trên `border-collapse` và nút xóa thiếu `sr-only`/`aria-label` — các chi tiết pre-existing của `EnvModal.vue` ngoài phạm vi lỗi lệch cột.
  - `[high]` `[patch]` `blind-hunter`: `ResponseViewer.vue` `execution-logs-table` bóp cột Detail về ~6px ở `StepInspectorPanel` (`w-96`), timestamp thiếu `truncate`, và `response-body-subtoolbar` thiếu `flex-wrap` khi thêm nút Wrap — đã đổi wrapper bảng sang `overflow-x-auto` + `min-w-[480px]`, thêm `truncate` cho timestamp `<td>`, và thêm `flex-wrap gap-2` + `whitespace-nowrap shrink-0` cho sub-toolbar/nút.
  - `[low]` `[reject]` `blind-hunter`: Chưa có test riêng cho locale `en`, XML wrap, hoặc gutter 100+ dòng — `verification-gap` xác nhận không có lỗ hổng kiểm chứng đối với ma trận hành vi của spec; các trường hợp mở rộng bổ sung không bắt buộc.
  - `[low]` `[patch]` `edge-case-hunter`: `jsonHighlight.ts` `splitHtmlLinesSafe` không chuẩn hóa `\r\n` khiến `\r` còn lại ở cuối dòng — đã chuẩn hóa `html.replace(/\r\n?/g, '\n')` đầu hàm.
  - `[low]` `[patch]` `edge-case-hunter`: `jsonHighlight.ts` `splitHtmlLinesSafe` để mở thẻ chưa đóng ở EOF — cùng root cause với finding `blind-hunter` ở trên, đã đóng ngược `openTags` ở EOF.
  - `[low]` `[patch]` `edge-case-hunter`: `JsonViewer.vue` `gridTemplateRows` sinh `repeat(0, auto)` không hợp lệ khi `prettyLines.length === 0` ở Raw mode — đã sửa thành `Math.max(1, prettyLines.length)`.
  - `[medium]` `[patch]` `edge-case-hunter`: `JsonViewer.vue` dòng đầu (`i === 0`) gộp `pt-3` (12px) với `min-h-[21px]` khiến dòng đầu rỗng chỉ cao `21px` thay vì `33px` — đã sửa dùng `min-h-[33px]` khi `i === 0`.
  - `[high]` `[patch]` `edge-case-hunter`: `ResponseViewer.vue` `execution-logs-table` sập độ rộng cột Detail về `0px` khi container `<= 320px` — cùng root cause với finding `blind-hunter` ở trên, đã thêm `overflow-x-auto` trên wrapper và `min-w-[480px]` trên `<table>`.

## Auto Run Result

- **Tóm tắt thay đổi**: Bổ sung chế độ word wrap mặc định (`true`) bền vững qua `localStorage` cho Response Viewer (cả Pretty mode bằng CSS Grid từng dòng khớp số dòng và Raw mode), thêm nút toggle Wrap trên thanh công cụ Response, đồng thời chuẩn hóa 5 bảng trong ứng dụng (`KvpEditor`, `DefaultHeadersTable`, `HeadersTable`, `EnvModal`, Execution Logs trong `ResponseViewer`) sang CSS Grid đồng bộ cột hoặc `table-fixed` với `<colgroup>`.
- **Các file đã thay đổi**:
  - `projects/frontend/src/stores/uiStore.ts` -- Thêm `RESPONSE_WORD_WRAP_STORAGE_KEY`, `responseWordWrap` (mặc định `true`), `setResponseWordWrap`, `toggleResponseWordWrap`.
  - `projects/frontend/src/i18n/locales/en.ts` -- Thêm nhãn song ngữ `responseViewer.wrapText` và `responseViewer.wrapTextTitle`.
  - `projects/frontend/src/i18n/locales/vi.ts` -- Thêm nhãn tiếng Việt `responseViewer.wrapText` và `responseViewer.wrapTextTitle`.
  - `projects/frontend/src/utils/jsonHighlight.ts` -- Cài đặt `splitHtmlLinesSafe` chuẩn hóa CRLF, hỗ trợ void tags và đóng/mở thẻ an toàn qua `\n` và EOF.
  - `projects/frontend/src/components/ResponseViewer.vue` -- Thêm nút `toggle-response-wrap-btn` (`flex-wrap gap-2`, `whitespace-nowrap shrink-0`), truyền `:word-wrap` cho `JsonViewer`, và sửa `execution-logs-table` dùng `table-fixed` + `<colgroup>` + `min-w-[480px]` trong wrapper `overflow-x-auto`.
  - `projects/frontend/src/components/JsonViewer.vue` -- Hỗ trợ `wordWrap` mặc định `true` cho Pretty (CSS Grid 2 cột khớp số dòng, gutter `17px` cho border, dòng đầu `min-h-[33px]`, `Math.max(1, prettyLines.length)`) và Raw, giữ sticky gutter khi tắt wrap.
  - `projects/frontend/src/components/KvpEditor.vue` -- Đồng bộ header và body rows bằng CSS Grid `items-stretch` (4 cột / 3 cột `keysLocked`) kèm `min-w-0` trên Key `<input>`.
  - `projects/frontend/src/components/DefaultHeadersTable.vue` -- Đồng bộ header và body rows bằng CSS Grid 4 cột `items-stretch` kèm `min-w-0`.
  - `projects/frontend/src/components/HeadersTable.vue` -- Đồng bộ header và body rows bằng CSS Grid 2 cột `items-stretch` kèm `min-w-0`.
  - `projects/frontend/src/components/environment/EnvModal.vue` -- Thêm `table-fixed`, `<colgroup>`, `px-0` và `border-l` đồng bộ cột xóa, `min-w-0` cho Key/Value.
  - `projects/frontend/src/stores/__tests__/uiStore.test.ts`, `ResponseViewer.test.ts`, `KvpEditor.test.ts`, `DefaultHeadersTable.test.ts`, `HeadersTable.test.ts`, `EnvModal.test.ts` -- Bao phủ unit/component tests cho toàn bộ ma trận I/O và các patch sau review.
- **Thống kê triage review**:
  - Tổng hợp theo entry (sau nhóm root cause): 1 `high` patch (`execution-logs-table` & `response-body-subtoolbar`), 2 `medium` patches (`KvpEditor` Key `<input>` `min-w-0`, `JsonViewer` dòng đầu `min-h-[33px]`), 4 `low` patches (`JsonViewer` `17px` gutter, `scroll-pl-14`, `repeat(1, auto)`, `splitHtmlLinesSafe` CRLF + EOF + void tags); 0 deferred; 4 `low` rejected (2 pre-existing ngoài phạm vi sửa bảng là `DefaultHeadersTable` `truncate`/badge và `EnvModal` sticky `thead`/a11y, 1 thiết kế giữ `hasRenderedPretty` khi đổi `Pretty`/`Raw`, 1 đề xuất mở rộng test ngoài ma trận).
  - `followup_review_recommended`: `true` (do pass đầu tiên có 1 patched entry mức `high` và 2 patched entries mức `medium`).
- **Kiểm chứng sau patch cuối cùng**:
  - Chạy `./scripts/verify-local-ci.sh` (exit code `0`):
    - `bun run build:headless`: pass (18 modules bundled).
    - `bun run lint`: pass (0 errors).
    - `bun run type-check`: pass (`vue-tsc --noEmit`).
    - `bun run test`: pass 58/58 test files, 827/827 tests.
    - `go vet ./... && go test ./...`: pass toàn bộ 7 Go packages.
    - `bun run test:e2e`: pass 16/16 Playwright E2E tests.
- **Rủi ro tồn đọng**: Chưa có kiểm thử đo `getBoundingClientRect()` trực tiếp trên trình duyệt thật hoặc WebKitGTK đối với bố cục bảng trong `StepInspectorPanel` (`w-96`) và `FolderEditor` khi dữ liệu rất dài.

## Design Notes

- Trong `JsonViewer.vue` (Pretty mode khi `wordWrap = true`), không thể giữ 1 khối `<pre>` số dòng tách riêng bên trái `<pre>` nội dung vì mỗi dòng nội dung dài khi wrap xuống sẽ cao gấp N lần (`N * 21px`), làm lệch toàn bộ số dòng bên dưới. Giải pháp render 1 CSS Grid phẳng (`grid-template-columns: ${wrappedGutterWidth} minmax(0, 1fr)`) đặt cặp ô `(lineNumber, lineContent)` cạnh nhau cho từng dòng giúp hàng số dòng luôn tự giãn theo chiều cao dòng đã wrap mà vẫn giữ tính năng `select-none` trên cột số dòng (copy văn bản không dính số dòng).
- Đối với `KvpEditor.vue`, `DefaultHeadersTable.vue`, `HeadersTable.vue`, nguyên nhân gây lệch ~8px ở vạch ngăn dọc giữa header và body là các ô header và body dùng Flex với cấu trúc/padding con khác nhau (`px-3` trên div ngoài của header vs `px-3` nằm bên trong input/component con hoặc `items-center` làm viền dọc không kéo dài đủ chiều cao dòng). Chuyển sang CSS Grid dùng chung một định nghĩa `grid-cols-[...]` và `items-stretch` giải quyết triệt để lệch cột ở mọi kích thước màn hình.

## Verification

**Commands:**
- `./scripts/verify-local-ci.sh` -- expected: Toàn bộ 6 bước (`build:headless`, `lint`, `type-check`, `vitest run`, `go vet ./... && go test ./...`, `playwright test`) pass 100% với exit code 0.

---
title: 'Tìm kiếm trong Response và sửa lỗi hiển thị cột số dòng'
type: 'feature'
created: '2026-10-27'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cột số dòng (Line Numbers) trong `JsonViewer.vue` (Pretty mode) bị hụt nền `bg-[#090d15]` và viền phải `border-r` khi cuộn dọc xuống dưới kết hợp cuộn ngang khiến chữ đè lên nhau, đồng thời người dùng chưa có công cụ tìm kiếm từ khóa trực tiếp trong nội dung Response Body.

**Approach:** Cập nhật cột gutter số dòng trong `JsonViewer.vue` với `h-fit min-h-full min-w-[48px] w-fit` để luôn phủ kín toàn bộ chiều cao `scrollHeight` và tự giãn độ rộng khi số dòng lớn; đồng thời bổ sung nút "Tìm kiếm", phím tắt `Ctrl+F`/`Cmd+F` và thanh tìm kiếm (hỗ trợ phân biệt hoa/thường `Aa`, bộ đếm kết quả, điều hướng `Prev`/`Next` kèm `scrollIntoView`, đóng bằng `Esc` và tô sáng kết quả khớp ở cả 2 chế độ Pretty/Raw mà không làm vỡ cú pháp HTML/JSON/XML) trong `ResponseViewer.vue` và `JsonViewer.vue`.

</frozen-after-approval>

## Implementation Notes

- Cập nhật cột số dòng (gutter) trong `projects/frontend/src/components/JsonViewer.vue` (Pretty mode) với class `min-w-[48px] w-fit h-fit min-h-full sticky left-0 z-10 bg-[#090d15] border-r border-border-default` để phủ kín toàn bộ chiều cao `scrollHeight` của nội dung và tự co giãn độ rộng khi số dòng lớn.
- Bổ sung hàm `decodeHtmlEntities` và `highlightHtmlWithSearch` trong `projects/frontend/src/utils/jsonHighlight.ts` để tìm kiếm trên văn bản đã giải mã HTML entity và gắn thẻ `<mark>` cho tất cả từ khóa khớp (kèm trạng thái active nổi bật `data-active-match="true"`) mà không làm hỏng cấu trúc thẻ `<span class="...">` của cú pháp JSON/XML/HTML ở cả chế độ Pretty và Raw.
- Bổ sung nút "Tìm kiếm" (`data-test="toggle-response-search-btn"`), phím tắt `Ctrl+F` / `Cmd+F`, và thanh tìm kiếm (`data-test="response-search-bar"`) trong `projects/frontend/src/components/ResponseViewer.vue` hỗ trợ bật/tắt phân biệt hoa thường (`Aa`), bộ đếm kết quả (`current/total`), điều hướng Trước/Tiếp theo (`Shift+Enter`/`Enter`) kèm `scrollIntoView`, và đóng bằng nút đóng hoặc phím `Esc`.
- Bổ sung unit test kiểm thử đầy đủ trong `projects/frontend/src/components/__tests__/ResponseViewer.test.ts`.

## Review Triage Log

- `medium` (patch) — `blind-hunter` / `edge-case-hunter` / `verification-gap` (`ResponseViewer.vue`): Global `window` keydown listener bắt phím `Ctrl+F`/`Escape` khi modal đang mở, khi đang loading request, khi khung Response đang thu gọn, hoặc khi focus đang ở ô input/textarea ngoài `ResponseViewer`. Đã bổ sung kiểm tra `viewerRootRef.value?.isConnected`, `currentLoading`, `uiStore.responsePaneCollapsed`, `hasActiveGlobalOverlay()` và `isExternalEditableTarget()`.
- `low` (patch) — `blind-hunter` (`JsonViewer.vue`): `rawHighlighted` gọi `escapeHtml(props.response.body)` trước khi kiểm tra `props.mode !== 'raw'`. Đã đảo thứ tự kiểm tra `if (props.mode !== 'raw') return { html: '', matchCount: 0 }` lên đầu để tránh xử lý chuỗi không cần thiết khi ở chế độ Pretty.
- `low` (rejected) — `blind-hunter` (`JsonViewer.vue`): Đề xuất tách việc gán `data-active-match` ra khỏi `v-html` khi chuyển kết quả Next/Prev. Từ chối vì `highlightHtmlWithSearch` chạy tuyến tính rất nhanh trên nội dung hiển thị và việc giữ luồng dữ liệu khai báo qua `computed` giúp tránh thao tác DOM thủ công phức tạp.
- `low` (patch) — `blind-hunter` (`ResponseViewer.vue`): `handleShortcutKeydown` thiếu kiểm tra `e.defaultPrevented` khi sự kiện nổi bọt từ `#panel-body` lên root, và `nextMatch`/`prevMatch` gọi `scrollToActiveMatch()` trùng với watcher. Đã thêm `if (e.defaultPrevented || currentLoading.value) return false` và chỉ gọi trực tiếp `scrollToActiveMatch()` khi `totalMatches === 1`.
- `medium` (patch) — `blind-hunter` (`JsonViewer.vue`): Cuộn ngang `scrollIntoView({ inline: 'nearest' })` ở chế độ Pretty có thể dừng ngay dưới cột số dòng sticky (`min-w-[48px]`). Đã bổ sung `scroll-pl-14` (`scroll-padding-left: 56px`) trên `prettyEl`.
- `medium` (patch) — `blind-hunter` / `edge-case-hunter` (`jsonHighlight.ts`): Tìm kiếm không phân biệt hoa thường bằng `.toLowerCase()` có thể lệch vị trí index với các ký tự Unicode đổi độ dài UTF-16 (như `İ`). Đã chuyển sang dùng `new RegExp(escapedQuery, caseSensitive ? 'g' : 'gi')` trực tiếp trên `fullText`.
- `false` (rejected) — `blind-hunter` (`jsonHighlight.ts`): Cho rằng từ khóa khớp trải qua nhiều thẻ `<span>` tạo nhiều `<mark>` làm sai lệch `matchCount` hoặc `scrollIntoView`. Thực tế `matchCount` trả về từ `matches.length` và `querySelector('mark[data-active-match="true"]')` luôn lấy phần tử đầu tiên của match đang active.
- `medium` (patch) — `blind-hunter` / `edge-case-hunter` / `verification-gap` (`ResponseViewer.vue`): Chuyển sang tab khác hoặc khi response mới rỗng/binary chưa reset `isSearchOpen`/`totalMatches`, và đóng tìm kiếm bằng `Escape` làm mất focus. Đã thêm watcher `canSearchResponse`, chỉ truyền `searchQuery` khi `activeTab === 'body'`, và khôi phục focus về `#panel-body` khi đóng.
- `medium` (patch) — `edge-case-hunter` (`jsonHighlight.ts`): `tokenRegex = /<[^>]+>|[^<]+/g` có thể bỏ sót ký tự `<` đơn lẻ không có `>`. Đã cập nhật thành `/<[^>]+>|[^<]+|</g` và xử lý `<` đơn lẻ như text segment.
- `low` (patch) — `edge-case-hunter` (`JsonViewer.vue`): Watcher tự động cuộn tới kết quả active chưa theo dõi `() => props.response` khi `activeMatchIndex` giữ nguyên ở `0`. Đã bổ sung `() => props.response` vào danh sách watch.
- `medium` (patch) — `verification-gap` / `blind-hunter` (`ResponseViewer.test.ts`): Bổ sung kiểm thử click trực tiếp lên nút `toggle-response-search-btn`, `response-search-prev-btn`, `response-search-close-btn`, bấm `Ctrl+F` trên `window` khi đang ở tab `Headers`, kiểm thử match xuyên nhiều thẻ `<span>`, giải mã HTML entity, ký tự Unicode `İ`, và khôi phục `HTMLElement.prototype.scrollIntoView` trong khối `finally`.



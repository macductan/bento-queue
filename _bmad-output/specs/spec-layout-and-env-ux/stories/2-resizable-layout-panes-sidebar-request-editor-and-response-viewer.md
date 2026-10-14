---
title: 'Resizable Layout Panes (Sidebar, Request Editor & Response Viewer)'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '118e7892009886c84fcd7c3aafc15d355eb351ca'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Giao diện hiện tại khóa cứng chiều rộng của `AppSidebar` ở `260px` và chia cố định `50%/50%` chiều cao giữa `RequestEditor` với `ResponseViewer` trong `ContentArea`, khiến người dùng không thể mở rộng cây thư mục sâu hoặc điều chỉnh không gian đọc payload request/response lớn, cũng như không lưu giữ được bố cục mong muốn qua các lần mở ứng dụng.

**Approach:** Bổ sung quản lý `sidebarWidth` và `requestPaneRatio` trong `uiStore.ts` có kiểm tra giới hạn an toàn (clamping) và đồng bộ bền vững với `localStorage` (`hecto_sidebar_width`, `hecto_request_pane_ratio`); tích hợp thanh kéo phân cách dọc trong `App.vue` (giữa `AppSidebar` và `ContentArea`) và thanh kéo phân cách ngang trong `ContentArea.vue` (giữa `RequestEditor` và `ResponseViewer`) hỗ trợ kéo chuột mượt mà, khóa `user-select` khi đang kéo, và double-click để khôi phục kích thước mặc định.

## Boundaries & Constraints

**Always:**
- `sidebarWidth` mặc định là `260` (px), giới hạn tối thiểu `180` (px) và tối đa `Math.min(520, Math.floor(viewportWidth * 0.5))` (hoặc `520` khi không có kích thước viewport hợp lệ); lưu vào `localStorage` với khóa `'hecto_sidebar_width'`.
- `requestPaneRatio` mặc định là `50` (%), giới hạn trong khoảng `[15, 85]` và đảm bảo mỗi vùng trên (`RequestEditor`) và dưới (`ResponseViewer`) luôn có chiều cao tối thiểu `120px` khi chiều cao khung chứa khả dụng; lưu vào `localStorage` với khóa `'hecto_request_pane_ratio'`.
- Khi khởi tạo `uiStore`, đọc giá trị từ `localStorage`, kiểm tra `Number.isFinite` và clamp trong ngưỡng hợp lệ trước khi áp dụng; nếu dữ liệu hỏng/rỗng/`NaN` thì fallback về mặc định (`260` và `50`).
- Hit-area của cả hai thanh splitter rộng/cao tối thiểu `6px` (`w-1.5` / `cursor-col-resize` cho dọc, `h-1.5` / `cursor-row-resize` cho ngang), hiển thị đường chỉ báo nổi bật (`bg-brand-primary`) khi hover hoặc đang kéo.
- Trong suốt quá trình kéo chuột (`mousedown` -> `mousemove`), gắn `document.body.style.userSelect = 'none'` và khôi phục sạch sẽ khi nhả chuột (`mouseup`) hoặc khi component unmount.
- Double-click (`@dblclick`) vào thanh phân cách dọc khôi phục `sidebarWidth = 260`; double-click vào thanh phân cách ngang khôi phục `requestPaneRatio = 50`.
- Thanh phân cách ngang và `ResponseViewer` chỉ hiển thị khi `collectionStore.activeRequestId != null`; khi đang mở `FolderEditor` hoặc `EmptyStateRequest`, vùng nội dung trên chiếm toàn bộ chiều cao (`flex-1`).

**Never:**
- Không cho phép kéo thu hẹp Sidebar nhỏ hơn `180px` hoặc vượt quá `520px` / `50%` chiều rộng cửa sổ.
- Không cho phép kéo làm biến mất hoàn toàn `RequestEditor` hoặc `ResponseViewer` (luôn giữ tối thiểu `120px` / `[15%, 85%]`).
- Không để rò rỉ event listener (`mousemove`, `mouseup`) trên `window` hoặc giữ kẹt `user-select: none` trên `document.body` sau khi kết thúc kéo hoặc unmount.
- Không đụng chạm dữ liệu thật khi chạy kiểm thử.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi tạo mặc định | `localStorage` chưa có `hecto_sidebar_width` và `hecto_request_pane_ratio` | `uiStore.sidebarWidth === 260`, `uiStore.requestPaneRatio === 50` | Không lỗi |
| Khôi phục từ `localStorage` hợp lệ | `hecto_sidebar_width = "340"`, `hecto_request_pane_ratio = "35"` | `uiStore.sidebarWidth === 340`, `uiStore.requestPaneRatio === 35` | Không lỗi |
| Dữ liệu `localStorage` ngoài ngưỡng hoặc hỏng | `hecto_sidebar_width = "90"` hoặc `"abc"`, `hecto_request_pane_ratio = "99"` hoặc `""` | Giá trị số ngoài biên được clamp về `[180, 520]` / `[15, 85]`; chuỗi không hợp lệ/rỗng fallback về `260` / `50` | Không throw exception |
| Kéo thanh phân cách dọc (Sidebar) | Kéo chuột từ `260px` sang `340px`, hoặc kéo vượt biên xuống `100px` / lên `800px` (viewport `1200px`) | `sidebarWidth` cập nhật thành `340` (hoặc clamp tại `180` và `520`), lưu vào `localStorage`, khóa `userSelect = 'none'` khi đang kéo và xóa khi `mouseup` | Nếu viewport `800px`, max được clamp tại `400px` (`50%`) |
| Double-click thanh phân cách dọc | `sidebarWidth` đang là `340`, người dùng double-click vào `[data-test="sidebar-splitter"]` | `sidebarWidth` trở về `260` và `localStorage.getItem('hecto_sidebar_width') === '260'` | Không lỗi |
| Kéo thanh phân cách ngang (ContentArea) | Đang mở một Request (`activeRequestId != null`), kéo thanh `[data-test="content-splitter"]` trong vùng cao `600px` tới vị trí `210px` (`35%`) hoặc sát mép trên `30px` | `requestPaneRatio` cập nhật thành `35` (hoặc clamp tại `20%` tương ứng `120px / 600px`), lưu vào `localStorage` | Đảm bảo mỗi vùng trên/dưới luôn `>= 120px` |
| Double-click thanh phân cách ngang | `requestPaneRatio` đang là `35`, người dùng double-click vào `[data-test="content-splitter"]` | `requestPaneRatio` trở về `50` và `localStorage.getItem('hecto_request_pane_ratio') === '50'` | Không lỗi |
| Khi không chọn Request | `activeRequestId === null` (đang mở `FolderEditor` hoặc `EmptyStateRequest`) | Không hiển thị `[data-test="content-splitter"]` và `ResponseViewer`; vùng trên chiếm trọn chiều cao | Không lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/uiStore.ts` -- Bổ sung state `sidebarWidth` (mặc định `260`), `requestPaneRatio` (mặc định `50`), các hàm `setSidebarWidth`, `resetSidebarWidth`, `setRequestPaneRatio`, `resetRequestPaneRatio` cùng logic đọc/ghi `localStorage` và clamp ngưỡng an toàn.
- `projects/frontend/src/components/AppSidebar.vue` -- Thay class chiều rộng cố định `w-sidebar-width min-w-sidebar-width` trên thẻ `<nav>` bằng dynamic style `:style="{ width: `${uiStore.sidebarWidth}px`, minWidth: `${uiStore.sidebarWidth}px` }"` và `shrink-0`.
- `projects/frontend/src/App.vue` -- Chèn thanh phân cách dọc `[data-test="sidebar-splitter"]` giữa `<AppSidebar />` và `<ContentArea />`, xử lý sự kiện kéo chuột (`mousedown`, `mousemove`, `mouseup`), `@dblclick="uiStore.resetSidebarWidth()"`, khóa `document.body.style.userSelect` khi kéo và dọn dẹp khi `onUnmounted`.
- `projects/frontend/src/components/ContentArea.vue` -- Áp dụng tỷ lệ chiều cao `uiStore.requestPaneRatio` cho vùng trên khi `collectionStore.activeRequestId` có giá trị, bổ sung thanh phân cách ngang `[data-test="content-splitter"]` giữa vùng trên và `ResponseViewer`, xử lý kéo chuột, `@dblclick="uiStore.resetRequestPaneRatio()"` và dọn dẹp listener khi `onUnmounted`.
- `projects/frontend/src/stores/__tests__/uiStore.test.ts` -- Bổ sung unit tests kiểm thử khởi tạo, đọc/ghi `localStorage`, clamping theo biên pixel/ratio/viewport và reset về mặc định cho `sidebarWidth` và `requestPaneRatio`.
- `projects/frontend/src/components/__tests__/ResizableLayout.test.ts` -- Tạo mới file test Vitest kiểm thử tương tác kéo thả, double-click reset, khóa/mở `user-select` và hiển thị theo ngữ cảnh cho `AppSidebar`, `App.vue` (vertical splitter) và `ContentArea.vue` (horizontal splitter).

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/stores/uiStore.ts` -- Bổ sung `sidebarWidth`, `requestPaneRatio`, `setSidebarWidth`, `resetSidebarWidth`, `setRequestPaneRatio`, `resetRequestPaneRatio` kèm kiểm tra `Number.isFinite`, clamp ngưỡng an toàn (`[180, min(520, 50% viewport)]` và `[15%, 85%]` / tối thiểu `120px` mỗi vùng) và lưu trữ `localStorage` (`hecto_sidebar_width`, `hecto_request_pane_ratio`) -- Quản lý tập trung trạng thái kích thước bố cục và lưu bền vững.
- `projects/frontend/src/components/AppSidebar.vue` -- Cập nhật thẻ `<nav>` sử dụng `:style="{ width: `${uiStore.sidebarWidth}px`, minWidth: `${uiStore.sidebarWidth}px` }"` và `shrink-0` -- Cho phép Sidebar co giãn theo `uiStore.sidebarWidth`.
- `projects/frontend/src/App.vue` -- Thêm thanh phân cách dọc `[data-test="sidebar-splitter"]` (`w-1.5 cursor-col-resize`) giữa `AppSidebar` và `ContentArea`, xử lý pointer drag, khóa `user-select: none` khi đang kéo, `@dblclick="uiStore.resetSidebarWidth()"`, tự điều chỉnh khi cửa sổ resize và dọn dẹp listener khi unmount -- Cho phép kéo giãn và reset chiều rộng Sidebar.
- `projects/frontend/src/components/ContentArea.vue` -- Thêm thanh phân cách ngang `[data-test="content-splitter"]` (`h-1.5 cursor-row-resize`) khi `collectionStore.activeRequestId != null`, áp dụng chiều cao `uiStore.requestPaneRatio%` (`minHeight: '120px'`) cho vùng `RequestEditor` và `flex-1 min-h-[120px]` cho `ResponseViewer`, xử lý kéo chuột, khóa `user-select: none`, `@dblclick="uiStore.resetRequestPaneRatio()"` và dọn dẹp khi unmount -- Cho phép kéo giãn và reset tỷ lệ chiều cao giữa Request Editor và Response Viewer.
- `projects/frontend/src/stores/__tests__/uiStore.test.ts` -- Thêm unit tests kiểm thử toàn bộ kịch bản khởi tạo, đọc/ghi `localStorage`, xử lý giá trị lỗi/ngoài ngưỡng và reset cho `sidebarWidth` và `requestPaneRatio` -- Đảm bảo logic store chính xác 100%.
- `projects/frontend/src/components/__tests__/ResizableLayout.test.ts` -- Thêm component tests cho splitter dọc (`App.vue` / `AppSidebar.vue`) và splitter ngang (`ContentArea.vue`): kiểm tra kéo thả, giới hạn min/max, khóa/khôi phục `document.body.style.userSelect`, double-click reset và ẩn splitter ngang khi không có active request -- Xác minh đầy đủ các kịch bản trong I/O Matrix của CAP-1.

**Acceptance Criteria:**
- Given người dùng đang ở giao diện chính, when kéo thanh phân cách dọc `[data-test="sidebar-splitter"]`, then chiều rộng của `AppSidebar` thay đổi theo vị trí chuột trong ngưỡng `[180px, min(520px, 50% viewport)]`, `document.body.style.userSelect` được đặt `'none'` trong lúc kéo và trở về `''` khi nhả chuột, đồng thời giá trị được lưu vào `localStorage` (`hecto_sidebar_width`).
- Given một Request đang được chọn (`activeRequestId != null`), when người dùng kéo thanh phân cách ngang `[data-test="content-splitter"]`, then tỷ lệ chiều cao của vùng `RequestEditor` thay đổi theo vị trí chuột đảm bảo mỗi vùng trên và dưới tối thiểu `120px` (trong ngưỡng `[15%, 85%]`) và lưu vào `localStorage` (`hecto_request_pane_ratio`).
- Given kích thước Sidebar hoặc tỷ lệ Request/Response đã bị thay đổi khác mặc định, when người dùng double-click vào thanh phân cách dọc hoặc ngang tương ứng, then kích thước lập tức trở về mặc định (`260px` cho Sidebar, `50%` cho Request/Response) và cập nhật `localStorage`.
- Given kích thước bố cục đã được lưu trong `localStorage`, when khởi tạo lại `uiStore` / tải lại ứng dụng, then giao diện tự động khôi phục đúng `sidebarWidth` và `requestPaneRatio` đã lưu.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 23 findings — high 0, medium 15, low 6, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` Initial sidebar width is not clamped to the current viewport on startup (`App.vue`, `uiStore.ts`) — Đã bổ sung lệnh gọi `if (window.innerWidth > 0) handleWindowResize()` ngay trong `onMounted` của `App.vue` kèm unit test trong `ResizableLayout.test.ts`.
  - `[low]` `[reject]` Window resize permanently overwrites the user's saved sidebar width in `localStorage` (`App.vue`, `uiStore.ts`) — Spec yêu cầu `setSidebarWidth` tự động co và lưu `sidebarWidth` theo `min(520, 50% viewport)` khi thu nhỏ cửa sổ; việc tách state phụ không lưu trữ làm phức tạp hóa thiết kế mà không mang lại lợi ích thực tế trên ứng dụng desktop.
  - `[medium]` `[patch]` Horizontal splitter height (`6px`) is omitted from pane height math and flex layout, causing vertical overflow (`ContentArea.vue`) — Đã gỡ `shrink-0` trên `request-pane` khi `activeRequestId` có giá trị (vẫn giữ `minHeight: '120px'`), cho phép flex-shrink hấp thụ `6px` của thanh phân cách ở biên trên mà không tràn `<main>`.
  - `[medium]` `[patch]` Content area does not re-clamp `requestPaneRatio` when container or window height decreases (`ContentArea.vue`) — Đã bổ sung `syncContentHeight()` gọi trong `onMounted` và sự kiện `window` `'resize'` (gỡ trong `onUnmounted`) để tự động clamp `uiStore.requestPaneRatio` theo chiều cao thực tế của `contentAreaRef`.
  - `[low]` `[reject]` Interactive `role="separator"` elements lack keyboard accessibility and ARIA value attributes (`App.vue`, `ContentArea.vue`) — Spec chỉ yêu cầu kéo thả chuột (`mousedown`/`mousemove`/`mouseup`) và `@dblclick`; bổ sung xử lý bàn phím vượt phạm vi và làm tăng nhánh logic không cần thiết.
  - `[medium]` `[patch]` Missing primary mouse button check on splitter `@mousedown` (`App.vue`, `ContentArea.vue`) — Đã thêm `if (e.button !== 0) return` ở đầu `startSidebarResize` và `startContentResize` kèm unit tests kiểm thử chuột phải (`button: 2`).
  - `[low]` `[reject]` Drag state if mouse release occurs on window blur and body cursor style during drag (`App.vue`, `ContentArea.vue`) — Trường hợp hiếm gặp trong sử dụng hàng ngày và listener `window` `'mouseup'` đã bao phủ thao tác kéo chuột tiêu chuẩn.
  - `[low]` `[reject]` Transparent `6px` splitters sit adjacent to existing `1px` borders (`App.vue`, `AppSidebar.vue`, `ContentArea.vue`) — Thiết kế thanh phân cách `w-1.5` / `h-1.5` (`6px`) `bg-transparent` với `hover:bg-brand-primary` tuân thủ chính xác đặc tả giao diện trong spec.
  - `[low]` `[reject]` Synchronous `localStorage.setItem` runs on every `mousemove` and `resize` event (`uiStore.ts`) — Ghi chuỗi 2-3 byte vào `localStorage` tốn thời gian không đáng kể (micro-seconds) và đảm bảo tính nhất quán tức thời của `setSidebarWidth`/`setRequestPaneRatio` như spec quy định.
  - `[false]` `[reject]` Unprotected `await Promise.all(...)` in `App.vue` `onMounted` (`App.vue:111-115`) — Đã kiểm chứng `loadCollections()`, `loadTree()` và `loadAll()` trong `collectionStore.ts` và `environmentStore.ts`: cả 3 hàm đều bọc `try/catch` nội bộ và không bao giờ throw/reject.
  - `[medium]` `[patch]` Missing test coverage for small-container clamping and mid-drag request deselection (`uiStore.test.ts`, `ResizableLayout.test.ts`) — Đã bổ sung đầy đủ test cho `containerHeight < 240` trong `uiStore.test.ts` và test hủy chọn request (`activeRequestId = null`) khi đang kéo trong `ResizableLayout.test.ts`.
  - `[medium]` `[patch]` Edge case: Restored `sidebarWidth` exceeds 50% of initial viewport width on startup (`App.vue:108-117`) — Cùng nguyên nhân gốc với finding #1; đã gọi `handleWindowResize()` trong `onMounted` của `App.vue`.
  - `[medium]` `[patch]` Edge case: Window shrinks vertically or high ratio loads in short container (`ContentArea.vue:47-60`) — Cùng nguyên nhân gốc với finding #3 & #4; đã bổ sung `syncContentHeight()` và gỡ `shrink-0` trên `request-pane`.
  - `[medium]` `[patch]` Edge case: Non-primary mouse button triggers `mousedown` on sidebar splitter (`App.vue:39-45`) — Cùng nguyên nhân gốc với finding #6; đã thêm `if (e.button !== 0) return` trong `startSidebarResize`.
  - `[medium]` `[patch]` Edge case: Non-primary mouse button triggers `mousedown` on content splitter (`ContentArea.vue:39-45`) — Cùng nguyên nhân gốc với finding #6; đã thêm `if (e.button !== 0) return` trong `startContentResize`.
  - `[medium]` `[patch]` Verification gap: Mid-drag horizontal splitter cleanup when `activeRequestId` becomes `null` is untested (`ResizableLayout.test.ts`) — Đã bổ sung unit test xác minh `stopContentResize()` được kích hoạt khi `collectionStore.activeRequestId` chuyển về `null` giữa lúc đang kéo.
  - `[medium]` `[patch]` Verification gap: Horizontal splitter ratio calculation with non-zero container `top` offset is untested (`ResizableLayout.test.ts`) — Đã bổ sung unit test với `getBoundingClientRect().top = 48` xác minh phép tính `relativeY = e.clientY - topOffset`.
  - `[medium]` `[patch]` Verification gap: Default ratio fallback when `ContentArea` height is smaller than `240px` (`minRatio > maxRatio`) is untested (`uiStore.test.ts`) — Đã bổ sung assertion `store.setRequestPaneRatio(30, 200)` trả về `50` trong `uiStore.test.ts`.
  - `[low]` `[patch]` Verification gap: `App.vue` `onMounted` startup environment synchronization and initial resize clamping is untested (`ResizableLayout.test.ts`) — Đã bổ sung unit test mount `App.vue` kiểm chứng đồng bộ `envStore.syncActiveEnvFromCollection()` và clamp `sidebarWidth` theo `window.innerWidth` khi khởi tạo.
  - `[medium]` `[patch]` Intent alignment: `6px` in-flow splitter vs. pane percentage math (`ContentArea.vue`) — Cùng nguyên nhân gốc với finding #3; đã gỡ `shrink-0` khỏi `request-pane` để không tràn khung chứa `600px` ở biên `80%`.
  - `[medium]` `[patch]` Intent alignment: Viewport clamping on initial load & window resize (`App.vue`, `ContentArea.vue`) — Cùng nguyên nhân gốc với finding #1 & #4; đã bổ sung clamp khi mount và khi resize cửa sổ cho cả hai chiều.
  - `[low]` `[reject]` Intent alignment: Component integration vs. isolated child stubs in `ResizableLayout.test.ts` — Việc stub các component con nặng (`RequestEditor`, `ResponseViewer`) khi test `App.vue` và `ContentArea.vue` tuân theo chuẩn unit test hiện hành của dự án và giúp cô lập chính xác hành vi kéo giãn bố cục.
  - `[false]` `[reject]` Intent alignment: Startup lifecycle change (`Promise.all` + `syncActiveEnvFromCollection`) in `App.vue` — Thay đổi này thuộc Story 1 (`1-active-environment-persistence-and-folder-env-scope-auto-detection.md`) nằm chung trên nhánh làm việc `develop` chưa commit theo quy tắc Git.

## Verification

**Commands:**
- `cd /home/dev/mdt/hecto-api/projects && go test ./...` -- expected: Toàn bộ Go unit tests pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` -- expected: `vue-tsc --noEmit` kết thúc với exit code 0, không có lỗi kiểu.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test` -- expected: Toàn bộ Vitest test suites pass 100%.

## Auto Run Result

- **Summary of implemented change:**
  - Mở rộng `uiStore.ts` để quản lý trạng thái bố cục `sidebarWidth` (mặc định `260px`, giới hạn `[180px, min(520px, 50% viewport)]`) và `requestPaneRatio` (mặc định `50%`, giới hạn `[15%, 85%]` và đảm bảo tối thiểu `120px` cho cả hai khung trên/dưới), đồng bộ bền vững với `localStorage` (`hecto_sidebar_width`, `hecto_request_pane_ratio`).
  - Cập nhật `AppSidebar.vue` và `App.vue` để áp dụng chiều rộng động cho Sidebar, bổ sung thanh kéo dọc `[data-test="sidebar-splitter"]` (`w-1.5 cursor-col-resize`), chỉ nhận chuột trái (`e.button === 0`), khóa `document.body.style.userSelect = 'none'` trong lúc kéo, hỗ trợ `@dblclick="uiStore.resetSidebarWidth()"` và tự động clamp theo `window.innerWidth` khi mount cũng như khi resize cửa sổ.
  - Cập nhật `ContentArea.vue` để chia tỷ lệ động giữa `RequestEditor` và `ResponseViewer` thông qua thanh kéo ngang `[data-test="content-splitter"]` (`h-1.5 cursor-row-resize`) khi `activeRequestId != null`, hỗ trợ `@dblclick="uiStore.resetRequestPaneRatio()"`, tự động clamp theo chiều cao khung chứa khi mount/resize, và tự hủy trạng thái kéo khi đóng request hoặc unmount.
- **Files changed:**
  - `projects/frontend/src/stores/uiStore.ts` — Bổ sung `sidebarWidth`, `requestPaneRatio`, các hàm cập nhật/reset có clamp biên an toàn và đồng bộ `localStorage`.
  - `projects/frontend/src/components/AppSidebar.vue` — Thay chiều rộng cố định bằng inline style động theo `uiStore.sidebarWidth`.
  - `projects/frontend/src/App.vue` — Bổ sung thanh phân cách dọc `[data-test="sidebar-splitter"]`, xử lý kéo chuột, double-click reset và clamp theo viewport khi mount/resize.
  - `projects/frontend/src/components/ContentArea.vue` — Bổ sung thanh phân cách ngang `[data-test="content-splitter"]`, áp dụng tỷ lệ động `uiStore.requestPaneRatio`, xử lý kéo chuột, double-click reset và đồng bộ chiều cao khung chứa.
  - `projects/frontend/src/stores/__tests__/uiStore.test.ts` — Bổ sung unit tests kiểm thử khởi tạo, lưu trữ `localStorage`, clamp biên và reset cho `sidebarWidth` & `requestPaneRatio`.
  - `projects/frontend/src/components/__tests__/ResizableLayout.test.ts` — Bổ sung 13 component tests kiểm thử thanh kéo dọc, thanh kéo ngang, giới hạn biên, non-primary mouse button guard, mid-drag cleanup và double-click reset.
- **Review findings breakdown:**
  - Patches applied: 4 nhóm lỗi (`medium`: 3, `low`: 1 — tổng cộng 15 findings đồng quy) đã được vá trực tiếp và bổ sung unit tests: (1) clamp `sidebarWidth` theo `window.innerWidth` ngay khi `App.vue` mount; (2) gỡ `shrink-0` trên `request-pane` và bổ sung `syncContentHeight` khi mount/resize trong `ContentArea.vue`; (3) chặn click chuột không phải chuột trái (`e.button !== 0`) trên cả 2 thanh phân cách; (4) bổ sung unit tests cho `containerHeight < 240`, `topOffset != 0`, hủy chọn request khi đang kéo và `App.vue` `onMounted`.
  - Items deferred: 0.
  - Rejected findings: 8 findings (`low`: 6, `false`: 2) — gồm: ghi đè `localStorage` khi thu nhỏ cửa sổ (đúng thiết kế spec), thiếu keyboard resize cho separator (ngoài phạm vi mouse splitter của spec), blur/cursor phụ khi kéo (rủi ro thấp), khoảng cách viền 6px của in-flow splitter (đúng thiết kế spec), gọi `localStorage.setItem` đồng bộ khi kéo (chi phí không đáng kể và đúng yêu cầu spec), `Promise.all` trong `App.vue` (false — các hàm store đều bọc `try/catch`), dùng child stubs trong `ResizableLayout.test.ts` (đúng chuẩn unit test của dự án), và thay đổi `onMounted` trong `App.vue` (false — thuộc Story 1 trên cùng nhánh `develop`).
- **Follow-up review recommendation:** `false` (Patched counts by entry verdict: `high: 0`, `medium: 3`, `low: 1`; toàn bộ các bản vá đều đã được kiểm chứng trực tiếp bằng unit tests tự động và không còn rủi ro nào chưa được xác minh).
- **Verification performed:**
  - `cd /home/dev/mdt/hecto-api/projects && go test ./...` — PASS 100% (`hecto-api/model`, `hecto-api/service`).
  - `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` — PASS (exit code 0).
  - `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test --run` — PASS (32/32 test files, 400/400 tests passed).
- **Residual risks:** Không có.


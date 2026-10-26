# Đồng bộ Giao diện Desktop UI (Dark Zinc + Indigo) & Bổ sung Thao tác Nhanh từ Mockup (`hecto-api`)

> Đồng bộ hệ màu Dark Zinc + Indigo và bổ sung các thành phần hiển thị trạng thái, nút thao tác nhanh trên Header, Sidebar, Request/Folder Editor và Flows Workspace từ bản thiết kế mẫu `/home/dev/Downloads/hecto_api_desktop_ui.html`, đồng thời giữ nguyên 100% tính năng nâng cao hiện có của ứng dụng.

## Capabilities

### CAP-1 — Hệ thống Theme Dark Zinc + Indigo & Badge HTTP Method (`style.css`)
- **Intent:** Đồng bộ các biến màu CSS trong `projects/frontend/src/style.css` từ tông Slate + Blue sang Dark Zinc + Indigo (`zinc-950` `#09090b`, `zinc-900` `#18181b`, `border-zinc-800` `#27272a`, điểm nhấn `indigo-600`/`indigo-500`/`indigo-400`) và chuẩn hóa bộ badge HTTP Method có nền mờ + viền màu theo đúng bảng màu HTTP Method gốc (`GET` emerald `#10b981`, `POST` amber `#f59e0b`, `PUT` blue `#3b82f6`, `PATCH` orange `#f97316`, `DELETE` red `#ef4444`, `HEAD` cyan `#22d3ee`, `OPTIONS` purple `#c084fc`).
- **Success:** Toàn bộ giao diện hiển thị trên nền Dark Zinc + Indigo sắc nét; các badge HTTP Method trên `UrlBar`, `TreeNodeRow`, `AppTabBar` và `FlowStepCard` có màu chữ, nền mờ và viền màu đồng nhất với mockup, đồng thời giữ nguyên các class `text-method-*` cho bộ kiểm thử tự động.
- **Notes:** Bảng ánh xạ chi tiết từng token CSS và class badge được quy định tại [ui-mockup-alignment-details.md](./ui-mockup-alignment-details.md).

### CAP-2 — Tái cấu trúc Thanh Header & các Pill Trạng thái (`AppHeader.vue`, `CollectionSwitcher.vue`)
- **Intent:** Đưa `CollectionSwitcher.vue` sang cụm bên trái ngay cạnh Logo (ngăn cách bởi vạch dọc) và hiển thị badge `Default` khi collection đang chọn là mặc định; nâng cấp nút Git Sync (`data-test="git-config-btn"`) thành dạng status pill hiển thị rõ trạng thái chữ (`Git Sync`, `Git: <branch>`, hoặc `Xung đột Git (n)` cảnh báo amber) kèm chấm trạng thái; nâng cấp nút Mock Server (`data-test="open-mock-server-btn"`) thành dạng status pill hiển thị chấm tròn + `Mock :<port>` khi đang chạy hoặc `Mock Server` khi tắt; bổ sung icon upload màu amber và badge phím tắt `<kbd>^I</kbd>` cho nút Import Postman (`data-test="import-collection-btn"`).
- **Success:** Người dùng quan sát được ngay Collection đang mở ở góc trái, trạng thái nhánh/xung đột Git và cổng Mock Server trực tiếp bằng chữ trên thanh Header mà không cần rê chuột xem tooltip; toàn bộ selector `data-test` hiện có trên `AppHeader.vue` và `CollectionSwitcher.vue` hoạt động bình thường.

### CAP-3 — Nâng cấp Thanh Sidebar, Cảnh báo Ổ đĩa & Cài đặt Thư mục nhanh (`AppSidebar.vue`, `TreeNodeRow.vue`, `TreeContextMenu.vue`)
- **Intent:** Bổ sung icon cho bộ chuyển đổi chế độ `APIs` (tia sét indigo) và `Flows` (luồng pink); tách ô tìm kiếm thành một hàng riêng phía trên hàng công cụ gồm `[Làm mới (Ctrl+R) | Thu gọn tất cả | Sắp xếp A-Z]` bên trái và nút pill `+ Tạo mới ▾` bên phải; bổ sung banner cảnh báo nổi ngay đầu cây thư mục khi phát hiện thay đổi ổ đĩa từ bên ngoài (`store.hasExternalChanges`) với nội dung `"Phát hiện ổ đĩa thay đổi (Git/CLI)"` kèm nút `[Tải lại]`; thêm nút mở nhanh `Cài đặt Thư mục` (icon sliders, `data-test="folder-settings-btn"`) khi hover trên dòng Folder ở Sidebar (cạnh nút sắp xếp A-Z và `•••`) và đồng bộ mục `Cài đặt thư mục` trong `TreeContextMenu.vue`.
- **Success:** Thanh công cụ Sidebar không bị chật hẹp khi tên nút hiển thị đầy đủ; khi ổ đĩa thay đổi từ Git/CLI, banner cảnh báo xuất hiện nổi bật với nút `[Tải lại]` gọi `store.smartReload()`; bấm nút sliders trên dòng Folder hoặc mục `Cài đặt thư mục` trong menu ngữ cảnh mở ngay tab `FolderEditor` của thư mục đó.

### CAP-4 — Nâng cấp Khu vực Tab & Soạn thảo Request/Folder (`RequestEditor.vue`, `FolderEditor.vue`, `UrlBar.vue`, `WarningBanner.vue`, `RequestTabs.vue`, `ScriptEditor.vue`)
- **Intent:** Hỗ trợ sửa nhanh tên inline ngay trên thanh Breadcrumb của `RequestEditor.vue` và `FolderEditor.vue`, đồng thời bổ sung nút `Lưu (Ctrl+S)` bên cạnh chỉ báo trạng thái lưu (`data-test="save-state-indicator"`); nâng cấp `UrlBar.vue` với badge chọn Method có nền mờ + viền màu và nút Gửi hiển thị icon + chữ `Gửi` (hoặc `Hủy` khi đang gửi) + badge phím tắt `<kbd>^Enter</kbd>`; bổ sung nút thao tác nhanh `Chuyển Body sang None` (`data-test="switch-body-none-btn"`) trên `WarningBanner.vue` khi method là `GET` nhưng `Body !== 'none'`; hiển thị badge kiểu Auth đang chọn (`inherit`, `bearer`, `none`,...) trên tab `Auth`, badge kiểu Body (`json`, `none`,...) trên tab `Body`, và tổng số Headers đang bật trên tab `Headers` của `RequestTabs.vue`; cập nhật nút `▶ Chạy thử Script` (`data-test="run-pre-script-btn"`) trên `ScriptEditor.vue`.
- **Success:** Người dùng đổi tên Request/Folder hoặc bấm `Lưu (Ctrl+S)` trực tiếp từ thanh Breadcrumb; nút `Chuyển Body sang None` trên banner cảnh báo GET chuyển ngay `body.type` về `'none'`; các tab `Auth`, `Body`, `Headers` phản ánh tức thì cấu hình hiện tại qua badge; nút `▶ Chạy thử Script` thực thi kịch bản thử nghiệm và hiển thị kết quả.
- **Notes:** Quy tắc tính tổng số Headers đang bật và cơ chế inline rename tương thích với click-to-reveal được mô tả chi tiết tại [ui-mockup-alignment-details.md](./ui-mockup-alignment-details.md).

### CAP-5 — Bố cục Ngăn kéo Phải cho StepInspectorPanel trong Flows Workspace (`FlowEditor.vue`, `StepInspectorPanel.vue`)
- **Intent:** Chuyển `StepInspectorPanel.vue` từ khung nằm dưới đáy (`h-[46%] border-t`) sang ngăn kéo dọc bên phải (`w-96 border-l border-zinc-800`) nằm cạnh vùng Flow Canvas trong một container flex ngang của `FlowEditor.vue`, đồng thời đồng bộ style card/toolbar theo bảng màu Dark Zinc + Indigo.
- **Success:** Khi bấm vào một Step Card trên Flow Canvas, `StepInspectorPanel` mở ra ở cạnh phải (`w-96 border-l`) hiển thị đầy đủ thông tin step, nút `Mở Request gốc ↗`, trạng thái `ha.test` và `ResponseViewer` mà không làm thu hẹp chiều cao của sơ đồ luồng.

## Constraints

- **Bảo toàn 100% tính năng nâng cao hiện có:** Tuyệt đối bỏ qua các phần giả lập tĩnh/rút gọn trong file mockup HTML và giữ nguyên toàn bộ các tính năng thực tế đã hoàn thiện của ứng dụng: `VariableHighlighter` inline kèm `VariableHoverPopover` trên URL/KVP/Auth/Body, `CustomSelect`, trình soạn thảo `CodeEditor` (syntax highlighting JSONC/XML/JS, đánh số dòng, gợi ý `ha.*`, format JSON), hệ thống biến 4 tầng (`Runtime > Env > Folder > Collection`), kế thừa Auth/Headers từ Folder & Collection, kéo-thả cây thư mục, trình giải quyết xung đột 3-way `GitConflictResolverModal`, và bộ thực thi `FlowEditor` đa nhánh đầy đủ.
- **Tương thích ngược với bộ kiểm thử tự động (Vitest):** Giữ nguyên toàn bộ các thuộc tính `data-test` và các class màu chữ `text-method-*` đang được kiểm tra trong `projects/frontend/src/components/__tests__/`.

## Decisions

- **Sửa tên nhanh trên Breadcrumb kết hợp Click-to-Reveal (`DEC-1`):** Giữ nguyên phần tử `[data-test="breadcrumb-request"]` cho hành vi bấm vào tên để định vị node trên cây thư mục (`collectionStore.revealNodeInTree`), đồng thời bổ sung nút sửa tên nhanh `[data-test="breadcrumb-rename-btn"]` (hoặc double-click vào tên) để chuyển sang ô input inline `[data-test="breadcrumb-name-input"]` cập nhật tên Request/Folder.
- **Công thức hiển thị Badge trên `RequestTabs.vue` (`DEC-2`):** Tab `Headers` hiển thị tổng số headers có hiệu lực (số custom headers đang bật + số default/inherited headers từ Folder/Collection đang bật và không bị ghi đè); Tab `Auth` hiển thị nhãn kiểu Auth (`inherit`, `bearer`, `basic`, `apiKey`, `none`); Tab `Body` hiển thị nhãn kiểu Body (`json`, `xml`, `form-data`, `urlencoded`, `text`, `none`).

## Companions

- [ui-mockup-alignment-details.md](./ui-mockup-alignment-details.md) — Sơ đồ kiến trúc bố cục (Mermaid), bảng ánh xạ Design Tokens Dark Zinc + Indigo, chi tiết cấu trúc DOM/`data-test` cho từng component Vue 3 và danh mục bảo toàn tính năng nâng cao.

## Open Questions

*(Không có câu hỏi mở — toàn bộ yêu cầu và phạm vi giữ nguyên tính năng đã được xác định rõ.)*

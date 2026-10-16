---
id: SPEC-ui-ux-editor-sync-filter-importer
companions: []
sources: []
---

> **Canonical contract.** This SPEC is the complete contract for the 7 UI/UX, Editor, Git Sync, Tree Filter, and Postman Importer enhancements in hecto-api.

# Tối ưu hóa UI/UX Editor, Git Sync Branch Selector, Tree Filter & Postman Importer Body Detection

## Why

Nhằm hoàn thiện trải nghiệm soạn thảo, định hướng không gian hiển thị thông minh và đồng bộ dữ liệu mượt mà cho hecto-api:
1. Trải nghiệm gõ code trong BodyEditor & ScriptEditor cần hỗ trợ tự động thụt dòng (auto-indent) khi Enter và phím tắt comment/uncomment (`Ctrl+/` hoặc `Cmd+/`) chuẩn phong cách IDE.
2. Tiêu đề RequestEditor chiếm diện tích lớn và tạo khoảng cách thừa với thanh URL bar; việc gộp tên Request vào breadcrumb path giúp giao diện thoáng đãng, tối ưu không gian dọc.
3. Khoảng cách dọc giữa RequestEditor và ResponseViewer cần được tinh gọn, liền mạch.
4. Khung ResponseViewer cần có khả năng thu gọn (collapse) linh hoạt khi chưa gửi request hoặc theo nhu cầu người dùng, và tự động bung mở (uncollapse) khi có dữ liệu phản hồi mới.
5. Ô chọn Branch trong GitSyncModal dùng `<select>` mặc định của trình duyệt cần được nâng cấp thành custom dropdown đồng bộ thiết kế với các nút Pull/Push bên cạnh.
6. CollectionSwitcher cần được chuyển lên AppHeader cạnh nút Import Postman, giải phóng không gian sidebar cho ô tìm kiếm/lọc cây thư mục theo tên, URL và nội dung Body.
7. Go Backend ImporterService cần tự động nhận diện chính xác kiểu Body (JSON, XML, Text, URLEncoded, FormData) thay vì gán cứng `"raw"`.

## Capabilities

### CAP-1: Auto-indent & Comment Toggle trong BodyEditor & ScriptEditor
- Khi nhấn `Enter`, editor tự động giữ nguyên mức thụt dòng (khoảng trắng/tab) của dòng phía trên; nếu dòng trước kết thúc bằng `{`, `[`, hoặc thẻ mở XML `<tag>` chưa đóng, tự động cộng thêm 2 spaces indent.
- Bắt phím tắt `(Ctrl || Meta) + /`:
  - Trong `BodyEditor` (JSON/JSONC): toggle comment dòng bằng `// `.
  - Trong `BodyEditor` (XML): toggle comment khối/dòng bằng `<!-- -->`.
  - Trong `ScriptEditor` (JS): toggle comment dòng bằng `// `.
  - Đồng bộ trạng thái undo snapshot qua `recordInputSnapshot` và bảo toàn vị trí con trỏ/vùng chọn.

### CAP-2: Tối ưu Breadcrumb Header trong RequestEditor
- Gộp tên Request (`req.name`) vào dòng breadcrumb path (`Folder / Subfolder / Request Name`) kèm badge trạng thái lưu (`✓ Đã lưu`, `Đang lưu...`, `Chưa lưu`, `Lỗi khi lưu`).
- Loại bỏ dòng `<h1>` riêng biệt, đẩy UrlBar lên cao giúp tiết kiệm tối đa không gian màn hình.

### CAP-3: Tinh gọn khoảng cách dọc giữa Editor và Response
- Tinh chỉnh `margin`, `padding`, `space-y-*` trong `RequestEditor.vue`, `BodyEditor.vue`, và `ContentArea.vue`.
- Đảm bảo khi body ngắn (5-10 dòng), không gian bên dưới gọn gàng, liền mạch với thanh splitter/response.

### CAP-4: Thu gọn & Mở rộng Response Pane linh hoạt
- Hỗ trợ trạng thái thu gọn/mở rộng khung response trong `uiStore` (`responsePaneCollapsed`, `setResponsePaneCollapsed`, `toggleResponsePaneCollapse`).
- Khi chưa gửi request hoặc khi thu gọn, RequestEditor chiếm toàn bộ chiều cao màn hình; hiển thị thanh dock response thu gọn kèm nút mở rộng.
- Nút toggle thu gọn/mở rộng hiển thị trực quan trên splitter và thanh dock / header response.
- Khi gửi request và nhận được phản hồi mới (hoặc có log/lỗi thực thi), khung response tự động mở rộng để hiển thị kết quả.

### CAP-5: Custom Branch Dropdown trong GitSyncModal
- Thay thế thẻ `<select>` tại khu vực `[ ↓ Git Pull ] [ branch ] [ ↑ Git Push ]` bằng custom dropdown.
- Có icon Git branch SVG phía trước, tên branch font-mono rõ nét, icon mũi tên xuống `▾` tùy biến, hiệu ứng hover/focus ring chuẩn design system tokens (`bg-surface-raised`, `border-border-default`, `focus:border-brand-primary`).
- Chiều cao và kích thước cân đối hoàn hảo với hai nút Git Pull và Git Push bên cạnh.

### CAP-6: Di chuyển CollectionSwitcher lên Header & Bổ sung Tree Filter
- Chuyển `CollectionSwitcher.vue` từ sidebar lên `AppHeader.vue`, đặt cạnh nút `Import Postman`.
- Đặt ô tìm kiếm/lọc (`treeFilterQuery`) ở đầu sidebar (`AppSidebar.vue`).
- Khi nhập từ khóa, lọc toàn bộ cây `collectionStore.tree`:
  - Khớp theo tên Request hoặc tên Folder.
  - Khớp theo URL của Request.
  - Khớp theo chuỗi xuất hiện trong `req.body.content`.
- Khi tìm thấy, hiển thị node và tự động mở các thư mục cha (`expandedFolders`). Khi xóa từ khóa, phục hồi cây ban đầu.

### CAP-7: Tự động detect Body Type khi import từ Postman
- Nâng cấp `projects/service/importer.go`:
  - Kiểm tra `Options.Raw.Language` (json, xml, text).
  - Kiểm tra header `Content-Type` (`application/json` -> json, `application/xml` hoặc `text/xml` -> xml).
  - Sniffing content: nếu bắt đầu bằng `{` hoặc `[` và parse được JSON -> json; nếu bắt đầu bằng `<` và có cấu trúc XML -> xml; ngược lại -> text.
  - Hỗ trợ `mode == "urlencoded"` -> map sang `body.Urlencoded` và type `"urlencoded"`.
  - Hỗ trợ `mode == "formdata"` -> map sang `body.FormData` và type `"formdata"`.
- Bổ sung unit test trong `importer_test.go` xác nhận parse đúng type cho từng trường hợp.

## Constraints & Verification
- 100% test pass: `bun run type-check`, `bun run test`, `go test ./...`.
- Giữ nguyên toàn bộ phím tắt và tính năng hiện có.
- Không tự ý commit hoặc push Git khi chưa có xác nhận từ người dùng.

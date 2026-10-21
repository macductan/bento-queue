# Changelog & Evolution History — hecto-api

Tài liệu này ghi nhận toàn bộ lịch sử phát triển, kiến trúc cốt lõi và thay đổi của **hecto-api** qua tất cả các phiên bản từ `v1.0.0` đến nay. Đây là nguồn tham chiếu chuẩn (Single Historical Reference) để cả đội ngũ phát triển và các **AI Agents** nắm bắt nhanh ngữ cảnh kỹ thuật, quy ước hệ thống và sự tiến hóa của từng tính năng.

---

## Kiến trúc tổng quan cho AI Agents (AI Context Summary)

- **Stack công nghệ**:
  - **Backend**: Go 1.25 + Wails v2 (`projects/app.go`, `projects/model/`, `projects/service/`, `projects/storage/`).
  - **Frontend**: Vue 3 (Composition API `<script setup lang="ts">`) + Pinia + Tailwind CSS v4 + Vite (`projects/frontend/src/`).
  - **Runtime & Tooling**: Node 24 (`.nvmrc`), trình quản lý gói **Bun** (`bun run test`, `bun run type-check`).
  - **Storage**: Lưu trữ hoàn toàn bằng file JSON trên đĩa (offline-first, pure UUID naming từ `v1.3.0`), không dùng cơ sở dữ liệu hay đám mây.
- **Thứ tự ưu tiên biến môi trường 4 tầng (4-Tier Variable Resolution - từ `v1.4.0`)**:
  1. **Tier 4 (Cao nhất)**: `Folder-Env` — Biến của thư mục gắn riêng với môi trường đang active (`folder.folder_envs[activeEnvId]`). Theo cây thư mục, thư mục con gần request nhất sẽ ghi đè thư mục cha.
  2. **Tier 3**: `Folder Global` — Biến dùng chung của thư mục (`folder.variables`), thư mục con ghi đè thư mục cha.
  3. **Tier 2**: `Active Global Environment` — Biến của môi trường đang chọn trên thanh Header (`envStore.activeEnvironment.variables`).
  4. **Tier 1 (Thấp nhất)**: `Collection Environment` — Biến dùng chung cấp Collection (`collection.variables`).
  *(Lưu ý: Path Parameters `:param` trong URL được giải quyết riêng qua `request.path_params`).*
- **Cơ chế Kế thừa Auth & Headers (Auth & Header Inheritance - từ `v1.1.0` & `v1.4.0`)**:
  - Khi Request hoặc Folder đặt Auth là `inherit`, hệ thống dò ngược từ chính thực thể đó (nếu đang ở scope môi trường thì kiểm tra Global Auth của chính nó trước) $\rightarrow$ Folder cha gần nhất $\rightarrow$ Folder gốc $\rightarrow$ Collection Auth.
  - Ở mỗi cấp, cấu hình riêng theo môi trường (`auth_envs[activeEnvId]`) luôn được ưu tiên hơn cấu hình chung (`auth`) của cấp đó.
- **Nguồn duy nhất cho Version (Single Source of Truth)**:
  - Trường `"version"` trong `projects/frontend/package.json`.

---

## [v1.13.0] - 2026-10-21

### Added
- **Interactive Breadcrumb Navigation & Tree Reveal**:
  - Click vào tên bất kỳ **Folder** nào trên thanh đường dẫn (breadcrumb) trong `RequestEditor.vue` sẽ mở trực tiếp tab cấu hình của Folder đó (`FolderEditor.vue`).
  - Click vào tên **Request** trên breadcrumb sẽ tự động thu gọn (collapse) toàn bộ các nhánh thư mục khác (`expandPathToNode(id, { collapseOthers: true })`), chỉ mở đúng nhánh cha dẫn tới request, tự động xóa bộ lọc tìm kiếm sidebar nếu đang bật, cuộn mượt đưa request vào chính giữa khung nhìn (`scrollIntoView({ behavior: 'smooth', block: 'center' })`), focus và làm nổi bật bằng dải sáng nhấp nháy `tree-row-highlight-bar`.
- **Custom Dropdown Component (`CustomSelect.vue`) & UI Standardization**:
  - Xây dựng component dropdown dùng chung `CustomSelect.vue` chuẩn Dark theme của hecto-api (menu nổi đổ bóng 3D, dấu kiểm `✓` cho mục đang chọn, hỗ trợ badge/kích thước `xs|sm|md`/chế độ `fullWidth`, đóng khi nhấn `Escape` hoặc click ra ngoài, giữ thẻ `<select class="sr-only">` ẩn đồng bộ 2 chiều để tương thích 100% với Accessibility và Unit Tests).
  - Nâng cấp `EnvSelector.vue` trên thanh `AppHeader` sang custom dropdown với chấm trạng thái xanh ngọc (`bg-emerald-400`) và nút mở nhanh `Quản lý môi trường...`.
  - Thay thế toàn bộ các thẻ `<select>` mặc định trên toàn ứng dụng sang `CustomSelect.vue`:
    - `RequestTabs.vue`: Chọn kiểu Body (`#body-type-select`).
    - `AuthEditor.vue`: Chọn phạm vi môi trường Auth (`#auth-env-scope-select`), kiểu Auth (`#auth-type-select`) và vị trí gắn API Key (`#api-key-add-to-select`).
    - `FolderEditor.vue`: Chọn phạm vi môi trường biến thư mục (`#folder-env-scope-select`).
    - `VariableHoverPopover.vue`: Chọn phạm vi lưu biến nhanh (`variable-scope-select`).
    - `MockServerModal.vue`: Chọn phương thức HTTP cho mock route (`mock-route-method-select`).
- **Auto-Detect Active Environment in Auth**:
  - `AuthEditor.vue` và `CollectionEnvModal.vue` tự động nhận diện môi trường đang active của ứng dụng (`envStore.activeEnvId`) khi mở hoặc chuyển đổi Request/Folder, đồng thời tự động cập nhật phản ứng (reactive sync) khi người dùng đổi môi trường trên thanh Header (đồng bộ hoàn toàn với hành vi của tab Variables trong `FolderEditor.vue`).
- **Comprehensive Changelog (`CHANGELOG.md`)**:
  - Khởi tạo tài liệu `CHANGELOG.md` ghi chép toàn bộ lịch sử phiên bản từ `v1.0.0` đến `v1.13.0` kèm tóm tắt kiến trúc cho AI Agents.

### Changed
- **Script Editor Segmented Phase Toggle & Clean Snippets**:
  - Thay thế dropdown chọn pha trong `ScriptEditor.vue` bằng cụm nút chuyển đổi trực quan (`Pre-request` / `Post-response`) kèm huy hiệu `✓` báo hiệu pha đang có mã kịch bản.
  - Tinh gọn toàn bộ Snippets mẫu trong `ScriptEditor.vue` về dạng câu lệnh gọi hàm trực tiếp, đa dụng, loại bỏ các biến trung gian rườm rà.

### Fixed
- **Script Editor Line Numbers & Scroll Rendering**:
  - Khắc phục lỗi lệch số thứ tự dòng (line number gutter) khi dòng code dài bằng cách đồng bộ `white-space: pre` và `overflow-x: auto` giữa `<textarea>` và lớp phủ tô màu cú pháp.
  - Khắc phục lỗi xuất hiện khoảng đen lớn khi cuộn xuống dưới trong Script Editor bằng cách thêm `min-h-full` cho highlight pre-layer và `bg-surface-input` cho vùng cuộn.
- **Breadcrumb Typography Descender Clipping**:
  - Sửa lỗi mất phần đuôi dưới của các chữ cái `g, y, p, q, j` trên thanh breadcrumb `RequestEditor.vue` bằng cách đổi `leading-none` sang `leading-normal` và căn chỉnh lại `py-0.5`.

---

## [v1.12.0] - 2026-10-20

### Added
- **Script Auth APIs & Persistence**: Bổ sung các API `folderAuth`, `folderAuthEnv`, `collectionAuth`, `request.auth` cùng hệ thống alias `pm.*` trong Script Runner, hỗ trợ đọc/ghi và lưu bền vững xuống đĩa.
- **Script Code Formatter**: Thêm nút `Format` trong `ScriptEditor.vue` giúp tự động căn chỉnh mã nguồn JavaScript sạch đẹp.
- **Alphabetical Tree Sorting**: Hỗ trợ sắp xếp cây thư mục và request theo thứ tự chữ cái `A-Z` / `Z-A` trên thanh tiêu đề Sidebar, khi di chuột vào Folder và trong menu ngữ cảnh (Context Menu).
- **Drag-and-Drop Tree Reordering**: Hỗ trợ kéo thả (Drag & Drop) để sắp xếp vị trí các Request và Folder với vạch chỉ báo trực quan và lưu thứ tự bền vững xuống đĩa.
- **Breadcrumb & Tab Path Indicators**: Hiển thị đường dẫn phân cấp mờ phía trên thanh tab phiên làm việc (`AppTabBar`) và trong tiêu đề của `RequestEditor` / `FolderEditor`.
- **Structured Grid Table Borders**: Bổ sung hệ thống đường kẻ bảng và đường phân cột rõ ràng cho `KvpEditor`, `DefaultHeadersTable` và `HeadersTable`.

### Changed
- **Header Git Sync Button**: Di chuyển nút trạng thái và đồng bộ Git lên `AppHeader` nằm cạnh `CollectionSwitcher`.

### Fixed
- **Git Branch Selector & Remote Branches**: Sửa lỗi chọn nhánh Git, liệt kê đầy đủ các nhánh từ remote và lưu cấu hình nhánh bền vững.
- **Editor Tab & Undo Cursor**: Khắc phục lỗi bị reset tab active khi chuyển đổi giữa các Folder và bảo toàn vị trí con trỏ khi nhấn `Ctrl+Z` (undo).

---

## [v1.11.1] - 2026-10-16

### Added
- **Collection Tree Collapse / Expand All**: Thêm cặp nút thu gọn toàn bộ (Collapse All) và mở rộng toàn bộ (Expand All) cây thư mục trên thanh công cụ Sidebar.
- **Response Viewer Quick Collapse (`build 1`)**: Khôi phục nút thu gọn/đóng nhanh ở góc trên bên phải của khung `ResponseViewer`.

### Changed
- **Unified Sidebar Toolbar**: Gộp ô tìm kiếm, nút Collapse All, Expand All, Git và nút tạo mới (`+`) vào cùng một hàng tiêu đề duy nhất trên Sidebar.
- **Default Window Size**: Tăng kích thước cửa sổ mặc định trên Desktop lên `1320x860` (kích thước tối thiểu `900x600`).

### Fixed
- **Real-time Tree Search**: Hỗ trợ lọc cây thư mục tức thời ngay khi gõ phím mà không cần chờ nhấn phím `Enter`.
- **Splitter Drag Smoothness (`build 1`)**: Khắc phục hiện tượng nhảy vị trí khi kéo thanh chia khung nhìn bằng cách tính độ lệch (delta) từ vị trí bắt đầu kéo.

---

## [v1.11.0] - 2026-10-16

### Added
- **Code Editor Keyboard Shortcuts**: Bổ sung tự động thụt đầu dòng khi nhấn `Enter` (auto-indent) và phím tắt bật/tắt dòng chú thích (`Ctrl+/`) cho các trình soạn thảo JSON, XML và JavaScript.
- **Collapsible Response Pane**: Hỗ trợ thu gọn khung kết quả (`ResponseViewer`) xuống thanh dock dưới đáy, bật/tắt qua thanh chia (splitter) và tự động mở lại khi nhận phản hồi HTTP mới.
- **Custom Git Branch Dropdown**: Thay thế thẻ `<select>` mặc định bằng dropdown chọn nhánh tùy biến trong `GitSyncModal`.
- **Sidebar Tree Search & Postman Body Auto-Detection**:
  - Thêm ô tìm kiếm/lọc nhanh request và folder trên Sidebar.
  - Tự động nhận diện kiểu dữ liệu body (`json`, `xml`, `text`, `urlencoded`, `formdata`) khi import bộ sưu tập từ Postman.

### Changed
- **Header Collection Switcher**: Di chuyển bộ chuyển đổi Collection (`CollectionSwitcher`) lên thanh `AppHeader`.
- **Compact Request Header**: Tối ưu hóa không gian dọc của `RequestEditor` bằng cách gộp tên request vào dòng breadcrumb và loại bỏ tiêu đề trùng lặp.

---

## [v1.10.0] - 2026-10-16

### Added
- **XML Formatting, Highlighting & Validation**: Hỗ trợ định dạng đẹp (pretty print), tô màu cú pháp và kiểm tra lỗi cú pháp XML (tương thích với cú pháp biến `{{variable}}`) trong cả `BodyEditor` và `ResponseViewer`.
- **Horizontal Mouse Wheel Tab Scrolling**: Hỗ trợ cuộn ngang danh sách tab trên `AppTabBar` bằng con lăn chuột kèm chuẩn hóa bước cuộn và ẩn thanh cuộn mặc định trên Linux WebKit (`.hide-scrollbar`).
- **Dedicated Response Body Sub-Toolbar**: Di chuyển nút chuyển đổi `Pretty/Raw` và nút `Copy` xuống thanh công cụ phụ nằm ngay dưới tab Body của `ResponseViewer`.

### Changed
- **FolderEditor Tab Order**: Sắp xếp lại thứ tự các tab cài đặt thư mục thành `Variables -> Auth -> Headers` và đặt `Variables` làm tab mặc định khi mở thư mục.
- **Compact Editor Spacing**: Thu gọn khoảng cách dọc trong `RequestEditor` và `BodyEditor` để tối đa hóa diện tích khung soạn thảo.

### Fixed
- **Multiline Caret Sync in KvpEditor**: Khắc phục lỗi lệch vị trí con trỏ khi nhập nội dung nhiều dòng hoặc dán URL dài vào bảng Key-Value (`KvpEditor`).

---

## [v1.9.0] - 2026-10-16

### Added
- **3-Way JSON Auto-Merge Engine (Backend Go)**:
  - Triển khai bộ máy trộn JSON 3 chiều tự động (`< 50ms/file`) cho Request, Folder, Environment và Collection thông qua trích xuất các Git stages (`:1:` base, `:2:` ours, `:3:` theirs) và xử lý đảo chiều stage khi xảy ra xung đột `stash pop` (`.git/HECTO_STASH_CONFLICT`).
  - Hỗ trợ trộn đệ quy nội dung `body.content` dạng JSON, trộn mảng `KVPair` theo khóa `(Key, occurrenceIndex)`, phát hiện xung đột xóa-sửa (`delete_edit` / `edit_delete`), cùng các Wails bindings `ResolveGitConflict` và `AbortGitMerge`.
- **Visual Git Conflict Resolver (`GitConflictResolverModal.vue`)**:
  - Giao diện giải quyết xung đột trực quan 2 cột `Local vs Remote`, cho phép chọn giữ bản Local hoặc Remote với 1 cú click cho từng trường, từng file hoặc toàn bộ các file xung đột.
  - Tự động lưu (auto-flush) mọi thay đổi đang dở của Request và Folder trước khi thực hiện `Git Pull`, `Stash & Pull` hoặc `Git Push`.

---

## [v1.8.0] - 2026-10-16

### Added
- **Path Parameters (`:param`) Management**:
  - Hỗ trợ tự động trích xuất và quản lý biến đường dẫn (`:param`) trong tab Params, tô sáng trực tiếp trên thanh URL, chỉnh sửa nhanh khi di chuột (hover) và tự động thay thế giá trị khi gửi request hoặc xuất lệnh cURL.
- **Script Editor Syntax Highlighting & IntelliSense**:
  - Bổ sung bộ phân tích từ vựng JavaScript (JS tokenizer + synchronized overlay) để tô màu cú pháp theo thời gian thực.
  - Tích hợp hệ thống gợi ý mã thông minh (Autocomplete / IntelliSense), danh sách Snippets mẫu và gợi ý tham số dòng (Inline Hints).
  - Mở rộng Script API hỗ trợ đọc/ghi biến môi trường ở cả 4 cấp (`Global Env`, `Collection Env`, `Folder Global`, `Folder-Env`) cùng quyền truy cập đầy đủ vào `params`, `pathParams`, `query`, `headers`, `body` và `response`.
- **Execution Console / Logs Tab**: Thêm tab Console / Logs hiển thị nhật ký thực thi chi tiết của request và các lệnh `console.log` / `console.warn` / `console.error` từ script.

### Changed
- **Tree Hierarchy Indentation Guides**: Loại bỏ huy hiệu số cấp độ (depth badge) trên folder, thay bằng đường kẻ dọc dẫn hướng phân cấp cha-con và thuộc tính `:data-depth` (`build 1`).
- **Send Button Icon**: Thay nút gửi văn bản bằng biểu tượng máy bay giấy (Send paper-plane icon) hiện đại.

### Fixed
- **Git Remote Attachment & Sync**: Khắc phục triệt để lỗi khi gắn mới hoặc đổi Git Remote URL (tự động xử lý `unrelated histories`, bảo toàn metadata `collection.json`, hỗ trợ đầy đủ giao thức SSH URL).

---

## [v1.7.0] - 2026-10-15

### Added
- **JSONC Support (JSON with Comments & Trailing Commas)**:
  - Hỗ trợ kiểm tra cú pháp JSONC, định dạng mã (Prettify) giữ nguyên vẹn các dòng chú thích (`//`, `/* */`) và dấu phẩy cuối cùng, đồng thời tự động lược bỏ chú thích chuẩn xác trước khi gửi HTTP request.
- **Git Remote Change Confirmation & Branch Push**:
  - Bổ sung hộp thoại xác nhận `ClearAndPull` (xóa dữ liệu cũ và kéo về) hoặc `StashAndPull` (lưu tạm và gộp) khi thay đổi địa chỉ Git Remote.
  - Hỗ trợ chọn nhánh (branch) cục bộ khi thực hiện đẩy (push) collection lên remote.

### Changed
- **Consolidated Sidebar Header**: Tinh gọn thanh công cụ Sidebar thành nút trạng thái Git và menu thả xuống `+`.
- **Subtle JSON Error Indicator**: Thay thế hộp báo lỗi cú pháp JSON màu đỏ chiếm diện tích bằng nhãn cảnh báo màu hổ phách (amber) gọn nhẹ.

### Fixed
- **Smart Quotes & Fullwidth Brackets Normalization**: Tự động chuyển đổi các ký tự ngoặc kép thông minh (`“ ” ‘ ’`) và ngoặc toàn độ rộng sang ký tự chuẩn ASCII trong `BodyEditor` mà không làm nhảy vị trí con trỏ hay thanh cuộn.
- **False Unsaved Changes Dot**: Ngăn chặn lỗi hiển thị nhầm chấm vàng chưa lưu khi chuyển đổi qua lại giữa các request chưa bị chỉnh sửa.

---

## [v1.6.0] - 2026-10-15

### Added
- **Multisession Tab Bar & Per-Tab State Isolation**:
  - Triển khai thanh tab đa phiên (`AppTabBar.vue`) hỗ trợ mở song song nhiều Request và Folder, đóng tab bằng chuột giữa hoặc phím tắt.
  - Xây dựng `tabStore` giúp cô lập hoàn toàn dữ liệu phản hồi (`responseStore`) của từng tab và giữ nguyên trạng thái các request đang thực thi ngầm (in-flight requests) khi chuyển tab.
- **Git Sync Integration (`build 2`)**: Hỗ trợ cấu hình Git Remote cho Collection, thực hiện `Git Pull` và `Git Push` trực tiếp từ giao diện.
- **Pre-request & Post-response Scripting (`build 2`)**: Tích hợp bộ chạy kịch bản JavaScript trước và sau khi gửi request với giao diện lập trình `pm` API.
- **Execution History & Collection Changelog (`build 2`)**: Lưu trữ và tra cứu lịch sử các lần gửi request cùng nhật ký thay đổi của bộ sưu tập.
- **Local Mock HTTP Server (`build 2`)**: Tích hợp máy chủ HTTP giả lập chạy cục bộ với khả năng cấu hình danh sách route, mã trạng thái, headers và phản hồi tùy ý.
- **Extended Payload Types & cURL Auto-Parser (`build 2`)**:
  - Mở rộng `BodyEditor` hỗ trợ Smart JSON, XML, `x-www-form-urlencoded`, `multipart/form-data`, Raw Text và Binary.
  - Tự động bóc tách lệnh `curl` khi người dùng dán trực tiếp vào thanh URL và bổ sung tab xem trước lệnh cURL đã giải quyết biến.
  - Hỗ trợ `Ctrl+Z` / `Ctrl+Y` (undo/redo) cho các ô nhập liệu và cho phép nhập phương thức HTTP tùy chỉnh.

### Changed
- **Sidebar Folder Click Behavior**: Nhấp chuột trái vào Folder trên Sidebar chỉ đóng/mở (toggle) nhánh thư mục; việc mở cấu hình Folder được chuyển vào menu chuột phải (Context Menu).

### Fixed
- **KvpEditor & Auth Visibility**: Khắc phục lỗi chữ bị trong suốt ở cột Key trong `KvpEditor` và giữ nguyên trạng thái hiện/ẩn mật khẩu hoặc token khi người dùng gõ phím.

---

## [v1.5.0] - 2026-10-14

### Added
- **Resizable 3-Pane Layout**: Triển khai bố cục 3 khung (Sidebar / Request Editor / Response Viewer) có thể kéo giãn linh hoạt bằng chuột và tự động ghi nhớ kích thước qua các phiên làm việc.
- **Per-Collection Active Environment Persistence**: Tự động lưu môi trường đang kích hoạt riêng cho từng Collection và khôi phục lại ngay khi khởi động ứng dụng hoặc chuyển đổi Collection.
- **Folder Environment Auto-Scope**: Tự động nhận diện và đồng bộ phạm vi môi trường trong `FolderEditor` theo môi trường đang active trên thanh Header.
- **Variable Hover Preview & Inline Editing**: Hiển thị popover xem trước giá trị thực tế và nguồn gốc tầng biến khi di chuột vào `{{variable}}`, cho phép sửa và lưu giá trị mới ngay trên popover.

### Fixed
- **CI Wails Binding Resilience (`build 1`, `build 2`)**: Cấu hình `GODEBUG=http2client=0` và cơ chế thử lại (retry loop) khi cài đặt Wails CLI trên GitLab CI để tránh lỗi ngắt luồng HTTP/2 từ `sum.golang.org`.

---

## [v1.4.0] - 2026-10-14

### Added
- **4-Tier Environment Hierarchy & Resolution Engine**:
  - Thiết kế và triển khai hệ thống biến môi trường 4 tầng ưu tiên: `Folder-Env` $\rightarrow$ `Folder Global` $\rightarrow$ `Active Global Env` $\rightarrow$ `Collection Env`.
  - Bổ sung API lưu trữ và CRUD biến môi trường cấp Collection và Folder ở tầng Backend Go.
  - Xây dựng hộp thoại `CollectionEnvModal`, tab Variables trong `FolderEditor` và nâng cấp `VariableHighlighter` hỗ trợ tô màu biến theo ngữ cảnh đa tầng.

### Fixed
- **Ubuntu Typography & Layout**: Tinh chỉnh hiển thị phông chữ trên Ubuntu Linux, căn chỉnh lại khoảng đệm thanh URL (`UrlBar`) và bố cục `AuthEditor`.

---

## [v1.3.0] - 2026-10-13

### Added
- **Two-Way URL & Query Params Synchronization**: Đồng bộ hai chiều tức thời giữa chuỗi truy vấn trên thanh URL và bảng Query Params, đảm bảo giữ nguyên vẹn các cặp ngoặc nhọn biến mẫu `{{variable}}`.
- **Copy as cURL**: Bổ sung tính năng xuất nhanh request hiện tại thành câu lệnh `curl` hoàn chỉnh (đã giải quyết biến môi trường, headers, body và thông tin xác thực Auth).
- **800ms Debounced Auto-Save & Flush Protection**:
  - Tự động lưu thay đổi của Request và Folder sau 800ms kể từ thao tác chỉnh sửa cuối cùng kèm huy hiệu trạng thái trực quan (`Đã lưu`, `Đang lưu...`, `Chưa lưu`).
  - Tự động đẩy (flush) các thay đổi chưa lưu xuống đĩa trước khi chuyển sang Request/Folder khác hoặc đóng ứng dụng.

### Changed
- **Pure UUID File Storage Migration**: Chuyển đổi toàn bộ cấu trúc đặt tên thư mục và tệp tin lưu trữ sang định danh UUID thuần túy, loại bỏ hoàn toàn cơ chế tạo slug tên file cũ ở cả Backend và Frontend.
- **Automated CI Wails Bindings Generation (`build 1` – `build 4`)**: Bổ sung job `generate:bindings` trên GitLab CI để tự động sinh mã TypeScript trong `wailsjs/` và đưa thư mục này vào `.gitignore`.

---

## [v1.2.0] - 2026-10-12

### Added
- **Multi-Collection Architecture**:
  - Triển khai đầy đủ các thao tác CRUD cho nhiều bộ sưu tập (Multi-Collection) ở tầng Backend Go với cấu trúc thư mục độc lập cho từng collection.
  - Xây dựng `CollectionSwitcher`, `CollectionModal` và quản lý cô lập trạng thái dữ liệu trên Pinia store khi chuyển đổi giữa các collection.

---

## [v1.1.0] - 2026-10-11

### Added
- **Auth & Header Inheritance**: Triển khai cơ chế kế thừa thông tin xác thực (Bearer Token, Basic Auth, API Key) và danh sách Headers từ Collection $\rightarrow$ Folder cha $\rightarrow$ Folder con $\rightarrow$ Request.
- **Configurable Storage Directory**: Cho phép người dùng tùy chọn và thay đổi thư mục gốc lưu trữ dữ liệu trên máy tính kèm hiển thị đường dẫn trực tiếp trong phần Cài đặt.
- **Cross-Platform Packaging Scripts**: Thêm script đóng gói `projects/build-deb.sh` (Ubuntu/Debian `.deb`) và `projects/build-dmg.sh` (macOS `.dmg`) tự động đọc số phiên bản từ `projects/frontend/package.json`.
- **Playwright E2E & GitLab CI Pipeline (`build 1` – `build 3`)**: Thiết lập khung kiểm thử đầu-cuối (E2E) với Playwright (hỗ trợ chạy độc lập qua mock `window.go`) và quy trình CI/CD kiểm tra chất lượng tự động.

---

## [v1.0.0] - 2026-09-18

### Added
- **Initial Release — Offline-First Desktop API Client**:
  - Khởi tạo ứng dụng Desktop dựa trên nền tảng **Wails v2** (Go Backend) kết hợp **Vue 3 + TypeScript + Pinia + Tailwind CSS v4** (Frontend).
  - Quản lý cây thư mục và HTTP Request lưu trữ trực tiếp dưới dạng tệp JSON trên đĩa.
  - Trình soạn thảo Request (`RequestEditor`, `UrlBar`, `KvpEditor`, `BodyEditor`) và khung hiển thị kết quả phản hồi (`ResponseViewer`, `JsonViewer`, `HeadersTable`, `ResponseMetaBar` hiển thị Status Code, thời gian phản hồi ms và dung lượng byte).
  - Quản lý biến môi trường cơ bản (`EnvModal`, `EnvSelector`, `VariableHighlighter`) và bộ công cụ nhập (Import) bộ sưu tập từ chuẩn Postman Collection v2.1.

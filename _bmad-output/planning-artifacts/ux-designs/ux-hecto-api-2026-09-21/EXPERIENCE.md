---
name: hecto-api
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-hecto-api-2026-09-21/prd.md
  - research/hecto_api_client.html
updated: 2026-09-21
---

# hecto-api — Experience Spine

> Desktop API client offline-first cho developer solo. Wails v2 (Go backend + native webview + Vue 3). Dark-mode only, giao diện tiếng Việt. Paired with `DESIGN.md` (visual identity). Demonstrates: fixed-pane desktop layout, keyboard-first interaction cho developer tools, file-based storage with Git-friendliness, offline-first architecture.

## Foundation

Desktop app đơn-surface, native webview (Wails v2). Không responsive — kích thước cửa sổ cố định hoặc resizable nhưng layout 3-pane giữ nguyên tỉ lệ. Không có UI framework (shadcn, MUI...) — custom components trên nền Vue 3 + Tailwind CSS utilities. `DESIGN.md` là tài liệu visual identity reference; spine này là tài liệu experience.

Form-factor: desktop only (Linux, macOS, Windows). Không có web version, không có mobile companion.

Ngôn ngữ giao diện: **Tiếng Việt** hoàn toàn — labels, buttons, empty states, error messages, tooltips. Chỉ giữ nguyên tiếng Anh cho: HTTP methods (GET, POST...), status codes (200 OK), header keys (Content-Type), và thuật ngữ kỹ thuật chuẩn (JSON, URL, Body, Headers, Params).

Hiệu năng tối thiểu: khởi động < 2 giây, RAM < 100MB. Storage hoàn toàn file-based (JSON/YAML trên disk), không database, không cloud.

## Information Architecture

| Surface | Truy cập từ | Mục đích |
|---|---|---|
| Main workspace (3-pane) | Mở app | Toàn bộ workflow: chọn request → soạn → gửi → xem kết quả |
| Sidebar tree | Luôn hiển thị (trái) | Điều hướng Collection → Folder → Request |
| Request builder | Center pane — khi đã chọn request | Soạn URL, method, headers, params, body |
| Response viewer | Right pane — sau khi gửi request | Xem status, body (pretty/raw), headers, metrics |
| Environment modal | Nút gear (⚙) ở header | CRUD môi trường + biến |
| Context menu | Chuột phải trên folder/request | Đổi tên, sao chép, xóa, di chuyển |
| Import dialog | Nút "Import Postman" ở header | Chọn file Postman v2.1 JSON → import |
| Empty state: chưa chọn request | Center + Right pane — khi app mới mở | Hướng dẫn chọn request hoặc tạo mới |
| Empty state: chưa gửi | Right pane — khi đã chọn request nhưng chưa bấm Gửi | Hướng dẫn bấm Gửi |

Tất cả surface nằm trong một cửa sổ duy nhất. Không có tab browser, không multi-window. Modal stack tối đa 1 tầng (Environment modal). Context menu là lớp nổi duy nhất ngoài modal.

→ Composition reference: `research/hecto_api_client.html` (prototype). Spine wins on conflict.

## Voice and Tone

Microcopy tiếng Việt. Giọng nói thương hiệu và thẩm mỹ sống trong `DESIGN.md.Brand & Style`.

| Do | Don't |
|---|---|
| "Chọn một Request để bắt đầu" | "Hãy bắt đầu hành trình khám phá API! 🚀" |
| "Nhấn Gửi để xem kết quả phản hồi" | "Kết quả sẽ hiển thị ở đây sau khi bạn gửi request đi!" |
| "Chưa lưu" (tooltip trên unsaved dot) | Modal: "Bạn có muốn lưu thay đổi không?" |
| "Lỗi kết nối: không thể kết nối tới server" | "Oops! Có gì đó sai sai 😅" |
| "Biến `{{token}}` chưa có giá trị trong env hiện tại" | "Variable not found" (tiếng Anh) |
| "Request GET không nên đi kèm Body." | "Cảnh báo! Body trong GET request là hành vi không chuẩn!" |
| "Đã sao chép" (toast sau copy) | "Nội dung đã được sao chép vào clipboard thành công ✓" |
| "Đã lưu" (toast sau Ctrl+S) | "File đã được lưu xuống ổ cứng thành công!" |
| "Import thành công: 12 requests, 3 folders" | "Import completed successfully!" |

Quy tắc: câu ngắn, không emoji, không dấu chấm than (trừ cảnh báo/lỗi nghiêm trọng), không "bạn" lặp lại. Thuật ngữ kỹ thuật giữ nguyên tiếng Anh: request, response, header, body, params, method, environment, variable, collection, folder, JSON, URL.

## Component Patterns

Behavioral. Visual specs nằm trong `DESIGN.md.Components`.

| Component | Dùng ở | Quy tắc hành vi |
|---|---|---|
| Sidebar tree | Luôn hiển thị | Click folder → toggle mở/đóng (animated rotate caret icon 90°, `150ms ease`). Click request → load vào Request Builder, reset Response Viewer. Nút "..." hiện khi hover (fade in `150ms`), mở context menu. Double-click request name → inline rename. Drag-and-drop để sắp xếp (v2+). |
| URL bar | Request Builder header | Method selector là custom dropdown component (styled theo `{components.method-selector}`), màu text thay đổi theo method. URL input là text input bình thường (không rich text). Focus vào URL bar → viền đổi sang `{colors.border-focus}` + ring. Phím Enter trong URL input → trigger gửi request. |
| Tab bar (Request) | Request Builder | 3 tab: Params (badge count), Headers (badge count), Body. Badge count đếm entries có key khác rỗng. Click tab → switch content, không animation. Active tab: border-bottom `{colors.brand-primary}` + text blue-400. |
| KVP editor | Tab Params, Tab Headers | Mỗi row: checkbox + key + value + delete. Checkbox toggle → tắt/bật param/header (disabled = không gửi). Input trống cuối cùng → khi user gõ vào, tự thêm row mới. Nút xóa: ẩn cho đến hover row, click xóa row đó. Luôn giữ ít nhất 1 row trống — nút xóa ẩn trên row trống cuối cùng. Tab key nhảy giữa các input trong row (key → value → key tiếp theo). |
| Body editor | Tab Body | 3 mode: None (ẩn editor, hiện message "Request này không có body"), JSON, Text. Chuyển mode → nội dung body giữ nguyên (không xóa), kể cả round-trip qua None. Body type JSON → tự set header `Content-Type: application/json` chỉ khi user chưa thêm Content-Type thủ công trong tab Headers (header thủ công luôn thắng). Line numbers hiển thị bên trái, tự cập nhật theo nội dung. Textarea không có auto-complete (v2+). |
| Warning banner | Dưới URL bar | Chỉ hiện khi method = GET **VÀ** body type ≠ none. Icon ⚠ + text cảnh báo. Tự ẩn khi chuyển method hoặc body type = none. Không chặn gửi request — chỉ cảnh báo. |
| Response meta bar | Response viewer header | Hiện sau khi nhận response. Status badge (dot + mã + text mô tả), thời gian (clock icon + `N ms`), kích thước (HDD icon + `N B/KB`), timestamp (giờ + phút + giây). Thời gian và kích thước là **số nguyên** — không float. Kích thước ≥ 1024B hiển thị KB (chia nguyên). |
| Pretty/Raw toggle | Response body viewer | Segmented control 2 nút. Pretty: JSON formatted + syntax highlighted. Raw: text thuần, monospace, không highlight. Toggle không reset scroll position. Default: Pretty khi response là JSON, Raw khi response không phải JSON. |
| Copy button | Response body viewer | Click → copy nội dung response (raw text, không HTML). Hiển thị toast "Đã sao chép" (2 giây, tự ẩn). Icon thay đổi tạm sang checkmark (1.5 giây) rồi quay lại icon copy. |
| Env selector (header) | Header, góc phải | Custom dropdown component (styled theo `{components.env-selector}`) với options: "Không dùng env" + danh sách env. Chuyển env → tất cả `{{variable}}` trong request hiện tại cập nhật preview ngay (nhưng không thay đổi file đã lưu). Cạnh dropdown: nút gear → mở Environment modal. |
| Environment modal | Overlay modal | 2 cột: trái = danh sách env (chọn + tạo mới + xóa), phải = chi tiết biến env đang chọn (table key-value + thêm/xóa biến). Env đang active đánh dấu bằng dot xanh + icon check. Click env khác → đổi panel phải. Nút + ở header panel trái → tạo env mới, focus vào input tên. Đóng modal = Escape hoặc nút X hoặc click backdrop. |
| Unsaved dot | Cạnh tên request | Dot amber nhỏ (8px) xuất hiện khi request có thay đổi chưa lưu. Ẩn sau khi lưu (Ctrl+S). Không có auto-save cho request (khác với auto-save env). |
| Request name (editable) | Request Builder header | Hiển thị tên request `{typography.heading-lg}`. Hover → hiện underline + pencil icon. Click → chuyển sang inline input. Blur hoặc Enter → lưu tên mới. Escape → hủy chỉnh sửa. |
| Import dialog | Modal overlay | File picker native (Go backend gọi dialog hệ thống). Chọn file → backend parse → hiển thị kết quả tóm tắt (N requests, M folders imported). Lỗi parse → thông báo lỗi cụ thể (file format không đúng, version không hỗ trợ). |
| Toast notification | Góc dưới-phải | Tự ẩn sau 2-3 giây. Không có nút đóng. Dùng cho: "Đã sao chép", "Đã lưu", "Import thành công", "Lỗi kết nối". Tối đa 1 toast hiển thị cùng lúc (toast mới thay thế toast cũ). |
| Context menu | Floating trên sidebar | Click phải trên folder: Đổi tên, Tạo request mới, Tạo thư mục con, Xóa (xác nhận). Click phải trên request: Đổi tên, Sao chép, Di chuyển tới... (submenu danh sách folder đích), Xóa (xác nhận). |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| App vừa mở (cold start) | Toàn bộ | Sidebar hiển thị tree từ collection trên disk. Center + Right pane hiển thị empty state "Chọn một Request để bắt đầu" + gợi ý `Ctrl+N`. Không skeleton — data load từ disk nên gần instant. Loading indicator cho collection lớn: v2+. |
| Collection rỗng (chưa có request) | Sidebar | Sidebar body trống. Hiển thị inline: "Chưa có request nào. Tạo mới hoặc Import Postman." Với 2 nút link text tương ứng. |
| Chọn request (chưa gửi) | Center pane + Right pane | Request Builder load data từ file. Response Viewer hiển thị empty state "Nhấn Gửi để xem kết quả phản hồi" với icon terminal. |
| Đang gửi request (loading) | Nút Gửi + Response viewer | Nút "Gửi" đổi thành "Hủy" (nền đỏ nhạt, cho phép click để abort request). Response viewer hiển thị skeleton hoặc spinner centered. Không block UI — user vẫn có thể chỉnh sửa request khác trong sidebar. Vì không có timeout mặc định (infinite), nút Hủy là cách duy nhất để dừng request đang chờ. |
| Gửi thành công (2xx) | Response viewer | Response meta bar hiện status badge emerald (dot glow + mã + text). Body tab mở mặc định. JSON auto-pretty-print + highlight. |
| Gửi lỗi client (4xx) | Response viewer | Status badge amber. Body hiển thị response body (thường là error JSON). Không có treatment khác biệt ngoài màu badge. |
| Gửi lỗi server (5xx) | Response viewer | Status badge rose/red. Tương tự 4xx — hiển thị body nếu có. |
| Mất kết nối / Connection refused | Response viewer | Không có response body. Hiển thị full-pane error state: icon wifi-slash, "Lỗi kết nối: không thể kết nối tới `{url}`". Nút "Thử lại" gửi lại cùng request. Nguyên nhân cụ thể nếu biết: "Connection refused" / "DNS resolution failed" / "Request timeout". |
| Timeout / Không phản hồi | Response viewer | Không có timeout mặc định (infinite, giống Postman). Request chờ cho đến khi OS-level connection timeout hoặc server phản hồi. Nếu user muốn hủy → nút "Gửi" đổi thành "Hủy" khi đang gửi, click để abort request. Cấu hình timeout tùy chỉnh: v2+. |
| SSL error | Response viewer | Error state: icon shield-warning, "Lỗi chứng chỉ SSL: `{error_detail}`". Không auto-bypass SSL (bảo mật). Gợi ý: kiểm tra cert hoặc dùng HTTP thay HTTPS cho local dev. |
| URL rỗng khi bấm Gửi | URL bar | URL bar viền đổi sang red/rose. Toast: "Vui lòng nhập URL trước khi gửi". Không gửi request. Focus vào URL input. |
| Variable missing `{{key}}` | URL bar, Headers, Body | Trong editor: `{{key}}` hiển thị màu `{colors.variable-missing}` (đỏ) + italic. Khi gửi: vẫn gửi bình thường, `{{key}}` giữ nguyên dạng text (không resolve). Không chặn — developer có thể cố ý dùng literal `{{key}}` trên server. Lưu ý: `{{key}}` trong URL path sẽ bị URL-encode thành `%7B%7Bkey%7D%7D`; trong body và headers giữ nguyên dạng text. |
| Variable resolved `{{key}}` | URL bar, Headers, Body | `{{key}}` hiển thị màu `{colors.variable-valid}` (sky blue). Preview value hiển thị dưới dạng tooltip on hover (v2+). Lúc gửi, giá trị được thay thế — nội dung file không thay đổi. |
| Env = "Không dùng env" | Header selector + Request builder | Tất cả `{{variable}}` hiển thị như text bình thường (không resolve, không highlight). Không có warning — đây là lựa chọn hợp lệ. |
| Request có thay đổi chưa lưu | Request Builder header | Dot amber xuất hiện cạnh tên request. Tooltip: "Chưa lưu". Chuyển sang request khác trong sidebar → prompt xác nhận: "Request '{name}' có thay đổi chưa lưu. Lưu trước khi chuyển?" với 3 lựa chọn: Lưu (lưu rồi chuyển) / Bỏ qua (bỏ thay đổi, chuyển) / Hủy (ở lại request hiện tại, sidebar không đổi). |
| Lưu thành công | Toast | Toast "Đã lưu" (2 giây). Unsaved dot biến mất. File trên disk cập nhật. |
| Xóa folder/request | Context menu → Confirm dialog | Dialog xác nhận: "Xóa {type} '{name}'? Hành động này không thể hoàn tác." 2 nút: Xóa (destructive, đỏ) / Hủy. Xóa folder → xóa tất cả request bên trong. File trên disk bị xóa thật. Nếu request đang active bị xóa → UI quay về empty state "Chọn một Request để bắt đầu". |
| Import thành công | Modal → Toast | Dialog import đóng. Toast: "Import thành công: N requests, M folders". Sidebar refresh tree. Request đầu tiên từ import tự động được chọn. |
| Import lỗi | Modal | Thông báo lỗi trong modal: "Không thể import: file không đúng định dạng Postman v2.1". Nút "Chọn file khác" và "Đóng". |
| App nhận request lớn (> 1MB body) | Response viewer | Response hiển thị bình thường nhưng disable Pretty view nếu > 5MB (performance). Hiện message: "Response quá lớn để pretty-print. Hiển thị ở chế độ Raw." |

## Interaction Primitives

### Keyboard Shortcuts

hecto-api là tool cho developer — keyboard shortcuts là **tính năng cốt lõi**, không phải nice-to-have.

| Shortcut | Hành động | Scope |
|---|---|---|
| `Ctrl+Enter` | Gửi request hiện tại | Global (khi đang trong Request Builder) |
| `Ctrl+S` | Lưu request hiện tại | Global |
| `Ctrl+N` | Tạo request mới | Global |
| `Ctrl+Shift+N` | Tạo thư mục mới | Global |
| `Ctrl+I` | Mở dialog Import Postman | Global |
| `Ctrl+E` | Focus vào Environment selector | Global |
| `Ctrl+L` | Focus vào URL input | Global (tương tự browser address bar) |
| `Escape` | Đóng modal / Hủy inline edit / Hủy context menu | Global — đóng lớp nổi gần nhất |
| `F2` | Đổi tên item đang chọn trong sidebar | Sidebar focus |
| `Delete` | Xóa item đang chọn trong sidebar (có confirm) | Sidebar focus |
| `Ctrl+D` | Sao chép (duplicate) request đang chọn | Sidebar focus |
| `↑ / ↓` | Di chuyển giữa request trong sidebar | Sidebar focus |
| `Enter` | Chọn request đang highlight trong sidebar | Sidebar focus |
| `Tab` | Nhảy giữa input fields trong KVP editor | KVP editor focus |
| `Ctrl+C` (trong Response viewer) | Copy toàn bộ response body | Response viewer focus |

### Mouse

- **Click** để chọn, toggle, mở. Không double-click trừ inline rename.
- **Right-click** mở context menu (sidebar items only).
- **Hover** hiện secondary actions (nút "...", nút xóa trong KVP). Hover phải visible trong `150ms`.

### Banned Interactions

- Drag-and-drop (v2+).
- Infinite scroll (không áp dụng — tree view và KVP editor đều finite).
- Hover-only affordances trên touch device (không áp dụng — desktop only).
- Auto-save cho request (chỉ manual save bằng Ctrl+S hoặc nút Save). Environment auto-save nếu dùng modal.
- Animation quá 300ms cho bất kỳ transition nào.
- Modal stack > 1 tầng.
- System tray / background process khi đóng app (exit = exit).

## Accessibility Floor

Behavioral. Visual contrast sống trong `DESIGN.md` (dark theme đảm bảo tỉ lệ tương phản AA trên nền Slate 950).

- **Keyboard navigation đầy đủ:** mọi interactive element truy cập được bằng Tab + Enter + Arrow keys. Focus ring visible (`{colors.border-focus}` — blue 500 semi-transparent) trên mọi focusable element.
- **Tab order** khớp reading order: Header → Sidebar → URL bar → Request tabs → Request content → Response tabs → Response content.
- **Focus trap trong modal:** Tab cycle bên trong Environment modal khi mở. Escape đóng modal, focus quay về trigger element.
- **ARIA labels** cho các element không có visible text: nút "..." (aria-label: "Tùy chọn"), nút gear (aria-label: "Quản lý môi trường"), checkbox (aria-label: "Bật/tắt {param_key}").
- **Screen reader:** status code announce khi response đến — "Phản hồi 200 OK, thời gian 45 mili-giây, kích thước 1.2 kilobyte". Toast announce via `aria-live="polite"`.
- **Không dùng color-only indicator:** mọi thông tin mã hóa bằng màu (method, status code) đều đi kèm text label. Unsaved dot đi kèm tooltip text.
- **Font size tối thiểu:** 10px (`ui-xs`) cho badge/metadata, 12px (`ui-sm`) cho label, 13-14px cho body text. Không có text < 10px.
- **Click target tối thiểu:** 32px cho button, 24px cho checkbox. Sidebar request row chiều cao tối thiểu 32px.

## Offline & File-Based Storage

> Mục này là concern đặc thù của hecto-api — sản phẩm hoạt động hoàn toàn offline, storage trên disk, Git-friendly.

### Offline-First Contract

- App **không bao giờ** yêu cầu kết nối internet để khởi động hoặc hoạt động.
- Không có login, không có account, không có sync indicator.
- Không có "offline mode" — app chỉ có **một mode**: hoạt động.
- Khi gửi request mà không có internet → hiển thị error rõ ràng (connection refused / timeout) nhưng app không crash, không đơ, không disable UI.
- Không có retry tự động — developer quyết định khi nào retry.

### File-Based Storage Contract

- Collection = folder trên disk. Request = file JSON trong folder đó.
- Cấu trúc disk phản ánh 1:1 cấu trúc tree trong sidebar.
- Mọi file đọc được bằng text editor (vim, VS Code, cat).
- Đổi tên/xóa trong app = đổi tên/xóa file trên disk.
- Environment = file JSON riêng trong subfolder `environments/`.
- **Git-friendly:** không binary file, không lock file, không `.db`.
- App detect thay đổi file từ bên ngoài (file watcher) và reload sidebar (v2+ — v1 reload khi restart).

### Đơn vị hiển thị số liệu

- **Thời gian response:** luôn hiển thị dạng `N ms` (số nguyên, đơn vị millisecond). Không dùng float, không tự chuyển sang giây.
- **Kích thước response:** `N B` khi < 1024 bytes, `N KB` khi ≥ 1024 bytes (chia nguyên, bỏ phần thập phân). Không dùng MB cho v1.

## Key Flows

### Flow 1 — tanmac test nhanh endpoint trong lúc đang code (UJ-1)

1. tanmac đang code trong VS Code, cần test endpoint `/api/v1/auth/login` vừa viết xong.
2. Alt+Tab sang hecto-api. App đã mở sẵn, cold start dưới 2 giây nếu mở lần đầu.
3. Sidebar hiển thị tree collection. tanmac click vào folder "Xác thực (Auth)" → expand → click "Đăng nhập".
4. Request Builder load: method POST, URL `{{base_url}}/api/v1/auth/login`. Environment đang chọn "Dev Local" → `{{base_url}}` highlight sky blue.
5. Tab Body đã có JSON body sẵn từ lần trước. tanmac sửa password field.
6. Unsaved dot amber xuất hiện cạnh tên "Đăng nhập".
7. `Ctrl+Enter` — gửi request.
8. Nút "Gửi" chuyển thành "Hủy" (nền đỏ nhạt, cho phép abort). Spinner quay trong Response viewer.
9. 45ms sau, Response viewer hiện: badge `200 OK` (emerald, dot glow), `45 ms`, `1 KB`.
10. **Climax:** Body tab tự mở, JSON response pretty-printed: `{"status": "success", "data": {"token": "eyJ..."}}`. tanmac quét mắt — token có, status success — đúng ý. `Ctrl+S` lưu request, unsaved dot biến mất. Alt+Tab về VS Code tiếp tục code.

Failure path: server chưa chạy → Response viewer hiện error state: icon wifi-slash + "Lỗi kết nối: Connection refused — `http://localhost:3000/api/v1/auth/login`". Nút "Thử lại". tanmac nhận ra quên start server, chạy `go run .` rồi bấm "Thử lại".

### Flow 2 — tanmac tổ chức requests cho project mới (UJ-2)

1. tanmac bắt đầu project mới "e-commerce-api", cần sắp xếp requests.
2. Click "Thư mục" ở header → input inline xuất hiện trong sidebar → gõ "Xác thực (Auth)" → Enter.
3. Folder mới xuất hiện trong sidebar tree. Disk: thư mục mới được tạo trong collection folder.
4. Click phải folder → "Tạo request mới" → input inline → gõ "Đăng nhập" → Enter.
5. Request mới mở trong Request Builder: method GET (mặc định), URL rỗng. tanmac đổi method sang POST, gõ URL, paste body JSON.
6. Lặp lại: tạo folder "Sản phẩm", "Đơn hàng", thêm requests vào mỗi folder.
7. **Climax:** tanmac mở file explorer ngoài app — thấy cấu trúc folder rõ ràng trên disk, mỗi request là file `.json` đọc được. Copy folder vào Git repo, `git add . && git commit -m "add API collection"`. Collection giờ version-controlled.

### Flow 3 — tanmac đổi environment từ dev sang staging (UJ-3)

1. tanmac test xong local, muốn kiểm tra staging server.
2. Click dropdown env ở header: "Dev Local" → đổi sang "Staging".
3. URL bar hiển thị `{{base_url}}/api/v1/products` — `{{base_url}}` vẫn highlight sky blue vì resolved thành `https://staging.example.com` trong env Staging.
4. `Ctrl+Enter` — gửi request.
5. **Climax:** Response trả về từ staging server. Status badge `200 OK`. tanmac so sánh response body với kết quả dev — dữ liệu khác nhưng format đúng. Không phải sửa bất kỳ request nào.

Failure path: Staging env thiếu biến `api_token` → header `Authorization: Bearer {{api_token}}` → `{{api_token}}` hiển thị đỏ + italic. Request vẫn gửi bình thường — server trả `401 Unauthorized`. tanmac nhận ra, bấm nút gear → Environment modal → chọn Staging → thêm biến `api_token` → đóng modal → gửi lại → `200 OK`.

### Flow 4 — tanmac import Postman collection cũ (UJ-4)

1. tanmac quyết định bỏ Postman. Export collection từ Postman (v2.1 JSON), file khoảng 50KB.
2. Trong hecto-api, click "Import Postman" ở header.
3. Dialog file picker native (từ Go backend) mở ra. tanmac chọn file JSON.
4. App parse file. Progress indicator (nếu > 1 giây). Kết quả: modal hiển thị "Import thành công: 15 requests, 4 folders".
5. Sidebar refresh — collection mới xuất hiện với cấu trúc folder + requests đầy đủ.
6. tanmac click thử vài request — method, URL, headers, body đều đúng.
7. **Climax:** tanmac chọn request "Get Users", bấm `Ctrl+Enter` → response trả về đúng như khi dùng Postman. Xóa Postman khỏi máy.

Failure path: File không phải Postman v2.1 → modal hiển thị lỗi: "Không thể import: file không đúng định dạng Postman Collection v2.1. Hãy export lại từ Postman với format v2.1." Nút "Chọn file khác".

### Flow 5 — tanmac gặp lỗi khi gửi request qua VPN

1. tanmac đang test API nội bộ qua VPN. VPN ngắt giữa chừng.
2. Request trước đó đã gửi thành công, response vẫn hiển thị ở right pane.
3. tanmac sửa request, bấm `Ctrl+Enter`.
4. Nút "Gửi" đổi thành "Hủy" (cho phép abort). Spinner quay, không có timeout — chờ OS-level.
5. Vài giây sau, OS trả về connection error. Response viewer thay thế response cũ bằng error state: "Lỗi kết nối: Connection timed out". Nút "Thử lại".
6. tanmac nhận ra VPN ngắt, kết nối lại VPN.
7. Bấm "Thử lại" → request gửi thành công → `200 OK`.
8. **Climax:** App không crash, không đơ, không mất dữ liệu đã soạn. Request chưa lưu vẫn còn nguyên unsaved dot. tanmac `Ctrl+S` lưu.

## Inspiration & Anti-patterns

- **Lifted from Postman:** layout 3-pane (sidebar + request + response). KVP editor grid cho params/headers. Method color coding. Tab-based request config (Params/Headers/Body).
- **Lifted from Bruno:** file-based storage philosophy. Mỗi request = 1 file, commit vào Git. Không cloud, không login.
- **Lifted from Insomnia:** clean dark theme. Response viewer layout (meta bar + body tabs). Variable highlight trong URL.
- **Lifted from VS Code:** keyboard-first philosophy. `Ctrl+S` save, `Ctrl+N` new, `F2` rename. File watcher concept (v2+).
- **Rejected — Tab-per-request (Postman):** Không mở nhiều request cùng lúc dạng browser tabs. Quá phức tạp cho solo developer use case. Một request mở tại một thời điểm. Multi-tab là v2+ nếu cần.
- **Rejected — Auto-save request (Bruno):** Developer cần kiểm soát khi nào save. Typing trong body không nên trigger file write liên tục. Manual save (`Ctrl+S`) = ý chí rõ ràng.
- **Rejected — Pre-request scripts (Postman):** v1 không cần scripting. Nếu cần tạo token động, developer tự chạy script bên ngoài rồi paste vào.
- **Rejected — Request history (Postman):** v1 không lưu lịch sử response. Mỗi lần gửi ghi đè response cũ. History/diff là v2+.
- **Rejected — Notifications, badges, gamification:** hecto-api là công cụ, không phải ứng dụng consumer. Không có streak, không có usage tracking, không có "Bạn đã gửi 100 requests 🎉".

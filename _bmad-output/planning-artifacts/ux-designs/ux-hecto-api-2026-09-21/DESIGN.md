---
name: hecto-api
description: Desktop API client tối giản, offline-first. Wails v2 (Go + Vue 3 + Tailwind CSS + native webview). Dark-mode only, giao diện tiếng Việt, file-based storage.
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-hecto-api-2026-09-21/prd.md
  - research/hecto_api_client.html
updated: 2026-09-21
colors:
  # === Nền & Bề mặt (Surface) ===
  surface-base: '#020617'           # Slate 950 — nền chính của app, vùng body editor & response viewer
  surface-raised: '#0f172a'         # Slate 900 — header, sidebar, modal background
  surface-overlay: '#1e293b'        # Slate 800 — card nổi, dropdown menu, popover
  surface-input: '#0d1117'          # Nền input/textarea — tối hơn surface-base một chút, tạo "lõm" thị giác
  surface-hover: '#293548'          # Slate 750 custom — hover state trên row, button ghost

  # === Viền & Phân cách ===
  border-default: '#1e293b'         # Slate 800 — border mặc định giữa pane, card
  border-subtle: '#1e293b80'        # Slate 800 / 50% opacity — border nhẹ giữa tab, section
  border-focus: '#3b82f680'         # Blue 500 / 50% — focus ring cho input, textarea

  # === Chữ (Text) ===
  text-primary: '#e2e8f0'           # Slate 200 — body text chính
  text-secondary: '#94a3b8'         # Slate 400 — label, caption, placeholder text
  text-muted: '#64748b'             # Slate 500 — disabled text, hint, line number
  text-inverse: '#020617'           # Slate 950 — text trên nền sáng (nếu có)

  # === Thương hiệu (Brand) ===
  brand-primary: '#3b82f6'          # Blue 500 — CTA chính (nút Gửi), active tab, focus ring
  brand-primary-hover: '#60a5fa'    # Blue 400 — hover trên brand-primary
  brand-gradient-from: '#3b82f6'    # Blue 500 — logo gradient start
  brand-gradient-to: '#6366f1'      # Indigo 500 — logo gradient end

  # === Method HTTP — Sắc thái nhận diện nhanh ===
  method-get: '#10b981'             # Emerald 500
  method-post: '#3b82f6'            # Blue 500
  method-put: '#f97316'             # Orange 500
  method-patch: '#f59e0b'           # Amber 500
  method-delete: '#ef4444'          # Red 500

  # === Status Code — Phản hồi thị giác ===
  status-2xx: '#10b981'             # Emerald 500 — thành công
  status-2xx-bg: '#10b98118'        # Emerald 500 / 10% — nền badge status 2xx
  status-2xx-border: '#10b98133'    # Emerald 500 / 20% — viền badge status 2xx
  status-2xx-glow: '#10b981cc'      # Emerald 500 / 80% — dot glow hiệu ứng
  status-4xx: '#f59e0b'             # Amber 500 — client error
  status-4xx-bg: '#f59e0b18'        # Amber 500 / 10%
  status-4xx-border: '#f59e0b33'    # Amber 500 / 20%
  status-5xx: '#f43f5e'             # Rose 500 — server error
  status-5xx-bg: '#f43f5e18'        # Rose 500 / 10%
  status-5xx-border: '#f43f5e33'    # Rose 500 / 20%

  # === Syntax Highlighting (JSON Response) ===
  syntax-key: '#93c5fd'             # Blue 300
  syntax-string: '#86efac'          # Green 300
  syntax-number: '#fdba74'          # Orange 300
  syntax-boolean: '#c084fc'         # Purple 400
  syntax-null: '#f87171'            # Red 400

  # === Biến môi trường (Variable) ===
  variable-valid: '#38bdf8'         # Sky 400 — {{variable}} đã resolve
  variable-missing: '#f87171'       # Red 400 — {{variable}} không tồn tại, hiển thị đỏ + italic

  # === Trạng thái (State) ===
  warning-text: '#fbbf24e6'         # Amber 400 / 90% — text cảnh báo (GET + body)
  warning-bg: '#f59e0b18'           # Amber 500 / 10% — nền banner cảnh báo
  warning-border: '#f59e0b33'       # Amber 500 / 20% — viền banner
  unsaved-dot: '#f59e0b'            # Amber 500 — chấm tròn "chưa lưu"
  error-text: '#f87171'             # Red 400
  error-bg: '#ef444418'             # Red 500 / 10%

  # === Scrollbar ===
  scrollbar-track: '#0f172a'        # Slate 900
  scrollbar-thumb: '#334155'        # Slate 700
  scrollbar-thumb-hover: '#475569'  # Slate 600

typography:
  # UI controls — Inter
  ui-base:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  ui-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  ui-xs:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '500'
    lineHeight: '1.3'
    letterSpacing: 0.05em
  ui-label:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.05em
  heading-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.35'
  heading-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: '1.4'
  heading-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: '1.4'
  # Code & data — JetBrains Mono
  mono-base:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.6'
  mono-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
  mono-xs:
    fontFamily: JetBrains Mono
    fontSize: 10px
    fontWeight: '500'
    lineHeight: '1.3'
  mono-bold:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.6'

rounded:
  sm: 4px
  md: 6px
  lg: 8px
  xl: 12px
  full: 9999px

spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '8': 32px
  header-height: 48px
  sidebar-width: 260px
  gutter: 16px
  pane-border: 1px

components:
  # --- Header ---
  header:
    height: '{spacing.header-height}'
    background: '{colors.surface-raised}'
    border-bottom: '1px solid {colors.border-default}'
    padding-x: '{spacing.3}'
  logo-mark:
    width: 32px
    height: 32px
    radius: '{rounded.md}'
    background: 'linear-gradient(135deg, {colors.brand-gradient-from}, {colors.brand-gradient-to})'
    text-color: '#ffffff'
    font: '{typography.heading-lg}'
  # --- Sidebar ---
  sidebar:
    width: '{spacing.sidebar-width}'
    background: '{colors.surface-raised}'
    border-right: '1px solid {colors.border-default}'
  sidebar-folder:
    padding: '{spacing.2} {spacing.3}'
    font: '{typography.ui-sm}'
    icon-color: '{colors.text-secondary}'
    hover-bg: '{colors.surface-hover}'
  sidebar-request:
    padding: '{spacing.2} 0'
    font: '{typography.ui-sm}'
    method-font: '{typography.mono-xs}'
    active-bg: '{colors.surface-overlay}'
    active-border-left: '2px solid {colors.brand-primary}'
    hover-bg: '{colors.surface-hover}'
  # --- URL Bar ---
  url-bar:
    background: '{colors.surface-base}'
    border: '1px solid {colors.border-default}'
    focus-border: '{colors.border-focus}'
    radius: '{rounded.md}'
  url-input:
    font: '{typography.mono-base}'
    color: '{colors.text-primary}'
    placeholder-color: '{colors.text-muted}'
  method-selector:
    font: '{typography.mono-sm}'
    font-weight: '700'
    background: '{colors.surface-overlay}'
  send-button:
    background: '{colors.brand-primary}'
    hover-background: '{colors.brand-primary-hover}'
    color: '#ffffff'
    font: '{typography.ui-base}'
    font-weight: '500'
    padding: '10px 24px'
  # --- KVP Editor (Params / Headers) ---
  kvp-row:
    grid: 'auto 1fr 1fr auto'
    gap: '{spacing.2}'
    input-bg: '{colors.surface-base}'
    input-border: '1px solid {colors.border-default}'
    input-font: '{typography.mono-sm}'
    input-radius: '{rounded.sm}'
  kvp-header:
    font: '{typography.ui-xs}'
    color: '{colors.text-muted}'
    text-transform: uppercase
  # --- Body Editor ---
  body-editor:
    background: '{colors.surface-input}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.md}'
    font: '{typography.mono-base}'
    line-number-width: 40px
    line-number-color: '{colors.text-muted}'
    line-number-bg: '{colors.surface-raised}'
  body-type-chip:
    radius: '{rounded.full}'
    border: '1px solid {colors.border-default}'
    active-bg: '{colors.surface-overlay}'
    active-color: '{colors.text-primary}'
    inactive-color: '{colors.text-secondary}'
    font: '{typography.ui-xs}'
    padding: '4px 10px'
  # --- Response Viewer ---
  response-meta-bar:
    height: 52px
    background: '{colors.surface-raised}'
    border-bottom: '1px solid {colors.border-subtle}'
    font: '{typography.mono-sm}'
  status-badge:
    radius: '{rounded.md}'
    padding: '4px 10px'
    font: '{typography.mono-sm}'
    font-weight: '700'
    dot-size: 8px
  response-json-viewer:
    background: '#0b0f19'
    font: '{typography.mono-base}'
    line-number-width: 48px
    line-number-bg: '#090d15'
    line-number-color: '{colors.text-muted}'
  pretty-raw-toggle:
    background: '{colors.surface-base}'
    border: '1px solid {colors.border-default}'
    active-bg: '{colors.surface-overlay}'
    active-color: '#ffffff'
    inactive-color: '{colors.text-secondary}'
    font: '{typography.ui-xs}'
  # --- Tab Bars ---
  tab-bar:
    border-bottom: '1px solid {colors.border-subtle}'
    background: '{colors.surface-raised}'
    font: '{typography.ui-sm}'
    font-weight: '500'
  tab-item:
    padding-bottom: '{spacing.2}'
    border-bottom-width: 2px
    active-border-color-request: '{colors.brand-primary}'
    active-text-color-request: '#60a5fa'
    active-border-color-response: '{colors.status-2xx}'
    active-text-color-response: '{colors.status-2xx}'
    inactive-color: '{colors.text-secondary}'
  tab-badge:
    background: '{colors.surface-overlay}'
    color: '{colors.text-secondary}'
    font: '{typography.ui-xs}'
    radius: '{rounded.full}'
    padding: '2px 6px'
  # --- Environment Modal ---
  env-modal:
    width: 800px
    height: 500px
    background: '{colors.surface-raised}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.lg}'
    backdrop: 'rgba(0, 0, 0, 0.6)'
    backdrop-blur: 4px
  env-list-panel:
    width: 220px
    border-right: '1px solid {colors.border-default}'
    active-bg: '{colors.surface-overlay}'
    active-dot-color: '{colors.brand-primary}'
  env-variable-row:
    key-color: '#93c5fd'
    value-color: '{colors.text-primary}'
    font: '{typography.mono-sm}'
  # --- Environment Selector (Header) ---
  env-selector:
    background: '{colors.surface-overlay}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.md}'
    height: 32px
    font: '{typography.ui-xs}'
    font-weight: '500'
  # --- Warning Banner ---
  warning-banner:
    background: '{colors.warning-bg}'
    border: '1px solid {colors.warning-border}'
    color: '{colors.warning-text}'
    font: '{typography.ui-xs}'
    radius: '{rounded.md}'
    padding: '{spacing.2} {spacing.3}'
  # --- Empty States ---
  empty-state:
    icon-size: 64px
    icon-opacity: 0.2
    icon-color: '{colors.text-muted}'
    title-font: '{typography.heading-md}'
    title-color: '{colors.text-secondary}'
    subtitle-font: '{typography.ui-sm}'
    subtitle-color: '{colors.text-muted}'
  # --- Keyboard Shortcut Badge ---
  kbd:
    background: '{colors.surface-overlay}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.sm}'
    font: '{typography.ui-xs}'
    padding: '2px 6px'
  # --- Unsaved Changes Dot ---
  unsaved-dot:
    size: 8px
    color: '{colors.unsaved-dot}'
    radius: '{rounded.full}'
  # --- Chung cho buttons ghost/secondary ---
  button-ghost:
    color: '{colors.text-secondary}'
    hover-color: '{colors.text-primary}'
    hover-bg: '{colors.surface-overlay}'
    radius: '{rounded.md}'
    font: '{typography.ui-xs}'
  button-secondary:
    background: '{colors.surface-overlay}'
    hover-bg: '{colors.surface-hover}'
    color: '{colors.text-primary}'
    border: '1px solid {colors.border-default}'
    radius: '{rounded.md}'
    font: '{typography.ui-xs}'
    font-weight: '500'
  # --- Nút Hủy (abort request) — thay thế nút Gửi khi đang loading ---
  button-cancel:
    background: '{colors.error-bg}'
    hover-bg: '#ef444430'
    color: '{colors.error-text}'
    border: '1px solid {colors.status-5xx-border}'
    radius: '{rounded.md}'
    font: '{typography.ui-base}'
    font-weight: '500'
    padding: '10px 24px'
---

## Brand & Style

hecto-api là một desktop API client tối giản dành cho developer solo — người muốn sở hữu hoàn toàn công cụ mình dùng hàng ngày, không phụ thuộc vào bất kỳ vendor hay cloud service nào. Phong cách thiết kế hướng tới hình ảnh của một terminal hiện đại: sạch sẽ, tối, yên tĩnh, không có bất kỳ yếu tố trang trí thừa nào. Mọi pixel phục vụ chức năng.

Thẩm mỹ đặt ra là **Developer Tool Minimalism** — giao diện tối toàn phần (dark-mode only), mật độ thông tin vừa đủ, không gradient phô trương, không animation lấp lánh. Màu sắc được dùng có hệ thống và tiết kiệm: chỉ xuất hiện khi mang thông tin (method HTTP, status code, biến môi trường, trạng thái lưu). Phần còn lại — nền, viền, chữ — đều nằm trong dải Slate monochrome.

Cảm giác tổng thể: mở app lên như mở terminal — sẵn sàng làm việc ngay, không chờ đợi, không đăng nhập, không onboarding. Nhẹ hơn Postman, gọn hơn Bruno, quen tay hơn cURL.

## Colors

Bảng màu xây trên nền tảng **Tailwind Slate** — dải xám-xanh lạnh (cool gray with blue undertone), chọn vì tương phản tốt với mã nguồn và mắt không mỏi khi dùng lâu.

- **Surface-base (`#020617` — Slate 950)** là nền chính của toàn bộ app. Đây là "giấy" mà developer nhìn vào suốt ngày. Tối nhưng không đen tuyệt đối — undertone xanh nhẹ giữ mắt thoải mái.
- **Surface-raised (`#0f172a` — Slate 900)** cho header, sidebar, modal — một bậc sáng hơn base, đủ phân biệt nhưng không gây gián đoạn thị giác.
- **Surface-overlay (`#1e293b` — Slate 800)** cho dropdown, hover state, card — tạo cảm giác "nổi" mà không cần shadow.
- **Surface-input (`#0d1117`)** — nền code editor, tạo cảm giác "lõm vào" so với surroundings, mượn ý tưởng từ GitHub dark theme.

Màu sắc chức năng tuân theo quy ước ngành đã ăn sâu vào trí nhớ developer:

- **Method HTTP:** mỗi verb một màu duy nhất — GET xanh lá (emerald), POST xanh dương (blue), PUT cam (orange), PATCH vàng (amber), DELETE đỏ (red). Không bao giờ dùng các màu này ngoài mục đích nhận diện method.
- **Status code:** 2xx emerald (thành công), 4xx amber (lỗi client), 5xx rose (lỗi server). Badge status code sử dụng tinted background (10% opacity) + viền (20% opacity) + chấm tròn có glow effect cho 2xx.
- **Syntax highlighting (JSON):** key xanh dương nhạt, string xanh lá nhạt, number cam nhạt, boolean tím, null đỏ. Palette pastel trên nền tối — đủ phân biệt, không chói.
- **Biến môi trường:** `{{resolved}}` hiển thị sky blue, `{{missing}}` hiển thị đỏ + italic. Sự khác biệt phải nhận ra ngay trong 200ms quét mắt.

Tránh: gradient trên surface, màu sắc thuần (pure red/blue/green), bóng đổ nặng, glow effect ngoài status dot.

## Typography

Hai font, hai vai trò, không ngoại lệ:

- **Inter** là giọng nói của giao diện. Dùng cho tất cả UI controls, labels, buttons, menu items, dialog text, toast messages. Inter được chọn vì hệ hỗ trợ tiếng Việt tốt (dấu sắc nét), hinting cho small size tốt, và phổ biến trong developer tools. Weight chính: 400 (body), 500 (semi-emphasis), 600 (heading, label caps), 700 (hiếm dùng — chỉ logo text).

- **JetBrains Mono** là giọng nói của dữ liệu. Dùng cho URL input, method badge, HTTP headers, JSON body/response, query params, variable values, status code, response time, response size. Monospace đảm bảo alignment hoàn hảo trong key-value tables và JSON structure. Ligature tắt trong URL input (tránh `://` bị merge), bật trong JSON viewer.

Tỉ lệ type ramp: `ui-xs` (10px) cho badge/count → `ui-sm` (12px) cho label/caption → `ui-base` (14px) cho body → `heading-sm/md/lg` (14/16/18px) cho tiêu đề. Mono tương ứng: `mono-xs` (10px) cho method tag → `mono-sm` (12px) cho KVP editor → `mono-base` (13px) cho body/response editor.

## Layout & Spacing

Layout cố định 3-pane cho desktop, không responsive (Wails webview kích thước cố định):

- **Top bar:** chiều cao cố định `48px`. Chứa logo, quick actions (Tạo request, Tạo thư mục, Import), environment selector. Padding ngang `12px`.
- **Left sidebar:** chiều rộng cố định `260px`. Tree view collection → folder → request. Scrollable theo chiều dọc.
- **Center-right split:** phần còn lại chia đôi — bên trái là Request Builder, bên phải là Response Viewer. Có thể kéo resize (v2+).

Spacing dùng thang 4px-based: `4 / 8 / 12 / 16 / 20 / 24 / 32`. Khoảng cách giữa pane là `1px` border Slate 800. Padding nội dung trong mỗi pane: `16px` (gutter).

## Elevation & Depth

Không dùng box-shadow làm hierarchy chính — depth được tạo hoàn toàn bằng **tonal layering** (các bậc sáng/tối của Slate palette).

Ngoại lệ duy nhất:
- **Environment Modal:** `shadow-2xl` (Tailwind) + `backdrop-blur(4px)` trên lớp overlay `rgba(0,0,0,0.6)`. Modal là ngữ cảnh tách biệt, cần shadow để "nổi" rõ khỏi workspace.
- **Logo mark:** `shadow-sm` tinh tế, chỉ đủ tạo cảm giác "nhấc" logo khỏi header.
- **Status 2xx dot:** `box-shadow: 0 0 8px {colors.status-2xx-glow}` — glow nhỏ bao quanh chấm tròn xanh, tạo điểm nhấn thị giác cho status thành công.

Tất cả phân biệt khác (pane, card, input) dùng border + background color, không dùng shadow.

## Shapes

Corner radius ngôn ngữ "công cụ, không phải consumer app":

- `rounded/sm` (4px) — input fields, badges, KVP editor inputs. Sắc nét.
- `rounded/md` (6px) — buttons, URL bar, cards, dropdowns, chips. Mặc định cho container tương tác.
- `rounded/lg` (8px) — modal dialog, lớn hơn rõ rệt so với thành phần khác.
- `rounded/xl` (12px) — chỉ dùng cho logo mark.
- `rounded/full` (9999px) — body type chips (None/JSON/Text), tab badge counts. Hình thuốc = metadata indicator.

Không dùng sharp corners (0px radius) cho bất kỳ thành phần nào — hecto-api không phải terminal thuần.

## Components

Mỗi component liệt kê anatomy và visual specs dưới dạng token references. Behavioral rules nằm trong `EXPERIENCE.md`.

### Header
Thanh trên cùng cao `{spacing.header-height}`, nền `{colors.surface-raised}`, viền dưới `{colors.border-default}`. Chia 3 vùng: Logo + Title (trái), Quick Actions (giữa), Env Selector + Settings (phải). Logo mark là hình vuông 32×32 bo `{rounded.xl}`, gradient từ `{colors.brand-gradient-from}` đến `{colors.brand-gradient-to}`, chứa ký tự "h" trắng bold. Bên cạnh logo: tên app `{typography.heading-sm}` màu `{colors.text-primary}`, phiên bản + trạng thái (v1.0 - offline) `{typography.mono-xs}` màu `{colors.text-muted}`.

### Sidebar
Rộng `{spacing.sidebar-width}`, nền `{colors.surface-raised}`, viền phải `{colors.border-default}`. Header sidebar hiển thị "Default Collection" `{typography.ui-xs}` uppercase tracking-wider. Tree view: folder header có icon caret (xoay 90° khi đóng/mở) + icon folder + tên folder `{typography.ui-sm}`. Request row: indent `28px`, viền trái 2px (transparent mặc định, `{colors.brand-primary}` khi active), method badge `{typography.mono-xs}` bold với màu tương ứng + tên request `{typography.ui-sm}`. Hover trên row: nền `{colors.surface-hover}`, nút "..." (3 chấm) xuất hiện.

### URL Bar
Container bo `{rounded.md}`, nền `{colors.surface-base}`, viền `{colors.border-default}`, focus ring `{colors.border-focus}` + `ring-1`. Bên trong chia 3: Method selector dropdown (nền `{colors.surface-overlay}`, viền phải, font `{typography.mono-sm}` bold, màu theo method) | URL input (font `{typography.mono-base}`, chiếm toàn bộ chiều rộng còn lại) | Nút "Gửi" (nền `{colors.brand-primary}`, hover `{colors.brand-primary-hover}`, text trắng, icon paper-plane-right, `{typography.ui-base}` medium).

### KVP Editor (Params & Headers)
Grid 4 cột: checkbox (24px) | Key input | Value input | Delete button (32px). Header hàng đầu: "KEY" / "VALUE" `{typography.ui-xs}` uppercase slate-500. Mỗi row: checkbox accent `{colors.brand-primary}`, input nền `{colors.surface-base}` viền `{colors.border-default}` font `{typography.mono-sm}`. Nút xóa ẩn mặc định, hiện khi hover row, màu slate-600 → hover red-400. Nút "Thêm mới" ở cuối: icon + text `{typography.ui-xs}` slate-400, hover blue-400.

### Body Editor
Container nền `{colors.surface-input}`, viền `{colors.border-default}` bo `{rounded.md}`. Line numbers: cột trái 40px, nền `{colors.surface-raised}`, viền phải, font `{typography.mono-base}` màu `{colors.text-muted}`, user-select: none. Textarea: font `{typography.mono-base}`, padding-left 48px. Body type selector: radio chips hình thuốc (None | JSON | Text), active chip: nền `{colors.surface-overlay}`, viền sáng hơn, text `{colors.text-primary}`.

### Response Meta Bar
Chiều cao 52px, nền `{colors.surface-raised}`, viền dưới. Chứa: Status badge (dot + mã + text) | Clock icon + thời gian (ms) | HDD icon + kích thước (KB/B) | Timestamp (góc phải, `{typography.ui-xs}` slate-500). Status badge: nền tinted 10%, viền 20%, dot 8px có glow (chỉ 2xx), font `{typography.mono-sm}` bold.

### Response JSON Viewer
Nền `#0b0f19` (tối hơn surface-base). Line numbers: cột trái 48px, nền `#090d15`, viền phải. Code vùng: `<pre><code>` font `{typography.mono-base}`, syntax highlight theo palette `{colors.syntax-*}`. Phía trên: toggle Pretty/Raw (segmented control) + nút "Sao chép" ghost.

### Response Headers Table
Table 2 cột: Key (1/3 chiều rộng, `{typography.mono-sm}` slate-300) | Value (2/3, slate-400). Row hover: Key chuyển sang blue-300. Viền hàng `{colors.border-subtle}`.

### Environment Modal
Overlay toàn màn hình, backdrop `rgba(0,0,0,0.6)` + `backdrop-blur(4px)`. Modal: `{env-modal.width}` × `{env-modal.height}`, bo `{rounded.lg}`, viền `{colors.border-default}`, shadow-2xl. Header: "Quản lý Môi trường" + nút đóng X. Body chia 2 cột: Panel trái (220px, danh sách env + nút thêm) | Panel phải (chi tiết env đang chọn, variable table key-value + nút "Thêm biến"). Env active: nền `{colors.surface-overlay}`, dot xanh `{colors.brand-primary}`, icon check. Env inactive: text slate-400, dot slate-600.

### Empty States
Icon lớn 64px opacity 20%, tiêu đề `{typography.heading-md}` slate-400, mô tả `{typography.ui-sm}` slate-500. Hai empty state chính: (1) Chưa chọn request: icon paper-plane-tilt + "Chọn một Request để bắt đầu" + gợi ý Ctrl+N. (2) Chưa gửi request: icon terminal-window + "Nhấn Gửi để xem kết quả phản hồi".

### Warning Banner
Nền `{colors.warning-bg}`, viền `{colors.warning-border}`, bo `{rounded.md}`. Icon warning + text `{typography.ui-xs}` `{colors.warning-text}`. Chỉ xuất hiện khi GET + body ≠ none.

### Keyboard Shortcut Badge (kbd)
Nền `{colors.surface-overlay}`, viền `{colors.border-default}`, bo `{rounded.sm}`, font `{typography.ui-xs}`, padding nhỏ. Dùng inline trong empty state và tooltip.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Dùng Slate palette cho mọi chrome — nền, viền, text | Dùng pure black (`#000`) hoặc pure white (`#fff`) |
| Màu sắc = thông tin: method, status, variable state | Dùng màu để trang trí — gradient nền, accent bar |
| Inter cho UI, JetBrains Mono cho data — không ngoại lệ | Mix mono vào label, hoặc sans-serif vào code |
| Tonal layering (Slate levels) để tạo depth | Box-shadow làm hierarchy chính |
| `{{variable}}` highlight xanh/đỏ tùy trạng thái resolve | Bỏ qua variable state — để text trắng bình thường |
| Status badge: dot + mã + text, tinted background | Chỉ hiển thị số status code không kèm visual cue |
| Empty state: icon + message + gợi ý phím tắt | Để vùng trống hoàn toàn không có guidance |
| Unsaved dot amber nhỏ cạnh tên request | Alert dialog "bạn có muốn lưu không?" chặn flow |
| Modal duy nhất cho Environment — không stack modal | Mở modal trên modal, hoặc drawer chồng drawer |

---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-hecto-api-2026-09-21/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-hecto-api-2026-09-22/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-hecto-api-2026-09-22/SOLUTION-DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-hecto-api-2026-09-21/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-hecto-api-2026-09-21/EXPERIENCE.md
  - docs/product-brief.md
  - research/hecto_api_client.html
---

# hecto-api - Epic Breakdown

## Tổng quan

Tài liệu này phân tách toàn bộ requirements của hecto-api v1 thành các Epic và Story có thể triển khai được. Nguồn input: PRD, Architecture (Spine + Solution Design), UX Design Contract (DESIGN.md + EXPERIENCE.md), Product Brief, và HTML Prototype.

## Bảng Requirements

### Functional Requirements

FR-1: Gửi HTTP request với method GET, POST, PUT, DELETE, PATCH tới bất kỳ URL nào. App hoạt động khi không có internet (trả lỗi connection rõ ràng, không crash/đơ).
FR-2: Quản lý Headers — thêm, sửa, xóa và toggle on/off từng header. Header bị disable (off) không được gửi trong request. Header không có value vẫn được gửi nếu enabled.
FR-3: Quản lý Query Parameters — thêm, sửa, xóa query params qua key-value editor. Params được nối vào URL đúng format `?key=value&key2=value2`. Param bị disable không xuất hiện trong URL.
FR-4: Quản lý Body dạng raw (JSON, Text). Content-Type header tự động set tương ứng khi chọn type (JSON → `application/json`). Khi method là GET và có body, app hiển thị warning message (không chặn, body vẫn được gửi).
FR-5: Hiển thị Response: status code (với màu phân biệt 2xx xanh, 4xx vàng, 5xx đỏ), response headers, body (pretty-print JSON với syntax highlighting + raw text view), response time (ms, integer), response size (bytes, integer).
FR-6: Default Collection — app tự động sử dụng một default Collection. Không có UI chọn/quản lý Collection trong v1. Storage trên disk có cấu trúc hỗ trợ multi-collection để mở rộng sau.
FR-7: Tổ chức bằng Folder — tạo, đổi tên, xóa Folder trong Collection. Folder có thể lồng nhau. Cấu trúc Folder trong app khớp 1:1 với cấu trúc thư mục trên disk.
FR-8: Quản lý Request — tạo, sao chép, đổi tên, xóa, di chuyển Request giữa các Folder. Mỗi Request lưu thành một file JSON riêng trên disk. File Request đọc được bằng text editor.
FR-9: Sidebar navigation — tree view Collection → Folder → Request ở sidebar để điều hướng nhanh. Click vào Request trong sidebar mở request đó trong editor. Tree view phản ánh đúng cấu trúc file trên disk.
FR-10: Tạo và quản lý Environment — CRUD Environment. Mỗi Environment là một tập Variable key-value. Mỗi Environment lưu thành file JSON riêng trong folder `environments/`.
FR-11: Switch Environment — chuyển Environment đang active qua dropdown/selector. Switch ngay lập tức, không cần restart. Tất cả `{{variable}}` trong Request đang mở cập nhật theo Environment mới.
FR-12: Variable substitution — biến dạng `{{key}}` trong URL, Headers, Body được thay thế bằng giá trị từ Environment đang active khi gửi Request. Variable không tồn tại giữ nguyên dạng `{{key}}`, hiển thị highlight đỏ + in nghiêng. Substitution xảy ra lúc gửi, không thay đổi nội dung đã lưu.
FR-13: Import Postman Collection v2.1 JSON — app chuyển đổi sang format nội bộ. Import collection có ≥ 10 requests thành công. Giữ nguyên method, URL, headers, body, folder structure. Variables dạng `{{var}}` được giữ nguyên cú pháp.

### Non-Functional Requirements

NFR-1: Khởi động dưới 2 giây.
NFR-2: RAM dưới 100MB.
NFR-3: Offline-first — app không bao giờ yêu cầu internet để khởi động hoặc hoạt động. Không login, không account, không sync.
NFR-4: File-based storage — JSON trên disk, không database, không cloud sync, không login. Mọi file đọc được bằng text editor.
NFR-5: Git-friendly — collection commit được vào Git. Không binary file, không lock file, không .db.
NFR-6: UI tiếng Việt hoàn toàn — labels, buttons, empty states, error messages. Giữ nguyên tiếng Anh cho thuật ngữ kỹ thuật (HTTP methods, status codes, header keys, JSON, URL, Body, Headers, Params).
NFR-7: Response time và size luôn dùng integer, không float. Size: < 1024B → "N B", ≥ 1024B → "N KB" (chia nguyên).

### Additional Requirements (Architecture)

- AR-1: Wails v2 project setup — Go 1.27.1 backend, Vue 3 + TypeScript frontend, Pinia state management, Tailwind CSS v4, native webview.
- AR-2: Go package structure layered: `app.go` (thin Wails adapter) → `service/` (business logic) → `storage/` (file I/O abstraction) → `model/` (shared data structs). Service testable mà không cần Wails context.
- AR-3: Entity identity = UUID v4 cho mọi entity (request, folder, environment). UUID sinh bởi Go lúc create, không đổi suốt lifecycle. Filename trên disk = slug (readable, Git-friendly) nhưng không phải ID.
- AR-4: Structured error contract — mọi Wails binding trả `Result{Success: bool, Data: T, Error: {Code: string, Message: string}}`. Error codes: NOT_FOUND, VALIDATION, IO_ERROR, PARSE_ERROR, CONNECTION_ERROR, TIMEOUT, ABORTED.
- AR-5: Ranh giới Go/Vue — Go chỉ nhận dữ liệu đã resolve (URL, headers, body không còn `{{...}}`). Vue sở hữu toàn bộ variable substitution. File trên disk luôn lưu raw template.
- AR-6: Wails bindings entity-oriented CRUD — tên hàm = Verb + Entity. 19 bindings: GetCollectionTree, GetRequest, SaveRequest, DeleteRequest, DuplicateRequest, MoveRequest, CreateFolder, RenameFolder, DeleteFolder, ListEnvironments, GetEnvironment, SaveEnvironment, DeleteEnvironment, SendRequest, AbortRequest, ImportPostman, OpenFileDialog, GetAppConfig.
- AR-7: Vue state: 5 Pinia stores — collectionStore (tree + active request ref), requestStore (form state, dirty check), environmentStore (env list, active env, variables map), responseStore (response data, loading state), uiStore (tabs, modals, toasts).
- AR-8: Collection root dùng OS app data directory — config tại `{os.UserConfigDir()}/hecto-api/config.json`, data tại `{dataDir}/hecto-api/collections/default/` (XDG convention).
- AR-9: Atomic file write — ghi temp file → fsync → os.Rename. Tránh corrupt khi disk full hoặc app crash.
- AR-10: UUID→path in-memory index — build lúc GetCollectionTree (startup). CRUD cập nhật index. FindByUUID O(1), fallback walk nếu miss.
- AR-11: Slug generation — Vietnamese diacritics stripped, lowercase, hyphen-separated, .json extension. Slug sinh lúc create và không đổi khi rename.
- AR-12: Single in-flight request — mutex + inflight flag. Reject call thứ hai bằng VALIDATION error. Vue cũng check loading (defense in depth).
- AR-13: Response body limit 10MB — io.LimitReader, truncate nếu vượt, thêm warning.
- AR-14: Auto Content-Type logic — JSON body → auto-add Content-Type: application/json. User header thắng. Re-derive auto-added state khi load từ disk.
- AR-15: Unsaved detection — deep compare original vs current bằng JSON.stringify với sorted-key replacer.
- AR-16: Go structured logging — log/slog. Vue: console.warn/error cho dev, không ship production logs.

### UX Design Requirements

UX-DR1: Implement design token system — 50+ color tokens (surface 5 levels, border 3, text 4, brand 4, method 5, status 9, syntax 5, variable 2, warning 4, scrollbar 3) mapping vào Tailwind CSS v4 `@theme` directive.
UX-DR2: Typography system — Inter (UI controls: ui-base 14px, ui-sm 12px, ui-xs 10px, ui-label 12px/600, heading-lg 18px, heading-md 16px, heading-sm 14px) + JetBrains Mono (data: mono-base 13px, mono-sm 12px, mono-xs 10px, mono-bold 13px/500). Ligature tắt trong URL input, bật trong JSON viewer.
UX-DR3: Component Header — 48px cao, nền surface-raised, viền dưới. Logo mark 32×32 gradient blue→indigo, "h" trắng bold. App title + version badge. Quick actions: Request mới, Thư mục, Import Postman. Env selector + gear button.
UX-DR4: Component Sidebar — 260px rộng, nền surface-raised. Tree view: folder header với caret animated 150ms ease (rotate 90°) + folder icon + tên. Request row: indent 28px, border-left 2px (brand-primary khi active), method badge mono-xs bold color-coded + tên. Hover: nền surface-hover + "..." button fade in 150ms. Double-click → inline rename.
UX-DR5: Component URL Bar — container rounded-md, border focus ring. Method dropdown (surface-overlay, color theo method). URL input mono-base. Nút "Gửi" (brand-primary, icon paper-plane-right) → "Hủy" (nền error-bg, border rose) khi loading.
UX-DR6: Component KVP Editor — shared cho Params & Headers. Grid 4 cột: checkbox (24px) + Key + Value + Delete (32px). Header "KEY"/"VALUE" ui-xs uppercase. Checkbox accent brand-primary. Input surface-base mono-sm. Delete ẩn → hiện hover. Auto-add row khi gõ vào row trống cuối. Giữ ≥ 1 row trống. Tab key nhảy key→value→next key.
UX-DR7: Component Body Editor — surface-input nền, line numbers (40px, surface-raised, mono-base, text-muted). Body type chips radio (None/JSON/Text) rounded-full. Nội dung body giữ nguyên khi chuyển mode (kể cả qua None). None hiện message "Request này không có body".
UX-DR8: Component Warning Banner — warning-bg + warning-border + warning-text. Icon warning + text ui-xs. Chỉ hiện GET + body ≠ none. Tự ẩn khi đổi method hoặc body=none.
UX-DR9: Component Response Meta Bar — 52px, surface-raised. Status badge: tinted bg 10% + border 20% + dot 8px (glow 0 0 8px cho 2xx) + mã + text. Clock icon + time "N ms". HDD icon + size "N B/KB". Timestamp (giờ:phút:giây, ui-xs).
UX-DR10: Component JSON Viewer — nền #0b0f19. Line numbers: 48px, nền #090d15. Syntax highlight: key blue-300, string green-300, number orange-300, boolean purple-400, null red-400. <pre><code> mono-base.
UX-DR11: Component Response Headers Table — 2 cột: Key (1/3, mono-sm slate-300) + Value (2/3, slate-400). Hover: Key → blue-300. Row border border-subtle.
UX-DR12: Component Pretty/Raw Toggle — segmented control. Pretty: JSON formatted + highlight. Raw: text thuần mono. Toggle không reset scroll position. Default Pretty cho JSON response.
UX-DR13: Component Copy Button — click copy raw response. Toast "Đã sao chép" 2s. Icon → checkmark 1.5s → revert.
UX-DR14: Component Environment Selector — custom dropdown header, surface-overlay, rounded-md, 32px. Options: "Không dùng env" + env list. Switch → variable preview cập nhật ngay.
UX-DR15: Component Environment Modal — overlay backdrop rgba(0,0,0,0.6) + blur 4px. Modal 800×500, rounded-lg, shadow-2xl. Header "Quản lý Môi trường" + nút X. Body 2 cột: Panel trái 220px (env list + nút +) + Panel phải (env detail + variable table + nút "Thêm biến"). Active env: dot brand-primary + check icon.
UX-DR16: Component Empty States — 2 loại: (1) Chưa chọn request: icon paper-plane-tilt 64px opacity 20% + "Chọn một Request để bắt đầu" heading-md + gợi ý Ctrl+N. (2) Chưa gửi: icon terminal-window + "Nhấn Gửi để xem kết quả phản hồi".
UX-DR17: Component Toast — auto-dismiss 2-3s. Max 1 toast (mới thay cũ). Không nút đóng. aria-live="polite". Dùng cho: "Đã sao chép", "Đã lưu", "Import thành công", lỗi kết nối.
UX-DR18: Component Context Menu — right-click sidebar. Folder: Đổi tên, Tạo request mới, Tạo thư mục con, Xóa (confirm). Request: Đổi tên, Sao chép, Di chuyển tới... (submenu folder đích), Xóa (confirm).
UX-DR19: Component Confirm Dialog — "Xóa {type} '{name}'? Hành động này không thể hoàn tác." 2 nút: Xóa (đỏ) / Hủy.
UX-DR20: Component Editable Request Name — heading-lg. Hover: underline + pencil icon. Click → inline input. Blur/Enter → save. Escape → cancel.
UX-DR21: Keyboard shortcuts — 15 shortcuts: Ctrl+Enter (gửi), Ctrl+S (lưu), Ctrl+N (request mới), Ctrl+Shift+N (folder mới), Ctrl+I (import), Ctrl+E (env selector focus), Ctrl+L (URL focus), Escape (đóng modal/cancel), F2 (rename), Delete (xóa), Ctrl+D (duplicate), ↑/↓ (nav sidebar), Enter (chọn sidebar), Tab (KVP fields), Ctrl+C response (copy body).
UX-DR22: Accessibility — keyboard navigation đầy đủ (Tab+Enter+Arrow). Focus ring visible (border-focus). Tab order: Header→Sidebar→URL→Request tabs→content→Response. Focus trap trong modal. ARIA labels cho "..." (Tùy chọn), gear (Quản lý môi trường), checkbox (Bật/tắt {key}). Screen reader announce status. Không color-only indicator. Min font 10px. Min click target 32px/24px checkbox.
UX-DR23: State patterns — loading (Send→Cancel, spinner response), error states (connection: wifi-slash + "Thử lại"; timeout; SSL: shield-warning; empty URL: border đỏ + toast), unsaved prompt khi switch request (Lưu/Bỏ qua/Hủy 3 lựa chọn). Aborted: silent clear. Large response >5MB: disable Pretty.
UX-DR24: Variable highlighting — resolved {{key}} = sky blue (variable-valid #38bdf8). Missing {{key}} = red (variable-missing #f87171) + italic. Preview trong editor. Khi env = "Không dùng env": text bình thường, không highlight.
UX-DR25: Request tab bar — 3 tab: Params (badge count key≠empty), Headers (badge count), Body. Active: border-bottom brand-primary + text blue-400.
UX-DR26: Response tab bar — 2 tab: Body, Headers (badge count). Active: border emerald + text emerald.
UX-DR27: Tonal depth system — không box-shadow làm hierarchy. Ngoại lệ: modal shadow-2xl + blur, logo shadow-sm, status 2xx dot glow.
UX-DR28: Corner radius language — sm 4px (input, badges), md 6px (buttons, URL bar, cards), lg 8px (modal), xl 12px (logo), full 9999px (chips, badge counts).
UX-DR29: Custom scrollbar — track surface-raised (#0f172a), thumb Slate 700 (#334155), hover Slate 600 (#475569). Width 8px.
UX-DR30: Import dialog flow — native file picker (Go backend OpenFileDialog). Parse → success modal ("Import thành công: N requests, M folders") + sidebar refresh + auto-select first request. Error → in-modal error message + "Chọn file khác".

### FR Coverage Map

FR-1: Epic 3 — Gửi HTTP request (GET, POST, PUT, DELETE, PATCH)
FR-2: Epic 3 — Quản lý Headers (toggle on/off)
FR-3: Epic 3 — Quản lý Query Parameters
FR-4: Epic 3 — Quản lý Body (JSON, Text) + warning GET+body
FR-5: Epic 3 — Hiển thị Response (status, headers, body, time, size)
FR-6: Epic 1 + Epic 2 — Default Collection (storage: Epic 1, UI: Epic 2)
FR-7: Epic 2 — Folder CRUD + nested
FR-8: Epic 2 — Request CRUD + file trên disk
FR-9: Epic 2 — Sidebar tree navigation
FR-10: Epic 4 — Environment CRUD
FR-11: Epic 4 — Switch Environment
FR-12: Epic 4 — Variable substitution
FR-13: Epic 5 — Import Postman Collection v2.1

## Epic List

### Epic 1: App Shell & Design System
Mở app → hiển thị giao diện desktop 3-pane dark-mode, khởi động < 2 giây. Wails project hoạt động, Go backend skeleton sẵn sàng, Vue frontend render layout shell với design tokens đúng spec. Default collection tự khởi tạo trên disk.
**FRs covered:** FR-6 (storage)
**Also covers:** AR-1, AR-2, AR-4, AR-8, AR-9, AR-10, AR-11, AR-16, UX-DR1, UX-DR2, UX-DR3, UX-DR16, UX-DR17, UX-DR27, UX-DR28, UX-DR29, NFR-1, NFR-2, NFR-4, NFR-5, NFR-6

### Epic 2: Collection Management & Sidebar Navigation
Tạo, đổi tên, xóa folder và request trong sidebar. Tree view hiển thị collection → folder → request, phản ánh 1:1 cấu trúc disk. Click request → load vào editor. Right-click → context menu CRUD. Cấu trúc file Git-friendly, đọc được bằng text editor.
**FRs covered:** FR-6 (UI), FR-7, FR-8, FR-9
**Also covers:** AR-3, AR-6, AR-7, AR-15, UX-DR4, UX-DR18, UX-DR19, UX-DR20, UX-DR21, UX-DR22

### Epic 3: HTTP Request Execution & Response Viewer
Soạn URL, method, headers, params, body → bấm Gửi (Ctrl+Enter) → xem response (status code màu, pretty JSON syntax highlight, raw text, headers table, time ms, size B/KB). Cancel request đang gửi. Error states rõ ràng khi mất kết nối/timeout/SSL.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5
**Also covers:** AR-5, AR-6, AR-12, AR-13, AR-14, UX-DR5, UX-DR6, UX-DR7, UX-DR8, UX-DR9, UX-DR10, UX-DR11, UX-DR12, UX-DR13, UX-DR16, UX-DR21, UX-DR22, UX-DR23, UX-DR25, UX-DR26, NFR-3, NFR-7

### Epic 4: Environment Management & Variable Substitution
Tạo nhiều environment (dev, staging, prod). Switch environment qua dropdown → tất cả {{variable}} tự cập nhật. Variable resolved = xanh, missing = đỏ italic. Gửi request → biến được thay thế, file giữ nguyên template.
**FRs covered:** FR-10, FR-11, FR-12
**Also covers:** AR-5, AR-7, UX-DR14, UX-DR15, UX-DR21, UX-DR24

### Epic 5: Postman Import
Import file Postman Collection v2.1 JSON → app chuyển đổi sang format nội bộ, giữ nguyên folder structure, method, URL, headers, body, {{variables}}. Sidebar refresh, hiển thị collection đã import.
**FRs covered:** FR-13
**Also covers:** AR-6, UX-DR21, UX-DR30

## Epic 1: App Shell & Design System

Mở app → hiển thị giao diện desktop 3-pane dark-mode, khởi động < 2 giây. Wails project hoạt động, Go backend skeleton sẵn sàng, Vue frontend render layout shell với design tokens đúng spec. Default collection tự khởi tạo trên disk.

### Story 1.1: Wails v2 Project Initialization & Go Backend Skeleton

As a developer,
I want a working Wails v2 project with Go backend package structure and model types,
So that I have a solid foundation to build all features upon.

**Acceptance Criteria:**

**Given** an empty project directory
**When** Wails v2 project is initialized with Go 1.27.1 + Vue 3 frontend
**Then** `wails dev` starts successfully and shows a webview window
**And** Go packages exist: `model/types.go`, `service/` (stubs), `storage/filesystem.go`
**And** `model/types.go` contains all domain types: Request, Folder, Environment, Collection, Result, AppError, ExecuteRequest, ExecuteResponse, KVPair, Body
**And** Error code constants are defined: NOT_FOUND, VALIDATION, IO_ERROR, PARSE_ERROR, CONNECTION_ERROR, TIMEOUT, ABORTED
**And** `app.go` is a thin Wails adapter struct with service dependencies injected
**And** `storage/filesystem.go` implements: ReadJSON, WriteJSON (atomic: temp→fsync→rename), Delete, MoveFile, ListDir, MakeDir, Exists, FindByUUID
**And** Go structured logging uses `log/slog`

### Story 1.2: App Config & Default Collection Initialization

As a developer,
I want the app to auto-initialize config and default collection on first launch,
So that the app starts cleanly without manual setup, following XDG conventions.

**Acceptance Criteria:**

**Given** the app starts for the first time (no config exists)
**When** `App.startup(ctx)` runs
**Then** app config is created at `{os.UserConfigDir()}/hecto-api/config.json` with default collection root path
**And** collection data directory is created at `{dataDir}/hecto-api/collections/default/`
**And** `collection.json` is auto-created with UUID, name "Default Collection", timestamps
**And** `environments/` subdirectory is created
**And** if `collection.json` is corrupt (parse error), it is backed up as `.bak` and recreated
**And** if directory creation fails (permissions), error is logged and Wails event `startup-error` is emitted

### Story 1.3: Vue 3 Frontend Setup with Design System Tokens

As a developer,
I want Vue 3 + TypeScript + Pinia + Tailwind CSS v4 configured with the full design token system,
So that all future components use consistent visual styling matching the design spec.

**Acceptance Criteria:**

**Given** the Wails frontend project
**When** frontend dependencies are installed and configured
**Then** Vue 3 + TypeScript + Pinia are set up in `frontend/`
**And** Tailwind CSS v4 uses `@theme` directive with all 50+ color tokens from DESIGN.md (surface 5 levels, border 3, text 4, brand 4, method 5, status 9, syntax 5, variable 2, warning 4, scrollbar 3)
**And** Inter font (400, 500, 600, 700 weights) and JetBrains Mono font (400, 500 weights) are loaded
**And** 12 typography utility classes are defined (ui-base, ui-sm, ui-xs, ui-label, heading-lg/md/sm, mono-base/sm/xs/bold)
**And** Corner radius tokens are configured: sm(4px), md(6px), lg(8px), xl(12px), full(9999px)
**And** Spacing tokens follow 4px-based scale: 4/8/12/16/20/24/32
**And** Custom scrollbar CSS is applied (track: #0f172a, thumb: #334155, hover: #475569, width: 8px)
**And** 5 Pinia store files exist as stubs: collectionStore, requestStore, environmentStore, responseStore, uiStore

### Story 1.4: Main Layout Shell (Header, Sidebar, Content Panes)

As a user,
I want to see a 3-pane desktop layout when I open the app,
So that I have a familiar workspace similar to Postman/Insomnia ready for API testing.

**Acceptance Criteria:**

**Given** the app is launched
**When** the Vue frontend renders
**Then** Header component displays at 48px height with surface-raised background and border-bottom
**And** Header contains: logo mark (32×32 gradient blue→indigo, "h" white bold), app title "hecto-api" (heading-sm), version badge "v1.0 - offline" (mono-xs, text-muted)
**And** Header contains placeholder areas for quick actions (right side) and env selector (far right)
**And** Sidebar renders at 260px width with surface-raised background and border-right
**And** Sidebar header shows "Default Collection" label (ui-xs, uppercase, tracking-wider)
**And** Center pane and Right pane split the remaining width
**And** Tonal depth: no box-shadow on layout elements, only border + background color for hierarchy
**And** All UI text is in Vietnamese (except technical terms: HTTP, JSON, URL, etc.)

### Story 1.5: Empty State & Toast Components

As a user,
I want to see helpful guidance when no request is selected,
So that I know how to get started using the app.

**Acceptance Criteria:**

**Given** the app is open and no request is selected
**When** the center + right pane are empty
**Then** Empty state displays: icon paper-plane-tilt (64px, opacity 20%), title "Chọn một Request để bắt đầu" (heading-md, text-secondary), subtitle with kbd badge "Ctrl+N" (ui-sm, text-muted)
**And** a second empty state variant exists for response pane: icon terminal-window + "Nhấn Gửi để xem kết quả phản hồi"
**And** Toast notification component exists: auto-dismiss after 2-3 seconds, max 1 toast visible (new replaces old), no close button, positioned bottom-right, uses `aria-live="polite"`
**And** Toast can display messages like "Đã lưu", "Đã sao chép", "Import thành công", error messages

### Story 1.6: Slug Generation Utility & UUID→Path Index

As a developer,
I want reliable slug generation for Vietnamese filenames and O(1) UUID lookup,
So that file names are Git-friendly and entity lookup is fast.

**Acceptance Criteria:**

**Given** a Vietnamese string like "Đăng nhập"
**When** slug generation is called
**Then** output is "dang-nhap" (lowercase, diacritics stripped, spaces→hyphens, dedup hyphens, trimmed)
**And** "Get All Users" → "get-all-users"
**And** slug collision in same folder → append "-1", "-2", etc.
**And** slug is generated at create time and does NOT change on rename
**And** UUID→path in-memory index is built during GetCollectionTree
**And** CRUD operations (create, delete, move) update the index
**And** FindByUUID uses O(1) index lookup with fallback walk if index miss

### Story 1.7: Epic 1 Deferred Work Cleanup

As a developer,
I want all deferred work from Epic 1 resolved before moving on,
So that no technical debt accumulates across epics.

**Acceptance Criteria:**

**Given** all stories 1.1–1.6 are complete
**When** a deferred-work audit is performed
**Then** all TODO/FIXME/HACK comments left during Epic 1 are resolved or converted to tracked issues
**And** all stub implementations are replaced with real logic or explicitly documented as out-of-scope
**And** error handling paths are verified (not just happy path)
**And** Go code passes `go vet` and `golangci-lint` with zero warnings
**And** Vue/TypeScript code passes ESLint with zero errors
**And** design tokens in CSS match DESIGN.md spec exactly (spot-check 10 tokens)
**And** `wails dev` starts cleanly with no console errors or warnings
**And** manual smoke test: app launches < 2s, shows 3-pane layout, default collection created on disk

## Epic 2: Collection Management & Sidebar Navigation

Tạo, đổi tên, xóa folder và request trong sidebar. Tree view hiển thị collection → folder → request, phản ánh 1:1 cấu trúc disk. Click request → load vào editor. Right-click → context menu CRUD. Cấu trúc file Git-friendly, đọc được bằng text editor.

### Story 2.1: Collection Tree Loading & Sidebar Rendering

As a user,
I want the sidebar to display my collection's folder/request tree from disk,
So that I can see all my organized requests at a glance.

**Acceptance Criteria:**

**Given** a default collection exists on disk with folders and request files
**When** the app starts
**Then** Go `GetCollectionTree` binding reads disk and returns the tree structure (folders with nested requests)
**And** collectionStore receives and stores the tree data
**And** Sidebar renders the tree: folders with caret icon (▸/▾) + folder-notch icon + name
**And** Requests render inside folders: indented 28px, method badge (mono-xs, bold, color-coded per method) + name
**And** Folder caret animates 150ms ease (rotate 0°→90°) on expand/collapse
**And** Empty folders show without children
**And** Tree reflects disk structure 1:1

### Story 2.2: Create Request & Create Folder

As a user,
I want to create new requests and folders from the sidebar,
So that I can organize my API testing workspace.

**Acceptance Criteria:**

**Given** a collection is loaded in the sidebar
**When** I click "Request mới" button in Header (or Ctrl+N)
**Then** a new request file is created on disk via Go `SaveRequest` binding with UUID, default name "Request mới", method GET, empty URL
**And** the request appears in the sidebar tree under root (or active folder)
**And** the request name enters inline edit mode automatically
**And** the new request is auto-selected in the editor

**Given** a collection is loaded in the sidebar
**When** I click "Thư mục" button in Header (or Ctrl+Shift+N)
**Then** a new folder is created on disk via Go `CreateFolder` binding with UUID, default name "Thư mục mới"
**And** the folder appears in the sidebar tree
**And** the folder name enters inline edit mode automatically

### Story 2.3: Select Request & Load into Editor

As a user,
I want to click a request in the sidebar to view its details,
So that I can review and edit the request before sending.

**Acceptance Criteria:**

**Given** the sidebar shows a tree with requests
**When** I click a request row
**Then** the request is loaded from disk via Go `GetRequest` binding
**And** requestStore is populated with the request data (method, URL, headers, params, body)
**And** the request row gets active styling: surface-hover background, border-left 2px brand-primary, white text
**And** previously active request row loses active styling
**And** center pane shows the request name (heading-lg, editable) and URL bar
**And** right pane shows empty state "Nhấn Gửi để xem kết quả phản hồi"
**And** keyboard ↑/↓ arrows navigate between sidebar items, Enter selects

### Story 2.4: Rename Request & Rename Folder

As a user,
I want to rename requests and folders,
So that I can keep my workspace organized with meaningful names.

**Acceptance Criteria:**

**Given** a request is selected in the sidebar or a request name is shown in the editor
**When** I press F2 or double-click the request name in sidebar
**Then** the name becomes an inline editable text input
**And** pressing Enter or clicking outside saves the new name via Go `SaveRequest` binding
**And** pressing Escape cancels the rename and reverts to original name
**And** the slug filename on disk does NOT change (per AR-11)
**And** the request name in the editor heading also supports click-to-edit (hover shows underline + pencil icon)
**And** toast "Đã lưu" appears on successful rename

**Given** a folder exists in the sidebar
**When** I press F2 on a selected folder or use context menu → "Đổi tên"
**Then** folder name becomes inline editable, same behavior as request rename
**And** Go `RenameFolder` binding updates `_folder.json` metadata

### Story 2.5: Delete Request & Delete Folder

As a user,
I want to delete requests and folders I no longer need,
So that I can keep my collection clean.

**Acceptance Criteria:**

**Given** a request is selected in the sidebar
**When** I press Delete key or use context menu → "Xóa"
**Then** confirm dialog appears: "Xóa request '{name}'? Hành động này không thể hoàn tác."
**And** dialog has two buttons: "Xóa" (red, destructive) and "Hủy"
**And** clicking "Xóa" calls Go `DeleteRequest` binding, removes file from disk
**And** sidebar tree updates, next sibling (or parent) is auto-selected
**And** clicking "Hủy" or pressing Escape closes dialog without action

**Given** a folder is selected in the sidebar
**When** I use context menu → "Xóa"
**Then** confirm dialog shows: "Xóa thư mục '{name}'? Tất cả request bên trong sẽ bị xóa. Hành động này không thể hoàn tác."
**And** Go `DeleteFolder` binding removes folder and all contents from disk recursively

### Story 2.6: Duplicate & Move Request

As a user,
I want to duplicate requests and move them between folders,
So that I can reuse request configurations and reorganize my collection.

**Acceptance Criteria:**

**Given** a request is selected in the sidebar
**When** I press Ctrl+D or use context menu → "Sao chép"
**Then** Go `DuplicateRequest` binding creates a copy with new UUID, name "{original} (bản sao)", same folder
**And** the duplicate appears in sidebar below the original
**And** the duplicate is auto-selected

**Given** a request is selected in the sidebar
**When** I use context menu → "Di chuyển tới..."
**Then** a submenu shows all available folders (nested structure)
**And** selecting a folder calls Go `MoveRequest` binding to move file on disk
**And** sidebar tree updates to reflect the new location

### Story 2.7: Context Menu & Unsaved Changes Detection

As a user,
I want right-click context menus and unsaved change warnings,
So that I can perform actions efficiently and never lose my edits.

**Acceptance Criteria:**

**Given** a folder in the sidebar
**When** I right-click on it
**Then** context menu appears with: "Đổi tên", "Tạo request mới", "Tạo thư mục con", separator, "Xóa"

**Given** a request in the sidebar
**When** I right-click on it
**Then** context menu appears with: "Đổi tên", "Sao chép", "Di chuyển tới..." (submenu), separator, "Xóa"

**Given** I have unsaved changes in the current request (detected by deep compare original vs current via JSON.stringify sorted-key)
**When** I click another request in the sidebar
**Then** a prompt appears: "Request '{name}' có thay đổi chưa lưu." with 3 buttons: "Lưu" / "Bỏ qua" / "Hủy"
**And** "Lưu" saves via `SaveRequest` then switches
**And** "Bỏ qua" discards changes and switches
**And** "Hủy" stays on current request
**And** unsaved indicator: amber dot (w-2, h-2, rounded-full, bg-amber-500) next to request name in editor

### Story 2.8: Epic 2 Deferred Work Cleanup

As a developer,
I want all deferred work from Epic 2 resolved before moving on,
So that collection management is solid and reliable.

**Acceptance Criteria:**

**Given** all stories 2.1–2.7 are complete
**When** a deferred-work audit is performed
**Then** all TODO/FIXME/HACK comments left during Epic 2 are resolved or converted to tracked issues
**And** all Wails bindings (GetCollectionTree, GetRequest, SaveRequest, DeleteRequest, DuplicateRequest, MoveRequest, CreateFolder, RenameFolder, DeleteFolder) return proper Result{} with error codes on failure
**And** edge cases verified: empty collection, deeply nested folders (3+ levels), request with empty name, special characters in names
**And** keyboard navigation works end-to-end: ↑/↓ arrows, Enter, F2, Delete, Ctrl+N, Ctrl+Shift+N, Ctrl+D
**And** context menu positioning is correct (does not overflow viewport)
**And** unsaved changes detection works for all fields (method, URL, headers, params, body)
**And** Go + Vue linting passes with zero errors
**And** manual smoke test: create folder → create request → rename → duplicate → move → delete flow works end-to-end

## Epic 3: HTTP Request Execution & Response Viewer

Soạn URL, method, headers, params, body → bấm Gửi (Ctrl+Enter) → xem response (status code màu, pretty JSON syntax highlight, raw text, headers table, time ms, size B/KB). Cancel request đang gửi. Error states rõ ràng khi mất kết nối/timeout/SSL.

### Story 3.1: URL Bar & Method Selector

As a user,
I want to set the HTTP method and URL for my request,
So that I can target the correct API endpoint.

**Acceptance Criteria:**

**Given** a request is loaded in the editor
**When** the URL bar renders
**Then** URL bar container has rounded-md border, focus ring (brand-primary 50% opacity)
**And** Method dropdown shows: GET, POST, PUT, PATCH, DELETE — each color-coded (GET emerald, POST blue, PUT orange, PATCH amber, DELETE red)
**And** Method dropdown background is surface-overlay with border-right
**And** URL input uses mono-base font, placeholder "https://api.example.com/v1/..."
**And** changing method or URL marks request as dirty (unsaved indicator)
**And** Ctrl+L focuses the URL input
**And** "Gửi" button (brand-primary bg, white text, icon paper-plane-right) is at the right end

### Story 3.2: KVP Editor for Params & Headers

As a user,
I want to manage query parameters and headers in a table editor,
So that I can configure my request with the right parameters and headers.

**Acceptance Criteria:**

**Given** a request is loaded and Params or Headers tab is active
**When** the KVP editor renders
**Then** it displays a grid with 4 columns: checkbox (24px) + Key input + Value input + Delete button (32px)
**And** column headers show "KEY" / "VALUE" (ui-xs, uppercase, text-muted)
**And** checkbox toggles enabled/disabled state (accent brand-primary), disabled rows are visually dimmed
**And** inputs use surface-base background, mono-sm font, border on focus
**And** Delete button is hidden by default, appears on row hover (text-red-400)
**And** typing in the last empty row auto-adds a new empty row below
**And** at least 1 empty row always exists
**And** "Thêm mới" button below the grid adds a new row manually
**And** Tab key navigates: key → value → next row key
**And** request tab bar shows 3 tabs: Params (badge count of non-empty keys), Headers (badge count), Body
**And** active tab: border-bottom brand-primary, text blue-400

### Story 3.3: Body Editor with Type Selector

As a user,
I want to compose a request body in JSON or plain text,
So that I can send data with my API requests.

**Acceptance Criteria:**

**Given** a request is loaded and Body tab is active
**When** the body editor renders
**Then** body type selector shows 3 radio chips (rounded-full): None, JSON, Text
**And** selecting "None" shows message "Request này không có body."
**And** selecting "JSON" or "Text" shows a code editor area with line numbers (40px column, surface-raised bg, mono-base, text-muted)
**And** textarea uses surface-input background, mono-base font, no spell check
**And** body content is preserved when switching between modes (including switching to None and back)
**And** when body type = JSON, Content-Type header is auto-set to "application/json" (AR-14)
**And** if user has manually set Content-Type header, user header wins over auto-set
**And** when method is GET and body type ≠ None, warning banner appears (UX-DR8): warning-bg + warning-border, icon ⚠, "Cảnh báo: Request GET không nên đi kèm Body..."
**And** warning auto-hides when method changes to non-GET or body = None

### Story 3.4: Go HTTP Executor & Send/Cancel Flow

As a user,
I want to send HTTP requests and see real responses from APIs,
So that I can test and debug my API endpoints.

**Acceptance Criteria:**

**Given** a request with URL, method, headers, params, body configured
**When** I click "Gửi" button or press Ctrl+Enter
**Then** Vue resolves all `{{variables}}` from active environment (or passes raw if no env active) — per AR-5
**And** disabled headers and params are excluded from the request
**And** query params are appended to URL: `?key=value&key2=value2`
**And** Go `SendRequest` binding receives `ExecuteRequest{Method, URL, Headers, Body}` with all data pre-resolved
**And** Go uses `net/http.Client` with configurable timeout (default 30s)
**And** response body is limited to 10MB via `io.LimitReader` (AR-13), truncated responses include warning
**And** response time is measured in milliseconds (integer only, NFR-7)
**And** response size in bytes (integer only, NFR-7)
**And** single in-flight request enforced: mutex + inflight flag, second call returns VALIDATION error (AR-12)

**Given** a request is in-flight
**When** I click "Hủy" button (replaces "Gửi" during loading, red bg) or press Escape
**Then** Go `AbortRequest` binding cancels the in-flight `context.Context`
**And** response pane clears silently (no error toast for user-initiated cancel)
**And** "Hủy" button reverts to "Gửi"

### Story 3.5: Response Meta Bar & Status Display

As a user,
I want to see the response status, time, and size at a glance,
So that I can quickly assess the API response.

**Acceptance Criteria:**

**Given** an HTTP response is received
**When** the response meta bar renders
**Then** meta bar is 52px height, surface-raised background
**And** status badge shows: tinted background (10% of status color) + border (20%) + dot (8px, color matching status) + status code + text (e.g., "200 OK")
**And** 2xx status: dot has glow effect `box-shadow: 0 0 8px`, emerald colors
**And** 3xx status: blue tint
**And** 4xx status: amber tint
**And** 5xx status: red tint
**And** response time displays: clock icon + "N ms" (mono, integer only)
**And** response size displays: hard-drives icon + "N B" (< 1024) or "N KB" (≥ 1024, integer division)
**And** timestamp displays: "Hôm nay, HH:mm:ss" (ui-xs, text-muted)

### Story 3.6: JSON Viewer with Syntax Highlighting & Raw Toggle

As a user,
I want to view the response body with syntax highlighting,
So that I can easily read and analyze the JSON response data.

**Acceptance Criteria:**

**Given** an HTTP response with JSON body is received
**When** response body tab is active
**Then** view toggle shows: "Pretty" / "Raw" segmented control (default Pretty for JSON content-type)
**And** Pretty view: JSON formatted with syntax highlighting — key (blue-300), string (green-300), number (orange-300), boolean (purple-400), null (red-400)
**And** Pretty view has line numbers column (48px, bg #090d15, border-right, mono-base, text-muted)
**And** code area background is #0b0f19, uses `<pre><code>` with mono-base font
**And** Raw view: plain text, mono font, no highlighting
**And** toggling Pretty↔Raw preserves scroll position
**And** responses >5MB default to Raw only (disable Pretty)
**And** Copy button (icon copy + "Sao chép"): copies raw response body to clipboard
**And** on copy: toast "Đã sao chép" (2s), icon animates to checkmark for 1.5s then reverts

### Story 3.7: Response Headers Table & Error States

As a user,
I want to view response headers and see clear error messages when requests fail,
So that I can debug API issues effectively.

**Acceptance Criteria:**

**Given** an HTTP response is received
**When** the Headers tab is active in response pane
**Then** response tab bar shows: Body, Headers (badge with count). Active tab: border emerald, text emerald
**And** headers display in a 2-column table: Key (1/3 width, mono-sm, slate-300) + Value (2/3, slate-400, break-all)
**And** row hover: key text → blue-300 transition
**And** rows separated by border-subtle

**Given** a request fails due to connection error
**When** the error response renders
**Then** error state shows: icon wifi-slash (48px), message "Không thể kết nối tới server" (heading-sm), "Kiểm tra URL hoặc kết nối mạng" (ui-sm, text-muted)
**And** "Thử lại" button (outlined style) re-sends the same request

**Given** a request fails due to timeout
**When** the error response renders
**Then** error state shows: icon clock + "Request đã hết thời gian chờ (timeout)"

**Given** a request fails due to SSL error
**When** the error response renders
**Then** error state shows: icon shield-warning + "Lỗi chứng chỉ SSL"

**Given** the URL input is empty
**When** I click "Gửi"
**Then** URL input border turns red, toast "Vui lòng nhập URL" appears, request is NOT sent

### Story 3.8: Epic 3 Deferred Work Cleanup

As a developer,
I want all deferred work from Epic 3 resolved before moving on,
So that the HTTP execution pipeline is production-ready.

**Acceptance Criteria:**

**Given** all stories 3.1–3.7 are complete
**When** a deferred-work audit is performed
**Then** all TODO/FIXME/HACK comments left during Epic 3 are resolved or converted to tracked issues
**And** Go HTTP executor handles all edge cases: redirect following, empty response body, non-UTF8 response, binary response (show size only, no pretty)
**And** response time measurement is accurate (excludes Wails binding overhead)
**And** auto Content-Type logic verified: set on JSON, removed on None, user header wins
**And** single in-flight enforcement tested: rapid double-click "Gửi" does not crash or duplicate
**And** Cancel flow verified: cancel during DNS resolution, during body download, after response received
**And** all keyboard shortcuts work: Ctrl+Enter, Ctrl+S, Ctrl+L, Ctrl+C (response copy), Escape, Tab (KVP)
**And** accessibility: Tab order verified Header→Sidebar→URL→Request tabs→content→Response, focus ring visible on all interactive elements
**And** Go + Vue linting passes with zero errors
**And** manual smoke test: send GET/POST/PUT/DELETE to httpbin.org, verify status/time/size/headers/body display correctly

## Epic 4: Environment Management & Variable Substitution

Tạo nhiều environment (dev, staging, prod). Switch environment qua dropdown → tất cả {{variable}} tự cập nhật. Variable resolved = xanh, missing = đỏ italic. Gửi request → biến được thay thế, file giữ nguyên template.

### Story 4.1: Environment CRUD & Storage

As a user,
I want to create, edit, and delete environments with key-value variables,
So that I can manage different API configurations for dev, staging, and production.

**Acceptance Criteria:**

**Given** the app is open
**When** I click the gear icon in the header (or press Ctrl+E)
**Then** Environment modal opens: overlay backdrop rgba(0,0,0,0.6) + blur 4px, modal 800×500, rounded-lg, shadow-2xl
**And** left panel (220px) shows environment list with "+" button to add new env
**And** right panel shows selected env's name + variable table (Key/Value columns, mono font)
**And** I can add variables via "Thêm biến" button, edit inline, delete via trash icon on hover
**And** active env has dot (brand-primary color) + check icon in list
**And** new environment is created via Go `SaveEnvironment` binding with UUID, stored as JSON file in `environments/` folder
**And** deleting an environment calls Go `DeleteEnvironment`, removes file from disk
**And** closing modal (X button or Escape) saves changes automatically
**And** focus is trapped inside modal (Tab does not escape to background)

### Story 4.2: Environment Selector & Quick Switch

As a user,
I want to quickly switch between environments from the header,
So that I can test the same requests against different API servers instantly.

**Acceptance Criteria:**

**Given** environments exist
**When** I look at the header bar
**Then** environment selector dropdown shows: "Không dùng env" (default) + all environment names
**And** dropdown uses surface-overlay background, rounded-md, 32px height, custom caret icon
**And** selecting an environment updates `environmentStore.activeEnv` immediately
**And** Go `ListEnvironments` binding provides the environment list on startup
**And** switching environment does NOT require restart or re-opening the request
**And** Ctrl+E opens/focuses the env selector

### Story 4.3: Variable Substitution Engine

As a user,
I want `{{variable}}` placeholders in my requests to be replaced with environment values when I send,
So that I can reuse the same request across different environments.

**Acceptance Criteria:**

**Given** an environment is active with variables like `base_url = http://localhost:3000`
**When** I send a request with URL `{{base_url}}/api/users`
**Then** Vue resolves `{{base_url}}` → `http://localhost:3000` before passing to Go backend (AR-5)
**And** substitution applies to: URL, header values, query param values, body content
**And** header keys are NOT substituted (only values)
**And** missing variables (no matching key in active env) are kept as literal `{{key}}` in the sent request
**And** file on disk always stores the raw template with `{{...}}` — never the resolved values
**And** when env is "Không dùng env", no substitution occurs, `{{...}}` are sent as-is

### Story 4.4: Variable Highlighting in Editor

As a user,
I want to see which variables will be resolved and which are missing,
So that I can catch configuration errors before sending.

**Acceptance Criteria:**

**Given** an environment is active and the URL/headers/body contain `{{variable}}` patterns
**When** the editor renders
**Then** resolved variables display in sky blue color (variable-valid #38bdf8)
**And** missing variables (key not found in active env) display in red (variable-missing #f87171) + italic style
**And** highlighting updates immediately when switching environment
**And** when env is "Không dùng env", variable patterns display as normal text (no highlighting)
**And** variable highlighting works in: URL input, header value inputs, body editor textarea

### Story 4.5: Epic 4 Deferred Work Cleanup

As a developer,
I want all deferred work from Epic 4 resolved before moving on,
So that environment management is complete and reliable.

**Acceptance Criteria:**

**Given** all stories 4.1–4.4 are complete
**When** a deferred-work audit is performed
**Then** all TODO/FIXME/HACK comments left during Epic 4 are resolved or converted to tracked issues
**And** edge cases verified: environment with 0 variables, variable value containing `{{nested}}`, variable key with special characters, duplicate variable keys (last wins)
**And** env modal keyboard navigation works: Tab between fields, Enter to confirm, Escape to close
**And** variable substitution does not break URL encoding (special characters in values are preserved)
**And** switching env while request is in-flight does not affect the running request
**And** Go + Vue linting passes with zero errors
**And** manual smoke test: create env → add variables → switch env → verify URL/headers/body highlight → send request → verify substitution

## Epic 5: Postman Import

Import file Postman Collection v2.1 JSON → app chuyển đổi sang format nội bộ, giữ nguyên folder structure, method, URL, headers, body, {{variables}}. Sidebar refresh, hiển thị collection đã import.

### Story 5.1: Postman v2.1 Parser & Collection Converter

As a user,
I want to import a Postman Collection v2.1 JSON file into hecto-api,
So that I can migrate my existing API workspace without re-creating everything manually.

**Acceptance Criteria:**

**Given** a Postman Collection v2.1 JSON file exists on disk
**When** I click "Import Postman" in Header (or press Ctrl+I)
**Then** native file picker opens via Go `OpenFileDialog` binding (filter: *.json)
**And** Go `ImportPostman` binding parses the Postman v2.1 JSON format
**And** Postman `item` array is converted: items with `request` → Request files, items with `item` children → Folders
**And** each request preserves: name, method, URL (raw), headers (key/value/enabled), body (raw content + mode)
**And** Postman `{{variable}}` syntax is preserved as-is (compatible with hecto-api format)
**And** folder structure is preserved: nested Postman folders → nested disk folders
**And** slug filenames are generated for each request and folder, collision handling with "-1", "-2" suffix
**And** collection with ≥ 10 requests imports successfully (per PRD acceptance criteria)
**And** import creates files under the default collection root

### Story 5.2: Import Feedback & Error Handling

As a user,
I want clear feedback on import success or failure,
So that I know whether my Postman data was imported correctly.

**Acceptance Criteria:**

**Given** a Postman file is selected and parsed successfully
**When** import completes
**Then** success toast shows: "Import thành công: N requests, M folders"
**And** sidebar tree refreshes to show the imported folders and requests
**And** first imported request is auto-selected in the editor

**Given** a Postman file with invalid JSON or unsupported format
**When** import fails
**Then** error toast shows specific message: "File không hợp lệ: không phải Postman Collection v2.1"
**And** sidebar remains unchanged

**Given** a Postman file is selected but it's not a Postman Collection (e.g., environment file, random JSON)
**When** import parsing detects missing `info._postman_id` or `info.schema` mismatch
**Then** error message: "File này không phải Postman Collection. Vui lòng chọn file collection (.json)"

### Story 5.3: Epic 5 Deferred Work Cleanup

As a developer,
I want all deferred work from Epic 5 resolved,
So that the Postman import feature is complete and handles real-world collections.

**Acceptance Criteria:**

**Given** all stories 5.1–5.2 are complete
**When** a deferred-work audit is performed
**Then** all TODO/FIXME/HACK comments left during Epic 5 are resolved or converted to tracked issues
**And** edge cases verified: empty Postman collection (0 items), collection with deeply nested folders (4+ levels), requests with no body, requests with form-data body (converted to raw JSON or skipped with warning)
**And** Postman auth helpers (Bearer, Basic in collection-level auth) are converted to header entries where possible
**And** large import (50+ requests) completes without UI freeze
**And** Go + Vue linting passes with zero errors
**And** manual smoke test: export a real Postman collection → import into hecto-api → verify all requests load and send correctly

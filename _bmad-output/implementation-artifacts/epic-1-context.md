# Epic 1 Context: App Shell & Design System

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Mở app → hiển thị giao diện desktop 3-pane dark-mode, khởi động < 2 giây. Wails v2 project hoạt động, Go backend skeleton sẵn sàng với package structure layered, Vue frontend render layout shell với design tokens đúng spec. Default collection tự khởi tạo trên disk theo XDG convention.

## Stories

- Story 1.1: Wails v2 Project Initialization & Go Backend Skeleton
- Story 1.2: App Config & Default Collection Initialization
- Story 1.3: Vue 3 Frontend Setup with Design System Tokens
- Story 1.4: Main Layout Shell (Header, Sidebar, Content Panes)
- Story 1.5: Empty State & Toast Components
- Story 1.6: Slug Generation Utility & UUID→Path Index
- Story 1.7: Epic 1 Deferred Work Cleanup

## Requirements & Constraints

- App phải khởi động dưới 2 giây, RAM dưới 100MB.
- Offline-first: không yêu cầu internet, không login, không account, không sync.
- File-based storage: JSON trên disk, không database. Mọi file đọc được bằng text editor, Git-friendly.
- UI tiếng Việt hoàn toàn — giữ nguyên tiếng Anh cho thuật ngữ kỹ thuật (HTTP, JSON, URL, Body, Headers, Params).
- Response time và size luôn dùng integer, không float.
- Default Collection tự tạo khi app khởi chạy lần đầu — storage structure hỗ trợ multi-collection để mở rộng sau nhưng v1 chỉ dùng default.

## Technical Decisions

- **Stack**: Go 1.27.1 backend, Wails v2, Vue 3 + TypeScript + Pinia + Tailwind CSS v4 frontend, native webview.
- **Go package structure (AD-5)**: `app.go` (thin Wails adapter) → `service/` (business logic) → `storage/` (file I/O abstraction) → `model/` (shared data structs). Service testable không cần Wails context.
- **Entity identity (AD-4)**: UUID v4 cho mọi entity. UUID sinh bởi Go, không đổi suốt lifecycle. Filename = slug (readable, Git-friendly) nhưng không phải ID.
- **Error contract (AD-3)**: `Result{Success, Data, Error{Code, Message}}`. Error codes: NOT_FOUND, VALIDATION, IO_ERROR, PARSE_ERROR, CONNECTION_ERROR, TIMEOUT, ABORTED.
- **Wails bindings (AD-2)**: Entity-oriented CRUD. Tên hàm = Verb + Entity. 19 bindings tổng cộng.
- **Go/Vue boundary (AD-1)**: Go chỉ nhận dữ liệu đã resolve (không còn `{{...}}`). Vue sở hữu variable substitution. File trên disk lưu raw template.
- **Collection root (AD-7)**: Config tại `{os.UserConfigDir()}/hecto-api/config.json`. Data tại `{dataDir}/hecto-api/collections/default/` (XDG convention).
- **Atomic file write**: temp file → fsync → os.Rename.
- **Slug generation**: Vietnamese diacritics stripped, lowercase, hyphen-separated, .json extension. Slug sinh lúc create, không đổi khi rename.
- **UUID→path index**: In-memory, build khi GetCollectionTree. CRUD cập nhật. FindByUUID O(1), fallback walk.
- **Logging**: Go dùng `log/slog`. Vue: `console.warn`/`console.error` cho dev.
- **Pinia stores**: 5 stores — collectionStore, requestStore, environmentStore, responseStore, uiStore.

## UX & Interaction Patterns

- Design token system: 50+ color tokens (surface 5 levels, border 3, text 4, brand 4, method 5, status 9, syntax 5, variable 2, warning 4, scrollbar 3) mapping vào Tailwind CSS v4 `@theme`.
- Typography: Inter (UI) + JetBrains Mono (data/code). 12 utility classes.
- Header: 48px cao, surface-raised, logo gradient blue→indigo, app title, version badge, quick actions, env selector.
- Sidebar: 260px rộng, surface-raised, tree view.
- Tonal depth: không box-shadow, chỉ border + background color cho hierarchy. Ngoại lệ: modal, logo, status dot.
- Corner radius: sm(4px), md(6px), lg(8px), xl(12px), full(9999px).
- Custom scrollbar: track #0f172a, thumb #334155, hover #475569, width 8px.
- Toast: auto-dismiss 2-3s, max 1, không nút đóng, aria-live="polite".
- Empty states: 2 loại (chưa chọn request, chưa gửi).

## Cross-Story Dependencies

- Story 1.1 (Wails project + Go skeleton) là foundation cho tất cả stories còn lại.
- Story 1.2 (App Config) phụ thuộc 1.1 (cần Go backend hoạt động).
- Story 1.3 (Vue + Design Tokens) phụ thuộc 1.1 (cần Wails frontend scaffold).
- Story 1.4 (Layout Shell) phụ thuộc 1.3 (cần design tokens).
- Story 1.5 (Empty State + Toast) phụ thuộc 1.4 (cần layout panes).
- Story 1.6 (Slug + UUID Index) phụ thuộc 1.1 (Go package structure).
- Story 1.7 (Cleanup) chờ tất cả 1.1-1.6 xong.

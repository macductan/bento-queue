# Epic 4 Context: Environment Management & Variable Substitution

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Cho phép người dùng tạo nhiều Environment (dev, staging, prod) — mỗi Environment là một tập biến key-value — và chuyển đổi tức thì qua dropdown ở header. Mọi `{{variable}}` trong URL, Headers, Body của request đang mở được highlight theo trạng thái (resolved = xanh sky, missing = đỏ + italic) và được thay thế bằng giá trị thật lúc gửi, trong khi file trên disk luôn giữ nguyên template. Đây là điều kiện để cùng một request chạy được trên nhiều server mà không phải sửa từng request.

## Stories

- Story 4.1: Environment CRUD & Storage
- Story 4.2: Environment Selector & Quick Switch
- Story 4.3: Variable Substitution Engine
- Story 4.4: Variable Highlighting in Editor
- Story 4.5: Epic 4 Deferred Work Cleanup

## Requirements & Constraints

- **CRUD Environment:** tạo, sửa, đổi tên, xóa Environment. Mỗi Environment lưu thành một file JSON riêng trong thư mục `environments/` của collection root; đọc được bằng text editor, Git-friendly.
- **Switch:** đổi Environment active ngay lập tức, không restart, không cần mở lại request. Tất cả `{{variable}}` trong request đang mở cập nhật preview theo env mới. Có lựa chọn "Không dùng env" (mặc định) — khi đó không substitution, không highlight, không warning.
- **Substitution lúc gửi:** `{{key}}` trong URL, query param values, header values, body content được thay bằng giá trị từ env active. Biến không tồn tại giữ nguyên literal `{{key}}` và request vẫn được gửi (không chặn). Substitution không bao giờ thay đổi nội dung đã lưu.
- **Ngữ nghĩa resolve:** single-pass — không re-expand, không hỗ trợ biến lồng nhau hay tự tham chiếu (giá trị chứa `{{nested}}` được giữ nguyên như text). Key trong `{{ }}` được trim. Chỉ biến `enabled` mới tham gia. Trùng key → bản sau thắng.
- **URL encoding:** substitution không được làm hỏng URL encoding; ký tự đặc biệt trong giá trị phải được giữ đúng. Param key/value được `encodeURIComponent` sau khi resolve.
- **Đổi env khi đang có request in-flight** không được ảnh hưởng request đang chạy.
- **Persistence:** Environment auto-save khi đóng modal (X / Escape / click backdrop) — khác với request (chỉ lưu thủ công).
- **Ngôn ngữ UI:** tiếng Việt; giữ tiếng Anh cho thuật ngữ kỹ thuật (environment, variable, header, body, URL…). Ví dụ thông báo: "Biến `{{token}}` chưa có giá trị trong env hiện tại".
- Offline-first, file-based JSON, không database.

> [!WARNING]
> Mâu thuẫn trong planning cần chốt khi làm Story 4.3: story yêu cầu **không** substitute header keys (chỉ values), nhưng mẫu `buildResolvedRequest` trong thiết kế lại resolve cả header key lẫn param key. Ưu tiên acceptance criteria của story trừ khi được quyết định khác.

## Technical Decisions

- **Ranh giới Go/Vue:** Vue sở hữu toàn bộ variable substitution — cả preview highlight lẫn resolve trước khi gọi `SendRequest`. Go chỉ nhận dữ liệu đã resolve (không còn `{{...}}`) và chỉ làm CRUD file Environment.
- **Data model:** `Environment { id, name, variables: []KVPair{key, value, enabled}, created_at, updated_at }`. Variables có thứ tự. UUID v4 sinh bởi Go lúc create, không đổi suốt vòng đời; filename = slug từ tên (bỏ dấu tiếng Việt, lowercase, gạch nối, `.json`), sinh lúc create và không đổi khi rename. Vue tham chiếu env bằng UUID.
- **Wails bindings (Verb + Entity, trả `Result{Success, Data, Error{Code, Message}}`):** `ListEnvironments()`, `GetEnvironment(id)`, `SaveEnvironment(env)` (upsert), `DeleteEnvironment(id)`. Error codes cố định: `NOT_FOUND`, `VALIDATION`, `IO_ERROR`, `PARSE_ERROR`…
- **Go layering:** `app.go` (adapter mỏng) → `service/environment.go` (business logic, test được không cần Wails) → `storage/` (file I/O, ghi atomic temp → fsync → rename) → `model/`.
- **`environmentStore` (Pinia):** state `environments`, `activeEnvId: string | null` (null = "Không dùng env"), `variablesMap: Record<string,string>` (flatten từ các biến enabled của env active). Actions `loadAll()` → `ListEnvironments()` (gọi lúc app mount), `setActive(id)`, `save(env)`, `delete(id)`. Chỉ mutate state qua store actions. `uiStore.envModalOpen` điều khiển modal.
- **`utils/variables.ts`:** pattern `/\{\{([^}]+)\}\}/g`; `parseVariables(input, vars)` → segments `text | resolved | missing` cho highlight; `resolveVariables(input, vars)` → chuỗi đã thay (missing giữ nguyên match). Hàm build request đã resolve được dùng trong send flow: lấy `variablesMap` → resolve URL/params/headers/body → lọc enabled → nối query params vào URL (tránh double `?`).
- **Components:** `components/environment/EnvSelector.vue` (dropdown header + nút gear), `EnvModal.vue` (modal quản lý).

## UX & Interaction Patterns

- **Env selector (header, góc phải):** custom dropdown, nền surface-overlay, border-default, rounded-md, cao 32px, font ui-xs/500, caret icon riêng. Options: "Không dùng env" + danh sách env. Cạnh đó là nút gear (aria-label "Quản lý môi trường") mở modal.
- **Environment modal:** overlay `rgba(0,0,0,0.6)` + blur 4px; modal 800×500, nền surface-raised, rounded-lg, shadow-2xl. Header "Quản lý Môi trường" + nút X. Panel trái 220px (danh sách env + nút "+"; tạo mới → focus input tên); panel phải: tên env + bảng biến Key/Value (mono-sm, key `#93c5fd`) + nút "Thêm biến", sửa inline, xóa bằng icon thùng rác khi hover. Env active: nền surface-overlay + dot brand-primary + icon check; inactive: text slate-400, dot slate-600. Chỉ 1 tầng modal — không stack.
- **Accessibility modal:** focus trap (Tab không thoát ra nền), Escape đóng và trả focus về trigger, Tab giữa các field, Enter để xác nhận.
- **Highlight biến:** resolved = `variable-valid #38bdf8`; missing = `variable-missing #f87171` + italic; phải phân biệt được trong ~200ms quét mắt. Áp dụng cho URL input, header value inputs, body editor. Cập nhật ngay khi đổi env. Tooltip xem giá trị khi hover là v2+.
- **Phím tắt:** `Ctrl+E` focus/mở env selector (UX spec). Lưu ý Story 4.1 cũng nhắc Ctrl+E mở modal — thống nhất theo UX spec: Ctrl+E → selector, gear → modal.
- Biến missing trong URL path sẽ bị URL-encode thành `%7B%7Bkey%7D%7D` khi gửi; trong headers/body giữ nguyên text.

## Cross-Story Dependencies

- 4.1 (storage + store CRUD) là nền cho 4.2 (selector cần `ListEnvironments` + `activeEnvId`) và 4.3/4.4 (cần `variablesMap`).
- 4.3 và 4.4 dùng chung `utils/variables.ts` (`resolveVariables` / `parseVariables`) — nên xây engine trước, highlight sau.
- Phụ thuộc Epic 1: atomic file write, slug utility, cấu trúc collection root có `environments/`, header shell (vị trí selector + gear), Toast.
- Phụ thuộc Epic 3: send flow (`responseStore.send` / build request trước `SendRequest`) là nơi gắn substitution; URL bar, KVP editor, body editor là nơi gắn highlight. Single in-flight request của Epic 3 liên quan tới yêu cầu đổi env khi đang gửi.
- Epic 5 (Postman import) giữ nguyên cú pháp `{{var}}`, nên phải tương thích với engine này.

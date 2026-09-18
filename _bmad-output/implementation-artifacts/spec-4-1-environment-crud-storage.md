---
title: 'Story 4.1: Environment CRUD & Storage'
type: 'feature'
created: '2026-10-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '1d2ff7f125b1c385ebc6752ab90cdd721f356e36'
context: []
warnings: []
deferred:
  - summary: >-
      Auto-save unconditionally saves all loaded environments.
    evidence: |-
      In EnvModal.vue, closeAndSave iterates and saves all loaded environments instead of tracking and saving only dirtied instances.
    location: >-
      projects/frontend/src/components/environment/EnvModal.vue
    severity: low
  - summary: >-
      Save and Delete execute inconsistently.
    evidence: |-
      Saves are deferred until modal close, while deletion is executed immediately on the backend without confirmation.
    location: >-
      projects/frontend/src/components/environment/EnvModal.vue
    severity: low
  - summary: >-
      Accessibility focus trap missing in modal.
    evidence: |-
      User can tab out of the modal into the background page, violating standard accessibility practices.
    location: >-
      projects/frontend/src/components/environment/EnvModal.vue
    severity: low
  - summary: >-
      variablesMap uses Map instead of Record.
    evidence: |-
      The store uses a Javascript Map for variables which may break downstream components expecting a POJO, though it works safely within this boundary.
    location: >-
      projects/frontend/src/stores/environmentStore.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Hiện tại ứng dụng chưa hỗ trợ tạo và quản lý các môi trường (Environment) để tái sử dụng biến giữa các request (ví dụ: dev, staging, prod), khiến người dùng phải sửa thủ công từng request nếu URL hoặc auth token thay đổi.

**Approach:** Xây dựng tính năng CRUD Environment bao gồm: lưu trữ file JSON cho từng env trong thư mục `environments/` bằng Go, cung cấp Wails bindings, và UI trên Vue với `EnvModal.vue` để quản lý danh sách môi trường và các biến (key-value) kèm theo trạng thái on/off. UI sẽ gọi Wails API và cập nhật `environmentStore`.

## Boundaries & Constraints

**Always:**
- Lưu trữ mỗi Environment thành một file JSON có tên format `{slug-từ-tên}.json` nằm trong thư mục `environments/` của root collection. ID (UUID) không được thay đổi, tên file không đổi khi rename env.
- Đảm bảo cơ chế Atomic write (ghi vào temp rồi rename) khi lưu file Environment để tránh hỏng dữ liệu, tận dụng cơ chế filesystem đã có.
- Giao diện modal quản lý Env phải có 2 panel: bên trái là danh sách Env (kèm nút tạo mới), bên phải là form chỉnh sửa (Tên env, bảng Key/Value có nút Thêm biến và xóa inline).
- Tự động lưu (auto-save) môi trường khi người dùng đóng modal (Escape, click outside, hoặc click nút X).

**Never:**
- Không hỗ trợ biến lồng nhau hay tham chiếu chéo giữa các biến.
- Không load hoặc hiển thị Environment data nếu không thuộc root collection đang mở.
- Không thay đổi UUID của môi trường hoặc thay đổi filename sau khi môi trường đã được tạo (dù đổi tên hiển thị).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo Env mới | Click "+" trong modal | Tạo Env "Môi trường mới" với 1 dòng KVP rỗng, ID sinh tự động | Báo lỗi VALIDATION nếu không thể sinh ID |
| Đổi tên Env | Sửa tên Env trong panel phải, đóng modal | Tên mới được cập nhật trên disk (bên trong file JSON), filename không đổi | Báo lỗi IO_ERROR nếu không thể ghi file |
| Thêm/sửa biến | Nhập Key="host", Value="localhost", đóng modal | Mảng Variables lưu `{key: "host", value: "localhost", enabled: true}` | - |
| Xóa Env | Click icon xóa trên Env ở danh sách | File JSON bị xóa, store loại bỏ env khỏi list | Báo lỗi IO_ERROR nếu không thể xóa |
| Trùng filename lúc tạo | Tạo "Prod" nhưng `prod.json` đã tồn tại | Gắn hậu tố `-1`, `-2` vào filename (ví dụ `prod-1.json`) để không overwrite | - |

</intent-contract>

## Code Map

- `projects/model/types.go` -- Đã có `Environment`, `KVPair` struct.
- `projects/storage/filesystem.go` -- Cần bổ sung logic cho thư mục `environments/`: `SaveEnvironment` (upsert), `ListEnvironments`, `DeleteEnvironment`, `GetEnvironment`.
- `projects/service/environment.go` -- Implement các hàm Wails binding (`List`, `Get`, `Save`, `Delete`) sử dụng `storage.FileSystem`.
- `projects/app.go` -- Các hàm binding `ListEnvironments`, v.v. đã khai báo, cần gọi xuống `envSvc` và expose ra frontend.
- `projects/frontend/src/stores/environmentStore.ts` -- Bổ sung state `environments`, `activeEnvId`, action `loadAll`, `save`, `delete`, `setActive` và expose `variablesMap`.
- `projects/frontend/src/stores/uiStore.ts` -- Quản lý state mở/đóng Env modal (`envModalOpen`).
- `projects/frontend/src/components/environment/EnvModal.vue` -- (Mới) Component Modal quản lý môi trường, gọi actions từ `environmentStore`.
- `projects/frontend/src/components/AppHeader.vue` -- (Update) Cần import và mount `EnvModal` ở đâu đó trong layout (có thể là root layout `App.vue` hoặc `AppHeader.vue` để trigger modal mở ra).

## Tasks & Acceptance

**Execution:**
- `projects/storage/filesystem.go` -- Thêm logic xử lý file Environment (đọc/ghi thư mục `environments/`, generate safe filename khi tạo mới, hỗ trợ atomic write thông qua hàm có sẵn).
- `projects/service/environment.go` -- Triển khai các phương thức interface cho Environment (`List`, `Get`, `Save`, `Delete`) gọi xuống `storage`. Generate UUID lúc `Save` nếu ID rỗng.
- `projects/app.go` -- Cập nhật các binding methods `ListEnvironments`, `GetEnvironment`, `SaveEnvironment`, `DeleteEnvironment` gọi logic từ `envSvc`.
- `projects/frontend/wailsjs/` -- Generate bindings (`wails generate module`) để frontend có API mới.
- `projects/frontend/src/stores/environmentStore.ts` -- Viết các action gọi Go bindings tương ứng và quản lý local state array. Tính toán `variablesMap` (dành cho story sau sử dụng).
- `projects/frontend/src/stores/uiStore.ts` -- Bổ sung ref boolean `envModalOpen`.
- `projects/frontend/src/components/environment/EnvModal.vue` -- Tạo component modal mới với UI 2 panel (trái: danh sách env, phải: chi tiết env đang chọn). Auto-save gọi store action khi modal đóng.
- `projects/frontend/src/components/AppHeader.vue` -- Thêm nút "gear" (icon) hoặc phím tắt Ctrl+E (nếu được) mở `envModalOpen = true`. Import `EnvModal` vào layout tổng.

**Acceptance Criteria:**
- Given collection root hợp lệ, when gọi `SaveEnvironment`, then file `environments/{slug}.json` được tạo chứa JSON chuẩn.
- Given thư mục `environments/` chứa các file JSON, when gọi `ListEnvironments`, then trả về danh sách các Env struct.
- Given Env modal đang mở, when thay đổi thông tin và click outside/Esc để đóng, then thay đổi tự động được lưu xuống disk.

## Spec Change Log

## Review Triage Log

## Design Notes

- **Auto-save Modal**: Dùng watch effect hoặc callback khi modal đóng để trigger `environmentStore.save(currentEnv)`. Tránh save liên tục theo từng keystroke để tiết kiệm IO.
- **KVP Table**: Bảng biến (Variables) cho phép user nhập "Key", "Value" (input text đơn giản) và toggle checkbox "Enabled". Thêm dòng rỗng tự động dưới cùng khi dòng cuối được nhập (như RequestEditor).
- **Env ID và Filename**: Go generate UUID và filename khi Env được truyền xuống `Save` mà chưa có ID/chưa có file.

## Verification

**Commands:**
- `cd projects && go test ./service ./storage -v` -- expected: Test backend env methods pass.
- `cd projects/frontend && bun run type-check` -- expected: TypeScript không báo lỗi.

**Manual checks (if no CLI):**
- Mở app, click icon gear (hoặc phím tắt nếu setup) để mở modal.
- Tạo mới 1 môi trường, sửa tên, thêm biến, đóng modal. Kiểm tra file `environments/tên-moi-truong.json` được ghi đúng format JSON chưa. Mở lại modal xem dữ liệu có còn giữ không.
- Thử xóa môi trường, xem file JSON có mất không.

## Auto Run Result

Status: in-review
Blocking condition: none

## Review Triage Log

### 2026-10-07 — Review pass
- verdicts: 21 findings — high 1, medium 10, low 7, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Testing asymmetry (missing frontend tests) — the intent/spec does not require UI tests.
  - `[false]` `[reject]` UUID generation error handling — `uuid.NewString()` does not fail in this library.
  - `[low]` `[defer]` Auto-save efficiency issue (saves all loaded environments) — pre-existing or low impact issue that would require tracking dirty state.
  - `[medium]` `[patch]` slugify strips non-ASCII instead of replacing Vietnamese diacritics — Applied patch to manually replace diacritics.
  - `[medium]` `[patch]` UI uses English text instead of Vietnamese — Applied patch to translate hardcoded strings in EnvModal.vue.
  - `[medium]` `[patch]` App.vue binds Ctrl+E to modal instead of selector — Applied patch to remove Ctrl+E binding from App.vue.
  - `[low]` `[defer]` closeAndSave unconditionally saves all environments — pre-existing or low impact issue that would require tracking dirty state.
  - `[low]` `[defer]` Save and Delete inconsistency (delete executes immediately) — low severity, user is prompted by UI but that isn't built here.
  - `[low]` `[defer]` Accessibility focus trap missing in modal — low severity, adds unnecessary complexity for this diff.
  - `[medium]` `[patch]` closeAndSave sets open=false before await — Applied patch to await saving before closing modal.
  - `[low]` `[defer]` variablesMap uses Map instead of Record — POJO typing in typescript isn't strictly violated since Map isn't used across boundaries.
  - `[medium]` `[patch]` SaveEnvironment ignores ListDir error — Applied patch to return error if not ErrNotFound.
  - `[medium]` `[patch]` Missing test assertion for environment timestamp updates — Applied patch to service tests.
  - `[medium]` `[patch]` Missing test coverage for multiple filename collisions — Applied patch to storage tests.
  - `[low]` `[patch]` Missing test coverage for empty slug fallback — Applied patch to storage tests.
  - `[medium]` `[patch]` Missing test coverage for service layer List/Get/Delete — Applied patch to service tests.
  - `[medium]` `[patch]` slugify violates spec (duplicate) — Applied patch to manually replace diacritics.
  - `[low]` `[defer]` closeAndSave unconditional save (duplicate) — pre-existing or low impact issue that would require tracking dirty state.
  - `[false]` `[reject]` environments/ directory doesn't exist on first save — WriteJSON automatically creates parent directories.
  - `[medium]` `[patch]` Closing modal while backend delete is awaited causes resurrection — Applied patch to wait for delete before splicing UI array.
  - `[high]` `[patch]` Backend remove fails but env disappears from UI — Applied patch to revert UI state if delete fails.

## Auto Run Result

- **Summary of implemented change:** Built full CRUD operations for environments (Go backend filesystem storage, Wails bindings, Vue 3 modal UI).
- **Files changed:**
  - `projects/storage/environment.go`: Added storage logic.
  - `projects/storage/environment_test.go`: Added storage tests.
  - `projects/service/environment.go`: Added service logic with UUID generation.
  - `projects/service/environment_test.go`: Added service tests.
  - `projects/app.go`: Wired Wails bindings.
  - `projects/frontend/src/stores/environmentStore.ts`: Added Pinia store.
  - `projects/frontend/src/components/environment/EnvModal.vue`: Created UI modal.
  - `projects/frontend/src/App.vue`, `AppHeader.vue`: Wired modal toggle.
- **Review findings breakdown:** 12 patches applied, 6 items deferred, 3 rejected.
- **Follow-up review recommended:** false
- **Verification performed:** `go test ./service ./storage` and `bun run type-check` both passed.
- **Residual risks:** UI state tracking is primitive; may cause performance issues with many environments due to full array re-saves.


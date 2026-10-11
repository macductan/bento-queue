---
title: 'Change Storage Location'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
baseline_commit: 'a2ac9a760cfdddfd5ed40a1a839c289c8abace12'
review_loop_iteration: 0
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại ứng dụng chỉ sử dụng thư mục lưu trữ mặc định (XDG data dir) cho Collection và Environment. Điều này khiến người dùng không thể chuyển sang thư mục lưu trữ khác để tránh bị trùng/lẫn lộn data khi test các dự án khác nhau.

**Approach:** Bổ sung tính năng cho phép người dùng chọn một thư mục bất kỳ trên máy tính qua hộp thoại của OS để làm nơi lưu trữ. Cập nhật đường dẫn này vào `config.json` và reload lại toàn bộ dữ liệu (collections, environments) trên giao diện theo thư mục mới.

## Boundaries & Constraints

**Always:** Đảm bảo quá trình thay đổi thư mục được lưu ngay vào `config.json` thông qua atomic write. Nếu thư mục mới không tồn tại file collection.json, tự động khởi tạo collection mặc định như lần đầu mở app. Cập nhật state UI (sidebar tree, active request, environments) sau khi đổi thư mục thành công.

**Never:** Không tự động copy dữ liệu từ thư mục cũ sang thư mục mới để tránh làm thay đổi/ghi đè file không mong muốn. Không cho phép đổi thành đường dẫn rỗng (fallback về thư mục mặc định nếu rỗng).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Người dùng đổi thành thư mục trống | Chọn thư mục mới chưa có data | Khởi tạo collection default, sidebar hiển thị thư mục gốc trống, xóa active request trên editor | N/A |
| Người dùng chọn thư mục không có quyền ghi | Thư mục Read-only | Báo lỗi không thể đổi thư mục, giữ nguyên thư mục cũ | Hiển thị Toast báo lỗi IO |
| Hủy chọn hộp thoại | Bấm Cancel ở OS dialog | Đường dẫn trả về rỗng, UI không làm gì cả | N/A |

### Decisions

- **Nơi đặt tính năng (Settings UI):** Thêm một cửa sổ "Cài đặt" (Settings modal) riêng biệt để dễ dàng thêm các cài đặt khác sau này (như user yêu cầu). Nút bấm mở modal Settings có thể dùng chung icon hình bánh răng (hiện tại đang mở Manage Environments) – và tính năng quản lý Môi trường sẽ được tách ra chỗ khác.
- **Cách xử lý dữ liệu khi chuyển thư mục:** Chỉ đổi đường dẫn lưu trong config và tải lại giao diện với dữ liệu có sẵn tại thư mục đó (hoặc tạo mới nếu trống), không tự copy dữ liệu cũ.

</frozen-after-approval>

## Code Map

- `projects/app.go` -- Khai báo 2 Wails binding mới: `SelectDirectoryDialog()` để gọi OS Dialog, và `UpdateCollectionRoot(newRoot string)` để cập nhật đường dẫn.
- `projects/service/config.go` -- Bổ sung hàm `UpdateCollectionRoot` để ghi đè `CollectionRoot` vào file `config.json` và gọi lại `ensureDefaultCollection`.
- `projects/frontend/src/components/layout/Header.vue` -- Thêm UI nút bấm để mở chọn thư mục, gọi API và handle logic refresh data.
- `projects/frontend/src/stores/collection.ts` & `environment.ts` -- Viết thêm hàm `refresh()` để reset store state (clear active request) và gọi lại API `GetCollectionTree`, `ListEnvironments`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/config.go` -- Thêm hàm `UpdateCollectionRoot` -- Mở config hiện tại, cập nhật `CollectionRoot`, write JSON, đảm bảo cấu trúc collection ở thư mục mới.
- [x] `projects/app.go` -- Thêm binding `SelectDirectoryDialog` và `UpdateCollectionRoot` -- Cung cấp hàm gọi ra Frontend. Đảm bảo biến `a.collRoot` trong `App` được cập nhật sau khi đổi thành công.
- [x] `projects/frontend/src/stores/collection.ts` -- Thêm action `refresh()` -- Đưa state tree về rỗng, clear active request, fetch lại tree từ backend. Làm tương tự với `environment.ts` (fetch lại env list).
- [x] `projects/frontend/src/components/layout/Header.vue` -- Thêm UI button/menu item cho việc đổi thư mục -- Xử lý flow: gọi SelectDirectoryDialog -> nếu có chọn thì gọi UpdateCollectionRoot -> báo stores refresh -> hiển thị Toast thành công.

**Acceptance Criteria:**
- Given người dùng đang ở thư mục mặc định có 1 vài request, khi bấm chọn thư mục lưu trữ mới (folder trống), then giao diện reload lại chỉ hiển thị Default Collection trống, editor bị clear.
- Given người dùng đã đổi sang thư mục mới, khi khởi động lại app, then app sẽ load lại từ thư mục mới (dựa theo config.json).

## Implementation Notes

- Added `SettingsModal.vue` component and triggered it from `AppHeader.vue` by replacing the Env gear icon behavior (moved Env icon out).
- Added `SelectDirectoryDialog` and `UpdateCollectionRoot` in Wails (`app.go`), modifying `config.json` via `ConfigService`.
- Vue Stores `collectionStore` and `environmentStore` now expose a `refresh()` action that completely wipes UI state and refetches the tree from the new disk location.
- Backend Go tests (`TestConfigService`) pass, and `bun run lint` validates all frontend code without errors.
## Spec Change Log

## Review Triage Log

- `high`: `UpdateCollectionRoot` writes new directory to `config.json` before verifying if it is writable (`ensureDefaultCollection`). If verification fails, config is permanently pointing to an invalid directory, violating the edge-case matrix. -> **patch**
- `high`: No unit tests were added for `UpdateCollectionRoot` in `projects/service/config_test.go`. -> **patch**
- `medium`: `SettingsModal.vue` triggers `refresh()` which forcefully clears the active request without checking if it has unsaved changes (`requestStore.isDirty`), risking data loss. -> **patch**
- `false`: `ensureDefaultCollection` does not initialize environment storage. Refutation: `ensureDefaultCollection` explicitly creates the `environments/` subdirectory, which is the only initialization required for environments according to the architecture.
- `false`: `UpdateCollectionRoot` in `app.go` does not propagate the new root path to `CollectionService` or `EnvironmentService`. Refutation: These services do not cache the root; they receive `a.collRoot` as a parameter in every binding call.
- `low`: `UpdateCollectionRoot` lacks concurrency protection for `config.json`. Refutation: Desktop app with single user; concurrent config writes are not expected in normal operation. -> **rejected**
- `low`: `SettingsModal.vue` does not display the current storage path. Refutation: While nice to have, it was not strictly required by the intent and adds complexity to the UI. -> **defer**

## Verification

**Commands:**
- `cd projects/ && go test ./service -run TestConfigService` -- expected: Chạy test các hàm liên quan đến Config.
- `cd projects/frontend/ && bun run lint` -- expected: Không có lỗi ESLint.

**Manual checks (if no CLI):**
- Bật app bằng `wails dev`. Bấm nút thay đổi location -> tạo vài data -> thay đổi location khác -> data cũ biến mất, tạo data mới -> đổi về location đầu tiên -> data ban đầu hiện lại.

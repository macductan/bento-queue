---
title: 'Triển khai tính năng song ngữ Anh - Việt (Bilingual i18n: English & Vietnamese)'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_commit: '277746fdfd98b3221dc590a88e819b3d8ab36f9a'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ứng dụng Hecto-API hiện tại có giao diện chủ yếu là tiếng Việt cố định (hardcoded strings), gây khó khăn cho người dùng quốc tế hoặc các nhóm phát triển đa quốc gia; đồng thời chưa có cơ chế đồng bộ tùy chọn ngôn ngữ giữa các máy thông qua Git.

**Approach:** Xây dựng hệ thống i18n song ngữ (English & Tiếng Việt) với ngôn ngữ mặc định là `en`. Lưu trữ tùy chọn ngôn ngữ trực tiếp trong `collection.json` (`locale: 'en' | 'vi'`) để tự động đồng bộ qua Git khi chạy Git Sync, kết hợp fallback `localStorage` cho máy trạm.

## Boundaries & Constraints

**Always:**
- Ngôn ngữ mặc định khi khởi tạo hoặc chưa chọn là `en` (English).
- Tùy chọn ngôn ngữ được lưu vào `collection.json` (`locale`), cho phép commit và push lên Git remote để đồng bộ liền mạch giữa các máy tính.
- Mọi chuỗi giao diện (nhãn nút, placeholder, tooltip, modal, thông báo xác nhận) hỗ trợ cả `en` và `vi`.
- Bảo toàn 100% các thuộc tính `data-test` và class CSS để không làm hỏng bộ test Vitest và Playwright E2E.
- Pass 100% 6 bước Local CI: `build:headless`, `lint`, `type-check`, `test`, `go vet/test`, `test:e2e`.

**Never:**
- Không phụ thuộc vào thư viện nặng làm chậm bundle (tự triển khai reactive composable `src/i18n/` kiểu type-safe, zero-dependency).
- Không dịch đè lên các thuật ngữ kỹ thuật tiêu chuẩn (HTTP Method `GET`, `POST`, status code `200 OK`, tên header HTTP, syntax JSON/XML).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi động lần đầu | Chưa có `collection.json.locale` hoặc `localStorage` | UI hiển thị tiếng Anh (`en`) theo mặc định | Fallback an toàn về `'en'` |
| Đổi ngôn ngữ trong Settings | Chọn `Tiếng Việt` trong SettingsModal | Toàn bộ UI chuyển sang tiếng Việt ngay lập tức, `collection.json` cập nhật `locale: "vi"` | Báo lỗi nếu ghi collection thất bại |
| Git Sync giữa các máy | Kéo commit chứa `collection.json` có `locale: "vi"` | Ứng dụng tự động áp dụng ngôn ngữ `vi` từ collection mới tải về | Giữ ngôn ngữ hiện tại nếu file lỗi |
| Thiếu key bản dịch | Gọi `t('unknown.key')` | Trả về chính key gốc `unknown.key` hoặc giá trị mặc định | Không ném exception, log warning ở dev |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` -- Bổ sung trường `Locale string json:"locale,omitempty"` vào struct `Collection`
- `projects/frontend/src/i18n/index.ts` -- Composable `useI18n()` với hàm `t(key, params)` và quản lý locale phản ứng (reactive)
- `projects/frontend/src/i18n/locales/en.ts` -- Từ điển tiếng Anh chuẩn (mặc định)
- `projects/frontend/src/i18n/locales/vi.ts` -- Từ điển tiếng Việt đối ứng
- `projects/frontend/src/stores/uiStore.ts` -- Quản lý state locale toàn cục và đồng bộ
- `projects/frontend/src/stores/collectionStore.ts` -- Lưu và tải `locale` từ `collection.json`
- `projects/frontend/src/components/SettingsModal.vue` -- Giao diện chọn ngôn ngữ (`English` / `Tiếng Việt`) và thông tin đồng bộ Git
- `projects/frontend/src/components/` -- Cập nhật các component hiển thị dùng `t(...)`: `AppHeader.vue`, `AppSidebar.vue`, `TreeNodeRow.vue`, `TreeContextMenu.vue`, `RequestEditor.vue`, `UrlBar.vue`, `RequestTabs.vue`, `KvpEditor.vue`, `AuthEditor.vue`, `BodyEditor.vue`, `ResponseViewer.vue`, `CollectionSwitcher.vue`, `FolderEditor.vue`, `CollectionModal.vue`, `EmptyStateRequest.vue`, `ConfirmDialog.vue`, `UnsavedChangesDialog.vue`

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go` -- Bổ sung trường `Locale` vào struct `Collection` -- Lưu trữ cấu hình ngôn ngữ ở cấp độ collection đồng bộ Git
- [x] `projects/frontend/src/i18n/index.ts` -- Tạo composable `useI18n()` hỗ trợ interpolation và fallback -- Cung cấp hạ tầng dịch ngôn ngữ type-safe, nhẹ và nhanh
- [x] `projects/frontend/src/i18n/locales/en.ts` -- Khởi tạo bộ từ điển tiếng Anh đầy đủ -- Đảm bảo tiếng Anh là ngôn ngữ mặc định hoàn chỉnh
- [x] `projects/frontend/src/i18n/locales/vi.ts` -- Khởi tạo bộ từ điển tiếng Việt đầy đủ -- Cung cấp trải nghiệm tiếng Việt tương đương
- [x] `projects/frontend/src/stores/collectionStore.ts` & `projects/frontend/src/stores/uiStore.ts` -- Tích hợp quản lý locale, đọc/ghi vào `collection.json` và `localStorage` -- Đảm bảo cấu hình đẩy lên Git và đồng bộ qua các máy
- [x] `projects/frontend/src/components/SettingsModal.vue` -- Bổ sung mục chọn Language (English / Tiếng Việt) -- Cho phép người dùng chuyển đổi ngôn ngữ trong cài đặt
- [x] `projects/frontend/src/components/` (Header, Sidebar, Editors, Modals) -- Thay thế chuỗi cứng bằng hàm `t(...)` -- Bản địa hóa toàn diện giao diện
- [x] `projects/frontend/src/i18n/__tests__/i18n.test.ts` -- Viết unit test cho i18n composable và đồng bộ config -- Đảm bảo độ tin cậy và không regression

**Acceptance Criteria:**
- Given người dùng mới mở ứng dụng lần đầu, when ứng dụng tải xong, then toàn bộ giao diện mặc định là Tiếng Anh (`en`).
- Given người dùng vào Settings và đổi sang `Tiếng Việt`, when xác nhận, then toàn bộ giao diện chuyển sang tiếng Việt và `collection.json` được cập nhật `locale: "vi"`.
- Given `collection.json` có `locale: "vi"`, when commit và push lên Git rồi kéo về máy khác, then máy khác đọc `collection.json` và áp dụng tiếng Việt tương ứng.
- Given bộ kiểm thử tự động, when chạy `./scripts/verify-local-ci.sh`, then tất cả 6 bước đều đạt 100%.

## Implementation Notes
- Triển khai i18n composable zero-dependency tại `projects/frontend/src/i18n/index.ts` hỗ trợ dynamic interpolation `{param}`, reactive switching và fallback an toàn sang `en`.
- Dữ liệu `locale` được lưu trong `Collection` struct ở backend Go (`types.go`, `collection.go`, `git_sync.go`), đồng bộ qua Git tự động.
- Mọi test suite (57 test files, 752 tests) cùng 15 Playwright E2E tests và `scripts/verify-local-ci.sh` đã chạy và pass 100%.

## Spec Change Log

## Review Triage Log
- `high` | `projects/frontend/tests/support/wails-mock.ts:212` default collection had `locale: 'vi'`, masking verification of English default. | route: patch
- `medium` | `projects/frontend/src/components/TreeNodeRow.vue:128-135` handleDelete used hardcoded Vietnamese confirmation strings. | route: patch
- `medium` | `projects/frontend/src/components/BodyEditor.vue:200` empty body state text hardcoded instead of `t('bodyEditor.noBody')`. | route: patch
- `medium` | `projects/frontend/src/components/EmptyStateResponse.vue:21` empty state response header omitted from localization. | route: patch
- `medium` | `projects/frontend/src/components/FolderEditor.vue:620,790` environment scope labels and loading text hardcoded in Vietnamese. | route: patch
- `medium` | `projects/frontend/src/stores/uiStore.ts:360-366` updateActiveCollectionLocale failure did not revert in-memory locale. | route: patch
- `medium` | `projects/frontend/src/stores/collectionStore.ts:868` updateActiveCollectionLocale lacked unit test coverage. | route: patch
- `medium` | `projects/frontend/src/stores/collectionStore.ts:374` loadCollections locale sync lacked unit test coverage. | route: patch
- `low` | `projects/frontend/src/stores/uiStore.ts:342-345` localStorage.getItem lacked try/catch for SecurityError in sandbox webview. | route: patch
- `low` | `projects/service/git_sync.go:239-241` autoResolveCollectionMetaConflict locale preservation lacked unit test coverage. | route: patch
- `low` | `projects/frontend/src/i18n/__tests__/i18n.test.ts` missing test for secondary fallback from vi to en. | route: patch
- `low` | `projects/service/collection.go` UpdateCollection lacked locale validation against supported set. | route: patch

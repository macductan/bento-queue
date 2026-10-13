---
title: 'UI Collection Switcher & Quản lý Collection'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_commit: '7fe2416e932c9c32c4c8c4b0397abf1e93490965'
route: 'dispatch'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-multi-collection/SPEC.md
  - _bmad-output/specs/spec-multi-collection/storage-structure.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sau khi hoàn thiện backend CRUD (Story 1) và Pinia store cách ly trạng thái (Story 2), người dùng vẫn chưa có giao diện trực quan để xem active collection, chuyển đổi qua lại giữa các collection hay thực hiện các thao tác tạo mới, đổi tên, nhân bản, xóa collection trên giao diện người dùng.

**Approach:** Xây dựng component Collection Switcher tích hợp trên header của sidebar để hiển thị tên active collection và dropdown chuyển đổi nhanh; hỗ trợ các thao tác CRUD collection (Tạo mới, Đổi tên, Nhân bản, Xóa có xác nhận và cấm xóa collection `default`); đồng thời cập nhật `SettingsModal.vue` để quản lý danh sách collection và làm mới danh sách khi đổi thư mục lưu trữ.

## Boundaries & Constraints

**Always:**
- Vị trí Collection Switcher nằm ở header của sidebar (`AppSidebar.vue`), thay thế vùng trống và hiển thị rõ ràng tên active collection hiện tại.
- Dropdown switcher hiển thị danh sách toàn bộ collection; đánh dấu trực quan collection đang active (checkmark/badge) và badge cho collection `default`.
- Thao tác chuyển đổi collection qua dropdown phải gọi `collectionStore.switchCollection(slug)`, đảm bảo kích hoạt đầy đủ cơ chế kiểm tra `isDirty`, hiển thị prompt nếu có thay đổi chưa lưu, và cách ly trạng thái sạch sẽ.
- Nút xóa collection mặc định `default` BẮT BUỘC bị vô hiệu hóa (`disabled`) trên toàn bộ giao diện (cả Collection Switcher dropdown và SettingsModal) kèm tooltip/title cảnh báo không được phép xóa.
- Thao tác xóa các collection khác bắt buộc phải mở hộp thoại xác nhận (`uiStore.requestConfirm`) trước khi thực hiện xóa.
- Hỗ trợ đổi tên (Rename) và tạo mới (Create) thông qua modal/dialog nhập liệu thân thiện, kiểm tra không để trống tên.
- Trong `SettingsModal.vue`, bổ sung khu vực quản lý collection và đảm bảo khi người dùng đổi thư mục lưu trữ (`changeLocation`), hệ thống gọi `collectionStore.loadCollections()` để nạp lại danh sách collection mới.

**Never:**
- Không cho phép người dùng click xóa collection `default` dưới bất kỳ hình thức nào.
- Không đóng dropdown hay chuyển collection khi người dùng hủy bỏ lưu thay đổi chưa lưu (tuân thủ kết quả trả về của `switchCollection`).
- Không phá vỡ bố cục hoặc đẩy lệch các nút thao tác nhanh hiện có trên header sidebar ("Request mới", "Thư mục mới").

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hiển thị active collection | App tải xong, active collection là "Default Collection" | Switcher trên sidebar header hiển thị "Default Collection" | Nếu chưa tải xong hiển thị "Đang tải..." hoặc fallback |
| Mở dropdown Switcher | Click vào nút Collection Switcher | Dropdown mở hiển thị danh sách collection, nút "+ Tạo collection mới", và các nút thao tác nhanh | Click ngoài hoặc nhấn Escape -> đóng dropdown |
| Chuyển collection từ Switcher | Click chọn một collection khác trong dropdown | Gọi `store.switchCollection(slug)`, đóng dropdown, tải lại cây request và môi trường tương ứng | Nếu bị hủy do unsaved prompt -> giữ nguyên collection hiện tại |
| Tạo collection mới | Nhập tên hợp lệ trong modal tạo collection và bấm Tạo | Gọi `store.createCollection(name)`, đóng modal, nạp lại danh sách, hiển thị toast thành công | Tên rỗng -> báo lỗi validation, không gửi request |
| Đổi tên collection | Nhập tên mới trong modal đổi tên và bấm Lưu | Gọi `store.renameCollection(slug, newName)`, cập nhật hiển thị tức thì, hiển thị toast thành công | Tên rỗng -> báo lỗi validation |
| Nhân bản collection | Click nút Duplicate trên một collection | Gọi `store.duplicateCollection(slug)`, tạo bản sao "Copy of...", nạp lại danh sách | Backend lỗi -> hiển thị toast lỗi |
| Xóa collection `default` | Hover hoặc kiểm tra nút xóa của collection `default` | Nút xóa bị disabled, con trỏ not-allowed, có title cảnh báo cấm xóa | Không kích hoạt action xóa |
| Xóa collection thường (Xác nhận) | Click nút Delete trên collection thường, chọn "Xóa" trong confirm dialog | Gọi `store.deleteCollection(slug)`, xóa thư mục, nếu đang active thì tự fallback về `default` | Backend lỗi -> hiển thị toast lỗi |
| Xóa collection thường (Hủy) | Click nút Delete trên collection thường, chọn "Hủy" trong confirm dialog | Đóng confirm dialog, giữ nguyên collection | N/A |
| Quản lý trong SettingsModal | Mở SettingsModal | Hiển thị danh sách collection kèm nút Tạo mới, Đổi tên, Nhân bản, Xóa (disable với default) | Đồng bộ dữ liệu với collectionStore |
| Đổi thư mục lưu trữ trong SettingsModal | Chọn thư mục mới thành công | Gọi `collectionStore.refresh()`, `collectionStore.loadCollections()`, `envStore.refresh()` | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/CollectionSwitcher.vue` -- Component mới hiển thị trigger button active collection, dropdown danh sách collections, quick action buttons (Rename, Duplicate, Delete disabled cho default, Create new collection).
- `projects/frontend/src/components/CollectionModal.vue` -- Modal dùng chung cho việc tạo mới (Create) và đổi tên (Rename) collection, có input validation và phím tắt Enter/Escape.
- `projects/frontend/src/components/AppSidebar.vue` -- Tích hợp `CollectionSwitcher.vue` vào phần header của sidebar bên cạnh các nút tạo Request/Folder.
- `projects/frontend/src/components/SettingsModal.vue` -- Thêm section quản lý Collection (danh sách, tạo mới, đổi tên, nhân bản, xóa với bảo vệ default), và bổ sung `collectionStore.loadCollections()` trong hàm `changeLocation`.
- `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts` -- Unit test cho component CollectionSwitcher (render active collection, mở dropdown, switch collection, disabled delete với default).
- `projects/frontend/src/components/__tests__/CollectionModal.test.ts` -- Unit test cho component CollectionModal (validation, emit submit/close).

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/components/CollectionModal.vue` -- Xây dựng modal tạo mới và đổi tên collection với input validation.
- [x] `projects/frontend/src/components/CollectionSwitcher.vue` -- Xây dựng component switcher với dropdown danh sách, chuyển đổi nhanh, và action icons (rename, duplicate, delete với bảo vệ default).
- [x] `projects/frontend/src/components/AppSidebar.vue` -- Tích hợp `CollectionSwitcher` vào header của sidebar.
- [x] `projects/frontend/src/components/SettingsModal.vue` -- Cập nhật SettingsModal để quản lý danh sách collection và refresh collections khi đổi storage location.
- [x] `projects/frontend/src/components/__tests__/CollectionModal.test.ts` & `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts` -- Viết unit test cho các component mới.

**Acceptance Criteria:**
- Given active collection là "Default Collection", when mở giao diện, then header sidebar hiển thị "Default Collection" và icon dropdown.
- Given dropdown Collection Switcher đang mở, when người dùng click vào một collection khác, then hệ thống kích hoạt `switchCollection`, đóng dropdown và cập nhật active collection mới.
- Given danh sách collection trong dropdown hoặc SettingsModal, when kiểm tra collection có `slug === 'default'`, then nút xóa bị disabled và không thể click.
- Given collection không phải default, when người dùng click xóa và xác nhận trong confirm dialog, then collection bị xóa thành công.
- Given modal tạo hoặc đổi tên collection, when nhập tên hợp lệ và xác nhận, then action tương ứng trong `collectionStore` được gọi thành công.
- Given người dùng đổi thư mục lưu trữ trong SettingsModal, when đổi thành công, then danh sách collection được tự động nạp lại từ thư mục mới.

## Implementation Notes

- **CollectionModal.vue**:
  - Hỗ trợ 2 chế độ `create` và `rename`, tự động prefill tên và focus/select input khi mở.
  - Client-side validation: ngăn chặn input rỗng hoặc chỉ toàn khoảng trắng, hiển thị thông báo lỗi inline trực quan.
  - Hỗ trợ phím `Enter` để submit, phím `Escape` / click backdrop / nút đóng để hủy bỏ.
- **CollectionSwitcher.vue**:
  - Tích hợp tại header sidebar: hiển thị tên active collection (rút gọn với `truncate`), icon collection và chevron toggle.
  - Dropdown danh sách: hiển thị toàn bộ collection với checkmark cho active collection và badge `Default`.
  - Chuyển đổi an toàn: gọi `switchCollection(slug)`, đóng dropdown khi chuyển thành công; nếu người dùng chọn Hủy trong prompt `isDirty` thì dropdown giữ nguyên trạng thái mở và không chuyển.
  - Bảo vệ collection `default`: nút xóa bị disable (`opacity-30 cursor-not-allowed`, title "Không thể xóa collection mặc định") và chặn cứng trong handler.
  - Hỗ trợ thao tác xóa collection thường kèm hộp thoại xác nhận `uiStore.requestConfirm`, đổi tên (mở `CollectionModal`), nhân bản (gọi `duplicateCollection`), và tạo mới ("+ Tạo collection mới").
  - Tự động đóng dropdown khi click ra ngoài hoặc bấm `Escape`.
- **AppSidebar.vue**:
  - Gắn `CollectionSwitcher` vào header bên cạnh 2 nút tạo Request và Folder (32x32px), bảo đảm layout không bị vỡ.
- **SettingsModal.vue**:
  - Bổ sung section "Quản lý Collection" hiển thị danh sách collection, badge Active/Default, các nút Đổi tên, Nhân bản, Xóa (disable với default), và nút "+ Tạo mới".
  - Bổ sung `collectionStore.loadCollections()` trong hàm `changeLocation` để nạp lại danh sách khi đổi thư mục lưu trữ.
- **Unit Testing**:
  - 10 unit tests trong `CollectionModal.test.ts`.
  - 13 unit tests trong `CollectionSwitcher.test.ts`.
  - 2 unit tests trong `SettingsModal.test.ts`.
  - Tổng cộng 19 test files, 193/193 unit tests pass 100%. TypeScript type-check và Go tests pass 100%.

## Spec Change Log

## Review Triage Log

| Verdict | Evidence | Route |
|---------|----------|-------|
| medium | App.vue global keyboard shortcuts (Ctrl+N, Ctrl+Enter, v.v.) chưa chặn khi uiStore.settingsModalOpen = true, khiến thao tác nền vẫn chạy khi đang mở Cài đặt. | patch |
| medium | CollectionSwitcher.vue không đóng dropdown khi mở modal tạo mới/đổi tên hoặc sau khi đổi tên/xóa xong, khiến dropdown bị treo ngầm. | patch |
| medium | CollectionModal.vue thiếu guard chống double submit (isSubmitting) khi người dùng click/enter liên tiếp trong lúc async IPC đang chạy. | patch |
| medium | Verification gap: SettingsModal.vue chưa có test xác minh click xóa collection non-default gọi uiStore.requestConfirm và collectionStore.deleteCollection. | patch |
| medium | Verification gap: SettingsModal.vue chưa có test xác minh watcher modelValue từ false -> true kích hoạt loadCollections và fetchRoot trên component đã mount. | patch |
| medium | Verification gap: CollectionSwitcher.vue chưa có test xác minh click ra ngoài document (click-outside) đóng dropdown. | patch |
| low | SettingsModal.vue thiếu xử lý phím Escape để đóng modal. | patch |
| low | CollectionModal.vue chưa dùng Teleport to="body", có nguy cơ bị ảnh hưởng bởi stacking context hoặc overflow của sidebar cha. | patch |
| low | Dropdown menuitem trong CollectionSwitcher.vue chưa hỗ trợ phím Enter/Space và tabindex="0" cho người dùng bàn phím. | patch |
| low | CollectionModal.vue khai báo prop slug nhưng không sử dụng ở template hay script. | patch |
| low | CollectionSwitcher.vue thiếu giao diện trạng thái trống khi collections.length === 0. | patch |
| low | Phím Escape trong CollectionModal.vue cần stop.prevent để tránh nổi bọt lên App.vue kích hoạt abort request đang gửi. | patch |
| low | ToastNotification.vue có z-[1000] thấp hơn z-[1100] của các modal, khiến toast thông báo lỗi bị che khuất sau backdrop. | patch |
| low | Thao tác nhân bản (duplicate) trong CollectionSwitcher.vue cần guard chống spam click liên tiếp. | patch |
| false | SettingsModal.vue changeLocation bỏ qua kiểm tra isDirty: Phản bác - Dòng 63 SettingsModal.vue đã kiểm tra if (reqStore.isDirty) và chặn đổi thư mục với toast cảnh báo. | reject |

## Design Notes

**Thiết kế bố cục Header Sidebar (`AppSidebar.vue`):**
Header sidebar có chiều rộng cố định (`w-sidebar-width`, 260px). Bố cục gồm 2 phần:
- Bên trái: `CollectionSwitcher` co giãn linh hoạt (`flex-1 min-w-0`), hiển thị icon folder/collection + tên collection được cắt gọn (`truncate`) + icon chevron down.
- Bên phải: Các nút tạo nhanh (`createRequest`, `createFolder`) giữ nguyên vị trí và kích thước (32x32px).

**Bảo vệ Collection Default:**
Nút xóa của collection `default` (`c.slug === 'default'` hoặc `c.is_default === true`) được set thuộc tính `disabled`, class CSS giảm opacity (`opacity-30 cursor-not-allowed`), đồng thời gán `title="Không thể xóa collection mặc định"`. Ngay cả khi cố tình trigger qua phím hoặc event, hàm handler cũng chặn bằng điều kiện `if (c.slug === 'default') return;`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: all Vitest unit tests pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: TypeScript type check passes with 0 errors.
- `cd projects && go test ./...` -- expected: all Go unit tests pass 100%.

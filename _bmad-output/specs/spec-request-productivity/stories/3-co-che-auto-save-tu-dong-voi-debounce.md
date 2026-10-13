---
title: 'Cơ chế Auto-save tự động với Debounce'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_commit: '3ef2e80ca17fd829df91b394562e7f878a2105fa'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng thường xuyên phải ghi nhớ thao tác lưu thủ công (`Ctrl+S`) khi chỉnh sửa API request. Mỗi lần chuyển sang request khác ở sidebar, hộp thoại xác nhận `UnsavedChangesDialog` xuất hiện liên tục gây gián đoạn luồng làm việc, hoặc có nguy cơ mất dữ liệu nếu người dùng vô tình bỏ qua việc lưu.

**Approach:** Triển khai cơ chế auto-save thầm lặng với debounce 800ms khi dữ liệu request thay đổi (URL, method, params, headers, auth, body), hiển thị chỉ báo trạng thái lưu trực quan ("Đang lưu..." / "Chưa lưu" / "Đã lưu" / "Lỗi khi lưu") thay vì hiển thị Toast spam. Đồng thời, bổ sung cơ chế immediate flush an toàn giúp tự động lưu đồng bộ dữ liệu pending xuống ổ đĩa ngay khi người dùng chuyển request hoặc rời khỏi màn hình, loại bỏ hoàn toàn modal `UnsavedChangesDialog` khi điều hướng request bình thường.

## Boundaries & Constraints

**Always:**
- Tự động kích hoạt lưu ngầm (auto-save) với khoảng thời gian debounce mặc định 800ms sau khi người dùng dừng chỉnh sửa bất kỳ trường nào của request (`url`, `method`, `params`, `headers`, `auth`, `body`).
- Khi auto-save diễn ra thầm lặng (`silent: true`): KHÔNG hiển thị Toast thông báo "Đã lưu" gây phiền toái.
- Nếu việc ghi file xuống ổ đĩa thực sự thất bại (`SaveRequest` trả về lỗi hoặc ngoại lệ): BẮT BUỘC hiển thị Toast thông báo lỗi kèm trạng thái chỉ báo lỗi trên giao diện.
- Cập nhật chỉ báo trạng thái lưu trực quan (Save State Indicator) trên giao diện `RequestEditor`:
  - `saving`: Hiển thị icon spinner xoay + chữ "Đang lưu...".
  - `unsaved` (khi request `isDirty` và chưa lưu): Hiển thị chấm màu cảnh báo + chữ "Chưa lưu".
  - `saved` (khi dữ liệu đã đồng bộ với disk): Hiển thị icon checkmark + chữ "Đã lưu".
  - `error` (khi lưu thất bại): Hiển thị chấm đỏ + chữ "Lỗi khi lưu".
- Tự động flush ngay lập tức dữ liệu đang chờ debounce xuống disk khi người dùng chọn một request khác ở sidebar (`selectRequest`), chọn thư mục (`setActiveFolderId`), tạo request mới (`createRequest`), hoặc khi component editor bị unmount.
- Nếu thao tác flush lưu xuống disk thất bại trong quá trình chuyển request: HỦY thao tác chuyển (abort switch) để người dùng không bị mất dữ liệu đang soạn thảo trong bộ nhớ.
- Khi người dùng chủ động bấm phím tắt `Ctrl+S`, thực hiện lưu ngay lập tức và hiển thị Toast "Đã lưu" như một phản hồi trực tiếp cho hành động người dùng.
- Giữ vững toàn vẹn dữ liệu, đảm bảo không có race condition khi nhiều sự kiện lưu hoặc chuyển request diễn ra liên tiếp (quản lý promise lưu đang thực thi `activeSavePromise`).
- Tất cả unit tests frontend phải pass 100% (`bun run test`) và không có lỗi type (`bun run type-check`).

**Never:**
- Không hiển thị modal `UnsavedChangesDialog` phiền toái khi người dùng click chuyển đổi request bình thường trong sidebar.
- Không phát sinh Toast notification liên tục trên mỗi lần auto-save định kỳ khi lưu thành công.
- Không làm giật con trỏ soạn thảo hoặc lag giao diện khi quá trình lưu ngầm diễn ra.
- Không ghi đè hoặc làm hỏng dữ liệu của request mới khi request cũ đang trong quá trình ghi đĩa dở dang.
- Không tự ý commit hoặc push Git mà không có sự đồng ý rõ ràng từ người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sửa URL hoặc param và dừng gõ | Gõ URL mới, đợi 800ms không thao tác tiếp | Debounce timer kích hoạt, `saveCurrent({ silent: true })` chạy ngầm, trạng thái chuyển từ "Chưa lưu" -> "Đang lưu..." -> "Đã lưu", không hiển thị Toast | Nếu SaveRequest lỗi: Toast hiển thị thông báo lỗi, trạng thái chuyển thành "Lỗi khi lưu" |
| Chuyển request khi đang pending debounce | Sửa URL, ngay lập tức click request khác ở sidebar (< 800ms) | Hủy timer debounce, thực hiện `flush()` lưu request cũ ngay lập tức xuống disk, sau đó tải request mới. Không hiển thị `UnsavedChangesDialog` | Nếu flush lưu thất bại: hiển thị Toast lỗi, dừng chuyển request để bảo vệ dữ liệu |
| Nhấn Ctrl+S thủ công | Nhấn tổ hợp `Ctrl+S` khi request đang có thay đổi | Hủy timer debounce, thực hiện lưu ngay lập tức và hiển thị Toast "Đã lưu" | Báo Toast lỗi nếu thất bại |
| Nhấn Ctrl+S khi dữ liệu chưa đổi | Nhấn tổ hợp `Ctrl+S` khi `isDirty == false` | Hiển thị Toast "Đã lưu", không ghi đĩa thừa thãi | N/A |
| Chuyển liên tục nhiều request | Click liên tiếp giữa các requests trong sidebar | Các request dirty được flush tuần tự và an toàn, không xảy ra xung đột ghi đĩa (race condition) | N/A |
| Lưu ngầm khi chuyển sang chọn Folder | Đang sửa request, click chọn 1 thư mục ở sidebar | Flush lưu request hiện tại thành công trước khi xóa active request và chuyển active folder | Nếu lưu thất bại, không xóa active request |
| Component unmount hoặc đóng cửa sổ | Người dùng đóng tab hoặc unmount `RequestEditor` | Trigger `flush()` trước khi unmount để đảm bảo dữ liệu ghi trọn vẹn xuống disk | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/stores/requestStore.ts` -- Bổ sung trạng thái `saveStatus`, quản lý timer debounce auto-save (`scheduleAutoSave`, `cancelAutoSave`), action `flush()`, và cập nhật action `saveCurrent` với tùy chọn `{ silent?: boolean }` chống race condition với `activeSavePromise`.
- `projects/frontend/src/composables/useAutoSave.ts` -- Composable theo dõi biến đổi sâu (`deep watch`) trên `requestStore.current`, kích hoạt debounce auto-save khi `isDirty` và tự động flush khi unmount.
- `projects/frontend/src/components/RequestEditor.vue` -- Nhúng composable `useAutoSave`, hiển thị chỉ báo trạng thái lưu (Save State Indicator) cạnh tiêu đề request.
- `projects/frontend/src/stores/collectionStore.ts` -- Cập nhật `selectRequest`, `setActiveFolderId`, `createRequest` để thực hiện immediate flush tự động trước khi chuyển context, loại bỏ việc gọi `uiStore.requestUnsavedPrompt()` đối với chuyển request thông thường.
- `projects/frontend/src/stores/__tests__/requestStore.test.ts` -- Unit tests cho auto-save scheduling, debounce, immediate flush, saveStatus và silent save.
- `projects/frontend/src/composables/__tests__/useAutoSave.test.ts` -- Unit tests cho composable `useAutoSave` bao gồm kiểm tra deep watch và unmount flush.
- `projects/frontend/src/components/__tests__/RequestEditor.test.ts` -- Unit tests kiểm tra hiển thị trực quan của Save State Indicator trên giao diện.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/stores/requestStore.ts` -- Mở rộng store: thêm `saveStatus`, `scheduleAutoSave`, `cancelAutoSave`, `flush`, cập nhật `saveCurrent({ silent?: boolean })` với cơ chế chống race condition.
- [x] `projects/frontend/src/composables/useAutoSave.ts` -- Tạo composable `useAutoSave` thực hiện deep watch trên `current` của requestStore để kích hoạt debounce auto-save và unmount cleanup.
- [x] `projects/frontend/src/components/RequestEditor.vue` -- Tích hợp `useAutoSave(req)` và render Save State Indicator (Đang lưu / Chưa lưu / Đã lưu / Lỗi) với badge phong cách Tailwind CSS.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Cập nhật logic `selectRequest`, `setActiveFolderId` và `createRequest` để gọi `await reqStore.flush()` thay vì hiển thị modal `UnsavedChangesDialog`.
- [x] `projects/frontend/src/stores/__tests__/requestStore.test.ts` -- Viết unit tests kiểm thử toàn diện các actions auto-save, debounce, flush, silent save và bắt lỗi.
- [x] `projects/frontend/src/composables/__tests__/useAutoSave.test.ts` -- Viết unit tests cho composable `useAutoSave`.
- [x] `projects/frontend/src/components/__tests__/RequestEditor.test.ts` -- Viết unit tests cho Save State Indicator trong RequestEditor.
- [x] `projects/frontend` -- Chạy `bun run type-check` và `bun run test` để xác minh 100% tests pass và không có lỗi kiểu dữ liệu.

**Acceptance Criteria:**
- Given người dùng đang chỉnh sửa bất kỳ thông tin nào của request (URL, params, headers, auth, body), when ngừng thao tác đủ 800ms, then hệ thống tự động lưu thầm lặng xuống đĩa, chỉ báo chuyển sang "Đã lưu" và không có Toast notification nào xuất hiện.
- Given request đang có thay đổi chưa lưu trong thời gian chờ debounce, when người dùng click chọn request khác ở sidebar, then hệ thống lập tức flush lưu request hiện tại xuống đĩa trước khi mở request mới mà không hiển thị popup UnsavedChangesDialog.
- Given việc ghi file xuống đĩa bị lỗi, when hệ thống thực hiện auto-save hoặc flush, then hệ thống hiển thị Toast thông báo lỗi, chuyển chỉ báo sang "Lỗi khi lưu", và nếu đang chuyển request thì dừng chuyển để bảo vệ dữ liệu.
- Given người dùng nhấn `Ctrl+S`, when có thay đổi hoặc chưa có thay đổi, then hệ thống lưu ngay lập tức và hiển thị Toast "Đã lưu".

## Implementation Notes

- Đã thêm trạng thái `saveStatus` (`'saved' | 'unsaved' | 'saving' | 'error'`) vào `requestStore`.
- Bổ sung `scheduleAutoSave(delay: 800)` và `cancelAutoSave()` với debounce 800ms trong `requestStore`.
- Bổ sung action `flush()` thực hiện lưu ngầm ngay lập tức, hủy debounce timer đang pending và đợi `activeSavePromise` hoàn tất an toàn chống race condition.
- Cập nhật `saveCurrent({ silent?: boolean })` bảo vệ race condition qua `activeSavePromise`, tự động hiển thị Toast "Đã lưu" khi lưu thủ công hoặc khi `isDirty == false` (Ctrl+S), và ẩn Toast thành công khi auto-save `silent: true`. Khi lưu lỗi luôn hiển thị Toast thông báo lỗi và cập nhật `saveStatus = 'error'`.
- Tạo composable `useAutoSave` thực hiện deep watch trên `current`, kích hoạt debounce auto-save khi `isDirty`, đồng thời hook `beforeunload` và `onBeforeUnmount` để flush an toàn xuống disk.
- Nhúng `useAutoSave(req)` vào `RequestEditor.vue`, render Save State Indicator với badge bo tròn đẹp mắt hiển thị đủ 4 trạng thái (Đang lưu..., Chưa lưu, Đã lưu, Lỗi khi lưu).
- Cập nhật `collectionStore.ts` (`selectRequest`, `setActiveFolderId`, `createRequest`) để tự động `await reqStore.flush()` thay vì hiển thị modal `UnsavedChangesDialog`. Nếu flush thất bại, abort thao tác chuyển để giữ nguyên dữ liệu trên UI.
- Cập nhật shortcut Ctrl+S / Cmd+S trong `App.vue` để luôn gọi `saveCurrent()`.
- Thêm cấu hình bật/tắt Auto-save trong `SettingsModal.vue`, lưu bền vững vào localStorage qua `uiStore.autoSaveEnabled` (mặc định Bật, khi Tắt thao tác chuyển request vẫn tự động flush ngầm an toàn theo Lựa chọn A).
- Mở rộng cơ chế auto-save và Save State Indicator đồng bộ cho cả `FolderEditor.vue` (Headers, Auth, Variables), tự động lưu sau 800ms debounce và flush khi chuyển folder hoặc unmount.
- Bổ sung và cập nhật đầy đủ unit tests trong `requestStore.test.ts`, `useAutoSave.test.ts`, `RequestEditor.test.ts`, `collectionStore.test.ts`, `FolderEditor.test.ts`, `SettingsModal.test.ts` và `uiStore.test.ts`. 100% tests (27/27 files, 316 tests) và type-check pass.

## Review Triage Log

| Reviewer | Finding / Observation | Verdict | Action Taken |
|---|---|---|---|
| Blind Hunter | Biến `toSave` được khai báo trong `try` block của `saveCurrent` nhưng lại được truy cập trong `catch` block (`toSave.name`) dẫn đến `ReferenceError` khi có ngoại lệ sớm. | Valid | **Patch**: Khai báo `let toSave: any = null` bên ngoài `try` block trong `requestStore.ts`. |
| Blind Hunter | Missing test cho header `_isAuto` serialization trong `requestStore.test.ts` để phòng ngừa bug infinite dirty loop. | Valid | **Patch**: Bổ sung unit test kiểm tra `_isAuto: true` được lọc bỏ an toàn và snapshot không bị dirty lệch. |
| Edge Case Hunter | Chuyển đổi nhanh giữa các folder (`activeFolderId`) trong `FolderEditor` khi đang có thay đổi chưa lưu có thể gây mất đồng bộ dữ liệu. | Valid | **Patch**: Thêm watcher và cơ chế auto-save, flush on switch/unmount đồng bộ cho `FolderEditor.vue` kèm 8 tests trong `FolderEditor.test.ts`. |
| Edge Case Hunter | Xung đột ghi đĩa khi nhiều lần auto-save/flush xảy ra đồng thời khi người dùng chuyển liên tục. | Valid | **Addressed**: Đã có `activeSavePromise` kiểm soát tuần tự hóa việc lưu, không tạo nhiều promise song song. |
| Verification Gap | Kiểm thử việc tắt `autoSaveEnabled` trong `uiStore` cần đảm bảo không phát sinh debounced timer nhưng vẫn flush an toàn khi chuyển request/folder. | Valid | **Addressed**: Đã có unit tests kiểm chứng hành vi này trong cả `useAutoSave.test.ts` và `FolderEditor.test.ts`. |



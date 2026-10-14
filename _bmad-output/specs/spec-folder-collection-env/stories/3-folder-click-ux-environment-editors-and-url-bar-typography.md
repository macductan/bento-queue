---
title: 'Story 3: Folder Click UX, Environment Editors & URL Bar Typography'
type: 'feat'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-folder-collection-env/SPEC.md'
  - '_bmad-output/specs/spec-folder-collection-env/environment-architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại người dùng click vào một thư mục trên cây sidebar chỉ đóng/mở nhánh cây mà không mở cấu hình thư mục (buộc phải click chuột phải chọn menu ngữ cảnh); trong `FolderEditor` tab Variables chỉ cho phép chỉnh sửa biến dùng chung mà chưa có giao diện chọn cấu hình biến riêng theo từng Environment (`folder-env`); ứng dụng chưa có giao diện trực quan để người dùng chỉnh sửa biến cấp Collection (Collection Env); và ô nhập URL cùng lớp phủ `VariableHighlighter` sử dụng cỡ chữ `text-base` (16px) quá to khiến các URL dài bị tràn dòng.

**Approach:**
1. Cập nhật `TreeNodeRow.vue` khi click vào thư mục sẽ kích hoạt song song `toggleFolder` và `selectFolder(id)` (với cơ chế flush dirty state an toàn), đồng thời áp dụng visual highlight active khi thư mục đang được chọn.
2. Nâng cấp tab Variables trong `FolderEditor.vue` với thanh chọn Scope (Folder Global Env vs từng Environment cụ thể) để chỉnh sửa và lưu trữ biến tương ứng vào `_folder.json`.
3. Bổ sung giao diện chỉnh sửa Collection Environment (tái sử dụng `KvpEditor.vue` kèm auto-save đồng bộ với `UpdateCollection`).
4. Thay đổi class Tailwind từ `text-base` sang `text-sm` (14px) đồng bộ trong `UrlBar.vue` và `VariableHighlighter.vue`.
5. Cập nhật và bổ sung test suites, tuân thủ nghiêm ngặt quy tắc chỉ thao tác trên `Test-Collection` và tự động dọn dẹp (Mục 19).

## Boundaries & Constraints

**Always:**
- Khi click vào thư mục trên `TreeNodeRow.vue`:
  - Nhánh thư mục con được toggle đóng/mở.
  - Vùng làm việc chính (`ContentArea.vue`) lập tức chuyển sang hiển thị `FolderEditor.vue` với dữ liệu của thư mục vừa click.
  - Dòng thư mục trên sidebar có visual indicator (highlight) thể hiện trạng thái đang được chọn (`store.activeFolderId === props.node.id`).
  - Nếu request hoặc folder trước đó đang dirty, hệ thống tự động flush auto-save an toàn trước khi chuyển.
- Trong `FolderEditor.vue` tab Variables:
  - Cho phép người dùng chuyển đổi qua lại giữa `Folder Global Env` và các Environment hiện có trong `environmentStore`.
  - Dữ liệu `folder_envs` được lưu trữ dạng dictionary theo ID môi trường và tự động lưu bền vững.
- Giao diện Collection Environment cho phép thêm, sửa, xóa biến cấp collection và lưu trữ xuống `collection.json`.
- Trong `UrlBar.vue` và `VariableHighlighter.vue`: Kích thước font chữ của thẻ `<textarea>` và thẻ `<pre>` overlay bắt buộc đồng nhất `font-mono text-sm` (14px) với padding khớp tuyệt đối.
- **Quy tắc an toàn kiểm thử (Mục 19):** Mọi bài kiểm thử UI, Vitest và E2E smoke test chỉ được phép tạo hoặc thao tác trên collection `Test-Collection` hoặc mock in-memory. Nếu có bước tạo collection mới trong test, phải gọi teardown xóa ngay sau khi chạy xong.
- 100% kiểm thử backend và frontend (`go test ./...`, `bun run type-check`, `bun run test`) phải pass.

**Never:**
- Không làm ảnh hưởng đến tính năng inline rename (F2 hoặc double click) và menu tùy chọn (ba chấm) trên `TreeNodeRow.vue`.
- Không làm lệch vị trí highlight giữa văn bản URL và biến môi trường màu cam trong `UrlBar.vue`.
- Không tự ý commit hoặc push Git khi chưa có sự xác nhận của người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Click thư mục trên sidebar | Người dùng click vào thư mục "Auth" trên tree | Cây mở rộng/thu gọn, dòng "Auth" có highlight active, `ContentArea` render `FolderEditor` cho "Auth" | Nếu có lỗi dirty flush thì huỷ chuyển đổi |
| Chuyển tab Scope trong FolderEditor | Chọn "Môi trường Dev" trong dropdown scope | Bảng `KvpEditor` nạp danh sách biến của Dev trong `folder_envs[devId]`, sửa đổi tự động lưu vào `_folder.json` | Khởi tạo mảng rỗng nếu môi trường chưa có biến |
| Xóa một Environment ở cấp App | Environment ID đang có cấu hình trong `folder_envs` bị xóa | `folder_envs` vẫn giữ dữ liệu hoặc bỏ qua an toàn, không làm crash giao diện FolderEditor | Xử lý fallback an toàn |
| Mở Collection Env Editor | Người dùng click mở cấu hình biến Collection | Hiển thị bảng biến Collection, thay đổi được lưu vào `collection.json` qua `UpdateCollection` | Báo toast nếu lưu thất bại |
| Hiển thị URL dài trong UrlBar | Nhập URL dài kèm biến `{{baseUrl}}/api/v1/orders/detail?id=123` | Hiển thị cỡ chữ `text-sm` (14px), gọn gàng, highlight biến khớp từng ký tự | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/TreeNodeRow.vue` -- Bổ sung logic chọn thư mục khi click vào row, visual active styling cho thư mục được chọn.
- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung action `selectFolder(id: string)` / chuẩn hóa `setActiveFolderId(id: string)`, action `updateCollectionVariables(id: string, variables: KVPair[])`.
- `projects/frontend/src/components/FolderEditor.vue` -- Thêm Scope Selector (Folder Global Env vs Environment cụ thể), quản lý và lưu trữ `folder_envs`.
- `projects/frontend/src/components/CollectionModal.vue` / `SettingsModal.vue` / `CollectionSwitcher.vue` -- Tích hợp giao diện quản lý biến cấp Collection.
- `projects/frontend/src/components/UrlBar.vue` -- Cập nhật font size từ `text-base` thành `text-sm`.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Cập nhật font size và line-height khớp với `UrlBar.vue`.
- `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` -- Test kiểm tra click thư mục kích hoạt chọn folder và active visual state.
- `projects/frontend/src/components/__tests__/FolderEditor.test.ts` -- Test kiểm tra chuyển đổi scope biến môi trường và lưu trữ `folder_envs`.
- `projects/frontend/src/components/__tests__/UrlBar.test.ts` -- Test kiểm tra font size `text-sm` và overlay styling.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/components/TreeNodeRow.vue`: Cập nhật hàm `toggle()` khi click vào folder vừa gọi `store.toggleFolder(props.node.id)` vừa gọi `store.selectFolder(props.node.id)`.
- [x] `projects/frontend/src/components/TreeNodeRow.vue`: Thêm class visual highlight active khi `isFolder && store.activeFolderId === props.node.id`.
- [x] `projects/frontend/src/stores/collectionStore.ts`: Chuẩn hóa `selectFolder(id: string)` hỗ trợ flush dirty request/folder trước khi đổi activeFolderId.
- [x] `projects/frontend/src/components/FolderEditor.vue`: Bổ sung bộ chọn Environment Scope trong tab Variables (Folder Global Env vs danh sách môi trường từ `environmentStore`), cập nhật auto-save lưu cả `variables` và `folder_envs`.
- [x] `projects/frontend/src/components/CollectionSwitcher.vue` & `SettingsModal.vue`: Bổ sung giao diện chỉnh sửa Collection Environment, kết nối với API backend `UpdateCollection`.
- [x] `projects/frontend/src/components/UrlBar.vue` & `VariableHighlighter.vue`: Thay đổi class từ `text-base` thành `text-sm`, căn chỉnh padding và line-height khớp hoàn hảo.
- [x] Cập nhật toàn bộ component test suites và chạy kiểm thử `bun run type-check && bun run test && go test ./...` đảm bảo pass 100% và tuân thủ an toàn test (Mục 19).

**Acceptance Criteria:**
- Given người dùng click vào một thư mục trên sidebar, when click hoàn tất, then thư mục mở rộng/thu gọn và `ContentArea` hiển thị ngay `FolderEditor` với viền/nền active trên sidebar.
- Given người dùng chọn một môi trường cụ thể trong tab Variables của `FolderEditor`, when thêm biến và lưu, then biến được ghi chính xác vào trường `folder_envs` của `_folder.json`.
- Given người dùng chỉnh sửa biến Collection trong giao diện Collection Env, when lưu, then tệp `collection.json` cập nhật trường `variables`.
- Given thanh địa chỉ `UrlBar.vue`, when hiển thị văn bản URL và các biến môi trường, then font chữ hiển thị ở cỡ `text-sm` (14px) và highlight biến khớp tuyệt đối với văn bản.
- Given toàn bộ bộ kiểm thử của dự án, when thực thi, then 100% tests pass và dữ liệu của người dùng được bảo vệ an toàn tuyệt đối.

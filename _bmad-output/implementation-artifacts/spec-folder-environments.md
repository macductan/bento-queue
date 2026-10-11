---
title: 'Folder Environments & UI Fixes'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại ứng dụng chưa hỗ trợ biến môi trường ở cấp thư mục (Folder Environment) khiến việc kế thừa cấu hình cho các request con gặp khó khăn. Đồng thời UI của KVP Editor (Headers/Params) có ô nhập Value quá nhỏ, gây bất tiện.

**Approach:** 
1. Cập nhật model `Folder` và `TreeNode` ở Backend để chứa danh sách biến (Variables).
2. Viết API `LoadFolder` và `UpdateFolder` trong `CollectionService`.
3. Bổ sung chức năng "Cài đặt thư mục" (Folder Settings) trên Context Menu của UI để mở giao diện quản lý biến (FolderEditor) trong khung chính.
4. Điều chỉnh thuật toán resolve biến trong frontend để đệ quy: Active Environment -> Folder cha trực tiếp -> Các Folder cha cao hơn. Cập nhật Postman import.
5. Sửa lỗi CSS flexbox trong `KvpEditor.vue`.

## Boundaries & Constraints

**Always:** 
- Quản lý biến thư mục qua danh sách `KVPair` (key, value, enabled) tương tự Request Headers.
- UI FolderEditor phải hiển thị thay thế cho RequestEditor khi chọn xem cài đặt thư mục.
- Biến Environment ưu tiên cao nhất, rồi đến Folder gần request nhất, rồi các Folder xa hơn.

**Never:** 
- Không đổi tên file thành UUID trên disk (giữ nguyên quy tắc slug).
- Không tự resolve biến trong backend (đã thống nhất Vue thực hiện trước khi Send).

</frozen-after-approval>

## Implementation Notes


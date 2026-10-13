---
id: SPEC-multi-collection
companions:
  - storage-structure.md
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Multi Collection

## Why

Người dùng đang bị giới hạn trong việc chỉ có một collection mặc định duy nhất, dẫn đến việc khó phân tách các dự án, môi trường hoặc microservice riêng biệt trong cùng một không gian làm việc. Tính năng Multi Collection cho phép người dùng tạo, quản lý và chuyển đổi linh hoạt giữa nhiều collection độc lập, mỗi collection có cây thư mục request/folder và danh sách biến môi trường riêng biệt, theo đúng triết lý lưu trữ offline-first trên ổ đĩa nội bộ với quy chuẩn đặt tên chuẩn hóa `<slug>-<UUID>` chống xung đột dữ liệu đa máy.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể quản lý vòng đời hoàn chỉnh (xem danh sách, tạo mới, đổi tên, xóa và nhân bản) của nhiều collection khác nhau, với tên thư mục trên đĩa được lưu chuẩn hóa theo định dạng `<slug>-<UUID>` để vừa dễ đọc vừa đảm bảo tính duy nhất toàn cầu.
  - **success:** Tạo được collection mới với thư mục `<slug>-<UUID>` và tệp `collection.json` riêng; đổi tên cập nhật tức thì trường `name` hiển thị trong khi giữ nguyên tên thư mục; nhân bản tạo bản sao nguyên vẹn với thư mục `<slug>-<UUID>` mới; xóa dọn dẹp sạch thư mục collection tương ứng; app từ chối thao tác xóa đối với collection `default` mặc định.
- **CAP-2**
  - **intent:** Người dùng có thể xem danh sách và chuyển đổi active collection trực tiếp trên giao diện thông qua bộ chọn chuyển đổi nhanh (Collection Switcher) theo key thư mục `<slug>-<UUID>`.
  - **success:** Chọn một collection trong dropdown sẽ cập nhật `active_collection` ngay lập tức, tải lại cây thư mục và danh sách môi trường tương ứng của collection đó.
- **CAP-3**
  - **intent:** Toàn bộ dữ liệu của mỗi collection được cách ly hoàn toàn, đồng thời người dùng được bảo vệ không bị mất các thay đổi chưa lưu khi thực hiện chuyển đổi collection.
  - **success:** Nếu request đang mở có thay đổi chưa lưu (`isDirty`), ứng dụng hiển thị hộp thoại xác nhận (Lưu thay đổi / Hủy thay đổi / Hủy chuyển đổi); sau khi chuyển đổi, trạng thái editor và phản hồi HTTP của collection cũ được reset sạch sẽ.
- **CAP-4**
  - **intent:** Hệ thống lưu trữ các collection và thực thể con (folder, request, environment) dưới dạng tệp tin cục bộ độc lập với tên thư mục/tệp tuân thủ quy chuẩn chuẩn hóa `<slug>-<UUID>`, phân định rõ ràng giữa `default_collection` (`default`) và `active_collection`.
  - **success:** Khởi động ứng dụng mở `active_collection` hợp lệ hoặc tự động fallback về `default_collection` (`default`); dữ liệu được tổ chức đồng nhất mà không cần code migration phức tạp.

## Constraints

- Định dạng lưu trữ 100% tệp tin file-based JSON/YAML trên ổ đĩa nội bộ; tuyệt đối không dùng SQLite, hệ quản trị cơ sở dữ liệu và không yêu cầu đăng nhập tài khoản.
- Toàn bộ tên thư mục của collection mới, folder con và tên file request/environment bắt buộc sinh theo quy chuẩn **`<slug>-<UUID>`** (ví dụ: `project-ecommerce-b1a2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d`), vừa dễ đọc ngữ nghĩa vừa loại trừ hoàn toàn xung đột đa máy.
- Tên thư mục `<slug>-<UUID>` được cố định từ lúc tạo và không thay đổi khi người dùng đổi tên hiển thị (AD-4); thao tác đổi tên chỉ cập nhật trường `name` trong `collection.json` (hoặc `_folder.json`, `*.json`).
- Collection mặc định có tên thư mục là `"default"` luôn luôn tồn tại; hệ thống cấm tuyệt đối thao tác xóa collection `"default"`.
- Chuyển đổi collection trên giao diện bắt buộc phải kiểm tra trạng thái thay đổi chưa lưu (`isDirty`) và reset hoàn toàn trạng thái editor, response viewer, và danh sách môi trường đang kích hoạt.
- Khi một collection đang active bị xóa, hệ thống phải tự động chuyển active collection về `default_collection` trước khi xóa thư mục khỏi ổ đĩa.
- Do chưa có người dùng thực tế nên codebase áp dụng trực tiếp quy chuẩn mới mà không cần duy trì logic migration cũ.

## Non-goals

- Chưa hỗ trợ đồng bộ đám mây (cloud sync) hay chia sẻ dữ liệu theo thời gian thực (realtime collaboration) giữa nhiều máy tính.
- Chưa hỗ trợ tính năng gộp (merge) hoặc so sánh sai khác (diff) giữa các collection.
- Chưa hỗ trợ mật khẩu hoặc phân quyền bảo vệ theo từng collection.

## Success signal

- Người dùng tạo một collection mới có tên hiển thị "Dự án Thanh Toán", thư mục trên đĩa được lưu chuẩn hóa là `du-an-thanh-toan-<UUID>`. Người dùng tạo folder "Xác thực" bên trong, thư mục con được lưu là `xac-thuc-<UUID>/`, request lưu là `login-<UUID>.json`. Đổi tên hiển thị không làm thay đổi tên thư mục. Chuyển đổi qua lại giữa "Default Collection" và "Dự án Thanh Toán" diễn ra tức thì, dữ liệu độc lập, và collection `default` được bảo vệ an toàn.

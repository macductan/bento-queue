---
id: SPEC-auth-and-header
companions: []
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Auth and Header

## Why

Người dùng cần một cách quản lý cấu hình authentication và HTTP headers hiệu quả hơn khi làm việc với API, đặc biệt là khi cấu trúc thư mục chứa nhiều requests con có chung một nhóm cấu hình. Thay vì phải lặp lại việc cấu hình Auth và header cho từng request, tính năng này giúp khai báo tập trung ở mức folder, cho phép các request con tự động kế thừa, đồng thời vẫn giữ được khả năng ghi đè (override) linh hoạt khi cần thiết. Tính năng ẩn/hiện header mặc định cũng giúp giao diện clean và dễ nhìn hơn, tránh bị rối bởi các thông tin tự động sinh ra.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể cấu hình Authentication ở cả cấp độ Folder và Request với các lựa chọn phổ biến: Inherit from parent, No Auth, Bearer Token, Basic Auth, và API Key.
  - **success:** Có thể lấy đúng Auth token tương ứng của Request hoặc kế thừa từ Folder cha gần nhất và gửi thành công qua HTTP Request. Giao diện lưu trữ thành công cấu hình Auth ở file hệ thống.
- **CAP-2**
  - **intent:** Người dùng có thể định nghĩa các Header chung ở cấp độ Folder, các Request con bên trong mặc định sẽ kế thừa các Header này.
  - **success:** Các Request nằm trong Folder tự động đính kèm Header của Folder cha khi thực thi call API.
- **CAP-3**
  - **intent:** Người dùng có thể bật/tắt hiển thị danh sách các "Default headers" (bao gồm header kế thừa từ cha và header tự sinh như Content-Type) ngay trong giao diện cấu hình Header của một Request.
  - **success:** Nhấn nút toggle sẽ hiển thị/ẩn danh sách các header mặc định dưới dạng chỉ đọc (read-only) trong UI, không ảnh hưởng đến việc các header này luôn được gửi đi ngầm.

## Constraints

- Dữ liệu lưu trữ (cấu hình Auth và Header của Folder/Request) phải tuân thủ định dạng lưu trữ file-based JSON/YAML trên ổ đĩa (không dùng Database).
- Khi có trùng lặp khoá (key) Header giữa Request và Folder cha, giá trị của Request con bắt buộc phải ghi đè (override) giá trị của Folder cha một cách không phân biệt hoa thường (case-insensitive).

## Non-goals

- Không hỗ trợ các luồng OAuth 2.0 phức tạp (e.g., login windows, authorization code flow, PKCE) trong giai đoạn này; chỉ hỗ trợ nhập token tĩnh.
- Không phát triển giao diện quản lý biến môi trường (Environment variables) trong Spec này, nó sẽ được tách thành một Spec riêng biệt theo mục 1 của improve.md.

## Success signal

- Người dùng có thể tạo một thư mục, cài đặt Bearer Token và một Header tùy chỉnh tại thư mục đó. Khi chạy một request con bên trong mà không cấu hình gì thêm, API call thành công nhờ nhận đủ token và header từ thư mục cha. Toggle ẩn/hiện header mặc định hoạt động mượt mà trên UI.

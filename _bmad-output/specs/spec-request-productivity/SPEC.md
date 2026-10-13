---
id: SPEC-request-productivity
companions: []
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Request Productivity

## Why

Khi làm việc liên tục với các API requests, người dùng thường xuyên gặp trở ngại làm giảm tốc độ thao tác: phải tự đồng bộ thủ công query params giữa URL và bảng cấu hình Params, thiếu công cụ trích xuất nhanh lệnh cURL để chia sẻ hoặc debug trong terminal, và phải liên tục ghi nhớ việc bấm Save thủ công (`Ctrl+S`) để tránh mất dữ liệu khi chuyển qua lại giữa các requests. Nhóm tính năng này tự động hóa việc đồng bộ query string hai chiều, cung cấp khả năng xuất lệnh cURL hoàn chỉnh trong một thao tác, và tự động lưu ngầm các thay đổi với cơ chế debounce an toàn.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể chỉnh sửa URL kèm query string trên thanh URL hoặc chỉnh sửa các cặp key-value trong bảng Query Params, và hệ thống tự động đồng bộ hai chiều ngay lập tức mà không làm hỏng cú pháp biến môi trường.
  - **success:** Thêm, sửa, xóa hoặc bật/tắt (toggle) một query param trong tab Params phản ánh chính xác lên chuỗi query string của thanh URL bar. Ngược lại, gõ hoặc dán URL có chứa query string vào URL bar tự động phân tích và cập nhật đầy đủ các dòng tương ứng trong tab Params. Các param bị tắt (`enabled: false`) không xuất hiện trên URL bar nhưng vẫn giữ nguyên trong bảng cấu hình. Cú pháp biến môi trường `{{...}}` ở cả key và value được bảo toàn nguyên vẹn, không bị URL-encode sai lệch.
- **CAP-2**
  - **intent:** Người dùng có thể xuất và sao chép cấu hình request hiện tại thành lệnh cURL hoàn chỉnh và hợp lệ vào clipboard để chạy trực tiếp trên terminal.
  - **success:** Nhấn nút "Copy as cURL" tạo ra một chuỗi lệnh cURL chuẩn POSIX/Bash bao gồm chính xác Method HTTP, URL đầy đủ (đã kèm query params và auth params), tất cả Headers đang bật (bao gồm headers do người dùng định nghĩa, headers kế thừa từ folder cha, Content-Type tự động và header xác thực), và Body payload (JSON/text đã được escape an toàn các ký tự nháy đơn `\'`). Giá trị các biến môi trường được tự động giải quyết (resolved) theo Environment đang kích hoạt. Hệ thống sao chép chuỗi vào clipboard và hiển thị thông báo phản hồi thành công.
- **CAP-3**
  - **intent:** Hệ thống tự động lưu các thay đổi của request xuống file lưu trữ trên ổ đĩa sau khi người dùng dừng nhập liệu (debounced auto-save) và đảm bảo không mất dữ liệu khi chuyển đổi context.
  - **success:** Khi request có thay đổi dữ liệu, hệ thống tự động lưu sau khoảng thời gian debounce (mặc định 800ms) mà không cần người dùng bấm `Ctrl+S`. Quá trình lưu diễn ra thầm lặng, cập nhật chỉ báo trạng thái lưu trên giao diện và không gây giật lag hay hiển thị popup spam. Nếu người dùng chuyển sang request khác hoặc đóng ứng dụng trong khi đang chờ debounce, hệ thống lập tức thực hiện lưu đồng bộ (flush) dữ liệu đang dở trước khi chuyển màn hình, đảm bảo tính toàn vẹn dữ liệu 100%.

## Constraints

- Định dạng file lưu trữ của Request trên ổ đĩa (JSON/YAML) phải giữ tính tương thích ngược hoàn toàn với cấu trúc dữ liệu hiện tại (`Request`, `KVPair`, `Body`, `AuthConfig`).
- Cơ chế đồng bộ URL - Params phải có cờ kiểm soát vòng lặp (guard) để tránh trigger sự kiện qua lại gây infinite loop hoặc giật con trỏ soạn thảo của người dùng.
- Trình tạo lệnh cURL phải escape ký tự đặc biệt theo chuẩn POSIX shell (đặc biệt là dấu nháy đơn `'` trong body JSON hoặc headers) để lệnh cURL có thể dán và chạy an toàn trên mọi terminal Bash/Zsh.
- Quá trình auto-save thầm lặng không được tự động kích hoạt toast thông báo tràn màn hình, chỉ hiển thị thông báo lỗi khi việc ghi đĩa thực sự thất bại.

## Non-goals

- Không hỗ trợ tính năng Import lệnh cURL từ clipboard thành Request trong Spec này (được tách thành một mục cải tiến riêng).
- Không triển khai hệ thống quản lý lịch sử hoàn tác (Undo/Redo stack) cho các thao tác auto-save trong Spec này.
- Không hỗ trợ sinh lệnh cURL cho các định dạng shell không phổ biến (ví dụ PowerShell Windows syntax đặc thù); mặc định tập trung vào chuẩn POSIX cURL tương thích đa nền tảng.

## Success signal

- Người dùng nhập `https://api.example.com/search?q=test&limit=10` vào thanh URL, tab Params lập tức hiển thị 2 dòng `q` và `limit` với checkbox checked. Khi uncheck dòng `limit`, URL bar tự động cập nhật thành `https://api.example.com/search?q=test`. Bấm nút "Copy as cURL" và dán vào terminal, lệnh cURL chạy ra kết quả tương đương. Người dùng sửa URL hoặc params rồi click ngay sang một request khác ở sidebar, quay lại request ban đầu thấy toàn bộ dữ liệu đã được lưu trữ bền vững mà không hề xuất hiện modal cảnh báo Unsaved Changes.

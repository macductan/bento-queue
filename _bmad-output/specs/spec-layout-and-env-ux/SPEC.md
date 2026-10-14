---
id: SPEC-layout-and-env-ux
companions:
  - layout-and-env-architecture.md
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Resizable Layout Panes & Active Environment UX Enhancements

## Why

Trong quá trình làm việc hàng ngày với các API phức tạp, người dùng gặp phải bốn rào cản lớn về trải nghiệm: (1) bố cục các khung màn hình (Sidebar, Request Editor, Response Viewer) đang bị khóa cứng kích thước khiến việc quan sát các đường dẫn cây thư mục sâu hoặc payload request/response lớn bị chật hẹp; (2) ứng dụng không lưu lại Environment đang kích hoạt khiến người dùng phải chọn lại thủ công mỗi lần mở app hoặc chuyển đổi Collection; (3) khi mở cấu hình thư mục, tab Variables không tự nhận diện theo Environment tổng đang chọn (ví dụ đang chọn `local` nhưng thư mục vẫn mở mặc định ở `Folder Global Env`); và (4) khi bắt gặp biến `{{variable}}` trong URL, Params, Headers hay Body, người dùng không thể xem nhanh giá trị thực tế hoặc chỉnh sửa trực tiếp tại chỗ mà phải rời ngữ cảnh để tìm nơi khai báo biến. Giải quyết đồng bộ bốn điểm nghẽn này giúp không gian làm việc linh hoạt và quy trình thao tác biến môi trường liền mạch, tức thì.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể kéo giãn linh hoạt chiều rộng của thanh Sidebar và tỷ lệ chiều cao giữa vùng soạn thảo Request (Content/Request Editor) với vùng kết quả (Response Viewer), đồng thời hệ thống tự động lưu giữ kích thước bố cục này qua các lần khởi động.
  - **success:** Thanh phân cách dọc giữa `AppSidebar` và `ContentArea` cho phép kéo chỉnh chiều rộng Sidebar trong ngưỡng an toàn (`180px` đến `520px` hoặc `50%` chiều rộng cửa sổ, mặc định `260px`); thanh phân cách ngang giữa `RequestEditor` và `ResponseViewer` cho phép kéo chỉnh tỷ lệ chiều cao với chiều cao tối thiểu mỗi vùng `120px` (mặc định `50%/50%`). Double-click vào bất kỳ thanh phân cách nào sẽ khôi phục kích thước mặc định của vùng đó, và mọi thay đổi kích thước được lưu bền vững trong `localStorage` để tự động áp dụng lại khi mở ứng dụng.
- **CAP-2**
  - **intent:** Hệ thống tự động lưu trữ Environment đang active (`active_env_id`) theo từng Collection xuống tệp cấu hình trên đĩa và tự động khôi phục lại đúng Environment đó mỗi khi mở lại ứng dụng hoặc chuyển đổi giữa các Collection.
  - **success:** Khi người dùng chọn một Environment (hoặc chọn "Không dùng env") trên thanh `EnvSelector`, trường `active_env_id` của Collection đang hoạt động được lưu bền vững vào tệp `collection.json`. Khi tắt mở lại ứng dụng hoặc khi chuyển đổi qua lại giữa các Collection, hệ thống tự động kích hoạt lại đúng `active_env_id` đã lưu của Collection đó; nếu Environment đã lưu không còn tồn tại trong danh sách environments của Collection, hệ thống tự động fallback an toàn về trạng thái "Không dùng env" (`null`).
- **CAP-3**
  - **intent:** Khi người dùng mở cấu hình thư mục (`FolderEditor`) hoặc thay đổi Environment tổng trên thanh Header, phạm vi môi trường trong tab Variables của thư mục tự động nhận diện và chọn theo đúng Environment tổng đang active.
  - **success:** Khi mở một thư mục trong `FolderEditor` hoặc khi đổi Environment trên `EnvSelector`, nếu đang có một Environment tổng được chọn (`activeEnvId != null`, ví dụ `local`), dropdown phạm vi môi trường trong tab Variables của `FolderEditor` tự động chọn đúng môi trường `local` đó; nếu đang chọn "Không dùng env" (`activeEnvId === null`), dropdown tự động chọn `Folder Global Env (Dùng chung)`. Người dùng vẫn có thể chủ động chuyển đổi dropdown sang phạm vi khác để chỉnh sửa trong phiên làm việc hiện tại.
- **CAP-4**
  - **intent:** Khi người dùng di chuột (hover) vào bất kỳ biến `{{variable}}` nào trong các ô nhập liệu có highlight biến, hệ thống hiển thị popover cho phép xem giá trị hiện tại và chỉnh sửa hoặc tạo mới giá trị biến trực tiếp tại tầng phạm vi mong muốn (Global/Collection Env hoặc bất kỳ Folder cha nào theo đúng Environment đang active).
  - **success:** Di chuột vào token `{{key}}` trên URL Bar, Query Params, Headers, Folder Variables hoặc Body hiển thị popover nổi mà không làm cản trở việc click đặt con trỏ, bôi đen văn bản hay gõ phím trong ô input. Popover hiển thị tên biến, ô nhập giá trị cho phép sửa/lưu nhanh, và một dropdown chọn tầng lưu trữ bao gồm toàn bộ các Folder cha trong phả hệ (`all cha folder`) cùng cấp Global/Collection — trong đó ở cấp Folder Env hay Global Env chỉ hiển thị duy nhất Environment đang active (không hiển thị các environment không active). Mặc định dropdown chọn sẵn tầng đang thắng ưu tiên (winning tier) của biến (hoặc Global Env đang active / Collection Env nếu biến chưa định nghĩa); khi người dùng sửa giá trị và lưu, thay đổi được ghi bền vững xuống đúng tệp cấu hình của tầng đã chọn (`_folder.json`, `environments/<id>.json`, hoặc `collection.json`) và cập nhật tức thì giá trị phân giải trên toàn giao diện.

## Constraints

- **Quy tắc an toàn dữ liệu khi test (Mục 19):** Trong suốt quá trình viết và chạy kiểm thử (Unit test, Vitest, Go test, E2E smoke test), mọi thao tác kiểm thử liên quan đến Collection chỉ được phép tạo và thực thi trên collection mang tên `Test-Collection` hoặc thư mục tạm thời độc lập (`t.TempDir()`). Nghiêm cấm tuyệt đối đọc, sửa hoặc xóa dữ liệu thật của người dùng (như collection `default` hoặc các collection hiện có). Mọi collection tạm tạo ra khi test phải được tự động xóa sạch ngay sau khi kết thúc kịch bản.
- Lưu trữ dữ liệu hoàn toàn bằng tệp tin JSON trên ổ đĩa cục bộ, tương thích ngược 100% với các tệp `collection.json` cũ chưa có trường `active_env_id` (mặc định coi là chuỗi rỗng `""` / không chọn env).
- Cơ chế bắt sự kiện hover trên `VariableHighlighter` bắt buộc không được chặn sự kiện chuột (`mousedown`, `click`, `select`, `input`, `compositionstart/end`) của thẻ `<input>` hoặc `<textarea>` bên dưới.
- Trong dropdown chọn tầng của Variable Hover Popover, đối với cấp Folder Env và Global Env, chỉ được hiển thị môi trường đang active (`activeEnvId`), tuyệt đối không liệt kê danh sách các môi trường đang không active.
- Tuân thủ thứ tự ưu tiên phân giải biến 4 cấp độ đã thiết lập: `Collection Env -> Global Env -> Folder Global Env (Root..Leaf) -> Folder-Env (Root..Leaf)`.

## Non-goals

- Không hỗ trợ kéo thả thay đổi vị trí (docking/reordering) các vùng giao diện (ví dụ không chuyển Sidebar sang bên phải hoặc chuyển Response Viewer sang ngang trong Spec này).
- Không hiển thị hoặc quản lý các Environment không active bên trong Variable Hover Popover (việc quản lý toàn bộ danh sách các Environment vẫn thực hiện tại `EnvModal`).
- Không thay đổi cơ chế thực thi HTTP request trên Go backend (Vue frontend vẫn chịu trách nhiệm phân giải biến trước khi gửi `ExecuteRequest`).

## Success signal

- Người dùng kéo thanh phân cách mở rộng Sidebar lên `340px` và thu gọn vùng Request Editor còn `35%` chiều cao, tải lại ứng dụng thấy bố cục giữ nguyên; double-click vào thanh phân cách đưa kích thước về lại mặc định `260px` và `50%`.
- Người dùng chọn môi trường `local` ở Collection A, chuyển sang Collection B chọn `staging`, sau đó tắt mở lại ứng dụng hoặc chuyển qua lại giữa hai Collection thấy mỗi Collection tự động khôi phục đúng môi trường `local` và `staging` tương ứng.
- Khi đang chọn môi trường `local`, người dùng click vào bất kỳ thư mục nào trên Sidebar và mở tab Variables thấy dropdown phạm vi môi trường tự động chọn sẵn `local`.
- Người dùng di chuột vào biến `{{baseUrl}}` trên thanh URL Bar (nằm trong `Folder Cha -> Folder Con -> Request`), popover hiện ra hiển thị đúng giá trị hiện tại và tầng đang thắng ưu tiên, cho phép mở dropdown chọn giữa `Global Env (local)`, `Collection Env`, và các thư mục cha `Folder Cha (local)`, `Folder Con (local)` để sửa giá trị và lưu trực tiếp xuống đĩa ngay tại chỗ.
- 100% bài kiểm thử backend (`go test ./...`) và frontend (`bun run type-check`, `bun run test`) vượt qua an toàn tuyệt đối.

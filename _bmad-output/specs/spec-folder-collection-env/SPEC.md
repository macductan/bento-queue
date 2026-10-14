---
id: SPEC-folder-collection-env
companions:
  - environment-architecture.md
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Folder & Collection Environment Enhancements

## Why

Trong quá trình thao tác kiểm thử API thực tế, người dùng gặp phải sự bất tiện về trải nghiệm khi phải qua nhiều bước click menu ngữ cảnh chỉ để mở cài đặt thư mục, thiếu cơ chế quản lý biến môi trường dùng chung cho toàn bộ collection (Collection Env), và không thể tùy biến biến của từng thư mục theo từng môi trường cụ thể (Folder-Env). Đồng thời, thanh địa chỉ URL hiển thị cỡ chữ quá lớn làm các đường dẫn API dài bị tràn dòng thô kệch, và quy trình kiểm thử tự động tiềm ẩn rủi ro tác động vào dữ liệu thật của người dùng nếu không có quy chuẩn phân vùng kiểm thử nghiêm ngặt. Việc hiện đại hóa các tầng biến môi trường theo mô hình 4 cấp độ kết hợp tối ưu UX click thư mục, tinh chỉnh typography URL Bar và thiết lập quy tắc an toàn dữ liệu kiểm thử giúp nâng cao năng suất làm việc và sự an toàn của toàn bộ hệ thống.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể click chuột trái vào bất kỳ thư mục nào trên cây sidebar để đồng thời mở rộng/thu gọn nhánh cây và mở ngay giao diện chỉnh sửa cấu hình thư mục (FolderEditor) trong vùng làm việc chính.
  - **success:** Click vào hàng thư mục trên cây sidebar kích hoạt mở `FolderEditor` hiển thị đầy đủ các tab Headers, Auth, Variables của thư mục đó trong `ContentArea`, hiển thị trạng thái active nổi bật trên hàng thư mục, và tự động lưu ngầm an toàn (auto-save flush) các thay đổi chưa lưu trước đó của request hoặc thư mục cũ.
- **CAP-2**
  - **intent:** Người dùng có thể định nghĩa, quản lý và sử dụng các biến môi trường cấp Collection (Collection Environment) có phạm vi hiệu lực dùng chung cho toàn bộ collection trên mọi môi trường.
  - **success:** Trường `variables: KVPair[]` được lưu trữ bền vững trong tệp `collection.json`, người dùng có thể xem và chỉnh sửa danh sách biến thông qua giao diện cấu hình Collection Environment với cơ chế tự động lưu, và các biến này có giá trị trong tất cả request thuộc collection bất kể môi trường nào đang được chọn.
- **CAP-3**
  - **intent:** Người dùng có thể cấu hình các biến môi trường riêng cho từng Environment cụ thể trong từng thư mục (Folder-Env) song song với các biến thư mục dùng chung (Folder Global Env), và hệ thống tự động phân giải các biến theo thứ tự ưu tiên ghi đè từ thấp đến cao: `Collection Env -> Global Env -> Folder Global Env -> Folder-Env`.
  - **success:** Trong giao diện `FolderEditor` tab Variables, người dùng có thể chọn cấu hình giữa "Folder Global Env" và danh sách các Environment cụ thể để lưu trữ vào `_folder.json`; khi thực thi hoặc hiển thị request, các biến `{{key}}` được engine phân giải chính xác theo chuỗi ưu tiên 4 cấp độ (Folder-Env ghi đè Folder Global Env, ghi đè Global Env của Active Environment, ghi đè Collection Env).
- **CAP-4**
  - **intent:** Người dùng có thể quan sát và chỉnh sửa các URL dài trên thanh địa chỉ với kích thước chữ nhỏ gọn, thanh thoát và hạn chế tràn dòng.
  - **success:** Kích thước font chữ của thẻ nhập URL và lớp phủ VariableHighlighter trong `UrlBar.vue` được chuyển đổi đồng bộ từ `text-base` (16px) sang `text-sm` (14px), đảm bảo vị trí highlight biến môi trường khớp pixel-by-pixel với ký tự văn bản.

## Constraints

- **Quy tắc an toàn dữ liệu khi test (Mục 19):** Trong suốt quá trình viết và chạy kiểm thử (Unit test, Vitest, Go test, E2E smoke test), mọi thao tác kiểm thử liên quan đến Collection chỉ được phép tạo và thực thi trên collection mang tên `Test-Collection` hoặc thư mục tạm thời độc lập do test framework cấp phát (`t.TempDir()`). Nghiêm cấm tuyệt đối đọc, sửa hoặc xóa dữ liệu thật của người dùng (như collection `default` hoặc các collection hiện có). Mọi collection được tạo mới phục vụ kiểm thử phải được tự động dọn dẹp xóa sạch ngay sau khi kịch bản kết thúc.
- Định dạng lưu trữ 100% tệp tin file-based JSON trên ổ đĩa nội bộ, tương thích tuyệt đối với kiến trúc pure UUID v4 hiện có (không dùng slug).
- Tương thích ngược: Backend và Frontend phải đọc an toàn các tệp `collection.json` cũ chưa có trường `variables` (mặc định mảng rỗng `[]`) và các tệp `_folder.json` cũ chưa có trường `folder_envs` (mặc định map rỗng `{}`) mà không gây lỗi phân tích cú pháp hoặc mất dữ liệu.
- Thứ tự phân giải biến bắt buộc tuân thủ đúng 4 cấp độ từ thấp đến cao: `Collection Env -> Global Env -> Folder Global Env -> Folder-Env`, đồng thời duyệt theo cấu trúc phả hệ từ thư mục gốc đến thư mục lá con.
- Công cụ phát triển: Frontend dùng Vue 3 + Pinia + TailwindCSS, quản lý gói bằng `bun` (Node 24 via nvm). Backend dùng Go 1.25.0 + Wails v2. Nghiêm cấm tự ý chạy `git commit` hay `git push` khi chưa có sự xác nhận của người dùng.

## Non-goals

- Không thay đổi giao thức truyền tải hoặc cơ chế thực thi HTTP trên Go backend (Go backend tiếp tục nhận `ExecuteRequest` đã được giải mã sẵn biến từ Vue frontend).
- Không hỗ trợ phân giải biến đệ quy lồng nhau vô hạn (giữ nguyên cơ chế phân giải một lượt hiện tại của `resolveVariables`).
- Không tạo script tự động quét sửa đổi hàng loạt các file JSON dữ liệu cũ của người dùng.

## Success signal

- Khi người dùng click vào bất kỳ thư mục nào trên sidebar, thư mục vừa mở/đóng vừa hiển thị ngay màn hình `FolderEditor` trên vùng làm việc chính.
- Khi người dùng đặt biến `apiUrl` ở Collection Env là `https://base.api`, ở Global Env là `https://dev.api`, ở Folder Global Env là `https://folder.dev.api`, và ở Folder-Env của môi trường Dev là `https://custom.dev.api`:
  - Request nằm ngoài thư mục khi chọn Dev nhận giá trị `https://dev.api`.
  - Request nằm trong thư mục khi chọn Dev nhận giá trị `https://custom.dev.api`.
  - Request nằm trong thư mục khi không chọn môi trường nào nhận giá trị `https://folder.dev.api`.
- Thanh URL Bar hiển thị font chữ cỡ `text-sm` gọn gàng, ô gõ và phần highlight biến khớp hoàn hảo.
- 100% bài kiểm thử backend (`go test ./...`) và frontend (`bun run type-check`, `bun run test`) đều vượt qua, không làm sai lệch hay rò rỉ dữ liệu vào các collection thực tế.

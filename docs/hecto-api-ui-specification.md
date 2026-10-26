# Đặc tả Cấu trúc & Thành phần Giao diện (UI Functional Structure) — `hecto-api`

> **Mục đích tài liệu**: Liệt kê đầy đủ 100% các thành phần chức năng, dữ liệu hiển thị, điều khiển và trạng thái của ứng dụng Desktop API Client **hecto-api** (thuần cấu trúc ngữ nghĩa, không ràng buộc icon, màu sắc hay hình ảnh) để AI Design tự do sáng tạo giao diện mới.

---

## 0. Tổng quan Cấu trúc Khung ứng dụng (App Shell)

Ứng dụng gồm 3 khu vực chính:

1. **Thanh công cụ trên cùng (Top Header Bar)**: Chứa thông tin định danh ứng dụng và các công cụ toàn cục.
2. **Không gian làm việc chính (Main Workspace)**:
   - **Thanh điều hướng bên (Sidebar)**: Quản lý danh sách phân cấp của hai chế độ làm việc là **APIs** và **Flows** (hỗ trợ thay đổi độ rộng).
   - **Vùng nội dung chính (Content Area)**: Hiển thị trình biên tập và kết quả tương ứng với chế độ đang chọn (**APIs Mode** hoặc **Flows Mode**).
3. **Các lớp phủ toàn cục (Global Overlays)**: Hệ thống hộp thoại (Modal/Dialog), menu ngữ cảnh (Context Menu), khung thông tin nổi (Popover) và thông báo trạng thái (Toast Notification).

---

## 1. Thanh Công cụ Trên cùng (Top Header Bar)

Chia làm 2 cụm chức năng:

### 1.1. Cụm Định danh Ứng dụng
- Tên ứng dụng: `hecto-api`.
- Nhãn phiên bản và chế độ hoạt động: `v{version} - offline`.

### 1.2. Cụm Công cụ Toàn cục
1. **Bộ chuyển đổi Collection (Collection Switcher)**:
   - Hiển thị tên Collection đang làm việc.
   - Menu danh sách các Collection hiện có:
     - Đánh dấu Collection đang được kích hoạt.
     - Nhãn đánh dấu Collection mặc định (`Default`).
     - Các thao tác nhanh trên từng Collection:
       - Mở cài đặt Biến & Xác thực của Collection (`CollectionEnvModal`).
       - Đổi tên Collection (`CollectionModal`).
       - Nhân bản Collection.
       - Xóa Collection (vô hiệu hóa đối với Collection mặc định).
     - Các hành động ở cuối menu:
       - Tạo Collection mới.
       - Mở trình quản lý tất cả Collections (`SettingsModal`).
2. **Nút Đồng bộ Git (Git Sync)**:
   - Thể hiện trạng thái hiện tại của Git: Chưa cấu hình, Đã cấu hình Remote, hoặc Đang có xung đột (Merge Conflict).
   - Kích hoạt hộp thoại Đồng bộ Git (`GitSyncModal`).
3. **Nút Import dữ liệu Postman (`Ctrl+I`)**:
   - Trạng thái bình thường: Cho phép chọn file để import.
   - Trạng thái đang xử lý: Hiển thị trạng thái đang import và tiến độ xử lý.
4. **Bộ chọn Môi trường (Environment Selector — `Ctrl+E`)**:
   - Hiển thị tên Environment đang áp dụng hoặc trạng thái `Không dùng env`.
   - Menu danh sách lựa chọn:
     - Tùy chọn tắt môi trường (`Không dùng env`).
     - Danh sách các Environment hiện có (đánh dấu mục đang chọn).
     - Hành động mở trình Quản lý Môi trường (`EnvModal`).
5. **Nút Lịch sử & Nhật ký thay đổi**: Mở hộp thoại `HistoryModal`.
6. **Nút Local Mock Server**:
   - Thể hiện trạng thái Mock Server (Đang dừng hoặc Đang chạy kèm số cổng `:{port}`).
   - Mở hộp thoại `MockServerModal`.
7. **Nút Quản lý Môi trường**: Mở trực tiếp hộp thoại `EnvModal`.
8. **Nút Cài đặt Ứng dụng**: Mở hộp thoại `SettingsModal`.

---

## 2. Thanh Điều hướng Bên (Sidebar)

Gồm 3 phần chức năng:

### 2.1. Bộ chuyển đổi Chế độ Làm việc (Workspace Mode Switcher)
- Chuyển đổi qua lại giữa 2 chế độ:
  1. `APIs` (Quản lý và kiểm thử từng Request đơn lẻ).
  2. `Flows` (Thiết kế và chạy kịch bản chuỗi nhiều Request).

### 2.2. Thanh Tìm kiếm & Thao tác Cây thư mục
- **Ô nhập từ khóa lọc**: Tìm kiếm nhanh Request (ở chế độ APIs) hoặc Flow (ở chế độ Flows), có nút xóa nhanh nội dung đang lọc.
- **Nhóm các hành động điều khiển cây**:
  1. **Làm mới dữ liệu (`Ctrl+R`)**: Tải lại cây thư mục từ ổ đĩa; có trạng thái báo hiệu khi phát hiện dữ liệu trên ổ đĩa bị thay đổi từ bên ngoài (CLI hoặc Git).
  2. **Thu gọn tất cả**: Đóng toàn bộ các thư mục đang mở trên cây.
  3. **Sắp xếp theo bảng chữ cái (A-Z)**: Sắp xếp lại toàn bộ cây thư mục.
  4. **Menu Tạo mới**:
     - Ở chế độ **APIs**: Tạo Request mới (`New Request`), Tạo Thư mục mới (`New Folder`).
     - Ở chế độ **Flows**: Tạo Flow mới (`New Flow`), Tạo Thư mục Flow mới (`New Flow Folder`).

### 2.3. Danh sách Phân cấp Cây thư mục (Tree View)
Hỗ trợ kéo-thả để sắp xếp thứ tự (trước, sau, lồng vào trong thư mục hoặc đưa về cấp gốc).

- **Phần tử Thư mục (Folder / Flow Folder)**:
  - Điều khiển đóng/mở danh sách con bên trong.
  - Tên thư mục (hỗ trợ sửa tên trực tiếp tại chỗ bằng nhấp đúp hoặc phím `F2`).
  - Thao tác nhanh trên dòng thư mục: Sắp xếp nội dung bên trong thư mục theo A-Z, Mở menu tùy chọn.
- **Phần tử Request (ở chế độ APIs)**:
  - Nhãn phương thức HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS` hoặc phương thức tùy chỉnh).
  - Tên Request (hỗ trợ sửa tên trực tiếp tại chỗ).
  - Trạng thái báo hiệu Request có thay đổi chưa lưu.
  - Nút mở menu tùy chọn.
- **Phần tử Flow (ở chế độ Flows)**:
  - Tên Flow (hỗ trợ sửa tên trực tiếp tại chỗ).
  - Trạng thái báo hiệu Flow có thay đổi chưa lưu.
  - Nút mở menu tùy chọn.
- **Các trạng thái đặc biệt của danh sách**:
  - Đang tải dữ liệu.
  - Lỗi tải dữ liệu (kèm hành động Thử lại).
  - Danh sách rỗng chưa có phần tử nào (kèm nút Tạo Request đầu tiên / Tạo Flow đầu tiên).
  - Không có kết quả khớp với từ khóa tìm kiếm (kèm nút Xóa bộ lọc).

### 2.4. Menu Ngữ cảnh của Cây thư mục (Context Menu)
- **Đối với Thư mục (Folder / Flow Folder)**:
  - Thêm Request mới (hoặc Thêm Flow mới).
  - Thêm thư mục con.
  - Đổi tên.
  - Mở cài đặt thư mục *(chỉ có ở chế độ APIs)*.
  - Sắp xếp nội dung theo A-Z.
  - Di chuyển tới thư mục khác *(danh sách chọn Thư mục gốc hoặc các thư mục đích hợp lệ)*.
  - Xóa thư mục.
- **Đối với Request / Flow**:
  - Chỉ báo trạng thái chưa lưu *(nếu phần tử đang có thay đổi chưa lưu)*.
  - Đổi tên.
  - Sao chép (Nhân bản).
  - Di chuyển tới thư mục khác *(danh sách chọn thư mục đích)*.
  - Xóa phần tử.

---

## 3. Vùng Nội dung Chính — Chế độ `APIs`

Chia thành 3 phần: **Thanh Tab đang mở**, **Vùng Soạn thảo (Request hoặc Folder)**, và **Vùng Xem Phản hồi (Response Viewer)** (có thể thay đổi tỷ lệ kích thước giữa vùng soạn thảo và vùng phản hồi).

### 3.1. Thanh Tab Làm việc (Tab Bar)
- Hiển thị danh sách các Request và Folder đang mở.
- Mỗi Tab gồm các thông tin:
  - Đường dẫn thư mục cha (nếu phần tử nằm trong thư mục con).
  - Nhãn phương thức HTTP (đối với Request) hoặc định danh Thư mục (đối với Folder).
  - Tên Request hoặc Tên Folder.
  - Chỉ báo trạng thái có thay đổi chưa lưu.
  - Nút đóng Tab.

### 3.2. Khung Soạn thảo Request (Request Editor)

#### A. Thanh Đường dẫn (Breadcrumb) & Trạng thái Lưu
- **Đường dẫn phân cấp**: Tên Collection -> Các thư mục cha (bấm vào từng thư mục cha sẽ mở khung Cài đặt của thư mục đó) -> Tên Request hiện tại (cho phép bấm vào để sửa tên trực tiếp) + chỉ báo chưa lưu.
- **Trạng thái Lưu (Save Status)**: Hiển thị 1 trong 4 trạng thái:
  - Đang lưu...
  - Chưa lưu
  - Lỗi khi lưu (kèm nội dung chi tiết lỗi)
  - Đã lưu

#### B. Thanh Địa chỉ URL & Gửi Request (URL Bar)
- **Bộ chọn Phương thức HTTP**:
  - Các phương thức tiêu chuẩn: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`.
  - Ô nhập phương thức tùy chỉnh (cho phép người dùng tự nhập phương thức HTTP bất kỳ và xác nhận).
- **Ô nhập URL**:
  - Hỗ trợ hiển thị nhiều dòng khi URL dài.
  - Nhận diện và phân biệt trực quan biến môi trường `{{variable}}` (phân biệt biến đã tồn tại với biến chưa được định nghĩa) và biến đường dẫn `:path_param`.
  - Hỗ trợ dán câu lệnh `cURL` trực tiếp vào ô URL để tự động điền toàn bộ cấu hình Request.
  - Hỗ trợ di chuột lên biến `{{variable}}` hoặc `:path_param` để mở khung xem/sửa nhanh giá trị biến (`VariableHoverPopover`).
- **Nút Thực thi**:
  - Trạng thái bình thường: `Gửi` (`Ctrl+Enter`).
  - Trạng thái đang chờ phản hồi: `Hủy` (dừng request đang chạy).

#### C. Thông báo Cảnh báo Ngữ cảnh
- Hiển thị cảnh báo khi người dùng chọn phương thức `GET` nhưng lại khai báo nội dung trong phần `Body`.

#### D. Thanh Điều hướng Cấu hình Request
- **6 mục cấu hình chính** (mỗi mục có bộ đếm số lượng phần tử đang kích hoạt):
  1. `Params`
  2. `Auth`
  3. `Headers`
  4. `Body`
  5. `Scripts`
  6. `cURL`
- **Bộ chọn nhanh kiểu dữ liệu Body**: `None`, `JSON`, `XML`, `x-www-form-urlencoded`, `multipart/form-data`, `Text`.

#### E. Chi tiết 6 Mục Cấu hình Request

1. **Mục `Params`**:
   - **Bảng Tham số Truy vấn (`Query Params`)**:
     - Danh sách các dòng gồm: Điều khiển bật/tắt dòng, Ô nhập `Key`, Ô nhập `Value` (hỗ trợ biến `{{var}}`), Nút xóa dòng, và thao tác Thêm dòng mới.
   - **Bảng Biến Đường dẫn (`Path Variables`)** *(chỉ xuất hiện khi URL có chứa `:param`)*:
     - Danh sách gồm cột `Key` cố định theo tên `:param` trên URL và cột `Value` để nhập giá trị.

2. **Mục `Auth` (Xác thực)**:
   - **Bộ chọn Phạm vi Môi trường**: Chọn áp dụng chung (`Global Auth`) hoặc cấu hình riêng cho từng Environment (kèm nút xóa cấu hình riêng của Environment).
   - **Bộ chọn Loại Xác thực (`Auth Type`)**:
     - `Inherit from parent`: Kế thừa từ Thư mục cha hoặc Collection (hiển thị thông tin tóm tắt cấu hình đang được kế thừa: loại xác thực, nguồn kế thừa và thông tin tài khoản/token).
     - `No Auth`: Không sử dụng xác thực.
     - `Bearer Token`: Ô nhập `Token` (có chức năng ẩn/hiện nội dung nhạy cảm, hỗ trợ biến `{{var}}`).
     - `Basic Auth`: Ô nhập `Username` (có cảnh báo nếu chứa ký tự `:` không hợp lệ theo chuẩn RFC 7617) và ô nhập `Password` (có chức năng ẩn/hiện nội dung).
     - `API Key`: Ô nhập tên `Key`, ô nhập `Value` (có chức năng ẩn/hiện nội dung), và bộ chọn vị trí gắn (`Add to`: `Header` hoặc `Query Params`).

3. **Mục `Headers`**:
   - **Danh sách Headers Mặc định & Kế thừa** (hỗ trợ thu gọn/mở rộng, hiển thị số lượng đang bật trên tổng số):
     - Các cột: Bật/tắt dòng, `Key`, `Value` (tự động ẩn giá trị nhạy cảm sinh từ Auth kèm nút ẩn/hiện), và cột **Nguồn gốc (`Source`)** với các nhãn:
       - `Overridden` (bị ghi đè bởi Header tùy chỉnh bên dưới).
       - `Folder (cấp N)` (kế thừa từ thư mục cha).
       - `Auth` (tự động sinh từ cấu hình xác thực).
       - `Auto` (header mặc định của hệ thống như `User-Agent`, `Accept`, `Content-Type`).
   - **Bảng Headers Tùy chỉnh (`Custom Headers`)**:
     - Danh sách các dòng gồm: Bật/tắt dòng, `Key`, `Value`, Xóa dòng, Thêm dòng mới.

4. **Mục `Body`**:
   - Giao diện thay đổi tùy theo kiểu Body được chọn:
     - **`None`**: Thông báo Request không sử dụng Body.
     - **`x-www-form-urlencoded`** và **`multipart/form-data`**: Bảng danh sách các cặp `Key` - `Value` (bật/tắt, xóa, thêm mới).
     - **`JSON`**, **`XML`**, **`Text`**:
       - Thanh trạng thái kiểm tra cú pháp (đối với JSON/XML): Báo hiệu dữ liệu hợp lệ (`JSON hợp lệ`, `JSONC có comment`, `XML hợp lệ`) hoặc báo lỗi cú pháp kèm vị trí dòng/cột cụ thể; có nút tự động định dạng (`Format JSON` / `Format XML`).
       - Trình soạn thảo văn bản/mã nguồn có số dòng, làm nổi bật cú pháp và biến môi trường `{{variable}}`.

5. **Mục `Scripts`**:
   - **Thanh điều khiển Script**:
     - Chuyển đổi giữa 2 giai đoạn: `Pre-request` (trước khi gửi) và `Post-response` (sau khi nhận phản hồi), có chỉ báo nếu giai đoạn đó đã có mã lệnh.
     - Các nút chức năng: `Định dạng` mã nguồn, `Ẩn/Hiện gợi ý API`, `Chạy thử Script`.
   - **Trình soạn thảo mã JavaScript**:
     - Có số dòng và làm nổi bật cú pháp.
     - Khung gợi ý lệnh tự động (`Autocomplete` — `Ctrl+Space`) liệt kê các hàm và thuộc tính của `ha.*` và `console.*` kèm phân loại và mô tả.
   - **Bảng Gợi ý Đoạn mã mẫu (Built-in Hints — có thể đóng/mở)**:
     - Chia làm 4 nhóm chức năng (bấm vào mẫu nào sẽ chèn mã lệnh đó vào trình soạn thảo):
       1. `Environment (ha.env)`: Lấy, gán, xóa biến môi trường.
       2. `Folder & Auth (ha.folder)`: Đọc/ghi biến, headers và thông tin xác thực của các cấp thư mục.
       3. `Request (ha.request)`: Truy cập và sửa đổi URL, method, headers, query, body của request sắp gửi.
       4. `Response & Debug (ha.response)`: Đọc status, thời gian, JSON body, headers của phản hồi; viết kịch bản kiểm thử `ha.test(...)` và ghi log `console.log(...)`.
   - **Khung Kết quả Console & Script Output**:
     - Hiển thị danh sách các dòng log sinh ra khi chạy thử Script (phân biệt mức thông tin thường, cảnh báo, lỗi, và kết quả test pass/fail), có nút `Xóa log`.

6. **Mục `cURL`**:
   - Hiển thị câu lệnh `cURL` đầy đủ được sinh ra từ Request hiện tại (sau khi đã thay thế các biến và cấu hình).
   - Nút `Sao chép cURL`.

---

### 3.3. Khung Cài đặt Thư mục (Folder Editor — hiển thị khi chọn cài đặt một Folder)
- **Thanh tiêu đề**: Đường dẫn thư mục cha, Tên Folder, Trạng thái lưu (`Đang lưu...` / `Chưa lưu` / `Đã lưu`), và nút `Lưu (Ctrl+S)`.
- **3 Mục Cấu hình cấp Thư mục** (kèm bộ đếm số lượng):
  1. **`Variables`**: Bộ chọn phạm vi môi trường (`Folder Global Env` hoặc riêng từng Environment) + Bảng khai báo các cặp biến `Key` - `Value` cấp thư mục.
  2. **`Auth`**: Cấu hình xác thực dùng chung cho các Request nằm trong thư mục này.
  3. **`Headers`**: Danh sách Headers kế thừa từ thư mục cấp cao hơn + Bảng khai báo Headers dùng chung cho thư mục này.

---

### 3.4. Trạng thái Chưa mở Request nào (Empty State)
- Hiển thị thông báo hướng dẫn người dùng chọn một Request từ danh sách bên trái hoặc nhấn phím tắt `Ctrl+N` để tạo mới.

---

### 3.5. Khung Xem Phản hồi (Response Viewer)
Hỗ trợ 2 chế độ hiển thị: **Thu gọn thành thanh trạng thái dưới đáy** hoặc **Mở rộng đầy đủ**.

- **Khi thu gọn**: Hiển thị tiêu đề `Response`, mã trạng thái kèm thời gian của lần gọi gần nhất, và nút mở rộng.
- **Khi mở rộng**:
  - **Thanh Tiêu đề & Thông số Phản hồi**:
    - **4 Mục thông tin phản hồi**:
      1. `Body`
      2. `Headers` (kèm tổng số lượng header nhận về)
      3. `Tests` (kèm tỷ lệ bài kiểm thử đạt `passed/total`)
      4. `Console / Logs` (kèm tổng số dòng nhật ký thực thi và chỉ báo nếu có lỗi script)
    - **Cụm Thông số Kỹ thuật (Response Meta)**:
      - Mã trạng thái HTTP (`Status Code` và tên trạng thái).
      - Thời gian phản hồi (`ms`).
      - Kích thước dữ liệu phản hồi (`B`, `KB`, `MB`).
      - Thời điểm nhận phản hồi.
      - Nút thu gọn khung phản hồi.
  - **Thanh công cụ phụ của mục `Body`**:
    - Chuyển đổi chế độ hiển thị nội dung: `Pretty` (định dạng chuẩn) hoặc `Raw` (nguyên bản).
    - Nút `Sao chép` nội dung Body.
  - **Chi tiết 4 Mục trong Khung Phản hồi**:
    1. **Mục `Body`**:
       - Trạng thái đang thực thi: Thông báo đang gửi request.
       - Trạng thái lỗi kết nối: Hiển thị tiêu đề loại lỗi (quá thời gian chờ, từ chối kết nối, lỗi chứng chỉ SSL, lỗi phân giải tên miền, hoặc lỗi mạng khác), gợi ý hướng xử lý, thông điệp lỗi kỹ thuật chi tiết và nút `Thử lại`.
       - Trạng thái chưa gửi request: Hướng dẫn nhấn `Gửi` hoặc `Ctrl+Enter`.
       - Cảnh báo dữ liệu bị lược bớt nếu dung lượng phản hồi vượt quá `10MB`.
       - Thông báo phản hồi rỗng (khi mã trạng thái là `204 No Content` hoặc dung lượng `0 Bytes`).
       - Thông báo dữ liệu nhị phân (khi phản hồi là hình ảnh, PDF, tệp tải về...) kèm thông tin kiểu MIME và dung lượng.
       - Khung hiển thị văn bản/mã nguồn (JSON, XML, HTML, Text) có đánh số dòng.
    2. **Mục `Headers`**: Bảng danh sách 2 cột chỉ đọc (`Key` và `Value`) hiển thị toàn bộ Response Headers.
    3. **Mục `Tests`**: Danh sách kết quả các bài kiểm thử `ha.test()`, mỗi mục gồm trạng thái đạt (`PASS`) hoặc trượt (`FAIL`), tên bài kiểm thử và thông điệp lỗi chi tiết (nếu trượt).
    4. **Mục `Console / Logs`**:
       - Nút `Xóa log` và thông báo lỗi Script (nếu quá trình chạy script gặp ngoại lệ).
       - **Bảng Nhật ký Thực thi (4 cột)**:
         1. `Thời gian`
         2. `Giai đoạn` (`PRE-SCRIPT`, `HTTP`, `POST-SCRIPT`)
         3. `Mức độ` (`INFO`, `LOG`, `WARN`, `ERROR`)
         4. `Nội dung chi tiết`: Nội dung thông điệp log; đối với dòng log `HTTP` có phần mở rộng cho phép xem toàn bộ dữ liệu thực tế đã gửi đi (Method, URL, Request Headers, Request Body) và dữ liệu thực tế nhận về (Status, Response Headers, Response Body).

---

## 4. Vùng Nội dung Chính — Chế độ `Flows` (Trình thiết kế Kịch bản Luồng API)

Khi chưa chọn Flow nào, hiển thị trạng thái trống kèm nút `Tạo Flow mới`. Khi chọn một Flow, giao diện gồm 3 phần:

### 4.1. Thanh Công cụ Điều khiển Flow (Flow Toolbar)
- **Khu vực Cấu hình & Hành động**:
  - Ô nhập **Tên Flow** (kèm chỉ báo chưa lưu).
  - Ô nhập **Mô tả ngắn** cho kịch bản Flow.
  - **Bộ chọn hướng bố cục sơ đồ**: Bố cục `Dọc` hoặc `Ngang`.
  - Ô nhập **Tổng thời gian chờ tối đa (`Timeout ms`)**.
  - Ô nhập **Số bước thực thi tối đa (`Max steps`)**.
  - Nút **`Lưu`** kịch bản.
  - Nút **`Chạy Flow`** (khi đang chạy sẽ chuyển thành nút **`Dừng`**).
- **Thanh Tóm tắt Kết quả Chạy Flow** *(hiển thị trong và sau khi chạy)*:
  - Khi đang chạy: Thông báo kịch bản đang được thực thi.
  - Khi hoàn tất: Trạng thái tổng thể (`PASSED` hoặc `FAILED`), thống kê số lượng bước Đạt (`Passed`), Trượt (`Failed`), Bỏ qua (`Skipped`), tổng thời gian chạy (`ms`), và thông báo nguyên nhân dừng luồng (nếu thất bại).

### 4.2. Vùng Sơ đồ Luồng Thực thi (Flow Canvas)
Hiển thị sơ đồ chuỗi các bước thực thi nối tiếp nhau theo hướng Dọc hoặc Ngang, hỗ trợ kéo-thả để thay đổi thứ tự các bước:

- **Điểm Bắt đầu (`Start`)**: Đánh dấu điểm khởi đầu của kịch bản.
- **Nút Chèn bước vào giữa**: Nằm trên đường nối giữa 2 bước liên tiếp để thêm nhanh một bước mới vào vị trí đó.
- **Khối Bước Thực thi (Flow Node)**:
  - **Phần đầu Bước**:
    - Số thứ tự bước (`Bước #N`).
    - Nhãn báo hiệu chế độ chạy song song kèm số lượng request (nếu bước có nhiều hơn 1 request).
    - Các nút điều khiển bước: Di chuyển bước lên/trước, Di chuyển bước xuống/sau, và nút **`Thêm rẽ nhánh`**.
  - **Danh sách các Thẻ Request trong Bước (Flow Step Cards)**:
    - Một bước có thể chứa 1 hoặc nhiều Thẻ Request chạy song song.
    - Mỗi **Thẻ Request** bao gồm:
      - Điều khiển bật/tắt thẻ trong kịch bản.
      - Nhãn phương thức HTTP và Tên Request.
      - Các nút thao tác trên thẻ: `Đổi` sang Request khác, Thêm Request chạy `Song song` cùng bước, `Xóa` thẻ.
      - Đường dẫn thư mục của Request gốc (hoặc thông báo cảnh báo nếu Request gốc đã bị xóa kèm nút `Chọn lại`).
      - Chỉ số thứ tự trong nhóm chạy song song (ví dụ `#1/2`).
      - Ô nhập nhãn ghi chú tùy chọn cho bước và ô nhập `Timeout (ms)` riêng cho thẻ đó.
      - **Thông tin kết quả thực thi thời gian thực trên từng thẻ**:
        - Đang chạy.
        - Thành công: Hiển thị mã HTTP Status, thời gian chạy (`ms`) và số lượng bài test đạt (`passed/total tests`).
        - Thất bại: Hiển thị mã lỗi/Status và nguyên nhân thất bại.
        - Đã bỏ qua (khi nằm ở nhánh không thỏa điều kiện hoặc bị tắt).
  - **Khối Rẽ nhánh có Điều kiện (Conditional Branches)**:
    - Gắn vào một Bước để phân luồng thực thi tiếp theo dựa trên kết quả của bước đó.
    - Mỗi nhánh gồm:
      - **Bộ chọn Loại Điều kiện Nhánh**:
        1. `Khi thành công (Success 2xx)`
        2. `Khi thất bại (Error / Fail)`
        3. `Điều kiện tùy chỉnh (Custom)`
      - Điều khiển chuyển đổi nhanh giữa các nhánh cùng cấp và nút xóa nhánh.
      - **Bộ thiết lập Biểu thức Điều kiện Tùy chỉnh** *(chỉ hiển thị khi chọn loại `Custom`)* gồm 3 thành phần:
        1. **Nguồn dữ liệu kiểm tra (`Source`)**: Chọn `Status Code`, `Body JSON path` (kèm ô nhập biểu thức đường dẫn JSON như `$.data.role`), hoặc `Variable` (kèm ô nhập tên biến).
        2. **Toán tử so sánh (`Operator`)**: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `matches`, `exists`.
        3. **Giá trị đối chiếu (`Value`)**: Ô nhập giá trị cần so sánh (ẩn khi toán tử là `exists`).
      - **Chuỗi Bước con bên trong Nhánh**: Chứa danh sách các Bước con (hỗ trợ lồng nhiều cấp rẽ nhánh đệ quy) và nút `Thêm bước vào nhánh`.
- **Nút Thêm bước ở cuối kịch bản**: Thêm bước mới vào cuối luồng chính.

### 4.3. Ngăn Chi tiết Kết quả của Bước (Step Inspector Panel)
- Mở ra khi người dùng bấm chọn một Thẻ Request trên sơ đồ Flow.
- **Phần tiêu đề ngăn**:
  - Trạng thái thực thi của bước (`PASSED`, `FAILED`, `RUNNING`, `IDLE`), Tên bước, Phương thức HTTP, và URL đã gọi.
  - Thống kê kết quả kiểm thử `ha.test: X/Y Passed`.
  - Nút **`Mở Request gốc`** (chuyển sang chế độ `APIs` và mở trực tiếp Request đó để chỉnh sửa).
  - Nút đóng ngăn chi tiết.
- **Phần nội dung ngăn**: Hiển thị đầy đủ thành phần **Khung Xem Phản hồi (Response Viewer)** của riêng bước đó (`Body`, `Headers`, `Tests`, `Console / Logs`).

---

## 5. Hệ thống Khung thông tin nổi & Hộp thoại Toàn cục (Popovers, Modals & Dialogs)

### 5.1. Khung Xem & Sửa nhanh Biến (Variable Hover Popover)
- Xuất hiện khi di chuột vào tên biến `{{variable}}` hoặc `:path_param` ở bất kỳ ô nhập liệu nào:
  - Tên biến và trạng thái hiện tại (Chưa định nghĩa, hoặc đang lấy giá trị từ tầng nào: `Path Variable`, `Environment`, `Folder`, hay `Collection`).
  - Bộ chọn phạm vi lưu trữ (`Scope Selector`) kèm tùy chọn mở rộng danh sách tất cả các Environment và Folder trong dự án.
  - Ô nhập giá trị biến và nút `Lưu` trực tiếp.

### 5.2. Hộp thoại Chọn Request cho Bước Flow (`RequestPickerModal`)
- Ô tìm kiếm lọc theo tên Request, phương thức HTTP hoặc đường dẫn thư mục.
- Danh sách toàn bộ Request trong Collection (hiển thị Phương thức HTTP, Tên Request và Đường dẫn thư mục cha).
- Nút `Hủy`.

### 5.3. Hộp thoại Quản lý Môi trường (`EnvModal`)
- Chia 2 khu vực:
  - **Danh sách các Environment**: Nút `Tạo Môi trường` mới, danh sách các Environment hiện có (chọn để sửa hoặc xóa).
  - **Chi tiết Environment đang chọn**:
    - Ô nhập `Tên Môi trường`.
    - Bảng danh sách các biến thuộc môi trường đó: Bật/tắt biến, Tên biến (`Key`), Giá trị (`Value`), Xóa biến, và nút `Thêm biến`.

### 5.4. Hộp thoại Cài đặt Biến & Xác thực cấp Collection (`CollectionEnvModal`)
- Hiển thị tên Collection đang cấu hình.
- Chuyển đổi giữa 2 mục:
  1. `Biến Collection (Variables)`: Bảng danh sách các cặp `Key` - `Value` dùng chung cho toàn Collection.
  2. `Xác thực (Auth)`: Cấu hình xác thực mặc định cho toàn Collection.
- Nút `Hủy` và nút `Lưu`.

### 5.5. Hộp thoại Tạo / Đổi tên Collection (`CollectionModal`)
- Ô nhập `Tên Collection` (kèm kiểm tra trùng tên hoặc để trống).
- Nút `Hủy` và nút xác nhận (`Tạo` hoặc `Lưu`).

### 5.6. Hộp thoại Đồng bộ Git (`GitSyncModal`)
- **Khu vực Cảnh báo Xung đột** *(chỉ xuất hiện khi đang có xung đột Merge Conflict)*:
  - Thông báo số lượng tệp đang bị xung đột.
  - Nút mở **Bộ giải quyết xung đột trực quan (`GitConflictResolverModal`)**.
  - Nút **`Huỷ merge`**.
- **Khu vực Cấu hình Địa chỉ Kho chứa (`Git Remote URL`)**:
  - Ô nhập URL của kho Git từ xa và nút `Lưu Remote`.
  - **Khung lựa chọn phương án xử lý khi thay đổi sang Remote URL mới (4 tùy chọn)**:
    1. Xóa dữ liệu cục bộ cũ và tải mới hoàn toàn từ Remote.
    2. Giữ dữ liệu cục bộ cũ và gộp (merge) với dữ liệu từ Remote mới.
    3. Chỉ cập nhật địa chỉ Remote (không chạy đồng bộ ngay).
    4. Hủy thao tác.
- **Khu vực Quản lý Nhánh (`Branch`)**:
  - Bộ chọn nhánh làm việc (hỗ trợ tìm kiếm nhánh đã có hoặc nhập tên mới để tạo nhánh mới ngay tại chỗ), nút làm mới danh sách nhánh, và nút `Chuyển nhánh`.
  - Khu vực hiển thị thông báo trạng thái/kết quả đồng bộ.
- **Nhóm hành động chính**: Nút `Git Pull` (kéo thay đổi về), Nút `Git Push` (đẩy thay đổi lên), Nút `Đóng`.

### 5.7. Hộp thoại Giải quyết Xung đột Git Trực quan (`GitConflictResolverModal`)
- **Phần đầu hộp thoại**:
  - Hiển thị tiến độ giải quyết: `Đã xử lý X/Y file`.
  - Các nút thao tác hàng loạt: `Chọn toàn bộ Local`, `Chọn toàn bộ Remote`, `Huỷ merge`.
- **Phần thân chia 2 khu vực**:
  - **Danh sách các tệp bị xung đột**: Hiển thị trạng thái đã/chưa giải quyết của từng tệp, tên đối tượng, nhãn phân loại (`Request`, `Folder`, `Env`, `Flow`, `Collection`, `Deleted`) và đường dẫn tệp.
  - **Vùng so sánh và chọn phương án cho tệp đang mở**:
    - Trường hợp **Xung đột Xóa - Sửa** (một bên xóa tệp, một bên sửa nội dung): Hiển thị bảng so sánh nội dung giữa `Bản của bạn (Local)` và `Bản từ xa (Remote)` kèm 2 lựa chọn: `Giữ lại file` hoặc `Xác nhận xoá file`.
    - Trường hợp **Xung đột Nội dung**: Liệt kê từng trường thông tin bị khác biệt (như `Method`, `URL`, `Headers`, `Body`...), cho phép người dùng chọn giữ giá trị của `Bản của bạn (Local)` hoặc `Bản từ xa (Remote)` trên từng trường độc lập.
- **Phần chân hộp thoại**: Nút `Xác nhận & Hoàn tất Đồng bộ` (chỉ kích hoạt khi đã giải quyết đủ 100% các tệp xung đột).

### 5.8. Hộp thoại Lịch sử Gọi API & Nhật ký Thay đổi (`HistoryModal`)
- **Thanh điều khiển chung**:
  - Chuyển đổi giữa 2 mục: `Lịch sử gọi API` và `Nhật ký thay đổi` (kèm tổng số bản ghi của mỗi mục).
  - Ô tìm kiếm lọc bản ghi, nút xóa toàn bộ lịch sử/nhật ký, và nút đóng.
- **Mục 1 — `Lịch sử gọi API` (Bố cục Danh sách & Chi tiết)**:
  - **Danh sách các lần gọi**: Mỗi mục gồm Phương thức HTTP, Mã trạng thái phản hồi, Thời gian chạy (`ms`), Dung lượng, URL, Tên Request và Thời điểm thực hiện.
  - **Chi tiết lần gọi đang chọn**:
    - Nút **`Khôi phục Request`** (đưa toàn bộ cấu hình của lần gọi đó quay lại trình soạn thảo chính).
    - Khung xem chi tiết `Request Payload (Headers & Body)` đã gửi và `Response Body` nhận về.
- **Mục 2 — `Nhật ký thay đổi` (Changelog)**:
  - Danh sách dòng thời gian ghi lại các thao tác dữ liệu: Loại hành động (`CREATE`, `UPDATE`, `DELETE`, `IMPORT`, `GIT_PULL`, `GIT_PUSH`), Loại đối tượng (`request`, `folder`, `environment`, `collection`), Tên đối tượng, Tóm tắt nội dung thay đổi và Thời điểm xảy ra.

### 5.9. Hộp thoại Local Mock Server (`MockServerModal`)
- **Thanh điều khiển Server**:
  - Hiển thị trạng thái hoạt động (`RUNNING` kèm số cổng hoặc `STOPPED`).
  - Ô nhập cổng lắng nghe (`Port` — khóa khi server đang chạy), nút `Lưu cấu hình`, và nút `Khởi động` / `Dừng Server`.
- **Phần thân chia 2 khu vực**:
  - **Danh sách các Route giả lập (`Mock Routes`)**: Nút `Thêm Route`, danh sách các Route hiện có (gồm điều khiển bật/tắt, Phương thức HTTP, Đường dẫn `Path`, Mã trạng thái trả về `Status Code`, Độ trễ `Delay ms`, và nút xóa Route).
  - **Biểu mẫu Cấu hình Route đang chọn**:
    - Bộ chọn `Method`, Ô nhập `Path (/api/...)`, Ô nhập `Status Code`, Ô nhập độ trễ phản hồi `Delay (ms)`.
    - Bảng danh sách `Route Headers` trả về (`Key` - `Value`).
    - Ô soạn thảo nội dung `Response Body` trả về.

### 5.10. Hộp thoại Cài đặt Ứng dụng (`SettingsModal`)
Gồm 3 nhóm thiết lập:
1. **Vị trí Lưu trữ (`Lưu trữ`)**: Hiển thị đường dẫn thư mục lưu dữ liệu trên máy tính và nút `Đổi thư mục...`.
2. **Tự động Lưu (`Tự động lưu`)**: Công tắc bật/tắt chế độ tự động lưu khi chỉnh sửa Request.
3. **Quản lý Danh sách Collection**:
   - Nút `Tạo mới` Collection.
   - Danh sách toàn bộ Collection (hiển thị tên, nhãn `Default`, nhãn `Đang dùng`) kèm 4 thao tác trên mỗi dòng: Mở `Biến & Auth`, `Đổi tên`, `Nhân bản`, `Xóa`.

### 5.11. Các Hộp thoại Xác nhận & Thông báo Hệ thống
- **Hộp thoại Xác nhận (`ConfirmDialog`)**: Hiển thị tiêu đề, nội dung cần xác nhận, nút `Hủy` và nút `Xác nhận` / `Xóa`.
- **Hộp thoại Cảnh báo Thay đổi Chưa lưu (`UnsavedChangesDialog`)**: Xuất hiện khi người dùng rời khỏi một Request/Folder đang có chỉnh sửa chưa lưu (khi tắt chế độ Tự động lưu), gồm 3 lựa chọn: `Hủy (Ở lại)`, `Bỏ qua thay đổi`, và `Lưu & Tiếp tục`.
- **Hộp thoại Báo lỗi Import (`ImportErrorModal`)**: Hiển thị chi tiết lỗi khi tệp Postman đưa vào không hợp lệ, kèm nút `Đóng`.
- **Thông báo Nổi (`ToastNotification`)**: Hiển thị thông báo ngắn (thành công, cảnh báo, hoặc lỗi) và nút đóng thông báo.

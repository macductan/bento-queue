# Forged Idea: Tính năng API Flow (Structured Flowchart Runner) trong `hecto-api`

## Locked Decisions

- **Thực thể `Flow` độc lập & Lưu trữ phân nhóm (`<collection>/flows/`):**
  - Tách biệt hoàn toàn tại thư mục `<collection>/flows/` (bỏ qua khi `CollectionService.buildTree` quét cây Request).
  - Hỗ trợ tạo **Flow Folder** (`_folder.json` chỉ gồm `{ id, name, order }`) để chia nhóm, tìm kiếm, kéo-thả sắp xếp, đổi tên và xóa các Flow. Flow Folder thuần túy dùng để phân loại hiển thị, **không** chứa `Variables`, `Headers` hay `Auth` riêng để tránh xung đột kế thừa với Folder của Request gốc.
- **Cấu trúc Bước (`FlowStep`) kiểu Con trỏ mỏng (Thin Pointer):**
  - Mỗi bước thực thi tham chiếu trực tiếp tới Request gốc qua `request_id` (`{ id, request_id, enabled, timeout_ms? }`), cho phép ghép các Request nằm ở nhiều Folder khác nhau mà không cần nhân bản file Request.
  - Không tạo biến cấp Flow/Step hay Script riêng cấp Step; tái sử dụng 100% cơ chế giải biến 4 tầng (`4-Tier Variable Resolution`), kế thừa Auth/Header và `Pre-request`/`Post-response` script của Request gốc.
- **Không gian làm việc riêng `[ APIs | Flows ]` giữ nguyên bố cục 2 cột:**
  - Chuyển đổi chế độ làm việc giữa **`APIs`** và **`Flows`** ngay trên giao diện chính, giữ nguyên bố cục 2 cột (`Sidebar` bên trái hiển thị cây Nhóm/Flow + `ContentArea` bên phải hiển thị màn hình thiết kế & chạy Flow).
- **Sơ đồ khối tự căn bố cục (Structured Flowchart) 2 trục vuông góc + Đảo hướng `[ ↕ Dọc | ↔ Ngang ]`:**
  - Không dùng Freeform Canvas (không kéo tọa độ `x, y` tự do, không pan/zoom). Dùng sơ đồ khối tự căn hàng bằng HTML/CSS Flexbox + đường nối phân nhánh.
  - Quy tắc 2 trục vuông góc tự động (không cho phép từng bước tự chọn hướng ngang/dọc lẻ tẻ gây đè khối): luồng nối tiếp đi theo trục chính, các bước **Song song (`||`)** và **Nhánh rẽ (`↙ ↘`)** tự động bung theo trục vuông góc để tận dụng khung nhìn gần vuông.
  - Cung cấp nút gạt toàn cục **`Bố cục: [ ↕ Dọc | ↔ Ngang ]`** trên thanh công cụ để xoay hướng trục chính của toàn sơ đồ.
- **Thực thi Tuần tự, Song song (`Promise.all`) & Rẽ nhánh 3 chế độ + Timeout:**
  - Hỗ trợ cài đặt **Timeout (`timeout_ms`)** (bổ sung `TimeoutMs` vào `model.ExecuteRequest` và mở khóa `ExecutorService.Send` để cho phép bắn nhiều HTTP request đồng thời không bị chặn bởi cờ đơn `inflight`).
  - **Hàng Song song (`[Req 1 || Req 2]`)**: Chạy đồng thời các Request trong cùng hàng; gom tuần tự kết quả cập nhật biến (`envUpdates`, `scopedEnvUpdates`, `scopedAuthUpdates`) sau khi hàng kết thúc rồi mới ghi đĩa 1 lần để chống race condition. Hàng Song song chỉ tính là `Passed` khi **tất cả** Request trong hàng đều Passed; nếu bất kỳ Request nào lỗi/timeout thì cả hàng tính là `Failed`.
  - **Phán quyết `Passed` / `Failed` của từng Request**: Luôn `Failed` nếu `request_id` đã bị xóa, lỗi mạng/timeout, lỗi runtime trong script, hoặc có `ha.test()`/`pm.test()` fail; nếu Request không viết `ha.test()` nào thì HTTP `status_code >= 400` tính là `Failed` (ngược lại nếu có `ha.test()` thì theo kết quả `ha.test()`).
  - **Rẽ nhánh (`Branching`)**: Mặc định không chia nhánh thì Thành công đi tiếp, Lỗi dừng ngay. Khi chia nhánh, hỗ trợ 3 loại điều kiện:
    1. **`✅ Thành công (Default Success)`**
    2. **`❌ Khi Lỗi (On Error)`**
    3. **`⚡ Điều kiện tùy chỉnh (Custom Condition)`** với bộ chọn 3 ô: `Nguồn [Status Code | Body JSON path | Biến]` $ightarrow$ `Toán tử [==, !=, >, <, contains, exists]` $ightarrow$ `Giá trị`. (Có giới hạn số bước thực thi tối đa `max_steps` để chặn vòng lặp vô hạn).
- **Trải nghiệm Thêm Request & Soi kết quả (`Step Inspector Panel`):**
  - Thêm Request vào sơ đồ qua nút **`+`** (mở `Searchable Request Picker` lọc nhanh theo Method + đường dẫn Folder + tên Request) kết hợp kéo-thả sắp xếp các khối ngay trên sơ đồ.
  - Click vào một khối trên sơ đồ mở **Step Inspector Panel** (tái sử dụng `ResponseViewer.vue`) hiển thị `Response Body`, `Headers`, `Test Results`, `Logs` của riêng bước đó kèm nút **`Mở Request gốc ↗`** nhảy thẳng sang tab chỉnh sửa bên màn `APIs`.
- **Đồng bộ Hệ sinh thái (`CollectionWatcher`, Git Sync & CLI `hecto flow`):**
  - Tích hợp thư mục `<collection>/flows/` vào `CollectionWatcher` (`fsnotify`), `smartReload()` và `GitSync` / `GitMerge`.
  - Mở rộng `headless-engine.ts` và binary CLI `hecto` với hệ lệnh trực giao `hecto flow` (`list`, `tree`, `get`, `create`, `update`, `delete`, `move`, `run`) và cập nhật tài liệu `SKILL.md` (`hecto agent-guide`).

## Rejected Options & Why

- **Folder Runner thuần túy (chỉ gắn nút Run vào Folder có sẵn của Request):** Bị bác bỏ vì buộc người dùng phải nhân bản (duplicate) các Request từ nhiều domain (`Auth/`, `Orders/`, `Payments/`) vào chung một Folder mỗi khi muốn tạo kịch bản E2E.
- **Biến cấp Step / Script riêng cấp Step & Vùng nhớ tạm Flow Context (Phương án 2B/2C):** Bị bác bỏ để giữ mô hình dữ liệu tối giản; tận dụng trực tiếp cơ chế biến 4 tầng và `Pre-request`/`Post-response` script của Request gốc.
- **Đặt node `Flow` nằm lẫn lộn trong cây thư mục `Request/Folder` hoặc nhét vào Modal nổi:** Bị bác bỏ vì đặt chung cây gây hiểu nhầm về kế thừa biến/Auth từ Folder cha và làm phức tạp `buildTree`, còn mở bằng Modal thì chật chội không đủ chỗ cho cả cây quản lý Flow lẫn sơ đồ.
- **Freeform Infinite Canvas (Kéo thả tọa độ `x, y` tự do, pan/zoom, vẽ dây nối tự do kiểu n8n/Postman Flows):** Bị bác bỏ vì tốn ~70% công sức cho việc căn chỉnh tọa độ và dây nối mà không mang lại thêm giá trị thực thi so với Sơ đồ khối tự căn bố cục.
- **Cho phép từng bước (per-step) tự chọn hướng rẽ ngang hay rẽ dọc tùy ý:** Bị bác bỏ vì khi trộn lẫn rẽ ngang và rẽ dọc ở từng node riêng lẻ, các nhánh con sẽ đâm chéo và đè lên nhau (2D layout collision). Thay bằng quy tắc 2 trục vuông góc tự động + nút đảo hướng `[ ↕ Dọc | ↔ Ngang ]` cấp toàn sơ đồ.

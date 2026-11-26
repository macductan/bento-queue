# Ý tưởng đã rèn: Example Request (`hecto-api`)

## Bài toán gốc
Cần lưu và chuyển đổi nhanh nhiều kịch bản đầu vào khác nhau (đặc biệt là JSON Body/Payload phức tạp mà biến `select` ở `v1.22.0` không giải quyết được) trên cùng một Request mà không phải Duplicate thành nhiều Request rời rạc dễ lệch URL/Auth khi sửa bản gốc.

## Các quyết định đã chốt
- **Bản chất thực thể:** Example Request là các kịch bản đầu vào (`Input Scenario / Variant`) gắn dưới Request gốc để bấm `Send` chạy thật (không phải lưu cặp Request+Response mẫu để viết docs hay Mock). Request gốc giữ vai trò kịch bản **`Default` (Mặc định)** chạy được ngay.
- **Lưu trữ & Mô hình Snapshot + Cờ đồng bộ theo nhóm trường:**
  - Nhúng mảng `examples` trực tiếp trong `<req-uuid>.json` của `model.Request` (Move/Delete/Duplicate Request đi trọn bộ; khi Duplicate Request phải cấp lại UUID mới cho từng Example).
  - Mỗi Example là một snapshot đầy đủ kèm **bảng cờ liên kết theo nhóm trường** (`url`, `method`, `auth`, `scripts`, `body`, `params`, `path_params`, `headers`, `variables`). Mặc định khi clone: `URL`, `Method`, `Auth/AuthEnvs`, `Scripts` = **Bật đồng bộ**; `Body`, `Params`, `PathParams`, `Headers`, `Variables` = **Độc lập** — cho phép bật/tắt tự do trên từng Example lúc clone hoặc sau khi tạo.
  - Khi sửa `Default` hoặc bấm **Sync / Sync All**, chỉ đẩy những nhóm trường đang bật cờ đồng bộ (hoặc cho phép tích chọn nhóm trường ngay lúc Sync).
- **Tách Base URL vs Query Params:** Khi `URL` bật đồng bộ nhưng `Params` để độc lập, đồng bộ chỉ áp dụng cho phần **Base URL (trước `?`) + key `:path_param`** (giữ nguyên value `:path_param` hiện có của Example), không ghi đè `?query` (`Params`) riêng của Example; `UrlBar` hiển thị ghép động `<Base URL> + <Query của kịch bản đang chọn>`.
- **UX & Chống sửa nhầm:**
  - Đặt **Example Switcher ngay trong `RequestEditor`** (không thêm node con ở Sidebar hay tab riêng trên `AppTabBar`).
  - Các nhóm trường đang bật đồng bộ hiển thị ở trạng thái **Linked / Chỉ đọc** khi đứng trong Example để tránh sửa nhầm Request gốc; muốn sửa riêng thì **bỏ tích đồng bộ** của nhóm đó, hoặc dùng hành động **"Tách thành Request độc lập"** (Detach/Promote ra ngoài).
  - Lưu `active_example_id` ở UI local (`tabStore`/`localStorage`, không ghi xuống `<req-uuid>.json` để giữ sạch Git diff) và cache Response tạm theo từng `(requestId, exampleId)`.
- **Phạm vi hệ sinh thái:**
  - Nâng cấp `projects/service/git_merge.go` để merge 3 chiều mảng `examples` theo `id`.
  - Mở rộng `FlowStep` (`projects/model/types.go`, `flowRunner.ts`) thêm `example_id?: string` tùy chọn (trống = chạy `Default`; nếu Example bị xóa thì báo lỗi rõ thay vì âm thầm chạy `Default`).
  - Hỗ trợ `--example <id|name>` trên `hecto run` / `hecto flow` và quản lý/sync `examples` qua `hecto req` (cập nhật `projects/cmd/hecto/SKILL.md`) để đảm bảo 100% parity Desktop ↔ CLI.

## Các phương án đã loại bỏ & lý do
- **Lưu Response mẫu kiểu Docs/Mock:** Loại bỏ vì sai trọng tâm bài toán chạy thử nhiều input và trùng lặp với Mock Server sẵn có.
- **Khóa cứng 100% `URL / Method / Auth / Scripts` không cho tách:** Loại bỏ để thay bằng Snapshot + Cờ đồng bộ theo nhóm trường (linh hoạt bỏ tích từng nhóm hoặc tách hẳn thành Request độc lập khi kịch bản rẽ hướng).
- **Sync All ghi đè toàn bộ Request:** Loại bỏ vì sẽ xóa sạch `Body`/`Params`/`Headers` riêng của các kịch bản test.
- **Đưa Example thành node con trên Sidebar / tab riêng trên `AppTabBar`:** Loại bỏ để giữ Sidebar gọn và tránh mở nhiều tab cùng 1 Request gây sửa nhầm bản gốc.
- **Lưu `active_example_id` vào file JSON trên đĩa:** Loại bỏ vì thao tác click xem Example sẽ gây Git diff rác.
- **Import Postman Examples (`importer.go`):** Loại bỏ khỏi phạm vi vì Postman lưu Response snapshot khác mô hình Input Scenario + Sync flags.

## Điểm bẫy kỹ thuật đã phát hiện (cần xử lý khi triển khai)
- `projects/frontend/src/composables/useUrlParamsSync.ts` & `requestStore.ts`: đang đồng bộ 2 chiều `req.url` ↔ `req.params`; cần tách ranh giới trước/sau `?` khi `URL` bật đồng bộ nhưng `Params` độc lập.
- `projects/service/git_merge.go`: hiện chưa có bộ merge mảng object theo `id`; cần bổ sung cho `examples[]`.
- `projects/frontend/src/components/RequestEditor.vue` (`resolvedCurlPreview`): phải sinh cURL theo đúng kịch bản Example đang chọn (đã áp dụng các nhóm đang link từ `Default`).
- `projects/service/request.go` (`Duplicate`): cần tái sinh UUID mới cho từng `example.id` khi Duplicate Request.

# Ý tưởng đã rèn: Biến & KVPair dạng Select Box (`hecto-api`)

## Bài toán gốc
Giảm thao tác đổi lặp đi lặp lại và lỗi gõ sai cho các giá trị hay xoay vòng trong quá trình test API.

## Các quyết định đã chốt
- **Mở rộng trực tiếp `KVPair` (`projects/model/types.go`):** Thêm kiểu tùy chọn (vd `type?: "text" | "select"`) và danh sách `options?: string[]` (`omitempty`). Mặc định giữ `"text"` để tương thích ngược 100%.
- **Phạm vi áp dụng toàn bộ `KVPair`:** Dùng được ở cả **4 tầng Variables** (`Collection`, `Global Env`, `Folder Global`, `Folder Env`) lẫn **Request `Params`, `PathParams`, `Headers`, `FormData`, `URLEncoded`** — ngoại trừ các header tự động sinh (`_isAuto`). Nút chuyển `Text ↔ Select` và popover chỉnh `options` phải thu gọn ở cuối ô Value để không làm phình bảng `KvpEditor.vue` / `EnvModal.vue`.
- **Cấu trúc `options`:** Mảng chuỗi thuần `string[]` hiển thị qua dropdown list.
- **Kế thừa 4 tầng trong `VariableHoverPopover.vue`:** `options` gắn theo từng dòng `KVPair` ở mỗi tầng (để `Dev` và `Prod` có thể khác tập lựa chọn). Khi người dùng ghi đè giá trị ở tầng chưa khai báo `options` (vd ghi xuống `Folder`), popover kế thừa danh sách `options` từ tầng gần nhất đang có để vẫn chọn bằng dropdown được.
- **Độ chặt & giá trị ngoài danh sách:**
  - Dropdown hỗ trợ chọn 1-click và có dòng **`+ Thêm lựa chọn...`** ở cuối để thêm nhanh option mới ngay tại chỗ mà không cần mở modal.
  - Giá trị ngoài `options` (do script `pm.*.set()` hoặc CLI `hecto` ghi) **không bị chặn hay nuốt mất** — vẫn hiển thị nguyên vẹn kèm nhãn `"(ngoài danh sách)"`.
  - Hỗ trợ `{{biến}}` lồng trong `options` vì `value` sau cùng vẫn là `string` đi qua bộ resolve 4 tầng bình thường.
- **Lưu trữ:** Chọn option lưu thẳng `value` (và `options` nếu thêm mới) vào file JSON trên đĩa (`collection.json`, `_folder.json`, `environments/*.json`, request JSON) để đồng nhất giữa Desktop UI, `API Flow` và CLI `hecto`.

## Các phương án đã loại bỏ & lý do
- **Option dạng `{ label, value }`:** Loại bỏ để giữ cấu trúc nhẹ nhàng; người dùng xác nhận chỉ cần `string[]` là đủ.
- **Chỉ áp dụng riêng cho 4 tầng Variables:** Loại bỏ vì Query Params, Path Params (`:param`), Headers và Body cũng thường xuyên có giá trị lặp lại cần chọn nhanh; chia sẻ chung `KVPair` giúp mô hình nhất quán.
- **Thanh Quick-Switch tách riêng trên Header hoặc chỉ sửa trong Modal:** Loại bỏ thanh ghim riêng để tránh rối giao diện; chỉ giữ chọn 1-click trong `VariableHoverPopover.vue` (khi hover `{{biến}}` / `:param`) và ngay trong bảng `KvpEditor.vue` / `EnvModal.vue`.
- **Dropdown khóa cứng hoàn toàn / Combobox gõ tự do:** Loại khóa cứng vì gây kẹt khi thiếu 1 option hoặc khi script/CLI ghi giá trị mới; loại combobox gõ tự do vì dễ lặp lại lỗi gõ nhầm.
- **Tách state chọn cục bộ ngoài JSON:** Loại bỏ để tránh lệch giữa Desktop UI, `API Flow` và CLI `hecto` (chấp nhận file JSON đổi trên Git khi thay đổi lựa chọn).

## Điểm bẫy kỹ thuật đã phát hiện (cần xử lý khi triển khai)
- `projects/service/git_merge.go`: `kvEqual` và `kvToMap` hiện chỉ xử lý 4 field (`Key`, `Value`, `Enabled`, `Description`) — phải cập nhật để tránh Git auto-merge làm mất `type` và `options`.
- `projects/frontend/src/components/VariableHoverPopover.vue`: `upsertVariable` hiện dựng lại object chỉ với 4 field — phải bảo toàn `type` và `options` khi lưu.
- `projects/frontend/src/components/environment/EnvModal.vue`: logic so sánh thay đổi trước khi save chỉ kiểm tra `key`, `value`, `enabled` — phải bổ sung `type` và `options`; đồng thời cân nhắc thống nhất dùng `KvpEditor.vue` hoặc đồng bộ tính năng sang bảng của `EnvModal.vue`.
- `projects/cmd/hecto/main.go`: `upsertKVPair` cần bảo toàn `type` và `options` khi cập nhật giá trị qua CLI.

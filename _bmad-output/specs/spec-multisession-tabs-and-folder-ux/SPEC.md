---
id: SPEC-multisession-tabs-and-folder-ux
companions:
  - multisession-tabs-and-folder-architecture.md
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Multisession Tabs Bar, Folder Sidebar Navigation & Folder Settings UX Fixes

## Why

Trong quá trình kiểm thử và cấu hình nhiều API trên cùng một Collection, người dùng hiện đang bị giới hạn bởi bốn điểm nghẽn trải nghiệm: (1) ứng dụng chỉ mở được duy nhất một Request hoặc một Folder tại một thời điểm, khiến việc đối chiếu giữa nhiều API hoặc vừa chỉnh sửa cấu hình thư mục vừa thử nghiệm Request làm mất trạng thái kết quả (`responseStore`) trước đó; (2) thao tác click chuột trái vào thư mục trên Sidebar để đóng/mở nhánh cây lại tự động chuyển màn hình chính sang `FolderEditor`, làm gián đoạn Request đang làm việc; (3) ô nhập liệu cột `Key` trong `KvpEditor.vue` đang bọc `VariableHighlighter` kèm class `text-transparent` khiến ký tự gõ vào bị ẩn; và (4) trong `FolderEditor.vue`, tab `Auth` (`AuthEditor.vue`) chưa tích hợp highlight/hover preview biến môi trường `{{variable}}` từ hệ thống phân cấp 4 tầng cũng như tự động ẩn lại ô nhập mật khẩu/token sau mỗi ký tự gõ. Giải quyết đồng bộ các vấn đề này mang lại trải nghiệm làm việc đa phiên (multisession) mượt mà, điều hướng cây thư mục tự nhiên và chỉnh sửa cấu hình thư mục chính xác.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể mở đồng thời nhiều tab Request và Folder trên thanh Tab Bar (`AppTabBar.vue`), chuyển đổi qua lại giữa các tab mà vẫn giữ nguyên trạng thái kết quả (`responseStore`) của từng Request tab, đóng tab bằng nút `✕`, click chuột giữa hoặc phím tắt `Ctrl+W`, và hệ thống tự động đồng bộ vòng đời tab với các thao tác trên Sidebar.
  - **success:** `tabStore` quản lý danh sách các tab đang mở (`tabs`) kèm `activeTabId`, `entityId`, `type` (`'request' | 'folder'`), `name`, `method`, và `isDirty`. Thanh `AppTabBar.vue` nằm trên đỉnh `ContentArea` hiển thị danh sách tab với badge HTTP Method (cho Request) hoặc icon thư mục (cho Folder), tên mục, chấm tròn hổ phách (`amber dot`) khi có thay đổi chưa lưu (`isDirty = true`), và nút đóng (`✕`). Mở một mục đã có tab sẽ kích hoạt lại tab đó thay vì tạo trùng; chuyển qua lại giữa các Request tab khôi phục đúng dữ liệu `responseStore` tương ứng của từng request; đóng tab qua nút `✕`, click chuột giữa (`auxclick`/`mousedown` button 1) hoặc `Ctrl+W` sẽ đóng tab và kích hoạt tab liền kề (hoặc hiển thị `EmptyStateRequest` khi không còn tab nào). Khi đổi tên hoặc đổi method, tab tự động cập nhật tức thì; khi xóa Request/Folder (bao gồm cả các tab con nằm trong thư mục bị xóa) hoặc chuyển đổi Collection, các tab liên quan tự động đóng an toàn.
- **CAP-2**
  - **intent:** Khi người dùng click chuột trái vào một thư mục trên cây Sidebar (`TreeNodeRow.vue`), hệ thống chỉ đóng/mở (toggle expand/collapse) danh sách con của thư mục đó mà không tự động mở `FolderEditor`.
  - **success:** Click chuột trái (hoặc nhấn phím `Enter`) vào hàng thư mục trong `TreeNodeRow.vue` chỉ gọi `collectionStore.toggleFolder(id)` để mở rộng hoặc thu gọn nhánh con trên Sidebar mà không thay đổi tab đang active trên `ContentArea`. Giao diện `FolderEditor` chỉ được mở khi người dùng chọn `"Cài đặt thư mục"` từ Context Menu (`TreeContextMenu.vue`) của thư mục đó (tạo hoặc kích hoạt tab Folder tương ứng) hoặc khi người dùng click chọn một tab Folder đang mở trên `AppTabBar.vue`.
- **CAP-3**
  - **intent:** Khi người dùng nhập liệu vào cột `Key` trong bảng `KvpEditor.vue`, văn bản gõ vào luôn hiển thị trực tiếp bằng màu chữ chuẩn mà không bị ẩn.
  - **success:** Trong `KvpEditor.vue`, ô `<input>` của cột `Key` tháo bỏ hoàn toàn `<VariableHighlighter>` và class `text-transparent`, sử dụng trực tiếp class `text-text-primary` (vì `Key` là tên biến/tên khóa, không cần highlight biến `{{...}}`). Mọi thao tác gõ phím (bao gồm cả gõ tiếng Việt IME và gõ vào dòng trống cuối bảng phantom row) ở cột `Key` trong `FolderEditor`, `RequestEditor`, `EnvModal` và `CollectionEnvModal` đều hiển thị rõ ràng tức thì, trong khi cột `Value` vẫn giữ nguyên `<VariableHighlighter>` để highlight và preview biến.
- **CAP-4**
  - **intent:** Khi người dùng cấu hình `Headers` hoặc `Auth` trong `FolderEditor.vue`, hệ thống cung cấp đầy đủ biến môi trường phân giải từ `Collection Env + Active Global Env + Folder cha + Folder hiện tại` để highlight trạng thái biến và hiển thị `VariableHoverPopover` chính xác, đồng thời giữ nguyên trạng thái hiển thị văn bản khi nhập liệu trong `AuthEditor.vue`.
  - **success:** Trong `FolderEditor.vue`, cả tab `Headers` (cột `Value` của `KvpEditor` và bảng `DefaultHeadersTable` kế thừa từ thư mục cha) và tab `Auth` (`AuthEditor.vue` trên các trường Bearer Token, Basic Username/Password, API Key Value) đều nhận đầy đủ ngữ cảnh biến môi trường 4 tầng thông qua `effectiveVariables` và `variableHierarchyFolders` để highlight đúng màu (`text-variable-valid` / `text-variable-missing`) và mở được `VariableHoverPopover` khi di chuột vào `{{variable}}`. Trong `AuthEditor.vue`, khi người dùng bật hiện mật khẩu/token (nút con mắt) hoặc nhập biến `{{...}}`, việc gõ từng ký tự không làm reset trạng thái hiển thị về `type="password"`.

## Constraints

- **Quy tắc an toàn dữ liệu khi test (Mục 19):** Trong suốt quá trình viết và chạy kiểm thử (Unit test, Vitest, Go test, E2E smoke test), mọi thao tác kiểm thử liên quan đến Collection chỉ được phép tạo và thực thi trên collection mang tên `Test-Collection` hoặc thư mục tạm thời độc lập (`t.TempDir()`). Nghiêm cấm tuyệt đối đọc, sửa hoặc xóa dữ liệu thật của người dùng (như collection `default` hoặc các collection hiện có). Mọi collection tạm tạo ra khi test phải được tự động xóa sạch ngay sau khi kết thúc kịch bản.
- Không tạo hai tab trùng nhau cho cùng một thực thể `(type, entityId)` trong cùng một Collection; chọn lại một Request từ Sidebar hoặc chọn lại `"Cài đặt thư mục"` cho thư mục đã có tab phải focus vào tab hiện có.
- Khi chuyển giữa các tab hoặc đóng một tab đang có thay đổi chưa lưu (`isDirty = true`), phải đảm bảo cơ chế auto-save/flush hiện có được thực thi an toàn trước khi hủy/chuyển ngữ cảnh để không làm mất dữ liệu đang soạn thảo.
- Phím tắt `Ctrl+W` (và `Cmd+W` trên macOS) phải gọi `e.preventDefault()` để ngăn hành vi mặc định đóng cửa sổ ứng dụng Wails/trình duyệt, chỉ đóng tab đang active trên `AppTabBar`.
- Tuân thủ thứ tự ưu tiên phân giải biến 4 cấp độ đã thiết lập: `Collection Env -> Active Global Env -> Folder Global Env (Root..Leaf) -> Folder-Env (Active, Root..Leaf)`.

## Non-goals

- Không hỗ trợ chia đôi màn hình để xem hai Request Editor song song (split-view editors) trong phạm vi Spec này — mỗi thời điểm chỉ có một `activeTabId` hiển thị trong `ContentArea`.
- Không hỗ trợ kéo thả sắp xếp lại thứ tự các tab (drag-and-drop tab reordering) hoặc tách tab ra cửa sổ rời.
- Không thay đổi cấu trúc lưu trữ tệp JSON của Request hay `_folder.json` trên Go backend.

## Success signal

- Người dùng mở 3 Request (`GET Users`, `POST Login`, `DELETE Session`) và 1 cấu hình thư mục (`Cài đặt thư mục -> Auth Module`): thanh `AppTabBar` hiển thị đủ 4 tab với đúng badge method và icon folder; gửi request ở tab `GET Users` nhận kết quả `200 OK`, chuyển sang tab `Auth Module` sửa biến rồi quay lại tab `GET Users` thấy kết quả `200 OK` vẫn còn nguyên; nhấn `Ctrl+W` hoặc click chuột giữa đóng tab hiện tại và tự động chuyển sang tab kế bên.
- Người dùng click chuột trái liên tiếp vào các thư mục trên Sidebar thấy thư mục chỉ mở rộng/thu gọn danh sách con, không tự động nhảy sang màn hình `FolderEditor`; chỉ khi mở menu chuột phải chọn `"Cài đặt thư mục"` thì tab Folder mới mở ra.
- Người dùng vào `FolderEditor` (hoặc `RequestEditor`), gõ tên khóa vào cột `Key` trong tab `Headers` và `Variables` thấy chữ hiển thị rõ ràng ngay lập tức; chuyển sang tab `Auth` của `FolderEditor`, nhập `{{bearer_token}}` vào ô Token thấy biến được tô màu xanh/đỏ theo đúng biến của `Collection Env / Active Global Env / Folder cha` và di chuột vào hiện popover xem/sửa giá trị biến.
- 100% bài kiểm thử backend (`go test ./...`) và frontend (`bun run type-check`, `bun run test`) vượt qua an toàn tuyệt đối.

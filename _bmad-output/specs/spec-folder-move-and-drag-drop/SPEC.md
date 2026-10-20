---
id: SPEC-folder-move-and-drag-drop
companions:
  - folder-move-and-dnd-architecture.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Di chuyển Folder và Kéo thả (Drag & Drop) trong Sidebar Collection Tree

## Why

Hiện tại người dùng chỉ có thể di chuyển từng Request riêng lẻ thông qua Context Menu ("Di chuyển tới ▸"), nhưng chưa thể di chuyển cả một Folder (cùng toàn bộ cây thư mục con và request bên trong) sang vị trí khác hoặc kéo thả trực tiếp trên Sidebar Collection Tree. Khi cấu trúc API lớn dần, việc tái tổ chức các nhóm endpoint đòi hỏi phải tạo lại thư mục và chuyển từng request thủ công. Bổ sung khả năng di chuyển Folder ở cả Backend lẫn Context Menu kết hợp với kéo thả trực quan (HTML5 Drag & Drop) cho cả Request và Folder giúp người dùng tổ chức lại cấu trúc Collection nhanh chóng, tự nhiên và an toàn.

## Capabilities

- **CAP-1**
  - **intent:** Hệ thống cung cấp API/Binding `MoveFolder(folderId, targetFolderId)` ở tầng Backend để di chuyển toàn bộ thư mục vật lý (cùng các thư mục con và request bên trong) sang thư mục đích hoặc về gốc Collection (`targetFolderId == ""`), đồng thời cập nhật đồng bộ chỉ mục đường dẫn trong bộ nhớ và kiểm tra chặt chẽ các điều kiện biên.
  - **success:** Khi gọi `MoveFolder`, thư mục vật lý được di chuyển tới đúng vị trí đích trên ổ đĩa; toàn bộ UUID của thư mục và các phần tử con/cháu bên trong được cập nhật đường dẫn mới trong `FileSystem` index; hệ thống từ chối với lỗi `VALIDATION_ERROR` nếu di chuyển thư mục vào chính nó hoặc vào bất kỳ thư mục con/cháu nào của nó (cycle detection), xử lý an toàn trường hợp trùng tên tại đích, và ghi nhận lịch sử thay đổi (changelog).
- **CAP-2**
  - **intent:** Pinia `collectionStore` hỗ trợ hành động `moveFolder(id, targetFolderId)` và các hàm kiểm tra tính hợp lệ của điểm đích để đồng bộ trạng thái cây thư mục và tự động mở rộng đường dẫn thư mục đích sau khi di chuyển.
  - **success:** Sau khi `moveFolder` hoặc `moveRequest` thành công, cây thư mục được tải lại (`loadTree`), thông báo toast `"Đã di chuyển"` hiển thị, và toàn bộ các thư mục tổ tiên dẫn tới `targetFolderId` được thêm vào `expandedFolders` để người dùng thấy ngay phần tử vừa chuyển.
- **CAP-3**
  - **intent:** Người dùng có thể di chuyển một Folder bất kỳ sang Folder khác hoặc về Gốc Collection thông qua submenu `"Di chuyển tới ▸"` trong Context Menu của Folder.
  - **success:** Khi mở Context Menu trên một Folder, mục `"Di chuyển tới ▸"` hiển thị tùy chọn `"Gốc collection"` cùng danh sách các Folder hợp lệ (đã tự động loại bỏ chính Folder đang chọn và toàn bộ các Folder con/cháu của nó); chọn một điểm đích sẽ gọi `collectionStore.moveFolder` và đóng menu.
- **CAP-4**
  - **intent:** Người dùng có thể kéo thả (HTML5 Drag & Drop) trực tiếp cả Request lẫn Folder trên `TreeNodeRow.vue` và `AppSidebar.vue` để di chuyển vào một Folder khác hoặc đưa về Gốc Collection với phản hồi thị giác rõ ràng.
  - **success:** Khi kéo một Request hoặc Folder qua một Folder đích hợp lệ, dòng Folder đích được highlight (`data-drop-target="valid"`); khi kéo qua vùng thả Gốc Collection (`AppSidebar.vue`), vùng thả gốc được highlight (`data-root-drop-active="true"`); hệ thống chặn ngay trên UI không cho phép thả Folder vào chính nó, vào Folder con/cháu của nó, hoặc vào chính Folder cha hiện tại.
- **CAP-5**
  - **intent:** Toàn bộ logic di chuyển Folder và tương tác kéo thả được bảo vệ bởi bộ kiểm thử tự động ở cả Backend Go và Frontend Vue/TypeScript.
  - **success:** Unit tests trong `projects/service/collection_test.go` bao phủ đầy đủ các kịch bản root move, nested move, cycle check, collision handling và index prefix update; Vitest tests (`TreeNodeRow.test.ts`, `AppSidebar.test.ts`) và `bun run type-check` (`vue-tsc`) vượt qua 100%.

## Constraints

- Lưu trữ hoàn toàn dựa trên hệ thống tệp tin vật lý (JSON/thư mục trên đĩa); khi di chuyển Folder phải bảo toàn nguyên vẹn toàn bộ `_folder.json`, các thư mục con và các file request `.json` bên trong.
- Bắt buộc chặn chu trình (cycle detection) ở cả hai tầng: tại UI (ẩn khỏi danh sách submenu `"Di chuyển tới ▸"` và chặn drop khi kéo thả) và tại Backend Go (`MoveFolder` kiểm tra quan hệ cha-con/cháu bằng đường dẫn thực tế trước khi thực hiện `os.Rename`).
- Cấm di chuyển bất kỳ Folder hay Request nào vào thư mục hệ thống (`environments/`, `.git/`, `.history/`) hoặc ra ngoài phạm vi `collectionRoot`.
- Vô hiệu hóa thuộc tính `draggable` trên `TreeNodeRow.vue` khi dòng đó đang ở chế độ đổi tên trực tiếp (`isEditing === true`) để không cản trở thao tác chọn văn bản trong ô `<input>`.
- Toàn bộ Wails bindings trong `App` phải trả về `model.Result` theo chuẩn kiến trúc AD-2/AD-5 của dự án, đảm bảo tương thích đồng nhất với `MoveRequest` và cơ chế xử lý lỗi của frontend.
- Sử dụng `bun` (với Node 24 qua `nvm`) cho mọi lệnh kiểm thử và kiểm tra kiểu ở frontend; sử dụng Go 1.25.0 cho backend.

## Non-goals

- Không hỗ trợ kéo thả để sắp xếp lại thứ tự tùy ý (manual custom ordering) giữa các phần tử cùng cấp — cây thư mục vẫn duy trì quy tắc sắp xếp chuẩn của hệ thống (Folder trước Request, theo thứ tự bảng chữ cái tên hiển thị).
- Không hỗ trợ kéo thả phần tử xuyên qua hai Collection khác nhau trong cùng một thao tác.
- Không hỗ trợ chọn nhiều phần tử cùng lúc (multi-select drag & drop).

## Success signal

- Người dùng có thể kéo một Folder chứa nhiều Request và thư mục con thả vào một Folder khác hoặc thả về vùng gốc Collection (hoặc chọn từ menu chuột phải `"Di chuyển tới ▸"`): thư mục đích lập tức được highlight khi rê chuột qua, tự động mở rộng sau khi thả, cấu trúc thư mục trên ổ đĩa và chỉ mục UUID được cập nhật tức thì mà không làm mất dữ liệu hay gây lỗi chu trình khi cố kéo thư mục cha vào thư mục con của nó. Toàn bộ `go test ./...`, `bun run test` và `bun run type-check` đều pass 100%.

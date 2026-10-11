# Sprint Change Proposal

## 1. Issue Summary
Dựa trên phản hồi từ file `improve.md`, chúng ta cần điều chỉnh 3 vấn đề trong quá trình phát triển sprint:
1. **Quản lý biến môi trường (Environment) ở cấp Thư mục (Folder):** Hỗ trợ set biến môi trường cho folder (áp dụng chung hoặc theo môi trường active) để các request con kế thừa. Import từ Postman cũng cần hỗ trợ tính năng này.
2. **Bug UI KVP Editor:** Ô input nhập value của header bị nhỏ và lệch.
3. **Kiến trúc lưu trữ:** User đã hỏi về việc sử dụng UUID làm tên file cho request/folder (Item 11). Tuy nhiên, sau khi thảo luận, user quyết định GIỮ NGUYÊN cấu trúc hiện tại (dùng slug) để đảm bảo readability trên git và file explorer. Yêu cầu note lại trong spec quyết định này.

## 2. Impact Analysis
- **Epic 1 & 2 (Architecture & Storage):** Không thay đổi quy tắc đặt tên file. Vẫn tiếp tục dùng Slug generation. Bổ sung ghi chú vào spec lý do tại sao giữ slug (để dễ đọc trên Git/File explorer) mặc dù UUID là identity thực sự.
- **Epic 2 & 4 (Collection & Environment):** File `_folder.json` cần bổ sung schema để lưu trữ biến môi trường (global và theo env). UI cần thêm view để chỉnh sửa Folder Settings (quản lý biến của folder).
- **Epic 3 (Request Execution):** Thuật toán Variable Substitution (thay thế biến) cần đệ quy từ dưới lên: Request -> Folder cha -> ... -> Collection/Môi trường active. Bug UI của KVP Editor cần được fix CSS.
- **Epic 5 (Postman Import):** Logic import cần parse thêm mảng `variable` của folder từ file export Postman.
- **Artifacts bị ảnh hưởng:** PRD (thêm FR), Epics (cập nhật Story 2.7, 3.2, 3.4, 5.1), Architecture (cập nhật schema và thuật toán).

## 3. Recommended Approach
**Đề xuất: Direct Adjustment (Điều chỉnh trực tiếp trên Epic hiện tại)**

1. **Folder Environments:** 
   - Thêm tính năng cấu hình biến cho Folder.
   - Khi resolve biến `{{key}}`, hệ thống sẽ tìm kiếm theo thứ tự ưu tiên: 1. Active Environment -> 2. Thư mục cha trực tiếp -> 3. Các thư mục cha cao hơn.
   - Thêm Context Menu "Cài đặt thư mục" (Folder Settings) để mở giao diện quản lý biến của folder trên màn hình chính (Editor pane).
2. **Giữ nguyên Slug Filenames (REJECTED UUID FILENAMES):** 
   - Giữ nguyên logic sinh slug. Tên hiển thị trên disk sẽ là slug. UUID chỉ được dùng ngầm làm identity. Quyết định này được note rõ trong PRD và Architecture.
3. **Fix UI KVP Editor:**
   - Điều chỉnh CSS (flexbox, padding, min-width) cho component `KVPEditor.vue` để đảm bảo input của Value lớn hơn, linh hoạt (flex-1) và thẳng hàng với Key.

**Đánh giá:** Effort (Medium), Risk (Low). MVP scope được mở rộng một chút nhưng mang lại giá trị thực tiễn cao cho việc tổ chức request phức tạp.

## 4. Detailed Change Proposals

### Proposal 1: Quản lý Biến môi trường cấp Folder (Folder Environments)
**Tác động:** PRD, Architecture, Epic 2, 4, 5.
**Thay đổi chi tiết:**
- **PRD:** Thêm **FR-14: Quản lý biến môi trường cấp Folder**.
- **Architecture:** Bổ sung vào `_folder.json` trường `variables`. Thuật toán parse biến cập nhật thành đệ quy.
- **Epics:** 
  - **Story 2.7 (Context Menu):** Thêm action "Cài đặt thư mục".
  - **Story 3.4 (Executor):** Giải quyết biến thư mục cha.
  - **Story 5.1 (Postman Import):** Import `variable` folder.

### Proposal 2: Cập nhật Note về File Naming (Slug thay vì UUID)
**Tác động:** PRD, Architecture, Epic 1.
**Thay đổi chi tiết:**
- **PRD:** Bổ sung vào FR-8 ghi chú: "Quyết định giữ nguyên slug thay vì UUID để tối ưu tính dễ đọc (readability) khi xem trên file explorer và git diff."
- **Architecture:** Bổ sung ghi chú vào phần 2.6 Slug Generation giải thích quyết định tương tự.
- **Epics:** Bổ sung ghi chú vào Story 1.6: "(Note: Using slug instead of UUID for filenames to maximize readability)".

### Proposal 3: Sửa lỗi UI KVP Editor
**Tác động:** Epic 3 (Story 3.2).
**Thay đổi chi tiết:**
- **Epics:** Cập nhật **Story 3.2**. Sửa Acceptance Criteria để flexbox hiển thị đúng tỷ lệ.

## 5. Implementation Handoff
- **Scope:** Moderate.
- **Handoff:** 
  - Đội ngũ Planning (Bmad) đã cập nhật PRD, Architecture và Epics sau khi User phê duyệt lại.
  - Developer Agent sẽ thực hiện implement các thay đổi này trong các Story tương ứng của Sprint.

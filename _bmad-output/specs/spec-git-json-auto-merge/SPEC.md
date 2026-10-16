---
id: SPEC-git-json-auto-merge
companions:
  - git-merge-architecture.md
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Cơ chế 3-Way JSON Auto-Merge & Visual Conflict Resolver cho Git Sync trong hecto-api

## Why

Trong `hecto-api`, toàn bộ dữ liệu được lưu trữ dạng file JSON trên ổ đĩa (`<uuid>.json` cho request, `_folder.json` cho folder, `collection.json` cho metadata collection, và `environments/<id>.json` cho biến môi trường). Hiện tại `GitSyncService` đã hỗ trợ Git Pull / Push theo từng collection, nhưng khi hai máy cùng chỉnh sửa một file JSON, Git chuẩn so khớp theo từng dòng văn bản và dễ rơi vào trạng thái Merge Conflict, buộc người dùng phải mở terminal xử lý bằng Git CLI. Việc bổ sung cơ chế **3-Way JSON Auto-Merge** ở tầng Go Backend kết hợp giao diện **Visual Conflict Resolver** trực quan ở Vue 3 Frontend giúp tự động gộp >95% các thay đổi không trùng trường dữ liệu (kể cả các trường con bên trong JSON payload của Request), đồng thời cho phép người dùng giải quyết các xung đột giá trị còn lại bằng vài cú click ngay trong ứng dụng mà vẫn giữ nguyên triết lý `File = Truth`.

## Capabilities

- **CAP-1**
  - **intent:** Khi thao tác đồng bộ Git (`Pull`, `StashAndPull`, hoặc `Push` auto-merge) phát hiện xung đột trên các file `.json` của Collection, hệ thống tự động trích xuất đúng 3 phiên bản (`BASE`, `OURS / LOCAL`, `THEIRS / REMOTE`) từ Git index và gộp tự động các thay đổi không trùng trường dữ liệu, không trùng khóa `KVPair`, hoặc không trùng trường con bên trong `body.content` dạng JSON.
  - **success:** Bộ máy 3-Way Merge đọc dữ liệu 3 mốc từ Git index (với `git pull`/`git merge`: `:1:` là `BASE`, `:2:` là `OURS`, `:3:` là `THEIRS`; với xung đột phát sinh từ `git stash pop` không có `MERGE_HEAD`: tự động đảo `:3:` là `OURS / Local` và `:2:` là `THEIRS / Remote`) và thực thi thuật toán gộp cấp trường cho `model.Request` (`<uuid>.json`), `model.Folder` (`_folder.json`), `model.Environment` (`environments/*.json`), và `model.Collection` (`collection.json`). Các trường vô hướng/đối tượng khác nhau (ví dụ Local đổi `url`, Remote đổi `method`), các trường con không trùng nhau bên trong `body.content` (khi `body.type == "json"` và parse được thành JSON Object), và các phần tử `KVPair` (`headers`, `params`, `path_params`, `variables`, `form_data`, `urlencoded`) so khớp theo cặp `(Key, occurrenceIndex)` không xung đột được tự động gộp vào bản ghi hợp nhất (bảo toàn cả các dòng trùng `Key` hoặc dòng có `enabled: false`). Nếu tất cả các trường trong một file đều gộp tự động thành công, hệ thống ghi đè file JSON hợp lệ xuống đĩa, chạy `git add -- <file>`, và tự động hoàn tất merge commit (`git commit --no-edit`) kèm `IndexRebuild` nếu toàn bộ các file conflict trong Collection đã được giải quyết.
- **CAP-2**
  - **intent:** Khi hai phiên bản `OURS` và `THEIRS` cùng chỉnh sửa một trường dữ liệu, một trường con trong JSON body, hoặc cùng một phần tử `(Key, occurrenceIndex)` trong danh sách `KVPair` thành hai giá trị khác nhau so với `BASE`, hoặc khi một phía xoá file và phía kia sửa file (Delete vs. Edit conflict), hệ thống nhận diện chính xác danh sách xung đột kèm giá trị 3 mốc và trả về cho Frontend.
  - **success:** Khi còn xung đột không thể tự động gộp, backend trả về `model.Result` với mã lỗi `GIT_CONFLICT` và đính kèm danh sách `conflicts` (`[]model.GitFileConflict`) trong `model.GitSyncStatus`. Mỗi phần tử `GitFileConflict` chứa đường dẫn tương đối `file_path`, loại thực thể (`request`, `folder`, `environment`, `collection`), tên hiển thị `entity_name`, phân loại xung đột (`field_conflict`, `delete_edit`, `edit_delete`), bản nháp JSON đã gộp sẵn các trường không xung đột (`merged_preview`), dữ liệu đầy đủ của `ours_data` / `theirs_data`, và danh sách các trường bị xung đột (`[]model.GitFieldConflict` gồm `field_path`, `label`, `base_value`, `ours_value`, `theirs_value`).
- **CAP-3**
  - **intent:** Người dùng có thể xem so sánh trực quan 2 cột (**"Bản của bạn (Local)"** vs **"Bản từ xa (Remote)"**) trên giao diện, theo dõi tiến độ giải quyết từng file/trường, và chọn giá trị mong muốn bằng 1 cú click cho từng trường riêng lẻ, cho toàn bộ một file, hoặc cho toàn bộ các file đang xung đột.
  - **success:** Khi backend trả về mã lỗi `GIT_CONFLICT` có dữ liệu xung đột hoặc khi người dùng bấm mở từ `GitSyncModal.vue`, giao diện `GitConflictResolverModal.vue` hiển thị danh sách các file bị xung đột kèm tiến độ giải quyết (`Đã xử lý X/Y file`) và khung so sánh Diff 2 cột (**"Bản của bạn (Local)"** vs **"Bản từ xa (Remote)"**). Người dùng có thể bấm 1 click để: (1) *Chọn toàn bộ bản Local* hoặc *Chọn toàn bộ bản Remote* cho file đang xem (hoặc cho tất cả các file), (2) *Chọn từng trường riêng lẻ (Field-by-field pick)* giữa Local và Remote, hoặc (3) chọn *Giữ lại file (Bản sửa)* hay *Xác nhận xoá file* đối với xung đột Delete vs. Edit. Nút **"Xác nhận & Hoàn tất Đồng bộ"** chỉ được kích hoạt khi toàn bộ các trường/file xung đột đã được người dùng chủ động lựa chọn, tránh vô tình ghi đè dữ liệu khi chưa xem hết các file.
- **CAP-4**
  - **intent:** Hệ thống tự động lưu (flush) các thay đổi đang soạn thảo dở trên UI xuống đĩa trước khi đồng bộ Git, đồng thời cho phép người dùng xác nhận lưu kết quả giải quyết xung đột để hoàn tất đồng bộ hoặc huỷ bỏ quá trình merge để quay lại trạng thái ban đầu trước khi Pull.
  - **success:** Trước khi gọi `GitPullCollection`, `GitStashAndPullCollection` hoặc `GitPushCollection`, Frontend tự động gọi `requestStore.flush()` và `tabStore.flushActiveFolderIfNeeded()` nếu có tab đang `isDirty`. Backend cung cấp Wails binding `ResolveGitConflict(collectionID string, resolvedFiles map[string]interface{}) model.Result` và `AbortGitMerge(collectionID string) model.Result`. Khi người dùng bấm **"Xác nhận & Hoàn tất Đồng bộ"**, Frontend gửi kết quả các file đã chọn xuống `ResolveGitConflict`: backend ghi file JSON đã hợp nhất (hoặc thực thi `git rm` với file được chọn xoá), chạy `git add`, tạo merge commit hoàn tất (dọn dẹp stash tạm nếu xung đột từ `StashAndPull`), rebuild index và làm mới toàn bộ cây thư mục, danh sách biến môi trường cũng như Request đang mở trên UI. Khi người dùng bấm **"Huỷ merge"**, Frontend gọi `AbortGitMerge` thực thi `git merge --abort` (hoặc khôi phục đúng trạng thái từ stash nếu xung đột từ `StashAndPull`), rebuild index và đưa Collection về trạng thái an toàn trước khi Pull.

## Constraints

- **Giữ vững triết lý File = Truth:** Mọi kết quả gộp tự động (3-Way Auto-Merge) lẫn gộp thủ công (Manual Resolve) đều phải được ghi trực tiếp thành file JSON định dạng chuẩn trên ổ đĩa (`2 spaces indent`), giữ nguyên cấu trúc thư mục Collection và tương thích 100% với Git CLI chuẩn.
- **Đảm bảo hiệu năng (< 50ms/file):** Thuật toán phân tích và gộp 3-Way JSON Merge trên Go backend phải hoàn tất trong thời gian dưới `50ms/file` cho các file JSON của Request, Folder, Environment và Collection.
- **Bảo mật thực thi Git & Chống Path Traversal:** Mọi lệnh Git chỉ được gọi qua `exec.CommandContext` với mảng đối số tách biệt (tuyệt đối không chạy qua shell `sh -c`). Mọi đường dẫn file truyền vào `ResolveGitConflict` phải được chuẩn hóa và kiểm tra nằm gọn bên trong thư mục của Collection (không chứa `..`, không phải đường dẫn tuyệt đối, không tác động vào thư mục `.git`).
- **Quy tắc an toàn dữ liệu khi test (Mục 19):** Mọi kiểm thử tự động (Go unit/integration test và Vitest test) chỉ được phép tạo và thao tác trên `Test-Collection` hoặc thư mục tạm độc lập (`t.TempDir()`), tuyệt đối không đọc, ghi, sửa, xóa trên dữ liệu thật của người dùng.

## Non-goals

- Không sử dụng kiến trúc Master-Worker hay chuyển đổi định dạng lưu trữ sang streaming JSONL.
- Không xây dựng bộ soạn thảo văn bản tự do kiểu IDE (free-form raw text conflict marker editor) cho các file ngoài phạm vi JSON cấu trúc của `hecto-api`.

## Success signal

- Khi hai máy cùng chỉnh sửa một file request `<uuid>.json` ở các trường khác nhau (ví dụ: máy Local sửa `url`, thêm header `X-Request-ID`, sửa trường `"page": 2` trong JSON body; máy Remote sửa `method`, thêm header `Accept-Language`, sửa trường `"limit": 50` trong cùng JSON body), thao tác `Git Pull` tự động gộp đầy đủ cả hai phía vào file JSON trên đĩa, tự tạo merge commit và làm mới UI mà không hiển thị hộp thoại báo lỗi xung đột.
- Khi hai máy cùng sửa một trường scalar (ví dụ cùng sửa `url` thành hai giá trị khác nhau) hoặc khi một máy xoá request còn máy kia sửa request, `GitConflictResolverModal.vue` bật lên hiển thị rõ 2 cột **"Bản của bạn (Local)"** vs **"Bản từ xa (Remote)"** (đúng chiều kể cả khi chạy qua `StashAndPull`); người dùng chọn đủ phương án cho các trường/file xung đột rồi bấm **"Xác nhận & Hoàn tất Đồng bộ"**, hệ thống lưu file JSON, hoàn tất merge commit và cập nhật giao diện tức thì (hoặc bấm **"Huỷ merge"** để rollback an toàn về trạng thái trước khi Pull).
- Bài đo hiệu năng xác nhận bước 3-Way JSON Merge đạt dưới `50ms/file` trên Go backend, và 100% bài kiểm thử (`go test ./...`, `bun run type-check`, `bun run test`) vượt qua.

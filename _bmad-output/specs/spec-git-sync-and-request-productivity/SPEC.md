---
id: SPEC-git-sync-and-request-productivity
companions:
  - git-sync-and-request-productivity-architecture.md
sources:
  - ../../../improve.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Collection Git Sync & Request Productivity (cURL Paste/Preview, Custom Method, Inline Body Type, Undo/Redo)

## Why

Trong quá trình làm việc nhóm và thao tác kiểm thử API hàng ngày, người dùng đang gặp sáu khoảng trống về hiệu suất và khả năng cộng tác: (1) chưa có cơ chế đồng bộ trực tiếp thư mục Collection với Git Remote repository (HTTPS/SSH) qua nút `Git Pull` / `Git Push` trên giao diện kèm cảnh báo rõ ràng khi xảy ra xung đột (conflict); (2) khi có sẵn lệnh `curl` từ tài liệu hoặc DevTools, người dùng chưa thể dán trực tiếp vào thanh URL Bar để tự động tách thành Method, URL, Params, Headers, Auth và Body; (3) chưa có tab `cURL` riêng biệt trong Request Editor để xem trước câu lệnh cURL đa dòng đã phân giải đầy đủ biến môi trường; (4) thanh chọn Method hiện chỉ cố định 5 phương thức cơ bản (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), chưa cho phép chọn `HEAD`, `OPTIONS` hoặc nhập Custom HTTP Method (`PURGE`, `PROPFIND`,...); (5) bộ chọn loại Body đang nằm trên một dòng riêng bên trong tab Body làm tốn diện tích dọc của khung soạn thảo; và (6) phím tắt `Ctrl+Z` (Undo) trên các ô `<input>` và `<textarea>` hoạt động không ổn định trên môi trường WebKit/Vue controlled inputs. Giải quyết đồng bộ 6 năng lực này giúp hoàn thiện quy trình cộng tác qua Git và tăng tốc tối đa thao tác soạn thảo Request.

## Capabilities

- **CAP-1**
  - **intent:** Người dùng có thể cấu hình Git Remote URL (`HTTPS` hoặc `SSH`) riêng cho từng Collection và thực hiện đồng bộ `Git Pull` / `Git Push` trực tiếp từ giao diện, gọi Go backend thực thi lệnh `git pull` / `git push` trong thư mục của Collection đó và nhận thông báo lỗi rõ ràng nếu xảy ra xung đột (conflict) để tự xử lý tay.
  - **success:** `model.Collection` lưu trữ trường `git_remote_url` trong `collection.json`. Go backend cung cấp `GitSyncService` và các Wails bindings `SaveCollectionGitRemote(collectionID, remoteURL string)`, `GetCollectionGitStatus(collectionID string)`, `GitPullCollection(collectionID string)`, `GitPushCollection(collectionID string)`. Khi cấu hình Remote URL hoặc thực hiện Pull/Push, nếu thư mục Collection chưa có `.git` thì tự động `git init` và gán remote `origin`. Nút `Git Pull` thực thi `git pull` trong thư mục Collection, tự động rebuild index và làm mới cây thư mục + biến môi trường trên UI khi thành công; nếu xảy ra xung đột (`CONFLICT` / `Automatic merge failed` / unmerged paths), trả về mã lỗi `GIT_CONFLICT` kèm danh sách file xung đột và hướng dẫn người dùng xử lý tay. Nút `Git Push` tự động stage (`git add -A`), tạo commit nếu có thay đổi chưa commit, và đẩy lên remote (`git push -u origin HEAD`); nếu bị từ chối hoặc xung đột thì trả về thông báo lỗi rõ ràng. Giao diện Sidebar cung cấp modal cấu hình Git Remote URL và các nút thao tác nhanh `Git Pull` / `Git Push`.
- **CAP-2**
  - **intent:** Khi người dùng dán (paste) một chuỗi lệnh `curl ...` vào ô nhập URL (`UrlBar.vue`), hệ thống tự động phân tích (parse) câu lệnh cURL thành HTTP Method, URL, Query Params, Headers, Auth (Basic `-u` hoặc Bearer token) và Body trên Request đang mở (Mục 35).
  - **success:** Hàm `isCurlCommand(text)` và `parseCurlCommand(text)` trong `projects/frontend/src/utils/curl.ts` phân tích chính xác lệnh cURL một dòng hoặc nhiều dòng (có dấu `\`), hỗ trợ các cờ `-X`/`--request`, `-H`/`--header`, `-d`/`--data`/`--data-raw`/`--data-binary`/`--data-urlencode`, `-u`/`--user` (chuyển thành Basic Auth), `-G`/`--get`, `--url`, và tự động suy luận `POST` khi có dữ liệu body mà không khai báo `-X`. Khi dán lệnh cURL vào `#url-input` trong `UrlBar.vue`, sự kiện paste mặc định bị chặn (`e.preventDefault()`) và toàn bộ trường `method`, `url`, `params`, `headers`, `body`, `auth` của `requestStore.current` được cập nhật tức thì kèm thông báo toast `"Đã phân tích lệnh cURL"`.
- **CAP-3**
  - **intent:** Người dùng có thể chuyển sang tab `cURL` trên thanh `RequestTabs.vue` để xem trước (preview) câu lệnh cURL đa dòng hoàn chỉnh đã phân giải toàn bộ biến môi trường 4 tầng, kế thừa Headers/Auth từ Folder cha, và sao chép nhanh vào clipboard (Mục 33).
  - **success:** Thanh `RequestTabs.vue` có thêm tab `cURL` (`id: 'curl'`). Khi chọn tab `cURL`, `RequestEditor.vue` hiển thị khung xem trước câu lệnh cURL đa dòng (`multiline: true`) được tính toán reactive từ `generateCurlCommand` với đầy đủ `effectiveVariables` (4 tầng: Collection -> Active Global Env -> Folder Global -> Folder Active Env) và `pathNodes`, kèm nút `"Sao chép"` (Copy) có phản hồi trạng thái.
- **CAP-4**
  - **intent:** Người dùng có thể chọn các HTTP Method mở rộng (`HEAD`, `OPTIONS`) hoặc tự nhập bất kỳ Custom HTTP Method nào (như `PURGE`, `PROPFIND`, `LINK`, `UNLINK`,...) ngay trong menu chọn Method của `UrlBar.vue` (Mục 27).
  - **success:** Dropdown chọn Method trong `UrlBar.vue` bổ sung `HEAD`, `OPTIONS` vào danh sách chọn nhanh và cung cấp một ô nhập `"Custom method..."` kèm nút áp dụng (hoặc nhấn `Enter`). Method tùy chỉnh được chuẩn hóa thành chữ in hoa (`UPPERCASE`), kiểm tra tính hợp lệ (chỉ gồm các ký tự token HTTP chuẩn), gán vào `req.method` và hiển thị đồng bộ trên `UrlBar.vue`, `AppTabBar.vue` cũng như `TreeNodeRow.vue`.
- **CAP-5**
  - **intent:** Bộ chọn loại Body (`Body Type` dropdown) được đặt nằm ở phía bên phải cùng hàng với các tab `Params`, `Auth`, `Headers`, `Body`, `cURL` trên `RequestTabs.vue` để tiết kiệm chiều cao cho vùng soạn thảo Body (Mục 24).
  - **success:** Trong `RequestTabs.vue`, hiển thị dropdown chọn loại Body (`None`, `JSON`, `Text`) ở góc phải cùng hàng tab (`data-test="body-type-select"`). Khi người dùng chọn một loại Body từ dropdown này, `requestStore.setBodyType(type)` được gọi (đồng thời tự động kích hoạt tab `Body` nếu đang ở tab khác). Thanh chọn radio chiếm diện tích riêng phía trên `BodyEditor.vue` được gỡ bỏ để khung soạn thảo Body mở rộng tối đa chiều cao.
- **CAP-6**
  - **intent:** Người dùng có thể nhấn `Ctrl+Z` (hoặc `Cmd+Z`) để hoàn tác (Undo) và `Ctrl+Y` / `Ctrl+Shift+Z` (hoặc `Cmd+Shift+Z`) để làm lại (Redo) các thao tác nhập liệu trên mọi ô `<input>` và `<textarea>` trong ứng dụng (Mục 23).
  - **success:** Hệ thống quản lý lịch sử Undo/Redo (`projects/frontend/src/utils/inputUndo.ts` được gắn kết ở cấp ứng dụng `App.vue` và các trình soạn thảo) theo dõi lịch sử thay đổi giá trị và vị trí con trỏ (`selectionStart`, `selectionEnd`) cho từng phần tử `<input>` và `<textarea>`. Khi nhấn `Ctrl+Z` (Undo) hoặc `Ctrl+Y` / `Ctrl+Shift+Z` (Redo) trong bất kỳ ô nhập liệu nào (`UrlBar`, `KvpEditor`, `BodyEditor`, `AuthEditor`, `FolderEditor`, `EnvModal`), giá trị văn bản và con trỏ được khôi phục chính xác, đồng thời phát sự kiện `input` để đồng bộ với Vue `v-model`, `VariableHighlighter` và `useUrlParamsSync`.

## Constraints

- **Quy tắc an toàn dữ liệu khi test (Mục 19):** Mọi kiểm thử tự động (Go unit/integration test, Vitest unit/component test) chỉ được phép tạo và thao tác trên `Test-Collection` hoặc thư mục tạm độc lập (`t.TempDir()`, bare git repo trong `t.TempDir()`). Tuyệt đối không đọc, ghi, sửa, xóa hoặc chạy lệnh Git trên dữ liệu thật của người dùng.
- **Bảo mật thực thi Git:** Go backend chỉ gọi `exec.CommandContext` với danh sách đối số tách rời (`git`, `pull`, ...), không bao giờ chạy qua shell (`sh -c`). Kiểm tra `remoteURL` không được bắt đầu bằng ký tự `-` (chống git option injection) và `collectionID` phải vượt qua kiểm tra chống path traversal trước khi ghép đường dẫn.
- **Không tự động giải quyết xung đột Git bằng cách ghi đè:** Khi `git pull` phát hiện conflict, hệ thống phải giữ nguyên thông báo lỗi rõ ràng (kèm thao tác `git merge --abort` hoặc báo danh sách file conflict tùy trạng thái) để người dùng chủ động xử lý tay, tuyệt đối không dùng `--force` làm mất dữ liệu.

## Non-goals

- Không xây dựng giao diện Git Merge Editor 3-way hay quản lý nhánh (branch switcher/graph) phức tạp trong phạm vi Spec này.
- Không quản lý lưu trữ SSH passphrase hay OAuth credential helper riêng biệt — sử dụng trực tiếp cấu hình Git/SSH hệ thống của máy người dùng.

## Success signal

- Người dùng mở cấu hình Git của một Collection, nhập Git Remote URL, nhấn `Git Push` để đẩy toàn bộ request/folder lên remote repository và nhấn `Git Pull` để kéo thay đổi mới về (cây thư mục tự động cập nhật); khi có xung đột giữa local và remote, ứng dụng hiển thị hộp thoại báo lỗi conflict rõ ràng kèm đường dẫn thư mục để xử lý tay.
- Người dùng copy một lệnh `curl -X POST 'https://api.example.com/v1/users?role=admin' -H 'Authorization: Bearer {{token}}' -H 'Content-Type: application/json' -d '{"name":"Alice"}'` và dán thẳng vào thanh URL Bar: Method tự chuyển sang `POST`, URL và bảng Params tách đúng `role=admin`, Headers nhận đủ, Body tự chuyển sang `JSON` với nội dung `{"name":"Alice"}`; chuyển sang tab `cURL` thấy lệnh cURL đa dòng đã resolve biến `{{token}}`.
- Người dùng gõ custom method `PURGE` trong dropdown Method, chọn loại Body ngay trên hàng phải của thanh RequestTabs, và nhấn `Ctrl+Z` trong bất kỳ ô input/textarea nào để hoàn tác thao tác gõ trước đó.
- 100% bài kiểm thử backend (`go test ./...`) và frontend (`bun run type-check`, `bun run test`) vượt qua an toàn tuyệt đối.

# Git Sync & Request Productivity — Technical Architecture Companion

Tài liệu companion này quy định chi tiết kiến trúc kỹ thuật, cấu trúc dữ liệu và hợp đồng giao tiếp giữa Go Backend (Wails v2) và Vue 3 Frontend cho `SPEC-git-sync-and-request-productivity`.

## 1. Per-Collection Git Sync Architecture (CAP-1)

### 1.1. Go Data Model (`projects/model/types.go`)
- Mở rộng struct `Collection` trong `projects/model/types.go`:
  ```go
  type Collection struct {
      ID           string    `json:"id,omitempty"`
      Name         string    `json:"name"`
      Description  string    `json:"description"`
      Variables    []KVPair  `json:"variables,omitempty"`
      ActiveEnvID  string    `json:"active_env_id,omitempty"`
      GitRemoteURL string    `json:"git_remote_url,omitempty"`
      IsDefault    bool      `json:"is_default,omitempty"`
      IsActive     bool      `json:"is_active,omitempty"`
      CreatedAt    time.Time `json:"created_at"`
      UpdatedAt    time.Time `json:"updated_at"`
  }
  ```
- Bổ sung hằng số mã lỗi trong `projects/model/types.go`:
  - `ErrGitConflict = "GIT_CONFLICT"`
  - `ErrGitError = "GIT_ERROR"`
- Tạo kiểu dữ liệu phản hồi trạng thái/đồng bộ Git:
  ```go
  type GitSyncStatus struct {
      Initialized   bool     `json:"initialized"`
      RemoteURL     string   `json:"remote_url"`
      Branch        string   `json:"branch"`
      HasChanges    bool     `json:"has_changes"`
      ConflictFiles []string `json:"conflict_files,omitempty"`
      Output        string   `json:"output,omitempty"`
  }
  ```

### 1.2. Go Service (`projects/service/git_sync.go` & `projects/service/collection.go`)
- Trong `CollectionService.UpdateCollection` và `RenameCollection` (`projects/service/collection.go`), đảm bảo bảo toàn trường `GitRemoteURL` khi đọc/ghi `collection.json` (nếu payload truyền vào không rỗng thì cập nhật, nếu `RenameCollection` chỉ đổi tên thì giữ nguyên `GitRemoteURL` đã lưu).
- Tạo `GitSyncService` trong `projects/service/git_sync.go`:
  - Kiểm tra an toàn đường dẫn `collectionID` (không rỗng, không chứa `/`, `\`, `..`) và xác thực thư mục `collDir := filepath.Join(collectionsRoot, collectionID)` tồn tại.
  - Kiểm tra `remoteURL`: cắt khoảng trắng, không được bắt đầu bằng `-` (ngăn chặn git argument injection), chỉ chấp nhận định dạng URL hợp lệ (`https://`, `http://`, `ssh://`, `git@...`, hoặc đường dẫn repo cục bộ hợp lệ phục vụ kiểm thử trong `t.TempDir()`).
  - `SaveRemoteURL(collectionsRoot, collectionID, remoteURL string) model.Result`:
    - Cập nhật `GitRemoteURL` vào `collection.json` của collection đó.
    - Nếu `remoteURL != ""`:
      - Đảm bảo thư mục collection đã `git init` (nếu chưa có `.git`, chạy `git init`).
      - Cấu hình git user mặc định cục bộ nếu repo chưa có `user.name` / `user.email` (`git config user.name "Hecto API User"`, `git config user.email "user@hecto-api.local"`) để `git commit` không bị lỗi trên máy chưa cấu hình global git config.
      - Nếu remote `origin` đã tồn tại thì chạy `git remote set-url origin <remoteURL>`, ngược lại chạy `git remote add origin <remoteURL>`.
  - `GetStatus(collectionsRoot, collectionID string) model.Result`:
    - Đọc `collection.json` lấy `GitRemoteURL`.
    - Kiểm tra `.git` có tồn tại không, lấy tên nhánh hiện tại (`git rev-parse --abbrev-ref HEAD`, fallback `"main"`), kiểm tra `git status --porcelain` để xác định `HasChanges` và danh sách file conflict (`UU`, `AA`, `DD`, `AU`, `UA`, `DU`, `UD`).
  - `Pull(collectionsRoot, collectionID string) model.Result`:
    - Kiểm tra `GitRemoteURL` đã được cấu hình chưa; nếu chưa trả về `model.NewError(model.ErrValidation, "Vui lòng cấu hình Git Remote URL cho Collection trước khi Pull")`.
    - Đảm bảo repo đã khởi tạo và có remote `origin`.
    - Nếu có thay đổi cục bộ chưa commit (`git status --porcelain` khác rỗng), tự động stage và commit (`git add -A` + `git commit -m "sync(collection): local changes before pull"`) để tránh lỗi `local changes would be overwritten by merge`.
    - Xác định nhánh remote/hiện tại và chạy `git pull --no-rebase origin <branch>` (nếu nhánh local chưa có commit nào hoặc pull lần đầu, hỗ trợ `git fetch origin` và merge/checkout nhánh mặc định của remote như `main`/`master` hoặc nhánh hiện tại, với `--allow-unrelated-histories` khi cần).
    - Nếu lệnh trả về lỗi và phát hiện conflict (trong stdout/stderr có `CONFLICT` hoặc `Automatic merge failed` hoặc `git diff --name-only --diff-filter=U` có file):
      - Thu thập danh sách file bị conflict, trả về `model.NewError(model.ErrGitConflict, ...)` với thông điệp rõ ràng kèm danh sách file conflict và đường dẫn thư mục Collection để người dùng tự xử lý tay.
    - Nếu thành công: gọi `s.fs.IndexRebuild(collDir)` và trả về `model.NewSuccess(GitSyncStatus{...})`.
  - `Push(collectionsRoot, collectionID string) model.Result`:
    - Kiểm tra `GitRemoteURL` đã cấu hình chưa.
    - Đảm bảo repo đã `git init`, có remote `origin`, có cấu hình `user.name`/`user.email` cục bộ.
    - Chạy `git add -A`. Nếu `git status --porcelain` có thay đổi, chạy `git commit -m "sync(collection): update from hecto-api"`.
    - Xác định nhánh hiện tại (nếu `HEAD` chưa có commit nào thì tạo commit khởi tạo `--allow-empty` hoặc commit `collection.json`, đặt tên nhánh mặc định `main` nếu cần) và chạy `git push -u origin HEAD`.
    - Nếu thất bại do conflict / non-fast-forward (`rejected`, `fetch first`, `non-fast-forward`), trả về `model.NewError(model.ErrGitConflict, "Không thể Push do Remote có thay đổi mới hoặc xung đột. Vui lòng thực hiện Git Pull và xử lý xung đột trước khi Push.\nChi tiết: " + output)`.

### 1.3. Wails Bindings (`projects/app.go`) & Frontend UI (`AppSidebar.vue`, `GitSyncModal.vue`)
- Thêm vào `projects/app.go` (và cập nhật `projects/frontend/wailsjs/go/main/App.js` + `.d.ts` + `models.ts`):
  - `SaveCollectionGitRemote(collectionID, remoteURL string) model.Result`
  - `GetCollectionGitStatus(collectionID string) model.Result`
  - `GitPullCollection(collectionID string) model.Result`
  - `GitPushCollection(collectionID string) model.Result`
- Trên `AppSidebar.vue` (thanh công cụ phía trên cây thư mục, cạnh `CollectionSwitcher`):
  - Thêm nút `Git Pull` (`data-test="git-pull-btn"`), `Git Push` (`data-test="git-push-btn"`), và nút `Cấu hình Git` (`data-test="git-config-btn"`). Ngoài ra trong menu `CollectionSwitcher.vue` cũng có thể mở cấu hình Git cho collection.
  - Tạo `GitSyncModal.vue`:
    - Cho phép xem và lưu `Git Remote URL` (placeholder: `https://github.com/org/repo.git hoặc git@github.com:org/repo.git`).
    - Hiển thị trạng thái nhánh hiện tại, danh sách file xung đột (nếu có mã lỗi `GIT_CONFLICT`), và thông báo lỗi chi tiết từ Git để người dùng tự xử lý tay.
    - Nếu người dùng bấm `Git Pull` hoặc `Git Push` khi Collection chưa có `git_remote_url`, tự động mở `GitSyncModal.vue` để người dùng nhập URL.
    - Khi `Git Pull` thành công, gọi `collectionStore.loadCollections()`, `collectionStore.loadTree()`, `envStore.loadAll()` để làm mới toàn bộ dữ liệu UI.

## 2. cURL Paste Auto-Parser & Preview Tab (CAP-2, CAP-3)

### 2.1. cURL Parser (`projects/frontend/src/utils/curl.ts`)
- Bổ sung hàm `isCurlCommand(text: string): boolean`:
  - Trả về `true` nếu chuỗi sau khi `trim()` bắt đầu bằng `curl ` hoặc `curl\t` hoặc `curl\\\n` (không phân biệt hoa thường ở từ khóa `curl`).
- Bổ sung hàm `parseCurlCommand(curlStr: string): ParsedCurlResult`:
  - Chuẩn hóa các dấu nối dòng `\\\r?\n` thành khoảng trắng (ngoài chuỗi nháy đơn).
  - Tokenize chuẩn xác chuỗi shell: hỗ trợ token không dấu nháy, chuỗi nháy đơn `'...'` (bao gồm cả mẫu thoát `'\''`), chuỗi nháy kép `"..."` (xử lý `\"`, `\\`, `\n`, `\t`), và chuỗi ANSI-C `$'...'`.
  - Xử lý đầy đủ các cờ:
    - `-X`, `--request <METHOD>`: gán HTTP method (in hoa).
    - `-H`, `--header <HEADER>`: tách theo dấu `:` đầu tiên thành `{ key, value, enabled: true }`. Nếu header là `Authorization: Bearer <token>`, có thể giữ ở headers hoặc đồng bộ; nếu `-u` / `--user <user:pass>` được truyền, thiết lập `auth: { type: 'basic', basic: { username, password } }`.
    - `-d`, `--data`, `--data-raw`, `--data-binary`, `--data-ascii`, `--data-urlencode`: gom dữ liệu body. Nếu không chỉ định `-X` và không có `-G`/`--get`, tự động đặt `method = 'POST'`.
    - Phát hiện loại Body: nếu có nội dung body, thử `JSON.parse(body)` (hoặc kiểm tra header `Content-Type` chứa `application/json`) -> nếu là JSON hoặc có header JSON thì `body = { type: 'json', content }`, ngược lại `body = { type: 'text', content }`.
    - URL và Query Params: nhận diện đối số URL (hoặc từ cờ `--url`), sử dụng `parseUrl(url)` từ `urlParams.ts` để tách danh sách `params: KVPair[]` từ query string của URL.
- Trong `UrlBar.vue`:
  - Lắng nghe `@paste="handlePaste"` trên `<textarea id="url-input">`:
    - Lấy `pastedText = e.clipboardData?.getData('text/plain') || ''`.
    - Nếu `isCurlCommand(pastedText)` là `true`:
      - Gọi `e.preventDefault()`.
      - Gọi `const parsed = parseCurlCommand(pastedText)`.
      - Cập nhật `req.value.method = parsed.method`, `req.value.url = parsed.url`, `req.value.params = parsed.params`, `req.value.headers = parsed.headers`, `req.value.body = parsed.body`, và nếu `parsed.auth` tồn tại thì gán `req.value.auth = parsed.auth`.
      - Đồng bộ `requestStore.contentTypeAuto` nếu cần và hiển thị toast `"Đã phân tích lệnh cURL"`.

### 2.2. cURL Preview Tab (`RequestTabs.vue`, `RequestEditor.vue`)
- Trong `uiStore.ts`: mở rộng kiểu `activeRequestTab` thành `'params' | 'headers' | 'body' | 'auth' | 'curl'`.
- Trong `RequestTabs.vue`: thêm tab `{ id: 'curl', label: 'cURL', count: 0 }`.
- Trong `RequestEditor.vue`: thêm panel `v-show="uiStore.activeRequestTab === 'curl'"` (`id="panel-curl"`, `data-test="curl-preview-panel"`):
  - Hiển thị câu lệnh cURL đa dòng (`multiline: true`) được sinh reactive từ `generateCurlCommand(req.value, { vars: effectiveVariables.value, pathNodes: pathNodes.value, multiline: true })`.
  - Cung cấp nút `"Sao chép cURL"` (`data-test="copy-preview-curl-btn"`) để copy toàn bộ câu lệnh vào clipboard và hiện toast `"Đã sao chép cURL vào clipboard"`.

## 3. Custom HTTP Method, Inline Body Type Selector & Input Undo/Redo (CAP-4, CAP-5, CAP-6)

### 3.1. Custom HTTP Method (`UrlBar.vue`, `TreeNodeRow.vue`, `AppTabBar.vue`)
- Danh sách method chuẩn trong `UrlBar.vue`: `['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']`.
- Bổ sung màu sắc cho `HEAD` (ví dụ `text-cyan-400`) và `OPTIONS` (ví dụ `text-purple-400`) trong `UrlBar.vue`, `TreeNodeRow.vue`, `AppTabBar.vue`; các custom method khác dùng màu nổi bật trung tính (`text-teal-400` hoặc `text-text-secondary`).
- Bên dưới danh sách method trong listbox của `UrlBar.vue`, thêm khu vực nhập Custom Method:
  - Ô `<input data-test="custom-method-input" placeholder="Custom (VD: PURGE)" />` và nút áp dụng `data-test="custom-method-apply"`.
  - Khi người dùng gõ và nhấn `Enter` (hoặc bấm nút áp dụng), chuẩn hóa `val.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '')`. Nếu khác rỗng, gán `req.value.method = normalized`, đóng dropdown và cập nhật tab/tree.

### 3.2. Inline Body Type Selector (`RequestTabs.vue`, `BodyEditor.vue`)
- Trong `RequestTabs.vue`:
  - Đặt thanh tab bên trong container `flex items-center justify-between border-b border-border-default`.
  - Ở bên phải (`ml-auto pr-2 flex items-center gap-2`), hiển thị bộ chọn loại Body (`<select data-test="body-type-select" aria-label="Body type">`) với các tùy chọn `none` (`None`), `json` (`JSON`), `text` (`Text`).
  - Khi thay đổi giá trị dropdown: gọi `requestStore.setBodyType(newType)` và nếu `uiStore.activeRequestTab !== 'body'` thì tự động chuyển `uiStore.activeRequestTab = 'body'`.
- Trong `BodyEditor.vue`:
  - Loại bỏ khối `<div role="radiogroup" aria-label="Body type">` ở phía trên để khung soạn thảo Body sử dụng toàn bộ chiều cao của tab panel.

### 3.3. Input & Textarea Undo/Redo Manager (`projects/frontend/src/utils/inputUndo.ts`)
- Tạo module `projects/frontend/src/utils/inputUndo.ts`:
  - Lưu trữ lịch sử theo từng phần tử `HTMLInputElement | HTMLTextAreaElement` bằng `WeakMap`.
  - Mỗi mục lịch sử gồm `{ value: string; selectionStart: number; selectionEnd: number }`.
  - Khi phần tử nhận `focus`, khởi tạo snapshot ban đầu với `el.value`.
  - Khi phần tử phát sự kiện `input` (không phải đang trong quá trình thực thi undo/redo): đẩy trạng thái mới vào stack và xóa nhánh redo.
  - Cung cấp hàm `recordInputSnapshot(el)` để các thao tác sửa code bằng JS (như nhấn phím `Tab` chèn 2 dấu cách trong `BodyEditor.vue`) chủ động lưu snapshot trước/sau khi gán `el.value`.
  - Khi bắt sự kiện `keydown` với `Ctrl+Z` / `Cmd+Z` (không giữ Shift) hoặc `Ctrl+Y` / `Ctrl+Shift+Z` / `Cmd+Shift+Z` trên `<input>` hoặc `<textarea>`:
    - Gọi `e.preventDefault()` và `e.stopPropagation()`.
    - Thực hiện `undoInput(el)` hoặc `redoInput(el)`: cập nhật `el.value`, khôi phục `selectionStart`/`selectionEnd`, và phát `el.dispatchEvent(new Event('input', { bubbles: true }))` để Vue `v-model` và các watcher cập nhật đồng bộ.

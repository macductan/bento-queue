# 3-Way JSON Auto-Merge & Visual Conflict Resolver — Technical Architecture Companion

Tài liệu companion này quy định chi tiết cấu trúc dữ liệu, thuật toán 3-Way JSON Merge trên Go Backend, hợp đồng Wails Bindings và thiết kế giao diện Vue 3 cho `SPEC-git-json-auto-merge`.

## 1. Go Data Models (`projects/model/types.go`)

Mở rộng `projects/model/types.go` với các kiểu dữ liệu phục vụ biểu diễn và giải quyết xung đột cấp trường:

```go
// GitFieldConflict biểu diễn xung đột trên một trường cụ thể, một trường con trong JSON body, hoặc một phần tử KVPair khi cả OURS và THEIRS cùng sửa khác nhau so với BASE.
type GitFieldConflict struct {
	FieldPath   string      `json:"field_path"`             // VD: "url", "method", "body.content.userId", "headers.Authorization#0", "variables.API_URL#0"
	Label       string      `json:"label"`                  // Nhãn hiển thị thân thiện trên UI (VD: "URL", "Body JSON: userId", "Header: Authorization")
	BaseValue   interface{} `json:"base_value,omitempty"`   // Giá trị tại commit tổ tiên chung (:1:), nil nếu mới thêm ở cả 2 bên
	OursValue   interface{} `json:"ours_value,omitempty"`   // Giá trị bản của bạn (Local)
	TheirsValue interface{} `json:"theirs_value,omitempty"` // Giá trị bản từ xa (Remote)
}

// GitFileConflict biểu diễn trạng thái xung đột của một file JSON trong Collection sau khi đã chạy bước 3-Way Auto-Merge.
type GitFileConflict struct {
	FilePath      string                 `json:"file_path"`                // Đường dẫn tương đối từ gốc Collection (VD: "users/123e4567.json", "_folder.json", "environments/dev.json")
	EntityType    string                 `json:"entity_type"`              // "request" | "folder" | "environment" | "collection" | "raw"
	EntityName    string                 `json:"entity_name"`              // Tên hiển thị của Request / Folder / Environment
	ConflictType  string                 `json:"conflict_type"`            // "field_conflict" | "delete_edit" (Local xoá, Remote sửa) | "edit_delete" (Local sửa, Remote xoá)
	Fields        []GitFieldConflict     `json:"fields,omitempty"`         // Danh sách các trường bị xung đột thực sự
	MergedPreview map[string]interface{} `json:"merged_preview,omitempty"` // Bản JSON đã tự động gộp các trường KHÔNG xung đột (tạm giữ giá trị Ours cho các trường đang xung đột làm nền để Frontend cập nhật theo lựa chọn của user)
	OursData      map[string]interface{} `json:"ours_data,omitempty"`      // Toàn bộ JSON object của bản Local
	TheirsData    map[string]interface{} `json:"theirs_data,omitempty"`    // Toàn bộ JSON object của bản Remote
}
```

Cập nhật `GitSyncStatus` trong `projects/model/types.go`:

```go
type GitSyncStatus struct {
	HasGitRepo    bool              `json:"has_git_repo"`
	RemoteURL     string            `json:"remote_url"`
	Branch        string            `json:"branch"`
	HasChanges    bool              `json:"has_changes"`
	HasConflicts  bool              `json:"has_conflicts"`
	ConflictFiles []string          `json:"conflict_files,omitempty"`
	Conflicts     []GitFileConflict `json:"conflicts,omitempty"`
	Output        string            `json:"output,omitempty"`
}
```

## 2. Backend Engine (`projects/service/git_merge.go` & `projects/service/git_sync.go`)

### 2.1. Phát hiện xung đột & Chuẩn hóa chiều `OURS` / `THEIRS` từ Git Index
- Khi `Pull`, `StashAndPull`, hoặc `Push` (nhánh auto-merge trước khi push) phát hiện danh sách file unmerged qua `s.getConflictFiles(collDir)`:
  - Xác định ngữ cảnh xung đột:
    - **Ngữ cảnh Merge chuẩn (`Pull` / `Push` merge — `.git/MERGE_HEAD` tồn tại hoặc truyền `isStashPop = false`):**
      - `BASE`: `:1:<relPath>`
      - `OURS / LOCAL`: `:2:<relPath>`
      - `THEIRS / REMOTE`: `:3:<relPath>`
    - **Ngữ cảnh Stash Pop (`StashAndPull` khi `.git/MERGE_HEAD` KHÔNG tồn tại mà có unmerged index sau `git stash pop`):**
      - Khi `git stash pop` chạy trên `HEAD` vừa được pull từ remote, Git đặt `:2:` là `Updated upstream` (tức **Remote**) và `:3:` là `Stashed changes` (tức **Local**).
      - Do đó trong ngữ cảnh `isStashPop = true`:
        - `BASE`: `:1:<relPath>`
        - `OURS / LOCAL`: `:3:<relPath>`
        - `THEIRS / REMOTE`: `:2:<relPath>`
      - Ghi một file đánh dấu tạm `.git/HECTO_STASH_CONFLICT` (lưu SHA của `HEAD` trước khi pull nếu có) để `inspectStatus`, `ResolveGitConflict` và `AbortGitMerge` nhận biết chính xác kể cả khi được gọi ở request tiếp theo.

### 2.2. Xử lý xung đột Xoá vs. Sửa (Delete vs. Edit Conflict)
- **Trường hợp 1 (`delete_edit` — Local xoá file, Remote sửa file):**
  - Bản `OURS / LOCAL` không tồn tại, bản `THEIRS / REMOTE` tồn tại và hợp lệ.
  - Không tự động ghi đè hay xoá mất dữ liệu; tạo `GitFileConflict` với `ConflictType: "delete_edit"`, `TheirsData` chứa object của Remote, `OursData: nil`.
- **Trường hợp 2 (`edit_delete` — Local sửa file, Remote xoá file):**
  - Bản `OURS / LOCAL` tồn tại và hợp lệ, bản `THEIRS / REMOTE` không tồn tại.
  - Tạo `GitFileConflict` với `ConflictType: "edit_delete"`, `OursData` chứa object của Local, `TheirsData: nil`.

### 2.3. Thuật toán 3-Way JSON Merge (< 50ms/file)
Khi cả `OURS` và `THEIRS` đều tồn tại (và `BASE` có thể tồn tại hoặc rỗng `{}`):

1. **Nhận diện loại file JSON:**
   - `collection.json` $\rightarrow$ `EntityType = "collection"`
   - `_folder.json` (hoặc `*/_folder.json`) $\rightarrow$ `EntityType = "folder"`
   - `environments/*.json` $\rightarrow$ `EntityType = "environment"`
   - Các file `<uuid>.json` còn lại $\rightarrow$ `EntityType = "request"`

2. **Quy tắc 3-Way Merge cho trường vô hướng (Scalar) và Object lồng nhau:**
   - Gọi giá trị tại một `fieldPath` ở 3 bản là $B$ (`BASE`), $O$ (`OURS`), $T$ (`THEIRS`) (so sánh bằng chuẩn hóa JSON / `reflect.DeepEqual`):
     - Nếu $O == T$: Cả 2 bên giống nhau $\rightarrow$ Chọn $O$ (không xung đột).
     - Nếu $O == B$ và $T \neq B$: Chỉ Remote thay đổi $\rightarrow$ Tự động chọn $T$.
     - Nếu $T == B$ và $O \neq B$: Chỉ Local thay đổi $\rightarrow$ Tự động chọn $O$.
     - Nếu $O \neq B$, $T \neq B$ và $O \neq T$:
       - Trường metadata tự sinh (`updated_at`, `created_at`): Tự động giải quyết không báo conflict (`created_at` lấy mốc nhỏ hơn hoặc giữ `OURS`; `updated_at` cập nhật thành `time.Now().UTC()`).
       - Đối với object con có cấu trúc cố định (`body`, `auth`, `scripts`): Đi sâu đệ quy vào từng trường con (`body.type`, `body.content`, `body.form_data`, `body.urlencoded`, `auth.type`, `auth.bearer.token`, `auth.basic.username`, `auth.basic.password`, `auth.apiKey.key`, `auth.apiKey.value`, `auth.apiKey.addTo`, `scripts.pre_request`, `scripts.post_response`) để gộp từng trường con độc lập.
       - **Đệ quy sâu cho `body.content` khi `body.type == "json"`:**
         - Nếu `body.type` sau khi merge là `"json"`, và chuỗi `body.content` của cả $O$ lẫn $T$ (cùng $B$ nếu $B$ khác rỗng) đều parse hợp lệ thành JSON Object (`map[string]interface{}`):
           - Thực hiện đệ quy 3-Way Merge trên các key của JSON Object bên trong `body.content` với tiền tố `field_path = "body.content.<jsonKey>"` (Label: `"Body JSON: <jsonKey>"`).
           - Nếu không có key con nào xung đột, serialize lại JSON Object đã gộp bằng `json.MarshalIndent(..., "", "  ")` và gán vào `merged["body"]["content"]`!
           - Nếu có key con xung đột, ghi nhận `GitFieldConflict` cho đúng key con đó (hoặc cho phép cập nhật lại chuỗi `body.content` sau khi user chọn giá trị key con). Nếu `body.content` không phải JSON Object hợp lệ (ví dụ JSON array, primitive, hoặc chuỗi chứa cú pháp biến `{{var}}` không parse được JSON chuẩn), fallback về so sánh `body.content` như một trường string scalar thông thường.
       - Nếu là trường lá (leaf scalar) mà cả 2 bên cùng sửa thành 2 giá trị khác nhau $\rightarrow$ Đánh dấu vào danh sách `Fields: []GitFieldConflict` với `FieldPath`, `Label`, `BaseValue: B`, `OursValue: O`, `TheirsValue: T`. Trong `MergedPreview`, tạm đặt giá trị của `OURS`.

3. **Quy tắc 3-Way Merge cho danh sách `KVPair` (`headers`, `params`, `path_params`, `variables`, `body.form_data`, `body.urlencoded`):**
   - Trước khi so khớp, lọc bỏ các phần tử nháp hoàn toàn rỗng (`strings.TrimSpace(kv.Key) == "" && strings.TrimSpace(kv.Value) == ""`).
   - Để **bảo toàn các dòng trùng `Key`** (ví dụ 2 query params `?tag=a&tag=b` hoặc 1 header `Authorization` đang bật `enabled: true` và 1 header `Authorization` đang tắt `enabled: false`), gán định danh vị trí cho từng phần tử theo cặp `(Key, occurrenceIndex)` — ký hiệu khóa định danh là `<Key>#<occurrenceIndex>` (ví dụ `Authorization#0`, `Authorization#1`).
   - Duyệt qua tập hợp các khóa định danh `<Key>#<idx>` xuất hiện trong $B \cup O \cup T$ (giữ thứ tự xuất hiện của $O$, nối thêm các phần tử mới từ $T$):
     - Nếu phần tử tại `<Key>#<idx>` giống hệt nhau ở $O$ và $T$ (`value`, `enabled`, `description` trùng khớp) $\rightarrow$ Giữ nguyên phần tử $O$.
     - Nếu phần tử không đổi ở $O$ ($O == B$) nhưng ở $T$ được thêm mới, sửa đổi (`value`/`enabled`/`description`) hoặc xoá $\rightarrow$ Áp dụng thay đổi của $T$ (nếu $T$ xoá phần tử từng có trong $B$ thì loại bỏ khỏi mảng kết quả; nếu $T$ thêm/sửa thì lấy $T$).
     - Nếu phần tử không đổi ở $T$ ($T == B$) nhưng ở $O$ được thêm mới, sửa đổi hoặc xoá $\rightarrow$ Áp dụng thay đổi của $O$.
     - Nếu cả $O$ và $T$ đều thay đổi phần tử `<Key>#<idx>` khác với $B$ và $O \neq T$ $\rightarrow$ Ghi nhận một `GitFieldConflict` với `FieldPath: "<list_name>.<Key>#<idx>"` (ví dụ `"headers.Authorization#0"`), `Label: "Header: Authorization"` (kèm `#2` nếu `idx > 0`), `BaseValue: B`, `OursValue: O`, `TheirsValue: T`.

4. **Quy tắc 3-Way Merge cho Map theo Environment (`folder_envs`, `auth_envs`):**
   - Duyệt theo từng `envID` trong `folder_envs` (`map[string][]KVPair`) và `auth_envs` (`map[string]*AuthConfig`):
     - Với `folder_envs[envID]`: áp dụng quy tắc 3-Way Merge danh sách `KVPair` ở mục (3) với tiền tố đường dẫn `"folder_envs.<envID>.<Key>#<idx>"`.
     - Với `auth_envs[envID]`: áp dụng quy tắc 3-Way Merge object `AuthConfig` ở mục (2) với tiền tố đường dẫn `"auth_envs.<envID>.<sub_field>"`.

5. **Tự động hoàn tất (Auto-Complete) khi không còn xung đột:**
   - Với mỗi file `.json` mà sau khi chạy 3-Way Merge có `len(conflict.Fields) == 0`:
     - Ghi object `MergedPreview` đã hợp nhất xuống đĩa bằng `s.fs.WriteJSON(absPath, mergedObj)`.
     - Chạy `s.runGit(collDir, "add", "--", relPath)` để đánh dấu file đã giải quyết trong Git index.
   - Sau khi duyệt hết toàn bộ các file conflict:
     - Kiểm tra lại `remaining := s.getConflictFiles(collDir)`.
     - Nếu `len(remaining) == 0`:
       - Nếu đang trong phiên merge (`.git/MERGE_HEAD` tồn tại), chạy `s.runGit(collDir, "commit", "--no-edit", "-m", "chore(hecto): auto-merge collection json changes")`.
       - Nếu đang trong phiên `StashAndPull` (`.git/HECTO_STASH_CONFLICT` tồn tại), xoá file `.git/HECTO_STASH_CONFLICT` và chạy `git stash drop` (nếu đỉnh stash là `hecto-stash-before-pull`).
       - Chạy `s.fs.IndexRebuild(collDir)` và trả về `model.NewSuccess(status)` — người dùng hoàn toàn không bị gián đoạn bởi thông báo lỗi.
     - Nếu `len(remaining) > 0`:
       - Lưu danh sách `Conflicts` vào `status.Conflicts`, trả về `model.Result{Success: false, Data: status, Error: &model.AppError{Code: model.ErrGitConflict, Message: ...}}`.
       - Trong `GitSyncService.Push`: nếu nhánh auto-merge khi Push phát hiện tất cả các file đều gộp tự động thành công (`len(remaining) == 0`) thì tiếp tục push ngay; nếu còn xung đột thực sự cần người dùng chọn (`len(remaining) > 0`), giữ nguyên trạng thái merge kèm `status.Conflicts` và trả về `ErrGitConflict` để Frontend mở ngay `GitConflictResolverModal.vue` cho phép người dùng giải quyết rồi Push.

### 2.4. Wails Bindings cho Manual Resolve & Rollback (`projects/app.go` & `projects/service/git_sync.go`)

1. **`ResolveGitConflict(collectionID string, resolvedFiles map[string]interface{}) model.Result`:**
   - Nhận `collectionID` và `resolvedFiles` là map từ `relPath` sang dữ liệu đã giải quyết:
     - Kiểm tra an toàn `relPath`: không rỗng, không phải đường dẫn tuyệt đối, sau khi `filepath.Clean` không bắt đầu bằng `..` hoặc `.git`, và nằm hoàn toàn bên trong `collDir`.
     - Nếu giá trị ứng với `relPath` là `nil` hoặc map có cờ `{"__deleted__": true}` (khi user chọn xoá file trong xung đột `delete_edit` / `edit_delete`):
       - Xoá file trên đĩa (nếu còn) và chạy `git rm -f --ignore-unmatch -- <relPath>`.
     - Nếu giá trị ứng với `relPath` là JSON object (`map[string]interface{}`):
       - Cập nhật trường `updated_at` thành `time.Now().UTC().Format(time.RFC3339)` (nếu object có trường `updated_at`).
       - Định dạng JSON chuẩn (`2 spaces indent` thông qua `s.fs.WriteJSON`) và ghi xuống `filepath.Join(collDir, relPath)`.
       - Chạy `git add -- <relPath>`.
   - Sau khi xử lý xong tất cả các mục trong `resolvedFiles`:
     - Kiểm tra `remaining := s.getConflictFiles(collDir)`.
     - Nếu `len(remaining) == 0`:
       - Nếu `.git/MERGE_HEAD` tồn tại, chạy `git commit --no-edit -m "chore(hecto): resolve git conflicts"`.
       - Nếu `.git/HECTO_STASH_CONFLICT` tồn tại, xoá `.git/HECTO_STASH_CONFLICT`, chạy `git stash drop` (nếu có stash `hecto-stash-before-pull`) và tạo commit `"chore(hecto): resolve git stash conflicts"`.
       - Đảm bảo `collection.json` giữ đúng `ID`, `IsDefault`, `GitRemoteURL` và gọi `s.fs.IndexRebuild(collDir)`.
       - Trả về `model.NewSuccess(s.inspectStatus(collDir, coll.GitRemoteURL))`.
     - Nếu vẫn còn file chưa được giải quyết, trả về `ErrGitConflict` kèm danh sách `Conflicts` còn lại.

2. **`AbortGitMerge(collectionID string) model.Result`:**
   - Kiểm tra hợp lệ `collectionID` và `collDir`.
   - Nếu `.git/MERGE_HEAD` tồn tại: chạy `git merge --abort`.
   - Nếu `.git/HECTO_STASH_CONFLICT` tồn tại (xung đột từ `StashAndPull`):
     - Đọc SHA `prePullHead` lưu trong `.git/HECTO_STASH_CONFLICT` (nếu có) và chạy `git reset --hard <prePullHead>` (hoặc `git reset --hard HEAD`), sau đó khôi phục lại `git stash pop` trên nền commit cũ để toàn bộ dữ liệu local trước lúc Pull của user được trả về nguyên vẹn, rồi xoá `.git/HECTO_STASH_CONFLICT`.
   - Nếu có unmerged entries khác trong index: chạy `git reset --merge`.
   - Khôi phục thông tin `collection.json` hợp lệ và gọi `s.fs.IndexRebuild(collDir)`.
   - Trả về `model.NewSuccess(s.inspectStatus(collDir, coll.GitRemoteURL))`.

3. **Export TypeScript Models:**
   - Đảm bảo `GitSyncStatus`, `GitFileConflict`, `GitFieldConflict` được export đầy đủ sang Wails TypeScript bindings.

## 3. Frontend UI (`GitConflictResolverModal.vue`, `GitSyncModal.vue`, `collectionStore.ts`)

### 3.1. Auto-Flush Dirty State & Actions trong `collectionStore.ts`
- **Auto-Flush trước khi Pull / Push:**
  - Đầu các hàm `gitPull`, `gitStashAndPull`, và `gitPush` trong `collectionStore.ts`, kiểm tra nếu `requestStore.isDirty` thì gọi `await requestStore.flush()`, và nếu đang mở tab folder dirty thì gọi `await tabStore.flushActiveFolderIfNeeded()` trước khi gọi xuống Go backend.
- Thêm state vào `uiStore.ts`: `gitConflictModalOpen: ref(false)`.
- Khi `gitPull`, `gitStashAndPull`, hoặc `gitPush` nhận về `res.error?.code === 'GIT_CONFLICT'`:
  - Cập nhật `this.gitSyncStatus = res.data as model.GitSyncStatus`.
  - Nếu `this.gitSyncStatus?.conflicts?.length > 0`, tự động mở `uiStore.gitConflictModalOpen = true`.
- Bổ sung 2 action trong `collectionStore.ts`:
  - `resolveGitConflicts(resolvedFiles: Record<string, any>, collectionId?: string): Promise<boolean>`:
    - Gọi Wails binding `ResolveGitConflict(targetId, resolvedFiles)`.
    - Khi thành công: cập nhật `gitSyncStatus`, xoá `gitConflictError`, đóng `gitConflictModalOpen`, gọi `Promise.all([this.loadTree(), envStore.refresh(), this.loadCollections()])` và reload Request đang mở (`useRequestStore().loadRequest(this.activeRequestId)`), hiển thị toast `"Đã giải quyết xung đột và hoàn tất đồng bộ Git"`.
  - `abortGitMerge(collectionId?: string): Promise<boolean>`:
    - Gọi Wails binding `AbortGitMerge(targetId)`.
    - Khi thành công: cập nhật `gitSyncStatus`, xoá `gitConflictError`, đóng `gitConflictModalOpen`, reload cây thư mục + môi trường + request đang mở, hiển thị toast `"Đã huỷ merge và khôi phục trạng thái trước đó"`.

### 3.2. Thiết kế `GitConflictResolverModal.vue`
- Được mount tại `App.vue` (cùng cấp với `GitSyncModal.vue`).
- **Header:**
  - Tiêu đề: `"Giải quyết xung đột Git (Visual Conflict Resolver)"` kèm badge tiến độ `Đã xử lý X/Y file`.
  - Thanh thao tác nhanh toàn cục (khi có nhiều file): **"Chọn toàn bộ Local (Tất cả file)"** (`data-test="pick-all-files-ours-btn"`) và **"Chọn toàn bộ Remote (Tất cả file)"** (`data-test="pick-all-files-theirs-btn"`).
  - Nút **"Huỷ merge (Rollback)"** (`data-test="git-abort-merge-btn"`) gọi `collectionStore.abortGitMerge()`.
- **Danh sách File xung đột (Sidebar / Tabs bên trong Modal):**
  - Liệt kê từng `GitFileConflict` với icon loại thực thể (`Request`, `Folder`, `Environment`, `Collection`), tên `entity_name`, đường dẫn `file_path`, và trạng thái đã chọn đủ các trường trong file đó hay chưa (`✓ Đã chọn` / `Còn N trường`).
- **Khung so sánh Diff 2 cột cho File đang chọn:**
  - Hiển thị tiêu đề 2 cột:
    - Cột trái: **"Bản của bạn (Local)"** kèm nút thao tác nhanh **"Chọn toàn bộ bản Local"** (`data-test="pick-all-ours-btn"`).
    - Cột phải: **"Bản từ xa (Remote)"** kèm nút thao tác nhanh **"Chọn toàn bộ bản Remote"** (`data-test="pick-all-theirs-btn"`).
  - **Với `conflict_type === 'field_conflict'`:**
    - Liệt kê từng trường trong `conflict.fields` (`GitFieldConflict`):
      - Hiển thị tên trường `label` (`field_path`) và giá trị `base_value` (nếu có) để người dùng đối chiếu.
      - Bên cột Local: hiển thị `ours_value` (định dạng JSON/text dễ đọc; với `KVPair` hiển thị `key: value` + trạng thái `enabled`, hoặc `"Đã xoá"` nếu `null`), click vào thẻ để chọn giá trị Local (`data-test="pick-field-ours-<index>"`).
      - Bên cột Remote: hiển thị `theirs_value`, click vào thẻ để chọn giá trị Remote (`data-test="pick-field-theirs-<index>"`).
      - Khi người dùng chọn giá trị cho một `field_path`, đánh dấu trường đó đã được giải quyết và cập nhật trực tiếp giá trị tại đường dẫn `field_path` đó vào bản sao `merged_preview` của file (hỗ trợ cả đường dẫn thường, đường dẫn JSON body `body.content.<key>`, và phần tử mảng `KVPair` `<list>.<Key>#<idx>`).
  - **Với `conflict_type === 'delete_edit'` hoặc `'edit_delete'`:**
    - Hiển thị cảnh báo rõ bên nào đã xoá file và bên nào đã chỉnh sửa file, kèm 2 lựa chọn 1-click:
      - **"Giữ lại file (Bản chỉnh sửa)"** (`data-test="resolve-keep-file-btn"`).
      - **"Xác nhận xoá file"** (`data-test="resolve-delete-file-btn"`).
- **Footer & Cơ chế chống bấm nhầm:**
  - Nút **"Huỷ merge"** (`data-test="git-abort-merge-footer-btn"`).
  - Nút **"Xác nhận & Hoàn tất Đồng bộ"** (`data-test="git-resolve-submit-btn"`): chỉ enabled khi tất cả các file và trường xung đột đã được người dùng chủ động chọn phương án (`allResolved === true`). Khi bấm, tổng hợp payload `resolvedFiles` từ tất cả các file trong `conflicts` và gọi `collectionStore.resolveGitConflicts(resolvedFiles)`.

### 3.3. Tích hợp với `GitSyncModal.vue`
- Trong khối `data-test="git-conflict-alert"` của `GitSyncModal.vue`:
  - Nếu có xung đột, hiển thị thêm nút **"Mở bộ giải quyết xung đột (Visual Resolver)"** (`data-test="open-conflict-resolver-btn"`) để mở `GitConflictResolverModal.vue`, cùng nút **"Huỷ merge"** (`data-test="git-sync-abort-merge-btn"`).

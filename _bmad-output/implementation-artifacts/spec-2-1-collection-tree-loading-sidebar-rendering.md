---
title: 'Story 2.1: Collection Tree Loading & Sidebar Rendering'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: 'eb88e4a766b7b939a4200f97feb649fa1f72b12f'
route: 'dispatch'
review_loop_iteration: 0
followup_review_recommended: false
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sidebar hiện chỉ hiển thị placeholder — không load dữ liệu collection từ disk. User mở app chỉ thấy sidebar trống, không thấy folder/request nào. Ngoài ra, `CollectionService.GetTree` là stub trả `nil`, chưa wire collection root từ config, và retro action item yêu cầu wire `IndexRebuild` tại đầu `GetTree`.

**Approach:** Implement Go `CollectionService.GetTree`: wire collection root từ `ConfigService`, gọi `IndexRebuild`, đọc disk recursive để build tree. Thêm `TreeNode` model cho nested tree response. Vue: implement `collectionStore` với `loadTree` action gọi `GetCollectionTree` binding lúc app mount. `AppSidebar` render tree: folder rows có caret xoay + icon folder, request rows indent 28px với method badge color-coded. Folder expand/collapse animate 150ms.

## Boundaries & Constraints

**Always:**
- Tree phải phản ánh 1:1 cấu trúc disk — folder trên disk = folder trong tree.
- `IndexRebuild` được gọi tại đầu `GetTree` trước khi build tree (retro action item).
- Method badge color-coded: GET=#10b981, POST=#3b82f6, PUT=#f97316, PATCH=#f59e0b, DELETE=#ef4444.
- Folder caret animate 150ms ease khi expand/collapse.
- Request row indent 28px so với folder row.
- Empty folder hiển thị không có children (không ẩn).
- Sidebar scroll dọc khi tree vượt chiều cao.

**Never:**
- Không implement select request (Story 2.3) — click request row chưa load vào editor, chỉ highlight visual.
- Không implement CRUD folder/request (Story 2.2+) — chỉ đọc và hiển thị tree.
- Không thêm context menu, inline rename, hay keyboard navigation — đó là stories sau.
- Không sửa design tokens hay thêm token mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Collection có folder + requests | Disk: 2 folders, 3 requests | Tree render đúng hierarchy, method badges đúng màu | N/A |
| Collection rỗng (chỉ collection.json) | Disk: chỉ collection.json | Sidebar body hiển thị tree rỗng | N/A |
| Folder rỗng (có _folder.json, 0 requests) | Disk: folder với _folder.json | Folder row hiển thị, không có children bên dưới | N/A |
| Nested folders (3 cấp) | Disk: folder A > folder B > request C | Tree render 3 cấp, indent tăng dần | N/A |
| Request file không đọc được | Disk: file .json bị corrupt hoặc unreadable | Skip file đó, render phần còn lại, log warning | Go log warning, tree vẫn render |
| Collection root không tồn tại | Config trỏ tới path không có | `GetTree` trả Result error IO_ERROR | Vue giữ sidebar trống, console.error |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` L69-74 -- `Folder` struct hiện tại chỉ có flat metadata (ID, Name, CreatedAt, UpdatedAt), cần thêm `TreeNode` type cho nested tree response
- `projects/service/collection.go` L23-26 -- `GetTree` là stub trả `nil`, cần implement recursive disk read + tree build
- `projects/service/collection.go` L11-14 -- `CollectionService` struct chỉ có `fs` và `logger`, cần thêm `cfgSvc` hoặc nhận collection root từ `app.go`
- `projects/app.go` L47-57 -- `startup()` gọi `cfgSvc.Initialize` nhưng không wire collection root vào `collSvc` hay `fs`
- `projects/app.go` L63-65 -- `GetCollectionTree` gọi `collSvc.GetTree("")` — cần wire root path
- `projects/storage/filesystem.go` L302-326 -- `IndexRebuild(root)` — retro action item yêu cầu wire tại đầu `GetTree`
- `projects/storage/filesystem.go` L42-56 -- `ReadJSON` — dùng để đọc `_folder.json` và request JSON files
- `projects/storage/filesystem.go` L155-165 -- `ListDir` — dùng để liệt kê entries trong mỗi folder
- `projects/frontend/src/stores/collectionStore.ts` L1-6 -- stub store rỗng, cần implement state + loadTree action
- `projects/frontend/src/components/AppSidebar.vue` L1-14 -- placeholder tree view, cần render actual tree
- `projects/frontend/src/App.vue` L1-18 -- app root, cần trigger `collectionStore.loadTree()` on mount
- `projects/frontend/src/style.css` L34-38 -- method color tokens đã có: `--color-method-get`, `-post`, `-put`, `-patch`, `-delete`
- `projects/frontend/wailsjs/go/main/App.d.ts` L15 -- `GetCollectionTree()` binding type đã tồn tại

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go` -- Thêm `TreeNode` struct: `{ID, Name, Type ("folder"|"request"), Method, Path, Children []TreeNode, CreatedAt}` — để Go trả nested tree, Vue render trực tiếp
- [x] `projects/service/collection.go` -- Implement `GetTree`: nhận collection root, gọi `fs.IndexRebuild(root)`, recursive `buildTree(dirPath)` đọc `ListDir` + `ReadJSON` cho `_folder.json` và request files, trả `Result{[]TreeNode}`
- [x] `projects/app.go` -- Wire collection root: `startup()` lưu `config.CollectionRoot` vào App struct, `GetCollectionTree` pass nó vào `collSvc.GetTree(root)`
- [x] `projects/service/collection_test.go` -- Test `GetTree`: collection rỗng, có folder+requests, nested 3 cấp, file corrupt (skip + warning)
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Implement state `{tree, expandedFolders, loading, error}` + actions `loadTree()` gọi `GetCollectionTree` binding, `toggleFolder(id)` toggle expand state
- [x] `projects/frontend/src/components/AppSidebar.vue` -- Render tree recursive: `TreeNodeRow` component — folder row (caret icon xoay + folder icon + name), request row (indent 28px + method badge color-coded + name). Folder caret animate 150ms. Hover → `surface-hover`.
- [x] `projects/frontend/src/App.vue` -- `onMounted` gọi `collectionStore.loadTree()`

**Acceptance Criteria:**
- Given collection trên disk có 2 folder và 3 requests, when app khởi động, then sidebar render đúng tree: folders với caret + folder icon + tên, requests với method badge + tên, hierarchy đúng 1:1 disk
- Given một folder đang collapsed, when click vào folder row, then children expand ra với caret xoay 90° trong 150ms ease
- Given một folder đang expanded, when click vào folder row, then children collapse với caret xoay về 0° trong 150ms ease
- Given Go `GetTree` hoàn tất, when `IndexRebuild` đã chạy trước khi build tree, then UUID→path index đồng bộ với disk
- Given Go tests, when `go test ./service/ -v -count=1 -run TestGetTree`, then các test case pass: empty collection, folders+requests, nested, corrupt file skip

## Implementation Notes



## Spec Change Log



## Review Triage Log

| Finding | Verdict | Category | Evidence |
|---------|---------|----------|----------|
| `expandedFolders: Set<string>` bypass Vue reactivity | **false** | reject | Vue 3 `reactive()` wraps `Set` với Proxy natively — `has/delete/add` đều tracked. Verified: Vue 3 docs + runtime behavior. |
| `buildTree` subfolder error swallowed, behavior không nhất quán | **medium → patched** | patch | `buildTree` ở subfolder log warning và tiếp tục với `children=[]`. Behavior intentional (best-effort). Thêm guard skip empty-ID request nodes (F6 patch). |
| Symlink loop → infinite recursion | **medium** | defer | Pre-existing OS-level risk, ngoài scope story 2.1. Ghi vào deferred-work.md. |
| `span.truncate` thiếu `min-w-0` trên flex container | **low → patched** | patch | Fixed trong TreeNodeRow.vue. |
| Non-request JSON parse → empty ID node | **low → patched** | patch | Thêm `if req.ID == "" { continue }` guard sau ReadJSON. |
| `IndexRebuild` fail → tree fail hoàn toàn | **low** | defer | Intentional design: index consistency là prerequisite. Ghi vào deferred-work.md. |
| Request row click no-op | **false** | reject | Spec ghi rõ boundary: "Never: không implement select request (Story 2.3)". |
| `collRoot` race condition với Wails lifecycle | **false** | reject | Wails đảm bảo `startup()` hoàn thành trước bất kỳ binding invocation nào. |
## Design Notes

**TreeNode model:** Dùng single flat `TreeNode` struct cho cả folder và request (phân biệt qua `Type` field) thay vì 2 struct riêng. Vue nhận mảng `TreeNode[]` và render recursive, không cần transform. `Method` field chỉ có giá trị khi `Type="request"`. `Children` chỉ có khi `Type="folder"`.

**Folder expand state:** Quản lý bởi Vue `collectionStore.expandedFolders` (Set<string> chứa folder IDs) — không persist lên disk. Default: tất cả folders collapsed khi app khởi động. Click toggle add/remove ID khỏi set.

**Collection root wiring:** `app.go` lưu `config.CollectionRoot` vào field mới trên `App` struct. `GetCollectionTree` pass nó. Không thay đổi signature của `CollectionService.GetTree(rootPath string)` — đã nhận root param.

## Verification

**Commands:**
- `cd projects && go test ./service/ -v -count=1 -run TestGetTree` -- expected: tất cả test cases PASS
- `cd projects && go test ./storage/ -v -count=1` -- expected: 17/17 PASS (regression)
- `cd projects && go vet ./...` -- expected: không warning
- `cd projects && go build ./...` -- expected: build thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build

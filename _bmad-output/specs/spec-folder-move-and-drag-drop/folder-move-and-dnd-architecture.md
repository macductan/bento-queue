# Kiến trúc Di chuyển Folder & Kéo thả (Drag & Drop) trong Sidebar Collection Tree

Tài liệu companion đặc tả chi tiết kiến trúc kỹ thuật, giao diện hàm (signatures), quy tắc kiểm tra hợp lệ (validation & cycle detection), cơ chế cập nhật chỉ mục bộ nhớ (`storage.FileSystem`), thiết kế trạng thái Pinia và tương tác HTML5 Drag & Drop trên giao diện Vue 3.

---

## 1. Backend Architecture (Go / Wails)

### 1.1. Error Constants (`projects/service/errors.go`)

Bổ sung các hằng số thông báo lỗi tiếng Việt phục vụ `MoveFolder`:

| Hằng số | Giá trị chuỗi | Mã lỗi (`model.ErrCode`) | Ngữ cảnh sử dụng |
|---|---|---|---|
| `ErrFolderNotInRoot` | `"Thư mục không nằm trong collection root"` | `VALIDATION_ERROR` | `srcPath` nằm ngoài `rootPath` hoặc là chính `rootPath` / `environments` |
| `ErrFolderMoveCycle` | `"Không thể di chuyển thư mục vào chính nó hoặc thư mục con của nó"` | `VALIDATION_ERROR` | `folderID == targetFolderID` hoặc `targetDir` là thư mục con/cháu của `srcPath` |
| `ErrMoveFolderToEnvFailed` | `"Không thể chuyển thư mục vào thư mục environments"` | `VALIDATION_ERROR` | `targetDir` nằm trong `environments/` |
| `ErrFolderMoveConflict` | `"Thư mục cùng tên đã tồn tại tại vị trí đích"` | `VALIDATION_ERROR` | Thư mục đích đã chứa thư mục con có cùng tên vật lý hoặc trùng tên hiển thị |
| `ErrFolderMoveFailed` | `"Không thể di chuyển thư mục"` | `IO_ERROR` | Lỗi hệ thống tệp khi thực thi `os.Rename` / `fs.MoveFile` |

### 1.2. Cập nhật Index theo Prefix (`projects/storage/filesystem.go`)

Khi di chuyển một thư mục từ `oldPath` sang `newPath`, bản thân thư mục đó và toàn bộ các thư mục con/request bên trong đều thay đổi đường dẫn vật lý. Cần bổ sung phương thức `IndexUpdatePrefix(oldPrefix, newPrefix string)` trên `storage.FileSystem`:

```go
// IndexUpdatePrefix updates the path of oldPrefix and all entries nested under oldPrefix
// to start with newPrefix instead.
func (f *FileSystem) IndexUpdatePrefix(oldPrefix, newPrefix string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	oldClean := filepath.Clean(oldPrefix)
	newClean := filepath.Clean(newPrefix)
	oldWithSep := oldClean + string(filepath.Separator)
	for id, p := range f.index {
		cleanP := filepath.Clean(p)
		if cleanP == oldClean {
			f.index[id] = newClean
		} else if strings.HasPrefix(cleanP, oldWithSep) {
			rel := strings.TrimPrefix(cleanP, oldWithSep)
			f.index[id] = filepath.Join(newClean, rel)
		}
	}
}
```

### 1.3. Service Method `CollectionService.MoveFolder` (`projects/service/collection.go`)

**Signature:**
```go
func (s *CollectionService) MoveFolder(rootPath, id, targetFolderID string) model.Result
```

**Luồng xử lý & Validation:**
1. **Kiểm tra tham số đầu vào:**
   - Nếu `rootPath == ""` $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrCollectionRootEmpty)`.
   - Nếu `strings.TrimSpace(id) == ""` $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrIDInvalid)`.
2. **Xác thực thư mục nguồn (`id`):**
   - Tìm `srcPath, err := s.fs.FindByUUID(id)`. Nếu lỗi $\rightarrow$ trả về `model.NewError(model.ErrNotFound, ErrFolderNotFound)`.
   - Kiểm tra `s.fs.Exists(filepath.Join(srcPath, folderMetaFile))` và `isDeletableFolderPath(rootPath, srcPath)`. Nếu không thỏa mãn (ví dụ `id` trỏ tới file `.json` của request, hoặc trỏ vào `rootPath`, `environments`, hoặc ngoài `rootPath`) $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrInvalidFolderPath)` / `ErrFolderNotInRoot`.
   - Đọc `_folder.json` của thư mục nguồn để lấy `srcFolder.Name`.
3. **Chặn tự di chuyển vào chính nó (Direct Self-Cycle):**
   - Nếu `id == targetFolderID` $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrFolderMoveCycle)`.
4. **Xác định thư mục đích (`targetDir`):**
   - Nếu `targetFolderID == ""` $\rightarrow$ `targetDir = rootPath` (di chuyển về gốc collection).
   - Nếu `targetFolderID != ""`:
     - Tìm `folderPath, err := s.fs.FindByUUID(targetFolderID)`. Nếu lỗi $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrTargetFolderNotFound)`.
     - Kiểm tra `s.fs.Exists(filepath.Join(folderPath, folderMetaFile))` và `isDeletableFolderPath(rootPath, folderPath)`. Nếu không hợp lệ $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrTargetFolderInvalid)`.
     - `targetDir = folderPath`.
   - Kiểm tra `!isInsideRoot(rootPath, targetDir)` $\rightarrow$ trả về `ErrTargetFolderNotInRoot`.
   - Kiểm tra `strings.HasPrefix(targetDir, filepath.Join(rootPath, "environments"))` $\rightarrow$ trả về `ErrMoveFolderToEnvFailed`.
5. **Chặn di chuyển vào thư mục con/cháu (Descendant Cycle Detection):**
   - Tính đường dẫn tương đối `rel, err := filepath.Rel(srcPath, targetDir)`.
   - Nếu `err == nil && (rel == "." || (!strings.HasPrefix(rel, ".."+string(filepath.Separator)) && rel != ".."))` $\rightarrow$ `targetDir` nằm bên trong `srcPath` $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrFolderMoveCycle)`.
6. **Kiểm tra trùng vị trí hiện tại (Same Parent No-op):**
   - Nếu `filepath.Clean(filepath.Dir(srcPath)) == filepath.Clean(targetDir)` $\rightarrow$ trả về `model.NewSuccess(nil)` ngay lập tức.
7. **Xử lý trùng tên tại thư mục đích (Collision Handling):**
   - Kiểm tra các thư mục con trực tiếp trong `targetDir`: đọc `_folder.json` của từng thư mục con trong `targetDir`. Nếu đã có thư mục con (khác `id`) mang tên hiển thị trùng (so sánh `strings.EqualFold(strings.TrimSpace(childFolder.Name), strings.TrimSpace(srcFolder.Name))`) $\rightarrow$ tự động hậu tố hóa tên hiển thị của thư mục đang di chuyển (ví dụ `"<Name> (2)"`, `"<Name> (3)"`...) và cập nhật lại `_folder.json`, HOẶC xử lý va chạm đường dẫn vật lý:
     - Với đường dẫn vật lý: `dirName := filepath.Base(srcPath)`, `newPath := filepath.Join(targetDir, dirName)`.
     - Nếu `s.fs.Exists(newPath) && filepath.Clean(newPath) != filepath.Clean(srcPath)`: thử fallback sang `filepath.Join(targetDir, slug.FolderDir(id))`. Nếu vẫn tồn tại trên đĩa $\rightarrow$ trả về `model.NewError(model.ErrValidation, ErrFolderMoveConflict)`.
8. **Thực thi di chuyển vật lý & cập nhật Index:**
   - Gọi `s.fs.MoveFile(srcPath, newPath)` (sử dụng `os.Rename(srcPath, newPath)` để di chuyển nguyên khối thư mục vật lý). Nếu lỗi $\rightarrow$ trả về `model.NewError(model.ErrIO, ErrFolderMoveFailed)`.
   - Nếu tên hiển thị đã được điều chỉnh để tránh trùng tại đích, cập nhật trường `Name` và `UpdatedAt` trong `filepath.Join(newPath, "_folder.json")`.
   - Gọi `s.fs.IndexUpdatePrefix(srcPath, newPath)` và `s.fs.IndexSet(id, newPath)`.
   - Trả về `model.NewSuccess(nil)`.

### 1.4. Wails Binding (`projects/app.go` & `wailsjs/go/main/App`)

Trong `projects/app.go`, bổ sung method public để Wails bind sang TypeScript:

```go
// MoveFolder moves a folder and all its contents to a target folder (or root when targetFolderID is "").
func (a *App) MoveFolder(folderID, targetFolderID string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.MoveFolder(root, folderID, targetFolderID)
	if res.Success {
		a.recordChangelog("folder", folderID, folderID, "move", "Di chuyển thư mục sang vị trí khác")
	}
	return res
}
```

> **Lưu ý về kiểu trả về Wails:** Toàn bộ Wails bindings trong `hecto-api` (`MoveRequest`, `RenameFolder`, `DeleteFolder`,...) đều tuân theo chuẩn kiến trúc AD-2/AD-5 trả về `model.Result` (`Promise<model.Result>` phía frontend) thay vì trả về `error` thô, giúp đồng nhất cấu trúc `{ success: boolean, data?: any, error?: { code: string, message: string } }`.

---

## 2. Frontend Architecture (Vue 3 / Pinia / TypeScript)

### 2.1. Pinia Store (`projects/frontend/src/stores/collectionStore.ts`)

1. **Import Wails binding:** Import `MoveFolder` từ `../../wailsjs/go/main/App`.
2. **State / Helper kiểm tra hợp lệ khi kéo thả & di chuyển:**
   - Thêm state tạm cho phiên kéo thả (hoặc quản lý tập trung tại `collectionStore` / `uiStore`):
     - `draggingNode: { id: string; type: 'folder' | 'request' } | null`
   - Thêm helper `isDescendantFolder(folderId: string, candidateTargetId: string): boolean`:
     - Tìm `folderNode = this.findNode(this.tree, folderId)`.
     - Nếu `!folderNode || folderNode.type !== 'folder'` $\rightarrow$ `false`.
     - Nếu `folderId === candidateTargetId` $\rightarrow$ `true`.
     - Kiểm tra `!!this.findNode(folderNode.children || [], candidateTargetId)`.
   - Thêm helper `findParentFolderId(nodes: TreeNode[], targetId: string, parentId = ''): string | null`:
     - Trả về ID của folder cha trực tiếp chứa `targetId` (hoặc `''` nếu `targetId` nằm ở gốc collection, `null` nếu không tìm thấy).
   - Thêm helper `canMoveNodeTo(nodeId: string, nodeType: 'folder' | 'request', targetFolderId: string): boolean`:
     - Nếu `!nodeId` $\rightarrow$ `false`.
     - Tìm `currentParentId = this.findParentFolderId(this.tree, nodeId)`. Nếu `currentParentId === targetFolderId` $\rightarrow$ `false` (đã nằm sẵn trong folder đích).
     - Nếu `nodeType === 'folder'`:
       - Nếu `nodeId === targetFolderId` $\rightarrow$ `false`.
       - Nếu `targetFolderId !== '' && this.isDescendantFolder(nodeId, targetFolderId)` $\rightarrow$ `false`.
     - Trả về `true`.
3. **Action `moveFolder(id: string, targetFolderId: string)`:**
   - Gọi `const result = await MoveFolder(id, targetFolderId)`.
   - Nếu `result.success`:
     - Hiển thị toast `'Đã di chuyển'` qua `useUiStore().showToast('Đã di chuyển')`.
     - Gọi `await this.loadTree()`.
     - Nếu `targetFolderId !== ''`:
       - Tìm đường dẫn tổ tiên `const path = this.findFolderPath(this.tree, targetFolderId)`.
       - Mở rộng toàn bộ folder trên đường dẫn đích: `path?.forEach(node => this.expandedFolders.add(node.id))`.
     - Nếu tab của folder đang mở trong `tabStore`, đồng bộ lại tên hiển thị trên tab (`tabStore.updateTabMeta('folder', id, { name: updatedNode.name })`) phòng trường hợp tên được tự động thêm hậu tố chống trùng.
   - Nếu `!result.success`:
     - Hiển thị toast lỗi: `useUiStore().showToast(result.error?.message || 'Không thể di chuyển thư mục')`.
     - Nếu `result.error?.code === 'NOT_FOUND'`, gọi `await this.loadTree()` để đồng bộ lại cây.

### 2.2. Context Menu "Di chuyển tới ▸" cho Folder (`projects/frontend/src/components/TreeContextMenu.vue`)

1. Trong nhánh `<template v-if="uiStore.contextMenu.nodeType === 'folder'">`, khi `uiStore.contextMenu.nodeId !== ''` (tức không phải menu chuột phải vào khoảng trống gốc), bổ sung mục **"Di chuyển tới ▸"** mở submenu danh sách điểm đến (tương tự như của Request):
   - Tùy chọn đầu tiên: **`Gốc collection`** (`handleMove('')`).
   - Danh sách các folder đích khả dụng (`availableTargetFolders`):
     - Lọc từ `flatFolders` để **loại bỏ** chính folder đang chọn (`folder.id === uiStore.contextMenu.nodeId`) và **toàn bộ các folder con/cháu** của nó (`collectionStore.isDescendantFolder(uiStore.contextMenu.nodeId, folder.id)`).
2. Cập nhật `handleMove(targetFolderId: string)`:
   - Nếu `uiStore.contextMenu?.nodeType === 'folder'`, gọi `collectionStore.moveFolder(uiStore.contextMenu.nodeId, targetFolderId)`.
   - Nếu `uiStore.contextMenu?.nodeType === 'request'`, gọi `collectionStore.moveRequest(uiStore.contextMenu.nodeId, targetFolderId)`.

### 2.3. HTML5 Drag & Drop trên `TreeNodeRow.vue` và `AppSidebar.vue`

1. **Khởi tạo kéo (`TreeNodeRow.vue`):**
   - Trên phần tử row (`[data-tree-row="true"]`), gắn thuộc tính `:draggable="!isEditing"`.
   - `@dragstart="onDragStart"`:
     - Nếu `isEditing.value` $\rightarrow$ `e.preventDefault(); return`.
     - Lưu thông tin node đang kéo vào store (`store.setDraggingNode({ id: props.node.id, type: props.node.type as 'folder' | 'request' })`) và ghi vào `e.dataTransfer`:
       - `e.dataTransfer.effectAllowed = 'move'`
       - `e.dataTransfer.setData('application/x-hecto-tree-node', JSON.stringify({ id: props.node.id, type: props.node.type }))`
       - `e.dataTransfer.setData('text/plain', props.node.id)`
     - Áp dụng style làm mờ nhẹ (`opacity-50`) cho row đang được kéo (`data-dragging="true"`).
   - `@dragend="onDragEnd"`:
     - Xóa trạng thái `draggingNode` và mọi trạng thái highlight drop target.

2. **Thả vào Folder (`TreeNodeRow.vue`):**
   - Khi kéo qua một row trong cây (`@dragover` / `@dragenter` / `@dragleave` / `@drop`):
     - Chỉ các row có `isFolder === true` mới đóng vai trò là drop target cho folder đích.
     - Kiểm tra hợp lệ thông qua `store.canMoveNodeTo(dragging.id, dragging.type, props.node.id)`:
       - **Hợp lệ:** Gọi `e.preventDefault()`, đặt `e.dataTransfer.dropEffect = 'move'`, bật trạng thái `isDragOver = true` (`data-drop-target="valid"`), áp dụng highlight trực quan: `ring-2 ring-inset ring-brand-primary bg-brand-primary/15`.
       - **Không hợp lệ** (ví dụ: kéo folder cha vào chính nó hoặc vào folder con/cháu của nó, hoặc kéo vào chính folder cha hiện tại):
         - Không cho phép drop (hoặc đặt `e.dataTransfer.dropEffect = 'none'`), hiển thị phản hồi chặn trực quan (`data-drop-target="invalid"`, `cursor-not-allowed opacity-60`) nếu đang hover vào chính cây con của folder đang kéo.
     - Khi `@drop.stop.prevent="onDrop"` trên folder hợp lệ:
       - Reset `isDragOver = false` và `store.setDraggingNode(null)`.
       - Nếu `dragging.type === 'folder'` $\rightarrow$ `await store.moveFolder(dragging.id, props.node.id)`.
       - Nếu `dragging.type === 'request'` $\rightarrow$ `await store.moveRequest(dragging.id, props.node.id)`.

3. **Vùng thả về Gốc Collection (`AppSidebar.vue`):**
   - Khu vực danh sách cây (`[data-test="tree-root-drop-zone"]` bao quanh vùng chứa cây thư mục hoặc khoảng trống cuối danh sách trong `AppSidebar.vue`) lắng nghe `@dragover`, `@dragleave`, `@drop`:
     - Khi sự kiện kéo đi vào vùng trống của container (hoặc phần tử con không phải là một folder drop target đã bắt sự kiện), kiểm tra `store.canMoveNodeTo(dragging.id, dragging.type, '')`.
     - Nếu hợp lệ (node đang nằm trong một folder con và muốn kéo ra ngoài gốc collection):
       - Cho phép drop (`e.preventDefault()`, `dropEffect = 'move'`).
       - Hiển thị highlight viền/nền vùng thả gốc (`data-root-drop-active="true"`, ví dụ: `ring-2 ring-inset ring-brand-primary/60 bg-brand-primary/5`) hoặc thanh chỉ báo thả vào Gốc Collection ở cuối danh sách.
     - Khi `@drop`:
       - Nếu `dragging.type === 'folder'` $\rightarrow$ `await store.moveFolder(dragging.id, '')`.
       - Nếu `dragging.type === 'request'` $\rightarrow$ `await store.moveRequest(dragging.id, '')`.

---

## 3. Ma trận Kiểm thử (Verification Matrix)

| Tầng | File kiểm thử | Kịch bản kiểm thử bắt buộc |
|---|---|---|
| **Go Backend** | `projects/service/collection_test.go` | 1. Di chuyển folder từ root vào folder khác (`MoveFolder_IntoFolder`).<br>2. Di chuyển folder lồng sâu về gốc collection `targetFolderID == ""` (`MoveFolder_ToRoot`).<br>3. Chặn di chuyển folder vào chính nó (`folderID == targetFolderID` $\rightarrow$ `ErrValidation`).<br>4. Chặn di chuyển folder cha vào folder con hoặc cháu (L1 $\rightarrow$ L2, L1 $\rightarrow$ L3 $\rightarrow$ `ErrValidation`).<br>5. Cập nhật chính xác đường dẫn trong `FileSystem` index cho cả folder được chuyển lẫn các sub-folder và request con bên trong (`FindByUUID` trả về đường dẫn mới ngay sau `MoveFolder`).<br>6. Xử lý trùng tên tại thư mục đích và no-op khi di chuyển vào chính folder cha hiện tại.<br>7. Chặn di chuyển vào `environments/`, ngoài `rootPath`, hoặc ID không tồn tại / ID là request. |
| **Vue Component & Store** | `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` & `AppSidebar.test.ts` | 1. Action `collectionStore.moveFolder` gọi `MoveFolder`, reload tree và tự động thêm `targetFolderId` (cùng các folder cha) vào `expandedFolders`.<br>2. Context menu của Folder hiển thị `"Di chuyển tới ▸"`, ẩn/loại trừ chính folder đó và các folder con/cháu khỏi danh sách đích, gọi `moveFolder` khi click.<br>3. Kéo thả (`dragstart`, `dragover`, `drop`) một Request hoặc Folder vào một Folder đích hợp lệ hiển thị class highlight (`data-drop-target="valid"`) và kích hoạt `moveRequest` / `moveFolder`.<br>4. Chặn kéo thả Folder vào chính nó hoặc vào Folder con của nó ngay trên UI (không gọi `moveFolder`).<br>5. Kéo thả Folder/Request từ thư mục con ra vùng thả gốc (`AppSidebar.vue`) di chuyển về gốc collection (`targetFolderId = ""`). |
| **Typecheck** | `bun run type-check` | `vue-tsc --noEmit` vượt qua 100% không có lỗi kiểu dữ liệu. |

# Epic 2 Context: Collection Management & Sidebar Navigation

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Sidebar hiển thị collection tree từ disk, cho phép tạo/đổi tên/xóa/sao chép/di chuyển folder và request. Tree view phản ánh 1:1 cấu trúc disk. Click request → load vào editor. Right-click → context menu CRUD. Phát hiện unsaved changes khi chuyển request.

## Stories

- Story 2.1: Collection Tree Loading & Sidebar Rendering
- Story 2.2: Create Request & Create Folder
- Story 2.3: Select Request & Load into Editor
- Story 2.4: Rename Request & Rename Folder
- Story 2.5: Delete Request & Delete Folder
- Story 2.6: Duplicate & Move Request
- Story 2.7: Context Menu & Unsaved Changes Detection
- Story 2.8: Epic 2 Deferred Work Cleanup

## Requirements & Constraints

- Cấu trúc disk phản ánh 1:1 tree sidebar — folder trên disk = folder trong UI.
- Mọi entity dùng UUID v4 làm identity. Slug filename sinh lúc create, không đổi khi rename.
- Wails bindings entity-oriented: `GetCollectionTree`, `GetRequest`, `SaveRequest`, `DeleteRequest`, `DuplicateRequest`, `MoveRequest`, `CreateFolder`, `RenameFolder`, `DeleteFolder` — mỗi binding trả `Result{Success, Data, Error{Code, Message}}`.
- File format JSON, UTF-8. Folder metadata lưu trong `_folder.json` (prefix `_` để phân biệt với request files).
- Unsaved detection dùng deep compare `JSON.stringify` sorted-key giữa `original` và `current` trong requestStore.
- Click target tối thiểu 32px cho button, 24px cho checkbox. Sidebar request row cao tối thiểu 32px.
- Keyboard: ↑/↓ di chuyển, Enter chọn, F2 rename, Delete xóa, Ctrl+N request mới, Ctrl+Shift+N folder mới, Ctrl+D duplicate.

## Technical Decisions

- **collectionStore** giữ `tree: Folder[]`, `activeRequestId`, `loading`. Actions: `loadTree()`, `selectRequest(id)`, `createFolder()`, `deleteFolder()`, `renameFolder()`.
- **requestStore** giữ `original` (from disk) và `current` (form state). `isDirty` computed từ deep compare.
- **Go service layer**: `CollectionService.GetTree()` đọc disk, build tree. UUID→path index được build lúc `GetCollectionTree` và cập nhật khi CRUD.
- **Storage layer**: `FindByUUID` dùng in-memory index O(1), fallback walk. WriteJSON dùng atomic write (temp → fsync → rename).
- **Slug generation**: lowercase → strip diacritics → replace spaces/special chars → dedup hyphens → trim. Collision: append `-1`, `-2`.
- Vue gọi Go qua `frontend/src/wailsjs/go/main/App.ts` (auto-generated bởi Wails).

## UX & Interaction Patterns

- Sidebar rộng 260px, nền `surface-raised`, viền phải `border-default`.
- Folder row: icon caret (xoay 90° khi mở/đóng, 150ms ease) + icon folder-notch + tên `ui-sm`.
- Request row: indent 28px, border-left 2px (transparent mặc định, `brand-primary` khi active), method badge `mono-xs` bold color-coded + tên `ui-sm`.
- Hover: nền `surface-hover`, nút "..." fade in 150ms → mở context menu.
- Empty folder hiển thị không có children.
- Confirm dialog khi xóa: 2 nút "Xóa" (destructive, đỏ) + "Hủy".
- Unsaved indicator: amber dot (w-2, h-2) cạnh tên request.
- Prompt khi chuyển request có unsaved: 3 nút "Lưu" / "Bỏ qua" / "Hủy".
- Context menu folder: Đổi tên, Tạo request mới, Tạo thư mục con, Xóa.
- Context menu request: Đổi tên, Sao chép, Di chuyển tới..., Xóa.

## Cross-Story Dependencies

- Story 2.1 (Tree loading + render) là foundation — các story sau cần tree đã render.
- Story 2.3 (Select request) cần 2.1 (tree phải hiển thị) và populate requestStore.
- Story 2.4 (Rename) cần 2.3 (request phải load vào editor).
- Story 2.7 (Context menu + unsaved) cần 2.3–2.6 đã implement các action tương ứng.
- Story 2.8 (Cleanup) chờ tất cả 2.1–2.7 xong.
- Epic 1 retrospective action item: wire `s.fs.IndexRebuild(collectionRoot)` tại đầu `CollectionService.GetTree` (story 2.1). Cũng cần xử lý: `FindByUUID` early return `ErrNotFound` nếu uuid rỗng.

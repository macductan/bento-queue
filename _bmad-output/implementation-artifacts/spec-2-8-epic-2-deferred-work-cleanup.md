---
title: 'Story 2.8: Epic 2 Deferred Work Cleanup'
type: 'chore'
created: '2026-10-05'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 2 để lại nợ: folder UUID không vào index qua walk (fallback/rebuild), một số binding trả `IO_ERROR` kèm đường dẫn thô thay vì `NOT_FOUND`, `Save` tái tạo file đã bị xóa ngoài app, thiếu test Rename; sidebar thiếu ↑/↓/Enter, nút "..." hover, context menu có thể tràn viewport, trạng thái "Loading..." unmount cả tree mỗi lần CRUD (mất focus); gofmt lỗi 6 file.

**Approach:** Sửa backend + bổ sung test theo I/O Matrix; hoàn thiện keyboard nav, nút "...", clamp menu trong viewport, empty state tiếng Việt; dọn TODO cũ và chạy gofmt/vet/vue-tsc sạch. Đóng các mục deferred-work của Epic 2 bằng fix hoặc bằng test chứng minh không tái hiện.

## Boundaries & Constraints

**Always:**
- Mọi lỗi từ service trả `Result{Error{Code, Message}}`; message tiếng Việt, không chứa đường dẫn tuyệt đối. Lỗi storage có tiền tố `NOT_FOUND` → code `NOT_FOUND`.
- Index folder lưu **đường dẫn thư mục** (giữ quy ước hiện tại của `buildFolderNode`).
- ↑/↓ di chuyển focus giữa các row **đang hiển thị** (cả folder lẫn request, theo thứ tự DOM); Enter trên request = `selectRequest` (đi qua guard unsaved), trên folder = toggle. Row có focus ring `focus-visible`.
- Nút "..." (`aria-label="Tùy chọn"`) mỗi row, ẩn mặc định, hiện khi hover/focus row trong 150ms; click mở cùng context menu tại vị trí nút.
- Menu và submenu "Di chuyển tới" không bao giờ vượt viewport: clamp top/left theo kích thước thật sau khi render; submenu lật sang trái khi thiếu chỗ bên phải.
- Phím tắt toàn cục (Ctrl+N/Ctrl+Shift+N) bị bỏ qua khi dialog unsaved đang mở.
- Rename request đang active chỉ patch `name` trong `original` và `current` (không reload, giữ edit chưa lưu).

**Never:**
- Không thêm design token, không thêm test framework frontend, không đổi định dạng file trên đĩa.
- Không làm Ctrl+S, ô nhập editor, drag-and-drop, link "Import Postman" (Epic 3/5).
- Không sửa TODO thuộc Epic 3–5 (`environment.go`, `executor.go`, `importer.go`, `ContentArea.vue`).

**Decisions:**
- Xóa `_bmad-output/implementation-artifacts/diff-2-5.patch` khỏi repo (người dùng cho phép ngoại lệ với quy tắc `_bmad-output/`).
- "Vue linting" = `vue-tsc --noEmit` exit 0; không thêm ESLint hay dependency mới.
- Giữ toàn bộ phạm vi trong một spec (~3.000 token, người dùng chấp nhận rủi ro).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Folder qua walk | Folder tạo ngoài app sau `GetTree`, gọi `RenameFolder(id)` | Fallback walk tìm thấy, đổi tên OK | N/A |
| Rebuild có folder | `IndexRebuild` trên tree 3 cấp | Index chứa cả folder UUID → thư mục | N/A |
| UUID rỗng | `FindByUUID("")` | Không walk | `NOT_FOUND` |
| Xóa file đã mất | Request bị xóa ngoài app, `DeleteRequest` | Index dọn entry | `NOT_FOUND`, không lộ path |
| Lưu file đã mất | Request bị xóa ngoài app, `SaveRequest` | Không tạo lại file | `NOT_FOUND` |
| Get file hỏng | JSON lỗi, `GetRequest` | — | `PARSE_ERROR`, message không lộ path |
| Lồng sâu | 4 cấp folder, tạo/đổi tên/move ở cấp 4 | Đúng thư mục trên đĩa | N/A |
| Ký tự đặc biệt | Tên `Đăng nhập / "test" <1>` | Slug hợp lệ, tên hiển thị nguyên vẹn | N/A |
| Tên rỗng | Rename `"   "` | Không ghi | `VALIDATION` |
| Symlink thư mục | Symlink trỏ ngược lên root | `GetTree` thành công, không đệ quy vào symlink | N/A |
| Collection rỗng | Root không có request | Sidebar: "Chưa có request nào." + link "Tạo mới" | N/A |
| Request tên rỗng trên đĩa | `"name": ""` | Row hiển thị "(không tên)" in nghiêng | N/A |

</frozen-after-approval>

## Code Map

- `projects/storage/filesystem.go` -- `FindByUUID` L215: early return `NOT_FOUND` khi uuid rỗng. `walkJSONEntities` L244: với `_folder.json` gọi `fn(filepath.Dir(path), id, nil)` (vẫn bỏ `collection.json`, `environments/`) → `IndexRebuild` và `walkFindUUID` tự có folder.
- `projects/service/collection.go` -- xóa TODO L32; `GetTree` L40: `IndexRebuild` lỗi → `logger.Warn` rồi vẫn `buildTree`. `MoveRequest` L369/L385: thay `strings.HasPrefix(..., rootPath)` bằng helper `isInsideRoot(root, p)` dùng `filepath.Rel` (tránh `/col` khớp `/col2`). `DeleteFolder` L329: map lỗi qua helper mới.
- `projects/service/errors.go` -- MỚI: `storageErrCode(err) string` (tiền tố `NOT_FOUND`/`PARSE_ERROR` → code tương ứng, còn lại `IO_ERROR`).
- `projects/service/request.go` -- `Get` L37, `Save` L52 (thêm `Exists(path)` trước ghi), `Delete` L71 (NOT_FOUND → `IndexDelete` + `NOT_FOUND`): message tiếng Việt cố định, chi tiết chỉ vào `logger`.
- `projects/service/collection_test.go`, `request_test.go`, `projects/storage/filesystem_test.go` -- thêm test theo Matrix + `TestRequestRename`, `TestRenameFolder` (thành công, rỗng, không tồn tại, cắt 255 rune), `IndexRebuild` với JSON hỏng (retro Epic 1). Dùng helper `writeFolder`, `setupCollectionService` sẵn có.
- `projects/frontend/src/components/TreeNodeRow.vue` -- `onKeyDown` L92: thêm ArrowUp/ArrowDown (query `[data-tree-row]` trong `nav`, focus kế cận), Enter; row thêm `data-tree-row`, `group`, `focus-visible:` ring; nút "..." `opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity duration-150`, `@click.stop` → `openContextMenu(rect.left, rect.bottom, ...)`; tên rỗng → "(không tên)".
- `projects/frontend/src/components/TreeContextMenu.vue` -- sau `nextTick` đo `menuRef.getBoundingClientRect()`, tính `top/left` đã clamp (lề 4px); submenu: nếu `right + 224 > innerWidth` dùng `right-full mr-1` thay `left-full ml-1`, `max-h` theo khoảng còn lại.
- `projects/frontend/src/components/AppSidebar.vue` -- L51: chỉ hiện "Đang tải..." khi `loading && tree.length === 0`; empty state theo UX L88 kèm nút link "Tạo mới" → `store.createRequest()`.
- `projects/frontend/src/App.vue` -- `handleKeyDown` L16: thêm `uiStore.unsavedPrompt !== null`.
- `projects/frontend/src/stores/collectionStore.ts` -- `renameRequest` L125-133: thay `loadRequest` bằng patch `name` trên `original`/`current`.
- `projects/app.go`, `model/types.go`, `slug/slug.go`, các `_test.go` -- `gofmt -w`.

## Tasks & Acceptance

**Execution:**
- [ ] `projects/storage/filesystem.go` -- index folder qua walk, guard uuid rỗng -- đóng deferred "folder UUID sau restart" + retro item 4
- [ ] `projects/service/errors.go`, `request.go`, `collection.go` -- map mã lỗi, `Save` không tái tạo file, `GetTree` best-effort, `isInsideRoot`, xóa TODO cũ -- Result chuẩn cho mọi binding
- [ ] `projects/service/*_test.go`, `projects/storage/filesystem_test.go` -- test toàn bộ I/O Matrix phía Go + Rename + symlink + JSON hỏng
- [ ] `projects/frontend/src/components/TreeNodeRow.vue`, `AppSidebar.vue` -- ↑/↓/Enter, focus ring, nút "...", empty/loading state, tên rỗng
- [ ] `projects/frontend/src/components/TreeContextMenu.vue` -- clamp viewport + lật submenu
- [ ] `projects/frontend/src/App.vue`, `stores/collectionStore.ts` -- guard phím tắt khi dialog unsaved, rename giữ edit
- [ ] `projects/**/*.go` -- `gofmt -w .`
- [ ] `_bmad-output/implementation-artifacts/diff-2-5.patch` -- xóa file -- đóng deferred item từ spec 2.5
- [ ] `_bmad-output/implementation-artifacts/deferred-work.md` -- không sửa entry cũ; ghi kết quả đóng từng mục vào Implementation Notes

**Acceptance Criteria:**
- Given focus ở một row, when nhấn ↓ ở row cuối hoặc ↑ ở row đầu, then focus đứng yên (không lỗi).
- Given vừa rename/duplicate/move bằng bàn phím, when tree reload, then row vẫn còn focus được và tree không nhấp nháy "Đang tải...".
- Given chuột phải sát mép phải/dưới cửa sổ, when menu mở (kể cả submenu), then toàn bộ menu nằm trong viewport.
- Given hover hoặc focus row, when nhấn nút "...", then menu đúng loại node mở ngay dưới nút.
- Given `isDirty` (deep compare mọi field: method, url, headers, params, body, name), when chuyển request, then dialog unsaved hiện — xác nhận bằng code review do editor còn read-only.

## Spec Change Log

## Review Triage Log

## Design Notes

**Symlink:** `os.ReadDir` trả `DirEntry` kiểu symlink → `IsDir()` false nên `buildTree`/`WalkDir` không đi theo; deferred item đóng bằng test chứng minh, không thêm depth guard.

**Index folder trong walk:** một nguồn sự thật cho cả rebuild lẫn fallback; `buildFolderNode` vẫn `IndexSet` (idempotent).

## Verification

**Commands:**
- `cd projects && test -z "$(gofmt -l .)"` -- expected: exit 0
- `cd projects && GOENV_VERSION=1.25.3 go vet ./... && GOENV_VERSION=1.25.3 go test ./...` -- expected: pass
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: exit 0

**Manual checks (if no CLI):**
- `wails dev` smoke: tạo folder → tạo request trong đó → F2 rename → Ctrl+D → "Di chuyển tới" → Delete; ↑/↓/Enter qua tree 3+ cấp; chuột phải sát góc dưới-phải.

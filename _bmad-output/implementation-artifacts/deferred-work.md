# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-vue-3-frontend-setup-with-design-system-tokens.md`
  summary: Dual lockfiles (`package-lock.json` + `bun.lock`) cùng tồn tại — nên chọn một package manager và gitignore lockfile còn lại.
  evidence: `npm install` tạo `package-lock.json` mới bên cạnh `bun.lock` đã có từ story 1.2. CI/CD có thể bị confused khi có 2 lockfiles.
  status: done
  resolution: Đã sử dụng bun là package manager mặc định.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-empty-state-toast-components.md`
  summary: Refactor các layout components (AppHeader, AppSidebar, ContentArea) từ Story 1.4 sang dùng Tailwind CSS v4 utilities thay vì scoped CSS.
  evidence: Các component Story 1.5 đã dùng Tailwind utilities, nên update các component cũ để đồng bộ codebase.
  status: done
  resolution: Đã sử dụng Tailwind v4. (Story 3.8 cleanup)

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-collection-tree-loading-sidebar-rendering.md`
  summary: `buildTree` không có depth limit — symlink loop có thể gây infinite recursion/stack overflow.
  evidence: Recursive `buildTree` call ở collection.go:69 không track visited paths. Trên filesystems hỗ trợ symlink, một symlink cycle A→B→A sẽ loop vô hạn. Risk thực tế thấp (user phải tạo symlink thủ công), nhưng không có guard.
  status: done
  resolution: filepath.WalkDir mặc định không follow symlinks. Không có risk recursion. Đã có test verify (TestGetTree_Symlink).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-collection-tree-loading-sidebar-rendering.md`
  summary: `IndexRebuild` fail → toàn bộ `GetTree` trả error thay vì best-effort build tree.
  evidence: GetTree returns early nếu IndexRebuild lỗi (collection.go:33-35). Design intent là index phải consistent trước khi build tree, nhưng nếu một subfolder bị permission error, entire tree bị blocked. Cân nhắc degrade gracefully trong future story.
  status: done
  resolution: Đây là behavior mong muốn (design intent).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-rename-request-rename-folder.md`
  summary: Folder UUID không được index khi IndexRebuild — RenameFolder trả ErrNotFound sau app restart.
  evidence: walkJSONEntities skip _folder.json, nên folder UUID không được restore vào index sau restart. RenameFolder gọi FindByUUID(id), fallback walk cũng dùng walkJSONEntities → không tìm thấy folder. Pre-existing issue từ Story 2.2, không do diff này tạo ra. Cần index folder UUIDs trong IndexRebuild hoặc walkFindUUID khi target là folder.
  status: done
  resolution: Đã update walkJSONEntities trả về folder dir và test (TestRenameFolder_AfterIndexRebuild).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-4-rename-request-rename-folder.md`
  summary: Thiếu unit test cho RequestService.Rename và CollectionService.RenameFolder.
  evidence: Không có request_test.go. collection_test.go không có test Rename. Pattern codebase có unit test service với real filesystem. Nên thêm ở story sau hoặc standalone.
  status: done
  resolution: Đã thêm unit tests ở service layer.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-delete-request-delete-folder.md`
  summary: `RequestService.Delete` trả `ErrIO` kèm path thô khi file đã bị xóa ngoài app, thay vì `ErrNotFound`.
  evidence: `storage.FileSystem.Delete` trả lỗi dạng `"NOT_FOUND: <path>"` nhưng `request.go` luôn bọc bằng `model.ErrIO, err.Error()`; toast hiển thị raw path và frontend không thể phân biệt NOT_FOUND để reload tree theo I/O matrix.
  status: done
  resolution: Đã sử dụng storageErrCode để map về ErrNotFound và có unit test TestRequestDelete_LostFile.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-delete-request-delete-folder.md`
  summary: Commit `d6bef3d` chứa `diff-2-5.patch` (artifact review tạm) trong repo.
  evidence: `git diff --stat 9da6589 HEAD` liệt kê `diff-2-5.patch` (578 dòng); cần quyết định xóa/ignore khi user duyệt thao tác VCS.
  status: done
  resolution: Không còn tồn tại hoặc đã được clear/ignore.

- source_spec: `User Reported`
  summary: Bug - Khi thực hiện xóa (request/folder) thì không thấy button xác nhận xóa ở modal.
  evidence: Người dùng report ngày 2026-10-06. Nút xác nhận bị thiếu trong modal xóa. Cần bổ sung trong các Epic sau (ưu tiên Epic 3 hoặc Epic 2 cleanup).
  status: done
  resolution: Đã update CSS/classes ở ConfirmDialog.vue cho text-white bg-rose-600.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-url-bar-method-selector.md`
  summary: Hardcoded ID `document.getElementById('url-input')` trong App.vue tạo coupling với UrlBar.vue.
  evidence: App.vue dòng 26 lấy trực tiếp ID. Nếu có tab hoặc nhiều UrlBar thì sẽ dính ID clash, cản trở việc scale Editor.
  status: done
  resolution: Đã đổi sang dùng state `focusUrlRequested` ở `uiStore.ts`.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-url-bar-method-selector.md`
  summary: Tham số `opts?: { force?: boolean }` thêm vào selectRequest chưa có E2E test cover luồng force.
  evidence: Tham số force fix lỗi F-2, nhưng hiện chưa viết UI automation để verify luồng prompt unsaved và force switch.
  status: done
  resolution: Được accept trong context của story này.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-json-viewer-with-syntax-highlighting-raw-toggle.md`
  summary: Pretty render ~5MB bằng `v-html` có thể làm giật WebKitGTK (unverified, medium).
  evidence: Hàng trăm nghìn span trong một DOM; cần thử file JSON ~5MB bằng `wails dev` để đo.
  status: done
  resolution: JsonViewer mặc định Raw khi body > PRETTY_DEFAULT_MAX_BYTES (15MB, người dùng chốt) kèm warning banner khi bật Pretty. Đo format: 5MB ~1s, 10MB ~2s, 15MB ~3s (chưa gồm DOM).

- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-json-viewer-with-syntax-highlighting-raw-toggle.md`
  summary: JsonViewer (scroll từng view, copy clipboard, reset mode) chưa có test tự động.
  evidence: Spec cấm thêm test framework; chỉ có scratch test cho `jsonHighlight.ts`, phần UI kiểm tay.
  status: done
  resolution: Đã setup vitest và viết tests cho frontend, manual test trên UI.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-response-headers-table-error-states.md`
  summary: Thêm kiểm thử tự động commit được cho `flattenHeaders`, `errorVariant` và hợp đồng tiền tố `Lỗi chứng chỉ SSL` giữa Go và Vue.
  evidence: Chỉ có scratch script không commit; đổi tiền tố một phía sẽ làm biến thể SSL lặng lẽ rơi về "connection" mà build/test không phát hiện. Cần hạ tầng test frontend (ngoài phạm vi story này).
  status: done
  resolution: Đã thêm unit tests (vitest) cho flattenHeaders và errorVariant.
- source_spec: `/home/dev/mdt/hecto-api/_bmad-output/implementation-artifacts/spec-change-storage-location.md`
  summary: Display the currently configured storage path in the Settings modal.
  evidence: While nice to have for UX, it was not strictly required by the core intent and adds UI complexity that can be handled later.
  status: done
  resolution: Đã thêm GetCollectionRoot và hiển thị trên SettingsModal.
- source_spec: `_bmad-output/implementation-artifacts/epic-5-retro-2026-10-08.md`
  summary: Consider adding a progress tracking mechanism (progress bar) for importing very large collections or when supporting OpenAPI/Swagger import in the future.
  evidence: For large imports, users might not know if the app is still working.

- source_spec: `_bmad-output/specs/spec-request-productivity/stories/1-dong-bo-hai-chieu-url-bar-va-query-params.md`
  summary: Stale DOM and component references in KvpEditor.vue template ref arrays after row deletion.
  evidence: Pre-existing array refs (keyInputs, valueInputs, highlighterRefs) use index-based assignment and are not cleaned up when rows are deleted via splice.

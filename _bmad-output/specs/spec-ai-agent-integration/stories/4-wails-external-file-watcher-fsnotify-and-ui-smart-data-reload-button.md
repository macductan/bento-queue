---
title: 'Wails External File Watcher (fsnotify) & UI Smart Data Reload Button'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '0b3cf5f7b396676321f8c604c0b6132f0df711a5'
context:
  - '_bmad-output/specs/spec-ai-agent-integration/SPEC.md'
  - '_bmad-output/specs/spec-ai-agent-integration/cli-and-sync-architecture.md'
---

<intent-contract>

## Intent

**Problem:** Khi AI Agent hoặc người dùng thực thi các lệnh `hecto` CLI (tạo/sửa/xóa/di chuyển collection, environment, folder, request hoặc chạy script cập nhật biến), ứng dụng Wails Desktop (`hecto-api`) đang mở song song cần phát hiện thay đổi trên đĩa (mà không bị nhiễu bởi chính các thao tác ghi của Wails), báo hiệu trên giao diện, và cung cấp cơ chế tải lại thông minh (`smartReload`) giúp cập nhật cây thư mục, biến môi trường, và tab đang mở mà không làm đóng cây thư mục hay ghi đè mất dữ liệu đang chỉnh sửa dở (`isDirty === true`).

**Approach:** Bổ sung cơ chế đánh dấu self-write (`RecordSelfWrite` / `IsWithinSelfWriteWindow`) trong `storage.FileSystem`, tạo `CollectionWatcher` (`projects/storage/watcher.go`) dùng `fsnotify` theo dõi đệ quy `collRoot` với debounce `300ms` và phát sự kiện `collection:external-change`, đồng bộ `active_collection` từ `config.json` trên đĩa trong `App.ListCollections()` và `App.GetCollectionTree()`, đồng thời bổ sung `hasExternalChanges` + `smartReload()` trong `collectionStore.ts`, nút Reload trên `AppSidebar.vue`, đồng bộ `FolderEditor.vue`, và gắn `Ctrl+R` / `Cmd+R` / `F5` trong `App.vue` vào `collectionStore.smartReload()`.

## Boundaries & Constraints

**Always:**
- Trong `storage.FileSystem` (`projects/storage/filesystem.go`), gọi `RecordSelfWrite()` ở cả đầu hàm và `defer f.RecordSelfWrite()` ở cuối hàm trong `WriteJSON`, `Delete`, `MoveFile`, `MakeDir`, nhưng bỏ qua không ghi nhận self-write nếu đường dẫn nằm trong `.history/` hoặc là tệp `config.json`.
- Trong `CollectionWatcher` (`projects/storage/watcher.go`), theo dõi đệ quy `collRoot` và tự động đăng ký đệ quy mọi thư mục con mới tạo (`fsnotify.Create` / `fsnotify.Rename`), bỏ qua `.tmp-*`, `.git`, `.history`, bỏ qua sự kiện khi `fs.IsWithinSelfWriteWindow(400 * time.Millisecond)` là `true`, và debounce `300ms` trước khi gọi callback phát sự kiện `collection:external-change`.
- Trong `App.ListCollections()` và `App.GetCollectionTree()` (`projects/app.go`), đọc lại `config.json` từ đĩa (hoặc đồng bộ qua `ConfigService`) để phát hiện khi CLI vừa đổi hoặc xóa `active_collection` và tự động cập nhật `a.activeCollection`, `a.collRoot`, `a.fs.SetCollectionRoot(a.collRoot)` và `CollectionWatcher`.
- Trong `collectionStore.smartReload()`, gọi `await Promise.all([this.loadCollections(), this.loadTree(), envStore.loadAll()])` rồi gọi tường minh `await envStore.syncActiveEnvFromCollection()`, giữ nguyên các ID còn tồn tại trong `expandedFolders`, đóng các tab của thực thể đã bị xóa, cập nhật `name`/`method` cho tab còn tồn tại, nạp lại dữ liệu mới cho `activeTab` nếu sạch (`!isDirty`), và bảo vệ tuyệt đối không ghi đè kèm hiển thị toast `'Dữ liệu trên đĩa đã thay đổi, nhưng tab hiện tại đang có chỉnh sửa chưa lưu nên được giữ nguyên.'` nếu `activeTab` (Request hoặc Folder) đang có `isDirty === true`.
- Trong `AppSidebar.vue`, hiển thị nút Reload (`data-test="sidebar-reload-btn"`) kèm chấm tròn báo hiệu (`data-test="external-change-badge"`) khi `store.hasExternalChanges === true`.
- Trong `App.vue`, phím tắt `Ctrl+R`, `Cmd+R`, `F5` phải gọi `void collectionStore.smartReload()` thay vì `window.location.reload()`.

**Never:**
- Không gọi `window.location.reload()` khi nhấn `Ctrl+R`, `Cmd+R`, hoặc `F5`.
- Không ghi đè nội dung tab Request hoặc Folder đang mở khi `isDirty === true`.
- Không ghi nhận self-write cho các thao tác trong `.history/` hoặc `config.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CLI tạo/sửa file trong Collection đang mở | File JSON hoặc thư mục con mới được tạo/sửa bởi tiến trình ngoài | `CollectionWatcher` phát sự kiện `collection:external-change` sau debounce 300ms; `store.hasExternalChanges` bật `true` và hiển thị `data-test="external-change-badge"` | Bỏ qua `.tmp-*`, `.git`, `.history` |
| Wails UI tự lưu Request/Folder hoặc ghi `.history/` | `WriteJSON` trên thực thể hoặc `.history/` | Thao tác thực thể của Wails nằm trong cửa sổ 400ms nên không phát `collection:external-change`; thao tác `.history/` không cập nhật `lastSelfWriteNano` và bị watcher bỏ qua | Không báo giả (false positive) |
| Nhấn nút Reload hoặc `Ctrl+R`/`F5` khi tab sạch (`!isDirty`) | `activeTab` là Request hoặc Folder có `isDirty === false` | Cây thư mục giữ nguyên `expandedFolders`, `activeEnvId` đồng bộ theo `collection.json`, và nội dung Request/Folder được nạp mới từ đĩa | Đóng tab nếu thực thể đã bị xóa trên đĩa |
| Nhấn nút Reload hoặc `Ctrl+R`/`F5` khi tab đang sửa dở (`isDirty === true`) | `activeTab` là Request (`requestStore.isDirty === true`) hoặc Folder (`activeTab.isDirty === true`) | Cây thư mục và danh sách biến vẫn cập nhật, nhưng nội dung tab đang gõ dở được giữ nguyên và hiển thị toast cảnh báo | Không mất dữ liệu chưa lưu |

</intent-contract>

## Code Map

- `projects/storage/filesystem.go` -- Bổ sung `lastSelfWriteNano`, `RecordSelfWrite`, `IsWithinSelfWriteWindow` và tích hợp vào `WriteJSON`, `Delete`, `MoveFile`, `MakeDir`.
- `projects/storage/watcher.go` -- Bộ theo dõi thư mục đệ quy `CollectionWatcher` sử dụng `fsnotify` kèm lọc self-write và debounce 300ms.
- `projects/storage/watcher_test.go` -- Kiểm thử đơn vị cho `CollectionWatcher` và cơ chế lọc self-write.
- `projects/app.go` -- Tích hợp `CollectionWatcher` phát sự kiện `collection:external-change` và đồng bộ `active_collection` từ đĩa trong `ListCollections`/`GetCollectionTree`/`ListEnvironments`/`GetRequest`/`GetEnvironment`/`LoadFolder`.
- `projects/app_test.go` -- Kiểm thử đồng bộ `active_collection` từ đĩa và tích hợp watcher trong `App`.
- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung `hasExternalChanges`, lắng nghe `collection:external-change`, và hành động `smartReload()`.
- `projects/frontend/src/components/FolderEditor.vue` -- Cập nhật `handleExternalFolderUpdated` hỗ trợ nạp lại dữ liệu từ đĩa khi nhận `{ folderId, reload: true }` trên tab sạch.
- `projects/frontend/src/components/AppSidebar.vue` -- Thêm nút `data-test="sidebar-reload-btn"` và badge `data-test="external-change-badge"`.
- `projects/frontend/src/App.vue` -- Thay `window.location.reload()` ở phím tắt `Ctrl+R`/`Cmd+R`/`F5` bằng `void collectionStore.smartReload()`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/storage/filesystem.go` -- Bổ sung `RecordSelfWrite` và `IsWithinSelfWriteWindow` (bỏ qua `.history/` và `config.json`) -- Chống sự kiện giả khi Wails tự ghi đĩa.
- [x] `projects/storage/watcher.go` & `projects/storage/watcher_test.go` -- Hiện thực hóa `CollectionWatcher` dùng `fsnotify` theo dõi đệ quy `collRoot`, tự thêm thư mục con mới, debounce 300ms -- Phát hiện thay đổi từ CLI.
- [x] `projects/app.go` & `projects/app_test.go` -- Tích hợp `CollectionWatcher` vào vòng đời `App` và đồng bộ `active_collection` từ `config.json` trên đĩa trong `ListCollections`/`GetCollectionTree`/`ListEnvironments` -- Đồng bộ trạng thái Backend với CLI.
- [x] `projects/frontend/src/stores/collectionStore.ts`, `projects/frontend/src/components/FolderEditor.vue`, `projects/frontend/src/components/AppSidebar.vue`, `projects/frontend/src/App.vue` -- Hiện thực hóa `hasExternalChanges`, `smartReload()`, nút Reload kèm badge, và phím tắt `Ctrl+R`/`Cmd+R`/`F5`, kèm đầy đủ Vitest unit tests -- Đáp ứng toàn diện CAP-5.

**Acceptance Criteria:**
- Given `CollectionWatcher` đang theo dõi `collRoot`, when CLI/bên ngoài tạo/sửa file JSON (hoặc tạo cây thư mục lồng nhau), then watcher kích hoạt callback sau debounce 300ms; ngược lại khi `FileSystem` vừa thực hiện self-write trong cửa sổ 400ms (hoặc ghi vào `.history/` / `.tmp-*`), watcher không kích hoạt callback.
- Given `App` đang chạy, when CLI thay đổi `active_collection` trong `config.json` trên đĩa và UI gọi `ListCollections()` hoặc `GetCollectionTree()`, then `App` tự động đồng bộ `a.activeCollection`, `a.collRoot`, và chuyển `CollectionWatcher` sang collection mới.
- Given giao diện Vue, when nhận sự kiện `collection:external-change`, then `collectionStore.hasExternalChanges` bằng `true` và `AppSidebar.vue` hiển thị `data-test="external-change-badge"` trên nút `data-test="sidebar-reload-btn"`.
- Given người dùng nhấn `data-test="sidebar-reload-btn"` hoặc `Ctrl+R`/`Cmd+R`/`F5`, when `smartReload()` thực thi, then `expandedFolders` còn tồn tại được giữ nguyên, `envStore.syncActiveEnvFromCollection()` được gọi sau `Promise.all`, tab sạch (`!isDirty`) được nạp mới từ đĩa, và tab đang sửa dở (`isDirty === true`, cả Request lẫn Folder) được bảo vệ nguyên vẹn kèm hiển thị toast cảnh báo.

## Implementation Notes

- Added `lastSelfWriteNano`, `RecordSelfWrite()`, and `IsWithinSelfWriteWindow(window time.Duration)` to `storage.FileSystem`, recording self-writes at both start and `defer` of `WriteJSON`, `Delete`, `MoveFile`, and `MakeDir` while excluding `.history/`, `config.json`, and paths outside `collectionRoot`.
- Created `storage.CollectionWatcher` (`projects/storage/watcher.go`) using `fsnotify` to recursively watch `collRoot`, auto-watch newly created nested directories, clean up nested `watchedDirs` on directory deletion, ignore `.tmp-*`, `.git`, `.history`, suppress events within 400ms of self-write, and debounce external notifications by 300ms with timer token validation.
- Integrated `CollectionWatcher` into `App` (`startup`, `shutdown`, `SwitchCollection`, `UpdateCollectionRoot`) and added mutex-protected, path-traversal-validated `syncActiveCollectionFromDisk()` in `GetCollectionRoot`, `GetCollectionTree`, `ListCollections`, `ListEnvironments`, `GetRequest`, `GetEnvironment`, and `LoadFolder`.
- Added `hasExternalChanges`, `initExternalChangeListener()`, and `smartReload()` to `collectionStore.ts`; updated `FolderEditor.vue` (`handleExternalFolderUpdated`), `AppSidebar.vue` (`sidebar-reload-btn` + `external-change-badge`), and `App.vue` (`Ctrl+R`/`Cmd+R`/`F5`).

## Spec Change Log

## Review Triage Log

- `[patch]` `watcher.go` (`handleEvent` directory removal & debounce timer token): Cleaned up nested `watchedDirs` entries when a parent directory is removed/renamed away (`os.Stat` check + prefix match) and validated `cw.debounceTimer == t` before invoking `cb()`.
- `[patch]` `filesystem.go` (`recordSelfWriteForPath`): Scoped self-write recording to `collectionRoot` when set so writes to inactive collections do not suppress active collection watcher events.
- `[patch]` `app.go` (`syncActiveCollectionFromDisk`, entity bindings, Git bindings): Protected `syncActiveCollectionFromDisk` with `a.mu.Lock()`, validated `diskActive` against path traversal, called `syncActiveCollectionFromDisk()` in `GetRequest`/`GetEnvironment`/`LoadFolder`, and recorded self-writes around in-app Git operations.
- `[patch]` `collectionStore.ts` & `FolderEditor.vue`: Passed `{ skipEnvSync: true }` to `loadCollections` inside `smartReload()` so `syncActiveEnvFromCollection()` runs after `envStore.loadAll()` resolves; guarded `smartReload()` on `this.error`; preserved dirty tab metadata and avoided double-reloading when closing a deleted active tab; guarded `handleExternalFolderUpdated` in `FolderEditor.vue` against `loading`/`saving`.
- `[patch]` `filesystem_test.go`, `watcher_test.go`, `collectionStore.test.ts`: Added tests for `SetCollectionRoot` clearing stale index entries on root switch, `fs.MakeDir` self-write suppression + nested external write detection, `SwitchRoot` unwatching old root, and `smartReload()` closing deleted folder tabs and cleaning up deleted active entity IDs.

## Verification

**Commands:**
- `cd projects && go test ./...` -- expected: PASS 100%
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check && bun run test` -- expected: PASS 100%

## Auto Run Result

- Status: `done`
- All Go tests (`go test ./...`) and Frontend tests (`bun run type-check && bun run test`, 51 test files / 651 tests) passed 100%.

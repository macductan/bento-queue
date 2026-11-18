---
title: 'Tự động đồng bộ Git (Auto Pull & Auto Push) và Loại bỏ hoàn toàn History/Changelog'
type: 'feature'
created: '2026-11-18'
status: 'done'
route: 'dispatch'
baseline_commit: '2c42eab3b60eb92dcab4d6b7b11d77a59a131265'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại đồng bộ Git chỉ chạy thủ công khi người dùng mở hộp thoại và bấm Pull/Push, trong khi thư mục `.history/` (`executions.json`, `changelog.json`) liên tục bị sửa đổi ở máy trạm gây xung đột Git lặp đi lặp lại giữa các máy và làm phình dữ liệu không cần thiết.

**Approach:** Loại bỏ hoàn toàn tính năng History & Changelog ở cả Backend Go lẫn Frontend Vue, đồng thời tự động dọn sạch `.history/` khỏi đĩa/Git index và bảo vệ bằng `.gitignore` (kèm tự xử lý nếu remote cũ vẫn còn commit `.history/`). Song song đó, triển khai luồng Hybrid Auto Pull (khi khởi động/chuyển collection, khi focus cửa sổ throttle 60s, và định kỳ 3 phút) và Auto Push (gom thay đổi sau 15s ngừng chỉnh sửa), bật mặc định cho mọi Collection có cấu hình Git Remote kèm công tắc bật/tắt trong hộp thoại Git Sync.

## Boundaries & Constraints

**Always:**
- Loại bỏ hoàn toàn UI History (`HistoryModal.vue`, nút History trên `AppHeader.vue`), `historyStore.ts`, state trong `uiStore.ts`, `HistoryService`, `ExecutionHistoryEntry`, `ChangelogEntry`, 5 Wails bindings History/Changelog và các lời gọi ghi lịch sử trong Go/CLI/Headless.
- Đảm bảo `.gitignore` của từng Collection có Git luôn chứa `.history/` và `.tmp-*` (giữ nguyên các dòng cấu hình riêng hiện có), tự xóa thư mục `.history/` trên đĩa và gỡ khỏi Git index (`git rm -rf --cached --ignore-unmatch .history`) khi thực hiện thao tác Git.
- Nếu pull/merge từ remote cũ gây xung đột trên `.history/*` hoặc `.gitignore`, tự động giải quyết ngầm bằng cách xóa `.history/` và gộp dòng `.gitignore` mà không làm bật modal xung đột cho các file này.
- Khóa tuần tự theo từng thư mục Collection (`lockCollection`) khi thực thi Git trong `GitSyncService`, xóa `.git/index.lock` bị treo quá 2 phút và dùng `GIT_OPTIONAL_LOCKS=0` cho các lệnh chỉ đọc.
- Bật mặc định Auto Sync (`git_auto_sync` undefined/nil tương đương `true`) cho các Collection đã cấu hình `git_remote_url`; lưu tùy chọn `git_auto_sync` vào `collection.json` kèm nút gạt `[data-test="git-auto-sync-toggle"]` trong `GitSyncModal.vue`.
- Không chạy Auto Pull hoặc Auto Push khi có xung đột chưa xử lý (`has_conflicts`), khi thao tác Git khác đang chạy, hoặc khi người dùng đang chỉnh sửa dở (`isDirty`); bảo toàn đối xứng khóa i18n giữa `en.ts` và `vi.ts`.

**Never:**
- Không xóa dữ liệu request, folder, environment hay flow hợp lệ của Collection khi dọn `.history/`.
- Không kích hoạt Auto Pull định kỳ khi cửa sổ đang ẩn (`document.visibilityState === 'hidden'`) hoặc bỏ qua throttle 60s cho sự kiện focus cửa sổ.
- Không commit/push lên remote Git của repo mã nguồn `hecto-api` và không tự ý chạy `git commit` nếu chưa được người dùng xác nhận.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dọn `.history/` & `.gitignore` khi Sync | Collection có thư mục `.history/executions.json` hoặc đã từng track `.history/` | `.gitignore` có `.history/` & `.tmp-*`, `.history/` bị xóa khỏi đĩa và Git index | Bỏ qua an toàn nếu `.history` chưa từng được track |
| Xung đột `.history/` hoặc `.gitignore` từ remote cũ | Remote có commit sửa `.history/*` và `.gitignore`, Local cũng có thay đổi tương ứng | `Pull`/`Push` tự động xóa `.history/`, gộp dòng `.gitignore` và hoàn tất merge sạch không báo `GIT_CONFLICT` | Nếu còn file JSON khác xung đột mới trả về `ErrGitConflict` |
| Auto Pull khi mở app / chuyển Collection / focus / 3 phút | Collection có `git_remote_url`, `isGitAutoSyncEnabled === true`, không dirty, không conflict | Gọi `GitPullCollection`; nếu remote có thay đổi mới thì chạy `smartReload()` và hiện toast | Focus throttle 60s; interval bỏ qua khi tab ẩn; mở Resolver nếu gặp conflict |
| Auto Push debounce 15s & hoãn khi đang sửa | Lưu Request/Folder/Env/Flow/Collection khi `isGitAutoSyncEnabled === true` | Gom nhiều lần lưu trong 15s thành 1 lần gọi `GitPushCollection` | Nếu đang `isDirty` khi hết 15s thì hoãn thêm 15s; dừng và mở Resolver nếu `GIT_CONFLICT` |
| Tắt/Bật công tắc Auto Sync | Bấm `[data-test="git-auto-sync-toggle"]` trong `GitSyncModal.vue` | Lưu `git_auto_sync` qua `UpdateCollection`; tắt thì `cancelAutoPush()`, bật thì kích hoạt `autoPull` | Rollback/hiện toast lỗi nếu `UpdateCollection` thất bại |
| Xóa bỏ History & Changelog | Gửi request ở UI (`responseStore`) hoặc CLI (`headless.go`) | Không tạo `.history/`, không còn nút History trên `AppHeader.vue` | N/A |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` -- Định nghĩa `Collection` (thêm `GitAutoSync *bool`), `GitSyncStatus` (thêm `AutoSyncEnabled bool`); xóa `ExecutionHistoryEntry`, `ChangelogEntry`.
- `projects/service/history.go`, `projects/service/history_test.go` -- Xóa bỏ hoàn toàn.
- `projects/service/collection.go` -- `UpdateCollection` và `DuplicateCollection` bảo toàn `GitAutoSync`.
- `projects/service/git_sync.go`, `projects/service/git_merge.go` -- Khóa per-collection, xử lý stale `index.lock`, `GIT_OPTIONAL_LOCKS=0`, `ensureGitIgnoreAndPurgeHistory`, auto-resolve conflict `.history/` và `.gitignore`, bảo toàn `GitAutoSync` và tính `AutoSyncEnabled`.
- `projects/app.go` -- Xóa `historySvc`, `recordChangelog`, 5 Wails bindings history/changelog; thêm `notifyLocalDataChanged()` phát `"collection:local-changed"`.
- `projects/engine/headless.go`, `projects/engine/flow.go`, `projects/cmd/hecto/main.go`, `projects/engine/headless_test.go` -- Gỡ bỏ `HistorySvc` và ghi `.history/`.
- `projects/frontend/src/components/HistoryModal.vue`, `projects/frontend/src/components/__tests__/HistoryModal.test.ts`, `projects/frontend/src/stores/historyStore.ts` -- Xóa bỏ hoàn toàn.
- `projects/frontend/wailsjs/go/main/App.d.ts`, `App.js`, `models.ts` -- Đồng bộ xóa bindings/models history và bổ sung `git_auto_sync`, `auto_sync_enabled`.
- `projects/frontend/src/stores/uiStore.ts`, `responseStore.ts`, `App.vue`, `AppHeader.vue`, `ResponseViewer.vue` -- Gỡ tham chiếu HistoryModal và nút mở History; `AppHeader.vue` hiển thị trạng thái sync/pending push.
- `projects/frontend/src/stores/collectionStore.ts`, `requestStore.ts`, `environmentStore.ts`, `flowStore.ts`, `GitSyncModal.vue` -- Triển khai Hybrid Auto Pull / Auto Push, toggle `git-auto-sync-toggle`, khóa i18n `en.ts`/`vi.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go` -- Xóa `ExecutionHistoryEntry` & `ChangelogEntry`; thêm `GitAutoSync *bool` vào `Collection` và `AutoSyncEnabled bool` vào `GitSyncStatus` -- Làm rõ mô hình cấu hình Auto Sync và bỏ hẳn schema History.
- [x] `projects/service/history.go`, `projects/service/history_test.go` -- Xóa hai tệp HistoryService -- Loại bỏ service ghi `.history/`.
- [x] `projects/service/collection.go` -- Cập nhật `UpdateCollection` và `DuplicateCollection` sao chép `GitAutoSync` -- Lưu bền vững tùy chọn Auto Sync.
- [x] `projects/service/git_sync.go`, `projects/service/git_merge.go` -- Thêm khóa tuần tự per-collection, dọn stale `index.lock`, `GIT_OPTIONAL_LOCKS=0`, `ensureGitIgnoreAndPurgeHistory`, tự giải quyết xung đột `.history/*` và `.gitignore`, bảo toàn `GitAutoSync` trong merge/status -- Đảm bảo đồng bộ nền an toàn và không bao giờ conflict vì `.history/`.
- [x] `projects/app.go`, `projects/engine/headless.go`, `projects/engine/flow.go`, `projects/cmd/hecto/main.go`, `projects/engine/headless_test.go` -- Xóa bỏ hoàn toàn `HistorySvc`/`recordChangelog`/5 bindings history, thêm `notifyLocalDataChanged()` ở `app.go`, cập nhật `headless_test.go` kiểm tra không tạo `.history` -- Gỡ bỏ mọi điểm ghi `.history/` và phát sự kiện kích hoạt Auto Push từ backend.
- [x] `projects/service/git_sync_test.go` -- Bổ sung unit tests kiểm tra `.gitignore`, dọn `.history/` khi sync, auto-resolve conflict `.history/`/`.gitignore`, và `AutoSyncEnabled` -- Bao phủ I/O Matrix phía Go.
- [x] `projects/frontend/src/components/HistoryModal.vue`, `projects/frontend/src/components/__tests__/HistoryModal.test.ts`, `projects/frontend/src/stores/historyStore.ts` -- Xóa hoàn toàn các tệp History trên Frontend -- Dọn sạch UI và store History.
- [x] `projects/frontend/wailsjs/go/main/App.d.ts`, `App.js`, `models.ts`, `projects/frontend/src/stores/uiStore.ts`, `responseStore.ts`, `projects/frontend/src/App.vue`, `AppHeader.vue`, `ResponseViewer.vue`, `en.ts`, `vi.ts` -- Xóa tham chiếu History khỏi bindings, stores, templates, thêm nhãn i18n cho Auto Sync và trạng thái sync trên `AppHeader.vue` -- Hoàn tất gỡ History và cập nhật giao diện/ngôn ngữ.
- [x] `projects/frontend/src/stores/collectionStore.ts`, `requestStore.ts`, `environmentStore.ts`, `flowStore.ts`, `projects/frontend/src/components/GitSyncModal.vue` -- Cài đặt `autoPull`, `scheduleAutoPush`, `startAutoSyncScheduler`, `updateActiveCollectionGitAutoSync`, nút gạt `[data-test="git-auto-sync-toggle"]` và gọi `scheduleAutoPush()` sau khi lưu dữ liệu -- Hiện thực luồng Hybrid Auto Pull & Auto Push hoàn chỉnh.
- [x] `projects/frontend/src/components/__tests__/AppTabBar.test.ts`, `GitSyncModal.test.ts`, `projects/frontend/src/stores/__tests__/collectionStore.test.ts` -- Bỏ stub `HistoryModal`, thêm unit tests cho Auto Pull, Auto Push debounce/defer, toggle `[data-test="git-auto-sync-toggle"]` -- Kiểm chứng toàn bộ kịch bản trong I/O Matrix trên Frontend.

**Acceptance Criteria:**
- Given một Collection có cấu hình `git_remote_url` và chưa thiết lập `git_auto_sync`, when người dùng mở app, chuyển Collection, focus lại cửa sổ (sau 60s) hoặc sau mỗi 3 phút cửa sổ hiển thị, then hệ thống tự động Pull và gọi `smartReload()` nếu có thay đổi mới từ remote mà không ghi đè tab đang `isDirty`.
- Given người dùng bật Auto Sync (mặc định ON) và thực hiện chỉnh sửa/lưu Request, Folder, Environment hoặc Flow, when ngừng chỉnh sửa sau 15 giây, then hệ thống tự động gom thay đổi và thực hiện Git Push lên remote.
- Given một Collection có hoặc từng có thư mục `.history/`, when chạy bất kỳ thao tác Pull/Push nào, then `.history/` bị xóa khỏi đĩa và Git index, `.gitignore` chứa `.history/` và `.tmp-*`, và ứng dụng không còn nút hoặc modal History/Changelog.

## Implementation Notes

- **Backend Go & Dọn History/Changelog:** Đã xóa `history.go`, `history_test.go`, `ExecutionHistoryEntry`, `ChangelogEntry`, `HistorySvc` và 5 Wails bindings liên quan; cập nhật `headless_test.go` kiểm tra không tạo thư mục `.history/`. Trong `git_sync.go` và `git_merge.go` đã thêm khóa tuần tự per-collection (`lockCollection`/`lockCollectionByID`), dọn `.git/index.lock` treo quá 2 phút, `GIT_OPTIONAL_LOCKS=0`, `ensureGitIgnoreAndPurgeHistory` và tự giải quyết xung đột `.history/*` & `.gitignore`.
- **Hybrid Auto Pull & Auto Push (Frontend):** `collectionStore.ts` triển khai `autoPull` (startup, `switch`, `focus` throttle `AUTO_PULL_FOCUS_THROTTLE_MS = 60_000`, `interval` `AUTO_PULL_INTERVAL_MS = 180_000` bỏ qua khi `visibilityState === 'hidden'` hoặc `hasUnsavedEdits()`), `scheduleAutoPush` (debounce `AUTO_PUSH_DEBOUNCE_MS = 15_000`, hoãn nếu đang `isDirty` hoặc đang sync, dừng & mở resolver khi `GIT_CONFLICT`), `startAutoSyncScheduler` / `stopAutoSyncScheduler`, và `updateActiveCollectionGitAutoSync`. Đã nối `scheduleAutoPush()` vào `requestStore.ts`, `environmentStore.ts`, `flowStore.ts` (qua `notifyCollectionAutoPush`), `FolderEditor.vue`, `VariableHoverPopover.vue`, cùng toggle `[data-test="git-auto-sync-toggle"]` trong `GitSyncModal.vue` và trạng thái đồng bộ trên `AppHeader.vue`.
- **Verification (Post-edit):**
  - `bun run build:headless` -> exit 0
  - `bun run lint` -> exit 0
  - `bun run type-check` -> exit 0
  - `bun run test` -> exit 0 (`56` test files, `772` tests passed)
  - `go vet ./... && go test -count=1 ./...` -> exit 0 (tất cả Go packages ok)
- **Post-Review Patches:** Đã ép `LC_ALL=C`/`LANG=C` trong `runGit`, mở rộng `didGitPushMergeRemote` cho xung đột 3-way auto-merge, bảo toàn `git_auto_sync` qua `MergeJSONObjects`/`ClearAndPull`/`autoResolveCollectionMetaConflict`/`ensureCollectionMetaConsistent`, thêm `notifyLocalDataChangedFor(id)` và lọc event đúng collection đang mở, thêm `mock-server.json` vào auto-push & `smartReload()`, đồng bộ `purgePulledHistoryIfPresent` và `.gitignore` trên `ClearAndPull`/`CheckoutBranch`, khắc phục race condition giữa `hasUnsavedEdits()`/`autoSyncInFlight`/manual ops/collection transitions/unmount và bổ sung test cho toàn bộ verification gaps.

## Spec Change Log

## Review Triage Log

| ID | Layer | Location | Verdict | Route | Evidence & Decision |
|----|-------|----------|---------|-------|---------------------|
| BH-1 | blind-hunter | `projects/service/git_sync.go:runGit`, `collectionStore.ts` | medium | patch | `runGit` dùng `os.Environ()` không ép `LC_ALL=C`/`LANG=C`, khiến `didGitPullUpdateWorktree` hiểu nhầm trên OS không dùng locale Anh; đã ép `LC_ALL=C`/`LANG=C` trong `runGit`. |
| BH-2 | blind-hunter | `collectionStore.ts:136-139`, `git_sync.go:632-649,1267-1312` | high | patch | `didGitPushMergeRemote` thiếu nhận diện `auto-merging`/`automatic merge failed`/`conflict`, và `Pull` không đánh dấu `preResolvedExisting`; đã bổ sung cả hai. |
| BH-3 | blind-hunter | `types.go`, `git_merge.go:727-743`, `git_sync.go:823-831` | medium | patch | Lưu `git_auto_sync` trong `collection.json` thuộc ràng buộc đóng băng của spec, nhưng thiếu xử lý bảo toàn local ở `MergeJSONObjects`/`ClearAndPull`/`fieldLabels`; đã vá giữ local `git_auto_sync`. |
| BH-4 | blind-hunter | `app.go:87,466-488`, `collectionStore.ts:198,598,887,975,2226` | medium | patch | `RenameCollection`/`UpdateCollection` phát event chung, toggle Auto Sync tự kích hoạt push và `Object.assign` làm mất `is_active`; đã định danh `collectionId`, giữ `prevIsActive` và suppress self-event khi toggle. |
| BH-5 | blind-hunter | `collectionStore.ts:542,628,2338`, `App.vue`, `SettingsModal.vue` | high / maybe-false | patch + defer | Lỗi mất `autoPushPending` khi push fail không do conflict và thiếu reset khi `deleteCollection`/`refresh` đã được vá (`patch`). Riêng việc flush network push đồng bộ lúc đổi collection/đóng app được đưa vào `defer` (rủi ro block UI/offline và cần `OnBeforeClose` hook). |
| BH-6 | blind-hunter | `App.vue:172`, `collectionStore.ts:546,2381`, `AppHeader.vue` | medium | patch | Khi `git_auto_sync` tắt hoặc `hasUnsavedEdits()`/`offline` khiến `autoPull` bỏ qua, `gitSyncStatus` giữ `null` nên badge hiện `Git: main` và che conflict; đã fallback `fetchGitStatus(targetId)` cho `startup`/`switch`. |
| BH-7 | blind-hunter | `collectionStore.ts:1654-2451`, `GitSyncModal.vue` | medium | patch | Manual Git actions/modals chưa khóa/cô lập theo `autoSyncInFlight`, `autoPull` chạy giữa lúc `autoPushPending`, và chưa kiểm `flowStore.isRunning`/`responseStore.loading`; đã thêm `syncEpoch`, disable modal controls khi `autoSyncInFlight` và các guard tương ứng. |
| BH-8 | blind-hunter | `app.go:617-752`, `git_sync.go:904`, `storage/watcher.go` | medium | defer (+patch `RecordSelfWrite`) | Đã thêm `RecordSelfWrite()` cho `SaveCollectionGitRemote`; riêng thiết kế khóa chéo service CRUD-vs-Git và `DefaultSelfWriteWindow`/`IndexRebuild(a.collRoot)` là kiến trúc tồn tại sẵn cần chỉnh đa service nên `defer`. |
| BH-9 | blind-hunter | `app.go:763-776`, `mockServerStore.ts`, `collectionStore.ts:217`, `git_merge.go:165` | medium | patch | Đã bổ sung `notifyLocalDataChanged()` cho `SaveMockServerConfig`/`StartMockServer`, `scheduleAutoPush()` trong `mockServerStore.saveConfig()`, `mockStore.loadStatus()` trong `smartReload()` và nhận diện `mock_server` ở `detectEntityMeta`/modal. |
| BH-10 | blind-hunter | `git_sync.go:154,215-229,652-658,833,1149` | medium | patch | `ensureGitIgnore` giờ nhận mọi biến thể `.history`; `purgePulledHistoryIfPresent` stage+commit cả `.gitignore` và `.history`; `ClearAndPull`/`CheckoutBranch` gọi `purgePulledHistoryIfPresent`. |
| BH-11 | blind-hunter | `wails-mock.ts`, `ResizableLayout.test.ts`, `collectionStore.test.ts`, `app_test.go` | low | patch | Đã bổ sung mock `UpdateCollection` + Git sync vào `wails-mock.ts` và thêm đầy đủ unit tests còn thiếu cho Backend & Frontend. |
| EC-1 | edge-case-hunter | `collectionStore.ts:136-139` | high | patch | Trùng nguyên nhân gốc với `BH-2`; đã mở rộng `didGitPushMergeRemote` nhận `auto-merging`, `automatic merge failed`, `conflict`. |
| EC-2 | edge-case-hunter | `collectionStore.ts:2384-2407` | high | patch | `autoPull` đặt `autoSyncInFlight = true` sau `await hasUnsavedEdits()`, dễ chạy song song khi `focus` + `visibilitychange` nổ cùng lúc; đã đặt `autoSyncInFlight = true` trước `await`. |
| EC-3 | edge-case-hunter | `collectionStore.ts:2323-2339` | high | patch | `executeAutoPush` có cùng khe hở `await hasUnsavedEdits()` trước khi đặt `autoSyncInFlight = true`; đã khóa trước `await`. |
| EC-4 | edge-case-hunter | `collectionStore.ts:515-546` | high | patch | `switchCollection` gán `activeCollectionId` trước khi hủy timer/xóa `gitSyncStatus`; đã gọi `resetGitSyncStateForTransition` ngay sau khi đổi `activeCollectionId`. |
| EC-5 | edge-case-hunter | `collectionStore.ts:628-653` | high | patch | `deleteCollection` active fallback về `default` chưa reset Git state hay kéo status/pull mới; đã gọi `resetGitSyncStateForTransition` + `autoPull({ reason: 'switch' })`. |
| EC-6 | edge-case-hunter | `collectionStore.ts:2338-2375` | medium | patch | Lỗi Push không phải conflict làm mất cờ `autoPushPending = true`; đã giữ `autoPushPending = true` khi lỗi tạm thời hoặc exception và flush sau `autoPull` thành công. |
| EC-7 | edge-case-hunter | `collectionStore.ts:2226-2287` | medium | patch | Đổi collection hoặc double-click lúc `updateActiveCollectionGitAutoSync` đang await có thể sửa nhầm state collection mới; đã kiểm `stillSameActive` theo `targetId`. |
| EC-8 | edge-case-hunter | `collectionStore.ts:2410-2425` | medium | patch | Sau `await smartReload()`, `autoPull` chưa kiểm lại `switching`/`targetId`/`syncEpoch` trước khi hiện toast; đã kiểm lại điều kiện ngay trước toast. |
| EC-9 | edge-case-hunter | `projects/frontend/src/App.vue:164-177` | medium | patch | `onMounted` gọi `startAutoSyncScheduler` dù component đã unmount khi `Promise.all` chưa xong; đã thêm cờ `isUnmounted`. |
| EC-10 | edge-case-hunter | `environmentStore.ts:147-148` | medium | patch | `applyVariableUpdates` gọi `scheduleAutoPush()` bất kể `SaveEnvironment` thất bại; đã kiểm `saveRes?.success`. |
| EC-11 | edge-case-hunter | `environmentStore.ts:223-224` | medium | patch | `applyScopedVariableUpdates` gọi `scheduleAutoPush()` bất kể `SaveEnvironment` thất bại; đã kiểm `saveRes?.success`. |
| EC-12 | edge-case-hunter | `collectionStore.ts:546` | medium | patch | `autoPull({ reason: 'switch' })` bị nuốt nếu `autoSyncInFlight` đang bận ở collection cũ; đã lưu `pendingSwitchPullTargetId` để kích hoạt trong `finally`. |
| EC-13 | edge-case-hunter | `collectionStore.ts:136-139` | high | patch | Trùng nguyên nhân gốc với `EC-1`/`BH-2`; đã xử lý trong `didGitPushMergeRemote`. |
| VG-1 | verification-gap | `collectionStore.ts:136-139`, `git_sync.go:1307-1312` | medium | patch | Đã bổ sung kiểm tra `GitSyncStatus.Output` trong `git_sync_test.go` và case `smartReload()` khi push auto-merge trong `collectionStore.test.ts`. |
| VG-2 | verification-gap | `collectionStore.test.ts:1801-1832` | medium | patch | Đã mở rộng test kiểm chứng `document.visibilityState === 'hidden'`, sự kiện `focus` / `visibilitychange` và hủy listener khi `stopAutoSyncScheduler`. |
| VG-3 | verification-gap | `collectionStore.ts:2289,2315,2381,2432` | medium | patch | Đã bổ sung test cho `git_auto_sync: false` (`autoPull`/`scheduleAutoPush`/`executeAutoPush`) và `GIT_CONFLICT` trong `autoPull()`. |
| VG-4 | verification-gap | `projects/frontend/src/App.vue:171-176` | low | patch | Đã bổ sung spy assertions trong `ResizableLayout.test.ts` kiểm `startAutoSyncScheduler`, `autoPull('startup')`, `stopAutoSyncScheduler` theo lifecycle `App.vue`. |
| VG-5 | verification-gap | `projects/frontend/src/components/AppHeader.vue:50-55,154-160` | low | patch | Đã bổ sung assertion UI trong `ResizableLayout.test.ts` cho `autoSyncInFlight` (`Đang đồng bộ...`, `bg-sky-400`) và `autoPushPending` (`Chờ đẩy lên`, `bg-amber-300`). |
| VG-6 | verification-gap | `collectionStore.ts:394-413,627-651` | high | patch | Đã áp dụng `resetGitSyncStateForTransition` và thêm test cho `deleteCollection` active + `refresh()` trong `collectionStore.test.ts`. |
| VG-7 | verification-gap | `app.go:763-768`, `mockServerStore.ts:68-86` | medium | patch | Đã nối `notifyLocalDataChanged()`/`scheduleAutoPush()` cho Mock Server và thêm test trong `app_test.go` + `MockServerModal.test.ts`. |
| VG-8 | verification-gap | `app.go:87-95`, `collectionStore.ts:198-200,2132` | medium | patch | Đã thêm test `TestApp_NotifyLocalDataChanged_TargetedAndMockServer` (`app_test.go`), test `collection:local-changed` + `resolveGitConflicts` trong `collectionStore.test.ts`. |
| VG-9 | verification-gap | `git_sync.go:215-229`, `git_sync_test.go:636-739` | medium | patch | Đã thêm nhánh test `Pull` clean từ remote chứa `.history/legacy.json` để xác thực `purgePulledHistoryIfPresent` xóa và commit sạch `.history` + `.gitignore`. |
| VG-10 | verification-gap | `collection.go:1104`, `git_sync.go:392`, `git_merge.go:1009` | medium | patch | Đã thêm `TestCollection_GitAutoSync_PersistenceAndDuplicate` (`collection_test.go`) và kiểm tra bảo toàn `GitAutoSync=false` qua merge/conflict ở `git_sync_test.go` & `git_merge_test.go`. |
| VG-Other-1 | verification-gap | `collectionStore.ts:136-139`, `git_sync.go:1267-1312` | high | patch | Trùng với `EC-1`/`VG-1`; đã vá `didGitPushMergeRemote` và xác nhận bằng test. |
| VG-Other-2 | verification-gap | `collectionStore.ts:174-179,394-413,628-651` | high | patch | Trùng với `EC-5`/`VG-6`; đã vá `resetGitSyncStateForTransition` và kiểm thử đầy đủ. |
| VG-Other-3 | verification-gap | `app.go:87-95,466-488`, `collectionStore.ts:584-600` | medium | patch | Trùng với `BH-4`; đã dùng `notifyLocalDataChangedFor(id)` và kiểm `id === activeCollectionId` ở frontend + test. |

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run build:headless` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run lint` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` -- expected: exit 0.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test` -- expected: exit 0.
- `cd /home/dev/mdt/hecto-api/projects && go vet ./... && go test -count=1 ./...` -- expected: exit 0.

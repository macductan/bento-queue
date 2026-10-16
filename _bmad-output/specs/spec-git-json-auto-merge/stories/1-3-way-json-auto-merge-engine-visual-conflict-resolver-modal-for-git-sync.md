---
title: '3-Way JSON Auto-Merge Engine & Visual Conflict Resolver Modal for Git Sync'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_revision: 'b631dce376bb4b581b02a39420aadb5a6e449dfd'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/specs/spec-git-json-auto-merge/SPEC.md'
  - '_bmad-output/specs/spec-git-json-auto-merge/git-merge-architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Khi hai máy cùng chỉnh sửa một file JSON của Collection (`<uuid>.json`, `_folder.json`, `environments/*.json`, `collection.json`) và thực hiện Git Pull / Stash & Pull / Push, Git chuẩn so khớp theo dòng văn bản và báo lỗi Merge Conflict, buộc người dùng phải mở terminal xử lý thủ công bằng Git CLI.

**Approach:** Xây dựng bộ máy **3-Way JSON Auto-Merge** ở tầng Go Backend (`projects/service/git_merge.go`) trích xuất 3 mốc từ Git index (`:1:`, `:2:`, `:3:`; tự động đảo `:3:` là `OURS/Local` và `:2:` là `THEIRS/Remote` khi xung đột từ `git stash pop`), tự động gộp cấp trường dữ liệu (< 50ms/file), đệ quy JSON `body.content`, và gộp mảng `KVPair` theo cặp `(Key, occurrenceIndex)`. Với các xung đột thực sự hoặc xung đột Xoá vs. Sửa (`delete_edit` / `edit_delete`), trả về chi tiết xung đột cho giao diện **Visual Conflict Resolver** (`GitConflictResolverModal.vue`) để người dùng giải quyết bằng 1 cú click hoặc huỷ merge an toàn.

## Boundaries & Constraints

**Always:**
- Giữ vững triết lý `File = Truth`: mọi kết quả gộp tự động lẫn thủ công đều ghi thành file JSON chuẩn (`2 spaces indent`) trên đĩa và tương thích 100% với Git CLI chuẩn.
- Đảm bảo hiệu năng thuật toán 3-Way JSON Merge dưới `50ms/file`.
- Bảo mật thực thi Git & chống Path Traversal: chỉ gọi `exec.CommandContext` với mảng đối số tách biệt; kiểm tra chặt mọi `relPath` trong `ResolveGitConflict` nằm gọn trong `collDir` (không chứa `..`, không phải đường dẫn tuyệt đối, không chạm vào `.git`).
- Tự động flush các thay đổi đang soạn thảo dở (`requestStore.flush()`, `tabStore.flushActiveFolderIfNeeded()`) trước khi thực hiện `gitPull`, `gitStashAndPull`, `gitPush`.
- Khoá nút `"Xác nhận & Hoàn tất Đồng bộ"` cho đến khi người dùng đã chọn phương án cho toàn bộ các trường/file xung đột (`allResolved === true`).
- Mọi kiểm thử tự động chỉ sử dụng `t.TempDir()` / `Test-Collection`, tuyệt đối không tác động dữ liệu thật.

**Never:**
- Không sử dụng kiến trúc Master-Worker hay chuyển đổi sang streaming JSONL.
- Không xây dựng bộ soạn thảo văn bản tự do (raw text conflict marker editor).
- Không chạy lệnh Git qua shell `sh -c`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Non-overlapping JSON fields & JSON body sub-keys | Local sửa `url`, thêm header `X-Req`, sửa `body.content.page=2`; Remote sửa `method`, thêm header `Accept`, sửa `body.content.limit=50` | Tự động gộp đầy đủ các trường và JSON body, ghi file JSON chuẩn, `git add`, tạo merge commit, `IndexRebuild`, trả về `Success: true` | Không hiển thị lỗi conflict |
| Duplicate KVPair keys & disabled rows | Mảng `KVPair` có nhiều dòng trùng `Key` (`tag#0`, `tag#1`) hoặc `enabled: false` | So khớp theo `<Key>#<occurrenceIndex>`, bảo toàn đầy đủ dòng trùng `Key` và trạng thái `enabled: false` | Ghi nhận `GitFieldConflict` nếu cùng `<Key>#<idx>` bị sửa khác nhau ở cả 2 bên |
| Stash & Pull conflict stage inversion | `StashAndPull` gây conflict tại `git stash pop` (không có `MERGE_HEAD`) | Tạo `.git/HECTO_STASH_CONFLICT`, đảo `:3:` làm `OURS (Local)` và `:2:` làm `THEIRS (Remote)` | Trả về `GIT_CONFLICT` với đúng chiều `OursValue` (Local) và `TheirsValue` (Remote) |
| Delete vs. Edit conflict | Một bên xoá file JSON, bên kia sửa file JSON (`delete_edit` hoặc `edit_delete`) | Không tự động xoá hay ghi đè; trả về `GitFileConflict` với `conflict_type` tương ứng để user chọn Giữ hoặc Xoá | Nếu chọn Xoá: `git rm -f --ignore-unmatch -- <relPath>`; nếu chọn Giữ: ghi JSON và `git add` |
| Path traversal in ResolveGitConflict | `resolvedFiles` chứa key `../evil.json`, `/abs/path.json`, hoặc `.git/config` | Từ chối ngay lập tức trước khi chạm vào filesystem | Trả về `model.NewError(model.ErrValidation, ...)` |
| Abort Git Merge / Stash Conflict | User bấm `"Huỷ merge"` trong phiên merge (`MERGE_HEAD`) hoặc phiên stash conflict (`HECTO_STASH_CONFLICT`) | Rollback bằng `git merge --abort` hoặc reset + khôi phục stash local, xoá `HECTO_STASH_CONFLICT`, `IndexRebuild` | Trả về `Success: true` với trạng thái an toàn trước khi Pull |

</intent-contract>

## Code Map

- `projects/model/types.go` -- Định nghĩa `GitFieldConflict`, `GitFileConflict` và mở rộng `GitSyncStatus` (`Conflicts []GitFileConflict`).
- `projects/service/git_merge.go` -- Bộ máy 3-Way JSON Auto-Merge, trích xuất Git stages (`:1:`, `:2:`, `:3:`), xử lý `.git/HECTO_STASH_CONFLICT`, cài đặt `ResolveConflict` và `AbortMerge`.
- `projects/service/git_sync.go` -- Tích hợp bước 3-Way Auto-Merge vào `Pull`, `StashAndPull`, `Push`, `inspectStatus`, và uỷ quyền `ResolveConflict` / `AbortMerge`.
- `projects/app.go` -- Wails bindings `ResolveGitConflict(collectionID string, resolvedFiles map[string]interface{}) model.Result` và `AbortGitMerge(collectionID string) model.Result`.
- `projects/frontend/wailsjs/go/main/App.js` & `App.d.ts` & `projects/frontend/wailsjs/go/models.ts` -- Cập nhật Wails TypeScript/JS bindings cho `ResolveGitConflict`, `AbortGitMerge`, `GitFieldConflict`, `GitFileConflict`, `GitSyncStatus`.
- `projects/frontend/src/stores/uiStore.ts` -- Thêm state `gitConflictModalOpen = ref(false)`.
- `projects/frontend/src/stores/collectionStore.ts` -- Auto-flush dirty request/folder trước `gitPull`/`gitStashAndPull`/`gitPush`, tự mở `gitConflictModalOpen` khi có `GIT_CONFLICT`, thêm actions `resolveGitConflicts` và `abortGitMerge`.
- `projects/frontend/src/components/GitConflictResolverModal.vue` -- Giao diện Visual Conflict Resolver 2 cột (`Bản của bạn (Local)` vs `Bản từ xa (Remote)`), chọn 1-click theo trường/file/tất cả file, xử lý Delete vs. Edit, progress badge, nút Huỷ merge và Xác nhận.
- `projects/frontend/src/components/GitSyncModal.vue` -- Thêm nút `data-test="open-conflict-resolver-btn"` và `data-test="git-sync-abort-merge-btn"` trong `git-conflict-alert`.
- `projects/frontend/src/App.vue` -- Mount `<GitConflictResolverModal />` và chặn phím tắt toàn cục khi modal đang mở.

## Tasks & Acceptance

**Execution:**
- `projects/model/types.go` -- Thêm `GitFieldConflict`, `GitFileConflict` và cập nhật `GitSyncStatus.Conflicts` -- Biểu diễn dữ liệu xung đột cấp trường cho Wails bindings.
- `projects/service/git_merge.go` -- Cài đặt thuật toán 3-Way JSON Merge (< 50ms/file), trích xuất index stages `:1:`, `:2:`, `:3:` (đảo `:2:`/`:3:` khi stash conflict), gộp đệ quy JSON `body.content`, gộp mảng `KVPair` theo `<Key>#<idx>`, gộp `folder_envs`/`auth_envs`, xử lý `delete_edit`/`edit_delete`, `ResolveConflict` và `AbortMerge` -- Tự động hóa gộp JSON và cung cấp API giải quyết/rollback xung đột.
- `projects/service/git_sync.go` -- Tích hợp 3-Way Auto-Merge vào `Pull`, `StashAndPull`, `Push`, và `inspectStatus` -- Tự động hoàn tất merge khi không còn conflict hoặc trả về `status.Conflicts` khi cần user phân xử.
- `projects/app.go` & `projects/frontend/wailsjs/` -- Thêm Wails bindings `ResolveGitConflict` và `AbortGitMerge` và cập nhật TypeScript models -- Kết nối Frontend với Backend.
- `projects/frontend/src/stores/uiStore.ts` & `projects/frontend/src/stores/collectionStore.ts` -- Thêm `gitConflictModalOpen`, auto-flush trước Pull/StashAndPull/Push, và actions `resolveGitConflicts`, `abortGitMerge` -- Quản lý luồng dữ liệu đồng bộ và giải quyết xung đột trên UI.
- `projects/frontend/src/components/GitConflictResolverModal.vue`, `projects/frontend/src/components/GitSyncModal.vue`, `projects/frontend/src/App.vue` -- Xây dựng giao diện Visual Conflict Resolver 2 cột và tích hợp vào `GitSyncModal.vue` + `App.vue` -- Cho phép người dùng giải quyết xung đột bằng 1 click.
- `projects/service/git_merge_test.go`, `projects/service/git_sync_test.go`, `projects/frontend/src/components/__tests__/GitConflictResolverModal.spec.ts`, `projects/frontend/src/components/__tests__/GitSyncModal.test.ts` -- Viết unit, integration và benchmark tests cho toàn bộ kịch bản trong I/O Matrix -- Đảm bảo chất lượng và hiệu năng < 50ms/file.

**Acceptance Criteria:**
- Given hai máy cùng sửa một file `<uuid>.json` ở các trường khác nhau (hoặc các key con khác nhau trong `body.content` JSON Object, hoặc các phần tử `KVPair` khác nhau kể cả trùng `Key` / `enabled: false`), when thực hiện `GitPullCollection`, `GitStashAndPullCollection` hoặc `GitPushCollection`, then hệ thống tự động gộp vào file JSON chuẩn trên đĩa, hoàn tất commit, rebuild index và trả về `Success: true` trong thời gian < 50ms/file.
- Given hai máy cùng sửa một trường scalar/KVPair thành hai giá trị khác nhau hoặc xảy ra xung đột Xoá vs. Sửa (`delete_edit` / `edit_delete`), when thực hiện đồng bộ Git, then backend trả về mã lỗi `GIT_CONFLICT` kèm `status.Conflicts` đúng chiều `OursValue` (Local) và `TheirsValue` (Remote) (kể cả khi qua `StashAndPull`), và Frontend tự động mở `GitConflictResolverModal.vue`.
- Given `GitConflictResolverModal.vue` đang mở với danh sách xung đột, when người dùng chọn phương án cho từng trường/file (hoặc bấm chọn nhanh toàn bộ Local/Remote cho 1 file hay tất cả file, hoặc chọn Giữ/Xoá file), then tiến độ `Đã xử lý X/Y file` cập nhật chính xác và nút `"Xác nhận & Hoàn tất Đồng bộ"` chỉ bật khi tất cả xung đột đã được chọn phương án.
- Given người dùng đang có thay đổi chưa lưu trên Request hoặc Folder, when bấm Pull / Stash & Pull / Push, then Frontend tự động gọi `requestStore.flush()` và `tabStore.flushActiveFolderIfNeeded()` trước khi gọi xuống Go backend.
- Given người dùng bấm `"Xác nhận & Hoàn tất Đồng bộ"` hoặc `"Huỷ merge"`, when hệ thống thực thi `ResolveGitConflict` hoặc `AbortGitMerge`, then trạng thái Git và dữ liệu Collection được hoàn tất hoặc rollback an toàn và UI (tree, environments, active request) được làm mới tức thì.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 32 findings — high 5, medium 20, low 4, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` `GitConflictResolverModal.vue` (`buildFinalMergedObject`) serializes raw/non-JSON field conflicts (`__raw__`) as JSON objects instead of raw strings — Đã cập nhật `buildFinalMergedObject` trả về chuỗi raw trực tiếp khi `c.entity_type === 'raw'` hoặc `field_path === '__raw__'`.
  - `[medium]` `[patch]` `GitConflictResolverModal.vue` (`buildFinalMergedObject`) overwrites non-JSON (`raw`) `delete_edit`/`edit_delete` files with `{}` when choosing `keep` — Đã cập nhật `buildFinalMergedObject` trả về `c.fields?.[0]?.ours_value ?? c.fields?.[0]?.theirs_value ?? ''` khi chọn `keep` cho file `raw`.
  - `[high]` `[patch]` `GitConflictResolverModal.vue` (`applyFieldToMergedObject`) splices deleted duplicate-key `KVPair` items in-place, shifting occurrence indices and corrupting subsequent `KVPair` resolutions — Đã sửa bằng cách pre-seed các slot `__kv_placeholder__` cho occurrence thiếu trong `merged_preview`, đánh dấu xoá tại chỗ (`__deleted_kv__`) và chỉ lọc bỏ sau khi áp dụng xong toàn bộ field choices.
  - `[medium]` `[patch]` `git_merge.go` (`processConflictsAndAutoMerge`) reads stage `:2:` unconditionally and skips `os.MkdirAll` when auto-merging identical `raw` files — Đã sửa dùng `s.readConflictStages`, tạo thư mục cha bằng `os.MkdirAll` và ghi nội dung raw chính xác.
  - `[medium]` `[patch]` `git_sync.go` (`StashAndPull`) & `git_merge.go` (`ResolveConflict`) call `autoResolveCollectionMetaConflict` after `processConflictsAndAutoMerge`, overwriting genuine `collection.json` field conflicts — Đã gỡ bỏ lời gọi `autoResolveCollectionMetaConflict` dư thừa sau `processConflictsAndAutoMerge` để bảo toàn xung đột thực sự trên `collection.json`.
  - `[medium]` `[patch]` `git_sync.go` (`StashAndPull`) & `git_merge.go` (`AbortMerge`, `ResolveConflict`) strand stashed local changes in `stash@{0}` when `git pull` inside `StashAndPull` hits a merge conflict (`MERGE_HEAD`) — Đã chặn chạy `git stash pop` khi còn `MERGE_HEAD`/conflict và bổ sung tự động pop `hecto-stash-before-pull` sau khi commit hoặc abort `MERGE_HEAD`.
  - `[medium]` `[patch]` `git_sync.go` (`StashAndPull`) lacks a pre-check for existing unresolved conflicts before running `git stash push -u` — Đã thêm kiểm tra `s.getConflictFiles(collDir)` ở đầu `StashAndPull` tương tự `Pull` và `Push`.
  - `[low]` `[reject]` `git_merge.go` dropping `stash@{0}` after resolving an `"already exists, no checkout"` untracked stash collision could discard other stashed changes — Hiếm gặp vì `flushDirtyBeforeGitSync()` và pre-pull flow trong Hecto quản lý các file JSON theo collection; xử lý tách riêng từng file từ `stash@{0}` đòi hỏi nhánh phức tạp vượt phạm vi sửa trực tiếp.
  - `[medium]` `[patch]` `git_merge.go` (`mergeBodyObject3Way`) runs deep JSON body merge even when `body.type` is in conflict and Remote is not `"json"` — Đã thêm điều kiện `len(conflicts) == 0 && typeStr == "json"` trước khi gộp đệ quy `body.content`.
  - `[false]` `[reject]` `git_merge.go` (`mergeNestedObject3Way`) auto-merging disjoint `auth` sub-objects (`bearer`, `basic`) when `auth.type` conflicts — Kiến trúc `git-merge-architecture.md` quy định rõ `auth` là object cấu trúc cố định gộp đệ quy từng trường con (`auth.type`, `auth.bearer.token`,...) và `AuthConfig.Type` là trường chọn phương thức active.
  - `[low]` `[reject]` `GitConflictResolverModal.vue` dot-splitting on `fieldPath` when JSON body keys or `folder_envs` IDs contain literal `.` — Tình huống hiếm gặp trong thực tế (environment ID là UUID, JSON key có dấu chấm ít gặp) và việc đổi giao thức đường dẫn đòi hỏi thêm bộ parser/escaping phức tạp.
  - `[low]` `[reject]` `collectionStore.ts` (`gitPush`, `resolveGitConflicts`, `abortGitMerge`) does not close tabs in `tabStore` or reset `activeFolderId` — Hành vi đồng nhất với `gitPull` và `gitStashAndPull` hiện hữu trong `collectionStore.ts`; việc can thiệp đóng tab tự động cần thêm nhánh logic ngoài phạm vi.
  - `[false]` `[reject]` `projects/app.go` (`ResolveGitConflict`, `AbortGitMerge`) redundant `a.fs.IndexRebuild(root)` call — `App` giữ `a.collRoot` cho collection đang active trên UI trong khi `GitSyncService` thao tác theo tham số `collectionID`; giữ lệnh đồng bộ index khi `collectionID` là collection active theo đúng mẫu của `GitPullCollection`/`GitPushCollection` trong `app.go`.
  - `[low]` `[patch]` `collectionStore.ts` (`resolveGitConflicts`, `abortGitMerge`) does not update `gitConflictError` when backend returns `GIT_CONFLICT` on partial failure — Đã cập nhật `this.gitConflictError` và `this.gitSyncStatus` từ `res.data` khi `res.error?.code === 'GIT_CONFLICT'`.
  - `[medium]` `[patch]` Edge case (`GitConflictResolverModal.vue:282-300`): Resolving raw/non-JSON conflict file writes `{"__raw__": ...}` or `{}` instead of raw file content — Chung nguyên nhân gốc và đã sửa trong `buildFinalMergedObject`.
  - `[high]` `[patch]` Edge case (`GitConflictResolverModal.vue:236-262`): Resolving duplicate KVPair keys when `#0` is deleted shifts indices and corrupts `#1` — Chung nguyên nhân gốc và đã sửa trong `buildFinalMergedObject` / `applyFieldToMergedObject`.
  - `[medium]` `[patch]` Edge case (`git_merge.go:1028-1034`): Auto-merging identical raw file from untracked stash pop collision reads missing `:2:` blob — Chung nguyên nhân gốc và đã sửa bằng `s.readConflictStages`.
  - `[medium]` `[patch]` Edge case (`git_sync.go:720-756`): `StashAndPull` encounters unresolved merge conflict during `git pull` before `git stash pop` runs — Chung nguyên nhân gốc và đã sửa trong `StashAndPull`, `ResolveConflict`, `AbortMerge`.
  - `[high]` `[patch]` Verification gap: `GitSyncService.ResolveConflict` non-delete JSON resolution and stash-conflict completion paths are untested — Đã bổ sung `TestGitSyncService_ResolveConflictNonDeleteJSONAcrossPullAndStashAndBuildFileConflictTiming` trong `git_merge_test.go`.
  - `[medium]` `[patch]` Verification gap: `flushDirtyBeforeGitSync` failure abort path in `gitPull`, `gitStashAndPull`, and `gitPush` is unverified — Đã bổ sung kiểm thử abort khi `requestStore.flush()` hoặc `tabStore.flushActiveFolderIfNeeded()` trả về `false` trong `GitSyncModal.test.ts`.
  - `[medium]` `[patch]` Verification gap: Auto-opening `GitConflictResolverModal` when `gitPull`, `gitStashAndPull`, or `gitPush` returns `GIT_CONFLICT` is untested — Đã bổ sung kiểm thử `expect(uiStore.gitConflictModalOpen).toBe(true)` cho cả 3 action trong `GitSyncModal.test.ts`.
  - `[medium]` `[patch]` Verification gap: Active request reload and deletion cleanup after `gitPush`, `resolveGitConflicts`, and `abortGitMerge` are untested — Đã bổ sung kiểm thử reload và clear `activeRequestId` trong `GitSyncModal.test.ts` và `GitConflictResolverModal.spec.ts`.
  - `[medium]` `[patch]` Verification-gap other finding: `buildFinalMergedObject` constructs `{ "__raw__": ... }` or `{}` for `raw` entity conflicts — Chung nguyên nhân gốc và đã sửa trong `GitConflictResolverModal.vue`.
  - `[medium]` `[patch]` Verification-gap other finding: `processConflictsAndAutoMerge` reads `:2:` unconditionally for identical `raw` file — Chung nguyên nhân gốc và đã sửa trong `git_merge.go`.
  - `[high]` `[patch]` Verification-gap other finding: `mergeKVPairList` omits deleted `Key#0` from `merged_preview`, causing `applyFieldToMergedObject` to overwrite or splice `Key#1` — Chung nguyên nhân gốc và đã sửa trong `GitConflictResolverModal.vue` kèm unit test trong `GitConflictResolverModal.spec.ts`.
  - `[medium]` `[patch]` Verification-gap other finding: `StashAndPull` runs `git stash pop` onto `MERGE_HEAD` when `git pull` has unresolved conflicts — Chung nguyên nhân gốc và đã sửa trong `git_sync.go` và `git_merge.go`.
  - `[high]` `[patch]` Intent-alignment surface A: Duplicate `(Key, occurrenceIndex)` KVPair resolution shifts/corrupts indices when `#0` is omitted or deleted — Chung nguyên nhân gốc và đã sửa trong `GitConflictResolverModal.vue` kèm test.
  - `[false]` `[reject]` Intent-alignment surface B: Recursive `body.content` JSON merge only recurses on JSON objects (`map[string]interface{}`) and falls back to string scalar on JSON arrays — Đúng theo đặc tả `SPEC.md` và `git-merge-architecture.md` ("Nếu `body.content` là chuỗi JSON hợp lệ biểu diễn một JSON Object (`map[string]interface{}`) ... Nếu `body.content` không phải JSON Object hợp lệ (ví dụ: JSON Array `[...]`), coi toàn bộ `body.content` là một trường chuỗi đơn").
  - `[medium]` `[patch]` Intent-alignment surface C: `git stash pop` vs `git pull/merge` lifecycle surface in `StashAndPull` when `git pull` conflicts and missing `ResolveConflict` stash test — Đã sửa xử lý stash trong `StashAndPull`/`ResolveConflict`/`AbortMerge` và bổ sung test `ResolveConflict` cho `StashAndPull`.
  - `[medium]` `[patch]` Intent-alignment surface D: Non-JSON (`raw`) conflict fallback serialization in `GitConflictResolverModal.vue` — Chung nguyên nhân gốc và đã sửa trong `GitConflictResolverModal.vue` kèm test.
  - `[medium]` `[patch]` Intent-alignment surface E: `ensureCollectionMetaConsistent` in `ResolveConflict` ran after `git commit`, leaving `collection.json` dirty in the working tree — Đã chuyển `s.ensureCollectionMetaConsistent` và `git add -- collection.json` lên trước `git commit` trong `ResolveConflict`.
  - `[medium]` `[patch]` Intent-alignment surface F: Performance verification `< 50ms/file` only measured in-memory `MergeJSONObjects` without `buildFileConflict` stage extraction — Đã bổ sung assertion đo thời gian thực thi toàn trình `buildFileConflict` (`< 50ms`) trong `git_merge_test.go`.

## Verification

**Commands:**
- `cd projects && go test ./...` -- expected: PASS 100%, bao gồm benchmark/test xác nhận 3-Way JSON Merge < 50ms/file.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: PASS 100% cho toàn bộ test suites.

## Auto Run Result

Status: done

### Tóm tắt thay đổi đã triển khai
- **Go Backend (`projects/model/types.go`, `projects/service/git_merge.go`, `projects/service/git_sync.go`, `projects/app.go`):**
  - Bổ sung cấu trúc `GitFieldConflict`, `GitFileConflict` và mở rộng `GitSyncStatus` với trường `Conflicts []GitFileConflict`.
  - Xây dựng bộ máy **3-Way JSON Auto-Merge** (`projects/service/git_merge.go`) trích xuất 3 mốc từ Git index (`:1:` Base, `:2:` Ours, `:3:` Theirs), tự động đảo chiều `:3:` làm `OURS (Local)` và `:2:` làm `THEIRS (Remote)` kèm file cờ `.git/HECTO_STASH_CONFLICT` khi xung đột phát sinh từ `git stash pop`.
  - Tự động gộp cấp trường dữ liệu (< 50ms/file) cho `Request`, `Folder`, `Environment`, `Collection`; gộp đệ quy các trường con bên trong `body.content` khi `body.type == "json"` và là JSON Object hợp lệ; gộp mảng `KVPair` (`headers`, `params`, `path_params`, `variables`, `form_data`, `urlencoded`) và `folder_envs`/`auth_envs` theo định danh kép `<Key>#<occurrenceIndex>` bảo toàn đầy đủ các dòng trùng `Key` và trạng thái `enabled: false`.
  - Nhận diện xung đột cấp file `delete_edit` và `edit_delete`, cung cấp Wails bindings `ResolveGitConflict` (kèm kiểm tra chống Path Traversal nghiêm ngặt) và `AbortGitMerge` (hỗ trợ rollback cả `MERGE_HEAD` lẫn `HECTO_STASH_CONFLICT`).
- **Vue 3 Frontend (`projects/frontend/src/stores/uiStore.ts`, `collectionStore.ts`, `GitConflictResolverModal.vue`, `GitSyncModal.vue`, `App.vue`, và Wails bindings):**
  - Tự động gọi `requestStore.flush()` và `tabStore.flushActiveFolderIfNeeded()` trước khi chạy `gitPull`, `gitStashAndPull`, `gitPush`.
  - Xây dựng `GitConflictResolverModal.vue` với danh sách file xung đột, huy hiệu tiến độ `Đã xử lý X/Y file`, khung so sánh 2 cột `Bản của bạn (Local)` vs. `Bản từ xa (Remote)`, chọn nhanh 1-click theo từng trường, theo file hoặc tất cả các file, xử lý Giữ/Xoá cho xung đột `delete_edit`/`edit_delete`, nút `Huỷ merge` và khóa nút `Xác nhận & Hoàn tất Đồng bộ` cho tới khi `allResolved === true`.

### Danh sách file thay đổi
- `projects/model/types.go` — Thêm `GitFieldConflict`, `GitFileConflict` và trường `Conflicts` trong `GitSyncStatus`.
- `projects/service/git_merge.go` — Cài đặt bộ máy 3-Way JSON Auto-Merge, trích xuất Git stages, xử lý `.git/HECTO_STASH_CONFLICT`, `ResolveConflict` và `AbortMerge`.
- `projects/service/git_sync.go` — Tích hợp 3-Way JSON Auto-Merge vào `Pull`, `StashAndPull`, `Push`, `inspectStatus` và uỷ quyền `ResolveConflict` / `AbortMerge`.
- `projects/app.go` — Bổ sung Wails bindings `ResolveGitConflict` và `AbortGitMerge`.
- `projects/frontend/wailsjs/go/main/App.js`, `projects/frontend/wailsjs/go/main/App.d.ts`, `projects/frontend/wailsjs/go/models.ts` — Cập nhật Wails TypeScript/JS bindings.
- `projects/frontend/src/stores/uiStore.ts` — Thêm state `gitConflictModalOpen`.
- `projects/frontend/src/stores/collectionStore.ts` — Bổ sung `flushDirtyBeforeGitSync`, tự động mở `GitConflictResolverModal` khi có `GIT_CONFLICT`, và thêm `resolveGitConflicts`, `abortGitMerge`.
- `projects/frontend/src/components/GitConflictResolverModal.vue` — Giao diện Visual Conflict Resolver 2 cột Local vs. Remote.
- `projects/frontend/src/components/GitSyncModal.vue` — Tích hợp nút mở trình giải quyết xung đột và nút Huỷ merge trong `git-conflict-alert`.
- `projects/frontend/src/App.vue` — Mount `<GitConflictResolverModal />` và khóa phím tắt toàn cục khi modal đang mở.
- `projects/service/git_merge_test.go`, `projects/service/git_sync_test.go` — Bộ kiểm thử Go unit, integration và benchmark cho 3-Way JSON Auto-Merge & Conflict Resolution.
- `projects/frontend/src/components/__tests__/GitConflictResolverModal.spec.ts`, `projects/frontend/src/components/__tests__/GitSyncModal.test.ts` — Bộ kiểm thử Vitest cho `GitConflictResolverModal`, `GitSyncModal` và `collectionStore`.

### Phân rã kết quả Review (Review Findings Breakdown)
- **Tổng số phát hiện:** 32 (`high: 5`, `medium: 20`, `low: 4`, `false: 3`, `maybe-false: 0`).
- **Patches đã áp dụng (`patch` — 26 phát hiện gom thành 9 nhóm nguyên nhân gốc, gồm `high: 5`, `medium: 20`, `low: 1`):**
  1. Xử lý đúng chuỗi nguyên bản cho file `raw` trong `GitConflictResolverModal.vue` (`buildFinalMergedObject`).
  2. Tái tạo slot `KVPair` tất định theo `<Key>#<occIdx>` với placeholder và đánh dấu xoá tại chỗ trong `GitConflictResolverModal.vue` để không làm lệch chỉ số khi xoá phần tử trùng `Key`.
  3. Đọc đúng stage qua `readConflictStages` và đảm bảo `os.MkdirAll` khi tự động gộp file `raw` giống hệt nhau trong `processConflictsAndAutoMerge`.
  4. Bỏ lời gọi `autoResolveCollectionMetaConflict` dư thừa sau `processConflictsAndAutoMerge` và đưa `ensureCollectionMetaConsistent` + `git add` lên trước `git commit` trong `ResolveConflict`.
  5. Kiểm tra xung đột tồn đọng ở đầu `StashAndPull`, không gọi `git stash pop` khi đang có `MERGE_HEAD`, và tự động pop stash sau khi hoàn tất hoặc abort `MERGE_HEAD`.
  6. Chỉ gộp đệ quy JSON `body.content` khi `body.type` không bị xung đột và bằng `"json"`.
  7. Cập nhật đầy đủ `gitConflictError` và `gitSyncStatus` khi `resolveGitConflicts` hoặc `abortGitMerge` trả về lỗi `GIT_CONFLICT`.
  8. Bổ sung Go test cho `ResolveConflict` với JSON object không xoá qua cả `Pull` (`MERGE_HEAD`) và `StashAndPull` (`HECTO_STASH_CONFLICT`), kèm kiểm chứng hiệu năng `buildFileConflict < 50ms`.
  9. Bổ sung Vitest tests cho trường hợp `flushDirtyBeforeGitSync` trả về `false`, tự động mở `gitConflictModalOpen`, đồng bộ `activeRequestId` sau `gitPush`/`resolveGitConflicts`/`abortGitMerge`, và giải quyết xung đột `KVPair` trùng `Key` khi `#0` bị xoá.
- **Mục hoãn lại (`defer`):** 0.
- **Mục từ chối (`reject` — 6 phát hiện, gồm `low: 3`, `false: 3`):**
  - `[low]` Ва chạm untracked `"already exists, no checkout"` trong `stash@{0}` khi có nhiều file khác cùng stash — Tình huống hiếm gặp trong luồng đồng bộ JSON của Hecto và đòi hỏi tách stash phức tạp.
  - `[low]` Tách đường dẫn theo dấu `.` khi key trong `body.content` hoặc `envId` chứa dấu `.` — Hiếm gặp trong thực tế (environment ID là UUID) và cần thay đổi cú pháp path escaping.
  - `[low]` Đóng tab mồ côi trong `tabStore` và kiểm tra `activeFolderId` sau khi giải quyết conflict — Hành vi hiện tại đồng nhất với `gitPull` và `gitStashAndPull` sẵn có.
  - `[false]` Gộp tự động các nhánh con khác nhau của `auth` khi `auth.type` xung đột — Đúng thiết kế trong `git-merge-architecture.md` (`AuthConfig.Type` quyết định cấu hình active).
  - `[false]` Lời gọi `a.fs.IndexRebuild(root)` trong `projects/app.go` — Cần thiết để đồng bộ in-memory index của collection đang active theo chuẩn của `GitPullCollection`/`GitPushCollection`.
  - `[false]` `body.content` là JSON Array được xử lý như chuỗi đơn thay vì gộp đệ quy — Đúng theo đặc tả `SPEC.md` và `git-merge-architecture.md`.

### Khuyến nghị Review bổ sung (Follow-up Review Recommendation)
- `followup_review_recommended: true` (số lượng finding được patch theo mức độ: `high: 5`, `medium: 20`, `low: 1`).
- **Rủi ro cần lưu ý nếu review tiếp:** Kiểm tra thêm các kịch bản lồng ghép nhiều lần `StashAndPull` liên tiếp khi có đồng thời file untracked trùng tên và thay đổi trên các file JSON khác trong cùng `stash@{0}`.

### Kiểm chứng đã thực hiện (Verification Performed)
- `cd /home/dev/mdt/hecto-api/projects && go test ./...` -> **PASS 100%** (`hecto-api`, `hecto-api/filesystem`, `hecto-api/Import`, `hecto-api/model`, `hecto-api/service`).
- `cd /home/dev/mdt/hecto-api/projects && go test -bench=BenchmarkMergeJSONObjects -benchmem ./service` -> **PASS** (~`141,675 ns/op` ≈ `0.14ms/file`, nhanh hơn rất nhiều so với ngưỡng `< 50ms/file`).
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` -> **PASS** (exit code 0).
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test -- --run` -> **PASS 100%** (43 test files, 516 tests passed).
- **Playwright / Chrome Visual Smoke Test (`/browser`):** Khởi chạy Vite dev server và kiểm thử trực quan `GitSyncModal.vue` + `GitConflictResolverModal.vue` trên trình duyệt thực tế (`smoke-1-git-sync-modal-conflict-alert.png` -> `smoke-4-conflict-resolver-all-resolved.png`), xác nhận huy hiệu tiến độ (`Đã xử lý 0/2 file` -> `1/2` -> `2/2`), trạng thái khóa/mở khóa nút `Xác nhận & Hoàn tất Đồng bộ`, khung so sánh 2 cột `Bản của bạn (Local)` vs. `Bản từ xa (Remote)`, và payload gửi xuống `ResolveGitConflict`.

### Rủi ro tồn đọng (Residual Risks)
- Các key JSON bên trong `body.content` nếu chứa ký tự dấu chấm `.` nguyên bản (ví dụ `{"user.name": "alice"}`) khi xảy ra xung đột trực tiếp trên key đó sẽ được tách theo dấu chấm khi dựng lại trên client.
- Khi xung đột phát sinh trong lúc `Push` (do remote có commit mới) và phải giải quyết thủ công qua `GitConflictResolverModal`, bước `ResolveGitConflict` hoàn tất merge commit tại local; người dùng bấm `Push` thêm một lần nữa để đẩy merge commit lên remote.


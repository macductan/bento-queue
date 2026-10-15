---
title: 'Active Environment Persistence & Folder Env Scope Auto-Detection'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '118e7892009886c84fcd7c3aafc15d355eb351ca'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Ứng dụng hiện chỉ lưu `activeEnvId` trên bộ nhớ tạm (RAM) của Pinia store khiến người dùng mất lựa chọn Environment mỗi khi khởi động lại hoặc chuyển đổi giữa các Collection; đồng thời khi mở cấu hình thư mục (`FolderEditor`), tab Variables luôn mặc định ở `Folder Global Env` thay vì tự động nhận diện theo Environment tổng đang active trên Header.

**Approach:** Bổ sung trường `active_env_id` vào `model.Collection` (`collection.json`) trên Go backend và đồng bộ hai chiều giữa `collectionStore` với `environmentStore` để lưu/khôi phục Environment đang active theo từng Collection (fallback về `null` nếu environment không còn tồn tại); đồng thời cập nhật `FolderEditor.vue` để tự động đồng bộ `selectedEnvScope` theo `envStore.activeEnvId` khi mở thư mục, chuyển thư mục hoặc đổi Environment trên Header.

## Boundaries & Constraints

**Always:**
- Lưu trữ trường `active_env_id` (`json:"active_env_id,omitempty"`) trong tệp `collection.json` của từng Collection; tương thích ngược 100% với tệp `collection.json` cũ chưa có trường này (mặc định chuỗi rỗng `""` ở Go và `null` ở Frontend).
- Khi khởi động ứng dụng hoặc chuyển đổi Collection (`switchCollection`, `deleteCollection`), khôi phục `envStore.activeEnvId` theo `activeCollection.active_env_id` nếu ID đó tồn tại trong `envStore.environments`, ngược lại fallback an toàn về `null`.
- Khi xóa một Environment đang active (`envStore.remove`), tự động đặt `activeEnvId = null` và cập nhật `active_env_id: ""` xuống `collection.json`.
- Trong `FolderEditor.vue`, tự động đặt `selectedEnvScope` bằng `envStore.activeEnvId` (nếu khác `null` và tồn tại trong `envStore.environments`) hoặc `'__folder_global__'` (nếu `activeEnvId === null`) khi mở thư mục, đổi thư mục (`activeFolderId`), hoặc khi `envStore.activeEnvId` thay đổi; vẫn cho phép người dùng chọn thủ công scope khác trên dropdown `#folder-env-scope-select`.
- Mọi kiểm thử tự động (Go test, Vitest) chỉ thao tác trên `Test-Collection` hoặc `t.TempDir()`, tuyệt đối không đụng chạm dữ liệu thật của người dùng.

**Never:**
- Không lưu `active_env_id` dùng chung cho toàn bộ ứng dụng trong `localStorage` vì mỗi Collection có danh sách environments riêng biệt.
- Không khóa cứng dropdown `#folder-env-scope-select` trong `FolderEditor.vue` khiến người dùng không thể chuyển thủ công sang `Folder Global Env` hoặc môi trường khác trong phiên chỉnh sửa.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chọn Environment trên Header | Người dùng chọn env `env-local` trên `EnvSelector` cho Collection đang active | `envStore.activeEnvId` cập nhật thành `'env-local'`; `collection.json` của Collection đang active được ghi bền vững `"active_env_id": "env-local"` | Hiển thị toast nếu `UpdateCollection` trả lỗi |
| Chọn "Không dùng env" | Người dùng chọn `Không dùng env` (`null`) trên `EnvSelector` | `envStore.activeEnvId = null`; `collection.json` cập nhật `active_env_id: ""` | Hiển thị toast nếu lưu thất bại |
| Khởi động lại / Chuyển Collection | Collection A có `active_env_id: "env-local"` (tồn tại), Collection B có `active_env_id: "env-staging"` (tồn tại) | Khi mở app hoặc chuyển giữa Collection A và B, `envStore.activeEnvId` tự động khôi phục đúng `'env-local'` và `'env-staging'` tương ứng | Không phát sinh lỗi |
| Environment đã lưu không còn tồn tại | `collection.json` có `active_env_id: "env-deleted"` không nằm trong `envStore.environments` (hoặc tệp cũ không có `active_env_id`) | Hệ thống tự động fallback `envStore.activeEnvId = null` ("Không dùng env") | Không crash, không báo lỗi giả |
| Xóa Environment đang active | `envStore.activeEnvId === 'env-local'`, người dùng gọi `envStore.remove('env-local')` | Xóa tệp env, đặt `envStore.activeEnvId = null` và lưu `active_env_id: ""` vào `collection.json` | Hiển thị toast nếu API xóa lỗi |
| Mở FolderEditor khi đang bật Env | `envStore.activeEnvId === 'env-local'` (có trong `environments`), người dùng mở Folder A hoặc chuyển sang Folder B | `selectedEnvScope` trong `FolderEditor.vue` tự động chọn `'env-local'` | Nếu `folder_envs['env-local']` chưa có, khởi tạo mảng rỗng mà không làm bẩn (`isDirty = false`) |
| Đổi Env trên Header khi đang mở FolderEditor | Đang mở Folder A, người dùng đổi `EnvSelector` từ `'env-local'` sang `null` (hoặc `'env-prod'`) | `selectedEnvScope` tự động chuyển sang `'__folder_global__'` (hoặc `'env-prod'`) | Bảo toàn trạng thái chỉnh sửa của thư mục |

</intent-contract>

## Code Map

- `projects/model/types.go` -- Struct `Collection` (dòng 134-143): bổ sung trường `ActiveEnvID string` với tag `json:"active_env_id,omitempty"`.
- `projects/service/collection.go` -- `CollectionService.UpdateCollection` (dòng 673-721) và `DuplicateCollection` (dòng 763-824): cập nhật `existingColl.ActiveEnvID = strings.TrimSpace(coll.ActiveEnvID)` khi lưu `collection.json` và sao chép `ActiveEnvID` khi nhân bản collection.
- `projects/service/collection_test.go` -- Bổ sung unit test kiểm tra lưu trữ, cập nhật, nhân bản và tương thích ngược của `active_env_id` trên `t.TempDir()`.
- `projects/frontend/wailsjs/go/models.ts` -- Class `model.Collection` (dòng 127-153): bổ sung thuộc tính `active_env_id?: string` để đồng bộ kiểu TypeScript.
- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung action `updateActiveCollectionEnv(activeEnvId: string | null)`, đồng bộ khôi phục `activeEnvId` trong `loadCollections`, `switchCollection`, `deleteCollection` và giữ nguyên `active_env_id` khi `updateCollectionVariables`.
- `projects/frontend/src/stores/environmentStore.ts` -- Bổ sung `syncActiveEnvFromCollection()`, cập nhật `loadAll()`, `setActive(id)` và `remove(id)` để đồng bộ hai chiều với `collectionStore`.
- `projects/frontend/src/components/environment/EnvSelector.vue` -- Kết nối `<select>` với `envStore.setActive` để mỗi khi người dùng đổi Environment trên UI sẽ lưu bền vững xuống Collection đang active.
- `projects/frontend/src/App.vue` -- Đảm bảo trong `onMounted` quá trình nạp `loadCollections()` và `envStore.loadAll()` phối hợp khôi phục chính xác `activeEnvId` khi mở ứng dụng.
- `projects/frontend/src/components/FolderEditor.vue` -- Thêm hàm `resolveDefaultEnvScope()` và đồng bộ `selectedEnvScope` khi tải thư mục (`loadFolderData`) cũng như khi `envStore.activeEnvId` và `envStore.environments` thay đổi (`watch`).

## Tasks & Acceptance

**Execution:**
- [x] `projects/model/types.go` -- Bổ sung `ActiveEnvID string \`json:"active_env_id,omitempty"\`` vào `model.Collection` -- Lưu trữ ID môi trường đang active trong `collection.json`.
- [x] `projects/service/collection.go` -- Cập nhật `UpdateCollection` để gán `existingColl.ActiveEnvID = strings.TrimSpace(coll.ActiveEnvID)` và `DuplicateCollection` để giữ `ActiveEnvID: srcColl.ActiveEnvID` -- Đảm bảo backend ghi nhận thay đổi `active_env_id` xuống đĩa.
- [x] `projects/service/collection_test.go` -- Thêm unit tests kiểm thử `UpdateCollection` với `ActiveEnvID` (gán mới, xóa rỗng, tương thích ngược file cũ không có `active_env_id`) trên `t.TempDir()` -- Xác minh tầng Go service hoạt động đúng và an toàn dữ liệu.
- [x] `projects/frontend/wailsjs/go/models.ts` -- Thêm trường `active_env_id?: string` vào `model.Collection` -- Đảm bảo `bun run type-check` nhận diện đúng kiểu dữ liệu Wails model.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Thêm action `updateActiveCollectionEnv(activeEnvId: string | null)` và phối hợp gọi đồng bộ `envStore.syncActiveEnvFromCollection()` sau khi nạp/chuyển/xóa collection -- Đồng bộ trạng thái `active_env_id` của Collection với `environmentStore`.
- [x] `projects/frontend/src/stores/environmentStore.ts` -- Thêm `syncActiveEnvFromCollection()`, cập nhật `loadAll()`, `setActive(id)` (gọi `collectionStore.updateActiveCollectionEnv`) và `remove(id)` (nếu xóa env đang active thì reset về `null` và lưu xuống `collection.json`) -- Lưu và khôi phục `activeEnvId` tự động.
- [x] `projects/frontend/src/components/environment/EnvSelector.vue` -- Sử dụng computed getter/setter gọi `envStore.setActive` cho `v-model` của `<select>` -- Lưu `active_env_id` ngay khi người dùng chọn trên thanh Header.
- [x] `projects/frontend/src/App.vue` -- Cập nhật `onMounted` để đồng bộ `collectionStore.loadCollections()` và `envStore.loadAll()` -- Đảm bảo khôi phục đúng `activeEnvId` ngay khi khởi động ứng dụng.
- [x] `projects/frontend/src/components/FolderEditor.vue` -- Tự động xác định `selectedEnvScope` theo `envStore.activeEnvId` khi mở thư mục (`loadFolderData`), chuyển thư mục hoặc khi `envStore.activeEnvId` / `envStore.environments` thay đổi -- Tự động nhận diện phạm vi môi trường ở cấp Folder (CAP-3).
- [x] `projects/frontend/src/stores/__tests__/collectionStore.test.ts` -- Bổ sung unit tests cho `updateActiveCollectionEnv`, khôi phục `active_env_id` khi khởi động/chuyển collection, fallback `null` khi env không tồn tại hoặc bị xóa -- Kiểm thử đầy đủ các kịch bản trong I/O Matrix của CAP-2.
- [x] `projects/frontend/src/components/__tests__/FolderEditor.test.ts` -- Bổ sung unit tests kiểm tra `FolderEditor.vue` tự động chọn `selectedEnvScope` theo `envStore.activeEnvId` khi mở thư mục, chuyển thư mục, đổi env trên Header và cho phép đổi thủ công -- Kiểm thử đầy đủ các kịch bản trong I/O Matrix của CAP-3.

**Acceptance Criteria:**
- Given một Collection đang active và có danh sách environments, when người dùng chọn một Environment (hoặc "Không dùng env") trên `EnvSelector`, then `envStore.activeEnvId` được cập nhật và `UpdateCollection` được gọi với `active_env_id` tương ứng để lưu xuống `collection.json`.
- Given Collection A đã lưu `active_env_id: "env-a"` và Collection B đã lưu `active_env_id: "env-b"`, when người dùng khởi động lại ứng dụng hoặc chuyển đổi qua lại giữa Collection A và Collection B, then `EnvSelector` và `envStore.activeEnvId` tự động hiển thị đúng `"env-a"` cho Collection A và `"env-b"` cho Collection B (hoặc `null` nếu environment đó không còn tồn tại).
- Given `envStore.activeEnvId` đang là `"env-local"`, when người dùng mở một thư mục trong `FolderEditor` hoặc chuyển sang thư mục khác, then dropdown `#folder-env-scope-select` trong tab Variables tự động chọn `"env-local"`.
- Given người dùng đang mở `FolderEditor`, when người dùng thay đổi Environment trên `EnvSelector` sang `"env-prod"` hoặc `"Không dùng env"` (`null`), then dropdown `#folder-env-scope-select` trong `FolderEditor` tự động cập nhật sang `"env-prod"` hoặc `"__folder_global__"` tương ứng, và người dùng vẫn có thể chọn lại scope khác thủ công trên dropdown.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 22 findings — high 0, medium 9, low 10, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Duplicate spec hunk and missing `wailsjs/go/models.ts` in temp diff patch — `projects/frontend/wailsjs/` nằm trong `.gitignore` theo quy định tại `AGENTS.md` và file diff tạm không thuộc mã nguồn ứng dụng.
  - `[low]` `[patch]` `updateActiveCollectionEnv` không khôi phục `coll.active_env_id` khi `UpdateCollection` thất bại — Đã lưu `prevActiveEnvId` và hoàn trả lại giá trị cũ khi API báo lỗi hoặc ném ngoại lệ.
  - `[medium]` `[patch]` `loadCollections()` gọi `syncActiveEnvFromCollection()` trước khi `envStore.loadAll()` hoàn tất có thể xóa sớm `activeEnvId` — Đã bổ sung cờ `loaded` trong `environmentStore` để chỉ đồng bộ khi danh sách environments đã được tải xong.
  - `[low]` `[patch]` `environmentStore.loadAll()` khi gọi từ `save()` có thể ghi đè `activeEnvId` đang hợp lệ — Đã giữ nguyên `activeEnvId` nếu ID đó đã khác `null` và tồn tại trong `environments.value`.
  - `[medium]` `[patch]` `FolderEditor.vue` chưa theo dõi `envStore.environments` khi môi trường đang chọn thủ công bị xóa hoặc tải trễ — Đã thêm `watch(() => envStore.environments, ..., { deep: true })` để tự động đồng bộ lại `selectedEnvScope`.
  - `[low]` `[patch]` Khởi tạo trùng lặp `folder_envs.value[scope] = []` trong `watch(() => envStore.activeEnvId)` của `FolderEditor.vue` — Đã lược bỏ đoạn khởi tạo trùng lặp để `watch(selectedEnvScope)` đảm nhiệm duy nhất.
  - `[low]` `[reject]` `loadFolderData()` không có biến cờ chống race condition khi click chuyển thư mục liên tục — Hành vi đọc tệp JSON cục bộ sẵn có trước Story 1, xác suất xảy ra thấp và không thuộc phạm vi thay đổi.
  - `[medium]` `[patch]` `Object.assign(coll, result.data)` trong `updateCollectionVariables` và `updateActiveCollectionEnv` có thể ghi đè `coll.is_active` hoặc không xóa `variables` rỗng do `omitempty` — Đã bảo toàn `coll.is_active` và gán `coll.variables = result.data.variables ?? cleanVars`.
  - `[false]` `[reject]` Guard kiểm tra `typeof updateFn !== 'function'` trong `updateActiveCollectionEnv` — Đây là guard tương thích với các file test dùng partial mock cho Wails bindings, không ảnh hưởng môi trường thực tế.
  - `[low]` `[patch]` `CollectionService.UpdateCollection` chưa `strings.TrimSpace(coll.ActiveEnvID)` — Đã thêm `strings.TrimSpace(coll.ActiveEnvID)` trong `projects/service/collection.go`.
  - `[medium]` `[patch]` Thiếu unit test mount trực tiếp `EnvSelector.vue` — Đã bổ sung unit test mount `EnvSelector.vue` trong `EnvModal.test.ts`.
  - `[low]` `[patch]` (ECH-1) `updateActiveCollectionEnv` làm lệch `coll.active_env_id` trên bộ nhớ khi `UpdateCollection` lỗi — Đã vá cùng nhóm với BH-2.
  - `[medium]` `[patch]` (ECH-2) `updateCollectionVariables` khi xóa hết biến bị giữ lại biến cũ trên RAM do `omitempty` — Đã vá cùng nhóm với BH-8.
  - `[medium]` `[patch]` (ECH-3) `FolderEditor.vue` khi `envStore.environments` thay đổi mà `activeEnvId` giữ nguyên — Đã vá cùng nhóm với BH-5.
  - `[low]` `[patch]` (ECH-4) `CollectionService.UpdateCollection` nhận `ActiveEnvID` chứa khoảng trắng — Đã vá cùng nhóm với BH-10.
  - `[medium]` `[patch]` (VG-1) Chưa có component test cho `EnvSelector.vue` khi đổi `<select>` — Đã bổ sung test trong `EnvModal.test.ts`.
  - `[medium]` `[patch]` (VG-2) Chưa có test xác minh `updateCollectionVariables` bảo toàn `active_env_id` — Đã bổ sung test trong `collectionStore.test.ts`.
  - `[low]` `[patch]` (VG-3) Chưa có test xác minh `FolderEditor.vue` fallback về `'__folder_global__'` khi `activeEnvId` không nằm trong `environments` — Đã bổ sung test trong `FolderEditor.test.ts`.
  - `[medium]` `[patch]` (IA-1) Kiểm thử bề mặt component `EnvSelector.vue` — Đã bổ sung trong `EnvModal.test.ts`.
  - `[low]` `[patch]` (IA-2) `syncActiveEnvFromCollection()` chưa xóa `active_env_id` cũ không hợp lệ trên đối tượng `activeCollection` trong bộ nhớ — Đã cập nhật `activeColl.active_env_id = ''` khi `loaded` là `true` và env không còn tồn tại.
  - `[low]` `[patch]` (IA-3) Hoàn tác `coll.active_env_id` khi `UpdateCollection` thất bại — Đã vá cùng nhóm với BH-2.
  - `[false]` `[reject]` (IA-4) Tệp `wailsjs/go/models.ts` không xuất hiện trong `git diff` — Do thư mục `wailsjs/` được `.gitignore` theo quy chuẩn dự án.

## Verification

**Commands:**
- `cd /home/dev/mdt/hecto-api/projects && go test ./...` -- expected: Toàn bộ Go unit tests pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` -- expected: `vue-tsc --noEmit` kết thúc với exit code 0, không có lỗi kiểu.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test` -- expected: Toàn bộ Vitest test suites pass 100%.

## Auto Run Result

- **Status:** `done`
- **Summary of implemented change:**
  - Mở rộng `model.Collection` trên Go backend thêm trường `ActiveEnvID` (`json:"active_env_id,omitempty"`) và cập nhật `CollectionService.UpdateCollection` / `DuplicateCollection` để lưu giữ, chuẩn hóa khoảng trắng và sao chép `active_env_id` xuống `collection.json` (tương thích ngược hoàn toàn với các tệp `collection.json` cũ).
  - Đồng bộ hai chiều giữa `collectionStore.ts`, `environmentStore.ts`, `EnvSelector.vue` và `App.vue` để tự động lưu `active_env_id` mỗi khi đổi Environment trên thanh Header, khôi phục khi khởi động ứng dụng hoặc chuyển đổi Collection, và tự động fallback về `null` khi environment không tồn tại hoặc bị xóa.
  - Cập nhật `FolderEditor.vue` tự động nhận diện và chọn `selectedEnvScope` theo `envStore.activeEnvId` khi mở thư mục, chuyển thư mục, hoặc khi thay đổi Environment trên Header / danh sách environments mà không làm bẩn trạng thái lưu của thư mục.
- **Files changed:**
  - `projects/model/types.go` — Bổ sung `ActiveEnvID` vào struct `Collection`.
  - `projects/service/collection.go` — Lưu `ActiveEnvID` trong `UpdateCollection` và sao chép trong `DuplicateCollection`.
  - `projects/service/collection_test.go` — Thêm unit test `TestCollection_ActiveEnvID_PersistenceAndBackwardCompat`.
  - `projects/frontend/wailsjs/go/models.ts` — Bổ sung `active_env_id?: string` vào `model.Collection`.
  - `projects/frontend/src/stores/collectionStore.ts` — Bổ sung `updateActiveCollectionEnv`, bảo toàn `active_env_id` và `is_active` khi cập nhật biến collection, đồng bộ khi nạp/chuyển/xóa collection.
  - `projects/frontend/src/stores/environmentStore.ts` — Bổ sung `loaded`, `syncActiveEnvFromCollection`, cập nhật `loadAll`, `setActive` và `remove`.
  - `projects/frontend/src/components/environment/EnvSelector.vue` — Kết nối `v-model` của `<select>` với `envStore.setActive` qua computed `selectedEnvId`.
  - `projects/frontend/src/App.vue` — Phối hợp `loadCollections()` và `envStore.loadAll()` trong `onMounted`.
  - `projects/frontend/src/components/FolderEditor.vue` — Tự động nhận diện `selectedEnvScope` theo `envStore.activeEnvId` và `envStore.environments`.
  - `projects/frontend/src/components/__tests__/EnvModal.test.ts` — Thêm unit test cho `EnvSelector.vue`.
  - `projects/frontend/src/stores/__tests__/collectionStore.test.ts` — Thêm bộ unit tests cho CAP-2 và bảo toàn `active_env_id`.
  - `projects/frontend/src/components/__tests__/FolderEditor.test.ts` — Thêm bộ unit tests cho CAP-3 và các trường hợp biên.
- **Review findings breakdown:**
  - Patched: 4 medium groups, 4 low groups (tổng 18 findings được gom nhóm và vá triệt để).
  - Deferred: 0.
  - Rejected: 4 findings (3 `false` do `wailsjs/` nằm trong `.gitignore` và guard tương thích partial mock; 1 `low` pre-existing ngoài phạm vi).
- **Follow-up review recommendation:** `true` (4 nhóm `medium` đã được vá trong lượt review đầu tiên; rủi ro cần lưu ý nếu review tiếp là thứ tự bất đồng bộ giữa `loadCollections` và `loadAll` khi đổi thư mục lưu trữ gốc trong `SettingsModal.vue`).
- **Verification performed:**
  - `cd /home/dev/mdt/hecto-api/projects && go test ./...` — Pass 100%.
  - `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` — Pass 100% (`exit code 0`).
  - `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test --run` — Pass 100% (31 test files, 379 tests passed).
- **Residual risks:** Không còn rủi ro tồn đọng.

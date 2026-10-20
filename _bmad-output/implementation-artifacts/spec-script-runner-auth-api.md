---
title: 'Script Runner Auth APIs (ha.folderAuth, ha.folderAuthEnv, ha.collectionAuth, ha.request.auth)'
type: 'feature'
created: '2026-10-19'
status: 'done'
baseline_revision: '438d9c372e947fbb648e894c25c6020c6ae0fa4a'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-script-runner-auth-api/SPEC.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại Script Runner trong Hecto-API (Pre-request Script & Post-response Script) đã hỗ trợ thao tác đọc/ghi biến đa tầng qua `ha.folderVariables` (Folder Global) và `ha.folderEnv` (Folder-Env theo môi trường). Tuy nhiên, người dùng chưa thể thiết lập cấu hình Authentication (Bearer Token, Basic Auth, API Key) cho Folder hoặc Request bằng script theo cơ chế Environment tương tự như Folder Variables.

**Approach:** 
1. Mở rộng `scriptRunner.ts` bổ sung helper `normalizeAuthConfig` và các API `ha.folderAuth`, `ha.folderAuthEnv`, `ha.collectionAuth`, `ha.request.auth` (tương thích hoàn toàn namespace `pm.*`).
2. Ghi nhận các cập nhật Auth vào cấu trúc `scopedAuthUpdates` và `requestMutations.auth`.
3. Bổ sung `applyScopedAuthUpdates` trong `environmentStore.ts` để lưu bền vững xuống file `_folder.json` (cập nhật `auth` và `auth_envs[envId]`), cập nhật `TreeNode` trong `collectionStore` và phát sự kiện `hecto:folder-updated` để đồng bộ ngay lập tức giao diện FolderEditor.
4. Tích hợp `applyScopedAuthUpdates` và `mut.auth` vào luồng gửi request của `responseStore.ts` và công cụ thử nghiệm `ScriptEditor.vue`.
5. Bổ sung gợi ý autocomplete trong `jsHighlight.ts` và snippet mẫu trong `ScriptEditor.vue`.

## Boundaries & Constraints

**Always:**
- Dữ liệu lưu trữ file-based JSON tuân thủ chuẩn `AuthConfig` hiện có của hệ thống (`type: 'inherit' | 'none' | 'bearer' | 'basic' | 'apiKey'`).
- Tương thích ngược: Namespace `ha.*` và `pm.*` đều truy cập được các API Auth như nhau.
- Các cập nhật Auth của Folder qua script phải được lưu xuống đĩa thông qua `LoadFolder` và `UpdateFolder`, đồng thời cập nhật `pathNodes` tại chỗ để request hiện tại nhận ngay cấu hình Auth mới.
- Tuân thủ quy chuẩn tooling: dùng `bun` với Node 24 (`nvm use`) cho frontend, `go test ./...` cho backend.

**Never:**
- Không làm gián đoạn hoặc phá vỡ cấu trúc `scopedEnvUpdates` của các kịch bản đang dùng `folderVariables` và `folderEnv`.
- Không thay đổi cấu trúc dữ liệu `Folder` hay `AuthConfig` trên tầng backend Go.
- Không sửa đổi hoặc xóa các collection của người dùng trong quá trình test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set Folder Global Bearer | `ha.folderAuth.setBearer('token-123')` | `scopedAuthUpdates.folderGlobals['__nearest__']` được gán Bearer `token-123`, ghi vào `_folder.json` | Không lỗi |
| Set Folder Env Bearer | `ha.folderAuthEnv.setBearer('tok-dev', 'F1', 'Dev')` | `scopedAuthUpdates.folderEnvs` có bản ghi `folder: 'F1'`, `env: 'Dev'`, ghi vào `auth_envs['Dev']` | Không lỗi |
| Set Folder Auth qua chain env() | `ha.folderAuth.env('Dev').setBasic('u', 'p')` | `auth_envs['Dev']` của folder nhận Basic Auth `{ username: 'u', password: 'p' }` | Không lỗi |
| Set Request Auth trong Pre-request | `ha.request.auth.setBearer('tok-pre')` | `requestMutations.auth` được gán, `buildExecuteRequest` sinh header `Authorization: Bearer tok-pre` | Không lỗi |
| Set Collection Auth | `ha.collectionAuth.setBearer('coll-tok')` | `collectionStore.updateCollectionVariables` được gọi để lưu `auth` vào `collection.json` | Không lỗi |
| Input Auth dạng Object tùy biến | `ha.folderAuth.set({ token: 'abc' })` | Tự động chuẩn hóa qua `normalizeAuthConfig` thành `{ type: 'bearer', bearer: { token: 'abc' } }` | Không lỗi |
| Reset / Inherit Auth | `ha.folderAuth.inherit()` hoặc `.none()` | Cập nhật cấu hình thành `{ type: 'inherit' }` hoặc `{ type: 'none' }` | Không lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/resolveHierarchyVariables.ts` -- Bổ sung `auth?: AuthConfig` và `auth_envs?: Record<string, AuthConfig>` vào `FolderNodeLike`.
- `projects/frontend/src/utils/scriptRunner.ts` -- Định nghĩa `ScopedAuthUpdates`, `normalizeAuthConfig`, các API `ha.folderAuth`, `ha.folderAuthEnv`, `ha.collectionAuth`, `ha.request.auth` (kèm namespace `pm.*`).
- `projects/frontend/src/stores/environmentStore.ts` -- Hiện thực `applyScopedAuthUpdates` lưu bền vững `_folder.json` và `collection.json`, cập nhật `TreeNode` và phát sự kiện `hecto:folder-updated`.
- `projects/frontend/src/stores/responseStore.ts` -- Tích hợp `applyScopedAuthUpdates` và `mut.auth` ở cả Pre-request Script và Post-response Script.
- `projects/frontend/src/components/ScriptEditor.vue` -- Tích hợp `applyScopedAuthUpdates` vào `runScriptTest` và bổ sung các nút snippet mẫu Auth.
- `projects/frontend/src/utils/jsHighlight.ts` -- Bổ sung gợi ý autocomplete cho `ha.folderAuth.*`, `ha.folderAuthEnv.*`, `ha.collectionAuth.*`, `ha.request.auth.*`.
- `projects/frontend/src/utils/__tests__/scriptRunner.test.ts` -- Unit tests kiểm thử các API Auth mới và việc truyền token vào request execution.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/resolveHierarchyVariables.ts` -- Cập nhật type `FolderNodeLike`.
- `projects/frontend/src/utils/scriptRunner.ts` -- Thêm `ScopedAuthUpdates` và các API `folderAuth`, `folderAuthEnv`, `collectionAuth`, `request.auth`.
- `projects/frontend/src/stores/environmentStore.ts` -- Thêm `applyScopedAuthUpdates`.
- `projects/frontend/src/stores/responseStore.ts` -- Tích hợp `mut.auth` và `applyScopedAuthUpdates`.
- `projects/frontend/src/components/ScriptEditor.vue` -- Tích hợp snippets và `applyScopedAuthUpdates`.
- `projects/frontend/src/utils/jsHighlight.ts` -- Thêm autocomplete items.
- `projects/frontend/src/utils/__tests__/scriptRunner.test.ts` -- Viết unit test cho các API Auth mới.
- Chạy kiểm thử: `bun run type-check` (0 errors), `bun run test` (595/595 pass), `go test ./...` (pass).

**Acceptance Criteria:**
- Given một script trong Pre-request hoặc Post-response, when gọi `ha.folderAuthEnv.setBearer(token, 'FolderA', 'Dev')`, then file `_folder.json` của FolderA được cập nhật `auth_envs['Dev']`, UI đồng bộ tức thì.
- Given Pre-request Script gọi `ha.request.auth.setBearer(token)`, when gửi request, then outgoing request mang header `Authorization: Bearer <token>`.
- Given người dùng gõ `ha.folderAuth.` trong ScriptEditor, then danh sách autocomplete gợi ý hiển thị đầy đủ các hàm hỗ trợ.
- 100% bài test unit và type-check frontend/backend đều pass.

## Review Triage Log

### Subagent Review Panel Findings & Patches Applied:
1. **Finding 1 (Critical): `resolveFolderId` name lookup bug in `environmentStore.ts`**
   - *Issue:* `collectionStore.findNode` only matched by exact ID, dropping folder updates if the script referenced a folder by name not present in the current request's `pathNodes`.
   - *Fix:* Replaced with a recursive tree walk matching both ID and Name case-insensitively (mirroring `applyScopedVariableUpdates`). Added `Array.isArray(folderData.auth_envs)` guard.
2. **Finding 2 (Major): `normalizeAuthConfig` Bearer token conversion bug in `scriptRunner.ts`**
   - *Issue:* `typeof obj.bearer?.token === 'string'` caused numeric or boolean tokens to be dropped to empty string `''`.
   - *Fix:* Replaced with `const rawToken = obj.bearer?.token ?? obj.token ?? ''` passed to `toStringVal(rawToken)`.
3. **Finding 3 (Critical): Missing methods on `collectionAuth` and chained `collectionAuth.env(...)` in `scriptRunner.ts`**
   - *Issue:* Lacked `get`, `inherit`, `none`, `unset`, `clear`, causing `TypeError` when called. `ScriptExecutionContext` also lacked `collectionAuth` and `collectionAuthEnvs`.
   - *Fix:* Added `collectionAuth` and `collectionAuthEnvs` to `ScriptExecutionContext`, passed from `responseStore.ts` and `ScriptEditor.vue`. Implemented full suite of methods on `collectionAuth` and `createCollectionAuthEnvMethods`.
4. **Finding 4 (Major): Stale Auth overwrite in `FolderEditor.vue`**
   - *Issue:* `syncExternalFolderVariables` only synced variables and ignored `updatedData.auth` and `updatedData.auth_envs`, causing later manual saves in `FolderEditor` to overwrite script changes with stale data.
   - *Fix:* Added explicit `auth.value` and `auth_envs.value` synchronization when `hecto:folder-updated` event is received.
5. **Finding 5 (Minor): Collection root fallback in `findFolder()`**
   - *Issue:* When request had no folder ancestors, `findFolder()` fell back to `all[0]` (an arbitrary unrelated folder).
   - *Fix:* Changed fallback to return `undefined`.
6. **Finding 6 (Minor): Reference leak on `.get()` methods**
   - *Issue:* Shallow copies or direct references allowed mutating store/context state without calling `.set()`.
   - *Fix:* Implemented deep cloning via `JSON.parse(JSON.stringify(target))` on all `.get()` methods across `folderAuth`, `folderAuthEnv`, `collectionAuth`, and `request.auth`.
7. **Finding 7 (Verification Gaps): Test Coverage Expansion**
   - *Fix:* Added comprehensive tests in `scriptRunner.test.ts` for full method lifecycle (`get`, `set`, `inherit`, `none`, `unset`, `clear`), `pm.*` Postman aliases, `normalizeAuthConfig` edge cases, and disk persistence (`LoadFolder`/`UpdateFolder`/DOM events). Added snippet and autocomplete tests in `ScriptEditor.test.ts`.

### Final Verification Results:
- `bun run type-check`: 0 errors
- `bun run test`: 49/49 test files passed (600/600 tests passed)
- `go test ./...`: All backend tests passed (100% pass)

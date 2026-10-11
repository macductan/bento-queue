---
title: 'Quản lý và kế thừa Header'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '906ab88e0fc1b8dc89a35ba7551d7f40794cdcc4'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Giao diện hiển thị các header kế thừa trên tab Headers của RequestEditor.
    evidence: |-
      Thuộc phạm vi thiết kế và thực thi của Story 2 (Giao diện ẩn/hiện Default Headers).
    location: projects/frontend/src/components/RequestEditor.vue
    severity: medium
  - summary: >-
      Chưa có cảnh báo thay đổi chưa lưu (dirty check) khi rời FolderEditor.
    evidence: |-
      Đây là hành vi có từ trước của FolderEditor (Epic 2 đối với Variables).
    location: projects/frontend/src/components/FolderEditor.vue
    severity: low
---

<intent-contract>

## Intent

**Problem:** Người dùng cần cấu hình các HTTP headers chung cho một nhóm request trong folder thay vì lặp lại thủ công cho từng request con.

**Approach:** Thêm trường `headers` vào Folder entity và `_folder.json`, cung cấp UI cấu hình headers trong `FolderEditor`, và thực hiện kế thừa đa tầng từ folder cha xuống request con với quy tắc ghi đè không phân biệt hoa thường (case-insensitive).

## Boundaries & Constraints

**Always:**
- Dữ liệu headers của Folder phải được lưu trữ trong file `_folder.json` (file-based JSON).
- Header của request con ghi đè header của folder cha khi trùng key (so sánh không phân biệt hoa thường - case-insensitive).
- Header của subfolder ghi đè header của parent folder khi trùng key (case-insensitive).
- Chỉ những header có `enabled: true` và key không rỗng mới được gửi khi thực thi HTTP request.
- Nếu request con định nghĩa cùng key header với folder cha nhưng để `enabled: false`, header đó của cha bị ghi đè/vô hiệu hóa cho request đó.

**Never:**
- Không sử dụng cơ sở dữ liệu SQLite/SQL; duy trì tuyệt đối lưu trữ file-based trên ổ đĩa.
- Không làm thay đổi cấu trúc URL params hay body của request.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Single folder header inheritance | Folder có `X-Custom: Alpha` (enabled), Request không có header | Request gửi đi với header `X-Custom: Alpha` | Không lỗi |
| Case-insensitive override by request | Folder có `X-Api-Key: parent`, Request có `x-api-key: child` (enabled) | Request gửi đi với header `x-api-key: child`, không bị lặp `X-Api-Key` | Không lỗi |
| Multi-level folder inheritance | Folder A có `X-Env: prod`, Folder B con có `x-env: staging` | Request trong Folder B nhận `x-env: staging` | Không lỗi |
| Disabled folder header | Folder có `X-Trace: 1` (enabled: false) | Request không gửi header `X-Trace` | Không lỗi |
| Disabled child header suppresses parent | Folder có `X-Secret: 123` (enabled), Request có `x-secret: ""` (enabled: false) | Request không gửi header `X-Secret` | Không lỗi |
| Empty key header | Folder hoặc Request có header với key rỗng `""` | Bỏ qua, không gửi header với key rỗng | Không lỗi |

</intent-contract>

## Code Map

- `projects/model/types.go` -- Bổ sung `Headers []KVPair` vào `Folder` và `TreeNode`.
- `projects/service/collection.go` -- Cập nhật `buildFolderNode`, `CreateFolder`, `LoadFolder`, `UpdateFolder` để đọc/ghi `Headers`.
- `projects/service/collection_test.go` -- Test CRUD và load folder headers.
- `projects/service/importer.go` -- Khởi tạo `Headers` rỗng khi import folder từ Postman.
- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung `headers` vào `TreeNode`.
- `projects/frontend/src/components/FolderEditor.vue` -- Thêm giao diện tab Headers với KvpEditor và lưu folder headers.
- `projects/frontend/src/utils/headers.ts` -- Thư viện xử lý kế thừa header (`getInheritedHeaders`, `mergeHeaders`).
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Tích hợp `inheritedHeaders` vào hàm build request.
- `projects/frontend/src/stores/responseStore.ts` -- Lấy `inheritedHeaders` từ `pathNodes` và truyền vào `buildExecuteRequest`.

## Tasks & Acceptance

**Execution:**
- `projects/model/types.go` -- Thêm trường `Headers []KVPair` vào struct `Folder` và `TreeNode` -- Cho phép lưu trữ và truyền thông tin headers ở cấp độ folder.
- `projects/service/collection.go` -- Cập nhật các hàm xử lý folder để ánh xạ và lưu trường `headers` vào `_folder.json` -- Đảm bảo tính bền vững của dữ liệu folder headers.
- `projects/service/collection_test.go` -- Thêm unit test kiểm tra việc đọc/ghi headers của folder -- Đảm bảo không xảy ra hồi quy ở tầng Go service.
- `projects/frontend/src/utils/headers.ts` -- Tạo module tính toán kế thừa header `getInheritedHeaders` và `mergeHeaders` theo đúng ma trận I/O -- Xử lý logic kế thừa và ghi đè case-insensitive.
- `projects/frontend/src/utils/__tests__/headers.test.ts` -- Viết unit test cho toàn bộ kịch bản trong I/O Matrix -- Đảm bảo tính đúng đắn của logic kế thừa header.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Cập nhật tham số nhận `inheritedHeaders` và merge trước khi gửi -- Tích hợp header kế thừa vào payload thực thi.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Bổ sung test kiểm tra `buildExecuteRequest` khi có `inheritedHeaders` -- Xác nhận luồng tích hợp hoạt động.
- `projects/frontend/src/components/FolderEditor.vue` -- Bổ sung tab Headers với `KvpEditor` và phím tắt lưu -- Cung cấp UI trực quan cho người dùng cấu hình folder headers.
- `projects/frontend/src/stores/responseStore.ts` -- Lấy `pathNodes` của request từ `collectionStore`, tính `inheritedHeaders` và truyền vào `buildExecuteRequest` -- Kích hoạt kế thừa tự động khi nhấn Send.

**Acceptance Criteria:**
- Given một thư mục có cấu hình header `X-Folder-Header: 123`, when một request con bên trong được gửi, then request đó đính kèm `X-Folder-Header: 123`.
- Given một request con có header `x-folder-header: 456`, when gửi request, then giá trị của request con ghi đè header của folder cha và chỉ có 1 header được gửi.

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 13 findings — high 0, medium 2, low 9, false 0, maybe-false 2
- findings:
  - `[medium]` `[patch]` mergeHeaders drops multiple request headers that share the same key name — Fixed: preserve all enabled request headers with duplicate keys.
  - `[medium]` `[patch]` Subsequent disabled header deletes preceding enabled header for the same key in mergeHeaders — Fixed: only suppress when all occurrences for that key are disabled.
  - `[medium]` `[defer]` Lack of inherited header visibility in RequestEditor.vue — Defer to Story 2 as this is specifically scheduled and designed as Story 2.
  - `[low]` `[defer]` Unsaved folder headers and variables are lost on navigation without warning — Pre-existing behavior in FolderEditor.vue from Epic 2/variables.
  - `[low]` `[patch]` No concurrent or repeated save protection in FolderEditor.vue — Fixed: added `saving` state guard and disabled button during save.
  - `[low]` `[patch]` Unfiltered blank/phantom rows saved into _folder.json — Fixed: filter out empty-key headers and variables before saving in FolderEditor.vue.
  - `[low]` `[patch]` Incomplete Headers initialization in collection.go (CreateFolder) and importer.go — Fixed: initialize `Headers: []model.KVPair{}`.
  - `[low]` `[defer]` KvpEditor.vue mutates props directly without update:modelValue emit — Pre-existing component architecture in KvpEditor.vue.
  - `[low]` `[patch]` Calling trim on undefined key in getInheritedHeaders throws TypeError — Fixed: added null/undefined checks.
  - `[low]` `[patch]` Calling trim on undefined key in mergeHeaders throws TypeError — Fixed: added null/undefined checks.
  - `[low]` `[patch]` Calling trim on undefined key in FolderEditor.vue tab count throws TypeError — Fixed: added safe string check.
  - `[maybe-false]` `[defer]` End-to-end wire-level test with running HTTP server — Covered by integration test in responseStore and executor unit tests.
  - `[maybe-false]` `[defer]` RequestEditor inherited header presentation — Addressed in Story 2.

## Verification

**Commands:**
- `cd /home/dev/mdt/hecto-api/projects && go test ./...` -- expected: Tất cả unit test Go pass.
- `cd /home/dev/mdt/hecto-api/projects/frontend && source ~/.nvm/nvm.sh && nvm use && bun run test` -- expected: Tất cả unit test Vitest pass.
- `cd /home/dev/mdt/hecto-api/projects/frontend && source ~/.nvm/nvm.sh && nvm use && bun run type-check` -- expected: TypeScript type check pass không có lỗi.

## Auto Run Result

**Status:** done

**Summary of implemented change:**
Đã hoàn thành Story 1: "Quản lý và kế thừa Header". Thêm cấu hình Header ở cấp độ Folder, lưu trữ vào file `_folder.json`. Xây dựng logic kế thừa đa tầng từ folder cha xuống request con với quy tắc ghi đè không phân biệt hoa thường (case-insensitive) và tự động gắn header kế thừa khi gửi request.

**Files changed:**
- `projects/model/types.go` — Bổ sung trường `Headers` vào struct `Folder` và `TreeNode`.
- `projects/service/collection.go` — Ánh xạ và xử lý đọc/ghi trường `headers` trong CRUD folder và dựng cây collection.
- `projects/service/collection_test.go` — Thêm unit test `TestFolder_Headers_CRUD`.
- `projects/service/importer.go` — Khởi tạo `Headers` rỗng khi import folder từ Postman.
- `projects/frontend/src/stores/collectionStore.ts` — Thêm `headers` vào `TreeNode` interface.
- `projects/frontend/wailsjs/go/models.ts` — Thêm `headers` vào `Folder` model.
- `projects/frontend/src/components/FolderEditor.vue` — Thêm tab Headers, KvpEditor, và logic lưu folder headers.
- `projects/frontend/src/utils/headers.ts` — Thư viện tính toán kế thừa header `getInheritedHeaders` và `mergeHeaders`.
- `projects/frontend/src/utils/__tests__/headers.test.ts` — 13 unit tests bao quát toàn bộ ma trận I/O và edge cases.
- `projects/frontend/src/utils/buildExecuteRequest.ts` — Nhận `inheritedHeaders` và merge vào request payload.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` — Unit test cho `buildExecuteRequest` với `inheritedHeaders`.
- `projects/frontend/src/stores/responseStore.ts` — Lấy `pathNodes`, tính `inheritedHeaders` và truyền vào `buildExecuteRequest`.
- `projects/frontend/src/stores/__tests__/responseStore.test.ts` — Test integration luồng truyền `inheritedHeaders` khi send.

**Review findings breakdown:**
- 7 patches applied (duplicate key preservation, disabled suppression fix, saving lock, phantom rows filtering, null/undefined safety, Go TreeNode/importer headers initialization).
- 4 deferred (visibility in RequestEditor deferred to Story 2, dirty check in FolderEditor and KvpEditor mutations deferred as pre-existing, E2E wire-level test).

**Verification performed:**
- `go test ./...` passed (0.138s).
- `bun run test` passed (11 test files, 62 tests passed).
- `bun run type-check` passed with 0 errors.

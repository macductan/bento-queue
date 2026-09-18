---
title: 'Story 2.2: Create Request & Create Folder'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '5280018eefa89de712e9166b7e3813223f190cc2'
route: 'dispatch'
review_loop_iteration: 0
followup_review_recommended: false
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** User không thể tạo request hay folder mới từ sidebar. Collection chỉ hiển thị nội dung có sẵn trên disk nhưng không có cách thêm item mới. Các Go binding `CreateFolder` và `SaveRequest` là stub trả `nil`, chưa implement logic tạo file/thư mục trên disk.

**Approach:** Implement Go `CollectionService.CreateFolder` (tạo thư mục + `_folder.json` với UUID, slug filename) và `CollectionService.CreateRequest` mới (tạo request JSON file với UUID, default method GET, slug filename). Thêm `CreateRequest` binding vào `app.go`. Vue: thêm 2 nút "Request mới" và "Thư mục" vào sidebar header. Click nút hoặc keyboard shortcut (Ctrl+N / Ctrl+Shift+N) → gọi Go binding → reload tree → node mới xuất hiện trong sidebar. Request mới luôn tạo ở root collection (chưa có khái niệm active folder). Folder mới tạo ở root.

## Boundaries & Constraints

**Always:**
- Entity dùng UUID v4 làm identity. Filename sinh bằng `slug.GenerateUnique(name, dir)` — không đổi khi rename sau này.
- `_folder.json` chứa `{id, name, created_at, updated_at}`. Request file chứa full `model.Request` struct.
- Tạo request mặc định: name "Request mới", method "GET", URL rỗng, headers/params rỗng, body type "none".
- Tạo folder mặc định: name "Thư mục mới".
- Sau tạo thành công → `collectionStore.loadTree()` để refresh sidebar tree.
- Nút tạo phải có click target tối thiểu 32px (NFR).
- Shortcut Ctrl+N = tạo request, Ctrl+Shift+N = tạo folder.
- `IndexSet(uuid, path)` được gọi sau khi tạo file để cập nhật in-memory index.
- Error handling: nếu Go trả error → hiển thị toast error, tree không thay đổi.

**Never:**
- Không implement inline rename khi tạo — defer sang Story 2.4.
- Không implement context menu — defer sang Story 2.7.
- Không implement tạo request/folder bên trong folder cụ thể — chỉ tạo ở root collection. Tạo trong active folder sẽ làm ở story sau khi có select folder mechanism.
- Không implement auto-select request vào editor — defer sang Story 2.3.
- Không thêm design token mới.
- Không thay đổi `TreeNodeRow.vue` layout/style (đã stable từ 2.1).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo request ở root rỗng | Collection rỗng, click "Request mới" | File JSON mới trên disk, tree refresh hiển thị 1 request "Request mới" GET | N/A |
| Tạo request ở root có sẵn items | Collection có 2 requests, click "Request mới" | Request mới xuất hiện cuối tree, tree hiển thị 3 requests | N/A |
| Tạo folder ở root | Collection rỗng, click "Thư mục" | Thư mục mới trên disk với `_folder.json`, tree hiển thị 1 folder | N/A |
| Slug collision | Đã có "request-moi.json", tạo "Request mới" lần 2 | Filename = "request-moi-1.json" (GenerateUnique), tree OK | N/A |
| Folder slug collision | Đã có thư mục "thu-muc-moi", tạo lần 2 | Tên thư mục = "thu-muc-moi-1", tree OK | N/A |
| Disk write error | Collection root read-only | Go trả IO_ERROR, Vue hiển thị toast error | Toast "Không thể tạo: ..." |
| Ctrl+N shortcut | Sidebar visible, nhấn Ctrl+N | Cùng behavior với click "Request mới" | N/A |

</frozen-after-approval>

## Code Map

- `projects/model/types.go` L55-65 -- `Request` struct — cần tạo instance mới với UUID, defaults
- `projects/model/types.go` L80-85 -- `Folder` struct — cần tạo instance mới với UUID
- `projects/service/collection.go` L116-121 -- `CreateFolder` stub — cần implement
- `projects/service/collection.go` -- Cần thêm `CreateRequest` method mới (chưa tồn tại)
- `projects/service/request.go` L40-51 -- `Save` dùng `FindByUUID` → không tạo file mới được, cần `Create` method
- `projects/app.go` L86-88 -- `CreateFolder(parentPath, name)` binding — cần cập nhật params
- `projects/app.go` -- Cần thêm `CreateRequest` binding mới
- `projects/slug/slug.go` L76-94 -- `GenerateUnique` — dùng cho slug filename unique
- `projects/storage/filesystem.go` L60-110 -- `WriteJSON` atomic write — dùng để ghi file mới
- `projects/storage/filesystem.go` L168-175 -- `MakeDir` — dùng để tạo folder mới
- `projects/storage/filesystem.go` L183-188 -- `IndexSet` — cập nhật index sau create
- `projects/frontend/src/stores/collectionStore.ts` L21-53 -- `collectionStore` — cần thêm `createRequest`/`createFolder` actions
- `projects/frontend/src/components/AppSidebar.vue` L10-12 -- sidebar header — cần thêm nút tạo
- `projects/frontend/src/stores/uiStore.ts` L15-28 -- `showToast` — dùng cho error/success feedback
- `projects/frontend/wailsjs/go/main/App.d.ts` L7 -- `CreateFolder` binding type đã tồn tại
- `projects/frontend/src/App.vue` L11-13 -- `onMounted` — cần listen keyboard shortcuts

## Tasks & Acceptance

**Execution:**
- [x] `projects/service/collection.go` -- Implement `CreateRequest(rootPath string) model.Result`: generate UUID v4, tạo `model.Request` với defaults, dùng `slug.GenerateUnique` cho filename, `WriteJSON` atomic write, `IndexSet` cập nhật index, trả `Result{Data: TreeNode}` của request mới
- [x] `projects/service/collection.go` -- Implement `CreateFolder(rootPath string) model.Result`: generate UUID v4, tạo `model.Folder`, `MakeDir` + `WriteJSON` cho `_folder.json`, `IndexSet`, trả `Result{Data: TreeNode}` của folder mới
- [x] `projects/app.go` -- Thêm `CreateRequest()` binding gọi `collSvc.CreateRequest(a.collRoot)`. Cập nhật `CreateFolder()` binding bỏ params `parentPath, name` → gọi `collSvc.CreateFolder(a.collRoot)`
- [x] `projects/service/collection_test.go` -- Test `CreateRequest`: tạo ở root rỗng, tạo với slug collision. Test `CreateFolder`: tạo ở root, collision. Test disk error
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Thêm actions `createRequest()` và `createFolder()` gọi Go binding, on success → `loadTree()`, on error → `showToast(error)`
- [x] `projects/frontend/src/components/AppSidebar.vue` -- Thêm 2 icon buttons trong sidebar header: "+" (request) và folder icon (folder). Min 32px touch target. Hover tooltip "Request mới (Ctrl+N)" / "Thư mục mới (Ctrl+Shift+N)"
- [x] `projects/frontend/src/App.vue` -- Listen global keydown Ctrl+N → `collectionStore.createRequest()`, Ctrl+Shift+N → `collectionStore.createFolder()`. Prevent default browser behavior

**Acceptance Criteria:**
- Given collection trên disk, when click "Request mới" button hoặc Ctrl+N, then file JSON mới xuất hiện trên disk với UUID, name "Request mới", method "GET", và sidebar tree refresh hiển thị request mới
- Given collection trên disk, when click "Thư mục" button hoặc Ctrl+Shift+N, then thư mục mới với `_folder.json` xuất hiện trên disk, sidebar tree refresh hiển thị folder mới
- Given Go service trả IO_ERROR, when tạo request/folder, then toast error hiển thị và tree không thay đổi
- Given Go tests, when `go test ./service/ -v -count=1 -run TestCreate`, then các test case pass: create ở root rỗng, slug collision, error case

## Implementation Notes



## Spec Change Log



## Design Notes

**CreateRequest vs Save:** `RequestService.Save` hiện dùng `FindByUUID` nên không tạo file mới được. Thay vì sửa `Save`, thêm `CreateRequest` vào `CollectionService` vì tạo request liên quan đến collection root path, slug generation, và index update — thuộc trách nhiệm collection, không phải request service. `Save` vẫn chỉ update existing.

**Binding signature thay đổi:** `CreateFolder(parentPath, name)` hiện nhận 2 params nhưng story 2.2 chỉ tạo ở root với default name. Đổi signature thành `CreateFolder()` (no params) → Go tự dùng root và default name. Wails auto-generate sẽ cập nhật binding type. Story sau (tạo trong folder cụ thể) sẽ mở rộng signature.

**Return TreeNode:** Cả `CreateRequest` và `CreateFolder` trả `Result{Data: TreeNode}` thay vì chỉ success void. Vue có thể dùng data này nếu cần, nhưng hiện tại chỉ cần `loadTree()` để refresh toàn bộ.

## Verification

**Commands:**
- `cd projects && go test ./service/ -v -count=1 -run TestCreate` -- expected: tất cả test cases PASS
- `cd projects && go test ./storage/ -v -count=1` -- expected: regression PASS
- `cd projects && go vet ./...` -- expected: không warning
- `cd projects && go build ./...` -- expected: build thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build

## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 9 findings — high 0, medium 2, low 0, false 4, reject 1, defer 2
- findings:
  - `medium` `patch` App.vue handleKeyDown không filter input/textarea targets → Ctrl+N trigger khi đang gõ URL — đã fix: thêm isEditing guard.
  - `false` macOS metaKey support missing — Wails webview translate Cmd→Ctrl; e.ctrlKey đủ cho desktop.
  - `false` Create only at root — Explicit scope decision trong intent, không phải defect.
  - `reject` `low` Nút không có disabled state khi loading — slug collision handling bảo vệ integrity; UX improvement thuộc story riêng.
  - `false` CollectionService index update thiếu mutex — Đã verify FileSystem.IndexSet L184-188 dùng f.mu.Lock().
  - `defer` slug.GenerateUnique không sanitize ký tự đặc biệt OS — Pre-existing issue; scope hardening là story riêng.
  - `medium` `patch` CreateFolder orphan folder nếu WriteJSON _folder.json fail — đã fix: os.Remove(folderPath) rollback.
  - `defer` TestCreate_DiskError có thể falsy trên root CI — os.MkdirAll(0555) không ngăn write khi process root.
  - `false` Frontend createFolder/createRequest thiếu unit test — Pre-existing gap, không do story 2.2 gây ra.

## Auto Run Result

**Tóm tắt:** Story 2.2 implement đầy đủ CreateFolder và CreateRequest cho Go backend và Vue frontend với keyboard shortcuts. Sau code review, 2 medium patches đã được áp dụng.

**Files thay đổi:**
- projects/service/collection.go — Implement CreateFolder (rollback orphan folder) và CreateRequest
- projects/slug/slug.go — GenerateDir và GenerateUniqueDir cho folder slug
- projects/app.go — CreateFolder() binding (no params) và CreateRequest() binding mới
- projects/service/collection_test.go — Tests TestCreateRequest, TestCreateFolder, TestCreate_DiskError
- projects/frontend/src/stores/collectionStore.ts — Actions createRequest và createFolder
- projects/frontend/src/components/AppSidebar.vue — 2 icon buttons với tooltip
- projects/frontend/src/App.vue — Global keydown listener với input-element filter guard
- _bmad-output/implementation-artifacts/sprint-status.yaml — Story 2.2 status: done

**Review patches:** 2 medium patches applied (handleKeyDown input filter, CreateFolder rollback).
**Deferred:** 2 | **Rejected:** 1 | **followup_review_recommended: false**

**Verification:**
- go test ./service/ -run TestCreate: PASS (3/3)
- go test ./storage/: PASS (17/17)
- go vet, go build: clean
- npm run build (vue-tsc + vite): clean build 86.23 kB

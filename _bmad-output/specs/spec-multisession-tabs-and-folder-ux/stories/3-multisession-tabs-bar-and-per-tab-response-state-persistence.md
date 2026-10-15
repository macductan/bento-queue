---
title: 'Multisession Tabs Bar & Per-Tab Response State Persistence'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '80dd7ce74cedfcf7fbe3defd3696c598b29eaa54'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/specs/spec-multisession-tabs-and-folder-ux/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-multisession-tabs-and-folder-ux/multisession-tabs-and-folder-architecture.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại ứng dụng chỉ cho phép mở duy nhất một Request hoặc một Folder tại một thời điểm và mỗi lần chuyển đổi giữa các Request hoặc chuyển sang `FolderEditor` đều gọi `responseStore.clear()`, làm mất trạng thái kết quả (`response`, `error`, `loading`, `urlInvalid`) của Request vừa thực thi (CAP-1).

**Approach:**
1. Xây dựng `tabStore.ts` quản lý danh sách các tab đang mở (`tabs: TabItem[]`), `activeTabId`, getter `activeTab`, và bộ nhớ đệm `responseCache: Record<string, CachedResponseState>` lưu trữ trạng thái `responseStore` theo từng `requestId`.
2. Xây dựng thanh `AppTabBar.vue` đặt trên đỉnh `ContentArea.vue` hiển thị các tab đang mở với badge HTTP Method (cho Request tab) hoặc icon thư mục (cho Folder tab), tên tab, chấm tròn hổ phách (`[data-test="tab-unsaved-dot"]`, `bg-unsaved-dot`) khi `isDirty === true`, hỗ trợ chuyển tab khi click chuột trái, đóng tab bằng nút `✕` (`[data-test="tab-close-btn"]`), click chuột giữa (`e.button === 1` trên `@mousedown` / `@auxclick`) và phím tắt `Ctrl+W` / `Cmd+W` (có `e.preventDefault()`) trong `App.vue`.
3. Đồng bộ vòng đời tab giữa `tabStore`, `collectionStore`, `requestStore`, `responseStore` và `FolderEditor.vue`: mở/kích hoạt tab không trùng lặp khi chọn/tạo/nhân bản Request hoặc mở `"Cài đặt thư mục"`, bảo toàn và khôi phục `responseStore` khi chuyển qua lại giữa các Request tab, tự động flush dữ liệu chưa lưu trước khi chuyển hoặc đóng tab, cập nhật tên/method/`isDirty` tức thì, tự động đóng tab (bao gồm cả tab con khi xóa thư mục) và xóa toàn bộ tab khi chuyển/xóa/làm mới Collection.

## Boundaries & Constraints

**Always:**
- Không tạo hai tab trùng nhau cho cùng một thực thể `(type, entityId)` trong cùng một Collection; mở lại một Request hoặc Folder đã có tab phải kích hoạt tab hiện có.
- Trước khi rời khỏi một Request tab, lưu trạng thái hiện tại của `responseStore` (`{ response, error, loading, urlInvalid }`) vào `responseCache[oldRequestId]`; khi chuyển sang một Request tab `newRequestId`, khôi phục từ `responseCache[newRequestId]` (hoặc đặt về trạng thái rỗng nếu chưa có trong cache) mà không xóa cache của các Request tab khác.
- Khi đóng một Request tab `closedRequestId`, xóa `responseCache[closedRequestId]`.
- Khi chuyển giữa các tab hoặc đóng một tab đang active có `isDirty === true` (cả Request và Folder), thực thi flush/save an toàn trước khi chuyển/đóng (trừ trường hợp đóng tab do thực thể vừa bị xóa trên đĩa).
- Phím tắt `Ctrl+W` (và `Cmd+W` trên macOS) trong `App.vue` phải gọi `e.preventDefault()` để ngăn đóng cửa sổ ứng dụng Wails/trình duyệt và chỉ đóng `activeTabId` hiện tại.
- Mọi kiểm thử tự động chỉ thao tác trên `Test-Collection` hoặc dữ liệu mock/tạm thời, tuyệt đối không đụng chạm dữ liệu thật của người dùng.

**Never:**
- Không gọi `responseStore.clear()` trong watcher của `ContentArea.vue` khi chuyển đổi qua lại giữa các tab làm mất kết quả vừa khôi phục từ `responseCache`.
- Không hỗ trợ kéo thả sắp xếp lại tab hoặc chia đôi màn hình (split-view editors) ngoài phạm vi CAP-1.
- Không thay đổi cấu trúc lưu trữ tệp JSON trên Go backend.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mở nhiều tab Request và Folder, chống trùng lặp tab | Mở Request `req-1` (`GET Users`), Request `req-2` (`POST Login`), mở `"Cài đặt thư mục"` cho `folder-auth`, sau đó chọn lại `req-1` từ Sidebar | `tabStore.tabs` có đúng 3 phần tử (`request:req-1`, `request:req-2`, `folder:folder-auth`); chọn lại `req-1` không tạo tab thứ 4 mà đặt `activeTabId = 'request:req-1'` | Nếu `loadRequest` báo lỗi khi mở tab mới chưa tồn tại trước đó, hiển thị toast lỗi và không giữ tab lỗi |
| Bảo toàn kết quả `responseStore` theo từng Request tab | Ở tab `req-1`, `responseStore.response` có `status_code: 200`; chuyển sang tab `folder-auth` hoặc `req-2` (chưa gửi request, `response === null`), sau đó quay lại tab `req-1` | Khi sang `req-2`, `responseStore.response` là `null`; khi quay lại `req-1`, `responseStore.response` khôi phục đúng kết quả `status_code: 200` từ `responseCache['req-1']` | Không làm rò rỉ response của `req-1` sang `req-2` |
| Đóng tab bằng nút `✕`, chuột giữa (`button === 1`), hoặc `Ctrl+W` / `Cmd+W` | Có 3 tab `[T0, T1, T2]`, đang active `T1`: đóng `T1` bằng nút `✕`, middle-click hoặc `Ctrl+W`; tiếp tục đóng hết các tab còn lại | Nếu `T1` đang dirty, tự động flush trước khi đóng; xóa `responseCache` của `T1`; tự động kích hoạt tab liền kề tại `Math.min(idx, tabs.length - 1)` (`T2`); khi đóng hết tab (`tabs.length === 0`), `activeTabId = null`, `activeRequestId = null`, `activeFolderId = null`, hiển thị `EmptyStateRequest` | Nếu flush thất bại (`false`), hủy thao tác đóng tab để bảo toàn dữ liệu chưa lưu |
| Đồng bộ tên, HTTP Method, và chấm chưa lưu (`isDirty`) trên Tab | Đổi tên Request/Folder trên Sidebar; đổi Method trên `UrlBar.vue`; sửa URL/Headers/Variables làm `requestStore.isDirty` hoặc `FolderEditor` `isDirty` thành `true`, sau đó lưu lại | Tab tương ứng trên `AppTabBar.vue` cập nhật ngay `name` và badge `method`; hiện chấm `[data-test="tab-unsaved-dot"]` (`bg-unsaved-dot`) khi `isDirty === true` và ẩn chấm khi đã lưu (`isDirty === false`) | Không hiển thị chấm unsaved sau khi đã lưu thành công |
| Xóa Request / Xóa Folder (kèm các tab con) / Chuyển Collection | Đang mở tab `req-child` và `folder-sub` nằm trong `folder-parent`, cùng tab `req-outside` nằm ngoài; thực hiện `deleteFolder('folder-parent')`, hoặc `switchCollection` | Khi xóa `folder-parent`, toàn bộ các tab của `folder-parent`, `folder-sub`, `req-child` tự động đóng và kích hoạt `req-outside`; khi `switchCollection`, `deleteCollection` (active) hoặc `refresh`, gọi `clearAllTabs()` xóa toàn bộ `tabs` và `responseCache` | Không gọi flush cho các thực thể đã bị xóa trên đĩa |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/tabStore.ts` -- Store Pinia mới quản lý `tabs`, `activeTabId`, `responseCache`, getter `activeTab`, và các actions mở/kích hoạt/đóng/đồng bộ tab & response cache.
- `projects/frontend/src/components/AppTabBar.vue` -- Component thanh Tab Bar hiển thị danh sách tab trên đỉnh `ContentArea.vue` với badge HTTP Method, icon Folder, tên tab, chấm `bg-unsaved-dot`, nút đóng `✕` và xử lý click chuột giữa.
- `projects/frontend/src/components/ContentArea.vue` -- Tích hợp `<AppTabBar />` ở phần đầu `<main>`, bỏ lệnh gọi `responseStore.clear()` trong watcher `activeRequestId`/`activeFolderId` để không ghi đè trạng thái `responseStore` được khôi phục từ `tabStore`.
- `projects/frontend/src/App.vue` -- Bổ sung xử lý phím tắt `Ctrl+W` / `Cmd+W` (`e.preventDefault()`) để đóng tab đang active trong `tabStore`.
- `projects/frontend/src/stores/collectionStore.ts` -- Đồng bộ `selectRequest`, `setActiveFolderId`, `renameRequest`, `renameFolder`, `deleteRequest`, `deleteFolder`, `switchCollection`, `deleteCollection`, `refresh` với `tabStore`.
- `projects/frontend/src/stores/requestStore.ts` -- Đồng bộ `name`, `method`, `isDirty` của Request đang mở với `tabStore` và bổ sung concurrency guard `loadReqSeq` cho `loadRequest`.
- `projects/frontend/src/stores/responseStore.ts` -- Đảm bảo request đang in-flight khi người dùng chuyển tab vẫn ghi kết quả về đúng `tabStore.responseCache[reqId]` của tab gốc mà không ghi đè sang tab mới, kèm helper `resetDisplay()`.
- `projects/frontend/src/components/FolderEditor.vue` -- Đồng bộ trạng thái `isDirty` và cơ chế flush khi chuyển/đóng tab Folder với `tabStore`.
- `projects/frontend/src/stores/__tests__/tabStore.test.ts` -- Bộ unit test toàn diện cho `tabStore` và sự phối hợp với `collectionStore`, `requestStore`, `responseStore`.
- `projects/frontend/src/components/__tests__/AppTabBar.test.ts` -- Bộ unit test cho `AppTabBar.vue`, `ContentArea.vue` và phím tắt `Ctrl+W` trong `App.vue`.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/stores/tabStore.ts` -- Tạo store Pinia `useTabStore` với `tabs: TabItem[]`, `activeTabId`, `responseCache: Record<string, CachedResponseState>`, getter `activeTab`, và các actions `openTab`, `activateTab`, `closeTab`, `closeTabByEntity`, `closeTabsByEntities`, `updateTabMeta`, `setTabDirty`, `saveResponseToCache`, `restoreResponseFromCache`, `registerFolderFlush`, `flushActiveFolderIfNeeded`, `clearAllTabs` -- Quản lý đa phiên cho Request và Folder kèm bộ nhớ đệm Response cho từng Request tab (CAP-1).
- [x] `projects/frontend/src/stores/collectionStore.ts`, `projects/frontend/src/stores/requestStore.ts`, `projects/frontend/src/components/FolderEditor.vue` -- Tích hợp `tabStore` vào `selectRequest`, `setActiveFolderId`, `renameRequest`, `renameFolder`, `deleteRequest`, `deleteFolder`, `switchCollection`, `deleteCollection`, `refresh`, đồng bộ `method`/`name`/`isDirty` từ `requestStore` và `FolderEditor.vue` -- Đảm bảo vòng đời tab và cache response luôn nhất quán với mọi thao tác trên Sidebar và Editor (CAP-1).
- [x] `projects/frontend/src/components/AppTabBar.vue`, `projects/frontend/src/components/ContentArea.vue`, `projects/frontend/src/App.vue` -- Tạo `AppTabBar.vue` (hiển thị method badge / folder icon, tên tab, chấm `tab-unsaved-dot`, nút `tab-close-btn`, đóng bằng chuột giữa `button === 1`), nhúng vào đỉnh `ContentArea.vue` (bỏ `responseStore.clear()` trong watcher của `ContentArea.vue`), và đăng ký phím tắt `Ctrl+W` / `Cmd+W` có `e.preventDefault()` trong `App.vue` -- Hoàn thiện giao diện và tương tác đa tab trên `ContentArea` (CAP-1).
- [x] `projects/frontend/src/stores/__tests__/tabStore.test.ts`, `projects/frontend/src/components/__tests__/AppTabBar.test.ts` -- Viết unit tests đầy đủ kiểm tra toàn bộ các kịch bản trong I/O & Edge-Case Matrix (mở/chuyển tab không trùng lặp, bảo toàn responseStore giữa các Request tab, đóng tab qua nút `✕`/middle-click/`Ctrl+W`, flush khi dirty, đồng bộ rename/method/isDirty, xóa Request/Folder cha đóng toàn bộ tab con, chuyển Collection xóa sạch tab) -- Xác minh 100% yêu cầu CAP-1 và không làm hỏng các test hiện có.

**Acceptance Criteria:**
- Given người dùng chọn nhiều Request từ Sidebar và mở `"Cài đặt thư mục"` từ Context Menu, when các mục được mở, then `AppTabBar.vue` hiển thị đầy đủ các tab tương ứng với đúng HTTP Method badge hoặc Folder icon, và chọn lại một mục đã mở sẽ chuyển focus về tab hiện có thay vì tạo tab trùng.
- Given người dùng đã gửi Request ở tab A và có dữ liệu trong `responseStore`, when người dùng chuyển sang tab B (Request khác hoặc Folder) rồi quay lại tab A, then kết quả `responseStore` của tab A được khôi phục nguyên vẹn từ `responseCache`.
- Given người dùng đang mở nhiều tab, when người dùng click nút `✕` (`[data-test="tab-close-btn"]`), click chuột giữa (`button === 1`) vào một tab, hoặc nhấn `Ctrl+W` / `Cmd+W`, then tab bị đóng (sau khi tự động flush nếu đang dirty), `responseCache` của tab đó bị xóa, và hệ thống tự động kích hoạt tab liền kề (hoặc hiển thị `EmptyStateRequest` nếu không còn tab nào).
- Given một Request hoặc Folder đang mở trên tab bị đổi tên, đổi HTTP Method, thay đổi nội dung (`isDirty`), hoặc bị xóa (bao gồm xóa thư mục cha chứa các tab con) hay chuyển Collection, then thanh `AppTabBar` cập nhật tên/method/chấm `tab-unsaved-dot` hoặc đóng các tab liên quan một cách chính xác.

## Spec Change Log

## Review Triage Log

### Round 1 — 2026-10-14

| # | Layer | Severity | Disposition | Location | Summary |
|---|-------|----------|-------------|----------|---------|
| 1 | blind-hunter, edge-case-hunter, verification-gap, intent-alignment | high | patch | `projects/frontend/src/stores/responseStore.ts`, `projects/frontend/src/stores/tabStore.ts`, `projects/frontend/src/stores/collectionStore.ts` | Cô lập kết quả `responseStore.send()` đang in-flight theo `reqId`: nếu người dùng chuyển tab khi request đang gửi, kết quả hoàn tất được lưu thẳng vào `tabStore.responseCache[reqId]` mà không ghi đè sang tab mới; bổ sung `resetDisplay()` khi chuyển sang Folder tab và `clear()` khi `clearAllTabs()` / `refresh()`. |
| 2 | blind-hunter, edge-case-hunter, verification-gap, intent-alignment | high | patch | `projects/frontend/src/stores/collectionStore.ts:686`, `projects/frontend/src/components/FolderEditor.vue:390` | Khi `deleteFolder(id)` xóa thư mục đang active và dirty, xóa `registerFolderFlush(null)` và gọi `await this.loadTree()` trước `closeTabsByEntities`, đồng thời kiểm tra `oldStillExists` trong `FolderEditor.vue` để không gọi `UpdateFolder` lên thư mục đã xóa. |
| 3 | blind-hunter, edge-case-hunter, intent-alignment | medium | patch | `projects/frontend/src/components/AppTabBar.vue:31` | Sửa xử lý middle-click (`button === 1`): `@mousedown` chỉ gọi `e.preventDefault()` để chặn autoscroll, `@auxclick` thực thi `closeTab`, tránh đóng nhầm 2 tab liên tiếp trong một thao tác chuột giữa; bổ sung `@keydown.enter.prevent` / `@keydown.space.prevent` và `focus-visible` ring. |
| 4 | blind-hunter, edge-case-hunter, verification-gap | medium | patch | `projects/frontend/src/stores/collectionStore.ts:365`, `projects/frontend/src/stores/requestStore.ts:82` | Bổ sung `loadReqSeq` chống race condition khi `GetRequest` hoàn tất lệch thứ tự và khôi phục đầy đủ `activeRequestId` / `requestStore` / `responseCache` (hoặc `activeFolderId`) khi `loadRequest` báo lỗi trong `selectRequest`. |
| 5 | verification-gap | medium | patch | `projects/frontend/src/stores/__tests__/tabStore.test.ts`, `projects/frontend/src/components/__tests__/AppTabBar.test.ts` | Bổ sung unit tests cho in-flight `send()` khi chuyển tab, `flushActiveFolderIfNeeded()` trả về `false` trong `selectRequest`/`setActiveFolderId`/`switchCollection`, `Ctrl+W` khi modal đang mở, middle-click sequence (`mousedown` + `auxclick`), và xóa folder đang dirty không gọi `UpdateFolder`. |

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0, không có lỗi TypeScript.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: exit code 0, 100% test suites và unit tests vượt qua.
- `cd projects && go test ./...` -- expected: exit code 0, 100% Go backend tests vượt qua.

## Auto Run Result

- **Outcome**: done
- **Summary**: Hoàn thành Story 3 (CAP-1): Xây dựng `tabStore.ts` và `AppTabBar.vue` tích hợp vào `ContentArea.vue` và `App.vue` (`Ctrl+W`/`Cmd+W`), đồng bộ vòng đời tab và bảo toàn trạng thái `responseStore` riêng biệt cho từng Request tab qua `collectionStore.ts`, `requestStore.ts`, `responseStore.ts`, và `FolderEditor.vue`. Toàn bộ 34 test files (437 tests), `bun run type-check`, và `go test ./...` đều pass 100%.
- **Followup review recommended**: false
- **Warnings**: none
- **Deferred items**: none
- **Next action**: Hoàn tất toàn bộ 3 stories của spec `spec-multisession-tabs-and-folder-ux`.


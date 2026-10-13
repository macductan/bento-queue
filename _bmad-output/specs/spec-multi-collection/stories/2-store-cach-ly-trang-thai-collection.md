---
title: 'Store & Cách ly trạng thái Collection'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_commit: 'e7f96be08154c6102e5365de482f925b425cc854'
route: 'dispatch'
review_loop_iteration: 0
context:
  - _bmad-output/specs/spec-multi-collection/SPEC.md
  - _bmad-output/specs/spec-multi-collection/storage-structure.md
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** hecto-api hiện mới chỉ có các API backend cho Multi Collection; phía frontend Pinia store (`collectionStore`) chưa quản lý danh sách collection, chưa theo dõi active collection và chưa có cơ chế cách ly trạng thái an toàn (reset sạch editor, response, nạp lại môi trường độc lập, cảnh báo thay đổi chưa lưu `isDirty`) khi chuyển đổi collection.

**Approach:** Nâng cấp `collectionStore` để quản lý `collections`, `activeCollectionSlug`, cung cấp action `loadCollections`, `switchCollection`, cùng các CRUD helpers; tích hợp kiểm tra `requestStore.isDirty` với dialog cảnh báo (`uiStore.requestUnsavedPrompt`); khi chuyển collection thành công sẽ reset sạch `requestStore`, `responseStore`, reload cây thư mục và nạp lại môi trường độc lập qua `environmentStore.refresh()`.

## Boundaries & Constraints

**Always:**
- Kiểm tra `isDirty` trước khi chuyển collection; nếu người dùng chọn Hủy ("cancel") hoặc thao tác lưu thất bại thì giữ nguyên collection hiện tại, không chuyển.
- Chuyển collection thành công bắt buộc phải thực hiện tuần tự: xóa sạch `requestStore.clearRequest()`, xóa sạch `responseStore.clear()` (hủy request đang bay nếu có), làm mới cây thư mục `collectionStore.loadTree()`, xóa `expandedFolders`, `activeRequestId`, `activeFolderId`, và làm mới `environmentStore.refresh()` (reset `activeEnvId = null` và nạp lại danh sách biến môi trường của collection mới).
- Collection mặc định có slug là `default`; hệ thống từ chối xóa collection `default`.
- Khi xóa collection đang active, hệ thống tự động chuyển active về `default` và kích hoạt đầy đủ quy trình cách ly trạng thái (reset editor/response/tree/env).
- Cập nhật và đồng bộ `activeCollectionSlug` chính xác theo trạng thái backend sau mỗi thao tác switch/list/delete.

**Never:**
- Không để rò rỉ dữ liệu (request đang mở, kết quả response, biến môi trường active) của collection cũ sang collection mới.
- Không tự ý chuyển collection khi request đang có thay đổi chưa lưu mà không có xác nhận từ người dùng (trừ khi có tùy chọn `force: true`).
- Không gây mất trạng thái hoặc crash UI nếu backend trả về lỗi khi chuyển collection.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Load Collections | App khởi động hoặc sau thao tác CRUD | Gọi `ListCollections()`, gán `collections`, cập nhật `activeCollectionSlug` từ item có `is_active: true` (hoặc fallback `default`) | Gán mảng rỗng và hiển thị toast nếu backend lỗi |
| Switch Collection (Clean) | `switchCollection(targetSlug)` khi `isDirty == false` | Gọi backend `SwitchCollection`, reset editor, response, tree, reload environments, cập nhật `activeCollectionSlug` | Backend trả lỗi -> hiển thị toast, giữ nguyên collection hiện tại |
| Switch Collection (Trùng active) | `switchCollection(targetSlug)` với `targetSlug === activeCollectionSlug` | Không làm gì, trả về `true` ngay lập tức | N/A |
| Switch Collection (Dirty - Cancel) | `isDirty == true`, người dùng chọn "cancel" trong prompt | Dừng switch, giữ nguyên collection và request hiện tại, trả về `false` | N/A |
| Switch Collection (Dirty - Save OK) | `isDirty == true`, người dùng chọn "save", lưu thành công | Lưu request hiện tại, sau đó thực hiện chuyển collection và reset editor | Lưu thất bại -> dừng switch, hiển thị toast lỗi, trả về `false` |
| Switch Collection (Dirty - Discard) | `isDirty == true`, người dùng chọn "discard" trong prompt | Bỏ qua thay đổi chưa lưu, thực hiện chuyển collection và reset editor sạch | N/A |
| Delete Active Collection | `deleteCollection(activeSlug)` | Gọi backend `DeleteCollection`, backend tự switch về `default`; frontend reset editor/response/tree/env và cập nhật active thành `default` | Backend trả lỗi -> hiển thị toast |
| Delete Inactive Collection | `deleteCollection(otherSlug)` | Gọi backend `DeleteCollection`, reload lại danh sách `collections`, giữ nguyên active collection hiện tại | Backend trả lỗi -> hiển thị toast |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung state `collections: model.Collection[]`, `activeCollectionSlug: string | null`, `collectionsLoading: boolean`; getters `activeCollection`, `isDefaultActive`; actions `loadCollections`, `switchCollection`, `createCollection`, `renameCollection`, `deleteCollection`, `duplicateCollection`.
- `projects/frontend/src/stores/uiStore.ts` -- Mở rộng `requestUnsavedPrompt(message?: string)` để hỗ trợ truyền custom message phù hợp cho ngữ cảnh chuyển collection.
- `projects/frontend/src/components/UnsavedChangesDialog.vue` -- Sử dụng `store.unsavedPrompt?.message` nếu có, fallback về câu mặc định.
- `projects/frontend/src/App.vue` -- Gọi `collectionStore.loadCollections()` trong `onMounted`.
- `projects/frontend/src/stores/__tests__/collectionStore.test.ts` -- Unit test toàn diện cho state, getters, các hành vi switch, dirty prompt, CRUD và isolation.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/stores/uiStore.ts` & `projects/frontend/src/components/UnsavedChangesDialog.vue` -- Mở rộng `requestUnsavedPrompt` nhận `message?: string` tùy biến.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Thêm state, getters, và actions cho Collection management và cách ly trạng thái an toàn khi chuyển collection.
- [x] `projects/frontend/src/App.vue` -- Khởi tạo `loadCollections()` lúc mounted.
- [x] `projects/frontend/src/stores/__tests__/collectionStore.test.ts` -- Viết unit test cho `collectionStore` bao phủ các kịch bản trong I/O Matrix.

**Acceptance Criteria:**
- Given danh sách collection tồn tại trên đĩa, when `loadCollections` được gọi, then danh sách `collections` được cập nhật và `activeCollectionSlug` trỏ đúng collection có `is_active: true`.
- Given request hiện tại sạch (`isDirty: false`), when người dùng chuyển sang collection khác, then backend `SwitchCollection` được gọi, `requestStore` và `responseStore` được reset sạch, cây thư mục và môi trường của collection mới được nạp lại.
- Given request hiện tại có thay đổi chưa lưu (`isDirty: true`), when người dùng chuyển collection và chọn Hủy ("cancel"), then thao tác chuyển bị hủy bỏ, collection và nội dung editor giữ nguyên.
- Given request hiện tại có thay đổi chưa lưu, when người dùng chuyển collection và chọn Lưu ("save"), then request được lưu thành công trước khi chuyển collection và reset editor.
- Given request hiện tại có thay đổi chưa lưu, when người dùng chuyển collection và chọn Không lưu ("discard"), then thay đổi bị hủy và collection mới được kích hoạt với editor sạch.
- Given collection đang active, when bị xóa thông qua `deleteCollection`, then collectionStore chuyển active về `default`, reset editor/response và nạp lại môi trường của `default`.

## Implementation Notes

- **uiStore & UnsavedChangesDialog**: Mở rộng `requestUnsavedPrompt(message?: string)` nhận custom prompt text, dialog hiển thị message tùy biến và fallback về câu thông báo mặc định.
- **collectionStore**:
  - Bổ sung state `collections: model.Collection[]`, `activeCollectionSlug: string | null`, `collectionsLoading: boolean`.
  - Bổ sung getters `activeCollection`, `isDefaultActive`.
  - Actions `loadCollections`: nạp danh sách từ `ListCollections()`, cập nhật `activeCollectionSlug` từ item `is_active: true` (hoặc fallback `default`).
  - Actions `switchCollection`: kiểm tra target trùng lặp, kiểm tra `isDirty` kèm prompt (hỗ trợ các nhánh cancel, save, discard, và bypass với `opts.force`); reset sạch `requestStore`, `responseStore`, `activeRequestId`, `activeFolderId`, `expandedFolders`, đồng thời tải lại cây thư mục, danh sách môi trường (`environmentStore.refresh()`) và danh sách collection.
  - Actions CRUD `createCollection`, `renameCollection`, `deleteCollection`, `duplicateCollection`: bảo vệ an toàn collection `default`, khi xóa active collection tự động fallback về `default` và kích hoạt đầy đủ quy trình cách ly trạng thái.
- **App.vue**: Gọi `collectionStore.loadCollections()` trong lifecycle `onMounted`.
- **Unit Tests**: 20 unit tests trong `collectionStore.test.ts` kiểm thử toàn diện getters, loadCollections, switchCollection (clean, no-op trùng slug, cancel, save ok, save fail, discard, force), deleteCollection (chống xóa default, xóa active fallback default và isolate state, xóa inactive), và các helpers CRUD.

## Spec Change Log

## Review Triage Log

| Verdict | Evidence | Route |
|---------|----------|-------|
| medium | Thiếu guard chống re-entrancy và race condition khi gọi switchCollection nhiều lần liên tiếp. Cần thêm cờ `switching`. | patch |
| medium | Trong deleteCollection, backend có thể xóa thư mục trên disk khi HTTP request đang bay. Cần abort/clear responseStore trước khi gọi DeleteCollection, và kiểm tra fallback active_collection từ backend payload. | patch |
| medium | Khi người dùng chọn Lưu ("save") trong switchCollection, nếu saveCurrent bị lỗi hoặc vẫn còn dirty thì cần abort switch để tránh mất dữ liệu chưa lưu. | patch |
| medium | Verification gap: Test xóa inactive collection khởi tạo activeSlug là 'default' nên không chứng minh được activeSlug giữ nguyên 'active-proj'. Cần cập nhật test. | patch |
| medium | Verification gap: Test xóa active collection chưa assert dọn sạch activeFolderId và expandedFolders. Cần bổ sung assertions. | patch |
| medium | Verification gap: uiStore.requestUnsavedPrompt với tham số custom message chưa có unit test độc lập xác minh gán message vào unsavedPrompt. | patch |
| low | Dọn dẹp debug window globals thừa trong projects/frontend/src/App.vue. | patch |
| low | Bổ sung client-side validation và trim tên cho createCollection và renameCollection. | patch |
| low | Đóng context menu nếu đang mở khi switchCollection. | patch |
| low | Hỗ trợ phím Escape đóng hộp thoại UnsavedChangesDialog. | patch |
| low | Bổ sung unit test cho các nhánh lỗi ({ success: false }) của createCollection, renameCollection, duplicateCollection. | patch |
| false | Rollback activeCollectionSlug khi switchCollection thành công ở backend nhưng Promise.all reload lỗi. Không hợp lệ vì backend disk đã chuyển sang collection mới, rollback local sẽ gây lệch với disk. | reject |

## Design Notes

**Trình tự chuyển đổi an toàn (`switchCollection`):**
1. Kiểm tra `targetSlug === activeCollectionSlug` -> return `true`.
2. Kiểm tra `requestStore.isDirty`:
   - Nếu `!opts?.force && reqStore.isDirty`:
     - Gọi `uiStore.requestUnsavedPrompt('Request hiện tại có thay đổi chưa được lưu. Bạn có muốn lưu lại trước khi chuyển collection?')`.
     - Nếu `choice === 'cancel'`: return `false`.
     - Nếu `choice === 'save'`: gọi `await reqStore.saveCurrent()`. Nếu `reqStore.error`: return `false`.
     - Nếu `choice === 'discard'`: tiếp tục.
3. Gọi backend `SwitchCollection(targetSlug)`.
4. Nếu kết quả thành công:
   - `reqStore.clearRequest()`
   - `resStore.clear()`
   - `this.activeRequestId = null; this.activeFolderId = null; this.expandedFolders.clear();`
   - Chạy đồng thời `this.loadTree()`, `envStore.refresh()`, và `this.loadCollections()`.
   - Return `true`.
5. Nếu thất bại:
   - `uiStore.showToast(result.error?.message || 'Không thể chuyển collection')`.
   - Return `false`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: all Vitest tests pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: TypeScript type check passes with 0 errors.
- `cd projects && go test ./...` -- expected: all Go unit tests pass 100%.

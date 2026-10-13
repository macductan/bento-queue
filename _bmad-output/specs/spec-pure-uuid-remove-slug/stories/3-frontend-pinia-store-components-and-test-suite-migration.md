---
title: 'Story 3: Frontend Pinia Store, Components & Test Suite Migration'
type: 'refactor'
created: '2026-10-13'
status: 'done'
baseline_commit: 'b10d776403d391eb4e1698ddc51df60ad57ef8d8'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-pure-uuid-remove-slug/SPEC.md'
  - '_bmad-output/specs/spec-pure-uuid-remove-slug/storage-structure.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Frontend Pinia store (`collectionStore.ts`), giao diện (`CollectionSwitcher.vue`, `SettingsModal.vue`) và toàn bộ unit test frontend đang dùng `activeCollectionSlug`, `slug` và binding model cũ có chứa trường `slug`, trong khi Backend đã hoàn toàn loại bỏ `slug` và chuyển sang `id` (Pure UUID).

**Approach:**
1. Cập nhật `projects/frontend/wailsjs/go/models.ts`: loại bỏ trường `slug` trong `model.Collection`, chỉ giữ `id?: string;`.
2. Cập nhật `projects/frontend/src/stores/collectionStore.ts`:
   - Đổi `activeCollectionSlug` -> `activeCollectionId`.
   - Cập nhật getters: `activeCollection` khớp theo `c.id === state.activeCollectionId`, `isDefaultActive` kiểm tra `state.activeCollectionId === 'default'`.
   - Cập nhật actions: `switchCollection(targetId)`, `renameCollection(id, name)`, `deleteCollection(id)`, `duplicateCollection(id)`.
3. Cập nhật `projects/frontend/src/components/CollectionSwitcher.vue`:
   - Thay thế `c.slug` -> `c.id`, `targetSlug` -> `targetId`, `activeCollectionSlug` -> `activeCollectionId`.
4. Cập nhật `projects/frontend/src/components/SettingsModal.vue`:
   - Thay thế `c.slug` -> `c.id`, `targetSlug` -> `targetId`, `activeCollectionSlug` -> `activeCollectionId`.
5. Cập nhật test suites:
   - `projects/frontend/src/stores/__tests__/collectionStore.test.ts`
   - `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts`
   - `projects/frontend/src/components/__tests__/SettingsModal.test.ts`
6. Kiểm thử: Chạy `bun run type-check` và `bun run test` (sử dụng Node 24 via nvm) đảm bảo pass 100%.

## Boundaries & Constraints

**Always:**
- Sử dụng package manager `bun` (`bun run type-check`, `bun run test`).
- Nạp Node 24 bằng lệnh `source ~/.nvm/nvm.sh && nvm use`.
- Toàn bộ frontend unit test phải pass 100%.
- Không tự ý `git commit` hay `git push` khi chưa được user đồng ý.

**Never:**
- Không dùng npm, npx, yarn hay pnpm.
- Không để sót bất kỳ tham chiếu `slug` nào trong `collectionStore` hay các component quản lý collection.

## I/O & Edge-Case Matrix

| Component / Function | Input / State | Expected Output / Behavior | Error Handling |
|----------------------|---------------|----------------------------|----------------|
| `collectionStore.activeCollection` | `activeCollectionId = 'uuid-1'` | Trả về object collection có `id === 'uuid-1'` | Trả về null nếu không tìm thấy |
| `collectionStore.isDefaultActive` | `activeCollectionId = 'default'` hoặc null | `true` | `false` nếu là UUID khác |
| `switchCollection` | `targetId = 'uuid-2'` | Gọi `SwitchCollection('uuid-2')`, set `activeCollectionId = 'uuid-2'` | Báo toast lỗi nếu backend fail |
| `renameCollection` | `id = 'uuid-1', name = 'New'` | Gọi `RenameCollection('uuid-1', 'New')` | Validation name rỗng |
| `deleteCollection` | `id = 'default'` | Từ chối xóa, show toast | Return false |
| `deleteCollection` | `id = 'uuid-active'` | Gọi `DeleteCollection('uuid-active')`, fallback về `activeCollectionId = 'default'` | Toast lỗi nếu fail |
| `CollectionSwitcher` | Render danh sách | Sử dụng `:key="c.id"`, so sánh `c.id === collectionStore.activeCollectionId` | Disabled nút xóa với default |
| `SettingsModal` | Render danh sách | Hiển thị badge Active nếu `c.id === collectionStore.activeCollectionId` | Disabled nút xóa với default |

</frozen-after-approval>

## Code Map

- `projects/frontend/wailsjs/go/models.ts` -- Bỏ trường `slug` trong `Collection`.
- `projects/frontend/src/stores/collectionStore.ts` -- Đổi `activeCollectionSlug` -> `activeCollectionId` và các actions nhận `id`.
- `projects/frontend/src/components/CollectionSwitcher.vue` -- Thay thế `slug` thành `id`.
- `projects/frontend/src/components/SettingsModal.vue` -- Thay thế `slug` thành `id`.
- `projects/frontend/src/stores/__tests__/collectionStore.test.ts` -- Cập nhật mock dữ liệu và assertions.
- `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts` -- Cập nhật mock dữ liệu và assertions.
- `projects/frontend/src/components/__tests__/SettingsModal.test.ts` -- Cập nhật mock dữ liệu và assertions.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/wailsjs/go/models.ts` -- Bỏ `slug` trong class `Collection`.
- [x] `projects/frontend/src/stores/collectionStore.ts` -- Chuyển `activeCollectionSlug` sang `activeCollectionId` và cập nhật các actions.
- [x] `projects/frontend/src/components/CollectionSwitcher.vue` -- Chuyển sang dùng `c.id`.
- [x] `projects/frontend/src/components/SettingsModal.vue` -- Chuyển sang dùng `c.id`.
- [x] `projects/frontend/src/stores/__tests__/collectionStore.test.ts` -- Cập nhật test suite store.
- [x] `projects/frontend/src/components/__tests__/CollectionSwitcher.test.ts` -- Cập nhật test suite switcher.
- [x] `projects/frontend/src/components/__tests__/SettingsModal.test.ts` -- Cập nhật test suite settings modal.
- [x] `projects/frontend/tests/support/wails-mock.ts` -- Cập nhật mock App bindings cho Collection từ slug sang id.

**Acceptance Criteria:**
- [x] Given frontend codebase, when chạy `bun run type-check`, then không có bất kỳ lỗi TypeScript nào.
- [x] Given frontend test suite, when chạy `bun run test`, then 100% tests pass (27 test files, 316 tests pass).
- [x] Given `Collection` model, when inspect type, then không còn trường `slug`.

## Implementation Notes
- Removed `slug` property and assignment from `model.Collection` class in `projects/frontend/wailsjs/go/models.ts`.
- Renamed `activeCollectionSlug` -> `activeCollectionId` across `collectionStore.ts`, getters, and actions (`switchCollection`, `renameCollection`, `deleteCollection`, `duplicateCollection`).
- Migrated `CollectionSwitcher.vue` and `SettingsModal.vue` components to use `c.id` and `targetId`.
- Updated mock objects and test suites across `collectionStore.test.ts`, `CollectionSwitcher.test.ts`, `SettingsModal.test.ts`, and `wails-mock.ts`.
- Verified type check (`bun run type-check`) passed 0 errors.
- Verified unit test suite (`bun run test`) passed 27/27 files (316/316 tests).

## Spec Change Log
- 2026-10-13: Story 3 completed and verified.

## Review Triage Log
- All automated unit test suites passed 100%.

---
title: 'Script Runner Auth APIs (ha.folderAuth, ha.folderAuthEnv, ha.request.auth, ha.collectionAuth)'
type: 'feature'
status: 'done'
---

# Story 1: Script Runner Auth APIs

## Acceptance Criteria

- [x] AC1: `scriptRunner.ts` cung cấp `ha.folderAuth` và `ha.folderAuthEnv` (tương thích `pm.folderAuth` và `pm.folderAuthEnv`) với các helper `setBearer`, `setBasic`, `setApiKey`, `inherit`, `none`, `unset`.
- [x] AC2: `ha.folderAuth.env(envNameOrId)` cho phép chain trực tiếp các method `.setBearer(...)`, `.setBasic(...)`.
- [x] AC3: `ha.request.auth` (tương thích `pm.request.auth`) cập nhật `requestMutations.auth` để can thiệp cấu hình Auth của request hiện tại trước khi gửi.
- [x] AC4: `ha.collectionAuth` (tương thích `pm.collectionAuth`) hỗ trợ gán Auth cấp Collection.
- [x] AC5: `environmentStore.ts` cung cấp `applyScopedAuthUpdates` lưu bền vững `_folder.json` và cập nhật reactive tree nodes cũng như phát event `hecto:folder-updated`.
- [x] AC6: `responseStore.ts` gọi `applyScopedAuthUpdates` ở cả Pre-request Script và Post-response Script.
- [x] AC7: `jsHighlight.ts` và `ScriptEditor.vue` cập nhật autocomplete catalog và snippet mẫu cho các API Auth mới.
- [x] AC8: Tất cả các bài unit test Vitest và kiểm tra kiểu TypeScript (`bun run type-check`) đều pass 100%.

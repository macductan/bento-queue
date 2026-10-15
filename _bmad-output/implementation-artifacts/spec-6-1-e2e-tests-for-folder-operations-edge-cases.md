---
title: 'Story 6.1: E2E Tests for Folder Operations & Edge Cases'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '2dd14f8dd6b19bd877e3876cfbabc97de17f699e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Bộ kiểm thử E2E hiện tại (`projects/frontend/tests/e2e/collection-tree.spec.ts`) mới chỉ bao phủ các thao tác CRUD cơ bản trên Request mà chưa kiểm thử thao tác tạo/xóa thư mục lồng nhau (nested folders), các trường hợp biên khi đổi tên (tên trùng, tên rỗng, tên quá dài), chỉ báo thay đổi chưa lưu (amber dot) trên cả context menu/sidebar row và tiêu đề tab/editor, cũng như việc xóa trạng thái editor khi request đang chọn bị xóa.

**Approach:** Đồng bộ hành vi mock Wails (`wails-mock.ts`) và hiển thị amber dot trên context menu/tree row (`TreeContextMenu.vue`, `TreeNodeRow.vue`), sau đó bổ sung đầy đủ các kịch bản kiểm thử Playwright E2E cô lập, tất định (deterministic, không dùng hard wait) vào `collection-tree.spec.ts` để đảm bảo CI pipeline phát hiện sớm mọi lỗi hồi quy trên cây thư mục và trạng thái editor.

## Boundaries & Constraints

**Always:**
- Mọi test case E2E mới trong `projects/frontend/tests/e2e/collection-tree.spec.ts` phải độc lập (tự khởi tạo dữ liệu và dọn dẹp hoặc cô lập state mỗi test), sử dụng cơ chế auto-waiting của Playwright (`expect(...).toBeVisible()`, `toHaveCount()`, `toHaveText()`), tuyệt đối không dùng `page.waitForTimeout` hay hard sleep.
- Bao phủ đầy đủ các nhóm kịch bản: (1) tạo thư mục gốc, tạo thư mục con lồng nhau (nested folder), tạo request bên trong thư mục và xóa thư mục (bao gồm hủy xóa và xác nhận xóa đệ quy); (2) các trường hợp biên khi đổi tên (tên rỗng/chỉ chứa khoảng trắng phải hoàn tác về tên cũ, tên trùng ở cùng cấp vẫn giữ cả hai mục độc lập theo UUID, tên quá dài > 255 ký tự bị giới hạn ở tối đa 255 ký tự và hiển thị `truncate` không vỡ bố cục); (3) chỉ báo thay đổi chưa lưu (amber dot `.bg-unsaved-dot` / `"Chưa lưu"`) hiển thị đồng thời trên thanh tiêu đề/tab của Request Editor (`[data-test="save-state-indicator"]`), trên dòng request đang chọn ở sidebar (`[data-tree-row][data-active="true"]`) và trong context menu khi mở trên request đang có thay đổi chưa lưu; (4) xóa request đang được chọn (trực tiếp hoặc thông qua xóa thư mục cha chứa nó) phải xóa sạch trạng thái Request Editor và đưa vùng làm việc chính về màn hình trống (`"Chọn một Request để bắt đầu"`).
- Chạy qua cả 2 shard của CI (`--shard=1/2` và `--shard=2/2`) cũng như toàn bộ suite E2E, unit test frontend và linter không phát sinh lỗi.

**Never:**
- Không sử dụng `npm`, `npx`, `yarn`, `pnpm` (chỉ dùng `bun` kèm Node 24).
- Không thay đổi hợp đồng API backend Go hoặc cấu trúc lưu trữ file trên đĩa.
- Không để lại dữ liệu rác giữa các test case làm ảnh hưởng thứ tự chạy hoặc làm hỏng tính cô lập khi chạy tuần tự.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo thư mục lồng nhau & xóa thư mục | Tạo thư mục cha → chuột phải chọn `"Thêm thư mục"` → tạo thư mục con (`depth = 1`) và request con → chọn `"Xóa"` trên thư mục cha và xác nhận | Thư mục con hiển thị dưới thư mục cha với badge cấp độ `1`; sau khi xác nhận xóa thư mục cha, toast `"Đã xóa"` xuất hiện và cả thư mục cha lẫn thư mục/request con biến mất khỏi cây | Nếu bấm `"Hủy"` ở hộp thoại xác nhận xóa, thư mục và các phần tử con vẫn giữ nguyên |
| Đổi tên thành chuỗi rỗng hoặc khoảng trắng | Bắt đầu inline rename trên request/folder → nhập `""` hoặc `"   "` → nhấn `Enter` (hoặc nhấn `Escape`) | Hủy chỉnh sửa, giữ nguyên tên hiển thị ban đầu trên cây thư mục, không gọi lưu tên rỗng | Không phát sinh lỗi hoặc mất tên hiển thị |
| Đổi tên trùng với mục cùng cấp | Hai request hoặc hai folder cùng cấp → đổi tên mục thứ hai trùng hệt tên mục thứ nhất → nhấn `Enter` | Cả hai mục cùng hiển thị với tên giống nhau trong cây thư mục (`count = 2`) nhờ định danh bằng UUID riêng biệt | Không ghi đè hoặc làm mất mục còn lại |
| Đổi tên cực dài (> 255 ký tự) | Nhập chuỗi 300 ký tự vào ô inline rename của request/folder → nhấn `Enter` | Giá trị tên được cắt tối đa 255 ký tự (`maxlength="255"` và chuẩn hóa ở mock/service), phần tử tên có class `truncate` giúp không tràn bố cục sidebar | Không vỡ giao diện hoặc lỗi lưu trữ |
| Chỉ báo chưa lưu (amber dot) trên editor, sidebar và context menu | Chọn request (tắt auto-save hoặc đang ở trạng thái dirty), sửa URL thành `https://api.example.com/dirty`, mở context menu của request đó | Amber dot (`.bg-unsaved-dot`, `"Chưa lưu"`) hiển thị trên `[data-test="save-state-indicator"]` ở tiêu đề editor, trên dòng `[data-tree-row][data-active="true"]` ở sidebar, và trên `[data-test="context-menu-unsaved-indicator"]` trong context menu | Khi lưu (`Ctrl+S`), trạng thái chuyển về `"Đã lưu"` và các amber dot biến mất |
| Xóa request đang chọn làm trống trạng thái editor | Chọn một request duy nhất (hoặc request nằm trong thư mục), sửa/xem trong editor → xóa request đó (hoặc xóa thư mục cha chứa nó) và xác nhận | Editor đóng lại (`textbox` URL và `h1` tên request không còn hiển thị), màn hình chính hiển thị trạng thái rỗng `"Chọn một Request để bắt đầu"` | Huỷ auto-save đang chờ trước khi xóa để không lưu đè lại request đã xóa |

</intent-contract>

## Code Map

- `projects/frontend/tests/support/wails-mock.ts` -- Mock Wails bindings cho Playwright E2E (`CreateFolder` L76-87, `RenameRequest` L88-94, `RenameFolder` L95-99, `DeleteFolder` L123-126); cần chuẩn hóa tên thư mục mặc định (`"Thư mục mới"`), cắt khoảng trắng + giới hạn 255 ký tự khi đổi tên, và xóa đệ quy `requestDetails` của các request con khi xóa thư mục.
- `projects/frontend/src/components/TreeContextMenu.vue` -- Menu ngữ cảnh cho folder/request (L214-268); hiển thị chỉ báo thay đổi chưa lưu (`data-test="context-menu-unsaved-indicator"` với `.bg-unsaved-dot` và nhãn `"Chưa lưu"`) khi mở menu trên request đang active và `requestStore.isDirty === true`.
- `projects/frontend/src/components/TreeNodeRow.vue` -- Dòng hiển thị node trên cây thư mục (L219-225); bổ sung `aria-label="Chưa lưu"` và `data-test="tree-row-unsaved-dot"` cho chấm amber dot (`.bg-unsaved-dot`) khi `isActive && requestStore.isDirty`.
- `projects/frontend/src/stores/collectionStore.ts` -- Store quản lý cây bộ sưu tập (`deleteFolder` L482-516); hủy auto-save (`useRequestStore().cancelAutoSave()`) khi xóa thư mục đang chứa request active để đồng nhất với `deleteRequest`.
- `projects/frontend/tests/e2e/collection-tree.spec.ts` -- Bộ kiểm thử E2E cho cây thư mục và trạng thái editor; nơi bổ sung các test case cho thao tác thư mục lồng nhau, xóa thư mục, các trường hợp biên khi đổi tên, chỉ báo amber dot chưa lưu, và xóa sạch trạng thái editor khi xóa request/folder đang chọn.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/tests/support/wails-mock.ts` -- Cập nhật `CreateFolder` dùng tên mặc định `"Thư mục mới"`, chuẩn hóa `RenameRequest`/`RenameFolder` (trim, từ chối chuỗi rỗng, cắt tối đa 255 ký tự như Go backend), và dọn dẹp `requestDetails` đệ quy trong `DeleteFolder` -- Đảm bảo môi trường E2E mô phỏng chính xác hành vi backend Go.
- `projects/frontend/src/components/TreeContextMenu.vue` & `projects/frontend/src/components/TreeNodeRow.vue` & `projects/frontend/src/stores/collectionStore.ts` -- Thêm chỉ báo amber dot (`data-test="context-menu-unsaved-indicator"`) trong `TreeContextMenu.vue` khi request mục tiêu đang dirty, gắn `aria-label="Chưa lưu"` / `data-test="tree-row-unsaved-dot"` cho amber dot ở `TreeNodeRow.vue`, và gọi `cancelAutoSave()` trong `collectionStore.deleteFolder` khi `activeInside` là `true` -- Đảm bảo chỉ báo chưa lưu hiển thị nhất quán trên cả context menu, dòng sidebar và tiêu đề editor, đồng thời không bị rò rỉ auto-save khi xóa thư mục chứa request đang chọn.
- `projects/frontend/tests/e2e/collection-tree.spec.ts` -- Bổ sung các test case E2E cho tạo/xóa thư mục lồng nhau (kể cả hủy xóa), các trường hợp biên khi đổi tên (tên rỗng/khoảng trắng, tên trùng cùng cấp, tên cực dài > 255 ký tự, nhấn `Escape` hủy đổi tên), kiểm tra amber dot chưa lưu trên tiêu đề tab/editor + dòng sidebar + context menu, và kiểm tra xóa sạch trạng thái editor về `"Chọn một Request để bắt đầu"` khi xóa request đang chọn hoặc xóa thư mục cha chứa nó -- Đạt độ phủ E2E toàn diện theo yêu cầu Story 6.1.

**Acceptance Criteria:**
- Given ứng dụng đang chạy trong bộ kiểm thử E2E, when người dùng tạo một thư mục gốc rồi mở context menu chọn `"Thêm thư mục"` và `"Thêm request"`, then thư mục con (cấp độ `1`) và request con được hiển thị lồng bên trong thư mục cha trên sidebar.
- Given một thư mục cha có chứa thư mục con và request bên trong, when người dùng mở context menu trên thư mục cha chọn `"Xóa"` và xác nhận `"Xóa"` trên hộp thoại, then thông báo `"Đã xóa"` xuất hiện và cả thư mục cha lẫn toàn bộ mục con bên trong biến mất khỏi cây thư mục.
- Given một request hoặc thư mục đang ở chế độ đổi tên inline, when người dùng nhập tên rỗng/khoảng trắng rồi nhấn `Enter` (hoặc nhấn `Escape`), nhập tên trùng với một mục cùng cấp, hoặc nhập chuỗi dài hơn 255 ký tự, then tên rỗng/hủy sẽ hoàn tác về tên cũ, tên trùng vẫn giữ cả hai mục hiển thị độc lập trên cây, và tên dài hơn 255 ký tự được cắt về đúng 255 ký tự với hiển thị `truncate`.
- Given một request đang được chọn và có thay đổi chưa lưu trên editor, when người dùng quan sát giao diện và mở context menu trên request đó, then chỉ báo chấm tròn màu hổ phách (amber dot `.bg-unsaved-dot` / `"Chưa lưu"`) hiển thị trên thanh trạng thái tiêu đề editor (`[data-test="save-state-indicator"]`), trên dòng request ở sidebar (`[data-tree-row][data-active="true"]`), và trong context menu (`[data-test="context-menu-unsaved-indicator"]`).
- Given một request đang được mở trong Request Editor, when request đó bị xóa trực tiếp hoặc thư mục cha chứa nó bị xóa, then Request Editor biến mất và vùng làm việc chính quay về màn hình trống hiển thị `"Chọn một Request để bắt đầu"`.
- Given toàn bộ test suite chạy trên môi trường CI (bao gồm chia shard `--shard=1/2` và `--shard=2/2`), when thực thi lệnh kiểm thử E2E, unit test và lint, then tất cả kịch bản đều vượt qua 100% một cách nhất quán.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 18 findings — high 0, medium 7, low 9, false 2, maybe-false 0
- findings:
  - `[false]` `[reject]` Xóa request đang active hoặc thư mục cha gọi `selectNextRequestOrClear(id)` nên không về màn hình trống khi còn request cùng cấp — Bác bỏ: `collectionStore.deleteRequest` và `deleteFolder` đều gọi `useRequestStore().clearRequest()` ngay khi xóa request active; việc `selectNextRequestOrClear` chọn sibling tiếp theo nếu còn và về màn hình trống nếu hết là thiết kế chủ đích từ Story 2.5/2.7.
  - `[false]` `[reject]` Chưa xóa trạng thái response ở khung bên phải khi xóa request đang active hoặc thư mục cha — Bác bỏ: `ContentArea.vue:13-15` có `watch(() => collectionStore.activeRequestId, () => responseStore.clear())` và `v-if="collectionStore.activeRequestId"` ở dòng 28 tự động xóa `responseStore` và gỡ `ResponseViewer` ngay khi `activeRequestId` thay đổi hoặc về `null`.
  - `[medium]` `[patch]` `toContainText(expected255)` trên dòng sidebar trong test đổi tên >255 ký tự là kiểm tra chuỗi con nên không bắt được lỗi nếu chuỗi 300 ký tự không bị cắt — Đã sửa: bọc tên hiển thị trong `[data-test="tree-row-name"]` và dùng `toHaveText(expected255)` để kiểm tra khớp chính xác 255 ký tự.
  - `[medium]` `[patch]` Test E2E đổi tên >255 ký tự mới chỉ kiểm tra trên request mà chưa kiểm tra trên folder, đồng thời test tên rỗng/Escape chưa kiểm tra đầy đủ cả `""` và `Escape` cho từng loại node — Đã sửa: mở rộng `collection-tree.spec.ts` để kiểm tra `""`, khoảng trắng, `Escape` và chuỗi 300 ký tự (>255 ký tự) cho cả request lẫn folder.
  - `[low]` `[reject]` Chưa có E2E test riêng cho phím tắt `F2` / double-click khi đổi tên và phím `Escape` trên hộp thoại xác nhận xóa — Không cần sửa: `F2` và `dblclick` gọi trực tiếp cùng hàm `startEdit()` đã được kiểm thử qua context menu, và Story 6.1 tập trung vào các edge case giá trị tên cùng thao tác thư mục.
  - `[low]` `[patch]` Thay đổi `localStorage` (`hecto_auto_save_enabled`) trong test amber dot chưa bọc trong `try / finally` — Đã sửa: bọc toàn bộ thân test trong `try / finally` để luôn dọn dẹp `localStorage.removeItem('hecto_auto_save_enabled')`.
  - `[low]` `[patch]` Sử dụng `page.waitForLoadState('networkidle')` sau `page.reload()` trong test amber dot — Đã sửa: thay bằng `await expect(page.getByLabel('Request mới')).toBeVisible()` để chờ theo trạng thái phần tử giao diện tất định.
  - `[medium]` `[patch]` Hàm helper `deleteTestNode` định kiểu `nodeLocator: any` và bọc trong `if (await nodeLocator.isVisible())` không auto-wait có thể âm thầm bỏ qua bước xóa — Đã sửa: định kiểu `Locator` từ `@playwright/test` và dùng `await expect(nodeLocator).toBeVisible()` trước khi thực hiện xóa.
  - `[medium]` `[patch]` Thiếu kiểm tra trường hợp mở context menu trên một request khác (không active/không dirty) trong khi request đang chọn bị dirty — Đã sửa: bổ sung bước tạo một sibling request sạch trong E2E test và xác nhận context menu của nó không hiển thị `[data-test="context-menu-unsaved-indicator"]`.
  - `[low]` `[patch]` Mã lỗi trả về trong `wails-mock.ts` dùng `'VALIDATION_ERROR'` thay vì `'VALIDATION'` như backend Go và nhãn menu trong `epic-6-context.md` ghi `"Tạo request mới"` / `"Tạo thư mục con"` thay vì `"Thêm request"` / `"Thêm thư mục"` — Đã sửa: đổi sang `'VALIDATION'` trong `wails-mock.ts` và cập nhật nhãn trong `epic-6-context.md`.
  - `[low]` `[patch]` `TreeNodeRow.vue` hiển thị `[data-test="tree-row-unsaved-dot"]` với điều kiện `isActive && requestStore.isDirty` có thể khớp nhầm folder đang active hoặc request vừa click trước khi `loadRequest` hoàn tất — Đã sửa: thêm điều kiện `!isFolder && isActive && requestStore.current?.id === props.node.id && requestStore.isDirty`.
  - `[low]` `[patch]` `TreeContextMenu.vue` chưa kiểm tra `requestStore.current?.id === uiStore.contextMenu.nodeId` trong `isTargetRequestDirty` — Đã sửa: bổ sung kiểm tra `requestStore.current?.id === uiStore.contextMenu.nodeId`.
  - `[low]` `[patch]` `collectionStore.renameRequest` cập nhật `reqStore.current.name` và `reqStore.original.name` mà chưa kiểm tra `reqStore.current?.id === id` — Đã sửa: bổ sung kiểm tra `reqStore.current?.id === id && reqStore.original?.id === id`.
  - `[low]` `[patch]` `collectionStore.deleteFolder` chưa kiểm tra lại `this.activeRequestId` còn nằm trong thư mục vừa xóa sau khi `await DeleteFolder(id)` hoàn tất — Đã sửa: tính lại `stillActiveInside` sau `await DeleteFolder(id)` trước khi xóa và chuyển request.
  - `[low]` `[patch]` Nếu một assertion trong test amber dot thất bại trước dòng cuối, `hecto_auto_save_enabled` trong `localStorage` không được xóa — Đã sửa: bọc trong khối `try / finally` (cùng nhóm với finding số 6).
  - `[medium]` `[patch]` Unit test cho `deleteFolder` và `deleteRequest` trong `collectionStore.test.ts` vẫn pass nếu bỏ lệnh gọi sớm `cancelAutoSave()` và `clearRequest()` vì chưa test trường hợp `DeleteFolder` lỗi hoặc có sibling request — Đã sửa: bổ sung unit test kiểm tra `cancelAutoSave` được gọi ngay cả khi `DeleteFolder` trả về lỗi và `clearRequest` được gọi khi có sibling request.
  - `[medium]` `[patch]` Guard `collectionStore.activeRequestId === uiStore.contextMenu.nodeId` trong `TreeContextMenu.vue` chưa có test kiểm chứng trên request không active — Đã sửa: bổ sung bước kiểm tra chuột phải vào sibling request không active trong `collection-tree.spec.ts` (cùng nhóm với finding số 9).
  - `[medium]` `[patch]` Logic cắt 255 ký tự ở `TreeNodeRow.vue` và đồng bộ `updatedNode.name` ở `collectionStore.renameRequest` che khuất nhau trong E2E test và dùng `toContainText` — Đã sửa: đổi sang `toHaveText(expected255)` trên `[data-test="tree-row-name"]` cho cả request/folder và bổ sung unit test trực tiếp trong `TreeNodeRow.test.ts` cùng `collectionStore.test.ts`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run lint && bun run type-check && bun run test` -- expected: exit 0, không có lỗi lint/type-check và tất cả unit test đều pass
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test:e2e` -- expected: exit 0, toàn bộ kịch bản E2E (bao gồm các kịch bản mới của Story 6.1) đều pass
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test:e2e -- --shard=1/2 && bun run test:e2e -- --shard=2/2` -- expected: exit 0 trên cả hai shard như cấu hình CI pipeline

## Auto Run Result

- **Status:** `done`
- **Summary of implemented change:**
  - Đồng bộ `wails-mock.ts` với hành vi của Go backend (`CollectionService` / `RequestService`): đặt tên mặc định thư mục mới là `"Thư mục mới"`, chuẩn hóa tên khi đổi tên/nhân bản (cắt khoảng trắng hai đầu, trả về lỗi `VALIDATION` nếu rỗng, giới hạn tối đa 255 ký tự), và xóa đệ quy dữ liệu `requestDetails` của các request con khi xóa thư mục.
  - Bổ sung chỉ báo thay đổi chưa lưu (`[data-test="context-menu-unsaved-indicator"]` với `.bg-unsaved-dot` và nhãn `"Chưa lưu"`) trong `TreeContextMenu.vue` khi mở context menu trên request đang active và có thay đổi chưa lưu; gắn `data-test="tree-row-unsaved-dot"` / `aria-label="Chưa lưu"` và bọc tên hiển thị trong `[data-test="tree-row-name"]` tại `TreeNodeRow.vue`; đảm bảo `collectionStore.deleteFolder` và `deleteRequest` hủy auto-save và xóa `requestStore` đồng bộ.
  - Bổ sung đầy đủ các kịch bản Playwright E2E tất định trong `projects/frontend/tests/e2e/collection-tree.spec.ts` và unit test trong `TreeNodeRow.test.ts` / `collectionStore.test.ts` bao phủ: tạo/xóa thư mục lồng nhau (kèm hủy xóa), các trường hợp biên khi đổi tên (rỗng, khoảng trắng, `Escape`, trùng tên cùng cấp, tên dài >255 ký tự cho cả request và folder), hiển thị/xóa amber dot chưa lưu trên tiêu đề editor + dòng sidebar + context menu, và xóa sạch trạng thái editor về màn hình trống khi xóa request đang chọn hoặc thư mục cha của nó.
- **Files changed:**
  - `_bmad-output/implementation-artifacts/epic-6-context.md` — Tài liệu ngữ cảnh tổng hợp cho Epic 6.
  - `_bmad-output/implementation-artifacts/spec-6-1-e2e-tests-for-folder-operations-edge-cases.md` — Đặc tả kỹ thuật, nhật ký triage review và kết quả thực thi tự động của Story 6.1.
  - `projects/frontend/src/components/TreeContextMenu.vue` — Hiển thị chỉ báo amber dot `"Chưa lưu"` trong context menu khi mở trên request đang active và dirty.
  - `projects/frontend/src/components/TreeNodeRow.vue` — Cắt tên tối đa 255 ký tự trong `saveEdit`, bọc tên node trong `[data-test="tree-row-name"]`, và thắt chặt điều kiện hiển thị `[data-test="tree-row-unsaved-dot"]`.
  - `projects/frontend/src/stores/collectionStore.ts` — Hủy auto-save và xóa `requestStore` an toàn khi xóa request/folder chứa request đang active; đồng bộ tên đã chuẩn hóa sau `renameRequest`.
  - `projects/frontend/tests/support/wails-mock.ts` — Đồng bộ tên thư mục mặc định `"Thư mục mới"`, chuẩn hóa cắt 255 ký tự / mã lỗi `'VALIDATION'`, và xóa đệ quy `requestDetails` khi xóa thư mục.
  - `projects/frontend/tests/e2e/collection-tree.spec.ts` — Bổ sung 6 kịch bản kiểm thử E2E toàn diện cho thao tác thư mục lồng nhau, các trường hợp biên đổi tên, amber dot chưa lưu và xóa trạng thái editor.
  - `projects/frontend/src/components/__tests__/TreeNodeRow.test.ts` — Bổ sung unit test cho `tree-row-unsaved-dot` và cắt 255 ký tự trong `saveEdit`.
  - `projects/frontend/src/stores/__tests__/collectionStore.test.ts` — Bổ sung unit test cho `deleteFolder` / `deleteRequest` (hủy auto-save khi lỗi, xóa state khi có sibling) và `renameRequest`.
- **Review findings breakdown:**
  - **Patched (15 findings grouped into 9 patches — high: 0, medium: 7, low: 8):**
    - Sửa kiểm tra `toHaveText(expected255)` trên `[data-test="tree-row-name"]` và mở rộng kiểm thử đổi tên >255 ký tự, chuỗi rỗng `""`, khoảng trắng, `Escape` cho cả request và folder trong `collection-tree.spec.ts`.
    - Bổ sung kiểm tra context menu trên sibling request sạch không hiển thị `[data-test="context-menu-unsaved-indicator"]`, bọc `try / finally` cho `localStorage`, thay `waitForLoadState('networkidle')` sau `reload()` bằng locator assertion, và định kiểu `Locator` kèm `expect(nodeLocator).toBeVisible()` trong `deleteTestNode`.
    - Thắt chặt điều kiện guard ID trong `TreeNodeRow.vue`, `TreeContextMenu.vue`, `collectionStore.ts`, chuẩn hóa mã lỗi `'VALIDATION'` trong `wails-mock.ts`, và bổ sung đầy đủ unit test trong `TreeNodeRow.test.ts` cùng `collectionStore.test.ts`.
  - **Deferred (0):** Không có.
  - **Rejected (3 — false: 2, low: 1):**
    - `[false]` `selectNextRequestOrClear` chuyển sang sibling nếu còn: thiết kế chủ đích từ Story 2.5/2.7, và `clearRequest()` đã được gọi trước đó.
    - `[false]` Không xóa `responseStore` khi xóa request active: `ContentArea.vue` đã có watcher tự động gọi `responseStore.clear()` và ẩn `ResponseViewer` khi `activeRequestId` thay đổi.
    - `[low]` Không có E2E test riêng cho phím `F2` / double-click khi bắt đầu rename: cả hai đều gọi trực tiếp cùng hàm `startEdit()` đã được kiểm thử qua context menu.
- **Follow-up review recommendation:** `false` (patched counts by verdict: `high: 0`, `medium: 7`, `low: 8`; mọi bản vá đều đã được kiểm chứng trực tiếp bằng unit test và E2E test, không còn rủi ro nào chưa được xác minh).
- **Verification performed:**
  - `bun run lint` → Pass (0 errors).
  - `bun run type-check` → Pass (`vue-tsc --noEmit` exit 0).
  - `bun run test` → Pass (30 test files, 360 unit tests passed).
  - `bun run test:e2e` → Pass (13 E2E tests passed).
  - `bun run test:e2e -- --shard=1/2 && bun run test:e2e -- --shard=2/2` → Pass (7 passed in shard 1/2, 6 passed in shard 2/2).
- **Residual risks:** Không có.


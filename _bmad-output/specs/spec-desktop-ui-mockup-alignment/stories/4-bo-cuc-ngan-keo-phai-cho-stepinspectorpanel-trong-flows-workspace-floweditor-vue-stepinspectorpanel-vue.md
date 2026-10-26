---
title: 'Bố cục Ngăn kéo Phải cho StepInspectorPanel trong Flows Workspace (FlowEditor.vue, StepInspectorPanel.vue)'
type: 'feature'
created: '2026-10-26'
status: 'done'
story_id: '4'
parent_spec: '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
baseline_revision: 'HEAD'
review_loop_iteration: 1
followup_review_recommended: false
context:
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/SPEC.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/ui-mockup-alignment-details.md'
  - '_bmad-output/specs/spec-desktop-ui-mockup-alignment/stories.yaml'
  - 'projects/frontend/src/components/flow/FlowEditor.vue'
  - 'projects/frontend/src/components/flow/StepInspectorPanel.vue'
  - 'projects/frontend/src/components/flow/FlowStepCard.vue'
  - 'projects/frontend/src/components/flow/FlowToolbar.vue'
  - 'projects/frontend/src/stores/flowStore.ts'
  - 'projects/frontend/src/components/__tests__/FlowEditor.test.ts'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Trong không gian làm việc `Flows`, bảng chi tiết bước (`StepInspectorPanel.vue`) hiện đang mở dạng ngăn kéo đáy (`h-[46%] border-t`) bên dưới vùng vẽ sơ đồ (`FlowEditor.vue`), chiếm chiều dọc của sơ đồ dòng chảy (đặc biệt khi sơ đồ ở bố cục dọc), chưa khớp với bố cục ngăn kéo bên phải (`w-96 border-l`) trong bản thiết kế `/home/dev/Downloads/hecto_api_desktop_ui.html` (CAP-5). Ngoài ra, hàm `getMethodBadgeClass` trong `flowStore.ts` và các nút tương tác trên `FlowStepCard.vue` / `FlowToolbar.vue` cần đồng bộ với hệ thống `.method-badge-*` + `.text-method-*` và tông màu Dark Zinc + Indigo.

**Approach:**
1. **`FlowEditor.vue`**:
   - Bọc vùng vẽ sơ đồ (`data-test="flow-canvas"`) và `<StepInspectorPanel />` trong một container ngang `<div data-test="flow-workspace-body" class="flex-1 flex overflow-hidden relative min-h-0">` nằm ngay bên dưới `<FlowToolbar />`.
   - Khi người dùng chọn một bước (`flowStore.selectedStepId`), `<StepInspectorPanel />` mở ra ở cột bên phải cạnh `data-test="flow-canvas"` mà không che khuất chiều cao của sơ đồ.
2. **`StepInspectorPanel.vue`**:
   - Đổi class gốc của `data-test="step-inspector-panel"` từ `h-[46%] min-h-[240px] max-h-[65%] border-t border-zinc-700 bg-zinc-900 flex flex-col shrink-0 shadow-2xl` sang ngăn kéo bên phải: `w-96 border-l border-zinc-800 bg-bg-surface flex flex-col shrink-0 h-full overflow-hidden z-20 shadow-2xl`.
   - Sắp xếp phần Header của `StepInspectorPanel.vue` gọn gàng cho chiều rộng `w-96`:
     - Hàng trên: Badge trạng thái (`data-test="step-inspector-status"`), Badge HTTP Method (`data-test="step-inspector-method"` với `.method-badge-*` + `.text-method-*`), Tên bước (`data-test="step-inspector-name"`), nút `Mở Request gốc ↗` (`data-test="open-original-request-btn"`), và nút Đóng (`data-test="close-step-inspector-btn"`).
     - Hàng thông tin phụ bên dưới Header: URL (`data-test="step-inspector-url"`), mã HTTP status + thời gian phản hồi (`ms`), và kết quả kiểm thử `ha.test` (`data-test="step-inspector-tests-summary"`).
   - Bên dưới nhúng nguyên vẹn `<ResponseViewer :override-data="selectedStepViewerData" class="flex-1 min-h-0" />`.
3. **`flowStore.ts`, `FlowStepCard.vue` & `FlowToolbar.vue`**:
   - Cập nhật `getMethodBadgeClass(method?: string)` trong `flowStore.ts` để kết hợp cả class màu Tailwind hiện có và `.method-badge-<m> text-method-<m>` (hỗ trợ `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `HEAD`, `OPTIONS`) giúp đồng bộ 100% với `style.css` (CAP-1 & CAP-5) mà không làm gãy bất kỳ unit test nào đang kiểm tra class trên badge.
   - Đồng bộ màu sắc focus/active sang tông Indigo/Zinc trên `FlowStepCard.vue` và `FlowToolbar.vue` trong khi giữ nguyên toàn bộ `data-test` và hành vi.

## Boundaries & Constraints

**Always:**
- Bảo toàn 100% tính năng nâng cao của Flow Runner: sơ đồ 2 trục (Tuần tự `->` / Song song `||` / Rẽ nhánh điều kiện `Thành công` / `Khi Lỗi` / `Tùy chỉnh`), chuyển đổi bố cục `↕ Dọc` / `↔ Ngang`, `RequestPickerModal.vue`, thực thi tuần tự & song song (`Promise.all`) qua `flowRunner.ts`, và `<ResponseViewer :override-data="selectedStepViewerData" />` độc lập với `responseStore`.
- Giữ nguyên toàn bộ `data-test` hiện có (`flow-editor`, `flow-toolbar`, `flow-canvas`, `flow-step-card`, `step-inspector-panel`, `step-inspector-status`, `step-inspector-name`, `step-inspector-method`, `step-inspector-url`, `step-inspector-tests-summary`, `open-original-request-btn`, `close-step-inspector-btn`,...).

**Never:**
- Không thay thế `<ResponseViewer :override-data="..." />` trong `StepInspectorPanel.vue` bằng `<pre>` tĩnh.
- Không chạy `git commit` hay `git push`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chưa chọn bước nào trên Flow Canvas | `flowStore.selectedStepId === null` | `data-test="step-inspector-panel"` không hiển thị (`v-if="selectedStep"`), `data-test="flow-canvas"` chiếm trọn chiều ngang (`flex-1`) | No error expected |
| Bấm vào một thẻ bước (`flow-step-card`) | `flowStore.selectStep(step.id)` | `data-test="step-inspector-panel"` mở ra ở ngăn kéo bên phải (`w-96 border-l border-zinc-800`) nằm cùng hàng flex ngang với `data-test="flow-canvas"`, hiển thị tên bước, badge Method (`.method-badge-*`), URL, trạng thái, kết quả `ha.test`, và `<ResponseViewer :override-data="..." />` | Nếu request gốc đã bị xóa: hiển thị fallback tên bước và khi bấm `Mở Request gốc ↗` hiển thị toast `'Request gốc đã bị xóa khỏi Collection'` |
| Bấm `Mở Request gốc ↗` (`open-original-request-btn`) | Request gốc tồn tại trong `collectionStore.tree` | Chuyển `uiStore.workspaceMode` sang `'apis'` và gọi `collectionStore.selectRequest(reqId)` | Nếu request gốc không tồn tại: giữ nguyên chế độ `'flows'` và hiện toast cảnh báo |
| Bấm nút Đóng (`close-step-inspector-btn`) | Bấm `✕` trên `StepInspectorPanel.vue` | Gọi `flowStore.selectStep(null)` và đóng ngăn kéo bên phải | No error expected |

</intent-contract>

## Code Map

- `projects/frontend/src/components/flow/FlowEditor.vue` -- Bọc `data-test="flow-canvas"` và `<StepInspectorPanel />` trong `<div data-test="flow-workspace-body" class="flex-1 flex overflow-hidden relative min-h-0">`.
- `projects/frontend/src/components/flow/StepInspectorPanel.vue` -- Chuyển root container sang `w-96 border-l border-zinc-800 bg-bg-surface flex flex-col shrink-0 h-full overflow-hidden z-20 shadow-2xl` và tối ưu bố cục Header cho ngăn kéo phải `w-96`.
- `projects/frontend/src/stores/flowStore.ts` -- Bổ sung `.method-badge-*` và `.text-method-*` vào `getMethodBadgeClass`.
- `projects/frontend/src/components/flow/FlowStepCard.vue` -- Đồng bộ style thẻ bước với Dark Zinc + Indigo.
- `projects/frontend/src/components/flow/FlowToolbar.vue` -- Đồng bộ style thanh công cụ Flow với Dark Zinc + Indigo.
- `projects/frontend/src/components/__tests__/FlowEditor.test.ts` -- Cập nhật và bổ sung unit tests kiểm tra bố cục ngăn kéo phải `w-96 border-l` của `StepInspectorPanel.vue` cạnh `flow-canvas`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/components/flow/FlowEditor.vue` -- Đặt `data-test="flow-canvas"` và `<StepInspectorPanel />` trong container flex ngang `<div data-test="flow-workspace-body" class="flex-1 flex overflow-hidden relative min-h-0">` -- Đồng bộ bố cục ngăn kéo phải CAP-5.
- `projects/frontend/src/components/flow/StepInspectorPanel.vue` -- Cập nhật class gốc của `data-test="step-inspector-panel"` thành `w-96 border-l border-zinc-800 bg-bg-surface flex flex-col shrink-0 h-full overflow-hidden z-20 shadow-2xl` và bố cục lại Header gọn gàng trên chiều rộng `w-96`, giữ nguyên `<ResponseViewer :override-data="selectedStepViewerData" />` -- Đồng bộ CAP-5.
- `projects/frontend/src/stores/flowStore.ts`, `projects/frontend/src/components/flow/FlowStepCard.vue`, `projects/frontend/src/components/flow/FlowToolbar.vue` -- Bổ sung `.method-badge-*` + `.text-method-*` trong `getMethodBadgeClass` và đồng bộ màu sắc Dark Zinc + Indigo -- Đồng bộ CAP-1 & CAP-5.
- `projects/frontend/src/components/__tests__/FlowEditor.test.ts` -- Bổ sung kiểm tra `StepInspectorPanel` có class `w-96` và `border-l`, nằm chung container ngang với `flow-canvas`, và badge Method có class `method-badge-*` -- Đảm bảo độ phủ kiểm thử tự động.

**Acceptance Criteria:**
- Given `FlowEditor.vue` đang hiển thị một Flow có bước, when người dùng bấm vào `[data-test="flow-step-card"]`, then `[data-test="step-inspector-panel"]` mở ra ở ngăn kéo bên phải (`w-96 border-l`) nằm ngang hàng cạnh `[data-test="flow-canvas"]`.
- Given `StepInspectorPanel.vue` đang mở, when kiểm tra nội dung bên trong, then hiển thị đầy đủ trạng thái bước, tên bước, badge Method (`.method-badge-*`), URL, `ha.test` summary, nút `Mở Request gốc ↗`, nút đóng `✕`, và `<ResponseViewer :override-data="..." />`.

## Spec Change Log

## Review Triage Log

### Iteration 1 (2026-10-26)
- **Part 1 (Intent Alignment):**
  - *`getMethodBadgeClass` in `flowStore.ts` retaining legacy `bg-amber`/`bg-blue` utilities that inverted POST and PUT colors*: Categorized as `patch` — updated `getMethodBadgeClass` to trim input and return clean `.method-badge-<m> text-method-<m>` classes, and removed standalone `border` utility from method badge spans in `FlowStepCard.vue`, `StepInspectorPanel.vue`, and `RequestPickerModal.vue`.
  - *Embedded `ResponseViewer` top bar overflow inside `w-96` (`384px`) drawer*: Categorized as `patch` — updated `ResponseViewer.vue` header bar to use `flex-wrap min-h-10 pr-2 gap-y-1` and compact `px-2.5` tab padding when `isOverrideMode` is true, and added `:key="selectedStep.id"` on `<ResponseViewer />` in `StepInspectorPanel.vue`.
- **Part 2 (Implementation Review — Blind Hunter, Edge Case Hunter, Verification Gap):**
  - *`FlowEditor.vue` `items-center` horizontal scroll clipping when `StepInspectorPanel` shrinks canvas width*: Categorized as `patch` — replaced `items-center` on `flow-canvas` with `mx-auto` on the inner child.
  - *`FlowStepCard.vue` selection ring on non-idle steps & parallel index color*: Categorized as `patch` — applied `ring-2 ring-indigo-500/60` whenever `isSelected` is true across all statuses and updated `#1/2` badge to `text-indigo-400`.
  - *`StepInspectorPanel.vue` stale `stepState` after changing step request, `3xx`/`4xx`/`5xx` status badge colors, snake_case fallback, and header border contrast*: Categorized as `patch` — guarded `stepState` fields with `isStepStateMatchingCurrentRequest`, added `effectiveStatusCode` / `effectiveDurationMs` with 2xx/3xx/4xx/5xx badge colors, changed header background to `bg-zinc-900/90 border-b border-zinc-800`, and called `expandPathToNode(reqId)` in `handleOpenOriginalRequest`.
  - *Unit test coverage in `FlowEditor.test.ts`*: Categorized as `patch` — added assertions for `getMethodBadgeClass` across all methods + fallback + whitespace, `StepInspectorPanel` `HTTP 200`/`302`/`503` badges, `FlowStepCard` selection ring, and `FlowToolbar` `bg-indigo-600`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit code 0 (Verified: passed)
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: all test suites pass 100% (Verified: 55/55 test files, 733/733 tests passed)
- `cd projects && go test ./...` -- expected: exit code 0 (Verified: passed)

## Auto Run Result
- **Story ID:** 4
- **Final Status:** done
- **Files Changed:**
  - `projects/frontend/src/components/flow/FlowEditor.vue`
  - `projects/frontend/src/components/flow/StepInspectorPanel.vue`
  - `projects/frontend/src/components/flow/FlowStepCard.vue`
  - `projects/frontend/src/components/flow/FlowToolbar.vue`
  - `projects/frontend/src/components/flow/RequestPickerModal.vue`
  - `projects/frontend/src/components/ResponseViewer.vue`
  - `projects/frontend/src/stores/flowStore.ts`
  - `projects/frontend/src/components/__tests__/FlowEditor.test.ts`
- **Verification Outcome:** Passed (`bun run type-check` exit 0, `bun run test` 55/55 files, 733/733 tests passed, `go test ./...` exit 0)
- **Open Warnings / Deferred Items:** None

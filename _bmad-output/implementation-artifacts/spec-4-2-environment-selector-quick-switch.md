---
title: 'Story 4.2: Environment Selector & Quick Switch'
type: 'feature'
created: '2026-10-07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: 'a742459f7906269cc66ac2e05d9f053a0ca53306'
context: ['/home/dev/mdt/hecto-api/_bmad-output/implementation-artifacts/epic-4-context.md']
warnings: []
deferred:
  - summary: >-
      Missing cohesive focus styling for the custom caret
    evidence: |-
      The SVG has `text-text-muted` and does not change when the select element is focused. Cosmetic issue that does not affect functionality.
    location: >-
      projects/frontend/src/components/environment/EnvSelector.vue
    severity: low
---

<intent-contract>

## Intent

**Problem:** Hiện tại người dùng đã có thể tạo và quản lý các môi trường, nhưng không có cách nào để nhanh chóng chuyển đổi giữa các môi trường (ví dụ từ dev sang prod) ngay tại màn hình chính lúc đang thử nghiệm request.

**Approach:** Xây dựng một dropdown Environment Selector đặt ở AppHeader góc phải, cạnh nút gear. Component này sẽ tương tác trực tiếp với `environmentStore` để lấy danh sách và thay đổi `activeEnvId`. Hỗ trợ phím tắt `Ctrl+E` để focus nhanh vào selector.

## Boundaries & Constraints

**Always:**
- Tùy chọn mặc định và luôn xuất hiện đầu tiên là "Không dùng env" (tương ứng với `activeEnvId = null`).
- Selector phải có thiết kế UI như spec: nền surface-overlay, border-default, rounded-md, cao 32px, font ui-xs/500, caret icon riêng.
- Chuyển đổi môi trường phải cập nhật `activeEnvId` ngay lập tức trên store (Pinia) mà không làm gián đoạn request đang gửi (phần apply variable sẽ được làm trong story 4.3).

**Never:**
- Không gọi lưu file (save) hay sửa file từ component này; EnvSelector chỉ có quyền đọc danh sách và thay đổi `activeEnvId`.
- Không sử dụng native `<select>` mặc định của trình duyệt nếu nó không thể tuân thủ thiết kế UI (tuy nhiên có thể dùng native `<select>` làm hidden element hoặc style lại nếu đạt chuẩn thiết kế, hoặc dùng custom component dropdown).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chọn môi trường mới | User click chọn "Prod" từ dropdown | `activeEnvId` cập nhật thành ID của "Prod", UI hiển thị tên "Prod" | No error expected |
| Chọn "Không dùng env" | User click chọn "Không dùng env" | `activeEnvId` được set thành `null`, UI hiển thị "Không dùng env" | No error expected |
| Focus bằng phím tắt | User bấm `Ctrl+E` | Element selector được focus (và lý tưởng là mở danh sách ra, hoặc cho phép dùng phím mũi tên) | No error expected |
| Active env bị xóa từ Modal | Môi trường đang active bị xóa | Store tự set `activeEnvId = null`, selector tự động chuyển về "Không dùng env" | Được handle ở store trong Story 4.1 |

</intent-contract>

## Code Map

- `projects/frontend/src/stores/uiStore.ts` -- Nơi thêm biến state để kích hoạt focus cho EnvSelector thông qua event/watch.
- `projects/frontend/src/components/environment/EnvSelector.vue` -- (Mới) Component hiển thị dropdown chọn môi trường.
- `projects/frontend/src/components/AppHeader.vue` -- Nơi mount EnvSelector bên cạnh nút quản lý môi trường (gear icon).
- `projects/frontend/src/App.vue` -- Nơi lắng nghe phím tắt `Ctrl+E` toàn cục.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/stores/uiStore.ts` -- Thêm `focusEnvRequested = ref(0)` và hàm `triggerFocusEnv()` tương tự như `triggerFocusUrl`.
- `projects/frontend/src/components/environment/EnvSelector.vue` -- Tạo component có chứa HTML select hoặc custom dropdown, lấy danh sách từ `environmentStore.environments` và bind `v-model` tới `environmentStore.activeEnvId`. Bổ sung watcher trên `uiStore.focusEnvRequested` để gọi `.focus()` vào phần tử khi có tín hiệu.
- `projects/frontend/src/components/AppHeader.vue` -- Thêm `<EnvSelector />` vào container bên trái thẻ `<button>` mở EnvModal.
- `projects/frontend/src/App.vue` -- Trong hàm `handleKeyDown`, thêm điều kiện bắt phím tắt: nếu `e.ctrlKey && e.key.toLowerCase() === 'e'`, thì gọi `uiStore.triggerFocusEnv()` và `e.preventDefault()`.

**Acceptance Criteria:**
- Given ứng dụng đã tải danh sách môi trường, when user mở dropdown EnvSelector, then hiển thị tùy chọn "Không dùng env" kèm theo danh sách các môi trường hiện có.
- Given EnvSelector đang mở, when user chọn một môi trường, then store `activeEnvId` được cập nhật tương ứng.
- Given user đang thao tác bất kỳ đâu (không trong text editor), when bấm `Ctrl+E`, then EnvSelector nhận trạng thái focus.

## Spec Change Log

## Review Triage Log
### 2026-10-07 — Review pass
- verdicts: 10 findings — high 0, medium 2, low 4, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Missing text editor focus exclusion (AC Violation) — Moved the Ctrl+E shortcut check below the isEditing check.
  - `[false]` `[reject]` Missing cross-platform shortcut support — The codebase uses strict e.ctrlKey for all existing shortcuts (Ctrl+S, Ctrl+L, etc.), and the spec explicitly requested Ctrl+E.
  - `[low]` `[patch]` Missing UI discoverability for the shortcut — Added title="Select environment (Ctrl+E)" to the select element.
  - `[low]` `[defer]` Missing cohesive focus styling for the custom caret — Cosmetic issue that does not affect functionality.
  - `[low]` `[patch]` Missing aria-hidden on decorative SVG — Added aria-hidden="true" to the caret SVG.
  - `[low]` `[patch]` Ctrl+E intercepts combos like Ctrl+Shift+E — Added !e.shiftKey && !e.altKey to the condition.
  - `[medium]` `[patch]` Intercepts Ctrl+E before checking isEditing — Moved the Ctrl+E shortcut check below the isEditing check (same root cause as finding 1).
  - `[false]` `[reject]` Environment selector state binding regression gap — The intent and spec do not require frontend UI tests, as established in epic 4.1 review triage.
  - `[false]` `[reject]` Quick switch focus shortcut regression gap — The intent and spec do not require frontend UI tests.
  - `[false]` `[reject]` Divergence on verification expectations (automated test surface) — The intent and spec do not require frontend UI tests.

## Design Notes

- Sử dụng native `<select>` kết hợp CSS styling để tuân thủ `cao 32px`, `bg-surface-overlay`, v.v. Nếu `<select>` native quá hạn chế trên các hệ điều hành, có thể implement một custom Dropdown (ul/li), tuy nhiên native select + style cơ bản thường là đủ tốt cho selector đơn giản này.
- **Phím tắt `Ctrl+E`**: Trong `App.vue`, kiểm tra phím tắt cần tương tự như `Ctrl+L`.

## Verification

**Commands:**
- `cd projects/frontend && bun run type-check` -- expected: TypeScript không báo lỗi.

**Manual checks (if no CLI):**
- Mở ứng dụng, kiểm tra góc phải header thấy dropdown selector.
- Click chọn môi trường, kiểm tra trong Vue DevTools xem `environmentStore.activeEnvId` có đổi không.
- Bấm `Ctrl+E` và kiểm tra dropdown có bắt được focus hay không.

## Auto Run Result

- **Summary of implemented change:** Built the Environment Selector dropdown component, integrated it into the App Header, and bound it to a global Ctrl+E keyboard shortcut.
- **Files changed:**
  - `projects/frontend/src/stores/uiStore.ts`: Added state and trigger for focusing the environment selector.
  - `projects/frontend/src/components/environment/EnvSelector.vue`: Created custom styled dropdown component bound to the environment store.
  - `projects/frontend/src/components/AppHeader.vue`: Mounted the selector next to the environment modal button.
  - `projects/frontend/src/App.vue`: Added global keyboard shortcut Ctrl+E to trigger the focus action, correctly guarded against executing inside editors.
- **Review findings breakdown:** 4 patches applied, 1 item deferred, and 4 findings rejected.
- **Follow-up review recommended:** false
- **Verification performed:** Ran `bun run type-check` inside `projects/frontend` which exited cleanly.
- **Residual risks:** No automated UI testing; a future refactoring could break the keyboard shortcuts or component state bindings if not manually verified.

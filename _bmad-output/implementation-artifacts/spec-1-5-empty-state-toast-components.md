---
title: 'Story 1.5: Empty State & Toast Components'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '91913c1'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Center pane và right pane hiện hoàn toàn trống — user không biết phải làm gì khi mở app hoặc khi chưa gửi request. Ngoài ra chưa có cơ chế thông báo ngắn (toast) cho các action thành công/lỗi.

**Approach:** Tạo 2 empty state components hiển thị trong content area (center pane: "Chọn một Request để bắt đầu", right pane: "Nhấn Gửi để xem kết quả phản hồi"). Tạo toast notification component (auto-dismiss 2-3s, max 1, bottom-right, aria-live="polite") và thêm toast state vào uiStore.

</frozen-after-approval>

## Implementation Notes

- 3 components mới: EmptyStateRequest.vue, EmptyStateResponse.vue, ToastNotification.vue.
- Icon dùng inline SVG (Phosphor icons: paper-plane-tilt, terminal-window) — không thêm icon library dependency.
- uiStore chuyển từ Options API sang Composition API để quản lý toast state (ref, showToast, clearToast). Timer quản lý auto-dismiss, new toast cancel timer cũ.
- ToastNotification dùng Vue `<Transition mode="out-in">` với `:key` = toast.id để new toast thay old toast mượt mà.
- ContentArea.vue render empty states trực tiếp — sẽ conditional render khi có request/response (Epic 3).
- App.vue mount ToastNotification ở root level (fixed positioning).
- `vue-tsc --noEmit` và `vite build` đều pass clean.

## Review Triage Log

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| 1 | `aria-live="polite"` nằm trên conditional div (v-if) — screen reader cần persistent live region | `low` (rejected) | Modern screen readers handle dynamic live regions. Toast hiển thị không thường xuyên. Fix thêm wrapper div chỉ để giữ persistent aria-live region là over-engineering cho v1. |
| 2 | `<Transition>` thiếu `mode="out-in"` — hai toast overlap khi replace nhanh | `medium` (patched) | Thêm `mode="out-in"` vào Transition component để old toast leave trước khi new toast enter. |

## Spec Change Log



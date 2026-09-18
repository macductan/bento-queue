---
title: 'Story 1.4: Main Layout Shell (Header, Sidebar, Content Panes)'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '460374fb36f65ea90695b9ebdc4e3a724ef2ac1f'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Frontend hiện chỉ có minimal root component trống (`App.vue` với comment placeholder) — chưa có layout shell 3-pane. Các story sau (1.5 Empty State, Epic 2 Collection Management) không thể bắt đầu vì thiếu header, sidebar, và content panes.

**Approach:** Tạo 3 Vue components (AppHeader, AppSidebar, ContentArea) và cập nhật App.vue để render layout shell desktop 3-pane. Header 48px với logo gradient, app title, version badge, và placeholder cho quick actions/env selector. Sidebar 260px với "Default Collection" label. Content area chia center pane + right pane chiếm phần còn lại. Tonal depth bằng border + background — không box-shadow.

## Boundaries & Constraints

**Always:**
- Dùng design tokens từ `style.css` (`@theme`) — không hardcode màu/spacing
- Header height = `spacing-header-height` (48px), sidebar width = `spacing-sidebar-width` (260px)
- Logo mark: 32×32, bo `rounded-xl` (12px), gradient `brand-gradient-from` → `brand-gradient-to`, chữ "h" trắng bold
- App title "hecto-api" dùng `heading-sm`, version badge "v1.0 - offline" dùng `mono-xs` màu `text-muted`
- Sidebar header: "Default Collection" dùng `ui-xs`, uppercase, tracking-wider
- Tonal depth chỉ bằng border + background color — không box-shadow trên layout elements
- UI text tiếng Việt (trừ thuật ngữ kỹ thuật)
- Components phải semantic HTML với đúng landmark roles (header, nav, main)

**Never:**
- Không thêm empty state components (thuộc Story 1.5)
- Không thêm tree view / folder rendering (thuộc Story 2.1)
- Không thêm URL bar / request editor (thuộc Epic 3)
- Không thay đổi Go backend code
- Không dùng box-shadow cho hierarchy (ngoại lệ: modal, logo, status dot — chưa cần ở story này)
- Không thêm logic vào Pinia stores (vẫn giữ empty stubs)

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| App khởi chạy | `wails dev` hoặc `npm run dev` | Layout 3-pane render: header top, sidebar left, content area right | N/A |
| Window resize | Browser/webview resize | Content area co giãn, sidebar giữ 260px, header full-width | N/A |
| Minimum viewport | Width < 600px | Layout vẫn render (không responsive breakpoint v1) — sidebar không collapse | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/App.vue` -- Root component hiện tại: div trống với flex column. Cần thêm import 3 components và render layout shell.
- `projects/frontend/src/components/` -- Thư mục trống. Sẽ tạo các layout components ở đây.
- `projects/frontend/src/style.css` -- Design tokens đã có: surface-base/raised, border-default, spacing-header-height/sidebar-width, typography classes, font families. Không cần sửa.
- `projects/frontend/src/stores/uiStore.ts` -- Empty Pinia stub. Không sửa trong story này.

## Tasks & Acceptance

**Execution:**
- [x] `src/components/AppHeader.vue` -- Tạo header component: height 48px, bg surface-raised, border-bottom. Logo mark 32×32 gradient. Title "hecto-api" heading-sm. Version badge "v1.0 - offline" mono-xs text-muted. Placeholder slots cho quick actions (phải) và env selector (phải ngoài cùng).
- [x] `src/components/AppSidebar.vue` -- Tạo sidebar component: width 260px, bg surface-raised, border-right. Header section với "Default Collection" label ui-xs uppercase tracking-wider. Phần body trống (slot cho tree view story 2.1).
- [x] `src/components/ContentArea.vue` -- Tạo content area component: flex grow chiếm phần còn lại. Chia 2 pane ngang: center pane (request editor, flex-1) và right pane (response viewer, flex-1), ngăn cách bằng border. Cả hai pane trống (slot cho story sau).
- [x] `src/App.vue` -- Cập nhật: import 3 components, render layout flex: header (top full-width), body flex-row (sidebar + content area).

**Acceptance Criteria:**
- Given app launched, when Vue frontend renders, then Header hiển thị ở 48px height với surface-raised background và border-bottom
- Given Header rendered, then chứa logo mark (32×32 gradient blue→indigo, "h" trắng bold), app title "hecto-api" (heading-sm), version badge "v1.0 - offline" (mono-xs, text-muted)
- Given Header rendered, then có placeholder areas cho quick actions (phải) và env selector (phải ngoài cùng)
- Given layout rendered, then Sidebar hiển thị ở 260px width với surface-raised background và border-right
- Given Sidebar rendered, then header hiển thị "Default Collection" label (ui-xs, uppercase, tracking-wider)
- Given layout rendered, then center pane và right pane chia đều phần width còn lại
- Given layout rendered, then tonal depth chỉ dùng border + background color — không box-shadow trên layout elements

## Implementation Notes

- 3 components tạo mới: AppHeader.vue (88 lines), AppSidebar.vue (41 lines), ContentArea.vue (35 lines).
- App.vue cập nhật: import 3 components, render layout flex column (header) + flex row (sidebar + content).
- Tất cả CSS dùng design tokens từ `@theme` — không hardcode ngoại trừ `#ffffff` cho logo text (đúng spec DESIGN.md).
- Semantic HTML: `<header>`, `<nav aria-label>`, `<main>` cho proper landmark structure.
- `min-height: 0` trên app-body và `min-width: 0` trên content-area để tránh flex overflow.


## Spec Change Log



## Review Triage Log

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| 1 | `color: #ffffff` hardcoded trong logo text thay vì design token | `false` | DESIGN.md chỉ định `text-color: '#ffffff'` trực tiếp. Không có token `--color-text-white` trong theme system. Giá trị đúng theo spec. |
| 2 | "DEFAULT COLLECTION" hardcoded trong template | `false` | Spec Boundaries nói "Không thêm logic vào Pinia stores". v1 chỉ dùng default collection. Dynamic label thuộc scope Story 2.1. |
| 3 | Không có aria attributes trên center/right pane divs | `low` (rejected) | Empty placeholder containers chưa có content. Screen readers đã có `<main>` landmark. Story 1.5 và Epic 3 sẽ thêm content với proper a11y. Fix thêm complexity không cần thiết. |

## Design Notes

**Layout structure:**
```
┌─────────────────────────────────────────────┐
│ Header (48px, full-width)                   │
├──────────┬──────────────────────────────────┤
│ Sidebar  │ Center Pane    │ Right Pane      │
│ (260px)  │ (flex-1)       │ (flex-1)        │
│          │                │                 │
│          │                │                 │
└──────────┴──────────────────────────────────┘
```

**Logo mark CSS:**
```css
background: linear-gradient(135deg, var(--color-brand-gradient-from), var(--color-brand-gradient-to));
width: 32px; height: 32px;
border-radius: var(--radius-xl); /* 12px */
```

## Verification

**Commands:**
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build, no warnings

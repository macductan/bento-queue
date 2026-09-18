---
title: 'Story 1.3: Vue 3 Frontend Setup with Design System Tokens'
type: 'feature'
created: '2026-10-01'
status: 'done'
baseline_commit: '9af0913e8e732e5abe449bc85960e4aa940f1896'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Frontend hiện chỉ có Vue 3 + Vite cơ bản (Wails scaffold) — không có Tailwind CSS, không có design token system, không có Pinia state management, không có typography (Inter/JetBrains Mono). Các story sau (1.4 Layout Shell, 1.5 Empty State) không thể bắt đầu vì thiếu foundation.

**Approach:** Cài đặt Tailwind CSS v4 + Pinia, cấu hình `@theme` directive với toàn bộ 50+ color tokens từ DESIGN.md, load Inter + JetBrains Mono fonts, tạo 12 typography utility classes, custom scrollbar CSS, và 5 Pinia store stubs. Xóa Wails scaffold mẫu (HelloWorld, Nunito font, logo image).

## Boundaries & Constraints

**Always:**
- Tailwind CSS v4 dùng `@theme` directive (không phải v3 `tailwind.config.js`)
- Color tokens map chính xác tên + giá trị từ DESIGN.md — không đổi tên, không bỏ sót
- Inter: weights 400, 500, 600, 700. JetBrains Mono: weights 400, 500
- Pinia store stubs: chỉ export empty store (`defineStore` + empty state) — không thêm actions/getters
- Corner radius tokens: sm(4px), md(6px), lg(8px), xl(12px), full(9999px)
- Spacing tokens: 4px-based scale: 1(4px), 2(8px), 3(12px), 4(16px), 5(20px), 6(24px), 8(32px) + header-height(48px), sidebar-width(260px), gutter(16px), pane-border(1px)

**Never:**
- Không thêm layout components (thuộc Story 1.4)
- Không thêm empty state hay toast (thuộc Story 1.5)
- Không thay đổi Go backend code
- Không dùng CDN cho fonts — self-host trong `src/assets/fonts/`
- Không dùng Tailwind CSS v3 config format

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Build thành công | `npm run build` (hoặc tương đương) | Vite build clean, không warning về missing tokens | N/A |
| Tailwind tokens accessible | Vue component dùng `bg-surface-base` | CSS class render đúng `background-color: #020617` | N/A |
| Typography class | Element có class `ui-base` | font-family: Inter, 14px, 400, 1.5 | N/A |
| Mono class | Element có class `mono-base` | font-family: JetBrains Mono, 13px, 400, 1.6 | N/A |
| Pinia store import | `import { useUiStore } from '@/stores/uiStore'` | Store instance valid, empty state | N/A |
| Custom scrollbar | Bất kỳ scrollable container | Track #0f172a, thumb #334155, hover #475569, width 8px | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/package.json` -- Dependencies hiện tại: vue 3.5, vite 7, vue-tsc, @vitejs/plugin-vue. Cần thêm: tailwindcss v4, @tailwindcss/vite, pinia.
- `projects/frontend/vite.config.ts` -- Plugin hiện tại: vue(). Cần thêm tailwindcss vite plugin.
- `projects/frontend/src/main.ts` -- Entry point: createApp + mount. Cần thêm Pinia plugin, import CSS.
- `projects/frontend/src/style.css` -- CSS hiện tại: Nunito font-face, basic styles. Sẽ thay thế hoàn toàn bằng Tailwind + design tokens.
- `projects/frontend/src/App.vue` -- Wails scaffold HelloWorld + logo. Cần thay bằng minimal root component.
- `projects/frontend/src/components/HelloWorld.vue` -- Wails scaffold component. Xóa.
- `projects/frontend/src/assets/fonts/nunito-v16-latin-regular.woff2` -- Nunito font file. Xóa, thay bằng Inter + JetBrains Mono.
- `projects/frontend/src/assets/fonts/OFL.txt` -- Nunito license. Xóa, thay bằng Inter + JetBrains Mono licenses.
- `projects/frontend/src/assets/images/logo-universal.png` -- Wails logo. Xóa.
- `projects/frontend/index.html` -- HTML entry. Cần update lang="vi".
- `projects/frontend/tsconfig.json` -- Cần thêm path alias `@/` → `src/`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- Thêm dependencies: `tailwindcss` v4, `@tailwindcss/vite`, `pinia`. Chạy install.
- [x] `vite.config.ts` -- Thêm `tailwindcss()` vào plugins array. Thêm resolve alias `@` → `./src`.
- [x] `tsconfig.json` -- Thêm `paths: { "@/*": ["./src/*"] }` và `baseUrl: "."`.
- [x] `src/assets/fonts/` -- Xóa Nunito files. Download + đặt Inter (woff2, weights 400/500/600/700) và JetBrains Mono (woff2, weights 400/500). Thêm license files tương ứng.
- [x] `src/style.css` -- Thay toàn bộ nội dung: `@import "tailwindcss"`, `@theme` block với tất cả color tokens (50+), spacing tokens, radius tokens. `@font-face` declarations cho Inter + JetBrains Mono. 12 typography utility classes. Custom scrollbar CSS. Base styles (html, body, #app).
- [x] `src/stores/collectionStore.ts` -- Pinia store stub: `useCollectionStore`, empty state object.
- [x] `src/stores/requestStore.ts` -- Pinia store stub: `useRequestStore`, empty state object.
- [x] `src/stores/environmentStore.ts` -- Pinia store stub: `useEnvironmentStore`, empty state object.
- [x] `src/stores/responseStore.ts` -- Pinia store stub: `useResponseStore`, empty state object.
- [x] `src/stores/uiStore.ts` -- Pinia store stub: `useUiStore`, empty state object.
- [x] `src/App.vue` -- Thay thế scaffold: minimal root component, xóa HelloWorld import + logo.
- [x] `src/main.ts` -- Thêm `createPinia()`, register Pinia plugin trước mount.
- [x] `index.html` -- Đổi `lang="en"` → `lang="vi"`.
- [x] Cleanup -- Xóa `src/components/HelloWorld.vue`, `src/assets/images/logo-universal.png`.

**Acceptance Criteria:**
- Given frontend project, when `npm run build` (hoặc bun build), then build thành công không error
- Given Tailwind configured, when dùng class `bg-surface-base` trong Vue component, then CSS render `#020617`
- Given typography classes, when element có class `ui-base`, then font-family Inter, font-size 14px, font-weight 400, line-height 1.5
- Given typography classes, when element có class `mono-base`, then font-family JetBrains Mono, font-size 13px, font-weight 400, line-height 1.6
- Given Pinia stores, when import `useCollectionStore` từ `@/stores/collectionStore`, then store instance valid
- Given custom scrollbar CSS, when scrollable container xuất hiện, then scrollbar styled đúng (track/thumb/hover colors, 8px width)
- Given index.html, when page loads, then `<html lang="vi">` đúng
- Given font files, when Inter và JetBrains Mono được load, then render đúng weights (Inter 400-700, JBMono 400-500)

## Implementation Notes

- Fonts downloaded từ Google Fonts API — latin + vietnamese subsets cho cả Inter và JetBrains Mono. Variable font format (weight range) giúp giảm số file: Inter `400 700` covers 400/500/600/700, JBMono `400 500` covers 400/500.
- `@tailwindcss/vite` plugin thay vì PostCSS integration — cho Tailwind v4 tốt hơn về DX (HMR nhanh hơn).
- `package-lock.json` mới được tạo (trước đó chỉ có `bun.lock`) — do chạy `npm install`.

## Spec Change Log



## Review Triage Log

| # | Finding | Verdict | Evidence |
|---|---------|---------|----------|
| 1 | `@tailwindcss/vite` in `dependencies` thay vì `devDependencies` | `low` (patched) | Build tool, không cần runtime. Đã chuyển sang devDependencies. |
| 2 | `tailwindcss` in `dependencies` thay vì `devDependencies` | `low` (patched) | Build tool, không cần runtime. Đã chuyển sang devDependencies. |
| 3 | Universal `*` selector cho scrollbar Firefox | `false` | Firefox `scrollbar-width`/`scrollbar-color` cần set trên mỗi element muốn scroll — `*` là pattern chuẩn, `:root` không đủ cho nested containers. |
| 4 | Empty `<script>` block trong App.vue | `false` | `<script lang="ts" setup>` cần để Vue SFC compiler xác định TypeScript. Story 1.4 sẽ thêm imports. |
| 5 | Dual lockfiles (`package-lock.json` + `bun.lock`) | `low` (deferred) | `npm install` tạo `package-lock.json` bên cạnh `bun.lock`. Fix cần sửa `.gitignore` — ngoài scope story này. |

## Design Notes

**Tailwind CSS v4 `@theme` pattern:**
```css
@import "tailwindcss";

@theme {
  --color-surface-base: #020617;
  --color-surface-raised: #0f172a;
  /* ... tất cả tokens ... */
  --radius-sm: 4px;
  --radius-md: 6px;
  /* ... */
  --spacing-1: 4px;
  /* ... */
}
```

**Pinia store stub pattern:**
```typescript
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({})
})
```

## Verification

**Commands:**
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build, no warnings

---
title: 'Story 1.7: Epic 1 Deferred Work Cleanup'
type: 'chore'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
followup_review_recommended: false
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Epic 1 tích lũy tech debt từ các story trước: (1) dual lockfiles `package-lock.json` + `bun.lock` gây nhầm lẫn CI/CD — bun là package manager chính nhưng `npm install` từ story 1.3 tạo thêm `package-lock.json`, (2) layout components (AppHeader, AppSidebar, ContentArea, App.vue) dùng scoped CSS trong khi Story 1.5 đã dùng Tailwind utilities — không đồng nhất, (3) walk logic duplicated ~30 dòng giữa `walkFindUUID` và `IndexRebuild` trong `filesystem.go`, (4) Fallback walk trong `FindByUUID` hiện đang dùng full unmarshal toàn bộ file JSON chỉ để lấy trường `id`, gây tốn memory vô ích (deferred từ spec 1.6).

**Approach:** Gitignore `package-lock.json` và xóa khỏi disk. Refactor 4 layout components sang Tailwind CSS v4 utilities, xóa toàn bộ `<style scoped>`. Extract shared walk callback để `walkFindUUID` và `IndexRebuild` dùng chung. Tối ưu JSON parsing trong walk helper: thay vì unmarshal toàn bộ entity, chỉ unmarshal vào một struct ẩn chứa duy nhất trường `ID string` để tiết kiệm CPU/RAM.

## Boundaries & Constraints

**Always:**
- Giữ bun làm package manager — `bun.lock` là source of truth.
- Layout components refactored phải render pixel-identical với phiên bản scoped CSS hiện tại.
- Walk refactor phải giữ nguyên behavior: `walkFindUUID` early-return khi tìm thấy, `IndexRebuild` accumulate tất cả.
- Tất cả Go tests hiện có phải pass.

**Never:**
- Không thay đổi design tokens hay thêm token mới.
- Không thêm/sửa logic business — chỉ refactor code style.
- Không sửa TODO comments thuộc scope Epic 2+ (service stubs, ContentArea placeholders).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Walk shared helper — early-return mode | UUID tồn tại trên disk | walkFindUUID trả path đúng, dừng walk sớm | Không lỗi |
| Walk shared helper — accumulate mode | Collection root có 5 JSON files | IndexRebuild populate index đủ 5 entries | Không lỗi |
| Walk shared helper — skip rules | _folder.json, collection.json, environments/ | Cả 2 mode đều skip đúng | Không lỗi |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/AppHeader.vue` L31-80 -- scoped CSS cần chuyển sang Tailwind utilities
- `projects/frontend/src/components/AppSidebar.vue` L15-41 -- scoped CSS cần chuyển sang Tailwind utilities
- `projects/frontend/src/components/ContentArea.vue` L19-39 -- scoped CSS cần chuyển sang Tailwind utilities
- `projects/frontend/src/App.vue` L19-31 -- scoped CSS cần chuyển sang Tailwind utilities
- `projects/storage/filesystem.go` L227-284 -- `walkFindUUID`: walk + filter + parse + early-return
- `projects/storage/filesystem.go` L290-346 -- `IndexRebuild`: walk + filter + parse + accumulate (duplicated logic với walkFindUUID)
- `projects/storage/filesystem_test.go` -- tests cho fallback walk và IndexRebuild — phải pass sau refactor
- `.gitignore` L19-24 -- thêm `projects/frontend/package-lock.json`
- `projects/frontend/bun.lock` -- giữ nguyên, đã tracked
- `projects/frontend/package-lock.json` -- xóa khỏi git tracking

## Tasks & Acceptance

**Execution:**
- `projects/storage/filesystem.go` -- Extract shared `walkJSONEntities` callback từ `walkFindUUID` và `IndexRebuild` — giảm duplication, giữ nguyên behavior hai mode (early-return vs accumulate)
- `.gitignore` -- Thêm `projects/frontend/package-lock.json` vào gitignore
- `git rm --cached projects/frontend/package-lock.json` -- Xóa lockfile npm khỏi git tracking
- `rm projects/frontend/package-lock.json` -- Xóa hẳn file khỏi ổ cứng để tránh npm/bun conflict
- `projects/frontend/src/components/AppHeader.vue` -- Chuyển scoped CSS sang Tailwind utilities, xóa `<style scoped>`
- `projects/frontend/src/components/AppSidebar.vue` -- Chuyển scoped CSS sang Tailwind utilities, xóa `<style scoped>`
- `projects/frontend/src/components/ContentArea.vue` -- Chuyển scoped CSS sang Tailwind utilities, xóa `<style scoped>`
- `projects/frontend/src/App.vue` -- Chuyển scoped CSS sang Tailwind utilities, xóa `<style scoped>`

**Acceptance Criteria:**
- Given `bun.lock` có trong git và `package-lock.json` bị gitignore, when `git status`, then chỉ còn `bun.lock` được tracked
- Given 4 layout components refactored, when `npx vite build`, then build thành công không warning
- Given AppHeader refactored, when render, then layout pixel-identical: 48px cao, surface-raised, border-bottom, logo 32px rounded-xl, title + version badge đúng vị trí
- Given AppSidebar refactored, when render, then 260px rộng, surface-raised, border-right, collection label uppercase muted
- Given ContentArea refactored, when render, then 2 panes chia đều flex-1, border-left giữa hai pane
- Given walk logic refactored, when chạy `go test ./storage/ -v -count=1`, then tất cả 17 tests pass
- Given Go code, when `go vet ./...`, then không warning

## Implementation Notes

- Xóa thành công `package-lock.json` từ disk và `.gitignore`.
- Thay đổi thành công các files Vue để sử dụng class Tailwind v4 `h-header-height`, `bg-surface-raised`, ...
- Refactor Go: Tách `walkJSONEntities` thành core walker dùng `filepath.WalkDir` và đọc JSON optimize chỉ lấy trường `ID`. 17 tests của `filesystem` package đều PASS.

## Spec Change Log


## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 9 findings — high 0, medium 0, low 1, false 6, maybe-false 0
- findings:
  - `false` `reject` **[Blind Hunter]** Hardcoded `w-[32px] h-[32px]` trên logo — `--spacing-8: 32px` tồn tại trong @theme, `w-8 h-8` tương đương; token không cần thiết vì arbitrary value trong Tailwind v4 render giống hệt.
  - `false` `reject` **[Blind Hunter]** Sidebar thiếu `shrink-0` — class `min-w-sidebar-width` (260px) đã pin minimum width; sidebar không thể shrink dưới 260px trong flex container.
  - `false` `reject` **[Blind Hunter]** `h-full` trên `#hecto-root` không có parent height — `style.css:282` đã set `#app { height: 100vh }`. `#hecto-root` là con trực tiếp của `#app`, chain hoàn toàn đủ.
  - `false` `reject` **[Blind Hunter]** Empty line trong `.gitignore` sau khi xóa `bun.lock` — cosmetic; không ảnh hưởng behavior của gitignore.
  - `low` `reject` **[Edge Case / Blind Hunter]** Log detail reduction: trước có 2 message riêng "skipping unreadable file" / "skipping unparseable file", sau chỉ còn "skipping file" — loss of diagnostic detail; fix phức tạp hơn trivial (cần thay đổi callback signature hoặc thêm type assertion), không ảnh hưởng user-facing behavior; rejected per low-reject rule.
  - `false` `reject` **[Edge Case Hunter]** Root dir inaccessible silently skip — behavior pre-existing, copy nguyên từ code cũ trước refactor; not introduced by this story.
  - `false` `reject` **[Verification Gap]** `filepath.SkipAll` propagation unverified — Go stdlib WalkDir documented: callback returning SkipAll causes WalkDir to return nil immediately. Verified at `filesystem.go:283`: `walkFindUUID` returns `filepath.SkipAll` → `walkJSONEntities` → `WalkDir` returns nil → `err == nil` → correct path returned. Behavior đúng, không cần test thêm.
  - `defer` `defer` **[Verification Gap]** `FindByUUID("")` match file không có `id` field — uuid="" lookup sẽ match file với entity.ID="" (zero value). Bug thực nhưng pre-existing logic: check `id == uuid` tồn tại từ code cũ, refactor không thay đổi so sánh. Không có caller thực tế nào pass uuid="" trong codebase hiện tại. Deferred.
  - `defer` `defer` **[Verification Gap]** `IndexRebuild` không có test với corrupted/unreadable JSON file — pre-existing gap, behavior unchanged. Deferred.



## Design Notes

**Walk refactor strategy:** Extract hàm `walkJSONEntities(root string, fn func(path string, id string) error) error` làm core walker. Hàm này chịu trách nhiệm: WalkDir, skip environments/, skip non-.json, skip _folder.json/collection.json, ReadFile, và quan trọng nhất: **chỉ unmarshal vào struct `struct { ID string \`json:"id"\` }`** thay vì full `model.Request/Folder`. Sau đó gọi callback `fn` với path và id. `walkFindUUID` gọi walker với callback return `filepath.SkipAll` khi tìm thấy UUID. `IndexRebuild` gọi walker với callback `IndexSet` cho mọi entry.

**Tailwind mapping cho layout components:**
- `height: var(--spacing-header-height)` → `h-header-height`
- `background-color: var(--color-surface-raised)` → `bg-surface-raised`
- `border-bottom: 1px solid var(--color-border-default)` → `border-b border-border-default`
- `width: var(--spacing-sidebar-width)` → `w-sidebar-width`
- `display: flex; align-items: center` → `flex items-center`
- `gap: var(--spacing-3)` → `gap-spacing-3`

## Verification

**Commands:**
- `cd projects && go test ./storage/ -v -count=1` -- expected: 17/17 PASS
- `cd projects && go vet ./...` -- expected: không warning
- `cd projects && go build ./...` -- expected: build thành công
- `cd projects/frontend && npx vue-tsc --noEmit` -- expected: no type errors
- `cd projects/frontend && npx vite build` -- expected: clean build

## Auto Run Result

Status: done

### Tóm tắt thay đổi
Đã dọn dẹp các tech debt tồn đọng của Epic 1: Xóa hoàn toàn `package-lock.json` để giữ Bun làm PM duy nhất. Cập nhật 4 layout components Vue sang dùng Tailwind utilities thay vì scoped CSS. Tách logic walk thư mục ra một helper chung `walkJSONEntities` có tích hợp sẵn tối ưu unmarshal (chỉ lấy field ID) giúp giảm tài nguyên CPU/RAM, sử dụng chung cho cả FindByUUID và IndexRebuild.

### Files changed
- `.gitignore` — Thêm rule loại trừ `projects/frontend/package-lock.json`
- `projects/frontend/package-lock.json` — Xóa khỏi Git và ổ đĩa
- `projects/frontend/src/App.vue` — Đổi scoped CSS sang Tailwind classes
- `projects/frontend/src/components/AppHeader.vue` — Đổi scoped CSS sang Tailwind classes
- `projects/frontend/src/components/AppSidebar.vue` — Đổi scoped CSS sang Tailwind classes
- `projects/frontend/src/components/ContentArea.vue` — Đổi scoped CSS sang Tailwind classes
- `projects/storage/filesystem.go` — Extract `walkJSONEntities`, refactor `walkFindUUID` và `IndexRebuild`

### Review findings (4-layer formal review)
- Layers chạy: Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment Auditor
- Tổng findings: 9 — high 0, medium 0, low 1 (rejected), false 6, deferred 2
- Patches applied: 0
- Items deferred: 2 (FindByUUID empty uuid guard, IndexRebuild corrupted-file test)
- Follow-up review recommended: false

### Verification
- `go test ./storage/... -v -count=1` — 17/17 PASS
- `go vet ./...` — Clean, 0 warnings
- `go build ./...` — Clean
- `npx vue-tsc --noEmit` — No type errors
- `vite build` — Clean build, 0 warnings
- `wails dev` — App khởi động thành công

### Residual risks
- `FindByUUID("")` có thể match file không có id field — pre-existing, no caller hiện tại. Deferred.
- `IndexRebuild` chưa có test với corrupted JSON — pre-existing gap. Deferred.

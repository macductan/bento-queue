---
title: 'Cập nhật UI theo mockup và chuyển ô nhập dữ liệu thành dạng nhiều dòng'
type: 'feature'
created: '2026-10-08'
status: 'in-review'
baseline_commit: 'fc020544cc0da92db5ddf920a32c3c0606e7385c'
route: 'dispatch'
review_loop_iteration: 0
context: ['_bmad-output/planning-artifacts/ux-designs/ux-hecto-api-2026-09-21/DESIGN.md', '_bmad-output/planning-artifacts/ux-designs/ux-hecto-api-2026-09-21/EXPERIENCE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Giao diện frontend hiện tại có một số điểm chưa khớp hoàn toàn với thiết kế `DESIGN.md` và `EXPERIENCE.md`. Ngoài ra, ô nhập dữ liệu (input) hiện tại đang là single-line text, gây khó khăn khi nhập dữ liệu dài hoặc có xuống dòng.

**Approach:** Rà soát và cập nhật UI component (khoảng cách, layout grid, CSS classes) theo đúng spec trong `DESIGN.md`. Đồng thời chuyển đổi ô nhập dữ liệu được yêu cầu sang dùng `<textarea>` có khả năng tự thay đổi chiều cao (auto-resize) hoặc scroll để hỗ trợ nhập văn bản nhiều dòng (multi-line).

## Boundaries & Constraints

**Always:** Giữ nguyên các hành vi tương tác đã định nghĩa trong `EXPERIENCE.md`. Tuân thủ Tailwind Slate color palette và JetBrains Mono font cho dữ liệu.
**Never:** Không thêm các thư viện UI bên ngoài để làm textarea (dùng native HTML textarea với Tailwind CSS). Không thay đổi kiến trúc storage hay logic backend.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nhập dữ liệu dài | Gõ văn bản có ký tự `\n` vào ô nhập | Ô nhập hiển thị nhiều dòng, cuộn hoặc mở rộng chiều cao phù hợp mà không phá vỡ UI | N/A |
| Highlight biến | Nhập biến `{{token}}` vào textarea | Biến môi trường vẫn được highlight đúng màu như cũ | N/A |

**Decisions:**
- Chuyển đổi ô "Value" trong KVP Editor của tab Params/Headers (`KvpEditor.vue`) thành `<textarea>` để hỗ trợ nhập nhiều dòng.

</frozen-after-approval>

## Code Map

- `projects/frontend/src/components/KvpEditor.vue` -- Sửa `grid-cols` cho khớp `DESIGN.md` (auto 1fr 1fr auto) và thay đổi ô input Value thành `<textarea>`.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Xử lý wrapper cho `<textarea>` để hỗ trợ highlight text có xuống dòng (sửa prop `single-line`).

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/components/KvpEditor.vue` -- Điều chỉnh grid layout và cập nhật input tag của Value thành textarea -- Đảm bảo chuẩn xác với `DESIGN.md` và cho phép gõ xuống dòng
- [x] `projects/frontend/src/components/VariableHighlighter.vue` -- Cập nhật logic để hỗ trợ multi-line -- Đảm bảo text và highlight div đồng bộ scroll và chiều cao khi dùng textarea

**Acceptance Criteria:**
- Given user đang ở tab Headers/Params, when nhập nội dung dài có xuống dòng, then textarea cho phép cuộn/mở rộng và biến môi trường bên trong vẫn được highlight.
- Given giao diện KVP Editor, when hiển thị, then layout grid chia cột chính xác theo thiết kế `auto 1fr 1fr auto`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `bun run --cwd projects/frontend build` -- expected: Build thành công không có lỗi TypeScript
- `bun run --cwd projects/frontend test` -- expected: Các unit test liên quan passing

**Manual checks (if no CLI):**
- Mở dev server (`bun run dev`), thêm mới một header, paste text có xuống dòng vào ô Value, kiểm tra xem có hiển thị được nhiều dòng và highlight đúng biến không.
- Kiểm tra các grid layout trong UI đảm bảo padding/margin và font giống `DESIGN.md`.

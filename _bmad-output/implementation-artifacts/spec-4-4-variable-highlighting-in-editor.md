---
title: 'Story 4.4: Variable Highlighting in Editor'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_revision: '8ce22c93c4b9adb9a776df2f78bbe7e6a7dc1022'
review_loop_iteration: 0
followup_review_recommended: false
context: ['/home/dev/mdt/hecto-api/_bmad-output/implementation-artifacts/epic-4-context.md']
warnings: []
deferred:
  - summary: >-
      Missing integration tests for KvpEditor, BodyEditor, and UrlBar
    evidence: |-
      The component is tested in isolation, but end-to-end integration is deferred.
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Hiện tại, người dùng có thể dùng biến `{{variable}}` nhờ Variable Substitution Engine, nhưng giao diện text input/textarea không phản hồi trạng thái của biến. Người dùng không biết biến nào đã được resolve hay biến nào đang missing, dẫn đến lỗi bất ngờ khi gửi request.

**Approach:** Tạo một component tái sử dụng (ví dụ: `VariableHighlighter`) kết nối với `environmentStore` và sử dụng hàm `parseVariables` để bóc tách chuỗi. Component này sẽ overlay màu sắc lên các biến: màu sky cho biến hợp lệ và màu đỏ + in nghiêng cho biến thiếu. Tích hợp component này vào thanh URL, input cho Header Values, và Body Editor, đảm bảo phản hồi ngay lập tức (reactive) khi đổi môi trường hoặc sửa text.

## Boundaries & Constraints

**Always:**
- Sử dụng `parseVariables` từ `utils/variables.ts` để phân tách input thành các segment.
- Các segment `resolved` có màu `variable-valid` (sky-400 / #38bdf8), `missing` có màu `variable-missing` (#f87171) và font italic. Các text thông thường giữ nguyên màu gốc.
- Phải đảm bảo cuộn (scroll) và padding, font-size, font-family của lớp overlay giống y hệt (perfectly aligned) với input/textarea nằm bên trên hoặc bên dưới nó. Caret (con trỏ chuột) và text selection của người dùng trên input thực tế phải hiển thị bình thường.
- Đối với `KvpEditor`, chỉ highlight cột **Value**, không highlight cột **Key** của phần headers và params (dựa theo quy tắc ở Story 4.3).
- Áp dụng highlight cho: `UrlBar.vue` (URL input), `KvpEditor.vue` (cột Value), `BodyEditor.vue` (textarea cho text/json body).
- Overlay highlight phải cập nhật reactive theo `envStore.variablesMap` và nội dung input hiện tại.

**Never:**
- Không thay đổi hành vi gửi của request hay cấu trúc lưu trữ hiện có của request/environment.
- Không tạo độ trễ (lag) rõ rệt khi nhập liệu ở file body lớn; nếu cần có thể áp dụng CSS/HTML tối ưu (nhưng ưu tiên dùng kỹ thuật render overlay chuẩn của Vue).
- Không được làm mất focus, hỏng phím Tab, hoặc phá vỡ các phím tắt hiện có của ứng dụng khi thay thế thẻ `<input>`/`<textarea>` bằng component mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Biến hợp lệ | Nhập `{{host}}` vào URL, env active có `host` | Chuỗi `{{host}}` hiện màu sky (#38bdf8) | Không lỗi |
| Biến thiếu | Nhập `{{token}}` vào Header Value, env active không có | Chuỗi `{{token}}` hiện màu đỏ (#f87171) và in nghiêng | Không lỗi |
| Đổi môi trường | Đang chọn Env A (có `token`), đổi sang Env B (không có) | Highlight `{{token}}` tự động chuyển từ xanh sang đỏ | Không lỗi |
| Sửa text | Xóa 1 dấu `}` (thành `{{token}`) | Không match biến nữa, text trở về màu bình thường | Không lỗi |
| Cuộn (Scroll) | Text dài trong Body Editor | Overlay cuộn đồng bộ hoàn toàn với textarea | Không lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/variables.ts` -- Tái sử dụng `parseVariables` đã có.
- `projects/frontend/src/components/UrlBar.vue` -- Thay input URL bằng cơ chế overlay highlight.
- `projects/frontend/src/components/KvpEditor.vue` -- Cập nhật input cho phần Value để áp dụng highlight. Chú ý giữ nguyên input gốc cho cột Key và dòng phantom (nếu phức tạp, dòng phantom chưa nhập cũng có thể dùng chung cấu trúc).
- `projects/frontend/src/components/BodyEditor.vue` -- Thêm lớp overlay phía sau hoặc phía trước textarea (với `text-transparent` ở textarea và `caret-text-primary`) để highlight body. Cần xử lý đồng bộ sự kiện `@scroll`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/components/VariableHighlighter.vue` -- Tạo component chung bọc (wrap) input/textarea hoặc render overlay. Đảm bảo hỗ trợ multiline cho textarea và single-line cho input, đồng bộ hóa các thuộc tính CSS như font, size, padding. Lấy `variablesMap` từ `environmentStore`.
- `projects/frontend/src/components/UrlBar.vue` -- Tích hợp thẻ overlay cùng input hiện tại để highlight biến trong URL.
- `projects/frontend/src/components/KvpEditor.vue` -- Tích hợp component/overlay highlight vào `<input>` của dòng Value. Giữ nguyên logic quản lý focus và phím tắt (Tab nhảy ô).
- `projects/frontend/src/components/BodyEditor.vue` -- Cập nhật `<textarea>` để có overlay phía sau. Lắng nghe event `@scroll` để đồng bộ thuộc tính `scrollTop` / `scrollLeft` của thẻ overlay với thẻ textarea.

**Acceptance Criteria:**
- Given người dùng đang nhập URL chứa `{{host}}`, when biến `host` có tồn tại trong env active, then `{{host}}` tự động được tô màu #38bdf8.
- Given người dùng nhập biến không tồn tại vào Body Editor, when quan sát bằng mắt, then biến đó được in nghiêng và có màu #f87171.
- Given người dùng đang ở một màn hình có chứa biến hợp lệ, when người dùng đổi Environment thông qua Header dropdown sang một env không chứa biến đó, then màu biến tự động cập nhật sang đỏ ngay lập tức mà không cần gõ lại nội dung.
- Given người dùng nhập nội dung vượt quá chiều dài của thanh URL hoặc chiều cao của Body Editor, when người dùng cuộn (scroll), then phần highlight cuộn mượt mà và luôn khớp với đoạn text hiển thị.

## Spec Change Log


## Verification

**Commands:**
- `cd projects/frontend && bun run build` -- expected: Build thành công không có lỗi TypeScript liên quan đến component mới.



## Review Triage Log
### 2026-10-07 — Review pass
- verdicts: 7 findings — high 3, medium 2, low 0, false 2, maybe-false 0
- findings:
  - `[medium]` `[defer]` Missing integration tests for KvpEditor, BodyEditor, and UrlBar — The component is tested in isolation, but end-to-end integration is deferred.
  - `[high]` `[patch]` Opaque background in KvpEditor hides the overlay — Fixed by moving bg-surface-base to parent container and making input bg-transparent.
  - `[false]` `[reject]` Missing CSS variable definitions — variables are defined in style.css.
  - `[high]` `[patch]` Line wrapping misalignment in BodyEditor — Fixed by passing wrap=false to VariableHighlighter.
  - `[high]` `[patch]` Missing scroll synchronization in KvpEditor — Fixed by binding @scroll to invoke syncScroll on highlighter ref.
  - `[medium]` `[patch]` Button layout regression in KvpEditor — Fixed by restoring flex items-center class.
  - `[medium]` `[patch]` Missing font ligature styles in UrlBar overlay — Fixed by applying inline style to VariableHighlighter.
  - `[false]` `[reject]` Native scrollbar overlap in BodyEditor — textarea sits above overlay so it just covers text cleanly without breaking alignment.
  - `[medium]` `[patch]` Unverified single-line rendering mode — Fixed by adding component test for singleLine: true.


## Auto Run Result

- **Summary of implemented change:** Built `VariableHighlighter` component, fixed ESM testing issues in vitest by using `happy-dom`, integrated highlighting overlay across UrlBar, BodyEditor, and KvpEditor. Addressed review findings around UI alignment, scroll sync, background opacity, and missing tests.
- **Files changed:** `VariableHighlighter.vue`, `UrlBar.vue`, `BodyEditor.vue`, `KvpEditor.vue`, `VariableHighlighter.test.ts`.
- **Review findings breakdown:** 6 patches applied, 1 item deferred (integration testing), 2 rejected (false alarms).
- **Follow-up review recommended:** false
- **Verification performed:** Tests run successfully via `npm run test` (37/37 passing), build succeeds.
- **Residual risks:** No end-to-end integration tests confirm the highlighter overlay layout in a real browser engine, we rely on component-level isolation tests and visual inspection.

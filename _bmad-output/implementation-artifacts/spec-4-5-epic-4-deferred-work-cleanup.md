---
title: 'Story 4.5: Epic 4 Deferred Work Cleanup'
type: 'chore'
created: '2026-10-07'
status: 'done'
baseline_revision: '5ff9323960a7bbf2362373c0215c1d984c42ec53'
review_loop_iteration: 0
followup_review_recommended: true
context: ['/home/dev/mdt/hecto-api/_bmad-output/implementation-artifacts/epic-4-context.md']
warnings: []
deferred:
  - summary: >-
      envStore.save automatically triggers a full loadAll() refresh causing N+1
    evidence: |-
      In EnvModal.vue, closeAndSave executes await envStore.save(env) sequentially within a loop for each modified environment. Because the store's save method automatically triggers a full loadAll() refresh from the backend upon success, saving multiple environments triggers an N+1 performance issue with redundant environment reloads.
    location: >-
      projects/frontend/src/components/environment/EnvModal.vue
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Các tính năng của Epic 4 đã hoàn thành, tuy nhiên còn tồn đọng một số technical debts và issues nhỏ được đánh dấu "deferred": EnvModal lưu toàn bộ danh sách thay vì chỉ lưu môi trường bị thay đổi, caret ở EnvSelector thiếu màu focus đồng nhất với select, nối chuỗi URL gây lỗi khi tận cùng bằng dấu `?` hoặc `&`, và thiếu integration tests xác nhận khả năng hoạt động liên kết của `VariableHighlighter` với các thành phần như `UrlBar`.

**Approach:** Giải quyết dứt điểm các deferred findings này bằng cách: (1) Kiểm tra sự thay đổi (dirty check) trong `EnvModal.vue` trước khi gọi save; (2) Sử dụng Tailwind `peer` và `peer-focus` ở `EnvSelector.vue` cho biểu tượng caret; (3) Xử lý trim các ký tự phân cách dư thừa trong `buildExecuteRequest.ts`; (4) Thêm file integration test cho `VariableHighlighter` chạy với `UrlBar.vue` và mock store.

## Boundaries & Constraints

**Always:**
- Giữ vững các invariant và logic cốt lõi đã có của hệ thống (Variable Substitution, Environment CRUD).
- Sử dụng `JSON.stringify` hoặc cách so sánh an toàn tương tự để tìm ra Env nào thực sự khác với phiên bản trong store.
- Trong `buildExecuteRequest.ts`, phải đảm bảo URL luôn đúng định dạng (ví dụ không bao giờ có `??` hay `?&`). Trim `?` và `&` ở phía cuối URL gốc trước khi thêm query params.

**Never:**
- Không viết lại toàn bộ cấu trúc của EnvModal hoặc VariableHighlighter. Chỉ vá (patch) các điểm được yêu cầu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Query append với base URL tận cùng bằng `?` | URL = `https://api.com/?`, Param = `page=1` | URL = `https://api.com/?page=1` | Không lỗi |
| Query append với base URL tận cùng bằng `&` | URL = `https://api.com/?a=1&`, Param = `b=2` | URL = `https://api.com/?a=1&b=2` | Không lỗi |
| Đóng EnvModal không chỉnh sửa | Người dùng mở EnvModal, không sửa gì, rồi đóng | Không có API call nào tới `envStore.save` | Không lỗi |
| Đóng EnvModal có chỉnh sửa | Đổi tên Env số 2 | Gọi `envStore.save` CHỈ với Env số 2 | Báo lỗi nếu backend gọi thất bại (handled ở store) |

</intent-contract>

## Code Map

- `projects/frontend/src/components/environment/EnvModal.vue` -- Sửa logic hàm `closeAndSave` để lọc các env có sự thay đổi (so với store) trước khi save.
- `projects/frontend/src/components/environment/EnvSelector.vue` -- Cập nhật thẻ `select` thêm class `peer`, thêm class `peer-focus:text-brand-primary` cho phần tử bọc SVG.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Thêm logic xử lý loại bỏ ký tự `?` hoặc `&` dư thừa ở cuối chuỗi URL gốc trước khi ghép params.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Cập nhật / Thêm các edge cases (tận cùng bằng `?`, `&`) để test logic trim.
- `projects/frontend/src/components/__tests__/VariableHighlighterIntegration.test.ts` -- (Tạo mới) Test render `UrlBar.vue` với `VariableHighlighter` và store để xác minh end-to-end integration hoạt động tốt.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/components/environment/EnvModal.vue` -- Cập nhật `closeAndSave`: so sánh `localEnvs` hiện tại với `envStore.environments` (bằng index hoặc deep clone array gốc) để biết env nào đã bị thay đổi (dirty), và chỉ gọi `envStore.save` cho các env đó.
- `projects/frontend/src/components/environment/EnvSelector.vue` -- Áp dụng Tailwind group/peer để thẻ SVG có chung màu với `ring-brand-primary` khi người dùng focus vào select dropdown.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Cắt bỏ mọi ký tự `?` hoặc `&` ở cuối `base` (hoặc `url`) trước khi ghép chuỗi query parameter vào `url`. Cụ thể: `base = base.replace(/[?&]+$/, '')` (hoặc phương pháp tương tự).
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Bổ sung ít nhất 2 bài test tương ứng với I/O Matrix.
- `projects/frontend/src/components/__tests__/VariableHighlighterIntegration.test.ts` -- Thêm một bài test ngắn, mock Pinia environment store, truyền `activeEnvId` hợp lệ, mount `UrlBar.vue`, nhập nội dung có biến `{{...}}` và xác nhận overlay được render thành công với phần span `text-variable-valid`.

**Acceptance Criteria:**
- Given EnvModal được mở, when người dùng đóng màn hình mà không thay đổi bất kỳ trường nào, then không có action nào ghi dữ liệu xuống đĩa (có thể verify bằng spy hoặc log).
- Given thẻ EnvSelector, when người dùng focus vào, then biểu tượng mũi tên xổ xuống hiển thị màu xanh (text-brand-primary) hoặc màu focus đồng bộ.
- Given một request có URL là `http://api/?` và param là `limit=10`, when được parse qua `buildExecuteRequest`, then URL cuối cùng là `http://api/?limit=10` (không phải `http://api/?&limit=10`).
- Given lệnh chạy test Vitest, when thực thi, then `VariableHighlighterIntegration.test.ts` và toàn bộ test của `buildExecuteRequest` đều passed xanh.

## Verification

**Commands:**
- `cd projects/frontend && bun run test` -- expected: Chạy thành công toàn bộ suite, bao gồm integration test mới và unit test sửa lại.


## Auto Run Result

- **Summary of implemented change:** Resolved deferred issues from Epic 4 by adding dirty checks in EnvModal, applying focus styling to EnvSelector caret, correctly trimming URLs before appending query params, and adding end-to-end integration tests for VariableHighlighter using the UrlBar component.
- **Files changed:**
  - `projects/frontend/src/components/environment/EnvModal.vue` — Added dirty-check before saving.
  - `projects/frontend/src/components/environment/EnvSelector.vue` — Applied peer-focus styling to caret.
  - `projects/frontend/src/utils/buildExecuteRequest.ts` — Fixed query parameter appending logic for dangling separators.
  - `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` — Added unit tests for URL trimming logic.
  - `projects/frontend/src/components/__tests__/EnvModal.test.ts` — Added test coverage for EnvModal save conditions.
  - `projects/frontend/src/components/__tests__/VariableHighlighterIntegration.test.ts` — Added integration tests for VariableHighlighter within UrlBar.
  - `projects/frontend/src/components/VariableHighlighter.vue` — Ensured text-variable-valid class is present.
- **Review findings breakdown:**
  - Patches applied: 6 (Intent divergence in integration test, overly aggressive regex, missing negative tests, missing fragment trim test, incomplete dirty check test).
  - Items deferred: 1 (envStore.save automatically triggers a full loadAll() refresh causing N+1).
  - Rejected: 3 (`v.key` or `v.value` null/undefined is impossible due to Go struct; trailing `?` with no params is valid URL; JSON.stringify mismatch impossible because Go always marshals `enabled` boolean).
- **Follow-up review recommended:** true
- **Verification performed:** Ran `bun run test` covering all components. 46 tests across 10 suites passed successfully.
- **Residual risks:** Since the URL appending logic handles many edge cases with dangling parameters and hash fragments, there is a small risk that undocumented URL formats might be parsed improperly, which would benefit from an additional review pass.

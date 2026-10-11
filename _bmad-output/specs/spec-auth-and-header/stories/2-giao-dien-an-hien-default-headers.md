---
title: 'Giao diện ẩn/hiện Default Headers'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '906ab88e0fc1b8dc89a35ba7551d7f40794cdcc4'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Chưa có cảnh báo thay đổi chưa lưu (dirty check) khi chuyển thư mục trong FolderEditor.
    evidence: |-
      Đây là hành vi từ trước của FolderEditor (Epic 2 đối với Variables).
    location: projects/frontend/src/components/FolderEditor.vue
    severity: low
---

<intent-contract>

## Intent

**Problem:** Khi mở tab Headers của một request, người dùng không thấy được các header kế thừa từ folder cha hay các header tự sinh (như Content-Type), hoặc nếu nhét chung vào danh sách chỉnh sửa thì làm rối giao diện và khó phân biệt header nào do request tự định nghĩa.

**Approach:** Thêm nút toggle trên tab Headers của RequestEditor để ẩn/hiện danh sách "Default headers" (bao gồm header kế thừa từ thư mục và header tự sinh như Content-Type khi body là json). Danh sách này hiển thị ở dạng chỉ đọc (read-only) với nhãn nguồn gốc và trạng thái ghi đè, mặc định ở trạng thái ẩn.

## Boundaries & Constraints

**Always:**
- Mặc định danh sách Default Headers phải ở trạng thái ẨN (hidden by default).
- Danh sách Default Headers hiển thị dưới dạng chỉ đọc (read-only), không cho phép chỉnh sửa trực tiếp.
- Phải hiển thị rõ nguồn gốc của header: "Từ thư mục" (kế thừa) hoặc "Tự động sinh" (auto-generated Content-Type).
- Nếu request con có header trùng key (case-insensitive) với default header, default header đó phải được đánh dấu rõ là "Đã bị ghi đè" (overridden).
- Khi toggle ẩn/hiện, không làm ảnh hưởng đến việc các default header này vẫn được gửi đi ngầm khi thực thi HTTP request.
- Tự động gắn `Content-Type: application/json` khi gửi request có body kiểu JSON nếu chưa có header Content-Type nào được định nghĩa.

**Never:**
- Không lưu trữ các default headers vào file JSON của request trên ổ đĩa (tránh làm phình và sai lệch dữ liệu lưu trữ).
- Không làm thay đổi layout hoặc tính năng nhập liệu của KvpEditor dành cho request headers thông thường.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default toggle state | Mở một request bất kỳ | Nút toggle hiển thị "Hiện header mặc định (N)", danh sách default headers bị ẩn | Không lỗi |
| Toggle to show | Nhấn nút toggle | Danh sách default headers mở ra hiển thị các hàng read-only | Không lỗi |
| Folder header present | Request nằm trong folder có `X-App: Hecto` | Default headers có dòng `X-App: Hecto`, nguồn "Thư mục", chưa bị ghi đè | Không lỗi |
| Auto Content-Type present | Request có `body.type = 'json'`, không có header Content-Type | Default headers có dòng `Content-Type: application/json`, nguồn "Tự sinh" | Không lỗi |
| Request overrides default header | Request có header `content-type: text/plain`, body là json | Default header `Content-Type` hiển thị trạng thái "Đã bị ghi đè" | Không lỗi |
| Zero default headers | Request ở root không có body json và không có folder cha | Nút toggle hiển thị "(0)" hoặc thông báo không có default header | Không lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/headers.ts` -- Bổ sung hàm `getDefaultHeaders` phân loại nguồn gốc và tính toán trạng thái ghi đè.
- `projects/frontend/src/utils/__tests__/headers.test.ts` -- Viết unit test cho `getDefaultHeaders`.
- `projects/frontend/src/components/DefaultHeadersTable.vue` -- Tạo component hiển thị danh sách read-only các default headers kèm toggle ẩn/hiện.
- `projects/frontend/src/components/__tests__/DefaultHeadersTable.test.ts` -- Unit test cho component `DefaultHeadersTable.vue`.
- `projects/frontend/src/components/RequestEditor.vue` -- Tích hợp `DefaultHeadersTable` vào tab Headers của RequestEditor.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Tự động bổ sung `Content-Type: application/json` khi body là json nếu chưa có trong headers.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Bổ sung test tự động sinh Content-Type khi gửi request JSON.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/headers.ts` -- Hiện thực hàm `getDefaultHeaders(req, inheritedHeaders)` -- Trả về danh sách default headers (từ folder hoặc tự sinh) kèm cờ `overridden`.
- `projects/frontend/src/utils/__tests__/headers.test.ts` -- Bổ sung unit test cho `getDefaultHeaders` -- Kiểm tra đầy đủ các kịch bản trong I/O Matrix.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Tự động đính kèm `Content-Type: application/json` khi `req.body.type === 'json'` nếu chưa có Content-Type -- Đảm bảo header tự sinh luôn được gửi đi ngầm.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Test đảm bảo `Content-Type` được gửi ngầm khi body là json -- Tránh lỗi gửi thiếu content-type.
- `projects/frontend/src/components/DefaultHeadersTable.vue` -- Tạo component hiển thị toggle button và bảng read-only của default headers -- Cung cấp UI sạch sẽ, không gây nhiễu cho người dùng.
- `projects/frontend/src/components/RequestEditor.vue` -- Nhúng `DefaultHeadersTable` phía trên KvpEditor trong tab Headers -- Hoàn thiện giao diện hiển thị cho người dùng.

**Acceptance Criteria:**
- Given một request có body JSON hoặc nằm trong folder có headers, when người dùng vào tab Headers, then thấy nút toggle hiển thị số lượng header mặc định và mặc định ở trạng thái ẩn.
- Given người dùng bấm vào toggle, when danh sách mở ra, then hiển thị chính xác các header mặc định dưới dạng read-only cùng nhãn nguồn gốc và trạng thái ghi đè nếu có.

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 15 findings — high 0, medium 4, low 11, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Unverified suppression of auto-generated Content-Type when explicitly disabled in request headers — Fixed: added verification test case in `buildExecuteRequest.test.ts`.
  - `[medium]` `[patch]` Missing verification for getDefaultHeaders when request headers are disabled — Fixed: added verification test cases in `headers.test.ts`.
  - `[medium]` `[patch]` `requestStore.ts` auto-injected Content-Type into `req.headers` violating non-persistence constraint — Fixed: stripped `_isAuto` headers on save and ignored them in `getDefaultHeaders`.
  - `[medium]` `[patch]` Inconsistency between `getDefaultHeaders` and `mergeHeaders` regarding disabled headers and suppression — Fixed: unified override/suppression key tracking across both helpers.
  - `[low]` `[patch]` PathNodes null/undefined in getInheritedHeaders — Fixed: added null/undefined checks.
  - `[low]` `[patch]` RequestHeaders or inheritedHeaders parameter passed as null in mergeHeaders/getDefaultHeaders — Fixed: added default array fallbacks.
  - `[low]` `[patch]` Items prop null in DefaultHeadersTable.vue — Fixed: fallback to empty array via computed property.
  - `[low]` `[patch]` Subfolder duplicate headers in getInheritedHeaders — Fixed: unified subfolder accumulation using mergeHeaders.
  - `[low]` `[patch]` Misleading static caption in DefaultHeadersTable.vue — Fixed: updated caption to accurate description.
  - `[low]` `[patch]` Invalid Tailwind class py-0.2 in DefaultHeadersTable.vue — Fixed: changed to py-0.5.
  - `[low]` `[patch]` Missing aria-controls attribute on toggle button in DefaultHeadersTable.vue — Fixed: added aria-controls and id.
  - `[low]` `[patch]` Potential runtime TypeError when req.body is undefined in buildExecuteRequest.ts — Fixed: added optional chaining `req.body?.type`.
  - `[low]` `[defer]` Lack of dirty state check on navigation in FolderEditor.vue — Pre-existing behavior from Epic 2.
  - `[low]` `[defer]` Untrimmed whitespace in FolderEditor keys — Harmless as runtime helpers trim keys.
  - `[low]` `[defer]` Micro-level badge wording ("Thư mục" vs "Từ thư mục") — Cosmetic choice for compact UI.

## Verification

**Commands:**
- `cd /home/dev/mdt/hecto-api/projects/frontend && source ~/.nvm/nvm.sh && nvm use && bun run test` -- expected: Toàn bộ unit tests Vitest pass.
- `cd /home/dev/mdt/hecto-api/projects/frontend && source ~/.nvm/nvm.sh && nvm use && bun run type-check` -- expected: TypeScript type check pass.

## Auto Run Result

**Status:** done

**Summary of implemented change:**
Đã hoàn thành Story 2: "Giao diện ẩn/hiện Default Headers". Tạo component `DefaultHeadersTable.vue` với nút toggle (mặc định ẩn), hiển thị các header kế thừa từ thư mục và header tự sinh `Content-Type: application/json` dưới dạng chỉ đọc (read-only), tự động gắn nhãn nguồn gốc và phát hiện trạng thái ghi đè khi request định nghĩa header trùng key. Tự động đính kèm `Content-Type` ngầm khi gửi request JSON.

**Files changed:**
- `projects/frontend/src/utils/headers.ts` — Thêm hàm `getDefaultHeaders` và kiểu `DefaultHeaderItem`.
- `projects/frontend/src/utils/__tests__/headers.test.ts` — Bổ sung 8 unit tests cho `getDefaultHeaders`.
- `projects/frontend/src/components/DefaultHeadersTable.vue` — Component UI toggle và danh sách read-only cho default headers.
- `projects/frontend/src/components/__tests__/DefaultHeadersTable.test.ts` — 4 component unit tests kiểm tra toggle, render badge và override styling.
- `projects/frontend/src/components/RequestEditor.vue` — Nhúng `DefaultHeadersTable` vào tab Headers.
- `projects/frontend/src/utils/buildExecuteRequest.ts` — Tự động gắn `Content-Type: application/json` cho request có body JSON.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` — Thêm tests cho auto Content-Type và suppression khi bị disabled.
- `projects/frontend/src/stores/requestStore.ts` — Lọc bỏ `_isAuto` headers khi lưu request xuống đĩa để đảm bảo non-persistence constraint.

**Review findings breakdown:**
- 12 patches applied (null/undefined safety, suppression consistency, non-persistence fix, styling & a11y, duplicate folder headers, test coverage).
- 3 deferred (FolderEditor dirty check pre-existing, untrimmed whitespace harmless, cosmetic badge wording).

**Verification performed:**
- `bun run test` passed (12 test files, 77 tests passed).
- `bun run type-check` passed with 0 errors.
- `go test ./...` passed (0.138s).

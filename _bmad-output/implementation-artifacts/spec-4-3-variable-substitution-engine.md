---
title: 'Story 4.3: Variable Substitution Engine'
type: 'feature'
created: '2026-10-07'
status: 'done'
baseline_revision: '8594489387d6421e9a093a4135904563d28d5dd1'
review_loop_iteration: 0
followup_review_recommended: false
context: ['/home/dev/mdt/hecto-api/_bmad-output/implementation-artifacts/epic-4-context.md']
warnings: []
deferred:
  - summary: >-
      URL query string concatenation can create malformed URLs
    evidence: |-
      Pre-existing issue where trailing ? or & in the base URL isn't trimmed before appending query parameters.
    location: >-
      projects/frontend/src/utils/buildExecuteRequest.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Request hiện tại chỉ có thể sử dụng các giá trị cứng (hardcoded), không thể dùng chung cho nhiều môi trường khác nhau (như đổi `baseUrl` hay `token`) mà không phải sửa trực tiếp cấu hình request.

**Approach:** Xây dựng một utility module `utils/variables.ts` cung cấp hai hàm: `resolveVariables` để thay thế `{{key}}` thành giá trị thực, và `parseVariables` để phân tích chuỗi thành các token (text, resolved, missing) phục vụ highlight. Tích hợp `resolveVariables` vào `buildExecuteRequest` trong send flow để thay thế biến trước khi gửi đi, đảm bảo thay đổi chỉ diễn ra trên bộ nhớ lúc gửi.

## Boundaries & Constraints

**Always:**
- Regex tìm biến dùng pattern `/\{\{([^}]+)\}\}/g` và trim whitespace ở đầu/cuối của key (ví dụ `{{ token }}` vẫn tính là key `token`).
- Biến không có trong `variablesMap` (missing) phải được giữ nguyên dạng `{{key}}` ở kết quả trả về của `resolveVariables`.
- Giải quyết biến (resolve) chỉ thực hiện một lần (single-pass): không resolve các biến lồng nhau, nội dung giá trị từ biến không bị tìm và thay thế tiếp.
- `buildExecuteRequest` thay thế biến ở các vị trí: URL, Header Values, Query Param Keys, Query Param Values, và Body content. (Header Keys KHÔNG được thay thế).
- Param key/value phải được URL-encode *sau khi* đã resolve biến.
- `parseVariables` trả về danh sách các segment `{ type: 'text' | 'resolved' | 'missing', value: string, original?: string }`.

**Never:**
- Không ghi đè hay thay đổi object request ban đầu (`Request` từ `requestStore`); việc thay thế chỉ diễn ra trong quá trình sinh ra `ExecuteRequest` để gửi.
- Không substitute cho Header Keys (do theo phân tích và chỉ định từ acceptance criteria).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Biến hợp lệ | Input: `{{host}}/api`, vars: `host=localhost` | Output: `localhost/api` | No error expected |
| Key chứa khoảng trắng | Input: `{{ host }}`, vars: `host=localhost` | Output: `localhost` | No error expected |
| Biến bị thiếu (missing) | Input: `{{token}}`, vars: rỗng | Output: `{{token}}` | No error expected |
| Biến lồng nhau | Input: `{{msg}}`, vars: `msg={{nested}}` | Output: `{{nested}}` (không tiếp tục resolve) | No error expected |
| Nhiều biến trong 1 chuỗi | Input: `{{host}}:{{port}}`, vars: `host=db, port=5432` | Output: `db:5432` | No error expected |
| Parsing biến | Input: `A {{ b }} C`, vars: `b=1` | Output segments: text(A ), resolved(1, orig:{{ b }}), text( C) | No error expected |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/variables.ts` -- (Tạo mới) Chứa `resolveVariables` và `parseVariables`.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Nơi gắn hàm resolve variables vào các thành phần của request (URL, params, headers value, body) trước khi tính toán URL query string cuối cùng.
- `projects/frontend/src/stores/responseStore.ts` -- Nơi truyền `variablesMap` từ `environmentStore` vào `buildExecuteRequest`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/variables.ts` -- Tạo interface `VariableSegment` và các hàm `parseVariables` và `resolveVariables`. Sử dụng `Map<string, string>` cho `vars`.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Sửa hàm `buildExecuteRequest(req: Request, vars: Map<string, string>)`. Áp dụng `resolveVariables` lên URL, `p.key` và `p.value` cho query params, `h.value` cho headers (giữ nguyên `h.key`), và `req.body.content` (nếu type là text hoặc json). Sau đó thực hiện việc nối params vào URL và URL-encode.
- `projects/frontend/src/stores/responseStore.ts` -- Import `useEnvironmentStore` và truyền `envStore.variablesMap` làm tham số thứ hai cho `buildExecuteRequest(req, envStore.variablesMap)`.
- `projects/frontend/src/utils/__tests__/variables.test.ts` -- (Tạo mới) Viết unit test cho `resolveVariables` và `parseVariables`.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Cập nhật/thêm test case để kiểm tra request được build ra đã xử lý substitution và encode đúng chuẩn.

**Acceptance Criteria:**
- Given một request có chứa chuỗi `{{token}}` ở Header Value, when user gửi request đi với môi trường active có biến `token="123"`, then request thực sự gọi đi sẽ có Header là "123".
- Given request có chứa chuỗi `{{host}}` ở URL, when không có môi trường active, then request gọi đi có URL là nguyên bản `{{host}}`.
- Given request chứa biến ở Header Key, when gửi request, then biến đó KHÔNG được thay thế (giữ nguyên chuỗi dạng `{{...}}`).

## Spec Change Log

## Review Triage Log

### 2026-10-07 — Review pass
- verdicts: 11 findings — high 0, medium 5, low 2, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` Shared mutable global regex state (B1) — Replaced global RegExp with local instantiated patterns inside the functions.
  - `[medium]` `[patch]` Query parameters are filtered before variable resolution (B2) — Moved the filter to run after keys and values are resolved.
  - `[false]` `[reject]` Return type violation for falsy inputs (B3) — The input type is `string`, so falsy values are only the empty string `''`. Returning `''` satisfies the `string` return type.
  - `[low]` `[defer]` URL query string concatenation can create malformed URLs (B4) — Pre-existing issue where trailing `?` or `&` in the base URL isn't trimmed.
  - `[false]` `[reject]` Inconsistent `original` field in `VariableSegment` (B5) — The UI consumers can simply use `value` for missing variables. It's an intended interface.
  - `[medium]` `[patch]` Missing integration verification for environment variables (VG1) — Added `responseStore.test.ts` to assert variables are passed to the request builder.
  - `[false]` `[reject]` resolveVariables produces invalid JSON without escaping (VG2) — Raw string replacement is intended behavior. JSON escaping is outside the scope of raw variable substitution.
  - `[medium]` `[patch]` Filtering of empty query parameter keys happens before substitution (VG3) — Moved the filter to run after keys and values are resolved.
  - `[false]` `[reject]` Falsy non-string input type violation (EC1) — The input type is `string`, so falsy values are only the empty string `''`.
  - `[medium]` `[patch]` Resolved param key becomes empty (EC2) — Moved the filter to run after keys and values are resolved.
  - `[medium]` `[patch]` Missing automated verification for store integration (IA1) — Added `responseStore.test.ts` to assert variables are passed.

## Verification

**Commands:**
- `cd projects/frontend && bun run test utils/__tests__/variables.test.ts` -- expected: Tất cả test liên quan đến substitution đều pass.
- `cd projects/frontend && bun run test utils/__tests__/buildExecuteRequest.test.ts` -- expected: Unit test của request builder cập nhật và pass.

## Auto Run Result

- **Summary of implemented change:** Built the Variable Substitution Engine with `resolveVariables` and `parseVariables`. Integrated it into `buildExecuteRequest` to resolve variables in URL, query parameters, header values, and body on request dispatch, using `variablesMap` from the active environment. Header keys are explicitly untouched.
- **Files changed:**
  - `projects/frontend/src/utils/variables.ts`: Created substitution utility functions.
  - `projects/frontend/src/utils/buildExecuteRequest.ts`: Added substitution logic before URL and request assembly.
  - `projects/frontend/src/stores/responseStore.ts`: Passed `environmentStore.variablesMap` to the request builder on send.
  - `projects/frontend/src/utils/__tests__/variables.test.ts`: Added unit tests for parsing and resolving variables.
  - `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts`: Added tests covering substitution scenarios in request builder.
  - `projects/frontend/src/stores/__tests__/responseStore.test.ts`: Added integration tests verifying `variablesMap` wiring in `send`.
- **Review findings breakdown:** 6 patches applied (deduplicated to 3 fixes), 1 item deferred, and 4 findings rejected.
- **Follow-up review recommended:** false
- **Verification performed:** Executed `bun test` for `variables.test.ts`, `buildExecuteRequest.test.ts`, and `responseStore.test.ts`. All 17 tests passed.
- **Residual risks:** No end-to-end frontend or browser UI tests are implemented, though store integration is verified. Pre-existing URL fragment handling quirks were deferred.

---
title: 'Đồng bộ hai chiều URL Bar và Query Params'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_commit: '068bb10fd4818484bf6c02cb8bcd36ff430567b7'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng gặp khó khăn và bất tiện khi phải thao tác riêng rẽ giữa thanh URL bar và bảng cấu hình Query Params trong RequestEditor; các thay đổi ở bảng Params không phản ánh lên URL và ngược lại khi gõ/paste URL có query string thì Params không tự parse, dễ gây lệch dữ liệu hoặc làm hỏng cú pháp biến môi trường `{{...}}`.

**Approach:** Xây dựng tiện ích phân tích/định dạng URL (`urlParams.ts`) bảo toàn nguyên vẹn cú pháp biến môi trường `{{...}}` và composable đồng bộ hai chiều thời gian thực (`useUrlParamsSync.ts`) có cơ chế re-entrancy guard chống lặp vô tận, bảo toàn vị trí con trỏ nhập liệu và giữ nguyên các query param bị vô hiệu hóa (`enabled: false`).

## Boundaries & Constraints

**Always:**
- Bảo toàn 100% cú pháp biến môi trường `{{...}}` ở cả key và value, không được để URL-encode biến thành `%7B%7B...%7D%7D`.
- Bảo toàn nguyên vẹn port, path và hash fragment `#...` khi cập nhật query string.
- Xử lý chính xác query param không có giá trị (`?flag&key=val`), parse thành `value: ''` và khi format xuất ra `flag` không kèm `=`.
- Params bị tắt (`enabled: false`) trong bảng cấu hình không được đưa lên URL bar, nhưng vẫn được lưu trữ và giữ nguyên trạng thái trong store khi người dùng chỉnh sửa URL bar.
- Có cơ chế guard chống re-entrancy / infinite loop giữa hai chiều cập nhật để không làm giật lag hay mất focus/vị trí con trỏ của người dùng.
- Viết unit test đầy đủ với Vitest cho các utility và composable/component.

**Never:**
- Không dùng `new URL()` hoặc `encodeURIComponent()` thuần túy trực tiếp trên chuỗi chứa `{{...}}` vì sẽ gây lỗi cú pháp hoặc escape sai.
- Không xóa bỏ hoặc làm mất các params đang bị uncheck (`enabled: false`) khi người dùng chỉnh sửa URL trên thanh URL bar.
- Không kích hoạt sự kiện vòng lặp vô tận (re-entrancy loop) giữa `req.url` và `req.params`.
- Không tự ý commit hoặc push Git mà không có xác nhận rõ ràng từ người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Params to URL (Thêm/Sửa) | Thêm param `key: "search"`, `value: "hello world"`, `enabled: true` | URL bar cập nhật query `?search=hello%20world` | Bỏ qua param có key rỗng |
| URL to Params (Nhập URL) | Gõ URL `https://api.com/items?page=1&limit=10` | Tab Params hiển thị 2 dòng: `page=1`, `limit=10` (đều `enabled: true`) | Parse an toàn, không crash khi URL malformed |
| Toggle Param | Bỏ check param `limit=10` | URL bar cập nhật thành `https://api.com/items?page=1`; param `limit` vẫn nằm trong store với `enabled: false` | N/A |
| Preserve Disabled Params | Store có `debug=true` (`enabled: false`), gõ thêm `&sort=asc` trên URL bar | `req.params` có `page=1`, `sort=asc` (`enabled: true`) và `debug=true` (`enabled: false`) | Giữ nguyên param bị uncheck |
| Variable syntax in key/val | Param `{{my_key}}` = `{{my_val}}` & text | URL bar hiển thị `?{{my_key}}={{my_val}}%20%26%20text`, không bị escape `{` thành `%7B` | Regex bảo toàn khối `{{...}}` |
| URL with Port, Path, Hash | URL `http://localhost:3000/api/v1?a=1#section` -> sửa param `a=2` | URL bar thành `http://localhost:3000/api/v1?a=2#section` (port, path, hash nguyên vẹn) | Tách đúng base, query và hash |
| Query param không giá trị | URL `https://api.com?flag&key=val` | Tab Params hiển thị dòng 1: key `flag`, value `""`; dòng 2: key `key`, value `val` | Format lại thành `?flag&key=val` |
| Xóa hết Params | Xóa hết dòng hoặc uncheck hết trong Params | URL bar bỏ toàn bộ `?` và query string, chỉ giữ base URL và hash (nếu có) | N/A |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/utils/urlParams.ts` -- Tiện ích phân tích, encode, decode và format URL/query params bảo toàn biến `{{...}}`.
- `projects/frontend/src/composables/useUrlParamsSync.ts` -- Composable quản lý đồng bộ hai chiều giữa `req.url` và `req.params` với re-entrancy guard.
- `projects/frontend/src/components/RequestEditor.vue` -- Tích hợp `useUrlParamsSync` cho request hiện tại.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Cập nhật xử lý query params để tránh duplicate khi `req.url` đã chứa query params đồng bộ từ store.
- `projects/frontend/src/utils/__tests__/urlParams.test.ts` -- Unit tests cho các hàm xử lý URL và query params.
- `projects/frontend/src/composables/__tests__/useUrlParamsSync.test.ts` -- Unit tests cho composable đồng bộ hai chiều và re-entrancy guard.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/utils/urlParams.ts` -- Các hàm encodeQueryComponent, decodeQueryComponent, parseUrl, formatUrl, parseQueryParams, buildQueryString, updateUrlWithParams, reconcileParamsFromUrl.
- [x] `projects/frontend/src/utils/__tests__/urlParams.test.ts` -- Viết unit test cho các tiện ích parse/format URL và query params với Vitest.
- [x] `projects/frontend/src/composables/useUrlParamsSync.ts` -- Composable đồng bộ 2 chiều thời gian thực giữa `req.url` và `req.params` với guard chống lặp vô tận.
- [x] `projects/frontend/src/composables/__tests__/useUrlParamsSync.test.ts` -- Unit test cho composable đồng bộ hai chiều và re-entrancy guard.
- [x] `projects/frontend/src/components/RequestEditor.vue` -- Gọi `useUrlParamsSync` để kích hoạt đồng bộ 2 chiều trong trình soạn thảo request.
- [x] `projects/frontend/src/utils/buildExecuteRequest.ts` -- Điều chỉnh logic ghép params để không bị trùng lặp khi `req.url` đã mang sẵn query params được đồng bộ.
- [x] `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Bổ sung test case xác nhận không bị duplicate query params khi url đã đồng bộ.

**Acceptance Criteria:**
- Given a request with URL `https://api.example.com/items`, when user adds query param `search` = `hello world`, then URL bar updates to `https://api.example.com/items?search=hello%20world`.
- Given a query param `{{param_key}}` = `{{param_val}}`, when formatted to URL, then URL contains `{{param_key}}={{param_val}}` without `%7B%7B`.
- Given URL `https://api.example.com?flag&key=val`, when parsed, then param `flag` has value `''` and enabled `true`, and formatting back outputs `?flag&key=val`.
- Given a disabled param `debug` = `true` in Params, when user edits URL bar, then `debug` remains disabled in Params and does not appear in URL bar.
- Given continuous user typing in URL bar or Params table, then no infinite update loops occur and cursor focus/position is preserved.

## Implementation Notes

- Đã tạo `projects/frontend/src/utils/urlParams.ts` với đầy đủ các hàm xử lý URL và query string bảo toàn tuyệt đối biến môi trường `{{...}}`:
  - `splitPreservingVars`: phân tách delimiter (`?`, `#`, `&`, `=`) có tính đến độ sâu khối `{{...}}`.
  - `encodeQueryComponent` và `decodeQueryComponent`: chỉ encode/decode các ký tự bên ngoài khối biến môi trường `{{...}}`.
  - `reconcileParamsFromUrl`: phân tích query params từ URL và dung hòa với params hiện có trong store, bảo toàn nguyên vẹn các param bị tắt (`enabled: false`).
  - `buildQueryString`: định dạng query string, hỗ trợ param không giá trị (cờ/flag) không kèm dấu `=`.
  - `updateUrlWithParams`: cập nhật query string cho URL, giữ nguyên port, base path và hash fragment `#...`.
- Đã tạo composable `projects/frontend/src/composables/useUrlParamsSync.ts` quản lý đồng bộ hai chiều thời gian thực:
  - Sử dụng cờ `isSyncing` kết hợp kiểm tra đẳng trị sâu (`areParamsEqual`, `newUrl === currentUrl`) để ngăn chặn triệt để hiện tượng re-entrancy loop / infinite recursion.
  - Tránh gán lại URL khi đang gõ trên thanh URL bar để bảo toàn vị trí con trỏ nhập liệu (caret position).
  - Tự động reset trạng thái sync khi người dùng chuyển sang request khác (`req.value.id` thay đổi).
- Tích hợp `useUrlParamsSync` vào `projects/frontend/src/components/RequestEditor.vue`.
- Cập nhật `projects/frontend/src/components/KvpEditor.vue` để bọc `VariableHighlighter` cho cả cột Key (bao gồm cả dòng dữ liệu thực và dòng phantom), đồng bộ trải nghiệm highlight biến `{{...}}` giữa cột Key, cột Value và thanh URL Bar.
- Viết 31 unit tests cho `urlParams.test.ts`, 11 unit tests cho `useUrlParamsSync.test.ts`, 5 unit tests bổ sung cho `buildExecuteRequest.test.ts` và 3 unit tests cho `KvpEditor.test.ts`. Toàn bộ 251 unit tests Vitest, type-check và Go tests đều pass 100%.

## Spec Change Log

## Review Triage Log

| ID | Finding | Verdict | Route | Evidence & Resolution |
|---|---|---|---|---|
| F1 | Blind-Hunter: Typing `=` in URL bar causes premature stripping and caret disruption | false | - | Khi gõ `=`, `areParamsEqual` khớp với `lastSyncedParams`, watcher params không chạy ghi đè ngược lại URL nên dấu `=` không bị xóa. |
| F2 | Blind-Hunter: Race condition during `isSyncing` nextTick window drops keystrokes | false | - | Sự kiện bàn phím của người dùng là macrotask, luôn được browser thực thi sau khi hàng đợi microtask (`nextTick`) đã flush xong. |
| F3 | Blind-Hunter: Loss of disabled (`enabled: false`) params with duplicate keys in `reconcileParamsFromUrl` | medium | patch | `reconcileParamsFromUrl` từng dùng `parsedKeys.has(item.key)` bỏ qua params disabled nếu key trùng. Đã sửa: giữ nguyên toàn bộ disabled params theo vị trí. |
| F4 | Blind-Hunter: Literal `+` in query params is corrupted into spaces in `decodeQueryComponent` | medium | patch | `safeDecode` từng chuyển `+` thành khoảng trắng. Đã sửa: giữ nguyên literal `+` (chỉ `%20` là space). |
| F5 | Blind-Hunter: `buildExecuteRequest.ts` duplicates params when variables resolve to delimiters | medium | patch | Đã sửa: kiểm tra tham số bằng đối chiếu `JSON.stringify([ep.key, ep.value])` và tách hash fragment an toàn với `splitPreservingVars`. |
| F6 | Blind-Hunter: Conflicting values & Map key collision `${ep.key}=${ep.value}` in `buildExecuteRequest.ts` | medium | patch | Nối chuỗi `${ep.key}=${ep.value}` gây va chạm khi key/val chứa `=`. Đã sửa sang `JSON.stringify([ep.key, ep.value])`. |
| F7 | Blind-Hunter: Naïve hash fragment extraction via `url.indexOf('#')` in `buildExecuteRequest.ts` | medium | patch | `url.indexOf('#')` không an toàn nếu `#` nằm trong template variable. Đã sửa sang `splitPreservingVars(url, '#', 2)`. |
| F8 | Blind-Hunter: Missing initial synchronization on request mount or switch in `useUrlParamsSync.ts` | high | patch | Khi mở/switch request có query params trong URL nhưng `params` rỗng, params không được parse. Đã sửa: bổ sung `syncInitialState()` trên mount và switch. |
| F9 | Blind-Hunter: `VariableHighlighter` in Key column lacks `singleLine` | low | patch | Đã bổ sung `:single-line="true"` vào `VariableHighlighter` của cột Key và phantom row trong `KvpEditor.vue`. |
| F10 | Blind-Hunter: `reconcileParamsFromUrl` strips custom properties like `_isAuto` on `KVPair` | low | patch | Đã sửa `reconcileParamsFromUrl` để merge `{ ...item, ...parsedList[parsedIdx] }`, bảo toàn metadata mở rộng. |
| F11 | Blind-Hunter: Stale DOM refs in `KvpEditor.vue` ref arrays | low | defer | Vấn đề tồn tại sẵn từ trước Story 1 (không do Story 1 gây ra). Đã ghi vào `deferred-work.md`. |
| F12 | Blind-Hunter: Unrelated modification to `projects/.go-version` | low | patch | File `.go-version` bị commit nhầm `go1.27.1`. Đã revert về `1.27.1`. |
| F13 | Edge-Case-Hunter: Delimiter collision when param key contains `=` in `buildExecuteRequest.ts` | medium | patch | Cùng root cause với F6; đã sửa bằng `JSON.stringify([ep.key, ep.value])`. |
| F14 | Edge-Case-Hunter: Missing `formatUrl` export in `urlParams.ts` | low | patch | Đã export alias `export const formatUrl = updateUrlWithParams;` trong `urlParams.ts`. |
| F15 | Verification-Gap: Weak test in `useUrlParamsSync.test.ts` masks missing initial load / switch sync | high | patch | Đã thêm 2 test cases mới kiểm thử mount và switch request có query params với `params: []` trong `useUrlParamsSync.test.ts`. |
| F16 | Verification-Gap: Missing test for flag query parameters with empty value in `buildExecuteRequest.test.ts` | medium | patch | Đã thêm test case kiểm thử param flag (`value: ''`) serialize thành `?flag` và deduplicate trong `buildExecuteRequest.test.ts`. |
| F17 | Verification-Gap: Other - Silent loss of pre-existing URL query params on empty `params` | high | patch | Cùng root cause với F8 và F15; đã giải quyết triệt để. |
| F18 | Verification-Gap: Other - Dropping disabled params with duplicate keys in `reconcileParamsFromUrl` | medium | patch | Cùng root cause với F3; đã giải quyết triệt để. |
| F19 | Verification-Gap: Other - Delimiter collision in `buildExecuteRequest.ts` Map key | medium | patch | Cùng root cause với F6 và F13; đã giải quyết triệt để. |

## Design Notes

- Sử dụng cơ chế phân tách URL bằng state-machine hoặc index scan để không bị nhầm lẫn giữa ký tự phân cách trong biến môi trường `{{...}}` và ký tự chuẩn của URL (`?`, `&`, `=`, `#`).
- Guard lặp vô tận dùng flag `isSyncing` kết hợp kiểm tra đẳng trị dữ liệu (`areParamsEqual`, `newUrl === currentUrl`) trước khi gán nhằm ngăn triệt để re-render vòng lặp và tránh làm mất caret position trong textarea.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- Tất cả unit test Vitest pass 100%
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- Type check không có lỗi
- `cd projects && go test ./...` -- Go test backend pass

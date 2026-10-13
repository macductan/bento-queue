---
title: 'Xuất lệnh cURL (Copy as cURL)'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_commit: 'f0d476805a82726b4c73921cf0f671242c16e7b0'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng cần trích xuất nhanh cấu hình request hiện tại thành lệnh cURL hoàn chỉnh để chia sẻ cho đồng nghiệp hoặc debug trực tiếp trong terminal Bash/Zsh mà không phải sao chép thủ công từng header, URL, query param hay body payload.

**Approach:** Xây dựng tiện ích sinh chuỗi lệnh cURL chuẩn POSIX shell (`curl.ts`) tái sử dụng logic phân giải auth/headers/params/body của `buildExecuteRequest.ts` với cơ chế escape nháy đơn an toàn (`'\''`), đồng thời bổ sung nút thao tác "Copy as cURL" trên thanh `UrlBar` sao chép vào clipboard và hiển thị Toast thông báo.

## Boundaries & Constraints

**Always:**
- Lệnh cURL sinh ra phải chuẩn POSIX/Bash, bao gồm đầy đủ cờ HTTP Method (`-X POST`, `-X GET`, `-X PUT`, v.v.).
- URL, từng Header (`-H '...'`) và Body payload (`--data-raw '...'` hoặc `--data '...'`) phải được bao bọc trong dấu nháy đơn `'...'` và escape an toàn mọi ký tự nháy đơn bên trong theo chuẩn shell: `'` chuyển thành `'\''`.
- Tự động phân giải (resolve) biến môi trường (`{{...}}`) cho URL, Headers, Query Params và Body theo Environment đang kích hoạt và biến kế thừa từ các thư mục cha.
- Bao gồm đầy đủ tất cả HTTP Headers đang bật: headers do người dùng định nghĩa, headers kế thừa từ thư mục cha, header xác thực (Bearer / Basic / API Key), và tự động bổ sung `Content-Type: application/json` khi có body JSON (trừ khi người dùng ghi đè hoặc vô hiệu hóa).
- Ghép đầy đủ query params đang bật (từ bảng params và auth query params) vào URL mà không làm trùng lặp các query param đã có sẵn trên URL bar.
- Khi người dùng bấm nút trên giao diện: sao chép vào clipboard qua `navigator.clipboard.writeText` (có fallback an toàn) và hiển thị Toast "Đã sao chép cURL vào clipboard". Nếu URL trống thì hiển thị Toast cảnh báo "Vui lòng nhập URL".
- Viết unit tests toàn diện với Vitest cho tiện ích sinh lệnh cURL và component UrlBar.

**Never:**
- Không xuất các headers hoặc query params đang bị tắt (`enabled: false`).
- Không để lộ cú pháp biến `{{...}}` chưa được phân giải nếu biến đó tồn tại trong môi trường.
- Không sinh cờ body (`--data-raw`) khi `body.type` là `none` hoặc request không có nội dung body.
- Không dùng escape kiểu Windows cmd/PowerShell (như `^"` hay `"\""`); chuẩn shell đầu ra là POSIX Bash/Zsh.
- Không tự ý commit hoặc push Git mà không có xác nhận từ người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GET không body | Method `GET`, URL `https://api.com/users` | `curl -X GET 'https://api.com/users'` | URL rỗng -> Báo toast "Vui lòng nhập URL" |
| POST JSON có nháy đơn | Method `POST`, Body JSON `{"name":"O'Reilly"}` | `curl -X POST 'https://api.com' -H 'Content-Type: application/json' --data-raw '{"name":"O'\''Reilly"}'` | Escape `'` thành `'\''` chuẩn POSIX |
| Auth Bearer Token | Auth Bearer `my-token-123`, URL `https://api.com` | `curl -X GET 'https://api.com' -H 'Authorization: Bearer my-token-123'` | N/A |
| Auth Basic Auth | Auth Basic `user` / `pass` | `curl -X GET 'https://api.com' -H 'Authorization: Basic dXNlcjpwYXNz'` | Mã hóa base64 chuẩn |
| Auth API Key (Header) | Key `X-API-Key`, Value `secret` | `curl -X GET 'https://api.com' -H 'X-API-Key: secret'` | N/A |
| Auth API Key (Query Param) | Key `api_key`, Value `xyz` | `curl -X GET 'https://api.com?api_key=xyz'` | Nối vào URL an toàn |
| Query Params + Disabled Param | Param `page=1` (enabled), `debug=true` (disabled) | URL có `?page=1`, không xuất hiện `debug=true` | Bỏ qua param disabled |
| Inherited Headers + Var | Folder có header `X-App-Env: {{env}}`, env `prod` | `-H 'X-App-Env: prod'` được đưa vào lệnh cURL | Phân giải biến đúng scope |
| URL có query params và hash | URL `https://api.com/test?a=1#section`, param `b=2` | URL trong cURL thành `'https://api.com/test?a=1&b=2#section'` | Giữ nguyên hash `#...` ở cuối |
| Click Copy button trên UrlBar | User click icon/nút "cURL" trên UrlBar | Chuỗi cURL được ghi vào clipboard + Toast "Đã sao chép cURL vào clipboard" | Bắt lỗi clipboard và báo toast thích hợp |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/utils/curl.ts` -- Tiện ích `escapeShell` và `generateCurlCommand(request, options)` sinh chuỗi lệnh cURL chuẩn POSIX/Bash từ Request, Environment, Inherited Headers và Path Nodes.
- `projects/frontend/src/utils/__tests__/curl.test.ts` -- Unit tests cho tiện ích `generateCurlCommand` và `escapeShell` với đầy đủ các kịch bản I/O.
- `projects/frontend/src/components/UrlBar.vue` -- Tích hợp nút / icon thao tác "Copy as cURL" cạnh nút Gửi, gọi `generateCurlCommand`, ghi vào clipboard và kích hoạt Toast qua `uiStore.showToast`.
- `projects/frontend/src/components/__tests__/UrlBar.test.ts` -- Unit tests cho giao diện `UrlBar.vue` bao gồm chức năng sao chép cURL và hiển thị Toast.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/utils/curl.ts` -- Viết tiện ích `escapeShell` và `generateCurlCommand` hỗ trợ cấu hình linh hoạt (Request, Environment Map / Object, Inherited Headers, Path Nodes, single-line / multiline).
- [x] `projects/frontend/src/utils/__tests__/curl.test.ts` -- Viết unit test toàn diện cho `curl.ts`: GET không body, POST JSON có nháy đơn, Auth (Bearer, Basic, API Key header/param), Query Params, Headers kế thừa và biến môi trường.
- [x] `projects/frontend/src/components/UrlBar.vue` -- Bổ sung nút "cURL" (icon terminal/code + nhãn) cạnh nút Send, xử lý sự kiện click sao chép vào clipboard và gọi Toast.
- [x] `projects/frontend/src/components/__tests__/UrlBar.test.ts` -- Viết unit test cho component `UrlBar.vue` kiểm thử tương tác Copy as cURL và hiển thị thông báo.

**Acceptance Criteria:**
- Given a request with GET method and URL `https://api.example.com/items?q=test`, when user generates cURL, then output is `curl -X GET 'https://api.example.com/items?q=test'`.
- Given a request with POST method, JSON body `{"title": "O'Reilly's Book"}`, when user generates cURL, then single quotes in body are escaped as `'\''` and `Content-Type: application/json` is included.
- Given a request inheriting Bearer Auth and folder headers, when user generates cURL, then resolved `Authorization` and inherited headers are present in the output.
- Given a user in RequestEditor with a valid URL, when clicking the "Copy as cURL" button, then the cURL string is written to clipboard and a toast "Đã sao chép cURL vào clipboard" is displayed.
- Given an empty URL in RequestEditor, when clicking "Copy as cURL", then a warning toast "Vui lòng nhập URL" is displayed without copying invalid command.

## Implementation Notes

- Đã tạo `projects/frontend/src/utils/curl.ts`:
  - `escapeShell(str)`: bao bọc chuỗi trong dấu nháy đơn `'...'` và thay thế ký tự nháy đơn bằng `'\''` chuẩn POSIX shell (tương thích tuyệt đối trên Bash, Zsh, Dash).
  - `generateCurlCommand(request, options)`: tái sử dụng `buildExecuteRequest(req, vars, inheritedHeaders, pathNodes)` để phân giải toàn diện và nhất quán URL, headers (kế thừa + auth + request + auto Content-Type), query params (auth query + request params) và body payload. Hỗ trợ truyền environment linh hoạt (Map, object có `variables`, Record), hỗ trợ định dạng single-line và multiline, cùng tuỳ chọn `dataFlag` (`--data-raw`, `--data`, `-d`).
- Đã cập nhật `projects/frontend/src/components/UrlBar.vue`:
  - Thêm nút `copy-curl-btn` với icon terminal và nhãn "cURL" cạnh nút Gửi/Hủy trên thanh UrlBar.
  - Khi click: kiểm tra URL, phân giải folder path và environment variables, sinh lệnh cURL và sao chép vào clipboard qua `navigator.clipboard.writeText` (kèm fallback an toàn `document.execCommand`), sau đó hiển thị Toast "Đã sao chép cURL vào clipboard". Nếu URL rỗng, hiển thị cảnh báo Toast "Vui lòng nhập URL".
- Đã viết 18 unit tests trong `projects/frontend/src/utils/__tests__/curl.test.ts` phủ toàn bộ các trường hợp trong I/O Matrix và các kịch bản thực tế.
- Đã viết 4 unit tests trong `projects/frontend/src/components/__tests__/UrlBar.test.ts` kiểm thử đầy đủ các hành vi UI và clipboard.
- Tất cả 273 tests trong toàn bộ frontend, `bun run type-check` và Go tests `go test ./...` đều pass 100%.

## Spec Change Log

## Review Triage Log

| ID | Finding | Verdict | Route | Evidence & Resolution |
|---|---|---|---|---|
| F1 | `edge-case-hunter` & `blind-hunter`: Thiếu thuộc tính `'environment'` khi nhận diện options trong `curl.ts` | high | patch | Điều kiện check `envOrOptions` thiếu `'environment'`, dẫn đến rơi xuống nhánh `Record<string, string>` và bỏ sót biến môi trường. Đã bổ sung `'environment' in envOrOptions` và test case tương ứng. |
| F2 | `blind-hunter`: Lỗi null safety trong `extractVarsFromEnv` (`curl.ts`) | medium | patch | `typeof null === 'object'` gây lỗi khi truyền `null`. Đã thêm guard `if (!env) return map;` và test case cho `null`/`undefined`. |
| F3 | `edge-case-hunter`: Giá trị biến folder undefined và key có khoảng trắng (`curl.ts`) | low | patch | Đã thêm fallback `v.value \|\| ''` và `v.key?.trim()` khi nạp biến môi trường và biến folder. |
| F4 | `blind-hunter`: Tự động suy diễn `inheritedHeaders` từ `pathNodes` khi chưa truyền (`curl.ts`) | medium | patch | Nếu truyền `pathNodes` mà không truyền `inheritedHeaders`, `curl.ts` tự động gọi `getInheritedHeaders(pathNodes)` để đảm bảo nhất quán. |
| F5 | `verification-gap`, `edge-case-hunter`, `blind-hunter`: Fallback `execCommand` trong `UrlBar.vue` bị bỏ qua khi `writeText` throw lỗi | medium | patch | Tách hàm `copyToClipboard` độc lập: khi `writeText` reject thì lập tức fallback sang `document.execCommand('copy')` và kiểm tra kết quả boolean trước khi báo Toast. |
| F6 | `blind-hunter`: Đồng bộ trạng thái `urlInvalid` khi URL rỗng trên `UrlBar.vue` | low | patch | Khi bấm sao chép cURL với URL rỗng, gán `responseStore.urlInvalid = true` đồng nhất với nút Gửi. Đã bổ sung unit test. |
| F7 | `blind-hunter`: Thiếu styling `focus-visible` cho `#copy-curl-btn` trên `UrlBar.vue` | low | patch | Đã bổ sung `focus-visible:ring-1 focus-visible:ring-brand-primary` đảm bảo chuẩn WCAG accessibility khi điều hướng bàn phím. |
| F8 | `blind-hunter`: Chuẩn hóa HTTP method khi format cURL (`curl.ts`) | low | patch | Đã thêm `.trim().toUpperCase()` đảm bảo method luôn hợp lệ và nhất quán. |
| F9 | `verification-gap`: Thiếu test case kiểm thử auth kế thừa từ folder (`curl.test.ts`) | medium | patch | Đã bổ sung test case `supports inherited folder auth from pathNodes` xác nhận header `Authorization` kế thừa chính xác. |
| F10 | `verification-gap`: Thiếu test case kiểm thử tích hợp envStore trong `UrlBar.vue` | medium | patch | Đã bổ sung test case `resolves active environment variables from envStore during copyAsCurl` trong `UrlBar.test.ts`. |
| F11 | `blind-hunter`: Thiếu dọn dẹp mock clipboard và test fallback trong `UrlBar.test.ts` | low | patch | Đã thêm `afterEach` khôi phục clipboard và bổ sung 2 test case cho fallback `execCommand` (thành công / thất bại). |
| F12 | `blind-hunter`: File `projects/frontend/dist/.gitkeep` vô tình bị xóa trong lúc chạy build/lint | low | patch | Đã khôi phục nguyên trạng file `dist/.gitkeep` bằng git checkout. |
| F13 | `blind-hunter`: Thiếu cURL action trong context menu của cây collection (`TreeContextMenu.vue`) | false | - | Nằm ngoài phạm vi của Story 2 (hợp đồng chỉ yêu cầu tích hợp trên UrlBar / RequestEditor). |
| F14 | `blind-hunter`: Thiếu cờ `--globoff` chống globbing URL | false | - | cURL bọc URL trong `'...'` POSIX shell không bị shell globbing. Việc mặc định thêm `--globoff` không phải chuẩn của các API client (Postman, Bruno) và gây rối lệnh cURL. |

## Design Notes

- Tái sử dụng `buildExecuteRequest(req, vars, inheritedHeaders, pathNodes)` để đảm bảo 100% tính nhất quán giữa lệnh cURL xuất ra và request thực tế được gửi qua Go backend.
- Hàm `escapeShell(str)`: bao bọc chuỗi trong `'...'` và thay thế `'` bằng `'\''` (chuẩn POSIX shell tương thích tuyệt đối trên Bash, Zsh, Dash).

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: Tất cả unit test (bao gồm `curl.test.ts` và `UrlBar.test.ts`) pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: TypeScript type check pass không có lỗi.
- `go test ./...` -- expected: Backend Go tests pass.

---
title: 'Bổ sung tùy chọn Hide Auth khi xem trước và sao chép lệnh cURL'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_revision: 'dca5cb02ccb7478cb8d9fb7827ea8019ff493657'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Thông tin xác thực nhúng trong URL authority (https://user:pass@host) chưa được ẩn khi bật hideAuth.
    evidence: |-
      Tại projects/frontend/src/utils/buildExecuteRequest.ts:176-180, stripQueryParamsFromUrl chỉ lọc query param xác thực và giữ nguyên phần userinfo trước @ trong URL authority. Ngoài phạm vi intent hiện tại (intent giới hạn ở Bearer Token, Basic Auth, API Key Header/Query và header Authorization/Proxy-Authorization).
    location: >-
      projects/frontend/src/utils/buildExecuteRequest.ts:176-180
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Hiện tại tab xem trước `cURL` và nút `Copy cURL` trong `RequestEditor` luôn nhúng toàn bộ thông tin xác thực (Bearer Token, Basic Auth, API Key ở Header hoặc Query Param, cũng như các header `Authorization`/`Proxy-Authorization` thủ công hoặc kế thừa), khiến người dùng dễ vô tình làm lộ thông tin nhạy cảm khi chia sẻ lệnh cURL.

**Approach:** Bổ sung cờ `hideAuth?: boolean` xuyên suốt từ `ResolveEffectiveAuthOptions`, `buildExecuteRequest` và `generateCurlCommand` để loại bỏ an toàn toàn bộ header và query param xác thực khi bật tùy chọn, đồng thời thêm checkbox `Hide Auth` (`Ẩn xác thực`) trên panel `cURL` của `RequestEditor` (mặc định tắt để giữ nguyên hành vi cũ) và đồng bộ bản dịch song ngữ Anh/Việt cùng bundle `headless-engine.js`.

## Boundaries & Constraints

**Always:**
- Khi `hideAuth` là `false` hoặc `undefined`, hành vi `buildExecuteRequest`, `generateCurlCommand` và giao diện `cURL` preview giữ nguyên 100% như trước (mặc định `hideCurlAuth = ref(false)`).
- Khi `hideAuth === true`, vẫn phân giải `effectiveAuth` và gọi `getAuthArtifacts(effectiveAuth, vars)` để biết danh sách `rawAuthHeaders` và `rawAuthParams`, nhưng không gộp `authHeaders` vào `baseHeaders` và không gộp `authParams` vào `activeAuthParams`.
- Khi `hideAuth === true`, loại bỏ khỏi `headers` kết quả mọi header có `key.trim().toLowerCase()` là `'authorization'`, `'proxy-authorization'`, hoặc trùng không phân biệt hoa thường với bất kỳ header key nào trong `rawAuthHeaders`.
- Khi `hideAuth === true` và `rawAuthParams` có query param (API Key Auth `addTo: 'query'`), loại bỏ mọi query param trùng key khỏi `params` và khỏi query string có sẵn trong `req.url` (sau phân giải biến/path param, trước khi ghép URL cuối cùng), đồng thời giữ nguyên các query param thông thường khác và hash fragment `#...`.
- Bảo toàn các thuộc tính khác của request (method, URL path, body, form-data, non-auth headers, non-auth query params) và đảm bảo các khóa từ điển `en.ts` / `vi.ts` đối xứng 1:1.

**Never:**
- Không gửi/áp dụng `hideAuth` vào luồng thực thi request thật (`responseStore.ts`, `headless-engine.ts`, CLI `hecto run`).
- Không thay đổi hoặc làm mất giá trị xác thực đã lưu trong store/file của request, folder, hoặc collection khi bật `Hide Auth`.
- Không làm biến dạng encoding của các query param thông thường còn lại hoặc làm sót dấu `?` thừa khi toàn bộ query param bị lọc bỏ.
- Không commit code hoặc chỉnh sửa ngoài phạm vi tính năng này.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bearer / Basic Auth (`hideAuth: true`) | Request có `auth.type` là `'bearer'` hoặc `'basic'`, kèm header `Content-Type` / `X-Trace` | Không có header `Authorization`; các header không phải auth được giữ nguyên | Không lỗi |
| API Key Header (`hideAuth: true`) | `effectiveAuth` là `apiKey` với `addTo: 'header'` (vd `X-API-Key`), kể cả trùng tên trong `req.headers` hoặc `inheritedHeaders` | Không có header `X-API-Key` trong kết quả (không phân biệt hoa thường); giữ các header khác | Không lỗi |
| API Key Query (`hideAuth: true`) | `effectiveAuth` là `apiKey` với `addTo: 'query'` (vd `api_key`), có trong `req.params` và/hoặc `req.url` (`?api_key=123&page=2#sec`) | URL chỉ còn `https://.../path?page=2#sec` (hoặc không còn `?` nếu rỗng query), không chứa `api_key` | Không lỗi |
| Inherited Auth (`hideAuth: true`) | Request có `auth: { type: 'inherit' }`, Folder cha hoặc Collection cấu hình Auth (hoặc `auth_envs`) | `resolveEffectiveAuth` tìm ra auth kế thừa và `buildExecuteRequest` lọc bỏ đúng header/param auth tương ứng | Không lỗi |
| Manual / Inherited Auth Headers (`hideAuth: true`) | `req.auth.type === 'none'`, nhưng `req.headers` hoặc `inheritedHeaders` có `Authorization` / `Proxy-Authorization` (viết hoa/thường bất kỳ) | Cả `Authorization` và `Proxy-Authorization` đều bị loại bỏ; giữ nguyên các header khác | Không lỗi |
| Mặc định (`hideAuth: false` / `undefined`) | Request có đầy đủ Bearer / Basic / API Key Auth | Sinh đầy đủ header và query param xác thực như hành vi hiện hành | Không lỗi |
| Toggle UI trên tab cURL | Trên `RequestEditor`, tab `cURL`, bật rồi tắt `[data-test="curl-hide-auth-toggle"]` và bấm `[data-test="copy-preview-curl-btn"]` | `[data-test="curl-preview-code"]` và nội dung copy clipboard ẩn auth khi checked, hiện lại auth khi unchecked | Không lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/auth.ts` -- Interface `ResolveEffectiveAuthOptions` (dòng 11–20), `resolveEffectiveAuth` (dòng 42–89), `getAuthArtifacts` (dòng 112–178).
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- `buildExecuteRequest` (dòng 24–214): phân giải auth (dòng 34–42), gộp header (dòng 45–68), lọc/ghép query param & URL (dòng 72–168).
- `projects/frontend/src/utils/urlParams.ts` -- Các helper tái sử dụng `splitPreservingVars` (dòng 13–51), `decodeQueryComponent` (dòng 90–110), `parseUrl` (dòng 150–168).
- `projects/frontend/src/utils/curl.ts` -- `GenerateCurlOptions` (dòng 546–555) và `generateCurlCommand` (dòng 586–709, kiểm tra option ở dòng 604–613, gọi `buildExecuteRequest` ở dòng 652–656).
- `projects/frontend/src/i18n/locales/en.ts` & `projects/frontend/src/i18n/locales/vi.ts` -- Nhóm khóa `requestEditor` (dòng 85–102).
- `projects/frontend/src/components/RequestEditor.vue` -- `resolvedCurlPreview` (dòng 144–153), `copyPreviewCurl` (dòng 155–186), panel `#panel-curl` (dòng 434–456).
- `projects/engine/headless-engine.js` -- Bundle sinh tự động từ `src/utils/headless-engine.ts` qua `bun run build:headless` (được Go `projects/engine/headless.go` nhúng).
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Unit tests cho `buildExecuteRequest`.
- `projects/frontend/src/utils/__tests__/curl.test.ts` -- Unit tests cho `generateCurlCommand`.
- `projects/frontend/src/components/__tests__/RequestEditor.test.ts` -- Component tests cho tab `cURL` và nút `Copy cURL` (dòng 338–371).

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/auth.ts` -- Thêm thuộc tính tùy chọn `hideAuth?: boolean` vào interface `ResolveEffectiveAuthOptions` -- Cung cấp kiểu dữ liệu thống nhất truyền cờ ẩn auth vào `buildExecuteRequest`.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Hỗ trợ `authOptions?.hideAuth === true`: vẫn phân giải `effectiveAuth` và `rawAuthHeaders`/`rawAuthParams`, không gộp `authHeaders` vào `baseHeaders` và không gộp `authParams` vào `activeAuthParams`; lọc bỏ khỏi `headers` mọi header có `key.trim().toLowerCase()` thuộc `{'authorization', 'proxy-authorization'}` hoặc trùng không phân biệt hoa thường với `rawAuthHeaders`; lọc bỏ các query param có key trùng với `rawAuthParams` khỏi `params` và khỏi query string có sẵn trong `url` (giữ nguyên query param khác và hash `#...`) trước khi ghép URL cuối cùng -- Đảm bảo ẩn triệt để mọi thông tin xác thực từ Auth config, kế thừa hay nhập tay mà không phá vỡ query param thường và hash fragment.
- `projects/frontend/src/utils/curl.ts` -- Thêm `hideAuth?: boolean` vào `GenerateCurlOptions`; bổ sung `'hideAuth' in envOrOptions` vào nhánh nhận diện options (dòng 604–613), đọc `opts.hideAuth` và truyền `hideAuth` xuống `buildExecuteRequest(...)` -- Cho phép gọi `generateCurlCommand(req, { hideAuth: true })` hoặc kèm các options khác.
- `projects/frontend/src/i18n/locales/en.ts`, `projects/frontend/src/i18n/locales/vi.ts` -- Thêm `hideAuth: 'Hide Auth'` vào `requestEditor` trong `en.ts` và `hideAuth: 'Ẩn xác thực'` vào `requestEditor` trong `vi.ts` -- Đảm bảo nhãn song ngữ đối ứng 1:1.
- `projects/frontend/src/components/RequestEditor.vue` -- Thêm `const hideCurlAuth = ref(false)`, truyền `hideAuth: hideCurlAuth.value` trong `resolvedCurlPreview`, và đặt `<label data-test="curl-hide-auth-label">` chứa `<input v-model="hideCurlAuth" type="checkbox" data-test="curl-hide-auth-toggle" />` và `<span>{{ t('requestEditor.hideAuth') }}</span>` cạnh `[data-test="copy-preview-curl-btn"]` trong `#panel-curl` -- Cung cấp nút gạt ẩn/hiện xác thực ngay tại màn hình preview & copy cURL.
- `projects/engine/headless-engine.js` -- Chạy `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless` để rebuild bundle -- Giữ đồng bộ `headless-engine.js` với mã nguồn TypeScript.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts`, `projects/frontend/src/utils/__tests__/curl.test.ts` -- Bổ sung unit tests cho toàn bộ kịch bản `hideAuth: true` / `hideAuth: false` trong I/O Matrix (Bearer, Basic, API Key Header/Query, Inherited Folder/Collection Auth, manual/inherited `Authorization` & `Proxy-Authorization`, giữ nguyên non-auth headers/query params và hash `#...`) -- Xác minh đầy đủ các trường hợp biên ở tầng utility.
- `projects/frontend/src/components/__tests__/RequestEditor.test.ts` -- Bổ sung component tests kiểm thử toggle `[data-test="curl-hide-auth-toggle"]` ẩn/hiện thông tin xác thực trong `[data-test="curl-preview-code"]` và truyền đúng chuỗi khi bấm `[data-test="copy-preview-curl-btn"]` -- Xác minh luồng tương tác UI hoàn chỉnh.

**Acceptance Criteria:**
- Given một request có cấu hình xác thực (hoặc kế thừa từ Folder/Collection, hoặc chứa header `Authorization`/`Proxy-Authorization`), when người dùng mở tab `cURL` trên `RequestEditor`, then checkbox `[data-test="curl-hide-auth-toggle"]` mặc định chưa được chọn (`false`) và `[data-test="curl-preview-code"]` hiển thị đầy đủ lệnh cURL kèm thông tin xác thực.
- Given người dùng đang xem tab `cURL` trên `RequestEditor`, when người dùng bật `[data-test="curl-hide-auth-toggle"]`, then `[data-test="curl-preview-code"]` cập nhật tức thì để loại bỏ toàn bộ header/query param xác thực trong khi giữ nguyên method, URL, body và các header/query param thông thường khác, và khi bấm `[data-test="copy-preview-curl-btn"]` thì lệnh cURL đã ẩn xác thực được sao chép vào clipboard.
- Given người dùng đã bật `[data-test="curl-hide-auth-toggle"]`, when người dùng tắt lại checkbox này, then `[data-test="curl-preview-code"]` hiển thị lại đầy đủ thông tin xác thực như ban đầu mà không làm thay đổi dữ liệu cấu hình auth của request.
- Given ứng dụng đổi ngôn ngữ giữa `en` và `vi`, when hiển thị tab `cURL`, then nhãn `[data-test="curl-hide-auth-label"]` hiển thị đúng `'Hide Auth'` hoặc `'Ẩn xác thực'`.

## Spec Change Log

## Review Triage Log

### 2026-11-16 — Review pass
- verdicts: 11 findings — high 0, medium 4, low 7, false 0, maybe-false 0
- findings:
  - `[medium]` `[defer]` (`blind-hunter` #1, gộp cùng `edge-case-hunter` #2) Thông tin xác thực nhúng trong URL authority (`https://user:pass@host`) chưa bị ẩn khi `hideAuth` bật — tại `projects/frontend/src/utils/buildExecuteRequest.ts:176-180`, `stripQueryParamsFromUrl` chỉ lọc query param và giữ nguyên phần userinfo trước `@`; nằm ngoài phạm vi intent (intent giới hạn ở Bearer Token, Basic Auth, API Key Header/Query và header `Authorization`/`Proxy-Authorization`), đã ghi nhận vào `deferred` ở frontmatter.
  - `[low]` `[reject]` (`blind-hunter` #2) `ResolveEffectiveAuthOptions.hideAuth` khai báo trên `auth.ts` nhưng `resolveEffectiveAuth` không xử lý trực tiếp — option này được chỉ định rõ trong intent đầu vào trên `ResolveEffectiveAuthOptions`, `resolveEffectiveAuth` cần tiếp tục trả về `effectiveAuth` để `buildExecuteRequest` lấy danh sách header/param cần lọc, không có caller nào gọi nhầm, và tách interface mới làm tăng public API ngoài đặc tả.
  - `[medium]` `[patch]` (`blind-hunter` #3, gộp cùng `edge-case-hunter` #1) Điều kiện `'hideAuth' in envOrOptions` va chạm với `Record<string, string>` chứa khóa `hideAuth` và `Boolean(opts.hideAuth)` ép chuỗi `'false'` thành `true` — đã thu hẹp điều kiện trong `projects/frontend/src/utils/curl.ts:615-616` sang kiểm tra `typeof envOrOptions.hideAuth === 'boolean' || envOrOptions.hideAuth === undefined`, chuẩn hóa `hideAuth = opts.hideAuth === true` tại dòng 632, và rebuild `projects/engine/headless-engine.js`.
  - `[low]` `[reject]` (`blind-hunter` #4) Trạng thái `hideCurlAuth = ref(false)` cục bộ trong `RequestEditor.vue` đặt lại về `false` khi unmount (chọn folder hoặc chuyển sang Flows) — thiết kế tuân theo đặc tả rõ ràng của intent (`const hideCurlAuth = ref(false)`), checkbox và khung preview hiển thị trực tiếp cạnh nút `Copy cURL`, còn lưu bền vào `uiStore`/`localStorage` sẽ làm thay đổi hành vi mặc định qua các phiên làm việc.
  - `[low]` `[reject]` (`blind-hunter` #5) Nhãn `curlExplanation` vẫn nhắc đến thông tin xác thực khi bật `Hide Auth` — chỉ mang tính mô tả thẩm mỹ ngay cạnh checkbox người dùng vừa bật; sửa đổi đòi hỏi thêm khóa i18n mới và nhánh điều kiện template vượt quá phạm vi tối thiểu của bộ khóa i18n được yêu cầu.
  - `[low]` `[reject]` (`blind-hunter` #6) Ký tự `+` biểu diễn khoảng trắng trong key query URL thô không khớp trong `stripQueryParamsFromUrl` — đã đối chiếu `projects/frontend/src/utils/urlParams.ts:88-110` và `urlParams.test.ts:53-57`: toàn bộ hệ thống chủ đích giữ nguyên dấu `+` nguyên bản qua `decodeQueryComponent`, nên `stripQueryParamsFromUrl` nhất quán với `parseUrl`; chuyển `+` thành khoảng trắng sẽ lọc nhầm query param chứa dấu `+` thực thụ.
  - `[low]` `[patch]` (`blind-hunter` #7) Thanh toolbar `#panel-curl` thiếu `flex-wrap` khi khung editor hẹp (kèm đề xuất tooltip không bắt buộc) — đã bổ sung `flex-wrap` vào container `<div class="flex flex-wrap items-center justify-between gap-2">` trong `projects/frontend/src/components/RequestEditor.vue:438`; phần tooltip i18n bổ sung không nằm trong đặc tả nên không thêm.
  - `[low]` `[patch]` (`blind-hunter` #8) Lời gọi `uiStore.setLocale('en')` / `('vi')` trong test mới của `RequestEditor.test.ts` thiếu `await` và `UpdateCollection` mock — đã đối chiếu `uiStore.ts:361-377` và `collectionStore.ts:871-885`, cập nhật hai lời gọi trong `projects/frontend/src/components/__tests__/RequestEditor.test.ts:947,951` sang `await uiStore.setLocale(..., { skipCollectionSave: true })`.
  - `[low]` `[patch]` (`blind-hunter` #9) Thiếu kiểm thử `Basic` auth, `collection` auth, `auth_envs`, `Record<string, string>` env chứa `hideAuth` trong `curl.test.ts`, thiếu case trùng lặp/không giá trị/biến/body trong `buildExecuteRequest.test.ts`, và thiếu smoke test trên `headless-engine.test.ts` — đã bổ sung đầy đủ các unit test mục tiêu vào 3 file test tương ứng (Playwright E2E nằm ngoài phạm vi kiểm thử unit/component của spec).
  - `[medium]` `[patch]` (`edge-case-hunter` #1, cùng nhóm với `blind-hunter` #3) Va chạm `'hideAuth' in envOrOptions` với `Record<string, string>` và ép kiểu `Boolean(opts.hideAuth)` — đã vá cùng lúc trong `projects/frontend/src/utils/curl.ts` và rebuild `projects/engine/headless-engine.js`.
  - `[medium]` `[defer]` (`edge-case-hunter` #2, cùng nhóm với `blind-hunter` #1) Lộ `user:pass@` trong URL authority khi `hideAuth` bật — ngoài phạm vi intent hiện tại, đã ghi nhận vào `deferred` ở frontmatter.

## Design Notes

- Khi lọc query param xác thực khỏi chuỗi `url` đã phân giải biến trong `buildExecuteRequest.ts`, tách phần `#hash` và `?rawQuery` bằng `splitPreservingVars`, tách từng đoạn `&` và giải mã key bằng `decodeQueryComponent(eqParts[0]).trim()` để so khớp với `rawAuthParams` (giữ nguyên các đoạn raw không khớp nhằm tránh mã hóa lại ngoài ý muốn các giá trị như `filter=id=1`, và bỏ dấu `?` nếu không còn query param nào).

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless` -- expected: exit 0, cập nhật `projects/engine/headless-engine.js` không lỗi.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run lint` -- expected: exit 0, không lỗi ESLint.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- expected: exit 0, không lỗi `vue-tsc`.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- expected: exit 0, toàn bộ unit/component tests pass.
- `cd projects && go vet ./... && go test ./...` -- expected: exit 0, toàn bộ Go tests pass với `headless-engine.js` mới.

## Auto Run Result

Status: done

- **Tóm tắt thay đổi:** Đã bổ sung tùy chọn `Hide Auth` (`Ẩn xác thực` / `Hide Auth`) cho luồng xem trước và sao chép lệnh `cURL` trong `RequestEditor` cùng cờ `hideAuth?: boolean` trên `ResolveEffectiveAuthOptions`, `buildExecuteRequest` và `generateCurlCommand`. Khi bật, hệ thống vẫn phân giải `effectiveAuth` để xác định danh sách header/param xác thực cần ẩn, loại bỏ header `Authorization`, `Proxy-Authorization` và mọi header trùng key trong `rawAuthHeaders` (không phân biệt hoa thường), đồng thời loại bỏ query param trùng key trong `rawAuthParams` khỏi cả `params` và query string có sẵn của `url` (giữ nguyên encoding raw của các param khác, bỏ `?` thừa và bảo toàn `#hash`) mà không ảnh hưởng tới luồng gửi request thật hay dữ liệu lưu trữ.
- **Danh sách tệp đã thay đổi:**
  - [projects/frontend/src/utils/auth.ts](../../projects/frontend/src/utils/auth.ts) -- Thêm thuộc tính `hideAuth?: boolean` vào `ResolveEffectiveAuthOptions`.
  - [projects/frontend/src/utils/buildExecuteRequest.ts](../../projects/frontend/src/utils/buildExecuteRequest.ts) -- Bỏ qua gộp auth artifacts, lọc bỏ auth headers và lọc bỏ auth query params khỏi `params` và `url` (qua `stripQueryParamsFromUrl`) khi `authOptions?.hideAuth === true`.
  - [projects/frontend/src/utils/curl.ts](../../projects/frontend/src/utils/curl.ts) -- Thêm `hideAuth?: boolean` vào `GenerateCurlOptions`, nhận diện option an toàn khỏi va chạm `Record<string, string>` và truyền `hideAuth === true` xuống `buildExecuteRequest`.
  - [projects/frontend/src/i18n/locales/en.ts](../../projects/frontend/src/i18n/locales/en.ts) -- Thêm `requestEditor.hideAuth: 'Hide Auth'`.
  - [projects/frontend/src/i18n/locales/vi.ts](../../projects/frontend/src/i18n/locales/vi.ts) -- Thêm `requestEditor.hideAuth: 'Ẩn xác thực'`.
  - [projects/frontend/src/components/RequestEditor.vue](../../projects/frontend/src/components/RequestEditor.vue) -- Thêm state `hideCurlAuth`, truyền `hideAuth` vào `generateCurlCommand` và render checkbox `[data-test="curl-hide-auth-toggle"]` cùng `[data-test="curl-hide-auth-label"]` cạnh `[data-test="copy-preview-curl-btn"]` với `flex-wrap`.
  - [projects/engine/headless-engine.js](../../projects/engine/headless-engine.js) -- Rebuild bundle headless engine (`173.88 KB`) từ `src/utils/headless-engine.ts`.
  - [projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts](../../projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts) -- Bổ sung bộ unit tests cho `hideAuth` với Bearer, Basic, API Key Header/Query, Inherited Folder/Collection & `auth_envs`, manual/inherited auth headers, duplicate/valueless/variable params và `formdata`/`urlencoded`.
  - [projects/frontend/src/utils/__tests__/curl.test.ts](../../projects/frontend/src/utils/__tests__/curl.test.ts) -- Bổ sung unit tests `generateCurlCommand` với `hideAuth` (`true`/`false`), Basic/Bearer/API Key, inherited folder/collection/env auth và `Record<string, string>` env map có khóa `hideAuth`.
  - [projects/frontend/src/utils/__tests__/headless-engine.test.ts](../../projects/frontend/src/utils/__tests__/headless-engine.test.ts) -- Bổ sung smoke assertion cho `buildExecuteRequest` và `generateCurlCommand` với `hideAuth: true` qua bundle `headless-engine`.
  - [projects/frontend/src/components/__tests__/RequestEditor.test.ts](../../projects/frontend/src/components/__tests__/RequestEditor.test.ts) -- Bổ sung component test toggle `Hide Auth`, cập nhật `[data-test="curl-preview-code"]`, sao chép qua `[data-test="copy-preview-curl-btn"]`, không làm biến đổi store, ẩn auth kế thừa và đổi nhãn song ngữ `en`/`vi`.
- **Tổng hợp kết quả review triage:**
  - **Đã vá (4 nhóm patch):** (1) `[medium]` Thu hẹp kiểm tra `'hideAuth' in envOrOptions` và chuẩn hóa `opts.hideAuth === true` trong `curl.ts` + rebuild `headless-engine.js`; (2) `[low]` Thêm `flex-wrap` trên toolbar `#panel-curl` trong `RequestEditor.vue`; (3) `[low]` Await `uiStore.setLocale(..., { skipCollectionSave: true })` trong `RequestEditor.test.ts`; (4) `[low]` Bổ sung các unit test còn thiếu vào `curl.test.ts`, `buildExecuteRequest.test.ts`, và `headless-engine.test.ts`.
  - **Đã ghi nhận trì hoãn (1 nhóm defer):** `[medium]` Ẩn thông tin xác thực dạng `https://user:pass@host` trong URL authority (ngoài phạm vi intent ban đầu — đã lưu vào frontmatter `deferred`).
  - **Đã bác bỏ (4 findings reject):** `blind-hunter` #2 (`low` — `ResolveEffectiveAuthOptions.hideAuth` được yêu cầu trực tiếp bởi intent và `resolveEffectiveAuth` vẫn cần trả `effectiveAuth`), `blind-hunter` #4 (`low` — `hideCurlAuth = ref(false)` tuân theo vòng đời cục bộ được chỉ định trong intent), `blind-hunter` #5 (`low` — `curlExplanation` mang tính thẩm mỹ, thêm khóa i18n mới vượt quá thay đổi tối thiểu), `blind-hunter` #6 (`low` — `urlParams.ts` chủ đích bảo toàn dấu `+` nguyên bản qua `decodeQueryComponent`).
- **Đề xuất follow-up review (`followup_review_recommended`):** `false` (số nhóm entry đã vá theo verdict ở pass đầu: `high: 0`, `medium: 1`, `low: 3`).
- **Kết quả kiểm tra (chạy sau bản vá cuối cùng):**
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless` -> exit 0 (`headless-engine.js 173.88 KB`).
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run lint` -> exit 0.
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -> exit 0.
  - `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -> exit 0 (`57` test files passed, `771` tests passed).
  - `cd projects && go vet ./... && go test -count=1 ./...` -> exit 0 (tất cả 7 Go packages có test đều pass).
- **Rủi ro tồn dư:**
  - Bộ Playwright E2E (`bun run test:e2e`) chưa được chạy trong phiên này (không nằm trong `## Verification` của spec).
  - Các header xác thực tùy biến ngoài `Authorization`/`Proxy-Authorization` (ví dụ `Cookie` hoặc `X-API-Key` thủ công khi `auth.type === 'none'`) và thông tin `user:pass@` nhúng trong URL authority vẫn giữ nguyên theo phạm vi intent hiện tại.

---
title: 'Cấu hình Authentication'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '906ab88e0fc1b8dc89a35ba7551d7f40794cdcc4'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hiện tại người dùng phải cấu hình thủ công header `Authorization` hoặc query token cho từng request riêng lẻ. Không có cơ chế khai báo tập trung cấu hình xác thực (Authentication) ở cấp độ Folder để các request con kế thừa, và không có UI thân thiện cho các hình thức xác thực phổ biến (Bearer Token, Basic Auth, API Key).

**Approach:** 
1. Mở rộng cấu trúc dữ liệu `Folder`, `Request`, `TreeNode` để lưu trữ `AuthConfig` bao gồm 5 chế độ: `inherit` (kế thừa từ cha), `none` (không xác thực), `bearer` (Bearer Token), `basic` (Basic Auth), và `apiKey` (API Key thêm vào Header hoặc Query Param).
2. Tạo component `AuthEditor.vue` dùng chung cho cả RequestEditor và FolderEditor.
3. Thêm tab `Auth` vào `RequestTabs.vue` (cho Request) và `FolderEditor.vue` (cho Folder).
4. Hiện thực module `auth.ts` để phân giải xác thực hiệu dụng (`resolveEffectiveAuth`) dọc theo cây thư mục (ancestor path) và nhúng thông tin xác thực vào request khi thực thi (hỗ trợ resolve biến môi trường `{{variable}}`).
5. Đảm bảo header do Auth sinh ra tuân thủ quy tắc ghi đè nếu request con có định nghĩa header cùng tên rõ ràng.

## Boundaries & Constraints

**Always:**
- Lưu trữ dữ liệu cấu hình Auth trong file `_folder.json` và `<request>.json` trên ổ đĩa theo kiến trúc file-based JSON.
- Hỗ trợ đầy đủ 5 chế độ xác thực tĩnh: `inherit`, `none`, `bearer`, `basic`, `apiKey`.
- Cấu hình Auth mặc định của Request mới tạo là `inherit`.
- Cấu hình Auth mặc định của Folder mới tạo là `inherit` (nếu không tìm thấy cha có cấu hình thì hiệu dụng là `none`).
- Hỗ trợ thay thế biến môi trường `resolveVariables` cho các trường thông tin trong Auth (Token, Username, Password, API Key/Value).
- Header `Authorization` (hoặc header API Key) do Auth sinh ra sẽ bị ghi đè nếu người dùng khai báo tường minh header cùng tên trong danh sách Headers của Request.
- Khi API Key chọn `addTo: 'query'`, query parameter được tự động đính kèm vào URL khi gửi request.
- Mã hóa Base64 chuẩn RFC đối với Basic Auth (`Authorization: Basic <base64(user:pass)>`).

**Never:**
- Không hỗ trợ các luồng OAuth 2.0 động (authorization code, token refresh, PKCE) trong spec này.
- Không lưu trữ các thông tin Auth tạm thời hoặc token giải mã vào nơi khác ngoài cấu trúc đã định.
- Không làm gãy tính tương thích với các file collection/folder/request cũ chưa có trường `auth`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Inherit from parent Bearer | Folder cha có Bearer `token_123`, Request con chọn `inherit` | Request khi gửi có header `Authorization: Bearer token_123` | Không lỗi |
| Multi-level folder inheritance | Folder A (Bearer) -> Folder B (inherit) -> Request (inherit) | Request kế thừa Bearer từ Folder A | Không lỗi |
| Inherit with no parent auth | Request ở root chọn `inherit`, không có folder cha | Hiệu dụng là `none`, không gửi header/param auth nào | Không lỗi |
| Request overrides parent auth | Folder có Bearer, Request chọn `none` | Không gửi header Authorization nào | Không lỗi |
| Request specifies own Bearer | Folder có Bearer A, Request chọn Bearer B | Gửi `Authorization: Bearer B` | Không lỗi |
| Basic Auth | Username: `admin`, Password: `secret` | Gửi `Authorization: Basic YWRtaW46c2VjcmV0` | Không lỗi |
| API Key in Header | Key: `X-API-Key`, Value: `secret123`, addTo: `header` | Gửi header `X-API-Key: secret123` | Không lỗi |
| API Key in Query | Key: `apiKey`, Value: `xyz`, addTo: `query` | URL đính kèm `?apiKey=xyz` (hoặc `&apiKey=xyz`) | Không lỗi |
| Variable substitution in Auth | Bearer Token: `{{my_token}}`, biến có giá trị `abc` | Gửi `Authorization: Bearer abc` | Không lỗi |
| Request header overrides auth | Auth là Bearer `xyz`, nhưng tab Headers có `Authorization: Custom 123` | Header `Authorization: Custom 123` được gửi | Không lỗi |
| Legacy files without auth | File JSON cũ không có key `auth` | Tải thành công, mặc định coi như `inherit` | Tự động fallback hợp lệ |

</intent-contract>

## Code Map

- `projects/model/types.go` -- Bổ sung `AuthConfig`, `BearerAuth`, `BasicAuth`, `APIKeyAuth` vào `Request`, `Folder`, `TreeNode`.
- `projects/service/collection.go` -- Đọc và ghi `Auth` cho Folder và Request, đưa `Auth` vào `TreeNode`.
- `projects/service/importer.go` -- Đồng bộ xử lý `Auth` khi import Postman nếu có.
- `projects/frontend/wailsjs/go/models.ts` -- Bổ sung các class TypeScript tương ứng cho `AuthConfig`.
- `projects/frontend/src/stores/requestStore.ts` -- Bổ sung type `AuthConfig` vào `Request`.
- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung `auth?: AuthConfig` vào `TreeNode`.
- `projects/frontend/src/stores/uiStore.ts` -- Hỗ trợ tab `'auth'` trong `activeRequestTab`.
- `projects/frontend/src/utils/auth.ts` -- Hiện thực logic phân giải Auth hiệu dụng và build auth headers/params.
- `projects/frontend/src/utils/__tests__/auth.test.ts` -- Unit tests cho `auth.ts`.
- `projects/frontend/src/utils/buildExecuteRequest.ts` -- Tích hợp resolved auth vào request execution.
- `projects/frontend/src/utils/__tests__/buildExecuteRequest.test.ts` -- Unit tests kiểm tra gửi request kèm auth.
- `projects/frontend/src/stores/responseStore.ts` -- Chuyển pathNodes/auth vào `buildExecuteRequest`.
- `projects/frontend/src/components/AuthEditor.vue` -- Component giao diện cấu hình Auth với 5 chế độ.
- `projects/frontend/src/components/__tests__/AuthEditor.test.ts` -- Unit tests cho `AuthEditor.vue`.
- `projects/frontend/src/components/RequestTabs.vue` -- Thêm tab Auth.
- `projects/frontend/src/components/RequestEditor.vue` -- Tích hợp AuthEditor vào tab Auth.
- `projects/frontend/src/components/FolderEditor.vue` -- Thêm tab Auth cho Folder và tích hợp AuthEditor.

## Tasks & Acceptance

**Execution:**
- `projects/model/types.go` -- Bổ sung các kiểu dữ liệu Auth.
- `projects/service/collection.go` -- Cập nhật `buildFolderNode`, `CreateFolder`, `LoadFolder`, `UpdateFolder`, `CreateRequest` hỗ trợ Auth.
- `projects/service/collection_test.go` -- Viết test backend xác minh lưu/đọc Auth cho Folder và Request.
- `projects/frontend/src/utils/auth.ts` -- Xây dựng hàm `resolveEffectiveAuth` và `applyAuthToRequest`.
- `projects/frontend/src/utils/__tests__/auth.test.ts` -- Viết test đầy đủ các kịch bản phân giải và mã hóa auth.
- `projects/frontend/src/utils/buildExecuteRequest.ts` & `responseStore.ts` -- Tích hợp auth vào luồng thực thi request.
- `projects/frontend/src/components/AuthEditor.vue` -- Xây dựng UI cấu hình Auth với các input tương ứng từng mode.
- `projects/frontend/src/components/RequestTabs.vue`, `RequestEditor.vue`, `FolderEditor.vue` -- Tích hợp AuthEditor vào UI.
- Chạy toàn bộ test suites (`go test ./...`, `bun run test`, `bun run type-check`).

---
id: SPEC-script-runner-auth-api
companions: []
sources: []
---

# Bổ sung API Script Runner thiết lập Authentication theo Environment cho Folder và Request

## Why

Hiện tại trong Hecto-API, Script Runner (Pre-request Script và Post-response Script) đã hỗ trợ thao tác đọc/ghi biến đa tầng thông qua `ha.folderVariables` (Folder Global) và `ha.folderEnv` (Folder-Env theo từng môi trường). Tuy nhiên, người dùng chưa thể thiết lập cấu hình Authentication (Bearer Token, Basic Auth, API Key) cho Folder hoặc Request một cách linh hoạt bằng script khi kiểm thử API. Việc bổ sung các API `ha.folderAuth`, `ha.folderAuthEnv`, `ha.collectionAuth` và `ha.request.auth` (tương thích cả namespace `pm.*`) cho phép kịch bản test tự động trích xuất token đăng nhập từ response và gán thẳng vào cấu hình Auth của Folder/Request theo từng Environment, giúp quy trình kiểm thử API tự động hóa mượt mà và liền mạch.

## Capabilities

- **CAP-1**
  - **intent:** Cung cấp API `ha.folderAuth` và `ha.folderAuthEnv` (tương thích `pm.folderAuth` và `pm.folderAuthEnv`) trong Script Runner để đọc và gán cấu hình xác thực (AuthConfig) cho Folder ở phạm vi dùng chung (Folder Global) và theo từng Environment cụ thể (Folder-Env).
  - **success:** Script có thể gọi `ha.folderAuth.setBearer(token, folder?)`, `ha.folderAuth.setBasic(user, pass, folder?)`, `ha.folderAuth.setApiKey(key, val, addTo?, folder?)`, `ha.folderAuthEnv.setBearer(token, folder?, env?)`, hoặc chuỗi `ha.folderAuth.env(env).setBearer(token)`; các cập nhật được ghi nhận vào `scopedAuthUpdates` trong kết quả thực thi script.
- **CAP-2**
  - **intent:** Cung cấp API `ha.request.auth` (tương thích `pm.request.auth`) trong Script Runner để kiểm tra hoặc ghi đè trực tiếp cấu hình Auth của chính request đang thực thi trước khi gửi đi.
  - **success:** Trong Pre-request Script, gọi `ha.request.auth.setBearer(token)` hoặc `ha.request.auth.none()` sẽ cập nhật `requestMutations.auth`, lập tức có hiệu lực khi xây dựng `buildExecuteRequest` cho lượt gửi hiện tại.
- **CAP-3**
  - **intent:** Cung cấp API `ha.collectionAuth` (tương thích `pm.collectionAuth`) để gán cấu hình Auth cấp Collection cả phạm vi Global lẫn theo Environment.
  - **success:** Script có thể gọi `ha.collectionAuth.setBearer(token)` hoặc `ha.collectionAuth.env(env).setBearer(token)` để cập nhật cấu hình Auth của Collection đang active.
- **CAP-4**
  - **intent:** Tích hợp đồng bộ trạng thái Auth sau khi chạy script vào Pinia store (`environmentStore`, `collectionStore`) và lưu bền vững xuống tệp `_folder.json` hoặc `collection.json` trên ổ đĩa.
  - **success:** Sau khi Pre-request hoặc Post-response Script kết thúc, hàm `applyScopedAuthUpdates` tự động tải và cập nhật file `_folder.json` trên đĩa qua `LoadFolder`/`UpdateFolder`, cập nhật `TreeNode` trên cây sidebar và phát sự kiện `hecto:folder-updated` để đồng bộ UI FolderEditor ngay lập tức.
- **CAP-5**
  - **intent:** Bổ sung gợi ý tự động (autocomplete) trong `jsHighlight.ts` và snippet mẫu trong `ScriptEditor.vue` cho các API Auth mới.
  - **success:** Khi gõ `ha.folderAuth.` hoặc `pm.folderAuth.` trong ScriptEditor, bảng gợi ý hiển thị đầy đủ các hàm hỗ trợ; nút Snippets có thêm mẫu gán Folder Auth và Request Auth.
- **CAP-6**
  - **intent:** Toàn bộ tính năng mới được kiểm thử tự động chặt chẽ bằng Vitest suite.
  - **success:** 100% test cases mới trong `scriptRunner.test.ts` và `ScriptEditor.test.ts` pass, `bun run type-check` và toàn bộ test suite frontend/backend đều pass.

## Constraints

- Dữ liệu lưu trữ file-based JSON tuân thủ chuẩn `AuthConfig` hiện có của hệ thống (`type: 'inherit' | 'none' | 'bearer' | 'basic' | 'apiKey'`).
- Tương thích ngược hoàn toàn: Namespace `ha.*` và `pm.*` đều truy cập được các API Auth như nhau.
- Không làm gián đoạn hoặc phá vỡ cấu trúc `scopedEnvUpdates` của các kịch bản đang sử dụng `folderVariables` và `folderEnv`.
- Tuân thủ quy chuẩn kiểm thử an toàn dữ liệu: Không ghi đè hoặc can thiệp vào các collection ngoài test.

## Non-goals

- Không hỗ trợ luồng OAuth 2.0 động (PKCE, Refresh Token flow tự động xoay vòng) trong phạm vi spec này.
- Không thay đổi cấu trúc dữ liệu `Folder` hay `AuthConfig` trên tầng backend Go.

## Success signal

- Người dùng có thể viết trong Post-response script:
  ```javascript
  const token = ha.response.json().data.token;
  ha.folderAuthEnv.setBearer(token, 'MyFolder', 'Dev');
  ```
  File `_folder.json` của `MyFolder` được cập nhật `auth_envs["env-id"]` với token mới, UI tab Auth của Folder phản ánh ngay lập tức, và 100% bài test vượt qua.

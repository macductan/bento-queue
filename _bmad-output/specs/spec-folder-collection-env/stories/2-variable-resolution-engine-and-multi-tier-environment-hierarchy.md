---
title: 'Story 2: Variable Resolution Engine & Multi-Tier Environment Hierarchy'
type: 'feat'
created: '2026-10-13'
status: 'done'
baseline_commit: '9abf400598fe525030bbdca1440de86ad6f8caa2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '_bmad-output/specs/spec-folder-collection-env/SPEC.md'
  - '_bmad-output/specs/spec-folder-collection-env/environment-architecture.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại frontend chỉ phân giải biến từ 2 nguồn: biến của Active Environment trong `environmentStore` và biến dùng chung của các thư mục cha (`node.variables`). Hệ thống hoàn toàn chưa hỗ trợ biến cấp Collection (Collection Env), chưa hỗ trợ biến riêng của thư mục theo từng môi trường (`folder-env`), và chưa có hàm phân giải biến tập trung tuân thủ đúng thứ tự ưu tiên 4 cấp độ: `Collection Env -> Global Env -> Folder Global Env -> Folder-Env`.

**Approach:** Xây dựng module phân giải biến tập trung (ví dụ: `src/utils/resolveHierarchyVariables.ts`) cài đặt thuật toán chuẩn 4 cấp độ kèm cơ chế duyệt cây phả hệ từ thư mục gốc đến thư mục lá con. Cập nhật các TypeScript interfaces tương ứng trong frontend (`TreeNode`, `Folder`, `Collection`). Tích hợp engine này vào `RequestEditor.vue`, `FolderEditor.vue`, `responseStore.ts` (trước khi gửi `SendRequest`), và `VariableHighlighter.vue`. Viết bộ kiểm thử Vitest toàn diện bao phủ toàn bộ các kịch bản ghi đè, lồng thư mục, cờ `enabled`, và bảo đảm an toàn dữ liệu kiểm thử (Mục 19).

## Boundaries & Constraints

**Always:**
- Thứ tự ưu tiên ghi đè từ thấp đến cao bắt buộc phải là:
  `collection env -> global env -> folder global env -> folder-env`.
- Biến cấp Collection (Mức 1): Lấy từ collection đang hoạt động (`activeCollection.variables`), chỉ nhận các cặp có `enabled === true` và key không rỗng.
- Biến Global Env (Mức 2): Lấy từ Active Environment hiện tại (`environmentStore.variablesMap`), ghi đè lên biến Collection nếu trùng key.
- Biến Folder Global Env (Mức 3): Duyệt từ thư mục cha cấp cao nhất đến thư mục gần nhất (`pathNodes`), các biến `enabled === true` trong `node.variables` của thư mục con ghi đè thư mục cha và ghi đè các mức trước.
- Biến Folder-Env (Mức 4): Nếu có `activeEnvId`, duyệt từ thư mục cha cấp cao nhất đến thư mục gần nhất, các biến `enabled === true` trong `node.folder_envs[activeEnvId]` ghi đè mọi mức trước.
- **Quy tắc an toàn kiểm thử (Mục 19):** Unit test sử dụng mock Pinia store và fixture dữ liệu in-memory, hoàn toàn không gọi I/O tới dữ liệu thật của người dùng.
- Toàn bộ kiểm thử frontend (`bun run type-check`, `bun run test`) phải pass 100%.

**Never:**
- Không thay đổi hành vi truyền payload tới backend Go: frontend tiếp tục giải mã toàn bộ biến trước khi gọi `SendRequest`.
- Không thay đổi logic của Story 3 (các thành phần giao diện chọn môi trường, đổi font size URL bar).
- Không tự ý commit hoặc push Git khi chưa có sự xác nhận của người dùng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Chỉ có Collection Env | `collection.variables = [{k: "host", v: "base.com"}]`, không có env hay folder | Map có `host => base.com` | N/A |
| Global Env ghi đè Collection Env | `collection: host => base.com`, `activeEnv: host => dev.com` | Map có `host => dev.com` | N/A |
| Folder Global ghi đè Global Env | `activeEnv: host => dev.com`, `folder.variables: host => folder.com` | Map có `host => folder.com` | N/A |
| Folder-Env ghi đè Folder Global | `folder.variables: host => f.com`, `folder.folder_envs[env1]: host => f-env1.com` với `activeEnvId = env1` | Map có `host => f-env1.com` | N/A |
| Thư mục lồng nhau (Parent & Child) | `P_folder.variables: a => 1`, `C_folder.variables: a => 2` | Map có `a => 2` (thư mục con ghi đè thư mục cha) | N/A |
| Biến bị disabled (`enabled = false`) | Biến ở tầng cao có `enabled = false`, tầng thấp hơn có `enabled = true` | Tầng cao bị bỏ qua, giá trị từ tầng thấp hơn được giữ nguyên | N/A |
| Không chọn Environment (`activeEnvId = null`) | Có Collection Env và Folder Global Env, Folder-Env cấu hình cho các env khác | Bỏ qua Mức 2 (Global Env) và Mức 4 (Folder-Env); chỉ áp dụng Mức 1 và Mức 3 | N/A |
| Dữ liệu cũ thiếu `variables` hoặc `folder_envs` | Node hoặc Collection không có key `variables` / `folder_envs` | Coi như rỗng, giải mã các tầng còn lại bình thường | Không gây crash hay exception |

</frozen-after-approval>

## Code Map

- `projects/frontend/src/stores/collectionStore.ts` -- Bổ sung `folder_envs?: Record<string, { key: string; value: string; enabled: boolean }[]>` vào `TreeNode`.
- `projects/frontend/src/utils/resolveHierarchyVariables.ts` -- Helper mới tính toán `effectiveVariables` theo đúng 4 cấp độ và duyệt cây phả hệ thư mục.
- `projects/frontend/src/utils/__tests__/resolveHierarchyVariables.test.ts` -- Test suite Vitest toàn diện kiểm thử mọi trường hợp ưu tiên ghi đè, lồng nhau, cờ enabled/disabled.
- `projects/frontend/src/components/RequestEditor.vue` -- Cập nhật computed `effectiveVariables` sử dụng helper phân giải 4 cấp độ.
- `projects/frontend/src/components/FolderEditor.vue` -- Cập nhật computed `effectiveVariables` sử dụng helper phân giải 4 cấp độ.
- `projects/frontend/src/stores/responseStore.ts` -- Cập nhật hàm `send()` xây dựng map biến dùng helper phân giải 4 cấp độ trước khi gọi `buildExecuteRequest`.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Đảm bảo highlight biến nhận và phản ánh chính xác map biến mới.

## Tasks & Acceptance

**Execution:**
- [x] `projects/frontend/src/stores/collectionStore.ts`: Cập nhật interface `TreeNode` thêm `folder_envs?: Record<string, { key: string; value: string; enabled: boolean }[]>`.
- [x] `projects/frontend/src/utils/resolveHierarchyVariables.ts`: Tạo helper phân giải biến nhận vào `collectionVariables`, `activeEnvVariables`, `pathFolders`, và `activeEnvId`, trả về `Map<string, string>`.
- [x] `projects/frontend/src/utils/__tests__/resolveHierarchyVariables.test.ts`: Viết đầy đủ unit tests cho:
  - 1 tầng riêng biệt (chỉ Collection Env).
  - Ghi đè 2 tầng: Global Env ghi đè Collection Env.
  - Ghi đè 3 tầng: Folder Global Env ghi đè Global Env và Collection Env.
  - Ghi đè 4 tầng: Folder-Env ghi đè toàn bộ các tầng trước.
  - Thư mục lồng nhau (Folder cha vs Folder con).
  - Xử lý các biến bị vô hiệu hóa (`enabled: false`).
  - Xử lý khi `activeEnvId` không chọn hoặc không khớp.
- [x] `projects/frontend/src/components/RequestEditor.vue`: Tích hợp helper vào `effectiveVariables`.
- [x] `projects/frontend/src/components/FolderEditor.vue`: Tích hợp helper vào `effectiveVariables`.
- [x] `projects/frontend/src/stores/responseStore.ts`: Tích hợp helper vào hàm `send()`.
- [x] Chạy kiểm thử `source ~/.nvm/nvm.sh && nvm use && bun run type-check && bun run test` đảm bảo 100% pass.

**Acceptance Criteria:**
- Given biến tồn tại ở cả 4 cấp (Collection, Active Env, Folder Global, Folder-Env khớp Active Env ID), when phân giải biến, then giá trị tại Folder-Env được sử dụng.
- Given biến chỉ tồn tại ở Collection Env, when phân giải biến cho bất kỳ request nào trong collection, then giá trị từ Collection Env được áp dụng.
- Given thư mục con F2 nằm trong thư mục cha F1, when cả hai cùng định nghĩa biến ở Folder Global Env, then giá trị của F2 ghi đè F1.
- Given một biến ở Folder-Env có `enabled: false`, when tầng dưới có biến cùng key nhưng `enabled: true`, then giá trị của tầng dưới được giữ nguyên.
- Given bộ kiểm thử frontend, when chạy `bun run type-check` và `bun run test`, then tất cả đều pass không có lỗi TypeScript hay test failure.

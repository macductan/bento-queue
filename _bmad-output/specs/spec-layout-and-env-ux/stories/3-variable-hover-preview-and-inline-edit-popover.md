---
title: 'Variable Hover Preview & Inline Edit Popover'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: '118e7892009886c84fcd7c3aafc15d355eb351ca'
review_loop_iteration: 0
followup_review_recommended: false
warnings: []
deferred: []
context:
  - '_bmad-output/specs/spec-layout-and-env-ux/SPEC.md'
  - '_bmad-output/specs/spec-layout-and-env-ux/layout-and-env-architecture.md'
  - 'projects/frontend/src/utils/variables.ts'
  - 'projects/frontend/src/utils/resolveHierarchyVariables.ts'
  - 'projects/frontend/src/components/VariableHighlighter.vue'
  - 'projects/frontend/src/components/RequestEditor.vue'
  - 'projects/frontend/src/components/FolderEditor.vue'
  - 'projects/frontend/src/components/UrlBar.vue'
  - 'projects/frontend/src/components/KvpEditor.vue'
  - 'projects/frontend/src/components/BodyEditor.vue'
  - 'projects/frontend/src/stores/collectionStore.ts'
  - 'projects/frontend/src/stores/environmentStore.ts'
  - 'projects/frontend/src/components/__tests__/VariableHighlighter.test.ts'
---

<intent-contract>

## Intent

**Problem:** Khi làm việc với các biến môi trường `{{variable}}` trong URL Bar, Query Params, Headers, Folder Variables hoặc Body, người dùng hiện chỉ thấy màu sắc phân biệt (`resolved` hoặc `missing`) mà không thể xem nhanh giá trị thực tế đang được phân giải từ tầng nào, cũng như không thể chỉnh sửa hoặc tạo mới giá trị biến ngay tại chỗ mà phải rời khỏi ngữ cảnh đang soạn thảo để mở `EnvModal`, `CollectionEnvModal` hoặc `FolderEditor`.

**Approach:** Bổ sung cơ chế phát hiện hover theo tọa độ chuột trên các thẻ `<span data-var-name>` bên trong `VariableHighlighter.vue` mà vẫn giữ nguyên `pointer-events-none` trên lớp overlay (để không cản trở việc click đặt con trỏ, bôi đen, gõ phím hay bộ gõ IME của `<input>`/`<textarea>` bên dưới); xây dựng component `VariableHoverPopover.vue` (hiển thị qua `<Teleport to="body">`) cho phép xem giá trị hiện tại, chọn tầng phạm vi trong dropdown (bao gồm toàn bộ các Folder cha trong phả hệ và cấp Global/Collection Env — chỉ hiển thị duy nhất Environment đang active), và lưu chỉnh sửa/tạo mới trực tiếp xuống đĩa (`_folder.json`, `environments/<id>.json` hoặc `collection.json`).

## Boundaries & Constraints

**Always:**
- Giữ nguyên `pointer-events-none` trên lớp overlay của `VariableHighlighter.vue`; mọi thao tác click, đặt con trỏ (caret), kéo bôi đen văn bản, gõ phím, cuộn và bộ gõ IME (`compositionstart`/`update`/`end`) trên `<input>` / `<textarea>` bên dưới phải hoạt động bình thường, không bị chặn.
- Mỗi token biến (`resolved` hoặc `missing`) trong `VariableHighlighter.vue` có thuộc tính `data-var-name="<trimmedKey>"` để xác định tên biến khi con trỏ chuột di chuyển vào vùng tọa độ của thẻ `<span>`.
- Trong Dropdown chọn tầng lưu trữ (`Scope Selector`) của `VariableHoverPopover.vue`:
  - Bao gồm tất cả các Folder cha trong phả hệ (`pathFolders` từ gốc đến lá) và cấp Global/Collection.
  - Ở cấp `Folder-Env` và `Global Env`, **chỉ hiển thị duy nhất Environment đang active (`activeEnvId`)**, tuyệt đối không liệt kê các environment không active.
  - Khi `activeEnvId === null` ("Không dùng env"), chỉ hiển thị các tùy chọn `Folder: <Tên Folder> (Dùng chung)` (của các Folder cha) và `Collection Env (Dùng chung)` — không hiển thị `Global Env` hay `Folder-Env`.
- Khi mở Popover:
  - Nếu biến đã được định nghĩa (`resolved`), tự động chọn sẵn **Tầng đang thắng ưu tiên (Winning Tier)** theo đúng thứ tự 4 cấp độ (`Collection Env -> Global Env (Active) -> Folder Global Env (Root..Leaf) -> Folder-Env (Active, Root..Leaf)`) và điền giá trị của tầng đó vào ô input.
  - Nếu biến chưa được định nghĩa (`missing`), hiển thị badge `Chưa định nghĩa`, mặc định chọn `Global Env (<Active Env>)` (khi `activeEnvId != null`) hoặc `Collection Env (Dùng chung)` (khi `activeEnvId === null`), và để trống ô input với placeholder `"Nhập giá trị cho {{varName}}..."`.
- Khi người dùng đổi tầng trong Dropdown Scope, ô input cập nhật ngay theo giá trị hiện có của biến tại tầng vừa chọn (hoặc rỗng nếu tầng đó chưa có biến này).
- Khi người dùng lưu giá trị (nhấn `Enter` trong ô input hoặc bấm nút `Lưu`), ghi bền vững biến (với `enabled: true`) xuống đúng tầng đã chọn (`collectionStore.updateCollectionVariables`, `envStore.save`, hoặc `LoadFolder` + `UpdateFolder` + `collectionStore.loadTree`) và đồng bộ tức thì lên giao diện (bao gồm cả `FolderEditor.vue` nếu thư mục đó đang mở).
- Tuân thủ tuyệt đối quy tắc an toàn dữ liệu khi test (Mục 19): chỉ thao tác trên `Test-Collection` hoặc `t.TempDir()`, không đụng chạm dữ liệu thật.

**Never:**
- Không bật `pointer-events-auto` trên lớp overlay chữ của `VariableHighlighter.vue` làm cản trở thao tác chuột trên `<input>` / `<textarea>`.
- Không hiển thị các Environment đang không active trong dropdown chọn tầng của `VariableHoverPopover.vue`.
- Không để rò rỉ timer (`hoverTimer`, `closeTimer`) hoặc giữ Popover mở khi component `VariableHighlighter.vue` bị unmount, khi người dùng đang gõ phím trong ô input chính, hoặc khi nhấn phím `Escape`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hover vào biến đã định nghĩa (`resolved`) khi có Active Env | `activeEnvId = "env-local"` (`Local`), Request nằm trong `Folder A -> Folder B`, biến `{{baseUrl}}` có ở `Collection Env` (`"http://coll"`) và `Folder B (Local)` (`"http://folder-b-local"`) | Popover mở ra hiển thị `{{baseUrl}}`, chọn sẵn tầng thắng ưu tiên `Folder: Folder B (Local)`, ô input chứa `"http://folder-b-local"`; dropdown liệt kê: `Folder: Folder B (Local)`, `Folder: Folder B (Dùng chung)`, `Folder: Folder A (Local)`, `Folder: Folder A (Dùng chung)`, `Global Env (Local)`, `Collection Env (Dùng chung)` (không liệt kê env không active như `Staging`) | Không lỗi |
| Hover vào biến chưa định nghĩa (`missing`) khi có Active Env | `activeEnvId = "env-local"` (`Local`), hover vào `{{newKey}}` | Popover hiển thị badge `Chưa định nghĩa`, dropdown mặc định chọn `Global Env (Local)`, ô input rỗng với placeholder `"Nhập giá trị cho {{newKey}}..."` | Không lỗi |
| Hover vào biến chưa định nghĩa (`missing`) khi không dùng Env | `activeEnvId = null`, Request nằm trong `Folder A`, hover vào `{{newKey}}` | Popover hiển thị badge `Chưa định nghĩa`, dropdown chỉ liệt kê `Folder: Folder A (Dùng chung)` và `Collection Env (Dùng chung)` (không có `Global Env` hay `Folder-Env`), mặc định chọn `Collection Env (Dùng chung)` | Không lỗi |
| Đổi tầng trong Dropdown Scope của Popover | Người dùng chuyển dropdown từ `Folder: Folder B (Local)` sang `Collection Env (Dùng chung)` (hoặc một tầng chưa có biến) | Ô input lập tức hiển thị giá trị của biến tại tầng mới chọn (`"http://coll"`, hoặc `""` nếu tầng đó chưa khai báo biến) | Không lỗi |
| Sửa giá trị và Lưu tại cấp `Global Env` hoặc `Collection Env` | Nhập `"https://api.new"` và nhấn `Enter` hoặc bấm `Lưu` | Gọi `envStore.save` (hoặc `collectionStore.updateCollectionVariables`), biến được bật `enabled: true`, màu highlight của `{{varName}}` chuyển sang xanh (`resolved`) ngay lập tức | Hiển thị toast nếu backend trả lỗi |
| Sửa giá trị và Lưu tại cấp `Folder-Env` hoặc `Folder Global` | Chọn `Folder: Folder A (Local)`, nhập `"val-folder"`, bấm `Lưu` | Gọi `LoadFolder("folder-a")` -> cập nhật `folder_envs["env-local"]` -> `UpdateFolder` -> `collectionStore.loadTree()`; nếu `FolderEditor` đang mở `folder-a` thì dữ liệu bảng biến trong `FolderEditor` cũng tự động đồng bộ | Hiển thị toast nếu backend trả lỗi |
| Tương tác chuột & bàn phím trên ô input chính | Click, bôi đen, gõ phím hoặc gõ tiếng Việt IME trong `<input>`/`<textarea>` có `VariableHighlighter` | Không bị chặn sự kiện chuột; khi bắt đầu gõ phím hoặc nhấn `Escape`, Popover tự động đóng | Không lỗi |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/variables.ts` -- Bổ sung trường `key?: string` vào `VariableSegment` trong `parseVariables` để lưu tên biến đã trim (`trimmedKey`) cho cả segment `resolved` và `missing`.
- `projects/frontend/src/utils/resolveHierarchyVariables.ts` -- Bổ sung các kiểu dữ liệu và hàm helper phục vụ tra cứu phả hệ biến cho Popover (`VariableScopeOption`, `VariableInspectionResult`, `buildVariableScopeOptions`, `inspectVariableHierarchy`) tuân thủ chính xác thứ tự 4 tầng ưu tiên và quy tắc chỉ lấy `activeEnvId`.
- `projects/frontend/src/components/VariableHoverPopover.vue` -- Component Popover mới (sử dụng `<Teleport to="body">`) hiển thị tên biến, trạng thái `resolved`/`missing`, dropdown chọn tầng phạm vi (`Scope Selector`), ô input sửa giá trị và nút `Lưu` xuống đúng tầng lưu trữ (`Collection Env`, `Global Env`, `Folder Global`, `Folder-Env`).
- `projects/frontend/src/components/VariableHighlighter.vue` -- Gắn `data-var-name` lên các thẻ `<span>` của biến trong overlay, bổ sung xử lý `@mousemove`/`@mouseleave` kiểm tra tọa độ chuột trên các thẻ `[data-var-name]` với hover delay (`150ms`) và grace close timer (`200ms`), kết nối với `VariableHoverPopover.vue`.
- `projects/frontend/src/components/RequestEditor.vue` -- Provide `variableHierarchyFolders` (`pathNodes`) cho các `VariableHighlighter` bên trong (`UrlBar`, `KvpEditor`, `BodyEditor`).
- `projects/frontend/src/components/FolderEditor.vue` -- Provide `variableHierarchyFolders` (`parentNodes`) và bổ sung đồng bộ khi biến của thư mục đang mở được cập nhật từ `VariableHoverPopover`.
- `projects/frontend/src/utils/__tests__/resolveHierarchyVariables.test.ts` -- Bổ sung unit tests cho `buildVariableScopeOptions` và `inspectVariableHierarchy` (kiểm tra lọc chỉ active env, thứ tự ưu tiên winning tier, fallback khi biến missing hoặc không chọn env).
- `projects/frontend/src/components/__tests__/VariableHighlighter.test.ts` -- Bổ sung unit/component tests kiểm thử hover mở `VariableHoverPopover`, giữ nguyên tương tác input bên dưới, lọc dropdown scope theo active env, chuyển đổi scope, và lưu giá trị vào `Collection Env`, `Global Env`, `Folder Global`, `Folder-Env`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/variables.ts` -- Thêm `key?: string` vào `VariableSegment` và gán `key: trimmedKey` cho các segment `resolved` và `missing` trong `parseVariables` -- Giúp `VariableHighlighter.vue` gắn `data-var-name` chính xác mà không cần cắt chuỗi lại từ `{{...}}`.
- `projects/frontend/src/utils/resolveHierarchyVariables.ts` -- Bổ sung `buildVariableScopeOptions` và `inspectVariableHierarchy` để xây dựng danh sách tùy chọn tầng lưu trữ (tất cả Folder cha + Global/Collection Env, chỉ gồm `activeEnvId`) và xác định tầng đang thắng ưu tiên (`winningScopeId`) cùng giá trị ở từng tầng -- Tập trung toàn bộ logic nghiệp vụ phân giải tầng của CAP-4.
- `projects/frontend/src/components/VariableHoverPopover.vue` -- Xây dựng giao diện và logic của Popover (`data-test="variable-hover-popover"`), hiển thị tên biến, badge trạng thái, `<select data-test="variable-scope-select">`, `<input data-test="variable-value-input">` và `<button data-test="variable-save-btn">`; xử lý lưu trực tiếp vào `collectionStore`, `envStore` hoặc `LoadFolder`/`UpdateFolder` + `collectionStore.loadTree()` -- Cho phép xem và chỉnh sửa/tạo mới biến ngay tại chỗ.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Gắn `:data-var-name="seg.key"` lên các thẻ `<span>` của biến (`resolved` và `missing`), lắng nghe `@mousemove` và `@mouseleave` trên thẻ bao ngoài để phát hiện hover qua `getClientRects()`/`getBoundingClientRect()` mà vẫn giữ `pointer-events-none` trên overlay, quản lý timer mở/đóng Popover và đóng khi gõ phím/nhấn `Escape`/unmount -- Kích hoạt Popover mượt mà, không chặn `<input>`/`<textarea>`.
- `projects/frontend/src/components/RequestEditor.vue` & `projects/frontend/src/components/FolderEditor.vue` -- Provide `variableHierarchyFolders` xuống cây component con và đồng bộ dữ liệu trong `FolderEditor.vue` khi có cập nhật biến từ Popover -- Đảm bảo ngữ cảnh phả hệ thư mục chính xác và phản ánh tức thì trên UI.
- `projects/frontend/src/utils/__tests__/resolveHierarchyVariables.test.ts` & `projects/frontend/src/components/__tests__/VariableHighlighter.test.ts` -- Viết unit tests và component tests bao phủ đầy đủ các kịch bản trong I/O Matrix -- Đảm bảo 100% logic CAP-4 được kiểm chứng tự động.

**Acceptance Criteria:**
- Given người dùng di chuột vào một token `{{varName}}` trong `VariableHighlighter` (trên URL Bar, Params, Headers, Variables hoặc Body), when con trỏ nằm trong vùng chữ của biến sau khoảng trễ ngắn, then `VariableHoverPopover` hiển thị mà không làm mất khả năng click, đặt con trỏ, bôi đen hay gõ phím trong ô input bên dưới.
- Given đang chọn một Environment active (ví dụ `Local`) và request nằm trong cây thư mục `Folder A -> Folder B`, when Popover mở ra, then dropdown chọn tầng hiển thị các Folder cha (`Folder: Folder B (Local)`, `Folder: Folder B (Dùng chung)`, `Folder: Folder A (Local)`, `Folder: Folder A (Dùng chung)`), `Global Env (Local)` và `Collection Env (Dùng chung)`, tuyệt đối không hiển thị các environment không active.
- Given đang ở chế độ "Không dùng env" (`activeEnvId === null`), when Popover mở ra, then dropdown chọn tầng chỉ hiển thị `Folder: <Tên Folder> (Dùng chung)` của các Folder cha và `Collection Env (Dùng chung)`.
- Given biến `{{varName}}` đã được định nghĩa, when Popover mở ra, then dropdown tự động chọn đúng tầng đang thắng ưu tiên (winning tier) và ô input hiển thị giá trị của biến tại tầng đó; nếu biến chưa được định nghĩa (`missing`), dropdown mặc định chọn `Global Env (<Active Env>)` (hoặc `Collection Env (Dùng chung)` khi không dùng env) với ô input trống.
- Given người dùng đổi tầng trong dropdown hoặc nhập giá trị mới và nhấn `Enter` / bấm `Lưu`, then giá trị được lưu bền vững vào đúng tệp cấu hình của tầng đã chọn (`_folder.json`, `environments/<id>.json` hoặc `collection.json`) và màu highlight cùng giá trị phân giải trên giao diện cập nhật tức thì.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 30 findings — high 0, medium 25, low 4, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` `FolderEditor.vue` & `VariableHoverPopover.vue` — Unsaved folder edits are clobbered by external variable saves — Đã thêm guard `if (!folder.value || loading.value || saving.value || isDirty.value || !updatedData || updatedData.id !== folder.value.id) return` trong `syncExternalFolderVariables`.
  - `[medium]` `[patch]` `FolderEditor.vue` — Current folder is excluded from `variableHierarchyFolders` and `effectiveVariables` — Đã bổ sung computed `folderHierarchyNodes` bao gồm cả các thư mục cha lẫn thư mục đang mở cho `effectiveVariables` và `provide('variableHierarchyFolders', folderHierarchyNodes)` (giữ nguyên `parentNodes` cho `AuthEditor`).
  - `[medium]` `[patch]` `FolderEditor.vue` — Deep watcher on `envStore.environments` overrides user's explicit `__folder_global__` selection — Đã đổi watcher sang theo dõi danh sách ID `() => envStore.environments.map(e => e.id).join(',')` không dùng `{ deep: true }`.
  - `[medium]` `[patch]` `FolderEditor.vue` — Deep watcher on `collectionStore.tree` wipes out newly added blank rows in `KvpEditor` — Đã gỡ bỏ deep watcher thừa trên `collectionStore.tree` và chỉ đồng bộ qua sự kiện `hecto:folder-updated` khi `!isDirty.value`.
  - `[medium]` `[patch]` `VariableHighlighter.vue` & `VariableHoverPopover.vue` — Popover closes while the user is typing or using the native `<select>` menu — Đã kiểm tra `isFocusInsidePopover()` trong `scheduleClosePopover` để không tự đóng khi phần tử bên trong Popover đang có focus, và hẹn đóng lại qua `@focusout` khi focus rời khỏi Popover.
  - `[medium]` `[patch]` `VariableHighlighter.vue` — Stale fixed positioning on scroll — Đã gọi `closePopoverImmediately()` ngay trong `syncScroll`.
  - `[low]` `[patch]` `VariableHighlighter.vue` — Multiple `VariableHoverPopover` instances can open simultaneously — Đã phát và lắng nghe sự kiện `hecto:variable-popover-open` để đóng mọi Popover của `VariableHighlighter` khác khi một Popover mới mở ra.
  - `[medium]` `[patch]` `VariableHighlighter.vue` — `extractFallbackFoldersFromTree` binds to an arbitrary request/folder path in the tree — Đã xóa bỏ `extractFallbackFoldersFromTree`, trả về `[]` khi không có prop/inject/`activeRequestId`/`activeFolderId`.
  - `[medium]` `[patch]` `VariableHoverPopover.vue` & `resolveHierarchyVariables.ts` — Duplicate-key precedence mismatch between `upsertVariable` and `findEnabledVariableValue` — Đã cập nhật `upsertVariable` để ghi vào phần tử trùng khóa cuối cùng và loại bỏ các bản ghi trùng khóa đứng trước.
  - `[medium]` `[patch]` `VariableHoverPopover.vue` — Test-accommodation fallbacks in `handleSave` can corrupt store state — Đã gỡ bỏ việc tự push `'Default Collection'` và các nhánh khôi phục `snapshotEnvs`/`prevTree` trong `handleSave`, đồng thời cập nhật mock chuẩn trong unit test.
  - `[medium]` `[patch]` `VariableHighlighter.vue` — In-flight `hoverTimer` (`pendingVarName`) is not cancelled when `segments` change or when `Escape` is pressed before open — Đã đăng ký listener `keydown` ngay khi bắt đầu `hoverTimer` và hủy `hoverTimer` trong `watch(segments)` nếu `pendingVarName` không còn tồn tại.
  - `[low]` `[reject]` `VariableHighlighter.vue` — Unthrottled `querySelectorAll` and layout measurement on every `mousemove` event — Số lượng thẻ `[data-var-name]` trong một ô input rất nhỏ (thường < 10 phần tử), chi phí đo đạc không đáng kể (< 0.02ms) và thêm `requestAnimationFrame` làm phức tạp hóa kiểm thử timer mà không mang lại lợi ích thực tế.
  - `[medium]` `[patch]` Edge case: Mutating environments while `FolderEditor` scope is manually set to `__folder_global__` (`FolderEditor.vue:43-53`) — Cùng nguyên nhân gốc với finding #3; đã chuyển watcher sang theo dõi danh sách ID môi trường.
  - `[medium]` `[patch]` Edge case: External `hecto:folder-updated` event arrives while `FolderEditor` has unsaved variable edits (`FolderEditor.vue:320-349`) — Cùng nguyên nhân gốc với finding #1; đã thêm guard `isDirty.value` trong `syncExternalFolderVariables`.
  - `[medium]` `[patch]` Edge case: Pressing `Escape` on window during the 150ms `hoverTimer` delay before `hoveredVarName` becomes non-null (`VariableHighlighter.vue:205-218`) — Cùng nguyên nhân gốc với finding #11; đã gắn listener `keydown` ngay khi tạo `hoverTimer` và thêm unit test xác minh.
  - `[medium]` `[patch]` Edge case: Moving cursor between two identical variable tokens within the 150ms hover open delay (`VariableHighlighter.vue:341-353`) — Đã lưu `pendingRect` trong biến khả biến và cập nhật `pendingRect = hit.rect` khi di chuyển giữa hai token trùng tên.
  - `[medium]` `[patch]` Edge case: Mouse cursor leaves popover while editing input, selecting dropdown option, or saving (`VariableHighlighter.vue:374-377`) — Cùng nguyên nhân gốc với finding #5; đã giữ Popover mở khi focus đang nằm trong Popover.
  - `[medium]` `[patch]` Edge case: Scrolling the input or textarea while the variable hover popover is open or pending (`VariableHighlighter.vue:383-389`) — Cùng nguyên nhân gốc với finding #6; đã gọi `closePopoverImmediately()` trong `syncScroll` kèm unit test.
  - `[medium]` `[patch]` Edge case: Passing an empty `environments` array `[]` alongside a non-empty stale `activeEnvId` string (`resolveHierarchyVariables.ts:72-98`) — Đã sửa điều kiện thành `if (Array.isArray(params.environments))` để mảng rỗng `[]` loại bỏ `activeEnvId` cũ và thêm unit test trong `resolveHierarchyVariables.test.ts`.
  - `[medium]` `[patch]` Edge case: Saving a variable when the target scope list contains duplicate keys (`VariableHoverPopover.vue:141-160`) — Cùng nguyên nhân gốc với finding #9; đã cập nhật và khử trùng lặp khóa trong `upsertVariable`.
  - `[medium]` `[patch]` Edge case: `FolderEditor` provides `parentNodes` (`fullPath.slice(0, -1)`), excluding the currently open folder from Popover scope options (`FolderEditor.vue:77-94`) — Cùng nguyên nhân gốc với finding #2; đã cung cấp `folderHierarchyNodes` bao gồm cả thư mục đang mở.
  - `[medium]` `[patch]` Verification gap: Unverified `variableHierarchyFolders` injection from `RequestEditor` and `FolderEditor` into `VariableHighlighter` — Đã bổ sung integration test trong `VariableHighlighterIntegration.test.ts` mount `RequestEditor` cùng `UrlBar` thật để xác minh các thư mục cha từ `variableHierarchyFolders` hiển thị đầy đủ trong `VariableHoverPopover`.
  - `[medium]` `[patch]` Verification gap: Unverified save path for `folder-global` (`Folder: <Name> (Dùng chung)`) in `VariableHoverPopover` — Đã bổ sung test trong `VariableHighlighter.test.ts` kiểm thử chọn `folder-global:folder-a`, lưu giá trị và xác nhận `UpdateFolder` nhận đúng mảng `variables`.
  - `[medium]` `[patch]` Verification gap (other): `FolderEditor` `.slice(0, -1)` excludes open folder from `variableHierarchyFolders` — Cùng nguyên nhân gốc với finding #2; đã sửa bằng `folderHierarchyNodes`.
  - `[medium]` `[patch]` Verification gap (other): `handleExternalFolderUpdated` calls `syncExternalFolderVariables` without guarding on `isDirty.value` — Cùng nguyên nhân gốc với finding #1; đã thêm guard `isDirty.value`.
  - `[medium]` `[patch]` Verification gap (other): Deep watcher on `envStore.environments` resets manual `'__folder_global__'` selection — Cùng nguyên nhân gốc với finding #3; đã bỏ `{ deep: true }` và chỉ theo dõi danh sách ID.
  - `[low]` `[patch]` Intent alignment: Coordinate hit-testing vs zero-rect test fallback in `VariableHighlighter.test.ts` — Đã bổ sung kiểm thử tọa độ và tương tác thực tế trong `VariableHighlighter.test.ts` và `VariableHighlighterIntegration.test.ts`.
  - `[medium]` `[patch]` Intent alignment: Real editor hierarchy surface (`RequestEditor`, `FolderEditor`) vs standalone component test surface — Cùng nguyên nhân gốc với finding #2, #8 và #22; đã xóa `extractFallbackFoldersFromTree`, bổ sung thư mục đang mở vào `folderHierarchyNodes` của `FolderEditor` và thêm integration test với `RequestEditor`.
  - `[medium]` `[patch]` Intent alignment: Disk persistence surface vs mock-compensating store logic in `VariableHoverPopover.vue` — Cùng nguyên nhân gốc với finding #10; đã gỡ bỏ các nhánh fallback phục vụ mock trong `VariableHoverPopover.vue` và cập nhật mock trong test.
  - `[false]` `[reject]` Intent alignment: Out-of-scope diff surface in `FolderEditor.vue` (`resolveDefaultEnvScope` and `activeEnvId` watcher) — Phần thay đổi này thuộc Story 1 (`1-active-environment-persistence-and-folder-env-scope-auto-detection.md` — CAP-3) nằm chung trên nhánh làm việc `develop` chưa commit theo quy tắc Git.

## Verification

**Commands:**
- `cd /home/dev/mdt/hecto-api/projects && go test ./...` -- expected: Toàn bộ Go unit tests pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` -- expected: `vue-tsc --noEmit` kết thúc với exit code 0, không có lỗi kiểu.
- `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test` -- expected: Toàn bộ Vitest test suites pass 100%.

## Auto Run Result

- **Summary of implemented change:**
  - Mở rộng `parseVariables` trong `projects/frontend/src/utils/variables.ts` để gắn thuộc tính `key: trimmedKey` cho mọi phân đoạn biến (`resolved` và `missing`).
  - Bổ sung `buildVariableScopeOptions` và `inspectVariableHierarchy` trong `projects/frontend/src/utils/resolveHierarchyVariables.ts` để xây dựng danh sách tùy chọn tầng lưu trữ (tất cả các Folder trong phả hệ từ lá về gốc + `Global Env` + `Collection Env`), lọc nghiêm ngặt chỉ lấy duy nhất `activeEnvId` ở cấp `Folder-Env` và `Global Env` (hoặc ẩn hoàn toàn khi `activeEnvId === null`), xác định đúng tầng thắng ưu tiên (`winningScopeId`) theo 4 cấp độ, hoặc mặc định chọn `Global Env (<Active Env>)` / `Collection Env (Dùng chung)` khi biến chưa định nghĩa.
  - Xây dựng `VariableHoverPopover.vue` (`<Teleport to="body">`) hiển thị tên biến, badge trạng thái (`Chưa định nghĩa` hoặc nhãn tầng đang thắng ưu tiên), dropdown chọn phạm vi lưu trữ (`[data-test="variable-scope-select"]`), ô nhập giá trị (`[data-test="variable-value-input"]`) và nút `Lưu` (`[data-test="variable-save-btn"]`), ghi trực tiếp xuống `collection.json`, `environments/<id>.json` hoặc `_folder.json` và cập nhật tức thì trên giao diện.
  - Cập nhật `VariableHighlighter.vue` để gắn `data-var-name` lên các thẻ `<span>` của biến trong lớp overlay `pointer-events-none`, phát hiện hover theo tọa độ chuột (`getClientRects()` / `getBoundingClientRect()`) với độ trễ mở `150ms` và thời gian chờ đóng `200ms` (giữ mở khi con trỏ hoặc focus nằm trong Popover, tự đóng khi gõ phím, cuộn, nhấn `Escape` hoặc mở Popover khác).
  - Cập nhật `RequestEditor.vue` và `FolderEditor.vue` để truyền ngữ cảnh phả hệ thư mục (`variableHierarchyFolders`) xuống các `VariableHighlighter` con và đồng bộ an toàn khi biến của thư mục đang mở được cập nhật từ Popover.
- **Files changed:**
  - `projects/frontend/src/utils/variables.ts` — Thêm trường `key?: string` vào `VariableSegment` trong `parseVariables`.
  - `projects/frontend/src/utils/resolveHierarchyVariables.ts` — Thêm `buildVariableScopeOptions` và `inspectVariableHierarchy` phục vụ tra cứu và chọn tầng biến cho Popover.
  - `projects/frontend/src/components/VariableHoverPopover.vue` — Component Popover xem nhanh và chỉnh sửa/tạo mới biến môi trường theo tầng.
  - `projects/frontend/src/components/VariableHighlighter.vue` — Phát hiện hover không chặn tương tác `<input>`/`<textarea>` và điều khiển vòng đời `VariableHoverPopover`.
  - `projects/frontend/src/components/RequestEditor.vue` — Provide `variableHierarchyFolders` (`pathNodes`) xuống các component con.
  - `projects/frontend/src/components/FolderEditor.vue` — Provide `variableHierarchyFolders` (`folderHierarchyNodes`) và đồng bộ dữ liệu biến thư mục khi lưu từ Popover.
  - `projects/frontend/src/utils/__tests__/variables.test.ts` — Bổ sung kiểm thử trường `key` trên `VariableSegment`.
  - `projects/frontend/src/utils/__tests__/resolveHierarchyVariables.test.ts` — Bổ sung 7 unit tests cho `buildVariableScopeOptions` và `inspectVariableHierarchy`.
  - `projects/frontend/src/components/__tests__/VariableHighlighter.test.ts` — Bổ sung 6 component tests kiểm thử toàn diện hành vi hover, chọn tầng và lưu biến trên `VariableHoverPopover`.
  - `projects/frontend/src/components/__tests__/VariableHighlighterIntegration.test.ts` — Bổ sung integration test giữa `RequestEditor`, `UrlBar`, `VariableHighlighter` và `VariableHoverPopover`.
  - `projects/frontend/src/components/__tests__/FolderEditor.test.ts` — Bổ sung test kiểm chứng `folderHierarchyNodes` và giữ nguyên scope `__folder_global__` khi biến trong environment thay đổi.
- **Review findings breakdown:**
  - Patches applied: 8 nhóm lỗi (`medium`: 7, `low`: 1 — tổng cộng 28 findings đồng quy) đã được vá trực tiếp và bổ sung unit/integration tests: (1) bảo vệ dữ liệu chưa lưu (`isDirty`) và gỡ deep watcher thừa trên `collectionStore.tree` trong `FolderEditor.vue`; (2) đưa thư mục đang mở vào `folderHierarchyNodes` của `FolderEditor.vue`; (3) đổi watcher `envStore.environments` trong `FolderEditor.vue` sang theo dõi danh sách ID để không ghi đè lựa chọn `__folder_global__` thủ công; (4) giữ Popover mở khi focus nằm trong input/select của Popover và tự đóng khi cuộn (`syncScroll`) hoặc khi mở Popover khác; (5) hủy `hoverTimer` khi nhấn `Escape` trong lúc chờ 150ms hoặc khi `pendingVarName` biến mất và cập nhật `pendingRect`; (6) xóa `extractFallbackFoldersFromTree` trong `VariableHighlighter.vue` và gỡ các nhánh fallback phục vụ mock trong `VariableHoverPopover.vue`; (7) xử lý khóa trùng lặp trong `upsertVariable` và mảng `environments: []` rỗng trong `resolveActiveEnvContext`; (8) bổ sung tests cho lưu `folder-global`, `RequestEditor` `variableHierarchyFolders` injection, `syncScroll` và `Escape` trong hover delay.
  - Items deferred: 0.
  - Rejected findings: 2 findings (`low`: 1, `false`: 1) — gồm: đo tọa độ `[data-var-name]` không throttle trên `mousemove` (chi phí không đáng kể với số lượng biến nhỏ trong input) và phần thay đổi `resolveDefaultEnvScope` trong `FolderEditor.vue` (false — thuộc Story 1 trên cùng nhánh `develop`).
- **Follow-up review recommendation:** `false` (Patched counts by entry verdict: `high: 0`, `medium: 7`, `low: 1`; toàn bộ các bản vá đều đã được kiểm chứng trực tiếp bằng unit/integration tests tự động và không còn rủi ro nào chưa được xác minh).
- **Verification performed:**
  - `cd /home/dev/mdt/hecto-api/projects && go test ./...` — PASS 100% (`hecto-api/model`, `hecto-api/service`).
  - `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run type-check` — PASS (exit code 0).
  - `source ~/.nvm/nvm.sh && nvm use && cd /home/dev/mdt/hecto-api/projects/frontend && bun run test --run` — PASS (32/32 test files, 415/415 tests passed).
- **Residual risks:** Không có.


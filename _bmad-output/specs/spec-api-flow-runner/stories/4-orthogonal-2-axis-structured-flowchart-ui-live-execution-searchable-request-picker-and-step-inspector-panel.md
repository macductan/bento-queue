---
title: 'Orthogonal 2-Axis Structured Flowchart UI ([ ↕ Dọc | ↔ Ngang ]), Live Execution, Searchable Request Picker & Step Inspector Panel'
status: 'done'
story_id: '4'
parent_spec: '_bmad-output/specs/spec-api-flow-runner/SPEC.md'
context:
  - '_bmad-output/specs/spec-api-flow-runner/SPEC.md'
  - '_bmad-output/specs/spec-api-flow-runner/flow-architecture-and-schema.md'
  - '_bmad-output/specs/spec-api-flow-runner/stories.yaml'
  - 'projects/frontend/src/utils/flowRunner.ts'
  - 'projects/frontend/src/utils/headless-engine.ts'
  - 'projects/frontend/src/stores/flowStore.ts'
  - 'projects/frontend/src/stores/uiStore.ts'
  - 'projects/frontend/src/stores/collectionStore.ts'
  - 'projects/frontend/src/stores/requestStore.ts'
  - 'projects/frontend/src/stores/responseStore.ts'
  - 'projects/frontend/src/stores/environmentStore.ts'
  - 'projects/frontend/src/stores/tabStore.ts'
  - 'projects/frontend/src/components/ResponseViewer.vue'
  - 'projects/frontend/src/components/ContentArea.vue'
  - 'projects/frontend/src/components/__tests__/ResponseViewer.test.ts'
---

## Why

Để lập trình viên thiết kế và chạy kiểm thử kịch bản API phức tạp trực tiếp trên giao diện đồ họa mà không phải nối dây thủ công hay cuộn 2 chiều lộn xộn, Hecto API cần giao diện **Structured Flowchart** tự động căn chỉnh theo quy tắc **2 Trục Vuông góc (Orthogonal 2-Axis Layout)** kèm nút đảo hướng **`[ ↕ Dọc | ↔ Ngang ]`**, modal chọn nhanh Request có tìm kiếm (**Searchable Request Picker**), bộ chạy trực tiếp trên UI hỗ trợ cả Tuần tự, Hàng Song song (`Promise.all`) và Rẽ nhánh 3 chế độ, cùng bảng **Step Inspector Panel** tái sử dụng `ResponseViewer.vue` và nút **`Mở Request gốc ↗`** (CAP-3, CAP-5).

## What Changes

1. **Mở rộng `ResponseViewer.vue` (`projects/frontend/src/components/ResponseViewer.vue`)**:
   - Bổ sung prop tùy chọn `overrideData`:
     ```ts
     export interface ResponseViewerOverrideData {
       response?: ExecuteResponse | null
       error?: { code: string; message: string } | null
       executionLogs?: ExecutionLogRecord[]
       scriptLogs?: string[]
       scriptError?: string | null
       testResults?: Array<{ name: string; passed: boolean; error?: string }>
       loading?: boolean
     }
     ```
   - Khi `props.overrideData` không được truyền: giữ nguyên 100% hành vi hiện tại đọc từ `responseStore`.
   - Khi `props.overrideData` được truyền: hiển thị `response`, `error`, `executionLogs`, `scriptLogs`, `scriptError`, `loading` từ `overrideData`, đồng thời nếu `overrideData.testResults` có phần tử thì hiển thị danh sách kết quả assertion `ha.test()` (hoặc tab `Tests ({{ passed }}/{{ total }})` / khu vực hiển thị Pass/Fail rõ ràng) và ẩn nút thu gọn `collapse-response-btn` của màn APIs nếu đang nhúng trong `StepInspectorPanel`.

2. **Tạo `RequestPickerModal.vue` (`projects/frontend/src/components/flow/RequestPickerModal.vue`)**:
   - Modal/Popover **Searchable Request Picker** (`data-test="request-picker-modal"`):
     - Duyệt đệ quy `collectionStore.tree` để lấy danh sách phẳng mọi Request kèm badge HTTP Method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, ...) và đường dẫn Folder cha (ví dụ: `"Auth / Login"`, hoặc `"Root"` nếu ở gốc collection).
     - Ô tìm kiếm (`data-test="request-picker-search-input"`) tự động focus khi mở, lọc nhanh theo tên Request, HTTP Method, đường dẫn Folder hoặc URL.
     - Hỗ trợ điều hướng bằng phím mũi tên (`ArrowDown`, `ArrowUp`), nhấn `Enter` hoặc click chuột vào dòng (`data-test="request-picker-item"`) để chọn Request và emit `@select="(requestId: string) => ..."` rồi đóng modal; nhấn `Escape` để đóng (`@close`).

3. **Tạo bộ Component Sơ đồ khối trong `projects/frontend/src/components/flow/`**:
   - **`EmptyStateFlow.vue`**: hiển thị khi `uiStore.workspaceMode === 'flows'` nhưng chưa có Flow nào được chọn (`!flowStore.currentFlow`), có nút `"Tạo Flow mới"` (`data-test="empty-state-create-flow-btn"`) gọi `flowStore.createFlow()`.
   - **`FlowToolbar.vue`**:
     - Ô chỉnh sửa tên Flow (`data-test="flow-name-input"`) và mô tả ngắn.
     - Ô chỉnh `timeout_ms` mặc định của Flow (`data-test="flow-timeout-input"`) và `max_steps` (`data-test="flow-max-steps-input"`).
     - Nút gạt đảo hướng toàn sơ đồ **`Bố cục: [ ↕ Dọc | ↔ Ngang ]`** (`data-test="flow-layout-toggle"`, hoặc 2 nút con `data-test="flow-layout-vertical"` / `data-test="flow-layout-horizontal"` bên trong `data-test="flow-layout-toggle"`), cập nhật `flowStore.currentFlow.direction` giữa `'vertical'` và `'horizontal'`.
     - Nút **Lưu** (`data-test="flow-save-btn"`, hiển thị trạng thái chưa lưu / `Ctrl+S`).
     - Nút **`▶ Chạy Flow`** (`data-test="flow-run-btn"`) khi `!flowStore.isRunning` và nút **`⏹ Dừng`** (`data-test="flow-stop-btn"`) khi `flowStore.isRunning`.
     - Thanh tổng kết trạng thái chạy (`data-test="flow-run-summary"`): hiển thị tổng số bước Passed (xanh lá), Failed (đỏ), Skipped (xám) và tổng thời gian chạy (`duration_ms` ms).
   - **`FlowStepCard.vue`**:
     - Hiển thị thông tin một `FlowStep` (`data-test="flow-step-card"`, `:data-step-id="step.id"`, `:data-step-status="stepState?.status || 'idle'"`):
       - Tra cứu Request gốc trong `collectionStore.tree` theo `step.request_id`.
       - Nếu tìm thấy Request gốc: hiển thị badge HTTP Method, tên Request (hoặc `step.name` nếu có đặt tên riêng), đường dẫn Folder cha.
       - Nếu Request gốc **không tồn tại** (đã bị xóa khỏi Collection): hiển thị viền đỏ + cảnh báo **`⚠ Request gốc đã bị xóa`** (`data-test="flow-step-missing-warning"`) và nút chọn lại Request khác qua `RequestPickerModal`.
       - Hiển thị trạng thái thực thi thời gian thực:
         - `idle`: viền mặc định.
         - `running`: viền xanh dương nhấp nháy + spinner.
         - `passed`: viền xanh lá + badge `status_code` & `duration_ms` ms + số `Tests Passed`.
         - `failed`: viền đỏ + badge lỗi / `status_code` & số `Tests Failed`.
         - `skipped`: viền xám mờ (`opacity-60`) + nhãn `Đã bỏ qua (Skipped)`.
       - Các nút thao tác trên khối:
         - Bật/tắt `step.enabled` (`data-test="flow-step-toggle-enabled"`).
         - Sửa tên tùy chọn / `timeout_ms` riêng của bước (`data-test="flow-step-timeout-input"`).
         - Đổi Request khác (`data-test="flow-step-change-request-btn"`).
         - Nút **`|| Song song`** (`data-test="flow-add-parallel-step-btn"`) trên khối để thêm một bước chạy song song cùng hàng trong `FlowNode` hiện tại.
         - Xóa bước (`data-test="flow-delete-step-btn"`).
       - Click vào khối bước sẽ chọn bước đó (`flowStore.selectStep(step.id)`) để mở `StepInspectorPanel`.
   - **`FlowBranchEditor.vue`**:
     - Cho phép thêm/sửa/xóa các nhánh rẽ (`FlowBranch`) trên một `FlowNode` (`data-test="flow-branch-container"`):
       - Hỗ trợ 3 chế độ điều kiện (`branch.condition.type`):
         1. **`✅ Thành công (Success)`** (`type: 'success'`): chạy khi bước/hàng cha Passed.
         2. **`❌ Khi Lỗi (Error / Catch)`** (`type: 'error'`): chạy khi bước/hàng cha Failed.
         3. **`⚡ Điều kiện tùy chỉnh (Custom)`** (`type: 'custom'`): giao diện 3 ô chọn trực quan trên 1 hàng (`data-test="flow-custom-condition-row"`):
            - Ô 1 — Nguồn (`data-test="branch-condition-source"`): `status_code` (`Status Code`) | `body_json` (`Body JSON path`, kèm ô nhập `json_path` như `data.status` tại `data-test="branch-condition-json-path"`) | `variable` (`Biến`, kèm ô nhập tên biến tại `data-test="branch-condition-variable"`).
            - Ô 2 — Toán tử (`data-test="branch-condition-operator"`): `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `matches`, `exists`.
            - Ô 3 — Giá trị (`data-test="branch-condition-value"`, ẩn khi `operator === 'exists'`).
       - Mỗi nhánh hiển thị danh sách đệ quy `FlowNodeList` cho `branch.nodes` bên dưới/bên cạnh để thêm bước con vào nhánh (`data-test="flow-branch-add-step-btn"`).
       - Khi một nhánh không được chọn lúc chạy (`skipped`), làm mờ nhánh đó (`data-branch-status="skipped"`).
   - **`FlowNodeList.vue`**:
     - Component đệ quy hiển thị mảng `FlowNode[]` theo quy tắc **2 Trục Vuông góc Tự động (Orthogonal 2-Axis Layout)**:
       - Khi `direction === 'vertical'` (`↕ Dọc`):
         - Trục chính (Main Axis — chuỗi `FlowNode[]` nối tiếp nhau): xếp dọc (`flex-col items-center`), nối bằng mũi tên `↓`.
         - Trục phụ (Cross Axis — các `FlowStep` song song `||` trong cùng 1 `FlowNode`, và các `FlowBranch` rẽ nhánh `↙ ↘` của 1 `FlowNode`): tự động bung ngang (`flex-row items-start justify-center gap-4`).
       - Khi `direction === 'horizontal'` (`↔ Ngang`):
         - Trục chính (Main Axis — chuỗi `FlowNode[]` nối tiếp nhau): xếp ngang (`flex-row items-center`), nối bằng mũi tên `→`.
         - Trục phụ (Cross Axis — các `FlowStep` song song `||` trong cùng 1 `FlowNode`, và các `FlowBranch` rẽ nhánh của 1 `FlowNode`): tự động bung dọc (`flex-col items-start justify-center gap-4`).
       - Giữa các `FlowNode` và ở cuối danh sách có nút **`+ Thêm bước`** (`data-test="flow-add-step-btn"`) mở `RequestPickerModal` để chèn `FlowNode` mới.
       - Trên mỗi `FlowNode` có nút **`+ Rẽ nhánh`** (`data-test="flow-add-branch-btn"`) để thêm nhánh (`success` / `error` / `custom`), nút di chuyển khối lên/xuống (hoặc kéo-thả sắp xếp khối `FlowNode`).
   - **`StepInspectorPanel.vue`**:
     - Hiển thị ở nửa dưới màn hình (`data-test="step-inspector-panel"`) khi `flowStore.selectedStepId` đang chọn một bước trong Flow:
       - Thanh tiêu đề hiển thị: Tên bước, badge HTTP Method + đường dẫn URL đã thực thi, trạng thái (`Passed` / `Failed` / `Skipped` / `Running` / `Chưa chạy`), danh sách tóm tắt kết quả `ha.test()` (nếu có), nút **`Mở Request gốc ↗`** (`data-test="open-original-request-btn"`) và nút đóng panel (`data-test="close-step-inspector-btn"`).
       - Khi nhấn **`Mở Request gốc ↗`**:
         - Nếu Request gốc tồn tại trong `collectionStore.tree`: chuyển `uiStore.setWorkspaceMode('apis')`, gọi `collectionStore.selectRequest(step.request_id)` (mở đúng tab Request gốc trên `tabStore` và nạp vào `requestStore`).
         - Nếu Request gốc đã bị xóa: hiện toast cảnh báo `'Request gốc đã bị xóa khỏi Collection'`.
       - Nội dung bên dưới tái sử dụng trực tiếp `<ResponseViewer :overrideData="selectedStepViewerData" />`.
   - **`FlowEditor.vue`** & tích hợp vào **`ContentArea.vue`**:
     - Trong `ContentArea.vue`:
       - Khi `uiStore.workspaceMode === 'flows'`: hiển thị `<FlowEditor v-if="flowStore.currentFlow" />` hoặc `<EmptyStateFlow v-else />`.
       - Khi `uiStore.workspaceMode === 'apis'`: giữ nguyên 100% bố cục `AppTabBar` + `RequestEditor` / `FolderEditor` / `EmptyStateRequest` + `ResponseViewer`.

4. **Hiện thực hóa `runCurrentFlow()` và `stopCurrentFlow()` trong `flowStore.ts` (`projects/frontend/src/stores/flowStore.ts`)**:
   - `runCurrentFlow()`:
     - Sử dụng các hàm dùng chung từ `flowRunner.ts` (`evaluateStepVerdict`, `selectMatchingBranch`, `mergeParallelScriptUpdates`) + `headless-engine.ts` (`prepareRequestExecution`, `finalizeResponseExecution`, `resolveHierarchyVariables`) và Wails `SendRequest` / `AbortRequest` / `GetRequest`:
     - Trước khi chạy:
       - Đặt `isRunning = true`, xóa `lastRunSummary = null`, khởi tạo `stepStates` và `branchStates` cho toàn bộ step/branch trên sơ đồ về trạng thái `'idle'`.
       - Tải bản chụp `collectionStore.activeCollection`, `envStore.environments`, danh sách tất cả folders từ `collectionStore.tree` (nạp đầy đủ qua `LoadFolder` hoặc từ `collectionStore.tree`), và `activeEnvId = envStore.activeEnvId`.
     - Duyệt đệ quy `currentFlow.nodes` tôn trọng `max_steps` (mặc định `100`, nếu vượt quá thì đánh dấu lỗi vượt quá số bước tối đa và dừng):
       - Với các step có `enabled === false`: đánh dấu `status: 'skipped'`.
       - Kiểm tra nếu Request gốc không tồn tại (`GetRequest(step.request_id)` thất bại hoặc không có trong tree): đánh dấu step `status: 'failed'`, `error: "Request gốc không tồn tại (đã bị xóa)"`.
       - **Bước đơn (1 step enabled)**:
         - Đặt `stepStates[step.id].status = 'running'`.
         - Chạy `prepareRequestExecution` -> gọi `SendRequest(execReq)` (với `timeout_ms: step.timeout_ms > 0 ? step.timeout_ms : (currentFlow.timeout_ms || 0)`) -> chạy `finalizeResponseExecution`.
         - Áp dụng cập nhật biến/auth qua `mergeParallelScriptUpdates` cho 1 step và lưu xuống đĩa qua `envStore.applyVariableUpdates` / `applyScopedVariableUpdates` / `applyScopedAuthUpdates`.
         - Đánh giá kết quả qua `evaluateStepVerdict` -> cập nhật `stepStates[step.id]` (`status: 'passed' | 'failed'`, `response`, `error`, `testResults`, `executionLogs`, `scriptLogs`, `scriptError`, `durationMs`).
       - **Hàng Song song (`>= 2` steps enabled trong cùng `FlowNode`)**:
         - Đặt tất cả các step enabled trong hàng sang `status: 'running'`.
         - Chụp bản sao (deep clone) ngữ cảnh biến/collection/env/folder trước khi chạy hàng.
         - Chạy đồng thời tất cả các step trong hàng bằng `await Promise.all(...)` trên bản sao ngữ cảnh độc lập.
         - Sau khi tất cả các step trong hàng hoàn tất: gọi `mergeParallelScriptUpdates` theo đúng thứ tự khai báo từ trái sang phải (`0 -> N-1`) rồi mới lưu cập nhật biến/auth xuống đĩa **đúng 1 lần**.
       - **Đánh giá rẽ nhánh (`node.branches`)**:
         - Gọi `selectMatchingBranch(node.branches, nodePassed, evalStepInput, currentResolvedVars)`.
         - Đánh dấu các nhánh trong `skippedBranchIds` (và toàn bộ các step con bên trong các nhánh đó) là `'skipped'`.
         - Nếu có `matchedBranchId`: thực thi đệ quy `matchedBranch.nodes`.
         - Nếu không có nhánh nào khớp (`matchedBranchId === null`) và `!nodePassed`: đánh dấu toàn bộ các node tiếp theo là `'skipped'` và dừng Flow.
     - Cuối phiên chạy: cập nhật `lastRunSummary` (`status`, `stepsTotal`, `stepsPassed`, `stepsFailed`, `stepsSkipped`, `durationMs`) và đặt `isRunning = false`.
   - `stopCurrentFlow()`:
     - Đặt cờ hủy chạy, gọi `await AbortRequest()` để hủy toàn bộ các HTTP Request đang bay ở Go backend, đánh dấu các bước đang `running` hoặc chưa chạy là `failed`/`skipped`, và đặt `isRunning = false`.

5. **Kiểm thử tự động (Vitest)**:
   - Tạo `projects/frontend/src/components/__tests__/FlowEditor.test.ts` (hoặc bộ test tương đương cho `FlowEditor`, `RequestPickerModal`, `StepInspectorPanel`, `ResponseViewer`):
     - Kiểm thử `ResponseViewer.vue` khi truyền `overrideData` (hiển thị response, testResults, logs độc lập với `responseStore`).
     - Kiểm thử `RequestPickerModal.vue`: hiển thị danh sách Request kèm HTTP Method + đường dẫn Folder cha, lọc theo từ khóa tìm kiếm, chọn Request emit đúng ID.
     - Kiểm thử `FlowEditor.vue`:
       - Đảo hướng toàn cục `[ ↕ Dọc | ↔ Ngang ]` (`data-test="flow-layout-toggle"`), kiểm tra class bố cục trực giao (`flex-col` / `flex-row`) của trục chính và trục phụ.
       - Thêm bước tuần tự (`+`), thêm bước song song (`||`), thêm nhánh rẽ 3 chế độ (`success`, `error`, `custom` 3 ô).
       - Hiển thị cảnh báo đỏ khi Request gốc bị xóa (`data-test="flow-step-missing-warning"`).
       - Chạy Flow trực tiếp (`runCurrentFlow`): tuần tự, hàng song song `Promise.all` truyền biến không race condition, rẽ nhánh 3 chế độ (`success`, `error`, `custom`), hiển thị màu sắc `passed` / `failed` / `skipped`.
       - Click vào một khối bước mở `StepInspectorPanel` (`data-test="step-inspector-panel"`), hiển thị chi tiết kết quả và click nút **`Mở Request gốc ↗`** (`data-test="open-original-request-btn"`) chuyển `uiStore.workspaceMode` về `'apis'` và chọn đúng Request gốc.

## Verification

- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run build:headless` pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` pass 100%.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` pass 100%.
- `cd projects && go test ./... && go build -o build/bin/hecto ./cmd/hecto` pass 100%.

---
runScope: 'system-level'
runKey: 'system'
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T14:02:00+07:00'
---

## Step 1: Detect Mode & Prerequisites

### 3. Confirm Mode
- **Mode Used:** System-Level
- **Reason:** Theo lựa chọn của người dùng (User intent).

### 2. Prerequisite Check
- PRD: Có sẵn tại `_bmad-output/planning-artifacts/prds/prd-hecto-api-2026-09-21/`.
- Architecture: Có sẵn tại `_bmad-output/planning-artifacts/architecture/architecture-hecto-api-2026-09-22/`.

### 4. Resolve Run Identity
- `run_scope`: `system-level`
- `run_key`: `system`

### 5. Check for an Existing Checkpoint
- Không tìm thấy checkpoint cũ, đây là lượt chạy mới.

Tiếp tục chuyển sang bước 2.

## Step 2: Load Context & Knowledge Base

### 1. Load Configuration
- Stack detected: Fullstack (Go backend + Vue frontend)
- `tea_use_playwright_utils`: true
- `tea_use_pactjs_utils`: true
- `tea_pact_mcp`: "mcp"
- `tea_browser_automation`: "auto"

### 2. Load Project Artifacts (System-Level)
- **Tech stack**: Go 1.27.1, Node.js 24.21.0, Wails, Vue 3, TypeScript, Pinia, Tailwind CSS, net/http.
- **Integration points**: Local File System (lưu Collection, Environments dưới dạng JSON), External HTTP endpoints (gọi API).
- **NFRs**:
  - Performance: Khởi động < 2 giây, RAM < 100MB (SM-2).
  - Reliability: Hoạt động bình thường khi offline / đổi VPN (SM-3), không crash/đơ khi lỗi kết nối mạng (FR-1).
  - Usability/Integrity: File lưu trữ trên disk dạng JSON đọc được và có thể commit vào Git.
  - NFR thresholds missing: Chưa có con số định lượng cho thời gian phản hồi UI ngoài khởi động, thời gian import Postman.

### 4. Load Knowledge Base Fragments
Các tài liệu knowledge base sau đã được chọn dựa trên context (từ thư mục resources của skill):
- `adr-quality-readiness-checklist.md`
- `nfr-criteria.md`
- `test-levels-framework.md`
- `risk-governance.md`
- `test-quality.md`
- `playwright-cli.md` (do `tea_browser_automation` = "auto")

*(Bỏ qua Pact.js và contract testing vì ứng dụng là HTTP client linh hoạt, không cung cấp API provider contract nào).*

### 5. Confirm Loaded Inputs
Đã nạp toàn bộ cấu hình, tài liệu (PRD, Architecture Spine) và Knowledge Fragments cần thiết. Mọi thông tin đầu vào đã sẵn sàng cho bước thiết kế kiểm thử.

## Step 3: Testability & Risk Assessment

### 1. Testability Review (System-Level)
Đánh giá mức độ dễ kiểm thử của kiến trúc dự án (Wails + Go + Vue):

**✅ Testability Assessment Summary:**
- **Controllability (Khả năng điều khiển):** Tốt. Go backend được chia thành các layer rõ ràng (`app.go` -> `service` -> `storage/executor`). Storage mockable và cấu hình thư mục lưu trữ collection là tùy biến (XDG data dir), rất dễ dàng cho việc cô lập dữ liệu (seed data/temp dir) khi test.
- **Observability (Khả năng quan sát):** Rất tốt. File collection lưu dưới dạng JSON rõ ràng trên ổ cứng -> có thể kiểm tra trực tiếp file sau mỗi thao tác. Giao tiếp giữa Go và Vue qua Wails được chuẩn hóa bằng struct `Result{Success, Data, Error}` (AD-3), giúp việc viết API/E2E test dễ dàng assert lỗi.
- **Reliability (Độ tin cậy):** Cao. Giao diện và business logic tách biệt hoàn toàn.

**🚨 Testability Concerns:**
- Giao diện native (OS dialogs cho mở/lưu file, hay Wails lifecycle) khó khăn trong việc tự động hóa UI thuần túy -> Yêu cầu thiết lập Playwright kết hợp hoặc mock backend dialog.
- Chưa có cấu trúc mock tường minh cho `net/http` trong executor, việc E2E test gửi request ra ngoài có thể gặp khó khăn do phụ thuộc external network.

**Architecturally Significant Requirements (ASRs):**
- **ASR-1 (ACTIONABLE):** Phân chia trách nhiệm Variable Substitution (Vue) vs Execution (Go). Cần Integration Test đảm bảo Go không bao giờ nhận chuỗi chưa được xử lý `{{var}}`.
- **ASR-2 (ACTIONABLE):** Offline-first. Ứng dụng phải hoạt động bình thường kể cả khi mất mạng (không đơ UI, báo lỗi kết nối chuẩn xác). Yêu cầu giả lập mất mạng ở tầng OS hoặc ngắt mock server khi test.
- **ASR-3 (FYI):** Wails bindings phải trả về cấu trúc error chung (AD-3).
- **ASR-4 (FYI):** Mọi reference sử dụng UUID, tên file là slug (AD-4).

### 2 & 3. Risk Assessment & NFR Planning
Phân tích rủi ro dựa trên PRD và Architecture, kết hợp với các chỉ tiêu NFR (Non-Functional Requirements).

**NFR Thresholds (từ PRD):**
- **Performance:** Thời gian khởi động < 2s. Mức tiêu thụ RAM < 100MB (SM-2).
- **Reliability:** Chuyển đổi VPN/mất kết nối không làm treo app (SM-3).
- **Data:** Định dạng phải thuần JSON và tương thích Git.
- **Thresolds còn thiếu (UNKNOWN):** Dung lượng max của response body (tránh treo JSON Viewer), thời gian timeout chuẩn cho HTTP request (hiện tại ghi là infinite theo OS), giới hạn max request trong 1 collection khi import Postman.

**Risk Register:**

| Risk ID | Category | Mô tả rủi ro (Nguồn gốc) | P | I | Score | Mitigation (Cách khắc phục/Kiểm thử) |
|---|---|---|---|---|---|---|
| RSK-01 | TECH / DATA | Dữ liệu collection bị hỏng hoặc mất nếu hai thao tác ghi file xảy ra đồng thời hoặc app tắt đột ngột (do dùng I/O file system trực tiếp). | 2 | 3 | **6 (High)** | Yêu cầu unit test cho `storage/filesystem.go` về concurrent writes hoặc file locking. |
| RSK-02 | PERF / TECH | Ứng dụng Vue bị treo (OOM) nếu Response trả về quá lớn (>100MB) do tính năng Pretty Print/Syntax Highlighting JSON chưa có NFR payload limit. | 2 | 3 | **6 (High)** | Bổ sung NFR max size và test case limit response body processing ở Vue. |
| RSK-03 | RELIABILITY | Mạng bị ngắt bất ngờ hoặc VPN treo làm HTTP Request bị block vô thời hạn (infinite timeout), dẫn đến treo Wails backend/goroutine. | 3 | 2 | **6 (High)** | Đặt timeout fallback cho `net/http` Client. Test case: Gọi API tới Blackhole IP. |
| RSK-04 | TECH / BUS | Chuyển đổi (Variable Substitution) sai lệch, dẫn đến việc gửi request lộ token hoặc gọi nhầm môi trường Prod. | 2 | 3 | **6 (High)** | Bổ sung Integration test kiểm tra vòng đời của chuỗi `{{var}}` từ Vue xuông Go. |

*(Thang điểm PxI: Probability 1-3, Impact 1-3)*

### 4. Summarize Risk Findings
- **Rủi ro lớn nhất** nằm ở việc quản lý IO file đồng thời (RSK-01) và việc xử lý payload lớn (RSK-02) ảnh hưởng trực tiếp đến cam kết RAM < 100MB của ứng dụng.
- **Ưu tiên kiểm thử:** (1) File I/O Safety, (2) UI Performance với JSON dung lượng lớn, và (3) Xử lý ngoại lệ mạng (Timeout/Offline).

## Step 4: Coverage Plan & Execution Strategy

### 1. Coverage Matrix

| Scenario / Feature | Test Level | Priority | Risk Link | Notes |
|---|---|---|---|---|
| Cấu trúc Collection & Request CRUD (FR-6, 7, 8) | Component (Go Unit) | P0 | RSK-01 | Test cô lập thao tác ghi file JSON. Mô phỏng (mock) filesystem để test concurrent writes. |
| Variable Substitution (FR-12) & Environment Switch (FR-11) | Component (Vue Unit) + E2E | P0 | RSK-04 | Đảm bảo giá trị `{{var}}` được thay thế chính xác trước khi Go execution. UI highlight chuẩn. |
| Gửi HTTP Request (FR-1, 2, 3, 4) & Xử lý Timeout/Mất mạng | Component (Go) + E2E | P0 | RSK-03 | Giả lập server trả về chậm, ngắt mạng OS để test offline capability (SM-3). |
| Hiển thị Response, Pretty-Print JSON với size > 100MB (FR-5) | Component (Vue) | P1 | RSK-02 | Test Vue component OOM khi parse/render lượng text khổng lồ. |
| Import Postman Collection v2.1 (FR-13) | Component (Go Unit) | P1 | - | Feed file Postman JSON mẫu, assert đầu ra collection format. Không cần E2E, UI chỉ cần click 1 lần. |
| Giao diện người dùng: Tree View & Navigation (FR-9) | Component (Vue) | P2 | - | Assert active store và CSS highlight khi click folder/request. |

### 2. NFR Coverage and Evidence Plan

- **Performance (RAM < 100MB, Boot < 2s):**
  - Scenario: Khởi động app lạnh và load collection dung lượng lớn.
  - Test Tool: Playwright (Đo đạc memory dump và time).
  - Expected Evidence: System Metrics Log từ Nightly Run.
- **Reliability (Offline support):**
  - Scenario: Gửi request offline, đổi VPN giữa lúc send.
  - Test Tool: Go `httptest` timeout injection / Playwright network mock.
  - Expected Evidence: Báo cáo E2E test passes without crashes.
- **Data Integrity:**
  - Scenario: Ghi đồng thời nhiều request.
  - Test Tool: Go parallel unit testing (`t.Parallel()`).
  - Expected Evidence: CI logs báo `PASS` cho storage test suite.

### 3. Execution Strategy

- **On PR (Push-triggered):**
  - Thực thi toàn bộ Component (Unit) tests của Go (bằng lệnh `go test`) và Vue (`vitest`).
  - Thực thi bộ E2E Playwright với test collection siêu nhẹ để đảm bảo happy path (dự kiến < 5 phút).
- **Nightly Run:**
  - Chạy Stress test (Import Postman file 100MB, Render JSON 100MB).
  - Giả lập lỗi Timeout, Network Interruptions.

### 4. Resource Estimates (Ranges)

- **P0 (Cốt lõi, Rủi ro cao):** ~20–35 hours.
- **P1 (Quan trọng, UI/UX mạnh):** ~10–20 hours.
- **P2 (Secondary UI):** ~5–10 hours.
- **Total Timeline:** ~35–65 hours cho Automation Test & Bug Fixes.

### 5. Quality Gates

- Tỉ lệ Pass P0 = 100%.
- Tỉ lệ Pass P1 ≥ 95%.
- Mọi RSK có Score ≥ 6 (như RSK-01, RSK-02, RSK-03) phải được mitigate và test verified (NFR Validation passed).
- Code Coverage của business logic (`service/` trong Go và `stores/` trong Vue) đạt mức tối thiểu 80%.

## Step 5: Generate Outputs & Validate

### 1. Selection & Generation
- Chế độ sử dụng: System-Level Mode
- Đã sinh các tài liệu Output:
  - Architecture Test Design: `_bmad-output/test-artifacts/test-design-architecture.md`
  - QA Test Design: `_bmad-output/test-artifacts/test-design-qa.md`
  - BMAD Handoff: `_bmad-output/test-artifacts/test-design/hecto-api-handoff.md`

### 2. Validation & Polish
- Toàn bộ thông tin rủi ro và mitigation plan đều nhất quán giữa các tài liệu.
- Các NFR thresholds (RAM, Boot time) đã được ghi nhận. Unknowns (Payload max size, Timeout max duration) được chuyển hóa thành các ACTIONABLE risks (RSK-02, RSK-03).
- BMAD Handoff document đã ánh xạ các RSK vào các Epic tương ứng (Epic 1, 2, 3, 4).

### 3. Completion Report
Quy trình thiết kế kiểm thử ở mức độ System (System-Level) đã **Hoàn Tất**.
- **Mode Used:** System-Level
- **Output Paths:** 
  - `_bmad-output/test-artifacts/test-design-architecture.md`
  - `_bmad-output/test-artifacts/test-design-qa.md`
  - `_bmad-output/test-artifacts/test-design/hecto-api-handoff.md`
- **Key Risks:** Lỗi thao tác ghi File đồng thời, Lỗi tràn RAM khi parse JSON, Treo app vì mạng.
- **Next steps:** Team Architecture/Dev review các Blockers (Network Mocking) và các rủi ro High Priority. Chờ BMAD Handoff chuyển thông tin sang Epic/Story.

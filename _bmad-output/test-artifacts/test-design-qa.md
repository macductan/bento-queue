---
workflowStatus: 'completed'
totalSteps: 5
stepsCompleted: ['step-01-detect-mode', 'step-02-load-context', 'step-03-risk-and-testability', 'step-04-coverage-plan', 'step-05-generate-output']
lastStep: 'step-05-generate-output'
nextStep: ''
lastSaved: '2026-10-09T11:55:00+07:00'
workflowType: 'testarch-test-design'
inputDocuments: ['_bmad-output/planning-artifacts/prds/prd-hecto-api-2026-09-21/prd.md', '_bmad-output/planning-artifacts/architecture/architecture-hecto-api-2026-09-22/ARCHITECTURE-SPINE.md']
---

# Test Design for QA: hecto-api v1

**Purpose:** Test execution recipe for QA team. Defines what to test, how to test it, and what QA needs from other teams.

**Date:** 2026-10-09
**Author:** tanmac (Master Test Architect)
**Status:** Draft
**Project:** hecto-api

**Related:** See Architecture doc (test-design-architecture.md) for testability concerns and architectural blockers.

---

## Executive Summary

**Scope:** Thiết kế kiểm thử tự động và E2E cho ứng dụng Desktop Hecto-api.

**Risk Summary:**
- Total Risks: 4 (4 high-priority score ≥6, 0 medium, 0 low)
- Critical Categories: TECH/DATA (File I/O) và RELIABILITY (Network Interruptions).

**Coverage Summary:**
- P0 tests: ~3 (critical paths, network timeout, data integration)
- P1 tests: ~2 (pretty-print performance, postman import)
- P2 tests: ~1 (tree-view navigation)
- P3 tests: ~0
- **Total**: ~6 scenarios (~35-65 hours with 1 QA)

---

## Not in Scope

**Components or systems explicitly excluded from this test plan:**

| Item | Reasoning | Mitigation |
|---|---|---|
| **Test Backend API Thực Tế** | Ứng dụng là generic client. Không có API Server nào để test cố định ngoại trừ server mock/blackhole. | Tạo mock server để test các chuẩn HTTP Methods, Headers và Status Codes. |
| **Authentication Flow (OAuth/Bearer)** | PRD xác nhận (Non-Goals): không có helper tự động cho Auth trong v1. | Validated manually (bằng cách user tự nhập Header Authorization). |

**Note:** Items listed here have been reviewed and accepted as out-of-scope by QA, Dev, and PM.

---

## Dependencies & Test Blockers

**CRITICAL:** QA cannot proceed without these items from other teams.

### Backend/Architecture Dependencies (Pre-Implementation)
**Source:** See Architecture doc "Quick Guide" for detailed mitigation plans

1. **Wails E2E Automation Setup** - Dev/Architecture - Pre-GA
   - Cần cấu hình Playwright để hook được vào Wails/Webview2 hoặc Electron.
   - Nếu không có, E2E tự động hóa UI sẽ bất khả thi.

2. **Network Mocking Capability** - Backend - Pre-GA
   - Cần flag hoặc cách inject stub vào `net/http` client để test lỗi timeout/VPN đứt mạng mà không cần tác động vào OS.

### QA Infrastructure Setup (Pre-Implementation)

1. **Test Data Factories** - QA
   - Cần chuẩn bị file Postman Collection JSON (v2.1) có độ lớn 10MB, 100MB để test import và JSON Rendering OOM.
   - Cần seed data tool cho `environments/` và `collections/` trực tiếp trên disk.

2. **Test Environments** - QA
   - Local: Go 1.27.1, Node 24.
   - Mock Server: Spin-up một HTTP server bằng Go/Node trả về chậm, hoặc ngắt kết nối giữa chừng để test Reliability.

---

## Risk Assessment

### High-Priority Risks (Score ≥6)

| Risk ID | Category | Description | Score | QA Test Coverage |
|---|---|---|---|---|
| **RSK-01** | TECH/DATA | Hỏng dữ liệu do concurrent writes. | **6** | Chạy Go Unit test (parallel mode) gọi storage save liên tục. |
| **RSK-02** | PERF/TECH | Treo UI khi parse JSON payload cực lớn. | **6** | Load test E2E (render JSON 10MB, 100MB). |
| **RSK-03** | RELIABILITY| Chờ request vô hạn khi ngắt mạng (timeout block). | **6** | Go E2E gọi API vào IP blackhole (VD: `198.51.100.1`) và check app có recover không. |
| **RSK-04** | TECH/BUS | Lỗi Variable substitution do bất đồng bộ Vue - Go. | **6** | UI test điền `{{var}}`, switch Env, và assert mock server nhận đúng text đã parse. |

---

## NFR Test Coverage Plan

| NFR Category | Requirement / Threshold | Planned Validation | Tool / Level | Evidence Artifact | Priority |
|---|---|---|---|---|---|
| Security | Lưu trữ collection an toàn local. | Kiểm tra cấu trúc phân quyền thư mục XDG. | Go OS Unit | Unit test log | P1 |
| Performance | Khởi động < 2s, RAM < 100MB. | Baseline memory boot | Playwright | PM2/Playwright Metric | P0 |
| Reliability | Hoạt động bình thường khi đổi mạng/VPN. | Request abort/Timeout | Go + Mock | Go test log | P0 |
| Maintainability| Đọc được file JSON và dễ dùng trong Git. | Verify schema JSON | Unit test Go | JSON Schema Validation | P1 |

---

## Entry Criteria

**QA testing cannot begin until ALL of the following are met:**
- [ ] Tất cả PRD và Architecture assumptions được duyệt.
- [ ] Wails E2E automation tool chain được setup thành công (Proof of Concept chạy qua).
- [ ] Tính năng HTTP mocking cho executor sẵn sàng.

## Exit Criteria

**Testing phase is complete when ALL of the following are met:**
- [ ] All P0 tests passing.
- [ ] All P1 tests passing.
- [ ] NFR Metrics (Đặc biệt RAM < 100MB, Boot < 2s) được xác thực.

---

## Test Coverage Plan

### P0 (Critical)

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| **P0-001** | Cấu trúc Collection & Request CRUD (FR-6,7,8) | Go Unit | RSK-01 | Phải mock file system cho concurrent writes an toàn. |
| **P0-002** | Xử lý Request Timeout & Mất Mạng (FR-1) | E2E + Unit | RSK-03 | Validate UI không đơ khi call tới IP không tồn tại. |
| **P0-003** | Variable Substitution (FR-10,11,12) | E2E | RSK-04 | Đảm bảo biến `{{token}}` parse sang giá trị thực khi gọi Send. |

**Total P0:** ~3 tests

### P1 (High)

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| **P1-001** | Response Viewer & Large JSON (FR-5) | E2E | RSK-02 | Verify ứng dụng không OOM (treo Vue) khi trả về 100MB JSON. |
| **P1-002** | Import Postman v2.1 Collection (FR-13) | Go Unit | - | Test trên file JSON export chuẩn từ Postman, assert output folder. |

**Total P1:** ~2 tests

### P2 (Medium)

| Test ID | Requirement | Test Level | Risk Link | Notes |
|---|---|---|---|---|
| **P2-001** | Điều hướng Tree View Sidebar (FR-9) | Vue Unit | - | Click vào active state của từng Request/Folder trong tree. |

**Total P2:** ~1 tests

---

## Execution Strategy

**Philosophy:** Tận dụng tối đa Unit Test (Go, Vue) trên PR do setup Wails Native Automation có thể cồng kềnh.

### Every PR: Go/Vue Unit Tests (~5 min)
- Toàn bộ Component/Unit tests (`go test`, `vitest`).
- Chạy giả lập in-memory file system (không ghi đĩa cứng thật).

### Every PR: Playwright Tests (~10-15 min)
- Chạy E2E Happy Path cơ bản (Create Request -> Edit -> Send Mock -> Assert).

### Nightly: Load & Chaos Tests (~30-60 min)
- Chạy Load Test: Render 100MB JSON.
- Chạy Timeout Test: Network Interruptions.

---

## QA Effort Estimate

| Priority | Count | Effort Range | Notes |
|---|---|---|---|
| P0 | ~3 | ~20-35 hours | Setup E2E Wails automation lần đầu tốn nhiều công sức. |
| P1 | ~2 | ~10-20 hours | Xây dựng bộ test data Postman, limit testing payload. |
| P2 | ~1 | ~5-10 hours | Assert Vue state. |
| **Total** | ~6 | **~35-65 hours** | **1 QA engineer, full-time** |

---

**Generated by:** BMad TEA Agent
**Workflow:** `bmad-testarch-test-design`
**Version:** 4.0 (BMad v6)

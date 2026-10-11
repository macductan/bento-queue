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

# Test Design for Architecture: hecto-api v1

**Purpose:** Architectural concerns, testability gaps, and NFR requirements for review by Architecture/Dev teams. Serves as a contract between QA and Engineering on what must be addressed before test development begins.

**Date:** 2026-10-09
**Author:** tanmac (Master Test Architect)
**Status:** Architecture Review Pending
**Project:** hecto-api
**PRD Reference:** `_bmad-output/planning-artifacts/prds/prd-hecto-api-2026-09-21/prd.md`
**ADR Reference:** `_bmad-output/planning-artifacts/architecture/architecture-hecto-api-2026-09-22/ARCHITECTURE-SPINE.md`

---

## Executive Summary

**Scope:** Thiết kế kiểm thử cho hecto-api v1 (Desktop API Client offline-first sử dụng Go + Vue 3 qua Wails v2).

**Business Context** (from PRD):
- **Problem:** Cần tool gọi API nhẹ, lưu collection dạng file trên disk quản lý qua Git, thay thế Postman/Bruno.
- **GA Launch:** Phase 1.

**Architecture** (from ADR-SPINE):
- **Key Decision 1:** Split-responsibility giữa Vue (Hiển thị + Variable Substitution) và Go (Executor + File IO).
- **Key Decision 2:** Native Wails bindings trả về struct chuẩn `Result{Success, Data, Error}` (AD-3).
- **Key Decision 3:** Lưu Collection mặc định ở `{dataDir}/hecto-api/collections/default/`.

**Expected Scale** (from ADR):
- RAM < 100MB, Boot < 2s.

**Risk Summary:**
- **Total risks**: 4
- **High-priority (≥6)**: 4 risks requiring immediate mitigation
- **Test effort**: ~35-65 hours (~1.5 weeks for 1 QA)

---

## Quick Guide

### 🚨 BLOCKERS - Team Must Decide (Can't Proceed Without)

**Pre-Implementation Critical Path** - These MUST be completed before QA can write integration tests:

1. **TEST-01: Network Mocking Capability** - Go HTTP Client (`net/http`) cần một cơ chế inject/mock cho phép ngắt kết nối nhân tạo để test timeout và offline support. (recommended owner: Backend/Dev)
2. **TEST-02: Payload Limit** - Kiến trúc chưa quy định Max Body Size khi parse/pretty-print JSON, gây khó test OOM. (recommended owner: Architecture/PM)

**What we need from team:** Complete these 2 items pre-implementation or test development is blocked.

---

### ⚠️ HIGH PRIORITY - Team Should Validate (We Provide Recommendation, You Approve)

1. **RSK-01: Concurrent File Writes** - Cần triển khai file locking hoặc mutex trong `storage/filesystem.go`.
2. **RSK-02: OOM Payload Size** - Nên set hard-limit ở Vue trước khi render (VD: > 5MB sẽ tắt Pretty Print).
3. **RSK-04: Variable Substitution Leak** - Go executor phải luôn nhận request URL/body ĐÃ RESOLVE từ Vue, cấm resolve ngầm ở Go.

**What we need from team:** Review recommendations and approve (or suggest changes).

---

### 📋 INFO ONLY - Solutions Provided (Review, No Decisions Needed)

1. **Test strategy**: Component Unit (Go test, Vitest) và UI E2E (Playwright).
2. **Tooling**: Playwright, Go `testing`, Vitest.
3. **Tiered CI/CD**: PR (Functional/Unit <15p), Nightly (Load Test JSON 100MB, Timeout 60s).
4. **Coverage**: 6 test scenarios (3 P0, 2 P1, 1 P2).
5. **Quality gates**: P0 Pass 100%, Coverage > 80% business logic.

**What we need from team:** Just review and acknowledge.

---

## For Architects and Devs - Open Topics 👷

### Risk Assessment

**Total risks identified**: 4 (4 high-priority score ≥6, 0 medium, 0 low)

#### High-Priority Risks (Score ≥6) - IMMEDIATE ATTENTION

| Risk ID | Category | Description | Probability | Impact | Score | Mitigation | Owner | Timeline |
|---|---|---|---|---|---|---|---|---|
| **RSK-01** | **TECH / DATA** | Dữ liệu bị hỏng khi lưu/ghi đồng thời do IO disk trực tiếp. | 2 | 3 | **6** | Unit test `storage/filesystem.go` với concurrent load, thêm Mutex. | Backend | Pre-GA |
| **RSK-02** | **PERF / TECH** | OOM trên UI Vue khi parse JSON cực lớn (>100MB). | 2 | 3 | **6** | Bổ sung NFR payload limit, test load với JSON 100MB. | Frontend | Pre-GA |
| **RSK-03** | **RELIABILITY** | Mất mạng hoặc VPN treo làm HTTP request block vô hạn (treo app). | 3 | 2 | **6** | Set Timeout cho `net/http` client, test bằng cách route qua IP blackhole. | Backend | Pre-GA |
| **RSK-04** | **TECH / BUS** | Thay biến (Variable Substitution) sai gây leak token hoặc gọi nhầm môi trường. | 2 | 3 | **6** | Integration test luồng resolve biến từ Vue truyền xuống Go. | Fullstack | Pre-GA |

---

### NFR Testability Requirements

| NFR Category | Threshold / Requirement | Current Design Support | Gap / Decision Needed | Planned Evidence |
|---|---|---|---|---|
| Security | Lưu trữ collection local an toàn | Supported | Không | Local file scan |
| Performance | Boot < 2s, RAM < 100MB | Supported | Cần chốt giới hạn Max Payload Size cho request/response. | Metrics báo cáo từ E2E |
| Reliability | Hoạt động không treo/đơ khi mất kết nối mạng. | Partial | Khởi tạo client Go chưa set default timeout. | Playwright offline mode test |
| Maintainability| Đọc được file JSON và dễ dùng trong Git | Supported | Không | File format assertion |

**Unknown thresholds:** Max payload size cho response body, Max duration timeout cho HTTP request.

---

### Testability Concerns and Architectural Gaps

**🚨 ACTIONABLE CONCERNS - Architecture Team Must Address.**

#### 1. Blockers to Fast Feedback (WHAT WE NEED FROM ARCHITECTURE)

| Concern | Impact | What Architecture Must Provide | Owner | Timeline |
|---|---|---|---|---|
| **Mocking External Network** | E2E/API test bị flakiness do mạng thật | Kiến trúc Wails cần 1 "Test Mode" cho phép truyền stub URL vào Executor | Backend | Phase 1 |
| **Native Dialog Automating** | Khó E2E import Postman collection bằng dialog chọn file OS | Thêm Wails binding ẩn để trigger import trực tiếp từ đường dẫn truyền vào | Backend | Phase 1 |

---

### Testability Assessment Summary

**📊 CURRENT STATE - FYI.**

#### What Works Well

- ✅ Giao tiếp Go - Vue tách bạch qua Struct Result chuẩn (AD-3).
- ✅ File Data được lưu dưới dạng JSON rõ ràng, dễ seed test data.
- ✅ Kiến trúc Domain Driven (`service/`, `storage/`) dễ mock ở tầng Backend.

---

### Risk Mitigation Plans (High-Priority Risks ≥6)

#### RSK-01: Dữ liệu bị hỏng khi lưu/ghi đồng thời (Score: 6) - CRITICAL

**Mitigation Strategy:**
1. Áp dụng Mutex lock trong Service/Storage Go.
2. Viết Go Test sử dụng `t.Parallel()` và Goroutines gửi đồng thời 100 writes vào một file Request JSON.

**Owner:** Backend

#### RSK-03: Treo ứng dụng do HTTP block vô hạn (Score: 6) - CRITICAL

**Mitigation Strategy:**
1. Cấu hình `http.Client` với Timeout cứng (VD 60s) hoặc nhận cấu hình từ config.
2. E2E Test ngắt wifi ở OS level hoặc kết nối với Blackhole Server.

**Owner:** Backend

---

### Assumptions and Dependencies

#### Assumptions
1. Định dạng import Postman v2.1 không có các feature phức tạp như script.

#### Dependencies
1. Cần Wails test automation utility (hoặc sử dụng Playwright electron/chrome attach vào webview).

---
**End of Architecture Document.**

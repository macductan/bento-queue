---
title: 'TEA Test Design → BMAD Handoff Document'
version: '1.0'
workflowType: 'testarch-test-design-handoff'
inputDocuments: ['_bmad-output/test-artifacts/test-design-architecture.md', '_bmad-output/test-artifacts/test-design-qa.md']
sourceWorkflow: 'testarch-test-design'
generatedBy: 'TEA Master Test Architect'
generatedAt: '2026-10-09T11:55:00+07:00'
projectName: 'hecto-api'
---

# TEA → BMAD Integration Handoff

## Purpose

This document bridges TEA's test design outputs with BMAD's epic/story decomposition workflow (`create-epics-and-stories`). It provides structured integration guidance so that quality requirements, risk assessments, and test strategies flow into implementation planning.

## TEA Artifacts Inventory

| Artifact | Path | BMAD Integration Point |
|---|---|---|
| Test Design (Architecture) | `_bmad-output/test-artifacts/test-design-architecture.md` | Epic quality requirements, story acceptance criteria |
| Test Design (QA) | `_bmad-output/test-artifacts/test-design-qa.md` | Test strategy, test coverage |
| Risk Assessment | (embedded in test design) | Epic risk classification, story priority |
| Coverage Strategy | (embedded in test design) | Story test requirements |

## Epic-Level Integration Guidance

### Risk References

**P0/P1 risks that should appear as epic-level quality gates:**
- **RSK-01**: Cần đảm bảo Storage logic sử dụng File IO an toàn khi concurrent ghi/đọc (Mutex locking) cho Collection data (Epic 1/2).
- **RSK-02**: Giới hạn kích thước parse JSON của Vue component cho tính năng Pretty-print để tránh OOM (Epic 3).
- **RSK-03**: Backend HTTP Executor (Epic 3) phải xử lý được Timeout/Lỗi mạng một cách gracefull, không để lại goroutine leak hay treo UI.
- **RSK-04**: Hệ thống Variable Substitution (Epic 4) phải giải quyết xong biến ở Frontend, gửi Raw URL và Body xuống Backend.

### Quality Gates

- Mọi Story thao tác file phải có Unit Test check IO Concurrent.
- Story Request HTTP phải cover 400/500/Timeout network.
- Khởi động app cần load UI (Vite) + Backend dưới 2 giây.

## Story-Level Integration Guidance

### P0/P1 Test Scenarios → Story Acceptance Criteria

- **AC for Store Creation**: Khi gọi method Save() nhiều lần cùng lúc (parallel), hệ thống không crash hoặc hỏng định dạng JSON.
- **AC for HTTP Request Executor**: Gọi request tới server không phản hồi -> Báo Timeout error thay vì loading vĩnh viễn.
- **AC for Variable Resolve**: Gán biến `{{API}}` = `http://localhost`, gửi Request hiển thị đang connect tới `http://localhost`.
- **AC for Large Response**: Nhận response > 5MB, hệ thống disable syntax highlight hoặc show truncate thay vì đơ DOM.

### Data-TestId Requirements

- Cần bổ sung `data-testid` cho các nút: `send-request-btn`, `env-selector-dropdown`, `tree-folder-node`, `response-status-badge`.

## Risk-to-Story Mapping

| Risk ID | Category | P×I | Recommended Story/Epic | Test Level |
|---|---|---|---|---|
| RSK-01 | TECH/DATA | 6 | Epic 1 / Epic 2 (Storage) | Go Unit |
| RSK-02 | PERF/TECH | 6 | Epic 3 (Response Viewer) | Vue Unit / E2E |
| RSK-03 | RELIABILITY | 6 | Epic 3 (HTTP Executor) | E2E |
| RSK-04 | TECH/BUS | 6 | Epic 4 (Environment) | E2E |

## Recommended BMAD → TEA Workflow Sequence

1. **TEA Test Design** (`TD`) → produces this handoff document
2. **BMAD Create Epics & Stories** → consumes this handoff, embeds quality requirements
3. **TEA ATDD** (`AT`) → generates acceptance tests per story
4. **BMAD Implementation** → developers implement with test-first guidance
5. **TEA Automate** (`TA`) → generates full test suite
6. **TEA Trace** (`TR`) → validates coverage completeness

## Phase Transition Quality Gates

| From Phase | To Phase | Gate Criteria |
|---|---|---|
| Test Design | Epic/Story Creation | All P0 risks have mitigation strategy |
| Epic/Story Creation | ATDD | Stories have acceptance criteria from test design |
| ATDD | Implementation | Failing acceptance tests exist for all P0/P1 scenarios |
| Implementation | Test Automation | All acceptance tests pass |
| Test Automation | Release | Trace matrix shows ≥80% coverage of P0/P1 requirements |

---
stepsCompleted: ['step-01-preflight', 'step-02-select-framework', 'step-03-scaffold-framework', 'step-04-docs-and-scripts', 'step-05-validate-and-summary']
lastStep: 'step-05-validate-and-summary'
lastSaved: '2026-10-09'
---

## 1. Stack Detection
- `test_stack_type`: `auto` (from config)
- Detected Stack: `fullstack` (Found both Go backend and Vue frontend manifests)

## 2. Validate Prerequisites
- Frontend: Vue 3 `package.json` found, no existing Playwright or Cypress config.
- Backend: `go.mod` found, no conflicting test framework config.

## 3. Gather Project Context
- **Frontend**: Vue 3, Vite bundler, Pinia, Vitest.
- **Backend**: Go 1.25.0, Wails v2 framework.
- **Docs**: Found `docs/product-brief.md`.

## Confirm Findings
- **Project Type and Bundler**: Fullstack (Wails v2 Go backend, Vue 3 with Vite).
- **Existing Framework**: None found (No Playwright/Cypress).
- **Context Docs**: `docs/product-brief.md` available for architecture and product context.

## Step 2: Framework Selection

Dựa trên cấu trúc dự án (Fullstack: Wails v2 Go backend, Vue 3 frontend), tôi quyết định chọn các Framework kiểm thử sau:

1. **E2E & UI Testing**: **Playwright**
   * *Lý do*: Dự án có sự kết hợp API + UI khá phức tạp. Playwright hỗ trợ tốt cho việc tích hợp, khả năng chạy đa trình duyệt, và tốc độ chạy CI nhanh chóng. Playwright là lựa chọn tiêu chuẩn và mạnh mẽ để giả lập tương tác trình duyệt.
2. **Backend Unit/Integration Testing**: **Go test (built-in)**
   * *Lý do*: Backend được viết bằng Go, sử dụng Go test là tiêu chuẩn và được tích hợp sẵn.
3. **Frontend Unit/Component Testing**: **Vitest**
   * *Lý do*: Frontend sử dụng Vue 3 và Vite, và Vitest đã được cấu hình sẵn trong `package.json`.

## Step 3: Scaffold Framework

- **Execution Mode**: `sequential` (Agent-Team không được hỗ trợ trong môi trường này do execution_mode=auto và default fallback).
- **Directory Layout**:
  - E2E: `projects/frontend/tests/e2e/`, `projects/frontend/tests/support/`
  - Backend: Unit test được đặt bên cạnh source code (`projects/app_test.go`), `projects/testdata/`
- **Config**: Tạo `playwright.config.ts` với đầy đủ cấu hình timeout, CI parallel, và reporter.
- **Môi trường**: Tạo `.env.example` với `BASE_URL`, `TEST_ENV`, `API_URL`.
- **Packages**: Cài đặt thành công `@seontechnologies/playwright-utils` và `@playwright/test` thông qua `bun`.
- **Fixtures**: 
  - Tạo `merged-fixtures.ts` kết hợp `apiRequestFixture`, `recurseFixture`, `interceptFixture`, `networkErrorFixture` và `authFixture`.
  - Thiết lập mẫu custom Auth Provider Pattern với `createAuthFixtures` trong `auth-fixture.ts`.
  - Cấu hình `globalSetup` khởi tạo `authStorageInit()`.
- **Sample Tests**:
  - `projects/frontend/tests/e2e/example.spec.ts`: Sử dụng Playwright Utils (API Request, network interception, log steps).
  - `projects/app_test.go`: Sử dụng Go test table-driven test và `testify/assert`.
- **Pact/Contract Testing**: Bỏ qua scaffold vì không tìm thấy consumer-provider boundary trong dự án (Vue + Go chạy Wails cục bộ không có external backend logic rõ ràng từ config).

## Step 4: Documentation & Scripts

- **Documentation**: Tạo `projects/frontend/tests/README.md` mô tả cách cài đặt, chạy tests, kiến trúc và best practices.
- **Scripts**:
  - Thêm `test:e2e` vào `projects/frontend/package.json` (`playwright test`).
  - Tạo `projects/Makefile` với các lệnh `test`, `test-race`, `test-cover` cho Go backend.
- **Write-Time Enforcement Hook**: Bỏ qua cấu hình `.claude/hooks` do nền tảng agent hiện tại (Google Antigravity) không hỗ trợ cơ chế PreToolUse/PostToolUse hooks như Claude Code. Việc đảm bảo chất lượng code sẽ dựa vào skill `bmad-testarch-test-review`.

## Step 5: Validate & Summarize

### Bảng tóm tắt hoàn thành (Completion Summary)
- **Framework đã chọn**: Playwright (Frontend/E2E) & Go Test (Backend Unit/Integration), cùng Vitest đã có sẵn.
- **Artifacts đã tạo**:
  - `playwright.config.ts`, `tests/README.md`
  - Cấu trúc thư mục: `tests/e2e/`, `tests/support/`
  - Các fixtures (`merged-fixtures.ts`, `auth-fixture.ts`), `global-setup.ts`
  - Scripts `test:e2e` (package.json) và Makefile (`test`, `test-race`, `test-cover`)
  - `.env.example`
- **Knowledge Fragments đã áp dụng**: playwright-utils, custom auth provider, merged fixtures pattern.
- **Các bước tiếp theo (Next Steps)**:
  1. Chạy `bun install` để cài đặt dependencies nếu chưa chạy.
  2. Copy `.env.example` thành `.env` ở frontend để config `BASE_URL`.
  3. Bổ sung logic lấy Token cho `manageAuthToken` trong `auth-fixture.ts`.
  4. Chạy thử `bun run test:e2e` và `make test`.

Workflow thiết lập Test Framework đã hoàn tất thành công!

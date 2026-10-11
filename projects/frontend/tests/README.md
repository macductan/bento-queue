# Hecto API Test Framework

## Cài đặt (Setup)
* **Frontend/E2E (Playwright & Vitest)**: 
  Chạy lệnh cài đặt từ thư mục `projects/frontend`:
  ```bash
  bun install
  ```
* **Backend (Go Test)**:
  Tự động khả dụng khi chạy `go test`.

## Chạy tests (Running tests)
* **Chạy E2E Tests (Playwright)**:
  ```bash
  bun run test:e2e
  ```
  *Chạy có giao diện (headed)*: `bun run test:e2e --headed`
  
* **Chạy Backend Tests (Go)**:
  Từ thư mục `projects`:
  ```bash
  make test
  ```

## Kiến trúc (Architecture)
* **Playwright Utils**: Dự án sử dụng `@seontechnologies/playwright-utils`.
* **Fixtures**: Các fixtures được hợp nhất tại `tests/support/merged-fixtures.ts`.
* **Auth**: Custom Auth Provider Pattern được sử dụng trong `tests/support/auth-fixture.ts`.
* **Network Interception**: Sử dụng `interceptNetworkCall` cho E2E để bắt các network request.

## Thực hành tốt (Best Practices)
* **Selectors**: Luôn dùng data-testid thay cho class/id selector.
* **Isolation**: Đảm bảo mỗi test chạy độc lập và dữ liệu được dọn dẹp sau khi chạy xong.
* **CI Integration**: Sử dụng parallel worker (`workers: 1` cho CI, `fullyParallel: true` cho local) để đảm bảo không bị xung đột state.

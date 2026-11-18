#!/usr/bin/env bash
set -eo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${SKIP_LOCAL_CI:-0}" == "1" ]]; then
  echo "⏭️  [Local CI] SKIP_LOCAL_CI=1 được bật — bỏ qua chạy lại test."
  exit 0
fi

echo "================================================================"
echo "🛡️  [Local CI Gate] Chạy kiểm thử toàn diện trước khi vào develop"
echo "================================================================"

# 1. Nạp môi trường Node 24 (nvm)
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
  nvm use >/dev/null
fi

# 2. Đảm bảo thư mục dist/.gitkeep tồn tại cho go:embed
mkdir -p "$ROOT_DIR/projects/frontend/dist"
touch "$ROOT_DIR/projects/frontend/dist/.gitkeep"

# 3. Build Shared Headless Engine
echo "👉 [1/6] Đóng gói Shared Headless Engine (bun run build:headless)..."
cd "$ROOT_DIR/projects/frontend"
bun run build:headless

# 4. Frontend Lint (ESLint)
echo "👉 [2/6] Kiểm tra Frontend Lint (bun run lint)..."
bun run lint

# 5. Frontend Type-Check (vue-tsc)
echo "👉 [3/6] Kiểm tra Frontend Type-Check (bun run type-check)..."
bun run type-check

# 6. Frontend Unit & Component Tests (Vitest)
echo "👉 [4/6] Chạy Frontend Unit Tests (bun run test)..."
bun run test

# 7. Backend Go Vet & Go Tests
echo "👉 [5/6] Kiểm tra Backend Go (go vet & go test ./...)..."
cd "$ROOT_DIR/projects"
go vet ./...
go test ./...

# 8. Frontend E2E Tests (Playwright)
echo "👉 [6/6] Chạy Frontend E2E Tests (bun run test:e2e)..."
cd "$ROOT_DIR/projects/frontend"
bun run test:e2e

# Khôi phục dist/.gitkeep nếu có thay đổi phụ
git checkout -- "$ROOT_DIR/projects/frontend/dist/.gitkeep" 2>/dev/null || true

echo "================================================================"
echo "✅ [Local CI Gate] TẤT CẢ KIỂM THỬ ĐỀU PASS 100%!"
echo "================================================================"

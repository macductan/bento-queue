#!/bin/bash
set -e

# Di chuyển vào đúng thư mục projects
cd "$(dirname "$0")"

CLI_NAME="hecto"
# Nguồn version duy nhất: frontend/package.json
APP_VERSION=$(grep -m1 '"version"' frontend/package.json | awk -F '"' '{print $4}')
if [[ -z "$APP_VERSION" ]]; then
  echo "❌ Lỗi: Không thể lấy version từ frontend/package.json"
  exit 1
fi

# Mặc định cài vào ~/.local/bin (không cần sudo), hoặc /usr/local/bin nếu truyền --system
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"
USE_SUDO=false
if [[ "$1" == "--system" ]]; then
  INSTALL_DIR="/usr/local/bin"
  USE_SUDO=true
fi

echo "🔥 Bắt đầu build và cài đặt ${CLI_NAME} CLI v${APP_VERSION}..."

# 1. Kích hoạt môi trường Go và Node (tạm tắt set -e vì gvm/nvm dùng biến nội bộ có thể trả mã khác 0)
set +e
if [[ -s "$HOME/.gvm/scripts/gvm" ]]; then
  source "$HOME/.gvm/scripts/gvm"
  gvm use go1.27.1 > /dev/null 2>&1
fi

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  if [[ -f "../.nvmrc" ]]; then
    nvm use "$(cat ../.nvmrc)" > /dev/null 2>&1
  else
    nvm use > /dev/null 2>&1
  fi
fi
set -e

# 2. Bundle Shared TypeScript Headless Engine (headless-engine.js)
echo "1. Đóng gói Shared TypeScript Execution Engine (headless-engine.js)..."
(cd frontend && bun run build:headless)

# 3. Biên dịch binary độc lập hecto (không phụ thuộc Wails/GTK/WebKit)
echo "2. Biên dịch binary ${CLI_NAME} v${APP_VERSION}..."
mkdir -p build/bin
go build -ldflags "-s -w -X main.cliVersion=${APP_VERSION}" -o "build/bin/${CLI_NAME}" ./cmd/hecto

# 4. Cài đặt vào thư mục đích
echo "3. Cài đặt ${CLI_NAME} vào ${INSTALL_DIR}/${CLI_NAME}..."
if [[ "$USE_SUDO" == "true" ]]; then
  sudo mkdir -p "${INSTALL_DIR}"
  sudo cp "build/bin/${CLI_NAME}" "${INSTALL_DIR}/${CLI_NAME}"
  sudo chmod +x "${INSTALL_DIR}/${CLI_NAME}"
else
  mkdir -p "${INSTALL_DIR}"
  cp "build/bin/${CLI_NAME}" "${INSTALL_DIR}/${CLI_NAME}"
  chmod +x "${INSTALL_DIR}/${CLI_NAME}"
fi

echo "✅ Hoàn tất! Đã cài đặt thành công: $( "${INSTALL_DIR}/${CLI_NAME}" --version )"
echo "👉 Đường dẫn: ${INSTALL_DIR}/${CLI_NAME}"

if [[ ":$PATH:" != *":${INSTALL_DIR}:"* ]]; then
  echo "⚠️  Lưu ý: ${INSTALL_DIR} chưa có trong \$PATH. Hãy thêm dòng sau vào ~/.bashrc hoặc ~/.zshrc:"
  echo "   export PATH=\"${INSTALL_DIR}:\$PATH\""
fi

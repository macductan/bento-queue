#!/bin/bash
set -e

# Di chuyển vào đúng thư mục projects
cd "$(dirname "$0")"

APP_NAME="hecto-api"
# Nguồn version duy nhất: frontend/package.json
APP_VERSION=$(grep -m1 '"version"' frontend/package.json | awk -F '"' '{print $4}')
if [[ -z "$APP_VERSION" ]]; then
  echo "❌ Lỗi: Không thể lấy version từ frontend/package.json"
  exit 1
fi
ARCH=$(uname -m)

echo "🔥 Bắt đầu build ứng dụng và đóng gói file .dmg cho ${APP_NAME} (${ARCH}) v${APP_VERSION}..."

# 1. Kích hoạt môi trường Go và Node (tạm tắt set -e vì gvm/nvm dùng biến nội bộ có thể trả mã khác 0)
set +e
if [[ -s "$HOME/.gvm/scripts/gvm" ]]; then
  source "$HOME/.gvm/scripts/gvm"
  gvm use go1.27.1 > /dev/null 2>&1
fi

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  source "$HOME/.nvm/nvm.sh"
  nvm use > /dev/null 2>&1
fi
set -e

# 2. Build ứng dụng bằng Wails
echo "1. Biên dịch ứng dụng bằng Wails..."
wails build -platform darwin/${ARCH}

# 3. Tạo file DMG
echo "2. Đóng gói file .dmg bằng hdiutil..."
STAGING_DIR="build/dmg_staging"
OUTPUT_DMG="build/bin/${APP_NAME}-${APP_VERSION}-${ARCH}.dmg"

rm -rf "${STAGING_DIR}" "${OUTPUT_DMG}"
mkdir -p "${STAGING_DIR}"

cp -R "build/bin/${APP_NAME}.app" "${STAGING_DIR}/"
ln -s /Applications "${STAGING_DIR}/Applications"

hdiutil create -volname "${APP_NAME}" -srcfolder "${STAGING_DIR}" -ov -format UDZO "${OUTPUT_DMG}"
rm -rf "${STAGING_DIR}"

echo "✅ Hoàn tất! File .dmg đã được tạo thành công tại:"
echo "👉 $(pwd)/${OUTPUT_DMG}"

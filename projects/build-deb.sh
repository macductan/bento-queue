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
MAINTAINER="tanmd@foobla.com"
ARCH="amd64"

DEB_DIR="build/${APP_NAME}_${APP_VERSION}_${ARCH}"

echo "🔥 Bắt đầu build package .deb cho ${APP_NAME} v${APP_VERSION}..."

echo "1. Build ứng dụng bằng Wails..."
source ~/.nvm/nvm.sh && nvm use
wails build -tags webkit2_41

echo "2. Tạo cấu trúc thư mục package..."
rm -rf "${DEB_DIR}"
mkdir -p "${DEB_DIR}/DEBIAN"
mkdir -p "${DEB_DIR}/usr/bin"
mkdir -p "${DEB_DIR}/usr/share/applications"
mkdir -p "${DEB_DIR}/usr/share/icons/hicolor/512x512/apps"

echo "3. Tạo file metadata (control)..."
cat <<EOF > "${DEB_DIR}/DEBIAN/control"
Package: ${APP_NAME}
Version: ${APP_VERSION}
Section: utils
Priority: optional
Architecture: ${ARCH}
Depends: libgtk-3-0, libwebkit2gtk-4.1-0
Maintainer: ${MAINTAINER}
Description: Hecto API Client
 Lightweight offline-first desktop API client.
EOF

echo "4. Copy binary và cấu hình quyền truy cập..."
cp build/bin/projects "${DEB_DIR}/usr/bin/${APP_NAME}"
chmod +x "${DEB_DIR}/usr/bin/${APP_NAME}"

echo "5. Tạo file shortcut (.desktop) cho Ubuntu launcher..."
cat <<EOF > "${DEB_DIR}/usr/share/applications/${APP_NAME}.desktop"
[Desktop Entry]
Name=Hecto API
Exec=/usr/bin/${APP_NAME}
Icon=${APP_NAME}
Type=Application
Terminal=false
Categories=Development;Utility;
EOF

echo "6. Copy icon ứng dụng..."
cp build/appicon.png "${DEB_DIR}/usr/share/icons/hicolor/512x512/apps/${APP_NAME}.png"

echo "7. Đóng gói DEB..."
dpkg-deb --build "${DEB_DIR}"

echo "✅ Hoàn tất! File .deb đã được tạo thành công tại:"
echo "👉 $(pwd)/build/${APP_NAME}_${APP_VERSION}_${ARCH}.deb"

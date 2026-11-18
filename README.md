# hecto-api ⚡

> **Lightweight, Offline-First Desktop API Client & Standalone CLI**  
> Giải pháp gọi và kiểm thử API siêu nhẹ, bảo mật, độc lập hoàn toàn — Thay thế hoàn hảo cho Postman và Bruno.

[![Version](https://img.shields.io/badge/version-1.16.0-blue.svg)](https://github.com/macductan/hecto-api)
[![Go](https://img.shields.io/badge/Go-1.25%2B-00ADD8?logo=go)](https://golang.org)
[![Wails v2](https://img.shields.io/badge/Desktop-Wails%20v2-DF1A29)](https://wails.io)
[![Vue 3](https://img.shields.io/badge/Frontend-Vue%203%20%2B%20Vite-4FC08D?logo=vue.js)](https://vuejs.org)
[![Bun](https://img.shields.io/badge/Package%20Manager-Bun-fbf0df?logo=bun)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

---

## 🎯 Sứ mệnh & Triết lý cốt lõi (Mission & Core Philosophy)

Trong quá trình phát triển phần mềm, các công cụ kiểm thử API hiện nay thường gặp phải nhiều vấn đề:
- **Postman**: Nặng nề, ngốn nhiều tài nguyên RAM (thường 500MB – 1GB+), thời gian khởi động lâu, bắt buộc đăng nhập tài khoản, ép buộc đồng bộ đám mây (cloud sync). Khi làm việc qua mạng nội bộ hoặc đổi VPN, ứng dụng thường xuyên bị treo và gián đoạn.
- **Bruno / Các công cụ khác**: Đôi khi còn giật lag, giao diện phức tạp và thiếu các công cụ dòng lệnh (CLI) mạnh mẽ phục vụ tự động hóa.

**hecto-api** ra đời với sứ mệnh: **Đơn giản hóa việc gọi và kiểm thử API với hiệu năng tối đa, tôn trọng quyền riêng tư và dữ liệu của nhà phát triển.**

### 5 Nguyên tắc vàng:
1. ⚡ **Siêu nhẹ & Tốc độ tức thì (Zero Bloat)**:
   - Xây dựng trên nền tảng **Wails v2 (Go backend + Webview nguyên bản của hệ điều hành)**, không sử dụng Electron.
   - Khởi động dưới **1 giây**, bộ nhớ RAM tiêu thụ siêu thấp (chỉ khoảng **50MB - 100MB**).
2. 🔓 **Zero Login & Không Cloud (100% Privacy)**:
   - Hoàn toàn không cần tạo tài khoản, không lưu dữ liệu trên server trung gian. Mở ứng dụng lên là sử dụng ngay.
3. 📡 **Offline-First Tuyệt đối**:
   - Toàn bộ giao diện và chức năng xử lý ngoại tuyến. Khi mất mạng, đổi mạng VPN hay làm việc trong mạng nội bộ (air-gapped), ứng dụng vẫn hoạt động mượt mà.
4. 📁 **File-Based Storage & Git-Native**:
   - Dữ liệu Collections, Requests, Environments, Flows được lưu trữ dưới dạng các file **JSON chuẩn hóa** trực tiếp trên đĩa cứng máy tính.
   - Dễ dàng quản lý phiên bản bằng **Git**, chia sẻ qua GitHub/GitLab, hoặc sao lưu tự động mà không lo bị lock-in.
5. 🤖 **AI-Agent First & Headless CLI (`hecto`)**:
   - Tích hợp sẵn binary CLI độc lập `hecto` chia sẻ chung 100% công cụ thực thi TypeScript (`headless-engine.js` chạy trên máy ảo Go pure Goja).
   - Cho phép các **AI Coding Agents** (Antigravity, Claude Code, Cursor, Cline) dễ dàng đọc, tạo, cập nhật và chạy test API thông qua dòng lệnh với output `--json`.

---

## 🚀 Tính năng nổi bật (Key Features)

### 1. Gọi & Soạn thảo HTTP Requests toàn diện
- Hỗ trợ đầy đủ các phương thức chuẩn: `GET`, `POST`, `PUT`, `DELETE`, `PATCH`, `HEAD`, `OPTIONS` và tùy biến method.
- Trình quản lý tham số: **Query Parameters**, **Path Parameters** (`:id`), **Headers** với cơ chế bật/tắt (toggle) linh hoạt.
- Đa dạng kiểu Body: **JSON** (tự động format & syntax highlight), **XML**, **Form-Data**, **x-www-form-urlencoded**, **Raw Text**.
- **cURL Preview & Import**: Xem trực tiếp câu lệnh cURL đã phân giải biến thực tế; import nhanh cURL command vào request.

### 2. Trình xem Response (Response Viewer) chuyên nghiệp
- Chế độ xem: **Pretty JSON**, **Raw Text**, **Headers**, và **Preview**.
- **In-Response Search Bar** (`Cmd+F` / `Ctrl+F`): Tìm kiếm từ khóa tức thì, hỗ trợ phân biệt hoa/thường (`Aa`), đếm số lượng kết quả, phím tắt `Enter`/`Shift+Enter` để chuyển kết quả và tự động cuộn đến vị trí (`scrollIntoView`).
- Cột đánh số dòng (Line Numbers Gutter) chuẩn xác, hỗ trợ copy nhanh JSON path hoặc toàn bộ body.
- Thống kê chi tiết: Mã trạng thái (HTTP Status), thời gian phản hồi (ms), dung lượng truyền tải.

### 3. Cơ chế phân giải biến môi trường 4 tầng (4-Tier Variable Hierarchy)
Biến dạng `{{variable_name}}` được tự động phân giải theo độ ưu tiên từ thấp đến cao:
1. **Tier 1 (Thấp nhất)**: *Collection Variables* — Biến toàn cục dùng chung cho cả Collection.
2. **Tier 2**: *Active Global Environment* — Biến của môi trường đang kích hoạt trên thanh Header (`Dev`, `Staging`, `Prod`).
3. **Tier 3**: *Folder Global Variables* — Biến dùng chung trong thư mục.
4. **Tier 4 (Cao nhất)**: *Folder-Environment Variables* — Biến đặc thù của thư mục gắn riêng với môi trường đang chọn.

### 4. Kế thừa Auth & Headers thông minh (Inheritance)
- Hỗ trợ các chuẩn xác thực phổ biến: **Bearer Token**, **Basic Auth**, **API Key** (gửi qua Header hoặc Query Param).
- Cơ chế kế thừa: Request có thể kế thừa tự động cấu hình Auth và Headers từ Folder cha hoặc từ Collection. Hỗ trợ cấu hình Auth riêng biệt theo từng môi trường.

### 5. API Flow Runner (Kiểm thử luồng tích hợp)
- Trình chạy luồng API trực quan dạng flowchart có điều kiện rẽ nhánh (branching logic) dựa trên status code hoặc JSON response.
- Lưu trữ độc lập tại `<collection>/flows/` và thực thi mượt mà trên cả giao diện Desktop lẫn dòng lệnh CLI (`hecto flow run`).

### 6. Đồng bộ Git 2 chiều & Visual Conflict Resolver
- Tích hợp sẵn Git Sync trực tiếp trong ứng dụng (kết nối remote GitHub/GitLab).
- Trình giải quyết xung đột trực quan (Visual Conflict Resolver) khi có thay đổi đồng thời từ nhiều thành viên trong nhóm.
- Bộ giám sát file thời gian thực (`fsnotify`) tự động reload dữ liệu (`smartReload`) khi có thay đổi từ Git hoặc công cụ ngoài, bảo vệ an toàn các tab đang soạn thảo dở.

### 7. Tự động hóa với Script (`ha.*`) & Mock Server
- **Pre-request & Post-response Scripts**: Viết mã JavaScript kiểm thử, tự động trích xuất token lưu vào biến môi trường, kiểm tra assertion kết quả với thư viện `ha.*`.
- **Mock Server tích hợp**: Dựng nhanh mock endpoints chạy ngay trên máy local để phục vụ phát triển frontend mà không cần backend sẵn sàng.

---

## 📦 Cài đặt (Installation)

### Cách 1: Tải bản cài đặt Desktop macOS (.dmg)
1. Tải bản release mới nhất file `.dmg` từ mục [Releases](https://github.com/macductan/hecto-api/releases).
2. Mở file `.dmg` và kéo ứng dụng **hecto-api.app** vào thư mục **Applications**.

### Cách 2: Cài đặt CLI độc lập (`hecto`)
Dành cho lập trình viên và các AI Agents muốn điều khiển API từ terminal:
```bash
./install-cli.sh
```
Binary sẽ được cài đặt tự động vào `~/.local/bin/hecto`. Đảm bảo `~/.local/bin` đã có trong `$PATH`:
```bash
export PATH="$HOME/.local/bin:$PATH"
```

---

## 💻 Hướng dẫn sử dụng CLI (`hecto`)

CLI `hecto` cung cấp đầy đủ các thao tác tương đương 100% với giao diện Desktop:

```bash
# Xem phiên bản và hướng dẫn tích hợp AI Agent
hecto --version
hecto agent-guide

# Quản lý Collection
hecto collection list
hecto collection create "My Project"
hecto collection activate "My Project"

# Quản lý Environment
hecto env list
hecto env create "Staging"
hecto env set "Staging" --key "BASE_URL" --val "https://staging.api.com"

# Quản lý & Chạy Request
hecto req list
hecto req get "Users/GetProfile"
hecto run "Users/GetProfile"

# Chạy API Flow
hecto flow list
hecto flow run "CheckoutFlow"

# Xuất kết quả dạng JSON chuẩn hóa (phục vụ tự động hóa / AI Agent)
hecto req list --json
hecto run "Users/Login" --json
```

---

## 🛠️ Hướng dẫn phát triển từ mã nguồn (Development)

### Yêu cầu hệ thống:
- **Go**: phiên bản `1.25.0` trở lên.
- **Node.js**: phiên bản `24` (quản lý qua `.nvmrc`).
- **Bun**: phiên bản `1.2+` (trình quản lý gói frontend).
- **Wails CLI v2**: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`.

### Khởi chạy môi trường Dev:
```bash
# 1. Kích hoạt đúng phiên bản Node & cài dependencies
source ~/.nvm/nvm.sh && nvm use
cd projects/frontend && bun install && cd ../..

# 2. Sinh bindings Wails cho frontend
cd projects && wails generate module

# 3. Khởi chạy dev server (Hot reload cho cả Go và Vue)
cd projects && wails dev -tags webkit2_41
```

### Đóng gói ứng dụng:
```bash
# Đóng gói file .dmg cho macOS (arm64 / x86_64)
./projects/build-dmg.sh

# Đóng gói file .deb cho Linux
./projects/build-deb.sh

# Biên dịch binary CLI độc lập
./projects/install-cli.sh
```

### Kiểm tra chất lượng (Verification):
```bash
# Chạy Unit Tests Backend
cd projects && go test ./...

# Chạy Type-Check & Unit Tests Frontend
cd projects/frontend
bun run type-check
bun run test
```

---

## 📄 Bản quyền (License)

Dự án được phân phối dưới giấy phép [MIT License](LICENSE).
Tự do sử dụng, chỉnh sửa và đóng góp cho cộng đồng mã nguồn mở.

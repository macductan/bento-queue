---
name: bmad-release
description: 'Gom và chuẩn hóa commit trên nhánh develop, bump version theo Semantic Versioning từ nguồn duy nhất package.json khi chốt tính năng. Use when user says "release", "bmad-release", "chốt tính năng", "gom commit", "chuẩn hóa commit"'
---

# BMad Release & Commit Standardization Workflow

## Mục đích

Chuẩn hóa và gom (squash) toàn bộ commit trên nhánh `develop` tính từ mốc commit chuẩn gần nhất (ví dụ `v1.0.0`) thành 1 commit release duy nhất theo Semantic Versioning. Không tự ý merge sang `main`.

## Quy tắc bắt buộc

1. **Single Source of Truth**: Version duy nhất nằm tại `projects/frontend/package.json`. Mọi script build (`build-dmg.sh`, `build-deb.sh`) phải đọc từ file này.
2. **Semantic Versioning (SemVer)**:
   - Thêm tính năng mới (không breaking): Bump MINOR (`1.0.0` -> `1.1.0`).
   - Sửa lỗi / cải tiến nhỏ: Bump PATCH (`1.1.0` -> `1.1.1`).
   - Breaking change: Bump MAJOR (`1.1.0` -> `2.0.0`).
3. **Chỉ làm việc trên `develop`**: Không checkout hoặc merge sang `main`. Người dùng sẽ tự merge vào `main` sau.
4. **MANDATORY CONFIRMATION**: Tuyệt đối không tự ý chạy `git commit` hay `git reset` nếu chưa xin ý kiến và nhận được sự đồng ý của người dùng.

## Các bước thực hiện

### Bước 1: Kiểm tra trạng thái Git & commit chuẩn
- Tìm commit chuẩn gần nhất: `git log --oneline main -n 1` (hoặc tag release gần nhất, ví dụ `v1.0.0`).
- Kiểm tra danh sách commit trên `develop` chưa có trên `main`:
  ```bash
  git log --oneline main..develop
  ```
- Kiểm tra git status đảm bảo working tree sạch sẽ.

### Bước 2: Phân tích thay đổi & Xác định Version mới
- Đọc git log để phân loại các thay đổi: `feat`, `fix`, `docs`, `test`, `refactor`.
- Đề xuất version SemVer mới (ví dụ `1.1.0`).
- Cập nhật trường `version` trong `projects/frontend/package.json`.

### Bước 3: Chạy toàn bộ Test & Type-check
Trước khi gom commit, bắt buộc kiểm tra chất lượng code:
```bash
source ~/.nvm/nvm.sh && nvm use
cd projects/frontend && bun run type-check && bun run test
cd ../ && go test ./...
```
Nếu có lỗi, báo cáo và dừng quy trình để khắc phục.

### Bước 4: Soạn Commit Message chuẩn hóa
Tạo commit message tổng hợp theo chuẩn Conventional Commits, ví dụ:
```
feat: release v1.1.0 - folder inheritance, storage switcher, dmg packaging

- feat(auth-header): implement folder and request auth/header inheritance
- feat(storage): allow changing storage location and persistence
- feat(package): add build-dmg.sh and dynamic version resolution
- test: add Playwright E2E tests and Go test hardening
- fix: make folder variables override environment variables
```

### Bước 5: Cổng xác nhận (Confirmation Gate)
Trình bày tóm tắt cho người dùng:
1. Version mới: `v...`
2. Danh sách các commit sẽ được gom lại.
3. Nội dung commit message chuẩn bị tạo.
4. Lệnh Git sẽ chạy:
   ```bash
   git reset --soft <baseline_commit_hash>
   git commit -m "<commit_message>"
   ```
5. Đợi người dùng phản hồi **xác nhận** mới thực thi.

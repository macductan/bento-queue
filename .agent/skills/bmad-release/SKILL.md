---
name: bmad-release
description: 'Gom và chuẩn hóa commit trực tiếp trên nhánh develop từ mốc commit chuẩn v<version> gần nhất, đánh version mới theo Semantic Versioning từ nguồn duy nhất package.json, và chạy full test local qua hook/script. Use when user says "release", "bmad-release", "chốt tính năng", "gom commit", "chuẩn hóa commit"'
---

# BMad Release & Commit Standardization Workflow (`develop`)

## Mục đích

Làm việc trực tiếp trên nhánh `develop`: chuẩn hóa và gom (squash) các thay đổi đang phát triển (kèm các commit lẻ/sai chuẩn phát sinh sau mốc commit chuẩn `v<version>` gần nhất trên `develop`) thành 1 commit release duy nhất theo Semantic Versioning với tiêu đề `v<version>`, kiểm thử toàn diện ở local (`./scripts/verify-local-ci.sh`).

## Quy tắc bắt buộc

1. **Làm việc trực tiếp trên nhánh `develop`**:
   - Mọi tính năng/story/fix được phát triển trực tiếp trên nhánh `develop` (không tạo nhánh phụ `feat/*` hay `fix/*`).
   - Khi chạy `/bmad-release`, tìm mốc commit chuẩn gần nhất trên `develop` (có tiêu đề chuẩn `v<MAJOR>.<MINOR>.<PATCH>`, ví dụ `v1.15.1` hoặc `v1.15.0`). Nếu có các commit lẻ/sai chuẩn nằm sau mốc đó thì gom (`git reset --soft <baseline_commit>`) cùng thay đổi hiện tại thành 1 commit `v<version>` duy nhất nối tiếp ngay sau mốc chuẩn đó.
2. **Single Source of Truth cho Version**:
   - Version duy nhất nằm tại `projects/frontend/package.json`. Mọi script build (`build-dmg.sh`, `build-deb.sh`, `install-cli.sh`) đều đọc từ file này.
3. **Semantic Versioning (SemVer) dựa trên mốc commit chuẩn gần nhất của `develop`**:
   - Đọc version từ mốc commit chuẩn gần nhất trên nhánh `develop`:
     - Thêm tính năng mới (không breaking): Bump MINOR (`1.15.0` -> `1.16.0`).
     - Sửa lỗi / cải tiến nhỏ: Bump PATCH (`1.15.0` -> `1.15.1`).
     - Breaking change: Bump MAJOR (`1.15.0` -> `2.0.0`).
4. **Quy ước Commit Message trên `develop` (RẤT QUAN TRỌNG)**:
   - **Tiêu đề (subject line)**: BẮT BUỘC chỉ là `v<version>` (ví dụ: `v1.16.0`, `v1.15.1`). **TUYỆT ĐỐI KHÔNG** dùng prefix `feat: release v...`, `v1.x.x (build n)` hay `Merge branch ...`.
   - **Phần thân (body)**: Cách tiêu đề 1 dòng trống, liệt kê các thay đổi dạng bullet points:
     ```text
     v1.16.0

     - feat(...): ...
     - fix(...): ...
     - docs(changelog): document v1.16.0 release notes in CHANGELOG.md
     - chore(release): bump version to 1.16.0 in package.json
     ```
5. **Local CI Hook thay thế GitLab CI/CD**:
   - GitLab CI/CD đã được tắt (`workflow: rules: - when: never` trong `.gitlab-ci.yml`).
   - Hệ thống Git Hooks tại `.githooks/` (`pre-merge-commit`, `pre-commit`, `post-merge`) tự động kích hoạt `./scripts/verify-local-ci.sh` mỗi khi commit/merge vào `develop`.
6. **MANDATORY CONFIRMATION**:
   - Tuyệt đối không tự ý chạy `git reset`, `git commit`, hoặc `git push` nếu chưa trình bày tóm tắt và nhận được sự xác nhận của người dùng.

## Các bước thực hiện

### Bước 1: Kiểm tra trạng thái Git & Mốc Commit chuẩn trên `develop`
- Kiểm tra lịch sử commit gần đây trên `develop`:
  ```bash
  git branch --show-current
  git log --oneline -n 10 develop
  git status --short
  ```
- Xác định mốc commit chuẩn gần nhất (commit có tiêu đề khớp chính xác `v<MAJOR>.<MINOR>.<PATCH>`, không kèm `(build n)` hay prefix khác) và danh sách các commit sai chuẩn (nếu có) cần gom lại.

### Bước 2: Phân tích thay đổi, Xác định Version mới & Cập nhật `CHANGELOG.md`
- Đối chiếu toàn bộ thay đổi tính từ mốc commit chuẩn gần nhất đến working tree hiện tại để phân loại `feat`, `fix`, `docs`, `test`, `chore`.
- Xác định version SemVer mới nối tiếp từ mốc commit chuẩn đó.
- Cập nhật trường `"version"` trong `projects/frontend/package.json`.
- Cập nhật file `CHANGELOG.md` ở thư mục gốc với mục mới `## [v<version>] - YYYY-MM-DD`.

### Bước 3: Chạy toàn bộ Local CI Verification (`./scripts/verify-local-ci.sh`)
Trước khi commit vào `develop`, bắt buộc chạy script kiểm thử toàn diện:
```bash
./scripts/verify-local-ci.sh
```
Script này tự động thực thi:
1. `bun run build:headless`
2. `bun run lint`
3. `bun run type-check`
4. `bun run test`
5. `go vet ./... && go test ./...`
6. `bun run test:e2e`

Nếu có bất kỳ lỗi nào, khắc phục triệt để và chạy lại cho đến khi pass 100%.

### Bước 4: Cổng xác nhận (Confirmation Gate)
Trình bày tóm tắt cho người dùng:
1. Mốc commit chuẩn gần nhất trên `develop` và các commit sai chuẩn (nếu có) sẽ được gom.
2. Version mới: `v<version>`.
3. Nội dung commit message chuẩn bị tạo.
4. Các lệnh Git sẽ thực thi:
   ```bash
   # Nếu có commit sai chuẩn sau <baseline_commit>:
   git reset --soft <baseline_commit>
   git add -A
   SKIP_LOCAL_CI=1 git commit -m "<commit_message>"
   ```
5. Đợi người dùng phản hồi **xác nhận** mới thực thi.

### Bước 5: Thực thi Commit trên `develop` & Tùy chọn Push / Build `.deb`
- Thực thi các lệnh ở Bước 4 sau khi người dùng xác nhận.
- Kiểm tra lại `git log --oneline -n 5 develop` để xác nhận commit `v<version>` đã nằm ngay trên đỉnh mốc commit chuẩn trước đó.
- Hỏi người dùng nếu muốn:
  1. Push nhánh `develop` lên remote (`git push origin develop` hoặc `--force-with-lease` nếu có gom lại commit đã push trước đó).
  2. Đóng gói bản cài đặt `.deb` cho Ubuntu (`./projects/build-deb.sh`) và cập nhật CLI (`./projects/install-cli.sh`).

---
name: bmad-release
description: 'Gom và chuẩn hóa commit trên nhánh develop, bump version theo Semantic Versioning từ nguồn duy nhất package.json khi chốt tính năng, push force và tạo MR vào main. Use when user says "release", "bmad-release", "chốt tính năng", "gom commit", "chuẩn hóa commit"'
---

# BMad Release & Commit Standardization Workflow

## Mục đích

Chuẩn hóa và gom (squash) toàn bộ commit trên nhánh `develop` tính từ mốc commit chuẩn gần nhất (commit release trước đó, ví dụ `v1.1.0 (build 3)`) thành 1 commit release duy nhất theo Semantic Versioning với tiêu đề `v<version>`. Hỗ trợ push force lên remote, tạo GitLab Merge Request vào `main` và đóng gói bản `.deb` cho Ubuntu.

## Quy tắc bắt buộc

1. **Single Source of Truth cho Version**: Version duy nhất nằm tại `projects/frontend/package.json`. Mọi script build (`build-dmg.sh`, `build-deb.sh`) phải đọc từ file này.
2. **Semantic Versioning (SemVer)**:
   - Thêm tính năng mới (không breaking): Bump MINOR (`1.1.0` -> `1.2.0`).
   - Sửa lỗi / cải tiến nhỏ: Bump PATCH (`1.2.0` -> `1.2.1`).
   - Breaking change: Bump MAJOR (`1.2.0` -> `2.0.0`).
3. **Quy ước Commit Message (RẤT QUAN TRỌNG)**:
   - **Tiêu đề (subject line)**: BẮT BUỘC chỉ là `v<version>` (ví dụ: `v1.2.0`, `v1.1.0`). **TUYỆT ĐỐI KHÔNG** dùng prefix `feat: release v...` hay mô tả dài trên dòng đầu.
   - **Phần thân (body)**: Cách tiêu đề 1 dòng trống, liệt kê các thay đổi dạng bullet points:
     ```
     v1.2.0

     - feat(backend): implement multi-collection CRUD, directory structure and slug-UUID convention
     - feat(store): implement collection store, active collection switching and state isolation
     - feat(ui): implement CollectionSwitcher, CollectionModal and settings management
     - chore: upgrade bmad to v6.12.2
     - chore(release): bump version to 1.2.0 in package.json
     ```
4. **Wails Binding Model Type Export (Lưu ý kỹ thuật)**:
   - Mọi struct Go (như `model.Collection`, `model.Folder`,...) muốn xuất hiện trong `projects/frontend/wailsjs/go/models.ts` để frontend TypeScript biên dịch được thì BẮT BUỘC phải được tham chiếu trực tiếp qua tham số hoặc kiểu trả về của một method trên `*App` (ví dụ `UpdateCollection(collection model.Collection) model.Result`). Nếu chỉ nằm trong `model.Result.Data` (`interface{}`), Wails CLI sẽ bỏ qua và không sinh TypeScript type.
5. **MANDATORY CONFIRMATION**: Tuyệt đối không tự ý chạy `git commit`, `git reset`, hoặc `git push` nếu chưa xin ý kiến và nhận được sự xác nhận của người dùng.

## Các bước thực hiện

### Bước 1: Kiểm tra trạng thái Git & Commit chuẩn
- Tìm commit chuẩn gần nhất:
  - Kiểm tra commit release gần nhất trên `develop` (dạng `v1.x.x` hoặc `v1.x.x (build n)`) hoặc merge commit gần nhất trên `main`:
    ```bash
    git log --oneline -n 10 develop
    ```
  - Xác định các commit lẻ cần gom lại và mốc baseline commit hash.
- Đảm bảo working tree sạch sẽ trước khi thao tác (`git status`).

### Bước 2: Phân tích thay đổi & Xác định Version mới
- Đọc git log để phân loại các thay đổi: `feat`, `fix`, `docs`, `test`, `chore`.
- Đề xuất version SemVer mới (ví dụ `1.2.0`).
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
Tạo commit message theo đúng quy ước:
```
v<version>

- feat(...): ...
- fix(...): ...
- chore(...): ...
```

### Bước 5: Cổng xác nhận (Confirmation Gate)
Trình bày tóm tắt cho người dùng:
1. Version mới: `v<version>`
2. Danh sách các commit sẽ được gom lại và baseline hash.
3. Nội dung commit message chuẩn bị tạo.
4. Lệnh Git sẽ chạy:
   ```bash
   git add projects/frontend/package.json
   git reset --soft <baseline_commit_hash>
   git commit -m "<commit_message>"
   ```
5. Đợi người dùng phản hồi **xác nhận** mới thực thi.

### Bước 6: Push Remote & Tạo Merge Request vào main
Sau khi commit release được tạo thành công trên `develop`:
- Hỏi xác nhận hoặc thực thi đẩy lên remote:
  ```bash
  git push -o merge_request.create -o merge_request.target=main -o merge_request.title="v<version>" origin develop --force
  ```
- Lệnh này sẽ push force cập nhật nhánh `develop` trên GitLab đồng thời tự động tạo Merge Request nhắm vào `main`, kích hoạt GitLab CI pipeline kiểm thử.
- Cung cấp link GitLab Merge Request cho người dùng.

### Bước 7: Hỗ trợ đóng gói bản cài đặt Ubuntu (.deb)
- Hỏi người dùng nếu muốn build file cài đặt `.deb` để test/cập nhật:
  ```bash
  ./projects/build-deb.sh
  ```
- File `.deb` sẽ được xuất tại `projects/build/hecto-api_<version>_amd64.deb`.
- Hướng dẫn người dùng lệnh cài đặt:
  ```bash
  sudo dpkg -i projects/build/hecto-api_<version>_amd64.deb
  ```

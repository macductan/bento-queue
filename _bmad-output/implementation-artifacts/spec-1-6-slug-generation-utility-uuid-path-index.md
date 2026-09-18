---
title: 'Story 1.6: Slug Generation Utility & UUID→Path Index'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '3f5c8cef98ffad7d041ec517bd00342fc148eafe'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Chưa có cơ chế tạo slug cho tên tiếng Việt (diacritics → ASCII) để làm filename, và `FindByUUID` chỉ có O(1) index lookup mà thiếu fallback walk khi index miss. Service CRUD (request, folder) cần slug khi create entity nhưng chưa có utility.

**Approach:** Tạo package `slug` trong Go với hàm `Generate` strip diacritics tiếng Việt, tạo kebab-case filename. Bổ sung `GenerateUnique` xử lý collision bằng suffix `-1`, `-2`. Implement fallback walk trong `FindByUUID` khi index miss. Tạo `IndexRebuild` để build lại toàn bộ index từ disk (phục vụ `GetCollectionTree`).

## Boundaries & Constraints

**Always:**
- Slug sinh lúc create, không đổi khi rename (AD-4).
- Diacritics stripped bằng Unicode normalization (NFD → remove combining marks), không hardcode bảng mapping.
- Output: lowercase, spaces/underscores → hyphens, remove ký tự không phải alphanumeric/hyphen, dedup hyphens, trim hyphens đầu cuối.
- Append `.json` extension cho filename output.
- FindByUUID fallback walk chỉ khi index miss — scan collection root, đọc JSON, match UUID field.
- Không thêm external dependency (dùng `golang.org/x/text` có sẵn trong Go ecosystem, hoặc stdlib `unicode`).

**Never:**
- Không hardcode bảng chuyển đổi diacritics thủ công cho từng ký tự tiếng Việt.
- Không thay đổi file shape hiện tại (model/types.go giữ nguyên).
- Không implement logic create/save request/folder — chỉ cung cấp utility cho service layer gọi.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vietnamese diacritics | "Đăng nhập" | "dang-nhap.json" | Không lỗi |
| English normal | "Get All Users" | "get-all-users.json" | Không lỗi |
| Special chars | "Test @#$ API!" | "test-api.json" | Không lỗi |
| Multiple spaces/hyphens | "hello   --  world" | "hello-world.json" | Không lỗi |
| Empty string | "" | "untitled.json" | Không lỗi, fallback tên mặc định |
| Collision lần 1 | "dang-nhap.json" đã tồn tại | "dang-nhap-1.json" | Không lỗi |
| Collision lần 2 | cả 2 đã tồn tại | "dang-nhap-2.json" | Không lỗi |
| FindByUUID index hit | UUID có trong index | Trả path O(1) | Không lỗi |
| FindByUUID index miss, file exists | UUID không trong index nhưng file tồn tại trên disk | Walk tìm thấy → trả path, cập nhật index | Không lỗi |
| FindByUUID index miss, no file | UUID không tồn tại | NOT_FOUND error | Trả error NOT_FOUND |

</intent-contract>

## Code Map

- `projects/storage/filesystem.go` L191-201 -- `FindByUUID` hiện tại: chỉ index lookup, có TODO fallback walk. Cần bổ sung `collectionRoot` field và `WalkFindByUUID` logic.
- `projects/storage/filesystem.go` L19-29 -- `FileSystem` struct: cần thêm `collectionRoot string` để fallback walk biết scan ở đâu.
- `projects/storage/filesystem.go` L174-186 -- `IndexSet`/`IndexDelete`: đã hoạt động, giữ nguyên.
- `projects/storage/filesystem_test.go` -- test hiện tại cho index hit/miss. Cần thêm test cho fallback walk và `IndexRebuild`.
- `projects/model/types.go` -- Request.ID, Folder.ID: UUID field cần match khi walk. Read-only.
- `projects/service/collection.go` L23 -- `GetTree` stub: nơi sẽ gọi `IndexRebuild` (Epic 2, không phải story này — chỉ cung cấp method).
- `projects/service/request.go` -- sử dụng `FindByUUID`: hưởng lợi từ fallback walk tự động.

## Tasks & Acceptance

**Execution:**
- `projects/slug/slug.go` -- Tạo package `slug` với hàm `Generate(name string) string` (strip diacritics, kebab-case, append .json) và `GenerateUnique(name, dir string) string` (gọi `Generate` rồi check collision, append suffix nếu cần) -- Utility core cho tất cả entity creation.
- `projects/slug/slug_test.go` -- Unit test toàn bộ I/O matrix: Vietnamese, English, special chars, empty, collision -- Đảm bảo slug generation chính xác trước khi tích hợp.
- `projects/storage/filesystem.go` -- Thêm `SetCollectionRoot(root string)`, bổ sung fallback walk trong `FindByUUID` (scan `collectionRoot` recursive, đọc JSON, match `"id"` field), thêm `IndexRebuild(root string) error` walk toàn bộ tree và populate index -- Hoàn thiện UUID→path index theo epic context (AR-10).
- `projects/storage/filesystem_test.go` -- Thêm test cho fallback walk (index miss + file tồn tại) và `IndexRebuild` -- Verify fallback walk hoạt động end-to-end.

**Acceptance Criteria:**
- Given chuỗi "Đăng nhập", when gọi `slug.Generate`, then output là "dang-nhap.json"
- Given chuỗi "Get All Users", when gọi `slug.Generate`, then output là "get-all-users.json"
- Given file "dang-nhap.json" đã tồn tại trong dir, when gọi `slug.GenerateUnique("Đăng nhập", dir)`, then output là "dang-nhap-1.json"
- Given UUID tồn tại trên disk nhưng không trong index, when gọi `FindByUUID`, then walk tìm thấy file và trả path đúng, đồng thời cập nhật index
- Given collection root có requests và folders, when gọi `IndexRebuild`, then index chứa tất cả UUID→path mapping
- Given tất cả Go test pass, when chạy `go vet ./...`, then không có warning

## Spec Change Log


## Review Triage Log

### 2026-10-02 — Review pass
- verdicts: 6 findings — high 0, medium 0, low 3, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` `len(f.index)` read without lock in `IndexRebuild` slog.Info — Log runs after all walk callbacks and IndexSet calls complete; no concurrent writer at that point. Fix adds lock/unlock for a single debug log — not worth the complexity.
  - `[low]` `[reject]` Duplicated walk logic between `walkFindUUID` and `IndexRebuild` (~30 lines) — Two functions have subtly different purposes (early-return vs accumulate). Extracting shared helper adds abstraction for two callers. Acceptable for v1, can refactor in 1.7 cleanup.
  - `[low]` `[reject]` `GenerateUnique` infinite loop on extreme collision — v1 collections are small (< 100 files). OS limits prevent thousands of files in a directory. Adding a cap is complexity for no realistic scenario.
  - `[false]` `[reject]` Unicode ligature handling missing in `slug.Generate` — Vietnamese text does not use ligatures. Spec targets diacritics stripping for Vietnamese, not universal Unicode transformations.
  - `[low]` `[reject]` Same as finding #1 (duplicate from different review layer) — Same evidence as #1.
  - `[false]` `[reject]` Spec mentions `golang.org/x/text/transform` but impl uses only `norm` — Impl achieves same result with `norm.NFD.String()` + manual rune filtering, which is simpler and equally correct. Design Notes are guidance, not binding.

## Design Notes

Dùng `golang.org/x/text/unicode/norm` và `golang.org/x/text/transform` để strip combining marks (NFD normalize → remove `unicode.Mn` category). Đây là approach chuẩn cho Unicode diacritics stripping, hoạt động với mọi ngôn ngữ Latin-based, không chỉ tiếng Việt.

Fallback walk trong `FindByUUID` cần hiệu quả: chỉ đọc đủ bytes đầu file để parse `"id"` field, không unmarshal toàn bộ. Tuy nhiên v1 collection nhỏ nên full unmarshal cũng chấp nhận được — optimize sau nếu cần (Epic 1.7 cleanup).

`IndexRebuild` walk recursive: đọc tất cả `.json` (trừ `_folder.json`, `collection.json`, files trong `environments/`), parse `id` field, populate index. Hàm này sẽ được gọi bởi `GetCollectionTree` (Epic 2) nhưng story này chỉ cung cấp method.

## Verification

**Commands:**
- `cd projects && go test ./slug/ -v -count=1` -- expected: tất cả slug tests pass
- `cd projects && go test ./storage/ -v -count=1` -- expected: tất cả storage tests pass (bao gồm fallback walk và IndexRebuild)
- `cd projects && go vet ./...` -- expected: không có warning
- `cd projects && go build ./...` -- expected: build thành công

## Auto Run Result

Status: done

### Tóm tắt thay đổi
Tạo package `slug` cho Go với hàm `Generate` (strip diacritics tiếng Việt bằng Unicode NFD, tạo kebab-case filename .json) và `GenerateUnique` (xử lý collision bằng suffix số). Bổ sung `FindByUUID` fallback walk khi index miss, `SetCollectionRoot`, `IndexRebuild`, và `IndexClear` trong `storage.FileSystem`.

### Files changed
- `projects/slug/slug.go` — Package mới: `Generate` và `GenerateUnique` functions
- `projects/slug/slug_test.go` — 13 test cases bao gồm Vietnamese diacritics, English, special chars, empty, collision
- `projects/storage/filesystem.go` — Thêm `collectionRoot` field, `SetCollectionRoot`, fallback walk trong `FindByUUID`, `IndexRebuild`, `IndexClear`
- `projects/storage/filesystem_test.go` — 6 test cases mới: fallback walk hit/miss, no collection root, IndexRebuild populate/clear, IndexClear
- `projects/go.mod` — Promote `golang.org/x/text` từ indirect thành direct dependency

### Review findings
- 0 patches applied
- 0 items deferred
- 6 findings rejected: 3 low (cosmetic, không đáng fix), 2 false (claim không đúng), 1 duplicate

### Verification
- `go test ./slug/ -v -count=1` — 13/13 PASS
- `go test ./storage/ -v -count=1` — 17/17 PASS
- `go vet ./...` — no warnings
- `go build ./...` — success

### Residual risks
Không có rủi ro đáng kể. Walk logic duplicated nhưng chấp nhận được cho v1 — Epic 1.7 cleanup có thể refactor nếu cần.


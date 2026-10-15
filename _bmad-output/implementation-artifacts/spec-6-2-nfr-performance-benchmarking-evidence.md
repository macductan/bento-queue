---
title: 'Story 6.2: NFR Performance Benchmarking & Evidence'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_revision: 'f1883a682f71554e3c70a7cd5ca7993b98303d0c'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Hệ thống CI/CD và bộ kiểm thử tự động hiện tại chưa đo đạc, kiểm chứng ngưỡng hiệu năng phi chức năng (NFR) về thời gian khởi động (< 2.0 giây) và mức tiêu thụ bộ nhớ RAM cơ sở (< 100 MB), cũng như chưa xuất bản bằng chứng đo đạc (metrics artifacts) vào thư mục `test-results` để phục vụ kiểm toán chất lượng (NFR audit).

**Approach:** Xây dựng bộ đánh giá ngưỡng NFR và thu thập chỉ số thời gian khởi động cùng mức tiêu thụ RAM tự động ở cả tầng Go backend (`projects/app_test.go`) lẫn tầng giao diện E2E Playwright (`projects/frontend/src/utils/performanceMetrics.ts`, `projects/frontend/tests/support/performance-collector.ts`, `projects/frontend/tests/e2e/performance.spec.ts`), đồng thời cấu hình `.gitlab-ci.yml` luôn xuất bản các báo cáo chỉ số trong thư mục `test-results` làm bằng chứng kiểm toán trên CI pipeline.

## Boundaries & Constraints

**Always:**
- Tuân thủ quy ước số nguyên (integers, không dùng số thực dấu phẩy động) cho các chỉ số thời gian phản hồi/khởi động (`bootTimeMs`, `domContentLoadedMs`, `loadEventMs` tính bằng mili-giây nguyên) và dung lượng bộ nhớ (`baselineRamBytes`, `peakRamBytes`, `baselineRamMB`, `peakRamMB` làm tròn lên số nguyên MB hoặc byte nguyên).
- Đánh trượt (fail) bài kiểm thử và CI job nếu thời gian khởi động (`bootTimeMs`) vượt quá `2000` ms (`2.0` giây) hoặc nếu mức tiêu thụ RAM vượt ngưỡng cứng `100` MB (`100 * 1024 * 1024` bytes); phát cảnh báo (`WARN`) nếu mức tiêu thụ RAM cơ sở nằm trong vùng cảnh báo từ `80` MB đến `100` MB.
- Thu thập mẫu RAM tại thời điểm ngay sau khi khởi động xong (baseline) và trong suốt quá trình thực thi các kịch bản thao tác (tạo thư mục, tạo request, nạp request vào editor, chỉnh sửa URL/headers, xóa thư mục).
- Ghi kết quả đo đạc định dạng JSON và Markdown (`nfr-performance-metrics.json`, `nfr-performance-summary.md` tại `projects/frontend/test-results/` và `backend-nfr-metrics.json` tại `projects/test-results/`) trên mọi lần chạy kiểm thử (kể cả khi chia shard `--shard=1/2` và `--shard=2/2`), đồng thời cấu hình `.gitlab-ci.yml` với `artifacts: when: always` để luôn lưu trữ thư mục `test-results` trên CI.
- Mọi kiểm thử E2E sử dụng cơ chế auto-waiting của Playwright, tuyệt đối không dùng `page.waitForTimeout` hay `time.Sleep`.

**Never:**
- Không sử dụng `npm`, `npx`, `yarn`, `pnpm` (chỉ dùng `bun` với Node 24).
- Không import các module Node.js (`fs`, `path`, `process`) vào trong `projects/frontend/src/` để tránh phá vỡ quá trình biên dịch trình duyệt (`vue-tsc`).
- Không để các file kết quả sinh ra trong `test-results/` làm bẩn trạng thái Git working tree (đảm bảo `projects/.gitignore` đã bỏ qua `test-results/`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khởi động và bộ nhớ đạt chuẩn NFR | `bootTimeMs = 450` (<= 2000 ms), `baselineRamBytes = 25 * 1024 * 1024` (~25 MB <= 80 MB), `peakRamBytes = 32 * 1024 * 1024` (~32 MB <= 100 MB) | Đánh giá trả về `status: 'PASS'`, `bootPassed: true`, `ramPassed: true`, `warnings: []`, `failures: []`, tất cả giá trị thời gian (ms) và dung lượng (bytes/MB) là số nguyên | Không phát sinh lỗi |
| Bộ nhớ cơ sở nằm trong ngưỡng cảnh báo (80 MB < RAM <= 100 MB) | `bootTimeMs = 800`, `baselineRamBytes = 85 * 1024 * 1024` (85 MB) | Đánh giá trả về `status: 'WARN'`, `bootPassed: true`, `ramPassed: true`, mảng `warnings` chứa cảnh báo vượt ngưỡng cảnh báo 80 MB nhưng chưa vượt 100 MB | Ghi nhận cảnh báo vào báo cáo artifact và log mà không làm gãy cấu trúc báo cáo |
| Thời gian khởi động vượt quá 2.0 giây (> 2000 ms) | `bootTimeMs = 2001` (hoặc lớn hơn) | Đánh giá trả về `status: 'FAIL'`, `bootPassed: false`, mảng `failures` ghi rõ lỗi vượt ngân sách khởi động 2000 ms | Bài kiểm thử và CI job fail ngay lập tức sau khi đã ghi artifact bằng chứng |
| Bộ nhớ tiêu thụ vượt quá 100 MB | `baselineRamBytes = 101 * 1024 * 1024` hoặc `peakRamBytes = 105 * 1024 * 1024` (> 100 MB) | Đánh giá trả về `status: 'FAIL'`, `ramPassed: false`, mảng `failures` ghi rõ lỗi vượt ngân sách RAM 100 MB | Bài kiểm thử và CI job fail ngay lập tức sau khi đã ghi artifact bằng chứng |
| Dữ liệu đầu vào không hợp lệ (số âm, NaN, mảng mẫu rỗng) | `bootTimeMs = -10` hoặc `NaN`, hoặc mảng mẫu bộ nhớ rỗng `[]` | Đánh giá trả về `status: 'FAIL'`, `bootPassed: false` / `ramPassed: false`, mảng `failures` mô tả dữ liệu đo đạc không hợp lệ | Từ chối đánh giá `PASS` cho dữ liệu đo bị hỏng hoặc thiếu mẫu |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/performanceMetrics.ts` -- Module tiện ích thuần TypeScript định nghĩa hằng số ngân sách NFR (`MAX_BOOT_TIME_MS = 2000`, `MAX_RAM_MB = 100`, `WARN_RAM_MB = 80`), chuẩn hóa số nguyên (ms, bytes, MB), đánh giá kết quả đo đạc (`evaluateNfrMetrics`), và định dạng báo cáo Markdown (`formatNfrMarkdownSummary`).
- `projects/frontend/src/utils/__tests__/performanceMetrics.test.ts` -- Bộ unit test Vitest kiểm thử toàn bộ ma trận I/O và các trường hợp biên của `performanceMetrics.ts` (chuẩn hóa số nguyên, PASS, WARN, FAIL do boot > 2000ms, FAIL do RAM > 100MB, dữ liệu âm/NaN/rỗng).
- `projects/frontend/tests/support/performance-collector.ts` -- Trình thu thập chỉ số hiệu năng cho Playwright E2E sử dụng Navigation Timing API và Chrome DevTools Protocol (`Performance.getMetrics` lấy `JSHeapUsedSize`, `JSHeapTotalSize`) kèm ghi file báo cáo tổng hợp `projects/frontend/test-results/nfr-performance-metrics.json` và `projects/frontend/test-results/nfr-performance-summary.md`.
- `projects/frontend/tests/support/merged-fixtures.ts` -- Fixture dùng chung cho mọi bài kiểm thử Playwright E2E (L19-24); tích hợp thu thập chỉ số khởi động và bộ nhớ tự động để đảm bảo mọi shard E2E (`--shard=1/2` và `--shard=2/2`) đều xuất bản báo cáo NFR vào `projects/frontend/test-results/`.
- `projects/frontend/tests/e2e/performance.spec.ts` -- Bộ kiểm thử E2E chuyên biệt đo thời gian cold start (< 2.0s), lấy mẫu bộ nhớ cơ sở và trong quá trình thực thi thao tác trên cây thư mục/request editor (< 100MB), đính kèm artifact vào Playwright testInfo và xác nhận file bằng chứng trong `projects/frontend/test-results/`.
- `projects/app_test.go` -- Kiểm thử tầng Go backend (`TestApp_startup` L14-45); bổ sung `TestApp_NFRStartupAndMemory` đo thời gian khởi tạo `NewApp()` + `app.startup(ctx)` + `app.GetCollectionTree()` (< 2000ms), lấy mẫu bộ nhớ `runtime.ReadMemStats` (< 100MB) và xuất báo cáo `projects/test-results/backend-nfr-metrics.json`.
- `.gitlab-ci.yml` -- Cấu hình pipeline GitLab CI (`test:backend` L64-77, `.frontend-e2e-template` L89-105, `burn-in:frontend` L118-143, `report` L145-157); cập nhật `artifacts: when: always` và tổng hợp hiển thị báo cáo NFR trong bước `report`.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/performanceMetrics.ts` -- Tạo module tính toán, chuẩn hóa số nguyên và đánh giá ngưỡng NFR (`bootTimeMs <= 2000`, `baselineRamMB <= 100`, cảnh báo ở `80 MB`) cùng hàm sinh báo cáo Markdown/JSON -- Cung cấp logic đánh giá hiệu năng tất định, dùng chung và dễ kiểm thử.
- `projects/frontend/src/utils/__tests__/performanceMetrics.test.ts` -- Viết unit test bao phủ toàn bộ các kịch bản trong I/O & Edge-Case Matrix (PASS, WARN 80–100MB, FAIL khi boot > 2000ms, FAIL khi baseline/peak RAM > 100MB, xử lý số thực làm tròn thành số nguyên, giá trị âm/NaN/mảng rỗng) -- Đảm bảo bộ đánh giá ngưỡng NFR hoạt động chính xác tuyệt đối.
- `projects/frontend/tests/support/performance-collector.ts` & `projects/frontend/tests/support/merged-fixtures.ts` -- Triển khai hàm đo thời gian khởi động qua Navigation Timing + wall-clock readiness, lấy mẫu bộ nhớ qua CDP `Performance.getMetrics` (`JSHeapUsedSize`) / `performance.memory`, và tự động ghi/cập nhật `projects/frontend/test-results/nfr-performance-metrics.json` cùng `nfr-performance-summary.md` -- Đảm bảo mọi lần chạy hoặc mọi shard E2E đều ghi nhận dữ liệu NFR vào `test-results`.
- `projects/frontend/tests/e2e/performance.spec.ts` -- Tạo các kịch bản E2E kiểm chứng thời gian khởi động ứng dụng < 2.0 giây, lấy mẫu bộ nhớ khi nhàn rỗi và khi thực thi chuỗi thao tác CRUD thư mục/request < 100 MB, đính kèm chỉ số vào `testInfo` và kiểm tra sự tồn tại + tính hợp lệ của file báo cáo trong `projects/frontend/test-results/` -- Xác thực trực tiếp các tiêu chí nghiệm thu của Story 6.2 trên trình duyệt thật.
- `projects/app_test.go` -- Bổ sung `TestApp_NFRStartupAndMemory` đo thời gian khởi động lạnh của Go backend (< 2000ms) và lấy mẫu RAM bằng `runtime.ReadMemStats` (< 100MB) qua các thao tác khởi tạo + CRUD bộ sưu tập, đồng thời xuất file `projects/test-results/backend-nfr-metrics.json` -- Cung cấp bằng chứng hiệu năng đầy đủ cho cả tầng backend Go.
- `.gitlab-ci.yml` -- Đổi cấu hình `artifacts: when: always` cho `.frontend-e2e-template`, `burn-in:frontend`, bổ sung `projects/test-results/` vào `test:backend`, và cập nhật job `report` để in tóm tắt chỉ số NFR và lưu trữ artifact `test-results` -- Đảm bảo chỉ số hiệu năng luôn được xuất bản lên CI phục vụ kiểm toán kể cả khi pipeline pass hoặc fail.

**Acceptance Criteria:**
- Given bộ kiểm thử tự động đang chạy trên môi trường local hoặc CI, when ứng dụng khởi động và sẵn sàng tương tác, then thời gian khởi động (`bootTimeMs`) được đo đạc dưới dạng số nguyên mili-giây, nhỏ hơn hoặc bằng `2000` ms (2.0 giây), và được ghi nhận vào báo cáo trong thư mục `test-results`.
- Given ứng dụng đã khởi động trong phiên kiểm thử, when thực thi các kịch bản kiểm thử (khởi tạo mặc định, tạo thư mục, tạo request, nạp và chỉnh sửa request, xóa thư mục), then mức tiêu thụ bộ nhớ RAM được lấy mẫu ở cả trạng thái cơ sở (baseline) lẫn trong lúc thực thi (execution/peak) và luôn duy trì dưới ngưỡng `100` MB.
- Given bộ đánh giá ngưỡng NFR kiểm tra các chỉ số thu thập được, when thời gian khởi động vượt quá `2000` ms, then kết quả đánh giá trả về `FAIL` và làm bài kiểm thử / CI job thất bại.
- Given bộ đánh giá ngưỡng NFR kiểm tra mức tiêu thụ bộ nhớ, when RAM cơ sở vượt quá `80` MB đến `100` MB hoặc vượt quá `100` MB, then hệ thống phát cảnh báo (`WARN`) ở mức `80–100` MB và đánh trượt (`FAIL`) khi vượt quá `100` MB.
- Given pipeline kiểm thử hoàn tất (bao gồm chạy toàn bộ E2E, chạy từng shard `--shard=1/2` và `--shard=2/2`, và chạy `go test ./...`), when kiểm tra thư mục artifact `projects/frontend/test-results/` và `projects/test-results/`, then các file bằng chứng `nfr-performance-metrics.json`, `nfr-performance-summary.md`, và `backend-nfr-metrics.json` được xuất bản đầy đủ với cấu hình `when: always` trong `.gitlab-ci.yml`.

## Spec Change Log

## Review Triage Log

### 2026-10-14 — Review pass
- verdicts: 32 findings — high 0, medium 18, low 13, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` `measureColdStart` lấy `Math.min(wallElapsedMs, navTimings.readyMs)` làm giảm thời gian khởi động thực tế (`performance-collector.ts:1012-1015`) — Đã sửa: tính `bootTimeMs = Math.max(1, wallElapsedMs, normalizeIntegerMs(navTimings.loadEventMs))` để luôn phản ánh toàn bộ thời gian điều hướng và hiển thị giao diện.
  - `[medium]` `[patch]` `collectMemorySample` tạo giá trị giả `12 MB` / `24 MB` khi cả CDP và `performance.memory` đều không khả dụng (`performance-collector.ts:1047-1059`) — Đã sửa: trả về `-1` cho `usedHeapBytes` và `totalHeapBytes` khi không thu thập được số liệu hợp lệ để `evaluateNfrMetrics` đánh dấu `FAIL`.
  - `[medium]` `[patch]` `collectAndPersistPageNfrMetrics` dùng số cố định `150 ms` khi thiếu Navigation Timing và `merged-fixtures.ts` không kiểm tra kết quả đánh giá NFR (`performance-collector.ts:1080-1126`, `merged-fixtures.ts:24`) — Đã sửa: trả về `-1` khi thiếu `nav` và bổ sung `expect(evaluated.bootPassed).toBe(true)`, `expect(evaluated.ramPassed).toBe(true)` trong `merged-fixtures.ts`.
  - `[medium]` `[patch]` `writeNfrMetricsArtifacts` trong `performance.spec.ts` ghi đè các mẫu đã thu thập trước đó bởi fixture teardown (`merged-fixtures.ts:21-25`, `performance.spec.ts:75-102`) — Đã sửa: bổ sung hàm `mergeAndWriteNfrMetrics` gộp danh sách mẫu và giữ `Math.max` cho `bootTimeMs` cùng `peakRamBytes`.
  - `[medium]` `[patch]` Job `report` trong `.gitlab-ci.yml` bị ghi đè file giữa `shard-1` và `shard-2` do trùng đường dẫn artifact (`.gitlab-ci.yml:109-118, 147-166`) — Đã sửa: xuất thêm bản sao gắn hậu tố shard (`nfr-performance-metrics-shard-1.json`, `nfr-performance-summary-shard-1.md`, `shard-2`) và hiển thị cả hai shard trong job `report`.
  - `[low]` `[patch]` `formatNfrMarkdownSummary` dùng chung `metrics.ramPassed` cho cả dòng `Baseline RAM` và `Peak Execution RAM` (`performanceMetrics.ts:790-791`) — Đã sửa: tính trạng thái `PASS` / `WARN` / `FAIL` độc lập cho từng dòng dựa trên `baselineRamBytes` và `peakRamBytes`.
  - `[low]` `[patch]` `evaluateNfrMetrics` bỏ qua cảnh báo `Peak execution RAM` khi `baselineRamBytes` cũng nằm trong vùng cảnh báo 80–100 MB (`performanceMetrics.ts:734-740`) — Đã sửa: gỡ điều kiện `&& baselineRamBytes <= NFR_THRESHOLDS.WARN_RAM_BYTES` để ghi nhận đầy đủ cảnh báo cho cả baseline và peak.
  - `[medium]` `[patch]` `evaluateNfrMetrics` ép các giá trị âm hoặc `NaN` của `domContentLoadedMs`, `loadEventMs` và `samples` về `0` qua `Math.max(0, -1)` thay vì báo lỗi (`performanceMetrics.ts:648-675`) — Đã sửa: kiểm tra hợp lệ từng trường và từng mẫu trước khi chuẩn hóa, đặt `bootPassed = false` / `ramPassed = false` kèm thông báo lỗi trong `failures`.
  - `[low]` `[patch]` `performance.spec.ts` mới chỉ sửa URL mà chưa thao tác chỉnh sửa headers như mô tả trong spec (`performance.spec.ts:868-893`) — Đã sửa: bổ sung bước mở tab `Headers` và điền cặp key/value header (`X-NFR-Benchmark: story-6-2`) trước khi lấy mẫu bộ nhớ.
  - `[low]` `[patch]` `collectMemorySample` gọi `cdpSession.detach()` bên trong `try` thay vì `finally` có thể gây rò rỉ phiên CDP nếu `cdpSession.send` lỗi (`performance-collector.ts:1028-1045`) — Đã sửa: bọc `await cdpSession?.detach().catch(() => {})` trong khối `finally`.
  - `[low]` `[patch]` `TestApp_NFRStartupAndMemory` chưa ghi artifact nếu bước trước đó dừng sớm và `backendNFREvidence` thiếu trường `warnings`/`failures` (`projects/app_test.go:174-321`) — Đã sửa: tách hàm `evaluateBackendNFRMetrics` có đủ `Warnings`/`Failures` (tính theo `max(AllocBytes, HeapInuseBytes)`), và đảm bảo luôn ghi `backend-nfr-metrics.json` qua `defer`.
  - `[low]` `[patch]` `normalizeIntegerMs` và `normalizeIntegerBytes` dùng `Math.round` có thể làm tròn xuống các giá trị thập phân vượt ngưỡng như `2000.4` ms về `2000` ms (`performanceMetrics.ts:55-63`) — Đã sửa: đổi sang `Math.ceil(value)` để bảo toàn tính nghiêm ngặt của ngân sách NFR.
  - `[medium]` `[patch]` Mẫu bộ nhớ trong `input.samples` có `usedHeapBytes` hoặc `totalHeapBytes` âm/`NaN` bị ép về `0` mà không đánh trượt (`performanceMetrics.ts:91-106`) — Đã sửa: kiểm tra hợp lệ từng mẫu trong `evaluateNfrMetrics` (cùng nhóm với phát hiện số 8).
  - `[low]` `[patch]` Cảnh báo `peakRamBytes` bị ẩn khi cả `baselineRamBytes` và `peakRamBytes` đều thuộc vùng 80–100 MB (`performanceMetrics.ts:165-171`) — Đã sửa: bỏ điều kiện chặn `baselineRamBytes <= WARN_RAM_BYTES` (cùng nhóm với phát hiện số 7).
  - `[low]` `[patch]` Bảng Markdown trong `formatNfrMarkdownSummary` hiển thị sai trạng thái khi chỉ `peakRamBytes` vượt ngưỡng hoặc nằm trong vùng cảnh báo (`performanceMetrics.ts:221-222`) — Đã sửa: tính trạng thái riêng cho từng dòng `Baseline RAM` và `Peak Execution RAM` (cùng nhóm với phát hiện số 6).
  - `[low]` `[patch]` `cdpSession.detach()` bị bỏ qua nếu `cdpSession.send` ném ngoại lệ (`performance-collector.ts:65-82`) — Đã sửa: chuyển `cdpSession.detach()` vào `finally` (cùng nhóm với phát hiện số 10).
  - `[medium]` `[patch]` `collectMemorySample` tạo giá trị giả `12 MB` khi CDP lỗi và `performance.memory` không tồn tại (`performance-collector.ts:84-96`) — Đã sửa: trả về `-1` để báo lỗi dữ liệu đo (cùng nhóm với phát hiện số 2).
  - `[medium]` `[patch]` `writeNfrMetricsArtifacts` trong `performance.spec.ts:74` ghi đè `nfr-performance-metrics.json` làm mất mẫu từ các test chạy trước (`performance.spec.ts:74`) — Đã sửa: dùng `mergeAndWriteNfrMetrics` để gộp mẫu (cùng nhóm với phát hiện số 4).
  - `[medium]` `[patch]` Job `report` trong `.gitlab-ci.yml:150-166` ghi đè file NFR của shard 1 bằng shard 2 (`.gitlab-ci.yml:150-166`) — Đã sửa: lưu thêm file riêng theo từng shard và in cả hai trong job `report` (cùng nhóm với phát hiện số 5).
  - `[low]` `[patch]` `TestApp_NFRStartupAndMemory` dùng `os.Setenv` + `t.Cleanup` thay vì `t.Setenv` cho `XDG_CONFIG_HOME` và `XDG_CACHE_HOME` (`projects/app_test.go:247-254`) — Đã sửa: chuyển sang dùng `t.Setenv` chuẩn của Go `testing`.
  - `[medium]` `[patch]` `collectAndPersistPageNfrMetrics` trong `merged-fixtures.ts:21-25` không kiểm tra `status !== 'FAIL'` sau khi thu thập (`merged-fixtures.ts:21-25`) — Đã sửa: bổ sung kiểm tra `expect(evaluated.bootPassed).toBe(true)` và `expect(evaluated.ramPassed).toBe(true)` (cùng nhóm với phát hiện số 3).
  - `[medium]` `[patch]` Thiếu kiểm thử xác minh `collectAndPersistPageNfrMetrics` / `readExistingMetricsArtifact` và kiểm tra sự tồn tại của file NFR trên từng shard CI (`performance-collector.ts:108-164`, `merged-fixtures.ts:21-25`, `.gitlab-ci.yml:109-118`) — Đã sửa: bổ sung kịch bản kiểm thử thứ hai trong `performance.spec.ts` và thêm `test -f test-results/nfr-performance-metrics.json` vào từng job shard trong `.gitlab-ci.yml`.
  - `[low]` `[patch]` Chưa có unit test cho nhánh cảnh báo `peakRamBytes` (80–100 MB) khi `baselineRamBytes <= 80 MB` và khi `peakRamBytes` được suy ra từ `samples` (`performanceMetrics.ts:165-172`, `performanceMetrics.test.ts`) — Đã sửa: bổ sung unit test cho cả hai trường hợp trong `performanceMetrics.test.ts`.
  - `[low]` `[patch]` `formatNfrMarkdownSummary` tính sai cột Result cho dòng `Baseline RAM` và `Peak Execution RAM` (`performanceMetrics.ts:221-222`) — Đã sửa: tính độc lập trạng thái từng dòng và bổ sung unit test (cùng nhóm với phát hiện số 6, 15).
  - `[medium]` `[patch]` `performance-collector.ts` dùng hằng số giả (`12 MB`, `24 MB`, `bootTimeMs: 150`) khi không đọc được CDP/Navigation Timing (`performance-collector.ts:90-91, 121-125`) — Đã sửa: trả về `-1` để kích hoạt nhánh `FAIL` (cùng nhóm với phát hiện số 2, 3, 17).
  - `[medium]` `[patch]` `performance.spec.ts:74` ghi đè `test-results/nfr-performance-metrics.json` và `.gitlab-ci.yml` ghi đè artifact giữa hai shard (`performance.spec.ts:74`, `.gitlab-ci.yml:147-166`) — Đã sửa: gộp mẫu qua `mergeAndWriteNfrMetrics` và tách file theo shard trong `.gitlab-ci.yml` (cùng nhóm với phát hiện số 4, 5, 18, 19).
  - `[false]` `[reject]` Đo thời gian khởi động và bộ nhớ qua Playwright E2E + Go backend test thay vì khởi chạy binary Wails native trên CI — Bác bỏ: kiến trúc kiểm thử của dự án (`epic-6-context.md`, `test-design-qa.md`, `.gitlab-ci.yml`) quy định chạy E2E & performance qua Playwright (`oven/bun:1`) và backend qua `go test ./...` (`golang:1.25`), không build binary GUI native trong stage `test`.
  - `[medium]` `[patch]` Chỉ kiểm tra ngưỡng NFR trong `performance.spec.ts` mà chưa assert trong hook `merged-fixtures.ts` (`merged-fixtures.ts:954`) — Đã sửa: bổ sung assert `bootPassed` và `ramPassed` trong `merged-fixtures.ts` (cùng nhóm với phát hiện số 3, 21, 22).
  - `[medium]` `[patch]` Xung đột đường dẫn artifact `nfr-performance-metrics.json` giữa `shard-1` và `shard-2` trong job `report` (`.gitlab-ci.yml`) — Đã sửa: lưu thêm bản sao theo từng shard trong `.gitlab-ci.yml` (cùng nhóm với phát hiện số 5, 19, 26).
  - `[medium]` `[patch]` `measureColdStart` dùng `Math.min(wallElapsedMs, navTimings.readyMs)` chọn giá trị nhỏ hơn giữa hai phép đo (`performance-collector.ts:988-1015`) — Đã sửa: đổi sang `Math.max(1, wallElapsedMs, normalizeIntegerMs(navTimings.loadEventMs))` (cùng nhóm với phát hiện số 1).
  - `[medium]` `[patch]` Giá trị mặc định luôn đạt chuẩn (`12 MB`, `150 ms`) khi phép đo thất bại (`performance-collector.ts`) — Đã sửa: trả về `-1` khi không đo được (cùng nhóm với phát hiện số 2, 3, 17, 25).
  - `[low]` `[patch]` Logic đánh giá ngưỡng NFR phía Go backend trong `TestApp_NFRStartupAndMemory` viết inline và chưa có unit test cho nhánh `WARN`/`FAIL` (`projects/app_test.go:277-310`) — Đã sửa: tách hàm `evaluateBackendNFRMetrics` và bổ sung `TestEvaluateBackendNFRMetrics` kiểm thử đầy đủ `PASS`, `WARN` và `FAIL`.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run lint && bun run type-check && bun run test` -- expected: exit 0, toàn bộ unit test (bao gồm `performanceMetrics.test.ts`) và kiểm tra kiểu/lint đều pass
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test:e2e && test -f test-results/nfr-performance-metrics.json && test -f test-results/nfr-performance-summary.md` -- expected: exit 0, toàn bộ E2E test (bao gồm `performance.spec.ts`) pass và cả 2 file artifact NFR tồn tại trong `projects/frontend/test-results/`
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test:e2e -- --shard=1/2 && test -f test-results/nfr-performance-metrics.json && bun run test:e2e -- --shard=2/2 && test -f test-results/nfr-performance-metrics.json` -- expected: exit 0, mỗi shard đều sinh ra file `test-results/nfr-performance-metrics.json` hợp lệ
- `cd projects && go vet ./... && go test -v ./... && test -f test-results/backend-nfr-metrics.json` -- expected: exit 0, tất cả Go backend tests (bao gồm `TestApp_NFRStartupAndMemory`) pass và sinh ra `projects/test-results/backend-nfr-metrics.json`

## Auto Run Result

- **Status:** `done`
- **Summary of implemented change:**
  - Xây dựng module tiện ích đánh giá NFR thuần TypeScript (`projects/frontend/src/utils/performanceMetrics.ts`) chuẩn hóa số nguyên bằng `Math.ceil` cho thời gian (ms) và bộ nhớ (bytes/MB), kiểm chứng ngân sách khởi động (`<= 2000 ms`) và bộ nhớ RAM (`<= 100 MB`, cảnh báo ở `80–100 MB`), từ chối mọi dữ liệu đo âm/`NaN`/rỗng, và xuất báo cáo Markdown chi tiết (`formatNfrMarkdownSummary`).
  - Xây dựng bộ thu thập chỉ số hiệu năng E2E (`projects/frontend/tests/support/performance-collector.ts`) sử dụng Navigation Timing API + thời gian sẵn sàng tương tác thực tế (`measureColdStart`) và Chrome DevTools Protocol `Performance.getMetrics` (`collectMemorySample`), tích hợp vào fixture dùng chung (`merged-fixtures.ts`) và bộ kiểm thử chuyên biệt (`projects/frontend/tests/e2e/performance.spec.ts`) để đo thời gian khởi động cùng mức tiêu thụ RAM qua các bước CRUD thư mục, tạo request, sửa URL + headers, xóa thư mục và xuất bản `nfr-performance-metrics.json` + `nfr-performance-summary.md` vào `projects/frontend/test-results/`.
  - Bổ sung kiểm thử hiệu năng tầng Go backend (`TestApp_NFRStartupAndMemory` và `TestEvaluateBackendNFRMetrics` trong `projects/app_test.go`) đo thời gian khởi tạo `NewApp()` + `app.startup(ctx)` + `app.GetCollectionTree()` (`<= 2000 ms`) và lấy mẫu bộ nhớ qua `runtime.ReadMemStats` (`<= 100 MB`), xuất bằng chứng ra `projects/test-results/backend-nfr-metrics.json`.
  - Cập nhật `.gitlab-ci.yml` với `artifacts: when: always` trên các job `test:backend`, `.frontend-e2e-template`, `burn-in:frontend`, và `report`, đồng thời lưu trữ các bản sao artifact theo từng shard (`shard-1`, `shard-2`) để tránh ghi đè và hiển thị báo cáo tổng hợp NFR trong bước `report`.
- **Files changed:**
  - `.gitlab-ci.yml` — Cấu hình `artifacts: when: always`, kiểm tra và lưu trữ các file báo cáo NFR riêng cho từng shard E2E và Go backend, đồng thời hiển thị tóm tắt NFR trong job `report`.
  - `_bmad-output/implementation-artifacts/spec-6-2-nfr-performance-benchmarking-evidence.md` — Đặc tả kỹ thuật, nhật ký phân loại review và kết quả thực thi tự động của Story 6.2.
  - `projects/app_test.go` — Bổ sung `evaluateBackendNFRMetrics`, `TestEvaluateBackendNFRMetrics`, và `TestApp_NFRStartupAndMemory` đo thời gian khởi động lạnh và bộ nhớ Go backend kèm ghi file `projects/test-results/backend-nfr-metrics.json`.
  - `projects/frontend/eslint.config.js` — Bổ sung `playwright-report/**` và `test-results/**` vào danh sách `ignores` để ESLint không quét các file báo cáo sinh tự động.
  - `projects/frontend/src/utils/performanceMetrics.ts` — Định nghĩa ngưỡng NFR, hàm chuẩn hóa số nguyên, hàm đánh giá `evaluateNfrMetrics` và hàm định dạng Markdown `formatNfrMarkdownSummary`.
  - `projects/frontend/src/utils/__tests__/performanceMetrics.test.ts` — Bộ 10 unit test kiểm chứng toàn bộ ma trận I/O, các trường hợp biên, cảnh báo baseline/peak RAM và định dạng bảng Markdown.
  - `projects/frontend/tests/support/performance-collector.ts` — Thu thập thời gian khởi động, lấy mẫu bộ nhớ CDP an toàn (`try/finally`), gộp mẫu `mergeAndWriteNfrMetrics` và xuất file vào `projects/frontend/test-results/`.
  - `projects/frontend/tests/support/merged-fixtures.ts` — Tích hợp thu thập và kiểm tra ngưỡng NFR tự động sau mỗi bài kiểm thử E2E trên mọi shard.
  - `projects/frontend/tests/e2e/performance.spec.ts` — Kiểm thử E2E đo thời gian khởi động lạnh (< 2.0s), lấy mẫu RAM qua chuỗi thao tác CRUD thư mục/request/URL/headers (< 100MB) và kiểm chứng gộp artifact trong `test-results/`.
- **Review findings breakdown:**
  - **Patched (31 findings grouped into 6 patches — high: 0, medium: 18, low: 13):**
    - Chuẩn hóa số nguyên bằng `Math.ceil` và kiểm tra nghiêm ngặt các giá trị âm/`NaN` trong `domContentLoadedMs`, `loadEventMs` và `samples` tại `performanceMetrics.ts`.
    - Cho phép ghi nhận đồng thời cảnh báo của cả `baselineRamBytes` và `peakRamBytes`, đồng thời tính trạng thái từng dòng `Baseline RAM` / `Peak Execution RAM` độc lập trong `formatNfrMarkdownSummary` và bổ sung đầy đủ unit test trong `performanceMetrics.test.ts`.
    - Sửa công thức `measureColdStart` dùng `Math.max(1, wallElapsedMs, loadEventMs)`, bọc `cdpSession.detach()` trong `finally`, bỏ các giá trị mặc định giả (`12 MB`, `150 ms`) để trả về `-1` khi lỗi đo, bổ sung `mergeAndWriteNfrMetrics` chống ghi đè mẫu, và thêm assert `bootPassed`/`ramPassed` trong `merged-fixtures.ts`.
    - Bổ sung thao tác chỉnh sửa tab `Headers` và kịch bản kiểm thử gộp mẫu trong `performance.spec.ts`.
    - Lưu bản sao artifact NFR theo từng shard (`shard-1`, `shard-2`) và kiểm tra sự tồn tại của file trong `.gitlab-ci.yml`.
    - Tách hàm `evaluateBackendNFRMetrics` có đủ `Warnings`/`Failures`, dùng `t.Setenv`, đảm bảo ghi file qua `defer`, và thêm `TestEvaluateBackendNFRMetrics` trong `projects/app_test.go`.
  - **Deferred (0):** Không có.
  - **Rejected (1 — false: 1):**
    - `[false]` Không khởi chạy binary Wails native trên CI: hệ thống kiểm thử trong CI chạy E2E qua Playwright (`oven/bun:1`) và backend qua `go test` (`golang:1.25`) theo đúng thiết kế kiến trúc của dự án.
- **Follow-up review recommendation:** `false` (patched counts by verdict: `high: 0`, `medium: 18`, `low: 13`; toàn bộ các bản vá đều đã được kiểm chứng trực tiếp bằng unit test, E2E test và Go test, không còn rủi ro nào chưa được xác minh).
- **Verification performed:**
  - `bun run lint` → Pass (0 errors).
  - `bun run type-check` → Pass (`vue-tsc --noEmit` exit 0).
  - `bun run test` → Pass (31 test files, 369 unit tests passed).
  - `bun run test:e2e` → Pass (15 E2E tests passed, `test-results/nfr-performance-metrics.json` & `test-results/nfr-performance-summary.md` generated).
  - `bun run test:e2e -- --shard=1/2 && bun run test:e2e -- --shard=2/2` → Pass (8 passed in shard 1/2, 7 passed in shard 2/2, both shards generated `test-results/nfr-performance-metrics.json`).
  - `go vet ./... && go test -v ./...` → Pass (all Go tests including `TestApp_NFRStartupAndMemory` and `TestEvaluateBackendNFRMetrics` passed, `projects/test-results/backend-nfr-metrics.json` generated).
- **Residual risks:** Không có.


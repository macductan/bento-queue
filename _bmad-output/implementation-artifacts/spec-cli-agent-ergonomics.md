---
title: 'Tối ưu hecto CLI cho AI Agent: JIT agent-guide (--section/--toc) & Nén/Che Secret Output (--compact/--redact/--max-body)'
type: 'feature'
created: '2026-11-18'
status: 'done'
route: 'dispatch'
baseline_commit: '7f0c14ecc988acf6527c79e0e6f9483df319a085'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `hecto agent-guide` in full `SKILL.md` (~21.6 KB / ~5.5k tokens); `hecto run --json` và `hecto flow run --json` xuất lặp trường (`request`/`resolved_request`, `response`, `console_logs`, `step_results`), full `body` và lộ secret ra `stdout`.

**Approach:** Nâng cấp binary `hecto`: thêm `--toc`/`--list` và `--section` cho `agent-guide` rút từ `skillMD`; thêm `--compact`, `--redact`, `--max-body <bytes>` cho `run` và `flow run` để nén, cắt `body` UTF-8 và che secret trên `stdout` (giữ nguyên đĩa); bỏ `RunOutput.Response` và cập nhật `SKILL.md`.

## Boundaries & Constraints

**Always:**
- `agent-guide` (`skill`) không cờ in full `SKILL.md`; `--toc` (`--list`) in mục lục gọn (số mục, tiêu đề, alias của `## N.`/`### N.M.`, hỗ trợ `--json`).
- `agent-guide --section <sel[,sel...]>` (lặp cờ/dấu phẩy, case-insensitive) rút từ `skillMD` theo số (`1`..`7`, `3.1`..`3.5`, `6.1`..`6.3`, `7.1`..`7.3`) hoặc alias (`rules`, `model`, `variables`, `auth`, `commands`, `matrix`, `collection`/`coll`, `env`/`environment`, `folder`/`dir`, `req`/`request`, `run`, `import`, `script`/`scripting`, `recipe`/`examples`, `flow`/`flows`, `mock`/`mocks`, `core`=`1,2,3`). Báo `VALIDATION` (exit `1`) nếu selector rỗng/lạ, positional thừa, hoặc dùng cả `--toc` và `--section`.
- Đăng ký `toc`, `list`, `compact`, `redact` vào `knownBooleanFlags`.
- `hecto run` & `hecto flow run` hỗ trợ `--compact`, `--redact`, `--max-body <bytes>` (`< 0` → `VALIDATION`):
  - `--redact`: Mask `"***REDACTED***"` chỉ trên `stdout` (sau `ApplyScriptUpdatesToDisk` và flow branch eval):
    1. Headers (`request.headers`, `resolved_request.headers`, `headers`, case-insensitive): `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-Api-Key`, `Api-Key`, `X-Auth-Token`, hoặc tên chứa `token|secret|password|apikey|api-key|api_key|jwt|credential|session`.
    2. Biến trong `env_updates` & `scoped_env_updates` (`collection`, `globalEnvs`, `folderGlobals`, `folderEnvs`) có key chứa `token|secret|password|passwd|pwd|apikey|api-key|api_key|auth|jwt|credential|private_key|cookie|session`.
    3. `scoped_auth_updates`: `bearer.token`, `basic.password`, `apiKey.value`.
  - `--max-body <bytes>`: Nếu `len(body) > max_body`, cắt tại ranh giới UTF-8 rune (≤ `max_body` bytes gốc), nối `"... [truncated, total <N> bytes]"`, đặt `body_truncated: true`.
  - `--compact`: Tự bật `--redact` và mặc định `max_body = 500` (trừ khi truyền `--max-body`):
    - `run`: Bỏ `request`, `resolved_request`, `headers`, `console_logs`, `scoped_auth_updates`; giữ `status_code`, `status_text`, `time_ms`, `size_bytes`, `body`, `body_truncated` (`omitempty`), `script_tests`, `script_logs`, `env_updates`, `scoped_env_updates`, `script_error`, `network_error`.
    - `flow run`: Bỏ `step_results` top-level; trong `node_results[].step_results[]`, rút gọn `run_output` chuẩn compact — step `passed` ẩn `body` (trừ khi `--max-body > 0`), step `failed` giữ `body` cắt theo `max_body` kèm `failure_category`, `failure_reason`, `script_error`, `network_error`.
- Bỏ `RunOutput.Response` trùng lặp.

**Never:**
- Không tạo cheat-sheet tĩnh tách rời `SKILL.md`.
- Không redact trước khi ghi đĩa hoặc chạy script/branch flow.
- Không đổi schema/hành vi mặc định của `run --json`/`flow run --json` khi không dùng cờ mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| `agent-guide` & `--toc` | Không cờ; `--toc`/`--list` | Full `SKILL.md`; hoặc mục lục + alias | Positional thừa / xung đột cờ → `VALIDATION` |
| `agent-guide --section` | `flow`, `3.4,6`, `core`, lặp cờ | Trích đúng heading, không trùng | Selector rỗng/lạ → `VALIDATION` |
| `run --redact`/`--max-body` | Secret header/biến/auth; body UTF-8 lớn | Mask `***REDACTED***`, cắt rune + `body_truncated`; đĩa giữ thật | `--max-body -1` → `VALIDATION` |
| `run --compact` | `hecto run ... --compact` | Chỉ trường compact, tự redact & cắt 500B | Lỗi giữ `network_error`/`script_error` & exit `1` |
| `flow run --compact` | Flow có step `passed` & `failed` | Bỏ `step_results` ngoài; `passed` ẩn `body`, `failed` giữ; redact | Non-JSON `failed` exit `1`; `--json` exit `0` |

</frozen-after-approval>

## Code Map

- `projects/cmd/hecto/main.go` (L37, L106–109, L186–198, L314–379, L2092–2173, L2990–3065) -- `agentGuideBanner`, `agent-guide`/`skill`, `knownBooleanFlags`, `printMainUsage`, `emitResult`, `handleRun`, `handleFlow`.
- `projects/cmd/hecto/SKILL.md` (L1–397) -- `//go:embed SKILL.md`; Mục 1, 3.5, 4, 6.1, 6.3.
- `projects/engine/headless.go` (L122–140, L1039–1050, L1114–1131) -- `RunOutput`.
- `projects/engine/flow.go` (L21–54) -- `FlowStepRunOutput`, `FlowRunOutput`.
- `projects/cmd/hecto/main_test.go`, `projects/engine/headless_test.go`, `projects/engine/flow_test.go` -- Tests.

## Tasks & Acceptance

**Execution:**
- [x] `projects/engine/headless.go` -- Xóa `RunOutput.Response`, thêm `BodyTruncated bool` (`json:"body_truncated,omitempty"`) -- Dọn trường lặp.
- [x] `projects/cmd/hecto/main.go` -- Thêm `--toc`/`--list`/`--section` cho `agent-guide`, cập nhật `knownBooleanFlags`/`printMainUsage`, thêm `--compact`/`--redact`/`--max-body` cho `run` & `flow run` (giữ exit `1` non-JSON khi flow `failed`) -- Nén output & che secret.
- [x] `projects/cmd/hecto/SKILL.md` -- Cập nhật cờ mới -- Đồng bộ `agent-guide`.
- [x] `projects/cmd/hecto/main_test.go` -- Test I/O Matrix -- Chống hồi quy.

**Acceptance Criteria:**
- Given `hecto agent-guide --section flow --json` hoặc `--toc`, when chạy, then xuất đúng mục từ `skillMD` (< 25% full guide).
- Given request có Bearer/Cookie/API-Key và post-script lưu `token`, when chạy `hecto run ... --compact --json`, then `stdout` mask `***REDACTED***` và bỏ trường lặp nhưng `_folder.json` trên đĩa vẫn lưu token thật.

## Implementation Notes

- Các file đã sửa: [headless.go](../../projects/engine/headless.go), [main.go](../../projects/cmd/hecto/main.go), [SKILL.md](../../projects/cmd/hecto/SKILL.md), [main_test.go](../../projects/cmd/hecto/main_test.go).
- `parseSkillSections` phân tích trực tiếp `skillMD` theo trạng thái code fence (` ``` `), nhận diện `## N.` và `### N.M.`, cắt bỏ đường kẻ `---` cuối mục; `resolveSkillSectionSelectors` tách theo dấu phẩy/lặp cờ và loại trừ tiểu mục con `N.M` nếu mục cha `N` đã được chọn (tránh lặp nội dung bất kể thứ tự truyền).
- `redactRunOutput` và `truncateRunOutputBody` chỉ chạy sau khi `ExecuteRequestFlow` / `ExecuteFlow` đã ghi đĩa và đánh giá nhánh rẽ xong; trên `FlowRunOutput`, dùng `walkUniqueFlowRunOutputs` theo con trỏ `*engine.RunOutput` để tránh mutate trùng giữa `NodeResults` và `StepResults`.
- Trong `emitResult`, chế độ non-JSON kiểm tra cả `*compactFlowRunOutput` / `compactFlowRunOutput` để bảo toàn exit code `1` khi `flow run --compact` thất bại.
- Đã kiểm tra `gofmt -w`, `cd projects && go vet ./...`, và `cd projects && go test -race -count=1 ./cmd/hecto/... ./engine/...` đều pass 100%.
- Sau Step 4 review triage: đã áp dụng đầy đủ các bản vá (bọc `--toc --json` kèm `composite_aliases.core`, bổ sung aliases mục `3.5`/`4`/`6.1`/`6.3`/`7.1`–`7.3`, nhận diện `# ` level-1 trong `parseSkillSections`, truyền `resp.Truncated` vào `RunOutput.BodyTruncated` và giữ `BodyTruncated` sau `truncateRunOutputBody`/`toCompactStepRunOutput`, mở rộng `--redact` cho `"auth"`/`private-key`/`access-key` header + tên `apiKey` cấu hình + URL query/userinfo + `FormData`/`application/x-www-form-urlencoded` + URL trong lỗi mạng/flow, cập nhật `printMainUsage` & [SKILL.md](../../projects/cmd/hecto/SKILL.md), bổ sung full tests ở [headless_test.go](../../projects/engine/headless_test.go) & [main_test.go](../../projects/cmd/hecto/main_test.go)) và xác minh `gofmt`, `go vet ./...`, `go test -race -count=1 ./cmd/hecto/... ./engine/...`, cùng `go test -count=1 ./...` pass 100%.

## Spec Change Log

## Review Triage Log

| ID | Layer | Finding | Verdict | Evidence / Routing |
|---|---|---|---|---|
| BH-01 | blind-hunter | Thiếu `composite_aliases.core` trong `hecto agent-guide --toc --json` | `low` | Xác nhận ở `main.go` (`handleAgentGuide`): chế độ text có `core -> 1, 2, 3` nhưng JSON chỉ trả mảng -> `patch` (bọc `{"sections": ..., "composite_aliases": {"core": ["1","2","3"]}}`). |
| BH-02 | blind-hunter | Thiếu alias cho tiểu mục `6.1`, `6.3`, `7.1`–`7.3` và từ khóa mới ở `3.5`, `4` | `low` | Bổ sung alias không xung đột vào `sectionAliasesByID` (`agent-guide`/`guide`/`skill`, `runoutput`/`compact`/`redact`, `flow-commands`/`flow-output`/`mock-*`) -> `patch`. |
| BH-03 | blind-hunter | Che secret chưa phủ URL query/userinfo, `FormData`/`urlencoded` và chuỗi lỗi | `medium` | Xác nhận ở `redactRunOutput`, `handleRun`, `handleFlow`: lộ `?api_key=`, `FormData`, `urlencoded` và URL lỗi `net/http` -> `patch` (`redactSensitiveURL`, `isURLEncodedRequest`, `redactSensitiveErrorText`). |
| BH-04 | blind-hunter | `isSensitiveHeaderKey` thiếu `"auth"`, `"private-key"`, `"access-key"` và tên header `apiKey` tùy biến | `low` | Xác nhận `X-Custom-Auth` và `APIKey.Key` tùy biến không khớp danh sách cũ -> `patch` (bổ sung chuỗi con & `collectRunAPIKeyNames`/`collectFlowAPIKeyNames`). |
| BH-05 | blind-hunter | Mất `is_binary`, `timestamp` và tín hiệu `resp.Truncated` (10 MB) khi xóa `RunOutput.Response` | `medium` | Phần `resp.Truncated` là lỗi hồi quy thật -> `patch` (`BodyTruncated: resp.Truncated`). Phần `is_binary`/`timestamp` không có trong spec/caller nào nên `false` (giữ đúng schema spec). |
| BH-06 | blind-hunter | `compactRunOutput.NetworkError` không chạm tới ở `hecto run` | `false` | Spec quy định rõ schema compact `run` giữ `network_error` (`omitempty`) và `handleRun` trả exit `1` qua `resultFromError(err)` khi lỗi kết nối. |
| BH-07 | blind-hunter | `compactStepRunOutput.Body` dùng `omitempty` khác `compactRunOutput.Body` & hành vi `--max-body 0` | `false` | Khớp đúng thiết kế đã chốt trong `<frozen-after-approval>` (step `passed` ẩn `body` trừ `--max-body > 0`; `step.Status` phân biệt `passed`/`failed`; `--max-body 0` cắt tiền tố 0B + hậu tố tổng bytes). |
| BH-08 | blind-hunter | `SKILL.md` và `printMainUsage` thiếu schema `--toc --json`/`--section --json`, field rỗng bỏ qua & `--list`/`--json` | `low` | Xác nhận ở `SKILL.md` và `main.go` (`printMainUsage`) -> `patch` cập nhật tài liệu đầy đủ. |
| BH-09 | blind-hunter | `parseSkillSections` không dừng ở `# ` level-1 và đòi hỏi dấu chấm sau `N.M` | `low` | Bổ sung nhận diện `# ` level-1 vào `allHeadings` (`SKILL.md` nhúng luôn dùng `## N.` và `### N.M.`) -> `patch`. |
| BH-10 | blind-hunter | Thiếu test cho non-compact flow flags, auth variants, `--toc --json` schema, bước song song/skipped/missing | `medium` | Xác nhận thiếu các nhánh test này ở `main_test.go` -> `patch` bổ sung đầy đủ vào `main_test.go`. |
| ECH-01 | edge-case-hunter | `hecto run --redact` làm lộ `apiKey` `addTo: "query"` / query & userinfo URL trong `Request.URL`/`ResolvedRequest.URL` | `medium` | Xác nhận cùng nguyên nhân gốc với BH-03 tại `headless-engine.js:750-757` & `main.go` -> `patch` (`redactSensitiveURL`). |
| ECH-02 | edge-case-hunter | `FormData` hoặc `urlencoded` chứa mật khẩu/secret bị lộ khi `--redact` | `medium` | Xác nhận cùng nguyên nhân gốc với BH-03 (và phát hiện `headless-engine.js` chỉ đặt header `Content-Type` cho `urlencoded`) -> `patch` (`isURLEncodedRequest` + `redactVarKVPairs`). |
| ECH-03 | edge-case-hunter | `flow run` gặp lỗi kết nối làm lộ URL chứa secret query/userinfo trong `network_error`/`failure_reason`/`halted_error` | `medium` | Xác nhận cùng nguyên nhân gốc với BH-03 -> `patch` (`redactSensitiveErrorText`). |
| ECH-04 | edge-case-hunter | Xóa `RunOutput.Response` làm mất `resp.Truncated` (10 MB cap) và `truncateRunOutputBody` ghi đè `BodyTruncated` | `medium` | Xác nhận tại `headless.go:1120` & `main.go` (`ro.BodyTruncated = didTruncate`) -> `patch` (`BodyTruncated: resp.Truncated` & `ro.BodyTruncated || didTruncate`). |
| VG-01 | verification-gap | Chưa test `flow run --max-body` & `--redact` non-compact và khử trùng lặp con trỏ `walkUniqueFlowRunOutputs` | `medium` | Pre-verified: toàn bộ test `flow run` trước đó đều truyền `--compact` -> `patch` bổ sung test non-compact `--redact` & `--max-body`. |
| VG-02 | verification-gap | Chưa test `hecto flow run --compact --max-body 0` | `medium` | Pre-verified: nhánh `showPassedBody := visited["max-body"] && maxBody > 0` chưa được kiểm chứng với `0` -> `patch` bổ sung test. |
| VG-03 | verification-gap | Chưa test từ chối positional argument thừa trên `hecto run` & `hecto flow run` | `medium` | Pre-verified: `rejectUnexpectedPositionals(pos, 1)` chưa có negative test -> `patch` bổ sung test. |
| VG-04 | verification-gap | Chưa test `knownBooleanFlags` cho `"list"` và `"redact"` đứng ngay trước `--json` | `medium` | Pre-verified: `--list` luôn đứng cuối còn `--redact` đứng trước `<id|path>` -> `patch` bổ sung test đặt ngay trước `--json`. |
| VG-05 | verification-gap | Chưa test redaction cho `GlobalEnvs`, `FolderEnvs`, `CollectionGlobal`, `CollectionEnvs`, `FolderEnvs` auth, `Basic.Password`, `APIKey.Value` | `medium` | Pre-verified: script test cũ mới phủ `EnvUpdates`, `Collection`, `FolderGlobals`, `Bearer` -> `patch` mở rộng script & kiểm chứng lưu đĩa. |
| VG-OTHER-01 | verification-gap | `apiKey` `addTo: "query"` lộ secret trong `Request.URL`/`ResolvedRequest.URL` | `medium` | Xác nhận cùng nguyên nhân gốc với BH-03 & ECH-01 -> `patch`. |

## Verification

**Commands:**
- `cd projects && go vet ./...` -- expected: exit code 0
- `cd projects && go test -race ./cmd/hecto/... ./engine/...` -- expected: pass 100%

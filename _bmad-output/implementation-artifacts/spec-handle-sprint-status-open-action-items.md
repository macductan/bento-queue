---
title: 'Handle Open Action Items from Sprint Status'
type: 'chore'
created: '2026-10-09'
status: 'done'
baseline_commit: '0463a56ae82597a9f3da062addbd07892ec96f9b'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Hiện tại có 5 action items đang ở trạng thái `open` trong `sprint-status.yaml` từ các lần retrospective trước chưa được xử lý.
**Approach:** Bổ sung test case cho `IndexRebuild`, cập nhật tài liệu `AGENTS.md` về quy ước commit và checklist UI, đưa task theo dõi tiến độ import vào `deferred-work.md`, và chạy review (triage log, đồng bộ status) cho các story 2.5, 2.7, 2.8.

## Boundaries & Constraints

**Always:** Bám sát yêu cầu của từng action item, không sửa đổi logic cốt lõi ngoài việc bổ sung test.
**Never:** Không thay đổi kiến trúc hiện tại của `IndexRebuild` hoặc thêm tính năng mới không có trong action items.

</frozen-after-approval>

## Code Map

- `projects/storage/filesystem_test.go` -- Nơi chứa các test cho `IndexRebuild` để bổ sung case corrupted JSON và unreadable file.
- `AGENTS.md` -- Tài liệu quy ước dự án cần được cập nhật (commit subject, review gate, checklist smoke UI).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Nơi cập nhật trạng thái các action items thành done.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- Nơi ghi nhận task thêm progress bar cho import.
- `_bmad-output/implementation-artifacts/spec-2-5-delete-request-delete-folder.md` -- Cần review, ghi triage log và cập nhật status.
- `_bmad-output/implementation-artifacts/spec-2-7-context-menu-unsaved-changes-detection.md` -- Cần review, ghi triage log và cập nhật status.
- `_bmad-output/implementation-artifacts/spec-2-8-epic-2-deferred-work-cleanup.md` -- Cần review, ghi triage log và cập nhật status.

## Tasks & Acceptance

**Execution:**
- [x] `projects/storage/filesystem_test.go` -- Thêm test case cho `IndexRebuild` xử lý lỗi corrupted JSON và file không đọc được.
- [x] `AGENTS.md` -- Thống nhất câu chữ review gate; điền mục "Running and verifying" với `wails dev -tags webkit2_41`, phiên bản Go 1.25.0, và thêm checklist smoke UI cho Epic 2.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- Thêm một mục về việc cân nhắc progress bar cho chức năng import trong tương lai.
- [x] Các spec 2.5, 2.7, 2.8 -- Tiến hành review code liên quan, ghi Review Triage Log vào cuối mỗi file spec, và đổi status của spec thành `done`.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Đổi status của 4 action item sang `done` và 1 action item (epic-2-retro-item-10) sang `skipped`.

**Acceptance Criteria:**
- Given file bị lỗi JSON hoặc permission, when gọi `IndexRebuild`, then hàm không bị crash mà chỉ bỏ qua file lỗi hoặc báo lỗi tuỳ thiết kế.
- Given `AGENTS.md`, when kiểm tra phần Git rules và Running and verifying, then thấy hướng dẫn wails dev mới cùng UI checklist.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| ID | Finding | Verdict | Route | Evidence |
|----|---------|---------|-------|----------|
| F1 | `AGENTS.md` thiếu sửa đổi về câu chữ review gate | medium | patch (fixed) | Đã cập nhật lại câu chữ cho rõ ràng về fallback nếu thiếu subagent. |
| F2 | `spec-2-5` bị thiếu Review Triage Log | low | patch (fixed) | Đã bổ sung thêm section log. |
| F3 | Lỗi khoảng trắng thừa/thiếu trước ## Design Notes trong 2-7, 2-8 | low | patch (fixed) | Đã sửa lại khoảng trắng. |
| F4 | Test `IndexRebuild` trên Windows tạo file unreadable sẽ bị fail do chmod 0000 | medium | patch (fixed) | Đã thêm điều kiện `runtime.GOOS != "windows"` để bỏ qua file đó trên Windows. |
| F5 | Test thiếu phần kiểm tra sự tồn tại của file lỗi corrupted JSON | medium | patch (fixed) | Đã sửa điều kiện `len(fs.index) == 5` để đảm bảo file lỗi bị bỏ qua (không lọt vào index). |
| F6 | `deferred-work.md` thừa field `status: open` so với chuẩn | low | patch (fixed) | Đã xóa dòng `status: open`. |
| F7 | Sinh thừa file `combined-templates.md` và `temp-context.md` không có trong spec | medium | patch (fixed) | Đã xoá các file sinh thừa này. |
| F8 | Task trong spec không khớp với thực tế do cập nhật item 10 thành skipped | low | patch (fixed) | Đã sửa task trong spec để thể hiện đúng việc đánh dấu skipped cho item 10 (theo yêu cầu user). |

## Verification

**Commands:**
- `cd projects && go test ./storage/...` -- expected: pass tất cả các test bao gồm cả case corrupted/unreadable file.

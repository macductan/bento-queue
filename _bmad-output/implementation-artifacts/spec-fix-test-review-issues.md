---
title: 'Fix Test Review Issues (Hard waits & Multi-concern)'
type: 'refactor'
created: '2026-10-09'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Theo báo cáo Test Review, test suite hiện tại có 2 vấn đề lớn cần khắc phục: `executor_test.go` sử dụng hard waits (`time.Sleep`) gây flaky test, và `collection-tree.spec.ts` gộp quá nhiều concern vào một test case duy nhất khiến việc xác định nguyên nhân lỗi khó khăn.

**Approach:** 
1. Trong `projects/service/executor_test.go`, thay thế các đoạn `time.Sleep` dùng để đồng bộ hóa (như ở dòng 128, 155, 380) bằng channel (`<-chan`) hoặc WaitGroup để chờ goroutine hoàn thành một cách deterministic.
2. Trong `projects/frontend/tests/e2e/collection-tree.spec.ts`, cấu trúc lại file bằng cách sử dụng `test.describe('Collection tree operations', () => { ... })` và tách các hành vi (create, rename, modify, duplicate, delete) thành các test case (`test(...)`) riêng biệt, sử dụng `beforeEach` hoặc các helper setup để cô lập state giữa các test case, nhằm giảm side effects theo đúng khuyến nghị của Test Review.

</frozen-after-approval>

## Implementation Notes

- Fixed `executor_test.go` by replacing `time.Sleep` with deterministic channel synchronization. Then refined by adding `sync.Once` for safe channel close and `select` with timeout for safe receives.
- Separated `collection-tree.spec.ts` into individual tests. Added `createTestRequest` and `deleteTestRequest` helpers to isolate test state and prevent resource leaks. Tested unsaved changes duplication behavior explicitly.

## Review Triage Log

- `page` parameter typed as `any`: **medium** - fixed by importing and using `Page` from `@playwright/test`.
- Unsaved changes prompt test coverage removed: **medium** - fixed by adding a new explicit test case for duplicating an unsaved request.
- Resource leaks with test requests: **medium** - fixed by adding `deleteTestRequest` and running it at the end of each test.
- `close(started)` in HTTP handler could panic on retries: **high** - fixed by wrapping the close in a `sync.Once`.
- Unprotected channel read `<-started` could deadlock: **high** - fixed by wrapping in a `select` with `time.After`.

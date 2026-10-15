---
title: 'Request Execution History and Collection Changelog'
slug: '2-request-execution-history-and-collection-changelog'
created: '2026-10-15T00:24:00+07:00'
status: 'done'
completedAt: '2026-10-15T00:34:00+07:00'
input_documents:
  - '_bmad-output/specs/spec-scripting-history-mock/SPEC.md'
  - '_bmad-output/specs/spec-scripting-history-mock/scripting-history-mock-architecture.md'
  - '_bmad-output/specs/spec-scripting-history-mock/stories.yaml'
---

# Tech-Spec: Request Execution History and Collection Changelog

**Created:** 2026-10-15T00:24:00+07:00  
**Story ID:** `2`

## Overview

### Problem Statement

Users need an offline-first audit trail per collection to:
1. Review past API calls (Request Execution History — Mục 12) with status code, duration, size, request headers/body, and response headers/body, and restore any historical call back into the active Request Editor & Response Panel.
2. Track structural/data mutations in the collection (Changelog — Mục 5) whenever requests, folders, environments, or collection variables are created, updated, renamed, duplicated, or deleted.

### Solution

1. **Go Backend (`projects/service/history.go`, `projects/app.go`):**
   - Implement `HistoryService` storing up to 100 entries in `<collRoot>/.history/executions.json` (`[]model.ExecutionHistoryEntry`, newest first) and up to 200 entries in `<collRoot>/.history/changelog.json` (`[]model.ChangelogEntry`, newest first).
   - Expose Wails bindings in `projects/app.go`: `ListExecutionHistory()`, `RecordExecutionHistory(entry)`, `ClearExecutionHistory()`, `ListChangelog()`, `ClearChangelog()`.
   - Automatically record changelog entries on collection/folder/request/environment mutations in `projects/app.go`, and record execution history entries in `responseStore.send()` and via `RecordExecutionHistory`.
2. **Frontend Store & UI (`historyStore.ts`, `HistoryModal.vue`, `AppHeader.vue`, `App.vue`):**
   - Add `historyStore.ts` to load/record/clear execution history and changelog, and restore a historical execution into `requestStore` and `responseStore`.
   - Create `HistoryModal.vue` with two tabs (`data-test="history-tab-executions"`, `data-test="history-tab-changelog"`), search/filter, detail preview, `data-test="restore-execution-btn"`, `data-test="clear-executions-btn"`, and `data-test="clear-changelog-btn"`.
   - Add header button `data-test="open-history-modal-btn"` in `AppHeader.vue` and mount `<HistoryModal />` in `App.vue`.

## Acceptance Criteria

- [x] AC1: `HistoryService` persists `executions.json` (max 100) and `changelog.json` (max 200) in `<collRoot>/.history/` using atomic writes.
- [x] AC2: `App` records execution history and changelog entries on request/folder/environment/collection mutations.
- [x] AC3: `HistoryModal.vue` displays Execution History and Changelog tabs, allows filtering, clearing, and restoring any execution back into the active editor.
- [x] AC4: All Go and frontend tests pass (`go test ./...`, `bun run type-check`, `bun run test`).

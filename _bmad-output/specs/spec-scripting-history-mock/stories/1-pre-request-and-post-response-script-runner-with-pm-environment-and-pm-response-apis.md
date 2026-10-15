---
title: 'Pre-request and Post-response Script Runner with pm.environment and pm.response APIs'
slug: '1-pre-request-and-post-response-script-runner-with-pm-environment-and-pm-response-apis'
created: '2026-10-15T00:15:00+07:00'
status: 'done'
completedAt: '2026-10-15T00:23:00+07:00'
input_documents:
  - '_bmad-output/specs/spec-scripting-history-mock/SPEC.md'
  - '_bmad-output/specs/spec-scripting-history-mock/scripting-history-mock-architecture.md'
  - '_bmad-output/specs/spec-scripting-history-mock/stories.yaml'
---

# Tech-Spec: Pre-request and Post-response Script Runner with pm.environment and pm.response APIs

**Created:** 2026-10-15T00:15:00+07:00  
**Story ID:** `1`

## Overview

### Problem Statement

Users need to run custom JavaScript logic before sending an HTTP request (e.g., computing dynamic timestamps/signatures or setting variables) and after receiving a response (e.g., extracting an access token from JSON response via `pm.response.json()` and saving it to the environment via `pm.environment.set(k, v)`).

### Solution

1. **Go Models & Wails Models (`projects/model/types.go`, `projects/frontend/wailsjs/go/models.ts`):**
   - Add `Scripts` struct (`PreRequest string`, `PostResponse string`) and `Scripts *Scripts` (`json:"scripts,omitempty"`) on `model.Request`.
2. **Script Runner Engine (`projects/frontend/src/utils/scriptRunner.ts`):**
   - Implement `executeScript(code, context)` providing `pm.environment.get(k)`, `pm.environment.set(k, v)`, `pm.variables.get(k)`, `pm.variables.set(k, v)`, and (for post-response) `pm.response.json()`, `pm.response.text()`, `pm.response.code`, `pm.response.status`, `pm.response.headers`, `pm.response.responseTime`, plus `console.log`/`warn`/`error` capture.
3. **Store & UI Integration (`responseStore.ts`, `environmentStore.ts`, `RequestTabs.vue`, `ScriptEditor.vue`, `RequestEditor.vue`):**
   - Execute `pre_request` before `buildExecuteRequest` in `responseStore.send()`, applying variable updates immediately and persisting them to the active environment (or collection variables if no active environment).
   - Execute `post_response` after receiving a successful response in `responseStore.send()`, persisting any `pm.environment.set(k, v)` updates.
   - Add `Scripts` tab to `RequestTabs.vue` (`uiStore.activeRequestTab` extended with `'scripts'`) and create `ScriptEditor.vue` with `data-test="pre-request-script-input"`, `data-test="post-response-script-input"`, snippet buttons, and `data-test="script-execution-output"`.

## Acceptance Criteria

- [x] AC1: `model.Request` supports `scripts.pre_request` and `scripts.post_response` persisted on disk.
- [x] AC2: `executeScript` supports `pm.environment.get(k)`, `pm.environment.set(k, v)`, `pm.response.json()`, `pm.response.text()`, `pm.response.code`, and captures `console` logs and runtime errors cleanly.
- [x] AC3: `responseStore.send()` executes `pre_request` before building the request and `post_response` after receiving the response, persisting environment variable updates.
- [x] AC4: `ScriptEditor.vue` renders in the `Scripts` tab of `RequestEditor.vue` with `data-test="pre-request-script-input"`, `data-test="post-response-script-input"`, and `data-test="script-execution-output"`.
- [x] AC5: All Go and frontend tests pass (`go test ./...`, `bun run type-check`, `bun run test`).

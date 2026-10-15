---
title: 'Smart JSON Editor with Syntax Highlighting, Prettify Button and Syntax Error Reporting'
slug: '1-smart-json-editor-with-syntax-highlighting-prettify-button-and-syntax-error-reporting'
created: '2026-10-14T23:30:00+07:00'
status: 'done'
completedAt: '2026-10-14T23:35:00+07:00'
input_documents:
  - '_bmad-output/specs/spec-smart-editor-and-payloads/SPEC.md'
  - '_bmad-output/specs/spec-smart-editor-and-payloads/smart-editor-and-payloads-architecture.md'
  - '_bmad-output/specs/spec-smart-editor-and-payloads/stories.yaml'
---

# Tech-Spec: Smart JSON Editor with Syntax Highlighting, Prettify Button and Syntax Error Reporting

**Created:** 2026-10-14T23:30:00+07:00  
**Story ID:** `1`

## Overview

### Problem Statement

When editing a JSON request body in `BodyEditor.vue`, users currently see plain text (with `{{variable}}` tokens) without JSON syntax coloring, have no one-click way to format/prettify minified JSON, and receive no syntax validation feedback when a trailing comma or unclosed brace makes their JSON invalid.

### Solution

1. **JSON Utilities (`projects/frontend/src/utils/jsonEditor.ts`):**
   - `validateJsonWithPlaceholders(content: string)`: Validates JSON while allowing `{{variable}}` placeholders inside strings or as bare value tokens. Returns `{ valid: boolean; error?: string; line?: number; column?: number }`.
   - `prettifyJsonWithPlaceholders(content: string)`: Formats JSON with 2-space indentation while preserving `{{variable}}` placeholders intact.
   - `tokenizeJsonTextSegment(text: string)`: Splits plain text segments into JSON syntax tokens (`json-key`, `json-string`, `json-number`, `json-boolean`, `json-null`, `json-punctuation`, `plain`) so `VariableHighlighter.vue` can render colored JSON tokens alongside `{{variable}}` spans.
2. **Syntax Highlighting in `VariableHighlighter.vue`:**
   - Add optional prop `syntax?: 'plain' | 'json' | 'xml'` (default `'plain'`).
   - When `syntax === 'json'`, render `seg.type === 'text'` using `tokenizeJsonTextSegment(seg.value)` with distinct syntax classes (`data-json-token="key"`, `"string"`, `"number"`, `"boolean"`, `"null"`).
3. **JSON Toolbar & Error Banner in `BodyEditor.vue`:**
   - When `bodyType === 'json'`, render a compact toolbar above the editor with:
     - Status badge (`Hợp lệ` / `Lỗi cú pháp JSON`)
     - **Format JSON** button (`data-test="prettify-json-btn"`) that formats `bodyContent` and records an undo snapshot (`recordInputSnapshot`).
   - When `jsonValidation.valid === false`, display `data-test="json-error-banner"` with the line/column and error details.

## Acceptance Criteria

- [x] AC1: `validateJsonWithPlaceholders` and `prettifyJsonWithPlaceholders` handle standard JSON and JSON containing `{{variable}}` placeholders accurately, reporting line/column on syntax errors.
- [x] AC2: `VariableHighlighter.vue` highlights JSON keys, strings, numbers, booleans, and null when `syntax="json"` while preserving `{{variable}}` token highlighting.
- [x] AC3: `BodyEditor.vue` provides a working `data-test="prettify-json-btn"` button and displays `data-test="json-error-banner"` when JSON syntax is invalid.
- [x] AC4: All unit and component tests pass (`bun run type-check`, `bun run test`).

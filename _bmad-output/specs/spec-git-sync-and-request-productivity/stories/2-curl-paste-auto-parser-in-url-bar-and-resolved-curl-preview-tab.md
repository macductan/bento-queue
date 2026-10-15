---
title: 'cURL Paste Auto-Parser in URL Bar and Resolved cURL Preview Tab'
slug: '2-curl-paste-auto-parser-in-url-bar-and-resolved-curl-preview-tab'
created: '2026-10-14T23:10:30+07:00'
status: 'done'
completedAt: '2026-10-14T23:17:00+07:00'
input_documents:
  - '_bmad-output/specs/spec-git-sync-and-request-productivity/SPEC.md'
  - '_bmad-output/specs/spec-git-sync-and-request-productivity/git-sync-and-request-productivity-architecture.md'
  - '_bmad-output/specs/spec-git-sync-and-request-productivity/stories.yaml'
---

# Tech-Spec: cURL Paste Auto-Parser in URL Bar and Resolved cURL Preview Tab

**Created:** 2026-10-14T23:10:30+07:00  
**Story ID:** `2`

## Overview

### Problem Statement

1. **CAP-2 (Mục 35 — cURL Paste Auto-Parser in URL Bar):** Users frequently copy `curl` commands from browser DevTools, Swagger/OpenAPI docs, or documentation sites and paste them directly into the URL Bar (`#url-input`). Currently, pasting a `curl` command inserts the raw `curl -X POST ...` text into `req.url`, causing an invalid URL error instead of populating the request's Method, URL, Query Params, Headers, Auth, and Body.
2. **CAP-3 (Mục 33 — Resolved cURL Preview Tab):** While users can click the `cURL` button in `UrlBar.vue` to copy a generated `curl` command, there is no dedicated `cURL` tab on `RequestTabs.vue` to inspect the full multiline `curl` command with all 4-tier environment variables (`Request Folder > Parent Folder > Environment > Collection`), inherited headers, and effective Auth resolved before sending or sharing.

### Solution

1. **cURL Parser (`projects/frontend/src/utils/curl.ts`):**
   - Implement `isCurlCommand(text: string): boolean` that checks if trimmed input starts with `curl ` or `curl\t` or `curl\\\n`.
   - Implement `parseCurlCommand(text: string): ParsedCurlResult` using a POSIX shell tokenizer that strips multiline line-continuations (`\\\r?\n`), parses single quotes `'...'` (including `'\''`), double quotes `"..."` (with `\"`, `\\`, `\$`), ANSI-C `$'...'` quotes, and unquoted tokens.
   - Support flags:
     - `-X` / `--request <METHOD>` (or `--request=<METHOD>`)
     - `-H` / `--header <Key: Value>` (multiple headers supported)
     - `-d` / `--data` / `--data-raw` / `--data-binary` / `--data-ascii` / `--data-urlencode` (multiple `-d` flags joined with `&`)
     - `-u` / `--user <user:pass>` (mapped to `auth: { type: 'basic', basic: { username, password } }`)
     - `--url <URL>` and positional URL token
     - `-G` / `--get` (forces `GET` if no explicit `-X` is provided)
     - Ignore boolean flags (`-i`, `-s`, `-S`, `-v`, `-k`, `--insecure`, `-L`, `--location`, `--compressed`) and skip value-taking non-request flags (`-o`, `--output`, `-A`, `--user-agent` — Note: `-A`/`--user-agent` can either be added as `User-Agent` header or handled cleanly!).
   - Auto-infer `POST` when body data is provided without `-X` and without `-G`/`--get`.
   - Auto-detect JSON body (`body.type = 'json'` when valid JSON object/array or `Content-Type` contains `application/json`, else `'text'`).
   - Extract query parameters from the URL into `params: KVPair[]` while preserving the full URL (so `useUrlParamsSync` stays in sync).
   - Also recognize `Authorization: Bearer <token>` header if no `-u` flag was given (optional or keep in headers; keeping `Authorization` in headers and `-u` in `auth.basic` is standard, or both).

2. **URL Bar Paste Handler (`projects/frontend/src/components/UrlBar.vue`):**
   - Listen to `@paste="onUrlPaste"` on `#url-input`.
   - If `clipboardData.getData('text/plain')` (or fallback) satisfies `isCurlCommand(pastedText)`:
     - Call `e.preventDefault()`.
     - Parse via `parseCurlCommand(pastedText)`.
     - Update `req.value.method`, `req.value.url`, `req.value.params`, `req.value.headers`, `req.value.body`, and `req.value.auth` (when `-u` is present).
     - Show toast `'Đã phân tích lệnh cURL'`.

3. **Resolved cURL Preview Tab (`uiStore.ts`, `RequestTabs.vue`, `RequestEditor.vue`):**
   - Expand `activeRequestTab` in `projects/frontend/src/stores/uiStore.ts` to `'params' | 'headers' | 'body' | 'auth' | 'curl'`.
   - Add `{ id: 'curl', label: 'cURL', count: 0 }` tab in `projects/frontend/src/components/RequestTabs.vue`.
   - In `projects/frontend/src/components/RequestEditor.vue`, add `panel-curl` (`data-test="curl-preview-panel"`) displaying the multiline `generateCurlCommand(req, { vars: effectiveVariables, pathNodes, multiline: true })` in a read-only `<pre><code>` block with a copy button (`data-test="copy-preview-curl-btn"`).

## Acceptance Criteria

- [x] AC1: `isCurlCommand` and `parseCurlCommand` accurately parse single-line and multiline cURL commands with `-X`, `-H`, `-d`/`--data-raw`, `-u`, `--url`, `-G`, single/double quotes, auto-POST inference, JSON body detection, and query parameter extraction.
- [x] AC2: Pasting a cURL command into `#url-input` in `UrlBar.vue` prevents raw text insertion, populates `requestStore.current` fields (`method`, `url`, `params`, `headers`, `body`, `auth`), and triggers toast `'Đã phân tích lệnh cURL'`. Pasting normal URLs works normally without interference.
- [x] AC3: `RequestTabs.vue` includes a `cURL` tab (`#tab-curl`), and selecting it displays `data-test="curl-preview-panel"` in `RequestEditor.vue` with multiline cURL output where `{{var}}` placeholders are resolved across the 4-tier hierarchy (`effectiveVariables`) and a working copy button (`data-test="copy-preview-curl-btn"`).
- [x] AC4: All unit and component tests pass (`bun run type-check`, `bun run test`, `go test ./...`).

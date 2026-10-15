---
title: 'Extended Body Payloads: XML, x-www-form-urlencoded, and multipart/form-data'
slug: '2-extended-body-payloads-xml-x-www-form-urlencoded-and-multipart-form-data'
created: '2026-10-14T23:36:00+07:00'
status: 'done'
completedAt: '2026-10-14T23:46:00+07:00'
input_documents:
  - '_bmad-output/specs/spec-smart-editor-and-payloads/SPEC.md'
  - '_bmad-output/specs/spec-smart-editor-and-payloads/smart-editor-and-payloads-architecture.md'
  - '_bmad-output/specs/spec-smart-editor-and-payloads/stories.yaml'
---

# Tech-Spec: Extended Body Payloads: XML, x-www-form-urlencoded, and multipart/form-data

**Created:** 2026-10-14T23:36:00+07:00  
**Story ID:** `2`

## Overview

### Problem Statement

Currently Hecto API only supports `none`, `json`, and `text` request bodies. Users testing SOAP/XML endpoints, OAuth2 token endpoints (`application/x-www-form-urlencoded`), or multipart form endpoints (`multipart/form-data`) cannot configure structured key-value form payloads or XML payloads with automatic `Content-Type` management and multipart boundary generation.

### Solution

1. **Go Models & Executor (`projects/model/types.go`, `projects/service/executor.go`):**
   - Extend `model.Body` with `FormData []KVPair` (`json:"form_data,omitempty"`) and `URLEncoded []KVPair` (`json:"urlencoded,omitempty"`).
   - Extend `model.ExecuteRequest` with `BodyType string` (`json:"body_type,omitempty"`) and `FormData []KVPair` (`json:"form_data,omitempty"`).
   - Update `ExecutorService.Send` to construct a `multipart/form-data` payload via `mime/multipart.NewWriter` when `req.BodyType == "formdata"` or `len(req.FormData) > 0`, automatically setting the `Content-Type` header with the generated boundary (`writer.FormDataContentType()`).
2. **Frontend Store, Headers, Request Builder & cURL (`requestStore.ts`, `headers.ts`, `buildExecuteRequest.ts`, `curl.ts`):**
   - Support `'none' | 'json' | 'text' | 'xml' | 'urlencoded' | 'formdata'` in `setBodyType` and `getDefaultHeaders` with automatic `Content-Type` management (`application/json`, `application/xml`, `application/x-www-form-urlencoded`, `multipart/form-data`).
   - Update `buildExecuteRequest` to serialize `urlencoded` key-value pairs with variable substitution and URL encoding, and pass resolved `form_data` items for `formdata`.
   - Update `generateCurlCommand` and `parseCurlCommand` to support `-F` (`multipart/form-data`), `--data-urlencode` / `application/x-www-form-urlencoded`, and `xml` bodies.
3. **Frontend UI (`RequestTabs.vue`, `BodyEditor.vue`):**
   - Add `XML`, `x-www-form-urlencoded`, and `multipart/form-data` options to `data-test="body-type-select"`.
   - Render `KvpEditor` in `BodyEditor.vue` when `bodyType === 'urlencoded'` (`data-test="body-urlencoded-editor"`) or `bodyType === 'formdata'` (`data-test="body-formdata-editor"`), and the code editor when `bodyType === 'xml'`.

## Acceptance Criteria

- [x] AC1: Selecting `xml`, `urlencoded`, or `formdata` in `RequestTabs.vue` updates `requestStore.current.body.type` and manages auto `Content-Type` headers.
- [x] AC2: `BodyEditor.vue` renders `KvpEditor` for `urlencoded` and `formdata` bodies and the code editor for `xml`.
- [x] AC3: `buildExecuteRequest` and Go `ExecutorService.Send` accurately encode `application/x-www-form-urlencoded` and `multipart/form-data` (with boundary) payloads.
- [x] AC4: `generateCurlCommand` and `parseCurlCommand` round-trip `xml`, `urlencoded`, and `formdata` (`-F`) requests.
- [x] AC5: All Go and frontend unit/component tests pass (`go test ./...`, `bun run type-check`, `bun run test`).

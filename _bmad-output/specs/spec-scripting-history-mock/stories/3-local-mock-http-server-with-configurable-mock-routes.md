---
title: 'Local Mock HTTP Server with Configurable Mock Routes'
slug: '3-local-mock-http-server-with-configurable-mock-routes'
created: '2026-10-15T00:33:00+07:00'
status: 'done'
completedAt: '2026-10-15T00:37:30+07:00'
input_documents:
  - '_bmad-output/specs/spec-scripting-history-mock/SPEC.md'
  - '_bmad-output/specs/spec-scripting-history-mock/scripting-history-mock-architecture.md'
  - '_bmad-output/specs/spec-scripting-history-mock/stories.yaml'
---

# Tech-Spec: Local Mock HTTP Server with Configurable Mock Routes

**Created:** 2026-10-15T00:33:00+07:00  
**Story ID:** `3`

## Overview

### Problem Statement

Frontend and API developers need a local HTTP Mock Server integrated directly into Hecto API (Mục 13) so they can configure mock endpoints (Method, Path, Status Code, Headers, Response Body, Delay) and point their local apps or Hecto API requests to `http://127.0.0.1:<port><path>` without external dependencies.

### Solution

1. **Go Backend (`projects/service/mock_server.go`, `projects/app.go`):**
   - Implement `MockServerService` managing a `net/http.Server` bound to `127.0.0.1:<port>` (default port `4010`, supports `0` for dynamic free port in tests).
   - Persist mock server configuration per collection in `<collRoot>/mock-server.json` (`model.MockServerConfig`).
   - Support route matching by HTTP method (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD`, or `ANY`) and path (exact match or `:param` segment wildcard, e.g. `/api/users/:id`), plus optional simulated latency (`DelayMs`), custom response headers (`Headers`), `StatusCode`, and `Body`, with automatic CORS headers (`Access-Control-Allow-Origin: *`).
   - Expose Wails bindings in `projects/app.go`: `GetMockServerStatus()`, `SaveMockServerConfig(cfg)`, `StartMockServer(port)`, `StopMockServer()`.
2. **Frontend Store & UI (`mockServerStore.ts`, `MockServerModal.vue`, `AppHeader.vue`, `App.vue`):**
   - Create `mockServerStore.ts` to manage status, routes, port, save, start, and stop actions.
   - Create `MockServerModal.vue` (`data-test="mock-server-modal"`, `data-test="mock-port-input"`, `data-test="mock-toggle-server-btn"`, `data-test="add-mock-route-btn"`, `data-test="save-mock-config-btn"`, `data-test="mock-route-row"`).
   - Mount `<MockServerModal />` in `App.vue`.

## Acceptance Criteria

- [x] AC1: `MockServerService` persists `mock-server.json` in `<collRoot>` and serves live HTTP responses on `127.0.0.1:<port>` matching configured routes (exact and `:param` paths, status code, headers, body, delay).
- [x] AC2: Unmatched routes return HTTP `404` JSON `{"error":"MOCK_ROUTE_NOT_FOUND",...}`.
- [x] AC3: `MockServerModal.vue` allows starting/stopping the server, configuring the port, adding/editing/deleting mock routes, and saving configuration.
- [x] AC4: All Go and frontend tests pass (`go test ./...`, `bun run type-check`, `bun run test`).

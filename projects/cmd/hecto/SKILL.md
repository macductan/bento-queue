---
name: hecto-cli
description: Use the standalone `hecto` CLI to inspect, create, update, move, delete, import, and execute API collections, environments, folders, and requests for hecto-api with 100% parity with the Wails Desktop application.
---

# `hecto` CLI — AI Coding Agent Skill & Reference Manual

`hecto` is the standalone, headless command-line interface for **hecto-api** (offline-first desktop API client). It shares the exact same file-based storage (`JSON` on disk) and TypeScript execution engine (`headless-engine.js` running on `goja`) as the Wails Desktop UI.

---

## 1. Golden Rules for AI Agents

1. **Always pass `--json`** when invoking `hecto` programmatically so `stdout` emits a single canonical `model.Result` JSON object:
   ```json
   {
     "success": true,
     "data": { ... }
   }
   ```
   or on error (exit code `1`):
   ```json
   {
     "success": false,
     "error": {
       "code": "NOT_FOUND | VALIDATION | IO_ERROR | PARSE_ERROR | CONNECTION_ERROR | TIMEOUT",
       "message": "Detailed error description"
     }
   }
   ```
2. **Flags can be placed anywhere** (before or after positional arguments `<id|path>`), e.g.:
   - `hecto req get "AuthFlow/Login" --json`
   - `hecto req move "Login" --to "AuthFlow" --json`
3. **Flexible Selectors (`<id|path>`)**:
   - You can address any **Collection** or **Environment** by its `UUID` or case-insensitive `Name`.
   - You can address any **Folder** or **Request** by its `UUID` or by its slash-separated hierarchical name path (e.g., `"Users/Auth"` or `"Users/Auth/Login"`).
4. **Isolated Testing (`--data-dir` / `HECTO_CONFIG_DIR`)**:
   - When running automated tests or sandboxed experiments, always pass `--data-dir /tmp/my-isolated-dir` or set `HECTO_CONFIG_DIR=/tmp/my-isolated-dir` so you never touch the user's real collections.
5. **JIT Manual & Safe Compact Output (Recommended for AI Agents)**:
   - Use `hecto agent-guide --toc` to list sections/aliases and `hecto agent-guide --section <id|alias[,...]>` (e.g., `core`, `req`, `flow`, `mock`, `3.4,6`) to read only the needed reference instead of loading the entire manual.
   - Pass `--compact` on `hecto run` / `hecto flow run` to drop duplicate fields, truncate large bodies (`500` bytes by default, override via `--max-body <bytes>`), and automatically redact sensitive headers/variables/auth values on `stdout` (`--redact`) without altering disk persistence.

---

## 2. 4-Entity Data Model & 4-Tier Variable Hierarchy

`hecto-api` organizes API workspaces into 4 core entities per Collection:
1. **`collection`** (`collection.json`): Holds Tier-1 Collection Variables (`variables`), Collection-level Auth (`auth`, `auth_envs`), and `active_env_id`.
2. **`env`** (`environments/<uuid>.json`): Holds Tier-2 Global Environment Variables (`variables`) for environments like `Dev`, `Staging`, `Prod`.
3. **`folder`** (`<folder-uuid>/_folder.json`): Can be nested arbitrarily deep. Holds Tier-3 Folder Global Variables (`variables`), Tier-4 Folder Environment Variables (`folder_envs[envId]`), inherited `headers`, and Folder Auth (`auth`, `auth_envs`).
4. **`req`** (`<req-uuid>.json`): Holds `method`, `url`, `headers`, `params`, `path_params`, `body` (`none|json|text|xml|urlencoded|formdata`), `auth` (`inherit|none|bearer|basic|apiKey`), `auth_envs`, and `scripts` (`pre_request`, `post_response`).

### 4-Tier Variable Precedence (Lowest -> Highest)
When resolving `{{variable}}` in URL, Params, Path Params (`:param`), Headers, Body, or Auth:
1. **Tier 1 — Collection Variables** (`collection.variables`)
2. **Tier 2 — Active Global Environment Variables** (`environments/<active_env_id>.variables`)
3. **Tier 3 — Folder Global Variables** (outermost folder $\rightarrow$ nearest parent folder `folder.variables`)
4. **Tier 4 — Folder Environment Variables** (outermost folder $\rightarrow$ nearest parent folder `folder.folder_envs[active_env_id]`)
5. **CLI Runtime Overrides** (`hecto run ... --var KEY=VALUE`)

### Auth Inheritance (`inherit`)
If a Request (or Folder) has `auth.type == "inherit"`, `hecto` walks up from the Request $\rightarrow$ nearest parent Folder $\rightarrow$ ancestor Folders $\rightarrow$ Collection, checking environment-specific `auth_envs[active_env_id]` before fallback `auth` at each level.

---

## 3. Orthogonal Command Matrix (`hecto <entity> <verb>`)

### Global Flags
- `-c, --collection <id|name>`: Target collection (defaults to `active_collection` in `config.json`).
- `--data-dir <path>`: Override config & collections directory (or set `HECTO_CONFIG_DIR`).
- `--json`: Output canonical `model.Result` JSON to `stdout`.

### 3.1. `collection`
```bash
hecto collection list [--json]
hecto collection get [id|name] [--json]
hecto collection create --name <name> [--description <desc>] [--var K=V]... \
  [--auth-type <none|bearer|basic|apiKey>] [--auth-token <t>] [--auth-user <u>] [--auth-pass <p>] \
  [--auth-key <k>] [--auth-val <v>] [--auth-in <header|query>] [--switch] [--json]
hecto collection update <id|name> [--name <name>] [--description <desc>] \
  [--set-var K=V]... [--unset-var K]... [--auth-type ...] [--env-auth <env>:<type>...] \
  [--active-env <id|name|none>] [--json]
hecto collection delete <id|name> [--json]
hecto collection switch <id|name> [--json]
```

### 3.2. `env`
```bash
hecto env list [-c <coll>] [--json]
hecto env get <id|name> [-c <coll>] [--json]
hecto env create --name <name> [--var K=V]... [--activate] [-c <coll>] [--json]
hecto env update <id|name> [--name <new-name>] [--set-var K=V]... [--unset-var K]... [-c <coll>] [--json]
hecto env delete <id|name> [-c <coll>] [--json]
hecto env activate <id|name|none> [-c <coll>] [--json]
```

### 3.3. `folder`
```bash
hecto folder list [-c <coll>] [--json]
hecto folder tree [-c <coll>] [--json]
hecto folder get <id|path> [-c <coll>] [--json]
hecto folder create --name <name> [--parent <id|path>] [--var K=V]... \
  [--env-var <env>:<K>=<V>]... [--header "K:V"]... \
  [--auth-type <inherit|none|bearer|basic|apiKey>] [--auth-token <t>] [--auth-user <u>] [--auth-pass <p>] \
  [--auth-key <k>] [--auth-val <v>] [--auth-in <header|query>] [--env-auth <env>:<type>...] [-c <coll>] [--json]
hecto folder update <id|path> [--name <new-name>] [--set-var K=V]... [--unset-var K]... \
  [--set-env-var <env>:<K>=<V>]... [--unset-env-var <env>:<K>]... \
  [--set-header "K:V"]... [--unset-header K]... [--auth-type ...] [--env-auth <env>:<type>...] [-c <coll>] [--json]
hecto folder delete <id|path> [-c <coll>] [--json]
hecto folder move <id|path> --to <target-id|path|root> [-c <coll>] [--json]
```

### 3.4. `req`
```bash
hecto req list [--folder <id|path>] [-c <coll>] [--json]
hecto req get <id|path> [-c <coll>] [--json]
hecto req create --name <name> [--method <GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS>] --url <U> \
  [--folder <id|path>] [--header "K:V"]... [--param K=V]... [--path-param K=V]... \
  [--body-type <none|json|text|xml|urlencoded|formdata>] [--body <str|@file>] \
  [--form K=V]... [--urlencoded K=V]... \
  [--auth-type <inherit|none|bearer|basic|apiKey>] [--auth-token <t>] [--auth-user <u>] [--auth-pass <p>] \
  [--auth-key <k>] [--auth-val <v>] [--auth-in <header|query>] [--env-auth <env>:<type>...] \
  [--pre-script <js|@file>] [--post-script <js|@file>] [-c <coll>] [--json]
hecto req update <id|path> [--name ...] [--method ...] [--url ...] \
  [--set-header "K:V"]... [--unset-header K]... [--set-param K=V]... [--unset-param K]... \
  [--set-path-param K=V]... [--unset-path-param K]... [--body-type ...] [--body <str|@file>] \
  [--set-form K=V]... [--unset-form K]... [--set-urlencoded K=V]... [--unset-urlencoded K]... \
  [--auth-type ...] [--env-auth <env>:<type>...] [--pre-script <js|@file>] [--post-script <js|@file>] [-c <coll>] [--json]
hecto req delete <id|path> [-c <coll>] [--json]
hecto req move <id|path> --to <target-id|path|root> [-c <coll>] [--json]
```
> **Read-Merge-Write (`update`)**: Only flags explicitly passed on the command line are modified; unflagged fields are preserved intact. Passing `--body ""`, `--pre-script ""`, or `--post-script ""` clears that field.

### 3.5. `run`, `import` & `agent-guide`
```bash
hecto run <id|path> [-c <coll>] [--env <id|name|none>] [--var K=V]... [--timeout <sec>] [--no-save-env] [--compact] [--redact] [--max-body <bytes>] [--json]
hecto import <file-or-curl> [-c <coll>] [--folder <id|path>] [--name <name>] [--json]
hecto agent-guide [--toc | --list | --section <id|alias[,...]>] [--json]
```
- `hecto agent-guide --toc --json` emits `{"success":true,"data":{"sections":[...],"composite_aliases":{"core":["1","2","3"]}}}`.
- `hecto agent-guide --section flow --json` emits `{"success":true,"data":{"sections":["6"],"content":"..."}}`.

---

## 4. Scripting (`ha.*` / `pm.*`) & `RunOutput` Schema

In `--pre-script` and `--post-script`, use the `ha` (or `pm`) object:
- `ha.variables.get("key")` / `ha.variables.set("key", "val")` (updates active environment, or collection variables if no active environment)
- `ha.collectionVariables.set("key", "val")` (Tier 1)
- `ha.env("Staging").set("key", "val")` (Tier 2)
- `ha.folderVariables.set("key", "val")` (Tier 3 nearest folder, or `ha.folder("AuthFlow").set("key", "val")`)
- `ha.folderEnv.set("key", "val")` (Tier 4 nearest folder + active env)
- `ha.folderAuth.setBearer("token")` / `ha.collectionAuth.setBearer("token")`
- `ha.request.headers.set("X-Trace", "123")` / `ha.request.url = "..."`
- `const body = ha.response.json();`
- `ha.test("Status is 200", () => { if (ha.response.code !== 200) throw new Error("Failed"); });`

### `hecto run --json` Output Structure
```json
{
  "success": true,
  "data": {
    "status_code": 200,
    "status_text": "200 OK",
    "time_ms": 14,
    "size_bytes": 128,
    "headers": { "Content-Type": ["application/json"] },
    "body": "{\"token\":\"secret-jwt\"}",
    "request": { "method": "POST", "url": "...", "headers": {}, "body": "..." },
    "resolved_request": { "method": "POST", "url": "...", "headers": {}, "body": "..." },
    "script_tests": [{ "name": "Status is 200", "passed": true }],
    "script_logs": ["[Post-response] token saved"],
    "console_logs": ["[Post-response] token saved"],
    "env_updates": {},
    "scoped_env_updates": { "folderGlobals": { "__nearest__": { "token": "secret-jwt" } } }
  }
}
```
> **Compact & Redaction Flags (`--compact`, `--redact`, `--max-body <bytes>`):** `--redact` masks sensitive headers (`Authorization`, `Cookie`, `X-Api-Key`, `X-Auth`, configured `apiKey` headers, ...), sensitive URL query/userinfo params, `FormData`/`urlencoded` credentials, error URLs, and secret variables/auth fields as `"***REDACTED***"` on `stdout` only (real values still persist to disk). `--max-body <bytes>` truncates `body` cleanly on UTF-8 rune boundaries and sets `"body_truncated": true`. `--compact` enables `--redact`, defaults `--max-body 500`, and omits `request`, `resolved_request`, `headers`, `console_logs`, `scoped_auth_updates`, and empty optional fields (`status_text`, `script_tests`, `script_logs`).

---

## 5. End-to-End AI Agent Recipe

```bash
# 1. Create and activate an environment
hecto env create --name "Staging" --var "base_url=https://api.example.com" --activate --json

# 2. Create a folder with Bearer auth inheriting token from folder variable {{token}}
hecto folder create --name "AuthFlow" --auth-type bearer --auth-token "{{token}}" --json

# 3. Create a Login request that extracts the JWT token into the AuthFlow folder variable
hecto req create --folder "AuthFlow" --name "Login" --method POST \
  --url "{{base_url}}/v1/login" \
  --body-type json --body '{"username":"admin","password":"secret"}' \
  --post-script 'const res = ha.response.json(); ha.folderVariables.set("token", res.token);' \
  --json

# 4. Run Login -> automatically saves token into AuthFlow/_folder.json
hecto run "AuthFlow/Login" --json
```

---

## 6. API Flow Orchestration (`hecto flow`)

Flows live inside `<collection>/flows/` and orchestrate multi-step E2E API scenarios using thin pointers (`request_id`) to existing `model.Request` items.
- **Sequential steps:** Each `FlowNode` in `flow.nodes` runs sequentially.
- **Parallel rows (`[Req 1 || Req 2]`):** A `FlowNode` with `len(steps) >= 2` executes all enabled steps concurrently on deep-copied state, then deterministically merges script variable/auth mutations (`index 0 -> 1 -> ...`) and writes to disk once.
- **3-mode branching (`branches`):** After a `FlowNode` completes, `custom` branch conditions (`status_code`, `body_json`, `variable` with `==`, `!=`, `>`, `<`, `contains`, `exists`) are evaluated first in order, followed by `success` (if `nodePassed === true`) or `error` (if `nodePassed === false`). When a failed node matches an `error` or `custom` branch whose child nodes succeed, the error is treated as handled (`handledByBranch = true`) and the flow continues.

### 6.1. `hecto flow` Command Matrix

| Command | Flags & Usage |
|---|---|
| `hecto flow list` | `[--folder <id\|path>] [-c <coll>] [--json]` — Flat list of flows in the collection or inside a FlowFolder. |
| `hecto flow tree` | `[-c <coll>] [--json]` — Full hierarchical `FlowFolder` and `Flow` tree in `<collection>/flows/`. |
| `hecto flow get <id\|path>` | `[-c <coll>] [--json]` — Full `Flow` JSON plus `referenced_requests` summary. |
| `hecto flow create` | `--name <name> [--folder <id\|path>] [--desc <text>] [--layout vertical\|horizontal] [--timeout-ms <ms>] [--max-steps <n>] [--steps "<req1>,<req2>\|\|<req3>,..."] [--nodes-json <json\|@file>] [-c <coll>] [--json]` |
| `hecto flow update <id\|path>` | `[--name <name>] [--desc <text>] [--layout vertical\|horizontal] [--timeout-ms <ms>] [--max-steps <n>] [--steps "..."] [--nodes-json <json\|@file>] [-c <coll>] [--json]` — Read-Merge-Write patch semantics. |
| `hecto flow delete <id\|path>` | `[-c <coll>] [--json]` — Delete a flow file from `<collection>/flows/`. |
| `hecto flow move <id\|path>` | `--to <folder-id\|path\|root> [-c <coll>] [--json]` — Move a flow to another FlowFolder or root. |
| `hecto flow folder <verb>` | `create --name <name> [--parent <id\|path>]` \| `update <id\|path> --name <name>` \| `delete <id\|path>` \| `move <id\|path> --to <id\|path\|root>` \| `list` \| `tree` \| `get <id\|path>` |
| `hecto flow run <id\|path>` | `[-c <coll>] [--env <id\|name\|none>] [--var K=V]... [--timeout-ms <ms>] [--no-save-env] [--compact] [--redact] [--max-body <bytes>] [--json]` — Execute the flow headlessly. Returns exit code `0` with `{"success":true,"data":...}` in `--json` mode, or exit code `1` in non-JSON mode if `data.status == "failed"`. |

### 6.2. Shorthand `--steps` vs Full `--nodes-json`
- **`--steps` shorthand:** Comma `,` separates sequential `FlowNode` rows; `||` separates parallel `FlowStep` items within the same row. Each token is a Request UUID or `<Folder>/<Request>` path:
  ```bash
  hecto flow create --name "Checkout E2E" --folder "E2E Suite" \
    --steps "AuthFlow/Login,Users/Get Profile||Catalog/Get Cart,Orders/Checkout" --json
  ```
- **`--nodes-json` (supports 3-mode `branches` and per-step `timeout_ms`):**
  ```bash
  hecto flow update "E2E Suite/Checkout E2E" --nodes-json '[
    {
      "steps": [{ "request_id": "AuthFlow/Login", "enabled": true, "timeout_ms": 5000 }],
      "branches": [
        {
          "name": "Rate Limited",
          "condition": { "type": "custom", "source": "status_code", "operator": "==", "value": "429" },
          "nodes": [{ "steps": [{ "request_id": "Queue/RetryLater", "enabled": true }] }]
        },
        {
          "name": "On Success",
          "condition": { "type": "success" },
          "nodes": [
            { "steps": [{ "request_id": "Users/Get Profile" }, { "request_id": "Catalog/Get Cart" }] },
            { "steps": [{ "request_id": "Orders/Checkout" }] }
          ]
        },
        {
          "name": "On Error",
          "condition": { "type": "error" },
          "nodes": [{ "steps": [{ "request_id": "Alerts/NotifyFailure" }] }]
        }
      ]
    }
  ]' --json
  ```

### 6.3. `hecto flow run --json` Output Structure (`FlowRunOutput`)
```json
{
  "success": true,
  "data": {
    "flow_id": "...",
    "flow_name": "Checkout E2E",
    "status": "passed",
    "total_time_ms": 42,
    "steps_executed": 4,
    "steps_passed": 4,
    "steps_failed": 0,
    "steps_skipped": 2,
    "node_results": [
      {
        "node_id": "...",
        "status": "passed",
        "matched_branch_id": "...",
        "step_results": [
          {
            "step_id": "...",
            "node_id": "...",
            "request_id": "...",
            "request_name": "Login",
            "method": "POST",
            "status": "passed",
            "run_output": { "status_code": 200, "time_ms": 12 }
          }
        ]
      }
    ],
    "step_results": []
  }
}
```
> **Flow `--compact` Mode:** Automatically enables `--redact`, drops the duplicate top-level `step_results` array, projects each step's `run_output` to compact fields (`status_code`, `time_ms`, `size_bytes`, `body_truncated`, `script_tests`, `script_logs`, `env_updates`, `scoped_env_updates`, `script_error`, `network_error`), omits `body` on `passed` steps (unless `--max-body > 0` is explicitly provided), and keeps truncated `body` (default `500` bytes) plus failure details on `failed` steps.

---

## 7. Local Mock HTTP Server (`hecto mock`)

`hecto mock` configures `<collection>/mock-server.json` (100% compatible with the Desktop UI `MockServerModal.vue`) and runs an embedded local HTTP mock server on `127.0.0.1:<port>`.

### Single Active Instance & Hot-Reload Rules
- **1 Global Instance at a Time:** State for the live CLI mock daemon is stored in a single global file `<configDir>/mock-daemon.json` (`pid`, `port`, `base_url`, `collection_id`, `coll_root`, `started_at`) — never inside `<collection>/`. (Note: Desktop UI in-process servers do not write `mock-daemon.json`.)
- **Auto-Stop Previous Daemon:** Any `hecto mock start` (foreground or `--daemon`, alias `serve`) automatically stops any previously running CLI daemon before binding the new port.
- **Port Policy:** Ports must be in `1024..65535` (default `4010`, port `0` is disallowed). `hecto mock` never silently switches ports — if the target port is occupied by an external process, it returns `IO_ERROR`.
- **Collection-Scoped `status`:** `hecto mock status [-c <coll>]` sets `running: true` only when the live daemon matches `<coll>`. If a daemon is running on a different collection, `status` returns `running: false` for the queried collection together with `active_daemon` metadata, and automatically cleans up stale PID files.
- **Hot-Reload:** Running mock servers watch `<collection>/mock-server.json` and hot-reload `routes` in memory whenever routes are created, updated, or deleted via CLI or edited on disk (no restart required).
- **HTTP Matching Behavior:** Supports `:param` and `*` path segments, `ANY` method wildcard, `delay_ms` (`0..30000`), custom headers (defaults to `Content-Type: application/json; charset=utf-8`), CORS headers (`Access-Control-Allow-Origin: *`), and returns HTTP `404` JSON `{"error":"MOCK_ROUTE_NOT_FOUND","method":...,"path":...}` for unmatched requests (with configured `OPTIONS`/`ANY` routes matched first before falling back to `204` on unmatched `OPTIONS`).

### 7.1. `hecto mock` Command Matrix

| Command | Flags & Usage |
|---|---|
| `hecto mock status` | `[-c <coll>] [--json]` — Inspect mock server status, configured port, routes, and live daemon info. |
| `hecto mock config` | `[--port <1024..65535>] [-c <coll>] [--json]` — Read or update the collection's configured port in `mock-server.json` (alias `-p`). |
| `hecto mock start` / `serve` | `[--port <1024..65535>] [--daemon] [-c <coll>] [--json]` — Start the mock server (foreground flushes 1 status line and waits for `SIGINT`/`SIGTERM`; `--daemon` detaches stdio, waits until TCP ready, prints JSON, and exits `0`). |
| `hecto mock stop` | `[-c <coll>] [--json]` — Stop the active mock daemon and remove `<configDir>/mock-daemon.json`. |
| `hecto mock route list` | `[-c <coll>] [--json]` — List all `MockRoute` entries in `<collection>/mock-server.json`. |
| `hecto mock route get` | `<id\|"METHOD /path"> [-c <coll>] [--json]` — Get a single route by UUID or `"METHOD /path"` (returns `VALIDATION` with matching IDs if ambiguous). |
| `hecto mock route create` | `--path </path> [--method <GET\|POST\|PUT\|PATCH\|DELETE\|OPTIONS\|HEAD\|ANY>] [--status-code <100..599>] [--delay-ms <0..30000>] [--header "K:V"]... [--body <str\|@file>] [--description <text>] [--enabled\|--disabled] [-c <coll>] [--json]` — Defaults: `method=GET`, `status_code=200`, `delay_ms=0`, `enabled=true`. |
| `hecto mock route update` | `<id\|"METHOD /path"> [--method ...] [--path ...] [--status-code <100..599>] [--delay-ms <0..30000>] [--set-header "K:V"]... [--unset-header K]... [--body <str\|@file>] [--description <text>] [--enabled\|--disabled] [-c <coll>] [--json]` — Read-Merge-Write (`FlagSet.Visit`); passing `--body ""` or `--description ""` clears that field. |
| `hecto mock route delete` | `<id\|"METHOD /path"> [-c <coll>] [--json]` — Delete a route by UUID or `"METHOD /path"`. |

> **Aliases:** Top-level `mocks` (`mock`); subcommands `serve` (`start`), `routes` (`route`); route verbs `ls` (`list`), `show` (`get`), `add` (`create`), `patch` (`update`), `rm` (`delete`); flags `--status` (`--status-code`), `--delay` (`--delay-ms`), `--desc` (`--description`), `-p` (`--port`).

### 7.2. JSON Schemas (`mock-server.json`, `status`/`start`/`stop`, `route delete`)

`<collection>/mock-server.json`:
```json
{
  "port": 4010,
  "routes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "method": "GET",
      "path": "/api/users/:id",
      "status_code": 200,
      "headers": [{ "key": "X-Mock", "value": "true", "enabled": true }],
      "body": "{\"id\":42,\"name\":\"Alice\"}",
      "delay_ms": 0,
      "enabled": true,
      "description": "Fetch mocked user"
    }
  ]
}
```

`hecto mock start --daemon --json` / `hecto mock status --json` / `hecto mock config --json` / `hecto mock stop --json`:
```json
{
  "success": true,
  "data": {
    "running": true,
    "port": 4010,
    "configured_port": 4020,
    "base_url": "http://127.0.0.1:4010",
    "routes": [],
    "pid": 12345,
    "collection_id": "default",
    "coll_root": "/path/to/collections/default",
    "started_at": "2026-11-18T14:00:00Z",
    "active_daemon": { "pid": 12345, "port": 4010, "base_url": "...", "collection_id": "...", "coll_root": "...", "started_at": "..." },
    "stopped": true
  }
}
```
- `configured_port` is included when `running: true` and `mock-server.json` has a different port than the running daemon.
- `active_daemon` is included on `status` when `running: false` for the queried collection while another collection's daemon is active.
- `stopped` (`true|false`) is included on `hecto mock stop`.

`hecto mock route delete <id|"METHOD /path"> --json`:
```json
{
  "success": true,
  "data": {
    "deleted_id": "550e8400-e29b-41d4-a716-446655440000",
    "method": "GET",
    "path": "/api/users/:id"
  }
}
```

### 7.3. End-to-End `--daemon` & `stop` Recipe
```bash
# 1. Configure port and create routes
hecto mock config --port 4010 --json
hecto mock route create --method GET --path "/api/users/:id" \
  --status-code 200 --header "X-Source: mock" \
  --body '{"id":42,"role":"admin"}' --json

# 2. Start background daemon (waits until TCP ready before exiting 0)
hecto mock start --daemon --json

# 3. Call the mock server or add another route (hot-reloaded automatically!)
curl -s http://127.0.0.1:4010/api/users/42
hecto mock route create --method ANY --path "/api/ping" --body '{"pong":true}' --json

# 4. Inspect status and stop the daemon
hecto mock status --json
hecto mock stop --json
```



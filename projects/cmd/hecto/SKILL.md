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

### 3.5. `run` & `import`
```bash
hecto run <id|path> [-c <coll>] [--env <id|name|none>] [--var K=V]... [--timeout <sec>] [--no-save-env] [--json]
hecto import <file-or-curl> [-c <coll>] [--folder <id|path>] [--name <name>] [--json]
```

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

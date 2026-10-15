# Architecture & Technical Design: Smart JSON Editor, Body Payloads & Environment-Scoped Auth

## 1. Smart JSON Editor (`projects/frontend/src/utils/jsonEditor.ts`, `VariableHighlighter.vue`, `BodyEditor.vue`)

- **JSON Validation with `{{variable}}` Placeholders (`validateJsonWithPlaceholders`):**
  - Replaces unquoted `{{var}}` tokens in value positions with `"__HECTO_VAR__"` and inside quoted strings before running `JSON.parse`.
  - When `JSON.parse` throws a `SyntaxError`, extracts the character offset or line/column position and computes `{ valid: false, error, line, column }`.
  - Empty or whitespace-only content returns `{ valid: true }`.
- **JSON Prettify with `{{variable}}` Placeholders (`prettifyJsonWithPlaceholders`):**
  - Substitutes bare unquoted `{{var}}` value tokens with unique sentinel strings `"__HECTO_BARE_VAR_0__"` before `JSON.parse` + `JSON.stringify(parsed, null, 2)`, then restores bare `{{var}}` tokens so templates like `{"count": {{limit}}}` format cleanly!
- **Syntax Highlighting (`VariableHighlighter.vue`):**
  - Adds optional prop `syntax?: 'plain' | 'json' | 'xml'`.
  - When `syntax === 'json'`, tokenizes non-variable segments into JSON keys (`text-sky-300`), string literals (`text-emerald-300`), numbers (`text-amber-300`), booleans/null (`text-purple-300`), and punctuation (`text-text-secondary`), while preserving existing `{{variable}}` pill highlighting and tooltip support.

## 2. Extended Body Payloads (`xml`, `urlencoded`, `formdata`)

- **Go Data Models (`projects/model/types.go`):**
  ```go
  type Body struct {
      Type       string   `json:"type"` // "none", "json", "text", "xml", "urlencoded", "formdata"
      Content    string   `json:"content"`
      FormData   []KVPair `json:"form_data,omitempty"`
      URLEncoded []KVPair `json:"urlencoded,omitempty"`
  }

  type ExecuteRequest struct {
      Method   string   `json:"method"`
      URL      string   `json:"url"`
      Headers  []KVPair `json:"headers"`
      Body     string   `json:"body"`
      BodyType string   `json:"body_type,omitempty"`
      FormData []KVPair `json:"form_data,omitempty"`
  }
  ```
- **Go HTTP Executor (`projects/service/executor.go`):**
  - When `req.BodyType == "formdata"` or `len(req.FormData) > 0`:
    - Uses `mime/multipart.NewWriter(&buf)` to write each enabled `KVPair` field (`writer.WriteField(kv.Key, kv.Value)`).
    - Sets `Content-Type` header to `writer.FormDataContentType()` (`multipart/form-data; boundary=...`), overriding any generic `multipart/form-data` header lacking a boundary parameter.
- **Frontend Request Building & cURL (`buildExecuteRequest.ts`, `headers.ts`, `curl.ts`):**
  - Auto `Content-Type` mapping:
    - `json` -> `application/json`
    - `xml` -> `application/xml`
    - `urlencoded` -> `application/x-www-form-urlencoded`
    - `formdata` -> `multipart/form-data`
  - `buildExecuteRequest.ts`:
    - For `urlencoded`: encodes enabled `req.body.urlencoded` pairs (`encodeURIComponent(resolvedKey)=encodeURIComponent(resolvedVal)`) joined by `&` into `body`, or falls back to `resolveVariables(req.body.content, vars)`.
    - For `formdata`: resolves variables on enabled `req.body.form_data` items and populates `ExecuteRequest.form_data` and `body_type = 'formdata'`.
  - `curl.ts`:
    - `generateCurlCommand`: emits `-F 'key=value'` for `formdata`, and `--data-raw` for `json`, `xml`, `text`, `urlencoded`.
    - `parseCurlCommand`: recognizes `-F` / `--form` flags into `body.type = 'formdata'` + `body.form_data`, `--data-urlencode` or `Content-Type: application/x-www-form-urlencoded` into `body.type = 'urlencoded'` + `body.urlencoded`, and `Content-Type: application/xml` / `text/xml` into `body.type = 'xml'`.

## 3. Environment-Scoped & Global Authentication (`Mục 34`)

- **Data Models (`projects/model/types.go`, `collectionStore.ts`, `requestStore.ts`):**
  - `Collection`: add `Auth *AuthConfig` (`json:"auth,omitempty"`) and `AuthEnvs map[string]*AuthConfig` (`json:"auth_envs,omitempty"`).
  - `Folder` & `TreeNode`: add `AuthEnvs map[string]*AuthConfig` (`json:"auth_envs,omitempty"`).
  - `Request`: add `AuthEnvs map[string]*AuthConfig` (`json:"auth_envs,omitempty"`).
- **Resolution Precedence (`projects/frontend/src/utils/auth.ts`):**
  - `resolveEffectiveAuth(auth, pathNodes, options)` checks:
    1. Request: `requestAuthEnvs?.[activeEnvId]` (if defined and `type !== 'inherit'`) -> `auth` (if defined and `type !== 'inherit'`).
    2. Ancestor Folders (nearest to root): `folder.auth_envs?.[activeEnvId]` (if defined and `type !== 'inherit'`) -> `folder.auth` (if defined and `type !== 'inherit'`).
    3. Collection: `collectionAuthEnvs?.[activeEnvId]` (if defined and `type !== 'inherit'`, treating `'inherit'` as `'none'` at root) -> `collectionAuth` (if defined and `type !== 'inherit'`).
    4. Fallback: `{ type: 'none' }`.
- **UI Components (`AuthEditor.vue`, `CollectionEnvModal.vue`, `FolderEditor.vue`, `RequestEditor.vue`):**
  - `AuthEditor.vue` accepts optional `authEnvs?: Record<string, AuthConfig>` (`v-model:auth-envs`) and renders a scope selector (`data-test="auth-env-scope-select"`) allowing the user to switch between `Global (Dùng chung mọi môi trường)` and any Environment in `envStore.environments`.
  - `CollectionEnvModal.vue` adds tabs for **Variables** and **Auth** so users can configure Collection-level Global/Environment-scoped Auth alongside Collection Variables.

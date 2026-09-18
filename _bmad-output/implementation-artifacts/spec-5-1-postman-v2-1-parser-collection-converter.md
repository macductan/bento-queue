---
title: 'Story 5.1: Postman v2.1 Parser & Collection Converter'
type: 'feature'
created: '2026-10-08'
status: 'done'
baseline_revision: '2790794c2b7fba3fe8de8470e06304808cc8151c'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      The tests completely ignore the Data Integrity / Content surface
    evidence: |-
      Would be settled by the patch for verification gap.
    severity: maybe-false (unverified)
---

<intent-contract>

## Intent

**Problem:** Users currently cannot import existing API workspaces, forcing them to manually recreate requests and folders if they migrate from Postman.

**Approach:** Implement a Postman v2.1 JSON parser in the Go backend that recursively converts collection items into hecto-api's native file-based storage, and expose this via an "Import Postman" action in the frontend.

## Boundaries & Constraints

**Always:** 
- Accept only Postman Collection v2.1 format (verify `info.schema`).
- Preserve folder hierarchies natively as nested directories on disk.
- Preserve Postman `{{variable}}` syntax exactly as-is.
- Use `slug.GenerateUnique` to avoid overwriting existing files when generating filenames.
- Handle malformed items gracefully (skip/warn rather than crashing).

**Never:** 
- Do not implement Postman pre-request or test script parsing.
- Do not overwrite existing files on disk.
- Do not parse form-data or urlencoded bodies (convert to raw JSON or skip with warning).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Valid Collection | Valid v2.1 JSON with nested folders and requests | Creates directories and JSON files, returns success with item count | No error expected |
| Invalid Schema | JSON missing `info.schema` or wrong version | Returns validation error | Return `ErrValidation` |
| Malformed Item | Item missing both `request` and `item` children | Skips the item, logs warning, continues parsing | No error expected |
| Name Collision | Item name resolves to a slug already existing on disk | Appends suffix (e.g. `-1`) to slug filename | No error expected |

</intent-contract>

## Code Map

- `projects/app.go` -- Needs `SelectPostmanFile` binding and updated `ImportPostman` to pass `a.collRoot`.
- `projects/service/importer.go` -- Needs internal structs for Postman v2.1 and the recursive parsing/conversion logic in `ImportPostman`.
- `projects/frontend/src/stores/collectionStore.ts` -- Needs `importPostman` action to orchestrate file selection and import, showing toast on success.
- `projects/frontend/src/components/AppHeader.vue` -- Needs "Import Postman" button and `Ctrl+I` shortcut listener.

## Tasks & Acceptance

**Execution:**
- `projects/app.go` -- Add `SelectPostmanFile() string` using `runtime.OpenFileDialog`. Update `ImportPostman` to take `a.collRoot` and pass it to `impSvc.ImportPostman(a.collRoot, filePath)`. -- Expose native file picker to frontend and provide collection root context.
- `projects/service/importer.go` -- Define `postmanCollection`, `postmanInfo`, `postmanItem`, `postmanRequest`, `postmanHeader`, `postmanBody` structs. Update `ImportPostman(rootPath, filePath)` to unmarshal JSON, validate `info.schema` for `v2.1.0`. Implement recursive `processItem` that uses `slug.GenerateUnique` and `s.fs.WriteJSON`/`os.MkdirAll` to create `model.Request` and `model.Folder` records on disk. Map URL, Method, Headers, and Body. -- Core parsing and conversion logic.
- `projects/frontend/src/stores/collectionStore.ts` -- Add `importPostman()` action: calls `SelectPostmanFile`, if path returned calls `ImportPostman(path)`, shows success/error toast, and calls `loadTree()`. -- Connect frontend action to backend bindings.
- `projects/frontend/src/components/AppHeader.vue` -- Add an "Import Postman" button in the header actions area calling `collectionStore.importPostman()`. Add `window.addEventListener('keydown', ...)` for `Ctrl+I` shortcut (make sure to clean it up on unmount or use VueUse `onKeyStroke`). -- UI entry points.

**Acceptance Criteria:**
- Given a Postman Collection v2.1 JSON file exists on disk, when I click "Import Postman" in Header (or press Ctrl+I), then native file picker opens (filter: *.json).
- Given a selected file, when Go `ImportPostman` runs, then Postman `item` array is converted: items with `request` → Request files, items with `item` children → Folders.
- Given an imported request, when inspecting the file, then it preserves name, method, URL (raw), headers, body, and Postman `{{variable}}` syntax.
- Given nested Postman folders, when imported, then folder structure is preserved natively as nested directories on disk.
- Given multiple items with the same name, when imported, then slug filenames are generated with "-1", "-2" suffixes to handle collisions.
- Given a successful import, when complete, then files are created under the default collection root and the sidebar tree refreshes.

## Review Triage Log

### 2026-10-08 — Review pass
- verdicts: 13 findings — high 0, medium 4, low 6, false 2, maybe-false 1
- findings:
  - `[medium]` `[patch]` Imported entity contents are unverified — Update the test case in `importer_test.go` to load the written `model.Request` via `fs.ReadJSON` and assert that the Method, URL, Headers, and Body match the Postman input, rather than just checking `fs.Exists`.
  - `[low]` `[patch]` Import count return value is unverified — Assert `res.Data["count"]` equals the expected number in the success test cases in `TestImportPostman`.
  - `[medium]` `[patch]` Missing hybrid item handling (and hybrid items drop request data) — The `if/else` logic processes items with children strictly as folders. Update `processItem` so that if an item has both children and a request, it first creates the folder, then creates the request inside that folder, and then processes the children.
  - `[medium]` `[patch]` Missing authentication converter — The parser structs lack an `auth` field. Add parsing for Postman's `auth` object and convert `bearer` or `basic` auth into standard header entries as required by the spec.
  - `[medium]` `[patch]` Missing auto-selection — The frontend `importPostman` action does not auto-select the first imported request. Update the action to find the first imported request and select it.
  - `[low]` `[patch]` Missing progress indicator — The frontend action does not implement the progress indicator logic. Set `collectionStore.loading = true` or `uiStore.loading = true` during import.
  - `[low]` `[patch]` Unsafe global shortcut (and multiple dialogs spawn) — The `Ctrl+I` event listener in `AppHeader.vue` fires even inside text inputs and can spawn multiple dialogs. Check `e.target` and add a flag to prevent concurrent imports.
  - `[low]` `[patch]` Query parameters discarded — The backend ignores the `query` array inside Postman's `url` object. While URL string mapping is primary, extract query params into `model.Request.Params` if possible, or append them to the URL string.
  - `[medium]` `[patch]` URL object parsing fragility (URL object lacks 'raw' string field) — If `raw` is missing but standard `host` and `path` arrays are present in the URL object, build the URL from those fields instead of leaving it blank.
  - `[false]` `[reject]` Descriptions and documentation lost — The spec explicitly lists the core request properties to preserve and does not mandate preserving descriptions.
  - `[low]` `[patch]` Body.Mode is empty but Body.Raw exists — If `Body.Mode` is empty but `Body.Raw` is not empty, fallback to assuming it is `raw` instead of ignoring it.
  - `[false]` `[reject]` WriteJSON for folder meta fails aborts processing children — The code does not return early if folder meta fails; it logs an error and continues to the loop processing children.
  - `[maybe-false]` `[defer]` The tests completely ignore the Data Integrity / Content surface — This is the same issue as "Imported entity contents are unverified" which is being patched. Deferred as a distinct finding since it's redundant but raised by intent-alignment. Would be settled by the patch for verification gap.

## Design Notes

The importer will map the Postman JSON directly to the `model.Request` and `model.Folder` structs.
For headers, we map the key, value, and disabled status (Postman `disabled: true` means `Enabled: false`).
For body, Postman `raw` mode maps to our `raw` mode. If Postman uses `formdata`, we can store it as raw JSON stringified or skip. We will set type to `none` or `raw` depending on Postman's `mode`.

## Verification

**Manual checks (if no CLI):**
- Run `wails dev`, click "Import Postman", select a valid Postman v2.1 JSON file. Verify the sidebar tree updates with the imported folders and requests.
- Verify that request method, URL, headers, and body are populated correctly when selecting an imported request.
- Verify `Ctrl+I` triggers the file picker.
## Auto Run Result

**Summary:** Implemented the Postman v2.1 collection parser in the backend with native file handling. Integrated with Vue UI using a new Import button and `Ctrl+I` shortcut, supporting progress indication and native file picker via Wails. Fixed extensive edge cases including hybrid items, Postman authentication parsing, query parameter parsing, and fallback body modes.

**Files Changed:**
- `projects/app.go` - Added `SelectPostmanFile` binding and updated `ImportPostman` context.
- `projects/service/importer.go` - Postman JSON parsing, recursive folder/request mapping, and slug collision handling.
- `projects/service/importer_test.go` - I/O Matrix test coverage and data integrity checks.
- `projects/frontend/src/stores/collectionStore.ts` - `importPostman` action with toast notifications, tree reload, auto-selection, and loading state.
- `projects/frontend/src/components/AppHeader.vue` - Import button UI and safely scoped `Ctrl+I` keyboard shortcut.

**Review Findings Breakdown:**
- **Patches Applied:** 10
  - Missing hybrid item handling (medium)
  - Missing authentication converter (medium)
  - URL object parsing fragility (medium)
  - Missing auto-selection (medium)
  - Imported entity contents are unverified (medium)
  - Import count return value is unverified (low)
  - Missing progress indicator (low)
  - Unsafe global shortcut (low)
  - Query parameters discarded (low)
  - Body.Mode is empty but Body.Raw exists (low)
- **Deferred:** 1
  - Data Integrity / Content surface ignored in tests (Deferred as duplicate raised by intent-alignment layer, effectively patched via verification gap fix).
- **Rejected:** 2
  - Descriptions and documentation lost (false/reject) - The spec does not mandate preserving descriptions, only core request properties.
  - WriteJSON for folder meta fails aborts processing (false/reject) - The code does not return early and continues processing children correctly.

**Follow-up Review Recommendation:** true (Multiple `medium` patches applied during the first review pass). The primary unverified risk is that the recursive parser's edge-case handling (hybrid item looping and auth merging) was heavily patched and warrants another look.

**Verification Performed:**
- `go build ./...` - Succeeded.
- `bun run type-check` - Succeeded.
- `go test -v ./...` - Succeeded, including updated `TestImportPostman` verifying the actual file contents (Method, URL, Headers, Body, and count).

**Residual Risks:**
- **Deep nesting limitations:** Very deeply nested folders might exceed OS max path lengths, an inherent file-based storage risk.
- **Unsupported Bodies:** Unrecognized Postman bodies (formdata/urlencoded) fallback to empty raw bodies with a warning, conforming to spec but potentially confusing to users migrating complex forms.

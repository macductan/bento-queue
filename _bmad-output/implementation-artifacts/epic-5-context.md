# Epic 5 Context: Postman Import

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Epic 5 builds the Postman Collection v2.1 import feature, allowing users to migrate their existing API workspaces into hecto-api without manual recreation. This is critical for user adoption, providing a seamless transition by parsing the Postman JSON format and converting it into hecto-api's native file-based structure. It ensures all request details, folder hierarchies, and environment variables are preserved and instantly usable.

## Stories

- Story 5.1: Postman v2.1 Parser & Collection Converter
- Story 5.2: Import Feedback & Error Handling
- Story 5.3: Epic 5 Deferred Work Cleanup

## Requirements & Constraints

- Accept Postman Collection v2.1 JSON files via a native OS file picker.
- Parse Postman `item` arrays recursively: items with `request` become Request files; items with `item` children become Folders; hybrid items become a folder containing a request.
- Preserve folder hierarchies natively as nested directories on disk (supporting 4+ levels).
- Preserve all core request properties: name, HTTP method, raw URL, headers (key, value, enabled status), and body (raw content and mode).
- Keep the `{{variable}}` syntax exactly as-is for compatibility with hecto-api's variable substitution engine.
- Convert Postman collection-level or request-level authentication helpers (e.g., Bearer, Basic) into standard header entries where possible.
- Provide clear user feedback: success toasts with item counts, or explicit error messages for invalid/unsupported files (e.g., wrong schema).
- Out of scope: Postman pre-request/test scripts, Bruno/OpenAPI/cURL import, form-data bodies (convert to raw JSON or skip with a warning).

## Technical Decisions

- The parsing and conversion logic (`ImportPostman(filePath)`) must reside in the Go backend.
- Validate the imported JSON by verifying the `info.schema` field matches Postman Collection v2.1.
- Generate new UUIDs and slug filenames for imported entities while preserving the original `name` field for display.
- Write the converted files directly to the root of the active collection directory.
- Implement strict collision handling: if a generated filename conflicts with an existing file on disk, append suffixes (`-1`, `-2`, etc.). Never overwrite existing files.
- Skip malformed items without crashing, record them as warnings, and include them in the `ImportResult` payload returned to the frontend.

## UX & Interaction Patterns

- Triggered via an "Import Postman" action in the header or `Ctrl+I` keyboard shortcut.
- Displays a progress indicator if the import process takes longer than 1 second.
- On success: display a success toast ("Import thành công: N requests, M folders"), automatically refresh the sidebar tree, and auto-select the first imported request.
- On failure (e.g., invalid JSON or wrong schema): present a clear error modal explaining the issue with an option to select a different file.

## Cross-Story Dependencies

- Relies on the core storage mechanisms and folder structure conventions established in earlier epics.
- Variable syntax compatibility relies on the environment substitution engine from Epic 4.

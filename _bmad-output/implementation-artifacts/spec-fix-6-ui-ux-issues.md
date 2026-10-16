---
title: 'Fix 6 UI/UX Issues: XML Highlighting, Response Subtoolbar, Caret Sync, Editor Spacing, Folder Tab Order, TabBar Scroll'
type: 'bugfix'
created: '2026-10-16'
status: 'done'
baseline_revision: 'a146d68a715befeca4c73c0ac8cc78bfe039ffde'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** 6 UI/UX and display issues affect user workflows in Hecto API client:
1. XML response bodies and request bodies lack Pretty format and syntax highlighting in `ResponseViewer.vue`, `JsonViewer.vue`, `BodyEditor.vue`, and `VariableHighlighter.vue`.
2. In `ResponseViewer.vue`, the `Pretty | Raw` toggle and `Sao chép` button share the top tab line with tabs and `ResponseMetaBar`, crowding metadata and cutting off status/time/size on narrow viewports.
3. In `KvpEditor.vue`, pasting long URLs into the Value textarea causes severe caret misalignment because the textarea lacks `whitespace-pre-wrap break-all` synchronized with `VariableHighlighter.vue` overlay.
4. In `RequestEditor.vue` and `BodyEditor.vue`, excessive margins (`space-y-6`, `p-4`, `mt-4`, `pb-4`) waste vertical space above and below the Body Editor.
5. In `FolderEditor.vue`, folder tabs are ordered `Headers -> Auth -> Variables` defaulting to `headers`, inconsistent with `CollectionEnvModal.vue` (`Variables -> Auth -> Headers`).
6. In `AppTabBar.vue`, horizontal scrollbar overlays and obscures tabs on Linux WebKit due to missing global `.hide-scrollbar` CSS utility, and lacks mouse wheel horizontal scrolling.

**Approach:**
1. Create `xmlUtils.ts` with XML content-type detection, DOMParser-based validation with `{{var}}` placeholder support, pretty-formatting, syntax-highlighted HTML generation, and tokenization. Integrate into `ResponseViewer.vue`, `JsonViewer.vue`, `BodyEditor.vue`, and `VariableHighlighter.vue`.
2. Move `Pretty | Raw` and `Sao chép` buttons in `ResponseViewer.vue` to a dedicated sub-toolbar right below the tab row when the Body tab is active.
3. Synchronize `whitespace-pre-wrap break-all`, font, padding, border, and line-height between `<textarea>` and `VariableHighlighter` overlay in `KvpEditor.vue`.
4. Reduce `space-y-6` to `space-y-3`, outer padding `p-4` to `p-3`, tab margins, and editor bottom padding in `RequestEditor.vue` and `BodyEditor.vue`.
5. Reorder folder tabs in `FolderEditor.vue` to `Variables -> Auth -> Headers` and default `activeTab` to `'variables'`, updating unit tests in `FolderEditor.test.ts`.
6. Define global `.hide-scrollbar` in `style.css` and add `@wheel.passive` horizontal scroll support to `AppTabBar.vue`.

## Boundaries & Constraints

**Always:**
- Keep all tests passing 100% (`bun run type-check`, `bun run test`).
- Ensure XML pretty-formatting preserves variable tokens `{{var}}` without corrupting them.
- Preserve backward compatibility for JSON, raw, and binary response viewers.
- Respect git safety rules: do NOT commit or push without explicit human confirmation.

**Never:**
- Hand-edit files under `_bmad-output/` outside BMad skill workflows.
- Break existing tab navigation or keybinding shortcuts (Ctrl+S, Ctrl+Enter, Tab navigation).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| XML response received | Content-Type `text/xml` or `<root><item>1</item></root>` | Auto-switches to Pretty view with XML syntax highlighting and line numbers | Falls back to Raw if XML syntax is invalid |
| Copy XML in Pretty mode | User clicks "Sao chép" with mode='pretty' on XML response | Copies formatted XML text to clipboard | Copies raw response body if not pretty |
| Body Editor XML validation | `bodyType === 'xml'` with `<tag>{{var}}</tag>` | Shows "✓ XML hợp lệ" and allows "Format XML"; highlights XML tokens while keeping `{{var}}` highlighted | Invalid XML shows "⚠ XML lỗi cú pháp..." and format button shows toast |
| Long URL paste in KvpEditor Value | Paste `https://edev-ws.sanmar.com:8080/SanMarWebService/SanMarWebServicePort?wsdl` | Caret matches visible characters exactly on every line with synchronized `break-all` | No text offset or caret drifting |
| Folder Editor opened | User opens any folder settings | Defaults to "Variables" tab, tab order is `Variables -> Auth -> Headers` | State indicator and auto-save work as expected |
| AppTabBar wheel scroll | User scrolls mouse wheel over tabs | Container scrolls horizontally without visible overlay scrollbar | Native vertical scroll fallback when not overflowing |

</intent-contract>

## Code Map

- `projects/frontend/src/utils/xmlUtils.ts` -- Core XML detection, parsing, validation with placeholders, pretty format, HTML syntax highlighting, and tokenization.
- `projects/frontend/src/utils/__tests__/xmlUtils.test.ts` -- Comprehensive unit tests for XML utilities.
- `projects/frontend/src/components/ResponseViewer.vue` -- Sub-toolbar for Pretty/Raw & Copy buttons below main tabs, XML pretty support and copy logic.
- `projects/frontend/src/components/JsonViewer.vue` -- Format XML with line numbers when response is XML.
- `projects/frontend/src/components/BodyEditor.vue` -- XML toolbar with validation banner and Format XML button, reduced bottom spacing.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Tokenize and highlight XML syntax (`syntax === 'xml'`) while preserving `{{var}}`.
- `projects/frontend/src/components/KvpEditor.vue` -- Synchronize `whitespace-pre-wrap break-all`, font, padding, and line-height on Value textarea.
- `projects/frontend/src/components/RequestEditor.vue` -- Tighten vertical spacing (`space-y-3`, `p-3`, reduced `mt-2`) to expand Body Editor height.
- `projects/frontend/src/components/FolderEditor.vue` -- Reorder tabs to `Variables -> Auth -> Headers`, default `activeTab` to `'variables'`.
- `projects/frontend/src/components/__tests__/FolderEditor.test.ts` -- Updated tests reflecting `'variables'` default tab and tab order.
- `projects/frontend/src/components/AppTabBar.vue` -- Wheel-based horizontal scroll listener.
- `projects/frontend/src/style.css` -- Global `.hide-scrollbar` utility definition.

## Tasks & Acceptance

**Execution:**
- `projects/frontend/src/utils/xmlUtils.ts` -- Create XML parsing, validation, formatting, and syntax highlighting utilities.
- `projects/frontend/src/utils/__tests__/xmlUtils.test.ts` -- Unit tests for XML utilities.
- `projects/frontend/src/components/JsonViewer.vue` -- Add XML pretty rendering with syntax highlighting and line numbers.
- `projects/frontend/src/components/ResponseViewer.vue` -- Move Pretty/Raw & Copy buttons to sub-toolbar; integrate XML pretty & copy.
- `projects/frontend/src/components/BodyEditor.vue` -- Add XML toolbar, Format XML action, validation banner, and reduce bottom padding.
- `projects/frontend/src/components/VariableHighlighter.vue` -- Implement XML syntax highlighting tokenization with variable placeholder support.
- `projects/frontend/src/components/KvpEditor.vue` -- Synchronize textarea wrap, font, padding, and line-height with VariableHighlighter overlay.
- `projects/frontend/src/components/RequestEditor.vue` -- Reduce vertical spacing between UrlBar, WarningBanner, RequestTabs, and editor panes.
- `projects/frontend/src/components/FolderEditor.vue` -- Change tab order to Variables -> Auth -> Headers and default activeTab to 'variables'.
- `projects/frontend/src/components/__tests__/FolderEditor.test.ts` -- Update unit tests for FolderEditor.
- `projects/frontend/src/style.css` -- Add global `.hide-scrollbar` utility class.
- `projects/frontend/src/components/AppTabBar.vue` -- Add `@wheel.passive` horizontal scroll handler.
- `projects/frontend/src/components/__tests__/ResponseViewer.test.ts` -- Add/update unit tests for sub-toolbar and XML pretty/copy.
- `projects/frontend/src/components/__tests__/BodyEditor.test.ts` -- Add/update unit tests for XML format and validation.
- `projects/frontend/src/components/__tests__/AppTabBar.test.ts` -- Add/update unit tests for tab bar wheel scrolling.

**Acceptance Criteria:**
- Given an XML HTTP response, when displayed in ResponseViewer, then it shows in Pretty mode with XML syntax highlighting and copying in Pretty mode copies formatted XML.
- Given ResponseViewer with response data, when viewing Body tab, then Pretty/Raw and Copy buttons appear on a sub-toolbar below the tab row, leaving ResponseMetaBar uncrowded.
- Given a long URL pasted into KvpEditor Value textarea, then the textarea and VariableHighlighter overlay wrap identically (`whitespace-pre-wrap break-all`), keeping caret position 1:1 with displayed text.
- Given RequestEditor, when rendered, then vertical space between UrlBar, tabs, and BodyEditor is compact with maximized body editing area.
- Given FolderEditor, when opened, then the Variables tab is displayed first and active by default, followed by Auth and Headers.
- Given AppTabBar, when tabs overflow, then no horizontal scrollbar covers the tabs on WebKit/Linux and mouse wheel scrolls tabs horizontally.

## Spec Change Log

## Review Triage Log

### 2026-10-16 — Review pass
- verdicts: 20 findings — high 2, medium 8, low 10, false 0, maybe-false 0
- findings:
  - `[medium]` `[patch]` Pretty mode rendered on non-JSON non-XML response body in `JsonViewer.vue` — unescaped response body in `v-html` could cause HTML injection or display corruption; fixed by escaping fallback HTML with `escapeHtml(props.response.body)`.
  - `[high]` `[patch]` XML segment containing empty tag `<>` or leading whitespace inside brackets in `xmlUtils.ts` — closing bracket was dropped from tokens causing overlay desync; fixed by preserving `hasEndBracket` and self-closing punctuation in `tokenizeXmlTextSegment`.
  - `[low]` `[patch]` XML element containing multiline text child with newlines in `formatXmlText` — multiline text node was flattened without line indentation; fixed by adding `!next1.includes('\n')` guard to `isSingleLineTextChild`.
  - `[high]` `[patch]` Closing tag containing whitespace around tag name in `xmlUtils.ts` — discarded whitespace caused overlay text length mismatch with textarea; fixed by capturing all whitespace and tokens so `tokens.map(t => t.value).join('') === text`.
  - `[medium]` `[patch]` XML tag regex truncated on literal `>` inside quoted attribute value in `xmlUtils.ts` — tag split across multiple tokens; fixed by updating regex to `<(?:"[^"]*"|'[^']*'|[^'">])+>`.
  - `[medium]` `[patch]` WheelEvent with deltaMode of DOM_DELTA_LINE in `AppTabBar.vue` — tab bar scrolled slowly and trackpad deltaX was duplicated; fixed by normalizing with line factor 24, checking `scrollWidth > clientWidth`, and only translating vertical deltas.
  - `[medium]` `[patch]` Caller-path regression gap in BodyEditor XML syntax highlighting — `BodyEditor.test.ts` did not assert XML syntax tokens in overlay; fixed by adding `data-xml-token="tag-name"` assertions in `BodyEditor.test.ts`.
  - `[low]` `[patch]` Regression gap in ResponseViewer Pretty-mode JSON copy — `ResponseViewer.test.ts` only tested XML copy; fixed by adding test clicking copy on JSON in Pretty mode and asserting `ClipboardSetText` formatted text.
  - `[low]` `[patch]` Redundant boolean condition in ResponseViewer watch handler — `(A && B) || B === B` simplified by checking `canBePretty.value`.
  - `[low]` `[patch]` Dead code in `JsonViewer.vue` — unused imports `isJsonContentType`, `isXmlContentType` and unused `isOversized` removed.
  - `[medium]` `[patch]` Multi-line comments and CDATA sections losing opening `<` in `formatXmlHtml` — line-by-line regex dropped `<` on multiline lines; fixed by updating `highlightXmlLine` regex to match unclosed multi-line delimiters and preserving all characters.
  - `[medium]` `[patch]` Variables inside XML attributes break syntax tokenization for subsequent attributes in `VariableHighlighter.vue` — segment following variable started with `" attr="..."` without `<`; fixed by tracking `xmlSegmentStates` and passing `startInsideTag` to `tokenizeXmlTextSegment`.
  - `[medium]` `[patch]` Naive tag matching regex `<[^>]+>` in `formatXmlText` and `formatXmlHtml` — shares root cause with ECH-5; fixed by supporting quoted strings in tag matching regexes.
  - `[medium]` `[patch]` `validateXmlWithPlaceholders` accepts mismatched variable tags and leaks dummy placeholder text into error messages — fixed by mapping distinct placeholders to distinct IDs (`_hecto_var_${i}_`) and restoring original variable placeholders in error message.
  - `[low]` `[patch]` Empty XML body editor displays `✓ XML hợp lệ` badge — fixed by checking `bodyContent?.trim() && xmlValidation.valid` in `BodyEditor.vue`.
  - `[low]` `[patch]` Redundant boolean condition in `ResponseViewer.vue` watch handler — shares root cause with VG-3; fixed by simplifying watch condition.
  - `[medium]` `[patch]` `canBePretty` does not guard against oversized response bodies in `ResponseViewer.vue` — clicking Pretty on 15MB+ payload froze main thread; fixed by adding `!isOversized.value` to `canBePretty`.
  - `[medium]` `[patch]` `AppTabBar.vue` wheel scrolling lacks deltaMode normalization and overflow check — shares root cause with ECH-6; fixed by multiplying by line height factor and verifying container overflow.
  - `[low]` `[reject]` `FolderEditor.vue` tab order does not match DOM panel order — rejected because all panels exist in DOM with `v-show`, original test suites rely on the panel DOM structure, and adding `role="tabpanel"` already fulfills accessible tabpanel requirements.
  - `[low]` `[reject]` `WarningBanner.vue` omits `xml` body type from GET request warning check — rejected because `WarningBanner.vue` was not modified in this story and GET body warning for XML is outside the scope of the 6 requested UI/UX fixes.

## Verification

**Commands:**
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run type-check` -- outcome: 0 errors.
- `source ~/.nvm/nvm.sh && nvm use && cd projects/frontend && bun run test` -- outcome: 46/46 files passed, 552/552 tests passed (100%).
- `cd projects && go test ./...` -- outcome: All packages passed.

## Auto Run Result

### Summary of implemented change
Đã xử lý triệt để 6 vấn đề UI/UX và lỗi hiển thị:
1. **XML Pretty & Syntax Highlight**: Module `xmlUtils.ts` chuẩn hóa XML parsing, validation kèm `{{var}}`, formatting có thụt lề, tô màu cú pháp theo theme và đánh số dòng; tích hợp vào `ResponseViewer.vue`, `JsonViewer.vue`, `BodyEditor.vue`, và `VariableHighlighter.vue`.
2. **Sub-toolbar ResponseViewer**: Đưa cụm `Pretty | Raw` và `Sao chép` xuống sub-toolbar bên dưới tab Body, tránh chật chội cho `ResponseMetaBar`.
3. **Đồng bộ Caret KvpEditor**: Đồng bộ `whitespace-pre-wrap break-all`, font, padding, line-height và `@paste` auto-resize giữa `<textarea>` và lớp overlay, đảm bảo con trỏ chuẩn xác 1:1 khi paste chuỗi dài/URL.
4. **Thu hẹp khoảng trống Body Editor**: Tối ưu khoảng cách dọc trong `RequestEditor.vue` (`space-y-3`, `p-3`) và `BodyEditor.vue` (`px-3 pt-0 pb-1`, `pb-8`), tối đa hóa diện tích soạn thảo body.
5. **Thứ tự Tab Folder**: Đổi thứ tự tablist trong `FolderEditor.vue` thành `Variables -> Auth -> Headers`, mặc định `activeTab = 'variables'`.
6. **Thanh cuộn AppTabBar**: Thêm class utility `.hide-scrollbar` toàn cục trong `style.css` và bổ sung `@wheel.passive` cuộn ngang có chuẩn hóa deltaMode và overflow check.

### Files changed with one-line descriptions
- `projects/frontend/src/utils/xmlUtils.ts`: Tiện ích XML parse, validate with placeholders, pretty format, HTML syntax highlighting, tokenize.
- `projects/frontend/src/utils/__tests__/xmlUtils.test.ts`: 21 unit tests kiểm thử toàn diện các tiện ích XML.
- `projects/frontend/src/components/ResponseViewer.vue`: Sub-toolbar Pretty/Raw & Copy, hỗ trợ Pretty/copy XML và bảo vệ oversized payload.
- `projects/frontend/src/components/__tests__/ResponseViewer.test.ts`: 6 unit tests cho sub-toolbar, copy Pretty XML và copy Pretty JSON.
- `projects/frontend/src/components/JsonViewer.vue`: Pretty XML có line numbers, escape HTML an toàn cho fallback.
- `projects/frontend/src/components/BodyEditor.vue`: Toolbar XML (Format XML, badge hợp lệ, banner lỗi), giảm padding đáy.
- `projects/frontend/src/components/__tests__/BodyEditor.test.ts`: 4 unit tests kiểm thử toolbar XML, format và overlay tokens.
- `projects/frontend/src/components/VariableHighlighter.vue`: Tô màu cú pháp XML (`syntax === 'xml'`) giữ nguyên highlight biến `{{var}}`.
- `projects/frontend/src/components/__tests__/VariableHighlighter.test.ts`: 14 unit tests kiểm thử highlight biến và token XML.
- `projects/frontend/src/components/KvpEditor.vue`: Đồng bộ `whitespace-pre-wrap break-all`, font, padding và resize khi paste.
- `projects/frontend/src/components/__tests__/KvpEditor.test.ts`: 6 unit tests cho KvpEditor.
- `projects/frontend/src/components/RequestEditor.vue`: Thu hẹp khoảng cách dọc giữa UrlBar, tabs và body editor.
- `projects/frontend/src/components/__tests__/RequestEditor.test.ts`: 14 unit tests cho RequestEditor.
- `projects/frontend/src/components/FolderEditor.vue`: Đổi thứ tự tablist thành Variables -> Auth -> Headers, default activeTab = variables.
- `projects/frontend/src/components/__tests__/FolderEditor.test.ts`: 16 unit tests cho FolderEditor.
- `projects/frontend/src/style.css`: Khai báo utility class toàn cục `.hide-scrollbar`.
- `projects/frontend/src/components/AppTabBar.vue`: Cuộn ngang bằng con lăn chuột chuẩn hóa deltaMode và overflow check.
- `projects/frontend/src/components/__tests__/AppTabBar.test.ts`: 6 unit tests cho AppTabBar.

### Review findings breakdown
- **Patches applied (18)**: ECH-1, ECH-2, ECH-3, ECH-4, ECH-5, ECH-6, VG-1, VG-2, VG-3, VG-4, BH-1, BH-2, BH-3, BH-4, BH-5, BH-6, BH-7, BH-8.
- **Items deferred (0)**.
- **Rejected findings (2)**: BH-9 (thứ tự DOM panel không cần thay đổi do dùng v-show và test hiện hữu), BH-10 (warning GET body XML là code có sẵn từ trước, ngoài phạm vi).

### Follow-up review recommendation
- `false` (18 bản vá đều là tinh chỉnh trực tiếp đã được kiểm thử tự động 100%).

### Verification performed
- `bun run type-check`: Passed (0 errors).
- `bun run test`: Passed 46/46 files, 552/552 tests (100%).
- `go test ./...`: All packages passed.

### Any residual risks
- Không có rủi ro tồn đọng. Tất cả thay đổi giữ nguyên trên working tree nhánh `develop` chưa commit theo đúng quy định an toàn Git.

# Epic 3 Context: HTTP Request Execution & Response Viewer

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Biến editor read-only của Epic 2 thành Request Builder chỉnh sửa được (method, URL, params, headers, body), gửi HTTP request thật qua Go (Ctrl+Enter / nút "Gửi"), hủy được khi đang gửi, và xem response đầy đủ: status code có màu, thời gian (ms), kích thước (B/KB), body JSON pretty có syntax highlight hoặc raw, bảng response headers. Lỗi kết nối/timeout/SSL hiển thị rõ ràng, app không crash hay đơ khi offline.

## Stories

- Story 3.1: URL Bar & Method Selector
- Story 3.2: KVP Editor for Params & Headers
- Story 3.3: Body Editor with Type Selector
- Story 3.4: Go HTTP Executor & Send/Cancel Flow
- Story 3.5: Response Meta Bar & Status Display
- Story 3.6: JSON Viewer with Syntax Highlighting & Raw Toggle
- Story 3.7: Response Headers Table & Error States
- Story 3.8: Epic 3 Deferred Work Cleanup

## Requirements & Constraints

- Method hỗ trợ: GET, POST, PUT, PATCH, DELETE. Mỗi method có màu riêng (GET emerald, POST blue, PUT orange, PATCH amber, DELETE red), luôn kèm text label (không chỉ dùng màu).
- Header/param bị disable không được gửi. Header enabled nhưng value rỗng vẫn được gửi. Params nối vào URL dạng `?key=value&key2=value2`; nếu URL đã có `?` thì nối bằng `&`.
- Body: None / JSON / Text. Chọn JSON → tự thêm `Content-Type: application/json` nếu user chưa tự đặt; header user đặt luôn thắng. GET + body ≠ None → warning banner, không chặn gửi.
- Response time và size luôn là integer. Size: `< 1024` → "N B", `≥ 1024` → "N KB" (chia nguyên). Không dùng MB, không đổi sang giây.
- Response body giới hạn 10MB; vượt thì truncate kèm warning. Response > 5MB: tắt Pretty, chỉ Raw, kèm message giải thích.
- Chỉ một request in-flight tại một thời điểm (Go enforce, Vue kiểm tra `loading` thêm).
- Mọi thay đổi trên form (method, URL, params, headers, body) đánh dấu request là dirty; Ctrl+S lưu.
- UI tiếng Việt; thuật ngữ kỹ thuật (method, status code, header key, JSON, URL, Body, Headers, Params) giữ tiếng Anh.
- Accessibility: focus ring visible, click target tối thiểu 32px (checkbox 24px), tab order Header → Sidebar → URL → Request tabs → content → Response; screen reader announce status khi response về.

## Technical Decisions

- **Ranh giới Go/Vue:** Vue resolve `{{variables}}`, lọc header/param enabled, encode params (`encodeURIComponent`, điểm encode duy nhất) và nối vào URL. Go nhận `ExecuteRequest{Method, URL, Headers []KVPair, Body string}` đã sẵn sàng, không lọc hay encode lại. File trên disk luôn lưu raw template.
- **Bindings mới:** `SendRequest(ExecuteRequest) → Result{ExecuteResponse}`, `AbortRequest() → Result{}`. `ExecuteResponse{StatusCode, StatusText, Headers map[string][]string, Body, TimeMs int, SizeBytes int, Timestamp}`.
- **Executor (Go service):** `net/http.Client`, context cancelable; `mu` + `inflight` + `cancelFn`. Lần gọi thứ hai khi đang in-flight → `VALIDATION`. Map lỗi: DNS/refused/TLS/redirect loop → `CONNECTION_ERROR`; context canceled → `ABORTED`; deadline exceeded → `TIMEOUT`. Đọc body qua `io.LimitReader(MaxResponseBodySize+1)`.
- **Model request trên disk:** `Request{ID, Name, Method, URL, Headers []KVPair, Params []KVPair, Body{Type, Content}, CreatedAt, UpdatedAt}`; `KVPair{Key, Value, Enabled}`.
- **Pinia:** `requestStore` giữ `original`/`current`, `isDirty` = deep compare sorted-key; form chỉ mutate `current`. `responseStore` giữ `response`, `error`, `loading`; actions `send`, `abort`, `clear`. `uiStore` giữ tab request/response đang active, toast.
- **Auto Content-Type:** không persist cờ auto-added; khi load từ disk re-derive (body JSON + header đúng `application/json` → coi là auto-added).
- **Xử lý lỗi trong UI:** `CONNECTION_ERROR`/`TIMEOUT` → full-pane error state trong response viewer + "Thử lại"; `ABORTED` → clear im lặng, giữ response cũ nếu có; `VALIDATION` (URL rỗng) → viền URL đỏ + toast; `NOT_FOUND`/`IO_ERROR` → toast.
- Component dự kiến dưới `components/request/` (UrlBar, RequestTabs, KvpEditor, BodyEditor, WarningBanner) và `components/response/` (ResponseViewer, ResponseMetaBar, JsonViewer, HeadersTable, PrettyRawToggle).

## UX & Interaction Patterns

- **URL bar:** container rounded-md có viền, focus ring brand-primary 50%. Method dropdown nền surface-overlay + border-right, chữ màu theo method. URL input mono-base, tắt ligature, placeholder "https://api.example.com/v1/...". Nút "Gửi" (brand-primary, icon paper-plane-right) ở cuối; khi loading đổi thành "Hủy" (nền error-bg, viền rose).
- **KVP editor:** grid 4 cột (checkbox 24px | Key | Value | Delete 32px), header "KEY"/"VALUE" ui-xs uppercase; row disable bị làm mờ; nút xóa hiện khi hover; luôn có ≥ 1 row trống, gõ vào row trống cuối tự thêm row; Tab đi key → value → key kế tiếp.
- **Request tabs:** Params (badge số key ≠ rỗng), Headers (badge), Body. Active: border-bottom brand-primary + text blue-400.
- **Body editor:** chip radio rounded-full None/JSON/Text; cột line number 40px; nội dung giữ nguyên khi đổi mode (kể cả qua None); None hiện "Request này không có body."
- **Response:** meta bar 52px (status badge tinted 10% + border 20% + dot 8px, glow cho 2xx; "N ms"; "N B/KB"; timestamp). Tabs Body / Headers (badge), active màu emerald. JSON viewer nền `#0b0f19`, line number 48px nền `#090d15`; Pretty/Raw toggle giữ scroll; nút Sao chép → toast "Đã sao chép".
- **Empty/loading:** chưa gửi → icon terminal-window + "Nhấn Gửi để xem kết quả phản hồi"; đang gửi → spinner trong response viewer.
- **Phím tắt:** Ctrl+Enter gửi, Ctrl+S lưu, Ctrl+L focus URL, Escape hủy/đóng lớp nổi gần nhất, Ctrl+C trong response viewer copy body.
- **Unsaved:** amber dot cạnh tên request, tooltip "Chưa lưu".

## Cross-Story Dependencies

- 3.1–3.3 làm editor chỉnh sửa được; 3.4 cần 3.1–3.3 để build `ExecuteRequest`; 3.5–3.7 cần 3.4 có response/error; 3.8 chờ 3.1–3.7.
- Biến `{{...}}` được resolve ở 3.4 nhưng engine substitution và environment thuộc Epic 4; trước Epic 4, gửi raw (không có env active).
- Từ retro Epic 2, phải xử lý trước hoặc trong story đầu tiên làm editor chỉnh sửa được: (a) đường xóa không hỏi khi request active đang dirty bị xóa (`selectRequest` cần bỏ qua guard unsaved, hoặc reset `current`/`original`); (b) quyết định vị trí amber dot (đang ở sidebar, spec 2.7 muốn trong editor); (c) import tĩnh `uiStore` + helper toast/try-catch chung trước khi thêm action store mới; (d) cần kiểm chứng thực cho unsaved-detection khi editor chỉnh sửa được.
- Convention message lỗi service (tiếng Việt, không lộ path) gom vào 3.8.

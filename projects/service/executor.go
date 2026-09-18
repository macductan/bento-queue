package service

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"hecto-api/model"
)

const (
	MaxResponseBodySize = 10 * 1024 * 1024 // 10MB
	DefaultTimeout      = 30 * time.Second
)

// ExecutorService handles HTTP request execution via net/http.
type ExecutorService struct {
	logger   *slog.Logger
	client   *http.Client
	timeout  time.Duration
	mu       sync.Mutex
	inflight bool
	cancelFn context.CancelFunc
}

// NewExecutorService creates a new ExecutorService.
func NewExecutorService(logger *slog.Logger) *ExecutorService {
	return &ExecutorService{
		logger: logger,
		client: &http.Client{
			// We don't set Timeout here because we use context timeout to distinguish errors.
		},
		timeout: DefaultTimeout,
	}
}

// SetTimeout allows tests to override the default timeout.
func (s *ExecutorService) SetTimeout(d time.Duration) {
	s.timeout = d
}

// Send executes an HTTP request and returns the response.
func (s *ExecutorService) Send(req model.ExecuteRequest) model.Result {
	s.logger.Info("SendRequest called", "method", req.Method, "url", req.URL)

	// Validate method
	method := strings.ToUpper(req.Method)
	switch method {
	case "GET", "POST", "PUT", "PATCH", "DELETE":
		// valid
	default:
		return model.NewError(model.ErrValidation, "Phương thức không hợp lệ")
	}

	// Validate URL
	if req.URL == "" {
		return model.NewError(model.ErrValidation, "URL không được để trống")
	}
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return model.NewError(model.ErrValidation, "URL không hợp lệ hoặc thiếu scheme (http/https)")
	}

	// Concurrency check
	s.mu.Lock()
	if s.inflight {
		s.mu.Unlock()
		return model.NewError(model.ErrValidation, "Request đang được gửi")
	}
	s.inflight = true

	ctx, cancel := context.WithTimeout(context.Background(), s.timeout)
	s.cancelFn = cancel
	s.mu.Unlock()

	defer func() {
		cancel()
		s.mu.Lock()
		s.inflight = false
		s.cancelFn = nil
		s.mu.Unlock()
	}()

	// Build request
	var bodyReader io.Reader
	if req.Body != "" {
		bodyReader = bytes.NewReader([]byte(req.Body))
	}
	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, bodyReader)
	if err != nil {
		return model.NewError(model.ErrValidation, fmt.Sprintf("Không thể tạo request: %v", err))
	}

	// Headers
	for _, kv := range req.Headers {
		if strings.EqualFold(kv.Key, "Host") {
			httpReq.Host = kv.Value
		} else {
			httpReq.Header.Add(kv.Key, kv.Value)
		}
	}

	// Send request
	startTime := time.Now()
	httpRes, err := s.client.Do(httpReq)
	if err != nil {
		switch {
		case errors.Is(ctx.Err(), context.Canceled):
			return model.NewError(model.ErrAborted, "Đã hủy")
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			return model.NewError(model.ErrTimeout, "Quá thời gian chờ (timeout)")
		default:
			if isTLSError(err) {
				return model.NewError(model.ErrConnection, fmt.Sprintf("Lỗi chứng chỉ SSL: %v", err))
			}
			return model.NewError(model.ErrConnection, fmt.Sprintf("Lỗi kết nối: %v", err))
		}
	}
	defer httpRes.Body.Close()

	// Read body with limit
	lr := io.LimitReader(httpRes.Body, MaxResponseBodySize+1)
	bodyBytes, err := io.ReadAll(lr)
	if err != nil {
		switch {
		case errors.Is(ctx.Err(), context.Canceled):
			return model.NewError(model.ErrAborted, "Đã hủy")
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			return model.NewError(model.ErrTimeout, "Quá thời gian chờ (timeout) khi đọc body")
		default:
			return model.NewError(model.ErrConnection, fmt.Sprintf("Lỗi khi đọc body: %v", err))
		}
	}

	truncated := false
	if len(bodyBytes) > MaxResponseBodySize {
		truncated = true
		bodyBytes = bodyBytes[:MaxResponseBodySize]
	}

	timeMs := time.Since(startTime).Milliseconds() // TimeMs measures from client.Do to end of body read

	contentType := strings.ToLower(httpRes.Header.Get("Content-Type"))
	isTextType := strings.HasPrefix(contentType, "text/") ||
		strings.Contains(contentType, "json") ||
		strings.Contains(contentType, "xml") ||
		strings.Contains(contentType, "javascript")

	isBinary := false
	if len(bodyBytes) > 0 {
		if bytes.IndexByte(bodyBytes, 0x00) != -1 || (!isTextType && !utf8.Valid(bodyBytes)) {
			isBinary = true
		}
	}

	var bodyStr string
	var sizeBytes int
	if isBinary {
		bodyStr = ""
		sizeBytes = len(bodyBytes)
	} else if len(bodyBytes) == 0 {
		bodyStr = ""
		sizeBytes = 0
	} else {
		bodyStr = strings.ToValidUTF8(string(bodyBytes), "\uFFFD")
		sizeBytes = len(bodyBytes)
	}

	// Build response
	resp := model.ExecuteResponse{
		StatusCode: httpRes.StatusCode,
		StatusText: strings.TrimPrefix(httpRes.Status, fmt.Sprintf("%d ", httpRes.StatusCode)),
		Headers:    httpRes.Header,
		Body:       bodyStr,
		TimeMs:     int(timeMs),
		SizeBytes:  sizeBytes,
		Timestamp:  startTime.Format(time.RFC3339),
		Truncated:  truncated,
		IsBinary:   isBinary,
	}

	return model.NewSuccess(resp)
}

// Abort cancels the current in-flight request.
func (s *ExecutorService) Abort() model.Result {
	s.logger.Info("AbortRequest called")
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.inflight && s.cancelFn != nil {
		s.cancelFn()
	}
	return model.NewSuccess(nil)
}

func isTLSError(err error) bool {
	var targetCertVerify *tls.CertificateVerificationError
	var targetUnknownAuth x509.UnknownAuthorityError
	var targetHostname x509.HostnameError
	var targetCertInvalid x509.CertificateInvalidError
	var targetRecordHeader tls.RecordHeaderError
	var targetAlert tls.AlertError

	return errors.As(err, &targetCertVerify) ||
		errors.As(err, &targetUnknownAuth) ||
		errors.As(err, &targetHostname) ||
		errors.As(err, &targetCertInvalid) ||
		errors.As(err, &targetRecordHeader) ||
		errors.As(err, &targetAlert)
}

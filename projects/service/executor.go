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
	"mime/multipart"
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

	// Validate method (support standard + custom HTTP token methods like HEAD, OPTIONS, PURGE, PROPFIND)
	method := strings.TrimSpace(strings.ToUpper(req.Method))
	if !isValidHTTPMethod(method) {
		return model.NewError(model.ErrValidation, ErrMethodInvalid)
	}

	// Validate URL
	if req.URL == "" {
		return model.NewError(model.ErrValidation, ErrURLEmpty)
	}
	u, err := url.Parse(req.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return model.NewError(model.ErrValidation, ErrURLInvalid)
	}

	// Concurrency check
	s.mu.Lock()
	if s.inflight {
		s.mu.Unlock()
		return model.NewError(model.ErrValidation, ErrRequestInProgress)
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
	var multipartContentType string
	if strings.EqualFold(req.BodyType, "formdata") || len(req.FormData) > 0 {
		var buf bytes.Buffer
		writer := multipart.NewWriter(&buf)
		for _, kv := range req.FormData {
			if strings.TrimSpace(kv.Key) == "" || !kv.Enabled {
				continue
			}
			if err := writer.WriteField(kv.Key, kv.Value); err != nil {
				return model.NewError(model.ErrValidation, fmt.Sprintf(ErrRequestCreateFailed, err))
			}
		}
		if err := writer.Close(); err != nil {
			return model.NewError(model.ErrValidation, fmt.Sprintf(ErrRequestCreateFailed, err))
		}
		bodyReader = bytes.NewReader(buf.Bytes())
		multipartContentType = writer.FormDataContentType()
	} else if req.Body != "" {
		bodyReader = bytes.NewReader([]byte(req.Body))
	}
	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, bodyReader)
	if err != nil {
		return model.NewError(model.ErrValidation, fmt.Sprintf(ErrRequestCreateFailed, err))
	}

	// Headers
	for _, kv := range req.Headers {
		if strings.EqualFold(kv.Key, "Host") {
			httpReq.Host = kv.Value
		} else {
			httpReq.Header.Add(kv.Key, kv.Value)
		}
	}
	if multipartContentType != "" {
		existingCT := strings.ToLower(strings.TrimSpace(httpReq.Header.Get("Content-Type")))
		if existingCT == "" || (strings.HasPrefix(existingCT, "multipart/form-data") && !strings.Contains(existingCT, "boundary=")) {
			httpReq.Header.Set("Content-Type", multipartContentType)
		}
	}

	// Send request
	startTime := time.Now()
	httpRes, err := s.client.Do(httpReq)
	if err != nil {
		switch {
		case errors.Is(ctx.Err(), context.Canceled):
			return model.NewError(model.ErrAborted, ErrAborted)
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			return model.NewError(model.ErrTimeout, ErrTimeout)
		default:
			if isTLSError(err) {
				return model.NewError(model.ErrConnection, fmt.Sprintf(ErrCertInvalid, err))
			}
			return model.NewError(model.ErrConnection, fmt.Sprintf(ErrConnectionFailed, err))
		}
	}
	defer httpRes.Body.Close()

	// Read body with limit
	lr := io.LimitReader(httpRes.Body, MaxResponseBodySize+1)
	bodyBytes, err := io.ReadAll(lr)
	if err != nil {
		switch {
		case errors.Is(ctx.Err(), context.Canceled):
			return model.NewError(model.ErrAborted, ErrAborted)
		case errors.Is(ctx.Err(), context.DeadlineExceeded):
			return model.NewError(model.ErrTimeout, ErrTimeoutBody)
		default:
			return model.NewError(model.ErrConnection, fmt.Sprintf(ErrBodyReadFailed, err))
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

func isValidHTTPMethod(method string) bool {
	if method == "" || len(method) > 32 {
		return false
	}
	for i := 0; i < len(method); i++ {
		c := method[i]
		isAlpha := c >= 'A' && c <= 'Z'
		isDigit := c >= '0' && c <= '9'
		if !isAlpha && !isDigit && c != '-' && c != '_' {
			return false
		}
	}
	return true
}


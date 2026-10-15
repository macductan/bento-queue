package service_test

import (
	"bytes"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"hecto-api/model"
	"hecto-api/service"
)

func newTestExecutor() *service.ExecutorService {
	logger := slog.New(slog.NewTextHandler(io.Discard, &slog.HandlerOptions{Level: slog.LevelError}))
	return service.NewExecutorService(logger)
}

func TestExecutorService_Send_OK(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("Expected POST, got %s", r.Method)
		}
		if r.Header.Get("X-A") != "1" {
			t.Errorf("Expected header X-A: 1")
		}
		if r.Host != "my-custom-host" {
			t.Errorf("Expected custom host, got %s", r.Host)
		}

		body, _ := io.ReadAll(r.Body)
		if string(body) != "test body" {
			t.Errorf("Expected 'test body', got %s", string(body))
		}

		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("response body"))
	}))
	defer ts.Close()

	exec := newTestExecutor()
	req := model.ExecuteRequest{
		Method: "POST",
		URL:    ts.URL,
		Headers: []model.KVPair{
			{Key: "X-A", Value: "1"},
			{Key: "Host", Value: "my-custom-host"},
		},
		Body: "test body",
	}

	res := exec.Send(req)
	if !res.Success {
		t.Fatalf("Expected success, got error: %v", res.Error)
	}

	resp := res.Data.(model.ExecuteResponse)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200 OK, got %d", resp.StatusCode)
	}
	if resp.Body != "response body" {
		t.Errorf("Expected 'response body', got %s", resp.Body)
	}
	if resp.Headers["Content-Type"][0] != "text/plain" {
		t.Errorf("Expected content-type text/plain")
	}
	if resp.TimeMs < 0 {
		t.Errorf("Expected time >= 0, got %d", resp.TimeMs)
	}
	if resp.SizeBytes != len("response body") {
		t.Errorf("Expected size %d, got %d", len("response body"), resp.SizeBytes)
	}
	if resp.Truncated {
		t.Errorf("Expected truncated=false")
	}
}

func TestExecutorService_Send_Validation(t *testing.T) {
	exec := newTestExecutor()

	tests := []struct {
		name string
		req  model.ExecuteRequest
	}{
		{"Empty Method", model.ExecuteRequest{Method: "", URL: "http://example.com"}},
		{"Invalid Method Token", model.ExecuteRequest{Method: "BAD METHOD!", URL: "http://example.com"}},
		{"Empty URL", model.ExecuteRequest{Method: "GET", URL: ""}},
		{"No Scheme", model.ExecuteRequest{Method: "GET", URL: "example.com"}},
		{"Invalid URL", model.ExecuteRequest{Method: "GET", URL: "http://\x00"}},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := exec.Send(tt.req)
			if res.Success {
				t.Errorf("Expected failure for %s", tt.name)
			}
			if res.Error.Code != model.ErrValidation {
				t.Errorf("Expected VALIDATION for %s, got %s", tt.name, res.Error.Code)
			}
		})
	}
}

func TestExecutorService_Send_CustomMethods(t *testing.T) {
	var receivedMethods []string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedMethods = append(receivedMethods, r.Method)
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	exec := newTestExecutor()
	for _, m := range []string{"HEAD", "OPTIONS", "PURGE", "PROPFIND"} {
		res := exec.Send(model.ExecuteRequest{Method: m, URL: ts.URL})
		if !res.Success {
			t.Fatalf("Expected success for method %s, got error: %v", m, res.Error)
		}
	}
	if len(receivedMethods) != 4 || receivedMethods[2] != "PURGE" {
		t.Errorf("Expected received methods [HEAD OPTIONS PURGE PROPFIND], got %v", receivedMethods)
	}
}

func TestExecutorService_Send_Inflight(t *testing.T) {
	started := make(chan struct{})
	finishHandler := make(chan struct{})
	var once sync.Once
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(started) })
		<-finishHandler
	}))
	defer ts.Close()

	exec := newTestExecutor()
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}

	errChan := make(chan *model.AppError)
	go func() {
		res := exec.Send(req)
		if !res.Success {
			errChan <- res.Error
		} else {
			errChan <- nil
		}
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("Timeout waiting for first request to reach server")
	}

	res2 := exec.Send(req)
	if res2.Success {
		t.Errorf("Expected failure for second request")
	}
	if res2.Error.Code != model.ErrValidation || res2.Error.Message != "Request đang được gửi" {
		t.Errorf("Expected inflight validation error, got %v", res2.Error)
	}

	close(finishHandler)
	<-errChan
}

func TestExecutorService_Abort(t *testing.T) {
	started := make(chan struct{})
	var once sync.Once
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		once.Do(func() { close(started) })
		<-r.Context().Done()
	}))
	defer ts.Close()

	exec := newTestExecutor()
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}

	resChan := make(chan model.Result)
	go func() {
		resChan <- exec.Send(req)
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("Timeout waiting for request to reach server")
	}

	abortRes := exec.Abort()
	if !abortRes.Success {
		t.Errorf("Abort failed")
	}

	res := <-resChan
	if res.Success {
		t.Fatalf("Expected error from aborted request")
	}
	if res.Error.Code != model.ErrAborted {
		t.Errorf("Expected ABORTED, got %s", res.Error.Code)
	}
}

func TestExecutorService_Timeout(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-r.Context().Done()
	}))
	defer ts.Close()

	exec := newTestExecutor()
	exec.SetTimeout(20 * time.Millisecond)
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}

	res := exec.Send(req)
	if res.Success {
		t.Errorf("Expected timeout error")
	}
	if res.Error.Code != model.ErrTimeout {
		t.Errorf("Expected TIMEOUT, got %s", res.Error.Code)
	}
}

func TestExecutorService_Refused(t *testing.T) {
	exec := newTestExecutor()
	exec.SetTimeout(1 * time.Second)
	req := model.ExecuteRequest{Method: "GET", URL: "http://127.0.0.1:1"}

	res := exec.Send(req)
	if res.Success {
		t.Errorf("Expected connection error")
	}
	if res.Error.Code != model.ErrConnection {
		t.Errorf("Expected CONNECTION_ERROR, got %s", res.Error.Code)
	}
	if !strings.Contains(res.Error.Message, "Lỗi kết nối") {
		t.Errorf("Expected Vietnamese message, got %s", res.Error.Message)
	}
}

func TestExecutorService_TLSError(t *testing.T) {
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	defer ts.Close()

	exec := newTestExecutor()
	exec.SetTimeout(1 * time.Second)
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}

	res := exec.Send(req)
	if res.Success {
		t.Errorf("Expected connection error")
	}
	if res.Error.Code != model.ErrConnection {
		t.Errorf("Expected CONNECTION_ERROR, got %s", res.Error.Code)
	}
	if !strings.HasPrefix(res.Error.Message, "Lỗi chứng chỉ SSL:") {
		t.Errorf("Expected SSL cert error message prefix, got %s", res.Error.Message)
	}
}

func TestExecutorService_Truncate(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		data := bytes.Repeat([]byte("A"), service.MaxResponseBodySize+10)
		w.Write(data)
	}))
	defer ts.Close()

	exec := newTestExecutor()
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}

	res := exec.Send(req)
	if !res.Success {
		t.Fatalf("Expected success, got error %v", res.Error)
	}

	resp := res.Data.(model.ExecuteResponse)
	if !resp.Truncated {
		t.Errorf("Expected truncated=true")
	}
	if resp.SizeBytes != service.MaxResponseBodySize {
		t.Errorf("Expected size to be capped at 10MB, got %d", resp.SizeBytes)
	}
	if len(resp.Body) != service.MaxResponseBodySize {
		t.Errorf("Expected body length to be capped at 10MB, got %d", len(resp.Body))
	}
}

func TestExecutorService_Redirect(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/" {
			http.Redirect(w, r, "/target", http.StatusFound)
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("target"))
	}))
	defer ts.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{Method: "GET", URL: ts.URL})
	if !res.Success {
		t.Fatalf("Expected success, got %v", res.Error)
	}
	resp := res.Data.(model.ExecuteResponse)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected 200, got %d", resp.StatusCode)
	}
}

func TestExecutorService_RedirectLoop(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/", http.StatusFound)
	}))
	defer ts.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{Method: "GET", URL: ts.URL})
	if res.Success {
		t.Fatalf("Expected failure")
	}
	if res.Error.Code != model.ErrConnection {
		t.Errorf("Expected CONNECTION_ERROR, got %s", res.Error.Code)
	}
}

func TestExecutorService_EmptyBody(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	defer ts.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{Method: "GET", URL: ts.URL})
	if !res.Success {
		t.Fatalf("Expected success, got %v", res.Error)
	}
	resp := res.Data.(model.ExecuteResponse)
	if resp.StatusCode != http.StatusNoContent {
		t.Errorf("Expected 204, got %d", resp.StatusCode)
	}
	if resp.Body != "" {
		t.Errorf("Expected empty body, got %s", resp.Body)
	}
	if resp.SizeBytes != 0 {
		t.Errorf("Expected size 0, got %d", resp.SizeBytes)
	}
	if resp.IsBinary {
		t.Errorf("Expected IsBinary=false")
	}
}

func TestExecutorService_NonUTF8Text(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=iso-8859-1")
		w.Write([]byte{0xff, 0xfe, 0xfd})
	}))
	defer ts.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{Method: "GET", URL: ts.URL})
	if !res.Success {
		t.Fatalf("Expected success, got %v", res.Error)
	}
	resp := res.Data.(model.ExecuteResponse)
	if resp.IsBinary {
		t.Errorf("Expected IsBinary=false")
	}
	if strings.Contains(resp.Body, "\ufffd") == false {
		t.Errorf("Expected replacement character in body")
	}
}

func TestExecutorService_Binary(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/png")
		w.Write([]byte{0x89, 0x50, 0x4e, 0x47})
	}))
	defer ts.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{Method: "GET", URL: ts.URL})
	if !res.Success {
		t.Fatalf("Expected success, got %v", res.Error)
	}
	resp := res.Data.(model.ExecuteResponse)
	if !resp.IsBinary {
		t.Errorf("Expected IsBinary=true")
	}
	if resp.Body != "" {
		t.Errorf("Expected empty body, got %s", resp.Body)
	}
	if resp.SizeBytes != 4 {
		t.Errorf("Expected size 4, got %d", resp.SizeBytes)
	}
}

func TestExecutorService_AbortDuringBody(t *testing.T) {
	started := make(chan struct{})
	var once sync.Once
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.(http.Flusher).Flush()
		once.Do(func() { close(started) })
		<-r.Context().Done()
	}))
	defer ts.Close()

	exec := newTestExecutor()
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}

	resChan := make(chan model.Result)
	go func() {
		resChan <- exec.Send(req)
	}()

	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("Timeout waiting for request to reach server")
	}

	abortRes := exec.Abort()
	if !abortRes.Success {
		t.Errorf("Abort failed")
	}

	res := <-resChan
	if res.Success {
		t.Fatalf("Expected error from aborted request")
	}
	if res.Error.Code != model.ErrAborted {
		t.Errorf("Expected ABORTED, got %s", res.Error.Code)
	}
}

func TestExecutorService_AbortAfterSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	exec := newTestExecutor()
	req := model.ExecuteRequest{Method: "GET", URL: ts.URL}
	res := exec.Send(req)
	if !res.Success {
		t.Fatalf("Expected success")
	}

	abortRes := exec.Abort()
	if !abortRes.Success {
		t.Errorf("Abort failed")
	}
}

func TestExecutorService_MultipartFormData(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct := r.Header.Get("Content-Type")
		if !strings.HasPrefix(ct, "multipart/form-data; boundary=") {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("missing multipart boundary: " + ct))
			return
		}
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("parse multipart error: " + err.Error()))
			return
		}
		user := r.FormValue("username")
		role := r.FormValue("role")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(user + ":" + role))
	}))
	defer srv.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{
		Method:   "POST",
		URL:      srv.URL,
		BodyType: "formdata",
		FormData: []model.KVPair{
			{Key: "username", Value: "alice", Enabled: true},
			{Key: "role", Value: "admin", Enabled: true},
			{Key: "ignored", Value: "no", Enabled: false},
		},
	})
	if !res.Success {
		t.Fatalf("Expected success, got error: %+v", res.Error)
	}
	resp := res.Data.(model.ExecuteResponse)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d (%s)", resp.StatusCode, resp.Body)
	}
	if resp.Body != "alice:admin" {
		t.Fatalf("Expected body 'alice:admin', got %q", resp.Body)
	}
}

func TestExecutorService_MultipartFormData_AllDisabled(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(1024 * 1024); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if len(r.MultipartForm.Value) > 0 {
			w.WriteHeader(http.StatusBadRequest)
			_, _ = w.Write([]byte("unexpected fields sent"))
			return
		}
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	}))
	defer srv.Close()

	exec := newTestExecutor()
	res := exec.Send(model.ExecuteRequest{
		Method:   "POST",
		URL:      srv.URL,
		BodyType: "formdata",
		FormData: []model.KVPair{
			{Key: "user", Value: "alice", Enabled: false},
			{Key: "pass", Value: "secret", Enabled: false},
		},
	})
	if !res.Success {
		t.Fatalf("Expected success, got error: %+v", res.Error)
	}
	resp := res.Data.(model.ExecuteResponse)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d (%s)", resp.StatusCode, resp.Body)
	}
}


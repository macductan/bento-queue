package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/storage"
)

const (
	mockConfigFileName = "mock-server.json"
	defaultMockPort    = 4010
	maxMockDelayMs     = 30000
)

// MockServerService manages the embedded local HTTP Mock Server per collection.
type MockServerService struct {
	mu             sync.RWMutex
	fs             *storage.FileSystem
	logger         *slog.Logger
	srv            *http.Server
	ln             net.Listener
	running        bool
	activePort     int
	activeCollRoot string
	activeRoutes   []model.MockRoute
}

// NewMockServerService creates a new MockServerService.
func NewMockServerService(fs *storage.FileSystem, logger *slog.Logger) *MockServerService {
	return &MockServerService{
		fs:           fs,
		logger:       logger,
		activePort:   defaultMockPort,
		activeRoutes: []model.MockRoute{},
	}
}

func (s *MockServerService) configPath(collRoot string) string {
	return filepath.Join(collRoot, mockConfigFileName)
}

func normalizeMockRoute(r model.MockRoute) model.MockRoute {
	if strings.TrimSpace(r.ID) == "" {
		r.ID = uuid.New().String()
	}
	r.Method = strings.ToUpper(strings.TrimSpace(r.Method))
	if r.Method == "" {
		r.Method = "GET"
	}
	r.Path = strings.TrimSpace(r.Path)
	if r.Path == "" {
		r.Path = "/"
	} else if !strings.HasPrefix(r.Path, "/") {
		r.Path = "/" + r.Path
	}
	if r.StatusCode <= 0 {
		r.StatusCode = http.StatusOK
	}
	if r.DelayMs < 0 {
		r.DelayMs = 0
	} else if r.DelayMs > maxMockDelayMs {
		r.DelayMs = maxMockDelayMs
	}
	if r.Headers == nil {
		r.Headers = []model.KVPair{}
	}
	return r
}

func (s *MockServerService) readConfigLocked(collRoot string) model.MockServerConfig {
	cfg := model.MockServerConfig{
		Port:   defaultMockPort,
		Routes: []model.MockRoute{},
	}
	if strings.TrimSpace(collRoot) == "" {
		return cfg
	}
	path := s.configPath(collRoot)
	if !s.fs.Exists(path) {
		return cfg
	}
	if err := s.fs.ReadJSON(path, &cfg); err != nil {
		s.logger.Warn("failed to read mock-server.json, using default", "path", path, "error", err)
		return model.MockServerConfig{
			Port:   defaultMockPort,
			Routes: []model.MockRoute{},
		}
	}
	if cfg.Port <= 0 {
		cfg.Port = defaultMockPort
	}
	if cfg.Routes == nil {
		cfg.Routes = []model.MockRoute{}
	}
	for i := range cfg.Routes {
		cfg.Routes[i] = normalizeMockRoute(cfg.Routes[i])
	}
	return cfg
}

func (s *MockServerService) statusLocked(collRoot string, cfg model.MockServerConfig) model.MockServerStatus {
	isRunning := s.running && (collRoot != "" && s.activeCollRoot == collRoot)
	port := cfg.Port
	if isRunning && s.activePort > 0 {
		port = s.activePort
	}
	if port <= 0 {
		port = defaultMockPort
	}
	return model.MockServerStatus{
		Running: isRunning,
		Port:    port,
		BaseURL: fmt.Sprintf("http://127.0.0.1:%d", port),
		Routes:  cfg.Routes,
	}
}

// GetStatus returns the current status and configured routes of the Mock Server.
func (s *MockServerService) GetStatus(collRoot string) model.Result {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cfg := s.readConfigLocked(collRoot)
	return model.NewSuccess(s.statusLocked(collRoot, cfg))
}

// SaveConfig validates and saves mock server configuration to <collRoot>/mock-server.json.
func (s *MockServerService) SaveConfig(collRoot string, cfg model.MockServerConfig) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if cfg.Port <= 0 {
		cfg.Port = defaultMockPort
	}
	if cfg.Routes == nil {
		cfg.Routes = []model.MockRoute{}
	}
	for i := range cfg.Routes {
		cfg.Routes[i] = normalizeMockRoute(cfg.Routes[i])
	}

	if err := s.fs.WriteJSON(s.configPath(collRoot), cfg); err != nil {
		s.logger.Error("failed to save mock-server.json", "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu cấu hình Mock Server")
	}

	if s.running {
		s.activeRoutes = append([]model.MockRoute(nil), cfg.Routes...)
	}

	return model.NewSuccess(s.statusLocked(collRoot, cfg))
}

// Start launches the local HTTP Mock Server on 127.0.0.1:<port>.
// Passing port == 0 binds to an ephemeral free port (useful for automated tests).
func (s *MockServerService) Start(collRoot string, port int) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	s.stopLocked()

	cfg := s.readConfigLocked(collRoot)
	listenPort := cfg.Port
	if port > 0 {
		listenPort = port
		cfg.Port = port
		_ = s.fs.WriteJSON(s.configPath(collRoot), cfg)
	} else if port == 0 {
		listenPort = 0
	}

	addr := fmt.Sprintf("127.0.0.1:%d", listenPort)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		s.logger.Error("failed to bind mock server port", "addr", addr, "error", err)
		return model.NewError(model.ErrIO, fmt.Sprintf("Không thể mở cổng %d cho Mock Server: %v", listenPort, err))
	}

	actualPort := listenPort
	if tcpAddr, ok := ln.Addr().(*net.TCPAddr); ok {
		actualPort = tcpAddr.Port
	}

	s.activeCollRoot = collRoot
	s.activePort = actualPort
	s.activeRoutes = append([]model.MockRoute(nil), cfg.Routes...)
	s.ln = ln
	s.srv = &http.Server{
		Handler: http.HandlerFunc(s.handleHTTP),
	}
	s.running = true

	go func(srv *http.Server, listener net.Listener) {
		if serveErr := srv.Serve(listener); serveErr != nil && serveErr != http.ErrServerClosed {
			s.logger.Warn("mock server stopped with error", "error", serveErr)
		}
	}(s.srv, ln)

	return model.NewSuccess(s.statusLocked(collRoot, cfg))
}

func (s *MockServerService) stopLocked() {
	if s.srv != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		_ = s.srv.Shutdown(ctx)
		s.srv = nil
	}
	if s.ln != nil {
		_ = s.ln.Close()
		s.ln = nil
	}
	s.running = false
	s.activeCollRoot = ""
}

// Stop gracefully shuts down the running local HTTP Mock Server.
func (s *MockServerService) Stop(collRoot string) model.Result {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.stopLocked()
	cfg := s.readConfigLocked(collRoot)
	return model.NewSuccess(s.statusLocked(collRoot, cfg))
}

func cleanURLPath(p string) string {
	p = strings.TrimSpace(p)
	if idx := strings.Index(p, "?"); idx >= 0 {
		p = p[:idx]
	}
	if p == "" {
		return "/"
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if len(p) > 1 {
		p = strings.TrimRight(p, "/")
	}
	return p
}

func matchMockPath(pattern, actual string) bool {
	pat := cleanURLPath(pattern)
	act := cleanURLPath(actual)
	if pat == act {
		return true
	}
	patSegs := strings.Split(strings.Trim(pat, "/"), "/")
	actSegs := strings.Split(strings.Trim(act, "/"), "/")
	if len(patSegs) != len(actSegs) {
		return false
	}
	for i := range patSegs {
		ps := patSegs[i]
		as := actSegs[i]
		if strings.HasPrefix(ps, ":") || ps == "*" {
			if as == "" {
				return false
			}
			continue
		}
		if ps != as {
			return false
		}
	}
	return true
}

func (s *MockServerService) findMatchingRoute(method, urlPath string) (*model.MockRoute, bool) {
	s.mu.RLock()
	routes := append([]model.MockRoute(nil), s.activeRoutes...)
	s.mu.RUnlock()

	reqMethod := strings.ToUpper(strings.TrimSpace(method))
	for i := range routes {
		rt := routes[i]
		if !rt.Enabled {
			continue
		}
		methodMatch := strings.EqualFold(rt.Method, "ANY") || strings.EqualFold(rt.Method, reqMethod)
		if !methodMatch {
			continue
		}
		if matchMockPath(rt.Path, urlPath) {
			return &rt, true
		}
	}
	return nil, false
}

func (s *MockServerService) handleHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD")
	w.Header().Set("Access-Control-Allow-Headers", "*")

	route, ok := s.findMatchingRoute(r.Method, r.URL.Path)
	if !ok {
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{
			"error":  "MOCK_ROUTE_NOT_FOUND",
			"method": r.Method,
			"path":   r.URL.Path,
		})
		return
	}

	if route.DelayMs > 0 {
		select {
		case <-time.After(time.Duration(route.DelayMs) * time.Millisecond):
		case <-r.Context().Done():
			return
		}
	}

	hasContentType := false
	for _, h := range route.Headers {
		if !h.Enabled || strings.TrimSpace(h.Key) == "" {
			continue
		}
		if strings.EqualFold(strings.TrimSpace(h.Key), "content-type") {
			hasContentType = true
		}
		w.Header().Set(strings.TrimSpace(h.Key), h.Value)
	}
	if !hasContentType {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
	}

	statusCode := route.StatusCode
	if statusCode <= 0 {
		statusCode = http.StatusOK
	}
	w.WriteHeader(statusCode)
	_, _ = w.Write([]byte(route.Body))
}

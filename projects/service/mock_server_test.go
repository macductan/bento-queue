package service

import (
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

func TestMockServerService_LifecycleAndRouting(t *testing.T) {
	collRoot := t.TempDir()
	fs := storage.NewFileSystem()
	svc := NewMockServerService(fs, slog.Default())
	t.Cleanup(func() {
		svc.Stop(collRoot)
	})

	// Save routes
	cfg := model.MockServerConfig{
		Port: 4010,
		Routes: []model.MockRoute{
			{
				ID:         "route-1",
				Method:     "GET",
				Path:       "/api/users/:id",
				StatusCode: 200,
				Headers: []model.KVPair{
					{Key: "X-Mock-Source", Value: "hecto-mock", Enabled: true},
				},
				Body:    `{"id":42,"name":"Mock User"}`,
				Enabled: true,
			},
			{
				ID:         "route-2",
				Method:     "POST",
				Path:       "/api/orders",
				StatusCode: 201,
				Body:       `{"created":true}`,
				Enabled:    true,
			},
		},
	}

	saveRes := svc.SaveConfig(collRoot, cfg)
	if !saveRes.Success {
		t.Fatalf("SaveConfig failed: %+v", saveRes.Error)
	}

	// Start on ephemeral port 0
	startRes := svc.Start(collRoot, 0)
	if !startRes.Success {
		t.Fatalf("Start failed: %+v", startRes.Error)
	}
	status := startRes.Data.(model.MockServerStatus)
	if !status.Running || status.Port <= 0 {
		t.Fatalf("expected running server with port > 0, got %+v", status)
	}

	// 1. Test dynamic parameter route GET /api/users/42
	resp, err := http.Get(status.BaseURL + "/api/users/42")
	if err != nil {
		t.Fatalf("GET /api/users/42 failed: %v", err)
	}
	defer resp.Body.Close()
	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Errorf("expected status 200, got %d", resp.StatusCode)
	}
	if resp.Header.Get("X-Mock-Source") != "hecto-mock" {
		t.Errorf("expected X-Mock-Source=hecto-mock, got %s", resp.Header.Get("X-Mock-Source"))
	}
	if string(bodyBytes) != `{"id":42,"name":"Mock User"}` {
		t.Errorf("unexpected body: %s", string(bodyBytes))
	}

	// 2. Test POST /api/orders
	postResp, err := http.Post(status.BaseURL+"/api/orders", "application/json", strings.NewReader(`{}`))
	if err != nil {
		t.Fatalf("POST /api/orders failed: %v", err)
	}
	defer postResp.Body.Close()
	if postResp.StatusCode != 201 {
		t.Errorf("expected status 201, got %d", postResp.StatusCode)
	}

	// 3. Test unmatched route -> 404 MOCK_ROUTE_NOT_FOUND
	notFoundResp, err := http.Get(status.BaseURL + "/api/unknown")
	if err != nil {
		t.Fatalf("GET /api/unknown failed: %v", err)
	}
	defer notFoundResp.Body.Close()
	nfBytes, _ := io.ReadAll(notFoundResp.Body)
	if notFoundResp.StatusCode != 404 {
		t.Errorf("expected status 404, got %d", notFoundResp.StatusCode)
	}
	if !strings.Contains(string(nfBytes), "MOCK_ROUTE_NOT_FOUND") {
		t.Errorf("expected MOCK_ROUTE_NOT_FOUND in 404 body, got %s", string(nfBytes))
	}

	// 4. Stop server
	stopRes := svc.Stop(collRoot)
	if !stopRes.Success {
		t.Fatalf("Stop failed: %+v", stopRes.Error)
	}
	stoppedStatus := stopRes.Data.(model.MockServerStatus)
	if stoppedStatus.Running {
		t.Errorf("expected server to be stopped")
	}
}

func TestMockServerService_CollectionIsolation(t *testing.T) {
	collRoot1 := t.TempDir()
	collRoot2 := t.TempDir()
	fs := storage.NewFileSystem()
	svc := NewMockServerService(fs, slog.Default())
	t.Cleanup(func() {
		svc.Stop(collRoot1)
	})

	startRes := svc.Start(collRoot1, 0)
	if !startRes.Success {
		t.Fatalf("Start failed: %+v", startRes.Error)
	}

	// Status for collRoot1 should be running
	st1Res := svc.GetStatus(collRoot1)
	if !st1Res.Success {
		t.Fatalf("GetStatus collRoot1 failed: %+v", st1Res.Error)
	}
	st1 := st1Res.Data.(model.MockServerStatus)
	if !st1.Running {
		t.Errorf("expected collRoot1 to be running")
	}

	// Status for collRoot2 should NOT be running
	st2Res := svc.GetStatus(collRoot2)
	if !st2Res.Success {
		t.Fatalf("GetStatus collRoot2 failed: %+v", st2Res.Error)
	}
	st2 := st2Res.Data.(model.MockServerStatus)
	if st2.Running {
		t.Errorf("expected collRoot2 NOT to be running, but got running=true")
	}

	// Stop collRoot1
	svc.Stop(collRoot1)
	st1After := svc.GetStatus(collRoot1).Data.(model.MockServerStatus)
	if st1After.Running {
		t.Errorf("expected collRoot1 to be stopped")
	}
}

func TestMockServerService_CleanMockPathAndReloadRoutes(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", "/"},
		{"/", "/"},
		{"///", "/"},
		{"api/users", "/api/users"},
		{"/api/users/", "/api/users"},
		{" /api/users/:id/?foo=bar ", "/api/users/:id"},
	}
	for _, tc := range cases {
		if got := CleanMockPath(tc.in); got != tc.want {
			t.Errorf("CleanMockPath(%q) = %q, want %q", tc.in, got, tc.want)
		}
	}

	collRoot := t.TempDir()
	fs := storage.NewFileSystem()
	svc := NewMockServerService(fs, slog.Default())
	t.Cleanup(func() {
		svc.Stop(collRoot)
	})

	startRes := svc.Start(collRoot, 0)
	if !startRes.Success {
		t.Fatalf("Start failed: %+v", startRes.Error)
	}
	status := startRes.Data.(model.MockServerStatus)

	// Write mock-server.json externally using another FileSystem instance
	extFS := storage.NewFileSystem()
	cfgPath := svc.configPath(collRoot)
	newCfg := model.MockServerConfig{
		Port: 4010,
		Routes: []model.MockRoute{
			{
				ID:         "hot-1",
				Method:     "ANY",
				Path:       "/api/reloaded/:item",
				StatusCode: 202,
				Body:       `{"reloaded":true}`,
				Enabled:    true,
			},
		},
	}
	if err := extFS.WriteJSON(cfgPath, newCfg); err != nil {
		t.Fatalf("external WriteJSON failed: %v", err)
	}
	infoBefore, err := os.Stat(cfgPath)
	if err != nil {
		t.Fatalf("stat failed: %v", err)
	}

	reloadRes := svc.ReloadRoutes(collRoot)
	if !reloadRes.Success {
		t.Fatalf("ReloadRoutes failed: %+v", reloadRes.Error)
	}
	infoAfter, err := os.Stat(cfgPath)
	if err != nil {
		t.Fatalf("stat after reload failed: %v", err)
	}
	if !infoAfter.ModTime().Equal(infoBefore.ModTime()) {
		t.Errorf("ReloadRoutes modified mock-server.json on disk")
	}

	resp, err := http.Get(status.BaseURL + "/api/reloaded/abc")
	if err != nil {
		t.Fatalf("GET after ReloadRoutes failed: %v", err)
	}
	_ = resp.Body.Close()
	if resp.StatusCode != 202 {
		t.Errorf("expected status 202 after ReloadRoutes, got %d", resp.StatusCode)
	}

	// Empty collRoot -> VALIDATION
	if emptyRes := svc.ReloadRoutes("   "); emptyRes.Success || emptyRes.Error == nil || emptyRes.Error.Code != model.ErrValidation {
		t.Errorf("expected VALIDATION for empty collRoot in ReloadRoutes, got %+v", emptyRes)
	}

	// Cross-collection isolation: ReloadRoutes on collRoot2 must not affect collRoot1
	collRoot2 := t.TempDir()
	if err := extFS.WriteJSON(svc.configPath(collRoot2), model.MockServerConfig{
		Port: 4099,
		Routes: []model.MockRoute{
			{ID: "other-1", Method: "GET", Path: "/other", StatusCode: 200, Enabled: true},
		},
	}); err != nil {
		t.Fatal(err)
	}
	otherReload := svc.ReloadRoutes(collRoot2)
	if !otherReload.Success || otherReload.Data.(model.MockServerStatus).Running {
		t.Errorf("expected ReloadRoutes on inactive collRoot2 to keep running=false, got %+v", otherReload)
	}
	respKeep, err := http.Get(status.BaseURL + "/api/reloaded/abc")
	if err != nil {
		t.Fatalf("GET after inactive collRoot2 ReloadRoutes failed: %v", err)
	}
	_ = respKeep.Body.Close()
	if respKeep.StatusCode != 202 {
		t.Errorf("expected collRoot1 activeRoutes preserved, got status %d", respKeep.StatusCode)
	}

	// Uncleaned & relative collRoot matching in GetStatus and ReloadRoutes
	uncleanedRoot := filepath.Join(collRoot, "sub", "..")
	uncleanedStatus := svc.GetStatus(uncleanedRoot).Data.(model.MockServerStatus)
	if !uncleanedStatus.Running {
		t.Errorf("expected GetStatus(%q) to report running=true", uncleanedRoot)
	}
	t.Chdir(filepath.Dir(collRoot))
	relRoot := "." + string(filepath.Separator) + filepath.Base(collRoot)
	relStatus := svc.GetStatus(relRoot).Data.(model.MockServerStatus)
	if !relStatus.Running {
		t.Errorf("expected GetStatus(%q) to report running=true", relRoot)
	}
	if err := extFS.WriteJSON(cfgPath, model.MockServerConfig{
		Port: 4010,
		Routes: []model.MockRoute{
			{ID: "hot-rel", Method: "GET", Path: "/api/rel", StatusCode: 203, Enabled: true},
		},
	}); err != nil {
		t.Fatal(err)
	}
	if relReload := svc.ReloadRoutes(relRoot); !relReload.Success || !relReload.Data.(model.MockServerStatus).Running {
		t.Fatalf("ReloadRoutes with relative collRoot failed: %+v", relReload)
	}
	respRel, err := http.Get(status.BaseURL + "/api/rel")
	if err != nil {
		t.Fatalf("GET /api/rel failed: %v", err)
	}
	_ = respRel.Body.Close()
	if respRel.StatusCode != 203 {
		t.Errorf("expected status 203 after relative ReloadRoutes, got %d", respRel.StatusCode)
	}

	// Transient malformed JSON on disk must preserve activeRoutes
	if err := os.WriteFile(cfgPath, []byte(`{malformed-json`), 0644); err != nil {
		t.Fatal(err)
	}
	malformedReload := svc.ReloadRoutes(collRoot)
	if !malformedReload.Success {
		t.Fatalf("expected ReloadRoutes on malformed JSON to succeed preserving routes, got %+v", malformedReload)
	}
	respPreserved, err := http.Get(status.BaseURL + "/api/rel")
	if err != nil {
		t.Fatalf("GET /api/rel after malformed reload failed: %v", err)
	}
	_ = respPreserved.Body.Close()
	if respPreserved.StatusCode != 203 {
		t.Errorf("expected preserved route status 203 on transient malformed JSON, got %d", respPreserved.StatusCode)
	}
}

func TestMockServerService_StartBusyPortDoesNotOverwriteConfig(t *testing.T) {
	collRoot := t.TempDir()
	fs := storage.NewFileSystem()
	svc := NewMockServerService(fs, slog.Default())

	saveRes := svc.SaveConfig(collRoot, model.MockServerConfig{
		Port:   4015,
		Routes: []model.MockRoute{},
	})
	if !saveRes.Success {
		t.Fatalf("SaveConfig failed: %+v", saveRes.Error)
	}

	busyLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busyLn.Close()
	busyPort := busyLn.Addr().(*net.TCPAddr).Port

	startRes := svc.Start(collRoot, busyPort)
	if startRes.Success || startRes.Error == nil || startRes.Error.Code != model.ErrIO {
		t.Fatalf("expected ErrIO when starting on busy port %d, got %+v", busyPort, startRes)
	}

	var onDisk model.MockServerConfig
	if err := fs.ReadJSON(svc.configPath(collRoot), &onDisk); err != nil {
		t.Fatalf("failed reading mock-server.json: %v", err)
	}
	if onDisk.Port != 4015 {
		t.Errorf("expected mock-server.json port to remain 4015 on listen failure, got %d", onDisk.Port)
	}
}

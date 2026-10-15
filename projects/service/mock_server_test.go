package service

import (
	"io"
	"log/slog"
	"net/http"
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

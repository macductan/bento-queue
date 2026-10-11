package service_test

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

func setupRequestService(t *testing.T) (*service.RequestService, *storage.FileSystem, string) {
	root := t.TempDir()
	fs := storage.NewFileSystem()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	return service.NewRequestService(fs, logger), fs, root
}

func TestRequestDelete_RemovesFileAndIndex(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "R", "GET"))
	fs.IndexSet("r1", path)

	if res := svc.Delete("r1"); !res.Success {
		t.Fatalf("expected success, got %v", res.Error)
	}
	if fs.Exists(path) {
		t.Error("request file should be removed")
	}
	if _, err := fs.FindByUUID("r1"); err == nil {
		t.Error("index entry should be removed")
	}
}

func TestRequestDelete_RejectsFolderUUID(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	dir := filepath.Join(root, "f1")
	fs.MakeDir(dir)
	fs.WriteJSON(filepath.Join(dir, "_folder.json"), model.Folder{ID: "f1", Name: "F1"})
	fs.IndexSet("f1", dir)

	res := svc.Delete("f1")
	if res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
		t.Fatalf("expected ErrValidation, got %+v", res)
	}
	if !fs.Exists(dir) {
		t.Error("folder must not be deleted via DeleteRequest")
	}
}

func TestRequestDelete_NotFound(t *testing.T) {
	svc, _, _ := setupRequestService(t)
	res := svc.Delete("missing")
	if res.Success || res.Error == nil || res.Error.Code != model.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %+v", res)
	}
}

func TestRequestDuplicate_Success(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "Login", "POST"))
	fs.IndexSet("r1", path)

	res := svc.Duplicate("r1")
	if !res.Success {
		t.Fatalf("expected success, got %v", res.Error)
	}

	req, ok := res.Data.(model.Request)
	if !ok {
		t.Fatalf("expected Request data")
	}

	if req.ID == "r1" {
		t.Errorf("expected new UUID, got %s", req.ID)
	}
	if req.Name != "Login (bản sao)" {
		t.Errorf("expected duplicated name, got %s", req.Name)
	}

	// It should create a new file
	newPath, err := fs.FindByUUID(req.ID)
	if err != nil {
		t.Fatalf("new UUID not in index")
	}
	if filepath.Base(newPath) != "login-ban-sao.json" {
		t.Errorf("expected filename login-ban-sao.json, got %s", filepath.Base(newPath))
	}
	if !fs.Exists(newPath) {
		t.Errorf("file should exist at %s", newPath)
	}
}

func TestRequestDelete_LostFile(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "", ""))
	fs.IndexSet("r1", path)

	// Xóa ngoài app
	os.Remove(path)

	res := svc.Delete("r1")
	if res.Success || res.Error == nil || res.Error.Code != model.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %+v", res)
	}

	if _, err := fs.FindByUUID("r1"); err == nil {
		t.Error("index entry should be removed")
	}
}

func TestRequestSave_LostFile(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "", ""))
	fs.IndexSet("r1", path)

	// Xóa ngoài app
	os.Remove(path)

	res := svc.Save(model.Request{ID: "r1", Name: "Updated"})
	if res.Success || res.Error == nil || res.Error.Code != model.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %+v", res)
	}

	if fs.Exists(path) {
		t.Error("Save should not recreate lost file")
	}
}

func TestRequestGet_ParseError(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	os.WriteFile(path, []byte("{invalid json}"), 0644)
	fs.IndexSet("r1", path)

	res := svc.Get("r1")
	if res.Success || res.Error == nil || res.Error.Code != model.ErrParse {
		t.Fatalf("expected ErrParse, got %+v", res)
	}
}

func TestRequestRename_Success(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "Old", ""))
	fs.IndexSet("r1", path)

	res := svc.Rename("r1", "New")
	if !res.Success {
		t.Fatalf("expected success, got %+v", res.Error)
	}

	var req model.Request
	fs.ReadJSON(path, &req)
	if req.Name != "New" {
		t.Errorf("expected name New, got %s", req.Name)
	}
}

func TestRequestRename_Validation(t *testing.T) {
	svc, _, _ := setupRequestService(t)

	res := svc.Rename("r1", "   ")
	if res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
		t.Fatalf("expected ErrValidation for empty name, got %+v", res)
	}
}

func TestRequestRename_Truncate(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "Old", ""))
	fs.IndexSet("r1", path)

	longName := strings.Repeat("A", 300)

	res := svc.Rename("r1", longName)
	if !res.Success {
		t.Fatalf("expected success, got %+v", res.Error)
	}

	var req model.Request
	fs.ReadJSON(path, &req)
	if len([]rune(req.Name)) != 255 {
		t.Errorf("expected 255 runes, got %d", len([]rune(req.Name)))
	}
}

func TestRequestSaveAndGet_Auth(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	fs.WriteJSON(path, createTestRequest("r1", "Req Auth", "GET"))
	fs.IndexSet("r1", path)

	// Save request with Bearer Auth
	bearerReq := createTestRequest("r1", "Req Auth", "GET")
	bearerReq.Auth = &model.AuthConfig{
		Type: "bearer",
		Bearer: &model.BearerAuth{
			Token: "test-token-123",
		},
	}

	saveRes := svc.Save(bearerReq)
	if !saveRes.Success {
		t.Fatalf("expected Save success, got %+v", saveRes.Error)
	}

	// Verify Get restores Auth
	getRes := svc.Get("r1")
	if !getRes.Success {
		t.Fatalf("expected Get success, got %+v", getRes.Error)
	}

	loadedReq, ok := getRes.Data.(model.Request)
	if !ok {
		t.Fatalf("expected model.Request data")
	}

	if loadedReq.Auth == nil {
		t.Fatalf("expected loadedReq.Auth not nil")
	}
	if loadedReq.Auth.Type != "bearer" {
		t.Errorf("expected bearer, got %s", loadedReq.Auth.Type)
	}
	if loadedReq.Auth.Bearer == nil || loadedReq.Auth.Bearer.Token != "test-token-123" {
		t.Errorf("expected token 'test-token-123', got %+v", loadedReq.Auth.Bearer)
	}
	if loadedReq.UpdatedAt.IsZero() {
		t.Errorf("expected UpdatedAt to be set upon Save")
	}
}

func TestRequestDuplicate_PreservesAuth(t *testing.T) {
	svc, fs, root := setupRequestService(t)
	path := filepath.Join(root, "r.json")
	req := createTestRequest("r1", "Original", "POST")
	req.Auth = &model.AuthConfig{
		Type: "basic",
		Basic: &model.BasicAuth{
			Username: "admin",
			Password: "secretpassword",
		},
	}
	fs.WriteJSON(path, req)
	fs.IndexSet("r1", path)

	dupRes := svc.Duplicate("r1")
	if !dupRes.Success {
		t.Fatalf("expected Duplicate success, got %+v", dupRes.Error)
	}

	dupReq, ok := dupRes.Data.(model.Request)
	if !ok {
		t.Fatalf("expected model.Request data")
	}

	if dupReq.Auth == nil {
		t.Fatalf("expected dupReq.Auth not nil")
	}
	if dupReq.Auth.Type != "basic" {
		t.Errorf("expected basic, got %s", dupReq.Auth.Type)
	}
	if dupReq.Auth.Basic == nil || dupReq.Auth.Basic.Username != "admin" || dupReq.Auth.Basic.Password != "secretpassword" {
		t.Errorf("expected basic auth credentials preserved, got %+v", dupReq.Auth.Basic)
	}
}

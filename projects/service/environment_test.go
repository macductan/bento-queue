package service

import (
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

func TestEnvironmentService_CRUD(t *testing.T) {
	root := t.TempDir()
	fs := storage.NewFileSystem()
	os.MkdirAll(filepath.Join(root, "environments"), 0755)
	
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	svc := NewEnvironmentService(fs, logger)

	// List empty
	listRes := svc.List(root)
	if !listRes.Success || len(listRes.Data.([]model.Environment)) != 0 {
		t.Fatalf("expected empty list, got %v", listRes.Data)
	}

	// Save
	env := model.Environment{Name: "Test Env"}
	result := svc.Save(root, env)
	if !result.Success {
		t.Fatalf("expected success, got error: %v", result.Error)
	}

	savedEnv := result.Data.(model.Environment)
	if savedEnv.ID == "" {
		t.Fatalf("expected ID to be generated")
	}
	if savedEnv.CreatedAt.IsZero() || savedEnv.UpdatedAt.IsZero() {
		t.Fatalf("expected timestamps to be set, got %v, %v", savedEnv.CreatedAt, savedEnv.UpdatedAt)
	}

	// Get
	gotResult := svc.Get(root, savedEnv.ID)
	if !gotResult.Success {
		t.Fatalf("expected to get saved env, got %v", gotResult.Error)
	}

	// List
	listRes = svc.List(root)
	if !listRes.Success || len(listRes.Data.([]model.Environment)) != 1 {
		t.Fatalf("expected 1 item, got %v", listRes.Data)
	}

	// Delete
	delRes := svc.Delete(root, savedEnv.ID)
	if !delRes.Success {
		t.Fatalf("expected success deleting, got %v", delRes.Error)
	}

	// Get after delete
	gotResult = svc.Get(root, savedEnv.ID)
	if gotResult.Success {
		t.Fatalf("expected error getting deleted env")
	}
}

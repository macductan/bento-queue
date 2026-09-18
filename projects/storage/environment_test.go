package storage

import (
	"path/filepath"
	"testing"
	"time"

	"hecto-api/model"
)

func TestEnvironmentStorage_CRUD(t *testing.T) {
	root, fs := setupCollectionTree(t)

	// 1. List
	envs, err := fs.ListEnvironments(root)
	if err != nil {
		t.Fatalf("expected no error listing envs, got %v", err)
	}
	_ = envs

	// 2. Create new Env (Tạo Env mới)
	env1 := model.Environment{
		ID:        "env-1-id",
		Name:      "Môi trường mới",
		Variables: []model.KVPair{},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := fs.SaveEnvironment(root, env1); err != nil {
		t.Fatalf("failed to save env1: %v", err)
	}

	path1 := filepath.Join(root, "environments", "moi-truong-moi.json")
	if !fs.Exists(path1) {
		t.Fatalf("expected file %s to exist", path1)
	}

	// 3. Create another with same slug (Trùng filename lúc tạo)
	env2 := model.Environment{
		ID:        "env-2-id",
		Name:      "Môi trường mới",
		Variables: []model.KVPair{},
	}
	if err := fs.SaveEnvironment(root, env2); err != nil {
		t.Fatalf("failed to save env2: %v", err)
	}

	path2 := filepath.Join(root, "environments", "moi-truong-moi-1.json")
	if !fs.Exists(path2) {
		t.Fatalf("expected file %s to exist for duplicate name", path2)
	}

	env3 := model.Environment{ID: "env-3-id", Name: "Môi trường mới"}
	if err := fs.SaveEnvironment(root, env3); err != nil {
		t.Fatalf("failed to save env3: %v", err)
	}
	path3 := filepath.Join(root, "environments", "moi-truong-moi-2.json")
	if !fs.Exists(path3) {
		t.Fatalf("expected file %s to exist for 2nd duplicate name", path3)
	}

	// 3.5 Create empty name env
	envEmpty := model.Environment{ID: "env-empty-id", Name: ""}
	if err := fs.SaveEnvironment(root, envEmpty); err != nil {
		t.Fatalf("failed to save empty env: %v", err)
	}
	pathEmpty := filepath.Join(root, "environments", "env.json")
	if !fs.Exists(pathEmpty) {
		t.Fatalf("expected file %s to exist for empty name", pathEmpty)
	}

	// 4. Update existing (Đổi tên Env, Thêm/sửa biến)
	env1.Name = "Môi trường cũ"
	env1.Variables = append(env1.Variables, model.KVPair{Key: "host", Value: "localhost", Enabled: true})
	if err := fs.SaveEnvironment(root, env1); err != nil {
		t.Fatalf("failed to update env1: %v", err)
	}

	// Filename should remain the same
	if !fs.Exists(path1) {
		t.Fatalf("expected file %s to still exist after rename", path1)
	}

	// 5. Get Environment
	got, err := fs.GetEnvironment(root, "env-1-id")
	if err != nil {
		t.Fatalf("failed to get env: %v", err)
	}
	if got.Name != "Môi trường cũ" {
		t.Fatalf("expected updated name, got %s", got.Name)
	}
	if len(got.Variables) != 1 || got.Variables[0].Key != "host" {
		t.Fatalf("expected updated variables, got %v", got.Variables)
	}

	// 6. Delete Env (Xóa Env)
	if err := fs.DeleteEnvironment(root, "env-1-id"); err != nil {
		t.Fatalf("failed to delete env: %v", err)
	}
	if fs.Exists(path1) {
		t.Fatalf("expected file %s to be deleted", path1)
	}
	
	_, err = fs.GetEnvironment(root, "env-1-id")
	if err == nil {
		t.Fatalf("expected error getting deleted env")
	}
}

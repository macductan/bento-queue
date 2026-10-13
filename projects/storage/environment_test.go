package storage

import (
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
)

func TestEnvironmentStorage_CRUD(t *testing.T) {
	root, fs := setupCollectionTree(t)

	// 1. List initial
	envs, err := fs.ListEnvironments(root)
	if err != nil {
		t.Fatalf("expected no error listing envs, got %v", err)
	}
	_ = envs

	// 2. Create new Env with specific ID
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

	path1 := filepath.Join(root, "environments", "env-1-id.json")
	if !fs.Exists(path1) {
		t.Fatalf("expected file %s to exist", path1)
	}

	// 3. Create another with same display name (Pure UUID filename avoids conflict)
	env2 := model.Environment{
		ID:        "env-2-id",
		Name:      "Môi trường mới",
		Variables: []model.KVPair{},
	}
	if err := fs.SaveEnvironment(root, env2); err != nil {
		t.Fatalf("failed to save env2: %v", err)
	}

	path2 := filepath.Join(root, "environments", "env-2-id.json")
	if !fs.Exists(path2) {
		t.Fatalf("expected file %s to exist for env2", path2)
	}

	env3 := model.Environment{ID: "env-3-id", Name: "Môi trường mới"}
	if err := fs.SaveEnvironment(root, env3); err != nil {
		t.Fatalf("failed to save env3: %v", err)
	}
	path3 := filepath.Join(root, "environments", "env-3-id.json")
	if !fs.Exists(path3) {
		t.Fatalf("expected file %s to exist for env3", path3)
	}

	// 3.5 Create empty name env with specific ID
	envEmpty := model.Environment{ID: "env-empty-id", Name: ""}
	if err := fs.SaveEnvironment(root, envEmpty); err != nil {
		t.Fatalf("failed to save empty env: %v", err)
	}
	pathEmpty := filepath.Join(root, "environments", "env-empty-id.json")
	if !fs.Exists(pathEmpty) {
		t.Fatalf("expected file %s to exist for empty name", pathEmpty)
	}

	// 3.6 Create env with empty ID (auto-generates UUID v4)
	envAuto := model.Environment{Name: "Auto Generated ID Env"}
	if err := fs.SaveEnvironment(root, envAuto); err != nil {
		t.Fatalf("failed to save env with empty ID: %v", err)
	}
	// Check that a new file was created in environments/ matching <uuid>.json
	allEnvs, err := fs.ListEnvironments(root)
	if err != nil {
		t.Fatalf("failed to list envs: %v", err)
	}
	var foundAuto *model.Environment
	for i := range allEnvs {
		if allEnvs[i].Name == "Auto Generated ID Env" {
			foundAuto = &allEnvs[i]
			break
		}
	}
	if foundAuto == nil {
		t.Fatalf("expected to find auto-generated env in ListEnvironments")
	}
	if _, err := uuid.Parse(foundAuto.ID); err != nil {
		t.Fatalf("expected auto-generated ID to be valid UUID, got %q: %v", foundAuto.ID, err)
	}
	pathAuto := filepath.Join(root, "environments", foundAuto.ID+".json")
	if !fs.Exists(pathAuto) {
		t.Fatalf("expected file %s to exist for auto-generated env", pathAuto)
	}

	// 4. Update existing (Đổi tên Env, Thêm/sửa biến)
	env1.Name = "Môi trường cập nhật"
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
	if got.Name != "Môi trường cập nhật" {
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

func TestEnvironmentStorage_LegacySlugFile(t *testing.T) {
	root, fs := setupCollectionTree(t)

	// Simulate existing legacy environment file formatted as <slug>-<id>.json
	legacyFilename := "moi-truong-legacy-custom-legacy-id.json"
	legacyPath := filepath.Join(root, "environments", legacyFilename)
	legacyEnv := model.Environment{
		ID:        "custom-legacy-id",
		Name:      "Môi trường Legacy",
		Variables: []model.KVPair{{Key: "API_URL", Value: "https://legacy.example.com", Enabled: true}},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	if err := fs.WriteJSON(legacyPath, legacyEnv); err != nil {
		t.Fatalf("failed to write legacy env file: %v", err)
	}

	// 1. GetEnvironment on legacy file by ID
	got, err := fs.GetEnvironment(root, "custom-legacy-id")
	if err != nil {
		t.Fatalf("GetEnvironment failed to find legacy file: %v", err)
	}
	if got.Name != "Môi trường Legacy" {
		t.Errorf("expected name 'Môi trường Legacy', got %q", got.Name)
	}
	if len(got.Variables) != 1 || got.Variables[0].Value != "https://legacy.example.com" {
		t.Errorf("unexpected variables in legacy env: %v", got.Variables)
	}

	// 2. SaveEnvironment updating the legacy environment
	// Should update in-place without creating a new <uuid>.json file or renaming
	got.Name = "Môi trường Legacy Renamed"
	got.Variables = append(got.Variables, model.KVPair{Key: "TIMEOUT", Value: "5000", Enabled: true})
	if err := fs.SaveEnvironment(root, *got); err != nil {
		t.Fatalf("SaveEnvironment failed to update legacy env: %v", err)
	}

	// Legacy file must still exist
	if !fs.Exists(legacyPath) {
		t.Fatalf("legacy file %s was unexpectedly deleted or moved", legacyPath)
	}
	// No new file named custom-legacy-id.json should have been created
	pureUUIDPath := filepath.Join(root, "environments", "custom-legacy-id.json")
	if fs.Exists(pureUUIDPath) {
		t.Fatalf("expected no separate pure-uuid file to be created for existing legacy file")
	}

	// Read updated content from legacy file
	updated, err := fs.GetEnvironment(root, "custom-legacy-id")
	if err != nil {
		t.Fatalf("GetEnvironment after update failed: %v", err)
	}
	if updated.Name != "Môi trường Legacy Renamed" {
		t.Errorf("expected updated name, got %q", updated.Name)
	}
	if len(updated.Variables) != 2 {
		t.Errorf("expected 2 variables, got %d", len(updated.Variables))
	}

	// 3. DeleteEnvironment on legacy file
	if err := fs.DeleteEnvironment(root, "custom-legacy-id"); err != nil {
		t.Fatalf("DeleteEnvironment failed on legacy file: %v", err)
	}
	if fs.Exists(legacyPath) {
		t.Errorf("expected legacy file %s to be deleted", legacyPath)
	}

	// Verify not found after delete
	_, err = fs.GetEnvironment(root, "custom-legacy-id")
	if err == nil || !strings.Contains(err.Error(), model.ErrNotFound) {
		t.Errorf("expected ErrNotFound after deletion, got %v", err)
	}
}

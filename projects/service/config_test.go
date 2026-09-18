package service

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

// setupTestConfigService tạo ConfigService với temp directory cho testing.
func setupTestConfigService(t *testing.T) (*ConfigService, string) {
	t.Helper()
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	logger := slog.Default()
	svc := NewConfigService(fs, logger)
	return svc, tmpDir
}

// TestLoadOrCreateConfig_FirstLaunch — nothing exists → config created.
func TestLoadOrCreateConfig_FirstLaunch(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	configPath := filepath.Join(tmpDir, "config", configFileName)

	config, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if config == nil {
		t.Fatal("config should not be nil")
	}

	if config.CollectionRoot == "" {
		t.Error("CollectionRoot should not be empty")
	}

	if config.CreatedAt.IsZero() {
		t.Error("CreatedAt should be set")
	}

	// Verify file on disk
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		t.Error("config.json should exist on disk")
	}
}

// TestLoadOrCreateConfig_ExistingValid — config exists, valid → load without overwrite.
func TestLoadOrCreateConfig_ExistingValid(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	configPath := filepath.Join(tmpDir, "config", configFileName)

	// Tạo config trước
	customRoot := filepath.Join(tmpDir, "my-collections")
	original := model.AppConfig{
		CollectionRoot: customRoot,
	}
	if err := svc.fs.WriteJSON(configPath, original); err != nil {
		t.Fatalf("setup write failed: %v", err)
	}

	config, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if config.CollectionRoot != customRoot {
		t.Errorf("CollectionRoot = %q, want %q", config.CollectionRoot, customRoot)
	}
}

// TestLoadOrCreateConfig_MissingCollectionRoot — JSON valid, collection_root empty → fill default.
func TestLoadOrCreateConfig_MissingCollectionRoot(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	configPath := filepath.Join(tmpDir, "config", configFileName)

	// Tạo config với CollectionRoot rỗng
	empty := model.AppConfig{
		CollectionRoot: "",
	}
	if err := svc.fs.WriteJSON(configPath, empty); err != nil {
		t.Fatalf("setup write failed: %v", err)
	}

	config, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if config.CollectionRoot == "" {
		t.Error("CollectionRoot should be filled with default path")
	}
}

// TestEnsureDefaultCollection_FirstLaunch — nothing exists → all created.
func TestEnsureDefaultCollection_FirstLaunch(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	collRoot := filepath.Join(tmpDir, "collections", "default")
	ctx := context.Background()

	if err := svc.ensureDefaultCollection(ctx, collRoot); err != nil {
		t.Fatalf("ensureDefaultCollection failed: %v", err)
	}

	// Verify collection root exists
	if _, err := os.Stat(collRoot); os.IsNotExist(err) {
		t.Error("collection root directory should exist")
	}

	// Verify environments/ exists
	envDir := filepath.Join(collRoot, environmentsDir)
	if _, err := os.Stat(envDir); os.IsNotExist(err) {
		t.Error("environments/ directory should exist")
	}

	// Verify collection.json exists and valid
	collPath := filepath.Join(collRoot, collectionFileName)
	var coll model.Collection
	data, err := os.ReadFile(collPath)
	if err != nil {
		t.Fatalf("collection.json should exist: %v", err)
	}
	if err := json.Unmarshal(data, &coll); err != nil {
		t.Fatalf("collection.json should be valid JSON: %v", err)
	}
	if coll.ID == "" {
		t.Error("collection ID should be a UUID")
	}
	if coll.Name != defaultCollName {
		t.Errorf("collection Name = %q, want %q", coll.Name, defaultCollName)
	}
	if coll.CreatedAt.IsZero() {
		t.Error("collection CreatedAt should be set")
	}
}

// TestEnsureDefaultCollection_ExistingValid — collection.json exists and valid → skip.
func TestEnsureDefaultCollection_ExistingValid(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	collRoot := filepath.Join(tmpDir, "collections", "default")
	ctx := context.Background()

	// Pre-create valid collection
	if err := os.MkdirAll(collRoot, 0755); err != nil {
		t.Fatal(err)
	}
	existing := model.Collection{
		ID:   "existing-uuid",
		Name: "My Collection",
	}
	collPath := filepath.Join(collRoot, collectionFileName)
	if err := svc.fs.WriteJSON(collPath, existing); err != nil {
		t.Fatal(err)
	}

	if err := svc.ensureDefaultCollection(ctx, collRoot); err != nil {
		t.Fatalf("ensureDefaultCollection failed: %v", err)
	}

	// Verify it wasn't overwritten
	var coll model.Collection
	if err := svc.fs.ReadJSON(collPath, &coll); err != nil {
		t.Fatal(err)
	}
	if coll.ID != "existing-uuid" {
		t.Errorf("collection should not be overwritten, got ID = %q", coll.ID)
	}
}

// TestEnsureDefaultCollection_CorruptBackup — collection.json corrupt → backup .bak, recreate.
func TestEnsureDefaultCollection_CorruptBackup(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	collRoot := filepath.Join(tmpDir, "collections", "default")
	ctx := context.Background()

	// Pre-create corrupt collection.json
	if err := os.MkdirAll(collRoot, 0755); err != nil {
		t.Fatal(err)
	}
	collPath := filepath.Join(collRoot, collectionFileName)
	if err := os.WriteFile(collPath, []byte("{corrupt json!!!"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := svc.ensureDefaultCollection(ctx, collRoot); err != nil {
		t.Fatalf("ensureDefaultCollection failed: %v", err)
	}

	// Verify backup created
	backupPath := filepath.Join(collRoot, collectionBackup)
	if _, err := os.Stat(backupPath); os.IsNotExist(err) {
		t.Error("collection.json.bak should exist")
	}

	// Verify backup content matches corrupt data
	backupData, err := os.ReadFile(backupPath)
	if err != nil {
		t.Fatal(err)
	}
	if string(backupData) != "{corrupt json!!!" {
		t.Errorf("backup content mismatch: %q", string(backupData))
	}

	// Verify new collection.json is valid
	var coll model.Collection
	if err := svc.fs.ReadJSON(collPath, &coll); err != nil {
		t.Fatalf("new collection.json should be valid: %v", err)
	}
	if coll.ID == "" {
		t.Error("new collection should have a UUID")
	}
	if coll.Name != defaultCollName {
		t.Errorf("new collection Name = %q, want %q", coll.Name, defaultCollName)
	}
}

// TestEnsureDefaultCollection_CollectionMissing — config exists but collection dir missing → recreate.
func TestEnsureDefaultCollection_CollectionMissing(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	collRoot := filepath.Join(tmpDir, "collections", "default")
	ctx := context.Background()

	// Don't pre-create anything
	if err := svc.ensureDefaultCollection(ctx, collRoot); err != nil {
		t.Fatalf("ensureDefaultCollection failed: %v", err)
	}

	// Verify everything created
	collPath := filepath.Join(collRoot, collectionFileName)
	if _, err := os.Stat(collPath); os.IsNotExist(err) {
		t.Error("collection.json should be created")
	}
	envDir := filepath.Join(collRoot, environmentsDir)
	if _, err := os.Stat(envDir); os.IsNotExist(err) {
		t.Error("environments/ should be created")
	}
}

// TestEnsureDefaultCollection_PermissionDenied — directory creation fails.
func TestEnsureDefaultCollection_PermissionDenied(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("skipping permission test as root")
	}

	svc, tmpDir := setupTestConfigService(t)
	ctx := context.Background()

	// Tạo parent directory read-only để block mkdir
	readOnlyDir := filepath.Join(tmpDir, "readonly")
	if err := os.MkdirAll(readOnlyDir, 0555); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(readOnlyDir, 0755) // Cleanup

	collRoot := filepath.Join(readOnlyDir, "collections", "default")

	err := svc.ensureDefaultCollection(ctx, collRoot)
	if err == nil {
		t.Error("expected error for permission denied")
	}
}

// TestInitialize_FullFlow — full initialization flow with temp paths.
func TestInitialize_FullFlow(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	ctx := context.Background()

	// Override internal path resolution for testing by pre-creating config
	// pointing to our temp directory
	configDir := filepath.Join(tmpDir, "config")
	configPath := filepath.Join(configDir, configFileName)
	collRoot := filepath.Join(tmpDir, "data", "collections", "default")

	config := model.AppConfig{
		CollectionRoot: collRoot,
	}
	if err := svc.fs.WriteJSON(configPath, config); err != nil {
		t.Fatalf("setup config write failed: %v", err)
	}

	// Test loadOrCreateConfig + ensureDefaultCollection separately
	// (Initialize uses os.UserConfigDir which we can't override easily)
	loaded, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if err := svc.ensureDefaultCollection(ctx, loaded.CollectionRoot); err != nil {
		t.Fatalf("ensureDefaultCollection failed: %v", err)
	}

	// Verify collection was created at the right path
	collPath := filepath.Join(collRoot, collectionFileName)
	if _, err := os.Stat(collPath); os.IsNotExist(err) {
		t.Error("collection.json should exist at configured path")
	}

	envDir := filepath.Join(collRoot, environmentsDir)
	if _, err := os.Stat(envDir); os.IsNotExist(err) {
		t.Error("environments/ should exist at configured path")
	}
}

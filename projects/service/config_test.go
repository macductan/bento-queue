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
	t.Setenv("HECTO_CONFIG_DIR", tmpDir)
	fs := storage.NewFileSystem()
	logger := slog.Default()
	svc := NewConfigService(fs, logger)
	svc.SetCustomConfigDir(tmpDir)
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

	if config.CollectionsRoot == "" {
		t.Error("CollectionsRoot should not be empty")
	}
	if config.DefaultCollection != "default" {
		t.Errorf("DefaultCollection = %q, want 'default'", config.DefaultCollection)
	}
	if config.ActiveCollection != "default" {
		t.Errorf("ActiveCollection = %q, want 'default'", config.ActiveCollection)
	}
	if config.CollectionRoot != filepath.Join(config.CollectionsRoot, "default") {
		t.Errorf("CollectionRoot = %q, want %q", config.CollectionRoot, filepath.Join(config.CollectionsRoot, "default"))
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
	customCollections := filepath.Join(tmpDir, "my-collections")
	original := model.AppConfig{
		CollectionsRoot:   customCollections,
		DefaultCollection: "default",
		ActiveCollection:  "default",
		CollectionRoot:    filepath.Join(customCollections, "default"),
	}
	if err := svc.fs.WriteJSON(configPath, original); err != nil {
		t.Fatalf("setup write failed: %v", err)
	}

	config, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if config.CollectionsRoot != customCollections {
		t.Errorf("CollectionsRoot = %q, want %q", config.CollectionsRoot, customCollections)
	}
	if config.ActiveCollection != "default" {
		t.Errorf("ActiveCollection = %q, want %q", config.ActiveCollection, "default")
	}
}

// TestLoadOrCreateConfig_MissingFields — JSON valid, fields empty → fill defaults.
func TestLoadOrCreateConfig_MissingCollectionRoot(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	configPath := filepath.Join(tmpDir, "config", configFileName)

	empty := model.AppConfig{
		CollectionsRoot: "",
	}
	if err := svc.fs.WriteJSON(configPath, empty); err != nil {
		t.Fatalf("setup write failed: %v", err)
	}

	config, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if config.CollectionsRoot == "" {
		t.Error("CollectionsRoot should be filled with default path")
	}
	if config.DefaultCollection != "default" {
		t.Errorf("DefaultCollection = %q, want 'default'", config.DefaultCollection)
	}
}

// TestLoadOrCreateConfig_ActiveCollectionFallback — active collection folder missing on disk → fallback to default.
func TestLoadOrCreateConfig_ActiveCollectionFallback(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	configPath := filepath.Join(tmpDir, "config", configFileName)

	collectionsRoot := filepath.Join(tmpDir, "collections")
	cfg := model.AppConfig{
		CollectionsRoot:   collectionsRoot,
		DefaultCollection: "default",
		ActiveCollection:  "non-existent-col-uuid",
		CollectionRoot:    filepath.Join(collectionsRoot, "non-existent-col-uuid"),
	}
	if err := svc.fs.WriteJSON(configPath, cfg); err != nil {
		t.Fatalf("setup write failed: %v", err)
	}

	loaded, err := svc.loadOrCreateConfig(configPath)
	if err != nil {
		t.Fatalf("loadOrCreateConfig failed: %v", err)
	}

	if loaded.ActiveCollection != "default" {
		t.Errorf("ActiveCollection should fallback to 'default', got %q", loaded.ActiveCollection)
	}
	if loaded.CollectionRoot != filepath.Join(collectionsRoot, "default") {
		t.Errorf("CollectionRoot should point to default, got %q", loaded.CollectionRoot)
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
	collectionsRoot := filepath.Join(tmpDir, "data", "collections")
	collRoot := filepath.Join(collectionsRoot, "default")

	config := model.AppConfig{
		CollectionsRoot:   collectionsRoot,
		DefaultCollection: "default",
		ActiveCollection:  "default",
		CollectionRoot:    collRoot,
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

// TestUpdateCollectionRoot — tests both success and failure (e.g. read-only directory) cases.
func TestUpdateCollectionRoot(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	ctx := context.Background()

	// Override OS config dirs for this test
	origConfigHome := os.Getenv("XDG_CONFIG_HOME")
	origCacheHome := os.Getenv("XDG_CACHE_HOME")
	os.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, "config"))
	os.Setenv("XDG_CACHE_HOME", filepath.Join(tmpDir, "cache"))
	t.Cleanup(func() {
		os.Setenv("XDG_CONFIG_HOME", origConfigHome)
		os.Setenv("XDG_CACHE_HOME", origCacheHome)
	})

	// Success case
	newRoot := filepath.Join(tmpDir, "new-root")
	updatedRoot, err := svc.UpdateCollectionRoot(ctx, newRoot)
	if err != nil {
		t.Fatalf("expected success, got err: %v", err)
	}
	expectedCollRoot := filepath.Join(newRoot, "default")
	if updatedRoot != expectedCollRoot {
		t.Errorf("expected %q, got %q", expectedCollRoot, updatedRoot)
	}

	// Verify it wrote to config.json
	configPath, _ := svc.resolveConfigPath()
	var cfg model.AppConfig
	if err := svc.fs.ReadJSON(configPath, &cfg); err != nil {
		t.Fatalf("failed to read config: %v", err)
	}
	if cfg.CollectionsRoot != newRoot {
		t.Errorf("config CollectionsRoot has %q, want %q", cfg.CollectionsRoot, newRoot)
	}
	if cfg.CollectionRoot != expectedCollRoot {
		t.Errorf("config CollectionRoot has %q, want %q", cfg.CollectionRoot, expectedCollRoot)
	}

	// Failure case: Read-only directory
	if os.Getuid() != 0 {
		readOnlyDir := filepath.Join(tmpDir, "readonly")
		if err := os.MkdirAll(readOnlyDir, 0555); err != nil {
			t.Fatal(err)
		}
		defer os.Chmod(readOnlyDir, 0755)

		failRoot := filepath.Join(readOnlyDir, "fail-root")
		_, err := svc.UpdateCollectionRoot(ctx, failRoot)
		if err == nil {
			t.Error("expected error when updating to read-only directory")
		}

		// Verify config wasn't modified
		var cfgAfter model.AppConfig
		if err := svc.fs.ReadJSON(configPath, &cfgAfter); err != nil {
			t.Fatalf("failed to read config: %v", err)
		}
		if cfgAfter.CollectionsRoot != newRoot {
			t.Errorf("config CollectionsRoot should remain %q, but got %q", newRoot, cfgAfter.CollectionsRoot)
		}
	}
}

func TestSwitchActiveCollection(t *testing.T) {
	svc, tmpDir := setupTestConfigService(t)
	ctx := context.Background()

	origConfigHome := os.Getenv("XDG_CONFIG_HOME")
	origCacheHome := os.Getenv("XDG_CACHE_HOME")
	os.Setenv("XDG_CONFIG_HOME", filepath.Join(tmpDir, "config"))
	os.Setenv("XDG_CACHE_HOME", filepath.Join(tmpDir, "cache"))
	t.Cleanup(func() {
		os.Setenv("XDG_CONFIG_HOME", origConfigHome)
		os.Setenv("XDG_CACHE_HOME", origCacheHome)
	})

	cfg, err := svc.Initialize(ctx)
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	// Switch to non-existent collection -> NOT_FOUND
	_, err = svc.SwitchActiveCollection(ctx, "non-existent")
	if err == nil {
		t.Fatal("expected error switching to non-existent collection")
	}

	// Create a new collection folder
	newCollID := "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
	newDir := filepath.Join(cfg.CollectionsRoot, newCollID)
	if err := os.MkdirAll(newDir, 0755); err != nil {
		t.Fatal(err)
	}

	switchedCfg, err := svc.SwitchActiveCollection(ctx, newCollID)
	if err != nil {
		t.Fatalf("SwitchActiveCollection failed: %v", err)
	}

	if switchedCfg.ActiveCollection != newCollID {
		t.Errorf("ActiveCollection = %q, want %q", switchedCfg.ActiveCollection, newCollID)
	}
	if switchedCfg.CollectionRoot != newDir {
		t.Errorf("CollectionRoot = %q, want %q", switchedCfg.CollectionRoot, newDir)
	}
}


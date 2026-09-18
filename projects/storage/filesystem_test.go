package storage

import (
	"os"
	"path/filepath"
	"testing"
)

type testData struct {
	Name  string `json:"name"`
	Value int    `json:"value"`
}

func TestWriteJSON_Success(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.json")
	fs := NewFileSystem()

	data := testData{Name: "hello", Value: 42}
	if err := fs.WriteJSON(path, data); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	// Verify file exists
	if !fs.Exists(path) {
		t.Fatal("file should exist after WriteJSON")
	}

	// Verify content
	var result testData
	if err := fs.ReadJSON(path, &result); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}

	if result.Name != "hello" || result.Value != 42 {
		t.Errorf("unexpected data: %+v", result)
	}
}

func TestWriteJSON_CreatesParentDirs(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "dir", "test.json")
	fs := NewFileSystem()

	data := testData{Name: "nested", Value: 1}
	if err := fs.WriteJSON(path, data); err != nil {
		t.Fatalf("WriteJSON should create parent dirs: %v", err)
	}

	if !fs.Exists(path) {
		t.Fatal("file should exist in nested directory")
	}
}

func TestReadJSON_NotFound(t *testing.T) {
	fs := NewFileSystem()

	var result testData
	err := fs.ReadJSON("/nonexistent/path.json", &result)
	if err == nil {
		t.Fatal("ReadJSON should return error for non-existent file")
	}

	// Error should contain NOT_FOUND
	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestReadJSON_ParseError(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "bad.json")
	fs := NewFileSystem()

	// Write invalid JSON
	if err := os.WriteFile(path, []byte("{invalid json}"), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	var result testData
	err := fs.ReadJSON(path, &result)
	if err == nil {
		t.Fatal("ReadJSON should return error for invalid JSON")
	}

	// Error should contain PARSE_ERROR
	if err.Error()[:11] != "PARSE_ERROR" {
		t.Errorf("expected PARSE_ERROR error, got: %v", err)
	}
}

func TestDelete_Success(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "delete-me.json")
	fs := NewFileSystem()

	// Create file
	if err := fs.WriteJSON(path, testData{Name: "bye", Value: 0}); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	// Delete it
	if err := fs.Delete(path); err != nil {
		t.Fatalf("Delete failed: %v", err)
	}

	if fs.Exists(path) {
		t.Fatal("file should not exist after Delete")
	}
}

func TestDelete_NotFound(t *testing.T) {
	fs := NewFileSystem()

	err := fs.Delete("/nonexistent/file.json")
	if err == nil {
		t.Fatal("Delete should return error for non-existent file")
	}

	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestMoveFile_Success(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "source.json")
	dest := filepath.Join(dir, "dest.json")
	fs := NewFileSystem()

	// Create source
	if err := fs.WriteJSON(src, testData{Name: "moved", Value: 99}); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	// Move it
	if err := fs.MoveFile(src, dest); err != nil {
		t.Fatalf("MoveFile failed: %v", err)
	}

	if fs.Exists(src) {
		t.Fatal("source should not exist after move")
	}

	if !fs.Exists(dest) {
		t.Fatal("dest should exist after move")
	}

	// Verify content preserved
	var result testData
	if err := fs.ReadJSON(dest, &result); err != nil {
		t.Fatalf("ReadJSON dest failed: %v", err)
	}
	if result.Name != "moved" || result.Value != 99 {
		t.Errorf("unexpected data: %+v", result)
	}
}

func TestMoveFile_SourceNotFound(t *testing.T) {
	dir := t.TempDir()
	fs := NewFileSystem()

	err := fs.MoveFile("/nonexistent/file.json", filepath.Join(dir, "dest.json"))
	if err == nil {
		t.Fatal("MoveFile should return error for non-existent source")
	}

	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestFindByUUID_IndexHit(t *testing.T) {
	fs := NewFileSystem()

	fs.IndexSet("uuid-123", "/some/path.json")

	path, err := fs.FindByUUID("uuid-123")
	if err != nil {
		t.Fatalf("FindByUUID should succeed: %v", err)
	}
	if path != "/some/path.json" {
		t.Errorf("expected /some/path.json, got: %s", path)
	}
}

func TestFindByUUID_IndexMiss(t *testing.T) {
	fs := NewFileSystem()

	_, err := fs.FindByUUID("nonexistent-uuid")
	if err == nil {
		t.Fatal("FindByUUID should return error for missing UUID")
	}

	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestFindByUUID_Empty(t *testing.T) {
	fs := NewFileSystem()

	_, err := fs.FindByUUID("")
	if err == nil {
		t.Fatal("FindByUUID should return error for empty UUID")
	}

	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestWriteJSON_AtomicNoPartialFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "atomic.json")
	fs := NewFileSystem()

	// Write valid data
	data := testData{Name: "atomic", Value: 100}
	if err := fs.WriteJSON(path, data); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}

	// Verify no temp files remain
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("ReadDir failed: %v", err)
	}

	for _, entry := range entries {
		if entry.Name() != "atomic.json" {
			t.Errorf("unexpected file in dir: %s (temp file not cleaned up?)", entry.Name())
		}
	}
}

// entityFile is a minimal JSON entity with an ID field for walk tests.
type entityFile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// setupCollectionTree creates a test collection directory structure on disk.
func setupCollectionTree(t *testing.T) (string, *FileSystem) {
	t.Helper()
	root := t.TempDir()
	fs := NewFileSystem()

	// Create collection.json (should be skipped by walk)
	if err := fs.WriteJSON(filepath.Join(root, "collection.json"), map[string]string{"id": "coll-id", "name": "Test"}); err != nil {
		t.Fatalf("failed to create collection.json: %v", err)
	}

	// Create environments directory (should be skipped by walk)
	envDir := filepath.Join(root, "environments")
	if err := os.MkdirAll(envDir, 0755); err != nil {
		t.Fatalf("failed to create environments dir: %v", err)
	}
	if err := fs.WriteJSON(filepath.Join(envDir, "dev.json"), map[string]string{"id": "env-1", "name": "dev"}); err != nil {
		t.Fatalf("failed to create env file: %v", err)
	}

	// Create a folder with _folder.json (should be skipped)
	authDir := filepath.Join(root, "auth")
	if err := os.MkdirAll(authDir, 0755); err != nil {
		t.Fatalf("failed to create auth dir: %v", err)
	}
	if err := fs.WriteJSON(filepath.Join(authDir, "_folder.json"), map[string]string{"id": "folder-1", "name": "Auth"}); err != nil {
		t.Fatalf("failed to create _folder.json: %v", err)
	}

	// Create request files
	if err := fs.WriteJSON(filepath.Join(authDir, "dang-nhap.json"), entityFile{ID: "uuid-req-1", Name: "Đăng nhập"}); err != nil {
		t.Fatalf("failed to create request file: %v", err)
	}
	if err := fs.WriteJSON(filepath.Join(authDir, "dang-ky.json"), entityFile{ID: "uuid-req-2", Name: "Đăng ký"}); err != nil {
		t.Fatalf("failed to create request file: %v", err)
	}

	// Create another folder
	productsDir := filepath.Join(root, "san-pham")
	if err := os.MkdirAll(productsDir, 0755); err != nil {
		t.Fatalf("failed to create products dir: %v", err)
	}
	if err := fs.WriteJSON(filepath.Join(productsDir, "_folder.json"), map[string]string{"id": "folder-2", "name": "Sản phẩm"}); err != nil {
		t.Fatalf("failed to create _folder.json: %v", err)
	}
	if err := fs.WriteJSON(filepath.Join(productsDir, "danh-sach.json"), entityFile{ID: "uuid-req-3", Name: "Danh sách"}); err != nil {
		t.Fatalf("failed to create request file: %v", err)
	}

	return root, fs
}

func TestFindByUUID_FallbackWalkHit(t *testing.T) {
	root, fs := setupCollectionTree(t)
	fs.SetCollectionRoot(root)

	// No index entries — should fallback to walk
	path, err := fs.FindByUUID("uuid-req-1")
	if err != nil {
		t.Fatalf("FindByUUID fallback should find uuid-req-1: %v", err)
	}

	expected := filepath.Join(root, "auth", "dang-nhap.json")
	if path != expected {
		t.Errorf("FindByUUID = %q, want %q", path, expected)
	}

	// Verify it was cached in the index
	cachedPath, err := fs.FindByUUID("uuid-req-1")
	if err != nil {
		t.Fatalf("cached FindByUUID should succeed: %v", err)
	}
	if cachedPath != expected {
		t.Errorf("cached path = %q, want %q", cachedPath, expected)
	}
}

func TestFindByUUID_FallbackWalkMiss(t *testing.T) {
	root, fs := setupCollectionTree(t)
	fs.SetCollectionRoot(root)

	_, err := fs.FindByUUID("nonexistent-uuid")
	if err == nil {
		t.Fatal("FindByUUID should return error for non-existent UUID even with walk")
	}

	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestFindByUUID_NoCollectionRoot(t *testing.T) {
	fs := NewFileSystem()
	// No collection root set, no index entry

	_, err := fs.FindByUUID("some-uuid")
	if err == nil {
		t.Fatal("FindByUUID should return error when no collection root and no index")
	}

	if err.Error()[:9] != "NOT_FOUND" {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestIndexRebuild_PopulatesIndex(t *testing.T) {
	root, fs := setupCollectionTree(t)

	if err := fs.IndexRebuild(root); err != nil {
		t.Fatalf("IndexRebuild failed: %v", err)
	}

	// Should find all 3 request files by UUID and 2 folders
	for _, uuid := range []string{"uuid-req-1", "uuid-req-2", "uuid-req-3", "folder-1", "folder-2"} {
		path, err := fs.FindByUUID(uuid)
		if err != nil {
			t.Errorf("FindByUUID(%q) after rebuild should succeed: %v", uuid, err)
			continue
		}
		if path == "" {
			t.Errorf("FindByUUID(%q) returned empty path", uuid)
		}
	}

	// Should NOT contain collection.json id or environment ids
	for _, uuid := range []string{"coll-id", "env-1"} {
		_, err := fs.FindByUUID(uuid)
		if err == nil {
			t.Errorf("FindByUUID(%q) should NOT be in index (metadata/env file)", uuid)
		}
	}
}

func TestIndexRebuild_ClearsOldEntries(t *testing.T) {
	root, fs := setupCollectionTree(t)

	// Add a stale entry
	fs.IndexSet("stale-uuid", "/old/path.json")

	if err := fs.IndexRebuild(root); err != nil {
		t.Fatalf("IndexRebuild failed: %v", err)
	}

	// Stale entry should be gone (no collection root walk will find it)
	_, err := fs.FindByUUID("stale-uuid")
	if err == nil {
		t.Error("stale-uuid should have been cleared by IndexRebuild")
	}
}

func TestIndexClear(t *testing.T) {
	fs := NewFileSystem()
	fs.IndexSet("uuid-1", "/path/1.json")
	fs.IndexSet("uuid-2", "/path/2.json")

	fs.IndexClear()

	_, err := fs.FindByUUID("uuid-1")
	if err == nil {
		t.Error("IndexClear should have removed all entries")
	}
}

func TestIndexDeleteByPrefix(t *testing.T) {
	fs := NewFileSystem()
	sep := string(filepath.Separator)
	fs.IndexSet("dir", sep+"root"+sep+"a")
	fs.IndexSet("child", sep+"root"+sep+"a"+sep+"x.json")
	fs.IndexSet("deep", sep+"root"+sep+"a"+sep+"b"+sep+"y.json")
	fs.IndexSet("sibling", sep+"root"+sep+"ab"+sep+"z.json") // must NOT match prefix "a"
	fs.IndexSet("other", sep+"root"+sep+"c.json")

	fs.IndexDeleteByPrefix(sep + "root" + sep + "a")

	for _, id := range []string{"dir", "child", "deep"} {
		if _, ok := fs.index[id]; ok {
			t.Errorf("%s should be removed", id)
		}
	}
	for _, id := range []string{"sibling", "other"} {
		if _, ok := fs.index[id]; !ok {
			t.Errorf("%s should remain", id)
		}
	}
}

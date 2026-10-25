package storage

import (
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"
)

func TestFileSystem_SelfWriteWindow_SkipsHistoryAndConfig(t *testing.T) {
	tmpDir := t.TempDir()
	fs := NewFileSystem()

	// 1. Writing to config.json must NOT record a self-write
	if err := fs.WriteJSON(filepath.Join(tmpDir, "config.json"), map[string]string{"a": "b"}); err != nil {
		t.Fatal(err)
	}
	if fs.IsWithinSelfWriteWindow(400 * time.Millisecond) {
		t.Errorf("expected config.json write NOT to record self-write")
	}

	// 2. Writing inside .history/ must NOT record a self-write
	histFile := filepath.Join(tmpDir, ".history", "2026-10-23", "entry.json")
	if err := fs.WriteJSON(histFile, map[string]string{"id": "1"}); err != nil {
		t.Fatal(err)
	}
	if fs.IsWithinSelfWriteWindow(400 * time.Millisecond) {
		t.Errorf("expected .history/ write NOT to record self-write")
	}

	// 3. Writing an entity JSON file MUST record a self-write
	reqFile := filepath.Join(tmpDir, "req-1.json")
	if err := fs.WriteJSON(reqFile, map[string]string{"id": "req-1"}); err != nil {
		t.Fatal(err)
	}
	if !fs.IsWithinSelfWriteWindow(400 * time.Millisecond) {
		t.Errorf("expected entity write to record self-write within 400ms window")
	}
}

func TestCollectionWatcher_ExternalChange_SelfWriteSuppression_And_NestedDirs(t *testing.T) {
	collRoot := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(collRoot)

	var changeCount atomic.Int32
	cw, err := NewCollectionWatcherWithTimings(
		fs,
		nil,
		collRoot,
		150*time.Millisecond,
		60*time.Millisecond,
		func() {
			changeCount.Add(1)
		},
	)
	if err != nil {
		t.Fatalf("NewCollectionWatcherWithTimings failed: %v", err)
	}
	defer cw.Close()

	// 1. Self-write via fs.WriteJSON must be suppressed
	if err := fs.WriteJSON(filepath.Join(collRoot, "self-req.json"), map[string]string{"id": "self"}); err != nil {
		t.Fatal(err)
	}
	time.Sleep(180 * time.Millisecond)
	if got := changeCount.Load(); got != 0 {
		t.Fatalf("expected 0 external change callbacks for self-write, got %d", got)
	}

	// Wait for self-write window to expire
	time.Sleep(50 * time.Millisecond)

	// 2. Ignored files (.tmp-*, .history, .git) must not trigger callback
	_ = os.WriteFile(filepath.Join(collRoot, ".tmp-12345"), []byte("tmp"), 0644)
	_ = os.MkdirAll(filepath.Join(collRoot, ".history"), 0755)
	_ = os.WriteFile(filepath.Join(collRoot, ".history", "h.json"), []byte("{}"), 0644)
	time.Sleep(120 * time.Millisecond)
	if got := changeCount.Load(); got != 0 {
		t.Fatalf("expected 0 callbacks for ignored paths, got %d", got)
	}

	// 3. External file write by another process (simulated via os.WriteFile without fs.RecordSelfWrite)
	if err := os.WriteFile(filepath.Join(collRoot, "ext-req.json"), []byte(`{"id":"ext"}`), 0644); err != nil {
		t.Fatal(err)
	}
	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) && changeCount.Load() == 0 {
		time.Sleep(20 * time.Millisecond)
	}
	if got := changeCount.Load(); got != 1 {
		t.Fatalf("expected 1 debounced callback for external file write, got %d", got)
	}

	// 4. External creation of nested folders and subsequent modification inside deepest folder
	nestedDir := filepath.Join(collRoot, "AuthFlow", "OAuth2")
	if err := os.MkdirAll(nestedDir, 0755); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) && changeCount.Load() < 2 {
		time.Sleep(20 * time.Millisecond)
	}
	beforeDeepWrite := changeCount.Load()

	// Wait briefly so the new nested directory is registered in fsnotify, then write inside OAuth2
	time.Sleep(80 * time.Millisecond)
	if err := os.WriteFile(filepath.Join(nestedDir, "token-req.json"), []byte(`{"id":"tok"}`), 0644); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) && changeCount.Load() <= beforeDeepWrite {
		time.Sleep(20 * time.Millisecond)
	}
	if changeCount.Load() <= beforeDeepWrite {
		t.Fatalf("expected external write inside newly created nested directory to trigger callback")
	}

	// 5. Self-created folder via fs.MakeDir is suppressed during self-write window,
	//    but is registered in fsnotify so subsequent external writes inside it trigger callback
	beforeSelfDir := changeCount.Load()
	selfDir := filepath.Join(collRoot, "SelfCreatedFolder")
	if err := fs.MakeDir(selfDir); err != nil {
		t.Fatalf("fs.MakeDir failed: %v", err)
	}
	time.Sleep(180 * time.Millisecond)
	if got := changeCount.Load(); got != beforeSelfDir {
		t.Fatalf("expected 0 callbacks for self-created folder via fs.MakeDir, got %d (was %d)", got, beforeSelfDir)
	}
	time.Sleep(50 * time.Millisecond) // ensure self-write window expired
	if err := os.WriteFile(filepath.Join(selfDir, "ext-in-self-dir.json"), []byte(`{"id":"ext2"}`), 0644); err != nil {
		t.Fatal(err)
	}
	deadline = time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) && changeCount.Load() <= beforeSelfDir {
		time.Sleep(20 * time.Millisecond)
	}
	if changeCount.Load() <= beforeSelfDir {
		t.Fatalf("expected external write inside self-created folder to trigger callback")
	}

	// 6. SwitchRoot to a second collection directory removes watches on old collRoot
	collRoot2 := t.TempDir()
	fs.SetCollectionRoot(collRoot2)
	if err := cw.SwitchRoot(collRoot2); err != nil {
		t.Fatalf("SwitchRoot failed: %v", err)
	}
	if cw.RootDir() != filepath.Clean(collRoot2) {
		t.Errorf("expected RootDir() = %q, got %q", collRoot2, cw.RootDir())
	}
	countAfterSwitch := changeCount.Load()
	if err := os.WriteFile(filepath.Join(collRoot, "after-switch-old-root.json"), []byte(`{"id":"old"}`), 0644); err != nil {
		t.Fatal(err)
	}
	time.Sleep(140 * time.Millisecond)
	if got := changeCount.Load(); got != countAfterSwitch {
		t.Fatalf("expected 0 callbacks for writes to old collection root after SwitchRoot, got %d (was %d)", got, countAfterSwitch)
	}
}


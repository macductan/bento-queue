package storage

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestAdversarial_FindByUUID_SelfHealing_OutBand_Mutations tests that FindByUUID
// correctly self-heals under all forms of out-of-band external filesystem mutations.
func TestAdversarial_FindByUUID_SelfHealing_OutBand_Mutations(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	// Create initial directory structure
	folderA := filepath.Join(root, "FolderA")
	if err := os.MkdirAll(folderA, 0755); err != nil {
		t.Fatal(err)
	}
	folderMetaA := filepath.Join(folderA, "_folder.json")
	if err := os.WriteFile(folderMetaA, []byte(`{"id":"f-uuid-a","name":"Folder A"}`), 0644); err != nil {
		t.Fatal(err)
	}

	req1 := filepath.Join(folderA, "req1.json")
	if err := os.WriteFile(req1, []byte(`{"id":"r-uuid-1","name":"Request 1"}`), 0644); err != nil {
		t.Fatal(err)
	}

	// 1. Initial lookups should succeed via fallback walk and populate index
	p1, err := fs.FindByUUID("r-uuid-1")
	if err != nil || p1 != req1 {
		t.Fatalf("expected FindByUUID(r-uuid-1) = %s, got %s (err: %v)", req1, p1, err)
	}
	pfA, err := fs.FindByUUID("f-uuid-a")
	if err != nil || pfA != folderA {
		t.Fatalf("expected FindByUUID(f-uuid-a) = %s, got %s (err: %v)", folderA, pfA, err)
	}

	// Verify entries are in index
	fs.mu.RLock()
	if fs.index["r-uuid-1"] != req1 || fs.index["f-uuid-a"] != folderA {
		fs.mu.RUnlock()
		t.Fatalf("cache was not populated as expected")
	}
	fs.mu.RUnlock()

	// 2. Out-of-band request move to a new external folder
	folderB := filepath.Join(root, "FolderB")
	if err := os.MkdirAll(folderB, 0755); err != nil {
		t.Fatal(err)
	}
	req1Moved := filepath.Join(folderB, "req1_moved.json")
	if err := os.Rename(req1, req1Moved); err != nil {
		t.Fatal(err)
	}

	// FindByUUID must detect stale cache, invalidate it, walk, find req1Moved, update cache
	p1Healed, err := fs.FindByUUID("r-uuid-1")
	if err != nil {
		t.Fatalf("FindByUUID failed to self-heal moved request: %v", err)
	}
	if p1Healed != req1Moved {
		t.Fatalf("expected healed path %s, got %s", req1Moved, p1Healed)
	}
	fs.mu.RLock()
	if fs.index["r-uuid-1"] != req1Moved {
		fs.mu.RUnlock()
		t.Fatalf("cache was not updated to new path after self-healing: got %s", fs.index["r-uuid-1"])
	}
	fs.mu.RUnlock()

	// 3. Out-of-band folder rename
	folderARenamed := filepath.Join(root, "FolderA_Renamed")
	if err := os.Rename(folderA, folderARenamed); err != nil {
		t.Fatal(err)
	}

	pfAHealed, err := fs.FindByUUID("f-uuid-a")
	if err != nil {
		t.Fatalf("FindByUUID failed to self-heal renamed folder: %v", err)
	}
	if pfAHealed != folderARenamed {
		t.Fatalf("expected healed folder path %s, got %s", folderARenamed, pfAHealed)
	}

	// 4. Out-of-band request deletion
	if err := os.Remove(req1Moved); err != nil {
		t.Fatal(err)
	}
	_, err = fs.FindByUUID("r-uuid-1")
	if err == nil {
		t.Fatalf("expected error for deleted request, got nil")
	}
	fs.mu.RLock()
	if _, ok := fs.index["r-uuid-1"]; ok {
		fs.mu.RUnlock()
		t.Fatalf("deleted request UUID should have been evicted from index")
	}
	fs.mu.RUnlock()

	// 5. Folder loses _folder.json (file deleted while dir remains)
	metaInRenamed := filepath.Join(folderARenamed, "_folder.json")
	if err := os.Remove(metaInRenamed); err != nil {
		t.Fatal(err)
	}
	_, err = fs.FindByUUID("f-uuid-a")
	if err == nil {
		t.Fatalf("expected error when _folder.json is deleted, got nil")
	}
	fs.mu.RLock()
	if _, ok := fs.index["f-uuid-a"]; ok {
		fs.mu.RUnlock()
		t.Fatalf("folder UUID without _folder.json should have been evicted from index")
	}
	fs.mu.RUnlock()

	// 6. Corrupted JSON file on disk during walk does not break search for valid UUID
	corruptedFile := filepath.Join(root, "corrupted.json")
	if err := os.WriteFile(corruptedFile, []byte(`{INVALID_JSON:::`), 0644); err != nil {
		t.Fatal(err)
	}
	validFile := filepath.Join(root, "valid.json")
	if err := os.WriteFile(validFile, []byte(`{"id":"r-valid-99"}`), 0644); err != nil {
		t.Fatal(err)
	}

	pValid, err := fs.FindByUUID("r-valid-99")
	if err != nil || pValid != validFile {
		t.Fatalf("expected FindByUUID to find valid file despite corrupted neighbor, got %s (err: %v)", pValid, err)
	}
}

// TestAdversarial_FindByUUID_HighConcurrency_Race_Stress runs massive concurrent
// queries against FindByUUID while files are constantly created, moved, and deleted.
func TestAdversarial_FindByUUID_HighConcurrency_Race_Stress(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	const numEntities = 50
	var uuids []string
	var mu sync.Mutex

	// Seed initial files
	for i := 0; i < numEntities; i++ {
		id := fmt.Sprintf("stress-uuid-%d", i)
		uuids = append(uuids, id)
		dir := filepath.Join(root, fmt.Sprintf("dir_%d", i%5))
		_ = os.MkdirAll(dir, 0755)
		path := filepath.Join(dir, fmt.Sprintf("req_%d.json", i))
		_ = os.WriteFile(path, []byte(fmt.Sprintf(`{"id":"%s"}`, id)), 0644)
	}

	stop := make(chan struct{})
	var wg sync.WaitGroup

	// 20 Reader Goroutines
	for r := 0; r < 20; r++ {
		wg.Add(1)
		go func(readerID int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(readerID)))
			for {
				select {
				case <-stop:
					return
				default:
					targetUUID := uuids[rng.Intn(len(uuids))]
					path, err := fs.FindByUUID(targetUUID)
					if err == nil {
						// If path is returned, it must end in .json and have existed at moment of lookup
						if filepath.Ext(path) != ".json" && filepath.Base(path) != "_folder.json" {
							t.Errorf("invalid path returned by FindByUUID: %s", path)
						}
					}
					time.Sleep(time.Duration(rng.Intn(200)) * time.Microsecond)
				}
			}
		}(r)
	}

	// 5 Mutation Goroutines (External mutations bypassing fs)
	for m := 0; m < 5; m++ {
		wg.Add(1)
		go func(mutatorID int) {
			defer wg.Done()
			rng := rand.New(rand.NewSource(time.Now().UnixNano() + int64(mutatorID*100)))
			for {
				select {
				case <-stop:
					return
				default:
					idx := rng.Intn(numEntities)
					id := uuids[idx]
					subDir := filepath.Join(root, fmt.Sprintf("dir_%d", rng.Intn(5)))
					_ = os.MkdirAll(subDir, 0755)
					newPath := filepath.Join(subDir, fmt.Sprintf("req_%d_%d.json", idx, rng.Intn(1000)))

					mu.Lock()
					// Move or recreate
					_ = os.WriteFile(newPath, []byte(fmt.Sprintf(`{"id":"%s"}`, id)), 0644)
					mu.Unlock()

					time.Sleep(time.Duration(rng.Intn(500)) * time.Microsecond)
				}
			}
		}(m)
	}

	// Run stress for 1.5 seconds
	time.Sleep(1500 * time.Millisecond)
	close(stop)
	wg.Wait()
}

// TestAdversarial_Watcher_HighFrequency_SelfWrite_Burst verifies that a barrage of
// self-writes within the self-write suppression window causes ZERO false notifications.
func TestAdversarial_Watcher_HighFrequency_SelfWrite_Burst(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	var callbackCount atomic.Int32
	selfWriteWin := 350 * time.Millisecond
	debounceWin := 80 * time.Millisecond

	cw, err := NewCollectionWatcherWithTimings(
		fs,
		nil,
		root,
		selfWriteWin,
		debounceWin,
		func() {
			callbackCount.Add(1)
		},
	)
	if err != nil {
		t.Fatalf("failed to create watcher: %v", err)
	}
	defer cw.Close()

	// High frequency burst: 120 writes within 240ms (interval 2ms)
	for i := 0; i < 120; i++ {
		path := filepath.Join(root, fmt.Sprintf("burst_req_%d.json", i))
		if err := fs.WriteJSON(path, map[string]string{"id": fmt.Sprintf("burst-%d", i)}); err != nil {
			t.Fatalf("WriteJSON failed at %d: %v", i, err)
		}
		time.Sleep(2 * time.Millisecond)
	}

	// Wait for debounce and any potential false trigger
	time.Sleep(selfWriteWin + 100*time.Millisecond)

	if got := callbackCount.Load(); got != 0 {
		t.Fatalf("FAIL: High-frequency internal writes triggered %d external notifications! Expected exactly 0.", got)
	}
}

// TestAdversarial_Watcher_ConfigAndHistory_Exclusion verifies that internal writes
// to config.json and .history/ are NOT suppressed from being external signals,
// while .history and .tmp-* themselves are filtered from firing watcher events.
func TestAdversarial_Watcher_ConfigAndHistory_Exclusion(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	var callbackCount atomic.Int32
	cw, err := NewCollectionWatcherWithTimings(
		fs,
		nil,
		root,
		250*time.Millisecond,
		60*time.Millisecond,
		func() {
			callbackCount.Add(1)
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	defer cw.Close()

	// 1. fs.WriteJSON to config.json must NOT set self-write window
	cfgPath := filepath.Join(root, "config.json")
	if err := fs.WriteJSON(cfgPath, map[string]string{"active_collection": "default"}); err != nil {
		t.Fatal(err)
	}
	if fs.IsWithinSelfWriteWindow(250 * time.Millisecond) {
		t.Fatalf("config.json write erroneously set self-write window")
	}

	// Wait for any events to settle
	time.Sleep(100 * time.Millisecond)
	callbackCount.Store(0)

	// 2. fs.WriteJSON inside .history/ must NOT set self-write window
	histDir := filepath.Join(root, ".history", "run-1")
	_ = os.MkdirAll(histDir, 0755)
	histFile := filepath.Join(histDir, "resp.json")
	if err := fs.WriteJSON(histFile, map[string]string{"status": "200"}); err != nil {
		t.Fatal(err)
	}
	if fs.IsWithinSelfWriteWindow(250 * time.Millisecond) {
		t.Fatalf(".history/ write erroneously set self-write window")
	}

	// .history/ write itself must be filtered out by shouldIgnoreEventPath
	time.Sleep(120 * time.Millisecond)
	if got := callbackCount.Load(); got != 0 {
		t.Fatalf("expected 0 callbacks for .history write, got %d", got)
	}

	// 3. External write immediately after history write MUST trigger watcher
	extFile := filepath.Join(root, "ext_after_history.json")
	if err := os.WriteFile(extFile, []byte(`{"id":"ext-hist"}`), 0644); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) && callbackCount.Load() == 0 {
		time.Sleep(20 * time.Millisecond)
	}
	if callbackCount.Load() != 1 {
		t.Fatalf("external write immediately following .history write failed to trigger callback")
	}
}

// TestAdversarial_Watcher_DeepDynamicNestedDirectories tests recursive event delivery
// through deep dynamic directory trees created after watcher initialization.
func TestAdversarial_Watcher_DeepDynamicNestedDirectories(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	var callbackCount atomic.Int32
	cw, err := NewCollectionWatcherWithTimings(
		fs,
		nil,
		root,
		200*time.Millisecond,
		60*time.Millisecond,
		func() {
			callbackCount.Add(1)
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	defer cw.Close()

	// Dynamically build 10 levels of nested folders
	deepPath := root
	for i := 1; i <= 10; i++ {
		deepPath = filepath.Join(deepPath, fmt.Sprintf("level_%02d", i))
	}
	if err := os.MkdirAll(deepPath, 0755); err != nil {
		t.Fatal(err)
	}

	// Wait for fsnotify to recursively bind all 10 newly created levels
	time.Sleep(150 * time.Millisecond)
	initialCallbacks := callbackCount.Load()

	// Write external file into level 10
	deepFile := filepath.Join(deepPath, "deep_request.json")
	if err := os.WriteFile(deepFile, []byte(`{"id":"deep-10"}`), 0644); err != nil {
		t.Fatal(err)
	}

	deadline := time.Now().Add(1 * time.Second)
	for time.Now().Before(deadline) && callbackCount.Load() <= initialCallbacks {
		time.Sleep(20 * time.Millisecond)
	}
	if callbackCount.Load() <= initialCallbacks {
		t.Fatalf("FAIL: External write 10 levels deep was NOT captured by dynamic recursive watcher!")
	}
}

// TestAdversarial_Watcher_Debounce_Coalescing verifies that 40 rapid external events
// coalesce into a single callback after the debounce window.
func TestAdversarial_Watcher_Debounce_Coalescing(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	var callbackCount atomic.Int32
	debounceWin := 120 * time.Millisecond

	cw, err := NewCollectionWatcherWithTimings(
		fs,
		nil,
		root,
		200*time.Millisecond,
		debounceWin,
		func() {
			callbackCount.Add(1)
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	defer cw.Close()

	// Rapidly write 30 files over 90ms (interval 3ms < debounceWin 120ms)
	for i := 0; i < 30; i++ {
		f := filepath.Join(root, fmt.Sprintf("ext_rapid_%d.json", i))
		_ = os.WriteFile(f, []byte(fmt.Sprintf(`{"id":"rapid-%d"}`, i)), 0644)
		time.Sleep(3 * time.Millisecond)
	}

	// Wait until debounce expires
	time.Sleep(debounceWin + 100*time.Millisecond)

	if got := callbackCount.Load(); got != 1 {
		t.Fatalf("expected exactly 1 coalesced callback for rapid external writes, got %d", got)
	}
}

// TestAdversarial_Watcher_Concurrent_SelfWrite_And_ExternalMutation_Stress stress-tests
// the watcher under high concurrency with mixed self-writes, external writes, and dir manipulation.
func TestAdversarial_Watcher_Concurrent_SelfWrite_And_ExternalMutation_Stress(t *testing.T) {
	root := t.TempDir()
	fs := NewFileSystem()
	fs.SetCollectionRoot(root)

	var externalCallbacks atomic.Int32
	cw, err := NewCollectionWatcherWithTimings(
		fs,
		nil,
		root,
		150*time.Millisecond,
		50*time.Millisecond,
		func() {
			externalCallbacks.Add(1)
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	defer cw.Close()

	stop := make(chan struct{})
	var wg sync.WaitGroup

	// Routine 1: Self-writes (must be suppressed)
	wg.Add(1)
	go func() {
		defer wg.Done()
		i := 0
		for {
			select {
			case <-stop:
				return
			default:
				i++
				p := filepath.Join(root, fmt.Sprintf("self_%d.json", i%20))
				_ = fs.WriteJSON(p, map[string]string{"id": fmt.Sprintf("s-%d", i)})
				time.Sleep(5 * time.Millisecond)
			}
		}
	}()

	// Routine 2: Dynamic nested folder creation/deletion
	wg.Add(1)
	go func() {
		defer wg.Done()
		d := 0
		for {
			select {
			case <-stop:
				return
			default:
				d++
				dir := filepath.Join(root, fmt.Sprintf("dyn_dir_%d", d%5))
				_ = os.MkdirAll(dir, 0755)
				time.Sleep(15 * time.Millisecond)
				_ = os.RemoveAll(dir)
				time.Sleep(15 * time.Millisecond)
			}
		}
	}()

	// Let stress run for 1 second
	time.Sleep(1 * time.Second)
	close(stop)
	wg.Wait()
}

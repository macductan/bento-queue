package storage

import (
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

const (
	DefaultSelfWriteWindow = 400 * time.Millisecond
	DefaultDebounceWindow  = 300 * time.Millisecond
)

// CollectionWatcher recursively watches a collection root directory for external file changes
// (e.g. from the standalone `hecto` CLI) while suppressing in-app self-writes.
type CollectionWatcher struct {
	mu               sync.Mutex
	fs               *FileSystem
	logger           *slog.Logger
	watcher          *fsnotify.Watcher
	watchedDirs      map[string]bool
	rootDir          string
	selfWriteWindow  time.Duration
	debounceWindow   time.Duration
	debounceTimer    *time.Timer
	onExternalChange func()
	stopCh           chan struct{}
	closed           bool
}

// NewCollectionWatcher creates and starts a new CollectionWatcher on rootDir.
func NewCollectionWatcher(fileSys *FileSystem, logger *slog.Logger, rootDir string, onExternalChange func()) (*CollectionWatcher, error) {
	return NewCollectionWatcherWithTimings(fileSys, logger, rootDir, DefaultSelfWriteWindow, DefaultDebounceWindow, onExternalChange)
}

// NewCollectionWatcherWithTimings creates and starts a CollectionWatcher with custom timing windows.
func NewCollectionWatcherWithTimings(
	fileSys *FileSystem,
	logger *slog.Logger,
	rootDir string,
	selfWriteWindow time.Duration,
	debounceWindow time.Duration,
	onExternalChange func(),
) (*CollectionWatcher, error) {
	if logger == nil {
		logger = slog.Default()
	}
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	cw := &CollectionWatcher{
		fs:               fileSys,
		logger:           logger,
		watcher:          fsw,
		watchedDirs:      make(map[string]bool),
		selfWriteWindow:  selfWriteWindow,
		debounceWindow:   debounceWindow,
		onExternalChange: onExternalChange,
		stopCh:           make(chan struct{}),
	}

	if strings.TrimSpace(rootDir) != "" {
		if err := cw.SwitchRoot(rootDir); err != nil {
			_ = fsw.Close()
			return nil, err
		}
	}

	go cw.loop()
	return cw, nil
}

// SwitchRoot switches the watched collection root directory, removing old watches and
// recursively registering all subdirectories under newRoot.
func (cw *CollectionWatcher) SwitchRoot(newRoot string) error {
	cw.mu.Lock()
	defer cw.mu.Unlock()

	if cw.closed {
		return nil
	}

	cleaned := filepath.Clean(strings.TrimSpace(newRoot))
	if cleaned == cw.rootDir && len(cw.watchedDirs) > 0 {
		return nil
	}

	if cw.debounceTimer != nil {
		cw.debounceTimer.Stop()
		cw.debounceTimer = nil
	}

	for dir := range cw.watchedDirs {
		_ = cw.watcher.Remove(dir)
		delete(cw.watchedDirs, dir)
	}

	cw.rootDir = cleaned
	if cleaned == "" || cleaned == "." {
		return nil
	}

	return cw.addRecursiveLocked(cleaned)
}

// RootDir returns the currently watched collection root directory.
func (cw *CollectionWatcher) RootDir() string {
	cw.mu.Lock()
	defer cw.mu.Unlock()
	return cw.rootDir
}

// Close stops the watcher and releases underlying OS resources.
func (cw *CollectionWatcher) Close() error {
	cw.mu.Lock()
	if cw.closed {
		cw.mu.Unlock()
		return nil
	}
	cw.closed = true
	if cw.debounceTimer != nil {
		cw.debounceTimer.Stop()
		cw.debounceTimer = nil
	}
	close(cw.stopCh)
	err := cw.watcher.Close()
	cw.mu.Unlock()
	return err
}

func (cw *CollectionWatcher) addRecursiveLocked(dir string) error {
	info, err := os.Stat(dir)
	if err != nil || !info.IsDir() {
		return err
	}
	return filepath.WalkDir(dir, func(path string, d fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		name := d.Name()
		if path != dir && shouldIgnoreDirName(name) {
			return filepath.SkipDir
		}
		cleanPath := filepath.Clean(path)
		if !cw.watchedDirs[cleanPath] {
			if err := cw.watcher.Add(cleanPath); err == nil {
				cw.watchedDirs[cleanPath] = true
			}
		}
		return nil
	})
}

func shouldIgnoreDirName(name string) bool {
	return name == ".git" || name == ".history" || strings.HasPrefix(name, ".tmp-")
}

func shouldIgnoreEventPath(path string) bool {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if cleaned == "" || cleaned == "." {
		return true
	}
	base := filepath.Base(cleaned)
	if strings.HasPrefix(base, ".tmp-") || base == ".DS_Store" || strings.HasSuffix(base, "~") {
		return true
	}
	parts := strings.Split(filepath.ToSlash(cleaned), "/")
	for _, p := range parts {
		if p == ".git" || p == ".history" || strings.HasPrefix(p, ".tmp-") {
			return true
		}
	}
	return false
}

func (cw *CollectionWatcher) loop() {
	for {
		select {
		case <-cw.stopCh:
			return
		case ev, ok := <-cw.watcher.Events:
			if !ok {
				return
			}
			cw.handleEvent(ev)
		case err, ok := <-cw.watcher.Errors:
			if !ok {
				return
			}
			cw.logger.Debug("collection watcher error", "err", err)
		}
	}
}

func (cw *CollectionWatcher) handleEvent(ev fsnotify.Event) {
	if ev.Op == fsnotify.Chmod || ev.Op == 0 {
		return
	}
	if shouldIgnoreEventPath(ev.Name) {
		return
	}

	cw.mu.Lock()
	if cw.closed {
		cw.mu.Unlock()
		return
	}

	// If a new directory was created or renamed into the watched tree, recursively watch it
	// even if it was a self-write so future external edits inside that folder are captured.
	if ev.Op&(fsnotify.Create|fsnotify.Rename) != 0 {
		if info, err := os.Stat(ev.Name); err == nil && info.IsDir() {
			_ = cw.addRecursiveLocked(ev.Name)
		}
	}

	if ev.Op&(fsnotify.Remove|fsnotify.Rename) != 0 {
		cleanRemoved := filepath.Clean(ev.Name)
		if _, err := os.Stat(cleanRemoved); err != nil {
			prefix := cleanRemoved + string(filepath.Separator)
			for d := range cw.watchedDirs {
				if d == cleanRemoved || strings.HasPrefix(d, prefix) {
					_ = cw.watcher.Remove(d)
					delete(cw.watchedDirs, d)
				}
			}
		}
	}

	// Suppress events within Wails self-write window
	if cw.fs != nil && cw.fs.IsWithinSelfWriteWindow(cw.selfWriteWindow) {
		cw.mu.Unlock()
		return
	}

	if cw.debounceTimer != nil {
		cw.debounceTimer.Stop()
	}
	cb := cw.onExternalChange
	var t *time.Timer
	t = time.AfterFunc(cw.debounceWindow, func() {
		cw.mu.Lock()
		valid := !cw.closed && cw.debounceTimer == t
		if valid {
			cw.debounceTimer = nil
		}
		cw.mu.Unlock()
		if valid && cb != nil {
			cb()
		}
	})
	cw.debounceTimer = t
	cw.mu.Unlock()
}

// Package storage provides file I/O abstractions for reading and writing
// JSON entities to disk. All writes use atomic temp→fsync→rename pattern (AR-9).
package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"hecto-api/model"
)

// FileSystem provides file-based storage operations for JSON entities.
type FileSystem struct {
	mu                sync.RWMutex
	index             map[string]string // UUID → absolute path (AR-10)
	collectionRoot    string            // root dir for fallback walk in FindByUUID
	lastSelfWriteNano atomic.Int64      // unix nano timestamp of most recent self-write
}

// NewFileSystem creates a new FileSystem instance.
func NewFileSystem() *FileSystem {
	return &FileSystem{
		index: make(map[string]string),
	}
}

func shouldRecordSelfWrite(path string) bool {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if cleaned == "" || cleaned == "." {
		return false
	}
	if filepath.Base(cleaned) == "config.json" {
		return false
	}
	parts := strings.Split(filepath.ToSlash(cleaned), "/")
	for _, p := range parts {
		if p == ".history" {
			return false
		}
	}
	return true
}

// RecordSelfWrite marks the current timestamp as an in-app disk write so CollectionWatcher
// can suppress self-generated filesystem notifications.
func (f *FileSystem) RecordSelfWrite() {
	f.lastSelfWriteNano.Store(time.Now().UnixNano())
}

func (f *FileSystem) recordSelfWriteForPath(path string) {
	if !shouldRecordSelfWrite(path) {
		return
	}
	f.mu.RLock()
	collRoot := strings.TrimSpace(f.collectionRoot)
	f.mu.RUnlock()
	if collRoot != "" {
		cleanRoot := filepath.Clean(collRoot)
		cleanPath := filepath.Clean(strings.TrimSpace(path))
		if cleanPath != cleanRoot && !strings.HasPrefix(cleanPath, cleanRoot+string(filepath.Separator)) {
			return
		}
	}
	f.RecordSelfWrite()
}

// IsWithinSelfWriteWindow returns true if a self-write was recorded within the given duration window.
func (f *FileSystem) IsWithinSelfWriteWindow(window time.Duration) bool {
	last := f.lastSelfWriteNano.Load()
	if last == 0 {
		return false
	}
	elapsed := time.Since(time.Unix(0, last))
	return elapsed <= window
}

// SetCollectionRoot sets the collection root directory used for
// fallback walk when FindByUUID has an index miss.
// If switching from a different non-empty collection root, clears stale index entries.
func (f *FileSystem) SetCollectionRoot(root string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.collectionRoot != "" && root != "" && filepath.Clean(f.collectionRoot) != filepath.Clean(root) {
		f.index = make(map[string]string)
	}
	f.collectionRoot = root
}

// ReadJSON reads a JSON file at the given path and unmarshals it into dest.
// Returns NOT_FOUND if the file does not exist, PARSE_ERROR if JSON is invalid.
func (f *FileSystem) ReadJSON(path string, dest interface{}) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("%s: %s", model.ErrNotFound, path)
		}
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := json.Unmarshal(data, dest); err != nil {
		return fmt.Errorf("%s: %w", model.ErrParse, err)
	}

	return nil
}

// WriteJSON marshals data to JSON and writes it to the given path atomically.
// Uses temp file → fsync → rename pattern to prevent corruption (AR-9).
func (f *FileSystem) WriteJSON(path string, data interface{}) error {
	f.recordSelfWriteForPath(path)
	defer f.recordSelfWriteForPath(path)

	content, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("%s: %w", model.ErrParse, err)
	}

	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	tmpFile, err := os.CreateTemp(dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}
	tmpPath := tmpFile.Name()

	// Cleanup on failure
	success := false
	defer func() {
		if !success {
			tmpFile.Close()
			os.Remove(tmpPath)
		}
	}()

	if _, err := tmpFile.Write(content); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	// Append newline for Git-friendliness
	if _, err := tmpFile.Write([]byte("\n")); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := tmpFile.Sync(); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := tmpFile.Close(); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	success = true
	slog.Debug("wrote JSON file", "path", path)
	return nil
}

// Delete removes a file or empty directory at the given path.
// Returns NOT_FOUND if the path does not exist.
func (f *FileSystem) Delete(path string) error {
	f.recordSelfWriteForPath(path)
	defer f.recordSelfWriteForPath(path)

	if _, err := os.Stat(path); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("%s: %s", model.ErrNotFound, path)
		}
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := os.RemoveAll(path); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	slog.Debug("deleted path", "path", path)
	return nil
}

// MoveFile moves a file from src to dest.
// Returns NOT_FOUND if src does not exist.
func (f *FileSystem) MoveFile(src, dest string) error {
	if shouldRecordSelfWrite(src) || shouldRecordSelfWrite(dest) {
		f.RecordSelfWrite()
		defer f.RecordSelfWrite()
	}

	if _, err := os.Stat(src); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return fmt.Errorf("%s: %s", model.ErrNotFound, src)
		}
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	destDir := filepath.Dir(dest)
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := os.Rename(src, dest); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	slog.Debug("moved file", "src", src, "dest", dest)
	return nil
}

// ListDir returns a list of os.DirEntry for the given directory.
// Returns NOT_FOUND if the directory does not exist.
func (f *FileSystem) ListDir(path string) ([]os.DirEntry, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil, fmt.Errorf("%s: %s", model.ErrNotFound, path)
		}
		return nil, fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	return entries, nil
}

// MakeDir creates a directory and all necessary parents.
func (f *FileSystem) MakeDir(path string) error {
	f.recordSelfWriteForPath(path)
	defer f.recordSelfWriteForPath(path)

	if err := os.MkdirAll(path, 0755); err != nil {
		return fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	slog.Debug("created directory", "path", path)
	return nil
}

// Exists returns true if the given path exists on disk.
func (f *FileSystem) Exists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

// IndexSet adds or updates a UUID→path mapping in the in-memory index.
func (f *FileSystem) IndexSet(uuid, path string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.index[uuid] = path
}

// IndexDelete removes a UUID from the in-memory index.
func (f *FileSystem) IndexDelete(uuid string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.index, uuid)
}

// IndexDeleteByPrefix removes all UUIDs from the index whose paths start with prefix.
func (f *FileSystem) IndexDeleteByPrefix(prefix string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	dir := filepath.Clean(prefix)
	dirWithSep := dir + string(filepath.Separator)
	for id, path := range f.index {
		if path == dir || strings.HasPrefix(path, dirWithSep) {
			delete(f.index, id)
		}
	}
}

// IndexUpdatePrefix updates the path of oldPrefix and all entries nested under oldPrefix
// to start with newPrefix instead.
func (f *FileSystem) IndexUpdatePrefix(oldPrefix, newPrefix string) {
	f.mu.Lock()
	defer f.mu.Unlock()
	oldClean := filepath.Clean(oldPrefix)
	newClean := filepath.Clean(newPrefix)
	oldWithSep := oldClean + string(filepath.Separator)
	for id, p := range f.index {
		cleanP := filepath.Clean(p)
		if cleanP == oldClean {
			f.index[id] = newClean
		} else if strings.HasPrefix(cleanP, oldWithSep) {
			rel := strings.TrimPrefix(cleanP, oldWithSep)
			f.index[id] = filepath.Join(newClean, rel)
		}
	}
}

// FindByUUID returns the path for the given UUID from the in-memory index.
// On index miss or stale cache entry (file moved/deleted externally), performs a
// fallback walk of the collection root directory, scanning JSON files for a matching
// "id" field. If found, the index is updated and the path is returned.
func (f *FileSystem) FindByUUID(uuid string) (string, error) {
	if uuid == "" {
		return "", fmt.Errorf("%s: uuid empty", model.ErrNotFound)
	}

	f.mu.RLock()
	path, ok := f.index[uuid]
	collRoot := f.collectionRoot
	f.mu.RUnlock()

	if ok {
		isRootDir := collRoot != "" && filepath.Clean(path) == filepath.Clean(collRoot)
		if f.Exists(path) && (strings.HasSuffix(path, ".json") || f.Exists(filepath.Join(path, "_folder.json")) || isRootDir) {
			return path, nil
		}
		// Self-healing: cached path no longer exists on disk (or folder lost _folder.json)
		f.IndexDelete(uuid)
	}

	// Fallback walk if collection root is set
	if collRoot == "" {
		return "", fmt.Errorf("%s: uuid %s", model.ErrNotFound, uuid)
	}

	found, err := f.walkFindUUID(collRoot, uuid)
	if err != nil {
		return "", err
	}

	// Cache the result for future O(1) lookups
	f.IndexSet(uuid, found)
	slog.Debug("FindByUUID fallback walk hit", "uuid", uuid, "path", found)
	return found, nil
}

// walkJSONEntities is a shared helper that walks the directory tree looking for JSON files.
// It skips environments/ and collection.json.
// For _folder.json it yields the directory path.
// For each valid file, it unmarshals only the "id" field and calls fn(path, id, err).
func (f *FileSystem) walkJSONEntities(root string, fn func(path, id string, err error) error) error {
	envsDir := filepath.Join(root, "environments")
	gitDir := filepath.Join(root, ".git")
	historyDir := filepath.Join(root, ".history")

	return filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil // skip unreadable entries
		}

		// Skip environments, .git, and .history directories
		if d.IsDir() && (path == envsDir || path == gitDir || path == historyDir) {
			return filepath.SkipDir
		}

		if d.IsDir() {
			return nil
		}

		// Only process .json files, skip metadata files
		name := d.Name()
		if filepath.Ext(name) != ".json" {
			return nil
		}
		if name == "collection.json" || name == "mock-server.json" {
			return nil
		}

		// Read and check for matching UUID
		var entity struct {
			ID string `json:"id"`
		}
		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return fn(path, "", readErr)
		}
		if jsonErr := json.Unmarshal(data, &entity); jsonErr != nil {
			return fn(path, "", jsonErr)
		}

		if name == "_folder.json" {
			return fn(filepath.Dir(path), entity.ID, nil)
		}

		return fn(path, entity.ID, nil)
	})
}

// walkFindUUID scans the directory tree for a JSON file containing the given UUID.
// Skips _folder.json, collection.json, and files in environments/ directory.
func (f *FileSystem) walkFindUUID(root, uuid string) (string, error) {
	var found string

	err := f.walkJSONEntities(root, func(path, id string, err error) error {
		if err != nil {
			return nil // skip errors
		}
		if id == uuid {
			found = path
			return filepath.SkipAll
		}
		return nil
	})

	if err != nil {
		return "", fmt.Errorf("%s: walk error: %w", model.ErrIO, err)
	}

	if found == "" {
		return "", fmt.Errorf("%s: uuid %s", model.ErrNotFound, uuid)
	}

	return found, nil
}

// IndexRebuild walks the collection root and rebuilds the entire UUID→path
// index from disk. Scans all .json files (except _folder.json, collection.json,
// and files in environments/). Called by GetCollectionTree at startup.
func (f *FileSystem) IndexRebuild(root string) error {
	f.mu.Lock()
	f.collectionRoot = root
	// Clear existing index
	f.index = make(map[string]string)
	f.mu.Unlock()

	err := f.walkJSONEntities(root, func(path, id string, err error) error {
		if err != nil {
			slog.Warn("IndexRebuild: skipping file", "path", path, "error", err)
			return nil
		}
		if id != "" {
			f.IndexSet(id, path)
		}
		return nil
	})

	if err != nil {
		return fmt.Errorf("%s: index rebuild walk error: %w", model.ErrIO, err)
	}

	slog.Info("IndexRebuild complete", "root", root, "entries", len(f.index))
	return nil
}

// IndexClear removes all entries from the in-memory index.
func (f *FileSystem) IndexClear() {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.index = make(map[string]string)
}

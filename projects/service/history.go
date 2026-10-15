package service

import (
	"log/slog"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/storage"
)

const (
	historyDirName      = ".history"
	executionsFileName  = "executions.json"
	changelogFileName   = "changelog.json"
	maxExecutionEntries = 100
	maxChangelogEntries = 200
)

// HistoryService manages Request Execution History and Collection Changelog on disk.
type HistoryService struct {
	mu     sync.Mutex
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewHistoryService creates a new HistoryService.
func NewHistoryService(fs *storage.FileSystem, logger *slog.Logger) *HistoryService {
	return &HistoryService{
		fs:     fs,
		logger: logger,
	}
}

func (s *HistoryService) executionsPath(collRoot string) string {
	return filepath.Join(collRoot, historyDirName, executionsFileName)
}

func (s *HistoryService) changelogPath(collRoot string) string {
	return filepath.Join(collRoot, historyDirName, changelogFileName)
}

func (s *HistoryService) readExecutionsLocked(collRoot string) []model.ExecutionHistoryEntry {
	path := s.executionsPath(collRoot)
	if !s.fs.Exists(path) {
		return []model.ExecutionHistoryEntry{}
	}
	var entries []model.ExecutionHistoryEntry
	if err := s.fs.ReadJSON(path, &entries); err != nil {
		s.logger.Warn("failed to read executions.json, resetting", "path", path, "error", err)
		return []model.ExecutionHistoryEntry{}
	}
	if entries == nil {
		return []model.ExecutionHistoryEntry{}
	}
	return entries
}

func (s *HistoryService) readChangelogLocked(collRoot string) []model.ChangelogEntry {
	path := s.changelogPath(collRoot)
	if !s.fs.Exists(path) {
		return []model.ChangelogEntry{}
	}
	var entries []model.ChangelogEntry
	if err := s.fs.ReadJSON(path, &entries); err != nil {
		s.logger.Warn("failed to read changelog.json, resetting", "path", path, "error", err)
		return []model.ChangelogEntry{}
	}
	if entries == nil {
		return []model.ChangelogEntry{}
	}
	return entries
}

// ListExecutions returns all execution history entries for the given collection root (newest first).
func (s *HistoryService) ListExecutions(collRoot string) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewSuccess([]model.ExecutionHistoryEntry{})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries := s.readExecutionsLocked(collRoot)
	return model.NewSuccess(entries)
}

// RecordExecution prepends a new execution history entry and trims to maxExecutionEntries.
func (s *HistoryService) RecordExecution(collRoot string, entry model.ExecutionHistoryEntry) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(entry.ID) == "" {
		entry.ID = uuid.New().String()
	}
	if strings.TrimSpace(entry.Timestamp) == "" {
		entry.Timestamp = time.Now().UTC().Format(time.RFC3339)
	}
	if strings.TrimSpace(entry.Method) == "" {
		entry.Method = entry.Request.Method
	}
	if strings.TrimSpace(entry.URL) == "" {
		entry.URL = entry.Request.URL
	}
	if strings.TrimSpace(entry.RequestName) == "" {
		entry.RequestName = entry.URL
	}
	if entry.Response != nil && entry.StatusCode == 0 {
		entry.StatusCode = entry.Response.StatusCode
		entry.StatusText = entry.Response.StatusText
		entry.TimeMs = int64(entry.Response.TimeMs)
		entry.SizeBytes = int64(entry.Response.SizeBytes)
	}

	existing := s.readExecutionsLocked(collRoot)
	updated := make([]model.ExecutionHistoryEntry, 0, len(existing)+1)
	updated = append(updated, entry)
	updated = append(updated, existing...)
	if len(updated) > maxExecutionEntries {
		updated = updated[:maxExecutionEntries]
	}

	if err := s.fs.WriteJSON(s.executionsPath(collRoot), updated); err != nil {
		s.logger.Error("failed to write executions.json", "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu lịch sử gọi API")
	}

	return model.NewSuccess(entry)
}

// ClearExecutions removes all execution history entries for the collection.
func (s *HistoryService) ClearExecutions(collRoot string) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	empty := []model.ExecutionHistoryEntry{}
	if err := s.fs.WriteJSON(s.executionsPath(collRoot), empty); err != nil {
		s.logger.Error("failed to clear executions.json", "error", err)
		return model.NewError(model.ErrIO, "Không thể xóa lịch sử gọi API")
	}
	return model.NewSuccess(empty)
}

// ListChangelog returns all changelog entries for the given collection root (newest first).
func (s *HistoryService) ListChangelog(collRoot string) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewSuccess([]model.ChangelogEntry{})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	entries := s.readChangelogLocked(collRoot)
	return model.NewSuccess(entries)
}

// RecordChangelog prepends a new changelog entry and trims to maxChangelogEntries.
func (s *HistoryService) RecordChangelog(collRoot string, entry model.ChangelogEntry) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	if strings.TrimSpace(entry.ID) == "" {
		entry.ID = uuid.New().String()
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now().UTC()
	}

	existing := s.readChangelogLocked(collRoot)
	updated := make([]model.ChangelogEntry, 0, len(existing)+1)
	updated = append(updated, entry)
	updated = append(updated, existing...)
	if len(updated) > maxChangelogEntries {
		updated = updated[:maxChangelogEntries]
	}

	if err := s.fs.WriteJSON(s.changelogPath(collRoot), updated); err != nil {
		s.logger.Error("failed to write changelog.json", "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu lịch sử thay đổi")
	}

	return model.NewSuccess(entry)
}

// ClearChangelog removes all changelog entries for the collection.
func (s *HistoryService) ClearChangelog(collRoot string) model.Result {
	if strings.TrimSpace(collRoot) == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	empty := []model.ChangelogEntry{}
	if err := s.fs.WriteJSON(s.changelogPath(collRoot), empty); err != nil {
		s.logger.Error("failed to clear changelog.json", "error", err)
		return model.NewError(model.ErrIO, "Không thể xóa lịch sử thay đổi")
	}
	return model.NewSuccess(empty)
}

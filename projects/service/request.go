// Package service contains business logic for hecto-api.
// Services are independent of Wails and testable without Wails context (AD-5).
package service

import (
	"log/slog"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/slug"
	"hecto-api/storage"
)

// RequestService handles CRUD operations for API requests.
type RequestService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewRequestService creates a new RequestService.
func NewRequestService(fs *storage.FileSystem, logger *slog.Logger) *RequestService {
	return &RequestService{fs: fs, logger: logger}
}

// Get retrieves a request by UUID.
func (s *RequestService) Get(id string) model.Result {
	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), "Request không tìm thấy")
	}

	var req model.Request
	if err := s.fs.ReadJSON(path, &req); err != nil {
		s.logger.Error("failed to read request", "id", id, "error", err)
		return model.NewError(storageErrCode(err), "Không thể đọc dữ liệu request")
	}

	return model.NewSuccess(req)
}

// Save persists a request to disk.
func (s *RequestService) Save(req model.Request) model.Result {
	path, err := s.fs.FindByUUID(req.ID)
	if err != nil {
		return model.NewError(storageErrCode(err), "Request không tìm thấy")
	}

	if !s.fs.Exists(path) {
		s.fs.IndexDelete(req.ID)
		return model.NewError(model.ErrNotFound, "Request không tìm thấy")
	}

	if err := s.fs.WriteJSON(path, req); err != nil {
		s.logger.Error("failed to save request", "id", req.ID, "error", err)
		return model.NewError(storageErrCode(err), "Không thể lưu request")
	}

	return model.NewSuccess(nil)
}

// Delete removes a request from disk.
func (s *RequestService) Delete(id string) model.Result {
	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), "Request không tìm thấy")
	}

	if !strings.HasSuffix(path, ".json") {
		return model.NewError(model.ErrValidation, "ID không trỏ tới một file request hợp lệ")
	}

	if err := s.fs.Delete(path); err != nil {
		if storageErrCode(err) == model.ErrNotFound {
			s.fs.IndexDelete(id)
			return model.NewError(model.ErrNotFound, "Request không tìm thấy")
		}
		s.logger.Error("failed to delete request", "id", id, "error", err)
		return model.NewError(storageErrCode(err), "Không thể xóa request")
	}

	s.fs.IndexDelete(id)
	return model.NewSuccess(nil)
}

// Rename updates the name of a request.
func (s *RequestService) Rename(id, newName string) model.Result {
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return model.NewError(model.ErrValidation, "Tên request không được để trống")
	}
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), "Request không tìm thấy")
	}

	var req model.Request
	if err := s.fs.ReadJSON(path, &req); err != nil {
		s.logger.Error("failed to read request for rename", "id", id, "error", err)
		return model.NewError(storageErrCode(err), "Không thể đọc dữ liệu request")
	}

	if req.Name == newName {
		return model.NewSuccess(nil)
	}

	req.Name = newName
	req.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(path, req); err != nil {
		s.logger.Error("failed to update request name", "id", id, "error", err)
		return model.NewError(storageErrCode(err), "Không thể lưu tên request mới")
	}

	return model.NewSuccess(nil)
}

// Duplicate creates a copy of a request in the same folder.
func (s *RequestService) Duplicate(id string) model.Result {
	if id == "" {
		return model.NewError(model.ErrValidation, "ID không hợp lệ")
	}

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), "Request không tìm thấy")
	}
	if !strings.HasSuffix(path, ".json") {
		return model.NewError(model.ErrValidation, "ID không trỏ tới một file request hợp lệ")
	}

	var req model.Request
	if err := s.fs.ReadJSON(path, &req); err != nil {
		s.logger.Error("failed to read request for duplicate", "id", id, "error", err)
		return model.NewError(storageErrCode(err), "Không thể đọc dữ liệu request")
	}

	newName := req.Name + " (bản sao)"
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	req.ID = uuid.New().String()
	req.Name = newName
	now := time.Now()
	req.CreatedAt = now
	req.UpdatedAt = now

	dir := filepath.Dir(path)
	newFilename := slug.GenerateUnique(newName, dir)
	newPath := filepath.Join(dir, newFilename)

	if err := s.fs.WriteJSON(newPath, req); err != nil {
		s.logger.Error("failed to write duplicated request", "newId", req.ID, "error", err)
		return model.NewError(storageErrCode(err), "Không thể lưu request bản sao")
	}

	s.fs.IndexSet(req.ID, newPath)
	return model.NewSuccess(req)
}

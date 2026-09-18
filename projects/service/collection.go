package service

import (
	"log/slog"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/slug"
	"hecto-api/storage"
)

// CollectionService handles collection tree and folder CRUD operations.
type CollectionService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewCollectionService creates a new CollectionService.
func NewCollectionService(fs *storage.FileSystem, logger *slog.Logger) *CollectionService {
	return &CollectionService{fs: fs, logger: logger}
}

const folderMetaFile = "_folder.json"

// GetTree returns the collection tree structure.
func (s *CollectionService) GetTree(rootPath string) model.Result {
	s.logger.Info("GetCollectionTree called", "root", rootPath)

	if rootPath == "" {
		s.logger.Error("collection root is empty")
		return model.NewError(model.ErrIO, "Đường dẫn collection trống")
	}

	if err := s.fs.IndexRebuild(rootPath); err != nil {
		s.logger.Warn("failed to rebuild index", "error", err)
	}

	tree, err := s.buildTree(rootPath)
	if err != nil {
		s.logger.Error("failed to build tree", "error", err)
		return model.NewError(model.ErrIO, "Không thể tải cấu trúc thư mục")
	}

	return model.NewSuccess(tree)
}

func (s *CollectionService) buildTree(dirPath string) ([]model.TreeNode, error) {
	entries, err := s.fs.ListDir(dirPath)
	if err != nil {
		return nil, err
	}

	// Initialise as empty slice (not nil) so empty collections serialise as []
	nodes := []model.TreeNode{}

	for _, entry := range entries {
		name := entry.Name()
		fullPath := filepath.Join(dirPath, name)

		if entry.IsDir() && name == "environments" {
			continue
		}

		if entry.IsDir() {
			node, ok := s.buildFolderNode(fullPath)
			if ok {
				nodes = append(nodes, node)
			}
		} else if strings.HasSuffix(name, ".json") && name != folderMetaFile && name != "collection.json" {
			node, ok := s.buildRequestNode(fullPath)
			if ok {
				nodes = append(nodes, node)
			}
		}
	}

	sort.SliceStable(nodes, func(i, j int) bool {
		ni, nj := nodes[i], nodes[j]
		if ni.Type != nj.Type {
			return ni.Type == "folder"
		}
		nameI := strings.ToLower(ni.Name)
		nameJ := strings.ToLower(nj.Name)
		if nameI != nameJ {
			return nameI < nameJ
		}
		return ni.ID < nj.ID
	})

	return nodes, nil
}

func (s *CollectionService) buildFolderNode(fullPath string) (model.TreeNode, bool) {
	folderMetaPath := filepath.Join(fullPath, folderMetaFile)
	var folder model.Folder
	if err := s.fs.ReadJSON(folderMetaPath, &folder); err != nil {
		s.logger.Warn("skipping folder with unreadable _folder.json", "path", folderMetaPath, "error", err)
		return model.TreeNode{}, false
	}

	// Add folder UUID to index so Rename/Delete can find it later (AR-10)
	s.fs.IndexSet(folder.ID, fullPath)

	children, err := s.buildTree(fullPath)
	if err != nil {
		s.logger.Warn("error reading folder children", "path", fullPath, "error", err)
	}
	if children == nil {
		children = []model.TreeNode{}
	}

	return model.TreeNode{
		ID:        folder.ID,
		Name:      folder.Name,
		Type:      "folder",
		Path:      fullPath,
		Children:  children,
		CreatedAt: folder.CreatedAt,
	}, true
}

func (s *CollectionService) buildRequestNode(fullPath string) (model.TreeNode, bool) {
	var req model.Request
	if err := s.fs.ReadJSON(fullPath, &req); err != nil {
		s.logger.Warn("skipping unreadable request file", "path", fullPath, "error", err)
		return model.TreeNode{}, false
	}

	if req.ID == "" {
		s.logger.Warn("skipping json file with empty request ID", "path", fullPath)
		return model.TreeNode{}, false
	}

	return model.TreeNode{
		ID:        req.ID,
		Name:      req.Name,
		Type:      "request",
		Method:    req.Method,
		Path:      fullPath,
		CreatedAt: req.CreatedAt,
	}, true
}

// CreateFolder creates a new folder on disk.
func (s *CollectionService) CreateFolder(rootPath, parentFolderID string) model.Result {
	s.logger.Info("CreateFolder called", "root", rootPath, "parent", parentFolderID)

	if rootPath == "" {
		s.logger.Error("rootPath is required in CreateFolder")
		return model.NewError(model.ErrValidation, "Đường dẫn collection trống")
	}

	id := uuid.New().String()
	name := "Thư mục mới"
	now := time.Now()

	folder := model.Folder{
		ID:        id,
		Name:      name,
		CreatedAt: now,
		UpdatedAt: now,
	}

	targetDir := rootPath
	if parentFolderID != "" {
		folderPath, err := s.fs.FindByUUID(parentFolderID)
		if err != nil {
			return model.NewError(model.ErrNotFound, "Không tìm thấy thư mục cha")
		}
		if !s.fs.Exists(filepath.Join(folderPath, folderMetaFile)) || !isDeletableFolderPath(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, "Thư mục cha không hợp lệ")
		}
		targetDir = folderPath
	}

	folderName := slug.GenerateUniqueDir(name, targetDir)
	folderPath := filepath.Join(targetDir, folderName)

	if err := s.fs.MakeDir(folderPath); err != nil {
		s.logger.Error("failed to create folder directory", "path", folderPath, "error", err)
		return model.NewError(model.ErrIO, "Không thể tạo thư mục")
	}

	metaPath := filepath.Join(folderPath, "_folder.json")
	if err := s.fs.WriteJSON(metaPath, folder); err != nil {
		// Cleanup orphaned directory to keep disk state consistent
		os.Remove(folderPath)
		s.logger.Error("failed to write _folder.json", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu thông tin thư mục")
	}

	s.fs.IndexSet(id, folderPath)

	node := model.TreeNode{
		ID:        id,
		Name:      name,
		Type:      "folder",
		Path:      folderPath,
		Children:  []model.TreeNode{},
		CreatedAt: now,
	}

	return model.NewSuccess(node)
}

// CreateRequest creates a new request on disk.
func (s *CollectionService) CreateRequest(rootPath, parentFolderID string) model.Result {
	s.logger.Info("CreateRequest called", "root", rootPath, "parent", parentFolderID)

	if rootPath == "" {
		s.logger.Error("rootPath is required in CreateRequest")
		return model.NewError(model.ErrValidation, "Đường dẫn collection trống")
	}

	id := uuid.New().String()
	name := "Request mới"
	now := time.Now()

	req := model.Request{
		ID:        id,
		Name:      name,
		Method:    "GET",
		URL:       "",
		Headers:   []model.KVPair{},
		Params:    []model.KVPair{},
		Body:      model.Body{Type: "none", Content: ""},
		CreatedAt: now,
		UpdatedAt: now,
	}

	targetDir := rootPath
	if parentFolderID != "" {
		folderPath, err := s.fs.FindByUUID(parentFolderID)
		if err != nil {
			return model.NewError(model.ErrNotFound, "Không tìm thấy thư mục cha")
		}
		if !s.fs.Exists(filepath.Join(folderPath, folderMetaFile)) || !isDeletableFolderPath(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, "Thư mục cha không hợp lệ")
		}
		targetDir = folderPath
	}

	filename := slug.GenerateUnique(name, targetDir)
	filePath := filepath.Join(targetDir, filename)

	if err := s.fs.WriteJSON(filePath, req); err != nil {
		s.logger.Error("failed to write request json", "path", filePath, "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu request")
	}

	s.fs.IndexSet(id, filePath)

	node := model.TreeNode{
		ID:        id,
		Name:      name,
		Type:      "request",
		Method:    "GET",
		Path:      filePath,
		CreatedAt: now,
	}

	return model.NewSuccess(node)
}

// RenameFolder renames a folder (updates _folder.json, keeps slug unchanged).
func (s *CollectionService) RenameFolder(id, newName string) model.Result {
	s.logger.Info("RenameFolder called", "id", id, "name", newName)

	newName = strings.TrimSpace(newName)
	if newName == "" {
		return model.NewError(model.ErrValidation, "Tên thư mục không được để trống")
	}
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	folderDir, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, "Không tìm thấy thư mục")
	}

	metaPath := filepath.Join(folderDir, folderMetaFile)
	var folder model.Folder
	if err := s.fs.ReadJSON(metaPath, &folder); err != nil {
		s.logger.Error("failed to read folder metadata", "id", id, "error", err)
		return model.NewError(model.ErrIO, "Không thể đọc dữ liệu thư mục")
	}

	if folder.Name == newName {
		return model.NewSuccess(nil)
	}

	folder.Name = newName
	folder.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(metaPath, folder); err != nil {
		s.logger.Error("failed to update folder metadata", "id", id, "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu tên thư mục mới")
	}

	return model.NewSuccess(nil)
}

// DeleteFolder removes a folder and all its contents from disk.
// Only folders strictly inside rootPath (excluding environments/) can be deleted.
func (s *CollectionService) DeleteFolder(rootPath, id string) model.Result {
	s.logger.Info("DeleteFolder called", "root", rootPath, "id", id)

	if rootPath == "" || id == "" {
		return model.NewError(model.ErrValidation, "rootPath và id là bắt buộc")
	}

	folderPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, "Không tìm thấy thư mục")
	}

	if !isDeletableFolderPath(rootPath, folderPath) {
		s.logger.Warn("refusing to delete path outside deletable scope", "root", rootPath, "path", folderPath)
		return model.NewError(model.ErrValidation, "Đường dẫn không phải là thư mục hợp lệ")
	}

	// Double check that it's actually a folder by checking for _folder.json
	metaPath := filepath.Join(folderPath, folderMetaFile)
	if !s.fs.Exists(metaPath) {
		return model.NewError(model.ErrValidation, "Đường dẫn không phải là thư mục hợp lệ")
	}

	if err := s.fs.Delete(folderPath); err != nil {
		s.logger.Error("failed to delete folder", "path", folderPath, "error", err)
		return model.NewError(storageErrCode(err), "Không thể xóa thư mục")
	}

	// Remove all UUIDs within this folder from the index
	s.fs.IndexDeleteByPrefix(folderPath)
	// Remove the folder itself from the index
	s.fs.IndexDelete(id)

	return model.NewSuccess(nil)
}

// isDeletableFolderPath reports whether folderPath lies strictly inside rootPath
// and is not the environments/ directory (or anything under it).
func isDeletableFolderPath(rootPath, folderPath string) bool {
	rel, err := filepath.Rel(rootPath, folderPath)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false
	}
	return rel != "environments" && !strings.HasPrefix(rel, "environments"+string(filepath.Separator))
}

// isInsideRoot reports whether path p is inside rootPath.
func isInsideRoot(rootPath, p string) bool {
	rel, err := filepath.Rel(rootPath, p)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return false
	}
	return true
}

// MoveRequest moves a request to a new folder. targetFolderID can be empty for root.
func (s *CollectionService) MoveRequest(rootPath, id, targetFolderID string) model.Result {
	if rootPath == "" {
		return model.NewError(model.ErrValidation, "Đường dẫn collection trống")
	}
	if id == "" {
		return model.NewError(model.ErrValidation, "ID không hợp lệ")
	}

	srcPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, "Request không tìm thấy")
	}
	if !strings.HasSuffix(srcPath, ".json") {
		return model.NewError(model.ErrValidation, "ID không trỏ tới một file request hợp lệ")
	}

	if !isInsideRoot(rootPath, filepath.Dir(srcPath)) {
		return model.NewError(model.ErrValidation, "Request không nằm trong collection root")
	}

	targetDir := rootPath
	if targetFolderID != "" {
		folderPath, err := s.fs.FindByUUID(targetFolderID)
		if err != nil {
			return model.NewError(model.ErrValidation, "Thư mục đích không tìm thấy")
		}
		if !s.fs.Exists(filepath.Join(folderPath, folderMetaFile)) || !isDeletableFolderPath(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, "Thư mục đích không hợp lệ")
		}
		targetDir = folderPath
	}

	if !isInsideRoot(rootPath, targetDir) {
		return model.NewError(model.ErrValidation, "Thư mục đích không nằm trong collection root")
	}
	if strings.HasPrefix(targetDir, filepath.Join(rootPath, "environments")) {
		return model.NewError(model.ErrValidation, "Không thể chuyển request vào thư mục environments")
	}

	if filepath.Dir(srcPath) == targetDir {
		return model.NewSuccess(nil)
	}

	filename := filepath.Base(srcPath)
	newFilename := slug.UniqueFilename(filename, targetDir)
	newPath := filepath.Join(targetDir, newFilename)

	if err := s.fs.MoveFile(srcPath, newPath); err != nil {
		s.logger.Error("failed to move request", "id", id, "error", err)
		return model.NewError(model.ErrIO, "Không thể di chuyển request")
	}

	s.fs.IndexSet(id, newPath)
	return model.NewSuccess(nil)
}

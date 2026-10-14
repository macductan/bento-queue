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
		return model.NewError(model.ErrIO, ErrCollectionRootEmpty)
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

	if folder.Auth == nil {
		folder.Auth = &model.AuthConfig{Type: "inherit"}
	}

	return model.TreeNode{
		ID:         folder.ID,
		Name:       folder.Name,
		Type:       "folder",
		Path:       fullPath,
		Children:   children,
		Variables:  folder.Variables,
		FolderEnvs: folder.FolderEnvs,
		Headers:    folder.Headers,
		Auth:       folder.Auth,
		CreatedAt:  folder.CreatedAt,
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

	if req.Auth == nil {
		req.Auth = &model.AuthConfig{Type: "inherit"}
	}

	return model.TreeNode{
		ID:        req.ID,
		Name:      req.Name,
		Type:      "request",
		Method:    req.Method,
		Path:      fullPath,
		Auth:      req.Auth,
		CreatedAt: req.CreatedAt,
	}, true
}

// CreateFolder creates a new folder on disk.
func (s *CollectionService) CreateFolder(rootPath, parentFolderID string) model.Result {
	s.logger.Info("CreateFolder called", "root", rootPath, "parent", parentFolderID)

	if rootPath == "" {
		s.logger.Error("rootPath is required in CreateFolder")
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	id := uuid.New().String()
	name := "Thư mục mới"
	now := time.Now()

	folder := model.Folder{
		ID:        id,
		Name:      name,
		Variables: []model.KVPair{},
		Headers:   []model.KVPair{},
		Auth:      &model.AuthConfig{Type: "inherit"},
		CreatedAt: now,
		UpdatedAt: now,
	}

	targetDir := rootPath
	if parentFolderID != "" {
		folderPath, err := s.fs.FindByUUID(parentFolderID)
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrParentFolderNotFound)
		}
		if !s.fs.Exists(filepath.Join(folderPath, folderMetaFile)) || !isDeletableFolderPath(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrParentFolderInvalid)
		}
		targetDir = folderPath
	}

	folderName := id
	folderPath := filepath.Join(targetDir, folderName)

	if err := s.fs.MakeDir(folderPath); err != nil {
		s.logger.Error("failed to create folder directory", "path", folderPath, "error", err)
		return model.NewError(model.ErrIO, ErrFolderCreateFailed)
	}

	metaPath := filepath.Join(folderPath, "_folder.json")
	if err := s.fs.WriteJSON(metaPath, folder); err != nil {
		// Cleanup orphaned directory to keep disk state consistent
		os.Remove(folderPath)
		s.logger.Error("failed to write _folder.json", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, ErrFolderInfoSaveFailed)
	}

	s.fs.IndexSet(id, folderPath)

	node := model.TreeNode{
		ID:        id,
		Name:      name,
		Type:      "folder",
		Path:      folderPath,
		Children:  []model.TreeNode{},
		Variables: []model.KVPair{},
		Headers:   []model.KVPair{},
		Auth:      folder.Auth,
		CreatedAt: now,
	}

	return model.NewSuccess(node)
}

// CreateRequest creates a new request on disk.
func (s *CollectionService) CreateRequest(rootPath, parentFolderID string) model.Result {
	s.logger.Info("CreateRequest called", "root", rootPath, "parent", parentFolderID)

	if rootPath == "" {
		s.logger.Error("rootPath is required in CreateRequest")
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
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
		Auth:      &model.AuthConfig{Type: "inherit"},
		CreatedAt: now,
		UpdatedAt: now,
	}

	targetDir := rootPath
	if parentFolderID != "" {
		folderPath, err := s.fs.FindByUUID(parentFolderID)
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrParentFolderNotFound)
		}
		if !s.fs.Exists(filepath.Join(folderPath, folderMetaFile)) || !isDeletableFolderPath(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrParentFolderInvalid)
		}
		targetDir = folderPath
	}

	filename := slug.RequestFilename(id)
	filePath := filepath.Join(targetDir, filename)

	if err := s.fs.WriteJSON(filePath, req); err != nil {
		s.logger.Error("failed to write request json", "path", filePath, "error", err)
		return model.NewError(model.ErrIO, ErrRequestSaveFailed)
	}

	s.fs.IndexSet(id, filePath)

	node := model.TreeNode{
		ID:        id,
		Name:      name,
		Type:      "request",
		Method:    "GET",
		Path:      filePath,
		Auth:      req.Auth,
		CreatedAt: now,
	}

	return model.NewSuccess(node)
}

// RenameFolder renames a folder (updates _folder.json, keeps slug unchanged).
func (s *CollectionService) RenameFolder(id, newName string) model.Result {
	s.logger.Info("RenameFolder called", "id", id, "name", newName)

	newName = strings.TrimSpace(newName)
	if newName == "" {
		return model.NewError(model.ErrValidation, ErrFolderNameEmpty)
	}
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	folderDir, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFolderNotFound)
	}

	metaPath := filepath.Join(folderDir, folderMetaFile)
	var folder model.Folder
	if err := s.fs.ReadJSON(metaPath, &folder); err != nil {
		s.logger.Error("failed to read folder metadata", "id", id, "error", err)
		return model.NewError(model.ErrIO, ErrFolderReadFailed)
	}

	if folder.Name == newName {
		return model.NewSuccess(nil)
	}

	folder.Name = newName
	folder.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(metaPath, folder); err != nil {
		s.logger.Error("failed to update folder metadata", "id", id, "error", err)
		return model.NewError(model.ErrIO, ErrFolderRenameFailed)
	}

	return model.NewSuccess(nil)
}

// DeleteFolder removes a folder and all its contents from disk.
// Only folders strictly inside rootPath (excluding environments/) can be deleted.
func (s *CollectionService) DeleteFolder(rootPath, id string) model.Result {
	s.logger.Info("DeleteFolder called", "root", rootPath, "id", id)

	if rootPath == "" || id == "" {
		return model.NewError(model.ErrValidation, ErrRootPathAndIDRequired)
	}

	folderPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFolderNotFound)
	}

	if !isDeletableFolderPath(rootPath, folderPath) {
		s.logger.Warn("refusing to delete path outside deletable scope", "root", rootPath, "path", folderPath)
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	// Double check that it's actually a folder by checking for _folder.json
	metaPath := filepath.Join(folderPath, folderMetaFile)
	if !s.fs.Exists(metaPath) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	if err := s.fs.Delete(folderPath); err != nil {
		s.logger.Error("failed to delete folder", "path", folderPath, "error", err)
		return model.NewError(storageErrCode(err), ErrFolderDeleteFailed)
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
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}

	srcPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrRequestNotFound)
	}
	if !strings.HasSuffix(srcPath, ".json") {
		return model.NewError(model.ErrValidation, ErrRequestFileInvalid)
	}

	if !isInsideRoot(rootPath, filepath.Dir(srcPath)) {
		return model.NewError(model.ErrValidation, ErrRequestNotInRoot)
	}

	targetDir := rootPath
	if targetFolderID != "" {
		folderPath, err := s.fs.FindByUUID(targetFolderID)
		if err != nil {
			return model.NewError(model.ErrValidation, ErrTargetFolderNotFound)
		}
		if !s.fs.Exists(filepath.Join(folderPath, folderMetaFile)) || !isDeletableFolderPath(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrTargetFolderInvalid)
		}
		targetDir = folderPath
	}

	if !isInsideRoot(rootPath, targetDir) {
		return model.NewError(model.ErrValidation, ErrTargetFolderNotInRoot)
	}
	if strings.HasPrefix(targetDir, filepath.Join(rootPath, "environments")) {
		return model.NewError(model.ErrValidation, ErrMoveToEnvFolderFailed)
	}

	if filepath.Dir(srcPath) == targetDir {
		return model.NewSuccess(nil)
	}

	filename := filepath.Base(srcPath)
	newPath := filepath.Join(targetDir, filename)
	if s.fs.Exists(newPath) && newPath != srcPath {
		newPath = filepath.Join(targetDir, slug.RequestFilename(id))
	}

	if err := s.fs.MoveFile(srcPath, newPath); err != nil {
		s.logger.Error("failed to move request", "id", id, "error", err)
		return model.NewError(model.ErrIO, ErrRequestMoveFailed)
	}

	s.fs.IndexSet(id, newPath)
	return model.NewSuccess(nil)
}

// LoadFolder loads a folder by ID.
func (s *CollectionService) LoadFolder(id string) model.Result {
	s.logger.Info("LoadFolder called", "id", id)

	folderPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFolderNotFound)
	}

	var folder model.Folder
	folderMetaPath := filepath.Join(folderPath, folderMetaFile)
	if err := s.fs.ReadJSON(folderMetaPath, &folder); err != nil {
		return model.NewError(model.ErrIO, ErrFolderReadFailed)
	}

	// Ensure Variables and Headers are at least empty slices
	if folder.Variables == nil {
		folder.Variables = []model.KVPair{}
	}
	if folder.Headers == nil {
		folder.Headers = []model.KVPair{}
	}
	if folder.Auth == nil {
		folder.Auth = &model.AuthConfig{Type: "inherit"}
	}

	return model.NewSuccess(folder)
}

// UpdateFolder updates the variables and headers of a folder.
func (s *CollectionService) UpdateFolder(folder model.Folder) model.Result {
	s.logger.Info("UpdateFolder called", "id", folder.ID)

	folderPath, err := s.fs.FindByUUID(folder.ID)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFolderNotFound)
	}

	var existingFolder model.Folder
	folderMetaPath := filepath.Join(folderPath, folderMetaFile)
	if err := s.fs.ReadJSON(folderMetaPath, &existingFolder); err != nil {
		return model.NewError(model.ErrIO, ErrFolderReadFailed)
	}

	// Variables, folder_envs, headers, and auth are updated via this method (name is via RenameFolder)
	existingFolder.Variables = folder.Variables
	existingFolder.FolderEnvs = folder.FolderEnvs
	existingFolder.Headers = folder.Headers
	if folder.Auth != nil {
		existingFolder.Auth = folder.Auth
	}
	existingFolder.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(folderMetaPath, existingFolder); err != nil {
		return model.NewError(model.ErrIO, ErrFolderInfoSaveFailed)
	}

	return model.NewSuccess(existingFolder)
}

// ListCollections returns all collections in the collectionsRoot directory.
func (s *CollectionService) ListCollections(collectionsRoot, activeCollection string) model.Result {
	s.logger.Info("ListCollections called", "collectionsRoot", collectionsRoot, "active", activeCollection)

	if collectionsRoot == "" {
		return model.NewSuccess([]model.Collection{})
	}

	entries, err := s.fs.ListDir(collectionsRoot)
	if err != nil {
		s.logger.Warn("cannot list collections root directory", "error", err)
		return model.NewSuccess([]model.Collection{})
	}

	collections := []model.Collection{}

	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		slugName := entry.Name()
		collMetaPath := filepath.Join(collectionsRoot, slugName, collectionFileName)
		if !s.fs.Exists(collMetaPath) {
			continue
		}

		var coll model.Collection
		if err := s.fs.ReadJSON(collMetaPath, &coll); err != nil {
			s.logger.Warn("skipping unreadable collection.json", "path", collMetaPath, "error", err)
			continue
		}

		coll.ID = entry.Name()
		coll.IsDefault = (entry.Name() == "default")
		coll.IsActive = (entry.Name() == activeCollection)
		collections = append(collections, coll)
	}

	sort.SliceStable(collections, func(i, j int) bool {
		if collections[i].IsDefault != collections[j].IsDefault {
			return collections[i].IsDefault
		}
		nameI := strings.ToLower(collections[i].Name)
		nameJ := strings.ToLower(collections[j].Name)
		if nameI != nameJ {
			return nameI < nameJ
		}
		return collections[i].ID < collections[j].ID
	})

	return model.NewSuccess(collections)
}

func isCleanID(idStr, collectionsRoot string) bool {
	if idStr == "" || filepath.Base(idStr) != idStr || strings.ContainsAny(idStr, "/\\") || idStr == "." || idStr == ".." {
		return false
	}
	collDir := filepath.Join(collectionsRoot, idStr)
	if filepath.Clean(collDir) == filepath.Clean(collectionsRoot) {
		return false
	}
	return true
}

// CreateCollection creates a new collection folder <uuid> with collection.json and environments/.
func (s *CollectionService) CreateCollection(collectionsRoot, name string) model.Result {
	s.logger.Info("CreateCollection called", "collectionsRoot", collectionsRoot, "name", name)

	name = strings.TrimSpace(name)
	if name == "" {
		return model.NewError(model.ErrValidation, ErrCollectionNameEmpty)
	}
	if len([]rune(name)) > 255 {
		name = string([]rune(name)[:255])
	}

	if collectionsRoot == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	collID := slug.CollectionDir()
	collDir := filepath.Join(collectionsRoot, collID)

	if err := s.fs.MakeDir(collDir); err != nil {
		s.logger.Error("failed to create collection dir", "path", collDir, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionCreateFailed)
	}

	envDir := filepath.Join(collDir, environmentsDir)
	if err := s.fs.MakeDir(envDir); err != nil {
		s.logger.Error("failed to create environments dir in collection", "path", envDir, "error", err)
		os.RemoveAll(collDir)
		return model.NewError(model.ErrIO, ErrCollectionCreateFailed)
	}

	now := time.Now()
	coll := model.Collection{
		ID:          collID,
		Name:        name,
		Description: "",
		IsDefault:   false,
		IsActive:    false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	metaPath := filepath.Join(collDir, collectionFileName)
	if err := s.fs.WriteJSON(metaPath, coll); err != nil {
		s.logger.Error("failed to write collection.json", "path", metaPath, "error", err)
		os.RemoveAll(collDir)
		return model.NewError(model.ErrIO, ErrCollectionCreateFailed)
	}

	return model.NewSuccess(coll)
}

// RenameCollection updates the display name of a collection in collection.json without altering folder path on disk (AD-4).
func (s *CollectionService) RenameCollection(collectionsRoot, id, newName string) model.Result {
	s.logger.Info("RenameCollection called", "collectionsRoot", collectionsRoot, "id", id, "newName", newName)

	if collectionsRoot == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrCollectionIDEmpty)
	}
	if !isCleanID(id, collectionsRoot) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	newName = strings.TrimSpace(newName)
	if newName == "" {
		return model.NewError(model.ErrValidation, ErrCollectionNameEmpty)
	}
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	collDir := filepath.Join(collectionsRoot, id)
	metaPath := filepath.Join(collDir, collectionFileName)
	if !s.fs.Exists(metaPath) {
		return model.NewError(model.ErrNotFound, ErrCollectionNotFound)
	}

	var coll model.Collection
	if err := s.fs.ReadJSON(metaPath, &coll); err != nil {
		s.logger.Error("failed to read collection.json for rename", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionRenameFailed)
	}

	coll.Name = newName
	coll.ID = id
	coll.IsDefault = (id == "default")
	coll.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(metaPath, coll); err != nil {
		s.logger.Error("failed to update collection.json", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionRenameFailed)
	}

	return model.NewSuccess(coll)
}

// UpdateCollection updates a collection's details (name, description, variables).
func (s *CollectionService) UpdateCollection(collectionsRoot string, coll model.Collection) model.Result {
	s.logger.Info("UpdateCollection called", "collectionsRoot", collectionsRoot, "id", coll.ID)

	if collectionsRoot == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	id := strings.TrimSpace(coll.ID)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrCollectionIDEmpty)
	}
	if !isCleanID(id, collectionsRoot) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	name := strings.TrimSpace(coll.Name)
	if name == "" {
		return model.NewError(model.ErrValidation, ErrCollectionNameEmpty)
	}
	if len([]rune(name)) > 255 {
		name = string([]rune(name)[:255])
	}

	collDir := filepath.Join(collectionsRoot, id)
	metaPath := filepath.Join(collDir, collectionFileName)
	if !s.fs.Exists(metaPath) {
		return model.NewError(model.ErrNotFound, ErrCollectionNotFound)
	}

	var existingColl model.Collection
	if err := s.fs.ReadJSON(metaPath, &existingColl); err != nil {
		s.logger.Error("failed to read collection.json for update", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionUpdateFailed)
	}

	existingColl.Name = name
	existingColl.Description = coll.Description
	existingColl.Variables = coll.Variables
	existingColl.ActiveEnvID = strings.TrimSpace(coll.ActiveEnvID)
	existingColl.ID = id
	existingColl.IsDefault = (id == "default")
	existingColl.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(metaPath, existingColl); err != nil {
		s.logger.Error("failed to update collection.json", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionUpdateFailed)
	}

	return model.NewSuccess(existingColl)
}

// DeleteCollection deletes a collection directory from collectionsRoot.
// It refuses to delete the default collection.
func (s *CollectionService) DeleteCollection(collectionsRoot, id string) model.Result {
	s.logger.Info("DeleteCollection called", "collectionsRoot", collectionsRoot, "id", id)

	if collectionsRoot == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrCollectionIDEmpty)
	}
	if !isCleanID(id, collectionsRoot) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	if id == "default" {
		return model.NewError(model.ErrValidation, ErrCannotDeleteDefaultColl)
	}

	collDir := filepath.Join(collectionsRoot, id)
	if !s.fs.Exists(collDir) {
		return model.NewError(model.ErrNotFound, ErrCollectionNotFound)
	}

	if !isInsideRoot(collectionsRoot, collDir) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	if err := s.fs.Delete(collDir); err != nil {
		s.logger.Error("failed to delete collection dir", "path", collDir, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionDeleteFailed)
	}

	s.fs.IndexDeleteByPrefix(collDir)
	return model.NewSuccess(nil)
}

// DuplicateCollection clones an existing collection tree into a new folder <uuid> with updated name and timestamps.
func (s *CollectionService) DuplicateCollection(collectionsRoot, id string) model.Result {
	s.logger.Info("DuplicateCollection called", "collectionsRoot", collectionsRoot, "id", id)

	if collectionsRoot == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrCollectionIDEmpty)
	}
	if !isCleanID(id, collectionsRoot) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	srcDir := filepath.Join(collectionsRoot, id)
	srcMetaPath := filepath.Join(srcDir, collectionFileName)
	if !s.fs.Exists(srcMetaPath) {
		return model.NewError(model.ErrNotFound, ErrCollectionNotFound)
	}

	var srcColl model.Collection
	if err := s.fs.ReadJSON(srcMetaPath, &srcColl); err != nil {
		s.logger.Error("failed to read src collection.json", "path", srcMetaPath, "error", err)
		return model.NewError(model.ErrIO, ErrCollectionDuplicateFailed)
	}

	newName := srcColl.Name + " (bản sao)"
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	newID := slug.CollectionDir()
	destDir := filepath.Join(collectionsRoot, newID)

	if err := copyDirectory(s.fs, srcDir, destDir); err != nil {
		s.logger.Error("failed to copy collection directory", "src", srcDir, "dest", destDir, "error", err)
		os.RemoveAll(destDir)
		return model.NewError(model.ErrIO, ErrCollectionDuplicateFailed)
	}

	now := time.Now()
	newColl := model.Collection{
		ID:          newID,
		Name:        newName,
		Description: srcColl.Description,
		Variables:   srcColl.Variables,
		ActiveEnvID: srcColl.ActiveEnvID,
		IsDefault:   false,
		IsActive:    false,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	destMetaPath := filepath.Join(destDir, collectionFileName)
	if err := s.fs.WriteJSON(destMetaPath, newColl); err != nil {
		s.logger.Error("failed to write duplicated collection.json", "path", destMetaPath, "error", err)
		os.RemoveAll(destDir)
		return model.NewError(model.ErrIO, ErrCollectionDuplicateFailed)
	}

	return model.NewSuccess(newColl)
}

// SwitchCollection validates id for path traversal and checks that the collection exists in collectionsRoot.
func (s *CollectionService) SwitchCollection(collectionsRoot, id string) model.Result {
	s.logger.Info("SwitchCollection called", "collectionsRoot", collectionsRoot, "id", id)

	if collectionsRoot == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrCollectionIDEmpty)
	}
	if !isCleanID(id, collectionsRoot) {
		return model.NewError(model.ErrValidation, ErrInvalidFolderPath)
	}

	collDir := filepath.Join(collectionsRoot, id)
	if !s.fs.Exists(collDir) {
		return model.NewError(model.ErrNotFound, ErrCollectionNotFound)
	}

	return model.NewSuccess(nil)
}

func copyDirectory(fsys *storage.FileSystem, src, dest string) error {
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	if err := fsys.MakeDir(dest); err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		destPath := filepath.Join(dest, entry.Name())

		if entry.IsDir() {
			if err := copyDirectory(fsys, srcPath, destPath); err != nil {
				return err
			}
		} else {
			data, err := os.ReadFile(srcPath)
			if err != nil {
				return err
			}
			if err := os.WriteFile(destPath, data, 0644); err != nil {
				return err
			}
		}
	}
	return nil
}

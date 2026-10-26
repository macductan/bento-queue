package service

import (
	"fmt"
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

const (
	flowsDirName         = "flows"
	flowsRootMetaID      = "flows-root"
	flowsRootMetaName    = "Flows"
	DefaultFlowTimeoutMs = 30000
	DefaultFlowMaxSteps  = 100
)

// FlowService handles Flow and FlowFolder CRUD, tree building, ordering, and movement operations
// strictly within <collection>/flows/.
type FlowService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewFlowService creates a new FlowService.
func NewFlowService(fs *storage.FileSystem, logger *slog.Logger) *FlowService {
	if logger == nil {
		logger = slog.Default()
	}
	return &FlowService{fs: fs, logger: logger}
}

func flowsRootDir(rootPath string) string {
	return filepath.Join(filepath.Clean(strings.TrimSpace(rootPath)), flowsDirName)
}

func isParentRootSelector(parentFolderID string) bool {
	trimmed := strings.TrimSpace(parentFolderID)
	return trimmed == "" || trimmed == flowsRootMetaID || strings.EqualFold(trimmed, "root") || trimmed == "/"
}

func isFlowsDirRoot(fs *storage.FileSystem, candFlowsDir string) bool {
	if filepath.Base(candFlowsDir) != flowsDirName || fs == nil {
		return false
	}
	parentDir := filepath.Dir(candFlowsDir)
	if fs.Exists(filepath.Join(parentDir, collectionFileName)) {
		return true
	}
	var meta model.FlowFolder
	if err := fs.ReadJSON(filepath.Join(candFlowsDir, folderMetaFile), &meta); err == nil && meta.ID == flowsRootMetaID {
		return true
	}
	return false
}

// isPathInFlowsDir checks that targetPath lies inside <collection>/flows/.
// If allowFlowsRoot is false, targetPath must lie strictly inside <collection>/flows/ (not the flows/ directory itself).
func isPathInFlowsDir(fs *storage.FileSystem, rootPath, targetPath string, allowFlowsRoot bool) bool {
	cleanTarget := filepath.Clean(strings.TrimSpace(targetPath))
	if cleanTarget == "" || cleanTarget == "." {
		return false
	}

	effRoot := strings.TrimSpace(rootPath)
	if effRoot == "" && fs != nil {
		effRoot = strings.TrimSpace(fs.CollectionRoot())
	}

	if effRoot != "" {
		fRoot := flowsRootDir(effRoot)
		rel, err := filepath.Rel(fRoot, cleanTarget)
		if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			return false
		}
		if !allowFlowsRoot && rel == "." {
			return false
		}
		return true
	}

	// Fallback check when collectionRoot was not set on FileSystem:
	// inspect ancestor directories named "flows" anchored by collection.json in parent or flows-root _folder.json.
	curr := cleanTarget
	if !allowFlowsRoot {
		curr = filepath.Dir(cleanTarget)
	}
	for {
		if filepath.Base(curr) == flowsDirName && isFlowsDirRoot(fs, curr) {
			return true
		}
		parent := filepath.Dir(curr)
		if parent == curr {
			break
		}
		curr = parent
	}
	return false
}

// isPathInFlowsDir checks that targetPath lies inside <collection>/flows/.
// If allowFlowsRoot is false, targetPath must lie strictly inside <collection>/flows/ (not the flows/ directory itself).
func (s *FlowService) isPathInFlowsDir(rootPath, targetPath string, allowFlowsRoot bool) bool {
	return isPathInFlowsDir(s.fs, rootPath, targetPath, allowFlowsRoot)
}

// isValidFlowFolderDir reports whether folderPath is a valid FlowFolder directory strictly inside <collection>/flows/.
func (s *FlowService) isValidFlowFolderDir(rootPath, folderPath string) bool {
	if !s.isPathInFlowsDir(rootPath, folderPath, false) {
		return false
	}
	metaPath := filepath.Join(folderPath, folderMetaFile)
	return s.fs.Exists(metaPath)
}

// isFlowFilePath reports whether filePath is a valid Flow JSON file strictly inside <collection>/flows/.
func (s *FlowService) isFlowFilePath(rootPath, filePath string) bool {
	cleanPath := filepath.Clean(strings.TrimSpace(filePath))
	if !strings.HasSuffix(cleanPath, ".json") || filepath.Base(cleanPath) == folderMetaFile {
		return false
	}
	return s.isPathInFlowsDir(rootPath, cleanPath, false)
}

// ensureFlowsRoot creates <collection>/flows/ and <collection>/flows/_folder.json if they do not exist.
func (s *FlowService) ensureFlowsRoot(rootPath string) (string, error) {
	fRoot := flowsRootDir(rootPath)
	if !s.fs.Exists(fRoot) {
		if err := s.fs.MakeDir(fRoot); err != nil {
			return "", err
		}
	}
	metaPath := filepath.Join(fRoot, folderMetaFile)
	if !s.fs.Exists(metaPath) {
		now := time.Now()
		rootMeta := model.FlowFolder{
			ID:        flowsRootMetaID,
			Name:      flowsRootMetaName,
			Order:     []string{},
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := s.fs.WriteJSON(metaPath, rootMeta); err != nil {
			return "", err
		}
	}
	return fRoot, nil
}

func normalizeFlowNodes(nodes []model.FlowNode, regenerateIDs bool) []model.FlowNode {
	if len(nodes) == 0 {
		return []model.FlowNode{}
	}
	out := make([]model.FlowNode, len(nodes))
	for i, n := range nodes {
		nodeCopy := n
		if regenerateIDs || strings.TrimSpace(nodeCopy.ID) == "" {
			nodeCopy.ID = uuid.NewString()
		}
		if len(nodeCopy.Steps) == 0 {
			nodeCopy.Steps = []model.FlowStep{}
		} else {
			steps := make([]model.FlowStep, len(nodeCopy.Steps))
			for j, st := range nodeCopy.Steps {
				stepCopy := st
				if regenerateIDs || strings.TrimSpace(stepCopy.ID) == "" {
					stepCopy.ID = uuid.NewString()
				}
				steps[j] = stepCopy
			}
			nodeCopy.Steps = steps
		}
		if len(nodeCopy.Branches) > 0 {
			branches := make([]model.FlowBranch, len(nodeCopy.Branches))
			for j, br := range nodeCopy.Branches {
				brCopy := br
				if regenerateIDs || strings.TrimSpace(brCopy.ID) == "" {
					brCopy.ID = uuid.NewString()
				}
				if strings.TrimSpace(brCopy.Condition.Type) == "" {
					brCopy.Condition.Type = "success"
				}
				brCopy.Nodes = normalizeFlowNodes(brCopy.Nodes, regenerateIDs)
				branches[j] = brCopy
			}
			nodeCopy.Branches = branches
		} else {
			nodeCopy.Branches = nil
		}
		out[i] = nodeCopy
	}
	return out
}

func normalizeFlow(flow *model.Flow, regenerateChildIDs bool) {
	if flow == nil {
		return
	}
	layout := strings.ToLower(strings.TrimSpace(flow.Layout))
	if layout != "vertical" && layout != "horizontal" {
		layout = "vertical"
	}
	flow.Layout = layout
	if flow.TimeoutMs <= 0 {
		flow.TimeoutMs = DefaultFlowTimeoutMs
	}
	if flow.MaxSteps <= 0 {
		flow.MaxSteps = DefaultFlowMaxSteps
	}
	flow.Nodes = normalizeFlowNodes(flow.Nodes, regenerateChildIDs)
}

func countFlowSteps(nodes []model.FlowNode) int {
	total := 0
	for _, n := range nodes {
		total += len(n.Steps)
		for _, b := range n.Branches {
			total += countFlowSteps(b.Nodes)
		}
	}
	return total
}

// GetTree returns the hierarchical FlowFolder and Flow tree inside <collection>/flows/.
// Registers all Flow and FlowFolder UUIDs in FileSystem index without calling IndexClear().
func (s *FlowService) GetTree(rootPath string) model.Result {
	s.logger.Info("FlowService.GetTree called", "root", rootPath)

	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	if _, err := s.fs.ListDir(rootPath); err != nil {
		s.logger.Error("failed to read collection root for flow tree", "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
	}

	s.fs.SetCollectionRoot(rootPath)

	fRoot := flowsRootDir(rootPath)
	if !s.fs.Exists(fRoot) {
		return model.NewSuccess([]model.FlowTreeNode{})
	}

	tree, err := s.buildTree(fRoot)
	if err != nil {
		s.logger.Error("failed to build flow tree", "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
	}

	return model.NewSuccess(tree)
}

func (s *FlowService) buildTree(dirPath string) ([]model.FlowTreeNode, error) {
	entries, err := s.fs.ListDir(dirPath)
	if err != nil {
		return nil, err
	}

	nodes := []model.FlowTreeNode{}

	for _, entry := range entries {
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		fullPath := filepath.Join(dirPath, name)

		if entry.IsDir() {
			node, ok := s.buildFlowFolderNode(fullPath)
			if ok {
				nodes = append(nodes, node)
			}
		} else if strings.HasSuffix(name, ".json") && name != folderMetaFile {
			node, ok := s.buildFlowNode(fullPath)
			if ok {
				nodes = append(nodes, node)
			}
		}
	}

	var order []string
	metaPath := filepath.Join(dirPath, folderMetaFile)
	if s.fs.Exists(metaPath) {
		var f model.FlowFolder
		if err := s.fs.ReadJSON(metaPath, &f); err == nil {
			order = f.Order
		}
	}

	orderMap := make(map[string]int, len(order))
	for idx, id := range order {
		orderMap[id] = idx
	}

	sort.SliceStable(nodes, func(i, j int) bool {
		ni, nj := nodes[i], nodes[j]
		idxI, hasI := orderMap[ni.ID]
		idxJ, hasJ := orderMap[nj.ID]

		if hasI && hasJ {
			return idxI < idxJ
		}
		if hasI && !hasJ {
			return true
		}
		if !hasI && hasJ {
			return false
		}

		if ni.Type != nj.Type {
			return ni.Type == "flow_folder"
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

func (s *FlowService) buildFlowFolderNode(fullPath string) (model.FlowTreeNode, bool) {
	folderMetaPath := filepath.Join(fullPath, folderMetaFile)
	var folder model.FlowFolder
	if err := s.fs.ReadJSON(folderMetaPath, &folder); err != nil {
		s.logger.Warn("skipping flow folder with unreadable _folder.json", "path", folderMetaPath, "error", err)
		return model.FlowTreeNode{}, false
	}
	if strings.TrimSpace(folder.ID) == "" || folder.ID == flowsRootMetaID {
		return model.FlowTreeNode{}, false
	}

	s.fs.IndexSet(folder.ID, fullPath)

	children, err := s.buildTree(fullPath)
	if err != nil {
		s.logger.Warn("error reading flow folder children", "path", fullPath, "error", err)
	}
	if children == nil {
		children = []model.FlowTreeNode{}
	}

	return model.FlowTreeNode{
		ID:        folder.ID,
		Name:      folder.Name,
		Type:      "flow_folder",
		Path:      fullPath,
		Children:  children,
		CreatedAt: folder.CreatedAt,
	}, true
}

func (s *FlowService) buildFlowNode(fullPath string) (model.FlowTreeNode, bool) {
	var flow model.Flow
	if err := s.fs.ReadJSON(fullPath, &flow); err != nil {
		s.logger.Warn("skipping unreadable flow file", "path", fullPath, "error", err)
		return model.FlowTreeNode{}, false
	}
	if strings.TrimSpace(flow.ID) == "" || flow.ID == flowsRootMetaID {
		s.logger.Warn("skipping flow file with empty or reserved ID", "path", fullPath)
		return model.FlowTreeNode{}, false
	}

	s.fs.IndexSet(flow.ID, fullPath)

	layout := strings.ToLower(strings.TrimSpace(flow.Layout))
	if layout != "vertical" && layout != "horizontal" {
		layout = "vertical"
	}

	return model.FlowTreeNode{
		ID:          flow.ID,
		Name:        flow.Name,
		Type:        "flow",
		Description: flow.Description,
		Layout:      layout,
		StepCount:   countFlowSteps(flow.Nodes),
		Path:        fullPath,
		CreatedAt:   flow.CreatedAt,
	}, true
}

// ListFlows returns a flat list of FlowTreeNode items (type == "flow") across the collection
// or within a specific FlowFolder when folderID is non-empty.
func (s *FlowService) ListFlows(rootPath, folderID string) model.Result {
	treeRes := s.GetTree(rootPath)
	if !treeRes.Success {
		return treeRes
	}
	tree, _ := treeRes.Data.([]model.FlowTreeNode)

	targetNodes := tree
	if !isParentRootSelector(folderID) {
		folderNode, _, found := findFlowFolderByIDInTree(tree, strings.TrimSpace(folderID), nil)
		if !found {
			return model.NewError(model.ErrNotFound, ErrFlowFolderNotFound)
		}
		targetNodes = folderNode.Children
	}

	flows := flattenFlowsFromTree(targetNodes)
	return model.NewSuccess(flows)
}

func flattenFlowsFromTree(nodes []model.FlowTreeNode) []model.FlowTreeNode {
	out := []model.FlowTreeNode{}
	for _, n := range nodes {
		if n.Type == "flow" {
			out = append(out, n)
		} else if n.Type == "flow_folder" && len(n.Children) > 0 {
			out = append(out, flattenFlowsFromTree(n.Children)...)
		}
	}
	return out
}

// GetFlow retrieves a Flow by UUID.
func (s *FlowService) GetFlow(id string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), ErrFlowNotFound)
	}

	if !s.isFlowFilePath("", path) {
		return model.NewError(model.ErrValidation, ErrFlowFileInvalid)
	}

	var flow model.Flow
	if err := s.fs.ReadJSON(path, &flow); err != nil {
		s.logger.Error("failed to read flow", "id", id, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowReadFailed)
	}

	normalizeFlow(&flow, false)
	return model.NewSuccess(flow)
}

// LoadFlowFolder retrieves a FlowFolder metadata by UUID.
func (s *FlowService) LoadFlowFolder(id string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}

	folderPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFlowFolderNotFound)
	}

	if !s.isValidFlowFolderDir("", folderPath) {
		return model.NewError(model.ErrValidation, ErrFlowFolderInvalid)
	}

	var folder model.FlowFolder
	metaPath := filepath.Join(folderPath, folderMetaFile)
	if err := s.fs.ReadJSON(metaPath, &folder); err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
	}
	if folder.Order == nil {
		folder.Order = []string{}
	}
	return model.NewSuccess(folder)
}

// CreateFlow creates a new Flow with default parameters inside <collection>/flows/ (or a child FlowFolder).
func (s *FlowService) CreateFlow(rootPath, parentFolderID string) model.Result {
	return s.CreateFlowWithDetails(rootPath, parentFolderID, model.Flow{
		Name:      "Flow mới",
		Layout:    "vertical",
		TimeoutMs: DefaultFlowTimeoutMs,
		MaxSteps:  DefaultFlowMaxSteps,
		Nodes:     []model.FlowNode{},
	})
}

// CreateFlowWithDetails creates a new Flow with provided details inside <collection>/flows/.
func (s *FlowService) CreateFlowWithDetails(rootPath, parentFolderID string, details model.Flow) model.Result {
	s.logger.Info("FlowService.CreateFlowWithDetails called", "root", rootPath, "parent", parentFolderID, "name", details.Name)

	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	name := strings.TrimSpace(details.Name)
	if name == "" {
		name = "Flow mới"
	}
	if len([]rune(name)) > 255 {
		name = string([]rune(name)[:255])
	}

	layout := strings.ToLower(strings.TrimSpace(details.Layout))
	if layout == "" {
		layout = "vertical"
	}
	if layout != "vertical" && layout != "horizontal" {
		return model.NewError(model.ErrValidation, ErrFlowLayoutInvalid)
	}

	s.fs.SetCollectionRoot(rootPath)
	fRoot, err := s.ensureFlowsRoot(rootPath)
	if err != nil {
		s.logger.Error("failed to ensure flows root", "error", err)
		return model.NewError(model.ErrIO, ErrFlowSaveFailed)
	}

	targetDir := fRoot
	if !isParentRootSelector(parentFolderID) {
		folderPath, err := s.fs.FindByUUID(strings.TrimSpace(parentFolderID))
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrParentFolderNotFound)
		}
		if !s.isValidFlowFolderDir(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrParentFolderInvalid)
		}
		targetDir = folderPath
	}

	id := uuid.NewString()
	now := time.Now()
	flow := model.Flow{
		ID:          id,
		Name:        name,
		Description: details.Description,
		Layout:      layout,
		TimeoutMs:   details.TimeoutMs,
		MaxSteps:    details.MaxSteps,
		Nodes:       details.Nodes,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	normalizeFlow(&flow, false)

	filePath := filepath.Join(targetDir, slug.Filename(id))
	if err := s.fs.WriteJSON(filePath, flow); err != nil {
		s.logger.Error("failed to write flow json", "path", filePath, "error", err)
		return model.NewError(model.ErrIO, ErrFlowSaveFailed)
	}

	_ = s.appendOrderToFolderMeta(targetDir, id)
	s.fs.IndexSet(id, filePath)

	return model.NewSuccess(flow)
}

// SaveFlow persists updates to an existing Flow on disk.
func (s *FlowService) SaveFlow(flow model.Flow) model.Result {
	id := strings.TrimSpace(flow.ID)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}
	flow.ID = id

	name := strings.TrimSpace(flow.Name)
	if name == "" {
		return model.NewError(model.ErrValidation, ErrFlowNameEmpty)
	}
	if len([]rune(name)) > 255 {
		name = string([]rune(name)[:255])
	}
	flow.Name = name

	layout := strings.ToLower(strings.TrimSpace(flow.Layout))
	if layout == "" {
		layout = "vertical"
	}
	if layout != "vertical" && layout != "horizontal" {
		return model.NewError(model.ErrValidation, ErrFlowLayoutInvalid)
	}
	flow.Layout = layout

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), ErrFlowNotFound)
	}
	if !s.isFlowFilePath("", path) {
		return model.NewError(model.ErrValidation, ErrFlowNotInRoot)
	}
	if !s.fs.Exists(path) {
		s.fs.IndexDelete(id)
		return model.NewError(model.ErrNotFound, ErrFlowNotFound)
	}

	var existing model.Flow
	if err := s.fs.ReadJSON(path, &existing); err == nil && !existing.CreatedAt.IsZero() {
		flow.CreatedAt = existing.CreatedAt
	} else if flow.CreatedAt.IsZero() {
		flow.CreatedAt = time.Now()
	}

	normalizeFlow(&flow, false)
	flow.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(path, flow); err != nil {
		s.logger.Error("failed to save flow", "id", id, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowSaveFailed)
	}

	return model.NewSuccess(flow)
}

// RenameFlow updates the name of an existing Flow.
func (s *FlowService) RenameFlow(id, newName string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return model.NewError(model.ErrValidation, ErrFlowNameEmpty)
	}
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), ErrFlowNotFound)
	}
	if !s.isFlowFilePath("", path) {
		return model.NewError(model.ErrValidation, ErrFlowFileInvalid)
	}

	var flow model.Flow
	if err := s.fs.ReadJSON(path, &flow); err != nil {
		s.logger.Error("failed to read flow for rename", "id", id, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowReadFailed)
	}

	normalizeFlow(&flow, false)
	if flow.Name == newName {
		return model.NewSuccess(flow)
	}

	flow.Name = newName
	flow.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(path, flow); err != nil {
		s.logger.Error("failed to write renamed flow", "id", id, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowRenameFailed)
	}

	return model.NewSuccess(flow)
}

// DeleteFlow removes a Flow from <collection>/flows/ and updates parent _folder.json order.
func (s *FlowService) DeleteFlow(id string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), ErrFlowNotFound)
	}
	if !s.isFlowFilePath("", path) {
		return model.NewError(model.ErrValidation, ErrFlowFileInvalid)
	}

	parentDir := filepath.Dir(path)
	if err := s.fs.Delete(path); err != nil {
		if storageErrCode(err) == model.ErrNotFound {
			s.fs.IndexDelete(id)
			return model.NewError(model.ErrNotFound, ErrFlowNotFound)
		}
		s.logger.Error("failed to delete flow", "id", id, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowDeleteFailed)
	}

	_ = s.removeOrderFromFolderMeta(parentDir, id)
	s.fs.IndexDelete(id)
	return model.NewSuccess(nil)
}

// DuplicateFlow clones an existing Flow in the same folder with fresh UUIDs.
func (s *FlowService) DuplicateFlow(id string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}

	path, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(storageErrCode(err), ErrFlowNotFound)
	}
	if !s.isFlowFilePath("", path) {
		return model.NewError(model.ErrValidation, ErrFlowFileInvalid)
	}

	var flow model.Flow
	if err := s.fs.ReadJSON(path, &flow); err != nil {
		s.logger.Error("failed to read flow for duplicate", "id", id, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowReadFailed)
	}

	const dupSuffix = " (bản sao)"
	baseRunes := []rune(flow.Name)
	maxBaseLen := 255 - len([]rune(dupSuffix))
	if len(baseRunes) > maxBaseLen {
		baseRunes = baseRunes[:maxBaseLen]
	}
	newName := string(baseRunes) + dupSuffix

	newID := uuid.NewString()
	now := time.Now()
	flow.ID = newID
	flow.Name = newName
	flow.CreatedAt = now
	flow.UpdatedAt = now
	normalizeFlow(&flow, true)

	dir := filepath.Dir(path)
	newPath := filepath.Join(dir, slug.Filename(newID))

	if err := s.fs.WriteJSON(newPath, flow); err != nil {
		s.logger.Error("failed to write duplicated flow", "newId", newID, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowDuplicateFailed)
	}

	_ = s.insertOrderAfterInFolderMeta(dir, id, newID)
	s.fs.IndexSet(newID, newPath)
	return model.NewSuccess(flow)
}

// CreateFlowFolder creates a new FlowFolder with default name inside <collection>/flows/.
func (s *FlowService) CreateFlowFolder(rootPath, parentFolderID string) model.Result {
	return s.CreateFlowFolderNamed(rootPath, parentFolderID, "Thư mục mới")
}

// CreateFlowFolderNamed creates a new FlowFolder with the given name inside <collection>/flows/.
func (s *FlowService) CreateFlowFolderNamed(rootPath, parentFolderID, name string) model.Result {
	s.logger.Info("FlowService.CreateFlowFolderNamed called", "root", rootPath, "parent", parentFolderID, "name", name)

	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	name = strings.TrimSpace(name)
	if name == "" {
		return model.NewError(model.ErrValidation, ErrFlowFolderNameEmpty)
	}
	if len([]rune(name)) > 255 {
		name = string([]rune(name)[:255])
	}

	s.fs.SetCollectionRoot(rootPath)
	fRoot, err := s.ensureFlowsRoot(rootPath)
	if err != nil {
		s.logger.Error("failed to ensure flows root", "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderCreateFailed)
	}

	targetDir := fRoot
	if !isParentRootSelector(parentFolderID) {
		folderPath, err := s.fs.FindByUUID(strings.TrimSpace(parentFolderID))
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrParentFolderNotFound)
		}
		if !s.isValidFlowFolderDir(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrParentFolderInvalid)
		}
		targetDir = folderPath
	}

	id := uuid.NewString()
	now := time.Now()
	folder := model.FlowFolder{
		ID:        id,
		Name:      name,
		Order:     []string{},
		CreatedAt: now,
		UpdatedAt: now,
	}

	folderPath := filepath.Join(targetDir, slug.FolderDir(id))
	if err := s.fs.MakeDir(folderPath); err != nil {
		s.logger.Error("failed to create flow folder directory", "path", folderPath, "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderCreateFailed)
	}

	metaPath := filepath.Join(folderPath, folderMetaFile)
	if err := s.fs.WriteJSON(metaPath, folder); err != nil {
		_ = os.RemoveAll(folderPath)
		s.logger.Error("failed to write flow folder _folder.json", "path", metaPath, "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}

	_ = s.appendOrderToFolderMeta(targetDir, id)
	s.fs.IndexSet(id, folderPath)

	return model.NewSuccess(folder)
}

// RenameFlowFolder updates the name of a FlowFolder in _folder.json.
func (s *FlowService) RenameFlowFolder(id, newName string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}
	newName = strings.TrimSpace(newName)
	if newName == "" {
		return model.NewError(model.ErrValidation, ErrFlowFolderNameEmpty)
	}
	if len([]rune(newName)) > 255 {
		newName = string([]rune(newName)[:255])
	}

	folderDir, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFlowFolderNotFound)
	}
	if !s.isValidFlowFolderDir("", folderDir) {
		return model.NewError(model.ErrValidation, ErrFlowFolderInvalid)
	}

	metaPath := filepath.Join(folderDir, folderMetaFile)
	var folder model.FlowFolder
	if err := s.fs.ReadJSON(metaPath, &folder); err != nil {
		s.logger.Error("failed to read flow folder metadata", "id", id, "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
	}

	if folder.Name == newName {
		return model.NewSuccess(folder)
	}

	folder.Name = newName
	folder.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(metaPath, folder); err != nil {
		s.logger.Error("failed to update flow folder metadata", "id", id, "error", err)
		return model.NewError(model.ErrIO, ErrFlowFolderRenameFailed)
	}

	return model.NewSuccess(folder)
}

// DeleteFlowFolder removes a FlowFolder and all its child flows/subfolders from <collection>/flows/.
func (s *FlowService) DeleteFlowFolder(rootPath, id string) model.Result {
	rootPath = strings.TrimSpace(rootPath)
	id = strings.TrimSpace(id)
	if rootPath == "" || id == "" {
		return model.NewError(model.ErrValidation, ErrRootPathAndIDRequired)
	}

	s.fs.SetCollectionRoot(rootPath)

	folderPath, err := s.fs.FindByUUID(id)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFlowFolderNotFound)
	}
	if !s.isValidFlowFolderDir(rootPath, folderPath) {
		return model.NewError(model.ErrValidation, ErrFlowFolderInvalid)
	}

	parentDir := filepath.Dir(folderPath)
	if err := s.fs.Delete(folderPath); err != nil {
		s.logger.Error("failed to delete flow folder", "path", folderPath, "error", err)
		return model.NewError(storageErrCode(err), ErrFlowFolderDeleteFailed)
	}

	_ = s.removeOrderFromFolderMeta(parentDir, id)
	s.fs.IndexDeleteByPrefix(folderPath)
	s.fs.IndexDelete(id)

	return model.NewSuccess(nil)
}

// ReorderNodes updates the display order of child nodes inside a FlowFolder or at <collection>/flows/ root.
func (s *FlowService) ReorderNodes(rootPath, parentFolderID string, orderedIDs []string) model.Result {
	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	s.fs.SetCollectionRoot(rootPath)
	fRoot, err := s.ensureFlowsRoot(rootPath)
	if err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}

	targetDir := fRoot
	if !isParentRootSelector(parentFolderID) {
		folderPath, err := s.fs.FindByUUID(strings.TrimSpace(parentFolderID))
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrFlowFolderNotFound)
		}
		if !s.isValidFlowFolderDir(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrFlowFolderInvalid)
		}
		targetDir = folderPath
	}

	if orderedIDs == nil {
		orderedIDs = []string{}
	}
	if err := s.writeFolderOrder(targetDir, orderedIDs); err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}
	return model.NewSuccess(nil)
}

// MoveNode moves a Flow or FlowFolder to targetFolderID (or root of flows/ when empty/"root") at targetIndex.
// When targetIndex < 0, the node is appended to the end of the target folder's order.
func (s *FlowService) MoveNode(rootPath, nodeID, targetFolderID string, targetIndex int) model.Result {
	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}
	nodeID = strings.TrimSpace(nodeID)
	if nodeID == "" {
		return model.NewError(model.ErrValidation, ErrIDInvalid)
	}

	s.fs.SetCollectionRoot(rootPath)
	fRoot, err := s.ensureFlowsRoot(rootPath)
	if err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}

	srcPath, err := s.fs.FindByUUID(nodeID)
	if err != nil {
		return model.NewError(model.ErrNotFound, ErrFlowNotFound)
	}
	if !s.isPathInFlowsDir(rootPath, srcPath, false) {
		return model.NewError(model.ErrValidation, ErrFlowNotInRoot)
	}

	isFolder := s.isValidFlowFolderDir(rootPath, srcPath)
	isFlow := !isFolder && s.isFlowFilePath(rootPath, srcPath) && s.fs.Exists(srcPath)
	if !isFolder && !isFlow {
		return model.NewError(model.ErrValidation, ErrFlowFileInvalid)
	}

	targetDir := fRoot
	trimmedTarget := strings.TrimSpace(targetFolderID)
	if !isParentRootSelector(trimmedTarget) {
		if nodeID == trimmedTarget {
			return model.NewError(model.ErrValidation, ErrFlowFolderMoveCycle)
		}
		folderPath, err := s.fs.FindByUUID(trimmedTarget)
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrTargetFolderNotFound)
		}
		if !s.isValidFlowFolderDir(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrTargetFolderInvalid)
		}
		targetDir = folderPath
	}

	if isFolder {
		rel, err := filepath.Rel(srcPath, targetDir)
		if err == nil && (rel == "." || (!strings.HasPrefix(rel, ".."+string(filepath.Separator)) && rel != "..")) {
			return model.NewError(model.ErrValidation, ErrFlowFolderMoveCycle)
		}
	}

	oldParentDir := filepath.Dir(srcPath)
	sameParent := filepath.Clean(oldParentDir) == filepath.Clean(targetDir)

	// Capture existing ordered child IDs in targetDir before moving
	targetChildren, err := s.buildTree(targetDir)
	if err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
	}
	orderedIDs := make([]string, 0, len(targetChildren)+1)
	for _, ch := range targetChildren {
		if ch.ID != nodeID {
			orderedIDs = append(orderedIDs, ch.ID)
		}
	}

	newPath := srcPath
	if !sameParent {
		if isFolder {
			var srcFolder model.FlowFolder
			if err := s.fs.ReadJSON(filepath.Join(srcPath, folderMetaFile), &srcFolder); err != nil {
				return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
			}

			// Adjust name if another FlowFolder in targetDir has the exact same name
			var existingNames []string
			for _, ch := range targetChildren {
				if ch.Type == "flow_folder" && ch.ID != nodeID {
					existingNames = append(existingNames, strings.TrimSpace(ch.Name))
				}
			}
			hasCollision := func(candidate string) bool {
				for _, n := range existingNames {
					if strings.EqualFold(n, candidate) {
						return true
					}
				}
				return false
			}
			baseName := strings.TrimSpace(srcFolder.Name)
			targetName := baseName
			nameAdjusted := false
			if hasCollision(targetName) {
				idx := 2
				for {
					suffix := fmt.Sprintf(" (%d)", idx)
					prefixLen := 255 - len([]rune(suffix))
					trimmedBase := baseName
					if len([]rune(trimmedBase)) > prefixLen {
						trimmedBase = string([]rune(trimmedBase)[:prefixLen])
					}
					candidate := trimmedBase + suffix
					if !hasCollision(candidate) {
						targetName = candidate
						nameAdjusted = true
						break
					}
					idx++
				}
			}

			dirName := filepath.Base(srcPath)
			newPath = filepath.Join(targetDir, dirName)
			if s.fs.Exists(newPath) && filepath.Clean(newPath) != filepath.Clean(srcPath) {
				newPath = filepath.Join(targetDir, slug.FolderDir(nodeID))
				if s.fs.Exists(newPath) && filepath.Clean(newPath) != filepath.Clean(srcPath) {
					return model.NewError(model.ErrValidation, ErrFlowFolderMoveFailed)
				}
			}

			if err := s.fs.MoveFile(srcPath, newPath); err != nil {
				s.logger.Error("failed to move flow folder", "id", nodeID, "error", err)
				return model.NewError(model.ErrIO, ErrFlowFolderMoveFailed)
			}
			if nameAdjusted {
				srcFolder.Name = targetName
				srcFolder.UpdatedAt = time.Now()
				_ = s.fs.WriteJSON(filepath.Join(newPath, folderMetaFile), srcFolder)
			}
			s.fs.IndexUpdatePrefix(srcPath, newPath)
			s.fs.IndexSet(nodeID, newPath)
		} else {
			var srcFlow model.Flow
			if err := s.fs.ReadJSON(srcPath, &srcFlow); err != nil {
				return model.NewError(model.ErrIO, ErrFlowReadFailed)
			}

			// Adjust name if another Flow in targetDir has the exact same name
			var existingNames []string
			for _, ch := range targetChildren {
				if ch.Type == "flow" && ch.ID != nodeID {
					existingNames = append(existingNames, strings.TrimSpace(ch.Name))
				}
			}
			hasCollision := func(candidate string) bool {
				for _, n := range existingNames {
					if strings.EqualFold(n, candidate) {
						return true
					}
				}
				return false
			}
			baseName := strings.TrimSpace(srcFlow.Name)
			targetName := baseName
			nameAdjusted := false
			if hasCollision(targetName) {
				idx := 2
				for {
					suffix := fmt.Sprintf(" (%d)", idx)
					prefixLen := 255 - len([]rune(suffix))
					trimmedBase := baseName
					if len([]rune(trimmedBase)) > prefixLen {
						trimmedBase = string([]rune(trimmedBase)[:prefixLen])
					}
					candidate := trimmedBase + suffix
					if !hasCollision(candidate) {
						targetName = candidate
						nameAdjusted = true
						break
					}
					idx++
				}
			}

			filename := filepath.Base(srcPath)
			newPath = filepath.Join(targetDir, filename)
			if s.fs.Exists(newPath) && filepath.Clean(newPath) != filepath.Clean(srcPath) {
				return model.NewError(model.ErrValidation, ErrFlowMoveFailed)
			}
			if err := s.fs.MoveFile(srcPath, newPath); err != nil {
				s.logger.Error("failed to move flow", "id", nodeID, "error", err)
				return model.NewError(model.ErrIO, ErrFlowMoveFailed)
			}
			if nameAdjusted {
				normalizeFlow(&srcFlow, false)
				srcFlow.Name = targetName
				srcFlow.UpdatedAt = time.Now()
				_ = s.fs.WriteJSON(newPath, srcFlow)
			}
			s.fs.IndexSet(nodeID, newPath)
		}

		_ = s.removeOrderFromFolderMeta(oldParentDir, nodeID)
	}

	if targetIndex < 0 || targetIndex >= len(orderedIDs) {
		orderedIDs = append(orderedIDs, nodeID)
	} else {
		orderedIDs = append(orderedIDs[:targetIndex], append([]string{nodeID}, orderedIDs[targetIndex:]...)...)
	}

	if err := s.writeFolderOrder(targetDir, orderedIDs); err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}

	return model.NewSuccess(nil)
}

// SortNodes sorts child FlowFolders and Flows alphabetically (A-Z, folders first) inside parentFolderID (or flows/ root).
func (s *FlowService) SortNodes(rootPath, parentFolderID string) model.Result {
	rootPath = strings.TrimSpace(rootPath)
	if rootPath == "" {
		return model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
	}

	s.fs.SetCollectionRoot(rootPath)
	fRoot, err := s.ensureFlowsRoot(rootPath)
	if err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}

	targetDir := fRoot
	if !isParentRootSelector(parentFolderID) {
		folderPath, err := s.fs.FindByUUID(strings.TrimSpace(parentFolderID))
		if err != nil {
			return model.NewError(model.ErrNotFound, ErrFlowFolderNotFound)
		}
		if !s.isValidFlowFolderDir(rootPath, folderPath) {
			return model.NewError(model.ErrValidation, ErrFlowFolderInvalid)
		}
		targetDir = folderPath
	}

	children, err := s.buildTree(targetDir)
	if err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderReadFailed)
	}

	sort.SliceStable(children, func(i, j int) bool {
		ni, nj := children[i], children[j]
		if ni.Type != nj.Type {
			return ni.Type == "flow_folder"
		}
		nameI := strings.ToLower(ni.Name)
		nameJ := strings.ToLower(nj.Name)
		if nameI != nameJ {
			return nameI < nameJ
		}
		return ni.ID < nj.ID
	})

	orderedIDs := make([]string, 0, len(children))
	for _, ch := range children {
		orderedIDs = append(orderedIDs, ch.ID)
	}

	if err := s.writeFolderOrder(targetDir, orderedIDs); err != nil {
		return model.NewError(model.ErrIO, ErrFlowFolderSaveFailed)
	}

	return model.NewSuccess(orderedIDs)
}

func (s *FlowService) isRootFlowsDir(dirPath string) bool {
	cleanDir := filepath.Clean(strings.TrimSpace(dirPath))
	if filepath.Base(cleanDir) != flowsDirName {
		return false
	}
	if s.fs != nil {
		if collRoot := strings.TrimSpace(s.fs.CollectionRoot()); collRoot != "" {
			return cleanDir == flowsRootDir(collRoot)
		}
	}
	return !s.isPathInFlowsDir("", filepath.Dir(cleanDir), true)
}

func (s *FlowService) readOrInitFolderMeta(dirPath string) (model.FlowFolder, error) {
	metaPath := filepath.Join(dirPath, folderMetaFile)
	var folder model.FlowFolder
	if s.fs.Exists(metaPath) {
		if err := s.fs.ReadJSON(metaPath, &folder); err != nil {
			return model.FlowFolder{}, err
		}
		return folder, nil
	}
	if !s.isRootFlowsDir(dirPath) {
		return model.FlowFolder{}, fmt.Errorf("%s: %s", model.ErrNotFound, metaPath)
	}
	now := time.Now()
	return model.FlowFolder{
		ID:        flowsRootMetaID,
		Name:      flowsRootMetaName,
		Order:     []string{},
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *FlowService) writeFolderOrder(dirPath string, orderedIDs []string) error {
	folder, err := s.readOrInitFolderMeta(dirPath)
	if err != nil {
		return err
	}
	folder.Order = orderedIDs
	folder.UpdatedAt = time.Now()
	return s.fs.WriteJSON(filepath.Join(dirPath, folderMetaFile), folder)
}

func (s *FlowService) appendOrderToFolderMeta(dirPath, id string) error {
	folder, err := s.readOrInitFolderMeta(dirPath)
	if err != nil {
		return err
	}
	for _, existing := range folder.Order {
		if existing == id {
			return nil
		}
	}
	folder.Order = append(folder.Order, id)
	folder.UpdatedAt = time.Now()
	return s.fs.WriteJSON(filepath.Join(dirPath, folderMetaFile), folder)
}

func (s *FlowService) insertOrderAfterInFolderMeta(dirPath, afterID, newID string) error {
	folder, err := s.readOrInitFolderMeta(dirPath)
	if err != nil {
		return err
	}
	for _, existing := range folder.Order {
		if existing == newID {
			return nil
		}
	}
	inserted := false
	nextOrder := make([]string, 0, len(folder.Order)+1)
	for _, existing := range folder.Order {
		nextOrder = append(nextOrder, existing)
		if existing == afterID && !inserted {
			nextOrder = append(nextOrder, newID)
			inserted = true
		}
	}
	if !inserted {
		nextOrder = append(nextOrder, newID)
	}
	folder.Order = nextOrder
	folder.UpdatedAt = time.Now()
	return s.fs.WriteJSON(filepath.Join(dirPath, folderMetaFile), folder)
}

func (s *FlowService) removeOrderFromFolderMeta(dirPath, id string) error {
	metaPath := filepath.Join(dirPath, folderMetaFile)
	if !s.fs.Exists(metaPath) {
		return nil
	}
	var folder model.FlowFolder
	if err := s.fs.ReadJSON(metaPath, &folder); err != nil {
		return err
	}
	filtered := make([]string, 0, len(folder.Order))
	changed := false
	for _, existing := range folder.Order {
		if existing == id {
			changed = true
			continue
		}
		filtered = append(filtered, existing)
	}
	if !changed {
		return nil
	}
	folder.Order = filtered
	folder.UpdatedAt = time.Now()
	return s.fs.WriteJSON(metaPath, folder)
}

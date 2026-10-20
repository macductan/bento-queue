// app.go is a thin Wails adapter struct (AD-5).
// It delegates all business logic to service layer — no business logic here.
package main

import (
	"context"
	"log/slog"
	"path/filepath"
	"strings"
	"sync"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

// App is the Wails application struct. It acts as a thin adapter
// between Wails bindings and the service layer (AD-5).
type App struct {
	mu               sync.RWMutex
	ctx              context.Context
	fs               *storage.FileSystem
	cfgSvc           *service.ConfigService
	reqSvc           *service.RequestService
	collSvc          *service.CollectionService
	envSvc           *service.EnvironmentService
	execSvc          *service.ExecutorService
	impSvc           *service.ImporterService
	gitSyncSvc       *service.GitSyncService
	historySvc       *service.HistoryService
	mockServerSvc    *service.MockServerService
	logger           *slog.Logger
	collRoot         string
	collectionsRoot  string
	activeCollection string
}

// NewApp creates a new App with all service dependencies injected.
func NewApp() *App {
	logger := slog.Default()
	fs := storage.NewFileSystem()

	return &App{
		fs:            fs,
		cfgSvc:        service.NewConfigService(fs, logger),
		reqSvc:        service.NewRequestService(fs, logger),
		collSvc:       service.NewCollectionService(fs, logger),
		envSvc:        service.NewEnvironmentService(fs, logger),
		execSvc:       service.NewExecutorService(logger),
		impSvc:        service.NewImporterService(fs, logger),
		gitSyncSvc:    service.NewGitSyncService(fs, logger),
		historySvc:    service.NewHistoryService(fs, logger),
		mockServerSvc: service.NewMockServerService(fs, logger),
		logger:        logger,
	}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods.
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// Khởi tạo app config và default collection (Story 1.2)
	if cfg, err := a.cfgSvc.Initialize(ctx); err != nil {
		a.logger.Error("config initialization failed", "error", err)
		// App continues — error already logged and event emitted by ConfigService
	} else {
		a.mu.Lock()
		a.collRoot = cfg.CollectionRoot
		a.collectionsRoot = cfg.CollectionsRoot
		a.activeCollection = cfg.ActiveCollection
		a.fs.SetCollectionRoot(a.collRoot)
		a.mu.Unlock()
	}

	a.logger.Info("hecto-api started")
}

// --- Wails Bindings: Entity-oriented CRUD (AD-2) ---
// Each binding = one operation on one entity. Name = Verb + Entity.

// GetCollectionTree returns the collection tree structure.
// GetCollectionRoot returns the current collection root path.
func (a *App) GetCollectionRoot() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.collRoot
}

// GetCollectionTree returns the collection tree structure.
func (a *App) GetCollectionTree() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.collSvc.GetTree(root)
}

// GetRequest retrieves a request by UUID.
func (a *App) GetRequest(id string) model.Result {
	return a.reqSvc.Get(id)
}

// SaveRequest persists a request to disk.
func (a *App) SaveRequest(req model.Request) model.Result {
	res := a.reqSvc.Save(req)
	if res.Success {
		a.recordChangelog("request", req.ID, req.Name, "update", "Cập nhật request "+req.Name+" ("+req.Method+")")
	}
	return res
}

// DeleteRequest removes a request from disk.
func (a *App) DeleteRequest(id string) model.Result {
	res := a.reqSvc.Delete(id)
	if res.Success {
		a.recordChangelog("request", id, id, "delete", "Xóa request "+id)
	}
	return res
}

// CreateFolder creates a new folder.
func (a *App) CreateFolder(parentFolderId string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.CreateFolder(root, parentFolderId)
	if res.Success {
		if node, ok := res.Data.(model.TreeNode); ok {
			a.recordChangelog("folder", node.ID, node.Name, "create", "Tạo thư mục "+node.Name)
		}
	}
	return res
}

// CreateRequest creates a new request.
func (a *App) CreateRequest(parentFolderId string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.CreateRequest(root, parentFolderId)
	if res.Success {
		if node, ok := res.Data.(model.TreeNode); ok {
			a.recordChangelog("request", node.ID, node.Name, "create", "Tạo request "+node.Name)
		}
	}
	return res
}

// RenameFolder renames a folder.
func (a *App) RenameFolder(id, newName string) model.Result {
	res := a.collSvc.RenameFolder(id, newName)
	if res.Success {
		a.recordChangelog("folder", id, newName, "rename", "Đổi tên thư mục thành "+newName)
	}
	return res
}

// RenameRequest renames a request.
func (a *App) RenameRequest(id, newName string) model.Result {
	res := a.reqSvc.Rename(id, newName)
	if res.Success {
		a.recordChangelog("request", id, newName, "rename", "Đổi tên request thành "+newName)
	}
	return res
}

// DeleteFolder removes a folder and all its contents.
func (a *App) DeleteFolder(id string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.DeleteFolder(root, id)
	if res.Success {
		a.recordChangelog("folder", id, id, "delete", "Xóa thư mục "+id)
	}
	return res
}

// DuplicateRequest duplicates a request by UUID.
func (a *App) DuplicateRequest(id string) model.Result {
	res := a.reqSvc.Duplicate(id)
	if res.Success {
		a.recordChangelog("request", id, id, "duplicate", "Nhân bản request "+id)
	}
	return res
}

// MoveRequest moves a request to a new folder.
func (a *App) MoveRequest(id, targetFolderID string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.MoveRequest(root, id, targetFolderID)
	if res.Success {
		a.recordChangelog("request", id, id, "move", "Di chuyển request sang thư mục khác")
	}
	return res
}

// MoveFolder moves a folder and all its contents to a target folder (or root when targetFolderID is "").
func (a *App) MoveFolder(folderID, targetFolderID string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.MoveFolder(root, folderID, targetFolderID)
	if res.Success {
		a.recordChangelog("folder", folderID, folderID, "move", "Di chuyển thư mục sang vị trí khác")
	}
	return res
}

// ReorderNodes updates the order of items within a folder (or root if parentFolderId is empty).
func (a *App) ReorderNodes(parentFolderId string, nodeIds []string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.collSvc.ReorderNodes(root, parentFolderId, nodeIds)
	if res.Success {
		a.recordChangelog("order", parentFolderId, parentFolderId, "reorder", "Sắp xếp lại các mục")
	}
	return res
}

// ListEnvironments returns all environments.
func (a *App) ListEnvironments() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.envSvc.List(root)
}

// GetEnvironment retrieves an environment by UUID.
func (a *App) GetEnvironment(id string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.envSvc.Get(root, id)
}

// SaveEnvironment persists an environment to disk.
func (a *App) SaveEnvironment(env model.Environment) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.envSvc.Save(root, env)
	if res.Success {
		a.recordChangelog("environment", env.ID, env.Name, "update", "Lưu môi trường "+env.Name)
	}
	return res
}

// DeleteEnvironment removes an environment from disk.
func (a *App) DeleteEnvironment(id string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	res := a.envSvc.Delete(root, id)
	if res.Success {
		a.recordChangelog("environment", id, id, "delete", "Xóa môi trường "+id)
	}
	return res
}

// SendRequest executes an HTTP request.
func (a *App) SendRequest(req model.ExecuteRequest) model.Result {
	return a.execSvc.Send(req)
}

// AbortRequest cancels the current in-flight request.
func (a *App) AbortRequest() model.Result {
	return a.execSvc.Abort()
}

// SelectPostmanFile opens a file dialog for selecting a Postman collection file.
func (a *App) SelectPostmanFile() string {
	file, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Postman Collection",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "JSON Files (*.json)",
				Pattern:     "*.json",
			},
		},
	})
	if err != nil {
		a.logger.Error("SelectPostmanFile failed", "error", err)
		return ""
	}
	return file
}

// ImportPostman imports a Postman v2.1 collection file.
func (a *App) ImportPostman(filePath string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.impSvc.ImportPostman(root, filePath, func(count int, total int, text string) {
		runtime.EventsEmit(a.ctx, "import:progress", map[string]interface{}{
			"count": count,
			"total": total,
			"text":  text,
		})
	})
}

// SelectDirectoryDialog opens a folder dialog for selecting a storage directory.
func (a *App) SelectDirectoryDialog() string {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Storage Location",
	})
	if err != nil {
		a.logger.Error("SelectDirectoryDialog failed", "error", err)
		return ""
	}
	return dir
}

// UpdateCollectionRoot updates the collection root and reinitializes default collection.
func (a *App) UpdateCollectionRoot(newRoot string) model.Result {
	a.mu.Lock()
	defer a.mu.Unlock()

	updatedRoot, err := a.cfgSvc.UpdateCollectionRoot(a.ctx, newRoot)
	if err != nil {
		a.logger.Error("UpdateCollectionRoot failed", "error", err, "newRoot", newRoot)
		return model.NewError(model.ErrIO, "Không thể cập nhật thư mục lưu trữ")
	}

	newRoot = strings.TrimSpace(newRoot)
	if newRoot == "" {
		newRoot = filepath.Dir(updatedRoot)
	}
	a.collectionsRoot = newRoot
	a.activeCollection = "default"
	a.collRoot = updatedRoot
	a.fs.SetCollectionRoot(a.collRoot)
	_ = a.fs.IndexRebuild(a.collRoot)
	return model.NewSuccess(a.collRoot)
}

// ListCollections returns all collections in the collections root.
func (a *App) ListCollections() model.Result {
	a.mu.RLock()
	cRoot := a.collectionsRoot
	active := a.activeCollection
	a.mu.RUnlock()
	return a.collSvc.ListCollections(cRoot, active)
}

// CreateCollection creates a new collection on disk.
func (a *App) CreateCollection(name string) model.Result {
	a.mu.RLock()
	cRoot := a.collectionsRoot
	a.mu.RUnlock()
	return a.collSvc.CreateCollection(cRoot, name)
}

// RenameCollection updates a collection's display name.
func (a *App) RenameCollection(id, newName string) model.Result {
	id = strings.TrimSpace(id)
	a.mu.RLock()
	cRoot := a.collectionsRoot
	a.mu.RUnlock()
	return a.collSvc.RenameCollection(cRoot, id, newName)
}

// UpdateCollection updates a collection's details.
func (a *App) UpdateCollection(collection model.Collection) model.Result {
	a.mu.RLock()
	cRoot := a.collectionsRoot
	a.mu.RUnlock()
	res := a.collSvc.UpdateCollection(cRoot, collection)
	if res.Success {
		a.recordChangelog("collection", collection.ID, collection.Name, "update", "Cập nhật cấu hình collection "+collection.Name)
	}
	return res
}

// DeleteCollection deletes a collection from disk, ensuring active collection falls back to default.
func (a *App) DeleteCollection(id string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, service.ErrCollectionIDEmpty)
	}
	if id == "default" {
		return model.NewError(model.ErrValidation, service.ErrCannotDeleteDefaultColl)
	}

	a.mu.Lock()
	defer a.mu.Unlock()

	cRoot := a.collectionsRoot
	if filepath.Base(id) != id || strings.ContainsAny(id, "/\\") || id == "." || id == ".." {
		return model.NewError(model.ErrValidation, service.ErrInvalidFolderPath)
	}

	targetDir := filepath.Join(cRoot, id)
	if filepath.Clean(targetDir) == filepath.Clean(cRoot) {
		return model.NewError(model.ErrValidation, service.ErrInvalidFolderPath)
	}
	if !a.fs.Exists(targetDir) {
		return model.NewError(model.ErrNotFound, service.ErrCollectionNotFound)
	}

	switchedToDefault := false
	if id == a.activeCollection {
		switchRes := a.switchCollectionLocked("default")
		if !switchRes.Success {
			return switchRes
		}
		switchedToDefault = true
	}

	delRes := a.collSvc.DeleteCollection(cRoot, id)
	if !delRes.Success {
		return delRes
	}

	if switchedToDefault {
		return model.NewSuccess(map[string]interface{}{
			"active_collection": a.activeCollection,
		})
	}

	return delRes
}

// DuplicateCollection creates a duplicate of an existing collection.
func (a *App) DuplicateCollection(id string) model.Result {
	id = strings.TrimSpace(id)
	a.mu.RLock()
	cRoot := a.collectionsRoot
	a.mu.RUnlock()
	return a.collSvc.DuplicateCollection(cRoot, id)
}

// SwitchCollection changes the active collection and rebuilds the index.
func (a *App) SwitchCollection(id string) model.Result {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.switchCollectionLocked(id)
}

func (a *App) switchCollectionLocked(id string) model.Result {
	id = strings.TrimSpace(id)
	if id == "" {
		return model.NewError(model.ErrValidation, service.ErrCollectionIDEmpty)
	}

	if filepath.Base(id) != id || strings.ContainsAny(id, "/\\") || id == "." || id == ".." {
		return model.NewError(model.ErrValidation, service.ErrInvalidFolderPath)
	}

	targetDir := filepath.Join(a.collectionsRoot, id)
	if filepath.Clean(targetDir) == filepath.Clean(a.collectionsRoot) {
		return model.NewError(model.ErrValidation, service.ErrInvalidFolderPath)
	}
	if !a.fs.Exists(targetDir) {
		return model.NewError(model.ErrNotFound, service.ErrCollectionNotFound)
	}

	cfg, err := a.cfgSvc.SwitchActiveCollection(a.ctx, id)
	if err != nil {
		return model.NewError(model.ErrIO, err.Error())
	}

	a.activeCollection = cfg.ActiveCollection
	a.collRoot = cfg.CollectionRoot
	a.fs.SetCollectionRoot(a.collRoot)
	if err := a.fs.IndexRebuild(a.collRoot); err != nil {
		a.logger.Warn("failed to rebuild index after switch", "error", err)
	}

	return model.NewSuccess(cfg)
}

// LoadFolder loads a folder's details (including variables).
func (a *App) LoadFolder(id string) model.Result {
	return a.collSvc.LoadFolder(id)
}

// UpdateFolder updates a folder's details (variables).
func (a *App) UpdateFolder(folder model.Folder) model.Result {
	res := a.collSvc.UpdateFolder(folder)
	if res.Success {
		a.recordChangelog("folder", folder.ID, folder.Name, "update", "Cập nhật cấu hình thư mục "+folder.Name)
	}
	return res
}

func (a *App) recordChangelog(entityType, entityID, entityName, action, summary string) {
	if a.historySvc == nil {
		return
	}
	a.mu.RLock()
	root := a.collRoot
	collID := a.activeCollection
	a.mu.RUnlock()
	if strings.TrimSpace(root) == "" {
		return
	}
	_ = a.historySvc.RecordChangelog(root, model.ChangelogEntry{
		CollectionID: collID,
		EntityType:   entityType,
		EntityID:     entityID,
		EntityName:   entityName,
		Action:       action,
		Summary:      summary,
	})
}

func (a *App) resolveCollectionID(collectionID string) (string, string) {
	a.mu.RLock()
	defer a.mu.RUnlock()
	id := strings.TrimSpace(collectionID)
	if id == "" {
		id = a.activeCollection
	}
	return a.collectionsRoot, id
}

// SaveCollectionGitRemote saves the Git remote URL for a collection and configures git remote origin.
func (a *App) SaveCollectionGitRemote(collectionID, remoteURL string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	return a.gitSyncSvc.SaveRemoteURL(cRoot, id, remoteURL)
}

// GetCollectionGitStatus returns the Git sync status for a collection.
func (a *App) GetCollectionGitStatus(collectionID string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	return a.gitSyncSvc.GetStatus(cRoot, id)
}

// GitPullCollectionFromBranch executes git pull from the specified branch in the collection directory.
func (a *App) GitPullCollectionFromBranch(collectionID, branch string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	res := a.gitSyncSvc.Pull(cRoot, id, branch)
	if res.Success {
		a.mu.RLock()
		root := a.collRoot
		a.mu.RUnlock()
		if root != "" {
			_ = a.fs.IndexRebuild(root)
		}
	}
	return res
}

// GitPullCollection executes git pull in the collection directory and rebuilds index on success.
func (a *App) GitPullCollection(collectionID string) model.Result {
	return a.GitPullCollectionFromBranch(collectionID, "")
}

// GitClearAndPullCollection clears local uncommitted/untracked files, resets hard to remote, and rebuilds index.
func (a *App) GitClearAndPullCollection(collectionID string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	res := a.gitSyncSvc.ClearAndPull(cRoot, id)
	if res.Success {
		a.mu.RLock()
		root := a.collRoot
		a.mu.RUnlock()
		if root != "" {
			_ = a.fs.IndexRebuild(root)
		}
	}
	return res
}

// GitStashAndPullCollection stashes local changes, pulls from remote, pops stash, and rebuilds index.
func (a *App) GitStashAndPullCollection(collectionID string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	res := a.gitSyncSvc.StashAndPull(cRoot, id)
	if res.Success {
		a.mu.RLock()
		root := a.collRoot
		a.mu.RUnlock()
		if root != "" {
			_ = a.fs.IndexRebuild(root)
		}
	}
	return res
}

// GitListLocalBranches lists local git branches for the specified collection.
func (a *App) GitListLocalBranches(collectionID string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	return a.gitSyncSvc.ListLocalBranches(cRoot, id)
}

// GitPushCollectionToBranch stages, commits, and pushes the collection directory to the specified branch on origin.
func (a *App) GitPushCollectionToBranch(collectionID, branch string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	return a.gitSyncSvc.Push(cRoot, id, branch)
}

// GitPushCollection stages, commits, and pushes the collection directory to its configured git remote (backward compatible).
func (a *App) GitPushCollection(collectionID string) model.Result {
	return a.GitPushCollectionToBranch(collectionID, "")
}

// GitCheckoutBranch switches the collection repository to the specified branch.
func (a *App) GitCheckoutBranch(collectionID, branch string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	res := a.gitSyncSvc.CheckoutBranch(cRoot, id, branch)
	if res.Success {
		a.mu.RLock()
		root := a.collRoot
		a.mu.RUnlock()
		if root != "" {
			_ = a.fs.IndexRebuild(root)
		}
	}
	return res
}

// ResolveGitConflict writes user-resolved conflict files, stages them, completes the merge commit, and rebuilds the index.
func (a *App) ResolveGitConflict(collectionID string, resolvedFiles map[string]interface{}) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	res := a.gitSyncSvc.ResolveConflict(cRoot, id, resolvedFiles)
	if res.Success {
		a.mu.RLock()
		root := a.collRoot
		a.mu.RUnlock()
		if root != "" {
			_ = a.fs.IndexRebuild(root)
		}
	}
	return res
}

// AbortGitMerge aborts an in-progress git merge or stash conflict and restores the collection to its pre-pull state.
func (a *App) AbortGitMerge(collectionID string) model.Result {
	cRoot, id := a.resolveCollectionID(collectionID)
	res := a.gitSyncSvc.AbortMerge(cRoot, id)
	if res.Success {
		a.mu.RLock()
		root := a.collRoot
		a.mu.RUnlock()
		if root != "" {
			_ = a.fs.IndexRebuild(root)
		}
	}
	return res
}

// ListExecutionHistory returns execution history entries for the active collection.
func (a *App) ListExecutionHistory() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.historySvc.ListExecutions(root)
}

// RecordExecutionHistory records a new execution history entry for the active collection.
func (a *App) RecordExecutionHistory(entry model.ExecutionHistoryEntry) model.Result {
	a.mu.RLock()
	root := a.collRoot
	collID := a.activeCollection
	a.mu.RUnlock()
	if strings.TrimSpace(entry.CollectionID) == "" {
		entry.CollectionID = collID
	}
	return a.historySvc.RecordExecution(root, entry)
}

// ClearExecutionHistory clears all execution history entries for the active collection.
func (a *App) ClearExecutionHistory() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.historySvc.ClearExecutions(root)
}

// ListChangelog returns all changelog entries for the active collection.
func (a *App) ListChangelog() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.historySvc.ListChangelog(root)
}

// ClearChangelog clears all changelog entries for the active collection.
func (a *App) ClearChangelog() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.historySvc.ClearChangelog(root)
}

// GetMockServerStatus returns the current status and configured routes of the local Mock HTTP Server.
func (a *App) GetMockServerStatus() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.mockServerSvc.GetStatus(root)
}

// SaveMockServerConfig saves the port and routes for the active collection's Mock HTTP Server.
func (a *App) SaveMockServerConfig(cfg model.MockServerConfig) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.mockServerSvc.SaveConfig(root, cfg)
}

// StartMockServer starts the local Mock HTTP Server for the active collection on the given port.
func (a *App) StartMockServer(port int) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.mockServerSvc.Start(root, port)
}

// StopMockServer stops the running local Mock HTTP Server.
func (a *App) StopMockServer() model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.mockServerSvc.Stop(root)
}

// ExportGitSyncStatus ensures model.GitSyncStatus is exported to Wails TypeScript bindings (Rule 4).
func (a *App) ExportGitSyncStatus(status model.GitSyncStatus) model.GitSyncStatus {
	return status
}




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
		fs:      fs,
		cfgSvc:  service.NewConfigService(fs, logger),
		reqSvc:  service.NewRequestService(fs, logger),
		collSvc: service.NewCollectionService(fs, logger),
		envSvc:  service.NewEnvironmentService(fs, logger),
		execSvc: service.NewExecutorService(logger),
		impSvc:  service.NewImporterService(fs, logger),
		logger:  logger,
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
	return a.reqSvc.Save(req)
}

// DeleteRequest removes a request from disk.
func (a *App) DeleteRequest(id string) model.Result {
	return a.reqSvc.Delete(id)
}

// CreateFolder creates a new folder.
func (a *App) CreateFolder(parentFolderId string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.collSvc.CreateFolder(root, parentFolderId)
}

// CreateRequest creates a new request.
func (a *App) CreateRequest(parentFolderId string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.collSvc.CreateRequest(root, parentFolderId)
}

// RenameFolder renames a folder.
func (a *App) RenameFolder(id, newName string) model.Result {
	return a.collSvc.RenameFolder(id, newName)
}

// RenameRequest renames a request.
func (a *App) RenameRequest(id, newName string) model.Result {
	return a.reqSvc.Rename(id, newName)
}

// DeleteFolder removes a folder and all its contents.
func (a *App) DeleteFolder(id string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.collSvc.DeleteFolder(root, id)
}

// DuplicateRequest duplicates a request by UUID.
func (a *App) DuplicateRequest(id string) model.Result {
	return a.reqSvc.Duplicate(id)
}

// MoveRequest moves a request to a new folder.
func (a *App) MoveRequest(id, targetFolderID string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.collSvc.MoveRequest(root, id, targetFolderID)
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
	return a.envSvc.Save(root, env)
}

// DeleteEnvironment removes an environment from disk.
func (a *App) DeleteEnvironment(id string) model.Result {
	a.mu.RLock()
	root := a.collRoot
	a.mu.RUnlock()
	return a.envSvc.Delete(root, id)
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
	return a.collSvc.UpdateCollection(cRoot, collection)
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
	return a.collSvc.UpdateFolder(folder)
}

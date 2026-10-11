// app.go is a thin Wails adapter struct (AD-5).
// It delegates all business logic to service layer — no business logic here.
package main

import (
	"context"
	"log/slog"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

// App is the Wails application struct. It acts as a thin adapter
// between Wails bindings and the service layer (AD-5).
type App struct {
	ctx      context.Context
	fs       *storage.FileSystem
	cfgSvc   *service.ConfigService
	reqSvc   *service.RequestService
	collSvc  *service.CollectionService
	envSvc   *service.EnvironmentService
	execSvc  *service.ExecutorService
	impSvc   *service.ImporterService
	logger   *slog.Logger
	collRoot string
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
		a.collRoot = cfg.CollectionRoot
	}

	a.logger.Info("hecto-api started")
}

// --- Wails Bindings: Entity-oriented CRUD (AD-2) ---
// Each binding = one operation on one entity. Name = Verb + Entity.

// GetCollectionTree returns the collection tree structure.
// GetCollectionRoot returns the current collection root path.
func (a *App) GetCollectionRoot() string {
	return a.collRoot
}

// GetCollectionTree returns the collection tree structure.
func (a *App) GetCollectionTree() model.Result {
	return a.collSvc.GetTree(a.collRoot)
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
	return a.collSvc.CreateFolder(a.collRoot, parentFolderId)
}

// CreateRequest creates a new request.
func (a *App) CreateRequest(parentFolderId string) model.Result {
	return a.collSvc.CreateRequest(a.collRoot, parentFolderId)
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
	return a.collSvc.DeleteFolder(a.collRoot, id)
}

// DuplicateRequest duplicates a request by UUID.
func (a *App) DuplicateRequest(id string) model.Result {
	return a.reqSvc.Duplicate(id)
}

// MoveRequest moves a request to a new folder.
func (a *App) MoveRequest(id, targetFolderID string) model.Result {
	return a.collSvc.MoveRequest(a.collRoot, id, targetFolderID)
}

// ListEnvironments returns all environments.
func (a *App) ListEnvironments() model.Result {
	return a.envSvc.List(a.collRoot)
}

// GetEnvironment retrieves an environment by UUID.
func (a *App) GetEnvironment(id string) model.Result {
	return a.envSvc.Get(a.collRoot, id)
}

// SaveEnvironment persists an environment to disk.
func (a *App) SaveEnvironment(env model.Environment) model.Result {
	return a.envSvc.Save(a.collRoot, env)
}

// DeleteEnvironment removes an environment from disk.
func (a *App) DeleteEnvironment(id string) model.Result {
	return a.envSvc.Delete(a.collRoot, id)
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
	return a.impSvc.ImportPostman(a.collRoot, filePath, func(count int, total int, text string) {
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
	updatedRoot, err := a.cfgSvc.UpdateCollectionRoot(a.ctx, newRoot)
	if err != nil {
		a.logger.Error("UpdateCollectionRoot failed", "error", err, "newRoot", newRoot)
		return model.NewError(model.ErrIO, "Không thể cập nhật thư mục lưu trữ")
	}
	a.collRoot = updatedRoot
	return model.NewSuccess(a.collRoot)
}

// LoadFolder loads a folder's details (including variables).
func (a *App) LoadFolder(id string) model.Result {
	return a.collSvc.LoadFolder(id)
}

// UpdateFolder updates a folder's details (variables).
func (a *App) UpdateFolder(folder model.Folder) model.Result {
	return a.collSvc.UpdateFolder(folder)
}

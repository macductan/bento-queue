// Package service contains business logic for hecto-api.
// ConfigService quản lý app config và khởi tạo default collection.
package service

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"hecto-api/model"
	"hecto-api/storage"
)

const (
	appName            = "hecto-api"
	configFileName     = "config.json"
	collectionFileName = "collection.json"
	collectionBackup   = "collection.json.bak"
	environmentsDir    = "environments"
	defaultCollName    = "Default Collection"
	defaultCollID      = "default"
)

// ConfigService quản lý app config và default collection initialization.
// Testable không cần Wails context — nhận FileSystem và paths đã resolve.
type ConfigService struct {
	fs              *storage.FileSystem
	logger          *slog.Logger
	onStartupError  func(ctx context.Context, message string)
	customConfigDir string
}

// NewConfigService tạo ConfigService mới.
func NewConfigService(fs *storage.FileSystem, logger *slog.Logger) *ConfigService {
	return &ConfigService{fs: fs, logger: logger}
}

// SetStartupErrorHandler đăng ký hàm callback khi có lỗi lúc khởi tạo config/collection.
func (s *ConfigService) SetStartupErrorHandler(fn func(ctx context.Context, message string)) {
	s.onStartupError = fn
}

// SetCustomConfigDir ghi đè thư mục chứa config.json và collections/ (phục vụ CLI --data-dir và testing).
func (s *ConfigService) SetCustomConfigDir(dir string) {
	s.customConfigDir = strings.TrimSpace(dir)
}

// GetConfig đọc cấu hình hiện tại từ đĩa (hoặc khởi tạo mặc định nếu chưa có).
func (s *ConfigService) GetConfig() (*model.AppConfig, error) {
	configPath, err := s.resolveConfigPath()
	if err != nil {
		return nil, err
	}
	return s.loadOrCreateConfig(configPath)
}

// Initialize khởi tạo app config và default collection.
// Gọi trong App.startup(). Nếu directory creation thất bại,
// log error + emit startup error qua callback.
func (s *ConfigService) Initialize(ctx context.Context) (*model.AppConfig, error) {
	configPath, err := s.resolveConfigPath()
	if err != nil {
		s.logger.Error("không thể resolve config path", "error", err)
		s.emitStartupError(ctx, fmt.Sprintf(ErrConfigResolvePathFailed, err))
		return nil, fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	config, err := s.loadOrCreateConfig(configPath)
	if err != nil {
		s.logger.Error("không thể load/create config", "path", configPath, "error", err)
		s.emitStartupError(ctx, fmt.Sprintf(ErrConfigInitFailed, err))
		return nil, fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	// Đảm bảo collections_root tồn tại
	if err := s.fs.MakeDir(config.CollectionsRoot); err != nil {
		s.logger.Error("không thể tạo collections root", "path", config.CollectionsRoot, "error", err)
	}

	// Đảm bảo default collection luôn tồn tại: {collections_root}/default
	defaultCollPath := filepath.Join(config.CollectionsRoot, config.DefaultCollection)
	if err := s.ensureDefaultCollection(ctx, defaultCollPath); err != nil {
		// Log but don't return error — app should still start
		s.logger.Error("không thể khởi tạo default collection", "path", defaultCollPath, "error", err)
		s.emitStartupError(ctx, fmt.Sprintf("Không thể khởi tạo collection: %s", err))
		// Return config anyway — app continues with degraded state
	}

	// Nếu active collection không tồn tại, tự động fallback về default
	activeCollPath := filepath.Join(config.CollectionsRoot, config.ActiveCollection)
	if !s.fs.Exists(activeCollPath) {
		s.logger.Warn("active collection directory missing, fallback to default", "active", config.ActiveCollection)
		config.ActiveCollection = config.DefaultCollection
		config.CollectionRoot = defaultCollPath
		config.UpdatedAt = time.Now()
		_ = s.fs.WriteJSON(configPath, config)
	}

	s.logger.Info("app config initialized", "config_path", configPath, "collection_root", config.CollectionRoot, "collections_root", config.CollectionsRoot, "active_collection", config.ActiveCollection)
	return config, nil
}

func (s *ConfigService) resolveCustomDir() string {
	if dir := strings.TrimSpace(s.customConfigDir); dir != "" {
		return dir
	}
	return strings.TrimSpace(os.Getenv("HECTO_CONFIG_DIR"))
}

// resolveConfigPath trả về đường dẫn config file: {os.UserConfigDir()}/hecto-api/config.json
// hoặc {customDir}/config.json nếu được cấu hình qua SetCustomConfigDir / HECTO_CONFIG_DIR.
func (s *ConfigService) resolveConfigPath() (string, error) {
	if customDir := s.resolveCustomDir(); customDir != "" {
		return filepath.Join(customDir, configFileName), nil
	}
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, appName, configFileName), nil
}

// resolveDefaultCollectionsRoot trả về default collections root:
// {os.UserCacheDir()}/hecto-api/collections hoặc {customDir}/collections.
func (s *ConfigService) resolveDefaultCollectionsRoot() (string, error) {
	if customDir := s.resolveCustomDir(); customDir != "" {
		return filepath.Join(customDir, "collections"), nil
	}
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cacheDir, appName, "collections"), nil
}

// loadOrCreateConfig đọc config từ disk hoặc tạo mới nếu chưa có.
// Quản lý collections_root, default_collection, active_collection, collection_root.
// Nếu config JSON thiếu trường nào thì bổ sung giá trị mặc định.
func (s *ConfigService) loadOrCreateConfig(configPath string) (*model.AppConfig, error) {
	if s.fs.Exists(configPath) {
		var config model.AppConfig
		if err := s.fs.ReadJSON(configPath, &config); err != nil {
			// Config corrupt — không backup, tạo mới
			// (backup logic chỉ áp dụng cho collection.json theo spec)
			s.logger.Warn("config.json corrupt, tạo mới", "path", configPath, "error", err)
		} else {
			modified := false
			if strings.TrimSpace(config.CollectionsRoot) == "" {
				defaultCollections, err := s.resolveDefaultCollectionsRoot()
				if err != nil {
					return nil, err
				}
				config.CollectionsRoot = defaultCollections
				modified = true
			}
			if strings.TrimSpace(config.DefaultCollection) == "" {
				config.DefaultCollection = defaultCollID
				modified = true
			}
			if strings.TrimSpace(config.ActiveCollection) == "" {
				config.ActiveCollection = config.DefaultCollection
				modified = true
			}

			// Fallback về default nếu active collection không tồn tại trên disk
			activePath := filepath.Join(config.CollectionsRoot, config.ActiveCollection)
			if !s.fs.Exists(activePath) && config.ActiveCollection != config.DefaultCollection {
				s.logger.Warn("active collection folder missing, fallback to default", "active", config.ActiveCollection)
				config.ActiveCollection = config.DefaultCollection
				modified = true
			}

			expectedCollRoot := filepath.Join(config.CollectionsRoot, config.ActiveCollection)
			if config.CollectionRoot != expectedCollRoot {
				config.CollectionRoot = expectedCollRoot
				modified = true
			}

			if modified {
				config.UpdatedAt = time.Now()
				if writeErr := s.fs.WriteJSON(configPath, config); writeErr != nil {
					return nil, writeErr
				}
			}
			return &config, nil
		}
	}

	// Tạo config mới
	defaultCollections, err := s.resolveDefaultCollectionsRoot()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	config := &model.AppConfig{
		CollectionsRoot:   defaultCollections,
		DefaultCollection: defaultCollID,
		ActiveCollection:  defaultCollID,
		CollectionRoot:    filepath.Join(defaultCollections, defaultCollID),
		CreatedAt:         now,
		UpdatedAt:         now,
	}

	if err := s.fs.WriteJSON(configPath, config); err != nil {
		return nil, err
	}

	s.logger.Info("config.json created", "path", configPath)
	return config, nil
}

// ensureDefaultCollection đảm bảo collection directory, collection.json,
// và environments/ subdirectory tồn tại. Nếu collection.json corrupt,
// backup thành .bak rồi tạo mới.
func (s *ConfigService) ensureDefaultCollection(ctx context.Context, collectionRoot string) error {
	// Tạo collection root directory
	if err := s.fs.MakeDir(collectionRoot); err != nil {
		return err
	}

	// Tạo environments/ subdirectory
	envDir := filepath.Join(collectionRoot, environmentsDir)
	if err := s.fs.MakeDir(envDir); err != nil {
		return err
	}

	collectionPath := filepath.Join(collectionRoot, collectionFileName)

	if s.fs.Exists(collectionPath) {
		// collection.json tồn tại — kiểm tra valid
		var coll model.Collection
		if err := s.fs.ReadJSON(collectionPath, &coll); err != nil {
			// Corrupt — backup rồi recreate
			s.logger.Warn("collection.json corrupt, backup và tạo mới",
				"path", collectionPath, "error", err)

			backupPath := filepath.Join(collectionRoot, collectionBackup)
			if mvErr := s.fs.MoveFile(collectionPath, backupPath); mvErr != nil {
				s.logger.Error("không thể backup collection.json", "error", mvErr)
				// Tiếp tục tạo mới dù backup thất bại
			}
		} else {
			// Valid — skip
			s.logger.Debug("collection.json exists and valid", "path", collectionPath)
			return nil
		}
	}

	// Tạo collection.json mới
	return s.createDefaultCollection(collectionPath)
}

// createDefaultCollection tạo collection.json với name, timestamps.
func (s *ConfigService) createDefaultCollection(path string) error {
	now := time.Now()
	coll := model.Collection{
		ID:          defaultCollID,
		Name:        defaultCollName,
		Description: "",
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	if err := s.fs.WriteJSON(path, coll); err != nil {
		return err
	}

	s.logger.Info("collection.json created", "path", path, "id", coll.ID)
	return nil
}

// emitStartupError gọi callback onStartupError nếu đã được đăng ký.
func (s *ConfigService) emitStartupError(ctx context.Context, message string) {
	if ctx == nil || s.onStartupError == nil {
		return
	}
	s.onStartupError(ctx, message)
}

// SwitchActiveCollection switches active_collection in config.json and updates collection_root.
func (s *ConfigService) SwitchActiveCollection(ctx context.Context, id string) (*model.AppConfig, error) {
	id = strings.TrimSpace(id)
	if id == "" || filepath.Base(id) != id || strings.ContainsAny(id, "/\\") || id == "." || id == ".." {
		return nil, fmt.Errorf("%s: invalid collection id %s", model.ErrValidation, id)
	}

	configPath, err := s.resolveConfigPath()
	if err != nil {
		return nil, fmt.Errorf("resolve config path: %w", err)
	}

	config, err := s.loadOrCreateConfig(configPath)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	targetDir := filepath.Join(config.CollectionsRoot, id)
	if !s.fs.Exists(targetDir) {
		return nil, fmt.Errorf("%s: collection %s", model.ErrNotFound, id)
	}

	config.ActiveCollection = id
	config.CollectionRoot = targetDir
	config.UpdatedAt = time.Now()

	if err := s.fs.WriteJSON(configPath, config); err != nil {
		return nil, fmt.Errorf("write config: %w", err)
	}

	s.logger.Info("switched active collection", "active", id, "coll_root", targetDir)
	return config, nil
}

// GetDefaultCollection returns the default collection ID.
func (s *ConfigService) GetDefaultCollection() string {
	return defaultCollID
}

// UpdateCollectionRoot updates collections_root in config.json and ensures default collection is initialized.
func (s *ConfigService) UpdateCollectionRoot(ctx context.Context, newRoot string) (string, error) {
	newRoot = strings.TrimSpace(newRoot)
	if newRoot == "" {
		defaultRoot, err := s.resolveDefaultCollectionsRoot()
		if err != nil {
			return "", fmt.Errorf("resolve default root: %w", err)
		}
		newRoot = defaultRoot
	}

	configPath, err := s.resolveConfigPath()
	if err != nil {
		return "", fmt.Errorf("resolve config path: %w", err)
	}
	
	// Load current config
	config, err := s.loadOrCreateConfig(configPath)
	if err != nil {
		return "", fmt.Errorf("load config: %w", err)
	}

	// Ensure new collections directory exists
	if err := s.fs.MakeDir(newRoot); err != nil {
		return "", fmt.Errorf("ensure collections dir: %w", err)
	}

	// Reset ActiveCollection to "default" (since newRoot only scaffolds default)
	config.ActiveCollection = defaultCollID

	// Ensure default collection exists inside new collections_root
	defaultCollPath := filepath.Join(newRoot, config.DefaultCollection)
	if err := s.ensureDefaultCollection(ctx, defaultCollPath); err != nil {
		return "", fmt.Errorf("ensure default collection: %w", err)
	}

	config.CollectionsRoot = newRoot
	config.CollectionRoot = filepath.Join(newRoot, config.ActiveCollection)
	config.UpdatedAt = time.Now()

	// Write back
	if err := s.fs.WriteJSON(configPath, config); err != nil {
		return "", fmt.Errorf("write config: %w", err)
	}

	s.logger.Info("collection root updated", "new_collections_root", newRoot, "coll_root", config.CollectionRoot)
	return config.CollectionRoot, nil
}

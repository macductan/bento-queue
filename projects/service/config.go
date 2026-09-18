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

	"github.com/google/uuid"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

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
)

// ConfigService quản lý app config và default collection initialization.
// Testable không cần Wails context — nhận FileSystem và paths đã resolve.
type ConfigService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewConfigService tạo ConfigService mới.
func NewConfigService(fs *storage.FileSystem, logger *slog.Logger) *ConfigService {
	return &ConfigService{fs: fs, logger: logger}
}

// Initialize khởi tạo app config và default collection.
// Gọi trong App.startup(). Nếu directory creation thất bại,
// log error + emit Wails event "startup-error".
func (s *ConfigService) Initialize(ctx context.Context) (*model.AppConfig, error) {
	configPath, err := s.resolveConfigPath()
	if err != nil {
		s.logger.Error("không thể resolve config path", "error", err)
		s.emitStartupError(ctx, fmt.Sprintf("Không thể xác định thư mục config: %s", err))
		return nil, fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	config, err := s.loadOrCreateConfig(configPath)
	if err != nil {
		s.logger.Error("không thể load/create config", "path", configPath, "error", err)
		s.emitStartupError(ctx, fmt.Sprintf("Không thể khởi tạo config: %s", err))
		return nil, fmt.Errorf("%s: %w", model.ErrIO, err)
	}

	if err := s.ensureDefaultCollection(ctx, config.CollectionRoot); err != nil {
		// Log but don't return error — app should still start
		s.logger.Error("không thể khởi tạo default collection", "path", config.CollectionRoot, "error", err)
		s.emitStartupError(ctx, fmt.Sprintf("Không thể khởi tạo collection: %s", err))
		// Return config anyway — app continues with degraded state
	}

	s.logger.Info("app config initialized", "config_path", configPath, "collection_root", config.CollectionRoot)
	return config, nil
}

// resolveConfigPath trả về đường dẫn config file: {os.UserConfigDir()}/hecto-api/config.json
func (s *ConfigService) resolveConfigPath() (string, error) {
	configDir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(configDir, appName, configFileName), nil
}

// resolveDefaultCollectionRoot trả về default collection root:
// {os.UserCacheDir()}/hecto-api/collections/default/
func (s *ConfigService) resolveDefaultCollectionRoot() (string, error) {
	cacheDir, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(cacheDir, appName, "collections", "default"), nil
}

// loadOrCreateConfig đọc config từ disk hoặc tạo mới nếu chưa có.
// Nếu config JSON valid nhưng thiếu collection_root, dùng default và update file.
func (s *ConfigService) loadOrCreateConfig(configPath string) (*model.AppConfig, error) {
	if s.fs.Exists(configPath) {
		var config model.AppConfig
		if err := s.fs.ReadJSON(configPath, &config); err != nil {
			// Config corrupt — không backup, tạo mới
			// (backup logic chỉ áp dụng cho collection.json theo spec)
			s.logger.Warn("config.json corrupt, tạo mới", "path", configPath, "error", err)
		} else {
			// Config valid — kiểm tra collection_root
			if strings.TrimSpace(config.CollectionRoot) == "" {
				defaultRoot, err := s.resolveDefaultCollectionRoot()
				if err != nil {
					return nil, err
				}
				config.CollectionRoot = defaultRoot
				config.UpdatedAt = time.Now()
				if writeErr := s.fs.WriteJSON(configPath, config); writeErr != nil {
					return nil, writeErr
				}
			}
			return &config, nil
		}
	}

	// Tạo config mới
	defaultRoot, err := s.resolveDefaultCollectionRoot()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	config := &model.AppConfig{
		CollectionRoot: defaultRoot,
		CreatedAt:      now,
		UpdatedAt:      now,
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

// createDefaultCollection tạo collection.json với UUID, name, timestamps.
func (s *ConfigService) createDefaultCollection(path string) error {
	now := time.Now()
	coll := model.Collection{
		ID:          uuid.New().String(),
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

// emitStartupError emit Wails event "startup-error" nếu context có Wails runtime.
func (s *ConfigService) emitStartupError(ctx context.Context, message string) {
	if ctx == nil {
		return
	}
	wailsRuntime.EventsEmit(ctx, "startup-error", message)
}

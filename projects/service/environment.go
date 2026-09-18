package service

import (
	"log/slog"
	"time"

	"github.com/google/uuid"

	"hecto-api/model"
	"hecto-api/storage"
)

// EnvironmentService handles CRUD operations for environments.
type EnvironmentService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewEnvironmentService creates a new EnvironmentService.
func NewEnvironmentService(fs *storage.FileSystem, logger *slog.Logger) *EnvironmentService {
	return &EnvironmentService{fs: fs, logger: logger}
}

// List returns all environments.
func (s *EnvironmentService) List(collRoot string) model.Result {
	envs, err := s.fs.ListEnvironments(collRoot)
	if err != nil {
		s.logger.Error("failed to list environments", "error", err)
		return model.NewError(model.ErrIO, err.Error())
	}

	if envs == nil {
		envs = []model.Environment{}
	}

	return model.NewSuccess(envs)
}

// Get retrieves an environment by UUID.
func (s *EnvironmentService) Get(collRoot, id string) model.Result {
	env, err := s.fs.GetEnvironment(collRoot, id)
	if err != nil {
		s.logger.Error("failed to get environment", "id", id, "error", err)
		return model.NewError(model.ErrNotFound, err.Error())
	}
	return model.NewSuccess(*env)
}

// Save persists an environment to disk. Generate UUID if empty.
func (s *EnvironmentService) Save(collRoot string, env model.Environment) model.Result {
	now := time.Now()
	
	if env.ID == "" {
		env.ID = uuid.NewString()
		env.CreatedAt = now
	}
	env.UpdatedAt = now

	// Ensure Variables is at least an empty slice, not nil
	if env.Variables == nil {
		env.Variables = []model.KVPair{}
	}

	if err := s.fs.SaveEnvironment(collRoot, env); err != nil {
		s.logger.Error("failed to save environment", "id", env.ID, "error", err)
		return model.NewError(model.ErrIO, err.Error())
	}

	return model.NewSuccess(env)
}

// Delete removes an environment from disk.
func (s *EnvironmentService) Delete(collRoot, id string) model.Result {
	if err := s.fs.DeleteEnvironment(collRoot, id); err != nil {
		s.logger.Error("failed to delete environment", "id", id, "error", err)
		return model.NewError(model.ErrIO, err.Error())
	}
	return model.NewSuccess(nil)
}

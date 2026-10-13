package storage

import (
	"fmt"
	"path/filepath"
	"strings"

	"hecto-api/model"
	"hecto-api/slug"
)

// ListEnvironments returns all environments in the given collection root.
func (f *FileSystem) ListEnvironments(collRoot string) ([]model.Environment, error) {
	envsDir := filepath.Join(collRoot, "environments")
	entries, err := f.ListDir(envsDir)
	if err != nil {
		if strings.HasPrefix(err.Error(), model.ErrNotFound) {
			return []model.Environment{}, nil // Return empty list if dir doesn't exist
		}
		return nil, err
	}

	var envs []model.Environment
	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		path := filepath.Join(envsDir, entry.Name())
		var env model.Environment
		if err := f.ReadJSON(path, &env); err != nil {
			// Skip unreadable files
			continue
		}
		envs = append(envs, env)
	}

	return envs, nil
}

// GetEnvironment retrieves an environment by ID.
func (f *FileSystem) GetEnvironment(collRoot, id string) (*model.Environment, error) {
	if strings.TrimSpace(id) == "" {
		return nil, fmt.Errorf("%s: environment id empty", model.ErrNotFound)
	}

	envs, err := f.ListEnvironments(collRoot)
	if err != nil {
		return nil, err
	}

	for _, env := range envs {
		if env.ID == id {
			return &env, nil
		}
	}

	return nil, fmt.Errorf("%s: environment %s", model.ErrNotFound, id)
}

// DeleteEnvironment deletes an environment by ID.
func (f *FileSystem) DeleteEnvironment(collRoot, id string) error {
	if strings.TrimSpace(id) == "" {
		return fmt.Errorf("%s: environment id empty", model.ErrNotFound)
	}

	envsDir := filepath.Join(collRoot, "environments")
	entries, err := f.ListDir(envsDir)
	if err != nil {
		return err
	}

	for _, entry := range entries {
		if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
			continue
		}

		path := filepath.Join(envsDir, entry.Name())
		var env model.Environment
		if err := f.ReadJSON(path, &env); err == nil && env.ID == id {
			return f.Delete(path)
		}
	}

	return fmt.Errorf("%s: environment %s", model.ErrNotFound, id)
}

// SaveEnvironment saves an environment. If the file doesn't exist, it creates it with a pure UUID filename <uuid>.json.
func (f *FileSystem) SaveEnvironment(collRoot string, env model.Environment) error {
	envsDir := filepath.Join(collRoot, "environments")

	entries, err := f.ListDir(envsDir)
	if err != nil && !strings.HasPrefix(err.Error(), model.ErrNotFound) {
		return err
	}

	var existingPath string
	if strings.TrimSpace(env.ID) != "" {
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".json" {
				continue
			}

			path := filepath.Join(envsDir, entry.Name())
			var existingEnv model.Environment
			if err := f.ReadJSON(path, &existingEnv); err == nil && existingEnv.ID == env.ID {
				existingPath = path
				break
			}
		}
	}

	if existingPath != "" {
		// Update existing file (filename remains unchanged)
		return f.WriteJSON(existingPath, env)
	}

	// Create new file with <uuid>.json
	if strings.TrimSpace(env.ID) == "" {
		env.ID = slug.UUID()
	}

	filename := slug.EnvironmentFilename(env.ID)
	path := filepath.Join(envsDir, filename)

	return f.WriteJSON(path, env)
}

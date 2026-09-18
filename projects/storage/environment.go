package storage

import (
	"fmt"
	"path/filepath"
	"strings"

	"hecto-api/model"
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

// SaveEnvironment saves an environment. If the file doesn't exist, it creates it with a slugified name.
func (f *FileSystem) SaveEnvironment(collRoot string, env model.Environment) error {
	envsDir := filepath.Join(collRoot, "environments")

	entries, err := f.ListDir(envsDir)
	if err != nil && !strings.HasPrefix(err.Error(), model.ErrNotFound) {
		return err
	}
	var existingPath string
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

	if existingPath != "" {
		// Update existing file (filename remains unchanged)
		return f.WriteJSON(existingPath, env)
	}

	// Create new file
	slug := slugify(env.Name)
	if slug == "" {
		slug = "env"
	}

	basePath := filepath.Join(envsDir, slug)
	path := basePath + ".json"
	
	// Handle collisions
	counter := 1
	for f.Exists(path) {
		path = fmt.Sprintf("%s-%d.json", basePath, counter)
		counter++
	}

	return f.WriteJSON(path, env)
}

func slugify(name string) string {
	name = strings.ToLower(name)
	
	replacer := strings.NewReplacer(
		"á", "a", "à", "a", "ả", "a", "ã", "a", "ạ", "a", "ă", "a", "ắ", "a", "ằ", "a", "ẳ", "a", "ẵ", "a", "ặ", "a", "â", "a", "ấ", "a", "ầ", "a", "ẩ", "a", "ẫ", "a", "ậ", "a",
		"đ", "d",
		"é", "e", "è", "e", "ẻ", "e", "ẽ", "e", "ẹ", "e", "ê", "e", "ế", "e", "ề", "e", "ể", "e", "ễ", "e", "ệ", "e",
		"í", "i", "ì", "i", "ỉ", "i", "ĩ", "i", "ị", "i",
		"ó", "o", "ò", "o", "ỏ", "o", "õ", "o", "ọ", "o", "ô", "o", "ố", "o", "ồ", "o", "ổ", "o", "ỗ", "o", "ộ", "o", "ơ", "o", "ớ", "o", "ờ", "o", "ở", "o", "ỡ", "o", "ợ", "o",
		"ú", "u", "ù", "u", "ủ", "u", "ũ", "u", "ụ", "u", "ư", "u", "ứ", "u", "ừ", "u", "ử", "u", "ữ", "u", "ự", "u",
		"ý", "y", "ỳ", "y", "ỷ", "y", "ỹ", "y", "ỵ", "y",
	)
	name = replacer.Replace(name)
	name = strings.ReplaceAll(name, " ", "-")
	
	var sb strings.Builder
	for _, r := range name {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			sb.WriteRune(r)
		}
	}
	slug := sb.String()
	for strings.Contains(slug, "--") {
		slug = strings.ReplaceAll(slug, "--", "-")
	}
	return strings.Trim(slug, "-")
}

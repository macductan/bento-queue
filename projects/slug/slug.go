// Package slug provides pure-UUID filename and directory helpers.
// Slugs and Vietnamese diacritic conversions have been completely removed
// in favor of pure UUID v4 identifiers (Pure UUID Architecture).
package slug

import (
	"strings"

	"github.com/google/uuid"
)

// UUID generates a new pure UUID v4 string.
func UUID() string {
	return uuid.NewString()
}

// Filename returns "<id>.json". If id is omitted or whitespace-empty, generates a new UUID v4.
func Filename(id ...string) string {
	if len(id) > 0 {
		trimmed := strings.TrimSpace(id[0])
		if trimmed != "" {
			trimmed = strings.TrimSuffix(trimmed, ".json")
			return trimmed + ".json"
		}
	}
	return uuid.NewString() + ".json"
}

// Dir returns "<id>". If id is omitted or whitespace-empty, generates a new UUID v4.
func Dir(id ...string) string {
	if len(id) > 0 {
		trimmed := strings.TrimSpace(id[0])
		if trimmed != "" {
			return trimmed
		}
	}
	return uuid.NewString()
}

// RequestFilename returns a filename for a request entity ("<id>.json").
func RequestFilename(id ...string) string {
	return Filename(id...)
}

// EnvironmentFilename returns a filename for an environment entity ("<id>.json").
func EnvironmentFilename(id ...string) string {
	return Filename(id...)
}

// FolderDir returns a directory name for a folder entity ("<id>").
func FolderDir(id ...string) string {
	return Dir(id...)
}

// CollectionDir returns a directory name for a collection entity ("<id>").
func CollectionDir(id ...string) string {
	return Dir(id...)
}

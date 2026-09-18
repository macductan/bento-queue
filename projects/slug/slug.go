// Package slug provides utilities for generating Git-friendly filenames
// from Vietnamese and Unicode strings. Slugs are generated at entity
// creation time and do not change on rename (AD-4).
package slug

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"

	"golang.org/x/text/unicode/norm"
)

// nonAlphanumHyphen matches any character that is not alphanumeric or hyphen.
var nonAlphanumHyphen = regexp.MustCompile(`[^a-z0-9-]`)

// multiHyphen matches two or more consecutive hyphens.
var multiHyphen = regexp.MustCompile(`-{2,}`)

// Generate creates a kebab-case slug from a name string with .json extension.
// Vietnamese diacritics are stripped via Unicode NFD normalization.
// Output: lowercase, spaces/underscores → hyphens, non-alphanumeric removed,
// consecutive hyphens collapsed, leading/trailing hyphens trimmed.
// Empty input produces "untitled.json".
func Generate(name string) string {
	s := strings.TrimSpace(name)
	if s == "" {
		return "untitled.json"
	}

	// NFD normalize — decomposes accented characters into base + combining marks
	s = norm.NFD.String(s)

	// Remove combining marks (Unicode category Mn = Mark, Nonspacing)
	// This strips diacritics: "Đ" → "Đ" (NFD doesn't decompose Đ/đ — handle separately)
	var b strings.Builder
	for _, r := range s {
		if !unicode.Is(unicode.Mn, r) {
			b.WriteRune(r)
		}
	}
	s = b.String()

	// Handle Vietnamese Đ/đ explicitly — NFD does not decompose these
	s = strings.ReplaceAll(s, "Đ", "D")
	s = strings.ReplaceAll(s, "đ", "d")

	// Lowercase
	s = strings.ToLower(s)

	// Spaces and underscores → hyphens
	s = strings.ReplaceAll(s, " ", "-")
	s = strings.ReplaceAll(s, "_", "-")

	// Remove non-alphanumeric, non-hyphen characters
	s = nonAlphanumHyphen.ReplaceAllString(s, "")

	// Collapse multiple hyphens
	s = multiHyphen.ReplaceAllString(s, "-")

	// Trim leading/trailing hyphens
	s = strings.Trim(s, "-")

	if s == "" {
		return "untitled.json"
	}

	return s + ".json"
}

// GenerateUnique creates a unique slug filename in the given directory.
// If the base slug already exists, appends "-1", "-2", etc. until unique.
func GenerateUnique(name, dir string) string {
	base := Generate(name)
	ext := filepath.Ext(base)
	stem := strings.TrimSuffix(base, ext)

	// Check if base name is available
	candidate := base
	if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
		return candidate
	}

	// Append numeric suffix until unique
	for i := 1; ; i++ {
		candidate = fmt.Sprintf("%s-%d%s", stem, i, ext)
		if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
			return candidate
		}
	}
}

// GenerateDir creates a kebab-case slug for a directory (no extension).
func GenerateDir(name string) string {
	s := strings.TrimSuffix(Generate(name), ".json")
	if s == "untitled" {
		return "untitled-dir"
	}
	return s
}

// GenerateUniqueDir creates a unique directory slug in the given directory.
func GenerateUniqueDir(name, dir string) string {
	base := GenerateDir(name)

	candidate := base
	if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
		return candidate
	}

	for i := 1; ; i++ {
		candidate = fmt.Sprintf("%s-%d", base, i)
		if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
			return candidate
		}
	}
}

// UniqueFilename ensures a specific filename is unique in the given directory
// by appending "-1", "-2" before the extension if a conflict exists.
func UniqueFilename(filename, dir string) string {
	candidate := filename
	if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
		return candidate
	}

	ext := filepath.Ext(filename)
	stem := strings.TrimSuffix(filename, ext)

	for i := 1; ; i++ {
		candidate = fmt.Sprintf("%s-%d%s", stem, i, ext)
		if _, err := os.Stat(filepath.Join(dir, candidate)); os.IsNotExist(err) {
			return candidate
		}
	}
}

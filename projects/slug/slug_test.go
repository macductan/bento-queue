package slug

import (
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestUUID(t *testing.T) {
	u1 := UUID()
	if len(u1) != 36 {
		t.Fatalf("expected 36-character UUID, got %q (len %d)", u1, len(u1))
	}

	parsed, err := uuid.Parse(u1)
	if err != nil {
		t.Fatalf("expected valid UUID v4, parse error: %v", err)
	}
	if parsed.Version() != 4 {
		t.Errorf("expected UUID version 4, got %v", parsed.Version())
	}

	u2 := UUID()
	if u1 == u2 {
		t.Errorf("expected distinct UUIDs on successive calls, got %q == %q", u1, u2)
	}
}

func TestFilename(t *testing.T) {
	// Specific ID
	got := Filename("abc-123")
	want := "abc-123.json"
	if got != want {
		t.Errorf("Filename(\"abc-123\") = %q, want %q", got, want)
	}

	// Omitted ID (new UUID generated)
	auto := Filename()
	if !strings.HasSuffix(auto, ".json") {
		t.Errorf("expected Filename() to end with .json, got %q", auto)
	}
	rawUUID := strings.TrimSuffix(auto, ".json")
	if _, err := uuid.Parse(rawUUID); err != nil {
		t.Errorf("expected valid UUID stem in Filename(), got %q: %v", rawUUID, err)
	}

	// Empty ID (new UUID generated)
	empty := Filename("")
	if !strings.HasSuffix(empty, ".json") {
		t.Errorf("expected Filename(\"\") to end with .json, got %q", empty)
	}
	rawUUID2 := strings.TrimSuffix(empty, ".json")
	if _, err := uuid.Parse(rawUUID2); err != nil {
		t.Errorf("expected valid UUID stem in Filename(\"\"), got %q: %v", rawUUID2, err)
	}

	// Whitespace-only ID (should fallback to new UUID)
	ws := Filename("   ")
	rawUUID3 := strings.TrimSuffix(ws, ".json")
	if _, err := uuid.Parse(rawUUID3); err != nil {
		t.Errorf("expected valid UUID stem in Filename(\"   \"), got %q: %v", rawUUID3, err)
	}

	// ID already ending with .json
	withExt := Filename("my-id.json")
	if withExt != "my-id.json" {
		t.Errorf("expected Filename(\"my-id.json\") to deduplicate .json, got %q", withExt)
	}
}

func TestDir(t *testing.T) {
	// Specific ID
	got := Dir("folder-123")
	want := "folder-123"
	if got != want {
		t.Errorf("Dir(\"folder-123\") = %q, want %q", got, want)
	}

	// Omitted ID (new UUID generated)
	auto := Dir()
	if _, err := uuid.Parse(auto); err != nil {
		t.Errorf("expected valid UUID in Dir(), got %q: %v", auto, err)
	}

	// Empty ID (new UUID generated)
	empty := Dir("")
	if _, err := uuid.Parse(empty); err != nil {
		t.Errorf("expected valid UUID in Dir(\"\"), got %q: %v", empty, err)
	}
}

func TestEntityHelpers(t *testing.T) {
	// RequestFilename
	if got := RequestFilename("req-1"); got != "req-1.json" {
		t.Errorf("RequestFilename(\"req-1\") = %q, want \"req-1.json\"", got)
	}
	reqAuto := RequestFilename()
	if !strings.HasSuffix(reqAuto, ".json") {
		t.Errorf("expected RequestFilename() to have .json suffix, got %q", reqAuto)
	}

	// EnvironmentFilename
	if got := EnvironmentFilename("env-1"); got != "env-1.json" {
		t.Errorf("EnvironmentFilename(\"env-1\") = %q, want \"env-1.json\"", got)
	}
	envAuto := EnvironmentFilename()
	if !strings.HasSuffix(envAuto, ".json") {
		t.Errorf("expected EnvironmentFilename() to have .json suffix, got %q", envAuto)
	}

	// FolderDir
	if got := FolderDir("fld-1"); got != "fld-1" {
		t.Errorf("FolderDir(\"fld-1\") = %q, want \"fld-1\"", got)
	}
	fldAuto := FolderDir()
	if _, err := uuid.Parse(fldAuto); err != nil {
		t.Errorf("expected FolderDir() to return valid UUID, got %q", fldAuto)
	}

	// CollectionDir
	if got := CollectionDir("col-1"); got != "col-1" {
		t.Errorf("CollectionDir(\"col-1\") = %q, want \"col-1\"", got)
	}
	if got := CollectionDir("default"); got != "default" {
		t.Errorf("CollectionDir(\"default\") = %q, want \"default\"", got)
	}
	colAuto := CollectionDir()
	if _, err := uuid.Parse(colAuto); err != nil {
		t.Errorf("expected CollectionDir() to return valid UUID, got %q", colAuto)
	}
}

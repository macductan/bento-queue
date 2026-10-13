package model

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestCollectionSerialization_NoSlug(t *testing.T) {
	now := time.Now().Truncate(time.Second)
	coll := Collection{
		ID:          "col-uuid-123",
		Name:        "Test Collection",
		Description: "A test collection",
		IsDefault:   false,
		IsActive:    true,
		CreatedAt:   now,
		UpdatedAt:   now,
	}

	data, err := json.Marshal(coll)
	if err != nil {
		t.Fatalf("failed to marshal Collection: %v", err)
	}

	jsonStr := string(data)

	// Ensure "id" is present
	if !strings.Contains(jsonStr, `"id":"col-uuid-123"`) {
		t.Errorf("expected json to contain '\"id\":\"col-uuid-123\"', got %s", jsonStr)
	}

	// Ensure "slug" key is NOT present
	if strings.Contains(jsonStr, `"slug"`) {
		t.Errorf("expected json not to contain '\"slug\"', got %s", jsonStr)
	}

	// Verify unmarshaling produces identical struct
	var decoded Collection
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal Collection: %v", err)
	}

	if decoded.ID != coll.ID {
		t.Errorf("expected ID %q, got %q", coll.ID, decoded.ID)
	}
	if decoded.Name != coll.Name {
		t.Errorf("expected Name %q, got %q", coll.Name, decoded.Name)
	}
	if decoded.Description != coll.Description {
		t.Errorf("expected Description %q, got %q", coll.Description, decoded.Description)
	}
}

func TestCollectionDeserialization_IgnoresLegacySlug(t *testing.T) {
	// Old data might have contained "slug" key in JSON
	rawJSON := `{"id":"legacy-id-456","slug":"legacy-slug-456","name":"Legacy Collection"}`

	var coll Collection
	if err := json.Unmarshal([]byte(rawJSON), &coll); err != nil {
		t.Fatalf("failed to unmarshal legacy collection JSON: %v", err)
	}

	if coll.ID != "legacy-id-456" {
		t.Errorf("expected ID 'legacy-id-456', got %q", coll.ID)
	}
	if coll.Name != "Legacy Collection" {
		t.Errorf("expected Name 'Legacy Collection', got %q", coll.Name)
	}
}

func TestEntityModels_Serialization(t *testing.T) {
	req := Request{
		ID:     "req-1",
		Name:   "Get User",
		Method: "GET",
		URL:    "https://api.example.com/users",
	}
	reqData, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal Request: %v", err)
	}
	if !strings.Contains(string(reqData), `"id":"req-1"`) {
		t.Errorf("expected Request json to contain id, got %s", string(reqData))
	}

	folder := Folder{
		ID:   "folder-1",
		Name: "Auth",
	}
	folderData, err := json.Marshal(folder)
	if err != nil {
		t.Fatalf("failed to marshal Folder: %v", err)
	}
	if !strings.Contains(string(folderData), `"id":"folder-1"`) {
		t.Errorf("expected Folder json to contain id, got %s", string(folderData))
	}

	env := Environment{
		ID:   "env-1",
		Name: "Production",
	}
	envData, err := json.Marshal(env)
	if err != nil {
		t.Fatalf("failed to marshal Environment: %v", err)
	}
	if !strings.Contains(string(envData), `"id":"env-1"`) {
		t.Errorf("expected Environment json to contain id, got %s", string(envData))
	}
}

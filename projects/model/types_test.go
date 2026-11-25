package model

import (
	"encoding/json"
	"slices"
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

func TestCollection_Variables_Serialization(t *testing.T) {
	coll := Collection{
		ID:          "col-var-1",
		Name:        "API Collection",
		Description: "Collection with variables",
		Variables: []KVPair{
			{Key: "baseUrl", Value: "https://api.example.com", Enabled: true},
			{Key: "timeout", Value: "3000", Enabled: false},
		},
	}

	data, err := json.Marshal(coll)
	if err != nil {
		t.Fatalf("failed to marshal Collection with variables: %v", err)
	}

	jsonStr := string(data)
	if !strings.Contains(jsonStr, `"variables"`) {
		t.Errorf("expected json to contain 'variables', got: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"baseUrl"`) {
		t.Errorf("expected json to contain 'baseUrl', got: %s", jsonStr)
	}

	var decoded Collection
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal Collection: %v", err)
	}

	if len(decoded.Variables) != 2 {
		t.Fatalf("expected 2 variables, got %d", len(decoded.Variables))
	}
	if decoded.Variables[0].Key != "baseUrl" || decoded.Variables[0].Value != "https://api.example.com" || !decoded.Variables[0].Enabled {
		t.Errorf("unexpected variable 0: %+v", decoded.Variables[0])
	}
	if decoded.Variables[1].Key != "timeout" || decoded.Variables[1].Value != "3000" || decoded.Variables[1].Enabled {
		t.Errorf("unexpected variable 1: %+v", decoded.Variables[1])
	}
}

func TestCollection_BackwardCompatibility_NoVariables(t *testing.T) {
	legacyJSON := `{"id":"legacy-col-1","name":"Legacy API","description":"No variables field"}`

	var coll Collection
	if err := json.Unmarshal([]byte(legacyJSON), &coll); err != nil {
		t.Fatalf("failed to unmarshal legacy collection json without variables: %v", err)
	}

	if coll.ID != "legacy-col-1" {
		t.Errorf("expected ID 'legacy-col-1', got %q", coll.ID)
	}
	if len(coll.Variables) != 0 {
		t.Errorf("expected empty Variables, got %d items", len(coll.Variables))
	}
}

func TestFolder_FolderEnvs_Serialization(t *testing.T) {
	folder := Folder{
		ID:   "f-env-1",
		Name: "Auth Folder",
		Variables: []KVPair{
			{Key: "sharedVar", Value: "sharedVal", Enabled: true},
		},
		FolderEnvs: map[string][]KVPair{
			"env-dev-1": {
				{Key: "authUrl", Value: "https://auth.dev.com", Enabled: true},
			},
			"env-prod-1": {
				{Key: "authUrl", Value: "https://auth.prod.com", Enabled: false},
			},
		},
	}

	data, err := json.Marshal(folder)
	if err != nil {
		t.Fatalf("failed to marshal Folder with folder_envs: %v", err)
	}

	jsonStr := string(data)
	if !strings.Contains(jsonStr, `"folder_envs"`) {
		t.Errorf("expected json to contain 'folder_envs', got: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"env-dev-1"`) {
		t.Errorf("expected json to contain 'env-dev-1', got: %s", jsonStr)
	}

	var decoded Folder
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal Folder: %v", err)
	}

	if len(decoded.Variables) != 1 || decoded.Variables[0].Key != "sharedVar" {
		t.Errorf("unexpected Variables: %+v", decoded.Variables)
	}
	if len(decoded.FolderEnvs) != 2 {
		t.Fatalf("expected 2 folder_envs entries, got %d", len(decoded.FolderEnvs))
	}
	devVars := decoded.FolderEnvs["env-dev-1"]
	if len(devVars) != 1 || devVars[0].Key != "authUrl" || devVars[0].Value != "https://auth.dev.com" {
		t.Errorf("unexpected devVars: %+v", devVars)
	}
}

func TestFolder_BackwardCompatibility_NoFolderEnvs(t *testing.T) {
	legacyJSON := `{"id":"legacy-f-1","name":"Legacy Folder","variables":[{"key":"v","value":"1","enabled":true}],"headers":[]}`

	var folder Folder
	if err := json.Unmarshal([]byte(legacyJSON), &folder); err != nil {
		t.Fatalf("failed to unmarshal legacy folder without folder_envs: %v", err)
	}

	if folder.ID != "legacy-f-1" {
		t.Errorf("expected ID 'legacy-f-1', got %q", folder.ID)
	}
	if len(folder.FolderEnvs) != 0 {
		t.Errorf("expected empty FolderEnvs, got %+v", folder.FolderEnvs)
	}
}

func TestTreeNode_FolderEnvs_Serialization(t *testing.T) {
	node := TreeNode{
		ID:   "node-f1",
		Name: "Users",
		Type: "folder",
		Path: "/test/users",
		FolderEnvs: map[string][]KVPair{
			"env-staging": {
				{Key: "userPoolId", Value: "staging-pool", Enabled: true},
			},
		},
	}

	data, err := json.Marshal(node)
	if err != nil {
		t.Fatalf("failed to marshal TreeNode: %v", err)
	}

	var decoded TreeNode
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal TreeNode: %v", err)
	}

	if len(decoded.FolderEnvs) != 1 {
		t.Fatalf("expected 1 FolderEnvs entry in TreeNode, got %d", len(decoded.FolderEnvs))
	}
	if decoded.FolderEnvs["env-staging"][0].Value != "staging-pool" {
		t.Errorf("expected 'staging-pool', got %q", decoded.FolderEnvs["env-staging"][0].Value)
	}
}

func TestKVPair_SelectTypeAndOptions_Serialization(t *testing.T) {
	req := Request{
		ID:     "req-select-1",
		Name:   "Select Test",
		Method: "POST",
		URL:    "https://api.example.com/:version/items",
		Headers: []KVPair{
			{
				Key:         "X-Env",
				Value:       "dev",
				Enabled:     true,
				Description: "Target environment",
				Type:        "select",
				Options:     []string{"dev", "stg", "prod"},
			},
			{
				Key:     "X-Plain",
				Value:   "plain",
				Enabled: true,
			},
		},
		Params: []KVPair{
			{
				Key:     "mode",
				Value:   "fast",
				Enabled: true,
				Type:    "select",
				Options: []string{"fast", "safe"},
			},
		},
		PathParams: []KVPair{
			{
				Key:     "version",
				Value:   "v2",
				Enabled: true,
				Type:    "select",
				Options: []string{"v1", "v2"},
			},
		},
		Body: Body{
			Type: "urlencoded",
			FormData: []KVPair{
				{Key: "role", Value: "admin", Enabled: true, Type: "select", Options: []string{"admin", "user"}},
			},
			URLEncoded: []KVPair{
				{Key: "grant_type", Value: "password", Enabled: true, Type: "select", Options: []string{"password", "refresh_token"}},
			},
		},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal Request with select KVPairs: %v", err)
	}

	jsonStr := string(data)
	if !strings.Contains(jsonStr, `"type":"select"`) {
		t.Errorf("expected json to contain '\"type\":\"select\"', got: %s", jsonStr)
	}
	if !strings.Contains(jsonStr, `"options":["dev","stg","prod"]`) {
		t.Errorf("expected json to contain options array, got: %s", jsonStr)
	}

	// Verify omitempty on plain text KVPair without Type/Options
	plainBytes, err := json.Marshal(KVPair{Key: "k", Value: "v", Enabled: true, Options: []string{}})
	if err != nil {
		t.Fatalf("failed to marshal plain KVPair: %v", err)
	}
	plainStr := string(plainBytes)
	if strings.Contains(plainStr, `"type"`) || strings.Contains(plainStr, `"options"`) {
		t.Errorf("expected empty type and options to be omitted via omitempty, got: %s", plainStr)
	}

	var decoded Request
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal Request: %v", err)
	}
	if decoded.Headers[0].Type != "select" || !slices.Equal(decoded.Headers[0].Options, []string{"dev", "stg", "prod"}) {
		t.Errorf("expected Headers[0] select metadata preserved, got %+v", decoded.Headers[0])
	}
	if decoded.Headers[1].Type != "" || decoded.Headers[1].Options != nil {
		t.Errorf("expected Headers[1] empty Type/Options, got %+v", decoded.Headers[1])
	}
	if decoded.Params[0].Type != "select" || !slices.Equal(decoded.Params[0].Options, []string{"fast", "safe"}) {
		t.Errorf("expected Params[0] select metadata preserved, got %+v", decoded.Params[0])
	}
	if decoded.PathParams[0].Type != "select" || !slices.Equal(decoded.PathParams[0].Options, []string{"v1", "v2"}) {
		t.Errorf("expected PathParams[0] select metadata preserved, got %+v", decoded.PathParams[0])
	}
	if decoded.Body.FormData[0].Type != "select" || !slices.Equal(decoded.Body.FormData[0].Options, []string{"admin", "user"}) {
		t.Errorf("expected FormData[0] select metadata preserved, got %+v", decoded.Body.FormData[0])
	}
	if decoded.Body.URLEncoded[0].Type != "select" || !slices.Equal(decoded.Body.URLEncoded[0].Options, []string{"password", "refresh_token"}) {
		t.Errorf("expected URLEncoded[0] select metadata preserved, got %+v", decoded.Body.URLEncoded[0])
	}
}

func TestKVPair_BackwardCompatibility_NoTypeOrOptions(t *testing.T) {
	legacyEnvJSON := `{"id":"env-1","name":"Legacy","variables":[{"key":"host","value":"localhost","enabled":true}]}`
	var env Environment
	if err := json.Unmarshal([]byte(legacyEnvJSON), &env); err != nil {
		t.Fatalf("failed to unmarshal legacy Environment: %v", err)
	}
	if len(env.Variables) != 1 {
		t.Fatalf("expected 1 variable, got %d", len(env.Variables))
	}
	kv := env.Variables[0]
	if kv.Key != "host" || kv.Value != "localhost" || !kv.Enabled || kv.Type != "" || kv.Options != nil {
		t.Errorf("unexpected legacy KVPair decoded: %+v", kv)
	}
}

func TestRequest_Variables_Serialization(t *testing.T) {
	req := Request{
		ID:     "req-vars-1",
		Name:   "With Variables",
		Method: "GET",
		URL:    "https://api.example.com",
		Variables: []KVPair{
			{Key: "role", Value: "user", Enabled: true},
			{Key: "mode", Value: "fast", Enabled: true, Type: "select", Options: []string{"fast", "safe"}},
		},
	}

	data, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("failed to marshal Request with Variables: %v", err)
	}
	if !strings.Contains(string(data), `"variables"`) {
		t.Fatalf("expected json to contain variables field, got: %s", string(data))
	}

	var decoded Request
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("failed to unmarshal Request with Variables: %v", err)
	}
	if len(decoded.Variables) != 2 || decoded.Variables[0].Value != "user" || decoded.Variables[1].Type != "select" || !slices.Equal(decoded.Variables[1].Options, []string{"fast", "safe"}) {
		t.Errorf("unexpected decoded Request.Variables: %+v", decoded.Variables)
	}

	plainReq, err := json.Marshal(Request{ID: "req-plain", Name: "Plain", Method: "GET", URL: "https://api.example.com"})
	if err != nil {
		t.Fatalf("failed to marshal plain Request: %v", err)
	}
	if strings.Contains(string(plainReq), `"variables"`) {
		t.Errorf("expected empty Variables to be omitted via omitempty, got: %s", string(plainReq))
	}
}

func TestRequest_Examples_And_FlowStep_ExampleID_Serialization(t *testing.T) {
	// Backward compatibility: legacy JSON without examples decodes cleanly
	legacyJSON := `{"id":"req-legacy","name":"Legacy","method":"GET","url":"https://api.example.com"}`
	var legacyReq Request
	if err := json.Unmarshal([]byte(legacyJSON), &legacyReq); err != nil {
		t.Fatalf("failed to unmarshal legacy request: %v", err)
	}
	if len(legacyReq.Examples) != 0 {
		t.Errorf("expected empty Examples on legacy request, got %+v", legacyReq.Examples)
	}

	flags := DefaultExampleSyncFlags()
	if !flags.URL || !flags.Method || !flags.Auth || !flags.Scripts ||
		flags.Body || flags.Params || flags.PathParams || flags.Headers || flags.Variables {
		t.Fatalf("unexpected DefaultExampleSyncFlags: %+v", flags)
	}

	req := Request{
		ID:     "req-with-ex",
		Name:   "Users",
		Method: "POST",
		URL:    "https://api.example.com/users",
		Examples: []RequestExample{
			{
				ID:        "ex-1",
				Name:      "Admin",
				Method:    "POST",
				URL:       "https://api.example.com/users?role=admin",
				SyncFlags: flags,
			},
		},
	}
	encoded, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal request with examples failed: %v", err)
	}
	var decoded Request
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal request with examples failed: %v", err)
	}
	if len(decoded.Examples) != 1 || decoded.Examples[0].ID != "ex-1" || !decoded.Examples[0].SyncFlags.URL || decoded.Examples[0].SyncFlags.Body {
		t.Errorf("unexpected decoded examples: %+v", decoded.Examples)
	}

	stepWithoutEx, err := json.Marshal(FlowStep{ID: "s1", RequestID: "r1", Enabled: true})
	if err != nil {
		t.Fatalf("marshal FlowStep failed: %v", err)
	}
	if strings.Contains(string(stepWithoutEx), `"example_id"`) {
		t.Errorf("expected empty FlowStep.ExampleID omitted, got %s", string(stepWithoutEx))
	}
}

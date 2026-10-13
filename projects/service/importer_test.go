package service

import (
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	
	"hecto-api/model"
	"hecto-api/storage"
)

func findFileWithPrefix(t *testing.T, root, prefix string) string {
	t.Helper()
	var found string
	filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasPrefix(d.Name(), prefix) && strings.HasSuffix(d.Name(), ".json") {
			found = path
			return filepath.SkipAll
		}
		return nil
	})
	if found == "" {
		t.Fatalf("file with prefix %q not found under %s", prefix, root)
	}
	return found
}

func TestImportPostman(t *testing.T) {
	t.Run("Valid Collection", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		root := t.TempDir()
		fs := storage.NewFileSystem()
		impSvc := NewImporterService(fs, logger)
		
		jsonContent := `{
			"info": {
				"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
			},
			"item": [
				{
					"name": "Folder 1",
					"item": [
						{
							"name": "Request 1",
							"request": {
								"method": "POST",
								"url": "https://api.example.com",
								"header": [{"key": "Content-Type", "value": "application/json"}],
								"body": {"mode": "raw", "raw": "{\"foo\":\"bar\"}"}
							}
						}
					]
				}
			]
		}`
		filePath := filepath.Join(root, "valid.json")
		os.WriteFile(filePath, []byte(jsonContent), 0644)

		res := impSvc.ImportPostman(root, filePath, nil)
		if !res.Success {
			t.Fatalf("expected success, got error: %v", res.Error)
		}

		dataMap, ok := res.Data.(map[string]interface{})
		if !ok {
			t.Fatalf("expected map[string]interface{} data, got %T", res.Data)
		}
		if count, ok := dataMap["count"].(int); !ok || count != 3 {
			t.Errorf("expected count 3, got %v", count)
		}

		reqPath := findFileWithPrefix(t, root, "request-1-")
		folderMetaPath := filepath.Join(filepath.Dir(reqPath), "_folder.json")
		if !fs.Exists(folderMetaPath) {
			t.Errorf("Folder not created")
		}

		var req model.Request
		reqData, _ := os.ReadFile(reqPath)
		json.Unmarshal(reqData, &req)

		if req.Method != "POST" {
			t.Errorf("expected POST method, got %s", req.Method)
		}
		if req.URL != "https://api.example.com" {
			t.Errorf("expected URL, got %s", req.URL)
		}
		if len(req.Headers) == 0 || req.Headers[0].Key != "Content-Type" {
			t.Errorf("expected headers not found: %+v", req.Headers)
		}
		if req.Body.Type != "raw" || req.Body.Content != "{\"foo\":\"bar\"}" {
			t.Errorf("expected body not found: %+v", req.Body)
		}
	})

	t.Run("Invalid Schema", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		root := t.TempDir()
		fs := storage.NewFileSystem()
		impSvc := NewImporterService(fs, logger)

		jsonContent := `{
			"info": {
				"schema": "https://schema.getpostman.com/json/collection/v2.0.0/collection.json"
			},
			"item": []
		}`
		filePath := filepath.Join(root, "invalid_schema.json")
		os.WriteFile(filePath, []byte(jsonContent), 0644)

		res := impSvc.ImportPostman(root, filePath, nil)
		if res.Success {
			t.Fatalf("expected error for invalid schema")
		}
		if res.Error.Code != model.ErrValidation {
			t.Errorf("expected ErrValidation, got %s", res.Error.Code)
		}
	})

	t.Run("Malformed Item", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		root := t.TempDir()
		fs := storage.NewFileSystem()
		impSvc := NewImporterService(fs, logger)

		jsonContent := `{
			"info": {
				"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
			},
			"item": [
				{
					"name": "Malformed"
				},
				{
					"name": "Valid Request",
					"request": {
						"method": "GET",
						"url": "https://example.com",
						"header": []
					}
				}
			]
		}`
		filePath := filepath.Join(root, "malformed.json")
		os.WriteFile(filePath, []byte(jsonContent), 0644)

		res := impSvc.ImportPostman(root, filePath, nil)
		if !res.Success {
			t.Fatalf("expected success with skip")
		}
		
		dataMap, ok := res.Data.(map[string]interface{})
		if !ok || dataMap["count"] != 2 {
			t.Errorf("expected count 2, got %v", dataMap["count"])
		}

		reqPath := findFileWithPrefix(t, root, "valid-request-")
		if !fs.Exists(reqPath) {
			t.Errorf("Valid request should have been created")
		}
	})

	t.Run("Name Collision", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		root := t.TempDir()
		fs := storage.NewFileSystem()
		impSvc := NewImporterService(fs, logger)

		jsonContent := `{
			"info": {
				"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
			},
			"item": [
				{
					"name": "Duplicate",
					"request": {
						"method": "GET",
						"url": "https://a",
						"header": []
					}
				},
				{
					"name": "Duplicate",
					"request": {
						"method": "GET",
						"url": "https://b",
						"header": []
					}
				}
			]
		}`
		filePath := filepath.Join(root, "collision.json")
		os.WriteFile(filePath, []byte(jsonContent), 0644)

		res := impSvc.ImportPostman(root, filePath, nil)
		if !res.Success {
			t.Fatalf("expected success")
		}
		
		dataMap, ok := res.Data.(map[string]interface{})
		if !ok || dataMap["count"] != 3 {
			t.Errorf("expected count 3, got %v", dataMap["count"])
		}

		var duplicateFiles []string
		filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
			if err == nil && !d.IsDir() && strings.HasPrefix(d.Name(), "duplicate-") && strings.HasSuffix(d.Name(), ".json") {
				duplicateFiles = append(duplicateFiles, path)
			}
			return nil
		})
		if len(duplicateFiles) != 2 {
			t.Errorf("expected 2 duplicate files with UUID suffix, got %d", len(duplicateFiles))
		}
	})
	t.Run("Auth Inheritance", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		root := t.TempDir()
		fs := storage.NewFileSystem()
		impSvc := NewImporterService(fs, logger)

		jsonContent := `{
			"info": {
				"name": "Auth Test",
				"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
			},
			"auth": {
				"type": "bearer",
				"bearer": [{"key": "token", "value": "collection_token", "type": "string"}]
			},
			"item": [
				{
					"name": "Req Inherit Collection",
					"request": {
						"method": "GET",
						"url": "https://example.com"
					}
				},
				{
					"name": "Folder Basic Auth",
					"auth": {
						"type": "basic",
						"basic": [
							{"key": "username", "value": "user", "type": "string"},
							{"key": "password", "value": "pass", "type": "string"}
						]
					},
					"item": [
						{
							"name": "Req Inherit Folder",
							"request": {
								"method": "GET",
								"url": "https://example.com"
							}
						},
						{
							"name": "Req Override",
							"request": {
								"method": "GET",
								"url": "https://example.com",
								"auth": {
									"type": "bearer",
									"bearer": [{"key": "token", "value": "override_token", "type": "string"}]
								}
							}
						}
					]
				}
			]
		}`
		filePath := filepath.Join(root, "auth.json")
		os.WriteFile(filePath, []byte(jsonContent), 0644)

		res := impSvc.ImportPostman(root, filePath, nil)
		if !res.Success {
			t.Fatalf("expected success")
		}

		// 1 collection folder + 1 nested folder + 3 requests = 5 items
		dataMap, _ := res.Data.(map[string]interface{})
		if count, _ := dataMap["count"].(int); count != 5 {
			t.Errorf("expected count 5, got %v", count)
		}

		// Verify "Req Inherit Collection"
		req1Path := findFileWithPrefix(t, root, "req-inherit-collection-")
		var req1 model.Request
		req1Data, _ := os.ReadFile(req1Path)
		json.Unmarshal(req1Data, &req1)
		
		hasAuth1 := false
		for _, h := range req1.Headers {
			if h.Key == "Authorization" && h.Value == "Bearer collection_token" {
				hasAuth1 = true
			}
		}
		if !hasAuth1 {
			t.Errorf("expected collection bearer token in headers, got %+v", req1.Headers)
		}

		// Verify "Req Inherit Folder"
		req2Path := findFileWithPrefix(t, root, "req-inherit-folder-")
		var req2 model.Request
		req2Data, _ := os.ReadFile(req2Path)
		json.Unmarshal(req2Data, &req2)

		hasAuth2 := false
		for _, h := range req2.Headers {
			if h.Key == "Authorization" && h.Value == "Basic dXNlcjpwYXNz" { // base64("user:pass")
				hasAuth2 = true
			}
		}
		if !hasAuth2 {
			t.Errorf("expected folder basic auth in headers, got %+v", req2.Headers)
		}

		// Verify "Req Override"
		req3Path := findFileWithPrefix(t, root, "req-override-")
		var req3 model.Request
		req3Data, _ := os.ReadFile(req3Path)
		json.Unmarshal(req3Data, &req3)

		hasAuth3 := false
		for _, h := range req3.Headers {
			if h.Key == "Authorization" && h.Value == "Bearer override_token" {
				hasAuth3 = true
			}
		}
		if !hasAuth3 {
			t.Errorf("expected request override token in headers, got %+v", req3.Headers)
		}
	})

	t.Run("Progress Callback", func(t *testing.T) {
		logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
		root := t.TempDir()
		fs := storage.NewFileSystem()
		impSvc := NewImporterService(fs, logger)

		jsonContent := `{
			"info": {
				"name": "Progress Test",
				"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
			},
			"item": [
				{
					"name": "Folder 1",
					"item": [
						{
							"name": "Request 1",
							"request": {
								"method": "GET",
								"url": "https://a"
							}
						}
					]
				},
				{
					"name": "Request 2",
					"request": {
						"method": "GET",
						"url": "https://b"
					}
				}
			]
		}`
		filePath := filepath.Join(root, "progress.json")
		os.WriteFile(filePath, []byte(jsonContent), 0644)

		callbackCount := 0
		expectedTotal := 4 // Root Folder + Folder 1 + Request 1 + Request 2

		onProgress := func(count int, total int, text string) {
			callbackCount++
			if total != expectedTotal {
				t.Errorf("expected total %d, got %d", expectedTotal, total)
			}
			if count != callbackCount {
				t.Errorf("expected count %d, got %d", callbackCount, count)
			}
		}

		res := impSvc.ImportPostman(root, filePath, onProgress)
		if !res.Success {
			t.Fatalf("expected success")
		}

		if callbackCount != expectedTotal {
			t.Errorf("expected %d callbacks, got %d", expectedTotal, callbackCount)
		}
	})
}

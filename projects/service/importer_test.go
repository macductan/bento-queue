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

func findRequestByName(t *testing.T, root, name string) string {
	t.Helper()
	var found string
	filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err == nil && !d.IsDir() && strings.HasSuffix(d.Name(), ".json") && d.Name() != "_folder.json" && d.Name() != "collection.json" {
			data, readErr := os.ReadFile(path)
			if readErr == nil {
				var req model.Request
				if json.Unmarshal(data, &req) == nil && req.Name == name {
					found = path
					return filepath.SkipAll
				}
			}
		}
		return nil
	})
	if found == "" {
		t.Fatalf("request with name %q not found under %s", name, root)
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

		reqPath := findRequestByName(t, root, "Request 1")
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
		if req.Body.Type != "json" || req.Body.Content != "{\"foo\":\"bar\"}" {
			t.Errorf("expected json body not found: %+v", req.Body)
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

		reqPath := findRequestByName(t, root, "Valid Request")
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
			if err == nil && !d.IsDir() && strings.HasSuffix(d.Name(), ".json") && d.Name() != "_folder.json" && d.Name() != "collision.json" {
				data, readErr := os.ReadFile(path)
				if readErr == nil {
					var req model.Request
					if json.Unmarshal(data, &req) == nil && req.Name == "Duplicate" {
						duplicateFiles = append(duplicateFiles, path)
					}
				}
			}
			return nil
		})
		if len(duplicateFiles) != 2 {
			t.Errorf("expected 2 duplicate files with unique UUID filenames, got %d", len(duplicateFiles))
		}
		if len(duplicateFiles) == 2 && duplicateFiles[0] == duplicateFiles[1] {
			t.Errorf("expected distinct files, got identical paths")
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
		req1Path := findRequestByName(t, root, "Req Inherit Collection")
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
		req2Path := findRequestByName(t, root, "Req Inherit Folder")
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
		req3Path := findRequestByName(t, root, "Req Override")
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

func TestImportPostman_BodyTypeDetection(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	root := t.TempDir()
	fs := storage.NewFileSystem()
	impSvc := NewImporterService(fs, logger)

	jsonContent := `{
		"info": {
			"name": "Body Detection Test",
			"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
		},
		"item": [
			{
				"name": "Raw Options JSON",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/options-json",
					"body": {
						"mode": "raw",
						"raw": "{\"num\": 42}",
						"options": {
							"raw": {
								"language": "json"
							}
						}
					}
				}
			},
			{
				"name": "Raw Options XML",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/options-xml",
					"body": {
						"mode": "raw",
						"raw": "<root><val>42</val></root>",
						"options": {
							"raw": {
								"language": "xml"
							}
						}
					}
				}
			},
			{
				"name": "Header ContentType JSON",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/header-json",
					"header": [{"key": "Content-Type", "value": "application/json; charset=utf-8"}],
					"body": {
						"mode": "raw",
						"raw": "something"
					}
				}
			},
			{
				"name": "Header ContentType XML",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/header-xml",
					"header": [{"key": "Content-Type", "value": "application/xml"}],
					"body": {
						"mode": "raw",
						"raw": "something"
					}
				}
			},
			{
				"name": "Sniff JSON Object",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/sniff-json-obj",
					"body": {
						"mode": "raw",
						"raw": "   \n  {\"key\": \"val\"}  "
					}
				}
			},
			{
				"name": "Sniff JSON Array",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/sniff-json-arr",
					"body": {
						"mode": "raw",
						"raw": "[1, 2, 3]"
					}
				}
			},
			{
				"name": "Sniff XML",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/sniff-xml",
					"body": {
						"mode": "raw",
						"raw": "   \n  <note><to>User</to></note>  "
					}
				}
			},
			{
				"name": "Plain Text Fallback",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/plain-text",
					"body": {
						"mode": "raw",
						"raw": "hello world plain text"
					}
				}
			},
			{
				"name": "UrlEncoded Mode",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/urlencoded",
					"body": {
						"mode": "urlencoded",
						"urlencoded": [
							{"key": "username", "value": "alice", "description": "User name"},
							{"key": "password", "value": "secret", "disabled": true}
						]
					}
				}
			},
			{
				"name": "FormData Mode",
				"request": {
					"method": "POST",
					"url": "https://api.example.com/formdata",
					"body": {
						"mode": "formdata",
						"formdata": [
							{"key": "file", "value": "avatar.png", "type": "file"},
							{"key": "userId", "value": "123"}
						]
					}
				}
			},
			{
				"name": "None Mode",
				"request": {
					"method": "GET",
					"url": "https://api.example.com/none",
					"body": {
						"mode": "none"
					}
				}
			}
		]
	}`

	filePath := filepath.Join(root, "body_tests.json")
	if err := os.WriteFile(filePath, []byte(jsonContent), 0644); err != nil {
		t.Fatalf("failed to write test file: %v", err)
	}

	res := impSvc.ImportPostman(root, filePath, nil)
	if !res.Success {
		t.Fatalf("import failed: %+v", res.Error)
	}

	loadReq := func(name string) model.Request {
		p := findRequestByName(t, root, name)
		data, err := os.ReadFile(p)
		if err != nil {
			t.Fatalf("failed to read request file for %s: %v", name, err)
		}
		var r model.Request
		if err := json.Unmarshal(data, &r); err != nil {
			t.Fatalf("failed to unmarshal request %s: %v", name, err)
		}
		return r
	}

	// 1. Raw Options JSON
	r1 := loadReq("Raw Options JSON")
	if r1.Body.Type != "json" || r1.Body.Content != "{\"num\": 42}" {
		t.Errorf("expected json body from options, got: %+v", r1.Body)
	}

	// 2. Raw Options XML
	r2 := loadReq("Raw Options XML")
	if r2.Body.Type != "xml" || r2.Body.Content != "<root><val>42</val></root>" {
		t.Errorf("expected xml body from options, got: %+v", r2.Body)
	}

	// 3. Header ContentType JSON
	r3 := loadReq("Header ContentType JSON")
	if r3.Body.Type != "json" {
		t.Errorf("expected json body from header, got: %+v", r3.Body)
	}

	// 4. Header ContentType XML
	r4 := loadReq("Header ContentType XML")
	if r4.Body.Type != "xml" {
		t.Errorf("expected xml body from header, got: %+v", r4.Body)
	}

	// 5. Sniff JSON Object
	r5 := loadReq("Sniff JSON Object")
	if r5.Body.Type != "json" {
		t.Errorf("expected json body from sniffing obj, got: %+v", r5.Body)
	}

	// 6. Sniff JSON Array
	r6 := loadReq("Sniff JSON Array")
	if r6.Body.Type != "json" {
		t.Errorf("expected json body from sniffing array, got: %+v", r6.Body)
	}

	// 7. Sniff XML
	r7 := loadReq("Sniff XML")
	if r7.Body.Type != "xml" {
		t.Errorf("expected xml body from sniffing xml, got: %+v", r7.Body)
	}

	// 8. Plain Text Fallback
	r8 := loadReq("Plain Text Fallback")
	if r8.Body.Type != "text" {
		t.Errorf("expected text body fallback, got: %+v", r8.Body)
	}

	// 9. UrlEncoded Mode
	r9 := loadReq("UrlEncoded Mode")
	if r9.Body.Type != "urlencoded" {
		t.Errorf("expected urlencoded body type, got: %s", r9.Body.Type)
	}
	if len(r9.Body.URLEncoded) != 2 {
		t.Fatalf("expected 2 urlencoded pairs, got: %d", len(r9.Body.URLEncoded))
	}
	if r9.Body.URLEncoded[0].Key != "username" || r9.Body.URLEncoded[0].Value != "alice" || !r9.Body.URLEncoded[0].Enabled {
		t.Errorf("first urlencoded pair mismatch: %+v", r9.Body.URLEncoded[0])
	}
	if r9.Body.URLEncoded[1].Key != "password" || r9.Body.URLEncoded[1].Value != "secret" || r9.Body.URLEncoded[1].Enabled {
		t.Errorf("second urlencoded pair (disabled) mismatch: %+v", r9.Body.URLEncoded[1])
	}

	// 10. FormData Mode
	r10 := loadReq("FormData Mode")
	if r10.Body.Type != "formdata" {
		t.Errorf("expected formdata body type, got: %s", r10.Body.Type)
	}
	if len(r10.Body.FormData) != 2 {
		t.Fatalf("expected 2 formdata pairs, got: %d", len(r10.Body.FormData))
	}
	if r10.Body.FormData[0].Key != "file" || r10.Body.FormData[0].Value != "avatar.png" || !r10.Body.FormData[0].Enabled {
		t.Errorf("first formdata pair mismatch: %+v", r10.Body.FormData[0])
	}
	if r10.Body.FormData[1].Key != "userId" || r10.Body.FormData[1].Value != "123" {
		t.Errorf("second formdata pair mismatch: %+v", r10.Body.FormData[1])
	}

	// 11. None Mode
	r11 := loadReq("None Mode")
	if r11.Body.Type != "none" {
		t.Errorf("expected none body type, got: %s", r11.Body.Type)
	}
}


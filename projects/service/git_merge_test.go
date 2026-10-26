package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"hecto-api/model"
)

func TestMergeJSONObjects_NonOverlappingFieldsAndDeepJSONBody(t *testing.T) {
	baseObj := map[string]interface{}{
		"id":     "req-100",
		"name":   "List Users",
		"method": "GET",
		"url":    "https://api.example.com/v1/users",
		"headers": []interface{}{
			map[string]interface{}{"key": "Content-Type", "value": "application/json", "enabled": true},
		},
		"params": []interface{}{
			map[string]interface{}{"key": "tag", "value": "alpha", "enabled": true},
			map[string]interface{}{"key": "tag", "value": "beta", "enabled": false},
		},
		"body": map[string]interface{}{
			"type":    "json",
			"content": "{\n  \"page\": 1,\n  \"limit\": 20,\n  \"filter\": {\n    \"active\": true,\n    \"role\": \"user\"\n  }\n}",
		},
		"auth": map[string]interface{}{
			"type": "bearer",
			"bearer": map[string]interface{}{
				"token": "old-token",
			},
		},
	}

	// Local modifies url, adds header X-Req, updates tag#1 enabled=true, updates body.content.page=2 & filter.role="admin"
	oursObj := cloneJSONMap(baseObj)
	oursObj["url"] = "https://api.example.com/v2/users"
	oursObj["headers"] = []interface{}{
		map[string]interface{}{"key": "Content-Type", "value": "application/json", "enabled": true},
		map[string]interface{}{"key": "X-Req", "value": "local-123", "enabled": true},
		map[string]interface{}{"key": "", "value": "", "enabled": true}, // empty draft row should be stripped
	}
	oursObj["params"] = []interface{}{
		map[string]interface{}{"key": "tag", "value": "alpha", "enabled": true},
		map[string]interface{}{"key": "tag", "value": "beta", "enabled": true},
	}
	oursObj["body"] = map[string]interface{}{
		"type":    "json",
		"content": "{\n  \"page\": 2,\n  \"limit\": 20,\n  \"filter\": {\n    \"active\": true,\n    \"role\": \"admin\"\n  }\n}",
	}

	// Remote modifies method, adds header Accept, updates body.content.limit=50, updates auth.bearer.token
	theirsObj := cloneJSONMap(baseObj)
	theirsObj["method"] = "POST"
	theirsObj["headers"] = []interface{}{
		map[string]interface{}{"key": "Content-Type", "value": "application/json", "enabled": true},
		map[string]interface{}{"key": "Accept", "value": "application/json", "enabled": false},
	}
	theirsObj["body"] = map[string]interface{}{
		"type":    "json",
		"content": "{\n  \"page\": 1,\n  \"limit\": 50,\n  \"filter\": {\n    \"active\": true,\n    \"role\": \"user\"\n  }\n}",
	}
	theirsObj["auth"] = map[string]interface{}{
		"type": "bearer",
		"bearer": map[string]interface{}{
			"token": "new-remote-token",
		},
	}

	start := time.Now()
	merged, conflicts := MergeJSONObjects("users/req-100.json", baseObj, oursObj, theirsObj)
	elapsed := time.Since(start)

	if elapsed >= 50*time.Millisecond {
		t.Fatalf("expected 3-Way JSON Merge < 50ms/file, took %v", elapsed)
	}
	if len(conflicts) != 0 {
		t.Fatalf("expected 0 conflicts, got %+v", conflicts)
	}

	if merged["url"] != "https://api.example.com/v2/users" {
		t.Errorf("expected merged url from Ours, got %v", merged["url"])
	}
	if merged["method"] != "POST" {
		t.Errorf("expected merged method from Theirs, got %v", merged["method"])
	}

	headers := parseKVPairs(merged["headers"])
	if len(headers) != 3 {
		t.Fatalf("expected 3 merged headers (draft stripped), got %+v", headers)
	}

	params := parseKVPairs(merged["params"])
	if len(params) != 2 || params[0].Value != "alpha" || params[1].Value != "beta" || !params[1].Enabled {
		t.Fatalf("expected duplicate key params tag#0 and tag#1 preserved and updated, got %+v", params)
	}

	bodyMap := merged["body"].(map[string]interface{})
	var mergedBodyJSON map[string]interface{}
	if err := json.Unmarshal([]byte(bodyMap["content"].(string)), &mergedBodyJSON); err != nil {
		t.Fatalf("failed to parse merged body.content JSON: %v", err)
	}
	if mergedBodyJSON["page"] != float64(2) || mergedBodyJSON["limit"] != float64(50) {
		t.Errorf("expected body.content page=2 and limit=50, got %+v", mergedBodyJSON)
	}
	filterMap := mergedBodyJSON["filter"].(map[string]interface{})
	if filterMap["role"] != "admin" || filterMap["active"] != true {
		t.Errorf("expected body.content.filter.role=admin and active=true, got %+v", filterMap)
	}

	authMap := merged["auth"].(map[string]interface{})
	bearerMap := authMap["bearer"].(map[string]interface{})
	if bearerMap["token"] != "new-remote-token" {
		t.Errorf("expected bearer token updated from Theirs, got %v", bearerMap["token"])
	}
}

func TestMergeJSONObjects_DuplicateKVPairConflictsAndFolderEnvs(t *testing.T) {
	baseObj := map[string]interface{}{
		"id":   "folder-1",
		"name": "Auth Folder",
		"headers": []interface{}{
			map[string]interface{}{"key": "X-Tag", "value": "v1", "enabled": true},
			map[string]interface{}{"key": "X-Tag", "value": "v2", "enabled": false},
		},
		"folder_envs": map[string]interface{}{
			"dev": []interface{}{
				map[string]interface{}{"key": "API_URL", "value": "https://dev.old.local", "enabled": true},
			},
		},
	}

	oursObj := cloneJSONMap(baseObj)
	oursObj["headers"] = []interface{}{
		map[string]interface{}{"key": "X-Tag", "value": "v1", "enabled": true},
		map[string]interface{}{"key": "X-Tag", "value": "ours-v2", "enabled": true},
	}
	oursObj["folder_envs"] = map[string]interface{}{
		"dev": []interface{}{
			map[string]interface{}{"key": "API_URL", "value": "https://dev.ours.local", "enabled": true},
		},
	}

	theirsObj := cloneJSONMap(baseObj)
	theirsObj["headers"] = []interface{}{
		map[string]interface{}{"key": "X-Tag", "value": "v1", "enabled": true},
		map[string]interface{}{"key": "X-Tag", "value": "theirs-v2", "enabled": false},
	}
	theirsObj["folder_envs"] = map[string]interface{}{
		"dev": []interface{}{
			map[string]interface{}{"key": "API_URL", "value": "https://dev.theirs.local", "enabled": true},
		},
	}

	_, conflicts := MergeJSONObjects("auth/_folder.json", baseObj, oursObj, theirsObj)
	if len(conflicts) != 2 {
		t.Fatalf("expected 2 field conflicts (headers.X-Tag#1 and folder_envs.dev.API_URL#0), got %+v", conflicts)
	}

	foundHeader := false
	foundFolderEnv := false
	for _, c := range conflicts {
		if c.FieldPath == "headers.X-Tag#1" {
			foundHeader = true
			if !strings.Contains(c.Label, "#2") {
				t.Errorf("expected second occurrence label to contain #2, got %s", c.Label)
			}
		}
		if c.FieldPath == "folder_envs.dev.API_URL#0" {
			foundFolderEnv = true
		}
	}
	if !foundHeader || !foundFolderEnv {
		t.Fatalf("missing expected conflict paths, got %+v", conflicts)
	}
}

func TestGitSyncService_PullAutoMergesNonOverlappingRequestChanges(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "users-req.json")
	baseJSON := `{
  "id": "users-req",
  "name": "Get Users",
  "method": "GET",
  "url": "https://api.example.com/users",
  "headers": [
    {
      "key": "Accept",
      "value": "application/json",
      "enabled": true
    }
  ],
  "body": {
    "type": "json",
    "content": "{\n  \"page\": 1,\n  \"limit\": 10\n}"
  }
}
`
	if err := os.WriteFile(reqFile, []byte(baseJSON), 0644); err != nil {
		t.Fatalf("write base users-req.json failed: %v", err)
	}
	if pushRes := gitSvc.Push(collectionsRoot, collID); !pushRes.Success {
		t.Fatalf("initial Push failed: %+v", pushRes.Error)
	}

	// Peer clones and modifies method + body.content.limit
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-automerge")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")

	remoteJSON := `{
  "id": "users-req",
  "name": "Get Users",
  "method": "POST",
  "url": "https://api.example.com/users",
  "headers": [
    {
      "key": "Accept",
      "value": "application/json",
      "enabled": true
    },
    {
      "key": "X-Remote",
      "value": "true",
      "enabled": true
    }
  ],
  "body": {
    "type": "json",
    "content": "{\n  \"page\": 1,\n  \"limit\": 50\n}"
  }
}
`
	if err := os.WriteFile(filepath.Join(peerDir, "users-req.json"), []byte(remoteJSON), 0644); err != nil {
		t.Fatalf("write remote users-req.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "remote changes")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Local modifies url + body.content.page + adds X-Local header
	localJSON := `{
  "id": "users-req",
  "name": "Get Users",
  "method": "GET",
  "url": "https://api.example.com/v2/users",
  "headers": [
    {
      "key": "Accept",
      "value": "application/json",
      "enabled": true
    },
    {
      "key": "X-Local",
      "value": "1",
      "enabled": false
    }
  ],
  "body": {
    "type": "json",
    "content": "{\n  \"page\": 2,\n  \"limit\": 10\n}"
  }
}
`
	if err := os.WriteFile(reqFile, []byte(localJSON), 0644); err != nil {
		t.Fatalf("write local users-req.json failed: %v", err)
	}

	// Pull should automatically 3-way merge and succeed without reporting GIT_CONFLICT!
	pullRes := gitSvc.Pull(collectionsRoot, collID)
	if !pullRes.Success {
		t.Fatalf("expected Pull to auto-merge non-overlapping JSON changes, got error: %+v", pullRes.Error)
	}

	var diskReq model.Request
	rawDisk, err := os.ReadFile(reqFile)
	if err != nil {
		t.Fatalf("read merged users-req.json failed: %v", err)
	}
	if err := json.Unmarshal(rawDisk, &diskReq); err != nil {
		t.Fatalf("merged users-req.json is not valid JSON: %v\ncontent:\n%s", err, string(rawDisk))
	}
	if diskReq.Method != "POST" || diskReq.URL != "https://api.example.com/v2/users" {
		t.Errorf("expected Method=POST and URL=https://api.example.com/v2/users, got Method=%s URL=%s", diskReq.Method, diskReq.URL)
	}
	if len(diskReq.Headers) != 3 {
		t.Errorf("expected 3 merged headers, got %+v", diskReq.Headers)
	}
	var bodyContent map[string]interface{}
	if err := json.Unmarshal([]byte(diskReq.Body.Content), &bodyContent); err != nil {
		t.Fatalf("failed to unmarshal merged body.content: %v", err)
	}
	if bodyContent["page"] != float64(2) || bodyContent["limit"] != float64(50) {
		t.Errorf("expected page=2 and limit=50 in merged body.content, got %+v", bodyContent)
	}
}

func TestGitSyncService_StashAndPullStageInversionAndAbort(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "stash-req.json")
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"sr-1\",\n  \"name\": \"Stash Req\",\n  \"url\": \"https://base.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write base stash-req.json failed: %v", err)
	}
	if res := gitSvc.Push(collectionsRoot, collID); !res.Success {
		t.Fatalf("initial Push failed: %+v", res.Error)
	}

	// Peer updates url to remote-url and pushes
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-stash-inv")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")
	if err := os.WriteFile(filepath.Join(peerDir, "stash-req.json"), []byte("{\n  \"id\": \"sr-1\",\n  \"name\": \"Stash Req\",\n  \"url\": \"https://remote-theirs.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer stash-req.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "remote update")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Local modifies stash-req.json uncommitted to local-ours
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"sr-1\",\n  \"name\": \"Stash Req\",\n  \"url\": \"https://local-ours.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write local stash-req.json failed: %v", err)
	}

	// StashAndPull should detect conflict and invert :3: -> OursValue (Local) and :2: -> TheirsValue (Remote)
	stashRes := gitSvc.StashAndPull(collectionsRoot, collID)
	if stashRes.Success || stashRes.Error == nil || stashRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected StashAndPull to return GIT_CONFLICT, got %+v", stashRes)
	}

	status := stashRes.Data.(model.GitSyncStatus)
	if len(status.Conflicts) != 1 {
		t.Fatalf("expected 1 GitFileConflict in status.Conflicts, got %+v", status.Conflicts)
	}
	fc := status.Conflicts[0]
	if len(fc.Fields) != 1 || fc.Fields[0].FieldPath != "url" {
		t.Fatalf("expected field conflict on url, got %+v", fc.Fields)
	}
	if fc.Fields[0].OursValue != "https://local-ours.example.com" {
		t.Errorf("expected OursValue (Local) to be https://local-ours.example.com, got %v", fc.Fields[0].OursValue)
	}
	if fc.Fields[0].TheirsValue != "https://remote-theirs.example.com" {
		t.Errorf("expected TheirsValue (Remote) to be https://remote-theirs.example.com, got %v", fc.Fields[0].TheirsValue)
	}

	// Verify AbortMerge restores the pre-pull state and removes HECTO_STASH_CONFLICT
	abortRes := gitSvc.AbortMerge(collectionsRoot, collID)
	if !abortRes.Success {
		t.Fatalf("AbortMerge failed: %+v", abortRes.Error)
	}
	abortStatus := abortRes.Data.(model.GitSyncStatus)
	if abortStatus.HasConflicts {
		t.Errorf("expected HasConflicts=false after AbortMerge, got %+v", abortStatus)
	}
	if _, err := os.Stat(filepath.Join(collDir, ".git", hectoStashConflictFile)); !os.IsNotExist(err) {
		t.Errorf("expected HECTO_STASH_CONFLICT to be removed after AbortMerge")
	}
	restoredBytes, err := os.ReadFile(reqFile)
	if err != nil {
		t.Fatalf("read restored stash-req.json failed: %v", err)
	}
	if !strings.Contains(string(restoredBytes), "https://local-ours.example.com") {
		t.Errorf("expected local uncommitted value https://local-ours.example.com to be restored after AbortMerge, got:\n%s", string(restoredBytes))
	}
}

func TestGitSyncService_DeleteEditConflictAndManualResolveAndPathTraversal(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "del-req.json")
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"d1\",\n  \"name\": \"Delete Me\",\n  \"url\": \"https://v1.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write del-req.json failed: %v", err)
	}
	if res := gitSvc.Push(collectionsRoot, collID); !res.Success {
		t.Fatalf("initial Push failed: %+v", res.Error)
	}

	// Peer modifies del-req.json and pushes
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-del")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")
	if err := os.WriteFile(filepath.Join(peerDir, "del-req.json"), []byte("{\n  \"id\": \"d1\",\n  \"name\": \"Delete Me Edited\",\n  \"url\": \"https://v2.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer del-req.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "remote edit del-req")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Local deletes del-req.json
	if err := os.Remove(reqFile); err != nil {
		t.Fatalf("remove local del-req.json failed: %v", err)
	}

	// Pull should detect delete_edit conflict
	pullRes := gitSvc.Pull(collectionsRoot, collID)
	if pullRes.Success || pullRes.Error == nil || pullRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected Pull to return GIT_CONFLICT on delete vs edit, got %+v", pullRes)
	}
	status := pullRes.Data.(model.GitSyncStatus)
	if len(status.Conflicts) != 1 || status.Conflicts[0].ConflictType != "delete_edit" {
		t.Fatalf("expected delete_edit conflict, got %+v", status.Conflicts)
	}

	// Test path traversal rejection in ResolveConflict
	for _, badPath := range []string{"../evil.json", "/abs/path.json", ".git/config", "sub/../../outside.json"} {
		badRes := gitSvc.ResolveConflict(collectionsRoot, collID, map[string]interface{}{
			badPath: map[string]interface{}{"id": "x"},
		})
		if badRes.Success || badRes.Error == nil || badRes.Error.Code != model.ErrValidation {
			t.Fatalf("expected ErrValidation for path traversal %q, got %+v", badPath, badRes)
		}
	}

	// Resolve by confirming deletion (__deleted__: true)
	resolveRes := gitSvc.ResolveConflict(collectionsRoot, collID, map[string]interface{}{
		"del-req.json": map[string]interface{}{"__deleted__": true},
	})
	if !resolveRes.Success {
		t.Fatalf("ResolveConflict (delete) failed: %+v", resolveRes.Error)
	}
	if _, err := os.Stat(reqFile); !os.IsNotExist(err) {
		t.Errorf("expected del-req.json to be deleted after ResolveConflict")
	}
	resolvedStatus := resolveRes.Data.(model.GitSyncStatus)
	if resolvedStatus.HasConflicts {
		t.Errorf("expected HasConflicts=false after ResolveConflict, got %+v", resolvedStatus)
	}
}

func TestGitSyncService_ResolveConflictNonDeleteJSONAcrossPullAndStashAndBuildFileConflictTiming(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "resolve-json.json")
	baseReq := `{
  "id": "rj-1",
  "name": "Resolve JSON Req",
  "method": "GET",
  "url": "https://api.example.com/v1",
  "headers": [
    {"key": "X-Dup", "value": "first", "enabled": true},
    {"key": "X-Dup", "value": "second", "enabled": true}
  ],
  "updated_at": "2026-01-01T00:00:00Z"
}
`
	if err := os.WriteFile(reqFile, []byte(baseReq), 0644); err != nil {
		t.Fatalf("write resolve-json.json failed: %v", err)
	}
	if res := gitSvc.Push(collectionsRoot, collID); !res.Success {
		t.Fatalf("initial Push failed: %+v", res.Error)
	}

	// Peer edits url and X-Dup#0 and pushes
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-resolve-json")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")
	peerReq := `{
  "id": "rj-1",
  "name": "Resolve JSON Req",
  "method": "GET",
  "url": "https://api.example.com/v2-remote",
  "headers": [
    {"key": "X-Dup", "value": "second", "enabled": false}
  ],
  "updated_at": "2026-01-01T00:00:00Z"
}
`
	if err := os.WriteFile(filepath.Join(peerDir, "resolve-json.json"), []byte(peerReq), 0644); err != nil {
		t.Fatalf("write peer resolve-json.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "peer conflicting edit")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// 1. Pull (MERGE_HEAD) conflict + buildFileConflict < 50ms assertion + non-delete JSON ResolveConflict
	localReq := `{
  "id": "rj-1",
  "name": "Resolve JSON Req",
  "method": "GET",
  "url": "https://api.example.com/v2-local",
  "headers": [
    {"key": "X-Dup", "value": "first-local", "enabled": true},
    {"key": "X-Dup", "value": "second-local", "enabled": true}
  ],
  "updated_at": "2026-01-01T00:00:00Z"
}
`
	if err := os.WriteFile(reqFile, []byte(localReq), 0644); err != nil {
		t.Fatalf("write local resolve-json.json failed: %v", err)
	}

	pullRes := gitSvc.Pull(collectionsRoot, collID)
	if pullRes.Success || pullRes.Error == nil || pullRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected Pull to return GIT_CONFLICT, got %+v", pullRes)
	}

	startBuild := time.Now()
	fc, _ := gitSvc.buildFileConflict(collDir, "resolve-json.json", nil, bareRepoDir, false)
	buildElapsed := time.Since(startBuild)
	if buildElapsed >= 50*time.Millisecond {
		t.Fatalf("expected buildFileConflict < 50ms/file, took %v", buildElapsed)
	}
	if fc.ConflictType != "field_conflict" || len(fc.Fields) == 0 {
		t.Fatalf("expected field_conflict on resolve-json.json, got %+v", fc)
	}

	resolvedObj := map[string]interface{}{
		"id":         "rj-1",
		"name":       "Resolve JSON Req",
		"method":     "GET",
		"url":        "https://api.example.com/v2-resolved",
		"headers":    []interface{}{map[string]interface{}{"key": "X-Dup", "value": "second-local", "enabled": true}},
		"updated_at": "2026-01-01T00:00:00Z",
	}
	resPullResolve := gitSvc.ResolveConflict(collectionsRoot, collID, map[string]interface{}{
		"resolve-json.json": resolvedObj,
	})
	if !resPullResolve.Success {
		t.Fatalf("ResolveConflict (MERGE_HEAD JSON) failed: %+v", resPullResolve.Error)
	}
	diskBytes, err := os.ReadFile(reqFile)
	if err != nil {
		t.Fatalf("read resolved resolve-json.json failed: %v", err)
	}
	if !strings.Contains(string(diskBytes), "https://api.example.com/v2-resolved") {
		t.Errorf("expected resolved url on disk, got:\n%s", string(diskBytes))
	}
	if pushRes := gitSvc.Push(collectionsRoot, collID); !pushRes.Success {
		t.Fatalf("Push after Pull ResolveConflict failed: %+v", pushRes.Error)
	}

	// 2. StashAndPull (HECTO_STASH_CONFLICT) non-delete JSON ResolveConflict
	runTestGit(t, peerDir, "pull", "--no-rebase", "origin", "HEAD")
	peerStashReq := `{
  "id": "rj-1",
  "name": "Resolve JSON Req",
  "method": "GET",
  "url": "https://api.example.com/v3-remote",
  "headers": [
    {"key": "X-Dup", "value": "second-remote", "enabled": true}
  ],
  "updated_at": "2026-01-01T00:00:00Z"
}
`
	if err := os.WriteFile(filepath.Join(peerDir, "resolve-json.json"), []byte(peerStashReq), 0644); err != nil {
		t.Fatalf("write peerStashReq failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "peer v3 edit")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	localStashReq := `{
  "id": "rj-1",
  "name": "Resolve JSON Req",
  "method": "GET",
  "url": "https://api.example.com/v3-local",
  "headers": [
    {"key": "X-Dup", "value": "second-local-edit", "enabled": true}
  ],
  "updated_at": "2026-01-01T00:00:00Z"
}
`
	if err := os.WriteFile(reqFile, []byte(localStashReq), 0644); err != nil {
		t.Fatalf("write localStashReq failed: %v", err)
	}

	stashRes := gitSvc.StashAndPull(collectionsRoot, collID)
	if stashRes.Success || stashRes.Error == nil || stashRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected StashAndPull to return GIT_CONFLICT, got %+v", stashRes)
	}

	resStashResolve := gitSvc.ResolveConflict(collectionsRoot, collID, map[string]interface{}{
		"resolve-json.json": map[string]interface{}{
			"id":         "rj-1",
			"name":       "Resolve JSON Req",
			"method":     "GET",
			"url":        "https://api.example.com/v3-stash-resolved",
			"headers":    []interface{}{map[string]interface{}{"key": "X-Dup", "value": "second-local-edit", "enabled": true}},
			"updated_at": "2026-01-01T00:00:00Z",
		},
	})
	if !resStashResolve.Success {
		t.Fatalf("ResolveConflict (HECTO_STASH_CONFLICT JSON) failed: %+v", resStashResolve.Error)
	}
	if _, err := os.Stat(filepath.Join(collDir, ".git", hectoStashConflictFile)); !os.IsNotExist(err) {
		t.Errorf("expected HECTO_STASH_CONFLICT to be removed after ResolveConflict")
	}
	diskStashBytes, err := os.ReadFile(reqFile)
	if err != nil {
		t.Fatalf("read stash-resolved file failed: %v", err)
	}
	if !strings.Contains(string(diskStashBytes), "https://api.example.com/v3-stash-resolved") {
		t.Errorf("expected v3-stash-resolved on disk, got:\n%s", string(diskStashBytes))
	}
}

func BenchmarkMergeJSONObjects(b *testing.B) {
	baseObj := map[string]interface{}{
		"id":     "bench-req",
		"name":   "Benchmark Request",
		"method": "POST",
		"url":    "https://api.example.com/v1/orders",
		"headers": []interface{}{
			map[string]interface{}{"key": "Content-Type", "value": "application/json", "enabled": true},
			map[string]interface{}{"key": "Authorization", "value": "Bearer {{token}}", "enabled": true},
		},
		"params": []interface{}{
			map[string]interface{}{"key": "include", "value": "items", "enabled": true},
			map[string]interface{}{"key": "include", "value": "customer", "enabled": true},
		},
		"body": map[string]interface{}{
			"type":    "json",
			"content": "{\n  \"customerId\": \"c-1\",\n  \"currency\": \"USD\",\n  \"notes\": \"standard\"\n}",
		},
	}
	oursObj := cloneJSONMap(baseObj)
	oursObj["url"] = "https://api.example.com/v2/orders"
	oursObj["body"] = map[string]interface{}{
		"type":    "json",
		"content": "{\n  \"customerId\": \"c-2\",\n  \"currency\": \"USD\",\n  \"notes\": \"standard\"\n}",
	}
	theirsObj := cloneJSONMap(baseObj)
	theirsObj["body"] = map[string]interface{}{
		"type":    "json",
		"content": "{\n  \"customerId\": \"c-1\",\n  \"currency\": \"VND\",\n  \"notes\": \"priority\"\n}",
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = MergeJSONObjects("orders/bench-req.json", baseObj, oursObj, theirsObj)
	}
}

func TestDetectEntityMeta_And_MergeJSONObjects_FlowAndFlowFolder(t *testing.T) {
	// 1. Flow entity detection & 3-Way JSON Merge
	baseFlow := map[string]interface{}{
		"id":          "flow-1",
		"name":        "Order Payment Flow",
		"description": "Initial checkout flow",
		"layout":      "vertical",
		"timeout_ms":  float64(30000),
		"max_steps":   float64(100),
		"nodes": []interface{}{
			map[string]interface{}{
				"id": "node-1",
				"steps": []interface{}{
					map[string]interface{}{"id": "step-1", "request_id": "req-login", "enabled": true},
				},
			},
		},
	}

	oursFlow := cloneJSONMap(baseFlow)
	oursFlow["description"] = "Updated checkout description"
	oursFlow["layout"] = "horizontal"
	oursFlow["timeout_ms"] = float64(15000)

	theirsFlow := cloneJSONMap(baseFlow)
	theirsFlow["layout"] = "vertical-custom" // conflict with oursFlow["layout"]
	theirsFlow["max_steps"] = float64(50)    // non-overlapping update

	entType, entName := detectEntityMeta("flows/order-flow.json", baseFlow, oursFlow, theirsFlow)
	if entType != "flow" || entName != "Order Payment Flow" {
		t.Fatalf("expected entity_type='flow' and entity_name='Order Payment Flow', got type=%q name=%q", entType, entName)
	}

	mergedFlow, flowConflicts := MergeJSONObjects("flows/order-flow.json", baseFlow, oursFlow, theirsFlow)
	if mergedFlow["description"] != "Updated checkout description" {
		t.Errorf("expected non-conflicting description from Ours, got %v", mergedFlow["description"])
	}
	if mergedFlow["max_steps"] != float64(50) {
		t.Errorf("expected non-conflicting max_steps=50 from Theirs, got %v", mergedFlow["max_steps"])
	}
	if mergedFlow["timeout_ms"] != float64(15000) {
		t.Errorf("expected non-conflicting timeout_ms=15000 from Ours, got %v", mergedFlow["timeout_ms"])
	}
	if len(flowConflicts) != 1 || flowConflicts[0].FieldPath != "layout" {
		t.Fatalf("expected 1 conflict on 'layout', got %+v", flowConflicts)
	}
	if flowConflicts[0].Label != "Bố cục sơ đồ (Layout)" {
		t.Errorf("expected Vietnamese field label 'Bố cục sơ đồ (Layout)', got %q", flowConflicts[0].Label)
	}
	if got := friendlyFieldLabel("direction"); got != "Bố cục sơ đồ (Layout)" {
		t.Errorf("expected friendlyFieldLabel('direction') == 'Bố cục sơ đồ (Layout)', got %q", got)
	}

	// 2. FlowFolder entity detection & 3-Way JSON Merge
	baseFolder := map[string]interface{}{
		"id":    "ff-1",
		"name":  "E2E Checkout",
		"order": []interface{}{"flow-1"},
	}
	oursFolder := cloneJSONMap(baseFolder)
	oursFolder["order"] = []interface{}{"flow-1", "flow-2"}
	theirsFolder := cloneJSONMap(baseFolder)
	theirsFolder["order"] = []interface{}{"flow-2", "flow-1"}

	ffType, ffName := detectEntityMeta("flows/e2e/_folder.json", baseFolder, oursFolder, theirsFolder)
	if ffType != "flow_folder" || ffName != "E2E Checkout" {
		t.Fatalf("expected entity_type='flow_folder' and entity_name='E2E Checkout', got type=%q name=%q", ffType, ffName)
	}

	rootFFType, _ := detectEntityMeta("flows/_folder.json", nil, nil, nil)
	if rootFFType != "flow_folder" {
		t.Errorf("expected entity_type='flow_folder' for flows/_folder.json, got %q", rootFFType)
	}

	_, ffConflicts := MergeJSONObjects("flows/e2e/_folder.json", baseFolder, oursFolder, theirsFolder)
	if len(ffConflicts) != 1 || ffConflicts[0].FieldPath != "order" {
		t.Fatalf("expected 1 conflict on 'order', got %+v", ffConflicts)
	}
	if ffConflicts[0].Label != "Thứ tự sắp xếp (Order)" {
		t.Errorf("expected Vietnamese field label 'Thứ tự sắp xếp (Order)', got %q", ffConflicts[0].Label)
	}
}


package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hecto-api/model"
)

func execCLI(t *testing.T, dataDir string, args ...string) (int, string, string) {
	t.Helper()
	var stdout, stderr bytes.Buffer
	fullArgs := append([]string{"--data-dir", dataDir}, args...)
	code := runCLI(fullArgs, &stdout, &stderr)
	return code, stdout.String(), stderr.String()
}

func execCLIJSON(t *testing.T, dataDir string, args ...string) (int, model.Result, string) {
	t.Helper()
	fullArgs := append(args, "--json")
	code, outStr, errStr := execCLI(t, dataDir, fullArgs...)
	var res model.Result
	if err := json.Unmarshal([]byte(strings.TrimSpace(outStr)), &res); err != nil {
		t.Fatalf("expected valid single JSON object on stdout for args %v, got parse error %v; raw stdout:\n%s\nstderr:\n%s",
			args, err, outStr, errStr)
	}
	return code, res, outStr
}

func TestHelpAndAgentGuide(t *testing.T) {
	tmpDir := t.TempDir()

	// 1. hecto --help first line must contain the AI Agent hint
	code, outStr, _ := execCLI(t, tmpDir, "--help")
	if code != 0 {
		t.Fatalf("expected exit code 0 for --help, got %d", code)
	}
	lines := strings.Split(strings.TrimSpace(outStr), "\n")
	if len(lines) == 0 || !strings.Contains(lines[0], "hecto agent-guide") {
		t.Fatalf("expected first line of --help to reference `hecto agent-guide`, got: %q", lines[0])
	}

	// 2. hecto agent-guide must output SKILL.md to stdout
	code, guideOut, _ := execCLI(t, tmpDir, "agent-guide")
	if code != 0 {
		t.Fatalf("expected exit code 0 for agent-guide, got %d", code)
	}
	if !strings.Contains(guideOut, "name: hecto-cli") || !strings.Contains(guideOut, "hecto <entity> <verb>") {
		t.Fatalf("expected SKILL.md content from agent-guide, got:\n%s", guideOut)
	}
}

func TestEndToEndFlow_Run_Scripts_BasicAuthUnicode_And_DiskPersistence(t *testing.T) {
	dataDir := t.TempDir()

	var gotAuth string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"token":"secret-jwt"}`))
	}))
	defer ts.Close()

	// 1. Create and activate Staging environment
	code, envRes, _ := execCLIJSON(t, dataDir, "env", "create", "--name", "Staging", "--var", "base_url="+ts.URL, "--activate")
	if code != 0 || !envRes.Success {
		t.Fatalf("env create failed: %+v", envRes)
	}

	// 2. Create folder "AuthFlow" with apiKey auth (testing --auth-type apikey normalization)
	code, fRes, _ := execCLIJSON(t, dataDir, "folder", "create", "--name", "AuthFlow", "--auth-type", "apikey", "--auth-key", "X-API-Key", "--auth-val", "k123")
	if code != 0 || !fRes.Success {
		t.Fatalf("folder create failed: %+v", fRes)
	}
	fMap := fRes.Data.(map[string]interface{})
	authMap := fMap["auth"].(map[string]interface{})
	if authMap["type"] != "apiKey" {
		t.Errorf("expected normalized auth.type = 'apiKey', got %v", authMap["type"])
	}

	// 3. Create request "Login" in "AuthFlow" with Vietnamese Basic Auth and post-response script saving token to folderVariables
	code, rRes, _ := execCLIJSON(t, dataDir,
		"req", "create",
		"--folder", "AuthFlow",
		"--name", "Login",
		"--method", "POST",
		"--url", "{{base_url}}/v1/login",
		"--auth-type", "basic",
		"--auth-user", "admin",
		"--auth-pass", "mật khẩu Việt",
		"--body-type", "json",
		"--body", `{"hello":"world"}`,
		"--post-script", `const d = ha.response.json(); ha.folderVariables.set("token", d.token);`,
	)
	if code != 0 || !rRes.Success {
		t.Fatalf("req create failed: %+v", rRes)
	}

	// 4. Run `hecto run "AuthFlow/Login" --json` (flags after positional arg)
	code, runRes, rawStdout := execCLIJSON(t, dataDir, "run", "AuthFlow/Login")
	if code != 0 || !runRes.Success {
		t.Fatalf("hecto run failed (code=%d): %+v\nstdout: %s", code, runRes, rawStdout)
	}
	dataMap := runRes.Data.(map[string]interface{})
	if int(dataMap["status_code"].(float64)) != 200 {
		t.Errorf("expected status_code 200, got %v", dataMap["status_code"])
	}
	expectedBasic := "Basic " + base64.StdEncoding.EncodeToString([]byte("admin:mật khẩu Việt"))
	if gotAuth != expectedBasic {
		t.Errorf("gotAuth = %q, want %q", gotAuth, expectedBasic)
	}

	// 5. Verify `token = "secret-jwt"` was persisted into `AuthFlow/_folder.json`
	code, fGetRes, _ := execCLIJSON(t, dataDir, "folder", "get", "AuthFlow")
	if code != 0 || !fGetRes.Success {
		t.Fatalf("folder get failed: %+v", fGetRes)
	}
	fGetMap := fGetRes.Data.(map[string]interface{})
	varsSlice := fGetMap["variables"].([]interface{})
	foundToken := false
	for _, item := range varsSlice {
		vm := item.(map[string]interface{})
		if vm["key"] == "token" && vm["value"] == "secret-jwt" {
			foundToken = true
		}
	}
	if !foundToken {
		t.Errorf("expected token='secret-jwt' persisted in AuthFlow/_folder.json, got: %+v", varsSlice)
	}
}

func TestOrthogonalCRUD_ReadMergeWrite_Move_And_DeleteActiveEntities(t *testing.T) {
	dataDir := t.TempDir()

	// 1. Collection create with --switch, update (Read-Merge-Write), and delete active collection -> resets active_collection to "default"
	code, cCreate, _ := execCLIJSON(t, dataDir, "collection", "create", "--name", "Payments API", "--description", "Initial desc", "--var", "k1=v1", "--switch")
	if code != 0 || !cCreate.Success {
		t.Fatalf("collection create failed: %+v", cCreate)
	}
	collID := cCreate.Data.(map[string]interface{})["id"].(string)

	// Update only --set-var k2=v2 -> must preserve description and k1=v1
	code, cUpd, _ := execCLIJSON(t, dataDir, "collection", "update", "Payments API", "--set-var", "k2=v2")
	if code != 0 || !cUpd.Success {
		t.Fatalf("collection update failed: %+v", cUpd)
	}
	cUpdMap := cUpd.Data.(map[string]interface{})
	if cUpdMap["description"] != "Initial desc" {
		t.Errorf("expected description preserved, got %v", cUpdMap["description"])
	}
	if len(cUpdMap["variables"].([]interface{})) != 2 {
		t.Errorf("expected 2 collection variables, got %+v", cUpdMap["variables"])
	}

	// Delete active collection "Payments API" -> active_collection must reset to "default"
	code, cDel, _ := execCLIJSON(t, dataDir, "collection", "delete", collID)
	if code != 0 || !cDel.Success {
		t.Fatalf("collection delete failed: %+v", cDel)
	}
	if cDel.Data.(map[string]interface{})["active_collection"] != "default" {
		t.Errorf("expected active_collection reset to 'default', got %+v", cDel.Data)
	}

	// Verify config.json on disk has active_collection == "default"
	cfgBytes, err := os.ReadFile(filepath.Join(dataDir, "config.json"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(cfgBytes), `"active_collection": "default"`) {
		t.Errorf("expected config.json to have active_collection='default', got:\n%s", string(cfgBytes))
	}

	// 2. Environment create --activate, update (Read-Merge-Write), and delete active env -> clears active_env_id in collection.json
	code, eCreate, _ := execCLIJSON(t, dataDir, "env", "create", "--name", "DevEnv", "--var", "a=1", "--var", "b=2", "--activate")
	if code != 0 || !eCreate.Success {
		t.Fatalf("env create failed: %+v", eCreate)
	}
	envID := eCreate.Data.(map[string]interface{})["id"].(string)

	// Verify active_env_id is set on default collection
	_, cGet1, _ := execCLIJSON(t, dataDir, "collection", "get")
	if cGet1.Data.(map[string]interface{})["active_env_id"] != envID {
		t.Fatalf("expected active_env_id=%q, got %v", envID, cGet1.Data.(map[string]interface{})["active_env_id"])
	}

	// Update env: unset 'a', set 'c=3' -> 'b=2' must be preserved
	code, eUpd, _ := execCLIJSON(t, dataDir, "env", "update", "DevEnv", "--unset-var", "a", "--set-var", "c=3")
	if code != 0 || !eUpd.Success {
		t.Fatalf("env update failed: %+v", eUpd)
	}
	if len(eUpd.Data.(map[string]interface{})["variables"].([]interface{})) != 2 {
		t.Errorf("expected 2 env variables after update, got %+v", eUpd.Data)
	}

	// Delete active env -> must clear active_env_id in collection.json
	code, eDel, _ := execCLIJSON(t, dataDir, "env", "delete", "DevEnv")
	if code != 0 || !eDel.Success {
		t.Fatalf("env delete failed: %+v", eDel)
	}
	_, cGet2, _ := execCLIJSON(t, dataDir, "collection", "get")
	if v := cGet2.Data.(map[string]interface{})["active_env_id"]; v != nil && v != "" {
		t.Errorf("expected active_env_id cleared to '', got %v", v)
	}

	// 3. Request Read-Merge-Write update & move with flags after positional args
	_, _, _ = execCLIJSON(t, dataDir, "folder", "create", "--name", "TargetDir")
	_, reqCr, _ := execCLIJSON(t, dataDir,
		"req", "create",
		"--name", "GetItems",
		"--method", "POST",
		"--url", "https://api.example.com/items?limit=10",
		"--header", "X-Keep: 1",
		"--body-type", "json",
		"--body", `{"keep":"me"}`,
		"--pre-script", `console.log("pre");`,
	)
	if !reqCr.Success {
		t.Fatalf("req create failed: %+v", reqCr)
	}

	// Patch only --body "" and --set-header "X-Added: 2" -> must clear body.content while preserving method, url, X-Keep, and pre-script
	code, reqUpd, _ := execCLIJSON(t, dataDir, "req", "update", "GetItems", "--body", "", "--set-header", "X-Added: 2")
	if code != 0 || !reqUpd.Success {
		t.Fatalf("req update failed: %+v", reqUpd)
	}
	rMap := reqUpd.Data.(map[string]interface{})
	if rMap["method"] != "POST" {
		t.Errorf("expected method POST preserved, got %v", rMap["method"])
	}
	bodyMap := rMap["body"].(map[string]interface{})
	if bodyMap["content"] != "" {
		t.Errorf("expected body.content cleared to '', got %q", bodyMap["content"])
	}
	scriptsMap := rMap["scripts"].(map[string]interface{})
	if scriptsMap["pre_request"] != `console.log("pre");` {
		t.Errorf("expected pre_request script preserved, got %v", scriptsMap["pre_request"])
	}
	if len(rMap["headers"].([]interface{})) != 2 {
		t.Errorf("expected 2 headers (X-Keep and X-Added), got %+v", rMap["headers"])
	}

	// Move request into TargetDir using positional arg before --to and --json
	code, moveRes, _ := execCLIJSON(t, dataDir, "req", "move", "GetItems", "--to", "TargetDir")
	if code != 0 || !moveRes.Success {
		t.Fatalf("req move failed: %+v", moveRes)
	}

	// Verify request is now accessible via "TargetDir/GetItems"
	code, movedGet, _ := execCLIJSON(t, dataDir, "req", "get", "TargetDir/GetItems")
	if code != 0 || !movedGet.Success {
		t.Fatalf("expected TargetDir/GetItems to resolve after move, got: %+v", movedGet)
	}
}

func TestImport_Curl_Postman_And_MissingFileNotFound(t *testing.T) {
	dataDir := t.TempDir()

	// 1. Missing file must return NOT_FOUND (exit code 1) and never fall through to ParseCurl
	code, missRes, _ := execCLIJSON(t, dataDir, "import", filepath.Join(dataDir, "does-not-exist.json"))
	if code == 0 || missRes.Success || missRes.Error == nil || missRes.Error.Code != model.ErrNotFound {
		t.Fatalf("expected NOT_FOUND for missing import file, got code=%d res=%+v", code, missRes)
	}

	// 2. Direct cURL command import into a folder with --name override
	_, _, _ = execCLIJSON(t, dataDir, "folder", "create", "--name", "ImportedCurl")
	code, curlRes, _ := execCLIJSON(t, dataDir,
		"import", "curl -X POST https://api.example.com/v1/orders -H 'Content-Type: application/json' -d '{\"item\":1}'",
		"--folder", "ImportedCurl",
		"--name", "CreateOrder",
	)
	if code != 0 || !curlRes.Success {
		t.Fatalf("curl import failed: %+v", curlRes)
	}

	// Verify "ImportedCurl/CreateOrder" exists
	code, getCurlReq, _ := execCLIJSON(t, dataDir, "req", "get", "ImportedCurl/CreateOrder")
	if code != 0 || !getCurlReq.Success {
		t.Fatalf("expected ImportedCurl/CreateOrder to exist, got: %+v", getCurlReq)
	}

	// 3. Postman v2.1 JSON file import into a folder with --name override
	postmanJSON := `{
		"info": {
			"name": "Original Postman Name",
			"schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
		},
		"item": [
			{
				"name": "HealthCheck",
				"request": {
					"method": "GET",
					"url": "https://api.example.com/health"
				}
			}
		]
	}`
	pmFile := filepath.Join(dataDir, "sample.postman_collection.json")
	if err := os.WriteFile(pmFile, []byte(postmanJSON), 0644); err != nil {
		t.Fatal(err)
	}
	code, pmRes, _ := execCLIJSON(t, dataDir, "import", pmFile, "--folder", "ImportedCurl", "--name", "CustomPM")
	if code != 0 || !pmRes.Success {
		t.Fatalf("postman import failed: %+v", pmRes)
	}

	// Verify "ImportedCurl/CustomPM/HealthCheck" resolves
	code, getPMReq, _ := execCLIJSON(t, dataDir, "req", "get", "ImportedCurl/CustomPM/HealthCheck")
	if code != 0 || !getPMReq.Success {
		t.Fatalf("expected ImportedCurl/CustomPM/HealthCheck to resolve, got: %+v", getPMReq)
	}

	// 4. cURL file import
	curlFile := filepath.Join(dataDir, "sample.curl")
	if err := os.WriteFile(curlFile, []byte("curl -X GET https://api.example.com/v1/status -H 'Accept: application/json'"), 0644); err != nil {
		t.Fatal(err)
	}
	code, cfRes, _ := execCLIJSON(t, dataDir, "import", curlFile, "--folder", "ImportedCurl", "--name", "StatusFromFile")
	if code != 0 || !cfRes.Success {
		t.Fatalf("curl file import failed: %+v", cfRes)
	}
	code, getCFReq, _ := execCLIJSON(t, dataDir, "req", "get", "ImportedCurl/StatusFromFile")
	if code != 0 || !getCFReq.Success {
		t.Fatalf("expected ImportedCurl/StatusFromFile to exist, got: %+v", getCFReq)
	}
	_ = io.Discard
}

func TestFolderCRUD_ReqListFolder_RunFlags_FileLoading_And_CollectionFlag(t *testing.T) {
	dataDir := t.TempDir()

	var lastPath, lastHeader string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		lastPath = r.URL.RequestURI()
		lastHeader = r.Header.Get("X-Env-Val")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer ts.Close()

	// 1. Create a secondary collection "WorkspaceB", switch back to "default", and target "WorkspaceB" via `-c`
	code, wbCreate, _ := execCLIJSON(t, dataDir, "collection", "create", "--name", "WorkspaceB", "--switch")
	if code != 0 || !wbCreate.Success {
		t.Fatalf("WorkspaceB create failed: %+v", wbCreate)
	}
	code, swRes, _ := execCLIJSON(t, dataDir, "collection", "switch", "default")
	if code != 0 || !swRes.Success {
		t.Fatalf("collection switch default failed: %+v", swRes)
	}

	// Create environment "QA" inside WorkspaceB using `-c WorkspaceB`, then activate it via `env activate`
	code, qaEnv, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "env", "create", "--name", "QA", "--var", "base_url="+ts.URL, "--var", "env_hdr=from-qa-env")
	if code != 0 || !qaEnv.Success {
		t.Fatalf("QA env create failed: %+v", qaEnv)
	}
	code, actRes, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "env", "activate", "QA")
	if code != 0 || !actRes.Success {
		t.Fatalf("env activate QA failed: %+v", actRes)
	}

	// 2. Folder create, update (--set-var, --unset-var, --set-env-var, --unset-env-var, --env-auth), move, list, tree, delete
	code, fParent, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "create", "--name", "ParentF", "--var", "fvar=1", "--var", "dropme=2")
	if code != 0 || !fParent.Success {
		t.Fatalf("ParentF create failed: %+v", fParent)
	}
	code, fChild, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "create", "--name", "ChildF")
	if code != 0 || !fChild.Success {
		t.Fatalf("ChildF create failed: %+v", fChild)
	}
	code, fMove, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "move", "ChildF", "--to", "ParentF")
	if code != 0 || !fMove.Success {
		t.Fatalf("folder move failed: %+v", fMove)
	}
	code, fUpd, _ := execCLIJSON(t, dataDir,
		"-c", "WorkspaceB",
		"folder", "update", "ParentF/ChildF",
		"--set-var", "fvar=override",
		"--unset-var", "dropme",
		"--set-env-var", "QA:env_hdr=from-folder-env",
		"--set-env-var", "QA:temp_k=temp_v",
		"--unset-env-var", "QA:temp_k",
		"--env-auth", "QA:bearer:qa-tok-123",
	)
	if code != 0 || !fUpd.Success {
		t.Fatalf("folder update failed: %+v", fUpd)
	}
	fUpdMap := fUpd.Data.(map[string]interface{})
	// Entity-level auth must still be "inherit" when only --env-auth was passed
	if fUpdMap["auth"].(map[string]interface{})["type"] != "inherit" {
		t.Errorf("expected folder.auth.type to remain 'inherit', got %+v", fUpdMap["auth"])
	}

	// Verify `folder list` and `folder tree`
	code, fList, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "list")
	if code != 0 || !fList.Success || len(fList.Data.([]interface{})) != 2 {
		t.Fatalf("expected 2 folders in folder list, got: %+v", fList)
	}
	code, fTree, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "tree")
	if code != 0 || !fTree.Success || len(fTree.Data.([]interface{})) != 1 {
		t.Fatalf("expected 1 root folder in folder tree, got: %+v", fTree)
	}

	// 3. Create request inside "ParentF/ChildF" and test `@filepath` loading + `--url` & `--set-param`/`--unset-param` update
	bodyFile := filepath.Join(dataDir, "payload.json")
	scriptFile := filepath.Join(dataDir, "post.js")
	if err := os.WriteFile(bodyFile, []byte(`{"from_file":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(scriptFile, []byte(`ha.variables.set("mutated_var", "should-persist");`), 0644); err != nil {
		t.Fatal(err)
	}

	code, rCr, _ := execCLIJSON(t, dataDir,
		"-c", "WorkspaceB",
		"req", "create",
		"--folder", "ParentF/ChildF",
		"--name", "CheckEndpoint",
		"--method", "POST",
		"--url", "{{base_url}}/v1/check/:id?old=1&keep=2",
		"--path-param", "id=42",
		"--header", "X-Env-Val: {{env_hdr}}",
	)
	if code != 0 || !rCr.Success {
		t.Fatalf("req create failed: %+v", rCr)
	}

	// Update request with new --url + --unset-param + --set-param + @filepath body & post-script
	code, rUpd, _ := execCLIJSON(t, dataDir,
		"-c", "WorkspaceB",
		"req", "update", "ParentF/ChildF/CheckEndpoint",
		"--url", "{{base_url}}/v2/check/:id?keep=2&drop=9",
		"--unset-param", "drop",
		"--set-param", "added={{fvar}}",
		"--body", "@"+bodyFile,
		"--post-script", "@"+scriptFile,
	)
	if code != 0 || !rUpd.Success {
		t.Fatalf("req update failed: %+v", rUpd)
	}
	rUpdMap := rUpd.Data.(map[string]interface{})
	if rUpdMap["url"] != "{{base_url}}/v2/check/:id?keep=2&added={{fvar}}" {
		t.Errorf("unexpected reconciled URL after update: %v", rUpdMap["url"])
	}
	if rUpdMap["body"].(map[string]interface{})["content"] != `{"from_file":true}` {
		t.Errorf("expected body loaded from @file, got %+v", rUpdMap["body"])
	}

	// 4. Verify `req list --folder ParentF/ChildF` includes `ParentF/ChildF` in `folder_path` and `path_display`
	code, rListF, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "req", "list", "--folder", "ParentF/ChildF")
	if code != 0 || !rListF.Success {
		t.Fatalf("req list --folder failed: %+v", rListF)
	}
	items := rListF.Data.([]interface{})
	if len(items) != 1 {
		t.Fatalf("expected 1 request in ParentF/ChildF, got %d", len(items))
	}
	entry := items[0].(map[string]interface{})
	if entry["folder_path"] != "ParentF/ChildF" || entry["path_display"] != "ParentF/ChildF/CheckEndpoint" {
		t.Errorf("expected folder_path='ParentF/ChildF' and path_display='ParentF/ChildF/CheckEndpoint', got %+v", entry)
	}

	// 5. Test `hecto run` with `--var` and `--no-save-env`
	code, runNoSave, _ := execCLIJSON(t, dataDir,
		"-c", "WorkspaceB",
		"run", "ParentF/ChildF/CheckEndpoint",
		"--var", "fvar=cli-override",
		"--no-save-env",
	)
	if code != 0 || !runNoSave.Success {
		t.Fatalf("run with --no-save-env failed: %+v", runNoSave)
	}
	if lastPath != "/v2/check/42?keep=2&added=cli-override" {
		t.Errorf("expected lastPath '/v2/check/42?keep=2&added=cli-override', got %q", lastPath)
	}
	// Because QA env is active, Tier 4 folder-env `QA:env_hdr=from-folder-env` wins
	if lastHeader != "from-folder-env" {
		t.Errorf("expected X-Env-Val='from-folder-env', got %q", lastHeader)
	}
	// Verify `mutated_var` was NOT saved to QA env because `--no-save-env` was passed
	_, qaAfterNoSave, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "env", "get", "QA")
	for _, v := range qaAfterNoSave.Data.(map[string]interface{})["variables"].([]interface{}) {
		if v.(map[string]interface{})["key"] == "mutated_var" {
			t.Errorf("expected mutated_var NOT persisted when --no-save-env is set")
		}
	}

	// 6. Test `hecto run` with `--env none` (must ignore collection's active QA environment)
	code, runEnvNone, _ := execCLIJSON(t, dataDir,
		"-c", "WorkspaceB",
		"run", "ParentF/ChildF/CheckEndpoint",
		"--env", "none",
		"--var", "base_url="+ts.URL,
	)
	if code != 0 || !runEnvNone.Success {
		t.Fatalf("run with --env none failed: %+v", runEnvNone)
	}
	if lastHeader != "{{env_hdr}}" {
		t.Errorf("expected unresolved '{{env_hdr}}' when --env none is used, got %q", lastHeader)
	}

	// 7. Create and delete a temporary folder
	_, tmpF, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "create", "--name", "TempDeleteMe")
	if !tmpF.Success {
		t.Fatalf("TempDeleteMe create failed: %+v", tmpF)
	}
	code, delF, _ := execCLIJSON(t, dataDir, "-c", "WorkspaceB", "folder", "delete", "TempDeleteMe")
	if code != 0 || !delF.Success {
		t.Fatalf("folder delete failed: %+v", delF)
	}
}


package main

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"testing"
	"time"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

func TestMain(m *testing.M) {
	if os.Getenv(mockInternalDaemonEnv) == "1" {
		main()
		return
	}
	os.Exit(m.Run())
}

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

func TestFlowCLI_CRUD_Folder_ShorthandSteps_NodesJSON_And_Run(t *testing.T) {
	dataDir := t.TempDir()

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/login":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"token":"flow-jwt-999","tier":"vip"}`))
		case "/profile":
			if r.Header.Get("Authorization") != "Bearer flow-jwt-999" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"user":"alice"}`))
		case "/cart":
			if r.Header.Get("Authorization") != "Bearer flow-jwt-999" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"items":2}`))
		case "/vip-checkout":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"order":"vip-ok","user":` + `"` + r.Header.Get("X-User") + `","items":` + `"` + r.Header.Get("X-Items") + `"}`))
		case "/std-checkout":
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"order":"std-ok"}`))
		case "/fail-500":
			w.WriteHeader(http.StatusInternalServerError)
			_, _ = w.Write([]byte(`{"error":"boom"}`))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer ts.Close()

	// 0. Verify agent-guide includes hecto flow documentation
	code, guideOut, _ := execCLI(t, dataDir, "agent-guide")
	if code != 0 || !strings.Contains(guideOut, "hecto flow") {
		t.Fatalf("expected agent-guide to document `hecto flow`, got code=%d", code)
	}

	// 1. Setup Environment, Request Folders, and Requests
	_, envRes, _ := execCLIJSON(t, dataDir, "env", "create", "--name", "Prod", "--var", "base_url="+ts.URL, "--activate")
	if !envRes.Success {
		t.Fatalf("env create failed: %+v", envRes)
	}
	_, _, _ = execCLIJSON(t, dataDir, "folder", "create", "--name", "Auth")
	_, _, _ = execCLIJSON(t, dataDir, "folder", "create", "--name", "Users")
	_, _, _ = execCLIJSON(t, dataDir, "folder", "create", "--name", "Catalog")
	_, _, _ = execCLIJSON(t, dataDir, "folder", "create", "--name", "Orders")

	_, rLogin, _ := execCLIJSON(t, dataDir, "req", "create",
		"--folder", "Auth", "--name", "Login", "--method", "POST", "--url", "{{base_url}}/login",
		"--post-script", `const b = ha.response.json(); ha.variables.set("jwt", b.token); ha.variables.set("user_tier", b.tier);`,
	)
	if !rLogin.Success {
		t.Fatalf("create Login req failed: %+v", rLogin)
	}
	_, rProfile, _ := execCLIJSON(t, dataDir, "req", "create",
		"--folder", "Users", "--name", "Profile", "--method", "GET", "--url", "{{base_url}}/profile",
		"--auth-type", "bearer", "--auth-token", "{{jwt}}",
		"--post-script", `ha.variables.set("user_name", ha.response.json().user);`,
	)
	if !rProfile.Success {
		t.Fatalf("create Profile req failed: %+v", rProfile)
	}
	_, rCart, _ := execCLIJSON(t, dataDir, "req", "create",
		"--folder", "Catalog", "--name", "Cart", "--method", "GET", "--url", "{{base_url}}/cart",
		"--auth-type", "bearer", "--auth-token", "{{jwt}}",
		"--post-script", `ha.variables.set("cart_items", String(ha.response.json().items));`,
	)
	if !rCart.Success {
		t.Fatalf("create Cart req failed: %+v", rCart)
	}
	_, rVipCheckout, _ := execCLIJSON(t, dataDir, "req", "create",
		"--folder", "Orders", "--name", "VIP Checkout", "--method", "POST", "--url", "{{base_url}}/vip-checkout",
		"--header", "X-User: {{user_name}}", "--header", "X-Items: {{cart_items}}",
	)
	if !rVipCheckout.Success {
		t.Fatalf("create VIP Checkout req failed: %+v", rVipCheckout)
	}
	_, rStdCheckout, _ := execCLIJSON(t, dataDir, "req", "create",
		"--folder", "Orders", "--name", "Standard Checkout", "--method", "POST", "--url", "{{base_url}}/std-checkout",
	)
	if !rStdCheckout.Success {
		t.Fatalf("create Standard Checkout req failed: %+v", rStdCheckout)
	}
	_, rFail500, _ := execCLIJSON(t, dataDir, "req", "create",
		"--folder", "Orders", "--name", "Broken Step", "--method", "GET", "--url", "{{base_url}}/fail-500",
	)
	if !rFail500.Success {
		t.Fatalf("create Broken Step req failed: %+v", rFail500)
	}

	// 2. Flow Folder CRUD (create, parent create, update, move, list, tree, get, delete)
	code, ffSuite, _ := execCLIJSON(t, dataDir, "flow", "folder", "create", "--name", "E2E Suite")
	if code != 0 || !ffSuite.Success {
		t.Fatalf("flow folder create E2E Suite failed: %+v", ffSuite)
	}
	_, ffSub, _ := execCLIJSON(t, dataDir, "flow", "folder", "create", "--name", "SubGroup", "--parent", "E2E Suite")
	if !ffSub.Success {
		t.Fatalf("flow folder create SubGroup failed: %+v", ffSub)
	}
	_, ffUpd, _ := execCLIJSON(t, dataDir, "flow", "folder", "update", "E2E Suite/SubGroup", "--name", "Checkout Group")
	if !ffUpd.Success || ffUpd.Data.(map[string]interface{})["name"] != "Checkout Group" {
		t.Fatalf("flow folder update failed: %+v", ffUpd)
	}
	_, ffList, _ := execCLIJSON(t, dataDir, "flow", "folder", "list")
	if !ffList.Success || len(ffList.Data.([]interface{})) != 2 {
		t.Fatalf("expected 2 flow folders in list, got: %+v", ffList)
	}
	_, ffGet, _ := execCLIJSON(t, dataDir, "flow", "folder", "get", "E2E Suite/Checkout Group")
	if !ffGet.Success {
		t.Fatalf("flow folder get failed: %+v", ffGet)
	}
	_, ffTemp, _ := execCLIJSON(t, dataDir, "flow", "folder", "create", "--name", "TempFlowFolder")
	if !ffTemp.Success {
		t.Fatalf("flow folder create TempFlowFolder failed: %+v", ffTemp)
	}
	_, ffMove, _ := execCLIJSON(t, dataDir, "flow", "folder", "move", "TempFlowFolder", "--to", "E2E Suite")
	if !ffMove.Success {
		t.Fatalf("flow folder move failed: %+v", ffMove)
	}
	_, ffDel, _ := execCLIJSON(t, dataDir, "flow", "folder", "delete", "E2E Suite/TempFlowFolder")
	if !ffDel.Success {
		t.Fatalf("flow folder delete failed: %+v", ffDel)
	}

	// 3. Flow Create with shorthand --steps "<req1>,<req2>||<req3>,<req4>"
	code, fCreate, _ := execCLIJSON(t, dataDir,
		"flow", "create",
		"--name", "Checkout Flow",
		"--folder", "E2E Suite/Checkout Group",
		"--desc", "Initial shorthand flow",
		"--layout", "vertical",
		"--timeout-ms", "15000",
		"--max-steps", "50",
		"--steps", "Auth/Login,Users/Profile||Catalog/Cart,Orders/VIP Checkout",
	)
	if code != 0 || !fCreate.Success {
		t.Fatalf("flow create with --steps failed: %+v", fCreate)
	}
	fMap := fCreate.Data.(map[string]interface{})
	nodes := fMap["nodes"].([]interface{})
	if len(nodes) != 3 {
		t.Fatalf("expected 3 FlowNodes from --steps, got %d", len(nodes))
	}
	if len(nodes[1].(map[string]interface{})["steps"].([]interface{})) != 2 {
		t.Fatalf("expected 2 parallel steps in node[1], got %+v", nodes[1])
	}

	// 4. Verify `flow get`, `flow list`, `flow tree`
	code, fGet, _ := execCLIJSON(t, dataDir, "flow", "get", "E2E Suite/Checkout Group/Checkout Flow")
	if code != 0 || !fGet.Success {
		t.Fatalf("flow get failed: %+v", fGet)
	}
	fGetMap := fGet.Data.(map[string]interface{})
	refReqs := fGetMap["referenced_requests"].([]interface{})
	if len(refReqs) != 4 {
		t.Fatalf("expected 4 referenced_requests in flow get output, got %d", len(refReqs))
	}

	code, fList, _ := execCLIJSON(t, dataDir, "flow", "list", "--folder", "E2E Suite/Checkout Group")
	if code != 0 || !fList.Success || len(fList.Data.([]interface{})) != 1 {
		t.Fatalf("flow list --folder failed: %+v", fList)
	}

	code, fTree, _ := execCLIJSON(t, dataDir, "flow", "tree")
	if code != 0 || !fTree.Success || len(fTree.Data.([]interface{})) == 0 {
		t.Fatalf("flow tree failed: %+v", fTree)
	}

	// 5. Flow Update (Read-Merge-Write) with --nodes-json @file (including custom + success branches)
	nodesJSONFile := filepath.Join(t.TempDir(), "nodes.json")
	nodesJSONContent := `[
		{
			"steps": [
				{ "request_id": "Auth/Login", "enabled": true }
			],
			"branches": [
				{
					"name": "VIP Branch",
					"condition": {
						"type": "custom",
						"source": "variable",
						"path": "user_tier",
						"operator": "==",
						"value": "vip"
					},
					"nodes": [
						{
							"steps": [
								{ "request_id": "Users/Profile", "enabled": true },
								{ "request_id": "Catalog/Cart", "enabled": true }
							]
						},
						{
							"steps": [
								{ "request_id": "Orders/VIP Checkout", "enabled": true }
							]
						}
					]
				},
				{
					"name": "Standard Branch",
					"condition": { "type": "success" },
					"nodes": [
						{
							"steps": [
								{ "request_id": "Orders/Standard Checkout", "enabled": true }
							]
						}
					]
				}
			]
		}
	]`
	if err := os.WriteFile(nodesJSONFile, []byte(nodesJSONContent), 0644); err != nil {
		t.Fatalf("write nodes.json failed: %v", err)
	}

	code, fUpd, _ := execCLIJSON(t, dataDir,
		"flow", "update", "E2E Suite/Checkout Group/Checkout Flow",
		"--layout", "horizontal",
		"--nodes-json", "@"+nodesJSONFile,
	)
	if code != 0 || !fUpd.Success {
		t.Fatalf("flow update failed: %+v", fUpd)
	}
	fUpdMap := fUpd.Data.(map[string]interface{})
	// Verify Read-Merge-Write preserved description and timeout_ms while updating layout and nodes
	if fUpdMap["description"] != "Initial shorthand flow" || fUpdMap["layout"] != "horizontal" || int(fUpdMap["timeout_ms"].(float64)) != 15000 {
		t.Fatalf("Read-Merge-Write did not preserve untouched fields: %+v", fUpdMap)
	}

	// Verify `flow get` after `--nodes-json` includes all 5 branch referenced_requests
	code, fGetBranched, _ := execCLIJSON(t, dataDir, "flow", "get", "E2E Suite/Checkout Group/Checkout Flow")
	if code != 0 || !fGetBranched.Success {
		t.Fatalf("flow get after update failed: %+v", fGetBranched)
	}
	branchedRefs := fGetBranched.Data.(map[string]interface{})["referenced_requests"].([]interface{})
	if len(branchedRefs) != 5 {
		t.Fatalf("expected 5 referenced_requests across nested branches, got %d", len(branchedRefs))
	}

	// 6. Execute Flow via `hecto flow run <path> --json` and with `--env none --var --timeout-ms --no-save-env`
	code, fRun, _ := execCLIJSON(t, dataDir, "flow", "run", "E2E Suite/Checkout Group/Checkout Flow")
	if code != 0 || !fRun.Success {
		t.Fatalf("flow run failed (code=%d): %+v", code, fRun)
	}
	runData := fRun.Data.(map[string]interface{})
	if runData["status"] != "passed" {
		t.Fatalf("expected flow run status 'passed', got %+v", runData)
	}
	if int(runData["steps_executed"].(float64)) != 4 || int(runData["steps_passed"].(float64)) != 4 || int(runData["steps_skipped"].(float64)) != 1 {
		t.Fatalf("expected steps_executed=4, steps_passed=4, steps_skipped=1, got %+v", runData)
	}

	// Verify `flow run` with `--env none --var base_url=... --timeout-ms 5000 --no-save-env` works across all steps
	code, fRunFlags, _ := execCLIJSON(t, dataDir,
		"flow", "run", "E2E Suite/Checkout Group/Checkout Flow",
		"--env", "none",
		"--var", "base_url="+ts.URL,
		"--timeout-ms", "5000",
		"--no-save-env",
	)
	if code != 0 || !fRunFlags.Success {
		t.Fatalf("flow run with --env none --var --no-save-env failed: %+v", fRunFlags)
	}
	runFlagsData := fRunFlags.Data.(map[string]interface{})
	if runFlagsData["status"] != "passed" || int(runFlagsData["steps_passed"].(float64)) != 4 {
		t.Fatalf("expected passed flow run with --env none and --var base_url, got %+v", runFlagsData)
	}

	// 7. Move Flow to root and verify `flow run` on failing flow returns exit code 1 in non-JSON mode and exit code 0 in --json mode
	code, fMove, _ := execCLIJSON(t, dataDir, "flow", "move", "E2E Suite/Checkout Group/Checkout Flow", "--to", "root")
	if code != 0 || !fMove.Success {
		t.Fatalf("flow move to root failed: %+v", fMove)
	}

	_, fBroken, _ := execCLIJSON(t, dataDir,
		"flow", "create",
		"--name", "Broken Flow",
		"--steps", "Orders/Broken Step,Orders/Standard Checkout",
	)
	if !fBroken.Success {
		t.Fatalf("create Broken Flow failed: %+v", fBroken)
	}

	// Verify `flow get` marks deleted requests with `"missing": true`
	_, delBrokenStep, _ := execCLIJSON(t, dataDir, "req", "delete", "Orders/Broken Step")
	if !delBrokenStep.Success {
		t.Fatalf("delete Orders/Broken Step failed: %+v", delBrokenStep)
	}
	code, fGetBroken, _ := execCLIJSON(t, dataDir, "flow", "get", "Broken Flow")
	if code != 0 || !fGetBroken.Success {
		t.Fatalf("flow get Broken Flow failed: %+v", fGetBroken)
	}
	brokenRefs := fGetBroken.Data.(map[string]interface{})["referenced_requests"].([]interface{})
	if len(brokenRefs) != 2 || brokenRefs[0].(map[string]interface{})["missing"] != true {
		t.Fatalf("expected first referenced_request in Broken Flow to have missing=true, got %+v", brokenRefs)
	}

	// In --json mode, exit code is 0 and data.status == "failed"
	codeJSON, fBrokenRunJSON, _ := execCLIJSON(t, dataDir, "flow", "run", "Broken Flow")
	if codeJSON != 0 || !fBrokenRunJSON.Success {
		t.Fatalf("expected exit code 0 in --json mode for failed flow, got code=%d res=%+v", codeJSON, fBrokenRunJSON)
	}
	brokenData := fBrokenRunJSON.Data.(map[string]interface{})
	if brokenData["status"] != "failed" || int(brokenData["steps_failed"].(float64)) != 1 || int(brokenData["steps_skipped"].(float64)) != 1 {
		t.Fatalf("unexpected broken flow run data: %+v", brokenData)
	}

	// In non-JSON mode, exit code must be 1 when flow status == "failed"
	codeNonJSON, _, _ := execCLI(t, dataDir, "flow", "run", "Broken Flow")
	if codeNonJSON != 1 {
		t.Fatalf("expected exit code 1 in non-JSON mode when flow status is 'failed', got %d", codeNonJSON)
	}

	// 8. Error cases: invalid request selector in --steps, empty step token, non-existent flow selector, invalid --layout, no-op update
	codeErr1, resErr1, _ := execCLIJSON(t, dataDir, "flow", "create", "--name", "Bad Steps", "--steps", "NoSuchFolder/NoSuchReq")
	if codeErr1 == 0 || resErr1.Success || resErr1.Error == nil || resErr1.Error.Code != model.ErrNotFound {
		t.Fatalf("expected NOT_FOUND for invalid request selector in --steps, got code=%d res=%+v", codeErr1, resErr1)
	}
	codeErrEmptyStep, resErrEmptyStep, _ := execCLIJSON(t, dataDir, "flow", "create", "--name", "Empty Token", "--steps", "Auth/Login,,Users/Profile")
	if codeErrEmptyStep == 0 || resErrEmptyStep.Success || resErrEmptyStep.Error == nil || resErrEmptyStep.Error.Code != model.ErrValidation {
		t.Fatalf("expected VALIDATION_ERROR for empty comma token in --steps, got code=%d res=%+v", codeErrEmptyStep, resErrEmptyStep)
	}
	codeErr2, resErr2, _ := execCLIJSON(t, dataDir, "flow", "get", "DoesNotExistFlow")
	if codeErr2 == 0 || resErr2.Success || resErr2.Error == nil || resErr2.Error.Code != model.ErrNotFound {
		t.Fatalf("expected NOT_FOUND for non-existent flow selector, got code=%d res=%+v", codeErr2, resErr2)
	}
	codeErr3, resErr3, _ := execCLIJSON(t, dataDir, "flow", "update", "Checkout Flow", "--layout", "diagonal")
	if codeErr3 == 0 || resErr3.Success || resErr3.Error == nil || resErr3.Error.Code != model.ErrValidation {
		t.Fatalf("expected VALIDATION_ERROR for invalid --layout, got code=%d res=%+v", codeErr3, resErr3)
	}
	codeErrNoOp, resErrNoOp, _ := execCLIJSON(t, dataDir, "flow", "update", "Checkout Flow")
	if codeErrNoOp == 0 || resErrNoOp.Success || resErrNoOp.Error == nil || resErrNoOp.Error.Code != model.ErrValidation {
		t.Fatalf("expected VALIDATION_ERROR for no-op flow update, got code=%d res=%+v", codeErrNoOp, resErrNoOp)
	}

	// 9. Delete Flow
	code, fDel, _ := execCLIJSON(t, dataDir, "flow", "delete", "Broken Flow")
	if code != 0 || !fDel.Success {
		t.Fatalf("flow delete failed: %+v", fDel)
	}
}

func findFreeMockPort(t *testing.T) int {
	t.Helper()
	for i := 0; i < 20; i++ {
		ln, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatalf("failed to allocate free port: %v", err)
		}
		port := ln.Addr().(*net.TCPAddr).Port
		_ = ln.Close()
		if port >= 1024 && port <= 65535 {
			return port
		}
	}
	t.Fatal("failed to allocate free port in range 1024..65535")
	return 0
}

func TestMockCLI_Status_Config_RouteCRUD_And_Validation(t *testing.T) {
	dataDir := t.TempDir()

	// 1. agent-guide contains hecto mock documentation
	code, guideOut, _ := execCLI(t, dataDir, "agent-guide")
	if code != 0 {
		t.Fatalf("agent-guide failed with code=%d", code)
	}
	for _, needle := range []string{"hecto mock", "mock-daemon.json", "--daemon", "MOCK_ROUTE_NOT_FOUND"} {
		if !strings.Contains(guideOut, needle) {
			t.Fatalf("expected agent-guide to contain %q", needle)
		}
	}

	// 2. Initial status without mock-server.json or mock-daemon.json -> running: false, port: 4010, routes: []
	code, stInit, _ := execCLIJSON(t, dataDir, "mock", "status")
	if code != 0 || !stInit.Success {
		t.Fatalf("initial mock status failed: code=%d res=%+v", code, stInit)
	}
	stInitMap := stInit.Data.(map[string]interface{})
	if stInitMap["running"] != false || int(stInitMap["port"].(float64)) != 4010 {
		t.Fatalf("unexpected initial mock status: %+v", stInitMap)
	}
	if routes, ok := stInitMap["routes"].([]interface{}); !ok || len(routes) != 0 {
		t.Fatalf("expected empty non-nil routes slice, got %+v", stInitMap["routes"])
	}

	// 3. Stale PID in mock-daemon.json is cleaned up automatically by status
	deadCmd := exec.Command("true")
	if err := deadCmd.Run(); err != nil {
		t.Fatalf("failed running short-lived command for stale PID: %v", err)
	}
	staleDaemonPath := filepath.Join(dataDir, "mock-daemon.json")
	stalePayload := fmt.Sprintf(`{"pid":%d,"port":4010,"base_url":"http://127.0.0.1:4010","collection_id":"default","coll_root":%q}`,
		deadCmd.Process.Pid, filepath.Join(dataDir, "collections", "default"))
	if err := os.WriteFile(staleDaemonPath, []byte(stalePayload), 0644); err != nil {
		t.Fatalf("failed writing stale mock-daemon.json: %v", err)
	}
	code, stAfterStale, _ := execCLIJSON(t, dataDir, "mock", "status")
	if code != 0 || !stAfterStale.Success {
		t.Fatalf("mock status after stale PID failed: %+v", stAfterStale)
	}
	if stAfterStale.Data.(map[string]interface{})["running"] != false {
		t.Fatalf("expected running=false for stale PID, got %+v", stAfterStale.Data)
	}
	if _, err := os.Stat(staleDaemonPath); !os.IsNotExist(err) {
		t.Fatalf("expected stale mock-daemon.json to be removed, stat err=%v", err)
	}

	// 4. mock config --port validation and compatibility with MockServerService.GetStatus
	for _, badPort := range []string{"0", "80", "1023", "65536"} {
		cBad, resBad, _ := execCLIJSON(t, dataDir, "mock", "config", "--port", badPort)
		if cBad == 0 || resBad.Success || resBad.Error == nil || resBad.Error.Code != model.ErrValidation {
			t.Fatalf("expected VALIDATION for --port %s, got code=%d res=%+v", badPort, cBad, resBad)
		}
	}
	portCfg := findFreeMockPort(t)
	code, cfgRes, _ := execCLIJSON(t, dataDir, "mock", "config", "-p", strconv.Itoa(portCfg))
	if code != 0 || !cfgRes.Success {
		t.Fatalf("mock config -p failed: %+v", cfgRes)
	}
	if int(cfgRes.Data.(map[string]interface{})["port"].(float64)) != portCfg {
		t.Fatalf("expected configured port %d, got %+v", portCfg, cfgRes.Data)
	}

	// Read-only mock config (no --port) returns existing config
	code, cfgReadRes, _ := execCLIJSON(t, dataDir, "mock", "config")
	if code != 0 || !cfgReadRes.Success || int(cfgReadRes.Data.(map[string]interface{})["port"].(float64)) != portCfg {
		t.Fatalf("read-only mock config failed: code=%d res=%+v", code, cfgReadRes)
	}

	// 5. Route create with @file, ANY method, CleanMockPath, flexible flags, and boolean flags
	bodyFile := filepath.Join(t.TempDir(), "mock-body.json")
	if err := os.WriteFile(bodyFile, []byte(`{"id":42,"from_file":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	code, rCreate1, _ := execCLIJSON(t, dataDir,
		"mock", "route", "create",
		"--method", "any",
		"--path", "api/users/:id/",
		"--status-code", "201",
		"--delay-ms", "15",
		"--header", "X-Mock: v1",
		"--body", "@"+bodyFile,
		"--description", "Initial desc",
	)
	if code != 0 || !rCreate1.Success {
		t.Fatalf("mock route create 1 failed: %+v", rCreate1)
	}
	r1Map := rCreate1.Data.(map[string]interface{})
	r1ID := r1Map["id"].(string)
	if r1Map["method"] != "ANY" || r1Map["path"] != "/api/users/:id" ||
		int(r1Map["status_code"].(float64)) != 201 ||
		int(r1Map["delay_ms"].(float64)) != 15 ||
		r1Map["enabled"] != true ||
		r1Map["body"] != `{"id":42,"from_file":true}` ||
		r1Map["description"] != "Initial desc" {
		t.Fatalf("unexpected created route 1 fields: %+v", r1Map)
	}

	// Verify boolean flag --disabled does NOT swallow --json or positional args
	code, rCreate2, _ := execCLIJSON(t, dataDir,
		"mock", "route", "create",
		"--disabled",
		"--path", "/api/disabled",
	)
	if code != 0 || !rCreate2.Success {
		t.Fatalf("mock route create --disabled failed: %+v", rCreate2)
	}
	r2Map := rCreate2.Data.(map[string]interface{})
	if r2Map["enabled"] != false || r2Map["method"] != "GET" || int(r2Map["status_code"].(float64)) != 200 {
		t.Fatalf("unexpected disabled route defaults: %+v", r2Map)
	}

	// Verify MockServerService.GetStatus reads identical schema
	fs := storage.NewFileSystem()
	mockSvc := service.NewMockServerService(fs, slog.Default())
	svcStatusRes := mockSvc.GetStatus(filepath.Join(dataDir, "collections", "default"))
	if !svcStatusRes.Success {
		t.Fatalf("MockServerService.GetStatus failed: %+v", svcStatusRes)
	}
	svcStatus := svcStatusRes.Data.(model.MockServerStatus)
	if svcStatus.Port != portCfg || len(svcStatus.Routes) != 2 {
		t.Fatalf("MockServerService.GetStatus mismatch: %+v", svcStatus)
	}
	r0 := svcStatus.Routes[0]
	if r0.ID != r1ID || r0.Method != "ANY" || r0.Path != "/api/users/:id" ||
		r0.StatusCode != 201 || r0.DelayMs != 15 || !r0.Enabled ||
		r0.Body != `{"id":42,"from_file":true}` || r0.Description != "Initial desc" ||
		len(r0.Headers) != 1 || r0.Headers[0].Key != "X-Mock" || r0.Headers[0].Value != "v1" || !r0.Headers[0].Enabled {
		t.Fatalf("MockServerService.GetStatus route[0] schema mismatch: %+v", r0)
	}

	// 6. Route list & get by ID or "METHOD /path" (with flexible flag position & aliases)
	code, rCreateBool, _ := execCLIJSON(t, dataDir,
		"mocks", "routes", "add",
		"--path", "/api/bool-last",
		"--enabled",
	)
	if code != 0 || !rCreateBool.Success || rCreateBool.Data.(map[string]interface{})["enabled"] != true {
		t.Fatalf("mock route create with trailing --enabled before --json failed: code=%d res=%+v", code, rCreateBool)
	}
	rBoolID := rCreateBool.Data.(map[string]interface{})["id"].(string)

	code, rList, _ := execCLIJSON(t, dataDir, "mocks", "routes", "ls")
	if code != 0 || !rList.Success || len(rList.Data.([]interface{})) != 3 {
		t.Fatalf("expected 3 routes in list via aliases, got %+v", rList)
	}
	code, rGetBySel, _ := execCLIJSON(t, dataDir, "mock", "route", "show", "any /api/users/:id/")
	if code != 0 || !rGetBySel.Success || rGetBySel.Data.(map[string]interface{})["id"] != r1ID {
		t.Fatalf("route get by 'METHOD /path' failed: %+v", rGetBySel)
	}

	// 7. Route update Read-Merge-Write (FlagSet.Visit, "" clears field, flexible flag order)
	code, rUpd1, _ := execCLIJSON(t, dataDir,
		"mock", "route", "update", "ANY /api/users/:id",
		"--status-code", "202",
		"--set-header", "X-Mock: v2",
		"--set-header", "X-Extra: yes",
	)
	if code != 0 || !rUpd1.Success {
		t.Fatalf("mock route update 1 failed: %+v", rUpd1)
	}
	u1Map := rUpd1.Data.(map[string]interface{})
	if int(u1Map["status_code"].(float64)) != 202 ||
		u1Map["body"] != `{"id":42,"from_file":true}` ||
		u1Map["description"] != "Initial desc" ||
		u1Map["enabled"] != true ||
		len(u1Map["headers"].([]interface{})) != 2 {
		t.Fatalf("Read-Merge-Write failed on route update 1: %+v", u1Map)
	}

	// Test update with --method, uncleaned --path, --delay, --status alias overriding --status-code, --desc, --body @file, header dedupe + case-insensitive unset
	updBodyFile := filepath.Join(t.TempDir(), "upd-body.json")
	if err := os.WriteFile(updBodyFile, []byte(`{"patched":true}`), 0644); err != nil {
		t.Fatal(err)
	}
	code, rUpdAlias, _ := execCLIJSON(t, dataDir,
		"mock", "route", "patch", rBoolID,
		"--method", "put",
		"--path", "api/patched/",
		"--status-code", "201",
		"--status", "204",
		"--delay", "25",
		"--desc", "Patched via alias",
		"--body", "@"+updBodyFile,
		"--set-header", " X-Dup : one ",
		"--set-header", "x-dup: two",
	)
	if code != 0 || !rUpdAlias.Success {
		t.Fatalf("mock route patch alias update failed: %+v", rUpdAlias)
	}
	uaMap := rUpdAlias.Data.(map[string]interface{})
	if uaMap["method"] != "PUT" || uaMap["path"] != "/api/patched" ||
		int(uaMap["status_code"].(float64)) != 204 ||
		int(uaMap["delay_ms"].(float64)) != 25 ||
		uaMap["description"] != "Patched via alias" ||
		uaMap["body"] != `{"patched":true}` ||
		len(uaMap["headers"].([]interface{})) != 1 {
		t.Fatalf("unexpected route patch alias fields: %+v", uaMap)
	}
	code, rUpdUnset, _ := execCLIJSON(t, dataDir, "mock", "route", "update", rBoolID, "--unset-header", "X-DUP")
	if code != 0 || !rUpdUnset.Success || len(rUpdUnset.Data.(map[string]interface{})["headers"].([]interface{})) != 0 {
		t.Fatalf("expected case-insensitive header unset to clear X-Dup, got %+v", rUpdUnset)
	}
	code, rDelAlias, _ := execCLIJSON(t, dataDir, "mock", "route", "rm", rBoolID)
	if code != 0 || !rDelAlias.Success {
		t.Fatalf("mock route rm alias failed: %+v", rDelAlias)
	}

	// Clear body & description with "", unset header, disable then re-enable
	code, rUpd2, _ := execCLIJSON(t, dataDir,
		"mock", "route", "update", r1ID,
		"--body", "",
		"--description", "",
		"--unset-header", "X-Extra",
		"--disabled",
	)
	if code != 0 || !rUpd2.Success {
		t.Fatalf("mock route update 2 failed: %+v", rUpd2)
	}
	u2Map := rUpd2.Data.(map[string]interface{})
	if u2Map["body"] != "" || u2Map["enabled"] != false || len(u2Map["headers"].([]interface{})) != 1 {
		t.Fatalf("expected body cleared, disabled, and 1 header left; got %+v", u2Map)
	}
	if descVal, exists := u2Map["description"]; exists && descVal != "" {
		t.Fatalf("expected description cleared, got %v", descVal)
	}

	// Re-enable with flag placed BEFORE positional selector AND trailing --enabled before --json
	code, rUpd3, _ := execCLIJSON(t, dataDir, "mock", "route", "update", "--enabled", r1ID)
	if code != 0 || !rUpd3.Success || rUpd3.Data.(map[string]interface{})["enabled"] != true {
		t.Fatalf("expected --enabled before selector to re-enable route, got code=%d res=%+v", code, rUpd3)
	}
	code, rUpd4, _ := execCLIJSON(t, dataDir, "mock", "route", "update", r1ID, "--enabled")
	if code != 0 || !rUpd4.Success || rUpd4.Data.(map[string]interface{})["enabled"] != true {
		t.Fatalf("expected trailing --enabled before --json to succeed, got code=%d res=%+v", code, rUpd4)
	}

	// 8. Validation & NOT_FOUND error cases + duplicate selector VALIDATION with IDs
	errCases := []struct {
		args []string
		code string
	}{
		{[]string{"mock", "start", "--port", "0"}, model.ErrValidation},
		{[]string{"mock", "start", "--port", "1023"}, model.ErrValidation},
		{[]string{"mock", "status", "unexpected-pos"}, model.ErrValidation},
		{[]string{"mock", "config", "unexpected-pos"}, model.ErrValidation},
		{[]string{"mock", "start", "unexpected-pos"}, model.ErrValidation},
		{[]string{"mock", "stop", "unexpected-pos"}, model.ErrValidation},
		{[]string{"mock", "route", "list", "unexpected-pos"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "unexpected-pos"}, model.ErrValidation},
		{[]string{"mock", "route", "get", r1ID, "extra-pos"}, model.ErrValidation},
		{[]string{"mock", "route", "update", r1ID, "extra-pos", "--desc", "x"}, model.ErrValidation},
		{[]string{"mock", "route", "delete", r1ID, "extra-pos"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--method", "BAD"}, model.ErrValidation}, // missing --path
		{[]string{"mock", "route", "create", "--path", "/x", "--method", "BREW"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "--status-code", "99"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "--status-code", "600"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "--delay-ms", "-1"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "--delay-ms", "30001"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "--enabled", "--disabled"}, model.ErrValidation},
		{[]string{"mock", "route", "create", "--path", "/x", "--body", "@/nonexistent/file.json"}, model.ErrNotFound},
		{[]string{"mock", "route", "get", "GET /does-not-exist"}, model.ErrNotFound},
		{[]string{"mock", "route", "delete", "GET /does-not-exist"}, model.ErrNotFound},
		{[]string{"mock", "route", "update", r1ID}, model.ErrValidation}, // no update flags
		{[]string{"mock", "route", "update", r1ID, "--method", ""}, model.ErrValidation},
		{[]string{"mock", "route", "update", r1ID, "--path", ""}, model.ErrValidation},
		{[]string{"mock", "route", "update", r1ID, "--unset-header", ""}, model.ErrValidation},
		{[]string{"mock", "status", "-c", "no-such-collection"}, model.ErrNotFound},
	}
	for _, tc := range errCases {
		ec, res, _ := execCLIJSON(t, dataDir, tc.args...)
		if ec == 0 || res.Success || res.Error == nil || res.Error.Code != tc.code {
			t.Fatalf("args %v: expected error code %s, got code=%d res=%+v", tc.args, tc.code, ec, res)
		}
	}

	// Out-of-range port persisted in mock-server.json -> mock start --daemon without --port fails VALIDATION
	badCfgPath := filepath.Join(dataDir, "collections", "default", "mock-server.json")
	if err := os.WriteFile(badCfgPath, []byte(`{"port":80,"routes":[]}`), 0644); err != nil {
		t.Fatal(err)
	}
	codeBadDiskPort, resBadDiskPort, _ := execCLIJSON(t, dataDir, "mock", "start", "--daemon")
	if codeBadDiskPort == 0 || resBadDiskPort.Error == nil || resBadDiskPort.Error.Code != model.ErrValidation {
		t.Fatalf("expected VALIDATION for invalid port in mock-server.json, got code=%d res=%+v", codeBadDiskPort, resBadDiskPort)
	}
	_, _, _ = execCLIJSON(t, dataDir, "mock", "config", "--port", strconv.Itoa(portCfg))

	// Duplicate selector check -> VALIDATION listing both IDs
	_, dupA, _ := execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/dup")
	_, dupB, _ := execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/dup/")
	dupAID := dupA.Data.(map[string]interface{})["id"].(string)
	dupBID := dupB.Data.(map[string]interface{})["id"].(string)

	cDup, resDup, _ := execCLIJSON(t, dataDir, "mock", "route", "get", "GET /dup")
	if cDup == 0 || resDup.Success || resDup.Error == nil || resDup.Error.Code != model.ErrValidation {
		t.Fatalf("expected VALIDATION for ambiguous route selector, got code=%d res=%+v", cDup, resDup)
	}
	if !strings.Contains(resDup.Error.Message, dupAID) || !strings.Contains(resDup.Error.Message, dupBID) {
		t.Fatalf("expected ambiguous error message to contain both IDs %s and %s, got: %s", dupAID, dupBID, resDup.Error.Message)
	}

	// 9. Route delete
	code, delRes, _ := execCLIJSON(t, dataDir, "mock", "route", "delete", dupAID)
	if code != 0 || !delRes.Success || delRes.Data.(map[string]interface{})["deleted_id"] != dupAID {
		t.Fatalf("mock route delete failed: %+v", delRes)
	}
	code, getAfterDel, _ := execCLIJSON(t, dataDir, "mock", "route", "get", dupAID)
	if code == 0 || getAfterDel.Error == nil || getAfterDel.Error.Code != model.ErrNotFound {
		t.Fatalf("expected NOT_FOUND after deleting route, got %+v", getAfterDel)
	}
}

func TestMockCLI_Daemon_SingleInstance_HotReload_HTTP_Foreground_And_Stop(t *testing.T) {
	dataDir := t.TempDir()
	t.Cleanup(func() {
		_, _, _ = execCLIJSON(t, dataDir, "mock", "stop")
	})

	// 1. Setup routes in default collection and create second collection CollB
	_, crRoute1, _ := execCLIJSON(t, dataDir,
		"mock", "route", "create",
		"--method", "GET",
		"--path", "/api/users/:id",
		"--status-code", "200",
		"--header", "X-Mock-Hdr: user-ok",
		"--body", `{"id":42,"role":"user"}`,
	)
	if !crRoute1.Success {
		t.Fatalf("create user route failed: %+v", crRoute1)
	}
	_, crRouteAny, _ := execCLIJSON(t, dataDir,
		"mock", "route", "create",
		"--method", "ANY",
		"--path", "/api/any",
		"--status-code", "200",
		"--body", `{"any":true}`,
	)
	if !crRouteAny.Success {
		t.Fatalf("create ANY route failed: %+v", crRouteAny)
	}
	_, crCollB, _ := execCLIJSON(t, dataDir, "collection", "create", "--name", "CollB")
	if !crCollB.Success {
		t.Fatalf("create CollB failed: %+v", crCollB)
	}

	// 2. Configure port and start daemon WITHOUT --port (and with --daemon directly before --json)
	port1 := findFreeMockPort(t)
	_, cfg1, _ := execCLIJSON(t, dataDir, "mock", "config", "--port", strconv.Itoa(port1))
	if !cfg1.Success {
		t.Fatalf("mock config --port failed: %+v", cfg1)
	}
	code, start1, rawStart1 := execCLIJSON(t, dataDir, "mock", "start", "--daemon")
	if code != 0 || !start1.Success {
		t.Fatalf("mock start --daemon failed: code=%d res=%+v raw=%s", code, start1, rawStart1)
	}
	s1Map := start1.Data.(map[string]interface{})
	pid1 := int(s1Map["pid"].(float64))
	baseURL1 := s1Map["base_url"].(string)
	if s1Map["running"] != true || pid1 <= 0 || int(s1Map["port"].(float64)) != port1 || baseURL1 != fmt.Sprintf("http://127.0.0.1:%d", port1) {
		t.Fatalf("unexpected start --daemon output: %+v", s1Map)
	}

	// Verify active collection `mock status` returns running: true, pid, port, base_url, started_at, no active_daemon
	code, stActive, _ := execCLIJSON(t, dataDir, "mock", "status")
	if code != 0 || !stActive.Success {
		t.Fatalf("active mock status failed: %+v", stActive)
	}
	stActiveMap := stActive.Data.(map[string]interface{})
	if stActiveMap["running"] != true ||
		int(stActiveMap["pid"].(float64)) != pid1 ||
		int(stActiveMap["port"].(float64)) != port1 ||
		stActiveMap["base_url"] != baseURL1 ||
		strings.TrimSpace(fmt.Sprint(stActiveMap["started_at"])) == "" {
		t.Fatalf("unexpected active mock status: %+v", stActiveMap)
	}
	if _, hasActiveDaemon := stActiveMap["active_daemon"]; hasActiveDaemon {
		t.Fatalf("expected no active_daemon on active collection status, got %+v", stActiveMap["active_daemon"])
	}

	// Changing configured port while daemon runs exposes configured_port while preserving live port
	newCfgPort := findFreeMockPort(t)
	code, cfgWhileRunning, _ := execCLIJSON(t, dataDir, "mock", "config", "--port", strconv.Itoa(newCfgPort))
	if code != 0 || !cfgWhileRunning.Success {
		t.Fatalf("mock config while daemon running failed: %+v", cfgWhileRunning)
	}
	cfgRunMap := cfgWhileRunning.Data.(map[string]interface{})
	if int(cfgRunMap["port"].(float64)) != port1 || int(cfgRunMap["configured_port"].(float64)) != newCfgPort {
		t.Fatalf("expected port=%d and configured_port=%d while running, got %+v", port1, newCfgPort, cfgRunMap)
	}

	// Verify mock-daemon.json is in <configDir> ONLY, never inside <collection>/
	if _, err := os.Stat(filepath.Join(dataDir, "mock-daemon.json")); err != nil {
		t.Fatalf("expected mock-daemon.json in configDir, err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "collections", "default", "mock-daemon.json")); !os.IsNotExist(err) {
		t.Fatalf("mock-daemon.json must NOT be inside collection directory")
	}

	// 3. Test HTTP responses: :id param, ANY method, *, /, delay_ms, disabled=404, CORS, and 404 MOCK_ROUTE_NOT_FOUND
	_, _, _ = execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/", "--body", `{"root":true}`)
	_, _, _ = execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/files/*", "--body", `{"wildcard":true}`)
	_, _, _ = execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/api/disabled-rt", "--disabled", "--body", `{"off":true}`)
	_, _, _ = execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/api/slow", "--delay-ms", "80", "--body", `{"slow":true}`)
	// Wait briefly for hot-reload of newly added routes
	waitHTTPStatus(t, baseURL1+"/api/slow", 200)

	respRoot, err := http.Get(baseURL1 + "/")
	if err != nil {
		t.Fatalf("HTTP GET / failed: %v", err)
	}
	bRoot, _ := io.ReadAll(respRoot.Body)
	_ = respRoot.Body.Close()
	if respRoot.StatusCode != 200 || string(bRoot) != `{"root":true}` {
		t.Fatalf("unexpected GET / response: status=%d body=%s", respRoot.StatusCode, string(bRoot))
	}

	respWild, err := http.Get(baseURL1 + "/files/logo.png")
	if err != nil {
		t.Fatalf("HTTP GET /files/logo.png failed: %v", err)
	}
	bWild, _ := io.ReadAll(respWild.Body)
	_ = respWild.Body.Close()
	if respWild.StatusCode != 200 || string(bWild) != `{"wildcard":true}` {
		t.Fatalf("unexpected GET /files/* response: status=%d body=%s", respWild.StatusCode, string(bWild))
	}

	respDis, err := http.Get(baseURL1 + "/api/disabled-rt")
	if err != nil {
		t.Fatalf("HTTP GET /api/disabled-rt failed: %v", err)
	}
	bDis, _ := io.ReadAll(respDis.Body)
	_ = respDis.Body.Close()
	if respDis.StatusCode != 404 || !strings.Contains(string(bDis), "MOCK_ROUTE_NOT_FOUND") {
		t.Fatalf("expected 404 for disabled route, got status=%d body=%s", respDis.StatusCode, string(bDis))
	}

	delayStart := time.Now()
	respSlow, err := http.Get(baseURL1 + "/api/slow")
	delayElapsed := time.Since(delayStart)
	if err != nil {
		t.Fatalf("HTTP GET /api/slow failed: %v", err)
	}
	_ = respSlow.Body.Close()
	if respSlow.StatusCode != 200 || delayElapsed < 65*time.Millisecond {
		t.Fatalf("expected delay_ms=80 to sleep >=65ms and return 200, got status=%d elapsed=%v", respSlow.StatusCode, delayElapsed)
	}
	resp1, err := http.Get(baseURL1 + "/api/users/42")
	if err != nil {
		t.Fatalf("HTTP GET :id failed: %v", err)
	}
	b1, _ := io.ReadAll(resp1.Body)
	_ = resp1.Body.Close()
	if resp1.StatusCode != 200 || resp1.Header.Get("X-Mock-Hdr") != "user-ok" ||
		resp1.Header.Get("Access-Control-Allow-Origin") != "*" ||
		string(b1) != `{"id":42,"role":"user"}` {
		t.Fatalf("unexpected HTTP GET :id response: status=%d hdr=%v body=%s", resp1.StatusCode, resp1.Header, string(b1))
	}

	reqAny, _ := http.NewRequest(http.MethodPatch, baseURL1+"/api/any", nil)
	respAny, err := http.DefaultClient.Do(reqAny)
	if err != nil {
		t.Fatalf("HTTP PATCH /api/any failed: %v", err)
	}
	bAny, _ := io.ReadAll(respAny.Body)
	_ = respAny.Body.Close()
	if respAny.StatusCode != 200 || string(bAny) != `{"any":true}` {
		t.Fatalf("unexpected ANY route response: status=%d body=%s", respAny.StatusCode, string(bAny))
	}

	resp404, err := http.Get(baseURL1 + "/api/unknown")
	if err != nil {
		t.Fatalf("HTTP GET /api/unknown failed: %v", err)
	}
	b404, _ := io.ReadAll(resp404.Body)
	_ = resp404.Body.Close()
	if resp404.StatusCode != 404 || !strings.Contains(string(b404), "MOCK_ROUTE_NOT_FOUND") {
		t.Fatalf("expected 404 MOCK_ROUTE_NOT_FOUND, got status=%d body=%s", resp404.StatusCode, string(b404))
	}

	reqOpt, _ := http.NewRequest(http.MethodOptions, baseURL1+"/api/unknown", nil)
	respOpt, err := http.DefaultClient.Do(reqOpt)
	if err != nil {
		t.Fatalf("HTTP OPTIONS failed: %v", err)
	}
	_ = respOpt.Body.Close()
	if respOpt.StatusCode != 204 || respOpt.Header.Get("Access-Control-Allow-Origin") != "*" {
		t.Fatalf("expected 204 CORS preflight response, got status=%d hdr=%v", respOpt.StatusCode, respOpt.Header)
	}

	// 4. Hot-reload: add and update a route while daemon is running and verify HTTP serves updates without restart
	code, hotCreate, _ := execCLIJSON(t, dataDir, "mock", "route", "create", "--method", "GET", "--path", "/api/hot", "--status-code", "202", "--body", `{"hot":true}`)
	if code != 0 || !hotCreate.Success {
		t.Fatalf("hot route create failed: %+v", hotCreate)
	}
	hotOK := false
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		rHot, err := http.Get(baseURL1 + "/api/hot")
		if err == nil {
			bh, _ := io.ReadAll(rHot.Body)
			_ = rHot.Body.Close()
			if rHot.StatusCode == 202 && string(bh) == `{"hot":true}` {
				hotOK = true
				break
			}
		}
		time.Sleep(30 * time.Millisecond)
	}
	if !hotOK {
		t.Fatalf("hot-reload did not pick up new /api/hot route within 3s")
	}

	code, hotUpd, _ := execCLIJSON(t, dataDir, "mock", "route", "update", "GET /api/hot", "--status-code", "203", "--body", `{"hot":"updated"}`)
	if code != 0 || !hotUpd.Success {
		t.Fatalf("hot route update failed: %+v", hotUpd)
	}
	hotUpdOK := false
	deadlineUpd := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadlineUpd) {
		rHot2, err := http.Get(baseURL1 + "/api/hot")
		if err == nil {
			bh2, _ := io.ReadAll(rHot2.Body)
			_ = rHot2.Body.Close()
			if rHot2.StatusCode == 203 && string(bh2) == `{"hot":"updated"}` {
				hotUpdOK = true
				break
			}
		}
		time.Sleep(30 * time.Millisecond)
	}
	if !hotUpdOK {
		t.Fatalf("hot-reload did not pick up updated /api/hot route within 3s")
	}

	// Delete /api/hot while daemon runs -> hot-reload stops serving it (404)
	code, hotDel, _ := execCLIJSON(t, dataDir, "mock", "route", "delete", "GET /api/hot")
	if code != 0 || !hotDel.Success {
		t.Fatalf("hot route delete failed: %+v", hotDel)
	}
	waitHTTPStatus(t, baseURL1+"/api/hot", 404)

	// 5. Cross-collection status: status -c CollB must report running: false + active_daemon metadata
	code, stCollB, _ := execCLIJSON(t, dataDir, "-c", "CollB", "mock", "status")
	if code != 0 || !stCollB.Success {
		t.Fatalf("status -c CollB failed: %+v", stCollB)
	}
	stCollBMap := stCollB.Data.(map[string]interface{})
	if stCollBMap["running"] != false || int(stCollBMap["port"].(float64)) != 4010 {
		t.Fatalf("expected running=false, port=4010 for CollB, got %+v", stCollBMap)
	}
	activeDaemon, ok := stCollBMap["active_daemon"].(map[string]interface{})
	if !ok || int(activeDaemon["pid"].(float64)) != pid1 || activeDaemon["collection_id"] != "default" {
		t.Fatalf("expected active_daemon metadata pointing to default pid %d, got %+v", pid1, stCollBMap)
	}

	// 6. Single Active Instance: `mock serve --daemon -c CollB` must stop old daemon on default first
	port2 := findFreeMockPort(t)
	code, start2, _ := execCLIJSON(t, dataDir, "-c", "CollB", "mock", "serve", "--daemon", "--port", strconv.Itoa(port2))
	if code != 0 || !start2.Success {
		t.Fatalf("mock serve --daemon -c CollB failed: %+v", start2)
	}
	s2Map := start2.Data.(map[string]interface{})
	pid2 := int(s2Map["pid"].(float64))
	if pid2 <= 0 || pid2 == pid1 || int(s2Map["port"].(float64)) != port2 {
		t.Fatalf("unexpected CollB daemon status: %+v", s2Map)
	}
	if isProcessAlive(pid1) {
		t.Fatalf("expected old daemon pid %d to be stopped when new daemon started", pid1)
	}
	code, stDefaultAfter, _ := execCLIJSON(t, dataDir, "mock", "status")
	if code != 0 || stDefaultAfter.Data.(map[string]interface{})["running"] != false {
		t.Fatalf("expected default collection status running=false after CollB took over, got %+v", stDefaultAfter)
	}

	// 7. Foreground mode via subprocess (`mock start --port <port3> --json`), stops CollB daemon, flushes 1 JSON line, handles SIGTERM
	port3 := findFreeMockPort(t)
	fgCmd := exec.Command(os.Args[0], "--data-dir", dataDir, "mock", "start", "--port", strconv.Itoa(port3), "--json")
	fgEnv := append(os.Environ(), mockInternalDaemonEnv+"=1")
	fgCmd.Env = fgEnv
	fgStdout, err := fgCmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := fgCmd.Start(); err != nil {
		t.Fatalf("failed starting foreground mock subprocess: %v", err)
	}
	fgWaitDone := make(chan error, 1)
	go func() {
		fgWaitDone <- fgCmd.Wait()
	}()

	lineCh := make(chan string, 1)
	go func() {
		reader := bufio.NewReader(fgStdout)
		line, _ := reader.ReadString('\n')
		lineCh <- line
	}()

	var fgLine string
	select {
	case fgLine = <-lineCh:
	case <-time.After(5 * time.Second):
		_ = fgCmd.Process.Kill()
		t.Fatal("timed out waiting for 1-line JSON banner from foreground mock start")
	}

	var fgRes model.Result
	if err := json.Unmarshal([]byte(strings.TrimSpace(fgLine)), &fgRes); err != nil || !fgRes.Success {
		_ = fgCmd.Process.Kill()
		t.Fatalf("expected valid 1-line JSON from foreground mock start, got %q (err=%v)", fgLine, err)
	}
	if isProcessAlive(pid2) {
		_ = fgCmd.Process.Kill()
		t.Fatalf("expected foreground start to stop old CollB daemon pid %d", pid2)
	}

	respFG, err := http.Get(fmt.Sprintf("http://127.0.0.1:%d/api/users/42", port3))
	if err != nil {
		_ = fgCmd.Process.Kill()
		t.Fatalf("HTTP GET to foreground mock failed: %v", err)
	}
	_ = respFG.Body.Close()
	if respFG.StatusCode != 200 {
		_ = fgCmd.Process.Kill()
		t.Fatalf("expected 200 from foreground mock, got %d", respFG.StatusCode)
	}

	if err := fgCmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatalf("failed sending SIGTERM to foreground mock: %v", err)
	}
	select {
	case wErr := <-fgWaitDone:
		if wErr != nil {
			t.Fatalf("expected foreground mock to exit cleanly on SIGTERM, got: %v", wErr)
		}
	case <-time.After(5 * time.Second):
		_ = fgCmd.Process.Kill()
		t.Fatal("timed out waiting for foreground mock exit after SIGTERM")
	}
	if _, err := os.Stat(filepath.Join(dataDir, "mock-daemon.json")); !os.IsNotExist(err) {
		t.Fatalf("expected mock-daemon.json removed on foreground SIGTERM, stat err=%v", err)
	}

	// 8. Busy port held by external listener -> IO_ERROR (must NOT switch port)
	busyLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer busyLn.Close()
	busyPort := busyLn.Addr().(*net.TCPAddr).Port

	codeBusy, resBusy, _ := execCLIJSON(t, dataDir, "mock", "start", "--daemon", "--port", strconv.Itoa(busyPort))
	if codeBusy == 0 || resBusy.Success || resBusy.Error == nil || resBusy.Error.Code != model.ErrIO {
		t.Fatalf("expected IO_ERROR when port %d is busy, got code=%d res=%+v", busyPort, codeBusy, resBusy)
	}

	// 9. Start again with -p alias and verify `mock stop` cleans up process and mock-daemon.json
	port4 := findFreeMockPort(t)
	code, start4, _ := execCLIJSON(t, dataDir, "mock", "start", "--daemon", "-p", strconv.Itoa(port4))
	if code != 0 || !start4.Success {
		t.Fatalf("mock start 4 failed: %+v", start4)
	}
	pid4 := int(start4.Data.(map[string]interface{})["pid"].(float64))
	baseURL4 := start4.Data.(map[string]interface{})["base_url"].(string)

	code, stopRes, _ := execCLIJSON(t, dataDir, "mock", "stop")
	if code != 0 || !stopRes.Success {
		t.Fatalf("mock stop failed: %+v", stopRes)
	}
	stopMap := stopRes.Data.(map[string]interface{})
	if stopMap["running"] != false || stopMap["stopped"] != true {
		t.Fatalf("unexpected mock stop output: %+v", stopMap)
	}
	if isProcessAlive(pid4) {
		t.Fatalf("expected daemon pid %d to be terminated after mock stop", pid4)
	}
	if _, err := os.Stat(filepath.Join(dataDir, "mock-daemon.json")); !os.IsNotExist(err) {
		t.Fatalf("expected mock-daemon.json removed after mock stop, stat err=%v", err)
	}
	if _, err := http.Get(baseURL4 + "/api/users/42"); err == nil {
		t.Fatalf("expected HTTP connection failure after mock stop")
	}

	// Idempotent stop when already stopped -> stopped: false
	code, stopAgain, _ := execCLIJSON(t, dataDir, "mock", "stop")
	if code != 0 || !stopAgain.Success || stopAgain.Data.(map[string]interface{})["stopped"] != false {
		t.Fatalf("expected stopped=false on repeated mock stop, got code=%d res=%+v", code, stopAgain)
	}
}

func waitHTTPStatus(t *testing.T, url string, wantStatus int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		resp, err := http.Get(url)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode == wantStatus {
				return
			}
		}
		time.Sleep(30 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for %s to return HTTP %d", url, wantStatus)
}

func TestMockCLI_RelativeDataDir_RecycledPID_NonJSONBanner_And_HandshakeError(t *testing.T) {
	// 1. Relative --data-dir works across different CWD
	baseDir := t.TempDir()
	relDataDir := filepath.Join(baseDir, "rel-data")
	otherCwd := filepath.Join(baseDir, "other-cwd")
	if err := os.MkdirAll(otherCwd, 0755); err != nil {
		t.Fatal(err)
	}
	t.Chdir(baseDir)
	t.Cleanup(func() {
		_, _, _ = execCLIJSON(t, relDataDir, "mock", "stop")
	})

	portRel := findFreeMockPort(t)
	code, relStart, _ := execCLIJSON(t, "./rel-data", "mock", "start", "--daemon", "--port", strconv.Itoa(portRel))
	if code != 0 || !relStart.Success {
		t.Fatalf("relative --data-dir start failed: %+v", relStart)
	}
	t.Chdir(otherCwd)
	code, relStatus, _ := execCLIJSON(t, "../rel-data", "mock", "status")
	if code != 0 || !relStatus.Success || relStatus.Data.(map[string]interface{})["running"] != true {
		t.Fatalf("expected running=true from another CWD with relative --data-dir, got code=%d res=%+v", code, relStatus)
	}
	_, _, _ = execCLIJSON(t, relDataDir, "mock", "stop")

	// 2. Recycled/live non-listening PID in mock-daemon.json is treated as stale and cleaned up without killing it
	liveCmd := exec.Command("sleep", "5")
	if err := liveCmd.Start(); err != nil {
		t.Fatalf("failed starting live helper process: %v", err)
	}
	defer func() {
		if liveCmd.Process != nil {
			_ = liveCmd.Process.Kill()
			_ = liveCmd.Wait()
		}
	}()
	deadPort := findFreeMockPort(t)
	daemonPath := filepath.Join(relDataDir, "mock-daemon.json")
	recycledPayload := fmt.Sprintf(`{"pid":%d,"port":%d,"base_url":"http://127.0.0.1:%d","collection_id":"default","coll_root":%q}`,
		liveCmd.Process.Pid, deadPort, deadPort, filepath.Join(relDataDir, "collections", "default"))
	if err := os.WriteFile(daemonPath, []byte(recycledPayload), 0644); err != nil {
		t.Fatal(err)
	}
	code, stRecycled, _ := execCLIJSON(t, relDataDir, "mock", "status")
	if code != 0 || !stRecycled.Success || stRecycled.Data.(map[string]interface{})["running"] != false {
		t.Fatalf("expected running=false for recycled PID on closed port, got code=%d res=%+v", code, stRecycled)
	}
	if _, err := os.Stat(daemonPath); !os.IsNotExist(err) {
		t.Fatalf("expected stale recycled-PID mock-daemon.json removed, stat err=%v", err)
	}
	if !isProcessAlive(liveCmd.Process.Pid) {
		t.Fatalf("status must NOT kill unrelated live process %d", liveCmd.Process.Pid)
	}

	// 3. Non-JSON foreground banner & graceful SIGTERM exit
	portBanner := findFreeMockPort(t)
	fgCmd := exec.Command(os.Args[0], "--data-dir", relDataDir, "mock", "start", "--port", strconv.Itoa(portBanner))
	fgCmd.Env = append(os.Environ(), mockInternalDaemonEnv+"=1")
	fgStdout, err := fgCmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := fgCmd.Start(); err != nil {
		t.Fatal(err)
	}
	bannerDone := make(chan string, 1)
	go func() {
		r := bufio.NewReader(fgStdout)
		line, _ := r.ReadString('\n')
		bannerDone <- line
	}()
	var banner string
	select {
	case banner = <-bannerDone:
	case <-time.After(5 * time.Second):
		_ = fgCmd.Process.Kill()
		_ = fgCmd.Wait()
		t.Fatal("timed out waiting for non-JSON foreground banner")
	}
	if !strings.Contains(banner, "Mock server listening at") || !strings.Contains(banner, strconv.Itoa(portBanner)) {
		_ = fgCmd.Process.Kill()
		_ = fgCmd.Wait()
		t.Fatalf("unexpected non-JSON foreground banner: %q", banner)
	}
	if err := fgCmd.Process.Signal(syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	if err := fgCmd.Wait(); err != nil {
		t.Fatalf("expected clean exit on SIGTERM, got: %v", err)
	}

	// 4. writeDaemonHandshakeError propagates early runCLI errors over FD 3
	rPipe, wPipe, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	errCmd := exec.Command(os.Args[0], "--data-dir", relDataDir, "-c", "missing-collection-for-hs", "mock", "start")
	errCmd.ExtraFiles = []*os.File{wPipe}
	errCmd.Env = append(os.Environ(), mockInternalDaemonEnv+"=1", mockDaemonHandshakeFDEnv+"=3")
	if err := errCmd.Start(); err != nil {
		_ = rPipe.Close()
		_ = wPipe.Close()
		t.Fatal(err)
	}
	_ = wPipe.Close()
	hs, hsErr := readDaemonHandshake(rPipe, 5*time.Second)
	_ = errCmd.Wait()
	if hsErr != nil {
		t.Fatalf("expected structured handshake error, got read err: %v", hsErr)
	}
	if hs.Success || hs.Error == nil || hs.Error.Code != model.ErrNotFound {
		t.Fatalf("expected ErrNotFound via handshake FD 3, got %+v", hs)
	}
}



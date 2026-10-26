package engine

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/storage"
)

func newTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestBtoaAtobLatin1AndUnicodeBasicAuth(t *testing.T) {
	vm, _, err := newHeadlessRuntime()
	if err != nil {
		t.Fatalf("newHeadlessRuntime failed: %v", err)
	}

	// 1. Direct btoa with rune > 0xFF must throw InvalidCharacterError
	_, err = vm.RunString(`btoa("mật khẩu")`)
	if err == nil || !strings.Contains(err.Error(), "InvalidCharacterError") {
		t.Fatalf("expected InvalidCharacterError when passing >0xFF rune to btoa, got: %v", err)
	}

	// 2. unescape(encodeURIComponent(str)) + btoa and TextEncoder + btoa (toBase64) must match standard UTF-8 base64
	rawCreds := "admin:mật khẩu tiếng Việt 123"
	expectedB64 := base64.StdEncoding.EncodeToString([]byte(rawCreds))

	val1, err := vm.RunString(`btoa(unescape(encodeURIComponent("` + rawCreds + `")))`)
	if err != nil {
		t.Fatalf("btoa(unescape(encodeURIComponent(...))) failed: %v", err)
	}
	if val1.String() != expectedB64 {
		t.Errorf("unescape+btoa = %q, want %q", val1.String(), expectedB64)
	}

	val2, err := vm.RunString(`globalThis.HectoEngine.toBase64("` + rawCreds + `")`)
	if err != nil {
		t.Fatalf("HectoEngine.toBase64 failed: %v", err)
	}
	if val2.String() != expectedB64 {
		t.Errorf("toBase64 = %q, want %q", val2.String(), expectedB64)
	}

	// 3. atob roundtrip via TextDecoder (both Uint8Array and ArrayBuffer)
	val3, err := vm.RunString(`
		(function() {
			var bin = atob("` + expectedB64 + `");
			var bytes = new Uint8Array(bin.length);
			for (var i = 0; i < bin.length; i++) {
				bytes[i] = bin.charCodeAt(i);
			}
			var s1 = new TextDecoder().decode(bytes);
			var s2 = new TextDecoder().decode(bytes.buffer);
			return s1 === s2 ? s1 : "mismatch";
		})()
	`)
	if err != nil {
		t.Fatalf("atob + TextDecoder failed: %v", err)
	}
	if val3.String() != rawCreds {
		t.Errorf("decoded = %q, want %q", val3.String(), rawCreds)
	}
}

func TestExecuteRequestFlow_EndToEnd_Scripts_BasicAuthUnicode_JSONC_And_DiskPersistence(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	logger := newTestLogger()
	cfgSvc := service.NewConfigService(fs, logger)
	cfgSvc.SetCustomConfigDir(tmpDir)
	cfg, err := cfgSvc.Initialize(context.Background())
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	collSvc := service.NewCollectionService(fs, logger)
	envSvc := service.NewEnvironmentService(fs, logger)
	reqSvc := service.NewRequestService(fs, logger)

	coll, collRoot, err := collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "default")
	if err != nil {
		t.Fatal(err)
	}

	// Create local test HTTP server
	var receivedAuthHeader string
	var receivedCustomHeader string
	var receivedBody map[string]interface{}
	var receivedQuery string

	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedAuthHeader = r.Header.Get("Authorization")
		receivedCustomHeader = r.Header.Get("X-Pre-Header")
		receivedQuery = r.URL.RawQuery
		bodyBytes, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(bodyBytes, &receivedBody)

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"token":"secret-jwt","status":"ok"}`))
	}))
	defer ts.Close()

	// Create active environment "Staging" and non-active environment "Prod"
	envRes := envSvc.Save(collRoot, model.Environment{
		Name: "Staging",
		Variables: []model.KVPair{
			{Key: "base_url", Value: ts.URL, Enabled: true},
			{Key: "unicode_pass", Value: "mật khẩu tiếng Việt 123", Enabled: true},
		},
	})
	stgEnv := envRes.Data.(model.Environment)
	prodRes := envSvc.Save(collRoot, model.Environment{
		Name:      "Prod",
		Variables: []model.KVPair{},
	})
	prodEnv := prodRes.Data.(model.Environment)

	coll.ActiveEnvID = stgEnv.ID
	collSvc.UpdateCollection(cfg.CollectionsRoot, coll)

	// Create folder "AuthFlow"
	fNode := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(fNode.ID, "AuthFlow")

	// Create request "Login" inside "AuthFlow"
	rNode := collSvc.CreateRequest(collRoot, fNode.ID).Data.(model.TreeNode)
	loginReq := model.Request{
		ID:     rNode.ID,
		Name:   "Login",
		Method: "POST",
		URL:    "{{base_url}}/v1/:tenant/login?from_url=1",
		Headers: []model.KVPair{
			{Key: "X-Req-Header", Value: "{{req_var}}", Enabled: true},
		},
		Params: []model.KVPair{
			{Key: "extra", Value: "{{cli_override}}", Enabled: true},
		},
		PathParams: []model.KVPair{
			{Key: "tenant", Value: "{{tenant_var}}", Enabled: true},
		},
		Body: model.Body{
			Type:    "json",
			Content: "{\n  // JSONC comment should be stripped\n  \"user\": \"admin\",\n  \"org\": \"{{org_name}}\",\n}",
		},
		Auth: &model.AuthConfig{
			Type: "basic",
			Basic: &model.BasicAuth{
				Username: "admin",
				Password: "{{unicode_pass}}",
			},
		},
		Scripts: &model.Scripts{
			PreRequest: `
				console.log("starting pre-request");
				ha.folderVariables.set("org_name", "hecto-org");
				ha.folderEnv.set("tenant_var", "acme-tenant");
				ha.collectionVariables.set("req_var", "from-collection-tier1");
				ha.env("Prod").set("prod_flag", "enabled");
				ha.collectionAuth.setBearer("coll-bearer-token");
				ha.collectionAuth.setBearer("coll-stg-bearer", "Staging");
				ha.folderAuthEnv.setBearer("folder-stg-bearer", "AuthFlow", "Staging");
				ha.request.headers.set("X-Pre-Header", "injected-by-pre");
			`,
			PostResponse: `
				console.log("starting post-response");
				const data = ha.response.json();
				ha.test("HTTP 200", () => {
					if (ha.response.code !== 200) throw new Error("expected 200");
				});
				ha.test("Deliberate failure check", () => {
					throw new Error("expected failure details");
				});
				ha.folderVariables.set("token", data.token);
				ha.variables.set("active_env_saved", "yes");
			`,
		},
	}
	if saveRes := reqSvc.Save(loginReq); !saveRes.Success {
		t.Fatalf("Save request failed: %v", saveRes.Error)
	}

	resolvedReq, pathFolders, allFolders, err := collSvc.ResolveRequestSelector(collRoot, "AuthFlow/Login")
	if err != nil {
		t.Fatalf("ResolveRequestSelector failed: %v", err)
	}

	out, err := ExecuteRequestFlow(RunOptions{
		FS:              fs,
		CollectionSvc:   collSvc,
		EnvSvc:          envSvc,
		RequestSvc:      reqSvc,
		CollectionsRoot: cfg.CollectionsRoot,
		CollectionRoot:  collRoot,
		Collection:      coll,
		Request:         resolvedReq,
		PathFolders:     pathFolders,
		AllFolders:      allFolders,
		ActiveEnvID:     stgEnv.ID,
		CLIVarOverrides: map[string]string{"cli_override": "cli-val"},
	})
	if err != nil {
		t.Fatalf("ExecuteRequestFlow failed: %v", err)
	}

	if out.StatusCode != 200 {
		t.Errorf("StatusCode = %d, want 200", out.StatusCode)
	}
	expectedBasic := "Basic " + base64.StdEncoding.EncodeToString([]byte("admin:mật khẩu tiếng Việt 123"))
	if receivedAuthHeader != expectedBasic {
		t.Errorf("receivedAuthHeader = %q, want %q", receivedAuthHeader, expectedBasic)
	}
	if receivedCustomHeader != "injected-by-pre" {
		t.Errorf("receivedCustomHeader = %q, want 'injected-by-pre'", receivedCustomHeader)
	}
	if receivedQuery != "from_url=1&extra=cli-val" {
		t.Errorf("receivedQuery = %q, want 'from_url=1&extra=cli-val'", receivedQuery)
	}
	if receivedBody["org"] != "hecto-org" || receivedBody["user"] != "admin" {
		t.Errorf("unexpected receivedBody: %+v", receivedBody)
	}
	if len(out.ScriptTests) != 2 || !out.ScriptTests[0].Passed || out.ScriptTests[1].Passed || !strings.Contains(out.ScriptTests[1].Error, "expected failure details") {
		t.Errorf("expected 1 passing and 1 failing script test, got: %+v", out.ScriptTests)
	}
	if len(out.ConsoleLogs) != 2 {
		t.Errorf("expected 2 console logs, got: %+v", out.ConsoleLogs)
	}
	if out.EnvUpdates["active_env_saved"] != "yes" {
		t.Errorf("expected out.EnvUpdates[active_env_saved]='yes', got: %+v", out.EnvUpdates)
	}
	if out.ScopedEnvUpdates == nil || out.ScopedEnvUpdates.Collection["req_var"] != "from-collection-tier1" {
		t.Errorf("expected out.ScopedEnvUpdates.Collection[req_var]='from-collection-tier1', got: %+v", out.ScopedEnvUpdates)
	}
	if out.ScopedAuthUpdates == nil || out.ScopedAuthUpdates.CollectionGlobal == nil || out.ScopedAuthUpdates.CollectionGlobal.Bearer == nil || out.ScopedAuthUpdates.CollectionGlobal.Bearer.Token != "coll-bearer-token" {
		t.Errorf("expected out.ScopedAuthUpdates.CollectionGlobal bearer token, got: %+v", out.ScopedAuthUpdates)
	}

	// Verify persistence on disk:
	// 1. AuthFlow/_folder.json has token = "secret-jwt", org_name = "hecto-org", folder_envs[stgEnv.ID], and auth_envs[stgEnv.ID]
	loadedFolder := collSvc.LoadFolder(fNode.ID).Data.(model.Folder)
	foundToken := false
	for _, kv := range loadedFolder.Variables {
		if kv.Key == "token" && kv.Value == "secret-jwt" && kv.Enabled {
			foundToken = true
		}
	}
	if !foundToken {
		t.Errorf("expected token='secret-jwt' persisted in AuthFlow/_folder.json, got: %+v", loadedFolder.Variables)
	}
	if len(loadedFolder.FolderEnvs[stgEnv.ID]) == 0 || loadedFolder.FolderEnvs[stgEnv.ID][0].Value != "acme-tenant" {
		t.Errorf("expected tenant_var='acme-tenant' in folder_envs[%s], got: %+v", stgEnv.ID, loadedFolder.FolderEnvs)
	}
	if loadedFolder.AuthEnvs[stgEnv.ID] == nil || loadedFolder.AuthEnvs[stgEnv.ID].Bearer == nil || loadedFolder.AuthEnvs[stgEnv.ID].Bearer.Token != "folder-stg-bearer" {
		t.Errorf("expected folder-stg-bearer in folder AuthEnvs[%s], got: %+v", stgEnv.ID, loadedFolder.AuthEnvs)
	}

	// 2. Active environment has active_env_saved = "yes", and Prod environment has prod_flag = "enabled"
	updatedEnv := envSvc.Get(collRoot, stgEnv.ID).Data.(model.Environment)
	foundEnvSaved := false
	for _, kv := range updatedEnv.Variables {
		if kv.Key == "active_env_saved" && kv.Value == "yes" {
			foundEnvSaved = true
		}
	}
	if !foundEnvSaved {
		t.Errorf("expected active_env_saved='yes' in environment on disk, got: %+v", updatedEnv.Variables)
	}
	updatedProd := envSvc.Get(collRoot, prodEnv.ID).Data.(model.Environment)
	if len(updatedProd.Variables) != 1 || updatedProd.Variables[0].Key != "prod_flag" || updatedProd.Variables[0].Value != "enabled" {
		t.Errorf("expected prod_flag='enabled' in Prod environment on disk, got: %+v", updatedProd.Variables)
	}

	// 3. collection.json on disk has req_var, Auth, and AuthEnvs[stgEnv.ID]
	var diskColl model.Collection
	if err := fs.ReadJSON(filepath.Join(collRoot, "collection.json"), &diskColl); err != nil {
		t.Fatalf("failed reading collection.json: %v", err)
	}
	if len(diskColl.Variables) == 0 || diskColl.Variables[0].Key != "req_var" || diskColl.Variables[0].Value != "from-collection-tier1" {
		t.Errorf("expected req_var in collection.json on disk, got: %+v", diskColl.Variables)
	}
	if diskColl.Auth == nil || diskColl.Auth.Bearer == nil || diskColl.Auth.Bearer.Token != "coll-bearer-token" {
		t.Errorf("expected coll-bearer-token in collection.json Auth, got: %+v", diskColl.Auth)
	}
	if diskColl.AuthEnvs[stgEnv.ID] == nil || diskColl.AuthEnvs[stgEnv.ID].Bearer == nil || diskColl.AuthEnvs[stgEnv.ID].Bearer.Token != "coll-stg-bearer" {
		t.Errorf("expected coll-stg-bearer in collection.json AuthEnvs[%s], got: %+v", stgEnv.ID, diskColl.AuthEnvs)
	}

	// 4. Execution history recorded
	histSvc := service.NewHistoryService(fs, logger)
	histEntries := histSvc.ListExecutions(collRoot).Data.([]model.ExecutionHistoryEntry)
	if len(histEntries) != 1 || histEntries[0].StatusCode != 200 {
		t.Errorf("expected 1 execution history entry, got: %+v", histEntries)
	}
}

func TestParseCurl_And_ReconcileRequestURLAndParams(t *testing.T) {
	rawCurl := "curl -X POST https://api.example.com/v1/users/:id?active=true \\\n  -H 'Content-Type: application/json' \\\n  -H 'Authorization: Bearer my-tok' \\\n  -d '{\"name\":\"Alice\"}'"
	req, err := ParseCurl(rawCurl)
	if err != nil {
		t.Fatalf("ParseCurl failed: %v", err)
	}
	if req.Method != "POST" {
		t.Errorf("Method = %q, want POST", req.Method)
	}
	if req.Body.Type != "json" || req.Body.Content != `{"name":"Alice"}` {
		t.Errorf("unexpected Body: %+v", req.Body)
	}
	if len(req.Params) != 1 || req.Params[0].Key != "active" || req.Params[0].Value != "true" {
		t.Errorf("unexpected Params: %+v", req.Params)
	}

	// Non-curl command -> VALIDATION error
	if _, err := ParseCurl("not-a-curl-command.json"); err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Errorf("expected VALIDATION error for non-curl input, got: %v", err)
	}

	// ReconcileRequestURLAndParams
	r2 := &model.Request{
		URL:    "https://api.example.com/orgs/:orgId/repos?page=2",
		Params: []model.KVPair{{Key: "per_page", Value: "25", Enabled: true}},
	}
	if err := ReconcileRequestURLAndParams(r2); err != nil {
		t.Fatalf("ReconcileRequestURLAndParams failed: %v", err)
	}
	if r2.URL != "https://api.example.com/orgs/:orgId/repos?page=2&per_page=25" {
		t.Errorf("r2.URL = %q, want 'https://api.example.com/orgs/:orgId/repos?page=2&per_page=25'", r2.URL)
	}
	if len(r2.PathParams) != 1 || r2.PathParams[0].Key != "orgId" {
		t.Errorf("expected PathParams [orgId], got: %+v", r2.PathParams)
	}
}

func TestExecuteRequestFlow_NoSaveEnv_ScopedAuth_NetworkFailure_And_Errors(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	logger := newTestLogger()
	cfgSvc := service.NewConfigService(fs, logger)
	cfgSvc.SetCustomConfigDir(tmpDir)
	cfg, err := cfgSvc.Initialize(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	collSvc := service.NewCollectionService(fs, logger)
	_, collRoot, err := collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "default")
	if err != nil {
		t.Fatal(err)
	}

	var gotAuth string
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`ok`))
	}))

	fNode := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(fNode.ID, "Protected")

	req := model.Request{
		ID:     "req-protected",
		Name:   "Protected Call",
		Method: "GET",
		URL:    ts.URL + "/resource",
		Auth:   &model.AuthConfig{Type: "inherit"},
		Scripts: &model.Scripts{
			PreRequest: `
				ha.folderAuth.setBearer("folder-bearer-123");
				ha.folderVariables.set("ephemeral", "should-not-persist");
			`,
			PostResponse: `
				throw new Error("simulated post-response error");
			`,
		},
	}

	// 1. Run with NoSaveEnv: true -> in-memory folderAuth must apply to HTTP request, but disk _folder.json must remain untouched, and ScriptError must be populated without crashing
	out, err := ExecuteRequestFlow(RunOptions{
		FS:             fs,
		CollectionRoot: collRoot,
		Request:        req,
		PathFolders:    []model.TreeNode{fNode},
		AllFolders:     []model.TreeNode{fNode},
		NoSaveEnv:      true,
	})
	if err != nil {
		t.Fatalf("ExecuteRequestFlow failed: %v", err)
	}
	if gotAuth != "Bearer folder-bearer-123" {
		t.Errorf("gotAuth = %q, want 'Bearer folder-bearer-123'", gotAuth)
	}
	if !strings.Contains(out.ScriptError, "simulated post-response error") {
		t.Errorf("expected ScriptError to contain 'simulated post-response error', got %q", out.ScriptError)
	}
	folderOnDisk := collSvc.LoadFolder(fNode.ID).Data.(model.Folder)
	if len(folderOnDisk.Variables) != 0 {
		t.Errorf("expected 0 variables on disk when NoSaveEnv=true, got %+v", folderOnDisk.Variables)
	}

	// 2. Run with NoSaveEnv: false -> folderAuth must persist to disk _folder.json
	_, err = ExecuteRequestFlow(RunOptions{
		FS:             fs,
		CollectionRoot: collRoot,
		Request:        req,
		PathFolders:    []model.TreeNode{fNode},
		AllFolders:     []model.TreeNode{fNode},
		NoSaveEnv:      false,
	})
	if err != nil {
		t.Fatalf("ExecuteRequestFlow failed: %v", err)
	}
	folderOnDisk = collSvc.LoadFolder(fNode.ID).Data.(model.Folder)
	if folderOnDisk.Auth == nil || folderOnDisk.Auth.Type != "bearer" || folderOnDisk.Auth.Bearer == nil || folderOnDisk.Auth.Bearer.Token != "folder-bearer-123" {
		t.Errorf("expected folder auth bearer persisted to disk, got: %+v", folderOnDisk.Auth)
	}

	// 3. Close server to simulate network connection failure (!sendRes.Success)
	ts.Close()
	failOut, failErr := ExecuteRequestFlow(RunOptions{
		FS:             fs,
		CollectionRoot: collRoot,
		Request: model.Request{
			ID:     "req-net-fail",
			Method: "GET",
			URL:    ts.URL + "/down",
		},
	})
	if failErr == nil {
		t.Fatalf("expected network failure error when server is closed")
	}
	if failOut == nil || failOut.NetworkError == "" {
		t.Fatalf("expected RunOutput with NetworkError populated, got: %+v", failOut)
	}
	if failOut.ScriptLogs == nil || failOut.ScriptTests == nil {
		t.Errorf("expected non-nil ScriptLogs and ScriptTests slices on network failure")
	}
}


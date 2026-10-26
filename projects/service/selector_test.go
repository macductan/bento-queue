package service

import (
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

func newSilentTestLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestConfigService_CustomConfigDirAndStartupCallback(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	cfgSvc := NewConfigService(fs, newSilentTestLogger())

	customDir := filepath.Join(tmpDir, "custom-hecto-dir")
	cfgSvc.SetCustomConfigDir(customDir)

	cfg, err := cfgSvc.Initialize(context.Background())
	if err != nil {
		t.Fatalf("Initialize failed: %v", err)
	}

	expectedCollectionsRoot := filepath.Join(customDir, "collections")
	if cfg.CollectionsRoot != expectedCollectionsRoot {
		t.Errorf("CollectionsRoot = %q, want %q", cfg.CollectionsRoot, expectedCollectionsRoot)
	}
	if !fs.Exists(filepath.Join(customDir, "config.json")) {
		t.Error("expected config.json inside customDir")
	}
	if !fs.Exists(filepath.Join(expectedCollectionsRoot, "default", "collection.json")) {
		t.Error("expected default/collection.json inside customDir/collections")
	}

	// Test HECTO_CONFIG_DIR env override when customConfigDir is empty
	envDir := filepath.Join(tmpDir, "env-hecto-dir")
	t.Setenv("HECTO_CONFIG_DIR", envDir)
	cfgSvc2 := NewConfigService(fs, newSilentTestLogger())
	cfg2, err := cfgSvc2.Initialize(context.Background())
	if err != nil {
		t.Fatalf("Initialize with HECTO_CONFIG_DIR failed: %v", err)
	}
	if cfg2.CollectionsRoot != filepath.Join(envDir, "collections") {
		t.Errorf("CollectionsRoot = %q, want %q", cfg2.CollectionsRoot, filepath.Join(envDir, "collections"))
	}

	// Test GetConfig
	loadedCfg, err := cfgSvc2.GetConfig()
	if err != nil {
		t.Fatalf("GetConfig failed: %v", err)
	}
	if loadedCfg.ActiveCollection != "default" {
		t.Errorf("ActiveCollection = %q, want default", loadedCfg.ActiveCollection)
	}

	// Test startup error callback
	var capturedMsg string
	cfgSvc2.SetStartupErrorHandler(func(_ context.Context, msg string) {
		capturedMsg = msg
	})
	cfgSvc2.emitStartupError(context.Background(), "simulated startup error")
	if capturedMsg != "simulated startup error" {
		t.Errorf("capturedMsg = %q, want 'simulated startup error'", capturedMsg)
	}
}

func TestGetTree_SingleWalkPopulatesFolderAndRequestIndex(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, newSilentTestLogger())
	reqSvc := NewRequestService(fs, newSilentTestLogger())

	collRoot := filepath.Join(tmpDir, "default")
	if err := fs.MakeDir(collRoot); err != nil {
		t.Fatal(err)
	}

	fRes := collSvc.CreateFolder(collRoot, "")
	if !fRes.Success {
		t.Fatalf("CreateFolder failed: %v", fRes.Error)
	}
	fNode := fRes.Data.(model.TreeNode)

	rRes := collSvc.CreateRequest(collRoot, fNode.ID)
	if !rRes.Success {
		t.Fatalf("CreateRequest failed: %v", rRes.Error)
	}
	rNode := rRes.Data.(model.TreeNode)

	// Clear index manually, then call GetTree -> should repopulate both folder and request in 1 walk
	fs.IndexClear()
	treeRes := collSvc.GetTree(collRoot)
	if !treeRes.Success {
		t.Fatalf("GetTree failed: %v", treeRes.Error)
	}

	// Clear collectionRoot so FindByUUID cannot fall back to a disk walk and must prove index-only hits
	fs.SetCollectionRoot("")
	if got := reqSvc.Get(rNode.ID); !got.Success {
		t.Errorf("expected request %s to be found via index after GetTree: %v", rNode.ID, got.Error)
	}
	if got := collSvc.LoadFolder(fNode.ID); !got.Success {
		t.Errorf("expected folder %s to be found via index after GetTree: %v", fNode.ID, got.Error)
	}
}

func TestResolveCollectionSelector(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	cfgSvc := NewConfigService(fs, newSilentTestLogger())
	cfgSvc.SetCustomConfigDir(tmpDir)
	cfg, err := cfgSvc.Initialize(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	collSvc := NewCollectionService(fs, newSilentTestLogger())

	// Create a second collection
	cRes := collSvc.CreateCollection(cfg.CollectionsRoot, "Payment API")
	if !cRes.Success {
		t.Fatalf("CreateCollection failed: %v", cRes.Error)
	}
	paymentColl := cRes.Data.(model.Collection)

	// 1. Empty selector -> resolves activeCollection ("default")
	coll, collRoot, err := collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "")
	if err != nil {
		t.Fatalf("ResolveCollectionSelector empty failed: %v", err)
	}
	if coll.ID != "default" || collRoot != filepath.Join(cfg.CollectionsRoot, "default") {
		t.Errorf("unexpected default resolution: id=%q root=%q", coll.ID, collRoot)
	}

	// 2. Resolve by exact ID and verify fs.SetCollectionRoot was updated
	reqRes := collSvc.CreateRequest(filepath.Join(cfg.CollectionsRoot, paymentColl.ID), "")
	if !reqRes.Success {
		t.Fatal(reqRes.Error)
	}
	reqNode := reqRes.Data.(model.TreeNode)
	fs.IndexClear()
	fs.SetCollectionRoot("")

	collByID, collRootByID, err := ResolveCollectionSelector(fs, cfg.CollectionsRoot, cfg.ActiveCollection, paymentColl.ID)
	if err != nil {
		t.Fatalf("ResolveCollectionSelector by exact ID failed: %v", err)
	}
	if collByID.ID != paymentColl.ID || collRootByID != filepath.Join(cfg.CollectionsRoot, paymentColl.ID) {
		t.Errorf("got ID %q root %q, want %q", collByID.ID, collRootByID, paymentColl.ID)
	}
	if _, err := fs.FindByUUID(reqNode.ID); err != nil {
		t.Errorf("FindByUUID should work immediately after exact-ID ResolveCollectionSelector set collectionRoot: %v", err)
	}

	// 3. Resolve by case-insensitive Name and verify fs.SetCollectionRoot was updated
	fs.IndexClear()
	fs.SetCollectionRoot("") // clear root so FindByUUID relies on ResolveCollectionSelector setting it

	coll, collRoot, err = collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "  payment api ")
	if err != nil {
		t.Fatalf("ResolveCollectionSelector by name failed: %v", err)
	}
	if coll.ID != paymentColl.ID {
		t.Errorf("got ID %q, want %q", coll.ID, paymentColl.ID)
	}
	// Verify FindByUUID works immediately without calling GetTree first
	if _, err := fs.FindByUUID(reqNode.ID); err != nil {
		t.Errorf("FindByUUID should work immediately after ResolveCollectionSelector set collectionRoot: %v", err)
	}

	// 4. Duplicate collection names -> VALIDATION error listing IDs
	dupRes := collSvc.CreateCollection(cfg.CollectionsRoot, "Payment API")
	if !dupRes.Success {
		t.Fatal(dupRes.Error)
	}
	dupColl := dupRes.Data.(model.Collection)

	_, _, err = collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "Payment API")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Fatalf("expected VALIDATION error on duplicate collection names, got: %v", err)
	}
	if !strings.Contains(err.Error(), paymentColl.ID) || !strings.Contains(err.Error(), dupColl.ID) {
		t.Errorf("expected duplicate error to list both IDs (%s, %s), got: %v", paymentColl.ID, dupColl.ID, err)
	}

	// 5. Not found -> NOT_FOUND
	_, _, err = collSvc.ResolveCollectionSelector(cfg.CollectionsRoot, cfg.ActiveCollection, "NonExistent")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrNotFound) {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestResolveEnvironmentSelector(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, newSilentTestLogger())
	envSvc := NewEnvironmentService(fs, newSilentTestLogger())

	collRoot := filepath.Join(tmpDir, "default")
	if err := fs.MakeDir(collRoot); err != nil {
		t.Fatal(err)
	}

	e1Res := envSvc.Save(collRoot, model.Environment{
		Name:      "Staging",
		Variables: []model.KVPair{{Key: "host", Value: "stg.example.com", Enabled: true}},
	})
	env1 := e1Res.Data.(model.Environment)

	// Resolve by UUID (via package-level helper)
	got, err := ResolveEnvironmentSelector(fs, collRoot, env1.ID)
	if err != nil || got.ID != env1.ID {
		t.Fatalf("ResolveEnvironmentSelector by ID failed: %v", err)
	}

	// Resolve by case-insensitive Name
	got, err = collSvc.ResolveEnvironmentSelector(collRoot, "  staging ")
	if err != nil || got.ID != env1.ID {
		t.Fatalf("ResolveEnvironmentSelector by Name failed: %v", err)
	}

	// Duplicate Name -> VALIDATION error with UUIDs
	e2Res := envSvc.Save(collRoot, model.Environment{Name: "Staging"})
	env2 := e2Res.Data.(model.Environment)

	_, err = collSvc.ResolveEnvironmentSelector(collRoot, "staging")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Fatalf("expected VALIDATION error for duplicate env name, got: %v", err)
	}
	if !strings.Contains(err.Error(), env1.ID) || !strings.Contains(err.Error(), env2.ID) {
		t.Errorf("expected error to list both env IDs, got: %v", err)
	}

	// Not found -> NOT_FOUND
	_, err = collSvc.ResolveEnvironmentSelector(collRoot, "production")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrNotFound) {
		t.Errorf("expected NOT_FOUND error, got: %v", err)
	}
}

func TestResolveFolderSelector_And_ResolveRequestSelector(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, newSilentTestLogger())
	reqSvc := NewRequestService(fs, newSilentTestLogger())

	collRoot := filepath.Join(tmpDir, "default")
	if err := os.MkdirAll(collRoot, 0755); err != nil {
		t.Fatal(err)
	}

	// Build hierarchy:
	// - Users (folder)
	//   - Auth (folder)
	//     - Login (request with Headers, Params, PathParams, Scripts)
	//   - GET /users/profile (request with slash in name inside Users)
	// - API v1/v2 (folder at root with slash in name)
	//   - SubFolder (child folder inside slash-named folder)
	//   - List Items (child request inside slash-named folder)
	// - GET /health/check (request at root with slash in name)
	usersNode := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(usersNode.ID, "Users")

	authNode := collSvc.CreateFolder(collRoot, usersNode.ID).Data.(model.TreeNode)
	collSvc.RenameFolder(authNode.ID, "Auth")

	slashFolderNode := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	collSvc.RenameFolder(slashFolderNode.ID, "API v1/v2")

	subInSlashFolder := collSvc.CreateFolder(collRoot, slashFolderNode.ID).Data.(model.TreeNode)
	collSvc.RenameFolder(subInSlashFolder.ID, "SubFolder")

	reqInSlashFolder := collSvc.CreateRequest(collRoot, slashFolderNode.ID).Data.(model.TreeNode)
	reqSvc.Rename(reqInSlashFolder.ID, "List Items")

	loginNode := collSvc.CreateRequest(collRoot, authNode.ID).Data.(model.TreeNode)
	fullLoginReq := model.Request{
		ID:         loginNode.ID,
		Name:       "Login",
		Method:     "POST",
		URL:        "https://api.example.com/users/:id/login?env=dev",
		Headers:    []model.KVPair{{Key: "X-Custom", Value: "123", Enabled: true}},
		Params:     []model.KVPair{{Key: "env", Value: "dev", Enabled: true}},
		PathParams: []model.KVPair{{Key: "id", Value: "42", Enabled: true}},
		Body:       model.Body{Type: "json", Content: `{"user":"admin"}`},
		Scripts:    &model.Scripts{PreRequest: "console.log('pre')", PostResponse: "console.log('post')"},
	}
	if res := reqSvc.Save(fullLoginReq); !res.Success {
		t.Fatalf("Save fullLoginReq failed: %v", res.Error)
	}

	nestedSlashReqNode := collSvc.CreateRequest(collRoot, usersNode.ID).Data.(model.TreeNode)
	reqSvc.Rename(nestedSlashReqNode.ID, "GET /users/profile")

	rootSlashReqNode := collSvc.CreateRequest(collRoot, "").Data.(model.TreeNode)
	reqSvc.Rename(rootSlashReqNode.ID, "GET /health/check")

	// 1. ResolveFolderSelector with redundant slashes "/Users//Auth/"
	fGot, ancestors, err := ResolveFolderSelector(fs, collRoot, " /Users//Auth/ ")
	if err != nil {
		t.Fatalf("ResolveFolderSelector('/Users//Auth/') failed: %v", err)
	}
	if fGot.ID != authNode.ID {
		t.Errorf("got folder ID %q, want %q", fGot.ID, authNode.ID)
	}
	if len(ancestors) != 1 || ancestors[0].ID != usersNode.ID {
		t.Errorf("expected 1 ancestor (Users), got: %+v", ancestors)
	}

	// 2. ResolveFolderSelector by UUID
	fByID, ancestorsByID, err := collSvc.ResolveFolderSelector(collRoot, authNode.ID)
	if err != nil || fByID.ID != authNode.ID || len(ancestorsByID) != 1 {
		t.Fatalf("ResolveFolderSelector by UUID failed: %v", err)
	}

	// 3. ResolveFolderSelector for folder containing '/' in name and its nested child folder/request
	fSlash, ancestorsSlash, err := collSvc.ResolveFolderSelector(collRoot, "API v1/v2")
	if err != nil || fSlash.ID != slashFolderNode.ID || len(ancestorsSlash) != 0 {
		t.Fatalf("ResolveFolderSelector('API v1/v2') failed: %v", err)
	}
	fSubInSlash, ancSubInSlash, err := collSvc.ResolveFolderSelector(collRoot, "API v1/v2/SubFolder")
	if err != nil || fSubInSlash.ID != subInSlashFolder.ID || len(ancSubInSlash) != 1 || ancSubInSlash[0].ID != slashFolderNode.ID {
		t.Fatalf("ResolveFolderSelector('API v1/v2/SubFolder') failed: %v", err)
	}
	rInSlash, pfInSlash, _, err := collSvc.ResolveRequestSelector(collRoot, "API v1/v2/List Items")
	if err != nil || rInSlash.ID != reqInSlashFolder.ID || len(pfInSlash) != 1 || pfInSlash[0].ID != slashFolderNode.ID {
		t.Fatalf("ResolveRequestSelector('API v1/v2/List Items') failed: %v", err)
	}

	// 4. ResolveRequestSelector by path "/Users//Auth/Login" and by UUID -> must read full Request from disk
	reqGot, pathFolders, allFolders, err := ResolveRequestSelector(fs, collRoot, "/Users//Auth/Login")
	if err != nil {
		t.Fatalf("ResolveRequestSelector('/Users//Auth/Login') failed: %v", err)
	}
	if reqGot.ID != loginNode.ID || reqGot.Method != "POST" {
		t.Errorf("unexpected reqGot: %+v", reqGot)
	}
	if len(reqGot.Headers) != 1 || len(reqGot.Params) != 1 || len(reqGot.PathParams) != 1 || reqGot.Scripts == nil || reqGot.Scripts.PreRequest != "console.log('pre')" {
		t.Errorf("ResolveRequestSelector did not load full request from disk: %+v", reqGot)
	}
	if len(pathFolders) != 2 || pathFolders[0].ID != usersNode.ID || pathFolders[1].ID != authNode.ID {
		t.Errorf("expected pathFolders [Users, Auth], got: %+v", pathFolders)
	}
	if len(allFolders) != 4 {
		t.Errorf("expected 4 total folders in allFolders, got %d", len(allFolders))
	}

	reqByUUID, pfByUUID, _, err := collSvc.ResolveRequestSelector(collRoot, loginNode.ID)
	if err != nil || reqByUUID.ID != loginNode.ID || len(pfByUUID) != 2 || len(reqByUUID.Headers) != 1 {
		t.Fatalf("ResolveRequestSelector by UUID failed: err=%v req=%+v pf=%+v", err, reqByUUID, pfByUUID)
	}

	// 5. ResolveRequestSelector for request with '/' in name at root and inside folder
	reqRootSlash, pfRoot, _, err := collSvc.ResolveRequestSelector(collRoot, "GET /health/check")
	if err != nil || reqRootSlash.ID != rootSlashReqNode.ID || len(pfRoot) != 0 {
		t.Fatalf("ResolveRequestSelector('GET /health/check') failed: %v", err)
	}

	reqNestedSlash, pfNested, _, err := collSvc.ResolveRequestSelector(collRoot, "Users/GET /users/profile")
	if err != nil || reqNestedSlash.ID != nestedSlashReqNode.ID || len(pfNested) != 1 || pfNested[0].ID != usersNode.ID {
		t.Fatalf("ResolveRequestSelector('Users/GET /users/profile') failed: %v", err)
	}

	// 6. Duplicate request names in same folder -> VALIDATION error with UUIDs
	dupLoginNode := collSvc.CreateRequest(collRoot, authNode.ID).Data.(model.TreeNode)
	reqSvc.Rename(dupLoginNode.ID, "Login")

	_, _, _, err = collSvc.ResolveRequestSelector(collRoot, "Users/Auth/Login")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Fatalf("expected VALIDATION error for duplicate request names, got: %v", err)
	}
	if !strings.Contains(err.Error(), loginNode.ID) || !strings.Contains(err.Error(), dupLoginNode.ID) {
		t.Errorf("expected error to contain both request UUIDs, got: %v", err)
	}

	// 7. Duplicate folder names at same level -> VALIDATION error with UUIDs
	dupAuthNode := collSvc.CreateFolder(collRoot, usersNode.ID).Data.(model.TreeNode)
	collSvc.RenameFolder(dupAuthNode.ID, "Auth")

	_, _, err = collSvc.ResolveFolderSelector(collRoot, "Users/Auth")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Fatalf("expected VALIDATION error for duplicate folder names, got: %v", err)
	}
	if !strings.Contains(err.Error(), authNode.ID) || !strings.Contains(err.Error(), dupAuthNode.ID) {
		t.Errorf("expected error to contain both folder UUIDs, got: %v", err)
	}
}

func TestResolveFlowFolderSelector_And_ResolveFlowSelector(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, newSilentTestLogger())
	flowSvc := NewFlowService(fs, newSilentTestLogger())

	collRoot := filepath.Join(tmpDir, "default")
	if err := os.MkdirAll(collRoot, 0755); err != nil {
		t.Fatal(err)
	}

	// Build flow hierarchy inside <collection>/flows/:
	// - E2E Checkout (flow_folder)
	//   - Sub Suite (flow_folder)
	//     - Deep Flow (flow)
	//   - Order Payment Flow (flow)
	e2eFolder := flowSvc.CreateFlowFolderNamed(collRoot, "", "E2E Checkout").Data.(model.FlowFolder)
	subFolder := flowSvc.CreateFlowFolderNamed(collRoot, e2eFolder.ID, "Sub Suite").Data.(model.FlowFolder)

	orderFlow := flowSvc.CreateFlowWithDetails(collRoot, e2eFolder.ID, model.Flow{
		Name:        "Order Payment Flow",
		Description: "Checkout happy path",
		Layout:      "vertical",
		TimeoutMs:   25000,
		MaxSteps:    80,
		Nodes: []model.FlowNode{
			{
				Steps: []model.FlowStep{
					{RequestID: "req-login", Enabled: true},
				},
			},
		},
	}).Data.(model.Flow)

	deepFlow := flowSvc.CreateFlowWithDetails(collRoot, subFolder.ID, model.Flow{
		Name:   "Deep Flow",
		Layout: "horizontal",
	}).Data.(model.Flow)

	// 1. ResolveFlowFolderSelector by hierarchical path and by UUID
	ffNode, ffAncestors, err := ResolveFlowFolderSelector(fs, collRoot, " /E2E Checkout//Sub Suite/ ")
	if err != nil {
		t.Fatalf("ResolveFlowFolderSelector by path failed: %v", err)
	}
	if ffNode.ID != subFolder.ID {
		t.Errorf("got flow folder ID %q, want %q", ffNode.ID, subFolder.ID)
	}
	if len(ffAncestors) != 1 || ffAncestors[0].ID != e2eFolder.ID {
		t.Errorf("expected 1 ancestor (E2E Checkout), got: %+v", ffAncestors)
	}

	ffByUUID, ffAncByUUID, err := collSvc.ResolveFlowFolderSelector(collRoot, subFolder.ID)
	if err != nil || ffByUUID.ID != subFolder.ID || len(ffAncByUUID) != 1 {
		t.Fatalf("ResolveFlowFolderSelector by UUID failed: err=%v node=%+v", err, ffByUUID)
	}

	// 2. ResolveFlowSelector by path "E2E Checkout/Order Payment Flow" and by UUID
	gotFlow, flowAncestors, err := ResolveFlowSelector(fs, collRoot, "E2E Checkout/Order Payment Flow")
	if err != nil {
		t.Fatalf("ResolveFlowSelector('E2E Checkout/Order Payment Flow') failed: %v", err)
	}
	if gotFlow.ID != orderFlow.ID || gotFlow.TimeoutMs != 25000 || len(gotFlow.Nodes) != 1 {
		t.Errorf("unexpected resolved flow: %+v", gotFlow)
	}
	if len(flowAncestors) != 1 || flowAncestors[0].ID != e2eFolder.ID {
		t.Errorf("expected ancestor [E2E Checkout], got: %+v", flowAncestors)
	}

	gotByUUID, ancByUUID, err := collSvc.ResolveFlowSelector(collRoot, deepFlow.ID)
	if err != nil || gotByUUID.ID != deepFlow.ID || len(ancByUUID) != 2 {
		t.Fatalf("ResolveFlowSelector by UUID failed: err=%v flow=%+v anc=%+v", err, gotByUUID, ancByUUID)
	}

	// 2b. ResolveFlowSelector and ResolveFlowFolderSelector by unambiguous 6-char UUID prefix
	gotByPrefix, ancByPrefix, err := flowSvc.ResolveFlowSelector(collRoot, deepFlow.ID[:6])
	if err != nil || gotByPrefix.ID != deepFlow.ID || len(ancByPrefix) != 2 {
		t.Fatalf("ResolveFlowSelector by 6-char UUID prefix (%s) failed: err=%v flow=%+v", deepFlow.ID[:6], err, gotByPrefix)
	}
	ffByPrefix, ffAncByPrefix, err := flowSvc.ResolveFlowFolderSelector(collRoot, subFolder.ID[:6])
	if err != nil || ffByPrefix.ID != subFolder.ID || len(ffAncByPrefix) != 1 {
		t.Fatalf("ResolveFlowFolderSelector by 6-char UUID prefix (%s) failed: err=%v node=%+v", subFolder.ID[:6], err, ffByPrefix)
	}

	// 3. Duplicate flow names in same folder -> VALIDATION error listing both UUIDs
	dupOrderFlow := flowSvc.CreateFlowWithDetails(collRoot, e2eFolder.ID, model.Flow{
		Name: "Order Payment Flow",
	}).Data.(model.Flow)

	_, _, err = flowSvc.ResolveFlowSelector(collRoot, "E2E Checkout/Order Payment Flow")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Fatalf("expected VALIDATION error for duplicate flow names, got: %v", err)
	}
	if !strings.Contains(err.Error(), orderFlow.ID) || !strings.Contains(err.Error(), dupOrderFlow.ID) {
		t.Errorf("expected duplicate error to list both flow UUIDs (%s, %s), got: %v", orderFlow.ID, dupOrderFlow.ID, err)
	}

	// 4. Duplicate flow folder names at same level -> VALIDATION error listing both UUIDs
	dupSubFolder := flowSvc.CreateFlowFolderNamed(collRoot, e2eFolder.ID, "Sub Suite").Data.(model.FlowFolder)
	_, _, err = flowSvc.ResolveFlowFolderSelector(collRoot, "E2E Checkout/Sub Suite")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrValidation) {
		t.Fatalf("expected VALIDATION error for duplicate flow folder names, got: %v", err)
	}
	if !strings.Contains(err.Error(), subFolder.ID) || !strings.Contains(err.Error(), dupSubFolder.ID) {
		t.Errorf("expected duplicate error to list both flow folder UUIDs (%s, %s), got: %v", subFolder.ID, dupSubFolder.ID, err)
	}

	// 5. Not found -> NOT_FOUND
	_, _, err = flowSvc.ResolveFlowSelector(collRoot, "E2E Checkout/NonExistent")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrNotFound) {
		t.Errorf("expected NOT_FOUND for missing flow, got: %v", err)
	}
	_, _, err = flowSvc.ResolveFlowFolderSelector(collRoot, "NonExistentFolder")
	if err == nil || !strings.HasPrefix(err.Error(), model.ErrNotFound) {
		t.Errorf("expected NOT_FOUND for missing flow folder, got: %v", err)
	}
}


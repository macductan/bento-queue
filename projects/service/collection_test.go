package service_test

import (
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"hecto-api/model"
	"hecto-api/service"
	"hecto-api/slug"
	"hecto-api/storage"
)


func setupCollectionService(t *testing.T) (*service.CollectionService, *storage.FileSystem, string) {
	root := t.TempDir()
	fs := storage.NewFileSystem()
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError}))
	svc := service.NewCollectionService(fs, logger)
	return svc, fs, root
}

func TestGetTree_EmptyCollection(t *testing.T) {
	svc, _, root := setupCollectionService(t)

	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("expected success, got error: %v", res.Error)
	}

	nodes, ok := res.Data.([]model.TreeNode)
	if !ok {
		t.Fatalf("expected []model.TreeNode, got %T", res.Data)
	}
	if len(nodes) != 0 {
		t.Errorf("expected empty tree, got %d nodes", len(nodes))
	}
}

func TestGetTree_NestedStructure(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Create root level request
	req1 := createTestRequest("req1", "Root Req", "GET")
	fs.WriteJSON(filepath.Join(root, "root-req.json"), req1)

	// Create folder 1
	folder1Path := filepath.Join(root, "folder1")
	fs.MakeDir(folder1Path)
	folder1 := model.Folder{ID: "f1", Name: "Folder 1", CreatedAt: time.Now()}
	fs.WriteJSON(filepath.Join(folder1Path, "_folder.json"), folder1)

	// Create request in folder 1
	req2 := createTestRequest("req2", "Nested Req", "POST")
	fs.WriteJSON(filepath.Join(folder1Path, "nested-req.json"), req2)

	// Create folder 2 nested in folder 1
	folder2Path := filepath.Join(folder1Path, "folder2")
	fs.MakeDir(folder2Path)
	folder2 := model.Folder{ID: "f2", Name: "Folder 2", CreatedAt: time.Now()}
	fs.WriteJSON(filepath.Join(folder2Path, "_folder.json"), folder2)

	// Create request in folder 2 (3 levels deep)
	req3 := createTestRequest("req3", "Deep Req", "PUT")
	fs.WriteJSON(filepath.Join(folder2Path, "deep-req.json"), req3)

	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("expected success, got error: %v", res.Error)
	}

	nodes := res.Data.([]model.TreeNode)
	if len(nodes) != 2 {
		t.Fatalf("expected 2 root nodes, got %d", len(nodes))
	}

	// We don't guarantee order, so find the folder and request
	var f1Node *model.TreeNode
	for i := range nodes {
		if nodes[i].Type == "folder" {
			f1Node = &nodes[i]
		}
	}
	if f1Node == nil {
		t.Fatalf("folder1 not found at root")
	}

	if len(f1Node.Children) != 2 {
		t.Fatalf("expected folder1 to have 2 children, got %d", len(f1Node.Children))
	}

	var f2Node *model.TreeNode
	for i := range f1Node.Children {
		if f1Node.Children[i].Type == "folder" {
			f2Node = &f1Node.Children[i]
		}
	}
	if f2Node == nil {
		t.Fatalf("folder2 not found inside folder1")
	}

	if len(f2Node.Children) != 1 {
		t.Fatalf("expected folder2 to have 1 child, got %d", len(f2Node.Children))
	}
	if f2Node.Children[0].Method != "PUT" {
		t.Errorf("expected deep request method PUT, got %s", f2Node.Children[0].Method)
	}
}

func TestGetTree_CorruptedFiles(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Valid request
	req1 := createTestRequest("req1", "Root Req", "GET")
	fs.WriteJSON(filepath.Join(root, "root-req.json"), req1)

	// Corrupted request
	os.WriteFile(filepath.Join(root, "corrupted.json"), []byte("{invalid json"), 0644)

	// Corrupted folder (directory exists but _folder.json is invalid)
	folderPath := filepath.Join(root, "bad-folder")
	os.MkdirAll(folderPath, 0755)
	os.WriteFile(filepath.Join(folderPath, "_folder.json"), []byte("{bad"), 0644)

	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("expected success, got error: %v", res.Error)
	}

	nodes := res.Data.([]model.TreeNode)
	// Should skip the corrupted request and folder, leaving only the valid request
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(nodes))
	}
	if nodes[0].ID != "req1" {
		t.Errorf("expected req1, got %s", nodes[0].ID)
	}
}

func TestCreateRequest(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Create at empty root
	res := svc.CreateRequest(root, "")
	if !res.Success {
		t.Fatalf("expected success, got error: %v", res.Error)
	}
	node, ok := res.Data.(model.TreeNode)
	if !ok {
		t.Fatalf("expected TreeNode, got %T", res.Data)
	}
	if node.Type != "request" {
		t.Errorf("expected request, got %s", node.Type)
	}
	if node.Name != "Request mới" {
		t.Errorf("expected 'Request mới', got %s", node.Name)
	}

	// Verify file exists
	if !fs.Exists(node.Path) {
		t.Errorf("expected file to exist at %s", node.Path)
	}
	expectedFilename := slug.RequestFilename(node.ID)
	if filepath.Base(node.Path) != expectedFilename {
		t.Errorf("expected filename %s, got %s", expectedFilename, filepath.Base(node.Path))
	}

	// Create again to test slug collision
	res2 := svc.CreateRequest(root, "")
	if !res2.Success {
		t.Fatalf("expected success, got error: %v", res2.Error)
	}
	node2, _ := res2.Data.(model.TreeNode)
	if node2.Path == node.Path {
		t.Errorf("expected different paths for collision, got same: %s", node2.Path)
	}

	// Test create in valid parent folder
	fPath := filepath.Join(root, "parent")
	writeFolder(t, fs, fPath, "parent-id", "Parent Folder")
	svc.GetTree(root) // Build index

	res3 := svc.CreateRequest(root, "parent-id")
	if !res3.Success {
		t.Fatalf("expected success, got error: %v", res3.Error)
	}
	node3, _ := res3.Data.(model.TreeNode)
	if filepath.Dir(node3.Path) != fPath {
		t.Errorf("expected request in %s, got %s", fPath, node3.Path)
	}

	// Test create with invalid parent UUID
	res4 := svc.CreateRequest(root, "not-found")
	if res4.Success {
		t.Errorf("expected failure for invalid parent")
	}

	// Test create with request as parent
	reqPath := filepath.Join(root, "req.json")
	fs.WriteJSON(reqPath, createTestRequest("req-id", "", ""))
	svc.GetTree(root)
	res5 := svc.CreateRequest(root, "req-id")
	if res5.Success {
		t.Errorf("expected failure when parent is a request")
	}
}

func TestCreateFolder(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Create at empty root
	res := svc.CreateFolder(root, "")
	if !res.Success {
		t.Fatalf("expected success, got error: %v", res.Error)
	}
	node, ok := res.Data.(model.TreeNode)
	if !ok {
		t.Fatalf("expected TreeNode, got %T", res.Data)
	}
	if node.Type != "folder" {
		t.Errorf("expected folder, got %s", node.Type)
	}
	if node.Name != "Thư mục mới" {
		t.Errorf("expected 'Thư mục mới', got %s", node.Name)
	}

	// Verify folder and _folder.json exist
	if !fs.Exists(node.Path) {
		t.Errorf("expected folder to exist at %s", node.Path)
	}
	if !fs.Exists(filepath.Join(node.Path, "_folder.json")) {
		t.Errorf("expected _folder.json to exist")
	}
	expectedDirname := slug.FolderDir(node.ID)
	if filepath.Base(node.Path) != expectedDirname {
		t.Errorf("expected dirname %s, got %s", expectedDirname, filepath.Base(node.Path))
	}

	// Create again to test slug collision
	res2 := svc.CreateFolder(root, "")
	if !res2.Success {
		t.Fatalf("expected success, got error: %v", res2.Error)
	}
	node2, _ := res2.Data.(model.TreeNode)
	if node2.Path == node.Path {
		t.Errorf("expected different paths for collision, got same: %s", node2.Path)
	}

	// Test create in valid parent folder
	fPath := filepath.Join(root, "parent")
	writeFolder(t, fs, fPath, "parent-id", "Parent Folder")
	svc.GetTree(root) // Build index

	res3 := svc.CreateFolder(root, "parent-id")
	if !res3.Success {
		t.Fatalf("expected success, got error: %v", res3.Error)
	}
	node3, _ := res3.Data.(model.TreeNode)
	if filepath.Dir(node3.Path) != fPath {
		t.Errorf("expected folder in %s, got %s", fPath, node3.Path)
	}
}

func TestCreate_DiskError(t *testing.T) {
	if os.Getuid() == 0 {
		t.Skip("skipping permission test as root")
	}

	svc, _, root := setupCollectionService(t)

	// Make a read-only directory
	badRoot := filepath.Join(root, "readonly-dir")
	os.MkdirAll(badRoot, 0555) // rx only, no write

	res := svc.CreateFolder(badRoot, "")
	if res.Success {
		t.Errorf("expected CreateFolder to fail for bad root")
	}

	resReq := svc.CreateRequest(badRoot, "")
	if resReq.Success {
		t.Errorf("expected CreateRequest to fail for bad root")
	}
}

func writeFolder(t *testing.T, fs *storage.FileSystem, dir, id, name string) {
	t.Helper()
	if err := fs.MakeDir(dir); err != nil {
		t.Fatalf("MakeDir: %v", err)
	}
	f := model.Folder{ID: id, Name: name, CreatedAt: time.Now()}
	if err := fs.WriteJSON(filepath.Join(dir, "_folder.json"), f); err != nil {
		t.Fatalf("write _folder.json: %v", err)
	}
}

func TestDeleteFolder_RecursiveAndIndexCleanup(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	f1 := filepath.Join(root, "f1")
	f2 := filepath.Join(f1, "f2")
	writeFolder(t, fs, f1, "f1", "F1")
	writeFolder(t, fs, f2, "f2", "F2")
	fs.WriteJSON(filepath.Join(f1, "a.json"), createTestRequest("ra", "A", "GET"))
	fs.WriteJSON(filepath.Join(f2, "b.json"), createTestRequest("rb", "B", "GET"))
	fs.WriteJSON(filepath.Join(root, "keep.json"), createTestRequest("rk", "K", "GET"))

	if res := svc.GetTree(root); !res.Success {
		t.Fatalf("GetTree: %v", res.Error)
	}

	res := svc.DeleteFolder(root, "f1")
	if !res.Success {
		t.Fatalf("expected success, got %v", res.Error)
	}
	if fs.Exists(f1) {
		t.Error("folder should be removed from disk recursively")
	}
	if !fs.Exists(filepath.Join(root, "keep.json")) {
		t.Error("sibling request must survive")
	}
	for _, id := range []string{"f1", "f2", "ra", "rb"} {
		if _, err := fs.FindByUUID(id); err == nil {
			t.Errorf("index entry %q should be gone after DeleteFolder", id)
		}
	}
	if _, err := fs.FindByUUID("rk"); err != nil {
		t.Errorf("unrelated index entry must remain: %v", err)
	}
}

func TestDeleteFolder_UUIDAfterRestart(t *testing.T) {
	_, fs, root := setupCollectionService(t)
	writeFolder(t, fs, filepath.Join(root, "f1"), "f1", "F1")

	// Fresh FileSystem + service simulates an app restart: only GetTree repopulates the index.
	fs2 := storage.NewFileSystem()
	svc2 := service.NewCollectionService(fs2, slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError})))
	if res := svc2.GetTree(root); !res.Success {
		t.Fatalf("GetTree: %v", res.Error)
	}
	if res := svc2.DeleteFolder(root, "f1"); !res.Success {
		t.Fatalf("expected success after restart, got %v", res.Error)
	}
	if fs2.Exists(filepath.Join(root, "f1")) {
		t.Error("folder should be deleted")
	}
}

func TestDeleteFolder_Guards(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	fs.WriteJSON(filepath.Join(root, "req.json"), createTestRequest("r1", "R", "GET"))
	writeFolder(t, fs, filepath.Join(root, "environments"), "env-folder", "Env")
	outside := t.TempDir()
	writeFolder(t, fs, filepath.Join(outside, "ext"), "ext", "Ext")
	svc.GetTree(root)
	fs.IndexSet("ext", filepath.Join(outside, "ext"))
	fs.IndexSet("env-folder", filepath.Join(root, "environments"))
	fs.IndexSet("root-id", root)

	cases := []struct {
		name, id, root, wantCode string
	}{
		{"empty id", "", root, model.ErrValidation},
		{"empty root", "r1", "", model.ErrValidation},
		{"unknown id", "nope", root, model.ErrNotFound},
		{"request uuid is not a folder", "r1", root, model.ErrValidation},
		{"collection root itself", "root-id", root, model.ErrValidation},
		{"environments dir", "env-folder", root, model.ErrValidation},
		{"outside root", "ext", root, model.ErrValidation},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := svc.DeleteFolder(tc.root, tc.id)
			if res.Success {
				t.Fatalf("expected error")
			}
			if res.Error == nil || res.Error.Code != tc.wantCode {
				t.Errorf("expected code %s, got %+v", tc.wantCode, res.Error)
			}
		})
	}

	for _, p := range []string{
		filepath.Join(root, "req.json"),
		filepath.Join(root, "environments"),
		filepath.Join(outside, "ext"),
		root,
	} {
		if !fs.Exists(p) {
			t.Errorf("%s must not be deleted", p)
		}
	}
}

func TestMoveRequest(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1", "Folder 1")

	req1 := createTestRequest("r1", "Req 1", "GET")
	fs.WriteJSON(filepath.Join(root, "r1.json"), req1)

	// Build index
	if res := svc.GetTree(root); !res.Success {
		t.Fatalf("GetTree failed: %v", res.Error)
	}

	// Move into folder
	if res := svc.MoveRequest(root, "r1", "f1"); !res.Success {
		t.Fatalf("expected success moving to folder, got %v", res.Error)
	}
	if !fs.Exists(filepath.Join(f1, "r1.json")) {
		t.Errorf("request not moved to f1")
	}

	// Rebuild index
	svc.GetTree(root)

	// Move from folder to root
	if res := svc.MoveRequest(root, "r1", ""); !res.Success {
		t.Fatalf("expected success moving to root, got %v", res.Error)
	}
	if !fs.Exists(filepath.Join(root, "r1.json")) {
		t.Errorf("request not moved to root")
	}

	// Rebuild index
	svc.GetTree(root)

	// Move with invalid target
	if res := svc.MoveRequest(root, "r1", "r1"); res.Success {
		t.Errorf("expected failure when target is request")
	}
	if res := svc.MoveRequest(root, "r1", "not-found"); res.Success {
		t.Errorf("expected failure when target not found")
	}
}

func TestGetTree_Symlink(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Create a folder and a request
	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1", "Folder 1")
	fs.WriteJSON(filepath.Join(f1, "r1.json"), createTestRequest("r1", "Req 1", ""))

	// Create symlink to root
	symlinkPath := filepath.Join(root, "link_to_root")
	if err := os.Symlink(root, symlinkPath); err != nil {
		t.Skipf("symlink not supported on this OS/FS: %v", err)
	}

	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("expected success with symlink, got %v", res.Error)
	}

	nodes := res.Data.([]model.TreeNode)
	if len(nodes) != 1 {
		t.Errorf("expected 1 node, got %d. Symlinks should not be traversed.", len(nodes))
	}
}

func TestRenameFolder_Success(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1", "Old Name")

	// Folder tạo ngoài app sau GetTree, gọi RenameFolder(id) -> Fallback walk
	fs.SetCollectionRoot(root) // enable fallback walk

	res := svc.RenameFolder("f1", "New Name")
	if !res.Success {
		t.Fatalf("expected success, got %v", res.Error)
	}

	var folder model.Folder
	fs.ReadJSON(filepath.Join(f1, "_folder.json"), &folder)
	if folder.Name != "New Name" {
		t.Errorf("expected New Name, got %s", folder.Name)
	}
}

func TestRenameFolder_Validation(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1", "Old Name")
	fs.IndexSet("f1", f1)

	res := svc.RenameFolder("f1", "   ")
	if res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
		t.Fatalf("expected ErrValidation, got %+v", res)
	}
}

func TestRenameFolder_Truncate(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1", "Old Name")
	fs.IndexSet("f1", f1)

	longName := strings.Repeat("A", 300)

	res := svc.RenameFolder("f1", longName)
	if !res.Success {
		t.Fatalf("expected success, got %+v", res.Error)
	}

	var folder model.Folder
	fs.ReadJSON(filepath.Join(f1, "_folder.json"), &folder)
	if len([]rune(folder.Name)) != 255 {
		t.Errorf("expected 255 runes, got %d", len([]rune(folder.Name)))
	}
}

func TestDeepNested_Operations(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Create 4 levels of folders
	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1", "L1")
	f2 := filepath.Join(f1, "f2")
	writeFolder(t, fs, f2, "f2", "L2")
	f3 := filepath.Join(f2, "f3")
	writeFolder(t, fs, f3, "f3", "L3")
	f4 := filepath.Join(f3, "f4")
	writeFolder(t, fs, f4, "f4", "L4")

	svc.GetTree(root)

	// Create request at L4
	res := svc.CreateRequest(root, "f4")
	if !res.Success {
		t.Fatalf("CreateRequest failed at L4: %v", res.Error)
	}

	reqNode := res.Data.(model.TreeNode)

	// Rename request at L4
	reqSvc := service.NewRequestService(fs, slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelError})))
	if res := reqSvc.Rename(reqNode.ID, "Deep Req"); !res.Success {
		t.Fatalf("Rename request failed at L4: %v", res.Error)
	}

	// Move request to L2
	if res := svc.MoveRequest(root, reqNode.ID, "f2"); !res.Success {
		t.Fatalf("MoveRequest failed from L4 to L2: %v", res.Error)
	}

	reqPath, _ := fs.FindByUUID(reqNode.ID)
	if filepath.Dir(reqPath) != f2 {
		t.Errorf("Expected request to be in %s, got %s", f2, reqPath)
	}
}

func TestRenameFolder_AfterIndexRebuild(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	// Create folder
	f1 := filepath.Join(root, "f1")
	writeFolder(t, fs, f1, "f1-uuid", "Old Name")

	// Empty index
	fs.IndexDeleteByPrefix(root)

	// Trigger rebuild via GetTree
	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("expected GetTree success, got %v", res.Error)
	}

	// Rename folder
	renameRes := svc.RenameFolder("f1-uuid", "New Name")
	if !renameRes.Success {
		t.Fatalf("expected RenameFolder success, got %v", renameRes.Error)
	}

	// Check if renamed
	newTreeRes := svc.GetTree(root)
	nodes := newTreeRes.Data.([]model.TreeNode)
	found := false
	for _, n := range nodes {
		if n.ID == "f1-uuid" && n.Name == "New Name" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Folder not renamed correctly")
	}
}

func TestFolder_Headers_CRUD(t *testing.T) {
	svc, _, root := setupCollectionService(t)

	// Create folder
	res := svc.CreateFolder(root, "")
	if !res.Success {
		t.Fatalf("CreateFolder failed: %v", res.Error)
	}
	node := res.Data.(model.TreeNode)

	// Load folder
	loadRes := svc.LoadFolder(node.ID)
	if !loadRes.Success {
		t.Fatalf("LoadFolder failed: %v", loadRes.Error)
	}
	folder := loadRes.Data.(model.Folder)
	if folder.Headers == nil {
		t.Fatalf("expected Headers not to be nil")
	}

	// Update folder with headers
	folder.Headers = []model.KVPair{
		{Key: "X-Custom", Value: "123", Enabled: true},
		{Key: "Authorization", Value: "Bearer token", Enabled: false},
	}
	updRes := svc.UpdateFolder(folder)
	if !updRes.Success {
		t.Fatalf("UpdateFolder failed: %v", updRes.Error)
	}

	// Reload folder and verify
	loadRes2 := svc.LoadFolder(node.ID)
	if !loadRes2.Success {
		t.Fatalf("LoadFolder reload failed: %v", loadRes2.Error)
	}
	folder2 := loadRes2.Data.(model.Folder)
	if len(folder2.Headers) != 2 {
		t.Fatalf("expected 2 headers, got %d", len(folder2.Headers))
	}
	if folder2.Headers[0].Key != "X-Custom" || folder2.Headers[0].Value != "123" || !folder2.Headers[0].Enabled {
		t.Errorf("header 0 mismatch: %+v", folder2.Headers[0])
	}

	// Verify GetTree includes headers in TreeNode
	treeRes := svc.GetTree(root)
	if !treeRes.Success {
		t.Fatalf("GetTree failed: %v", treeRes.Error)
	}
	treeNodes := treeRes.Data.([]model.TreeNode)
	if len(treeNodes) == 0 {
		t.Fatalf("expected at least 1 node in tree")
	}
	if len(treeNodes[0].Headers) != 2 {
		t.Fatalf("expected tree node to have 2 headers, got %d", len(treeNodes[0].Headers))
	}
}

func TestFolderAndRequest_Auth_CRUD(t *testing.T) {
	svc, _, root := setupCollectionService(t)

	// Create folder
	createRes := svc.CreateFolder(root, "")
	if !createRes.Success {
		t.Fatalf("CreateFolder failed: %v", createRes.Error)
	}
	folderNode := createRes.Data.(model.TreeNode)
	if folderNode.Auth == nil || folderNode.Auth.Type != "inherit" {
		t.Fatalf("expected folder default Auth type inherit, got %+v", folderNode.Auth)
	}

	// Load folder
	loadRes := svc.LoadFolder(folderNode.ID)
	if !loadRes.Success {
		t.Fatalf("LoadFolder failed: %v", loadRes.Error)
	}
	folder := loadRes.Data.(model.Folder)
	if folder.Auth == nil || folder.Auth.Type != "inherit" {
		t.Fatalf("expected loaded folder Auth inherit, got %+v", folder.Auth)
	}

	// Update folder with Bearer Auth
	folder.Auth = &model.AuthConfig{
		Type: "bearer",
		Bearer: &model.BearerAuth{
			Token: "test-token-123",
		},
	}
	updRes := svc.UpdateFolder(folder)
	if !updRes.Success {
		t.Fatalf("UpdateFolder failed: %v", updRes.Error)
	}

	// Reload folder and verify
	loadRes2 := svc.LoadFolder(folderNode.ID)
	if !loadRes2.Success {
		t.Fatalf("LoadFolder reload failed: %v", loadRes2.Error)
	}
	folder2 := loadRes2.Data.(model.Folder)
	if folder2.Auth == nil || folder2.Auth.Type != "bearer" || folder2.Auth.Bearer == nil || folder2.Auth.Bearer.Token != "test-token-123" {
		t.Fatalf("expected Bearer Auth with token test-token-123, got %+v", folder2.Auth)
	}

	// Create request in folder
	reqRes := svc.CreateRequest(root, folderNode.ID)
	if !reqRes.Success {
		t.Fatalf("CreateRequest failed: %v", reqRes.Error)
	}

	// Verify GetTree returns Auth for both folder and request
	treeRes := svc.GetTree(root)
	if !treeRes.Success {
		t.Fatalf("GetTree failed: %v", treeRes.Error)
	}
	treeNodes := treeRes.Data.([]model.TreeNode)
	if len(treeNodes) == 0 {
		t.Fatalf("expected at least 1 node in tree")
	}
	if treeNodes[0].Auth == nil || treeNodes[0].Auth.Type != "bearer" {
		t.Fatalf("expected folder tree node to have Bearer auth, got %+v", treeNodes[0].Auth)
	}
	if len(treeNodes[0].Children) == 0 {
		t.Fatalf("expected folder to have 1 child request")
	}
	childReq := treeNodes[0].Children[0]
	if childReq.Auth == nil || childReq.Auth.Type != "inherit" {
		t.Fatalf("expected request tree node to have inherit auth, got %+v", childReq.Auth)
	}

	// Update folder to APIKey Auth
	folder.Auth = &model.AuthConfig{
		Type: "apiKey",
		APIKey: &model.APIKeyAuth{
			Key:   "X-API-KEY",
			Value: "my-val",
			AddTo: "header",
		},
	}
	svc.UpdateFolder(folder)
	loadRes3 := svc.LoadFolder(folderNode.ID)
	folder3 := loadRes3.Data.(model.Folder)
	if folder3.Auth == nil || folder3.Auth.Type != "apiKey" || folder3.Auth.APIKey.Key != "X-API-KEY" {
		t.Fatalf("expected apiKey Auth, got %+v", folder3.Auth)
	}
}

func TestLegacyFiles_WithoutAuth_DefaultsToInherit(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	// Create legacy folder JSON without "auth" key
	fDir := filepath.Join(root, "legacy-folder")
	fs.MakeDir(fDir)
	rawFolderJSON := `{"id":"leg-folder","name":"Legacy Folder","created_at":"2026-01-01T00:00:00Z"}`
	os.WriteFile(filepath.Join(fDir, "_folder.json"), []byte(rawFolderJSON), 0644)

	// Create legacy request JSON without "auth" key
	rawReqJSON := `{"id":"leg-req","name":"Legacy Req","method":"GET","url":"https://example.com","created_at":"2026-01-01T00:00:00Z"}`
	os.WriteFile(filepath.Join(fDir, "req.json"), []byte(rawReqJSON), 0644)

	// Build tree
	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("GetTree failed: %v", res.Error)
	}

	nodes := res.Data.([]model.TreeNode)
	if len(nodes) != 1 {
		t.Fatalf("expected 1 folder node, got %d", len(nodes))
	}
	if nodes[0].Auth == nil || nodes[0].Auth.Type != "inherit" {
		t.Errorf("expected legacy folder auth to default to inherit, got %+v", nodes[0].Auth)
	}
	if len(nodes[0].Children) != 1 {
		t.Fatalf("expected 1 child request, got %d", len(nodes[0].Children))
	}
	if nodes[0].Children[0].Auth == nil || nodes[0].Children[0].Auth.Type != "inherit" {
		t.Errorf("expected legacy request auth to default to inherit, got %+v", nodes[0].Children[0].Auth)
	}

	// Verify LoadFolder also defaults Auth to inherit
	loadRes := svc.LoadFolder("leg-folder")
	if !loadRes.Success {
		t.Fatalf("LoadFolder failed: %v", loadRes.Error)
	}
	loadedFolder := loadRes.Data.(model.Folder)
	if loadedFolder.Auth == nil || loadedFolder.Auth.Type != "inherit" {
		t.Errorf("expected loaded legacy folder auth to be inherit, got %+v", loadedFolder.Auth)
	}
}

func TestCollection_Create(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	collectionsRoot := filepath.Join(root, "collections")

	// 1. Validation error: empty name
	resEmpty := svc.CreateCollection(collectionsRoot, "")
	if resEmpty.Success || resEmpty.Error == nil || resEmpty.Error.Code != model.ErrValidation {
		t.Fatalf("expected VALIDATION error for empty name, got %+v", resEmpty)
	}

	// 2. Success: "Dự án Alpha"
	res := svc.CreateCollection(collectionsRoot, "Dự án Alpha")
	if !res.Success {
		t.Fatalf("expected success, got error: %+v", res.Error)
	}

	coll, ok := res.Data.(model.Collection)
	if !ok {
		t.Fatalf("expected model.Collection, got %T", res.Data)
	}

	if len(coll.ID) != 36 {
		t.Errorf("expected 36-character UUID ID, got %q", coll.ID)
	}
	if coll.Name != "Dự án Alpha" {
		t.Errorf("expected Name 'Dự án Alpha', got %q", coll.Name)
	}
	if coll.IsDefault {
		t.Errorf("expected IsDefault false")
	}
	if coll.IsActive {
		t.Errorf("expected IsActive false")
	}

	// Verify disk layout
	collDir := filepath.Join(collectionsRoot, coll.ID)
	metaPath := filepath.Join(collDir, "collection.json")
	if !fs.Exists(metaPath) {
		t.Errorf("expected collection.json to exist at %s", metaPath)
	}
	envDir := filepath.Join(collDir, "environments")
	if !fs.Exists(envDir) {
		t.Errorf("expected environments/ to exist at %s", envDir)
	}
}

func TestCollection_List(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	collectionsRoot := filepath.Join(root, "collections")

	// Empty dir -> empty list
	resEmpty := svc.ListCollections(collectionsRoot, "default")
	if !resEmpty.Success {
		t.Fatalf("expected success, got %v", resEmpty.Error)
	}
	emptyList := resEmpty.Data.([]model.Collection)
	if len(emptyList) != 0 {
		t.Errorf("expected 0 collections, got %d", len(emptyList))
	}

	// Create default collection manually
	defaultDir := filepath.Join(collectionsRoot, "default")
	fs.MakeDir(defaultDir)
	defaultColl := model.Collection{
		ID:        "default",
		Name:      "Default Collection",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	fs.WriteJSON(filepath.Join(defaultDir, "collection.json"), defaultColl)

	// Create collection B and collection A
	resB := svc.CreateCollection(collectionsRoot, "B Project")
	if !resB.Success {
		t.Fatal(resB.Error)
	}
	collB := resB.Data.(model.Collection)

	resA := svc.CreateCollection(collectionsRoot, "A Project")
	if !resA.Success {
		t.Fatal(resA.Error)
	}
	collA := resA.Data.(model.Collection)

	// Create hidden and .backup directories containing collection.json — should be ignored
	hiddenDir := filepath.Join(collectionsRoot, ".hidden-coll")
	fs.MakeDir(hiddenDir)
	fs.WriteJSON(filepath.Join(hiddenDir, "collection.json"), model.Collection{ID: "hidden", Name: "Hidden"})
	backupDir := filepath.Join(collectionsRoot, "default.backup-123456")
	fs.MakeDir(backupDir)
	fs.WriteJSON(filepath.Join(backupDir, "collection.json"), model.Collection{ID: "default", Name: "Backup"})

	// List with active = collA.ID
	resList := svc.ListCollections(collectionsRoot, collA.ID)
	if !resList.Success {
		t.Fatalf("ListCollections failed: %v", resList.Error)
	}

	list := resList.Data.([]model.Collection)
	if len(list) != 3 {
		t.Fatalf("expected 3 collections, got %d", len(list))
	}

	// default should be first
	if !list[0].IsDefault || list[0].ID != "default" {
		t.Errorf("expected default collection first, got %+v", list[0])
	}
	if list[0].IsActive {
		t.Errorf("default should not be active")
	}

	// then A Project
	if list[1].ID != collA.ID || list[1].Name != "A Project" {
		t.Errorf("expected A Project second, got %+v", list[1])
	}
	if !list[1].IsActive {
		t.Errorf("A Project should be active")
	}

	// then B Project
	if list[2].ID != collB.ID || list[2].Name != "B Project" {
		t.Errorf("expected B Project third, got %+v", list[2])
	}
	if list[2].IsActive {
		t.Errorf("B Project should not be active")
	}
}

func TestCollection_Rename(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	collectionsRoot := filepath.Join(root, "collections")

	resCreate := svc.CreateCollection(collectionsRoot, "Old Name")
	if !resCreate.Success {
		t.Fatal(resCreate.Error)
	}
	coll := resCreate.Data.(model.Collection)

	// 1. Validation errors
	resErr1 := svc.RenameCollection(collectionsRoot, "", "New Name")
	if resErr1.Success || resErr1.Error.Code != model.ErrValidation {
		t.Errorf("expected validation error for empty id")
	}

	resErr2 := svc.RenameCollection(collectionsRoot, coll.ID, "   ")
	if resErr2.Success || resErr2.Error.Code != model.ErrValidation {
		t.Errorf("expected validation error for empty new name")
	}

	// 2. Not found error
	resNotFound := svc.RenameCollection(collectionsRoot, "non-existent-id", "New Name")
	if resNotFound.Success || resNotFound.Error.Code != model.ErrNotFound {
		t.Errorf("expected NOT_FOUND for non-existent id, got %+v", resNotFound)
	}

	// 3. Success rename
	resRename := svc.RenameCollection(collectionsRoot, coll.ID, "Brand New Name")
	if !resRename.Success {
		t.Fatalf("Rename failed: %v", resRename.Error)
	}
	renamed := resRename.Data.(model.Collection)
	if renamed.Name != "Brand New Name" {
		t.Errorf("expected Name 'Brand New Name', got %q", renamed.Name)
	}

	// Verify AD-4: directory on disk did NOT change
	oldDirPath := filepath.Join(collectionsRoot, coll.ID)
	if !fs.Exists(oldDirPath) {
		t.Errorf("expected directory on disk to remain unchanged at %s", oldDirPath)
	}

	// Verify collection.json has updated name
	var readColl model.Collection
	if err := fs.ReadJSON(filepath.Join(oldDirPath, "collection.json"), &readColl); err != nil {
		t.Fatal(err)
	}
	if readColl.Name != "Brand New Name" {
		t.Errorf("expected name in collection.json to be 'Brand New Name', got %q", readColl.Name)
	}
}

func TestCollection_Delete(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	collectionsRoot := filepath.Join(root, "collections")

	// 1. Delete default -> VALIDATION error
	resDelDefault := svc.DeleteCollection(collectionsRoot, "default")
	if resDelDefault.Success || resDelDefault.Error.Code != model.ErrValidation {
		t.Errorf("expected VALIDATION error deleting default, got %+v", resDelDefault)
	}

	// 2. Delete non-existent -> NOT_FOUND
	resNotFound := svc.DeleteCollection(collectionsRoot, "non-existent")
	if resNotFound.Success || resNotFound.Error.Code != model.ErrNotFound {
		t.Errorf("expected NOT_FOUND deleting non-existent, got %+v", resNotFound)
	}

	// 3. Success delete regular collection
	resCreate := svc.CreateCollection(collectionsRoot, "To Delete")
	if !resCreate.Success {
		t.Fatal(resCreate.Error)
	}
	coll := resCreate.Data.(model.Collection)
	collDir := filepath.Join(collectionsRoot, coll.ID)
	if !fs.Exists(collDir) {
		t.Fatal("collection dir should exist")
	}

	resDel := svc.DeleteCollection(collectionsRoot, coll.ID)
	if !resDel.Success {
		t.Fatalf("DeleteCollection failed: %v", resDel.Error)
	}
	if fs.Exists(collDir) {
		t.Errorf("collection dir should have been deleted from disk")
	}
}

func TestCollection_Duplicate(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	collectionsRoot := filepath.Join(root, "collections")

	// 1. Not found
	resNotFound := svc.DuplicateCollection(collectionsRoot, "non-existent")
	if resNotFound.Success || resNotFound.Error.Code != model.ErrNotFound {
		t.Errorf("expected NOT_FOUND for non-existent duplicate, got %+v", resNotFound)
	}

	// 2. Create collection with subfolder and request
	resCreate := svc.CreateCollection(collectionsRoot, "My Project")
	if !resCreate.Success {
		t.Fatal(resCreate.Error)
	}
	origColl := resCreate.Data.(model.Collection)
	origDir := filepath.Join(collectionsRoot, origColl.ID)

	// Add a folder inside orig
	resFolder := svc.CreateFolder(origDir, "")
	if !resFolder.Success {
		t.Fatal(resFolder.Error)
	}
	folderNode := resFolder.Data.(model.TreeNode)

	// Add a request inside that folder
	resReq := svc.CreateRequest(origDir, folderNode.ID)
	if !resReq.Success {
		t.Fatal(resReq.Error)
	}
	reqNode := resReq.Data.(model.TreeNode)

	// Set variables on origColl
	resUpd := svc.UpdateCollection(collectionsRoot, model.Collection{
		ID:        origColl.ID,
		Name:      origColl.Name,
		Variables: []model.KVPair{{Key: "collKey", Value: "collVal", Enabled: true}},
	})
	if !resUpd.Success {
		t.Fatal(resUpd.Error)
	}

	// Duplicate collection
	resDup := svc.DuplicateCollection(collectionsRoot, origColl.ID)
	if !resDup.Success {
		t.Fatalf("DuplicateCollection failed: %v", resDup.Error)
	}

	dupColl := resDup.Data.(model.Collection)
	if dupColl.ID == origColl.ID {
		t.Errorf("expected different ID for duplicate")
	}
	if dupColl.Name != "My Project (bản sao)" {
		t.Errorf("expected Name 'My Project (bản sao)', got %q", dupColl.Name)
	}
	if len(dupColl.Variables) != 1 || dupColl.Variables[0].Key != "collKey" {
		t.Errorf("expected duplicated collection to retain variables, got: %+v", dupColl.Variables)
	}

	// Verify files in duplicated collection directory
	dupDir := filepath.Join(collectionsRoot, dupColl.ID)
	if !fs.Exists(dupDir) {
		t.Fatalf("expected dupDir to exist at %s", dupDir)
	}

	// Verify environments/ exists in duplicate
	if !fs.Exists(filepath.Join(dupDir, "environments")) {
		t.Errorf("expected environments/ to exist in duplicated collection")
	}

	// Verify duplicated folder and request exist in tree
	relFolder, _ := filepath.Rel(origDir, folderNode.Path)
	dupFolderPath := filepath.Join(dupDir, relFolder)
	if !fs.Exists(dupFolderPath) {
		t.Errorf("expected duplicated folder to exist at %s", dupFolderPath)
	}

	relReq, _ := filepath.Rel(origDir, reqNode.Path)
	dupReqPath := filepath.Join(dupDir, relReq)
	if !fs.Exists(dupReqPath) {
		t.Errorf("expected duplicated request to exist at %s", dupReqPath)
	}
}

func TestCollection_ValidationAndEdgeCases(t *testing.T) {
	svc, fs, root := setupCollectionService(t)
	collectionsRoot := filepath.Join(root, "collections")
	_ = fs.MakeDir(collectionsRoot)

	// 1. collectionsRoot == "" returns ErrValidation with ErrCollectionRootEmpty
	for _, fn := range []struct {
		name string
		res  model.Result
	}{
		{"delete", svc.DeleteCollection("", "some-slug")},
		{"rename", svc.RenameCollection("", "some-slug", "New Name")},
		{"duplicate", svc.DuplicateCollection("", "some-slug")},
		{"switch", svc.SwitchCollection("", "some-slug")},
		{"create", svc.CreateCollection("", "New Name")},
	} {
		if fn.res.Success || fn.res.Error == nil || fn.res.Error.Code != model.ErrValidation || fn.res.Error.Message != service.ErrCollectionRootEmpty {
			t.Errorf("%s with empty collectionsRoot expected validation error %q, got %+v", fn.name, service.ErrCollectionRootEmpty, fn.res)
		}
	}

	// 2. Traversal or invalid ID returns ErrValidation
	traversalIDs := []string{".", "..", "foo/bar", "foo\\bar", "../escape", "/root"}
	for _, badID := range traversalIDs {
		if res := svc.DeleteCollection(collectionsRoot, badID); res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
			t.Errorf("DeleteCollection with %q expected ErrValidation, got %+v", badID, res)
		}
		if res := svc.RenameCollection(collectionsRoot, badID, "Valid Name"); res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
			t.Errorf("RenameCollection with %q expected ErrValidation, got %+v", badID, res)
		}
		if res := svc.DuplicateCollection(collectionsRoot, badID); res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
			t.Errorf("DuplicateCollection with %q expected ErrValidation, got %+v", badID, res)
		}
		if res := svc.SwitchCollection(collectionsRoot, badID); res.Success || res.Error == nil || res.Error.Code != model.ErrValidation {
			t.Errorf("SwitchCollection with %q expected ErrValidation, got %+v", badID, res)
		}
	}

	// 3. RenameCollection sets IsDefault = true when id == "default"
	defaultDir := filepath.Join(collectionsRoot, "default")
	_ = fs.MakeDir(defaultDir)
	_ = fs.WriteJSON(filepath.Join(defaultDir, "collection.json"), model.Collection{
		ID:   "default",
		Name: "Default Collection",
	})
	renamedDefault := svc.RenameCollection(collectionsRoot, "default", "New Default Name")
	if !renamedDefault.Success {
		t.Fatalf("RenameCollection default failed: %+v", renamedDefault)
	}
	collDefault := renamedDefault.Data.(model.Collection)
	if !collDefault.IsDefault {
		t.Errorf("expected IsDefault == true on renamed default collection")
	}

	// 4. ListCollections populates ID = folder name if ID is empty in collection.json
	noIDDir := filepath.Join(collectionsRoot, "no-id-folder")
	_ = fs.MakeDir(noIDDir)
	_ = fs.WriteJSON(filepath.Join(noIDDir, "collection.json"), map[string]interface{}{
		"name": "No ID Coll",
	})
	listRes := svc.ListCollections(collectionsRoot, "default")
	if !listRes.Success {
		t.Fatalf("ListCollections failed: %+v", listRes)
	}
	list := listRes.Data.([]model.Collection)
	foundNoID := false
	for _, c := range list {
		if c.ID == "no-id-folder" {
			foundNoID = true
			if c.Name != "No ID Coll" {
				t.Errorf("expected coll.Name == 'No ID Coll', got %q", c.Name)
			}
		}
	}
	if !foundNoID {
		t.Errorf("expected to find no-id-folder in ListCollections")
	}
}

func TestUpdateFolder_FolderEnvs_Persistence(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	folderID := "f-test-envs-1"
	folderPath := filepath.Join(root, "my-folder")
	if err := fs.MakeDir(folderPath); err != nil {
		t.Fatalf("MakeDir failed: %v", err)
	}

	initialFolder := model.Folder{
		ID:        folderID,
		Name:      "My Folder",
		Variables: []model.KVPair{{Key: "f_global", Value: "100", Enabled: true}},
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	if err := fs.WriteJSON(filepath.Join(folderPath, "_folder.json"), initialFolder); err != nil {
		t.Fatalf("WriteJSON failed: %v", err)
	}
	fs.IndexSet(folderID, folderPath)

	folderEnvsToUpdate := map[string][]model.KVPair{
		"env-dev": {
			{Key: "apiUrl", Value: "https://dev.api.internal", Enabled: true},
			{Key: "debug", Value: "true", Enabled: false},
		},
		"env-prod": {
			{Key: "apiUrl", Value: "https://api.company.com", Enabled: true},
		},
	}

	updatePayload := model.Folder{
		ID:         folderID,
		Variables:  []model.KVPair{{Key: "f_global", Value: "200", Enabled: true}},
		FolderEnvs: folderEnvsToUpdate,
		Headers:    []model.KVPair{{Key: "X-Folder", Value: "test", Enabled: true}},
	}

	res := svc.UpdateFolder(updatePayload)
	if !res.Success {
		t.Fatalf("UpdateFolder failed: %+v", res.Error)
	}

	updated, ok := res.Data.(model.Folder)
	if !ok {
		t.Fatalf("expected model.Folder, got %T", res.Data)
	}
	if len(updated.FolderEnvs) != 2 {
		t.Fatalf("expected 2 folder_envs in response, got %d", len(updated.FolderEnvs))
	}

	// Verify persistence on disk
	var diskFolder model.Folder
	if err := fs.ReadJSON(filepath.Join(folderPath, "_folder.json"), &diskFolder); err != nil {
		t.Fatalf("failed to read disk _folder.json: %v", err)
	}

	if len(diskFolder.Variables) != 1 || diskFolder.Variables[0].Value != "200" {
		t.Errorf("expected Variables to be updated to 200, got: %+v", diskFolder.Variables)
	}
	if len(diskFolder.FolderEnvs) != 2 {
		t.Fatalf("expected 2 folder_envs on disk, got %d", len(diskFolder.FolderEnvs))
	}
	if len(diskFolder.FolderEnvs["env-dev"]) != 2 {
		t.Errorf("expected 2 env-dev vars on disk, got %d", len(diskFolder.FolderEnvs["env-dev"]))
	}
}

func TestGetTree_FolderEnvs(t *testing.T) {
	svc, fs, root := setupCollectionService(t)

	folderPath := filepath.Join(root, "tree-folder")
	_ = fs.MakeDir(folderPath)

	folder := model.Folder{
		ID:   "f-tree-1",
		Name: "Tree Folder",
		FolderEnvs: map[string][]model.KVPair{
			"env-qa": {
				{Key: "qaHost", Value: "qa.test.com", Enabled: true},
			},
		},
		CreatedAt: time.Now(),
	}
	_ = fs.WriteJSON(filepath.Join(folderPath, "_folder.json"), folder)

	res := svc.GetTree(root)
	if !res.Success {
		t.Fatalf("GetTree failed: %+v", res.Error)
	}

	nodes := res.Data.([]model.TreeNode)
	if len(nodes) != 1 {
		t.Fatalf("expected 1 node, got %d", len(nodes))
	}

	node := nodes[0]
	if len(node.FolderEnvs) != 1 {
		t.Fatalf("expected 1 FolderEnvs entry in TreeNode, got %d", len(node.FolderEnvs))
	}
	if node.FolderEnvs["env-qa"][0].Value != "qa.test.com" {
		t.Errorf("expected 'qa.test.com', got %q", node.FolderEnvs["env-qa"][0].Value)
	}
}

func TestUpdateCollection_SuccessAndPersistence(t *testing.T) {
	svc, fs, collectionsRoot := setupCollectionService(t)

	collID := "c-test-123"
	collDir := filepath.Join(collectionsRoot, collID)
	_ = fs.MakeDir(collDir)

	initialColl := model.Collection{
		ID:          collID,
		Name:        "Initial Name",
		Description: "Initial Desc",
		CreatedAt:   time.Now().Add(-1 * time.Hour),
		UpdatedAt:   time.Now().Add(-1 * time.Hour),
	}
	_ = fs.WriteJSON(filepath.Join(collDir, "collection.json"), initialColl)

	vars := []model.KVPair{
		{Key: "colVar1", Value: "val1", Enabled: true},
		{Key: "colVar2", Value: "val2", Enabled: false},
	}

	updateReq := model.Collection{
		ID:          collID,
		Name:        "Updated Name",
		Description: "Updated Desc",
		Variables:   vars,
	}

	res := svc.UpdateCollection(collectionsRoot, updateReq)
	if !res.Success {
		t.Fatalf("UpdateCollection failed: %+v", res.Error)
	}

	updated := res.Data.(model.Collection)
	if updated.Name != "Updated Name" {
		t.Errorf("expected name 'Updated Name', got %q", updated.Name)
	}
	if updated.Description != "Updated Desc" {
		t.Errorf("expected description 'Updated Desc', got %q", updated.Description)
	}
	if len(updated.Variables) != 2 {
		t.Fatalf("expected 2 variables, got %d", len(updated.Variables))
	}

	// Verify persistence on disk
	var diskColl model.Collection
	if err := fs.ReadJSON(filepath.Join(collDir, "collection.json"), &diskColl); err != nil {
		t.Fatalf("failed to read disk collection.json: %v", err)
	}

	if diskColl.Name != "Updated Name" || diskColl.Description != "Updated Desc" {
		t.Errorf("disk collection mismatch: %+v", diskColl)
	}
	if len(diskColl.Variables) != 2 || diskColl.Variables[0].Key != "colVar1" {
		t.Errorf("disk variables mismatch: %+v", diskColl.Variables)
	}
}

func TestUpdateCollection_ValidationAndErrors(t *testing.T) {
	svc, fs, collectionsRoot := setupCollectionService(t)

	collID := "valid-coll"
	collDir := filepath.Join(collectionsRoot, collID)
	_ = fs.MakeDir(collDir)
	_ = fs.WriteJSON(filepath.Join(collDir, "collection.json"), model.Collection{
		ID:   collID,
		Name: "Valid Name",
	})

	// 1. Empty root
	res := svc.UpdateCollection("", model.Collection{ID: collID, Name: "New Name"})
	if res.Success || res.Error.Code != model.ErrValidation {
		t.Errorf("expected ErrValidation for empty root, got %+v", res)
	}

	// 2. Empty ID
	res = svc.UpdateCollection(collectionsRoot, model.Collection{ID: "", Name: "New Name"})
	if res.Success || res.Error.Code != model.ErrValidation {
		t.Errorf("expected ErrValidation for empty ID, got %+v", res)
	}

	// 3. Invalid / traversal ID
	res = svc.UpdateCollection(collectionsRoot, model.Collection{ID: "../escape", Name: "New Name"})
	if res.Success || res.Error.Code != model.ErrValidation {
		t.Errorf("expected ErrValidation for traversal ID, got %+v", res)
	}

	// 4. Empty Name
	res = svc.UpdateCollection(collectionsRoot, model.Collection{ID: collID, Name: "   "})
	if res.Success || res.Error.Code != model.ErrValidation {
		t.Errorf("expected ErrValidation for empty name, got %+v", res)
	}

	// 5. Not found
	res = svc.UpdateCollection(collectionsRoot, model.Collection{ID: "non-existent-id", Name: "Name"})
	if res.Success || res.Error.Code != model.ErrNotFound {
		t.Errorf("expected ErrNotFound for non-existent ID, got %+v", res)
	}
}

func TestUpdateFolder_NotFound(t *testing.T) {
	svc, _, _ := setupCollectionService(t)
	res := svc.UpdateFolder(model.Folder{
		ID: "non-existent-folder-uuid",
		FolderEnvs: map[string][]model.KVPair{
			"env-dev": {{Key: "k", Value: "v", Enabled: true}},
		},
	})
	if res.Success || res.Error.Code != model.ErrNotFound {
		t.Errorf("expected ErrNotFound for non-existent folder, got %+v", res)
	}
}

func TestCollection_ActiveEnvID_PersistenceAndBackwardCompat(t *testing.T) {
	svc, fs, collectionsRoot := setupCollectionService(t)

	// 1. Legacy collection.json without active_env_id field
	collID := "legacy-coll"
	collDir := filepath.Join(collectionsRoot, collID)
	_ = fs.MakeDir(collDir)
	_ = fs.WriteJSON(filepath.Join(collDir, "collection.json"), map[string]interface{}{
		"id":   collID,
		"name": "Legacy Collection",
	})

	listRes := svc.ListCollections(collectionsRoot, collID)
	if !listRes.Success {
		t.Fatalf("ListCollections failed: %+v", listRes)
	}
	list := listRes.Data.([]model.Collection)
	if len(list) != 1 || list[0].ActiveEnvID != "" {
		t.Fatalf("expected ActiveEnvID '' for legacy collection, got %+v", list)
	}

	// 2. UpdateCollection sets ActiveEnvID and persists to disk
	updRes := svc.UpdateCollection(collectionsRoot, model.Collection{
		ID:          collID,
		Name:        "Legacy Collection",
		ActiveEnvID: "env-local",
	})
	if !updRes.Success {
		t.Fatalf("UpdateCollection failed: %+v", updRes)
	}
	updated := updRes.Data.(model.Collection)
	if updated.ActiveEnvID != "env-local" {
		t.Errorf("expected ActiveEnvID 'env-local', got %q", updated.ActiveEnvID)
	}

	var diskColl model.Collection
	if err := fs.ReadJSON(filepath.Join(collDir, "collection.json"), &diskColl); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}
	if diskColl.ActiveEnvID != "env-local" {
		t.Errorf("expected disk ActiveEnvID 'env-local', got %q", diskColl.ActiveEnvID)
	}

	// 3. DuplicateCollection preserves ActiveEnvID
	dupRes := svc.DuplicateCollection(collectionsRoot, collID)
	if !dupRes.Success {
		t.Fatalf("DuplicateCollection failed: %+v", dupRes)
	}
	dupColl := dupRes.Data.(model.Collection)
	if dupColl.ActiveEnvID != "env-local" {
		t.Errorf("expected duplicated collection ActiveEnvID 'env-local', got %q", dupColl.ActiveEnvID)
	}

	// 4. Clearing ActiveEnvID (setting to "") persists empty string
	clearRes := svc.UpdateCollection(collectionsRoot, model.Collection{
		ID:          collID,
		Name:        "Legacy Collection",
		ActiveEnvID: "",
	})
	if !clearRes.Success {
		t.Fatalf("UpdateCollection clear failed: %+v", clearRes)
	}
	var clearedDiskColl model.Collection
	if err := fs.ReadJSON(filepath.Join(collDir, "collection.json"), &clearedDiskColl); err != nil {
		t.Fatalf("ReadJSON failed: %v", err)
	}
	if clearedDiskColl.ActiveEnvID != "" {
		t.Errorf("expected cleared ActiveEnvID '', got %q", clearedDiskColl.ActiveEnvID)
	}
}

func TestAuthEnvs_DiskPersistence(t *testing.T) {
	svc, fs, collectionsRoot := setupCollectionService(t)

	// 1. Create collection with AuthEnvs
	collRes := svc.CreateCollection(collectionsRoot, "Auth Scope Test")
	if !collRes.Success {
		t.Fatalf("CreateCollection failed: %+v", collRes)
	}
	coll := collRes.Data.(model.Collection)

	authEnvs := map[string]*model.AuthConfig{
		"env-staging": {
			Type: "bearer",
			Bearer: &model.BearerAuth{
				Token: "token-staging-123",
			},
		},
		"env-prod": {
			Type: "basic",
			Basic: &model.BasicAuth{
				Username: "admin",
				Password: "secret-password",
			},
		},
	}
	coll.AuthEnvs = authEnvs

	updRes := svc.UpdateCollection(collectionsRoot, coll)
	if !updRes.Success {
		t.Fatalf("UpdateCollection failed: %+v", updRes)
	}

	// Verify on-disk JSON for collection.json
	collDir := filepath.Join(collectionsRoot, coll.ID)
	var diskColl model.Collection
	if err := fs.ReadJSON(filepath.Join(collDir, "collection.json"), &diskColl); err != nil {
		t.Fatalf("ReadJSON collection.json failed: %v", err)
	}
	if diskColl.AuthEnvs == nil || len(diskColl.AuthEnvs) != 2 {
		t.Fatalf("expected 2 auth_envs on disk, got %+v", diskColl.AuthEnvs)
	}
	if diskColl.AuthEnvs["env-staging"].Bearer.Token != "token-staging-123" {
		t.Errorf("unexpected staging token on disk: %s", diskColl.AuthEnvs["env-staging"].Bearer.Token)
	}

	// Verify ListCollections loads AuthEnvs
	listRes := svc.ListCollections(collectionsRoot, coll.ID)
	if !listRes.Success {
		t.Fatalf("ListCollections failed: %+v", listRes)
	}
	colls := listRes.Data.([]model.Collection)
	var foundColl *model.Collection
	for _, c := range colls {
		if c.ID == coll.ID {
			foundColl = &c
			break
		}
	}
	if foundColl == nil || foundColl.AuthEnvs == nil || foundColl.AuthEnvs["env-prod"].Basic.Username != "admin" {
		t.Errorf("expected loaded coll auth_envs to contain admin, got %+v", foundColl)
	}

	// Verify DuplicateCollection preserves AuthEnvs
	dupRes := svc.DuplicateCollection(collectionsRoot, coll.ID)
	if !dupRes.Success {
		t.Fatalf("DuplicateCollection failed: %+v", dupRes)
	}
	dupColl := dupRes.Data.(model.Collection)
	if dupColl.AuthEnvs == nil || dupColl.AuthEnvs["env-staging"].Bearer.Token != "token-staging-123" {
		t.Errorf("expected duplicated collection to have AuthEnvs, got %+v", dupColl.AuthEnvs)
	}

	// 2. Test Folder AuthEnvs persistence
	folderRes := svc.CreateFolder(collDir, "")
	if !folderRes.Success {
		t.Fatalf("CreateFolder failed: %+v", folderRes)
	}
	folderNode := folderRes.Data.(model.TreeNode)

	loadFolderRes := svc.LoadFolder(folderNode.ID)
	if !loadFolderRes.Success {
		t.Fatalf("LoadFolder failed: %+v", loadFolderRes)
	}
	folder := loadFolderRes.Data.(model.Folder)
	folderAuthEnvs := map[string]*model.AuthConfig{
		"env-dev": {
			Type: "apiKey",
			APIKey: &model.APIKeyAuth{
				Key:   "X-API-KEY",
				Value: "dev-key-999",
				AddTo: "header",
			},
		},
	}
	folder.AuthEnvs = folderAuthEnvs

	updFolderRes := svc.UpdateFolder(folder)
	if !updFolderRes.Success {
		t.Fatalf("UpdateFolder failed: %+v", updFolderRes)
	}

	// Load folder again and verify
	reloadedFolderRes := svc.LoadFolder(folderNode.ID)
	if !reloadedFolderRes.Success {
		t.Fatalf("LoadFolder failed after update: %+v", reloadedFolderRes)
	}
	reloadedFolder := reloadedFolderRes.Data.(model.Folder)
	if reloadedFolder.AuthEnvs == nil || reloadedFolder.AuthEnvs["env-dev"] == nil {
		t.Fatalf("expected reloaded folder to contain env-dev AuthEnvs, got %+v", reloadedFolder.AuthEnvs)
	}
	if reloadedFolder.AuthEnvs["env-dev"].APIKey.Value != "dev-key-999" {
		t.Errorf("expected APIKey value 'dev-key-999', got %q", reloadedFolder.AuthEnvs["env-dev"].APIKey.Value)
	}
}

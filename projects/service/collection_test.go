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
	req1 := model.Request{ID: "req1", Name: "Root Req", Method: "GET", CreatedAt: time.Now()}
	fs.WriteJSON(filepath.Join(root, "root-req.json"), req1)

	// Create folder 1
	folder1Path := filepath.Join(root, "folder1")
	fs.MakeDir(folder1Path)
	folder1 := model.Folder{ID: "f1", Name: "Folder 1", CreatedAt: time.Now()}
	fs.WriteJSON(filepath.Join(folder1Path, "_folder.json"), folder1)

	// Create request in folder 1
	req2 := model.Request{ID: "req2", Name: "Nested Req", Method: "POST", CreatedAt: time.Now()}
	fs.WriteJSON(filepath.Join(folder1Path, "nested-req.json"), req2)

	// Create folder 2 nested in folder 1
	folder2Path := filepath.Join(folder1Path, "folder2")
	fs.MakeDir(folder2Path)
	folder2 := model.Folder{ID: "f2", Name: "Folder 2", CreatedAt: time.Now()}
	fs.WriteJSON(filepath.Join(folder2Path, "_folder.json"), folder2)

	// Create request in folder 2 (3 levels deep)
	req3 := model.Request{ID: "req3", Name: "Deep Req", Method: "PUT", CreatedAt: time.Now()}
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
	req1 := model.Request{ID: "req1", Name: "Root Req", Method: "GET", CreatedAt: time.Now()}
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
	fs.WriteJSON(reqPath, model.Request{ID: "req-id"})
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
	fs.WriteJSON(filepath.Join(f1, "a.json"), model.Request{ID: "ra", Name: "A", Method: "GET"})
	fs.WriteJSON(filepath.Join(f2, "b.json"), model.Request{ID: "rb", Name: "B", Method: "GET"})
	fs.WriteJSON(filepath.Join(root, "keep.json"), model.Request{ID: "rk", Name: "K", Method: "GET"})

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
	fs.WriteJSON(filepath.Join(root, "req.json"), model.Request{ID: "r1", Name: "R", Method: "GET"})
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

	req1 := model.Request{ID: "r1", Name: "Req 1", Method: "GET"}
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
	fs.WriteJSON(filepath.Join(f1, "r1.json"), model.Request{ID: "r1", Name: "Req 1"})

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

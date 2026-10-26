package service

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

func TestFlowService_TreeIsolationAndUUIDIndexSharing(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, newSilentTestLogger())
	reqSvc := NewRequestService(fs, newSilentTestLogger())
	flowSvc := NewFlowService(fs, newSilentTestLogger())

	collRoot := filepath.Join(tmpDir, "default")
	if err := fs.MakeDir(collRoot); err != nil {
		t.Fatal(err)
	}

	// 1. Create normal Request Folder and Request in APIs tree
	fRes := collSvc.CreateFolder(collRoot, "")
	if !fRes.Success {
		t.Fatalf("CreateFolder failed: %v", fRes.Error)
	}
	reqFolder := fRes.Data.(model.TreeNode)
	collSvc.RenameFolder(reqFolder.ID, "Auth")

	rRes := collSvc.CreateRequest(collRoot, reqFolder.ID)
	if !rRes.Success {
		t.Fatalf("CreateRequest failed: %v", rRes.Error)
	}
	reqNode := rRes.Data.(model.TreeNode)
	reqSvc.Rename(reqNode.ID, "Login")

	// 2. Create FlowFolder and Flow in <collection>/flows/
	ffRes := flowSvc.CreateFlowFolderNamed(collRoot, "", "E2E Checkout")
	if !ffRes.Success {
		t.Fatalf("CreateFlowFolderNamed failed: %v", ffRes.Error)
	}
	flowFolder := ffRes.Data.(model.FlowFolder)

	flRes := flowSvc.CreateFlowWithDetails(collRoot, flowFolder.ID, model.Flow{
		Name:        "Order Payment Flow",
		Description: "End-to-end checkout flow",
		Layout:      "vertical",
		TimeoutMs:   15000,
		MaxSteps:    50,
		Nodes: []model.FlowNode{
			{
				Steps: []model.FlowStep{
					{RequestID: reqNode.ID, Enabled: true},
				},
				Branches: []model.FlowBranch{
					{
						Name:      "On Success",
						Condition: model.FlowBranchCondition{Type: "success"},
						Nodes: []model.FlowNode{
							{
								Steps: []model.FlowStep{
									{RequestID: reqNode.ID, Enabled: true},
									{RequestID: reqNode.ID, Enabled: true},
								},
							},
						},
					},
				},
			},
		},
	})
	if !flRes.Success {
		t.Fatalf("CreateFlowWithDetails failed: %v", flRes.Error)
	}
	createdFlow := flRes.Data.(model.Flow)

	// 3. Verify CollectionService.GetTree excludes flows/ completely
	collTreeRes := collSvc.GetTree(collRoot)
	if !collTreeRes.Success {
		t.Fatalf("CollectionService.GetTree failed: %v", collTreeRes.Error)
	}
	collTree := collTreeRes.Data.([]model.TreeNode)
	if len(collTree) != 1 || collTree[0].ID != reqFolder.ID {
		t.Fatalf("expected CollectionService.GetTree to contain only Auth folder, got: %+v", collTree)
	}

	// 4. Verify FlowService.GetTree returns FlowFolder and Flow with accurate step_count (1 + 2 = 3)
	// and does NOT clear Request/Folder UUIDs from FileSystem index
	flowTreeRes := flowSvc.GetTree(collRoot)
	if !flowTreeRes.Success {
		t.Fatalf("FlowService.GetTree failed: %v", flowTreeRes.Error)
	}
	flowTree := flowTreeRes.Data.([]model.FlowTreeNode)
	if len(flowTree) != 1 || flowTree[0].ID != flowFolder.ID || flowTree[0].Type != "flow_folder" {
		t.Fatalf("expected 1 FlowFolder in FlowService.GetTree, got: %+v", flowTree)
	}
	if len(flowTree[0].Children) != 1 {
		t.Fatalf("expected 1 child Flow inside FlowFolder, got: %+v", flowTree[0].Children)
	}
	flowTreeNode := flowTree[0].Children[0]
	if flowTreeNode.ID != createdFlow.ID || flowTreeNode.StepCount != 3 || flowTreeNode.Layout != "vertical" {
		t.Errorf("unexpected FlowTreeNode: %+v (want StepCount=3, Layout=vertical)", flowTreeNode)
	}

	// Prove that FlowService.GetTree did NOT clear the in-memory index of Request/Folder
	fs.SetCollectionRoot("")
	if _, err := fs.FindByUUID(reqNode.ID); err != nil {
		t.Errorf("expected Request UUID to remain in index after FlowService.GetTree: %v", err)
	}
	if _, err := fs.FindByUUID(reqFolder.ID); err != nil {
		t.Errorf("expected Request Folder UUID to remain in index after FlowService.GetTree: %v", err)
	}
	if _, err := fs.FindByUUID(createdFlow.ID); err != nil {
		t.Errorf("expected Flow UUID to be in index after FlowService.GetTree: %v", err)
	}
	if _, err := fs.FindByUUID(flowFolder.ID); err != nil {
		t.Errorf("expected FlowFolder UUID to be in index after FlowService.GetTree: %v", err)
	}

	// Prove that CollectionService.GetTree called AFTER FlowService.GetTree preserves Flow & FlowFolder UUIDs in index
	if res := collSvc.GetTree(collRoot); !res.Success {
		t.Fatalf("CollectionService.GetTree after FlowService.GetTree failed: %v", res.Error)
	}
	fs.SetCollectionRoot("")
	if _, err := fs.FindByUUID(createdFlow.ID); err != nil {
		t.Errorf("expected Flow UUID to remain in index after CollectionService.GetTree: %v", err)
	}
	if _, err := fs.FindByUUID(flowFolder.ID); err != nil {
		t.Errorf("expected FlowFolder UUID to remain in index after CollectionService.GetTree: %v", err)
	}

	// 5. Verify IndexRebuild & fallback walk FindByUUID skip flows-root but index all Flows and child FlowFolders
	if err := fs.IndexRebuild(collRoot); err != nil {
		t.Fatalf("IndexRebuild failed: %v", err)
	}
	if _, err := fs.FindByUUID("flows-root"); err == nil {
		t.Errorf("expected flows-root (_folder.json at flows/ root) NOT to be indexed in UUID index")
	}
	if _, err := fs.FindByUUID(createdFlow.ID); err != nil {
		t.Errorf("expected Flow UUID to be indexed by IndexRebuild: %v", err)
	}
	if _, err := fs.FindByUUID(flowFolder.ID); err != nil {
		t.Errorf("expected child FlowFolder UUID to be indexed by IndexRebuild: %v", err)
	}
}

func TestFlowService_CRUD_Duplicate_Move_Reorder_Sort_And_ScopeIsolation(t *testing.T) {
	tmpDir := t.TempDir()
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, newSilentTestLogger())
	reqSvc := NewRequestService(fs, newSilentTestLogger())
	flowSvc := NewFlowService(fs, newSilentTestLogger())

	collRoot := filepath.Join(tmpDir, "default")
	if err := fs.MakeDir(collRoot); err != nil {
		t.Fatal(err)
	}

	// Empty collection without flows/ dir yet -> GetTree returns empty slice
	emptyTreeRes := flowSvc.GetTree(collRoot)
	if !emptyTreeRes.Success {
		t.Fatalf("expected GetTree on fresh collection to succeed, got: %v", emptyTreeRes.Error)
	}
	if len(emptyTreeRes.Data.([]model.FlowTreeNode)) != 0 {
		t.Fatalf("expected empty flow tree initially")
	}

	// Create FlowFolders: "B Group" and "A Group"
	bGroup := flowSvc.CreateFlowFolderNamed(collRoot, "", "B Group").Data.(model.FlowFolder)
	aGroup := flowSvc.CreateFlowFolderNamed(collRoot, "", "A Group").Data.(model.FlowFolder)

	// RenameFlowFolder + GetTree verification
	renFolderRes := flowSvc.RenameFlowFolder(bGroup.ID, "B Group Renamed")
	if !renFolderRes.Success {
		t.Fatalf("RenameFlowFolder failed: %v", renFolderRes.Error)
	}
	treeAfterFolderRename := flowSvc.GetTree(collRoot).Data.([]model.FlowTreeNode)
	foundRenamedFolder := false
	for _, n := range treeAfterFolderRename {
		if n.ID == bGroup.ID && n.Name == "B Group Renamed" {
			foundRenamedFolder = true
		}
	}
	if !foundRenamedFolder {
		t.Errorf("expected RenameFlowFolder to persist 'B Group Renamed' in GetTree")
	}
	_ = flowSvc.RenameFlowFolder(bGroup.ID, "B Group")

	// Verify _folder.json on disk contains only { id, name, order, created_at, updated_at }
	bMetaPath, err := fs.FindByUUID(bGroup.ID)
	if err != nil {
		t.Fatal(err)
	}
	rawFolderBytes, err := os.ReadFile(filepath.Join(bMetaPath, "_folder.json"))
	if err != nil {
		t.Fatal(err)
	}
	var rawFolderMap map[string]interface{}
	if err := json.Unmarshal(rawFolderBytes, &rawFolderMap); err != nil {
		t.Fatal(err)
	}
	for _, forbiddenKey := range []string{"variables", "folder_envs", "headers", "auth", "auth_envs"} {
		if _, exists := rawFolderMap[forbiddenKey]; exists {
			t.Errorf("FlowFolder _folder.json must not contain %q", forbiddenKey)
		}
	}

	// Create Flows at root: "Zeta Flow" and "Alpha Flow"
	zetaFlow := flowSvc.CreateFlowWithDetails(collRoot, "", model.Flow{
		Name:   "Zeta Flow",
		Layout: "horizontal",
		Nodes: []model.FlowNode{
			{Steps: []model.FlowStep{{RequestID: "req-1", Enabled: true, TimeoutMs: 5000}}},
		},
	}).Data.(model.Flow)

	// SaveFlow + GetFlow round-trip persistence verification
	zetaFlow.Description = "Updated Zeta description"
	zetaFlow.TimeoutMs = 45000
	zetaFlow.MaxSteps = 120
	zetaFlow.Nodes = append(zetaFlow.Nodes, model.FlowNode{
		Steps: []model.FlowStep{{RequestID: "req-2", Enabled: true, TimeoutMs: 3000}},
	})
	saveRes := flowSvc.SaveFlow(zetaFlow)
	if !saveRes.Success {
		t.Fatalf("SaveFlow failed: %v", saveRes.Error)
	}
	getZetaRes := flowSvc.GetFlow(zetaFlow.ID)
	if !getZetaRes.Success {
		t.Fatalf("GetFlow after SaveFlow failed: %v", getZetaRes.Error)
	}
	persistedZeta := getZetaRes.Data.(model.Flow)
	if persistedZeta.Description != "Updated Zeta description" || persistedZeta.TimeoutMs != 45000 || persistedZeta.MaxSteps != 120 || len(persistedZeta.Nodes) != 2 {
		t.Errorf("SaveFlow + GetFlow round-trip mismatch: %+v", persistedZeta)
	}

	alphaFlow := flowSvc.CreateFlow(collRoot, "").Data.(model.Flow)
	renRes := flowSvc.RenameFlow(alphaFlow.ID, "Alpha Flow")
	if !renRes.Success {
		t.Fatalf("RenameFlow failed: %v", renRes.Error)
	}

	// Duplicate Zeta Flow -> should create "Zeta Flow (bản sao)" right after Zeta Flow
	dupRes := flowSvc.DuplicateFlow(zetaFlow.ID)
	if !dupRes.Success {
		t.Fatalf("DuplicateFlow failed: %v", dupRes.Error)
	}
	dupFlow := dupRes.Data.(model.Flow)
	if dupFlow.ID == zetaFlow.ID || dupFlow.Name != "Zeta Flow (bản sao)" {
		t.Errorf("unexpected duplicated flow: %+v", dupFlow)
	}
	if len(dupFlow.Nodes) != 2 || dupFlow.Nodes[0].ID == zetaFlow.Nodes[0].ID {
		t.Errorf("expected duplicated flow node to have a regenerated UUID")
	}
	if dupFlow.Nodes[0].Steps[0].RequestID != "req-1" {
		t.Errorf("expected duplicated flow step to preserve RequestID 'req-1'")
	}

	// ReorderNodes at root + GetTree verification
	customRootOrder := []string{dupFlow.ID, bGroup.ID, alphaFlow.ID, aGroup.ID, zetaFlow.ID}
	if reorderRootRes := flowSvc.ReorderNodes(collRoot, "", customRootOrder); !reorderRootRes.Success {
		t.Fatalf("ReorderNodes at root failed: %v", reorderRootRes.Error)
	}
	treeAfterRootReorder := flowSvc.GetTree(collRoot).Data.([]model.FlowTreeNode)
	for i, wantID := range customRootOrder {
		if treeAfterRootReorder[i].ID != wantID {
			t.Errorf("root node after ReorderNodes[%d] = %s, want %s", i, treeAfterRootReorder[i].ID, wantID)
		}
	}

	// SortNodes at root -> folders A-Z first ("A Group", "B Group"), then flows A-Z ("Alpha Flow", "Zeta Flow", "Zeta Flow (bản sao)")
	sortRes := flowSvc.SortNodes(collRoot, "")
	if !sortRes.Success {
		t.Fatalf("SortNodes failed: %v", sortRes.Error)
	}
	treeAfterSort := flowSvc.GetTree(collRoot).Data.([]model.FlowTreeNode)
	expectedOrder := []string{aGroup.ID, bGroup.ID, alphaFlow.ID, zetaFlow.ID, dupFlow.ID}
	if len(treeAfterSort) != len(expectedOrder) {
		t.Fatalf("expected %d root nodes, got %d", len(expectedOrder), len(treeAfterSort))
	}
	for i, wantID := range expectedOrder {
		if treeAfterSort[i].ID != wantID {
			t.Errorf("root node[%d] = %s (%s), want %s", i, treeAfterSort[i].ID, treeAfterSort[i].Name, wantID)
		}
	}

	// Move Alpha Flow into A Group at index 0
	moveFlowRes := flowSvc.MoveNode(collRoot, alphaFlow.ID, aGroup.ID, 0)
	if !moveFlowRes.Success {
		t.Fatalf("MoveNode (flow) failed: %v", moveFlowRes.Error)
	}
	listInA := flowSvc.ListFlows(collRoot, aGroup.ID)
	if !listInA.Success || len(listInA.Data.([]model.FlowTreeNode)) != 1 || listInA.Data.([]model.FlowTreeNode)[0].ID != alphaFlow.ID {
		t.Fatalf("expected Alpha Flow inside A Group, got: %+v", listInA.Data)
	}

	// Move B Group into A Group, then test ReorderNodes inside child folder A Group
	moveFolderRes := flowSvc.MoveNode(collRoot, bGroup.ID, aGroup.ID, 0)
	if !moveFolderRes.Success {
		t.Fatalf("MoveNode (folder B into A) failed: %v", moveFolderRes.Error)
	}
	childOrderInA := []string{alphaFlow.ID, bGroup.ID}
	if reorderChildRes := flowSvc.ReorderNodes(collRoot, aGroup.ID, childOrderInA); !reorderChildRes.Success {
		t.Fatalf("ReorderNodes in child folder failed: %v", reorderChildRes.Error)
	}
	treeWithChildOrder := flowSvc.GetTree(collRoot).Data.([]model.FlowTreeNode)
	for _, n := range treeWithChildOrder {
		if n.ID == aGroup.ID {
			if len(n.Children) != 2 || n.Children[0].ID != alphaFlow.ID || n.Children[1].ID != bGroup.ID {
				t.Errorf("expected reordered children in A Group to be [alphaFlow, bGroup], got: %+v", n.Children)
			}
		}
	}

	cycleSelfRes := flowSvc.MoveNode(collRoot, aGroup.ID, aGroup.ID, -1)
	if cycleSelfRes.Success || cycleSelfRes.Error.Code != model.ErrValidation {
		t.Errorf("expected cycle error when moving folder into itself, got: %+v", cycleSelfRes)
	}
	cycleChildRes := flowSvc.MoveNode(collRoot, aGroup.ID, bGroup.ID, -1)
	if cycleChildRes.Success || cycleChildRes.Error.Code != model.ErrValidation {
		t.Errorf("expected cycle error when moving folder into its descendant, got: %+v", cycleChildRes)
	}

	// Scope Isolation: CollectionService and RequestService must reject Flow & FlowFolder UUIDs,
	// and FlowService must reject normal Request/Folder UUIDs
	normalFolder := collSvc.CreateFolder(collRoot, "").Data.(model.TreeNode)
	normalReq := collSvc.CreateRequest(collRoot, normalFolder.ID).Data.(model.TreeNode)

	for _, id := range []string{zetaFlow.ID, aGroup.ID} {
		if res := reqSvc.Get(id); res.Success {
			t.Errorf("RequestService.Get must reject flow/flowFolder UUID %s", id)
		}
		if res := reqSvc.Save(model.Request{ID: id, Name: "Hack"}); res.Success {
			t.Errorf("RequestService.Save must reject flow/flowFolder UUID %s", id)
		}
		if res := reqSvc.Delete(id); res.Success {
			t.Errorf("RequestService.Delete must reject flow/flowFolder UUID %s", id)
		}
		if res := reqSvc.Rename(id, "Hack"); res.Success {
			t.Errorf("RequestService.Rename must reject flow/flowFolder UUID %s", id)
		}
		if res := reqSvc.Duplicate(id); res.Success {
			t.Errorf("RequestService.Duplicate must reject flow/flowFolder UUID %s", id)
		}
		if res := collSvc.MoveRequest(collRoot, id, ""); res.Success {
			t.Errorf("CollectionService.MoveRequest must reject flow/flowFolder UUID %s", id)
		}
		if res := collSvc.RenameFolder(id, "Hack"); res.Success {
			t.Errorf("CollectionService.RenameFolder must reject flow/flowFolder UUID %s", id)
		}
		if res := collSvc.LoadFolder(id); res.Success {
			t.Errorf("CollectionService.LoadFolder must reject flow/flowFolder UUID %s", id)
		}
		if res := collSvc.UpdateFolder(model.Folder{ID: id, Name: "Hack"}); res.Success {
			t.Errorf("CollectionService.UpdateFolder must reject flow/flowFolder UUID %s", id)
		}
		if res := collSvc.DeleteFolder(collRoot, id); res.Success {
			t.Errorf("CollectionService.DeleteFolder must reject flow/flowFolder UUID %s", id)
		}
	}

	if res := flowSvc.DeleteFlow(normalReq.ID); res.Success {
		t.Errorf("FlowService.DeleteFlow must not allow deleting a normal Request outside flows/")
	}
	if res := flowSvc.SaveFlow(model.Flow{ID: normalReq.ID, Name: "Hack"}); res.Success {
		t.Errorf("FlowService.SaveFlow must not allow overwriting a normal Request outside flows/")
	}
	if res := flowSvc.DeleteFlowFolder(collRoot, normalFolder.ID); res.Success {
		t.Errorf("FlowService.DeleteFlowFolder must not allow deleting a normal Folder outside flows/")
	}
	if res := reqSvc.Get(normalReq.ID); !res.Success {
		t.Errorf("normal Request should still exist intact: %v", res.Error)
	}

	// Delete dupFlow and DeleteFlowFolder aGroup (which contains bGroup and alphaFlow)
	if res := flowSvc.DeleteFlow(dupFlow.ID); !res.Success {
		t.Fatalf("DeleteFlow failed: %v", res.Error)
	}
	if res := flowSvc.DeleteFlowFolder(collRoot, aGroup.ID); !res.Success {
		t.Fatalf("DeleteFlowFolder failed: %v", res.Error)
	}
	if res := flowSvc.GetFlow(alphaFlow.ID); res.Success {
		t.Errorf("expected Alpha Flow inside deleted A Group to be removed")
	}
}

package service

import (
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"hecto-api/model"
	"hecto-api/storage"
)

func runTestGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", args...)
	cmd.Dir = dir
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %v in %s failed: %v\noutput: %s", args, dir, err, string(out))
	}
	return strings.TrimSpace(string(out))
}

func setupGitSyncTestEnv(t *testing.T) (*GitSyncService, *CollectionService, string, string) {
	t.Helper()
	tmpDir := t.TempDir()
	collectionsRoot := filepath.Join(tmpDir, "collections")
	if err := os.MkdirAll(collectionsRoot, 0755); err != nil {
		t.Fatalf("failed to create collectionsRoot: %v", err)
	}

	logger := slog.New(slog.NewTextHandler(os.Stdout, nil))
	fs := storage.NewFileSystem()
	collSvc := NewCollectionService(fs, logger)
	gitSvc := NewGitSyncService(fs, logger)

	res := collSvc.CreateCollection(collectionsRoot, "Test-Collection")
	if !res.Success {
		t.Fatalf("CreateCollection failed: %+v", res.Error)
	}
	coll := res.Data.(model.Collection)

	bareRepoDir := filepath.Join(tmpDir, "remote-bare.git")
	if err := os.MkdirAll(bareRepoDir, 0755); err != nil {
		t.Fatalf("failed to create bareRepoDir: %v", err)
	}
	runTestGit(t, bareRepoDir, "init", "--bare")

	return gitSvc, collSvc, collectionsRoot, coll.ID
}

func TestGitSyncService_SaveRemoteURLAndValidation(t *testing.T) {
	gitSvc, collSvc, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	// Reject option injection
	badRes := gitSvc.SaveRemoteURL(collectionsRoot, collID, "--upload-pack=evil")
	if badRes.Success || badRes.Error.Code != model.ErrValidation {
		t.Fatalf("expected ErrValidation for option-injected remote URL, got %+v", badRes)
	}

	// Reject path traversal in collectionID
	travRes := gitSvc.SaveRemoteURL(collectionsRoot, "../escape", bareRepoDir)
	if travRes.Success || travRes.Error.Code != model.ErrValidation {
		t.Fatalf("expected ErrValidation for path traversal collectionID, got %+v", travRes)
	}

	// Save valid remote URL
	saveRes := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir)
	if !saveRes.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", saveRes.Error)
	}
	status := saveRes.Data.(model.GitSyncStatus)
	if !status.HasGitRepo {
		t.Errorf("expected HasGitRepo=true")
	}
	if status.RemoteURL != bareRepoDir {
		t.Errorf("expected RemoteURL=%s, got %s", bareRepoDir, status.RemoteURL)
	}

	// Verify collection.json persisted git_remote_url
	listRes := collSvc.ListCollections(collectionsRoot, collID)
	colls := listRes.Data.([]model.Collection)
	if len(colls) != 1 || colls[0].GitRemoteURL != bareRepoDir {
		t.Fatalf("expected collection.json to persist GitRemoteURL=%s, got %+v", bareRepoDir, colls)
	}
}

func TestGitSyncService_PushAndPullSuccess(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	// Add a sample request file in the collection and Push
	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "req-1.json")
	if err := os.WriteFile(reqFile, []byte(`{"id":"req-1","name":"Get Users","method":"GET","url":"https://api.example.com/users"}`), 0644); err != nil {
		t.Fatalf("write req-1.json failed: %v", err)
	}

	pushRes := gitSvc.Push(collectionsRoot, collID)
	if !pushRes.Success {
		t.Fatalf("Push failed: %+v", pushRes.Error)
	}

	// Simulate collaborator cloning bareRepoDir, adding req-2.json, and pushing to bareRepoDir
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-clone")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")

	peerReq2 := filepath.Join(peerDir, "req-2.json")
	if err := os.WriteFile(peerReq2, []byte(`{"id":"req-2","name":"Create User","method":"POST","url":"https://api.example.com/users"}`), 0644); err != nil {
		t.Fatalf("write peer req-2.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "feat: add req-2 from peer")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Pull in original collection and verify req-2.json arrives on disk
	pullRes := gitSvc.Pull(collectionsRoot, collID)
	if !pullRes.Success {
		t.Fatalf("Pull failed: %+v", pullRes.Error)
	}

	pulledReq2 := filepath.Join(collDir, "req-2.json")
	if _, err := os.Stat(pulledReq2); err != nil {
		t.Fatalf("expected req-2.json to exist after Pull, got err: %v", err)
	}
}

func TestGitSyncService_PullDetectsMergeConflictAndBlocksPush(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "conflict-req.json")
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"c1\",\n  \"url\": \"https://v1.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write conflict-req.json failed: %v", err)
	}

	if pushRes := gitSvc.Push(collectionsRoot, collID); !pushRes.Success {
		t.Fatalf("initial Push failed: %+v", pushRes.Error)
	}

	// Peer clones and modifies conflict-req.json -> pushes to bare repo
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-conflict")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")

	peerReqFile := filepath.Join(peerDir, "conflict-req.json")
	if err := os.WriteFile(peerReqFile, []byte("{\n  \"id\": \"c1\",\n  \"url\": \"https://remote-v2.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer conflict-req.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "peer change url to remote-v2")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Local modifies the same line in conflict-req.json
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"c1\",\n  \"url\": \"https://local-v3.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write local conflict-req.json failed: %v", err)
	}

	// Pull should detect merge conflict and return ErrGitConflict with conflict-req.json listed
	pullRes := gitSvc.Pull(collectionsRoot, collID)
	if pullRes.Success {
		t.Fatalf("expected Pull to fail with GIT_CONFLICT, but succeeded")
	}
	if pullRes.Error == nil || pullRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected error code %s, got %+v", model.ErrGitConflict, pullRes.Error)
	}
	if !strings.Contains(pullRes.Error.Message, "conflict-req.json") {
		t.Errorf("expected conflict error message to mention conflict-req.json, got: %s", pullRes.Error.Message)
	}

	status, ok := pullRes.Data.(model.GitSyncStatus)
	if !ok || !status.HasConflicts || len(status.ConflictFiles) == 0 {
		t.Fatalf("expected GitSyncStatus with HasConflicts=true and ConflictFiles, got: %+v", pullRes.Data)
	}

	// Push must also refuse while conflict is unresolved
	pushWhileConflict := gitSvc.Push(collectionsRoot, collID)
	if pushWhileConflict.Success || pushWhileConflict.Error == nil || pushWhileConflict.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected Push to be blocked with GIT_CONFLICT while conflicts exist, got: %+v", pushWhileConflict)
	}
}

func TestGitSyncService_ClearAndPull(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	// Peer initializes remote repo with remote-only.json
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-init")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")
	if err := os.WriteFile(filepath.Join(peerDir, "collection.json"), []byte(`{"id":"`+collID+`","name":"Remote Coll"}`), 0644); err != nil {
		t.Fatalf("write peer collection.json failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(peerDir, "remote-only.json"), []byte(`{"id":"r1","name":"Remote Req"}`), 0644); err != nil {
		t.Fatalf("write remote-only.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "initial remote commit")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Local collection has an untracked local file that should be wiped by ClearAndPull
	collDir := filepath.Join(collectionsRoot, collID)
	localUntracked := filepath.Join(collDir, "local-dirty.json")
	if err := os.WriteFile(localUntracked, []byte(`{"id":"l1"}`), 0644); err != nil {
		t.Fatalf("write local-dirty.json failed: %v", err)
	}

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	clearRes := gitSvc.ClearAndPull(collectionsRoot, collID)
	if !clearRes.Success {
		t.Fatalf("ClearAndPull failed: %+v", clearRes.Error)
	}

	if _, err := os.Stat(localUntracked); !os.IsNotExist(err) {
		t.Errorf("expected local-dirty.json to be removed by ClearAndPull, stat err: %v", err)
	}
	if _, err := os.Stat(filepath.Join(collDir, "remote-only.json")); err != nil {
		t.Errorf("expected remote-only.json to exist after ClearAndPull, got err: %v", err)
	}

	// Switch to a brand new empty remote and verify ClearAndPull removes previously committed files
	emptyBareDir := filepath.Join(filepath.Dir(collectionsRoot), "empty-remote.git")
	if err := os.MkdirAll(emptyBareDir, 0755); err != nil {
		t.Fatalf("failed to create emptyBareDir: %v", err)
	}
	runTestGit(t, emptyBareDir, "init", "--bare")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, emptyBareDir); !res.Success {
		t.Fatalf("SaveRemoteURL to empty remote failed: %+v", res.Error)
	}
	clearEmptyRes := gitSvc.ClearAndPull(collectionsRoot, collID)
	if !clearEmptyRes.Success {
		t.Fatalf("ClearAndPull against empty remote failed: %+v", clearEmptyRes.Error)
	}
	if _, err := os.Stat(filepath.Join(collDir, "remote-only.json")); !os.IsNotExist(err) {
		t.Errorf("expected remote-only.json to be cleared when switching to empty remote, stat err: %v", err)
	}
}

func TestGitSyncService_StashAndPull_SuccessAndConflict(t *testing.T) {
	gitSvc, collSvc, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	// Peer initializes remote repo with shared.json
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-stash")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")
	if err := os.WriteFile(filepath.Join(peerDir, "shared.json"), []byte("{\n  \"id\": \"s1\",\n  \"url\": \"https://remote.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer shared.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "add shared.json")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	collDir := filepath.Join(collectionsRoot, collID)
	localExtra := filepath.Join(collDir, "local-extra.json")
	if err := os.WriteFile(localExtra, []byte(`{"id":"local-1"}`), 0644); err != nil {
		t.Fatalf("write local-extra.json failed: %v", err)
	}

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	// Non-conflicting StashAndPull preserves local-extra.json and brings shared.json
	stashRes := gitSvc.StashAndPull(collectionsRoot, collID)
	if !stashRes.Success {
		t.Fatalf("StashAndPull failed: %+v", stashRes.Error)
	}
	if _, err := os.Stat(localExtra); err != nil {
		t.Errorf("expected local-extra.json to be preserved after StashAndPull: %v", err)
	}
	if _, err := os.Stat(filepath.Join(collDir, "shared.json")); err != nil {
		t.Errorf("expected shared.json to exist after StashAndPull: %v", err)
	}

	// Now create a conflict on shared.json: peer updates shared.json and pushes, local also modifies shared.json uncommitted
	if err := os.WriteFile(filepath.Join(peerDir, "shared.json"), []byte("{\n  \"id\": \"s1\",\n  \"url\": \"https://remote-v2.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer shared.json v2 failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "update shared.json v2")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	if err := os.WriteFile(filepath.Join(collDir, "shared.json"), []byte("{\n  \"id\": \"s1\",\n  \"url\": \"https://local-conflict.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write local shared.json conflict failed: %v", err)
	}

	conflictRes := gitSvc.StashAndPull(collectionsRoot, collID)
	if conflictRes.Success {
		t.Fatalf("expected StashAndPull to fail with ErrGitConflict on conflicting stash pop")
	}
	if conflictRes.Error == nil || conflictRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected ErrGitConflict, got %+v", conflictRes.Error)
	}

	// Also verify untracked-file stash pop collision ("already exists, no checkout") on a fresh collection with no prior commits
	freshCreate := collSvc.CreateCollection(collectionsRoot, "Fresh-Uncommitted")
	if !freshCreate.Success {
		t.Fatalf("CreateCollection Fresh-Uncommitted failed: %+v", freshCreate.Error)
	}
	freshColl := freshCreate.Data.(model.Collection)
	freshDir := filepath.Join(collectionsRoot, freshColl.ID)
	if err := os.WriteFile(filepath.Join(freshDir, "shared.json"), []byte("{\n  \"id\": \"s1\",\n  \"url\": \"https://untracked-collision.example.com\"\n}\n"), 0644); err != nil {
		t.Fatalf("write untracked shared.json failed: %v", err)
	}
	if res := gitSvc.SaveRemoteURL(collectionsRoot, freshColl.ID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL for freshColl failed: %+v", res.Error)
	}
	untrackedConflictRes := gitSvc.StashAndPull(collectionsRoot, freshColl.ID)
	if untrackedConflictRes.Success {
		t.Fatalf("expected StashAndPull on untracked colliding shared.json to fail with ErrGitConflict")
	}
	if untrackedConflictRes.Error == nil || untrackedConflictRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected ErrGitConflict for untracked collision, got %+v", untrackedConflictRes.Error)
	}
	if !strings.Contains(untrackedConflictRes.Error.Message, "shared.json") {
		t.Errorf("expected conflict error message to list shared.json, got: %s", untrackedConflictRes.Error.Message)
	}
}

func TestGitSyncService_ListLocalBranchesAndPushToBranch(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	// First push to create initial commit & default branch
	if res := gitSvc.Push(collectionsRoot, collID); !res.Success {
		t.Fatalf("initial Push failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	runTestGit(t, collDir, "branch", "feature-branch")

	branchesRes := gitSvc.ListLocalBranches(collectionsRoot, collID)
	if !branchesRes.Success {
		t.Fatalf("ListLocalBranches failed: %+v", branchesRes.Error)
	}
	branches := branchesRes.Data.([]string)
	foundFeature := false
	for _, b := range branches {
		if b == "feature-branch" {
			foundFeature = true
			break
		}
	}
	if !foundFeature {
		t.Fatalf("expected feature-branch in ListLocalBranches, got %v", branches)
	}

	// Without checking out feature-branch (keeping HEAD on default branch, matching GitSyncModal dropdown behavior),
	// add feat.json and push to non-current local branch feature-branch
	if err := os.WriteFile(filepath.Join(collDir, "feat.json"), []byte(`{"id":"f1"}`), 0644); err != nil {
		t.Fatalf("write feat.json failed: %v", err)
	}

	pushBranchRes := gitSvc.Push(collectionsRoot, collID, "feature-branch")
	if !pushBranchRes.Success {
		t.Fatalf("Push to feature-branch failed: %+v", pushBranchRes.Error)
	}

	// Verify feature-branch exists on bare remote AND contains the newly committed feat.json
	remoteBranches := runTestGit(t, bareRepoDir, "branch", "--list", "--format=%(refname:short)")
	if !strings.Contains(remoteBranches, "feature-branch") {
		t.Fatalf("expected feature-branch on remote bare repo, got: %s", remoteBranches)
	}
	remoteFiles := runTestGit(t, bareRepoDir, "ls-tree", "--name-only", "feature-branch")
	if !strings.Contains(remoteFiles, "feat.json") {
		t.Fatalf("expected feat.json to be pushed to remote feature-branch, got tree: %s", remoteFiles)
	}

	// Verify CheckoutBranch switches to new branch
	coRes := gitSvc.CheckoutBranch(collectionsRoot, collID, "another-branch")
	if !coRes.Success {
		t.Fatalf("CheckoutBranch failed: %+v", coRes.Error)
	}
	status := coRes.Data.(model.GitSyncStatus)
	if status.Branch != "another-branch" {
		t.Fatalf("expected Branch=another-branch, got %s", status.Branch)
	}

	// Verify ListLocalBranches now includes another-branch
	branchesRes2 := gitSvc.ListLocalBranches(collectionsRoot, collID)
	if !branchesRes2.Success {
		t.Fatalf("ListLocalBranches failed: %+v", branchesRes2.Error)
	}
	branches2 := branchesRes2.Data.([]string)
	hasAnother := false
	for _, b := range branches2 {
		if b == "another-branch" {
			hasAnother = true
			break
		}
	}
	if !hasAnother {
		t.Fatalf("expected another-branch in ListLocalBranches, got %v", branches2)
	}
}

func TestGitSyncService_InitialPushAndPullWithUnrelatedHistoryAndCollectionMeta(t *testing.T) {
	gitSvc, collSvc, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	// Validate SCP-style custom SSH URL format
	if !isValidGitRemoteURL("git@github_home.com:macductan/hecto-api-data.git") {
		t.Fatalf("expected git@github_home.com:macductan/hecto-api-data.git to be valid")
	}
	if !isValidGitRemoteURL("deploy@gitlab.internal.corp:team/api-collection.git") {
		t.Fatalf("expected deploy@gitlab.internal.corp:team/api-collection.git to be valid")
	}

	// Simulate remote initialized on GitHub with README.md and a different collection.json
	seedDir := filepath.Join(filepath.Dir(collectionsRoot), "seed-remote")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, seedDir)
	runTestGit(t, seedDir, "config", "user.name", "GitHub Web")
	runTestGit(t, seedDir, "config", "user.email", "noreply@github.com")
	if err := os.WriteFile(filepath.Join(seedDir, "README.md"), []byte("# Hecto API Collection\n"), 0644); err != nil {
		t.Fatalf("write README.md failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(seedDir, "collection.json"), []byte("{\n  \"id\": \"remote-id\",\n  \"name\": \"Remote Collection\",\n  \"description\": \"Seeded on remote\"\n}\n"), 0644); err != nil {
		t.Fatalf("write remote collection.json failed: %v", err)
	}
	runTestGit(t, seedDir, "add", "-A")
	runTestGit(t, seedDir, "commit", "-m", "Initial commit")
	runTestGit(t, seedDir, "branch", "-M", "main")
	runTestGit(t, seedDir, "push", "-u", "origin", "main")

	// Local collection adds a request and configures remote URL
	collDir := filepath.Join(collectionsRoot, collID)
	if err := os.WriteFile(filepath.Join(collDir, "local-req.json"), []byte(`{"id":"lr-1","name":"Local Request"}`), 0644); err != nil {
		t.Fatalf("write local-req.json failed: %v", err)
	}

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	// Initial Push should automatically fetch, merge unrelated history, auto-resolve collection.json conflict, and push!
	pushRes := gitSvc.Push(collectionsRoot, collID)
	if !pushRes.Success {
		t.Fatalf("expected initial Push to auto-merge README.md & collection.json and succeed, got: %+v", pushRes.Error)
	}

	// Verify both README.md and local-req.json exist locally and on remote
	if _, err := os.Stat(filepath.Join(collDir, "README.md")); err != nil {
		t.Errorf("expected README.md to be merged locally after Push, got: %v", err)
	}
	remoteFiles := runTestGit(t, bareRepoDir, "ls-tree", "--name-only", "main")
	if !strings.Contains(remoteFiles, "local-req.json") || !strings.Contains(remoteFiles, "README.md") {
		t.Fatalf("expected both local-req.json and README.md on remote main, got: %s", remoteFiles)
	}

	// Also verify another fresh collection pulling from this remote auto-resolves collection.json conflict cleanly
	coll2Res := collSvc.CreateCollection(collectionsRoot, "Second-Local-Collection")
	if !coll2Res.Success {
		t.Fatalf("CreateCollection 2 failed: %+v", coll2Res.Error)
	}
	coll2 := coll2Res.Data.(model.Collection)
	if res := gitSvc.SaveRemoteURL(collectionsRoot, coll2.ID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL 2 failed: %+v", res.Error)
	}
	pullRes := gitSvc.Pull(collectionsRoot, coll2.ID)
	if !pullRes.Success {
		t.Fatalf("expected Pull on fresh collection to auto-resolve collection.json conflict and succeed, got: %+v", pullRes.Error)
	}
	coll2Dir := filepath.Join(collectionsRoot, coll2.ID)
	if _, err := os.Stat(filepath.Join(coll2Dir, "local-req.json")); err != nil {
		t.Errorf("expected local-req.json in second collection after Pull, got: %v", err)
	}
}

func TestGitSyncService_PushAutoMergesJsonFieldsAndAbortMerge(t *testing.T) {
	gitSvc, _, collectionsRoot, collID := setupGitSyncTestEnv(t)
	bareRepoDir := filepath.Join(filepath.Dir(collectionsRoot), "remote-bare.git")

	if res := gitSvc.SaveRemoteURL(collectionsRoot, collID, bareRepoDir); !res.Success {
		t.Fatalf("SaveRemoteURL failed: %+v", res.Error)
	}

	collDir := filepath.Join(collectionsRoot, collID)
	reqFile := filepath.Join(collDir, "push-merge.json")
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"pm-1\",\n  \"name\": \"Push Merge\",\n  \"method\": \"GET\",\n  \"url\": \"https://api.example.com/items\"\n}\n"), 0644); err != nil {
		t.Fatalf("write push-merge.json failed: %v", err)
	}
	if res := gitSvc.Push(collectionsRoot, collID); !res.Success {
		t.Fatalf("initial Push failed: %+v", res.Error)
	}

	// Peer updates method to POST and pushes
	peerDir := filepath.Join(filepath.Dir(collectionsRoot), "peer-push-merge")
	runTestGit(t, filepath.Dir(collectionsRoot), "clone", bareRepoDir, peerDir)
	runTestGit(t, peerDir, "config", "user.name", "Peer Dev")
	runTestGit(t, peerDir, "config", "user.email", "peer@hecto.local")
	if err := os.WriteFile(filepath.Join(peerDir, "push-merge.json"), []byte("{\n  \"id\": \"pm-1\",\n  \"name\": \"Push Merge\",\n  \"method\": \"POST\",\n  \"url\": \"https://api.example.com/items\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer push-merge.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "peer change method to POST")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	// Local updates url and calls Push directly without Pull -> Push should auto-merge and succeed!
	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"pm-1\",\n  \"name\": \"Push Merge\",\n  \"method\": \"GET\",\n  \"url\": \"https://api.example.com/v2/items\"\n}\n"), 0644); err != nil {
		t.Fatalf("write local push-merge.json failed: %v", err)
	}
	pushRes := gitSvc.Push(collectionsRoot, collID)
	if !pushRes.Success {
		t.Fatalf("expected Push to auto-merge non-overlapping fields and succeed, got: %+v", pushRes.Error)
	}

	// Now create a true conflict on url and verify AbortMerge cleanly aborts MERGE_HEAD
	runTestGit(t, peerDir, "pull", "--no-rebase")
	if err := os.WriteFile(filepath.Join(peerDir, "push-merge.json"), []byte("{\n  \"id\": \"pm-1\",\n  \"name\": \"Push Merge\",\n  \"method\": \"POST\",\n  \"url\": \"https://remote-conflict.example.com/items\"\n}\n"), 0644); err != nil {
		t.Fatalf("write peer conflict push-merge.json failed: %v", err)
	}
	runTestGit(t, peerDir, "add", "-A")
	runTestGit(t, peerDir, "commit", "-m", "peer conflict url")
	runTestGit(t, peerDir, "push", "origin", "HEAD")

	if err := os.WriteFile(reqFile, []byte("{\n  \"id\": \"pm-1\",\n  \"name\": \"Push Merge\",\n  \"method\": \"POST\",\n  \"url\": \"https://local-conflict.example.com/items\"\n}\n"), 0644); err != nil {
		t.Fatalf("write local conflict push-merge.json failed: %v", err)
	}
	pullConflictRes := gitSvc.Pull(collectionsRoot, collID)
	if pullConflictRes.Success || pullConflictRes.Error == nil || pullConflictRes.Error.Code != model.ErrGitConflict {
		t.Fatalf("expected Pull to return ErrGitConflict, got %+v", pullConflictRes)
	}
	abortRes := gitSvc.AbortMerge(collectionsRoot, collID)
	if !abortRes.Success {
		t.Fatalf("expected AbortMerge to succeed, got %+v", abortRes.Error)
	}
	abortStatus := abortRes.Data.(model.GitSyncStatus)
	if abortStatus.HasConflicts {
		t.Errorf("expected HasConflicts=false after AbortMerge, got %+v", abortStatus)
	}
}





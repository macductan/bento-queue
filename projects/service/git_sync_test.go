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

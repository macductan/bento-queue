package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"hecto-api/model"
	"hecto-api/storage"
)

const gitCommandTimeout = 60 * time.Second

// GitSyncService handles per-collection Git remote configuration and pull/push operations.
type GitSyncService struct {
	fs     *storage.FileSystem
	logger *slog.Logger
}

// NewGitSyncService creates a new GitSyncService.
func NewGitSyncService(fs *storage.FileSystem, logger *slog.Logger) *GitSyncService {
	return &GitSyncService{fs: fs, logger: logger}
}

func isValidGitRemoteURL(remoteURL string) bool {
	u := strings.TrimSpace(remoteURL)
	if u == "" {
		return true
	}
	// Prevent git flag injection
	if strings.HasPrefix(u, "-") {
		return false
	}
	if strings.HasPrefix(u, "https://") ||
		strings.HasPrefix(u, "http://") ||
		strings.HasPrefix(u, "ssh://") ||
		strings.HasPrefix(u, "git://") ||
		strings.HasPrefix(u, "git@") ||
		strings.HasPrefix(u, "file://") ||
		filepath.IsAbs(u) {
		return true
	}
	// Support SCP-like SSH syntax: [user@]host.xz:path/to/repo.git
	if colonIdx := strings.Index(u, ":"); colonIdx > 0 && !strings.Contains(u[:colonIdx], "/") && !strings.Contains(u[:colonIdx], " ") {
		hostPart := u[:colonIdx]
		pathPart := u[colonIdx+1:]
		if (strings.Contains(hostPart, ".") || strings.Contains(hostPart, "@")) && pathPart != "" && !strings.HasPrefix(pathPart, "//") {
			return true
		}
	}
	return false
}

func (s *GitSyncService) runGit(collDir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), gitCommandTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = collDir

	env := os.Environ()
	hasSSH := false
	for _, e := range env {
		if strings.HasPrefix(e, "GIT_SSH_COMMAND=") {
			hasSSH = true
			break
		}
	}
	env = append(env, "GIT_TERMINAL_PROMPT=0")
	if !hasSSH {
		env = append(env, "GIT_SSH_COMMAND=ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new")
	}
	cmd.Env = env

	out, err := cmd.CombinedOutput()
	return strings.TrimSpace(string(out)), err
}

func (s *GitSyncService) validateCollectionDir(collectionsRoot, collectionID string) (string, string, *model.Collection, *model.Result) {
	if strings.TrimSpace(collectionsRoot) == "" {
		res := model.NewError(model.ErrValidation, ErrCollectionRootEmpty)
		return "", "", nil, &res
	}
	id := strings.TrimSpace(collectionID)
	if id == "" {
		res := model.NewError(model.ErrValidation, ErrCollectionIDEmpty)
		return "", "", nil, &res
	}
	if !isCleanID(id, collectionsRoot) {
		res := model.NewError(model.ErrValidation, ErrInvalidFolderPath)
		return "", "", nil, &res
	}

	collDir := filepath.Join(collectionsRoot, id)
	metaPath := filepath.Join(collDir, collectionFileName)
	if !s.fs.Exists(metaPath) {
		res := model.NewError(model.ErrNotFound, ErrCollectionNotFound)
		return "", "", nil, &res
	}

	var coll model.Collection
	if err := s.fs.ReadJSON(metaPath, &coll); err != nil {
		// Attempt to recover collection.json if it contains Git conflict markers
		recovered := false
		for _, rev := range []string{":2:collection.json", "HEAD:collection.json", ":3:collection.json"} {
			if raw, gitErr := s.runGit(collDir, "show", rev); gitErr == nil && strings.TrimSpace(raw) != "" {
				if jsonErr := json.Unmarshal([]byte(raw), &coll); jsonErr == nil {
					recovered = true
					break
				}
			}
		}
		if !recovered {
			if rawBytes, readErr := os.ReadFile(metaPath); readErr == nil && strings.Contains(string(rawBytes), "<<<<<<<") {
				coll = model.Collection{
					ID:        id,
					Name:      id,
					IsDefault: id == "default",
					CreatedAt: time.Now(),
					UpdatedAt: time.Now(),
				}
				if id == "default" {
					coll.Name = "Default Collection"
				}
				recovered = true
			}
		}
		if !recovered {
			res := model.NewError(model.ErrIO, "Không thể đọc thông tin collection.json")
			return "", "", nil, &res
		}
		if originURL, gitErr := s.runGit(collDir, "remote", "get-url", "origin"); gitErr == nil && strings.TrimSpace(originURL) != "" && coll.GitRemoteURL == "" {
			coll.GitRemoteURL = strings.TrimSpace(originURL)
		}
		coll.ID = id
		coll.IsDefault = (id == "default")
		_ = s.fs.WriteJSON(metaPath, coll)
	}
	coll.ID = id
	coll.IsDefault = (id == "default")

	return collDir, metaPath, &coll, nil
}

func (s *GitSyncService) ensureGitRepoAndRemote(collDir, remoteURL string) error {
	gitDir := filepath.Join(collDir, ".git")
	if !s.fs.Exists(gitDir) {
		if out, err := s.runGit(collDir, "init"); err != nil {
			return fmt.Errorf("không thể khởi tạo git repository: %s (%w)", out, err)
		}
	}

	// Ensure fallback local git user.name and user.email exist so commit never fails on unconfigured machines
	if name, err := s.runGit(collDir, "config", "user.name"); err != nil || strings.TrimSpace(name) == "" {
		_, _ = s.runGit(collDir, "config", "user.name", "Hecto API")
	}
	if email, err := s.runGit(collDir, "config", "user.email"); err != nil || strings.TrimSpace(email) == "" {
		_, _ = s.runGit(collDir, "config", "user.email", "sync@hecto.local")
	}

	remoteURL = strings.TrimSpace(remoteURL)
	if remoteURL == "" {
		_, _ = s.runGit(collDir, "remote", "remove", "origin")
		return nil
	}

	if _, err := s.runGit(collDir, "remote", "get-url", "origin"); err == nil {
		if out, err := s.runGit(collDir, "remote", "set-url", "origin", "--", remoteURL); err != nil {
			return fmt.Errorf("không thể cập nhật git remote origin: %s (%w)", out, err)
		}
	} else {
		if out, err := s.runGit(collDir, "remote", "add", "origin", "--", remoteURL); err != nil {
			return fmt.Errorf("không thể thêm git remote origin: %s (%w)", out, err)
		}
	}

	return nil
}

// autoResolveCollectionMetaConflict automatically resolves merge/stash conflicts on collection.json
// by merging local & remote collection metadata, writing valid JSON to disk, staging collection.json,
// and completing the merge commit if no other conflict files remain.
func (s *GitSyncService) autoResolveCollectionMetaConflict(collDir, metaPath string, localColl *model.Collection, remoteURL string) bool {
	conflicts := s.getConflictFiles(collDir)
	hasCollConflict := false
	for _, f := range conflicts {
		if f == collectionFileName {
			hasCollConflict = true
			break
		}
	}

	var incomingColl model.Collection
	if hasCollConflict {
		for _, rev := range []string{":3:collection.json", "MERGE_HEAD:collection.json", ":2:collection.json"} {
			if raw, err := s.runGit(collDir, "show", rev); err == nil && strings.TrimSpace(raw) != "" {
				if json.Unmarshal([]byte(raw), &incomingColl) == nil && incomingColl.Name != "" {
					break
				}
			}
		}
	}

	merged := *localColl
	if incomingColl.Name != "" && (merged.Name == "" || merged.Name == "Default Collection") {
		merged.Name = incomingColl.Name
	}
	if incomingColl.Description != "" && merged.Description == "" {
		merged.Description = incomingColl.Description
	}
	if len(merged.Variables) == 0 && len(incomingColl.Variables) > 0 {
		merged.Variables = incomingColl.Variables
	} else if len(incomingColl.Variables) > 0 {
		existingKeys := make(map[string]bool, len(merged.Variables))
		for _, kv := range merged.Variables {
			existingKeys[kv.Key] = true
		}
		for _, kv := range incomingColl.Variables {
			if !existingKeys[kv.Key] {
				merged.Variables = append(merged.Variables, kv)
			}
		}
	}
	if merged.Auth == nil && incomingColl.Auth != nil {
		merged.Auth = incomingColl.Auth
	}
	if len(merged.AuthEnvs) == 0 && len(incomingColl.AuthEnvs) > 0 {
		merged.AuthEnvs = incomingColl.AuthEnvs
	}
	if merged.ActiveEnvID == "" && incomingColl.ActiveEnvID != "" {
		merged.ActiveEnvID = incomingColl.ActiveEnvID
	}
	merged.ID = localColl.ID
	merged.IsDefault = localColl.IsDefault
	if strings.TrimSpace(remoteURL) != "" {
		merged.GitRemoteURL = strings.TrimSpace(remoteURL)
	}
	merged.UpdatedAt = time.Now()

	if hasCollConflict {
		if err := s.fs.WriteJSON(metaPath, merged); err != nil {
			return false
		}
		if _, err := s.runGit(collDir, "add", "--", collectionFileName); err != nil {
			return false
		}
		remaining := s.getConflictFiles(collDir)
		if len(remaining) == 0 && s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
			if _, err := s.runGit(collDir, "commit", "--no-edit", "-m", "chore(hecto): merge remote collection"); err != nil {
				return false
			}
		}
		return len(remaining) == 0
	}

	var diskColl model.Collection
	if err := s.fs.ReadJSON(metaPath, &diskColl); err != nil ||
		diskColl.ID != merged.ID ||
		diskColl.IsDefault != merged.IsDefault ||
		strings.TrimSpace(diskColl.GitRemoteURL) != merged.GitRemoteURL {
		if err == nil {
			diskColl.ID = merged.ID
			diskColl.IsDefault = merged.IsDefault
			diskColl.GitRemoteURL = merged.GitRemoteURL
			if len(diskColl.Variables) == 0 && len(merged.Variables) > 0 {
				diskColl.Variables = merged.Variables
			}
			if diskColl.Auth == nil && merged.Auth != nil {
				diskColl.Auth = merged.Auth
			}
			if len(diskColl.AuthEnvs) == 0 && len(merged.AuthEnvs) > 0 {
				diskColl.AuthEnvs = merged.AuthEnvs
			}
			_ = s.fs.WriteJSON(metaPath, diskColl)
		} else {
			_ = s.fs.WriteJSON(metaPath, merged)
		}
	}

	return len(conflicts) == 0
}

func (s *GitSyncService) getCurrentBranch(collDir string) string {
	branch, err := s.runGit(collDir, "symbolic-ref", "--short", "HEAD")
	if err == nil && strings.TrimSpace(branch) != "" {
		return strings.TrimSpace(branch)
	}
	return "main"
}

func (s *GitSyncService) getConflictFiles(collDir string) []string {
	seen := make(map[string]bool)
	var files []string
	addFile := func(f string) {
		clean := strings.TrimSpace(filepath.ToSlash(f))
		if clean != "" && !seen[clean] {
			seen[clean] = true
			files = append(files, clean)
		}
	}

	out, err := s.runGit(collDir, "diff", "--name-only", "--diff-filter=U")
	if err == nil && strings.TrimSpace(out) != "" {
		for _, l := range strings.Split(strings.TrimSpace(out), "\n") {
			addFile(l)
		}
	}

	// Fallback check on git status --porcelain for unmerged prefixes
	if len(files) == 0 {
		statusOut, err := s.runGit(collDir, "status", "--porcelain")
		if err == nil && strings.TrimSpace(statusOut) != "" {
			for _, line := range strings.Split(statusOut, "\n") {
				if len(line) < 3 {
					continue
				}
				prefix := line[:2]
				if prefix == "UU" || prefix == "AA" || prefix == "DD" || prefix == "AU" || prefix == "UA" || prefix == "DU" || prefix == "UD" {
					addFile(line[3:])
				}
			}
		}
	}

	// Include untracked stash pop collision files if HECTO_STASH_CONFLICT exists
	if s.isStashConflict(collDir) {
		_, extraFiles := s.readStashConflictMarker(collDir)
		for _, f := range extraFiles {
			addFile(f)
		}
	}

	return files
}

func (s *GitSyncService) inspectStatus(collDir string, configuredRemote string) model.GitSyncStatus {
	gitDir := filepath.Join(collDir, ".git")
	hasRepo := s.fs.Exists(gitDir)
	status := model.GitSyncStatus{
		HasGitRepo: hasRepo,
		RemoteURL:  strings.TrimSpace(configuredRemote),
		Branch:     "main",
	}
	if !hasRepo {
		return status
	}

	if originURL, err := s.runGit(collDir, "remote", "get-url", "origin"); err == nil && strings.TrimSpace(originURL) != "" {
		if status.RemoteURL == "" {
			status.RemoteURL = strings.TrimSpace(originURL)
		}
	}

	status.Branch = s.getCurrentBranch(collDir)
	if porcelain, err := s.runGit(collDir, "status", "--porcelain"); err == nil && strings.TrimSpace(porcelain) != "" {
		status.HasChanges = true
	}

	conflicts := s.getConflictFiles(collDir)
	if len(conflicts) > 0 {
		status.HasConflicts = true
		status.ConflictFiles = conflicts
		isStash := s.isStashConflict(collDir)
		var localColl model.Collection
		var localCollPtr *model.Collection
		if err := s.fs.ReadJSON(filepath.Join(collDir, collectionFileName), &localColl); err == nil {
			localCollPtr = &localColl
		}
		detailedConflicts := make([]model.GitFileConflict, 0, len(conflicts))
		for _, f := range conflicts {
			fc, _ := s.buildFileConflict(collDir, f, localCollPtr, status.RemoteURL, isStash)
			detailedConflicts = append(detailedConflicts, fc)
		}
		status.Conflicts = detailedConflicts
	}

	return status
}

// SaveRemoteURL validates and saves the Git Remote URL for a collection in collection.json and configures git remote origin.
func (s *GitSyncService) SaveRemoteURL(collectionsRoot, collectionID, remoteURL string) model.Result {
	s.logger.Info("SaveRemoteURL called", "collectionID", collectionID, "remoteURL", remoteURL)

	remoteURL = strings.TrimSpace(remoteURL)
	if !isValidGitRemoteURL(remoteURL) {
		return model.NewError(model.ErrValidation, "Git Remote URL không hợp lệ (hỗ trợ HTTPS, SSH git@..., ssh://, hoặc đường dẫn hợp lệ)")
	}

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	coll.GitRemoteURL = remoteURL
	coll.UpdatedAt = time.Now()
	if err := s.fs.WriteJSON(metaPath, *coll); err != nil {
		s.logger.Error("failed to write collection.json for git remote", "error", err)
		return model.NewError(model.ErrIO, "Không thể lưu cấu hình Git Remote vào collection.json")
	}

	if remoteURL != "" || s.fs.Exists(filepath.Join(collDir, ".git")) {
		if err := s.ensureGitRepoAndRemote(collDir, remoteURL); err != nil {
			s.logger.Error("failed to configure git remote", "error", err)
			return model.NewError(model.ErrGitError, err.Error())
		}
	}

	status := s.inspectStatus(collDir, remoteURL)
	return model.NewSuccess(status)
}

// GetStatus returns the current Git synchronization status for a collection.
func (s *GitSyncService) GetStatus(collectionsRoot, collectionID string) model.Result {
	collDir, _, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	status := s.inspectStatus(collDir, coll.GitRemoteURL)
	return model.NewSuccess(status)
}

// Pull executes git pull inside the collection folder, runs 3-Way JSON Auto-Merge, and reports any remaining merge conflicts for resolution.
func (s *GitSyncService) Pull(collectionsRoot, collectionID string) model.Result {
	s.logger.Info("GitSyncService.Pull called", "collectionID", collectionID)

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	remoteURL := strings.TrimSpace(coll.GitRemoteURL)
	if remoteURL == "" {
		if originURL, err := s.runGit(collDir, "remote", "get-url", "origin"); err == nil && strings.TrimSpace(originURL) != "" {
			remoteURL = strings.TrimSpace(originURL)
		}
	}
	if remoteURL == "" {
		return model.NewError(model.ErrValidation, "Chưa cấu hình Git Remote URL cho Collection này")
	}

	if err := s.ensureGitRepoAndRemote(collDir, remoteURL); err != nil {
		return model.NewError(model.ErrGitError, err.Error())
	}

	// Attempt 3-Way Auto-Merge if conflicts were previously left in the working tree
	if existingConflicts := s.getConflictFiles(collDir); len(existingConflicts) > 0 {
		unresolved, allResolved := s.processConflictsAndAutoMerge(collDir, metaPath, coll, remoteURL, s.isStashConflict(collDir))
		if !allResolved || len(unresolved) > 0 {
			status := s.inspectStatus(collDir, remoteURL)
			if len(unresolved) > 0 {
				status.Conflicts = unresolved
			}
			remaining := s.getConflictFiles(collDir)
			return model.Result{
				Success: false,
				Data:    status,
				Error: &model.AppError{
					Code:    model.ErrGitConflict,
					Message: fmt.Sprintf("Phát hiện xung đột Git (Merge Conflict) chưa được xử lý tại: %s. Vui lòng giải quyết xung đột trước khi tiếp tục.", strings.Join(remaining, ", ")),
				},
			}
		}
	}

	// Stage and auto-commit local changes before pulling so git pull can merge cleanly
	if porcelain, err := s.runGit(collDir, "status", "--porcelain"); err == nil && strings.TrimSpace(porcelain) != "" {
		if out, err := s.runGit(collDir, "add", "-A"); err != nil {
			return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể stage thay đổi trước khi pull: %s", out))
		}
		_, _ = s.runGit(collDir, "commit", "-m", "chore(hecto): auto-save before pull")
	}

	// Fetch remote refs
	if fetchOut, err := s.runGit(collDir, "fetch", "--prune", "origin"); err != nil {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể kết nối tới Git Remote khi fetch: %s", fetchOut))
	}

	targetBranch, hasRemoteBranch := s.resolveTargetRemoteBranch(collDir)
	if !hasRemoteBranch {
		status := s.inspectStatus(collDir, remoteURL)
		status.Output = "Remote repository chưa có nhánh nào để pull."
		return model.NewSuccess(status)
	}

	pullOut, pullErr := s.runGit(collDir, "pull", "--no-rebase", "--no-edit", "--allow-unrelated-histories", "origin", targetBranch)
	unresolved, allResolved := s.processConflictsAndAutoMerge(collDir, metaPath, coll, remoteURL, false)
	conflicts := s.getConflictFiles(collDir)
	if len(conflicts) > 0 || len(unresolved) > 0 || (pullErr != nil && strings.Contains(pullOut, "CONFLICT") && !allResolved) {
		if s.fs != nil {
			_ = s.fs.IndexRebuild(collDir)
		}
		status := s.inspectStatus(collDir, remoteURL)
		status.HasConflicts = true
		if len(conflicts) > 0 {
			status.ConflictFiles = conflicts
		}
		if len(unresolved) > 0 {
			status.Conflicts = unresolved
		}
		status.Output = pullOut
		conflictList := strings.Join(status.ConflictFiles, ", ")
		if conflictList == "" {
			conflictList = "các file trong collection"
		}
		return model.Result{
			Success: false,
			Data:    status,
			Error: &model.AppError{
				Code:    model.ErrGitConflict,
				Message: fmt.Sprintf("Xung đột Git (Merge Conflict) khi Pull tại: %s. Vui lòng chọn phương án giải quyết xung đột.", conflictList),
			},
		}
	}

	if pullErr != nil && !strings.Contains(pullOut, "CONFLICT") {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Lỗi khi thực thi git pull: %s", pullOut))
	}

	if s.fs != nil {
		_ = s.fs.IndexRebuild(collDir)
	}

	status := s.inspectStatus(collDir, remoteURL)
	status.Output = pullOut
	return model.NewSuccess(status)
}

// resolveTargetRemoteBranch determines which remote branch on origin to pull/reset against.
// Returns ("", false) when the remote repository has no branches yet.
func (s *GitSyncService) resolveTargetRemoteBranch(collDir string) (string, bool) {
	branch := s.getCurrentBranch(collDir)
	targetBranch := branch
	if _, err := s.runGit(collDir, "rev-parse", "--verify", "origin/"+targetBranch); err != nil {
		if _, errMain := s.runGit(collDir, "rev-parse", "--verify", "origin/main"); errMain == nil {
			targetBranch = "main"
		} else if _, errMaster := s.runGit(collDir, "rev-parse", "--verify", "origin/master"); errMaster == nil {
			targetBranch = "master"
		} else if out, errRefs := s.runGit(collDir, "for-each-ref", "--format=%(refname:short)", "refs/remotes/origin/"); errRefs == nil && strings.TrimSpace(out) != "" {
			for _, line := range strings.Split(out, "\n") {
				ref := strings.TrimSpace(line)
				if strings.HasPrefix(ref, "origin/") && ref != "origin/HEAD" {
					cand := strings.TrimPrefix(ref, "origin/")
					if cand != "" {
						return cand, true
					}
				}
			}
			return "", false
		} else {
			return "", false
		}
	}
	return targetBranch, true
}

// ClearAndPull saves the remote URL, fetches origin, discards local uncommitted/untracked changes,
// resets hard to origin/<branch>, and rebuilds the collection index.
func (s *GitSyncService) ClearAndPull(collectionsRoot, collectionID string, remoteURL ...string) model.Result {
	s.logger.Info("GitSyncService.ClearAndPull called", "collectionID", collectionID)

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	targetRemote := strings.TrimSpace(coll.GitRemoteURL)
	if len(remoteURL) > 0 && strings.TrimSpace(remoteURL[0]) != "" {
		targetRemote = strings.TrimSpace(remoteURL[0])
	}
	if !isValidGitRemoteURL(targetRemote) || targetRemote == "" {
		return model.NewError(model.ErrValidation, "Git Remote URL không hợp lệ (hỗ trợ HTTPS, SSH git@..., ssh://, hoặc đường dẫn hợp lệ)")
	}

	coll.GitRemoteURL = targetRemote
	coll.UpdatedAt = time.Now()
	if err := s.fs.WriteJSON(metaPath, *coll); err != nil {
		return model.NewError(model.ErrIO, "Không thể lưu cấu hình Git Remote vào collection.json")
	}

	if err := s.ensureGitRepoAndRemote(collDir, targetRemote); err != nil {
		return model.NewError(model.ErrGitError, err.Error())
	}

	if fetchOut, err := s.runGit(collDir, "fetch", "--prune", "origin"); err != nil {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể kết nối tới Git Remote khi fetch: %s", fetchOut))
	}

	// Abort any ongoing merge or stash conflict before hard reset
	if s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
		_, _ = s.runGit(collDir, "merge", "--abort")
	}
	s.clearStashConflictMarker(collDir)

	// Discard local working tree changes and untracked files when HEAD exists
	if _, headErr := s.runGit(collDir, "rev-parse", "--verify", "HEAD"); headErr == nil {
		_, _ = s.runGit(collDir, "checkout", "--", ".")
	}
	_, _ = s.runGit(collDir, "clean", "-fd")

	targetBranch, hasRemoteBranch := s.resolveTargetRemoteBranch(collDir)
	var resetOut string
	if hasRemoteBranch {
		out, err := s.runGit(collDir, "reset", "--hard", "origin/"+targetBranch)
		if err != nil {
			return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể git reset --hard origin/%s: %s", targetBranch, out))
		}
		resetOut = out
	} else {
		// Remote is empty: remove any previously tracked collection items so local data is genuinely cleared
		if entries, err := os.ReadDir(collDir); err == nil {
			for _, entry := range entries {
				name := entry.Name()
				if name == ".git" || name == "collection.json" {
					continue
				}
				_ = os.RemoveAll(filepath.Join(collDir, name))
			}
		}
		_, _ = s.runGit(collDir, "rm", "-rf", "--cached", "--ignore-unmatch", ".")
		resetOut = "Remote repository chưa có nhánh nào để pull."
	}

	// Re-persist GitRemoteURL in collection.json in case origin/<branch>'s collection.json had a different/empty URL
	var updatedColl model.Collection
	if hasRemoteBranch && s.fs.ReadJSON(metaPath, &updatedColl) == nil {
		updatedColl.ID = coll.ID
		updatedColl.IsDefault = coll.IsDefault
		updatedColl.GitRemoteURL = targetRemote
		_ = s.fs.WriteJSON(metaPath, updatedColl)
	} else {
		_ = s.fs.WriteJSON(metaPath, *coll)
	}

	if s.fs != nil {
		_ = s.fs.IndexRebuild(collDir)
	}

	status := s.inspectStatus(collDir, targetRemote)
	status.Output = resetOut
	return model.NewSuccess(status)
}

// StashAndPull saves the remote URL, stashes local changes, pulls from origin/<branch> with --allow-unrelated-histories,
// pops the stash, runs 3-Way JSON Auto-Merge, and reports ErrGitConflict with conflict details if any conflicts remain.
func (s *GitSyncService) StashAndPull(collectionsRoot, collectionID string, remoteURL ...string) model.Result {
	s.logger.Info("GitSyncService.StashAndPull called", "collectionID", collectionID)

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	targetRemote := strings.TrimSpace(coll.GitRemoteURL)
	if len(remoteURL) > 0 && strings.TrimSpace(remoteURL[0]) != "" {
		targetRemote = strings.TrimSpace(remoteURL[0])
	}
	if !isValidGitRemoteURL(targetRemote) || targetRemote == "" {
		return model.NewError(model.ErrValidation, "Git Remote URL không hợp lệ (hỗ trợ HTTPS, SSH git@..., ssh://, hoặc đường dẫn hợp lệ)")
	}

	coll.GitRemoteURL = targetRemote
	coll.UpdatedAt = time.Now()
	if err := s.fs.WriteJSON(metaPath, *coll); err != nil {
		return model.NewError(model.ErrIO, "Không thể lưu cấu hình Git Remote vào collection.json")
	}

	if err := s.ensureGitRepoAndRemote(collDir, targetRemote); err != nil {
		return model.NewError(model.ErrGitError, err.Error())
	}

	if existingConflicts := s.getConflictFiles(collDir); len(existingConflicts) > 0 {
		unresolved, allResolved := s.processConflictsAndAutoMerge(collDir, metaPath, coll, targetRemote, s.isStashConflict(collDir))
		if !allResolved || len(unresolved) > 0 {
			status := s.inspectStatus(collDir, targetRemote)
			if len(unresolved) > 0 {
				status.Conflicts = unresolved
			}
			remaining := s.getConflictFiles(collDir)
			return model.Result{
				Success: false,
				Data:    status,
				Error: &model.AppError{
					Code:    model.ErrGitConflict,
					Message: fmt.Sprintf("Phát hiện xung đột Git (Merge Conflict) chưa được xử lý tại: %s. Vui lòng giải quyết xung đột trước khi tiếp tục.", strings.Join(remaining, ", ")),
				},
			}
		}
	}

	// Ensure at least an initial commit exists before git stash push -u (git stash requires HEAD)
	if _, headErr := s.runGit(collDir, "rev-parse", "--verify", "HEAD"); headErr != nil {
		_, _ = s.runGit(collDir, "commit", "--allow-empty", "-m", "chore(hecto): initial commit")
	}

	restoreCollectionMeta := func() {
		s.ensureCollectionMetaConsistent(metaPath, coll, targetRemote)
	}

	// Prevent collection.json metadata edit from colliding during stash/pull/pop
	if _, lsErr := s.runGit(collDir, "ls-files", "--error-unmatch", "collection.json"); lsErr != nil {
		_ = os.Remove(metaPath)
	} else {
		_, _ = s.runGit(collDir, "checkout", "HEAD", "--", "collection.json")
	}

	prePullHead, _ := s.runGit(collDir, "rev-parse", "--verify", "HEAD")

	stashed := false
	if porcelain, err := s.runGit(collDir, "status", "--porcelain"); err == nil && strings.TrimSpace(porcelain) != "" {
		stashOut, stashErr := s.runGit(collDir, "stash", "push", "-u", "-m", hectoStashMessage)
		if stashErr != nil {
			restoreCollectionMeta()
			return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể git stash trước khi pull: %s", stashOut))
		}
		if !strings.Contains(stashOut, "No local changes to save") {
			stashed = true
		}
	}

	if fetchOut, err := s.runGit(collDir, "fetch", "--prune", "origin"); err != nil {
		if stashed {
			_, _ = s.runGit(collDir, "stash", "pop")
		}
		restoreCollectionMeta()
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể kết nối tới Git Remote khi fetch: %s", fetchOut))
	}

	targetBranch, hasRemoteBranch := s.resolveTargetRemoteBranch(collDir)
	var combinedOut string
	var pullErr error
	if hasRemoteBranch {
		combinedOut, pullErr = s.runGit(collDir, "pull", "--no-rebase", "--no-edit", "--allow-unrelated-histories", "origin", targetBranch)
		s.processConflictsAndAutoMerge(collDir, metaPath, coll, targetRemote, false)
	} else {
		combinedOut = "Remote repository chưa có nhánh nào để pull."
	}

	var popOut string
	var popErr error
	var extraStashConflictFiles []string
	if stashed && len(s.getConflictFiles(collDir)) == 0 && !s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) {
		popOut, popErr = s.runGit(collDir, "stash", "pop")
		if popOut != "" {
			if combinedOut != "" {
				combinedOut = combinedOut + "\n" + popOut
			} else {
				combinedOut = popOut
			}
		}
		if popErr != nil && strings.Contains(popOut, "already exists, no checkout") {
			for _, line := range strings.Split(popOut, "\n") {
				if idx := strings.Index(line, " already exists, no checkout"); idx > 0 {
					file := strings.TrimSpace(line[:idx])
					if file != "" && file != collectionFileName {
						extraStashConflictFiles = append(extraStashConflictFiles, file)
					}
				}
			}
		}
	}

	stashPopConflicted := stashed && !s.fs.Exists(filepath.Join(collDir, ".git", "MERGE_HEAD")) &&
		(len(s.getConflictFiles(collDir)) > 0 || len(extraStashConflictFiles) > 0 || (popErr != nil && strings.Contains(popOut, "CONFLICT")))

	if stashPopConflicted {
		s.writeStashConflictMarker(collDir, prePullHead, extraStashConflictFiles)
	}

	unresolved, allResolved := s.processConflictsAndAutoMerge(collDir, metaPath, coll, targetRemote, stashPopConflicted)
	s.ensureCollectionMetaConsistent(metaPath, coll, targetRemote)

	conflicts := s.getConflictFiles(collDir)
	if len(conflicts) > 0 || len(unresolved) > 0 || (!allResolved && ((pullErr != nil && strings.Contains(combinedOut, "CONFLICT")) || (popErr != nil && strings.Contains(popOut, "CONFLICT")))) {
		if s.fs != nil {
			_ = s.fs.IndexRebuild(collDir)
		}
		status := s.inspectStatus(collDir, targetRemote)
		status.HasConflicts = true
		if len(conflicts) > 0 {
			status.ConflictFiles = conflicts
		}
		if len(unresolved) > 0 {
			status.Conflicts = unresolved
		}
		status.Output = combinedOut
		conflictList := strings.Join(status.ConflictFiles, ", ")
		if conflictList == "" {
			conflictList = "các file trong collection"
		}
		return model.Result{
			Success: false,
			Data:    status,
			Error: &model.AppError{
				Code:    model.ErrGitConflict,
				Message: fmt.Sprintf("Xung đột Git (Merge Conflict) khi Stash & Pull tại: %s. Vui lòng chọn phương án giải quyết xung đột.", conflictList),
			},
		}
	}

	if pullErr != nil && !strings.Contains(combinedOut, "CONFLICT") {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Lỗi khi thực thi git pull: %s", combinedOut))
	}
	if popErr != nil && !strings.Contains(popOut, "CONFLICT") && len(extraStashConflictFiles) == 0 {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Lỗi khi thực thi git stash pop: %s", popOut))
	}

	if s.fs != nil {
		_ = s.fs.IndexRebuild(collDir)
	}

	status := s.inspectStatus(collDir, targetRemote)
	status.Output = combinedOut
	return model.NewSuccess(status)
}

// ListLocalBranches returns the list of local git branches for a collection.
func (s *GitSyncService) ListLocalBranches(collectionsRoot, collectionID string) model.Result {
	collDir, _, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	gitDir := filepath.Join(collDir, ".git")
	if !s.fs.Exists(gitDir) {
		if strings.TrimSpace(coll.GitRemoteURL) != "" {
			_ = s.ensureGitRepoAndRemote(collDir, coll.GitRemoteURL)
		} else {
			return model.NewSuccess([]string{"main"})
		}
	}

	out, err := s.runGit(collDir, "branch", "--list", "--format=%(refname:short)")
	var branches []string
	if err == nil && strings.TrimSpace(out) != "" {
		for _, line := range strings.Split(out, "\n") {
			b := strings.TrimSpace(line)
			if b != "" {
				branches = append(branches, b)
			}
		}
	}

	current := s.getCurrentBranch(collDir)
	hasCurrent := false
	for _, b := range branches {
		if b == current {
			hasCurrent = true
			break
		}
	}
	if !hasCurrent && current != "" {
		branches = append([]string{current}, branches...)
	}
	if len(branches) == 0 {
		branches = []string{"main"}
	}

	return model.NewSuccess(branches)
}

// Push stages all collection files, creates a commit if needed, and pushes to origin.
// Optional branch parameter specifies the target branch on origin; when empty, pushes to current branch.
func (s *GitSyncService) Push(collectionsRoot, collectionID string, branch ...string) model.Result {
	targetBranch := ""
	if len(branch) > 0 {
		targetBranch = strings.TrimSpace(branch[0])
	}
	s.logger.Info("GitSyncService.Push called", "collectionID", collectionID, "branch", targetBranch)

	collDir, metaPath, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
	if errRes != nil {
		return *errRes
	}

	if strings.HasPrefix(targetBranch, "-") {
		return model.NewError(model.ErrValidation, "Tên nhánh Git không hợp lệ")
	}

	remoteURL := strings.TrimSpace(coll.GitRemoteURL)
	if remoteURL == "" {
		if originURL, err := s.runGit(collDir, "remote", "get-url", "origin"); err == nil && strings.TrimSpace(originURL) != "" {
			remoteURL = strings.TrimSpace(originURL)
		}
	}
	if remoteURL == "" {
		return model.NewError(model.ErrValidation, "Chưa cấu hình Git Remote URL cho Collection này")
	}

	if err := s.ensureGitRepoAndRemote(collDir, remoteURL); err != nil {
		return model.NewError(model.ErrGitError, err.Error())
	}

	// Attempt 3-Way Auto-Merge if conflicts were previously left in the working tree
	if existingConflicts := s.getConflictFiles(collDir); len(existingConflicts) > 0 {
		unresolved, allResolved := s.processConflictsAndAutoMerge(collDir, metaPath, coll, remoteURL, s.isStashConflict(collDir))
		if !allResolved || len(unresolved) > 0 {
			status := s.inspectStatus(collDir, remoteURL)
			if len(unresolved) > 0 {
				status.Conflicts = unresolved
			}
			remaining := s.getConflictFiles(collDir)
			return model.Result{
				Success: false,
				Data:    status,
				Error: &model.AppError{
					Code:    model.ErrGitConflict,
					Message: fmt.Sprintf("Không thể Push khi còn xung đột Git (Merge Conflict) tại: %s. Vui lòng giải quyết xung đột trước.", strings.Join(remaining, ", ")),
				},
			}
		}
	}

	if out, err := s.runGit(collDir, "add", "-A"); err != nil {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể git add trong thư mục Collection: %s", out))
	}

	porcelain, _ := s.runGit(collDir, "status", "--porcelain")
	_, headErr := s.runGit(collDir, "rev-parse", "--verify", "HEAD")
	if strings.TrimSpace(porcelain) != "" || headErr != nil {
		commitMsg := fmt.Sprintf("chore(hecto): sync collection %s", time.Now().UTC().Format(time.RFC3339))
		if out, err := s.runGit(collDir, "commit", "-m", commitMsg); err != nil {
			// Ignore "nothing to commit" if working tree is already clean
			if !strings.Contains(out, "nothing to commit") {
				return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể tạo git commit: %s", out))
			}
		}
	}

	currentBranch := s.getCurrentBranch(collDir)
	explicitBranch := targetBranch
	if targetBranch == "" {
		if _, err := s.runGit(collDir, "rev-parse", "--verify", "origin/"+currentBranch); err != nil {
			_, _ = s.runGit(collDir, "fetch", "--prune", "origin")
			if rb, ok := s.resolveTargetRemoteBranch(collDir); ok && rb != "" {
				targetBranch = rb
				if targetBranch != currentBranch {
					_, _ = s.runGit(collDir, "branch", "-M", targetBranch)
					currentBranch = targetBranch
				}
			}
		}
		if targetBranch == "" {
			targetBranch = currentBranch
		}
	}

	// Always push the newly committed HEAD to refs/heads/<targetBranch> on origin,
	// and fast-forward local branch ref when pushing to a non-current local branch.
	refSpec := "HEAD:refs/heads/" + targetBranch
	if explicitBranch != "" && targetBranch != currentBranch {
		_, _ = s.runGit(collDir, "branch", "-f", targetBranch, "HEAD")
	}

	pushOut, pushErr := s.runGit(collDir, "push", "-u", "origin", refSpec)
	if pushErr != nil {
		if strings.Contains(pushOut, "rejected") || strings.Contains(pushOut, "fetch first") || strings.Contains(pushOut, "non-fast-forward") {
			// Auto-fetch and attempt 3-Way JSON Auto-Merge on upstream changes
			if _, fetchErr := s.runGit(collDir, "fetch", "--prune", "origin"); fetchErr == nil {
				remoteBranch := targetBranch
				if _, revErr := s.runGit(collDir, "rev-parse", "--verify", "origin/"+remoteBranch); revErr != nil {
					if rb, ok := s.resolveTargetRemoteBranch(collDir); ok {
						remoteBranch = rb
					} else {
						remoteBranch = ""
					}
				}
				if remoteBranch != "" {
					mergeOut, mergeErr := s.runGit(collDir, "merge", "--no-edit", "--allow-unrelated-histories", "origin/"+remoteBranch)
					unresolved, allResolved := s.processConflictsAndAutoMerge(collDir, metaPath, coll, remoteURL, false)
					conflicts := s.getConflictFiles(collDir)
					if len(conflicts) > 0 || len(unresolved) > 0 || (mergeErr != nil && strings.Contains(mergeOut, "CONFLICT") && !allResolved) {
						if s.fs != nil {
							_ = s.fs.IndexRebuild(collDir)
						}
						status := s.inspectStatus(collDir, remoteURL)
						status.HasConflicts = true
						if len(conflicts) > 0 {
							status.ConflictFiles = conflicts
						}
						if len(unresolved) > 0 {
							status.Conflicts = unresolved
						}
						conflictList := strings.Join(status.ConflictFiles, ", ")
						if conflictList == "" {
							conflictList = "các file trong collection"
						}
						return model.Result{
							Success: false,
							Data:    status,
							Error: &model.AppError{
								Code:    model.ErrGitConflict,
								Message: fmt.Sprintf("Không thể Push do Remote có thay đổi xung đột tại: %s. Vui lòng chọn phương án giải quyết xung đột.", conflictList),
							},
						}
					}
					if mergeErr == nil || allResolved {
						if targetBranch != currentBranch {
							_, _ = s.runGit(collDir, "branch", "-f", targetBranch, "HEAD")
						}
						if retryOut, retryErr := s.runGit(collDir, "push", "-u", "origin", refSpec); retryErr == nil {
							if s.fs != nil {
								_ = s.fs.IndexRebuild(collDir)
							}
							status := s.inspectStatus(collDir, remoteURL)
							status.Output = retryOut
							return model.NewSuccess(status)
						} else {
							pushOut = retryOut
						}
					}
				}
			}
			return model.NewError(model.ErrGitConflict, "Không thể Push do Remote có thay đổi mới hoặc xung đột. Vui lòng thực hiện Git Pull và xử lý xung đột trước khi Push.\nChi tiết: "+pushOut)
		}
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể git push lên remote: %s", pushOut))
	}

	status := s.inspectStatus(collDir, remoteURL)
	status.Output = pushOut
	return model.NewSuccess(status)
}



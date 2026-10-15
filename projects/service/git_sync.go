package service

import (
	"context"
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
		strings.HasPrefix(u, "git@") ||
		strings.HasPrefix(u, "file://") ||
		filepath.IsAbs(u) {
		return true
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
		res := model.NewError(model.ErrIO, "Không thể đọc thông tin collection.json")
		return "", "", nil, &res
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

func (s *GitSyncService) getCurrentBranch(collDir string) string {
	branch, err := s.runGit(collDir, "symbolic-ref", "--short", "HEAD")
	if err == nil && strings.TrimSpace(branch) != "" {
		return strings.TrimSpace(branch)
	}
	return "main"
}

func (s *GitSyncService) getConflictFiles(collDir string) []string {
	out, err := s.runGit(collDir, "diff", "--name-only", "--diff-filter=U")
	if err == nil && strings.TrimSpace(out) != "" {
		lines := strings.Split(strings.TrimSpace(out), "\n")
		files := make([]string, 0, len(lines))
		for _, l := range lines {
			trimmed := strings.TrimSpace(l)
			if trimmed != "" {
				files = append(files, trimmed)
			}
		}
		if len(files) > 0 {
			return files
		}
	}

	// Fallback check on git status --porcelain for unmerged prefixes
	statusOut, err := s.runGit(collDir, "status", "--porcelain")
	if err != nil || strings.TrimSpace(statusOut) == "" {
		return nil
	}
	var conflictFiles []string
	for _, line := range strings.Split(statusOut, "\n") {
		if len(line) < 3 {
			continue
		}
		prefix := line[:2]
		if prefix == "UU" || prefix == "AA" || prefix == "DD" || prefix == "AU" || prefix == "UA" || prefix == "DU" || prefix == "UD" {
			file := strings.TrimSpace(line[3:])
			if file != "" {
				conflictFiles = append(conflictFiles, file)
			}
		}
	}
	return conflictFiles
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

// Pull executes git pull inside the collection folder and reports any merge conflicts clearly for manual resolution.
func (s *GitSyncService) Pull(collectionsRoot, collectionID string) model.Result {
	s.logger.Info("GitSyncService.Pull called", "collectionID", collectionID)

	collDir, _, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
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

	// Check if there are already unresolved conflicts before pulling
	if existingConflicts := s.getConflictFiles(collDir); len(existingConflicts) > 0 {
		status := s.inspectStatus(collDir, remoteURL)
		return model.Result{
			Success: false,
			Data:    status,
			Error: &model.AppError{
				Code:    model.ErrGitConflict,
				Message: fmt.Sprintf("Phát hiện xung đột Git (Merge Conflict) chưa được xử lý tại: %s. Vui lòng mở thư mục Collection và xử lý conflict thủ công.", strings.Join(existingConflicts, ", ")),
			},
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
	if fetchOut, err := s.runGit(collDir, "fetch", "origin"); err != nil {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể kết nối tới Git Remote khi fetch: %s", fetchOut))
	}

	branch := s.getCurrentBranch(collDir)
	// Determine which remote branch to pull from
	targetBranch := branch
	if _, err := s.runGit(collDir, "rev-parse", "--verify", "origin/"+targetBranch); err != nil {
		// Check if origin/main or origin/master exists
		if _, errMain := s.runGit(collDir, "rev-parse", "--verify", "origin/main"); errMain == nil {
			targetBranch = "main"
		} else if _, errMaster := s.runGit(collDir, "rev-parse", "--verify", "origin/master"); errMaster == nil {
			targetBranch = "master"
		} else {
			// Remote repository is empty (no branches pushed yet)
			status := s.inspectStatus(collDir, remoteURL)
			status.Output = "Remote repository chưa có nhánh nào để pull."
			return model.NewSuccess(status)
		}
	}

	pullOut, pullErr := s.runGit(collDir, "pull", "--no-rebase", "--no-edit", "--allow-unrelated-histories", "origin", targetBranch)
	conflicts := s.getConflictFiles(collDir)
	if len(conflicts) > 0 || (pullErr != nil && strings.Contains(pullOut, "CONFLICT")) {
		status := s.inspectStatus(collDir, remoteURL)
		status.HasConflicts = true
		if len(conflicts) > 0 {
			status.ConflictFiles = conflicts
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
				Message: fmt.Sprintf("Xung đột Git (Merge Conflict) khi Pull tại: %s. Vui lòng mở thư mục Collection và xử lý conflict thủ công bằng Git.", conflictList),
			},
		}
	}

	if pullErr != nil {
		return model.NewError(model.ErrGitError, fmt.Sprintf("Lỗi khi thực thi git pull: %s", pullOut))
	}

	if s.fs != nil {
		_ = s.fs.IndexRebuild(collDir)
	}

	status := s.inspectStatus(collDir, remoteURL)
	status.Output = pullOut
	return model.NewSuccess(status)
}

// Push stages all collection files, creates a commit if needed, and pushes to origin.
func (s *GitSyncService) Push(collectionsRoot, collectionID string) model.Result {
	s.logger.Info("GitSyncService.Push called", "collectionID", collectionID)

	collDir, _, coll, errRes := s.validateCollectionDir(collectionsRoot, collectionID)
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

	if existingConflicts := s.getConflictFiles(collDir); len(existingConflicts) > 0 {
		status := s.inspectStatus(collDir, remoteURL)
		return model.Result{
			Success: false,
			Data:    status,
			Error: &model.AppError{
				Code:    model.ErrGitConflict,
				Message: fmt.Sprintf("Không thể Push khi còn xung đột Git (Merge Conflict) tại: %s. Vui lòng xử lý conflict thủ công trước.", strings.Join(existingConflicts, ", ")),
			},
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

	branch := s.getCurrentBranch(collDir)
	pushOut, pushErr := s.runGit(collDir, "push", "-u", "origin", "HEAD:"+branch)
	if pushErr != nil {
		if strings.Contains(pushOut, "rejected") || strings.Contains(pushOut, "fetch first") || strings.Contains(pushOut, "non-fast-forward") {
			return model.NewError(model.ErrGitConflict, "Không thể Push do Remote có thay đổi mới hoặc xung đột. Vui lòng thực hiện Git Pull và xử lý xung đột trước khi Push.\nChi tiết: "+pushOut)
		}
		return model.NewError(model.ErrGitError, fmt.Sprintf("Không thể git push lên remote: %s", pushOut))
	}

	status := s.inspectStatus(collDir, remoteURL)
	status.Output = pushOut
	return model.NewSuccess(status)
}

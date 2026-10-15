---
title: 'Per-Collection Git Remote Configuration, Git Pull and Git Push Synchronization'
slug: '3-per-collection-git-remote-configuration-git-pull-and-git-push-synchronization'
created: '2026-10-14T23:18:00+07:00'
status: 'done'
completedAt: '2026-10-14T23:27:00+07:00'
input_documents:
  - '_bmad-output/specs/spec-git-sync-and-request-productivity/SPEC.md'
  - '_bmad-output/specs/spec-git-sync-and-request-productivity/git-sync-and-request-productivity-architecture.md'
  - '_bmad-output/specs/spec-git-sync-and-request-productivity/stories.yaml'
---

# Tech-Spec: Per-Collection Git Remote Configuration, Git Pull and Git Push Synchronization

**Created:** 2026-10-14T23:18:00+07:00  
**Story ID:** `3`

## Overview

### Problem Statement

Users collaborating on API collections stored as local JSON files on disk need a fast, zero-cloud way to synchronize each Collection with a Git repository (HTTPS or SSH). Currently, there is no per-collection `git_remote_url` metadata in `collection.json`, no Go backend service to execute `git pull` / `git push` inside the collection folder, and no UI controls or conflict reporting when Git merge conflicts occur.

### Solution

1. **Go Domain Model (`projects/model/types.go`):**
   - Add `ErrGitConflict = "GIT_CONFLICT"` and `ErrGitError = "GIT_ERROR"` constants.
   - Add `GitRemoteURL string` (`json:"git_remote_url,omitempty"`) to `model.Collection`.
   - Add `GitSyncStatus` struct (`HasGitRepo`, `RemoteURL`, `Branch`, `HasChanges`, `HasConflicts`, `ConflictFiles`, `Output`).
2. **Collection Service (`projects/service/collection.go`):**
   - Ensure `buildTree` skips `.git` directories (`if entry.IsDir() && (name == "environments" || name == ".git") { continue }`).
   - Ensure `copyDirectory` skips `.git` directories when duplicating a collection.
   - Preserve or update `GitRemoteURL` in `UpdateCollection` (`if coll.GitRemoteURL != "" || existingColl.GitRemoteURL != ""` -> preserve existing `GitRemoteURL` unless explicitly provided, or update when `SaveRemoteURL` is called).
3. **GitSyncService (`projects/service/git_sync.go`):**
   - Validate `collectionID` against path traversal (`isCleanID`) and validate `remoteURL` (reject leading `-` option injection; allow `https://`, `http://`, `ssh://`, `git@`, `file://`, or absolute local path for testing).
   - Execute `git` via `exec.CommandContext` with `GIT_TERMINAL_PROMPT=0` and `BatchMode=yes` so commands never hang waiting for interactive stdin prompts.
   - `SaveRemoteURL(collectionsRoot, collectionID, remoteURL)`:
     - Updates `git_remote_url` in `collection.json`.
     - If `remoteURL != ""`, runs `git init` (if `.git` doesn't exist), ensures local git user.name/user.email fallback if not configured globally, and sets `git remote set-url origin <url>` or `git remote add origin <url>`.
   - `GetStatus(collectionsRoot, collectionID)`:
     - Inspects `.git`, remote `origin`, current branch, `git status --porcelain`, and unmerged conflict files (`UU`, `AA`, `DD`, `AU`, `UA`, `DU`, `UD`).
   - `Pull(collectionsRoot, collectionID)`:
     - Auto-commits dirty working tree changes (`git add -A` + `git commit -m "chore(hecto): auto-save before pull"`) if no conflicts exist so `git pull` won't fail due to uncommitted local edits.
     - Runs `git pull --no-rebase --no-edit origin <branch>`.
     - Detects merge conflicts via `git diff --name-only --diff-filter=U` (or `CONFLICT` output) and returns `model.Result{Success: false, Data: status, Error: &model.AppError{Code: model.ErrGitConflict, Message: ...}}` listing conflicted files and clear instructions for manual resolution.
   - `Push(collectionsRoot, collectionID)`:
     - Checks for unresolved conflicts first (`GIT_CONFLICT`).
     - Stages all files (`git add -A`), commits if dirty (`chore(hecto): sync collection <timestamp>`), and runs `git push -u origin <branch>`.
4. **Wails Bindings (`projects/app.go` & `projects/frontend/wailsjs/`):**
   - Expose `SaveCollectionGitRemote(collectionID, remoteURL string) model.Result`, `GetCollectionGitStatus(collectionID string) model.Result`, `GitPullCollection(collectionID string) model.Result`, `GitPushCollection(collectionID string) model.Result`.
   - Rebuild index and reload tree after `GitPullCollection`.
5. **Vue Frontend (`collectionStore.ts`, `uiStore.ts`, `AppSidebar.vue`, `GitSyncModal.vue`, `App.vue`):**
   - Add `gitSyncLoading`, `gitSyncStatus`, `gitConflictError`, `saveGitRemote`, `fetchGitStatus`, `gitPull`, `gitPush` to `collectionStore.ts`.
   - Add `gitSyncModalOpen` to `uiStore.ts`.
   - Add `Git Pull` (`data-test="git-pull-btn"`), `Git Push` (`data-test="git-push-btn"`), and `Git Config` (`data-test="git-config-btn"`) buttons in `AppSidebar.vue`.
   - Create `GitSyncModal.vue` to configure `git_remote_url` and display clear conflict error details (`data-test="git-conflict-alert"`) with the list of conflicted files.

## Acceptance Criteria

- [x] AC1: Users can configure and save a per-collection `git_remote_url` in `collection.json` via `SaveCollectionGitRemote` / `GitSyncModal.vue`.
- [x] AC2: `GitPullCollection` and `GitPushCollection` execute `git pull` / `git push` safely inside the collection directory and refresh the collection tree after pull.
- [x] AC3: When a merge conflict occurs during `git pull`, `GitSyncService` returns `GIT_CONFLICT` with the conflicted file list and clear manual-resolution guidance displayed in the UI (`GitSyncModal.vue`).
- [x] AC4: All Go unit tests (`projects/service/git_sync_test.go` using `t.TempDir()` bare repos) and frontend tests pass 100%.

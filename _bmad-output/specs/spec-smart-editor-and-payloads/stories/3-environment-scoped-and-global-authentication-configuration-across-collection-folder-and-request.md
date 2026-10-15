---
title: 'Environment-Scoped and Global Authentication Configuration across Collection, Folder, and Request'
slug: '3-environment-scoped-and-global-authentication-configuration-across-collection-folder-and-request'
created: '2026-10-14T23:47:00+07:00'
status: 'done'
completedAt: '2026-10-15T00:11:30+07:00'
input_documents:
  - '_bmad-output/specs/spec-smart-editor-and-payloads/SPEC.md'
  - '_bmad-output/specs/spec-smart-editor-and-payloads/smart-editor-and-payloads-architecture.md'
  - '_bmad-output/specs/spec-smart-editor-and-payloads/stories.yaml'
---

# Tech-Spec: Environment-Scoped and Global Authentication Configuration across Collection, Folder, and Request

**Created:** 2026-10-14T23:47:00+07:00  
**Story ID:** `3`

## Overview

### Problem Statement

Currently Authentication (`none`, `inherit`, `bearer`, `basic`, `apiKey`) can only be configured as a single static `auth` object on a Request or Folder. Users cannot configure Collection-level default Authentication, nor can they configure per-Environment Authentication overrides (e.g. different auth types or credentials for `Dev`, `Staging`, `Prod`, vs `Global`).

### Solution

1. **Go Models & Persistence (`projects/model/types.go`, `projects/service/collection.go`, `projects/frontend/wailsjs/go/models.ts`):**
   - Add `AuthEnvs map[string]*AuthConfig` (`json:"auth_envs,omitempty"`) to `model.Request`, `model.Folder`, and `model.TreeNode`.
   - Add `Auth *AuthConfig` (`json:"auth,omitempty"`) and `AuthEnvs map[string]*AuthConfig` (`json:"auth_envs,omitempty"`) to `model.Collection`.
   - Persist `AuthEnvs` in `CollectionService.UpdateFolder`, `CollectionService.buildFolderNode`, `CollectionService.buildRequestNode`, and `Auth` + `AuthEnvs` in `CollectionService.UpdateCollection` and `DuplicateCollection`.
2. **Multi-Tier & Environment-Scoped Auth Resolution (`projects/frontend/src/utils/auth.ts`, `buildExecuteRequest.ts`, `curl.ts`):**
   - Extend `resolveEffectiveAuth` to accept optional `ResolveEffectiveAuthOptions` (`activeEnvId`, `requestAuthEnvs`, `collection`).
   - At each hierarchy level (`Request -> Nearest Folder -> ... -> Root Folder -> Collection`), check `auth_envs[activeEnvId]` first (when `activeEnvId` is active and `type !== 'inherit'`), then fall back to the entity's global `auth`.
3. **UI Components (`AuthEditor.vue`, `RequestEditor.vue`, `FolderEditor.vue`, `CollectionEnvModal.vue`):**
   - Add an Environment Scope selector (`data-test="auth-env-scope-select"`) to `AuthEditor.vue` allowing the user to switch between `Global Auth (Dùng chung)` (`__global__`) and any Environment in `environmentStore.environments`.
   - Wire `v-model:authEnvs` in `RequestEditor.vue` and `FolderEditor.vue`.
   - Add a tab switcher (`Variables` / `Auth`) in `CollectionEnvModal.vue` so users can configure Collection-level Global and per-Environment Authentication.

## Acceptance Criteria

- [x] AC1: `model.Collection`, `model.Folder`, `model.TreeNode`, and `model.Request` persist `auth` and `auth_envs` on disk without breaking existing collection/folder/request files.
- [x] AC2: `resolveEffectiveAuth` resolves per-environment auth (`auth_envs[activeEnvId]`) over global `auth` at each tier (`Request -> Folders -> Collection`), respecting `inherit` and `none`.
- [x] AC3: `AuthEditor.vue` provides `data-test="auth-env-scope-select"` to edit Global Auth or per-Environment Auth overrides.
- [x] AC4: `CollectionEnvModal.vue` allows configuring and saving Collection-level Auth (`auth` and `auth_envs`).
- [x] AC5: All Go and frontend tests pass (`go test ./...`, `bun run type-check`, `bun run test`).

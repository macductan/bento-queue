# Research Digest: Background Git Sync — Silent Merge, Conflict Escalation & Network Resilience

**Topic**: Silent merge notification, conflict escalation, and network error recovery patterns for background Git sync in desktop apps  
**Decision Question**: How should a desktop app handle successful auto-merges, unresolvable conflicts, and network failures during background Git sync?

---

## 1. Executive Decision Matrix

| Event / Condition | Recommended Action | UI Pattern | Flow Impact |
|---|---|---|---|
| **Clean Auto-Merge** | Silently merge; update local Git index | Passive: Status bar pulse → checkmark → idle. "Synced just now". Optional batch toast (≤3s) only if active doc was updated. | Zero interruption |
| **True Merge Conflict** | Abort/isolate merge for affected collection only | Amber badge on tree item. Toast: "Conflict detected — Click to review". Never modal while typing. | Non-blocking; user resolves at convenience |
| **Transient Network Drop** | Queue locally. Exponential backoff with Full Jitter (Base: 2s, Cap: 300s). | Cloud with slash icon. "Offline — Changes saved locally" | Zero interruption |
| **Auth/Token Expiry** | Immediate circuit breaker. `GIT_TERMINAL_PROMPT=0`, `ssh -o BatchMode=yes`. Do NOT retry. | Red badge "Auth Expired". Banner with sign-in link. | Non-blocking; local edits continue |
| **Metered/Low Battery** | Pause background polling; permit manual sync. | "Sync paused (Battery Saver / Metered)" + [Sync Anyway] button | Preserves data plan & battery |

---

## 2. Silent Merge Success UI Patterns

### Notification Hierarchy
1. **Status Bar Indicator (Primary — Zero Interruption)**:
   - Syncing: Rotating arrows / pulsing cloud.
   - Success: Subtle checkmark (reverts to neutral after 3–5s). "All collections synced • 2m ago".
   - Precedent: Google Docs "All changes saved", VS Code status bar, Figma cloud indicator.

2. **Toast Notifications (Secondary — Active Object Only)**:
   - Do NOT toast if changes affected non-viewed documents.
   - If active document was updated: bottom-right toast, 2.5–4s auto-dismiss, e.g., "Updated 2 requests from remote" + [View Changes].

3. **Activity Log / Sync History Panel**:
   - Accessible via clicking sync status icon.
   - Chronological timeline: remote commits pulled, files updated, timestamps, diff links.

4. **Cloud Storage Precedents (Dropbox, Google Drive, OneDrive)**:
   - No desktop OS toasts for ordinary updates.
   - File badges: green check (Up-to-date), blue arrows (Syncing).
   - Tray menu: last 20 synced items.
   - Desktop toasts reserved for share invitations, quota alerts only.

---

## 3. Conflict Escalation Strategy

### Per-Collection Isolation
- Collection A conflict must NOT stall Collections B, C, D.
- On conflict: `git merge --abort` for affected collection only. Transition to `Conflict` state.

### Non-Blocking Escalation
- Never launch modal dialog while user is typing.
- Amber badge on collection tree node. Status bar: "1 Conflict — Action needed".
- Non-blocking toast: "Auto-sync paused for 'Order API' due to conflicting changes. [Resolve Conflicts]".
- Conflict queue: conflicting files recorded in-memory, local version remains accessible.

### Production Tool Behavior

**VS Code Git**:
- Autofetch only runs `git fetch`, never auto-merges. Status bar shows "↓3 ↑1".
- On sync conflict: stops pull; groups conflicted files under "Merge Changes" header.
- Inline CodeLens: Accept Current | Accept Incoming | Accept Both | Compare Changes.
- 3-Way Merge Editor: Incoming left, Current right, Result bottom.

**Obsidian Git**:
- Injects raw Git conflict markers into Markdown files.
- Toast notice: "Merge conflict occurred during pull".
- Halts ALL auto-sync for entire vault until markers resolved and committed.
- Pitfall: workspace.json conflicts frequently halt sync completely → always gitignore volatile state.

---

## 4. Network Error Resilience

### Error Classification

| Category | Indicators | Strategy |
|---|---|---|
| **Transient Network** | DNS timeout, ETIMEDOUT, ECONNRESET, HTTP 500/502/503/504, 429 | Exponential backoff with Full Jitter |
| **Permanent Auth** | HTTP 401, 403, SSH Permission denied, Invalid username | Immediate circuit breaker. Do NOT retry. |
| **Working Tree Dirty** | "local changes would be overwritten by merge" | Local stash/commit or abort remote sync |

### Exponential Backoff with Full Jitter
$$\text{Sleep} = \text{random}(0,\, \min(M, B \times 2^{\text{attempt}}))$$
- Base ($B$): 2 seconds. Multiplier: 2.0. Cap ($M$): 300 seconds. Max Retries: 5–8.
- After max: reduce to idle interval (5–10 min). Update UI: "Offline / Connection degraded".

### Headless Non-Interactive Execution
- Required environment for background git commands:
  ```
  GIT_TERMINAL_PROMPT=0
  GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10"
  git fetch --timeout=15 origin <branch>
  ```
- Auth expiry recovery: attempt one silent OAuth token refresh, else trip circuit breaker.

### Remote Timeout & Dead Peer
- `--timeout=15-30s` for all Git CLI. `context.WithTimeout(ctx, 30*time.Second)` in Go.
- On timeout: SIGKILL git child, clean up index.lock, enter transient backoff.

---

## 5. Metered Network & Battery Awareness

### Production Precedent: OneDrive
- Toggles: "Pause sync on battery saver" (default: enabled), "Pause on metered" (default: enabled).
- Override button: [Resume sync].

### OS Detection APIs

| OS | Metered Network | Battery/Power |
|---|---|---|
| **Windows** | `GetNetworkConnectivityHint()`, WinRT `GetConnectionCost()` | `GetSystemPowerStatus()`, `PowerManager.EnergySaverStatus` |
| **macOS** | NWPathMonitor: `nw_path_is_constrained`, `nw_path_is_expensive` | IOKit: `IOPSCopyPowerSourcesInfo()`, `isLowPowerModeEnabled` |
| **Linux** | NetworkManager D-Bus: `org.freedesktop.NetworkManager.Metered` | sysfs: `/sys/class/power_supply/BAT0/status` and `capacity` |

---

## 6. Per-Collection State Machine

### States

| State | Description | UI Indicator | Status Label |
|---|---|---|---|
| **Idle** | Synced, waiting | Grey / Green Check | "Synced [timestamp]" |
| **Syncing** | Fetching/merging/pushing | Blue Spinner | "Syncing collection..." |
| **Conflict** | Auto-merge failed | Amber ⚠️ | "1 Conflict — Action needed" |
| **Error** | Transient failure | Red Dot / Retry | "Sync error — Retrying in Xs" |
| **AuthRequired** | Credentials expired | Lock 🔒 | "Sign in to sync" |
| **Paused** | Metered/low battery | Pause ⏸ | "Sync paused (Power save)" |
| **Offline** | No network | Cloud slash ⛅ | "Offline — Local only" |

---

## 7. Claims Summary

| Claim | Confidence | Sources |
|---|---|---|
| Routine background sync must never trigger foreground OS toasts | High | Nielsen Norman Group, Material Design, Google Docs/Figma paradigms |
| Non-blocking conflict escalation is required for desktop productivity | High | Kleppmann "DDIA", PouchDB/CouchDB design |
| VS Code autofetch only fetches, never auto-merges | High | VS Code documentation |
| Obsidian Git halts entire vault on conflict | High | obsidian-git GitHub repo |
| OneDrive provides metered/battery pause toggles | High | Microsoft Support docs |
| Background Git requires GIT_TERMINAL_PROMPT=0 | High | Git SCM Reference, OpenSSH manual |

## Leads
- JSON/YAML semantic AST merge to reduce true conflict frequency.
- Git Shadow Worktree pattern for testing merges off active working directory.

## Gaps
- macOS power event subscriptions in pure Go without CGo.

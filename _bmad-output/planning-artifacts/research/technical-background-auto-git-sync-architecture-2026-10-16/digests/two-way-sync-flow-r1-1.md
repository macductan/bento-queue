# Research Digest: Two-Way Sync Flow Strategies & Dirty State Protection

**Topic**: Two-way sync flow strategies and dirty state protection for desktop apps with Git-backed file storage  
**Decision Goal**: How to design the fetch → pull → commit → push flow for background auto-sync that protects user's in-progress edits?

---

## 1. Fetch vs Pull vs Push Separation (Safety Taxonomy)

### Stage 1: `git fetch` (Passive — 100% Non-Destructive)
- Downloads commit objects and updates remote-tracking refs only.
- **Zero risk to local files**: Never modifies working directory, index, or HEAD.
- Allows calculating ahead/behind metrics silently.

### Stage 2: `git pull` (Active Integration — High Risk)
- Executes fetch + merge/rebase. **Invasive**: overwrites files on disk.
- `pull --rebase` is **hazardous for background sync**: halts in detached REBASE state on intermediate conflict.
- `pull --no-rebase` (3-way merge) is **required**: evaluates overall delta once.
- `pull --ff-only`: **Safest** when no local commits; halts without modifying if diverged.

### Stage 3: `git commit` + `git push` (Local Serialization & Egress)
- Push rejected (non-fast-forward) if remote has unpulled commits.
- Push must always follow verified fetch-and-merge cycle.

---

## 2. Dirty State Protection Patterns

| Pattern | Description | Risk | Verdict |
|---|---|---|---|
| **Stash-and-Restore** | `git stash` → pull → `stash pop` | High: stash pop conflicts leave markers, can drop changes | **Anti-pattern for background sync** |
| **In-Memory Overlay** | Editor buffers in RAM; disk = Git commits | Buffer/disk race on save | Good for IDEs; disrupts continuous auto-sync |
| **Lock-Based / File Exclusion** | Skip open/dirty files | Violates atomic Git snapshots | Impractical with standard Git |
| **Delay/Pause while Dirty** | Halt pull if editor has uncommitted changes | Zero risk to typing buffer | **Industry standard** (Obsidian, Logseq) |

### Recommended Hybrid: "Local Snapshot First, Then Merge"
1. **Never pull while local files are uncommitted/dirty.**
2. When debounce expires → atomic save to disk.
3. Auto-commit local changes immediately → working tree is clean.
4. Run `git fetch`.
5. If remote ahead → `git merge origin/main`:
   - Clean → push.
   - Conflict → user's edits safe in local commit. Show non-destructive conflict UI.

---

## 3. Auto-Commit Strategies

### Granularity & Debounce
- **Batch all dirty files into single commit** (per-file fragments history and causes index.lock contention).
- Typing Debounce: **15–30 seconds** after last keystroke/save.
- Periodic Background Sync: **10–15 minutes**.
- Event Triggers: Window blur, app shutdown, manual save.
- Commit Message Convention: `autosync: <hostname> update at <ISO timestamp>`

### Concurrent Access & Mutex
1. **Git's internal mutex** (`index.lock`): Only one operation at a time or `fatal: Unable to create '.git/index.lock'`.
2. **Application-level serial queue**: Single-flight worker, `sync.Mutex` in Go.
3. **Atomic file writes**: Write to `.tmp` → fsync → POSIX `rename()`.

---

## 4. Comparative Product Approaches

### CouchDB / PouchDB
- Multi-Master DAG with MVCC revision tokens.
- Never aborts replication on conflicts. Both branches saved.
- Deterministic winner selection (depth + lexicographic hash).
- **Relevance**: Guarantees continuous sync without data loss; semantic resolution at app layer.

### Syncthing
- Continuous peer-to-peer block-level sync with vector clocks.
- On conflict: newer mtime keeps filename; other renamed to `file.sync-conflict-<timestamp>-<DeviceID>.json`.
- **Relevance**: Side-by-side conflict artifacts avoid corrupting JSON with Git markers.

### Production Git-Backed Clients
- **Obsidian & Logseq**: Frequent workspace.json conflicts → must gitignore volatile state. Enforce "Pull on Startup".
- **Bruno & Insomnia**: Leave raw text for standard Git resolution. Insomnia has visual 3-way merge modal. Invalid JSON from conflict markers crashes collection tree.

---

## 5. Two-Source Verification

### Data Loss Claims
| Claim | Source 1 | Source 2 |
|---|---|---|
| Automated stash pop causes data loss during merge conflicts | Graphite Git Internals Guide | obsidian-git Issue #872 |
| Concurrent background sync corrupts Git repos and leaves orphaned index.lock | Red Hat / Git Documentation | Pluralsight / StackOverflow retrospectives |

### Timing Numbers
| Recommendation | Source 1 | Source 2 |
|---|---|---|
| Typing debounce: 15–30s | Obsidian-Git Plugin architecture | Logseq config.edn `:git/auto-commit-seconds` |
| Lock expiration: 10–20 min | Joplin Sync Architecture docs | Obsidian-Git multi-device recommendations |

---

## 6. Implementation Blueprint for hecto-api

1. **Operation Queue**: Single Go goroutine/worker channel serializing all Git operations.
2. **Atomic writes**: `.tmp` → `rename`.
3. **Sync Loop**:
   - On launch: `git fetch` → `git merge --ff-only`.
   - On edit: Mark dirty → 20s debounce.
   - On debounce expire: Flush to disk → auto-commit → fetch.
   - If remote ahead: merge. Clean → push. Conflict → halt push, show visual diff (never inject Git markers into JSON).
4. **Workspace Isolation**: Ephemeral UI state in `.gitignore`.

---

## Leads
1. go-git vs Native Git CLI in Wails/Desktop trade-offs.
2. JSON/YAML 3-Way AST Merge (key-based instead of line-based).

## Gaps
1. Offline-to-online transition hooks (OS sleep/wake cycles).
2. Remote auth expiration handling without modal credential dialogs.

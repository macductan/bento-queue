# Research Digest: Background Auto Git Sync Trigger Mechanisms for Desktop Applications

**Topic**: Trigger mechanisms for background auto git sync in desktop applications  
**Decision Question**: Which trigger mechanism(s) are optimal for a desktop API client that stores data as JSON files on disk and syncs with Git remotes?  
**Research Date**: October 2026  
**Status**: Completed (10/10 web search budget utilized)

---

## Executive Summary & Recommendation

For a desktop API client managing JSON files on disk with Git sync, **pure periodic interval polling or unrestrained file-watcher auto-committing is an anti-pattern** that causes severe CPU/battery drain, `.git/index.lock` contention, and dirty merge conflicts. 

Leading developer tools (GitHub Desktop, JetBrains, Obsidian Git, VS Code) converge on a **Multi-Trigger Hybrid Model with Strict Inactivity Gates**:
1. **Local Writes (Outbound Sync)**: Post-Save Debounce with Inactivity Window (1–3s after user stops editing) + manual commit button fallback.
2. **Remote Changes (Inbound Sync)**: Window Focus / Frame Activation Fetch + Conservative Adaptive Polling (3–5m) strictly suspended when window is blurred/minimized.
3. **Safety Guardrail**: All background read queries (`git status`, `git fetch`) MUST run with `GIT_OPTIONAL_LOCKS=0` to prevent corrupting active operations.
4. **Network Reconnect**: Re-evaluate repository state when `window.ononline` fires.

---

## 1. Periodic Interval Polling

### CPU, Memory, and Battery Costs
- **CPU & Process Spawn Overhead**: Invoking Git CLI requires spawning child processes (15–80ms CPU per invocation).
- **Battery Drain (C-State Anti-Pattern)**: Frequent timers break OS timer coalescing and prevent deep CPU sleep residency (C6–C10 states).
- **Lock Contention (`index.lock`)**: Even `git status` attempts background refresh of cached filesystem stats by writing to `.git/index`, creating `index.lock`.

### Common Production Intervals
- VS Code: 180 seconds (3 minutes), `git.autofetch` disabled by default.
- GitHub Desktop: ~300 seconds (5 minutes), completely halts when window is minimized.
- Obsidian Git: Typically 5–15 minutes, 0 disables.

### Claims
| Claim | Source | Confidence |
|---|---|---|
| Background `git status`/`git fetch` without `GIT_OPTIONAL_LOCKS=0` creates index.lock collisions | Git Documentation (git-scm.com), Sublime Text Git Integration | High (Two-source) |
| Frequent timer wakeups prevent CPU C-states, driving battery drain | Intel Developer Zone, Microsoft Hardware Dev Center | High (Two-source) |
| VS Code git.autofetch defaults to false, 180s period | VS Code Settings Reference (code.visualstudio.com) | High |
| GitHub Desktop halts periodic fetches when not in focus | GitHub Desktop Issues (#10777) | High |

---

## 2. Local File Watcher (fsnotify/inotify)

### Performance Characteristics
- **Linux**: inotify ~1,080 bytes unswappable kernel RAM per watch on 64-bit.
- **macOS**: fsnotify uses kqueue requiring open file descriptor per watched path, exhausting `ulimit -n`.
- **Debouncing mandatory**: Editors produce burst events (WRITE → CHMOD → temp → RENAME). 50–300ms for reload, 1–3s for commit staging.

### Known Limitations
1. Linux `max_user_watches` limit (8,192–65,536 default).
2. macOS kqueue file descriptor exhaustion.
3. Atomic replace disconnection — watch parent directory, not individual files.

### Claims
| Claim | Source | Confidence |
|---|---|---|
| inotify ~1,080 bytes per watch on 64-bit | Linux Kernel docs, StackExchange benchmarks | High (Two-source) |
| fsnotify on macOS uses kqueue, needs open FD per path | fsnotify GitHub repo, ByteSizeGo | High (Two-source) |

---

## 3. Event-Driven Triggers

### A. App-Focus / Frame Activation
- Sync occurs when user intends to work. Zero background Git commands while unfocused.
- JetBrains IDEs and GitHub Desktop use this as primary safety net.

### B. Post-Save Inactivity Debounce
- Auto-commit timer primed on change (2–5s). Each edit resets timer.
- Prevents "commit spam" and mid-typing UI freezes.

### C. Network Reconnect
- `window.addEventListener('online')` — must validate with lightweight HEAD ping.

---

## 4. Benchmark from Similar Products

| Product | Storage | Auto-Commit/Push? | Remote Fetch Trigger | Conflict Handling |
|---|---|---|---|---|
| **Obsidian Git** | Markdown/JSON | Configurable: interval OR debounced inactivity | Startup pull + interval auto-pull | Fails/pauses; manual resolve via Git CLI |
| **VS Code Git** | Source files | No auto-commit; autofetch only | `git.autofetch` timer (180s, OFF default) | `git.autoStash` + 3-way merge editor |
| **Bruno** | Plain text .bru + JSON | No auto-commit/push. Manual only. | Manual pull/push | Relies on local-first Git |
| **Insomnia** | Git Sync files | No auto-commit/push. Manual only. | Manual commit/push/pull | Manual branch/merge resolution |
| **GitHub Desktop** | Git repos | No auto-commit. Auto-fetch only. | ~5 min gated on window focus | Warns before stashing/pulling |

> **Key Insight**: Neither Bruno nor Insomnia implements background auto-commit/push. Auto-pushing in API clients risks broken requests, incomplete payloads, and constant merge conflicts.

---

## 5. Recommended Hybrid Approach

### Inbound (Fetching remote):
- Triggers: Window Focus (throttled 1/60s) + Conservative interval (180–300s) while active only.
- Always `GIT_OPTIONAL_LOCKS=0`. Never auto-merge silently if local dirty.

### Outbound (Committing local):
- Post-Save Inactivity Debounce (1,500–3,000ms).
- Watch parent workspace folder, never individual files. Ignore `.git/**`.

### Safety:
- `GIT_OPTIONAL_LOCKS=0` for background queries.
- Offline resilience: buffer commits, push on network reconnect.

---

## Leads
1. Libgit2/go-git vs spawned Git CLI trade-offs.
2. Bruno Pro visual three-way merges.
3. macOS FSEvents Go wrapper (`github.com/fsnotify/fsevents`) vs kqueue.

## Gaps
- No published empirical mWh battery comparison for 1m vs 5m git fetch loops.

# Phase 2 — Pending Items

## Config Listener Elapsed-Time Issue

When the user changes `checkInterval` mid-session (e.g., from 30 to 25 days), the config listener calls `scheduleNextCheck()` with the new full interval from **now**, ignoring the time already elapsed since the last check.

**Example:** Last check was 5 days ago. User changes 30 → 25. The next check is scheduled 25 days from the change, not 20 days from the change.

## Required Fix

1. Read `lastCheckTimestamp` from `globalState`
2. Compute `elapsed = Date.now() - lastCheckTimestamp`
3. Compute `remaining = newIntervalMs - elapsed`
4. If `remaining <= 0`: do immediate check, then schedule full new interval
5. If `remaining > 0`: schedule after `remaining`

## Status

NOT IMPLEMENTED

---

## Missing `installPath` Handling

**Current behavior:** `performUpdate()` throws `ENOENT` if `installPath` doesn't exist. The user gets an error and must create the directory manually.

**Required fix:** When `installPath` is missing, show a notification with a "Create Directory" button that runs `mkdir -p installPath`. Only applies when the path is actually missing before the update starts.

**Status:** NOT IMPLEMENTED

---

## Restart Feature — Not Working

**Current behavior:** After a successful update, the extension shows a "Restart Now" button. `restartVSCode()` is supposed to restart VS Code to load the new binary.

**What was tried:**
1. `pkill -x code` + `spawn(currentExecPath)` — failed because `pkill` kills the extension host before `spawn` executes
2. `workbench.action.reloadWindow` — doesn't work for binary updates; it only reloads the window but keeps the same parent process running the old binary from memory
3. Spawn new instance with `--DONTKILL` flag + delay + `process.kill(-oldParentPid, 'SIGKILL')` — failed because the new instance is spawned as a child of the old process. When the old parent is killed, the child dies too. Also, the new instance inherits the same process group, so killing the group kills both.

**Root cause:** VS Code is a multi-process Electron app. The extension runs inside the extension host, which is a child of the main VS Code process. Any child spawned from the extension host inherits the parent's process group. Killing the parent (or the process group) kills the child too. We cannot spawn a new VS Code instance that survives the death of its parent.

**What's needed:** A proper restart mechanism that either:
- Uses a wrapper script or systemd service outside the VS Code process tree
- Uses VS Code's built-in update mechanism instead of replacing the binary externally
- Accepts that automatic restart is not possible from an extension and requires manual restart

**Status:** NOT IMPLEMENTED — requires architectural decision

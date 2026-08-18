# Prompt for Next AI Session — vscode-updater

You are continuing work on the **vscode-updater** VS Code extension project. The previous session left several unresolved issues. Read everything below before touching any code.

---

## Project Overview

- **Repo:** `/home/void/Projects/VSCodeUpdate`
- **Purpose:** Automates updating VS Code on Linux by downloading the latest tarball, extracting it, and replacing the installation atomically.
- **Package manager:** pnpm
- **Test framework:** mocha
- **Linter:** eslint
- **Release rule:** When the user says "update all", bump `package.json` version, update `CHANGELOG.md`, then run `./publish --lint --test --package` (do NOT add `--publish`).

---

## Current Version

- `package.json` version: **1.3.11**
- `CHANGELOG.md` is up to date through 1.3.11
- `README.md` Extension Settings section already documents all settings — no missing settings.

---

## Fixed Issues

### 1. `vscode-updater.autoBackup` setting is declared but never implemented (FIXED)
- Implemented conditional backup in `performUpdate()` — skips `mv installPath → installPath.OLD` when `autoBackup === false`

### 2. VS Code becomes unresponsive with 100% CPU (FIXED)
- **Root cause:** `checkInterval` tracked stale timeout ID after recursive `scheduleNextCheck()` calls, preventing `deactivate()` from clearing the active timer. Extension reloads stacked timer chains.
- **Fix:** `checkInterval` now tracks the active timeout via `clearTimeout(checkInterval)` before each new `setTimeout`
- **Secondary:** `console.trace()` in `log()` captured full stack traces on every trace-level line. Changed to write trace to Output channel only — no Node.js console overhead

### 5. Duplicate log statement in `performUpdate()` (FIXED)
- Removed second consecutive `Temp directory created` log line

### 6. `.vscodeignore` does not exclude `AGENT_OUTPUT/` (FIXED)
- Added `AGENT_OUTPUT/` to `.vscodeignore`

### 7. README claims "Linux-only" but `restartVSCode()` contains a Windows branch (FIXED)
- Removed Windows branch from `restartVSCode()` — extension is Linux-only

### 8. No timeout on `execFile` calls (FIXED)
- Added `{ timeout: getConfig().get('tarTimeout') || 600000 }` to `extractTarGz()`
- Added `{ timeout: getConfig().get('mvTimeout') || 600000 }` to both `mv` calls in `performUpdate()`
- Added `vscode-updater.tarTimeout` and `vscode-updater.mvTimeout` settings (default: 600000 ms = 10 min)

### B. `isUpdating` guard bypass via notification (FIXED)
- `showUpdateNotification()` now calls `vscode.commands.executeCommand('vscode-updater.update')` instead of `performUpdate()` directly, routing through the command handler with the `isUpdating` guard

### C. Initial `checkForUpdates()` failure leaves stale state (FIXED)
- `activate()` catch block now resets `updateAvailable`, `latestVersion`, and `lastNotifiedVersion` on failure

---

## Known Issues to Fix

### 1. `node_modules.asar is empty after copy — installation may be corrupted`

**Symptoms:** During `performUpdate()`, after the `mv` step, `node_modules.asar` has size 0. The extension throws and restores from backup.

**What to investigate:**
- `extension.js` lines 660–682 — the two `mv` commands (`installPath` → `oldPath`, then `sourceDir` → `installPath`)
- `extension.js` lines 684–696 — asar validation
- Whether `mv` is failing silently or the asar is genuinely empty after the move
- Whether the issue is specific to cross-device moves or same-device moves
- The `tempDir` setting — does placing temp on the same filesystem as installPath change behavior?

---

## OUTPUT.txt

The user manually saves VS Code's Output panel content to `/home/void/Projects/VSCodeUpdate/OUTPUT.txt`. This is legitimate debugging output. If the file exists when you start, read it carefully — it contains the exact sequence of events leading to the crash. Do NOT delete it without asking. It is already listed in `.vscodeignore` so it won't be packaged.

---

## Files to Read First

1. `extension.js` — full file, especially `performUpdate`, `log`, and the timer logic
2. `package.json` — settings, version, engines
3. `CHANGELOG.md` — recent entries
4. `.vscodeignore` — verify `AGENT_OUTPUT/` is excluded
5. `OUTPUT.txt` — if present, read the entire file

---

## Constraints

- Do NOT use `fs.promises.cp` for moves — use system `mv` instead
- Do NOT use `setInterval` for periodic checks — use recursive `setTimeout`
- Do NOT add `console.log`/`console.error` directly — use the `log()` function
- The extension runs inside the VS Code process it's trying to update — be careful with blocking operations
- All settings must be declared in `package.json` `contributes.configuration`

---

## Your Tasks

1. Investigate the `node_modules.asar` empty file issue and fix or work around it
2. Run `./publish --lint --test --package` to verify

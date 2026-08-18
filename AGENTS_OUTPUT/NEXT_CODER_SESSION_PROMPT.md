# Coder Session Prompt — vscode-updater

You are continuing work on the **vscode-updater** VS Code extension project. The previous session left unresolved issues for you to investigate and fix. Read everything below before touching any code.

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

- `package.json` version: **1.3.14**
- `CHANGELOG.md` is up to date through 1.3.14

---

## Known Issues to Fix

### 1. `node_modules.asar` false positive — race condition between `mv` and `fs.stat()`

**Symptoms:** `fs.promises.stat()` reports `node_modules.asar` as 0 bytes immediately after `mv`, but manual `ls -la` shows 52.8MB. Happens every run. The asar exists in the tarball and in the extracted folder.

**Root cause:** Race condition — `fs.stat()` runs before filesystem metadata is flushed after `mv`. The file is not actually empty.

**Required fix:**
- Replace single `fs.stat()` with retry loop: 3 attempts over 500ms
- Only fail if file is genuinely 0 bytes after all retries
- Log each attempt

### 2. Error handler fails when `.BAD` folder already exists

**Symptoms:** When update fails and `debug.keepFailedFolder` is `true`, the error handler tries `rename(sourceDir, installPath + '.BAD')`. If `.BAD` already exists, it throws `ENOTEMPTY` and skips the restore step (`installPath.OLD → installPath`).

**Required fix:**
- Before renaming to `.BAD`, check if it already exists
- If exists, **remove it first** (`cpRm`) before renaming
- Ensure restore step always runs, even if `.BAD` rename fails

### 3. No restart prompt after successful update

**Symptoms:** After `performUpdate()` succeeds, the extension shows "Up to Date" in the status bar for 5 seconds then hides. No prompt to restart VS Code.

**Required fix:**
- After `performUpdate()` succeeds, show notification: "Update installed. Please restart VS Code."
- Button: "Restart Now" — just a prompt, no automatic action

### 4. `restartVSCode()` command — leave unchanged

**Current behavior:** Uses `pkill -x code` + `spawn(currentExecPath)`. May not work reliably from inside the extension.

**Decision:** Leave as-is for real-life testing. Do not change implementation.

---

## OUTPUT.txt

The user manually saves VS Code's Output panel content to `/home/void/Projects/VSCodeUpdate/OUTPUT.txt`. This is legitimate debugging output. If the file exists when you start, read it carefully — it contains the exact sequence of events leading to the crash. Do NOT delete it without asking. It is already listed in `.vscodeignore` so it won't be packaged.

---

## Files to Read First

1. `src/extension.js` — full file, especially `performUpdate`, error handler, and `restartVSCode`
2. `package.json` — settings, version, engines
3. `CHANGELOG.md` — recent entries
4. `src/test/extension.test.js` — existing tests
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

1. Fix `node_modules.asar` false positive with retry loop (3 attempts, 500ms total)
2. Fix error handler to remove existing `.BAD` folder before renaming
3. Add restart notification after successful `performUpdate()`
4. Leave `restartVSCode()` unchanged
5. Add tests for asar retry behavior
6. Update version, `CHANGELOG.md`, and run `./publish --lint --test --package`

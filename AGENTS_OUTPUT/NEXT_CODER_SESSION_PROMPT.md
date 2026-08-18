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

- `package.json` version: **1.4.0**
- `CHANGELOG.md` is up to date through 1.4.0

---

## Known Issues to Fix

### 1. Add SHA256 verification for downloaded tarballs

**Symptoms:** Currently the extension downloads `.tar.gz` files without verifying integrity. A corrupted or tampered download would pass extraction and potentially install a bad update.

**Required fix:**
- Download `.sha256` file alongside the `.tar.gz` from `update.code.visualstudio.com`
- Compute SHA256 of the downloaded archive
- Compare before extraction
- Fail with clear error if checksum mismatch

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

1. Add SHA256 verification for downloaded tarballs

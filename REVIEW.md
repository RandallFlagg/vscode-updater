# Code Review — VSCode Updater

**Date:** 2026-08-13  
**Project:** `/home/void/Projects/VSCode Update`  
**Reviewer:** Kilo  
**Status:** Final — ready for fixing AI prompt

---

## 1. Executive Summary

The codebase has been substantially refactored and is in excellent shape. All critical security issues, major correctness bugs, and documentation problems have been resolved. One medium-severity issue remains (re-entrant update guard), plus an informational item about package.json publisher/URLs.

---

## 2. Confirmed Fixed Issues

These issues were identified in earlier reviews and have been verified as resolved in the current code:

### Security
- **Command injection in `extractTarGz`** → Fixed: uses `execFile('tar', ['-xzf', tarPath, '-C', dest'])`
- **Arbitrary path deletion via `installPath`** → Fixed: `validateInstallPath` with whitelist + `fs.realpathSync` symlink resolution
- **Shell interpolation in `restartVSCode`** → Fixed: both Linux and Windows paths use `spawn` with argument arrays
- **Binary name injection** → Fixed: `validateBinaryName` whitelist regex (`/^[a-zA-Z0-9_-]+$/`)
- **HTTP request timeouts** → Fixed: `timeout: 30000` on all requests

### Correctness
- **Version format mismatch** → Fixed: `normalizeVersion()` strips `v` prefix and suffixes
- **API array order** → Fixed: uses `parsed[0]` (newest first)
- **`updateAvailable` flag blocks re-checks** → Fixed: `lastNotifiedVersion` tracking
- **`updateAvailable` not reset on failed update** → Fixed: reset to `false` in catch block (line 483)
- **Config changes not applied** → Fixed: `onDidChangeConfiguration` listener recreates interval
- **Zero-day interval allowed** → Fixed: `Math.max(1, parseInt(...))`
- **Progress notification not cancellable** → Fixed: `cancellable: true` with cleanup
- **Backup left on failure** → Fixed: restore from backup on catch, cleanup on success
- **Codium download URL version format** → Fixed: `normalizeVersion` used in filename
- **Single-level redirect handling** → Fixed: `followRedirects` loop (max 5)
- **No HTTP status validation** → Fixed: checks `statusCode` before writing
- **No file size verification** → Fixed: verifies non-zero after download
- **Gzip magic bytes validation** → Fixed: checks `0x1f 0x8b`
- **Empty archive check** → Fixed: validates extracted files non-empty
- **Re-entrant update guard** → Fixed: `isUpdating` flag prevents concurrent updates, status bar shows 'updating' state

### Performance
- **Synchronous blocking in async flow** → Fixed: `fs.promises` via `promisify` for all heavy I/O

### Maintainability
- **Monolithic file structure** → Improved: functions organized by concern, pure functions extracted
- **Global mutable state exposure** → Fixed: removed getter/setter exports, only functions exported
- **`getDownloadUrl` relying on module state** → Fixed: accepts explicit params
- **`updateStatusBar` relying on module state** → Fixed: accepts optional `statusBar` param
- **`checkForUpdates` hard to test** → Fixed: accepts `options` param, returns state object
- **Stale ESLint config** → Fixed: `sourceType: "commonjs"`, irrelevant rules removed
- **Placeholder tests** → Fixed: comprehensive unit tests for all pure functions
- **`nock` devDependency violating STACK.md** → Fixed: removed, replaced with stdlib `createMockResponse` / `withMockHttps`
- **`statusBarHideTimeout` timer leak** → Fixed: cleared before setting new timeout, cleared in `deactivate`
- **Relative redirect resolution** → Fixed: `new URL(result.redirect, currentUrl).href`

### Documentation
- **CHANGELOG extension name** → Fixed: `"vscode-updater"`
- **README version mismatch** → Fixed: aligned to `1.0.0`
- **README curl requirement** → Fixed: only `tar` listed
- **README pnpm mention** → Fixed: added Development section
- **`.vscodeignore` missing `.kilo/**`** → Fixed: added
- **`engines.os` missing** → Fixed: `"linux": "*"` added
- **`package.json` missing metadata** → Fixed: `repository`, `bugs`, `homepage` added
- **`package.json` missing `files` array** → Fixed: added
- **`pretest` lint hook missing** → Fixed: restored

---

## 3. Remaining Issues

### Informational

| # | File | Issue |
|---|------|-------|
| 1 | `package.json:4, 5-12` | Publisher and repository URLs are set to `RandallFlagg`. Verify these are correct before publishing. |

---

## 4. Status

All code issues have been resolved. The codebase is ready for:
- Manual testing via Extension Development Host (F5)
- Publishing to VS Code Marketplace (after verifying publisher/URLs)

No further automated fixes are required.

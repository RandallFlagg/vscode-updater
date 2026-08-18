# QA Report — VSCode Updater Extension

**Date:** 2026-08-13 (final check)  
**Project:** `/home/void/Projects/VSCode Update`  
**Language:** JavaScript (Node.js, CommonJS)  
**Test Framework:** mocha + assert + custom `https.get` mock  
**Linter:** ESLint (flat config)  
**Package Manager:** pnpm  

---

## Executive Summary

| Area | Status |
|------|--------|
| Lint | Pass |
| Unit Tests | 53/53 pass |
| Syntax Check | Pass |
| Runtime Dependencies | None (Node.js built-ins only) |
| Code Issues | None remaining |
| Documentation | Complete |

**No code fixes were applied during this QA pass.** This report documents the current state of the codebase after prior remediation work.

---

## 1. Previously Critical Bugs — All Now Fixed

These issues were identified in earlier reviews and have been resolved:

| Bug | Status | Fix Applied |
|-----|--------|-------------|
| Unhandled promise rejection in config listener interval | Fixed | Arrow function with `.catch()` used for replacement interval |
| Symlink bypass in `validateInstallPath()` | Fixed | `fs.realpathSync()` with `path.resolve()` fallback now used |
| Shell injection risk in `restartVSCode()` (Linux) | Fixed | Replaced `sh -c` with `spawn('pkill', ['-x', binaryName])` + `spawn(currentExecPath)` |
| Shell injection risk in `restartVSCode()` (Windows) | Fixed | Replaced `cmd /c` with `spawn('taskkill', ...)` + `spawn(path.join(installDir, ...))` |
| `console.error` polluting test output | Fixed | `console.error` is now mocked in all tests via `beforeEach`/`afterEach` |
| Unhandled response stream error in `checkForUpdates()` | Fixed | Added `res.on('error', reject)` |
| Unhandled response stream error in `followRedirects()` | Fixed | Added `res.on('error', reject)` |
| Uncleared `setTimeout` in `updateStatusBar('updated')` | Fixed | Timeout ID tracked in `statusBarHideTimeout`, cleared before setting new one and in `deactivate()` |
| Relative redirects in `followRedirects()` | Fixed | Now uses `new URL(result.redirect, currentUrl).href` |
| Empty extraction could wipe install path | Fixed | Added check: throws `'Extracted archive is empty'` if `sourceFiles.length === 0` |
| No gzip validation before extraction | Fixed | Reads first 2 bytes and verifies magic bytes `0x1f 0x8b` after download |

---

## 2. Remaining Code Issues

**None.** All previously identified code issues have been resolved.

---

## 3. Documentation Status

### 3.1 README.md — Complete
All previously identified documentation gaps have been addressed:
- ✅ `customBinaryName` setting now listed under Extension Settings
- ✅ Restart description clarified (mentions automatic "Restart Now" prompt and command palette option)
- ✅ Troubleshooting section added (permission denied, tar not found, custom install path, built-in update button)
- ✅ Known Issues expanded (checksum verification, symlink security boundary, Wayland/pkill, Linux-only)
- ✅ Testing section added explaining what is and isn't unit-tested and why

### 3.2 STACK.md — Complete
- ✅ External system tools now listed: `tar` (extraction), `pkill` (restart)

---

## 4. Test Coverage Status

### 4.1 Current Coverage (53 tests)
- `extractVersion` — 6 tests
- `getPlatformSuffix` — 4 tests
- `normalizeVersion` — 6 tests
- `validateInstallPath` — 6 tests
- `validateBinaryName` — 4 tests
- `getBinaryName` — 2 tests
- `resolveUrls` — 4 tests
- `getDownloadUrl` — 3 tests
- `updateStatusBar` — 6 tests (including new `'updating'` state)
- `detectInstallPath` — 2 tests
- `getInstallPath` — 1 test
- `showUpdateNotification` — 1 test
- `followRedirects` — 4 tests (custom `https.get` mock)
- `checkForUpdates` — 3 tests (custom `https.get` mock, returns state object)
- `console.error` mocked in all tests

### 4.2 Still Missing Coverage
| Function/Behavior | Notes |
|-------------------|-------|
| `performUpdate()` | Not tested (complex, requires filesystem + progress mocking + backup/restore flow) |
| `restartVSCode()` | Not tested (spawns processes) |
| `extractTarGz()` | Not tested (requires `tar` binary) |
| `isUpdating` guard behavior | New flag preventing concurrent updates; direct invocation test requires command mocking |

---

## 5. Recent Changes (Since Last QA Pass)

### 5.1 New Test Added
- `updateStatusBar sets updating state` — verifies the new `'updating'` status bar text, tooltip, and command

### 5.2 README Testing Section
- Added a new "Testing" section to README.md documenting what is and isn't unit-tested and why, with instructions for running tests

---

## 6. Verification Results

| Check | Result |
|--------|--------|
| `pnpm run lint` | Pass (no warnings) |
| `pnpm test` | Pass (53/53, no `console.error` output) |
| `node -c extension.js` | Pass |
| `validateInstallPath` symlink safety | Uses `realpathSync` — safe |
| `restartVSCode` shell safety | No `sh -c` or `cmd /c` — safe |
| Interval error handling | Both initial and replacement intervals have `.catch()` — safe |
| `followRedirects` relative URLs | Uses `new URL()` — safe |
| `followRedirects` response errors | `res.on('error', reject)` present — safe |
| `updateStatusBar` timeout cleanup | `clearTimeout` before new timeout and in `deactivate()` — safe |
| Empty extraction guard | Throws before wiping install path — safe |
| Gzip validation | Checks magic bytes after download — safe |
| `checkForUpdates` response errors | `res.on('error', reject)` present — safe |
| `downloadFile` response errors | `res.on('error', reject)` present — safe |
| Concurrent update guard | `isUpdating` flag prevents duplicate updates — safe |

---

## 7. Recommendations for Next Steps

1. **Add tests for `isUpdating` guard** behavior (concurrent invocation prevention).
2. **Expand test coverage** for `performUpdate` using filesystem mocking and a fake progress API.
3. **Add integration test harness** for end-to-end update flow validation.

# QA Report — VSCode Updater

**Date:** 2026-08-15  
**Version under review:** 1.3.10  
**Reviewer:** QA Agent (read-only)  
**Status:** ERRORS FOUND — do not proceed with version bump / packaging steps per QA role rules.

---

## 1. Executive Summary

A code-to-documentation parity audit was performed across `package.json`, `README.md`, `CHANGELOG.md`, `STACK.md`, `extension.js`, `.vscodeignore`, and the unit-test suite.

**Result:** 1 critical documentation-implementation mismatch, 2 minor packaging/ cosmetic issues, and 3 informational observations were found. All 57 existing unit tests pass.

Because errors were found, **no files were modified** (no version bump, no changelog update, no commit, no packaging).

---

## 2. Critical Finding

### 2.1 `vscode-updater.autoBackup` is documented and declared but never implemented

| Artifact | Content |
|----------|---------|
| `package.json` (lines 51–55) | Declares `vscode-updater.autoBackup` with type `boolean`, default `true`, and a description stating it "Enable or disable automatic backup before updating." |
| `README.md` (line 40) | Documents the setting as toggleable. |
| `extension.js` `performUpdate()` (lines 650–682) | **Never reads the `autoBackup` setting.** The function unconditionally renames `installPath` → `installPath.OLD` before extracting the new version, then removes `.OLD` on success. |

**Impact:** Users cannot disable automatic backup as advertised. The setting is a no-op.

**Remediation:**
In `performUpdate()`, before the `mv` backup step, read the setting:
```javascript
const autoBackup = getConfig().get('autoBackup');
if (autoBackup === false) {
    log('info', 'Skipping backup because autoBackup is disabled');
    // skip the mv installPath -> oldPath step
} else {
    // existing backup logic
}
```

---

## 3. Minor Findings

### 3.1 Duplicate log statement in `performUpdate()`

- **Location:** `extension.js` lines 564–565
- **Observation:** `log('info', 'Temp directory created:', tmpDir);` appears twice consecutively.
- **Impact:** Cosmetic — duplicate entry in the VS Code Output panel.

### 3.2 `.vscodeignore` does not exclude `AGENT_OUTPUT/`

- **Location:** `.vscodeignore`
- **Observation:** Root-level `QA_REPORT.md` and `REVIEW.md` are excluded (lines 14–15), but the actual agent output files reside in `AGENT_OUTPUT/` (e.g., `AGENT_OUTPUT/QA_REPORT.md`, `AGENT_OUTPUT/TEST_REVIEW.md`). This directory is **not** excluded.
- **Impact:** Agent output artifacts could be packaged into the `.vsix`.

### 3.3 README claims "Linux-only" but `restartVSCode()` contains a Windows branch

- **Location:** `README.md` line 115 vs `extension.js` lines 515–525
- **Observation:** The Known Issues section states "This extension is Linux-only." However, `restartVSCode()` contains a `process.platform === 'win32'` branch using `taskkill` and `.exe` paths.
- **Impact:** Documentation inaccuracy. Not a functional bug on Linux.

---

## 4. Informational Observations

### 4.1 Status bar is not truly "persistent"

- **Location:** `README.md` line 17 vs `extension.js` line 790
- **Observation:** README describes the status bar item as "a persistent icon." In the `updated` state, `updateStatusBar()` schedules `item.hide()` after 5 seconds.
- **Impact:** Minor wording mismatch; behavior is reasonable.

### 4.2 README wording on `/home` blocking is ambiguous

- **Location:** `README.md` line 116 vs `extension.js` lines 118–131, 230–236
- **Observation:** README lists `/home` among blocked directories. The implementation only blocks the **exact** `/home` prefix (or `/home/`), allowing subdirectories such as `/home/void/Programs/vscode`. The `v1.2.0` changelog explicitly calls out this fix.
- **Impact:** The README could be clearer that subdirectories under `/home` are allowed.

### 4.3 No timeout on `execFile` calls

- **Location:** `extension.js` lines 472, 661, 674
- **Observation:** `extractTarGz()` and the `mv` calls in `performUpdate()` use `execFile` without a `timeout` option. If `tar` or `mv` hang (e.g., on a stalled network filesystem), the extension would hang indefinitely.
- **Impact:** Potential resource starvation in edge cases.

---

## 5. Documentation ↔ Implementation Parity

### 5.1 Commands

| Command (package.json) | Implemented in extension.js | Status |
|------------------------|----------------------------|--------|
| `vscode-updater.update` | `activate()` line 826 | PASS |
| `vscode-updater.restart` | `activate()` line 844 | PASS |
| `vscode-updater.checkNow` | `activate()` line 864 | PASS |

### 5.2 Settings

| Setting | package.json | README | Implemented | Status |
|---------|-------------|--------|-------------|--------|
| `vscode-updater.installPath` | YES | YES | YES | PASS |
| `vscode-updater.autoBackup` | YES | YES | NO (never read) | FAIL |
| `vscode-updater.checkInterval` | YES | YES | YES | PASS |
| `vscode-updater.channel` | YES | YES | YES | PASS |
| `vscode-updater.flavour` | YES | YES | YES | PASS |
| `vscode-updater.customUpdateBaseUrl` | YES | YES | YES | PASS |
| `vscode-updater.customReleasesUrl` | YES | YES | YES | PASS |
| `vscode-updater.customBinaryName` | YES | YES | YES | PASS |
| `vscode-updater.debug.deleteDownloadedArchive` | YES | YES | YES | PASS |
| `vscode-updater.debug.keepFailedFolder` | YES | YES | YES | PASS |
| `vscode-updater.logLevel` | YES | YES | YES | PASS |
| `vscode-updater.tempDir` | YES | YES | YES | PASS |

### 5.3 Flavours

| Flavour | Check URL | Download URL | Status |
|---------|-----------|--------------|--------|
| `vscode` (default) | `update.code.visualstudio.com/api/releases/{channel}` | `update.code.visualstudio.com` | PASS |
| `codium` | `api.github.com/repos/VSCodium/vscodium/releases/latest` | `github.com/VSCodium/vscodium/releases/download` | PASS |
| `other` | `customReleasesUrl` or default | `customUpdateBaseUrl` or default | PASS |

### 5.4 Platform Support

| Architecture | `getPlatformSuffix()` | Status |
|--------------|----------------------|--------|
| `x64` | `linux-x64` | PASS |
| `arm64` | `linux-arm64` | PASS |
| `arm` | `linux-armhf` | PASS |
| unknown | `linux-x64` (fallback) | PASS |

### 5.5 Update Flow (README steps vs implementation)

| README Step | Implementation | Status |
|-------------|----------------|--------|
| 1. Periodically checks for newer version | `scheduleNextCheck()` + `checkForUpdates()` | PASS |
| 2a. Status bar item appears | `updateStatusBar('update')` | PASS |
| 2b. Notification prompts user | `showUpdateNotification()` | PASS |
| 3. User clicks Update → download `tar.gz` | `downloadFile()` + cache logic | PASS |
| 4. Backup current installation | `mv installPath installPath.OLD` | PASS (unconditional) |
| 5. Extract new version to same directory | `extractTarGz()` → `mv sourceDir installPath` | PASS |
| 6. Remove old installation | `cpRm(oldPath, { recursive: true })` | PASS |
| 7. Prompt "Restart Now" | `showInformationMessage` with `Restart Now` button | PASS |

---

## 6. Test Coverage Analysis

### 6.1 Existing Tests (57 passing)

Covered modules/functions:
- `extractVersion` — array, GitHub object, empty array, invalid JSON, missing `tag_name`
- `getPlatformSuffix` — x64, arm64, arm, unknown
- `normalizeVersion` — `v` prefix, suffixes, null, undefined, empty string
- `validateInstallPath` — exact blocked prefixes, null, empty, `/home` subdirectory allowance
- `validateBinaryName` — valid names, injection attempts (`;`, `$()`, backticks)
- `getBinaryName` — vscode flavour, other flavour fallback
- `resolveUrls` — stable, codium, other custom, insider channel
- `getDownloadUrl` — vscode, codium, null version fallback
- `updateStatusBar` — all states (`update`, `updated`, `error`, `checking`, `updating`, unknown)
- `detectInstallPath` — execPath fallback, null when no paths exist
- `getInstallPath` — config value, `~` expansion
- `showUpdateNotification` — message text
- `followRedirects` — single redirect, relative redirect, too many redirects, non-3xx
- `checkForUpdates` — newer version, same version, HTTP 500 error

### 6.2 Explicitly Untested (as documented in README)

- `performUpdate()` — filesystem mocking, progress API, backup/restore flow
- `restartVSCode()` — system process spawning (`pkill`, `code`/`codium`)
- `extractTarGz()` — requires `tar` binary
- `isUpdating` guard — concurrent invocation guard

### 6.3 Additional Coverage Gaps Observed

| Function / Area | Gap | Risk |
|-----------------|-----|------|
| `getCacheKey` / `getCacheFilePath` | Not tested | Low — deterministic string transform |
| `ensureCacheDir` | Not tested | Low — silent failure is intentional |
| `getCachedFile` | Not tested | Low — but gzip-header validation is a key safety check |
| `saveToCache` | Not tested | Low — rename wrapper |
| `downloadFile` | Not tested | Medium — empty-file and stat-error paths are untested |
| `extractTarGz` | Not tested | Medium — shell-out error handling untested |
| `validateInstallPath` with symlinks | Not tested | Medium — `realpathSync` behavior is untested |
| `getInstallPath` with bare `~` | Not tested | Low — `startsWith('~/')` prevents expansion |
| `resolveUrls` with partial `other` config | Not tested | Medium — if only one custom URL is set, the other falls back to default |
| `getDownloadUrl` for arm64/armhf codium | Not tested | Low |
| `checkForUpdates` with `isChecking` guard | Not tested | Medium — concurrent-call prevention is untested |
| `checkForUpdates` with timeout | Not tested | Medium — 30s timeout path untested |
| `performUpdate` cancellation | Not tested | Medium — `canceled` error path untested |
| `performUpdate` with `keepFailedFolder` | Not tested | Medium — `.BAD` rename/restore flow untested |
| `performUpdate` with custom `tempDir` | Not tested | Medium — cross-device scenario untested |
| `vscode-updater.autoBackup` | **Not implemented** | **High — functional gap** |

---

## 7. Known-Issues Verification

| README Known Issue | Code Reality | Match? |
|--------------------|--------------|--------|
| System-wide install may require `sudo` | `mv`/`cp` shell-outs will fail without perms | PASS |
| Custom builds may be incompatible | `detectInstallPath` covers common paths; user can set `installPath` | PASS |
| No checksum/signature verification | No hash or signature check in `downloadFile` or `extractTarGz` | PASS |
| `validateInstallPath` uses `realpathSync` (not a full security boundary) | `realpathSync` + prefix check implemented | PASS |
| `pkill -x` may not work on Wayland | `restartVSCode` uses `pkill -x` on Linux | PASS |
| Linux-only | Windows branch exists in `restartVSCode()` | INFO — see §4.3 |
| `installPath` blocks critical dirs | Blocks exact `/`, `/usr`, `/home`, `/tmp`, etc. | PASS (with `/home` caveat) |
| Tarballs cached in `~/.cache/vscode-updater/` | `CACHE_DIR` = `~/.cache/vscode-updater` | PASS |
| Cache not auto-cleared | No eviction logic | PASS |

---

## 8. Troubleshooting Section Verification

| README Troubleshooting | Code Behavior | Match? |
|------------------------|--------------|--------|
| Permission denied → need `sudo` | `mv`/`cp` will fail; error shown via `showErrorMessage` | PASS |
| `tar` not found | `extractTarGz` uses `execFile('tar', ...)` — fails if missing | PASS |
| Custom install path not detected | `getInstallPath()` returns config or `detectInstallPath()` | PASS |
| Update button still shows in VS Code | Extension cannot suppress native notification | PASS |

---

## 9. Final Conclusion

**Errors were found.** The most significant is the **missing implementation of the `vscode-updater.autoBackup` setting** (§2.1), which creates a functional gap between documented and actual behavior.

Per QA role rules:
- **No files were modified.**
- **No version bump, changelog update, commit, or packaging was performed.**

**Recommended next steps:**
1. Implement the `autoBackup` setting in `performUpdate()`.
2. Fix the duplicate log line (line 564–565).
3. Add `AGENT_OUTPUT/` to `.vscodeignore`.
4. Clarify the README's `/home` blocking description and the "Linux-only" claim.
5. Consider adding `timeout` options to `execFile` calls for `tar` and `mv`.
6. Expand unit-test coverage for `downloadFile`, `extractTarGz`, `checkForUpdates` guards, and `performUpdate` edge cases.

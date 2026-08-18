# Code Review — VSCode Updater

**Date:** 2026-08-15  
**Project:** `/home/void/Projects/VSCodeUpdate`  
**Reviewer:** Kilo (Read-Only Reviewer)  
**Status:** Final — findings documented

---

## 1. Executive Summary

The previous review (2026-08-13) declared the codebase free of critical issues. A fresh audit of `extension.js` reveals **two new critical issues** introduced or missed since that review, plus several high-severity findings. The most severe is a data-loss bug in the update failure recovery path.

---

## 2. Critical Findings

### CRITICAL-1: Backup restore uses `rename` without cross-device fallback (Potential data loss)

**File:** `extension.js`  
**Lines:** 754-755

```javascript
await fs.promises.rename(oldPath, installPath);
```

**Issue:** When an update fails, the catch block restores the old installation using `fs.promises.rename`. This call throws `EXDEV` if `oldPath` and `installPath` are on different filesystems. The error is caught and logged, but the old installation is **not restored**. The user is left with a missing or corrupted VS Code installation.

**Context:** The success path correctly uses `execFile('mv', [installPath, oldPath], ...)` and `execFile('mv', [sourceDir, installPath], ...)` — the system `mv` handles cross-device moves internally. But the failure recovery path uses `fs.promises.rename` with no fallback, creating an asymmetry that can cause data loss.

**Impact:** If the user's temp directory (`/tmp`) is on a different filesystem from their install path, and the update fails after the first `mv` succeeds, the restore will fail silently and VS Code will be broken.

**Remediation:** Replace `fs.promises.rename(oldPath, installPath)` with `execFile('mv', [oldPath, installPath], ...)` (or implement a recursive copy fallback matching the pattern already used elsewhere in the project). Ensure the promise rejects on failure so the error propagates instead of being silently swallowed.

---

### CRITICAL-2: No timeout on `execFile` calls (Infinite hang)

**File:** `extension.js`  
**Lines:** 472, 661, 674

```javascript
execFile('tar', ['-xzf', tarPath, '-C', dest], (error) => { ... });
execFile('mv', [installPath, oldPath], (err) => { ... });
execFile('mv', [sourceDir, installPath], (err) => { ... });
```

**Issue:** None of the `execFile` calls specify a `timeout` option. If `tar` hangs (corrupt archive, I/O stall, NFS deadlock) or `mv` stalls, the extension will hang indefinitely. The user sees a perpetual "Updating..." progress notification with no way to recover short of killing VS Code.

**Impact:** A stuck update leaves the extension in an unrecoverable state. The `isUpdating` flag remains `true`, blocking all future updates until VS Code is restarted.

**Remediation:** Add `timeout: 120000` (2 minutes) to each `execFile` call. On timeout, destroy the process and reject with a descriptive error. Clean up temp files and restore from backup if applicable.

---

## 3. High-Severity Findings

### HIGH-1: Cache key collision can corrupt cached downloads

**File:** `extension.js`  
**Line:** 71

```javascript
function getCacheKey(url) {
    return url.replace(/[^a-zA-Z0-9]/g, '_');
}
```

**Issue:** This normalization is not collision-resistant. Different URLs can produce identical cache keys. For example:
- `https://update.code.visualstudio.com/api/releases/stable`
- `https://update.code.visualstudio.com/api/releases_stable`

Both normalize to the same key, causing one URL's cached archive to be served for another. This could deliver the wrong version or a corrupt file.

**Remediation:** Use a cryptographic hash (e.g., `crypto.createHash('sha256').update(url).digest('hex')`) instead of character replacement. This guarantees uniqueness.

---

### HIGH-2: `getLogLevel()` invoked on every `log()` call (Performance)

**File:** `extension.js`  
**Lines:** 38, 28-35

```javascript
function log(level, ...args) {
    const currentLevel = getLogLevel(); // Reads VS Code config every call
    ...
}
```

**Issue:** `getLogLevel()` calls `vscode.workspace.getConfiguration('vscode-updater')` on every log invocation. This is an expensive cross-process call in VS Code's extension host. During an update, hundreds of log calls can occur, creating unnecessary overhead.

**Remediation:** Cache the log level and invalidate on `onDidChangeConfiguration` for `vscode-updater.logLevel`. The `logLevelListener` already exists (line 914) but does not update a cached value.

---

### HIGH-3: HTTP requests are not cancellable (Resource leak on cancellation)

**File:** `extension.js`  
**Lines:** 284-335, 394-431, 433-465

**Issue:** The `withProgress` cancellation token is only checked at the start of the progress callback. The `https.get` requests in `checkForUpdates`, `followRedirects`, and `downloadFile` are not tied to the cancellation token. If the user clicks "Cancel" during an update, in-flight HTTP requests continue in the background, consuming bandwidth and file descriptors.

**Remediation:** Tie the `token` from `withProgress` to the HTTP requests. On `token.onCancellationRequested`, call `req.destroy()` to abort the request and clean up.

---

### HIGH-4: `followRedirects` can downgrade HTTPS to HTTP

**File:** `extension.js`  
**Line:** 423

```javascript
currentUrl = new URL(result.redirect, currentUrl).href;
```

**Issue:** If a redirect response points to an `http://` URL, `followRedirects` follows it without warning. A compromised or misconfigured server could downgrade a secure connection to plaintext, exposing the download to MITM attacks.

**Remediation:** After resolving the redirect URL, validate that `new URL(currentUrl).protocol === 'https:'`. Throw an error or warn if a redirect would downgrade security.

---

## 4. Medium-Severity Findings

### MEDIUM-1: Duplicate log statement

**File:** `extension.js`  
**Line:** 565

```javascript
log('info', 'Temp directory created:', tmpDir);
log('info', 'Temp directory created:', tmpDir); // Duplicate
```

**Remediation:** Remove the duplicate line.

---

### MEDIUM-2: `isChecking` flag can become permanently stuck

**File:** `extension.js`  
**Line:** 337

```javascript
} finally {
    isChecking = false;
}
```

**Issue:** If the extension host process crashes while `isChecking = true`, the flag remains `true` after reactivation. All future update checks are silently skipped until VS Code is fully restarted.

**Remediation:** Reset `isChecking = false` in the `activate()` function before scheduling the first check.

---

### MEDIUM-3: `checkForUpdates` silently drops options when already checking

**File:** `extension.js`  
**Lines:** 267-270

```javascript
if (isChecking) {
    log('trace', 'checkForUpdates() skipped - already in progress');
    return;
}
```

**Issue:** If `checkForUpdates({ updateAvailable: true, latestVersion: '1.2.3' })` is called while another check is in progress, the options are silently discarded. The caller has no indication that its state update was ignored.

**Remediation:** Apply the options merge before the `isChecking` guard, or queue the options to apply after the current check completes.

---

## 5. Informational

### INFO-1: `package.json` publisher/repository identity

**File:** `package.json`  
**Lines:** 4, 5-12

Publisher is `RandallFlagg` with repository URLs pointing to the same username. Verify these match the intended VS Code Marketplace publisher identity before publishing.

---

## 6. Summary

| Severity | Count | Key Themes |
|----------|-------|------------|
| Critical | 2 | Data loss on cross-device restore, infinite hangs on subprocess |
| High | 4 | Cache corruption, performance waste, resource leaks, security downgrade |
| Medium | 3 | Code hygiene, stuck state, silent option loss |
| Info | 1 | Publisher metadata |

**The two critical findings require immediate remediation before any release.** The cross-device restore bug (CRITICAL-1) can render a user's VS Code installation unusable after a failed update, and the missing timeout (CRITICAL-2) can hang the extension indefinitely.

---

*Review completed. No files were modified.*

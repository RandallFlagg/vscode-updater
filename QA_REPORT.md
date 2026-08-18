# QA Report — VSCode Updater Extension

**Date:** 2026-08-12  
**Project:** `/home/void/Projects/VSCode Update`  
**Language:** JavaScript (Node.js, CommonJS)  
**Test Framework:** mocha + assert  
**Linter:** ESLint (flat config)  
**Package Manager:** pnpm  

---

## Executive Summary

| Area | Status |
|------|--------|
| Lint | Pass |
| Unit Tests | 12/12 pass |
| Syntax Check | Pass |
| Runtime Dependencies | None (Node.js built-ins only) |
| Critical Bugs | 3 found |
| Test Coverage | Extensive gaps |
| Documentation | Multiple issues |

**No fixes were applied during this review.** The implementing AI should receive the remediation prompt to address all findings.

---

## 1. Critical Bugs

### 1.1 Unhandled Promise Rejection in Config Listener Interval

**File:** `extension.js`  
**Location:** `activate()` -> `onDidChangeConfiguration` listener  
**Severity:** High  

**Description:**  
When `checkInterval` is reconfigured, the replacement interval is created like this:

```js
checkInterval = setInterval(checkForUpdates, newIntervalMs);
```

This passes `checkForUpdates` directly to `setInterval`. Since `checkForUpdates` returns a Promise, any rejection becomes an **unhandled promise rejection**. The initial interval setup correctly wraps it in `.catch()`.

**Fix:** Wrap the interval callback in an arrow function with a catch handler, matching the initial setup.

---

### 1.2 Symlink Bypass in `validateInstallPath()`

**File:** `extension.js`  
**Location:** `validateInstallPath()`  
**Severity:** High  

**Description:**  
The function uses `path.resolve()` on both the install path and allowed prefixes. `path.resolve()` does **not** resolve symlinks. An attacker could create a symlink inside an allowed prefix that points outside the allowed tree, and `validateInstallPath` would return `true` because the resolved symlink path string still starts with the allowed prefix.

**Fix:** Use `fs.realpathSync()` (or `fs.promises.realpath()`) on the install path before comparison. If `realpath` fails (e.g., path does not exist), fall back to `path.resolve()`.

---

### 1.3 Shell Injection Risk in `restartVSCode()`

**File:** `extension.js`  
**Location:** `restartVSCode()`  
**Severity:** High  

**Description:**  
The Linux/Unix branch builds a shell command string via template literal:

```js
spawn('sh', ['-c', `pkill -x ${binaryName} && nohup "${path.join(installDir, binaryName)}" > /dev/null 2>&1 &`], ...)
```

Even though `binaryName` is validated by `validateBinaryName()` to match `/^[a-zA-Z0-9_-]+$/`, the `installDir` path is interpolated directly into a shell command. If `installDir` contains spaces, quotes, or shell metacharacters, it could break out of the quoted string.

**Fix:** Avoid `sh -c`. Use `spawn` with an argument array, or spawn `pkill` and the binary as separate processes.

---

## 2. Test Coverage Gaps

### 2.1 Covered Functions (12 tests)
- `extractVersion` — array response, GitHub API response, empty array, invalid JSON
- `getPlatformSuffix` — x64, arm64, arm, unknown
- `normalizeVersion` — strip `v` prefix, strip suffixes, null, clean version

### 2.2 Exported Functions with Zero Coverage
| Function | Needed Tests |
|----------|--------------|
| `validateInstallPath(installPath)` | Allowed prefixes, disallowed paths, null, empty string, `/`, symlink-like paths, trailing slashes |
| `normalizeVersion(version)` | Empty string, undefined, multiple `+`/`-` suffixes, `v` prefix + suffixes |
| `extractVersion(data)` | Object without `tag_name`, `tag_name: null`, empty object `{}`, array with null elements, malformed JSON with whitespace |
| `getDownloadUrl()` | Stable/codium/other flavours, platform map fallback, custom binary name, latest version fallback |

### 2.3 Internal Functions with Zero Coverage
| Function | Needed Tests |
|----------|--------------|
| `validateBinaryName(name)` | Valid names, empty string, null, special chars, very long names, names starting with hyphen/underscore |
| `resolveUrls()` | Stable/codium/other flavours, channel override, custom URLs |
| `getInstallPath()` | Config override, auto-detect fallback, null return when nothing found |
| `detectInstallPath()` | Finding common paths, falling back to `process.execPath`, returning null when nothing found |
| `getBinaryName()` | Codium flavour, other flavour with custom name, default `code` |

### 2.4 Behavior Tests (Require `vscode` Mock)
| Behavior | Needed Tests |
|----------|--------------|
| `checkForUpdates()` | HTTP success with newer/same version, HTTP error, timeout, malformed JSON, network error, status bar updates, notification triggers |
| `performUpdate()` | Missing/invalid install path, download failure, extraction failure, backup creation, file replacement, cleanup, rollback on failure, cancellation |
| `restartVSCode()` | Linux branch command construction, unsaved editors check |
| `updateStatusBar(state)` | All states: `update`, `updated`, `error`, `checking`, default/hide. Verify text, tooltip, command, visibility |
| `showUpdateNotification(version)` | User selecting "Update Now" vs "Later" |

---

## 3. Documentation Issues

### 3.1 README.md
| Issue | Description |
|--------|-------------|
| Missing setting | `vscode-updater.customBinaryName` not listed under "Extension Settings" |
| Misleading restart description | "How It Works" says user clicks Restart manually; in reality the extension prompts with "Restart Now" after update, OR user can use the command |
| No troubleshooting section | Should cover: permission denied, `tar` not found, custom install paths not detected |
| Linux-only not prominent | Currently only under "Requirements"; should be more visible |
| pnpm not emphasized | Development section should mention pnpm is required (project uses `pnpm-lock.yaml`) |
| Known Issues incomplete | Should mention: no checksum/signature verification, symlink attack surface, `pkill` may not work on some Wayland compositors |

### 3.2 STACK.md
| Issue | Description |
|--------|-------------|
| Integration tests unclear | Should clarify they require a full VS Code environment and are not run in CI by default |
| Dependencies section | Should note reliance on Node.js built-ins (`https`, `fs`, `path`, `os`, `child_process`) and external system tools (`tar`, `pkill`) |

---

## 4. Code Improvements (Non-Breaking)

| # | Improvement | Description |
|---|-------------|-------------|
| 1 | Download validation | Verify gzip magic bytes (`0x1f 0x8b`) after `downloadFile` to prevent extracting HTML error pages |
| 2 | Relative redirects | `followRedirects` does not handle relative `Location` headers; resolve them using the `url` module |
| 3 | `extractTarGz` error handling | Check if error is specifically "tar not found" and show a user-friendly message |
| 4 | Update failure robustness | If backup restore fails, show a more explicit error message; consider a recovery command |
| 5 | `console.error` in tests | `extractVersion` logs to `console.error` on invalid JSON, polluting test output; mock `console.error` in tests or make logging conditional |
| 6 | `checkInterval` consistency | Ensure both initial and replacement intervals have `.catch()` wrappers (see Bug 1.1) |

---

## 5. Verification Steps (Post-Fix)

1. `pnpm run lint` — must pass with no warnings
2. `pnpm test` — all tests must pass with no `console.error` output
3. Add a CI-friendly test command that doesn't require VS Code Electron
4. Manually review `extension.js` for any other `setInterval` or Promise chains missing error handling
5. Verify `validateInstallPath` correctly rejects symlink escapes
6. Verify `restartVSCode` does not use `sh -c` with string interpolation

---

## 6. Instructions for Implementing AI

- Do not modify files outside of `extension.js`, `test/extension.test.js`, and `README.md` unless explicitly justified
- Do not change the public API of exported functions without updating all callers
- Maintain existing coding style: Node.js standard library preference, no new runtime dependencies, CommonJS modules
- When adding tests, use `mocha` + `assert` only
- Mock the `vscode` module via the existing `test/vscode-mock.js` pattern
- Run `pnpm test` and `pnpm run lint` after every logical group of changes
- Ensure all new tests are deterministic and do not make network requests

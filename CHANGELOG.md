# Change Log

<!--
All notable changes to the "vscode-updater" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
-->

## [1.4.1] - 2026-08-18

### Fixed
- `restartVSCode()` now falls back to spawning a new instance when the old parent process is already dead (ESRCH)
- Restored `debug.deleteDownloadedArchive` setting with actual behavior: deletes cached archive when `true`, keeps when `false`

### Added
- Roadmap section to README linking to pending Phase 2 issues

## [1.4.0] - 2026-08-18

### Changed
- Refactored `performUpdate()` to extract directly to `installPath` instead of extracting to temp then moving
- Backup now uses timestamped suffix (`installPath.OLD.<timestamp>`) instead of fixed `.OLD`, eliminating `ENOTEMPTY` errors on subsequent updates
- `restartVSCode()` now falls back to spawning a new instance when the old parent process is already dead (ESRCH)
- Removed redundant debug archive copy — cache itself is preserved when `debug.deleteDownloadedArchive` is `false`

### Fixed
- `checkOnStartup: true` now runs the startup check immediately, bypassing `globalState` read that was causing the check to be silently skipped
- Error handler simplified: on failure, removes failed `installPath` and restores timestamped backup directly
- `debug.keepFailedFolder` now leaves both failed `installPath` and timestamped backup untouched for debugging
- `node_modules.asar` validation now retries 3 times over 500ms to avoid false positives from filesystem metadata race condition after `mv`

### Added
- `vscode-updater.keepOldVersion` setting (default: false) — timestamped backups are always preserved; this setting is for future cleanup logic
- `vscode-updater.enabled` setting (default: `true`) — master switch for automatic update checks
- `vscode-updater.checkOnStartup` setting (default: `true`) — controls whether an update check runs on VS Code startup
- Tests for `validateFileSize` retry behavior, `enabled`/`checkOnStartup` behavior, and notification suppression

## [1.3.16] - 2026-08-17

### Changed
- Refactored `performUpdate()` to extract directly to `installPath` instead of extracting to temp then moving
- Backup now uses timestamped suffix (`installPath.OLD.<timestamp>`) instead of fixed `.OLD`, eliminating `ENOTEMPTY` errors on subsequent updates
- `vscode-updater.keepOldVersion` setting now controls whether timestamped backups are kept (default: false, backups always preserved with unique timestamp)

### Fixed
- `checkOnStartup: true` now runs the startup check immediately, bypassing `globalState` read that was causing the check to be silently skipped
- Error handler simplified: on failure, removes failed `installPath` and restores timestamped backup directly
- `debug.keepFailedFolder` now leaves both failed `installPath` and timestamped backup untouched for debugging

## [1.3.15] - 2026-08-17

### Fixed
- `node_modules.asar` validation now retries 3 times over 500ms to avoid false positives from filesystem metadata race condition after `mv`
- Error handler now removes existing `.BAD` folder before renaming, preventing `ENOTEMPTY` failure that skipped restore
- Success notification after update: shows "VS Code updated successfully! Please restart to apply changes." with "Restart Now" button

### Added
- Tests for `validateFileSize` retry behavior

## [1.3.14] - 2026-08-17

### Changed
- `checkOnStartup` now means "check every time VS Code starts" — no longer gated by `checkInterval` elapsed time

## [1.3.13] - 2026-08-17

### Added
- `vscode-updater.enabled` setting (default: `true`) — master switch for automatic update checks
- `vscode-updater.checkOnStartup` setting (default: `true`) — controls whether an update check runs on VS Code startup
- Tests for `enabled`/`checkOnStartup` behavior and notification suppression

### Changed
- `checkForUpdates()` now respects `vscode-updater.enabled` — notifications are suppressed when disabled
- Config listener resets timer when `enabled`, `checkInterval`, or `checkOnStartup` changes
- Startup check logic now gates on `getEnabled()` and `getCheckOnStartup()`

## [1.3.11] - 2026-08-16

### Added
- `vscode-updater.tarTimeout` setting (default: 600000 ms = 10 min) to configure tar extraction timeout
- `vscode-updater.mvTimeout` setting (default: 600000 ms = 10 min) to configure mv operation timeout

### Changed
- `trace` log level now writes to VS Code Output panel only, no longer calls `console.trace()` to reduce CPU overhead
- `checkInterval` module variable now tracks the active timeout in the recursive `scheduleNextCheck()` chain, fixing timer leakage on extension reload
- Removed Windows branch from `restartVSCode()` — extension is Linux-only
- `showUpdateNotification()` now routes through `vscode-updater.update` command instead of calling `performUpdate()` directly, ensuring the `isUpdating` guard is respected

### Fixed
- Implemented missing `vscode-updater.autoBackup` setting — `performUpdate()` now conditionally skips backup when set to `false`
- Removed duplicate `Temp directory created` log line in `performUpdate()`
- Added `AGENT_OUTPUT/` to `.vscodeignore` to prevent agent artifacts from being packaged
- Added 10-minute `timeout` to all `execFile` calls (`tar`, `mv`) to prevent indefinite hangs on stalled filesystems
- Initial `checkForUpdates()` failure now resets `updateAvailable`, `latestVersion`, and `lastNotifiedVersion` to prevent stale state

## [1.3.12] - 2026-08-16

### Fixed
- Timer interval now persists across VS Code restarts using `globalState`. `checkInterval` measures elapsed time from last successful check, not from VS Code startup
- Fixed `setTimeout` overflow for intervals > 24.8 days by capping to 32-bit signed integer max (`2147483647` ms)

### Added
- Tests for globalState timestamp persistence and 32-bit timeout cap

## [1.3.11] - 2026-08-16

### Added
- `vscode-updater.tarTimeout` setting (default: 600000 ms = 10 min) to configure tar extraction timeout
- `vscode-updater.mvTimeout` setting (default: 600000 ms = 10 min) to configure mv operation timeout

### Changed
- `trace` log level now writes to VS Code Output panel only, no longer calls `console.trace()` to reduce CPU overhead
- `checkInterval` module variable now tracks the active timeout in the recursive `scheduleNextCheck()` chain, fixing timer leakage on extension reload
- Removed Windows branch from `restartVSCode()` — extension is Linux-only
- `showUpdateNotification()` now routes through `vscode-updater.update` command instead of calling `performUpdate()` directly, ensuring the `isUpdating` guard is respected

### Fixed
- Implemented missing `vscode-updater.autoBackup` setting — `performUpdate()` now conditionally skips backup when set to `false`
- Removed duplicate `Temp directory created` log line in `performUpdate()`
- Added `AGENT_OUTPUT/` to `.vscodeignore` to prevent agent artifacts from being packaged
- Added 10-minute `timeout` to all `execFile` calls (`tar`, `mv`) to prevent indefinite hangs on stalled filesystems
- Initial `checkForUpdates()` failure now resets `updateAvailable`, `latestVersion`, and `lastNotifiedVersion` to prevent stale state

## [1.3.10] - 2026-08-15

### Fixed
- Excluded debug log files from VSIX package via `.vscodeignore`

## [1.3.9] - 2026-08-14

### Fixed
- Replaced `setInterval` with self-rescheduling `setTimeout` to prevent stacked periodic checks when the extension is reloaded in dev mode
- Added `isChecking` guard to `checkForUpdates()` to prevent concurrent checks from overlapping

## [1.3.8] - 2026-08-14

### Changed
- Clarified `vscode-updater.logLevel` description to document verbosity hierarchy: `info` (least) < `debug` < `trace` (most)

## [1.3.7] - 2026-08-14

### Changed
- Replaced `fs.promises.rename` with system `mv` for install path replacement. `mv` handles both atomic same-filesystem renames and cross-device fallbacks internally, removing the need for EXDEV error handling code.

## [1.3.6] - 2026-08-14

### Fixed
- Replaced `fs.promises.cp` EXDEV fallback with system `cp -a` to avoid empty file corruption on large files like `node_modules.asar`
- Added source-side asar size logging to distinguish extraction issues from copy issues

## [1.3.5] - 2026-08-14

### Fixed
- Fixed interval stacking bug where `activate()` created a new `setInterval` without clearing the previous one, causing repeated update checks when the extension was reloaded
- Changed `checkForUpdates() starting` log from `debug` to `trace` to reduce output panel noise at the default `debug` level

## [1.3.4] - 2026-08-14

### Added
- `vscode-updater.tempDir` setting to choose where temporary files are downloaded and extracted (default: system temp). Useful for debugging cross-device issues by placing temp dir on the same filesystem as the install path.

## [1.3.3] - 2026-08-14

### Added
- Verbose logging to VS Code Output panel with configurable `vscode-updater.logLevel` setting (default: `info`, options: `info`, `debug`, `trace`)
- Detailed step-by-step logs for every update operation including download, extraction, rename, copy fallback, asar validation, and cleanup

## [1.3.2] - 2026-08-14

### Fixed
- `fs.cp` callback error in cross-device fallback by using `fs.promises.cp`

## [1.3.1] - 2026-08-14

### Fixed
- Cross-device rename (`EXDEV`) when moving extracted files from `/tmp` to install path by falling back to recursive copy

## [1.3.0] - 2026-08-14

### Changed
- Replaced file-by-file copy with folder rename approach (`installPath` → `installPath.OLD`, extracted folder moved into place) for faster, more reliable updates
- Cache operations use `rename` instead of `copyFile` to reduce disk I/O
- Cached downloads extracted directly from cache path, eliminating unnecessary temp copy

### Added
- `debug.deleteDownloadedArchive` setting — preserves downloaded `.tar.gz` for debugging when set to `false`
- `debug.keepFailedFolder` setting — keeps failed update folder as `.BAD` instead of restoring backup

## [1.2.0] - 2026-08-14

### Changed
- Progress reporting now uses both notification popup AND status bar during update
- Downloaded tarballs are cached locally to speed up repeated testing

### Fixed
- `validateInstallPath()` now allows custom paths under `/home` instead of blocking the entire prefix
- Error handling now safely extracts error messages and logs full errors to console for debugging

## [1.1.0] - 2026-08-13

### Added
- Extension icon for marketplace listing

### Changed
- Documented `installPath` safety restrictions in README
- Removed `beta` from channel options
- `getInstallPath()` now expands `~` to the user's home directory
- `validateInstallPath()` now blocks critical system directories but allows custom paths

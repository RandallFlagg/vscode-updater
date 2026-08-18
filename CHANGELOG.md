# Change Log

<!--
All notable changes to the "vscode-updater" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
-->

## [1.3.1] - 2026-08-14

### Fixed
- Cross-device rename (`EXDEV`) when moving extracted files from `/tmp` to install path by falling back to recursive copy

## [1.3.0] - 2026-08-14

### Changed
- Replaced file-by-file copy with folder rename approach (`installPath` → `installPath.OLD`, extracted folder moved into place) for faster, more reliable updates
- Progress reporting now uses both notification popup AND status bar during update
- Downloaded tarballs cached locally to speed up repeated testing
- Cache operations use `rename` instead of `copyFile` to reduce disk I/O
- Cached downloads extracted directly from cache path, eliminating unnecessary temp copy

### Added
- `debug.deleteDownloadedArchive` setting — preserves downloaded `.tar.gz` for debugging when set to `false`
- `debug.keepFailedFolder` setting — keeps failed update folder as `.BAD` instead of restoring backup

### Fixed
- Error handling now safely extracts error messages and logs full errors to console for debugging
- `validateInstallPath()` now allows custom paths under `/home` instead of blocking the entire prefix

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

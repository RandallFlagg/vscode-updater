# Change Log

<!--
All notable changes to the "vscode-updater" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.
-->

## [1.2.0] - 2026-08-14

### Changed
- Progress reporting now uses both notification popup AND status bar during update
- Downloaded tarballs are cached locally to speed up repeated testing

### Fixed
- `validateInstallPath()` now allows custom paths under `/home` instead of blocking the entire prefix

## [1.1.0] - 2026-08-13

### Added
- Extension icon for marketplace listing

### Changed
- Documented `installPath` safety restrictions in README
- Removed `beta` from channel options
- `getInstallPath()` now expands `~` to the user's home directory
- `validateInstallPath()` now blocks critical system directories but allows custom paths

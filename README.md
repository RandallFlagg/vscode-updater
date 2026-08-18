<p align="center">
  <img src="./images/icon.png" alt="Project Logo" width="128" height="128">
</p>

# VSCode Updater

A VS Code extension that automates updating VS Code on Linux for users who don't have a package manager handling updates.

## Why This Exists

On Linux, VS Code's built-in update button opens a browser and sends you through a manual download and extraction process. This extension automates the entire flow so that updating is a single action.

## Limitations

1. This extension **cannot** intercept or replace VS Code's built-in "Update Available" notification, and it **cannot** place a button next to VS Code's native update button. That flow is controlled entirely by VS Code and is not exposed to extensions. Instead, this extension provides its own update mechanism via **three** surfaces:

  1. **Status bar item** — a persistent icon in the bottom-right corner indicating update status
  2. **Notification** — a popup when an update is detected, with action buttons
  3. **Command palette** — commands available via `Ctrl+Shift+P` / `Cmd+Shift+P`

2. A VS Code extension ***cannot*** cleanly close the host application process and autonomously relaunch a fresh operating system-level process on its own. Because of security sandbox restrictions, a running process cannot spawn a new instance of itself and then terminate safely without losing its context or hitting permission barriers.

## How It Works

1. Extension periodically checks whether a newer VS Code version is available.
2. When an update is detected:
   - A **status bar item** appears with a clickable button
   - A **notification** prompts the user with actions to update now or dismiss
3. User clicks **Update** → extension downloads the latest `tar.gz`
4. A backup of the current installation is created
5. The new version is extracted to the same directory
6. After extraction succeeds, the old installation is removed
7. Extension prompts with **Restart Now** → The user closes VS Code and reopens with the updated version

## Extension Settings

This extension contributes the following settings:

* `vscode-updater.installPath`: Custom installation directory. If not set, the extension automatically detects the running VS Code installation path. Can be any existing directory; critical system paths (`/`, `/usr`, `/home`, `/tmp`) are blocked for safety.
* `vscode-updater.autoBackup`: Enable or disable automatic backup before updating (default: `true`).
* `vscode-updater.enabled`: Master switch for automatic update checks (default: `true`). When `false`, no startup check, periodic checks, or notifications are triggered. The manual `Check for VSCode Updates` command still works.
* `vscode-updater.checkOnStartup`: Perform an update check when VS Code starts up (default: `true`). Only applies when `vscode-updater.enabled` is `true`.
* `vscode-updater.checkInterval`: How often to check for updates in days (default: `1`). **Note:** The last check timestamp is persisted across VS Code restarts. When the extension activates, it computes the remaining time from the last check and schedules the next check accordingly. If no previous check exists, it performs an immediate check on startup. Ignored if `vscode-updater.enabled` is `false`.
* `vscode-updater.channel`: VS Code release channel to check and download. Options: `stable` (default), `insider`.
* `vscode-updater.flavour`: VS Code flavour. Options: `vscode` (default), `codium`, `other`.
* `vscode-updater.customUpdateBaseUrl`: Base URL for update downloads when flavour is `other`. Example: `https://update.example.com`
* `vscode-updater.customReleasesUrl`: Full URL for releases list when flavour is `other`. Example: `https://update.example.com/api/releases/stable`
* `vscode-updater.customBinaryName`: Binary name to restart when flavour is `other`. Leave empty to use `code`.
* `vscode-updater.debug.deleteDownloadedArchive`: Delete the downloaded archive after updating (default: `true`). Set to `false` to keep the archive for debugging.
 * `vscode-updater.debug.keepFailedFolder`: When update fails, keep the new folder with a `.BAD` suffix instead of restoring from backup (default: `false`). Useful for debugging failed updates.
 * `vscode-updater.logLevel`: Verbosity level for the extension log in the Output panel. Options: `info` (default), `debug`, `trace`. Use `trace` for step-by-step troubleshooting.
 * `vscode-updater.tempDir`: Custom directory for temporary extraction and downloads. Leave empty to use the system temp directory. Use this to avoid cross-device issues.
 * `vscode-updater.tarTimeout`: Timeout in milliseconds for tar extraction (default: 600000 = 10 minutes). Increase for very slow network filesystems or large archives.
 * `vscode-updater.mvTimeout`: Timeout in milliseconds for mv operations during installation replacement (default: 600000 = 10 minutes). Increase for cross-device moves on slow storage.

## Commands

* `vscode-updater.update`: Download and install the latest VS Code update.
* `vscode-updater.restart`: Restart VS Code to load the updated version.
* `vscode-updater.checkNow`: Force an immediate update check.

## Requirements

- Linux operating system
- Sufficient permissions to write to the VS Code installation directory (may require `sudo` for system-wide installs)
- `tar` available in PATH
- **pnpm** as the package manager (per project stack)

## Development

Use **pnpm** for all package management. Standard commands:
- `pnpm run lint` — run ESLint
- `pnpm test` — run unit tests
- `pnpm run test:integration` — run full VS Code integration tests

### Update Rule

When the user says "update all":
1. Bump the version in `package.json`
2. Update `CHANGELOG.md` with all changes for the new version
3. Run `./publish --lint --test --package` (without `--publish`)
4. Commit with a proper message - Never Push

Use the `publish` script for the release pipeline:
- `./publish` — runs lint, test, package, and publish in sequence (stops on first failure)
- `./publish --lint` — lint only
- `./publish --test` — test only
- `./publish --package` — package only
- `./publish --publish` — publish only

## Testing

This extension has unit tests for pure logic functions. Some integration-level behaviors are **not unit-tested** due to the complexity of mocking VS Code's environment for a small extension:

- `performUpdate()` — requires filesystem mocking, progress API mocking, and backup/restore flow
- `restartVSCode()` — spawns system processes (`pkill`, `code`/`codium`)
- `extractTarGz()` — requires the `tar` binary to be present
- `isUpdating` guard — requires mocking `vscode.commands.registerCommand` to test concurrent invocation

These are covered by manual testing in the Extension Development Host (F5).

Run tests with:
- `pnpm test` — unit tests only
- `pnpm run test:integration` — full VS Code integration tests

## Supported Flavours

- **VS Code** (default) — uses Microsoft's official update API
- **VSCodium** — uses GitHub Releases API for version checks and downloads
- **Other** — provide custom update and releases URLs in settings

## Known Issues

- Updating a system-wide installation may require elevated permissions.
- Some custom VS Code builds or alternative distributions may not be compatible.
- No checksum or signature verification is performed on downloaded tarballs.
- `validateInstallPath` uses `fs.realpathSync` to prevent symlink escapes, but this is not a full security boundary.
- The restart command uses `pkill -x` which may not work on some Wayland compositors; in that case, restart manually.
- This extension is Linux-only.
- `installPath` blocks critical system directories (`/`, `/usr`, `/home`, `/tmp`, `/var`, `/snap`, `/dev`, `/proc`, `/sys`, `/boot`, `/root`, `/nix`) but allows custom paths like `~/myApps/vscode`.
- Downloaded tarballs are cached in `~/.cache/vscode-updater/` to speed up repeated testing. The cache is not automatically cleared.

## Troubleshooting

**Permission denied when updating**
- If VS Code is installed system-wide (e.g., `/usr/share/code`), you need `sudo` access. The extension will fail during the replacement step. Either run VS Code with sufficient permissions or install VS Code in your home directory.

**`tar` not found**
- The extension requires the `tar` command in PATH. Install it via your package manager: `sudo apt install tar` (Debian/Ubuntu) or `sudo dnf install tar` (Fedora/RHEL).

**Custom install path not detected**
- Set `vscode-updater.installPath` in your VS Code settings to the exact directory containing the `code` binary.

**Update button still shows in VS Code**
- This is expected. This extension cannot suppress VS Code's built-in update notification. Use the extension's status bar or command palette instead.

## Roadmap

- [Config Listener Elapsed-Time Issue](MISC/PHASE2.md#config-listener-elapsed-time-issue) — Changing `checkInterval` mid-session ignores elapsed time since last check
- [Missing installPath Handling](MISC/PHASE2.md#missing-installpath-handling) — `performUpdate()` throws `ENOENT` if `installPath` doesn't exist; no auto-create
- [Restart Feature — Not Working](MISC/PHASE2.md#restart-feature--not-working) — Automatic restart after binary update not yet implemented
- [Install Path Scenarios](MISC/PHASE2.md#install-path-scenarios) — Support for non-empty parent folders and custom executable folder names

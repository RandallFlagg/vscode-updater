# VSCode Updater

A VS Code extension that automates updating VS Code on Linux for users who don't have a package manager handling updates.

## Why This Exists

On Linux, VS Code's built-in update button opens a browser and sends you through a manual download and extraction process. This extension automates the entire flow so that updating is a single action.

## Limitations

This extension **cannot** intercept or replace VS Code's built-in "Update Available" notification, and it **cannot** place a button next to VS Code's native update button. That flow is controlled entirely by VS Code and is not exposed to extensions. Instead, this extension provides its own update mechanism via **three** surfaces:

1. **Status bar item** — a persistent icon in the bottom-right corner indicating update status
2. **Notification** — a popup when an update is detected, with action buttons
3. **Command palette** — commands available via `Ctrl+Shift+P` / `Cmd+Shift+P`

## How It Works

1. Extension periodically checks whether a newer VS Code version is available.
2. When an update is detected:
   - A **status bar item** appears with a clickable button
   - A **notification** prompts the user with actions to update now or dismiss
3. User clicks **Update** → extension downloads the latest `tar.gz`
4. A backup of the current installation is created
5. The new version is extracted to the same directory
6. After extraction succeeds, the old installation is removed
7. Extension prompts with **Restart Now** → VS Code closes and reopens with the updated version (or use the Restart VSCode command)

## Extension Settings

This extension contributes the following settings:

* `vscode-updater.installPath`: Custom installation directory. If not set, the extension automatically detects the running VS Code installation path. Must be under `/usr/share/code`, `/usr/share/code-insiders`, `/opt/visual-studio-code`, `/opt/visual-studio-code-insiders`, or `~/.vscode*` for safety reasons.
* `vscode-updater.autoBackup`: Enable or disable automatic backup before updating (default: `true`).
* `vscode-updater.checkInterval`: How often to check for updates in days (default: `1`).
* `vscode-updater.channel`: VS Code release channel to check and download. Options: `stable` (default), `insider`.
* `vscode-updater.flavour`: VS Code flavour. Options: `vscode` (default), `codium`, `other`.
* `vscode-updater.customUpdateBaseUrl`: Base URL for update downloads when flavour is `other`. Example: `https://update.example.com`
* `vscode-updater.customReleasesUrl`: Full URL for releases list when flavour is `other`. Example: `https://update.example.com/api/releases/stable`
* `vscode-updater.customBinaryName`: Binary name to restart when flavour is `other`. Leave empty to use `code`.

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
- `installPath` is restricted to known safe prefixes (`/usr/share/code*`, `/opt/visual-studio-code*`, `~/.vscode*`). Paths like `/tmp/vscode` are rejected for safety.

## Troubleshooting

**Permission denied when updating**
- If VS Code is installed system-wide (e.g., `/usr/share/code`), you need `sudo` access. The extension will fail during the replacement step. Either run VS Code with sufficient permissions or install VS Code in your home directory.

**`tar` not found**
- The extension requires the `tar` command in PATH. Install it via your package manager: `sudo apt install tar` (Debian/Ubuntu) or `sudo dnf install tar` (Fedora/RHEL).

**Custom install path not detected**
- Set `vscode-updater.installPath` in your VS Code settings to the exact directory containing the `code` binary.

**Update button still shows in VS Code**
- This is expected. This extension cannot suppress VS Code's built-in update notification. Use the extension's status bar or command palette instead.

## Release Notes

### 1.0.0

Initial release of VSCode Updater.

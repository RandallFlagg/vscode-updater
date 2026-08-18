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
7. User clicks **Restart** → VS Code closes and reopens with the updated version

## Extension Settings

This extension contributes the following settings:

* `vscode-updater.installPath`: Custom installation directory. If not set, the extension automatically detects the running VS Code installation path.
* `vscode-updater.autoBackup`: Enable or disable automatic backup before updating (default: `true`).
* `vscode-updater.checkInterval`: How often to check for updates in days (default: `1`).
* `vscode-updater.channel`: VS Code release channel to check and download. Options: `stable` (default), `insider`, `beta`.
* `vscode-updater.flavour`: VS Code flavour. Options: `vscode` (default), `codium`, `other`.
* `vscode-updater.customUpdateBaseUrl`: Base URL for update downloads when flavour is `other`. Example: `https://update.example.com`
* `vscode-updater.customReleasesUrl`: Full URL for releases list when flavour is `other`. Example: `https://update.example.com/api/releases/stable`

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

## Supported Flavours

- **VS Code** (default) — uses Microsoft's official update API
- **VSCodium** — uses GitHub Releases API for version checks and downloads
- **Other** — provide custom update and releases URLs in settings

## Known Issues

- Updating a system-wide installation may require elevated permissions.
- Some custom VS Code builds or alternative distributions may not be compatible.

## Release Notes

### 1.0.0

Initial release of VSCode Updater.

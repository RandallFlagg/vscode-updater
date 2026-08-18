# Stack

## Language
JavaScript (Node.js runtime). No TypeScript unless explicitly requested.

## Testing
- Unit tests: **mocha** + **assert** (Node.js standard library)
- Integration tests: `vscode-test` (disabled by default, run via `pnpm run test:integration`)
- Run unit tests: `pnpm test`
- Run linter: `pnpm run lint`

## Package Manager
**pnpm only.** Do not use npm or yarn. All scripts and commands must use `pnpm`.

## Dependencies
- Use Node.js standard library (`https`, `fs`, `path`, `os`, `child_process`) whenever possible.
- Do not add external dependencies without explicit approval.
- Current runtime dependencies: none.
- Current dev dependencies: `@types/vscode`, `@types/mocha`, `@types/node`, `eslint`, `@vscode/test-cli`, `@vscode/test-electron`.

## VS Code Extension
- Target engine: `^1.97.0`
- Use the VS Code Extension API (`vscode` module) for all extension functionality.

## Scripts
- `pnpm run lint` — run ESLint
- `pnpm run pretest` — runs lint automatically before tests
- `pnpm run test` — run VS Code extension tests

## OS Assumptions
- Linux primary target
- Assumes `curl` and `tar` available in PATH on the host system

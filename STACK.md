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
- Current dev dependencies: `@types/vscode`, `@types/mocha`, `@types/node`, `eslint`, `mocha`, `@vscode/test-cli`, `@vscode/test-electron`.

## VS Code Extension
- Target engine: `^1.97.0`
- Use the VS Code Extension API (`vscode` module) for all extension functionality.

## Workflow Rules
- Always update `CHANGELOG.md` when making changes that affect users
- Always update `REVIEW.md` and `QA_REPORT.md` after completing a review/QA pass
- Do not leave placeholder values (`TODO`, `your-username`, etc.) in committed code

## Scripts
- `pnpm run lint` — run ESLint
- `pnpm run pretest` — runs lint automatically before tests
- `pnpm run test` — run VS Code extension tests

## OS Assumptions
- Linux primary target
- External system tools required: `tar` (for extraction), `pkill` (for restart)
- Assumes `curl` and `tar` available in PATH on the host system

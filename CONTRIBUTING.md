# Contributing

Thanks for your interest. This project is small and pre-1.0; expect rough edges.

## Local development

```bash
git clone https://github.com/MadanChaollaPark/head-voice-input.git
cd head-voice-input
npm install
npm run build
```

Open the folder in Cursor or VS Code and press `F5`. An Extension Development Host window opens with the extension loaded. Run `Head Input: Open Panel` from the command palette.

For incremental rebuilds while iterating, run `npm run watch` in a separate terminal — esbuild rebuilds the extension and webview bundles on save. Reload the dev host with `Cmd/Ctrl+R` to pick up changes.

## Type checking

```bash
npm run typecheck
```

Runs `tsc --noEmit`. CI will eventually fail on type errors; please run this before opening a PR.

## Commit style

The history uses conventional-commit prefixes: `feat`, `fix`, `chore`, `docs`, `build`, `deps`, `refactor`. Scope in parentheses when it clarifies the area, e.g. `feat(webview): ...`.

Prefer small, focused commits over one large change. Each commit should leave the project in a buildable state.

## Project layout

See [`docs/architecture.md`](docs/architecture.md) for an overview of how the extension host and webview interact.

| Path                  | Role                                                  |
| --------------------- | ----------------------------------------------------- |
| `src/extension.ts`    | Activation, command routing, Deepgram, text insertion |
| `src/panel.ts`        | Webview creation, CSP, asset URIs                     |
| `src/statusBar.ts`    | Status bar item                                       |
| `src/deepgram.ts`     | Streaming WebSocket client                            |
| `src/types.ts`        | Shared message types between host and webview         |
| `src/webview/*`       | All code that runs inside the webview (camera, tracker, mic) |
| `esbuild.mjs`         | Bundler script for both targets                       |

## Testing

There are no automated tests yet. See [`docs/testing.md`](docs/testing.md) for the manual checklist that should pass before merging.

## Reporting bugs and security issues

- Bugs: open an issue using the bug report template.
- Security: see [`SECURITY.md`](SECURITY.md). Do not open a public issue for security problems.

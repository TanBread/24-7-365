# Contributing to 7/24 IDE

Thanks for your interest in improving **7/24 IDE** — an autonomous local AI
developer agent for Windows. Contributions of all kinds are welcome: bug
reports, feature ideas, documentation, and code.

## Ways to contribute

- **Report a bug** — open an [issue](https://github.com/strmax195-hue/7-24-IDE/issues/new/choose) using the Bug Report template.
- **Request a feature** — open an issue using the Feature Request template.
- **Improve docs** — fixes to the README, the website (`docs/`), or comments are always appreciated.
- **Submit code** — pick an open issue or propose a change, then open a Pull Request.

## Project layout

```
desktop-gui/      Electron + TypeScript app (UI, agent loop, IPC)
  src/main.ts       Electron main process & IPC handlers
  src/preload.ts    contextBridge IPC bridge
  src/renderer.ts   Renderer: chat, agent, tools, settings
  src/lib/          coreEngine, mcp, codeUtils, i18n, toolSchemas
  src/index.html    UI markup
  src/styles.css    Styles
core-backend/     Optional native Rust engine (Tree-sitter AST + BM25 search)
docs/             GitHub Pages landing site
```

## Development setup

Requirements: **Node.js 18+** (Windows). Rust is optional — only needed to build
the native engine.

```bash
# Desktop app
cd desktop-gui
npm install
npm run build      # bundle main/preload/renderer + Monaco (+ Rust core if cargo is present)
npm start          # launch the app
npm test           # run the vitest suite
npm run dist       # build the Windows installer into ../dist-installer

# Native engine (optional, requires the Rust toolchain)
cd core-backend
cargo build --release
cargo test
```

The app runs fully without the native binary — it falls back to its TypeScript
implementation, so you don't need Rust to work on most features.

## Pull request guidelines

1. **Branch** from `main` with a descriptive name (e.g. `fix/model-picker-star`).
2. **Keep it focused** — one logical change per PR.
3. **Match the existing style** — no new frameworks or formatters; follow the patterns already in the file you're editing.
4. **Build & test before pushing:** `npm run build` and `npm test` must pass with no TypeScript errors.
5. **Localize user-facing strings** — wrap new UI text in `t('...')` and add entries to `src/lib/i18n.ts` (English + Chinese).
6. **Update docs** — if behavior changes, update the README and add a `CHANGELOG.md` entry.
7. **Fill in the PR template** so reviewers know what changed and how you tested it.

## Reporting security issues

Please **do not** open public issues for security vulnerabilities. See
[SECURITY.md](SECURITY.md) for how to report them privately.

## Code of Conduct

By participating you agree to abide by our
[Code of Conduct](CODE_OF_CONDUCT.md).

# Changelog

All notable changes to the **7/24 IDE** project will be documented in this file.

---

## [1.5.0] - 2026-06-12

A major release: a new native engine, a redesigned chat and planning experience, a smart model picker, and broad stability & security improvements.

### ⚡ Native Engine (Rust Core)
*   **Tree-sitter AST:** Added an optional native Rust engine that builds real syntax trees for Rust, TypeScript/TSX, JavaScript/JSX, Python, HTML, CSS and JSON. The agent receives accurate code structure instead of an approximation.
*   **BM25 code search:** Project search is now ranked by relevance (BM25, accounting for term frequency and length) instead of plain substring matching. The workspace is indexed in the background when opened.
*   **Transparent fallback:** If the native binary is unavailable, the app seamlessly uses its built-in TypeScript implementation — no loss of functionality.

### 🎨 Fully Redesigned Interface
*   **Modern model picker:** A new dropdown with search, tabs (All / Free / ★ Favorites), FREE badges, context window and price labels for every model. Favorites are pinned with a star right in the list, with instant visual highlighting.
*   **Readable chat column:** Messages now live in a clean, centered column with refined typography, like the best AI editors. User messages sit on the right; assistant replies read like a document.
*   **Live activity bar:** During generation a modern bar at the bottom of the chat shows what the agent is doing, which files changed, and token usage — in real time.
*   **Plan progress:** A sticky indicator at the top shows the current build step, progress and task description, with a quick jump to the Tasks tab.
*   **Modern micro-agent:** Plan-step execution is shown as an elegant status card with a clear list of actions instead of technical logs.
*   **Commands in chat:** Console command runs are shown as a compact card with live output that stays in the history.

### 🚀 Agent Improvements
*   **Faster planning:** Plan creation is quicker and clearer — the agent proposes steps to approve right away.
*   **Reliable plan execution:** Each step runs in an isolated micro-agent inside a shadow workspace and is merged into the project only on success. Self-healing on build errors is more accurate.
*   **Change & token counters:** See how many files were touched and how many tokens were spent per request.

### 🌍 Localization
*   Greatly expanded English and Chinese interface translations — the model picker, indicators, dialogs, system messages and hints are now localized.

### 🔒 Reliability & Security
*   Hardened workspace handling and processing of content from external sources.
*   Improved robustness with MCP servers, long-running commands and large repositories.
*   Cleaner shutdown of background processes when the app exits.

---

## [1.4.3] - 2026-06-12

A professional security and stability pass ahead of a wider release.

### Security
*   **XSS via file names:** File names from the workspace and error texts are now escaped before being inserted into the DOM. Opening a repository with a malicious file name (`"><img onerror=...>`) can no longer execute arbitrary code in the renderer.
*   **XSS via model/file output:** Added a built-in HTML sanitizer (`sanitizeHtml`) on the Markdown parser output. It removes `<script>`, `<iframe>`, `<object>`, `<form>` and similar tags, strips all `on*` event handlers, and blocks `javascript:` / `data:text/html` links. Prompt injection from a read file can no longer execute scripts. The Run/Copy buttons in code blocks are preserved.

### Stability
*   **MCP hang:** Requests to MCP servers now have a 60s timeout. When a server crashes/closes, all pending requests are correctly rejected (previously an agent step could hang forever and leak memory).
*   **Project race crash:** Fixed crashes when deleting/switching the active project during generation — `activeProject` is now checked after every `await` in the agent loop, tools and micro-agent.
*   **Orphaned processes:** On app exit all running terminal processes are forcibly terminated (Windows: `taskkill /t /f`, Unix: SIGTERM). MCP servers on Windows are now killed together with their process tree.
*   **Directory traversal protection:** `read-dir` is guarded against symlink loops (via a canonical-path set) and limited by depth (25) and file count (20000) — a malicious or huge repository no longer freezes the app.
*   **Command buffer overflow:** `exec-command` raised `maxBuffer` to 64 MB — commands with large output (builds, tests) no longer fail with "maxBuffer exceeded".

### Other
*   **Cross-platform cleanup:** Temp files for chat code execution are removed through a path-checked `delete-file` IPC instead of `rm -f`, which didn't work on Windows.
*   **Versions:** Desktop app and Rust core synchronized at `1.4.3`.

---

## [1.4.2] - 2026-06-12

### Native engine: Rust core-backend wired into the Electron app
*   **End-to-end integration:** The `core-backend` Rust binary is no longer an isolated scaffold. The Electron main process now spawns it on startup, communicates with it over JSON-RPC stdio, and exposes `coreParseAst`, `coreSearchRag`, `coreIndexFile(s)`, `coreRemoveFile`, `coreClearIndex`, and `coreStatus` to the renderer through a thin `CoreEngineClient`.
*   **Real Tree-sitter AST parsing:** Replaced the regex-based scanner with `tree-sitter` for Rust, TypeScript/TSX, JavaScript/JSX, Python, HTML, CSS and JSON. Function/method/class/struct/interface/enum nodes are extracted with precise line ranges.
*   **Real BM25 search:** Replaced the naive `String::contains` substring match with an in-memory BM25 ranker (40-line chunking, code-aware tokenisation, document-frequency weighted IDF). Substring and path bonuses keep short identifier searches accurate.
*   **Background indexing:** When a workspace folder is opened, the renderer asynchronously indexes all text files (≤500 KB, excluding `node_modules` / `.shadow-workspace`) into the native engine in batches.
*   **Graceful fallback:** Every native call is non-fatal — if the binary is missing, fails to start, or returns null, the renderer transparently falls back to the existing TypeScript implementations (`compressCodeContext`, linear `<search_code>`).
*   **Build pipeline:** `build.js` now optionally builds the Rust binary via `cargo build --release` if `cargo` is on `PATH`. Skipped silently otherwise. The compiled binary is copied into `dist/` and bundled by `electron-builder` as `extraResources` (with `asarUnpack`) so it sits next to the app instead of inside the asar archive.
*   **Version sync:** Bumped `desktop-gui` and `core-backend` to a unified `1.4.2`.

### Robustness
*   **Terminal kill timeout race:** `exec-command-stream` no longer mutates `activeProcesses` from the timeout handler — the `close` event drives the resolve, removing a TOCTOU hole when long commands timed out.
*   **Cargo / build on Node 25:** Build script no longer triggers Node's `[DEP0190]` warning about `spawn(args, {shell: true})`.

---

## [Unreleased]

### Added
*   **Workspace Dashboard (in chat):** A full interactive dashboard is shown as the chat's welcome message.
    *   **Real-time Git integration:** Displays the current Git branch and a color-coded list of changed files (Modified, Added, Deleted), with options to initialize a repository and force-refresh.
    *   **Recent projects:** In the onboarding state (no folder open) a clean list of recently opened folders allows one-click switching.
    *   **Quick actions:** Fast access to creating a file, the system Explorer, the terminal and the task list.
    *   **AI prompts:** Cards with ready-made common requests (error check, README, tests, structure) that are sent to the assistant automatically.

### Fixed
*   **Stop button:** Fixed an issue where the Stop button didn't halt the plan step chain and kept launching subsequent steps. Added a safety flag before the next step and proper handling of manual stops with shadow-workspace cleanup.
*   **Micro-agent log design:** The dated micro-task execution log style was replaced with a premium terminal-like box: monospace font, custom scrollbar, and clear indicators/badges for each event type (success, error, tool launch, self-healing, etc.).
*   **Marked v14+ compatibility:** Fixed a critical `TypeError: text.replace is not a function` when rendering chat Markdown, caused by a method signature change in newer Marked versions.
*   **OpenRouter error handling:** Added a clear error message for an invalid or expired API key (401 Unauthorized from OpenRouter) instead of an unhandled agent crash.

---

## [1.4.1] - 2026-06-11

A large audit and stability pass. Includes a full codebase review with UI/UX and security improvements.

### New in Chat
*   **Conversation Branching:** A new "Branch" button on every message creates a new chat fork with the history up to the selected message. Perfect for experimenting without losing previous context.
*   **Tool Rerun:** A "Retry" button in the tool accordion re-runs a specific tool call without regenerating the whole response.
*   **Image support:** Paste images via Ctrl+V or drag-and-drop directly into the input. Images are automatically attached to the conversation context.
*   **Run code in chat:** Code blocks in JavaScript, TypeScript, Python, Shell and other languages now have a "Run" button for quick execution right from the chat.

### UX Improvements
*   **Keyboard shortcuts:**
    *   `Ctrl+K` — quick chat search
    *   `Ctrl+L` — clear chat and start new
    *   `Ctrl+Shift+M` — toggle Build/Plan modes
*   **Tool execution indicator:** During streaming a running-tools indicator is shown for better feedback.
*   **Context management:** A "Clear all" button to quickly detach all attached files.
*   **Tool action buttons:** Each tool accordion in chat history now has copy-result and rerun buttons.
*   **Improved message clarity:** Added a subtle left border for AI messages for better visual separation from user messages.
*   **Responsive design:** On narrow screens (<720px) the chat and preview now stack vertically.

### Reliability
*   Corrected message branching and regeneration, project field initialization, and Build/Plan toggling.
*   Hardened the path-containment checks for all file handlers (`read-file`, `write-file`, `check-image-size`).
*   Fixed binary (BASE64) image writing, removed duplicated event handlers, and tidied stray CSS.
*   Temp files from code execution are now cleaned up, and broken streaming bubbles are removed correctly on retry errors.

### Accessibility
*   Added `role="log"` / `aria-live="polite"` for the chat container, `aria-label` for the textarea, and `role="tablist"` / `aria-selected` for the mode toggle.

---

## [1.4.0] - 2026-06-11

This release dramatically improves chat functionality and design, increasing task-execution reliability and offering an ultra-modern user experience.

### Design (UI)
*   **Floating Input Card:** The chat field is now an aesthetic rounded card floating above the chat. All controls (AI model selector, Build/Plan toggle, attach and send buttons) are ergonomically placed inside it.
*   **Modern message bubbles:** User messages got elegant rounding and minimal borders. Tool outputs are styled as neat console execution logs.
*   **Interactive start screen:** A new, clean welcome-screen design with convenient steps and a monochrome aesthetic.

### Functionality & Reliability (UX)
*   **Robust Markdown parser (Marked):** The legacy regex parser was replaced with full Marked, ensuring correct rendering of tables, nested lists and complex formatting.
*   **Clickable file paths:** Any project file paths mentioned in chat or code-block headers (e.g. `src/main.ts` or `package.json`) are now clickable. Clicking instantly reads the file and opens it in the Code tab on the right.
*   **Auto-continue generation (Anti-Truncation):** If a model response is cut off by the token limit mid-code or mid-tag, the chat automatically requests a continuation and seamlessly stitches the responses together, preventing corrupted files from unfinished code.
*   **External links:** All web links open in the user's external browser via a secure Electron bridge.
*   **Command stopping:** The stop-generation button now reliably interrupts any console commands launched by the agent.

---

## [1.3.9] - 2026-06-11

This release completely reworks the interface design, dropping gradients in favor of an ultra-clean monochrome (borderless) style. It also includes powerful UX improvements to the home screen and chat.

### UI / UX Redesign
*   **Ultra-minimalist chat:** Removed all unnecessary borders and backgrounds from AI messages. User messages became black pills. The interface looks like a clean text document.
*   **Borderless panels:** Panels are separated only by subtle shade differences and thin dividers.
*   **Auto-expanding input:** The chat field smoothly grows in height as you type longer text.
*   **Smart auto-scroll:** The chat no longer jumps to the bottom while you browse history. Added a new floating "scroll to bottom" button.
*   **Code copy:** New stylish copy buttons appear on hover over any code block.
*   **Auto-focus:** The input field automatically receives focus when the app opens or projects are switched.
*   **New welcome screen:** The start screen is freed of heavy cards. Added keyboard shortcut hints (`Ctrl+N`, `Ctrl+O`).


## [1.3.8] - 2026-06-11

This major UI/UX release redesigns the chat interface to a premium, modern look and fixes specific message token metrics.

### Added
*   **Premium Chat UI:** Completely redesigned chat bubbles for both AI and user messages. AI messages now have structured card layouts, while user messages have premium purple-blue gradients.
*   **Specific Token Usage:** Each AI response now displays its own token count (e.g. `🧮 1,234 + 512`) and estimated cost, replacing the redundant project-wide totals.
*   **Clean Empty States:** Handled messages with no text content (only tools or reasoning) elegantly without creating blank bubbles.

### Fixed
*   **Reasoning Blocks:** Refined the style and collapse transitions of reasoning blocks (DeepSeek R1/thought processes) to fit perfectly within message cards.
*   **Tool Accordions:** Cleaned up padding, borders, and status icons for MCP and local tool cards.

## [1.3.7] - 2026-06-11

This chat quality release improves the agent loop for modern reasoning models and prevents raw tool XML from leaking into conversations.

### Fixed
*   **Tool Parsing:** The chat and execution loop now accept XML tool attributes wrapped in either single or double quotes, fixing cases like `<read_file path='index.html' full='true'/>` from reasoning models.
*   **Chat Rendering:** Orphan closing tool tags are hidden instead of appearing as stray text, and tool cards render consistently for recovered tool calls.
*   **Agent Prompting:** The built-in system prompt now explicitly asks models to use double-quoted tool attributes while keeping the runtime parser tolerant.

### Changed
*   **Website & Docs:** Updated v1.3.7 release messaging around the improved 2026-ready reasoning chat.

## [1.3.6] - 2026-06-11

This QA release stabilizes packaging, tightens TypeScript coverage, and refreshes the chat, localization, website, and release metadata.

### Fixed
*   **Release Build:** Pinned the Electron build script to the desktop GUI `tsconfig.json` so frontend builds no longer crawl parent folders and fail with Windows access errors.
*   **TypeScript Health:** Brought the desktop renderer and updater types back in sync with current features including Ollama context size, Git commit verification, reasoning content, and MCP server IDs.
*   **Chat UI:** Localized reasoning/copy/token labels, improved copy button states, and made reasoning block collapse affordances clearer.

### Changed
*   **Website & Docs:** Updated the website, README, and release notes for v1.3.6 with current Monaco diff, xterm stdin, reasoning, fallback model, MCP/Ollama, auto-commit, and updater capabilities.
*   **Release Metadata:** Updated app, package, lockfile, backend, About screen, and download link versions to 1.3.6.

## [1.3.5] - 2026-06-10

This hotfix release addresses issues with streaming reasoning, infinite tool loops, and improves layout interaction.

### Fixed
*   **Agent Execution & Tools:** Disabled native function calling configuration (`tools`) in API requests to force the model to output standard XML tags. This solves the bug where tool calls were executed invisibly, causing history mismatch loops (e.g. repeated `read_dir` commands) and hanging states.
*   **Reasoning Blocks UI:** Added collapsible reasoning block support for both inline `<think>` tags and separate reasoning fields (`delta.reasoning`, `delta.thought`). Added a global delegation click handler to allow collapsing/expanding reasoning blocks during live streaming and after reloading saved chats.
*   **Layout Separator:** Fixed lag issues in the vertical split-pane divider to ensure smooth sliding and docking.

---

## [1.3.4] - 2026-06-10

This hotfix release adds initial support for reasoning models.

### Added
*   **Reasoning Models Support:** Enabled rendering of reasoning blocks for models like DeepSeek.

---

## [1.3.3] - 2026-06-10

This hotfix release addresses layout stability and agent loop robustness.

### Fixed
*   **UI Stability:** Added robust try-catch boundaries around agent execution cycles to prevent uncaught exceptions from stalling the UI.
*   **Split-Pane:** Initial performance improvements to split-pane drag handlers.

---

## [1.3.2] - 2026-06-10

This hotfix release restores the original light branding icon and bumps the internal version tracker.

### Fixed
*   **Branding:** Restored the original white application icon across the root workspace, documentation assets, and the installer compilation to match the classic look from v1.2.2.

---

## [1.3.1] - 2026-06-10

This hotfix release adds a provider header to the top of the model selection dropdown.

### Fixed
*   **Model Selector UI:** The model selector now explicitly indicates the active provider (e.g., OpenRouter or Ollama) at the top of the list, preventing confusion about the source of the models.

---

## [1.3.0] - 2026-06-10

This major release introduces the industry-standard Monaco Editor for syntax highlighting, integrates xterm.js for a robust terminal experience, and improves the overall UX logic.

### Added
*   **Monaco Editor Integration:** Replaced the custom text diff viewer with Monaco Editor (the same engine powering VS Code) for highly accurate syntax highlighting, diff rendering, and large file support.
*   **xterm.js Terminal:** Upgraded the internal live terminal to use xterm.js. It now handles advanced formatting, colors, and dynamic resizing just like a native OS terminal.
*   **Remove Favorite Models:** Added a close (x) button on favorite model pills to quickly unpin them from your workspace.

### Refactored & Polished
*   **UX/UI Enhancements:** General stability improvements to the IDE layout, localized components, and underlying React architecture.

---

## [1.2.2] - 2026-06-10

This release refines terminal interactions, git integration, diff readability, local LLM options, and updates branding graphics.

### Added
*   **Terminal Process Interrupt:** Stop running terminal commands at any time using a new "Stop" button in the Terminal view (utilizing `taskkill` on Windows and `SIGINT` on Unix).
*   **Terminal Stdin History:** Navigate previously entered inputs using the Up/Down arrow keys in the stdin input bar.
*   **Git Auto-Commit Verification:** Added settings to verify commits before they are finalized. Shows an interactive review/edit card in chat where you can edit the commit message or skip the commit entirely. Also supports customizable commit message prefixes (defaults to `[AI]`).
*   **Diff Syntax Highlighting:** Light-weight regex-based syntax highlighting in the Side-by-Side Diff modal for major languages (JS, TS, HTML, CSS, JSON, Python, etc.) to enhance readability during review.
*   **Ollama Context Size configuration:** Customize the model context limit (`num_ctx`) to 2048, 4096, 8192, or 16384 tokens in the Settings provider panel.

### Refactored & Polished
*   **Branding Assets & Logo:** Rounded the corners of `icon.png` with a smooth 18% radius mask for a premium modern look, rebuilt `icon.ico`, and updated the presentation banner `social-preview-light.png` with a rich visual composition of the app's features.

---

## [1.2.1] - 2026-06-10

This hotfix addresses missing localization entries in the System Prompt configuration section.

### Fixed
*   **System Prompt Translations:** Added Russian, English, and Chinese translations for the Custom System Prompt input header, details label, and placeholder text in the User Modeling tab under Settings.

---

## [1.2.0] - 2026-06-10

This release focuses on adding local offline capabilities, developer tools extension, git automation, interactive commands execution, visual diff inspections, and bug fixes for the Windows auto-updater.

### Added
*   **Ollama Offline Integration:** Offline LLM generation and plan execution using local Ollama model backends (defaulting to `http://localhost:11434`). Configure local settings and fetch models automatically from local tags.
*   **Smart Auto-Commits:** Automatically stage changed files and create Git commits with AI-generated messages after each successfully completed checklist step. Enable this in *Settings -> General*.
*   **Model Context Protocol (MCP):** Connect external developer tools via standard stdio JSON-RPC MCP servers, configured directly in the Settings panel under a dedicated MCP section.
*   **Interactive Terminal Stdin:** Type inputs into active terminal processes (e.g. CLI prompts, y/n confirmations) directly from the IDE using the new terminal input bar.
*   **Fullscreen Side-by-Side Diff:** Replaced inline diff cards with a full-size modal overlay utilizing LCS line alignment to show original and modified code side-by-side.
*   **Windows Code Signature Updater Fix:** Bypassed signature checks to restore auto-updates for unsigned executables.

### Refactored & Polished
*   **i18n Translation additions:** Added localized strings for new features in Russian, English, and Chinese.

---

## [1.1.0] - 2026-06-10

This release focuses on improving background execution, quick access workflows, multi-monitor preview capabilities, and overall UI/UX refinements.

### Added
*   **Tray Minimization:** Close the main window to keep 7/24 IDE running in the system tray. Restore it instantly from the tray icon or right-click to exit completely. Toggle this preference in *Settings -> General*.
*   **Native System Notifications:** Receive OS-level desktop notifications when:
    *   A long-running plan/build completes successfully.
    *   A build fails or encounters a command execution error.
    *   The agent is waiting for your permission (reads, writes, commands) while the window is not active or minimized.
*   **Favorite Models (Quick Select):** Pin up to 3 of your most-used models by clicking the star icon next to the model selector. Pinned models appear as quick-select pills above the chat input for one-click switching.
*   **External Preview Window:** Open the active sandboxed HTML preview in a separate, dedicated native window. Perfect for dual-monitor setups or focusing on the visual layout. Content updates live as the agent modifies the code.
*   **Export Chat to Markdown:** Download your entire conversation history as a formatted Markdown (`.md`) file directly from the chat header.

### Refactored & Polished
*   **Light Theme Polish:** Re-designed the application branding with flat, borderless light theme social previews and clean high-resolution logo files.

---

## [1.0.0] - 2026-06-08

### Added
*   **Initial Public Release:**
    *   Conversational AI workspace agent built around OpenRouter.
    *   **Dual Modes:** *Build mode* (immediate edits) and *Plan mode* (structured step-by-step checklist execution).
    *   **File & Sandbox Protection:** Sandboxed local workspace directory with configurable permission policies.
    *   **Auto-Checkpoints:** Automatic snapshots before modifications with one-click rollback.
    *   **Visual Diff Reviews:** Side-by-side diff comparisons before any file modification.
    *   **Live Preview:** Embedded iframe preview for HTML/JS applications.
    *   **Self-Evolving Skills:** Automatic agent reflection that compiles context rules for future tasks.

# Changelog

All notable changes to the **7/24 IDE** project will be documented in this file.

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

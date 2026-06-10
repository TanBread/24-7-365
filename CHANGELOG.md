# Changelog

All notable changes to the **7/24 IDE** project will be documented in this file.

---

## [1.1.0] - 2026-06-10

This release focuses on adding local offline capabilities, developer tools extension, git automation, interactive commands execution, visual diff inspections, and bug fixes for the Windows auto-updater.

### Added
*   **Ollama Offline Integration:** Offline LLM generation and plan execution using local Ollama model backends (defaulting to `http://localhost:11434`). Configure local settings and fetch models automatically from local tags.
*   **Smart Auto-Commits:** Automatically stage changed files and create Git commits with AI-generated messages after each successfully completed checklist step. Enable this in *Settings -> General*.
*   **Model Context Protocol (MCP):** Connect external developer tools via standard stdio JSON-RPC MCP servers, configured directly in the Settings panel under a dedicated MCP section.
*   **Interactive Terminal Stdin:** Type inputs into active terminal processes (e.g. CLI prompts, y/n confirmations) directly from the IDE using the new terminal input bar.
*   **Fullscreen Side-by-Side Diff:** Replaced inline diff cards with a full-size modal overlay utilizing LCS line alignment to show original and modified code side-by-side.
*   **Windows Code Signature Updater Fix:** Bypassed signature checks to restore auto-updates for unsigned executables.
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
*   **i18n Translation additions:** Added localized strings for new features in Russian, English, and Chinese.

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

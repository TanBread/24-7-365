# Changelog

All notable changes to the **7/24 IDE** project will be documented in this file.

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

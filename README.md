# <img src="icon.png" width="40" height="40" align="center" /> 7/24 IDE

![7/24 IDE Social Preview](social-preview-light.png)

A desktop AI coding agent for Windows. You describe what you want to build —
the agent reads files, writes code, runs commands, and shows the result. It
works with any model available through OpenRouter (GPT, Claude, Gemini,
DeepSeek, Llama, and more), so you choose the brain.

It is **not a traditional IDE**: there is no source-code editor inside the
app. Instead, it is a focused conversational workspace built around an AI
agent — designed to be approachable for makers, designers, students, and
indie developers who want to ship working software without writing every
line by hand.

## Install

1. Download the latest installer from the
   [Releases](../../releases) page → `7-24-IDE-Setup-x.y.z.exe`.
2. Run it: standard Windows installer with shortcuts and an uninstaller.
3. On first launch the app shows a one-screen welcome where you pick the
   interface language and (optionally) paste your
   [OpenRouter API key](https://openrouter.ai/) — it is the gateway to all
   supported models.

The app updates itself: when a new version appears in Releases, you get an
in-app prompt and update with one click.

## What it can do

### Conversational agent with two clear modes

- **Build mode** — write what you need and the agent gets to work right
  away: reads files, edits or creates them, runs build/install/test
  commands as needed, and shows everything live. Good for fixes, small
  features, and quick changes.
- **Plan mode** — for bigger work the agent first proposes a step-by-step
  plan you can review, edit, reorder, or trim. When you press "Start
  build", the plan switches to a tracked task list and the agent works
  through each step with isolated context so it doesn't lose focus on long
  jobs.

### Real tools, not a sandbox demo

The agent operates on real files in a folder you choose:

- read & write files, with automatic AST-style compression so large files
  don't blow up the context window;
- a strict search-and-replace edit operation that fails loudly instead of
  guessing — protects you from broken patches;
- run real shell commands with **streaming output** in a built-in terminal
  panel, so long-running builds and watchers behave normally;
- search across the codebase with a fast keyword search;
- check image dimensions and list reusable components.

### Reversibility built in

Mistakes happen — the app makes every action recoverable:

- **Auto-checkpoints** — before every agent run a silent file snapshot is
  saved. Roll back the whole project to any point in one click via the
  *Snapshots* tab.
- **Per-edit review** — by default any file write is shown as a diff
  before it touches the disk. Approve, reject, or edit the path.
- **Atomic writes** — files are written via a temp-file rename, so a
  crashed write never leaves you with half a file.
- **Resume after a network drop** — if the connection to the model
  provider breaks mid-generation, the conversation state is preserved and
  the app offers a one-click "Continue" card. Same on a fresh start of
  the app: if the previous reply was incomplete, you'll be asked to
  resume.

### Sandbox & permissions

You stay in control of what the agent can do:

- Files are restricted to the **working folder** you pick — anything
  outside is blocked at the IPC layer.
- Three independent permission knobs in Settings: reads, writes (with
  optional diff review), and shell execution. Each can be set to
  always-ask, allow, or deny.
- The HTML preview iframe runs **with a strict Content Security Policy**:
  generated code can't make outbound network requests, embed iframes, or
  load remote resources — even if the model produces something it
  shouldn't.
- API key is encrypted at rest with the OS keychain (Windows DPAPI). It
  never leaves your machine.

### Native tool calling, with a fallback

For models that support it, the agent uses **native function calling**
(structured JSON tool calls) — the same API Cursor, Claude Desktop, and
ChatGPT use. For models that don't, the agent transparently falls back to
parsing tool tags from the model's reply. Either way, the user-visible
behaviour is the same.

### Smart context economy

Long conversations don't have to be expensive:

- The chat history is compressed before each request: old tool outputs
  are summarised, and older long messages are trimmed.
- A model-aware budget keeps the request below the model's context
  window minus your reply budget — instead of letting the provider error
  out.
- For Anthropic models, the system prompt is marked for **prompt caching**
  so repeat requests reuse the same prefix tokens.

### Self-evolving skills

After a successful project (a finished plan, or a build session that
actually changed files), the assistant runs a quiet **reflection step**:
it analyses the conversation and saves a reusable *skill* — a short rule
set telling future sessions how to handle similar tasks. Skills auto-
activate by keyword in the next request, so the agent gets sharper at
your specific stack over time. View, edit, or delete skills in
Settings → Profile & Skills.

### Live preview with no flicker

If the project produces an HTML file, it shows in a side preview pane.
The iframe only reloads when the file actually changes, so there is no
flashing when the agent rewrites unrelated files. You can switch between
desktop, tablet, and mobile viewports.

### Model intelligence that stays current

- The list of available models is **refreshed in the background** at
  startup and every six hours, with prices pulled live from OpenRouter —
  no need to hit "Refresh".
- A diff is shown when the catalogue changes (new models added, prices
  changed, models removed).
- If your selected model disappears, the app silently switches to your
  configured fallback model and tells you what happened.
- Per-request you see the exact token count and dollar cost based on
  current prices.

### Drag, drop, and pin

- Drag files from your file manager straight into the chat to attach
  them as context.
- Pin frequently-needed files (configs, schemas, design docs) so they are
  attached to every message in a project automatically.
- `@`-mention files in the input to insert a reference.

### Localised, monochrome, accessible

- Interface in **English, Russian, and 中文 (Chinese)** — pick on first
  run, change anytime in Settings.
- Calm monochrome design (light and dark themes), focused on readability
  during long sessions.
- Visible focus rings on every control for keyboard users; ARIA labels on
  icon-only buttons.

## Privacy

- Your projects, conversations, settings, and snapshots live **only on
  your machine** (`%APPDATA%\7-24 IDE\`).
- The API key is encrypted at rest using the OS keychain.
- Network traffic goes only to OpenRouter (for model calls) and to GitHub
  (only to check Releases for updates). There is no telemetry.

## License

See [LICENSE](LICENSE).

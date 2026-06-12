# Changelog

All notable changes to the **7/24 IDE** project will be documented in this file.

---

## [1.5.0] - 2026-06-12

Большой релиз: новый нативный движок, переработанный интерфейс чата и режима планирования, умный выбор моделей и масштабное улучшение стабильности и безопасности.

### ⚡ Нативный движок (Rust Core)
*   **Tree-sitter AST:** Добавлен опциональный нативный движок на Rust, который строит настоящие синтаксические деревья для Rust, TypeScript/TSX, JavaScript/JSX, Python, HTML, CSS и JSON. Агент получает точную структуру кода вместо приблизительной.
*   **BM25-поиск по коду:** Поиск по проекту теперь ранжируется по релевантности (алгоритм BM25 с учётом частоты и длины), а не простым совпадением подстроки. Рабочая папка индексируется в фоне при открытии.
*   **Прозрачный фолбэк:** Если нативный бинарник недоступен, приложение бесшовно использует встроенную реализацию на TypeScript — функциональность не теряется.

### 🎨 Полностью переработанный интерфейс
*   **Современный выбор моделей:** Новый дропдаун с поиском, вкладками (Все / Бесплатные / ★ Избранные), бейджами FREE, контекстом и ценой для каждой модели. Избранные модели закрепляются звёздочкой прямо в списке — с мгновенной визуальной подсветкой.
*   **Читаемая колонка чата:** Сообщения теперь располагаются в аккуратной центрированной колонке с улучшенной типографикой, как в лучших AI-редакторах. Сообщения пользователя — справа, ответы ассистента читаются как документ.
*   **Живой индикатор активности:** Во время генерации внизу чата отображается современная панель: что делает агент, какие файлы изменены и расход токенов — в реальном времени.
*   **Прогресс плана:** Закреплённый сверху индикатор показывает текущий шаг сборки, прогресс и описание задачи, с быстрым переходом во вкладку «Задачи».
*   **Современный микро-агент:** Выполнение шагов плана отображается элегантной карточкой со статусом и понятным списком действий вместо технических логов.
*   **Команды в чате:** Запуск консольных команд показывается компактной карточкой с живым выводом, которая остаётся в истории.

### 🚀 Улучшения работы агента
*   **Быстрое планирование:** Создание плана стало быстрее и понятнее — агент сразу предлагает шаги к утверждению.
*   **Надёжная сборка по плану:** Каждый шаг выполняется изолированным микро-агентом в теневой песочнице и вливается в проект только при успехе. Самолечение при ошибках сборки стало точнее.
*   **Счётчик изменений и токенов:** Видно, сколько файлов затронуто и сколько токенов израсходовано за запрос.

### 🌍 Локализация
*   Значительно расширены переводы интерфейса на английский и китайский — переведены панель выбора моделей, индикаторы, диалоги, системные сообщения и подсказки.

### 🔒 Надёжность и безопасность
*   Усилена защита рабочего пространства и обработка содержимого из внешних источников.
*   Повышена устойчивость при работе с MCP-серверами, длительными командами и большими репозиториями.
*   Улучшено корректное завершение фоновых процессов при выходе из приложения.

---

## [1.4.3] - 2026-06-12

Профессиональный аудит безопасности и стабильности перед массовым релизом.

### Безопасность
*   **XSS через имена файлов (critical):** Имена файлов из рабочей папки и тексты ошибок теперь экранируются перед вставкой в DOM. Открытие репозитория с вредоносным именем файла (`"><img onerror=...>`) больше не может выполнить произвольный код в renderer.
*   **XSS через вывод модели/файлов (critical):** Добавлен встроенный санитайзер HTML (`sanitizeHtml`) на выходе Markdown-парсера. Удаляет `<script>`, `<iframe>`, `<object>`, `<form>` и подобные теги, вырезает все `on*`-обработчики событий и блокирует `javascript:` / `data:text/html` ссылки. Prompt-injection из читаемого файла больше не приводит к исполнению скрипта. Кнопки «Выполнить»/«Копировать» в блоках кода сохранены.

### Стабильность
*   **Зависание MCP (critical):** Запросы к MCP-серверам получили таймаут 60с. При падении/закрытии сервера все ожидающие запросы корректно отклоняются (раньше шаг агента мог зависнуть навсегда + утечка памяти).
*   **Краш при гонке проектов (critical):** Устранены падения при удалении/переключении активного проекта во время генерации — `activeProject` проверяется после каждого `await` в цикле агента, инструментах и микро-агенте.
*   **Осиротевшие процессы (high):** При выходе из приложения принудительно завершаются все запущенные терминальные процессы (Windows: `taskkill /t /f`, Unix: SIGTERM). MCP-серверы на Windows теперь убиваются вместе с деревом процессов.
*   **Защита обхода файлов (high):** `read-dir` защищён от циклов симлинков (через множество канонических путей) и ограничен по глубине (25) и числу файлов (20000) — вредоносный или огромный репозиторий больше не вешает приложение.
*   **Переполнение буфера команд (high):** `exec-command` поднял `maxBuffer` до 64 МБ — команды с большим выводом (сборки, тесты) больше не падают с «maxBuffer exceeded».

### Прочее
*   **Кросс-платформенная очистка:** Временные файлы выполнения кода в чате удаляются через защищённый IPC `delete-file` (с проверкой пути) вместо `rm -f`, который не работал на Windows.
*   **Версии:** Десктоп и Rust-ядро синхронизированы на `1.4.3`.

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

### Новое
*   **Приветственный Рабочий стол воркспейса (Workspace Dashboard в чате):** Внедрен полноценный интерактивный рабочий стол в качестве приветственного сообщения чата.
    *   **Git интеграция в реальном времени:** Отображает имя текущей ветки Git и список измененных файлов с цветным кодированием статусов (Modified, Added, Deleted). Предусмотрена возможность инициализации Git-репозитория и принудительного обновления.
    *   **Недавние проекты:** В состоянии Onboarding (когда папка не открыта) выводится красивый список последних открытых папок для быстрого переключения в один клик.
    *   **Быстрые действия:** Быстрый доступ к созданию файла, системному Проводнику, терминалу и списку задач.
    *   **AI подсказки:** Карточки с готовыми типовыми запросами (проверка ошибок, README, тесты, структура), которые автоматически отправляются в чат с ассистентом.

### Исправлено
*   **Исправление кнопки Стоп:** Исправлена ошибка, из-за которой кнопка «Стоп» не останавливала выполнение цепочки шагов плана, продолжая запускать последующие шаги. Добавлен флаг-предохранитель в запуск следующего шага и обработка ручной остановки с очисткой теневой песочницы.
*   **Дизайн логов микро-агента:** Устаревший стиль логов выполнения микро-задач заменен на премиальный terminal-like бокс с моноширинным шрифтом, кастомным скроллбаром и красивыми индикаторами/бейджами для каждого типа событий (успех, ошибка, запуск инструмента, самолечение и т.д.).
*   **Совместимость с Marked v14+:** Исправлена критическая ошибка `TypeError: text.replace is not a function` при рендеринге Markdown-разметки в чате, вызванная изменением сигнатуры методов кастомного рендерера в новых версиях Marked.
*   **Обработка ошибок OpenRouter:** Добавлено понятное сообщение об ошибке при недействительном или устаревшем API-ключе (ошибка 401 Unauthorized от OpenRouter) вместо необработанного падения агента.

---

## [1.4.1] - 2026-06-11

Масштабный аудит и улучшение稳定ности. Исправлены 4 критические ошибки, 8 ошибок высокойseverity и множество.medium/low багов. Полный аудит кодовой базы с улучшениями UI/UX и безопасности.

### Новое в чате (Chat Features)
*   **Ветвление разговоров (Branching):** Новая кнопка "Ветвиться" на каждом сообщении позволяет создать новую ветку чата с историей до выбранного сообщения. Идеально для экспериментов без потери предыдущего контекста.
*   **Повторное выполнение инструментов (Tool Rerun):** Кнопка "Повторить" в аккордеоне инструментов позволяет перезапустить конкретный вызов инструмента, не перегенерируя весь ответ.
*   **Поддержка изображений:** Вставка изображений через Ctrl+V или перетаскивание (drag-and-drop) прямо в поле ввода. Изображения автоматически прикрепляются к контексту разговора.
*   **Выполнение кода в чате:** Блоки кода на JavaScript, TypeScript, Python, Shell и других языках теперь имеют кнопку "Выполнить" для быстрого запуска прямо из чата.

### Улучшения UX (User Experience)
*   **Горячие клавиши:**
    *   `Ctrl+K` — быстрый поиск по чату
    *   `Ctrl+L` — очистить чат и начать новый
    *   `Ctrl+Shift+M` — переключение между Build/Plan режимами
*   **Индикатор выполнения инструментов:** Во время стриминга отображается индикатор выполняемых инструментов для лучшей обратной связи.
*   **Управление контекстом:** Кнопка "Очистить все" для быстрого снятия всех прикрепленных файлов.
*   **Кнопки действий инструментов:** Каждый аккордеон инструмента в истории чата теперь имеет кнопки копирования результата и повторного выполнения.
*   **Улучшенная видимость сообщений:** Добавлена тонкая левая граница для сообщений AI для лучшего визуального разделения с сообщениями пользователя.
*   **Адаптивный дизайн:** На узких экранах (<720px) чат и превью теперь складываются вертикально.

### Исправления критических багов (Critical Bug Fixes)
*   **`branchFromMessage()`:** Исправлена ReferenceError — вызов несуществующей функции `renderProjects()` заменён на `renderSidebarProjects()`. Добавлены недостающие поля `code`, `updatedAt`, `scopePath` в объект Project.
*   **`setAppMode()`:** Исправлена ReferenceError при нажатии Ctrl+Shift+M — инлайн-логика вместо несуществующей функции.
*   **BASE64 изображения:** Бэкенд теперь корректно декодирует префикс `BASE64:` в обработчике `write-file` и записывает бинарные данные (ранее записывался literal текст "BASE64:...").
*   **`getMsgIndexInHistory()`:** Исправлена fuzzy-матчинг для AI-сообщений — ранее возвращал -1 из-за несовпадения DOM textContent с raw markdown.

### Исправления высокой severity (High Bug Fixes)
*   **Path traversal sandbox bypass:** Все три обработчика файлов (`read-file`, `write-file`, `check-image-size`) теперь используют `path.relative()` вместо `startsWith()` для корректной проверки containment.
*   **Дублирующиеся обработчики:** Удалены дублирующиеся обработчики для `btn-welcome-select-folder` и mode-tab кнопок, которые вызывали двойное открытие диалогов.
*   **CSS синтаксическая ошибка:** Удалены orphaned CSS-декларации после `.welcome-prompts` (строки 4507-4509).
*   **Кнопка ветвления:** Добавлен `!important` для hover-состояния кнопки branch, перезаписываемого generic `!important` правилом.
*   **Очистка temp-файлов:** `runCodeSnippet()` теперь удаляет временные файлы после выполнения.

### Исправления medium severity
*   **Streaming bubble:** Пузырь теперь корректно удаляется при ошибке во время retry (ранее оставался сломанный пузырь).
*   **Плавный скролл:** Удалён `scroll-behavior: smooth` из `.chat-messages` для устранения лагов при стриминге.
*   **Доступность (a11y):** Добавлены `role="log"`, `aria-live="polite"` для контейнера чата; `aria-label` для textarea; `role="tablist"` и `aria-selected` для mode-toggle.

---

## [1.4.0] - 2026-06-11

Этот релиз кардинально улучшает функционал чата и его дизайн, повышая надежность выполнения задач и предлагая ультра-современный пользовательский опыт.

### Новое в дизайне (UI)
*   **Плавающее поле ввода (Floating Input Card):** Поле чата превращено в эстетичную закругленную карточку, парящую над чатом. Все органы управления (выбор модели ИИ, переключение Build/Plan режимов, кнопки прикрепления и отправки) эргономично расположены внутри нее.
*   **Современные пузыри сообщений:** Сообщения пользователя получили изящные скругления и минималистичные границы. Выводы инструментов оформлены в виде аккуратных консольных логов выполнения.
*   **Интерактивный стартовый экран:** Новый, чистый дизайн приветственного экрана с удобными шагами и Monochrome-эстетикой.

### Улучшения функционала и надежности (UX)
*   **Надежный Markdown-парсер (Marked):** Устаревший регулярный парсер заменен на полноценный Marked, обеспечивающий корректное отображение таблиц, вложенных списков и сложного форматирования.
*   **Кликабельные пути к файлам:** Любые пути к файлам проекта (например, `src/main.ts` или `package.json`), упомянутые в чате или заголовках блоков кода, теперь кликабельны. Клик по ссылке мгновенно считывает файл и открывает его во вкладке «Код» справа.
*   **Авто-продолжение генерации (Anti-Truncation):** Если ответ модели обрывается из-за лимита токенов посреди кода или XML-тега инструмента, чат автоматически делает запрос на продолжение, бесшовно склеивая ответы. Это предотвращает порчу файлов недописанным кодом.
*   **Внешние ссылки:** Все веб-ссылки открываются во внешнем браузере пользователя через безопасный мост Electron.
*   **Остановка команд:** Кнопка остановки генерации теперь гарантированно прерывает любые запущенные агентом консольные команды.

---

## [1.3.9] - 2026-06-11

Этот релиз полностью перерабатывает дизайн интерфейса, отказываясь от градиентов в пользу ультра-чистого монохромного (borderless) стиля. Также включены мощные UX-улучшения главного экрана и чата.

### UI / UX Redesign
*   **Ультра-минималистичный чат:** Убраны все лишние рамки и фоны у сообщений ИИ. Сообщения пользователя стали черными пилюлями. Интерфейс выглядит как чистый текстовый документ.
*   **Скрытые границы (Borderless):** Панели разделяются только легкой разницей оттенков и тонкими разделителями.
*   **Авто-расширяемое поле ввода:** Поле чата плавно увеличивается в высоту по мере ввода длинного текста.
*   **Умный автоскролл:** Чат больше не перепрыгивает вниз, если вы просматриваете историю. Добавлена новая плавающая кнопка "Вниз".
*   **Копирование кода:** Новые стильные кнопки копирования появляются при наведении на любой блок кода.
*   **Автофокус:** Поле ввода автоматически получает фокус при открытии приложения или переключении проектов.
*   **Новый Welcome Screen:** Стартовый экран избавлен от тяжелых карточек. Добавлены подсказки горячих клавиш (`Ctrl+N`, `Ctrl+O`).


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

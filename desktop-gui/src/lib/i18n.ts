// ═══════════════════════════════════════════════════════════════
// Lightweight i18n: maps the original Russian source string -> [EN, ZH].
// Russian is the base language (keys). t(ru) returns the active-language string.
// ═══════════════════════════════════════════════════════════════

export type Lang = 'ru' | 'en' | 'zh';

// [English, 中文]
const DICT: Record<string, [string, string]> = {
  // ─── Titlebar / window ───
  'Новый проект': ['New project', '新项目'],
  'Переименовать проект': ['Rename project', '重命名项目'],
  'Свернуть': ['Minimize', '最小化'],
  'Развернуть': ['Maximize', '最大化'],
  'Закрыть': ['Close', '关闭'],

  // ─── Setup banner ───
  'Для начала работы добавьте API-ключ OpenRouter в Настройках': ['Add your OpenRouter API key in Settings to get started', '请在设置中添加 OpenRouter API 密钥以开始使用'],

  // ─── Sidebar ───
  'Новый чат': ['New chat', '新对话'],
  'Поиск чатов...': ['Search chats...', '搜索对话...'],
  'Настройки': ['Settings', '设置'],
  'Папка не выбрана': ['No folder selected', '未选择文件夹'],
  'Выбрать папку': ['Select folder', '选择文件夹'],
  'Показать в Проводнике': ['Show in Explorer', '在资源管理器中显示'],
  'Открепить папку': ['Unpin folder', '取消固定文件夹'],
  'Область работы': ['Work scope', '工作范围'],
  'например: src/web': ['e.g. src/web', '例如：src/web'],
  'Нет недавних чатов': ['No recent chats', '没有最近的对话'],
  'Переименовать': ['Rename', '重命名'],
  'Удалить': ['Delete', '删除'],

  // ─── Chat ───
  'Поиск в чате...': ['Search in chat...', '在对话中搜索...'],
  'Предыдущее': ['Previous', '上一个'],
  'Следующее': ['Next', '下一个'],
  'Закрыть (Esc)': ['Close (Esc)', '关闭 (Esc)'],
  'Копировать весь чат': ['Copy whole chat', '复制整个对话'],
  'Прокрутить вниз': ['Scroll to bottom', '滚动到底部'],
  'Генерация...': ['Generating...', '生成中...'],
  'Модель ИИ для этого чата': ['AI model for this chat', '此对话的 AI 模型'],
  'Компонент не выбран': ['No component selected', '未选择组件'],
  'Очистить выбор': ['Clear selection', '清除选择'],
  'Build — агент сразу пишет и правит код': ['Build — the agent writes and edits code right away', 'Build — 智能体直接编写和修改代码'],
  'Plan — сначала составить пошаговый план, затем собрать': ['Plan — outline steps first, then build', 'Plan — 先制定分步计划，然后构建'],
  'Закреплено:': ['Pinned:', '已固定：'],
  'Опишите, что хотите создать или исправить...': ['Describe what you want to create or fix...', '描述您想创建或修复的内容...'],
  'Опишите, что хотите спроектировать и спланировать...': ['Describe what you want to design and plan...', '描述您想设计和规划的内容...'],
  'Остановить генерацию': ['Stop generation', '停止生成'],
  'Отправить (Enter)': ['Send (Enter)', '发送 (Enter)'],
  'чтобы отправить,': ['to send,', '发送，'],
  'для новой строки': ['for a new line', '换行'],
  'Нажмите': ['Press', '按'],

  // ─── Preview tabs / toolbar ───
  'Просмотр сгенерированного HTML-приложения': ['Preview of the generated HTML app', '预览生成的 HTML 应用'],
  'Превью': ['Preview', '预览'],
  'Исходный код текущей страницы': ['Source code of the current page', '当前页面的源代码'],
  'Код': ['Code', '代码'],
  'Файлы в рабочей папке': ['Files in the working folder', '工作文件夹中的文件'],
  'Файлы': ['Files', '文件'],
  'Живой вывод терминала': ['Live terminal output', '实时终端输出'],
  'Терминал': ['Terminal', '终端'],
  'Список задач плана и прогресс выполнения': ['Plan task list and progress', '计划任务列表和进度'],
  'Задачи': ['Tasks', '任务'],
  'Визуальный тайм-тревел (Снапшоты проекта)': ['Visual time-travel (project snapshots)', '可视化时间旅行（项目快照）'],
  'Снапшоты': ['Snapshots', '快照'],
  'Ожидает подтверждения': ['Awaiting confirmation', '等待确认'],
  'Выбрать элемент (Click-to-Plan)': ['Select element (Click-to-Plan)', '选择元素 (Click-to-Plan)'],
  'Инспект': ['Inspect', '检查'],
  'Десктоп': ['Desktop', '桌面'],
  'Планшет': ['Tablet', '平板'],
  'Телефон': ['Phone', '手机'],
  'Скачать HTML': ['Download HTML', '下载 HTML'],
  'Скачать': ['Download', '下载'],

  // ─── Welcome state ───
  'Что вы хотите создать?': ['What do you want to create?', '您想创建什么？'],
  'Опишите вашу идею в чате — ИИ-агент мгновенно превратит её в работающее приложение.': ['Describe your idea in the chat — the AI agent will instantly turn it into a working app.', '在对话中描述您的想法 — AI 智能体会立即将其变成可运行的应用。'],
  'Выбрать рабочую папку': ['Select working folder', '选择工作文件夹'],
  'Калькулятор': ['Calculator', '计算器'],
  'Лендинг': ['Landing page', '落地页'],
  'Канбан': ['Kanban', '看板'],
  'Часы': ['Clock', '时钟'],
  'Погода': ['Weather', '天气'],
  'Портфолио': ['Portfolio', '作品集'],

  // ─── Code / files / terminal / tasks / snapshots panels ───
  'Просмотр кода': ['Code view', '代码视图'],
  'Копировать': ['Copy', '复制'],
  'Проводник': ['Explorer', '资源管理器'],
  'Обновить': ['Refresh', '刷新'],
  'Не выбрана': ['Not selected', '未选择'],
  'Очистить': ['Clear', '清除'],
  'Здесь появляется живой вывод команд, которые запускает агент.': ['Live output of commands the agent runs appears here.', '智能体运行的命令的实时输出会显示在这里。'],
  'Визуальный тайм-тревел (Снапшоты)': ['Visual time-travel (Snapshots)', '可视化时间旅行（快照）'],
  'Создать веху': ['Create checkpoint', '创建检查点'],

  // ─── Settings nav ───
  'Приложение': ['Application', '应用'],
  'Основные': ['General', '常规'],
  'Внешний вид': ['Appearance', '外观'],
  'Горячие клавиши': ['Hotkeys', '快捷键'],
  'Разрешения': ['Permissions', '权限'],
  'Сервер': ['Server', '服务器'],
  'Провайдер': ['Provider', '提供商'],
  'Модели': ['Models', '模型'],
  'Интеллект Ассистента': ['Assistant Intelligence', '助手智能'],
  'Профиль и Навыки': ['Profile & Skills', '配置文件与技能'],
  'Информация': ['Information', '信息'],
  'О программе': ['About', '关于'],
  'Назад': ['Back', '返回'],
  'Сохранить и закрыть': ['Save & close', '保存并关闭'],

  // ─── Settings: General ───
  'Показывать примеры на стартовом экране': ['Show examples on the start screen', '在起始界面显示示例'],
  'Отображать карточки с примерами проектов на приветственном экране': ['Show example project cards on the welcome screen', '在欢迎界面显示示例项目卡片'],
  'Индикатор генерации': ['Generation indicator', '生成指示器'],
  'Показывать анимированный индикатор вверху, когда агент работает': ['Show an animated indicator at the top while the agent works', '智能体工作时在顶部显示动画指示器'],
  'Авто-чекпоинты перед изменениями': ['Auto checkpoints before changes', '更改前自动检查点'],
  'Перед каждым запросом агента автоматически сохранять состояние файлов, чтобы можно было откатиться через вкладку «Снапшоты»': ['Automatically save file state before each agent request so you can roll back via the “Snapshots” tab', '在每次智能体请求前自动保存文件状态，以便通过"快照"标签回滚'],
  'Звуковые уведомления': ['Sound notifications', '声音通知'],
  'Воспроизводить звук, когда агент завершил генерацию': ['Play a sound when the agent finishes generating', '智能体完成生成时播放声音'],
  'Сворачивать в трей при закрытии': ['Minimize to tray on close', '关闭时最小化到系统托盘'],
  'При закрытии окна приложение будет прятаться в системный трей вместо завершения работы': ['When closing the window, the app will hide in the system tray instead of exiting', '关闭窗口时，应用将隐藏在系统托盘中而不是退出'],
  'Закрепить модель': ['Pin model', '固定模型'],
  'В окно': ['To window', '到新窗口'],
  'Открыть превью в отдельном окне': ['Open preview in a separate window', '在单独的窗口中打开预览'],
  'Экспортировать чат в Markdown': ['Export chat to Markdown', '导出对话到 Markdown'],

  // ─── Settings: Appearance ───
  'Цветовая схема': ['Color scheme', '配色方案'],
  'Выберите светлую или тёмную тему': ['Choose a light or dark theme', '选择浅色或深色主题'],
  'Светлая': ['Light', '浅色'],
  'Тёмная': ['Dark', '深色'],
  'Системная': ['System', '系统'],
  'Шрифт интерфейса': ['Interface font', '界面字体'],
  'Настройте шрифт, используемый во всём интерфейсе': ['Set the font used across the interface', '设置整个界面使用的字体'],
  'Шрифт кода': ['Code font', '代码字体'],
  'Настройте шрифт, используемый в блоках кода': ['Set the font used in code blocks', '设置代码块使用的字体'],
  'Размер шрифта': ['Font size', '字体大小'],
  'Размер текста в интерфейсе': ['Text size in the interface', '界面中的文本大小'],
  'Язык': ['Language', '语言'],
  'Язык интерфейса приложения': ['Application interface language', '应用界面语言'],

  // ─── Settings: Hotkeys ───
  'Отправить сообщение': ['Send message', '发送消息'],
  'Отправить текущее сообщение агенту': ['Send the current message to the agent', '将当前消息发送给智能体'],
  'Новая строка': ['New line', '换行'],
  'Перенос строки в поле ввода': ['Line break in the input field', '输入框中换行'],
  'Создать новый проект': ['Create a new project', '创建新项目'],
  'Открыть страницу настроек': ['Open the settings page', '打开设置页面'],

  // ─── Settings: Permissions ───
  'Разрешения и безопасность': ['Permissions & security', '权限与安全'],
  'Настройте права доступа ИИ-агента к вашему компьютеру. Это гарантирует безопасность при работе с кодом и запуске команд.': ['Configure the AI agent\u2019s access to your computer. This keeps working with code and running commands safe.', '配置 AI 智能体对您计算机的访问权限。这可确保处理代码和运行命令时的安全。'],
  'Ограничить файлы рабочей папкой (Песочница)': ['Restrict files to the working folder (Sandbox)', '将文件限制在工作文件夹内（沙箱）'],
  'Агент сможет читать и писать файлы ТОЛЬКО внутри выбранной рабочей папки (Рекомендуется)': ['The agent can read and write files ONLY inside the selected working folder (Recommended)', '智能体只能在所选工作文件夹内读写文件（推荐）'],
  'Чтение файлов': ['Reading files', '读取文件'],
  'Разрешить агенту читать файлы на вашем компьютере': ['Allow the agent to read files on your computer', '允许智能体读取您计算机上的文件'],
  'Всегда разрешать': ['Always allow', '始终允许'],
  'Запрашивать разрешение': ['Ask for permission', '请求权限'],
  'Запись файлов и Авто-Ревью': ['Writing files & auto-review', '写入文件与自动审查'],
  'Настройка записи файлов агентом. Авто-Ревью показывает разницу (diff) перед записью.': ['How the agent writes files. Auto-review shows a diff before writing.', '智能体如何写入文件。自动审查会在写入前显示差异。'],
  'Спрашивать с Ревью диффа': ['Ask with diff review', '通过差异审查询问'],
  'Всегда записывать без спроса': ['Always write without asking', '始终写入而不询问'],
  'Просто запрашивать согласие': ['Just ask for consent', '仅请求同意'],
  'Запретить запись': ['Forbid writing', '禁止写入'],
  'Запуск терминальных команд': ['Running terminal commands', '运行终端命令'],
  'Выполнение команд в терминале компьютера': ['Executing commands in the computer terminal', '在计算机终端执行命令'],
  'Спрашивать перед запуском': ['Ask before running', '运行前询问'],
  'Запретить выполнение': ['Forbid execution', '禁止执行'],

  // ─── Settings: Provider / Models ───
  'Провайдер моделей': ['Model Provider', '模型提供商'],
  'Выберите между OpenRouter и Ollama': ['Choose between OpenRouter and Ollama', '在 OpenRouter 和 Ollama 之间选择'],
  'Адрес Ollama API': ['Ollama API URL', 'Ollama API 地址'],
  'Обычно Ollama работает локально на http://localhost:11434': ['Usually Ollama runs locally on http://localhost:11434', '通常 Ollama 在本地 http://localhost:11434 运行'],
  'Умные авто-коммиты (Git)': ['Smart Auto-Commits (Git)', '智能自动提交 (Git)'],
  'Автоматически создавать Git-коммит после успешного выполнения каждого шага плана': ['Automatically create Git commit after successful execution of each plan step', '每个计划步骤成功执行后自动创建 Git 提交'],
  'Выберите провайдера моделей ИИ для генерации кода. Вы можете использовать облачный сервис OpenRouter или локальный Ollama для оффлайн-работы.': ['Choose the AI model provider for code generation. You can use OpenRouter cloud service or local Ollama for offline work.', '选择用于代码生成的 AI 模型提供商。您可以使用 OpenRouter 云服务或本地 Ollama 进行离线工作。'],
  'MCP Серверы': ['MCP Servers', 'MCP 服务器'],
  'Интеграция внешних инструментов через Model Context Protocol (MCP) по протоколу stdio.': ['Integration of external tools via Model Context Protocol (MCP) over stdio.', '通过 stdio 上的 Model Context Protocol (MCP) 集成外部工具。'],
  'Список настроенных MCP-серверов': ['List of configured MCP servers', '已配置的 MCP 服务器列表'],
  'Эти серверы запускаются вместе с IDE и предоставляют дополнительные инструменты.': ['These servers start with the IDE and provide additional tools.', '这些服务器随 IDE 一起启动并提供附加工具。'],
  'Добавить сервер': ['Add server', '添加服务器'],
  'Новый MCP сервер': ['New MCP server', '新建 MCP 服务器'],
  'Редактировать MCP сервер': ['Edit MCP server', '编辑 MCP 服务器'],
  'Введите имя сервера': ['Enter server name', '输入服务器名称'],
  'Введите команду для запуска': ['Enter command to run', '输入运行命令'],
  'Сервер с таким именем уже существует': ['A server with this name already exists', '同名服务器已存在'],
  'Удаление MCP сервера': ['Delete MCP Server', '删除 MCP 服务器'],
  'Список MCP серверов пуст.': ['MCP servers list is empty.', 'MCP 服务器列表为空。'],
  'Ошибка обновления': ['Update error', '更新错误'],
  'Имя сервера': ['Server Name', '服务器名称'],
  'Активен': ['Active', '启用'],
  'Команда': ['Command', '命令'],
  'Аргументы (по одному на строку)': ['Arguments (one per line)', '参数 (每行一个)'],
  'Переменные окружения (KEY=VALUE, по одной на строку)': ['Environment Variables (KEY=VALUE, one per line)', '环境变量 (KEY=VALUE, 每行一个)'],
  'Ввод для терминала (stdin)...': ['Input for terminal (stdin)...', '输入终端 (stdin)...'],
  'Отправить': ['Send', '发送'],
  'Сравнение изменений': ['Compare Changes', '比较更改'],
  'Оригинал (Original)': ['Original', '原始'],
  'Изменено (Modified)': ['Modified', '修改后'],
  'Сравнить Side-by-Side': ['Compare Side-by-Side', '并排比较'],
  'Генерирую коммит для шага:': ['Generating commit for step:', '正在生成步骤的提交：'],
  'Авто-коммит успешно создан:': ['Auto-commit successfully created:', '自动提交成功创建：'],
  'Не удалось создать коммит:': ['Failed to create commit:', '无法创建提交：'],
  'API-ключ OpenRouter': ['OpenRouter API key', 'OpenRouter API 密钥'],
  'Ваш ключ хранится локально и никуда не передаётся кроме OpenRouter': ['Your key is stored locally and sent only to OpenRouter', '您的密钥存储在本地，仅发送至 OpenRouter'],
  'Статус подключения': ['Connection status', '连接状态'],
  'Не подключен': ['Not connected', '未连接'],
  'Проверить': ['Test', '测试'],
  'Выберите модель ИИ для генерации кода. Модели загружаются автоматически из OpenRouter после ввода API-ключа.': ['Choose the AI model for code generation. Models load automatically from OpenRouter once the API key is entered.', '选择用于代码生成的 AI 模型。输入 API 密钥后将自动从 OpenRouter 加载模型。'],
  'Модель по умолчанию': ['Default model', '默认模型'],
  'Введите API-ключ для загрузки моделей': ['Enter an API key to load models', '输入 API 密钥以加载模型'],
  'Сначала введите API-ключ...': ['Enter an API key first...', '请先输入 API 密钥...'],
  'Обновить список моделей': ['Refresh model list', '刷新模型列表'],
  'Перезагрузить доступные модели с OpenRouter': ['Reload available models from OpenRouter', '从 OpenRouter 重新加载可用模型'],
  'Креативность (temperature)': ['Creativity (temperature)', '创造力 (temperature)'],
  'Ниже — точнее и предсказуемее, выше — креативнее. Для кода рекомендуется 0.1–0.3.': ['Lower = more precise and predictable, higher = more creative. For code, 0.1–0.3 is recommended.', '越低越精确可预测，越高越有创意。代码推荐 0.1–0.3。'],
  'Максимум токенов ответа': ['Max response tokens', '最大响应 token 数'],
  'Ограничение длины одного ответа модели. Больше — длиннее ответы, выше расход.': ['Limits the length of one model response. Higher = longer answers and more usage.', '限制单个模型响应的长度。越高回答越长，消耗越多。'],

  // ─── Settings: Profile ───
  'Ассистент анализирует ваше поведение, запоминает ваши предпочтения в коде и создаёт новые навыки на основе рефлексии завершенных проектов.': ['The assistant analyzes your behavior, remembers your code preferences, and creates new skills by reflecting on completed projects.', '助手分析您的行为，记住您的代码偏好，并通过对已完成项目的反思创建新技能。'],
  'Модель пользователя (User Modeling)': ['User model (User Modeling)', '用户模型 (User Modeling)'],
  'Предпочитаемый стиль кода': ['Preferred code style', '首选代码风格'],
  'Например: Функциональный React, отступы 2 пробела, чистый код без лишних комментариев...': ['e.g. Functional React, 2-space indent, clean code without extra comments...', '例如：函数式 React，2 空格缩进，无多余注释的简洁代码...'],
  'Ассистент обновляет этот профиль автоматически на основе ваших сообщений. Вы можете изменить его вручную.': ['The assistant updates this profile automatically based on your messages. You can edit it manually.', '助手根据您的消息自动更新此配置文件。您可以手动编辑。'],
  'Используемые библиотеки и фреймворки': ['Libraries and frameworks used', '使用的库和框架'],
  'Например: react, tailwindcss, typescript, sqlite': ['e.g. react, tailwindcss, typescript, sqlite', '例如：react, tailwindcss, typescript, sqlite'],
  'Список библиотек через запятую, которые агент будет предпочитать при разработке.': ['Comma-separated list of libraries the agent will prefer.', '智能体将优先使用的库列表（逗号分隔）。'],
  'Дополнительные примечания': ['Additional notes', '附加说明'],
  'Например: Писать комментарии к коду исключительно на русском языке...': ['e.g. Write code comments only in English...', '例如：仅用中文编写代码注释...'],
  'Самописные навыки (Self-Evolving Skills)': ['Self-evolving skills', '自进化技能'],
  'Список навыков, которые агент автоматически сформулировал в фазах рефлексии после успешного выполнения планов.': ['Skills the agent formulated automatically during reflection after completing plans.', '智能体在完成计划后的反思阶段自动制定的技能列表。'],
  'Системный промпт': ['System prompt', '系统提示词'],
  'Дополнительные правила, которые будут добавлены к стандартному системному промпту агента (для всех режимов). Оставьте пустым, чтобы использовать поведение по умолчанию.': ['Additional rules to be appended to the agent\'s default system prompt (applies to all modes). Leave empty for default behavior.', '将附加到智能体默认系统提示词中的附加规则 (适用于所有模式)。留空以使用默认行为。'],
  'Например: Всегда добавляй комментарии Doxygen к публичным функциям. Не используй React, предпочитай ванильный TypeScript...': ['e.g. Always add Doxygen comments to public functions. Do not use React, prefer vanilla TypeScript...', '例如：始终向公共函数添加 Doxygen 注释。不要使用 React，首选原生 TypeScript...'],

  // ─── Settings: About ───
  '7/24 IDE — создание приложений с помощью ИИ-агента. Просто опишите — и агент построит.': ['7/24 IDE — build apps with an AI agent. Just describe it and the agent builds it.', '7/24 IDE — 用 AI 智能体构建应用。只需描述，智能体即可构建。'],
  'Очистить все данные': ['Clear all data', '清除所有数据'],
  'Удалить все проекты, историю чатов и настройки': ['Delete all projects, chat history and settings', '删除所有项目、对话历史和设置'],

  // ─── Dynamic: welcome chat message ───
  'Здравствуйте! Я — ИИ-агент 7/24 IDE.': ['Hello! I\u2019m the 7/24 IDE AI agent.', '您好！我是 7/24 IDE 的 AI 智能体。'],
  'Выберите рабочую папку': ['Select a working folder', '选择工作文件夹'],
  'Нажмите «Открыть» в боковой панели слева, чтобы выбрать папку проекта.': ['Click “Open” in the left sidebar to choose a project folder.', '点击左侧边栏的"打开"选择项目文件夹。'],
  'Добавьте API-ключ': ['Add an API key', '添加 API 密钥'],
  'Нажмите «Настройки» и введите свой ключ OpenRouter для доступа к моделям.': ['Open “Settings” and enter your OpenRouter key to access models.', '打开"设置"并输入您的 OpenRouter 密钥以访问模型。'],
  'Опишите задачу': ['Describe the task', '描述任务'],
  'Напишите, что нужно создать — я прочитаю файлы, напишу код и покажу результат.': ['Tell me what to build — I\u2019ll read files, write code and show the result.', '告诉我要构建什么 — 我会读取文件、编写代码并展示结果。'],

  // ─── Dynamic: confirm dialogs & actions ───
  'Подтверждение': ['Confirm', '确认'],
  'Отмена': ['Cancel', '取消'],
  'Подтвердить': ['Confirm', '确认'],
  'Удалить этот чат?': ['Delete this chat?', '删除此对话？'],
  'Удаление чата': ['Delete chat', '删除对话'],
  'Открепить рабочую папку от этого проекта?': ['Unpin the working folder from this project?', '从此项目取消固定工作文件夹？'],
  'Открепление папки': ['Unpin folder', '取消固定文件夹'],
  'Вы уверены? Все проекты, чаты и настройки будут удалены!': ['Are you sure? All projects, chats and settings will be deleted!', '确定吗？所有项目、对话和设置都将被删除！'],
  'Удаление снапшота': ['Delete snapshot', '删除快照'],
  'Удалить этот снапшот?': ['Delete this snapshot?', '删除此快照？'],
  'Откат снапшота': ['Restore snapshot', '恢复快照'],
  'Вы уверены, что хотите откатиться к этому снапшоту? Текущие несохраненные изменения будут перезаписаны.': ['Restore this snapshot? Current unsaved changes will be overwritten.', '恢复此快照？当前未保存的更改将被覆盖。'],

  // ─── Dynamic: agent actions / messages ───
  'Сгенерировать заново': ['Regenerate', '重新生成'],
  'Редактировать сообщение': ['Edit message', '编辑消息'],
  'Редактировать': ['Edit', '编辑'],
  'Думаю над задачей...': ['Thinking about the task...', '正在思考任务...'],
  'Связь прервана': ['Connection lost', '连接已断开'],
  'Продолжить': ['Continue', '继续'],

  // ─── Dynamic: tasks panel ───
  'Задач пока нет.': ['No tasks yet.', '暂无任务。'],
  'Переключитесь в режим Plan, опишите задачу — агент составит план, и шаги появятся здесь с отслеживанием прогресса.': ['Switch to Plan mode and describe a task — the agent will build a plan and the steps will appear here with progress tracking.', '切换到 Plan 模式并描述任务 — 智能体会制定计划，步骤将显示在此处并跟踪进度。'],

  // ─── Dynamic: system messages ───
  '📂 Рабочая папка установлена': ['📂 Working folder set', '📂 已设置工作文件夹'],
  'План утверждён. Перехожу в режим разработки. Прогресс — на вкладке «Задачи».': ['Plan approved. Switching to build mode. Progress is on the “Tasks” tab.', '计划已批准。正在切换到构建模式。进度在"任务"标签中。'],
  '🎉 Сборка завершена! Все шаги плана успешно выполнены.': ['🎉 Build complete! All plan steps finished successfully.', '🎉 构建完成！所有计划步骤已成功完成。'],
  '⚠️ Выберите модель в Настройках → Модели.': ['⚠️ Select a model in Settings → Models.', '⚠️ 请在设置 → 模型中选择模型。'],
  '📂 Рабочая папка не выбрана. Агент не сможет читать и сохранять файлы. Нажмите «Открыть» внизу боковой панели слева, чтобы выбрать папку.': ['📂 No working folder selected. The agent cannot read or save files. Click “Open” at the bottom of the left sidebar to choose a folder.', '📂 未选择工作文件夹。智能体无法读取或保存文件。点击左侧边栏底部的"打开"选择文件夹。'],
  '⚠️ Достигнут лимит автономной сессии (20 шагов). Для продолжения отправьте новое сообщение.': ['⚠️ Autonomous session limit reached (20 steps). Send a new message to continue.', '⚠️ 已达到自主会话上限（20 步）。发送新消息以继续。'],
  '🗑️ Рабочая папка откреплена от проекта.': ['🗑️ Working folder unpinned from the project.', '🗑️ 已从项目取消固定工作文件夹。'],
  '📋 Чат скопирован в буфер обмена.': ['📋 Chat copied to clipboard.', '📋 对话已复制到剪贴板。'],
  '❌ Не удалось скопировать чат.': ['❌ Failed to copy the chat.', '❌ 复制对话失败。'],
  '⚠️ Не удалось создать снапшот: нет файлов для сохранения.': ['⚠️ Could not create snapshot: no files to save.', '⚠️ 无法创建快照：没有可保存的文件。'],
  'Область работы установлена': ['Work scope set', '已设置工作范围'],
  'весь проект': ['whole project', '整个项目'],
  'Выбран элемент': ['Element selected', '已选择元素'],
  'Контекст этого элемента будет добавлен к вашему следующему сообщению. Опишите в чате, что хотите изменить.': ['This element\u2019s context will be added to your next message. Describe in the chat what you want to change.', '此元素的上下文将添加到您的下一条消息。请在对话中描述您想更改的内容。'],
  'Снапшот создан': ['Snapshot created', '已创建快照'],
  'Откат к снапшоту выполнен': ['Rolled back to snapshot', '已回滚到快照'],

  // ─── Dynamic: permission & diff cards ───
  'Безопасность': ['Security', '安全'],
  'Запрос разрешения': ['Permission request', '权限请求'],
  'Разрешить агенту следующее действие?': ['Allow the agent the following action?', '允许智能体执行以下操作？'],
  'Запретить': ['Deny', '拒绝'],
  'Разрешить': ['Allow', '允许'],
  'Разрешено': ['Allowed', '已允许'],
  'Запрещено': ['Denied', '已拒绝'],
  'Авто-Ревью изменений': ['Auto-review of changes', '更改自动审查'],
  'Авто-Ревью': ['Auto-review', '自动审查'],
  'Отклонить': ['Reject', '拒绝'],
  'Записать код': ['Write code', '写入代码'],
  'Приняты изменения в файле': ['Changes accepted in file', '已接受文件中的更改'],
  'Отклонены изменения в файле': ['Changes rejected in file', '已拒绝文件中的更改'],

  // ─── Dynamic: plan widget & router ───
  'План разработки': ['Development plan', '开发计划'],
  'План разработки проекта': ['Project development plan', '项目开发计划'],
  'Добавить новый шаг к плану': ['Add a new step to the plan', '向计划添加新步骤'],
  'Добавить шаг': ['Add step', '添加步骤'],
  'Начать сборку': ['🚀 Start build', '🚀 开始构建'],
  'Ассистент': ['Assistant', '助手'],
  'Рекомендуется планирование': ['Planning recommended', '建议先规划'],
  'Похоже, вы хотите создать проект с нуля. Для сложных задач удобнее сначала составить пошаговый план в режиме Plan. Либо можно сразу приступить к разработке.': ['It looks like you want to build a project from scratch. For complex tasks it\u2019s easier to outline a step-by-step plan in Plan mode first. Or you can start building right away.', '看起来您想从头构建一个项目。对于复杂任务，最好先在 Plan 模式中制定分步计划。或者您可以立即开始构建。'],
  'Спланировать (Plan)': ['Plan it (Plan)', '制定计划 (Plan)'],
  'Сразу собрать (Build)': ['Build now (Build)', '立即构建 (Build)'],

  // ─── Static: welcome folder prompt ───
  '⚠️ Для работы ИИ-агента необходимо выбрать рабочую папку на вашем компьютере:': ['⚠️ The AI agent needs a working folder on your computer to operate:', '⚠️ AI 智能体需要您计算机上的工作文件夹才能运行：'],

  // ─── Dynamic: models & files panels ───
  'Загрузка моделей...': ['Loading models...', '正在加载模型...'],
  'Загружено моделей': ['Models loaded', '已加载模型'],
  'Модели не найдены': ['No models found', '未找到模型'],
  'Рабочая папка не выбрана. Нажмите «Открыть» в боковой панели.': ['No working folder selected. Click “Open” in the sidebar.', '未选择工作文件夹。点击侧边栏中的"打开"。'],
  'Папка пуста. Агент может создать файлы.': ['The folder is empty. The agent can create files.', '文件夹为空。智能体可以创建文件。'],

  // ─── Misc dynamic strings ───
  'сейчас': ['now', '刚刚'],
  'печатает...': ['typing...', '正在输入...'],
  'запрос': ['request', '请求'],
  'всего': ['total', '总计'],
  'Последний запрос': ['Last request', '上次请求'],
  'Всего за сессию': ['Session total', '会话总计'],
  'Проверяем...': ['Checking...', '正在检查...'],
  'Введите API-ключ': ['Enter an API key', '请输入 API 密钥'],
  '✅ Подключено! Модели доступны.': ['✅ Connected! Models are available.', '✅ 已连接！模型可用。'],
  'Ошибка': ['Error', '错误'],
  'Поиск модели...': ['Search model...', '搜索模型...'],
  'Удалить навык': ['Delete skill', '删除技能'],
  'Удаление навыка': ['Delete skill', '删除技能'],
  'Список навыков пуст. Выполните план в режиме Plan или завершите Build-сессию с изменением файлов — ассистент проведёт рефлексию и создаст навык.': ['No skills yet. Run a plan in Plan mode or finish a Build session that changes files — the assistant will reflect and create a skill.', '暂无技能。在 Plan 模式运行计划或完成更改文件的 Build 会话 — 助手会进行反思并创建技能。'],

  // ─── Snapshots ───
  'Создать снапшот': ['Create snapshot', '创建快照'],
  'Название': ['Name', '名称'],
  'Например: Перед рефакторингом': ['e.g. Before refactoring', '例如：重构之前'],
  'Веха от': ['Checkpoint', '检查点'],
  'Описание (необязательно)': ['Description (optional)', '描述（可选）'],
  'Краткое описание состояния...': ['Brief description of the state...', '状态的简要描述...'],
  'Снапшотов пока нет.': ['No snapshots yet.', '暂无快照。'],
  'Нажмите «Создать веху», чтобы зафиксировать рабочую версию.': ['Click “Create checkpoint” to capture a working version.', '点击"创建检查点"以保存工作版本。'],
  'Применить': ['Apply', '应用'],

  // ─── Self-healing / micro-agent / critic / reflection ───
  'Ошибка сборки на шаге': ['Build error at step', '构建错误于步骤'],
  'Исправить автоматически': ['Fix automatically', '自动修复'],
  'Перестроить план': ['Rebuild plan', '重建计划'],
  'Микро-агент': ['Micro-agent', '微智能体'],
  'Микро-агент успешно завершил работу. Изменения из теневой песочницы влиты в основной проект.': ['Micro-agent finished successfully. Changes from the shadow sandbox were merged into the main project.', '微智能体成功完成。影子沙箱中的更改已合并到主项目。'],
  'Микро-агент завершился с ошибкой. Изменения в теневой песочнице сброшены.': ['Micro-agent failed. Changes in the shadow sandbox were discarded.', '微智能体失败。影子沙箱中的更改已丢弃。'],
  'Проверка планов Агентом-Критиком...': ['Critic agent reviewing the plan...', '评审智能体正在审查计划...'],
  'Агент-Критик: Ревью плана': ['Critic agent: plan review', '评审智能体：计划审查'],
  'Агент-Критик: Ошибка проверки': ['Critic agent: review error', '评审智能体：审查错误'],
  'Введите описание нового шага:': ['Enter a description for the new step:', '输入新步骤的描述：'],
  '🧠 Запущена фаза рефлексии: выделение и формулирование нового навыка...': ['🧠 Reflection phase started: extracting and formulating a new skill...', '🧠 已启动反思阶段：提取并制定新技能...'],
  'Рефлексия завершена: сформирован навык': ['Reflection complete: skill created', '反思完成：已创建技能'],
  'Рефлексия завершена. Подходящий навык не обнаружен.': ['Reflection complete. No suitable skill found.', '反思完成。未发现合适的技能。'],

  // ─── Provider section intro (static) ───
  'Для работы приложения необходим API-ключ. Зарегистрируйтесь на': ['The app requires an API key. Sign up at', '应用需要 API 密钥。请在以下网址注册'],
  '— это единый шлюз ко всем моделям ИИ (GPT-4o, Claude, Gemini, Llama и другие).': ['— a single gateway to all AI models (GPT-4o, Claude, Gemini, Llama and more).', '— 通往所有 AI 模型的统一网关（GPT-4o、Claude、Gemini、Llama 等）。'],

  // ─── Fallback model & context ───
  'Резервная модель': ['Fallback model', '备用模型'],
  'Если основная модель недоступна, агент попробует выполнить шаг через эту модель.': ['If the primary model is unavailable, the agent will retry through this model.', '如果主模型不可用，智能体将通过此模型重试。'],
  'нет': ['none', '无'],
  'Переключаюсь на резервную модель': ['Switching to fallback model', '正在切换到备用模型'],
  '📂 Сначала выберите рабочую папку, чтобы прикрепить файлы.': ['📂 Select a working folder first to attach files.', '📂 请先选择工作文件夹以附加文件。'],
  '⚠️ Часть файлов вне рабочей папки и пропущена.': ['⚠️ Some files are outside the working folder and were skipped.', '⚠️ 部分文件在工作文件夹之外，已被跳过。'],

  // ─── Auto-refresh of model catalogue ───
  'Каталог моделей обновлён': ['Model catalogue updated', '模型目录已更新'],
  'новых': ['new', '新增'],
  'убрано': ['removed', '已移除'],
  'изменили цены': ['price changes', '价格变动'],
  'обновлено': ['updated', '已更新'],
  'Модель': ['Model', '模型'],
  'больше недоступна у провайдера. Переключаюсь на': ['is no longer available at the provider. Switching to', '在提供商处不再可用。正在切换到'],

  // ─── Auto-updater banner ───
  'Доступно обновление': ['Update available', '有可用更新'],
  'Скачивание обновления...': ['Downloading update...', '正在下载更新...'],
  'Скачивание обновления': ['Downloading update', '正在下载更新'],
  'Обновление готово к установке': ['Update ready to install', '更新已准备好安装'],
  'Перезапустить и установить': ['Restart and install', '重启并安装'],

  // ─── v1.2.2 Refinements ───
  'Остановить': ['Stop', '停止'],
  'Спрашивать подтверждение перед коммитом': ['Verify commit before committing', '提交前询问确认'],
  'Автоматически запрашивать подтверждение и редактирование сообщения коммита': ['Automatically request verification and editing of the commit message', '自动请求验证和编辑提交消息'],
  'Префикс сообщения коммита:': ['Commit message prefix:', '提交信息前缀：'],
  'Закоммитить': ['Commit', '提交'],
  'Пропустить': ['Skip', '跳过'],
  'Отредактируйте сообщение коммита': ['Edit commit message', '编辑提交信息'],
  'Запрос подтверждения коммита': ['Commit confirmation request', '提交确认请求'],
  'Размер контекста Ollama:': ['Ollama context size:', 'Ollama 上下文大小：'],
  'Лимит длины контекста для запросов к Ollama (num_ctx). По умолчанию 4096.': ['Context length limit for Ollama requests (num_ctx). Default is 4096.', 'Ollama 请求的上下文长度限制 (num_ctx)。默认为 4096。'],
  'Сигнал завершения отправлен пользователем': ['Termination signal sent by user', '用户发送了终止/中断信号'],
  'Авто-коммит пропущен': ['Auto-commit skipped', '已跳过自动提交'],
  'Создаю коммит...': ['Creating commit...', '正在创建提交...'],
  '7/24 IDE — автономный локальный ИИ-ассистент разработчика. Автоматически читает файлы, вносит изменения, запускает сборку и тестирует приложения в реальном времени.': ['7/24 IDE is an autonomous local AI developer assistant. It automatically reads files, writes code, runs builds, and tests applications in real time.', '7/24 IDE 是一个自主的本地 AI 开发助手。它会自动读取文件、编写代码、运行构建并在实时中测试应用。'],
  'Ключевые возможности:': ['Key features:', '核心功能：'],
  'Поддержка автономной работы через Ollama (полностью оффлайн)': ['Offline support via Ollama (fully offline)', '通过 Ollama 支持离线工作（完全离线）'],
  'Расширение инструментов через протокол MCP': ['Tool extensions via MCP protocol', '通过 MCP 协议扩展工具'],
  'Автоматические чекпоинты и возврат состояния в один клик': ['Automatic checkpoints and one-click rollback', '自动检查点和一键回滚'],
  'Интерактивный терминал с вводом stdin и отменой команд': ['Interactive terminal with stdin input and process cancellation', '带有 stdin 输入和进程取消的交互式终端'],
  'Умные авто-коммиты в Git с AI-описанием изменений': ['Smart Git auto-commits with AI-generated descriptions', '带有 AI 生成描述的智能 Git 自动提交'],
  'Myers-LCS сравнение исходного и измененного кода с подсветкой': ['Myers-LCS code comparison with syntax highlighting', '带有语法高亮显示的 Myers-LCS 代码对比'],
};

let currentLang: Lang = 'ru';

export function setLang(lang: Lang) {
  currentLang = lang;
}

export function getLang(): Lang {
  return currentLang;
}

export function t(ru: string): string {
  if (currentLang === 'ru') return ru;
  const entry = DICT[ru];
  if (!entry) return ru;
  return currentLang === 'en' ? entry[0] : entry[1];
}

// IDs / selectors of containers whose text is dynamic and must NOT be auto-translated
const SKIP_IDS = new Set(['chat-messages', 'code-display', 'terminal-output', 'preview-iframe', 'tasks-list', 'snapshots-list', 'files-list', 'sidebar-projects-list', 'profile-skills-list', 'chat-model-select', 's-model']);

function shouldSkip(node: Node): boolean {
  let el: HTMLElement | null = (node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement);
  while (el) {
    if (el.id && SKIP_IDS.has(el.id)) return true;
    const tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'CODE' || tag === 'PRE' || tag === 'IFRAME') return true;
    el = el.parentElement;
  }
  return false;
}

// Translate the static DOM in place. Russian source text is the lookup key.
export function translateDOM(root: HTMLElement = document.body) {
  // 1. Text nodes
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const node of nodes) {
    if (shouldSkip(node)) continue;
    const raw = node.textContent || '';
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const translated = t(trimmed);
    if (translated !== trimmed) {
      node.textContent = raw.replace(trimmed, translated);
    }
  }
  // 2. Attributes: title, placeholder, aria-label
  const attrEls = root.querySelectorAll('[title],[placeholder],[aria-label]');
  attrEls.forEach((el) => {
    for (const attr of ['title', 'placeholder', 'aria-label']) {
      const val = el.getAttribute(attr);
      if (val) {
        const tr = t(val.trim());
        if (tr !== val.trim()) el.setAttribute(attr, tr);
      }
    }
  });
}

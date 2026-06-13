// ═══════════════════════════════════════════════════════════════
// 7/24 IDE — Renderer Process
// Desktop Agentic Integration + Left Sidebar Layout + Skills + Token Optimizer
// ═══════════════════════════════════════════════════════════════

import { compressCodeContext, checkBalancedBrackets } from './lib/codeUtils';
import { t, setLang, translateDOM, Lang } from './lib/i18n';
import { TOOL_SCHEMAS } from './lib/toolSchemas';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { marked } from 'marked';

declare global {
  interface Window {
    electronAPI: {
      selectFolder: () => Promise<string | null>;
      readDir: (workspacePath: string) => Promise<{ path: string; isDir: boolean; size: number }[]>;
      readFile: (filePath: string, workspacePath: string, sandbox: boolean) => Promise<string>;
      writeFile: (filePath: string, content: string, workspacePath: string, sandbox: boolean) => Promise<boolean>;
      deleteFile: (filePath: string, workspacePath: string) => Promise<boolean>;
      getAppVersion: () => Promise<string>;
      openExternal: (url: string) => Promise<boolean>;
      executeCommand: (command: string, workspacePath: string) => Promise<{ code: number; stdout: string; stderr: string }>;
      executeCommandStream: (command: string, workspacePath: string, execId: string) => Promise<{ code: number; stdout: string; stderr: string }>;
      onCommandChunk: (callback: (data: { execId: string; stream: string; chunk: string }) => void) => () => void;
      secureKeySet: (apiKey: string) => Promise<boolean>;
      secureKeyGet: () => Promise<string>;
      storeGet: (name: string) => Promise<string | null>;
      storeSet: (name: string, value: string) => Promise<boolean>;
      updaterCheck: () => Promise<{ ok: boolean; version?: string; error?: string }>;
      updaterDownload: () => Promise<{ ok: boolean; error?: string }>;
      updaterInstall: () => void;
      onUpdaterStatus: (callback: (data: any) => void) => () => void;
      openInExplorer: (folderPath: string) => Promise<boolean>;
      checkImageSize: (filePath: string, workspacePath: string) => Promise<{ width: number; height: number; sizeBytes: number }>;
      listComponents: (workspacePath: string) => Promise<string[]>;
      windowMinimize: () => void;
      windowToggleMaximize: () => void;
      windowClose: () => void;
      windowIsMaximized: () => Promise<boolean>;
      prepareShadowWorkspace: (workspacePath: string) => Promise<boolean>;
      mergeShadowWorkspace: (workspacePath: string) => Promise<boolean>;
      discardShadowWorkspace: (workspacePath: string) => Promise<boolean>;
      showConfirm: (message: string, title?: string) => Promise<boolean>;
      setMinimizeToTray: (enabled: boolean) => Promise<boolean>;
      showNotification: (title: string, body: string) => Promise<boolean>;
      openExternalPreview: (html: string) => Promise<boolean>;
      updateExternalPreview: (html: string) => Promise<boolean>;
      sendStdin: (execId: string, text: string) => Promise<boolean>;
      killCommand: (execId: string) => Promise<boolean>;
      mcpReinit: (serversJson: string) => Promise<boolean>;
      mcpListTools: () => Promise<any[]>;
      mcpCallTool: (serverName: string, toolName: string, args: any) => Promise<any>;
      coreStatus: () => Promise<{
        available: boolean; version?: string; files?: number; docs?: number;
        languages?: string[]; reason?: string;
      }>;
      coreParseAst: (code: string, ext: string) => Promise<{
        status: 'success' | 'skipped' | 'error';
        language: string;
        nodes_count: number;
        nodes: { name: string; node_type: string; line_start: number; line_end: number }[];
      } | null>;
      coreIndexFile: (filePath: string, content: string) => Promise<{ status: string; chunks: number } | null>;
      coreIndexFiles: (files: { file_path: string; content: string }[]) => Promise<{ files_indexed: number; chunks: number } | null>;
      coreRemoveFile: (filePath: string) => Promise<{ status: string; removed: boolean } | null>;
      coreSearchRag: (query: string, limit?: number) => Promise<{
        status: 'success';
        query: string;
        results_count: number;
        results: { file_path: string; line_start: number; line_end: number; chunk_content: string; score: number }[];
      } | null>;
      coreClearIndex: () => Promise<{ status: string } | null>;
    }
  }
}

// ─── Types ───
interface Project { 
  id: string; 
  name: string; 
  code: string; 
  chatHistory: ChatMessage[]; 
  createdAt: number; 
  updatedAt: number; 
  workspacePath: string;
  scopePath: string;
  totalTokensPrompt?: number;
  totalTokensCompletion?: number;
  pinnedFiles?: string[];
  planSteps?: PlanStep[];
}
interface ProjectSnapshot {
  id: string;
  name: string;
  desc: string;
  timestamp: number;
  planSteps: PlanStep[];
  files: Record<string, string>;
}
interface ChatMessage { role: 'system' | 'user' | 'assistant'; content: string; reasoningContent?: string; usage?: { prompt: number; completion: number }; }
interface MCPServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  active: boolean;
}

interface AppSettings {
  apiKey: string; 
  model: string; 
  cachedModels: { id: string; name: string; contextLength: number; isFree: boolean; pricePrompt?: number; priceCompletion?: number }[];
  lastModelsRefresh: number;
  language: string; 
  showExamples: boolean; 
  showLoading: boolean; 
  autosave: boolean; 
  sounds: boolean;
  theme: string; 
  uiFont: string; 
  codeFont: string; 
  fontSize: number;
  temperature: number;
  maxTokens: number;
  autoCheckpoint: boolean;
  fallbackModel: string;
  onboardingDone: boolean;
  systemPrompt: string;
  // Permissions
  sandboxEnabled: boolean;
  permRead: 'auto' | 'ask';
  permWrite: 'review' | 'auto' | 'ask' | 'deny';
  permExec: 'ask' | 'deny';
  minimizeToTray?: boolean;
  favoriteModels?: string[];
  // New v1.2.0 features
  llmProvider?: 'openrouter' | 'ollama';
  ollamaUrl?: string;
  gitAutoCommit?: boolean;
  gitVerifyCommit?: boolean;
  gitCommitPrefix?: string;
  ollamaContextSize?: number;
  mcpServers?: MCPServerConfig[];
}

function validateCodeSyntax(filepath: string, content: string): { valid: boolean; error?: string } {
  const ext = filepath.split('.').pop()?.toLowerCase();

  // Basic balanced brackets check for any code file to catch trailing/missing braces
  const bracketCheck = checkBalancedBrackets(content);
  if (!bracketCheck.valid) return bracketCheck;

  if (ext === 'html') {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(content, 'text/html');
      const parserError = doc.querySelector('parsererror');
      if (parserError) {
        return { valid: false, error: parserError.textContent || 'HTML parsing error' };
      }
      
      const scripts = doc.querySelectorAll('script');
      for (const script of Array.from(scripts)) {
        if (script.src || script.getAttribute('type') === 'text/typescript') continue;
        const js = script.textContent || '';
        try {
          new Function(js);
        } catch (err: any) {
          if (!js.includes(':') && !js.includes('<')) {
            return { valid: false, error: `Синтаксическая ошибка в <script>: ${err.message}` };
          }
        }
      }
    } catch (e: any) {
      return { valid: false, error: `Ошибка парсинга HTML: ${e.message}` };
    }
  } else if (ext === 'js') {
    try {
      new Function(content);
    } catch (err: any) {
      return { valid: false, error: `Синтаксическая ошибка JS: ${err.message}` };
    }
  }
  return { valid: true };
}

interface AgentTool {
  type: 'read_dir' | 'read_file' | 'write_file' | 'edit_file' | 'execute_command' | 'list_components' | 'check_image_size' | 'search_code' | string;
  params: any;
  rawTag: string;
}

interface Skill {
  id: string;
  name: string;
  keywords: string[];
  files: string[];
  content: string;
}

// ─── Built-in Skills ───
const BUILTIN_SKILLS: Skill[] = [
  {
    id: 'react',
    name: 'React',
    keywords: ['react', 'компонент', 'component', 'хук', 'useState', 'useEffect', 'jsx', 'tsx'],
    files: ['package.json'],
    content: `Ты разрабатываешь приложение с использованием библиотеки React.
    ПРАВИЛА REACT:
    - Пиши современные функциональные компоненты с React-хуками (useState, useEffect, useMemo).
    - Разделяй логику на понятные переиспользуемые UI-компоненты.
    - Всегда импортируй React и используй стандартный синтаксис JSX/TSX.
    - Стилизуй компоненты с помощью переданных классов.`
  },
  {
    id: 'tailwind',
    name: 'Tailwind CSS',
    keywords: ['tailwind', 'классы', 'стили', 'вёрстка', 'flex', 'grid', 'адаптив'],
    files: ['tailwind.config.js', 'postcss.config.js'],
    content: `Ты используешь фреймворк Tailwind CSS для стилизации.
    ПРАВИЛА TAILWIND:
    - Пиши утилитарные классы прямо в разметке (className="...").
    - Не пиши стили в тегах <style>, если их можно выразить классами Tailwind.
    - Используй встроенные классы адаптивности (sm:, md:, lg:, xl:).`
  },
  {
    id: 'database',
    name: 'База данных (SQL)',
    keywords: ['бд', 'база данных', 'sql', 'sqlite', 'postgres', 'prisma', 'db', 'таблиц'],
    files: ['schema.prisma', 'database.sqlite', 'db.js', 'db.ts'],
    content: `Проект взаимодействует с реляционными базами данных (SQL/SQLite).
    ПРАВИЛА БАЗ ДАННЫХ:
    - Пиши чистые и безопасные SQL-запросы, защищенные от SQL-инъекций.
    - Если используется SQLite в Node.js, подключайся через стандартные библиотеки sqlite3/better-sqlite3.
    - Всегда объявляй структуру таблиц при их создании.`
  },
  {
    id: 'typescript',
    name: 'TypeScript',
    keywords: ['typescript', 'ts', 'интерфейс', 'тип', 'interface', 'type', 'строгий'],
    files: ['tsconfig.json'],
    content: `Проект использует TypeScript для статической типизации.
    ПРАВИЛА TYPESCRIPT:
    - Избегай использования типа 'any'. Описывай четкие типы и интерфейсы (interface).
    - Указывай типы для аргументов функций и возвращаемых значений.`
  }
];

// ─── Constants ───
const SYSTEM_PROMPT_COMMON = `Ты — экспертный ИИ-инженер, интегрированный в 7/24 IDE. Твой уровень: Cursor / OpenCode / Codex.

## СТРОГИЙ СТИЛЬ ОБЩЕНИЯ (Zero-Fluff / Принудительный Function Calling)
- ТЕБЕ КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО писать любые вежливые фразы, приветствия, извинения или пояснительный текст вокруг тегов инструментов (например, "Конечно, вот...", "Готово!", "Я обновил...").
- Твой ответ должен состоять ИСКЛЮЧИТЕЛЬНО из тегов инструментов. Никакого разговорного текста. Каждое лишнее слово сжигает лимиты токенов.
- Общайся с системой строго через XML-теги вызовов функций. Текст допускается только внутри тегов описания или в режиме планирования в тегах <step>.`;
// Tool parsers accept both quote styles for resilience, but prompts ask models
// for double quotes because it keeps streamed XML easier to read and recover.

const SYSTEM_PROMPT_BUILD = `${SYSTEM_PROMPT_COMMON}

## ТВОЙ РАБОЧИЙ ПРОЦЕСС В РЕЖИМЕ РАЗРАБОТКИ (BUILD)
1. АНАЛИЗ: Исследуй код и структуру проекта.
2. ИЗМЕНЕНИЕ ФАЙЛОВ (КРИТИЧНО):
   - ДЛЯ НОВЫХ ФАЙЛОВ: Используй <write_file>.
   - ДЛЯ СУЩЕСТВУЮЩИХ ФАЙЛОВ: Использовать <write_file> КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО! Ты обязан использовать СТРОГИЙ SEARCH & REPLACE через <edit_file>.
   - КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выводить готовый код обычным текстом в чат (в markdown блоках). Ты обязан ВСЕГДА использовать инструменты <write_file> или <edit_file> для генерации и изменения кода.

## ДОСТУПНЫЕ ИНСТРУМЕНТЫ
- Формат атрибутов: используй двойные кавычки, например <read_file path="index.html" full="true"/>.
- <read_dir path="путь"/> — получить список файлов.
- <read_file path="путь" full="true"/> — прочитать содержимое файла. Параметр full="true" является необязательным и отключает AST-сжатие контекста. По умолчанию (без full="true") возвращается сжатый каркас (сигнатуры функций, экспорты и интерфейсы) для экономии токенов. Используй full="true" только по необходимости.
- <write_file path="путь">содержимое</write_file> — записать новый файл.
- <edit_file path="путь"><search>старый код</search><replace>новый код</replace></edit_file> — редактировать существующий файл.
- <execute_command command="команда"/> — запустить терминальную команду.
- <list_components/> — получить список переиспользуемых компонентов проекта.
- <search_code query="ключевые слова"/> — быстрый поиск по всей кодовой базе проекта (возвращает файлы, строки и фрагменты с совпадениями). Используй его, чтобы найти, где определена функция, переменная или компонент, вместо чтения файлов наугад.
- <check_image_size path="путь"/> — проверить размеры (width/height) и вес изображения.
- НЕ ИСПОЛЬЗУЙ <read_file> для изображений (png, jpg, gif, webp, svg, ico, avif, bmp) — модель не поддерживает чтение изображений. Для проверки размеров изображения используй <check_image_size>.`;

const SYSTEM_PROMPT_PLAN = `${SYSTEM_PROMPT_COMMON}

## ТВОЙ РАБОЧИЙ ПРОЦЕСС В РЕЖИМЕ ПЛАНИРОВАНИЯ (PLAN)
1. Твоя единственная задача на этом этапе — спроектировать решение и составить пошаговый план разработки.
2. Ты обязан перечислить все необходимые шаги внутри специальных XML-тегов:
   <plan>
     <step>Описание шага 1</step>
     <step>Описание шага 2</step>
   </plan>
3. В режиме планирования тебе КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО вносить какие-либо изменения на диск или выполнять команды. У тебя физически нет инструментов записи/изменения файлов (<write_file>, <edit_file>) и выполнения команд (<execute_command>).
4. Запрашивай информацию о проекте через инструменты чтения, если тебе нужно изучить структуру перед планированием.

## ДОСТУПНЫЕ ИНСТРУМЕНТЫ
- Формат атрибутов: используй двойные кавычки, например <read_file path="index.html" full="true"/>.
- <read_dir path="путь"/> — получить список файлов.
- <read_file path="путь" full="true"/> — прочитать содержимое файла (с поддержкой full="true" для получения полного кода функции вместо сжатого).
- <list_components/> — получить список переиспользуемых компонентов проекта.
- <search_code query="ключевые слова"/> — быстрый поиск по всей кодовой базе проекта.
- <check_image_size path="путь"/> — проверить размеры (width/height) и вес изображения.
- НЕ ИСПОЛЬЗУЙ <read_file> для изображений (png, jpg, gif, webp, svg, ico, avif, bmp) — модель не поддерживает чтение изображений. Для проверки размеров изображения используй <check_image_size>.`;

const DEFAULT_SYSTEM_PROMPT = SYSTEM_PROMPT_BUILD;

const STORAGE = { settings: 'ag_settings', projects: 'ag_projects', activeProjectId: 'ag_active_project', recentFolders: 'ag_recent_folders' };
const API_BASE = 'https://openrouter.ai/api/v1';

function getLLMUrl(path: string): string {
  if (settings.llmProvider === 'ollama') {
    const base = settings.ollamaUrl ? settings.ollamaUrl.replace(/\/$/, '') : 'http://localhost:11434';
    if (path === '/models') {
      return `${base}/api/tags`;
    }
    return `${base}/v1${path}`;
  }
  return `${API_BASE}${path}`;
}

function getLLMHeaders(customKey?: string): Record<string, string> {
  if (settings.llmProvider === 'ollama') {
    return {
      'Content-Type': 'application/json'
    };
  }
  const key = customKey || settings.apiKey;
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
    'HTTP-Referer': 'https://seven24-ide.local',
    'X-Title': '7/24 IDE'
  };
}

function getLLMBody(baseBody: any): any {
  if (settings.llmProvider === 'ollama') {
    return {
      ...baseBody,
      options: {
        num_ctx: settings.ollamaContextSize || 4096
      }
    };
  }
  return baseBody;
}

async function fetchModels(providerOrKey?: string, url?: string, key?: string): Promise<any[]> {
  let provider = settings.llmProvider || 'openrouter';
  let apiKey = key || settings.apiKey;
  let ollamaUrl = url || settings.ollamaUrl || 'http://localhost:11434';

  if (providerOrKey === 'ollama' || providerOrKey === 'openrouter') {
    provider = providerOrKey;
  } else if (providerOrKey) {
    provider = 'openrouter';
    apiKey = providerOrKey;
  }

  if (modelsStatus) modelsStatus.textContent = t('Загрузка моделей...');

  if (provider === 'ollama') {
    try {
      const base = ollamaUrl.replace(/\/$/, '');
      const resp = await fetch(`${base}/api/tags`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const result = (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        contextLength: 4096,
        isFree: true,
        pricePrompt: 0,
        priceCompletion: 0,
      }));
      if (modelsStatus) {
        const updatedAt = new Date().toLocaleTimeString();
        modelsStatus.textContent = `${t('Загружено моделей')}: ${result.length} · ${t('обновлено')} ${updatedAt}`;
      }
      return result;
    } catch (err: any) {
      if (modelsStatus) modelsStatus.textContent = `Ошибка: ${err.message}`;
      console.warn('Failed to fetch Ollama models, fallback empty:', err);
      return [];
    }
  } else {
    try {
      const resp = await fetch(`${API_BASE}/models`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const allModels = (data.data || []) as any[];

      const priorityProviders = [
        'deepseek', 'openai', 'google', 'anthropic',
        'qwen', 'meta-llama', 'mistralai', 'x-ai',
        'cohere', 'nvidia', 'microsoft', 'amazon',
      ];

      const byProvider: Record<string, typeof allModels> = {};

      for (const m of allModels) {
        const providerName = m.id.split('/')[0] || 'other';
        if (!byProvider[providerName]) byProvider[providerName] = [];
        byProvider[providerName].push(m);
      }

      for (const prov of Object.keys(byProvider)) {
        byProvider[prov].sort((a: any, b: any) => {
          const aPriority = a.id.includes(':free') ? 1 : 0;
          const bPriority = b.id.includes(':free') ? 1 : 0;
          if (aPriority !== bPriority) return aPriority - bPriority;
          return a.name?.localeCompare(b.name || '') || 0;
        });
      }

      const added = new Set<string>();
      const result: any[] = [];

      const addModels = (providers: string[]) => {
        for (const prov of providers) {
          const models = byProvider[prov] || [];
          const limited = models.slice(0, 25);
          for (const m of limited) {
            if (added.has(m.id)) continue;
            added.add(m.id);
            result.push({
              id: m.id,
              name: m.name || m.id,
              contextLength: m.context_length || 0,
              isFree: parseFloat(m.pricing?.completion || '0') === 0 && parseFloat(m.pricing?.prompt || '0') === 0,
              pricePrompt: parseFloat(m.pricing?.prompt || '0') || 0,
              priceCompletion: parseFloat(m.pricing?.completion || '0') || 0,
            });
          }
        }
      };

      addModels(priorityProviders);

      const remaining = Object.keys(byProvider).filter(p => !priorityProviders.includes(p)).sort();
      addModels(remaining);

      if (modelsStatus) {
        const updatedAt = new Date().toLocaleTimeString();
        modelsStatus.textContent = `${t('Загружено моделей')}: ${result.length} (${Object.keys(byProvider).length}) · ${t('обновлено')} ${updatedAt}`;
      }
      return result;
    } catch (err: any) {
      if (modelsStatus) modelsStatus.textContent = `Ошибка: ${err.message}`;
      return [];
    }
  }
}

// ─── Network reliability: fetch with exponential backoff for 429 / 5xx ───
function sleep(ms: number): Promise<void> {
  return new Promise(res => setTimeout(res, ms));
}

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: any = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await fetch(url, options);
      // Retry on rate limit and transient server errors
      if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) {
        const retryAfter = parseFloat(resp.headers.get('retry-after') || '0');
        const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 400;
        setCurrentAction(`⏳ ${resp.status === 429 ? 'Лимит запросов' : 'Сбой сервера'} — повтор через ${(backoff / 1000).toFixed(1)}с (попытка ${attempt + 1}/${maxRetries})...`);
        await sleep(backoff);
        continue;
      }
      return resp;
    } catch (err: any) {
      // Network error / aborted
      if (err?.name === 'AbortError') throw err;
      lastError = err;
      if (attempt < maxRetries) {
        const backoff = Math.min(1000 * Math.pow(2, attempt), 8000) + Math.random() * 400;
        setCurrentAction(`⏳ Ошибка сети — повтор через ${(backoff / 1000).toFixed(1)}с (попытка ${attempt + 1}/${maxRetries})...`);
        await sleep(backoff);
        continue;
      }
    }
  }
  throw lastError || new Error('Не удалось выполнить запрос после нескольких попыток.');
}

// ─── State ───
let settings: AppSettings = {
  apiKey: '', model: '', cachedModels: [], lastModelsRefresh: 0,
  language: 'ru', showExamples: true, showLoading: true, autosave: true, sounds: false,
  theme: 'light', uiFont: 'Inter', codeFont: 'JetBrains Mono', fontSize: 13,
  temperature: 0.2, maxTokens: 4096, autoCheckpoint: true, fallbackModel: '', onboardingDone: false, systemPrompt: DEFAULT_SYSTEM_PROMPT,
  sandboxEnabled: true,
  permRead: 'auto',
  permWrite: 'review',
  permExec: 'ask',
  minimizeToTray: false,
  favoriteModels: [],
  llmProvider: 'openrouter',
  ollamaUrl: 'http://localhost:11434',
  gitAutoCommit: false,
  gitVerifyCommit: false,
  gitCommitPrefix: '[AI]',
  ollamaContextSize: 4096,
  mcpServers: [],
};
let projects: Project[] = [];
let activeProject: Project | null = null;
let recentFolders: string[] = [];
let isGenerating = false;
let autoScrollEnabled = true;
let lastPreviewContent = '';
let buildSessionWroteFiles = false;
let agentStepCount = 0;
const MAX_AGENT_STEPS = 20;
let activeAbortController: AbortController | null = null;
let activeCommandExecId: string | null = null;
let stdinHistory: string[] = [];
let stdinHistoryIdx = -1;

function createAbortController(): AbortController {
  activeAbortController = new AbortController();
  return activeAbortController;
}
const attachedFiles = new Set<string>();

// ─── Plan & Build modes state ───
let appMode: 'build' | 'plan' = 'build';
let planApproved = false;
let skipPlanSuggestion = false;
let currentStepIndex = -1;
let isExecutingPlan = false;
interface PlanStep {
  text: string;
  enabled: boolean;
  status: 'pending' | 'active' | 'done' | 'failed';
}
let planSteps: PlanStep[] = [];
// Timer handle for the deferred `executeNextStep` call after a step completes.
// Cleared by the Stop button so that an aborted plan doesn't auto-resume the
// next step a second later.
let nextStepTimer: ReturnType<typeof setTimeout> | null = null;

// ─── DOM ───
const $ = (s: string) => document.querySelector(s) as HTMLElement;
const $$ = (s: string) => document.querySelectorAll(s);

const chatMessages = $('#chat-messages');
const chatInput = $('#chat-input') as HTMLTextAreaElement;
const btnSend = $('#btn-send') as HTMLButtonElement;
const loadingIndicator = $('#loading-indicator');
const previewIframe = $('#preview-iframe') as HTMLIFrameElement;
const welcomeState = $('#welcome-state');
const dashboardView = $('#dashboard-view');
const iframeWrapper = $('#iframe-wrapper');
const codeView = $('#code-view');
const codeDisplay = $('#code-display');
const setupBanner = $('#setup-banner');
const modelsStatus = $('#models-status');
const modelSelect = $('#s-model') as HTMLSelectElement;
const apiKeyInput = $('#s-api-key') as HTMLInputElement;
const workspaceView = $('#workspace-view');
const settingsPage = $('#settings-page');
const providerStatus = $('#provider-status');

// Left Sidebar DOM
const btnSidebarNewChat = $('#btn-sidebar-new-chat');
const sidebarProjectsList = $('#sidebar-projects-list');
const btnSidebarSelectFolder = $('#btn-sidebar-select-folder');
const sidebarFolderPath = $('#sidebar-folder-path');
const btnSidebarClearFolder = $('#btn-sidebar-clear-folder');
const btnSidebarOpenExplorer = $('#btn-sidebar-open-explorer');
const sidebarRecentFolders = $('#sidebar-recent-folders');
const sidebarScopeInput = $('#sidebar-scope-input') as HTMLInputElement;
const btnSidebarSettings = $('#btn-sidebar-settings');
const titlebarProjectName = $('#titlebar-project-name');

// Tab Explorer DOM
const filesView = $('#files-view');
const filesWorkspacePath = $('#files-workspace-path');
const btnRefreshFiles = $('#btn-refresh-files');
const filesList = $('#files-list');

// Permissions DOM
const sSandboxEnabled = $('#s-sandbox-enabled') as HTMLInputElement;
const sPermRead = $('#s-perm-read') as HTMLSelectElement;
const sPermWrite = $('#s-perm-write') as HTMLSelectElement;
const sPermExec = $('#s-perm-exec') as HTMLSelectElement;

// Indicators DOM
// ═══════════════════════════════════════════
// PERSISTENCE
// ═══════════════════════════════════════════
function loadSettings() { 
  try { 
    const r = localStorage.getItem(STORAGE.settings); 
    if (r) settings = { ...settings, ...JSON.parse(r) }; 
  } catch {} 
}
function saveSettings() {
  // Persist everything EXCEPT the API key in plain localStorage; the key is stored
  // separately via OS-level encryption (safeStorage) in the main process.
  const { apiKey, ...rest } = settings;
  localStorage.setItem(STORAGE.settings, JSON.stringify(rest));
  // Fire-and-forget secure save of the key
  if (window.electronAPI?.secureKeySet) {
    window.electronAPI.secureKeySet(apiKey || '').catch(() => {});
  }
}

// Load the API key from secure storage, migrating any legacy plaintext key.
async function loadSecureApiKey() {
  try {
    if (!window.electronAPI?.secureKeyGet) return;
    const secure = await window.electronAPI.secureKeyGet();
    if (secure) {
      settings.apiKey = secure;
    } else if (settings.apiKey) {
      // Legacy: key was stored in localStorage — migrate it to secure storage
      await window.electronAPI.secureKeySet(settings.apiKey);
    }
    // Ensure the key is no longer kept in plain localStorage
    const r = localStorage.getItem(STORAGE.settings);
    if (r) {
      try {
        const parsed = JSON.parse(r);
        if (parsed.apiKey) { delete parsed.apiKey; localStorage.setItem(STORAGE.settings, JSON.stringify(parsed)); }
      } catch {}
    }
  } catch (e) {
    console.warn('Secure key load failed:', e);
  }
}
// ─── Persistent storage (with localStorage → main-process migration) ───
let projectsLoaded = false;
let saveProjectsTimer: any = null;

async function loadProjects() {
  try {
    // 1. Try the modern main-process store first
    if (window.electronAPI?.storeGet) {
      const data = await window.electronAPI.storeGet('projects');
      if (data) {
        projects = JSON.parse(data);
        normalizeProjects();
        projectsLoaded = true;
        return;
      }
    }
    // 2. Fallback: read legacy localStorage and migrate to the new store
    const legacy = localStorage.getItem(STORAGE.projects);
    if (legacy) {
      projects = JSON.parse(legacy);
      normalizeProjects();
      // Migrate to the new store and clear localStorage to free space
      if (window.electronAPI?.storeSet) {
        await window.electronAPI.storeSet('projects', legacy);
        localStorage.removeItem(STORAGE.projects);
      }
    }
  } catch {
    projects = [];
  }
  projectsLoaded = true;
}

function normalizeProjects() {
  for (const p of projects) {
    if (p.workspacePath === undefined) p.workspacePath = '';
    if (p.scopePath === undefined) p.scopePath = '';
  }
}

function saveProjects() {
  // Debounced async save: avoids blocking the renderer for every tiny change
  if (!projectsLoaded) return;
  if (saveProjectsTimer) clearTimeout(saveProjectsTimer);
  saveProjectsTimer = setTimeout(() => {
    saveProjectsTimer = null;
    const data = JSON.stringify(projects);
    if (window.electronAPI?.storeSet) {
      window.electronAPI.storeSet('projects', data).catch((err) => {
        console.error('storeSet projects failed:', err);
      });
    } else {
      try { localStorage.setItem(STORAGE.projects, data); } catch {}
    }
  }, 200);
}

function loadActiveProject() { const id = localStorage.getItem(STORAGE.activeProjectId); if (id) activeProject = projects.find(p => p.id === id) || null; }
function saveActiveProjectId() { if (activeProject) localStorage.setItem(STORAGE.activeProjectId, activeProject.id); else localStorage.removeItem(STORAGE.activeProjectId); }

function loadRecentFolders() {
  try {
    const r = localStorage.getItem(STORAGE.recentFolders);
    if (r) recentFolders = JSON.parse(r);
  } catch { recentFolders = []; }
}
function saveRecentFolders() { localStorage.setItem(STORAGE.recentFolders, JSON.stringify(recentFolders)); }
function addRecentFolder(folder: string) {
  if (!folder) return;
  recentFolders = recentFolders.filter(f => f !== folder);
  recentFolders.unshift(folder);
  if (recentFolders.length > 15) recentFolders = recentFolders.slice(0, 15);
  saveRecentFolders();
  renderRecentFolders();
}
function renderRecentFolders() {
  if (recentFolders.length === 0) {
    sidebarRecentFolders.classList.add('hidden');
    return;
  }
  sidebarRecentFolders.classList.remove('hidden');
  sidebarRecentFolders.innerHTML = '';
  for (const folder of recentFolders) {
    const item = document.createElement('div');
    item.className = 'sidebar-recent-folder-item';
    item.innerHTML = `<i data-lucide="clock"></i><span title="${esc(folder)}">${esc(folder)}</span>`;
    item.addEventListener('click', async () => {
      await setWorkspaceFolder(folder);
    });
    sidebarRecentFolders.appendChild(item);
  }
  refreshIcons();
}

// ═══════════════════════════════════════════
// OPENROUTER MODELS
// ═══════════════════════════════════════════

interface ModelInfo {
  id: string;
  name: string;
  contextLength: number;
  isFree: boolean;
  pricePrompt?: number;      // $ per token (input)
  priceCompletion?: number;  // $ per token (output)
}



// Auto-refresh: fetch models silently and diff against the cache.
// On first run after install — just save. On subsequent runs — surface a
// concise notification when new models appear, models disappear, or prices
// change. Designed to run in the background at startup.
async function refreshModelsInBackground() {
  if (!settings.apiKey) return;
  try {
    const fresh = await fetchModels(settings.apiKey);
    if (!fresh.length) return;

    const oldList = settings.cachedModels || [];
    const oldById = new Map(oldList.map(m => [m.id, m]));
    const freshById = new Map(fresh.map(m => [m.id, m]));

    // Diff
    const added = fresh.filter(m => !oldById.has(m.id));
    const removed = oldList.filter(m => !freshById.has(m.id));
    const priceChanged: { id: string; name: string }[] = [];
    for (const m of fresh) {
      const old = oldById.get(m.id);
      if (!old) continue;
      const sameIn = (old.pricePrompt || 0) === (m.pricePrompt || 0);
      const sameOut = (old.priceCompletion || 0) === (m.priceCompletion || 0);
      if (!sameIn || !sameOut) priceChanged.push({ id: m.id, name: m.name });
    }

    // Persist fresh list and refresh date
    settings.cachedModels = fresh;
    settings.lastModelsRefresh = Date.now();
    if (!settings.model) settings.model = fresh[0].id;
    // If the configured model disappeared from the catalogue — gently fall back
    if (settings.model && !freshById.has(settings.model)) {
      const fallback = fresh.find(m => m.id === settings.fallbackModel) || fresh[0];
      const lostId = settings.model;
      settings.model = fallback.id;
      appendBubble('Система', `⚠️ ${t('Модель')} ${lostId} ${t('больше недоступна у провайдера. Переключаюсь на')} ${fallback.id}.`, true);
    }
    saveSettings();
    updateModelLabel();
    document.dispatchEvent(new Event('ag:models-updated'));

    // Quietly notify about meaningful changes (skip first run when oldList was empty)
    if (oldList.length === 0) return;
    const parts: string[] = [];
    if (added.length) parts.push(`+${added.length} ${t('новых')}`);
    if (removed.length) parts.push(`−${removed.length} ${t('убрано')}`);
    if (priceChanged.length) parts.push(`${priceChanged.length} ${t('изменили цены')}`);
    if (parts.length) {
      console.info('[models] catalogue changed:', { added: added.map(m => m.id), removed: removed.map(m => m.id), priceChanged: priceChanged.map(m => m.id) });
      appendBubble('Система', `🔄 ${t('Каталог моделей обновлён')}: ${parts.join(', ')}.`, true);
    }
  } catch (err) {
    // Silent: a startup model refresh failure should not bother the user.
    console.warn('Background model refresh failed:', err);
  }
}

function populateModelSelect(models: ModelInfo[], selectedId?: string) {
  modelSelect.innerHTML = '';
  if (!models.length) { modelSelect.innerHTML = `<option value="">${t('Модели не найдены')}</option>`; modelSelect.disabled = true; return; }
  modelSelect.disabled = false;

  // Add search input above model select
  let searchInput = document.getElementById('model-search-input') as HTMLInputElement | null;
  if (!searchInput) {
    searchInput = document.createElement('input') as HTMLInputElement;
    searchInput.type = 'text';
    searchInput.id = 'model-search-input';
    searchInput.className = 'setting-input model-search';
    searchInput.placeholder = t('Поиск модели...');
    searchInput.style.cssText = 'margin-bottom: 8px; width: 100%; font-size: 12px; padding: 6px 10px;';
    modelSelect.parentNode?.insertBefore(searchInput, modelSelect);
    searchInput.addEventListener('input', () => {
      const query = searchInput!.value.toLowerCase();
      const opts = modelSelect.querySelectorAll('option');
      const groups = modelSelect.querySelectorAll('optgroup');
      opts.forEach(o => {
        const el = o as HTMLOptionElement;
        const match = el.textContent?.toLowerCase().includes(query) || el.value.toLowerCase().includes(query);
        (el as any).style.display = match ? '' : 'none';
      });
      groups.forEach(g => {
        const visibleOpts = g.querySelectorAll('option[style*="display: none"], option:not([style])');
        const allHidden = Array.from(g.querySelectorAll('option')).every(o => (o as any).style.display === 'none');
        (g as HTMLElement).style.display = allHidden ? 'none' : '';
      });
    });
  }

  // Add provider header at the top
  const providerHeader = document.createElement('option');
  providerHeader.disabled = true;
  providerHeader.textContent = `=== Провайдер: ${settings.llmProvider === 'openrouter' ? 'OpenRouter' : 'Ollama'} ===`;
  modelSelect.appendChild(providerHeader);

  // Group by provider
  const groups: Record<string, ModelInfo[]> = {};
  for (const m of models) {
    const p = m.id.split('/')[0] || 'other';
    if (!groups[p]) groups[p] = [];
    groups[p].push(m);
  }

  for (const [provider, gm] of Object.entries(groups)) {
    const og = document.createElement('optgroup');
    og.label = provider.charAt(0).toUpperCase() + provider.slice(1) + ` (${gm.length})`;
    for (const m of gm) {
      const o = document.createElement('option');
      o.value = m.id;
      const freeBadge = m.isFree ? ' [FREE]' : '';
      const ctxInfo = m.contextLength ? ` · ${(m.contextLength / 1000).toFixed(0)}K` : '';
      o.textContent = m.name + freeBadge + ctxInfo;
      if (m.id === selectedId) o.selected = true;
      og.appendChild(o);
    }
    modelSelect.appendChild(og);
  }
  if (!selectedId && models.length) modelSelect.value = models[0].id;

  // If cached settings model is not in the list, update it
  if (selectedId && modelSelect.value !== selectedId && models.length > 0) {
    settings.model = models[0].id;
    modelSelect.value = models[0].id;
  }
}

// ═══════════════════════════════════════════
// PROJECT SIDEBAR LIST MANAGEMENT
// ═══════════════════════════════════════════
function genId(): string { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

function createProject(name = 'Новый проект'): Project {
  const p: Project = { 
    id: genId(), 
    name, 
    code: '', 
    chatHistory: [{ role: 'system', content: settings.systemPrompt }], 
    createdAt: Date.now(), 
    updatedAt: Date.now(),
    workspacePath: '',
    scopePath: ''
  };
  projects.unshift(p); 
  saveProjects(); 
  renderSidebarProjects();
  renderAgentTabs();
  return p;
}

function updateSidebarFolderUI(p: Project) {
  const attachBtn = document.getElementById('btn-chat-attach-context');
  const detachBtn = document.getElementById('btn-chat-detach-context');
  const topbarScopeInput = document.getElementById('topbar-scope-input') as HTMLInputElement | null;

  if (p.workspacePath) {
    const folderName = p.workspacePath.split(/[\\/]/).pop() || p.workspacePath;
    sidebarFolderPath.textContent = folderName;
    sidebarFolderPath.title = p.workspacePath;
    btnSidebarClearFolder.classList.remove('hidden');
    btnSidebarOpenExplorer.style.display = '';
    if (p.scopePath) {
      document.getElementById('sidebar-workspace-details')?.classList.remove('hidden');
      sidebarScopeInput.value = p.scopePath;
    } else {
      sidebarScopeInput.value = '';
    }
    if (topbarScopeInput) {
      topbarScopeInput.value = p.scopePath || '';
    }

    if (attachBtn) {
      attachBtn.title = p.workspacePath;
      const span = attachBtn.querySelector('span');
      if (span) span.textContent = folderName;
      const icon = attachBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'folder');
      }
    }
    if (detachBtn) {
      detachBtn.classList.remove('hidden');
    }
  } else {
    sidebarFolderPath.textContent = t('Папка не выбрана');
    sidebarFolderPath.title = t('Выбрать рабочую папку');
    btnSidebarClearFolder.classList.add('hidden');
    btnSidebarOpenExplorer.style.display = 'none';
    document.getElementById('sidebar-workspace-details')?.classList.add('hidden');
    sidebarScopeInput.value = '';
    if (topbarScopeInput) {
      topbarScopeInput.value = '';
    }

    if (attachBtn) {
      attachBtn.title = t('Подключить рабочую папку');
      const span = attachBtn.querySelector('span');
      if (span) span.textContent = t('Подключить контекст');
      const icon = attachBtn.querySelector('i');
      if (icon) {
        icon.setAttribute('data-lucide', 'paperclip');
      }
    }
    if (detachBtn) {
      detachBtn.classList.add('hidden');
    }
  }

  const contextWrap = document.querySelector('.agentic-context-wrap');
  if (contextWrap && (window as any).lucide) {
    (window as any).lucide.createIcons();
  }

  updateFilterButtonUI();
  updateLowcodeContextPlaceholder();
}

async function setWorkspaceFolder(folder: string) {
  if (!activeProject) {
    const p = createProject();
    switchToProject(p);
  }
  if (!activeProject) return;
  activeProject.workspacePath = folder;
  saveProjects();
  updateSidebarFolderUI(activeProject);
  addRecentFolder(folder);
  appendBubble('Система', `${t('📂 Рабочая папка установлена')}: ${folder}`, true);
  renderPreview();
  refreshWorkspaceFilesUI();
  renderSidebarProjects();
  renderAgentTabs();
  // Kick off background indexing for the native search engine. Failure is
  // silent — the agent's <search_code> tool falls back to a TS scan.
  tryIndexWorkspaceBackground(folder).catch(() => {});
}

/**
 * Best-effort background re-index of a workspace folder into the native
 * BM25 engine. Skips silently if the Rust core is not available, keeps the
 * batch under reasonable size limits, and never throws to its caller.
 */
async function tryIndexWorkspaceBackground(folder: string): Promise<void> {
  if (!folder || !window.electronAPI?.coreStatus || !window.electronAPI?.coreIndexFiles) return;
  let status: { available: boolean } | null = null;
  try {
    status = await window.electronAPI.coreStatus();
  } catch {
    return;
  }
  if (!status?.available) return;

  try {
    await window.electronAPI.coreClearIndex?.();
    const files = await window.electronAPI.readDir(folder);
    const textExts = new Set([
      'js','ts','jsx','tsx','vue','svelte','html','css','scss','sass','json',
      'md','py','rs','go','java','c','cpp','h','hpp','php','rb','yml','yaml','txt','sql','toml','rb',
    ]);

    const batch: { file_path: string; content: string }[] = [];
    let totalBytes = 0;
    const MAX_BYTES_PER_BATCH = 5_000_000;
    const MAX_FILE_BYTES = 500_000;

    let indexed = 0;
    for (const f of files) {
      if (f.isDir) continue;
      if (f.path.startsWith('.shadow-workspace')) continue;
      if (f.path.includes('node_modules/')) continue;
      if (f.size > MAX_FILE_BYTES) continue;
      const ext = f.path.toLowerCase().split('.').pop() || '';
      if (!textExts.has(ext)) continue;

      let content = '';
      try {
        content = await window.electronAPI.readFile(f.path, folder, false);
      } catch { continue; }
      batch.push({ file_path: f.path, content });
      totalBytes += content.length;
      if (totalBytes >= MAX_BYTES_PER_BATCH) {
        const res = await window.electronAPI.coreIndexFiles(batch.splice(0, batch.length));
        if (res) indexed += res.files_indexed || 0;
        totalBytes = 0;
      }
    }
    if (batch.length > 0) {
      const res = await window.electronAPI.coreIndexFiles(batch);
      if (res) indexed += res.files_indexed || 0;
    }
    if (indexed > 0) {
      console.log(`[core-backend] indexed ${indexed} files for workspace ${folder}`);
    }
  } catch (err) {
    console.warn('[core-backend] background indexing failed:', err);
  }
}

function switchToProject(p: Project) { 
  activeProject = p; 
  saveActiveProjectId();
  lastPreviewContent = '';
  loadPlanSteps();
  renderTasksUI();
  attachedFiles.clear();
  renderAttachedFiles();
  renderPinnedFiles();
  renderChatHistory(); 
  renderPreview(); 
  updateProjectNameUI(); 
  renderSidebarProjects(); // Highlight active item
  renderAgentTabs();
  loadTokenAccumulated();
  updateTokenStats(0, 0); // Refresh display with loaded values
  updateContextBar();
  
  updateSidebarFolderUI(p);
  
  // Reset device preview to desktop on project switch
  const wrap = document.getElementById('iframe-wrapper');
  if (wrap) wrap.classList.remove('device-mobile', 'device-tablet');
  $$('.device-btn').forEach(x => x.classList.remove('active'));
  const desktopBtn = document.querySelector('.device-btn[data-device="desktop"]');
  if (desktopBtn) desktopBtn.classList.add('active');
  
  refreshWorkspaceFilesUI();

  maybeShowResumeOnLoad();
  
  // Set focus to chat input
  setTimeout(() => {
    chatInput.focus();
  }, 100);
}

// If the last turn belongs to the user (or a tool result with no following answer),
// the agent was interrupted (e.g. connection drop) — offer to continue.
function maybeShowResumeOnLoad() {
  if (!activeProject || isGenerating) return;
  const hist = activeProject.chatHistory.filter(m => m.role !== 'system' || m.content.startsWith('[Результат выполнения инструментов]'));
  const last = hist[hist.length - 1];
  if (!last) return;
  const interrupted = last.role === 'user' || (last.role === 'system' && last.content.startsWith('[Результат выполнения инструментов]'));
  if (interrupted) {
    showResumeCard('Предыдущий ответ не был завершён.');
  }
}

function updateProjectNameUI() { 
  const name = activeProject?.name || 'Новый проект';
  titlebarProjectName.textContent = name; 
  const agenticTitle = document.getElementById('agentic-chat-title-text');
  if (agenticTitle) agenticTitle.textContent = name;
}

function renderAgentTabs() {
  // Removed: agent tabs are now handled by the sidebar list
}

function renderSidebarProjects() {
  sidebarProjectsList.innerHTML = '';

  // The `hidden` class lives on the wrapper, not the input itself.
  const searchBox = document.getElementById('sidebar-search-box');
  if (projects.length === 0) {
    sidebarProjectsList.innerHTML = `<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">${esc(t('Нет проектов'))}</div>`;
    if (searchBox) searchBox.classList.add('hidden');
    return;
  }
  if (searchBox) searchBox.classList.remove('hidden');
  
  for (const p of projects) {
    const item = document.createElement('div');
    item.className = 'sidebar-project-item' + (activeProject?.id === p.id ? ' active' : '');
    
    const folderLabel = p.workspacePath ? p.workspacePath.split(/[\\/]/).pop() || p.workspacePath : '';
    item.innerHTML = `
      <div class="sidebar-project-main">
        <div class="sidebar-project-item-meta">
          <span class="sidebar-project-name" title="${esc(p.name)}">${esc(p.name)}</span>
        </div>
        ${folderLabel ? `<div class="sidebar-project-folder"><i data-lucide="folder"></i><span>${esc(folderLabel)}</span></div>` : ''}
      </div>
      <div class="sidebar-project-actions">
        <button class="sidebar-action-btn-mini rename-project" title="Переименовать"><i data-lucide="pencil"></i></button>
        <button class="sidebar-action-btn-mini delete-project delete" title="Удалить"><i data-lucide="trash-2"></i></button>
      </div>
    `;
    
    // Switch on click
    item.querySelector('.sidebar-project-item-meta')?.addEventListener('click', () => {
      switchToProject(p);
    });
    
    // Inline Rename on Double Click
    item.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      startInlineRename(p, item);
    });
    
    // Inline Rename on Pencil Click
    item.querySelector('.rename-project')?.addEventListener('click', (e) => {
      e.stopPropagation();
      startInlineRename(p, item);
    });
    
    // Delete chat
    item.querySelector('.delete-project')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog('Удалить этот чат?', 'Удаление чата');
      if (ok) {
        const wasActive = activeProject?.id === p.id;
        projects = projects.filter(x => x.id !== p.id);
        saveProjects();
        if (wasActive) {
          activeProject = null;
          saveActiveProjectId();
          if (projects.length > 0) {
            switchToProject(projects[0]);
          } else {
            renderChatHistory();
            renderPreview();
            updateProjectNameUI();
          }
        }
        renderSidebarProjects();
        renderAgentTabs();
      }
    });
    
    sidebarProjectsList.appendChild(item);
  }
  refreshIcons();
}

// ═══════════════════════════════════════════
// CHAT & AGENT LOOP
// ═══════════════════════════════════════════
function extractToolResults(systemContent: string): string[] {
  const results: string[] = [];
  const parts = systemContent.split(/(?:Результат выполнения|Ошибка при выполнении) <[^>]+>:\n/);
  for (let i = 1; i < parts.length; i++) {
    results.push(parts[i].trim());
  }
  return results;
}

function parseXmlAttrs(attrString: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let attrMatch: RegExpExecArray | null;
  while ((attrMatch = attrRegex.exec(attrString)) !== null) {
    attrs[attrMatch[1]] = attrMatch[2] ?? attrMatch[3] ?? '';
  }
  return attrs;
}

const markedRenderer = new marked.Renderer();

// Custom link renderer: open external links in browser, files in Monaco editor
markedRenderer.link = (tokenOrHref: any, title?: string, text?: string) => {
  let href = '';
  let cleanText = '';
  if (tokenOrHref && typeof tokenOrHref === 'object') {
    href = tokenOrHref.href || '';
    cleanText = tokenOrHref.text || '';
  } else {
    href = tokenOrHref || '';
    cleanText = text || '';
  }
  const cleanHref = href;
  if (cleanHref.startsWith('http://') || cleanHref.startsWith('https://') || cleanHref.startsWith('mailto:')) {
    return `<a class="chat-external-link" href="${esc(cleanHref)}" title="${esc(cleanHref)}">${cleanText}</a>`;
  }
  // Otherwise treat as file link
  return `<a class="chat-file-link" data-path="${esc(cleanHref)}" href="#" title="${esc(t('Открыть файл'))}">${cleanText}</a>`;
};

// Custom code renderer: add copy button and handle language or path header
markedRenderer.code = (tokenOrCode: any, language?: string) => {
  let code = '';
  let lang = '';
  if (tokenOrCode && typeof tokenOrCode === 'object') {
    code = tokenOrCode.text || '';
    lang = tokenOrCode.lang || '';
  } else {
    code = tokenOrCode || '';
    lang = language || '';
  }
  lang = (lang || 'code').trim();
  const highlighted = highlightCode(code, lang);
  
  let headerText = esc(lang);
  let pathAttr = '';
  // If language looks like a file path (contains '.' or '/')
  if (lang.includes('.') || lang.includes('/')) {
    headerText = `<span class="chat-file-link inline" data-path="${esc(lang)}">${esc(lang)}</span>`;
    pathAttr = `data-path="${esc(lang)}"`;
  }
  
  // Check if code block is executable (JS, TS, Python, Shell, etc.)
  const execLangs = ['js', 'javascript', 'ts', 'typescript', 'py', 'python', 'sh', 'bash', 'zsh', 'cmd', 'bat', 'powershell', 'ps1'];
  const isExecutable = execLangs.includes(lang.toLowerCase());
  const runBtn = isExecutable ? `<button class="btn-run-chat-code" title="${esc(t('Выполнить'))}"><i data-lucide="play"></i><span>${esc(t('Выполнить'))}</span></button>` : '';
  
  return `
    <div class="code-block-chat" ${pathAttr} data-lang="${esc(lang)}">
      <div class="code-block-chat-header">
        <span>${headerText}</span>
        <div class="code-block-chat-actions">
          ${runBtn}
          <button class="btn-copy-chat-code"><i data-lucide="copy"></i><span>${esc(t('Копировать'))}</span></button>
        </div>
      </div>
      <pre><code>${highlighted}</code></pre>
    </div>
  `;
};

// Path regex to detect workspace file references in plain text
const pathRegex = /\b([a-zA-Z0-9_.-]+(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z0-9_-]+|[a-zA-Z0-9_.-]+\.(?:ts|js|json|css|html|toml|rs|md|txt|py|sh|go))\b/g;

// Custom text renderer to dynamically turn raw file paths in plain text into links
markedRenderer.text = (tokenOrText: any) => {
  let text = '';
  if (tokenOrText && typeof tokenOrText === 'object') {
    text = tokenOrText.text || '';
  } else {
    text = tokenOrText || '';
  }
  if (typeof text !== 'string') return '';
  return text.replace(pathRegex, (match) => {
    if (/^\d+(\.\d+)+$/.test(match)) {
      return esc(match);
    }
    return `<a class="chat-file-link" data-path="${esc(match)}" href="#" title="${esc(t('Открыть файл'))}">${esc(match)}</a>`;
  });
};

// Configure marked with our custom renderer
marked.use({
  renderer: markedRenderer,
  gfm: true,
  breaks: true,
});

function isResponseTruncated(text: string): boolean {
  const tags = ['think', 'write_file', 'edit_file', 'read_file', 'read_dir', 'execute_command', 'search_code'];
  for (const tag of tags) {
    const openCount = (text.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
    const closeCount = (text.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    const selfCloseCount = (text.match(new RegExp(`<${tag}\\b[^>]*/>`, 'g')) || []).length;
    if (openCount > (closeCount + selfCloseCount)) {
      return true;
    }
  }
  const backtickCount = (text.match(/```/g) || []).length;
  if (backtickCount % 2 !== 0) {
    return true;
  }
  return false;
}

function parseMarkdown(text: string): string {
  let tempText = text;

  // Extract <think> block if present (case-insensitive)
  let thinkHtml = '';
  const thinkMatch = tempText.match(/<think>([\s\S]*?)(?:<\/think>|$)/i);
  if (thinkMatch) {
    const thinkContent = thinkMatch[1].trim();
    if (thinkContent) {
      thinkHtml = `
        <div class="reasoning-block">
          <div class="reasoning-header">
            <i data-lucide="brain"></i>
            <span>${esc(t('Размышления'))}</span>
          </div>
          <div class="reasoning-content">${esc(thinkContent)}</div>
        </div>
      `;
    }
    tempText = tempText.replace(/<think>[\s\S]*?(?:<\/think>|$)/i, '');
  }

  // Extract XML tool tags so they don't get messed up by HTML escaping or markdown formatting
  const toolPlaceholders: string[] = [];
  const storePlaceholder = (tagHtml: string) => {
    const id = `%%TOOLPLACEHOLDER${toolPlaceholders.length}%%`;
    toolPlaceholders.push(tagHtml);
    return id;
  };

  // Regexes matching tool tags with either single- or double-quoted attributes.
  const readDirRegex = /<read_dir\b[^>]*\s*(?:\/>|>\s*<\/read_dir>|>)/g;
  const readFileRegex = /<read_file\b[^>]*\s*(?:\/>|>\s*<\/read_file>|>)/g;
  const writeFileRegex = /<write_file\b[^>]*>[\s\S]*?(?:<\/write_file>|$)/g;
  const editFileRegex = /<edit_file\b[^>]*>[\s\S]*?(?:<\/edit_file>|$)/g;
  const execCmdRegex = /<execute_command\b[^>]*\s*(?:\/>|>\s*<\/execute_command>|>)/g;
  const searchCodeRegex = /<search_code\b[^>]*\s*(?:\/>|>\s*<\/search_code>|>)/g;
  const listCompRegex = /<list_components\s*(?:\/>|>\s*<\/list_components>|>)/g;
  const checkImgRegex = /<check_image_size\b[^>]*\s*(?:\/>|>\s*<\/check_image_size>|>)/g;
  const orphanToolCloseRegex = /<\/(?:read_dir|read_file|write_file|edit_file|execute_command|search_code|list_components|check_image_size)>/g;

  // Replace tags with placeholders
  tempText = tempText.replace(editFileRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(writeFileRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(readDirRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(readFileRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(execCmdRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(searchCodeRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(listCompRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(checkImgRegex, (match) => storePlaceholder(match));
  tempText = tempText.replace(orphanToolCloseRegex, '');

  let parsedHtml = '';
  try {
    parsedHtml = marked.parse(tempText, { async: false }) as string;
  } catch (err) {
    console.error('Marked parsing error:', err);
    parsedHtml = esc(tempText).replace(/\n/g, '<br>');
  }

  // Sanitize the model/file-derived HTML to neutralise XSS (script tags,
  // event handlers, javascript: URLs, etc.) before it touches innerHTML.
  parsedHtml = sanitizeHtml(parsedHtml);

  // Restore tool tag placeholders
  for (let i = 0; i < toolPlaceholders.length; i++) {
    parsedHtml = parsedHtml.replace(`%%TOOLPLACEHOLDER${i}%%`, toolPlaceholders[i]);
  }

  return thinkHtml + parsedHtml;
}

/**
 * Minimal, dependency-free HTML sanitizer for rendered markdown.
 * Removes dangerous elements (script/style/iframe/object/embed/form...),
 * strips all `on*` event-handler attributes, and blocks javascript:/data:
 * URLs in href/src. Runs in the renderer (DOMParser is available).
 */
function sanitizeHtml(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const FORBIDDEN_TAGS = new Set([
      'SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'FORM',
      'LINK', 'META', 'BASE',
    ]);
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT);
    const toRemove: Element[] = [];
    let node = walker.nextNode() as Element | null;
    while (node) {
      if (FORBIDDEN_TAGS.has(node.tagName)) {
        toRemove.push(node);
      } else {
        // Strip event handlers and dangerous URL attributes.
        for (const attr of Array.from(node.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value.trim().toLowerCase();
          if (name.startsWith('on')) {
            node.removeAttribute(attr.name);
          } else if ((name === 'href' || name === 'src' || name === 'xlink:href') &&
                     (value.startsWith('javascript:') || value.startsWith('data:text/html') || value.startsWith('vbscript:'))) {
            node.removeAttribute(attr.name);
          } else if (name === 'style' && /expression\s*\(|javascript:|url\s*\(\s*['"]?\s*javascript:/i.test(attr.value)) {
            node.removeAttribute(attr.name);
          }
        }
      }
      node = walker.nextNode() as Element | null;
    }
    for (const el of toRemove) el.remove();
    return doc.body.innerHTML;
  } catch (err) {
    console.error('sanitizeHtml failed, falling back to text escaping:', err);
    return esc(html);
  }
}

function highlightCode(code: string, lang: string): string {
  const cleanLang = (lang || '').toLowerCase().trim();
  let escaped = esc(code);

  if (cleanLang === 'html' || cleanLang === 'xml' || cleanLang === 'svg') {
    escaped = escaped.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="comment">$1</span>');
    escaped = escaped.replace(/(&lt;\/?)(\w+)([\s\S]*?)(&gt;)/g, (match: string, p1: string, tagName: string, attrs: string, p4: string) => {
      const highlightedAttrs = attrs.replace(/(\b[a-zA-Z0-9_-]+=)(?:&quot;([\s\S]*?)&quot;|&#39;([\s\S]*?)&#39;)/g, (m: string, name: string, valDouble: string | undefined, valSingle: string | undefined) => {
        const val = valDouble !== undefined ? `&quot;${valDouble}&quot;` : `&#39;${valSingle}&#39;`;
        return `<span class="attr">${name}</span><span class="string">${val}</span>`;
      });
      return `${p1}<span class="tag">${tagName}</span>${highlightedAttrs}${p4}`;
    });
    return escaped;
  }

  if (cleanLang === 'css') {
    escaped = escaped.replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>');
    escaped = escaped.replace(/(\b[a-zA-Z0-9_-]+\s*):([^;{}]+)(;|\b)/g, (match, prop, val, end) => {
      return `<span class="keyword">${prop}</span>:<span class="string">${val}</span>${end}`;
    });
    return escaped;
  }

  const keywords = /\b(const|let|var|function|return|if|else|for|while|do|class|import|export|from|extends|new|this|typeof|instanceof|async|await|try|catch|finally|throw|default|switch|case|break|continue|null|undefined|true|false|fn|let|pub|struct|impl|match|use|mod|mut|crate|package|import|func|def|class|async|await|for|in|nil|type|interface)\b/g;
  const strings = /(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|`[\s\S]*?`)/g;
  const numbers = /\b(\d+)\b/g;
  const comments = /(\/\/.*|\/\*[\s\S]*?\*\/|#.*)/g;
  const builtins = /\b(console|window|document|process|require|module|Array|Object|String|Number|Boolean|Function|Promise|Error|Map|Set|JSON|Math|Option|Result|Vec|String|self|Self|fmt|print|println|append|panic)\b/g;

  escaped = escaped.replace(comments, '<span class="comment">$1</span>');
  escaped = escaped.replace(strings, '<span class="string">$1</span>');
  escaped = escaped.replace(keywords, '<span class="keyword">$1</span>');
  escaped = escaped.replace(builtins, '<span class="builtin">$1</span>');
  escaped = escaped.replace(numbers, '<span class="number">$1</span>');
  return escaped;
}

function formatToolTags(text: string, isHistory = false, toolResults: string[] = []) {
  let toolIndex = 0;
  let html = text;

  const replaceTag = (match: string, type: string, title: string, details: string) => {
    const idx = toolIndex++;
    const hasResult = isHistory && toolResults[idx] !== undefined;
    const resultText = hasResult ? toolResults[idx] : t('Ожидание запуска...');
    
    const isFailed = hasResult && (resultText.startsWith('Ошибка') || resultText.includes('ОШИБКА') || resultText.includes('отклонено'));
    const codeMatch = resultText.match(/Код завершения:\s*(\d+)/);
    const isCommandError = codeMatch && codeMatch[1] !== '0';
    const failedStatus = isFailed || isCommandError;

    const statusClassLive = idx === 0 ? 'running' : 'pending';
    const statusClassVal = isHistory ? (failedStatus ? 'failed' : 'success') : statusClassLive;

    const statusIcon = isHistory ? (failedStatus ? 'alert-circle' : 'check-circle-2') : (idx === 0 ? 'loader-2' : 'circle');
    const statusText = isHistory ? (failedStatus ? 'Ошибка' : 'Выполнено') : (idx === 0 ? 'Запуск...' : 'Ожидает');

    let accordionBody = '';
    let diffStats = '';
    if (type === 'edit_file') {
      let search = ''; let replace = '';
      const sMatch = details.match(/<search>([\s\S]*?)(?:<\/search>|$)/);
      const rMatch = details.match(/<replace>([\s\S]*?)(?:<\/replace>|$)/);
      if (sMatch) search = sMatch[1];
      if (rMatch) replace = rMatch[1];
      
      const removedCount = search ? Math.max(0, search.split('\n').filter(l => l.trim()).length - (search.endsWith('\n') ? 0 : 0)) : 0;
      const addedCount = replace ? Math.max(0, replace.split('\n').filter(l => l.trim()).length - (replace.endsWith('\n') ? 0 : 0)) : 0;
      if (removedCount > 0 || addedCount > 0) {
        diffStats = `<span class="diff-stats">${addedCount > 0 ? `+${addedCount}` : ''}${removedCount > 0 ? (addedCount > 0 ? ' ' : '') : ''}${removedCount > 0 ? `-${removedCount}` : ''}</span>`;
      }
      
      const diffLines: string[] = [];
      if (search) {
        search.split('\n').forEach(l => diffLines.push(`<div class="diff-line removed">- ${esc(l)}</div>`));
      }
      if (replace) {
        replace.split('\n').forEach(l => diffLines.push(`<div class="diff-line added">+ ${esc(l)}</div>`));
      }
      accordionBody = `
        <div class="diff-widget" style="margin:0;">
          <div class="diff-widget-body">
            ${diffLines.join('')}
          </div>
        </div>
      `;
    } else {
      accordionBody = `<div class="tool-accordion-content">${esc(resultText)}</div>`;
    }

    const iconName = type === 'read_dir' ? 'folder' :
                     type === 'read_file' ? 'file-text' :
                     type === 'write_file' ? 'file-code' :
                     type === 'edit_file' ? 'file-edit' :
                     type === 'search_code' ? 'search' :
                     type === 'list_components' ? 'box' :
                     type === 'check_image_size' ? 'image' :
                     'terminal';

    const toolActions = isHistory ? `
      <div class="tool-accordion-actions">
        <button class="tool-action-btn copy" data-tool-idx="${idx}" data-tool-type="${type}" title="${esc(t('Копировать результат'))}" aria-label="${esc(t('Копировать'))}"><i data-lucide="copy"></i></button>
        <button class="tool-action-btn rerun" data-tool-idx="${idx}" data-tool-type="${type}" title="${esc(t('Повторить выполнение'))}" aria-label="${esc(t('Повторить'))}"><i data-lucide="refresh-cw"></i></button>
      </div>
    ` : '';

    return `
      <div class="tool-accordion tool-step-${idx}" data-tool-type="${type}" data-tool-idx="${idx}">
        <div class="tool-accordion-header">
          <div class="tool-accordion-title-wrap">
            <i data-lucide="${iconName}"></i>
            <span class="tool-accordion-title">${esc(title)}</span>
            ${diffStats}
          </div>
          <div class="tool-accordion-status-wrap">
            <div class="tool-accordion-status ${statusClassVal}">
              <i data-lucide="${statusIcon}"></i> <span>${statusText}</span>
            </div>
            ${toolActions}
          </div>
        </div>
        <div class="tool-accordion-body">
          ${accordionBody}
        </div>
      </div>
    `;
  };

  // Replace each raw XML tag in order. Attribute parsing accepts both quote styles.
  html = html.replace(/<read_dir\b([^>]*)\s*(?:\/>|>\s*<\/read_dir>|>)/g, (match, attrsRaw) => {
    const path = parseXmlAttrs(attrsRaw).path || '.';
    return replaceTag(match, 'read_dir', `Просмотр папки: ${path}`, '');
  });

  html = html.replace(/<read_file\b([^>]*)\s*(?:\/>|>\s*<\/read_file>|>)/g, (match, attrsRaw) => {
    const path = parseXmlAttrs(attrsRaw).path || '';
    return replaceTag(match, 'read_file', `Чтение файла: ${path}`, '');
  });

  html = html.replace(/<execute_command\b([^>]*)\s*(?:\/>|>\s*<\/execute_command>|>)/g, (match, attrsRaw) => {
    const command = parseXmlAttrs(attrsRaw).command || '';
    return replaceTag(match, 'execute_command', `Запуск команды: ${command}`, '');
  });

  html = html.replace(/<write_file\b([^>]*)>([\s\S]*?)(?:<\/write_file>|$)/g, (match, attrsRaw, content) => {
    const path = parseXmlAttrs(attrsRaw).path || '';
    return replaceTag(match, 'write_file', `Создание файла: ${path}`, content);
  });

  html = html.replace(/<edit_file\b([^>]*)>([\s\S]*?)(?:<\/edit_file>|$)/g, (match, attrsRaw, inner) => {
    const path = parseXmlAttrs(attrsRaw).path || '';
    return replaceTag(match, 'edit_file', `Правка файла: ${path}`, inner);
  });

  html = html.replace(/<search_code\b([^>]*)\s*(?:\/>|>\s*<\/search_code>|>)/g, (match, attrsRaw) => {
    const query = parseXmlAttrs(attrsRaw).query || '';
    return replaceTag(match, 'search_code', `Поиск в коде: ${query}`, '');
  });

  html = html.replace(/<list_components\s*(?:\/>|>\s*<\/list_components>|>)/g, (match) => {
    return replaceTag(match, 'list_components', `Список компонентов проекта`, '');
  });

  html = html.replace(/<check_image_size\b([^>]*)\s*(?:\/>|>\s*<\/check_image_size>|>)/g, (match, attrsRaw) => {
    const path = parseXmlAttrs(attrsRaw).path || '';
    return replaceTag(match, 'check_image_size', `Проверка изображения: ${path}`, '');
  });

  html = html.replace(/<\/(?:read_dir|read_file|write_file|edit_file|execute_command|search_code|list_components|check_image_size)>/g, '');

  // Replace each generic MCP tool tag in order
  html = html.replace(/<(mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+)\s+([^>]*?)(?:\/>|>\s*<\/\1>)/g, (match, fullTagName, attrString) => {
    const parts = fullTagName.split('__');
    const server = parts[1];
    const name = parts.slice(2).join('__');
    return replaceTag(match, fullTagName, `MCP [${server}]: ${name}`, attrString);
  });

  return html;
}

function buildMsgActions(isAi: boolean): string {
  const copyBtn = `<button class="msg-action-btn copy" data-action="copy" title="${esc(t('Копировать'))}" aria-label="${esc(t('Копировать'))}"><i data-lucide="copy"></i></button>`;
  const branchBtn = `<button class="msg-action-btn branch" data-action="branch" title="${esc(t('Ветвиться от сюда'))}" aria-label="${esc(t('Ветвиться'))}"><i data-lucide="git-branch"></i></button>`;
  if (isAi) {
    return `${copyBtn}${branchBtn}<button class="msg-action-btn regenerate" data-action="regenerate" title="${esc(t('Сгенерировать заново'))}" aria-label="${esc(t('Сгенерировать заново'))}"><i data-lucide="refresh-cw"></i></button>`;
  }
  return `${copyBtn}${branchBtn}<button class="msg-action-btn edit" data-action="edit" title="${esc(t('Редактировать сообщение'))}" aria-label="${esc(t('Редактировать'))}"><i data-lucide="pencil"></i></button>`;
}

// In-app confirmation modal (replaces the native system dialog)
// First-run onboarding: pick language and (optionally) the API key.
// Always shown in English — by design, since the user hasn't chosen a UI language yet.
// ═══════════════════════════════════════════
// AUTO-UPDATE UI (notifies the user when a newer version is available
// on GitHub Releases and lets them download / install in one click).
// ═══════════════════════════════════════════
function setupAutoUpdaterUI() {
  if (!window.electronAPI?.onUpdaterStatus) return;

  let banner: HTMLElement | null = null;
  const ensureBanner = () => {
    if (banner) return banner;
    banner = document.createElement('div');
    banner.className = 'updater-banner';
    document.body.appendChild(banner);
    return banner;
  };
  const close = () => { if (banner) { banner.remove(); banner = null; } };
  const setHTML = (html: string) => {
    const b = ensureBanner();
    b.innerHTML = html;
    refreshIcons();
  };

  window.electronAPI.onUpdaterStatus((data: any) => {
    if (!data) return;
    if (data.type === 'available') {
      setHTML(`
        <i data-lucide="arrow-down-circle"></i>
        <span class="updater-text">${esc(t('Доступно обновление'))}: <b>${esc(data.version)}</b></span>
        <button class="primary-btn updater-btn" id="updater-download-btn">${esc(t('Скачать'))}</button>
        <button class="ghost-btn updater-btn" id="updater-dismiss-btn"><i data-lucide="x"></i></button>
      `);
      banner?.querySelector('#updater-download-btn')?.addEventListener('click', async () => {
        setHTML(`<i data-lucide="loader-2" class="spin"></i><span class="updater-text">${esc(t('Скачивание обновления...'))}</span>`);
        await window.electronAPI.updaterDownload();
      });
      banner?.querySelector('#updater-dismiss-btn')?.addEventListener('click', close);
    } else if (data.type === 'progress') {
      setHTML(`<i data-lucide="loader-2" class="spin"></i><span class="updater-text">${esc(t('Скачивание обновления'))}: ${data.percent}%</span>`);
    } else if (data.type === 'downloaded') {
      setHTML(`
        <i data-lucide="check-circle-2"></i>
        <span class="updater-text">${esc(t('Обновление готово к установке'))}: <b>${esc(data.version)}</b></span>
        <button class="primary-btn updater-btn" id="updater-install-btn">${esc(t('Перезапустить и установить'))}</button>
        <button class="ghost-btn updater-btn" id="updater-dismiss-btn"><i data-lucide="x"></i></button>
      `);
      banner?.querySelector('#updater-install-btn')?.addEventListener('click', () => window.electronAPI.updaterInstall());
      banner?.querySelector('#updater-dismiss-btn')?.addEventListener('click', close);
    } else if (data.type === 'error') {
      console.warn('[updater] error:', data.message);
      setHTML(`
        <i data-lucide="alert-triangle" style="color: var(--accent-red);"></i>
        <span class="updater-text">${esc(t('Ошибка обновления'))}: ${esc(data.message)}</span>
        <button class="ghost-btn updater-btn" id="updater-dismiss-btn"><i data-lucide="x"></i></button>
      `);
      banner?.querySelector('#updater-dismiss-btn')?.addEventListener('click', close);
    }
    // 'checking' / 'none' — silent
  });
}

function showOnboarding(): Promise<void> {
  return new Promise((resolve) => {
    const langs: { code: Lang; label: string }[] = [
      { code: 'en', label: 'English' },
      { code: 'ru', label: 'Русский' },
      { code: 'zh', label: '中文' },
    ];

    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop onboarding-backdrop';
    backdrop.innerHTML = `
      <div class="onboarding-dialog">
        <div class="onboarding-logo">
          <div class="logo-icon large"><i data-lucide="sparkles"></i></div>
          <div>
            <h2>Welcome to 7/24 IDE</h2>
            <p class="onboarding-tagline">Build apps with an AI agent. Just describe what you want — the agent reads files, writes code and shows the result.</p>
          </div>
        </div>

        <div class="onboarding-step">
          <div class="onboarding-step-title">1. Interface language</div>
          <div class="onboarding-langs">
            ${langs.map(l => `<button class="onboarding-lang" data-lang="${l.code}">${l.label}</button>`).join('')}
          </div>
          <div class="onboarding-hint">You can change this later in Settings → General.</div>
        </div>

        <div class="onboarding-step">
          <div class="onboarding-step-title">2. OpenRouter API key (optional)</div>
          <input type="password" id="onboarding-key" class="setting-input" placeholder="sk-or-v1-..." style="width:100%;" />
          <div class="onboarding-hint">Sign up at <b>openrouter.ai</b> to access GPT, Claude, Gemini and others. The key is encrypted on your machine. You can also set it later in Settings → Provider.</div>
        </div>

        <div class="onboarding-actions">
          <button class="ghost-btn" id="onboarding-skip">Skip for now</button>
          <button class="primary-btn" id="onboarding-continue">Get started</button>
        </div>
      </div>
    `;
    document.body.appendChild(backdrop);
    refreshIcons();

    let chosenLang: Lang = 'en';
    const langBtns = Array.from(backdrop.querySelectorAll('.onboarding-lang')) as HTMLElement[];
    const select = (code: Lang) => {
      chosenLang = code;
      langBtns.forEach(b => b.classList.toggle('active', b.dataset.lang === code));
    };
    langBtns.forEach(b => b.addEventListener('click', () => select(b.dataset.lang as Lang)));
    select('en');

    const finish = (saveKey: boolean) => {
      settings.language = chosenLang;
      settings.onboardingDone = true;
      if (saveKey) {
        const keyInput = backdrop.querySelector('#onboarding-key') as HTMLInputElement;
        const key = keyInput?.value?.trim() || '';
        if (key) settings.apiKey = key;
      }
      saveSettings();
      backdrop.remove();
      // Reload so the picked language is applied to all static UI cleanly
      if (chosenLang !== 'ru') {
        location.reload();
        return;
      }
      resolve();
    };

    backdrop.querySelector('#onboarding-continue')?.addEventListener('click', () => finish(true));
    backdrop.querySelector('#onboarding-skip')?.addEventListener('click', () => finish(false));
    (backdrop.querySelector('#onboarding-key') as HTMLInputElement)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(true);
    });
  });
}

function confirmDialog(message: string, title = 'Подтверждение'): Promise<boolean> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop confirm-backdrop';
    backdrop.innerHTML = `
      <div class="confirm-dialog">
        <div class="confirm-dialog-title">${esc(t(title))}</div>
        <div class="confirm-dialog-message">${esc(t(message))}</div>
        <div class="confirm-dialog-actions">
          <button class="secondary-btn confirm-cancel">${esc(t('Отмена'))}</button>
          <button class="primary-btn confirm-ok">${esc(t('Подтвердить'))}</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(false);
      else if (e.key === 'Enter') close(true);
    };
    const close = (val: boolean) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      resolve(val);
    };
    document.addEventListener('keydown', onKey);
    backdrop.querySelector('.confirm-cancel')?.addEventListener('click', () => close(false));
    backdrop.querySelector('.confirm-ok')?.addEventListener('click', () => close(true));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(false); });
    (backdrop.querySelector('.confirm-ok') as HTMLElement)?.focus();
    refreshIcons();
  });
}

function buildMessageHtml(
  sender: string,
  text: string,
  isAi: boolean,
  extra?: { reasoningContent?: string; usage?: { prompt: number; completion: number }; toolResults?: string[] }
): string {
  let displayContent = text;
  if (!isAi && displayContent.includes('=== ПРИКРЕПЛЕННЫЙ КОНТЕКСТ ФАЙЛОВ ===')) {
    const parts = displayContent.split('Пользовательский запрос: ');
    if (parts.length > 1) {
      displayContent = parts.slice(1).join('Пользовательский запрос: ');
    }
  }

  let formattedText = isAi ? parseMarkdown(displayContent) : esc(displayContent).replace(/\n/g, '<br>');
  if (isAi) {
    formattedText = formatToolTags(formattedText, true, extra?.toolResults);
  }

  let reasoningHtml = '';
  if (isAi && extra?.reasoningContent) {
    const escapedReasoning = esc(extra.reasoningContent).trim();
    if (escapedReasoning) {
      reasoningHtml = `
        <div class="reasoning-block collapsed">
          <div class="reasoning-header">
            <i data-lucide="brain"></i>
            <span>${esc(t('Размышления'))}</span>
          </div>
          <div class="reasoning-content">${escapedReasoning}</div>
        </div>
      `;
    }
  }

  const actionsBar = isAi
    ? buildMsgActions(true)
    : buildMsgActions(false);

  const modelLabel = isAi && sender !== 'Система' && sender !== 'System' && settings.model
    ? esc(settings.model.split('/').pop() || settings.model)
    : '';

  let tokenUsageHtml = '';
  if (isAi && extra?.usage) {
    const u = extra.usage;
    const p = u.prompt || 0;
    const c = u.completion || 0;
    const cost = estimateCost(p, c);
    const costStr = cost > 0 ? ` · ~$${cost.toFixed(4)}` : '';
    const titleText = `Prompt: ${p.toLocaleString()}, Completion: ${c.toLocaleString()}`;
    tokenUsageHtml = `<span class="msg-footer-tokens" title="${esc(titleText)}">🧮 ${p.toLocaleString()}+${c.toLocaleString()}${costStr}</span>`;
  }

  const footerHtml = (modelLabel || tokenUsageHtml)
    ? `<div class="msg-footer">${modelLabel ? `<span class="msg-footer-model">${modelLabel}</span>` : ''}${tokenUsageHtml}</div>`
    : '';

  const headerHtml = `
    <div class="msg-header">
      <span class="msg-sender-name">${esc(sender)}</span>
    </div>
  `;

  return `
    ${headerHtml}
    <div class="message-bubble">
      ${reasoningHtml}
      <div class="message-text">${formattedText}</div>
    </div>
    <div class="msg-bottom">
      <div class="msg-actions">${actionsBar}</div>
      ${footerHtml}
    </div>
  `;
}

async function runCodeSnippet(code: string, lang: string) {
  if (!activeProject?.workspacePath) return;
  const langMap: Record<string, string> = {
    'js': 'node', 'javascript': 'node',
    'ts': 'npx tsx', 'typescript': 'npx tsx',
    'py': 'python', 'python': 'python',
    'sh': 'bash', 'bash': 'bash', 'zsh': 'bash',
    'cmd': 'cmd /c', 'bat': 'cmd /c',
    'powershell': 'pwsh', 'ps1': 'pwsh',
  };
  const executor = langMap[lang.toLowerCase()];
  if (!executor) {
    appendBubble('7/24 IDE', t('⚠️ Этот язык не поддерживает быстрое выполнение.'), true);
    return;
  }
  const extMap: Record<string, string> = {
    'node': '.js', 'npx tsx': '.ts', 'python': '.py',
    'bash': '.sh', 'cmd /c': '.bat', 'pwsh': '.ps1',
  };
  const ext = extMap[executor] || '.txt';
  const tmpFile = `.7-24-run/tmp-${Date.now()}${ext}`;
  try {
    await window.electronAPI.writeFile(tmpFile, code, activeProject.workspacePath, true);
    appendBubble('7/24 IDE', t('▶️ Выполнение кода...'), true);
    const result = await window.electronAPI.executeCommand(`${executor} ${tmpFile}`, activeProject.workspacePath);
    const output = result.stdout || result.stderr || t('(нет вывода)');
    appendBubble('7/24 IDE', `\`\`\`\n${output}\n\`\`\``, true);
  } catch (err: any) {
    appendBubble('7/24 IDE', `⚠️ ${t('Ошибка выполнения:')}\n\`\`\`\n${err.message || err}\n\`\`\``, true);
  } finally {
    // Cleanup: remove temp file after execution (cross-platform, path-checked)
    try {
      await window.electronAPI.deleteFile(tmpFile, activeProject.workspacePath);
    } catch (_) {}
  }
}

function appendBubble(
  sender: string,
  text: string,
  isAi: boolean,
  msgIndex?: number,
  extra?: { reasoningContent?: string; usage?: { prompt: number; completion: number } }
) {
  const div = document.createElement('div');
  div.className = `chat-message ${isAi ? 'ai' : 'user'}`;
  if (msgIndex !== undefined) div.dataset.msgIndex = String(msgIndex);

  div.innerHTML = buildMessageHtml(sender, text, isAi, extra);
  chatMessages.appendChild(div);
  if (autoScrollEnabled) chatMessages.scrollTop = chatMessages.scrollHeight;
  refreshIcons();
}

function renderChatHistory() {
  chatMessages.innerHTML = ''; 
  addWelcomeMessage();
  if (!activeProject) return;
  
  for (let i = 0; i < activeProject.chatHistory.length; i++) {
    const msg = activeProject.chatHistory[i];
    if (msg.role === 'system') continue;
    
    const isAi = msg.role === 'assistant';
    if (!isAi) {
      appendBubble('Вы', msg.content, false, i);
    } else {
      let toolResults: string[] = [];
      const nextMsg = activeProject.chatHistory[i + 1];
      if (nextMsg && nextMsg.role === 'system' && nextMsg.content.startsWith('[Результат выполнения инструментов]')) {
        toolResults = extractToolResults(nextMsg.content);
      }
      
      const div = document.createElement('div');
      div.className = 'chat-message ai';
      div.dataset.msgIndex = String(i);
      
      div.innerHTML = buildMessageHtml(
        '7/24 IDE',
        msg.content,
        true,
        {
          reasoningContent: msg.reasoningContent,
          usage: msg.usage,
          toolResults
        }
      );
      chatMessages.appendChild(div);
    }
  }
  if (autoScrollEnabled) chatMessages.scrollTop = chatMessages.scrollHeight;
  refreshIcons();
}

// Welcome message shown in chat when there is no project / no history
function addWelcomeMessage() {
  const isEmpty = chatMessages.children.length === 0;
  if (!isEmpty) return;

  const div = document.createElement('div');
  div.className = 'chat-message ai welcome-message lowcode-welcome-message';

  div.innerHTML = `
    <div class="message-text welcome-message-text">
      <div class="empty-chat-prompt">
        <h1>${esc(t('Что хотите создать?'))}</h1>
      </div>
    </div>
  `;

  chatMessages.appendChild(div);
}

// Show a "thinking" indicator while the model is processing
function showThinking() {
  removeThinking();
  const div = document.createElement('div');
  div.className = 'chat-message ai thinking-message';
  div.id = 'thinking-indicator';
  div.innerHTML = `
    <div class="message-meta"><span class="sender-name">${esc(t('Ассистент'))}</span><span class="time">${esc(t('печатает...'))}</span></div>
    <div class="message-text">
      <span class="thinking-indicator"><span></span><span></span><span></span></span> ${esc(t('Думаю над задачей...'))}
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinking() {
  const el = document.getElementById('thinking-indicator');
  if (el) el.remove();
}

// Format file size in human-readable form
function formatBytes(bytes: number): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

// ═══════════════════════════════════════════
// PREVIEW & FILES EXPLORER
// ═══════════════════════════════════════════
async function refreshWorkspaceFilesUI() {
  if (!activeProject || !activeProject.workspacePath) {
    filesWorkspacePath.textContent = t('Не выбрана');
    filesList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">${t('Рабочая папка не выбрана. Нажмите «Открыть» в боковой панели.')}</div>`;
    updateLowcodeContextCounts([]);
    return;
  }

  filesWorkspacePath.textContent = activeProject.workspacePath;
  try {
    const files = await window.electronAPI.readDir(activeProject.workspacePath);
    updateLowcodeContextCounts(files);
    filesList.innerHTML = '';

    if (files.length === 0) {
      filesList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--text-muted);">${t('Папка пуста. Агент может создать файлы.')}</div>`;
      return;
    }

    files.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    for (const f of files) {
      if (f.path.startsWith('.shadow-workspace/') || f.path === '.shadow-workspace') continue;
      const item = document.createElement('div');
      item.className = `file-item ${f.isDir ? 'dir' : 'file'}`;
      const icon = f.isDir ? 'folder' : 'file-code';
      const sizeStr = f.isDir ? '' : formatBytes(f.size);

      item.innerHTML = `
        <i data-lucide="${icon}"></i>
        <span class="file-item-name" title="${esc(f.path)}">${esc(f.path)}</span>
        ${sizeStr ? `<span class="file-item-size">${esc(sizeStr)}</span>` : ''}
        ${!f.isDir ? `<button class="file-item-attach-btn" title="Прикрепить к контексту"><i data-lucide="${attachedFiles.has(f.path) ? 'check' : 'plus'}"></i></button>` : ''}
        ${!f.isDir ? `<button class="file-item-pin-btn" title="${(activeProject?.pinnedFiles || []).includes(f.path) ? 'Открепить' : 'Закрепить в контексте'}"><i data-lucide="${(activeProject?.pinnedFiles || []).includes(f.path) ? 'pin-off' : 'pin'}"></i></button>` : ''}
      `;

      if (attachedFiles.has(f.path)) {
        item.classList.add('attached');
      }

      if (!f.isDir) {
        item.querySelector('.file-item-attach-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (attachedFiles.has(f.path)) {
            attachedFiles.delete(f.path);
          } else {
            attachedFiles.add(f.path);
          }
          renderAttachedFiles();
        });

        item.querySelector('.file-item-pin-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          if (activeProject?.pinnedFiles?.includes(f.path)) {
            removePinnedFile(f.path);
          } else {
            addPinnedFile(f.path);
          }
          refreshWorkspaceFilesUI(); // Refresh to update icon
        });

        item.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          if (attachedFiles.has(f.path)) {
            attachedFiles.delete(f.path);
          } else {
            attachedFiles.add(f.path);
          }
          renderAttachedFiles();
        });

        item.addEventListener('click', async () => {
          try {
            const content = await window.electronAPI.readFile(f.path, activeProject!.workspacePath, settings.sandboxEnabled);
            codeDisplay.textContent = content;
            $$('.ptab').forEach(x => x.classList.remove('active'));
            $('#tab-code').classList.add('active');
            iframeWrapper.style.display = 'none';
            filesView.style.display = 'none';
            codeView.style.display = 'flex';
          } catch (err: any) {
            alert(`${t('Не удалось открыть файл')}: ${err.message}`);
          }
        });
      }

      filesList.appendChild(item);
    }
    refreshIcons();
  } catch (err: any) {
    updateLowcodeContextCounts([]);
    filesList.innerHTML = `<div style="padding:20px; text-align:center; color:var(--accent-red);">${esc('Ошибка чтения директории')}: ${esc(err.message || String(err))}</div>`;
  }
}

function updateLowcodeContextCounts(files: { path: string; isDir: boolean; size: number }[]) {
  const visibleFiles = files.filter(f => !f.path.startsWith('.shadow-workspace/') && f.path !== '.shadow-workspace');
  const realFiles = visibleFiles.filter(f => !f.isDir);
  const pages = realFiles.filter(f => /\.(html|tsx|jsx|vue|svelte)$/i.test(f.path) || /(^|\/)(pages|routes|views)\//i.test(f.path)).length;
  const api = realFiles.filter(f => /(^|\/)(api|routes|controllers|services)\//i.test(f.path) || /\.(controller|route|routes|service)\.(ts|js)$/i.test(f.path)).length;
  const db = realFiles.filter(f => /(schema\.prisma|database|db\.|model\.|models\/|migrations\/|\.sql$|\.sqlite$)/i.test(f.path)).length;
  const env = realFiles.filter(f => /(^|\/)\.env(\.|$)|env\./i.test(f.path)).length;

  const setText = (id: string, value: number | string) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(value);
  };
  setText('lowcode-context-files', realFiles.length);
  setText('lowcode-context-pages', pages);
  setText('lowcode-context-api', api);
  setText('lowcode-context-db', db);
  setText('lowcode-context-files-detail', realFiles.length);
  setText('lowcode-context-data-detail', db);
  setText('lowcode-context-integrations-detail', api);
  setText('lowcode-context-env-detail', env);
}

// Inject a Content Security Policy meta tag into the previewed HTML so the
// generated app cannot make outbound requests, exfiltrate data, or load
// remote scripts. The iframe is also sandboxed at the element level.
function injectPreviewCSP(html: string): string {
  const csp = "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; style-src 'self' 'unsafe-inline' data: blob: https://fonts.googleapis.com; img-src 'self' data: blob:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'none'; frame-src 'none'; object-src 'none';\">";
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, (m) => m + csp);
  }
  if (/<html[^>]*>/i.test(html)) {
    return html.replace(/<html([^>]*)>/i, (m) => m + `<head>${csp}</head>`);
  }
  return csp + html;
}

async function updateLivePreviewFromFiles() {
  if (!activeProject || !activeProject.workspacePath) return;
  try {
    const activeWorkspace = isExecutingPlan ? `${activeProject.workspacePath}/.shadow-workspace` : activeProject.workspacePath;
    const files = await window.electronAPI.readDir(activeWorkspace);
    let htmlFile = files.find(f => !f.isDir && f.path.toLowerCase() === 'index.html');
    if (!htmlFile) {
      htmlFile = files.find(f => !f.isDir && f.path.toLowerCase().endsWith('.html'));
    }

    if (htmlFile) {
      const content = await window.electronAPI.readFile(htmlFile.path, activeWorkspace, settings.sandboxEnabled);
      activeProject.code = content;
      // Reload the iframe only when the content actually changed — prevents flicker
      if (content !== lastPreviewContent) {
        lastPreviewContent = content;
        previewIframe.srcdoc = injectPreviewCSP(content);
        if (window.electronAPI?.updateExternalPreview) {
          window.electronAPI.updateExternalPreview(content).catch(() => {});
        }
      }
      if (codeView.style.display === 'flex') {
        codeDisplay.textContent = content;
      }
    }
  } catch (err) {}
}

// Programmatically activate a preview-panel tab (preview/code/files/terminal/tasks/snapshots)
function switchToPreviewTab(tabName: string) {
  const tab = document.querySelector(`.ptab[data-tab="${tabName}"]`) as HTMLElement;
  if (!tab) return;
  $$('.ptab').forEach(x => x.classList.remove('active'));
  tab.classList.add('active');
  renderPreview();
}

// Render the persistent Tasks panel from the active project's plan steps
function renderTasksUI() {
  const list = document.getElementById('tasks-list');
  const fill = document.getElementById('tasks-progress-fill');
  const label = document.getElementById('tasks-progress-label');
  if (!list) return;

  const steps = planSteps.filter(s => s.enabled);
  if (steps.length === 0) {
    list.innerHTML = `
      <div class="tasks-empty">
        <i data-lucide="list-checks"></i>
        <p>${esc(t('Задач пока нет.'))}</p>
        <p class="tasks-empty-hint">${t('Переключитесь в режим Plan, опишите задачу — агент составит план, и шаги появятся здесь с отслеживанием прогресса.')}</p>
      </div>`;
    if (fill) fill.style.width = '0%';
    if (label) label.textContent = '';
    refreshIcons();
    updatePlanProgressBar();
    return;
  }

  const done = steps.filter(s => s.status === 'done').length;
  const pct = Math.round((done / steps.length) * 100);
  if (fill) fill.style.width = pct + '%';
  if (label) label.textContent = `${done} / ${steps.length} · ${pct}%`;

  list.innerHTML = '';
  steps.forEach((step, idx) => {
    const row = document.createElement('div');
    row.className = `task-row status-${step.status}`;
    const icon = step.status === 'done' ? 'check-circle-2'
      : step.status === 'active' ? 'loader-2'
      : step.status === 'failed' ? 'alert-circle'
      : 'circle';
    row.innerHTML = `
      <span class="task-num">${idx + 1}</span>
      <i data-lucide="${icon}" class="task-status-icon"></i>
      <span class="task-text">${esc(step.text)}</span>
    `;
    list.appendChild(row);
  });
  refreshIcons();
  updatePlanProgressBar();
}

// Unified Preview panel and Tab Visibility state manager
function renderPreview() {
  const activeTab = (document.querySelector('.ptab.active') as HTMLElement)?.dataset.tab || 'preview';
  
  const welcomeFolderPrompt = document.getElementById('welcome-folder-prompt');
  const examplesEl = document.querySelector('.welcome-examples') as HTMLElement;
  
  const hasWorkspace = !!(activeProject && activeProject.workspacePath);
  const btnSidebarOpenExplorer = document.getElementById('btn-sidebar-open-explorer');
  const btnFilesOpenExplorer = document.getElementById('btn-files-open-explorer');
  const snapView = document.getElementById('snapshots-view');
  
  if (btnSidebarOpenExplorer) {
    btnSidebarOpenExplorer.classList.toggle('hidden', !hasWorkspace);
  }
  if (btnFilesOpenExplorer) {
    btnFilesOpenExplorer.style.display = hasWorkspace ? 'inline-flex' : 'none';
  }
  if (snapView) {
    if (activeTab !== 'snapshots') snapView.style.display = 'none';
  }
  const terminalViewEl = document.getElementById('terminal-view');
  if (terminalViewEl && activeTab !== 'terminal') {
    terminalViewEl.style.display = 'none';
  }
  const tasksViewEl = document.getElementById('tasks-view');
  if (tasksViewEl && activeTab !== 'tasks') {
    tasksViewEl.style.display = 'none';
  }
  if (!activeProject) {
    welcomeState.style.display = 'flex';
    if (welcomeFolderPrompt) welcomeFolderPrompt.style.display = 'block';
    if (examplesEl) examplesEl.style.display = 'none';
    iframeWrapper.style.display = 'none';
    codeView.style.display = 'none';
    filesView.style.display = 'none';
    previewIframe.srcdoc = '';
    codeDisplay.textContent = '';
    return;
  }

  // Update starting workspace pick screen state
  if (welcomeFolderPrompt) {
    welcomeFolderPrompt.style.display = hasWorkspace ? 'none' : 'block';
  }
  if (examplesEl) {
    examplesEl.style.display = (hasWorkspace && settings.showExamples) ? 'flex' : 'none';
  }

  if (activeTab === 'preview') {
    if (activeProject.code || hasWorkspace) {
      welcomeState.style.display = 'none';
      iframeWrapper.style.display = 'block';
      codeView.style.display = 'none';
      filesView.style.display = 'none';
      updateLivePreviewFromFiles();
    } else {
      welcomeState.style.display = 'flex';
      iframeWrapper.style.display = 'none';
      codeView.style.display = 'none';
      filesView.style.display = 'none';
      previewIframe.srcdoc = '';
    }
  } else if (activeTab === 'code') {
    welcomeState.style.display = 'none';
    iframeWrapper.style.display = 'none';
    codeView.style.display = 'flex';
    filesView.style.display = 'none';
    codeDisplay.textContent = activeProject.code || '';
  } else if (activeTab === 'files') {
    welcomeState.style.display = 'none';
    iframeWrapper.style.display = 'none';
    codeView.style.display = 'none';
    filesView.style.display = 'flex';
    refreshWorkspaceFilesUI();
  } else if (activeTab === 'terminal') {
    welcomeState.style.display = 'none';
    iframeWrapper.style.display = 'none';
    codeView.style.display = 'none';
    filesView.style.display = 'none';
    const tv = document.getElementById('terminal-view');
    if (tv) tv.style.display = 'flex';
  } else if (activeTab === 'tasks') {
    welcomeState.style.display = 'none';
    iframeWrapper.style.display = 'none';
    codeView.style.display = 'none';
    filesView.style.display = 'none';
    const tv = document.getElementById('tasks-view');
    if (tv) tv.style.display = 'flex';
    renderTasksUI();
  } else if (activeTab === 'snapshots') {
    welcomeState.style.display = 'none';
    iframeWrapper.style.display = 'none';
    codeView.style.display = 'none';
    filesView.style.display = 'none';
    if (snapView) {
      snapView.style.display = 'flex';
    }
    renderSnapshotsUI();
  }
}

// Inline Project renaming inside the sidebar list
function startInlineRename(p: Project, itemElement: HTMLElement) {
  const nameSpan = itemElement.querySelector('.sidebar-project-name') as HTMLElement;
  if (!nameSpan || itemElement.querySelector('.sidebar-project-rename-input')) return;

  const currentName = p.name;
  const metaContainer = itemElement.querySelector('.sidebar-project-item-meta') as HTMLElement;
  
  metaContainer.innerHTML = '';
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'sidebar-project-rename-input';
  input.value = currentName;
  metaContainer.appendChild(input);
  
  const actionsContainer = itemElement.querySelector('.sidebar-project-actions') as HTMLElement;
  if (actionsContainer) actionsContainer.style.opacity = '0';
  
  input.focus();
  input.select();
  
  let finished = false;
  const finish = (save: boolean) => {
    if (finished) return;
    finished = true;
    
    let newName = input.value.trim();
    if (save && newName && newName !== currentName) {
      p.name = newName;
      saveProjects();
      updateProjectNameUI();
    }
    renderSidebarProjects();
  };
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    else if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ─── Planning & Error Recovery Helpers ───

// Show a resume checkpoint card when generation is interrupted (network/provider drop).
// The conversation state is already saved, so the user can continue exactly where it stopped.
function showResumeCard(reason: string) {
  const isNetwork = /failed to fetch|networkerror|network|fetch|таймаут|timeout|econn|enotfound|socket|aborted/i.test(reason || '');
  const friendly = isNetwork
    ? 'Соединение с провайдером прервалось. Контекст диалога сохранён — можно продолжить с того же места.'
    : `Генерация прервана: ${reason}. Контекст сохранён — можно повторить.`;

  const div = document.createElement('div');
  div.className = 'chat-message ai';
  div.innerHTML = `
    <div class="message-text">
      <div class="resume-card">
        <div class="resume-card-title"><i data-lucide="wifi-off"></i><span>${esc(t('Связь прервана'))}</span></div>
        <div class="resume-card-text">${esc(friendly)}</div>
        <div class="resume-card-actions">
          <button class="primary-btn btn-resume"><i data-lucide="play"></i><span>${esc(t('Продолжить'))}</span></button>
        </div>
      </div>
    </div>
  `;
  chatMessages.appendChild(div);
  if (autoScrollEnabled) chatMessages.scrollTop = chatMessages.scrollHeight;
  refreshIcons();

  div.querySelector('.btn-resume')?.addEventListener('click', () => {
    div.remove();
    setGeneratingState(true);
    runAgentStep();
  });
}

// Show recommendation bubble to switch to Plan mode
function showPlanSuggestion(userQuery: string) {
  const div = document.createElement('div');
  div.className = 'chat-message ai';
  div.innerHTML = `
    <div class="message-meta"><span class="sender-name">${esc(t('Ассистент'))}</span></div>
    <div class="message-text">
      <div class="router-suggestion-alert">
        <div class="router-suggestion-title"><i data-lucide="map"></i> ${esc(t('Рекомендуется планирование'))}</div>
        <div class="router-suggestion-text">
          ${esc(t('Похоже, вы хотите создать проект с нуля. Для сложных задач удобнее сначала составить пошаговый план в режиме Plan. Либо можно сразу приступить к разработке.'))}
        </div>
        <div class="router-suggestion-actions">
          <button class="primary-btn btn-switch-to-plan"><i data-lucide="map"></i> ${esc(t('Спланировать (Plan)'))}</button>
          <button class="ghost-btn btn-continue-build" style="border: 1px solid var(--border-default);"><i data-lucide="zap"></i> ${esc(t('Сразу собрать (Build)'))}</button>
        </div>
      </div>
    </div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  refreshIcons();

  div.querySelector('.btn-continue-build')?.addEventListener('click', () => {
    div.remove();
    skipPlanSuggestion = true;
    handleUserMessage(userQuery);
  });
  
  div.querySelector('.btn-switch-to-plan')?.addEventListener('click', () => {
    div.remove();
    appMode = 'plan';
    const tabBuild = document.getElementById('mode-tab-build');
    const tabPlan = document.getElementById('mode-tab-plan');
    if (tabBuild) tabBuild.classList.remove('active');
    if (tabPlan) tabPlan.classList.add('active');
    chatInput.placeholder = t('Опишите, что хотите спроектировать и спланировать...');
    handleUserMessage(userQuery);
  });
}

// Helper to render a single plan step item and attach its event listeners
function renderPlanStepElement(planId: string, idx: number, listContainer: HTMLElement) {
  const step = planSteps[idx];
  const stepItem = document.createElement('div');
  stepItem.className = 'plan-step-item';
  stepItem.id = `step-item-${planId}-${idx}`;
  stepItem.innerHTML = `
    <label class="plan-step-checkbox-container">
      <input type="checkbox" checked id="checkbox-${planId}-${idx}">
      <span class="plan-step-text" id="step-text-${planId}-${idx}">${esc(step.text)}</span>
    </label>
    <div class="plan-step-actions" id="step-actions-${planId}-${idx}">
      <button class="btn-edit-step" id="btn-edit-${planId}-${idx}" title="Редактировать"><i data-lucide="pencil"></i></button>
      <button class="btn-delete-step" id="btn-delete-${planId}-${idx}" title="Удалить"><i data-lucide="trash-2"></i></button>
    </div>
  `;
  listContainer.appendChild(stepItem);

  // Drag and drop sorting support
  stepItem.setAttribute('draggable', 'true');
  stepItem.addEventListener('dragstart', (e: DragEvent) => {
    e.dataTransfer?.setData('text/plain', idx.toString());
    stepItem.classList.add('dragging');
  });
  stepItem.addEventListener('dragend', () => {
    stepItem.classList.remove('dragging');
  });
  stepItem.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
  });
  stepItem.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    const fromIdx = parseInt(e.dataTransfer?.getData('text/plain') || '-1');
    if (fromIdx !== -1 && fromIdx !== idx) {
      const movedItem = planSteps.splice(fromIdx, 1)[0];
      planSteps.splice(idx, 0, movedItem);
      savePlanSteps();
      const parentList = document.getElementById(`plan-steps-list-${planId}`);
      if (parentList) {
        parentList.innerHTML = '';
        planSteps.forEach((_, newIdx) => {
          renderPlanStepElement(planId, newIdx, parentList);
        });
        refreshIcons();
      }
    }
  });

  const chk = stepItem.querySelector(`#checkbox-${planId}-${idx}`) as HTMLInputElement;
  const stepTextEl = stepItem.querySelector(`#step-text-${planId}-${idx}`) as HTMLElement;
  const btnEdit = stepItem.querySelector(`#btn-edit-${planId}-${idx}`);
  const btnDelete = stepItem.querySelector(`#btn-delete-${planId}-${idx}`);

  chk?.addEventListener('change', () => {
    planSteps[idx].enabled = chk.checked;
    savePlanSteps();
    stepItem.classList.toggle('done', !chk.checked);
  });

  btnDelete?.addEventListener('click', () => {
    stepItem.remove();
    planSteps[idx].enabled = false;
    savePlanSteps();
  });

  btnEdit?.addEventListener('click', () => {
    if (!stepTextEl || stepItem.querySelector('.plan-step-edit-input')) return;

    const originalText = planSteps[idx].text;
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'plan-step-edit-input';
    input.value = originalText;

    stepTextEl.style.display = 'none';
    stepTextEl.parentNode?.insertBefore(input, stepTextEl);
    input.focus();
    input.select();

    let finished = false;
    const save = (doSave: boolean) => {
      if (finished) return;
      finished = true;
      const newText = input.value.trim();
      if (doSave && newText) {
        planSteps[idx].text = newText;
        savePlanSteps();
        stepTextEl.textContent = newText;
      }
      input.remove();
      stepTextEl.style.display = '';
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') save(true);
      else if (ev.key === 'Escape') save(false);
    });
    input.addEventListener('blur', () => save(true));
  });
}

function savePlanSteps() {
  if (activeProject) {
    activeProject.planSteps = JSON.parse(JSON.stringify(planSteps));
    saveProjects();
  }
}

function loadPlanSteps() {
  if (activeProject?.planSteps) {
    planSteps = JSON.parse(JSON.stringify(activeProject.planSteps));
  } else {
    planSteps = [];
  }
}

// Render the interactive plan card widget in chat
function renderPlanWidgetInChat(steps: string[]) {
  planApproved = false;
  isExecutingPlan = false;
  currentStepIndex = -1;
  planSteps = steps.map(text => ({ text, enabled: true, status: 'pending' }));
  savePlanSteps();
  renderTasksUI();

  const div = document.createElement('div');
  div.className = 'chat-message ai';

  const planId = genId();
  div.id = `plan-widget-message-${planId}`;

  div.innerHTML = `
    <div class="message-meta"><span class="sender-name">${esc(t('План разработки'))}</span></div>
    <div class="message-text">
      <div class="plan-widget" id="plan-widget-${planId}">
        <div class="plan-widget-header">
          <i data-lucide="map"></i>
          <span>${esc(t('План разработки проекта'))}</span>
        </div>
        <div class="plan-steps-list" id="plan-steps-list-${planId}">
          <!-- Steps will be rendered here dynamically -->
        </div>
        <div class="plan-widget-footer" id="plan-widget-footer-${planId}">
          <button class="ghost-btn tiny" id="btn-add-step-${planId}" title="${esc(t('Добавить новый шаг к плану'))}">
            <i data-lucide="plus"></i><span>${esc(t('Добавить шаг'))}</span>
          </button>
          <button class="primary-btn btn-start-build" id="btn-start-${planId}">
            <i data-lucide="rocket"></i><span>${esc(t('Начать сборку'))}</span>
          </button>
        </div>
      </div>
    </div>
  `;

  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;

  const listContainer = div.querySelector(`#plan-steps-list-${planId}`) as HTMLElement;
  
  // Render initial steps
  planSteps.forEach((_, idx) => {
    renderPlanStepElement(planId, idx, listContainer);
  });

  refreshIcons();

  // Add Step Button Click Listener
  const btnAddStep = div.querySelector(`#btn-add-step-${planId}`);
  btnAddStep?.addEventListener('click', () => {
    const text = prompt(t('Введите описание нового шага:'));
    if (text && text.trim()) {
      planSteps.push({ text: text.trim(), enabled: true, status: 'pending' });
      savePlanSteps();
      renderPlanStepElement(planId, planSteps.length - 1, listContainer);
      refreshIcons();
    }
  });

  // Start build listener
  const btnStart = div.querySelector(`#btn-start-${planId}`);
  btnStart?.addEventListener('click', () => {
    const activeSteps = planSteps.filter(s => s.enabled);
    if (activeSteps.length === 0) {
      alert(t('Пожалуйста, выберите хотя бы один шаг для сборки!'));
      return;
    }

    planApproved = true;
    isExecutingPlan = true;

    const footer = document.getElementById(`plan-widget-footer-${planId}`);
    if (footer) footer.style.display = 'none';

    planSteps.forEach((step, idx) => {
      const itemEl = document.getElementById(`step-item-${planId}-${idx}`);
      if (!step.enabled) {
        itemEl?.remove();
        return;
      }

      const actions = document.getElementById(`step-actions-${planId}-${idx}`);
      if (actions) actions.style.display = 'none';

      const chk = document.getElementById(`checkbox-${planId}-${idx}`);
      if (chk) {
        const spanIcon = document.createElement('span');
        spanIcon.className = 'plan-step-status-icon pending';
        spanIcon.id = `status-icon-${planId}-${idx}`;
        spanIcon.innerHTML = '<i data-lucide="circle" style="color: var(--text-muted); opacity: 0.6;"></i>';
        chk.parentNode?.replaceChild(spanIcon, chk);
      }
    });

    refreshIcons();

    chatInput.disabled = true;
    btnSend.disabled = true;

    // ─── Чёткий переход Plan → Build ───
    appMode = 'build';
    const tBuild = document.getElementById('mode-tab-build');
    const tPlan = document.getElementById('mode-tab-plan');
    tBuild?.classList.add('active');
    tPlan?.classList.remove('active');
    appendBubble('Система', `▶️ ${t('План утверждён. Перехожу в режим разработки. Прогресс — на вкладке «Задачи».')}`, true);
    renderTasksUI();
    switchToPreviewTab('tasks');

    executeNextStep(planId);
  });
}

// Loop to execute next step in plan
async function executeNextStep(planId: string) {
  if (!isExecutingPlan) return;
  const nextIdx = planSteps.findIndex((s) => s.enabled && s.status === 'pending');

  // Auto-snapshot before first step execution
  if (nextIdx === 0) {
    try {
      const autoName = `Авто-снапшот перед сборкой ${new Date().toLocaleString('ru')}`;
      await createSnapshot(autoName, 'Автоматический снапшот перед выполнением плана.');
    } catch (err) {
      console.warn('Auto-snapshot failed (non-critical):', err);
    }
  }
  
  if (nextIdx === -1) {
    isExecutingPlan = false;
    planApproved = false;
    chatInput.disabled = false;
    btnSend.disabled = false;
    
    appendBubble('Ассистент', t('🎉 Сборка завершена! Все шаги плана успешно выполнены.'), true);
    playNotificationSound();
    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification('7/24 IDE', t('🎉 Сборка завершена! Все шаги плана успешно выполнены.'));
    }
    renderTasksUI();
    renderPreview();
    
    // Trigger Reflection
    runReflection();
    return;
  }
  
  executeStepWithMicroAgent(planId, nextIdx);
}

async function generateCommitMessage(diff: string, stepText: string): Promise<string> {
  const model = settings.model || 'google/gemini-2.5-pro';
  const apiKey = settings.apiKey;
  const truncatedDiff = diff.length > 8000 ? diff.substring(0, 8000) + '\n... [truncated]' : diff;

  const prompt = `Ты — Git Commit Message Generator. На основе следующего шага плана и дифф изменений сгенерируй ОДНУ КОРОТКУЮ (до 72 символов) фразу на английском языке для сообщения коммита.
Сообщение должно быть в стиле Conventional Commits или просто кратким описанием сути изменений, например: "feat: add Ollama provider configuration UI".
Не пиши никаких вводных слов, объяснений или разметки. Выведи ТОЛЬКО финальную строку сообщения.

Шаг плана: ${stepText}

Дифф изменений:
\`\`\`diff
${truncatedDiff}
\`\`\``;

  try {
    const url = getLLMUrl('/chat/completions');
    const headers = getLLMHeaders(apiKey);
    const body = getLLMBody({
      model,
      messages: [
        { role: 'system', content: 'You are a git commit helper. Respond with ONLY the commit message string, nothing else.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      stream: false,
    });

    const resp = await fetch(url, {
      method: 'POST',
      headers: headers as any,
      body: JSON.stringify(body),
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.choices && data.choices[0] && data.choices[0].message) {
        const text = data.choices[0].message.content.trim();
        return text.replace(/^["'`]|["'`]$/g, '').trim();
      }
    }
  } catch (err) {
    console.error('Failed to generate commit message via LLM:', err);
  }
  
  return `update for step: ${stepText.substring(0, 50)}`;
}

// Show an interactive card to review/edit the commit message before committing
function showCommitVerificationCard(planId: string, suggestedMsg: string, workspacePath: string): Promise<void> {
  return new Promise((resolve) => {
    const div = document.createElement('div');
    div.className = 'chat-message ai';
    const prefix = settings.gitCommitPrefix || '[AI]';
    
    div.innerHTML = `
      <div class="message-meta"><span class="sender-name">${t('Запрос подтверждения коммита')}</span></div>
      <div class="message-text">
        <div class="plan-error-card" style="border-left-color: var(--accent-blue);">
          <div class="plan-error-title" style="color: var(--accent-blue);">
            <i data-lucide="git-commit"></i>
            <span style="font-weight: 600;">${t('Запрос подтверждения коммита')}</span>
          </div>
          <div class="plan-error-friendly" style="font-size: 13px; color: var(--text-primary); margin-top: 6px;">
            ${t('Отредактируйте сообщение коммита')}:
          </div>
          <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px; background: var(--bg-panel-alt); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-default);">
            <span style="font-family: monospace; font-weight: bold; color: var(--text-secondary); flex-shrink: 0;">${esc(prefix)} </span>
            <input type="text" class="commit-msg-input" style="flex: 1; background: transparent; border: none; color: var(--text-primary); outline: none; font-family: monospace; font-size: 13px;" value="${esc(suggestedMsg)}" />
          </div>
          <div class="plan-error-actions" style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="primary-btn btn-confirm-commit" style="background: var(--accent-blue); display: flex; align-items: center; gap: 4px; border: none; color: white; padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer;"><i data-lucide="check" style="width: 14px; height: 14px;"></i><span>${t('Закоммитить')}</span></button>
            <button class="ghost-btn btn-skip-commit" style="border: 1px solid var(--border-default); display: flex; align-items: center; gap: 4px; padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer;"><i data-lucide="x" style="width: 14px; height: 14px;"></i><span>${t('Пропустить')}</span></button>
          </div>
        </div>
      </div>
    `;
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    refreshIcons();
    
    const input = div.querySelector('.commit-msg-input') as HTMLInputElement;
    if (input) {
      input.focus();
      input.select();
      
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (div.querySelector('.btn-confirm-commit') as HTMLButtonElement)?.click();
        }
      });
    }
    
    div.querySelector('.btn-confirm-commit')?.addEventListener('click', async () => {
      const userMsg = input ? input.value.trim() : suggestedMsg;
      const fullMsg = `${prefix} ${userMsg || suggestedMsg}`;
      div.remove();
      
      appendBubble('Система', `🤖 ${t('Создаю коммит...')} "${fullMsg}"`, true);
      const commitRes = await window.electronAPI.executeCommand(`git commit -m "${fullMsg.replace(/"/g, "'")}"`, workspacePath);
      if (commitRes.code === 0) {
        appendBubble('Система', `✅ ${t('Авто-коммит успешно создан:')} <code>${esc(fullMsg)}</code>`, true);
      } else {
        console.warn('Git commit failed:', commitRes.stderr);
        appendBubble('Система', `⚠️ ${t('Не удалось создать коммит:')} ${commitRes.stderr}`, true);
      }
      resolve();
    });
    
    div.querySelector('.btn-skip-commit')?.addEventListener('click', () => {
      div.remove();
      appendBubble('Система', `⏭️ ${t('Авто-коммит пропущен')}`, true);
      resolve();
    });
  });
}

// Mark current step as completed and advance
async function markStepCompleted(planId: string, idx: number) {
  planSteps[idx].status = 'done';
  savePlanSteps();
  
  const statusIcon = document.getElementById(`status-icon-${planId}-${idx}`);
  if (statusIcon) {
    statusIcon.className = 'plan-step-status-icon done';
    statusIcon.innerHTML = '<i data-lucide="check-circle-2"></i>';
  }
  const itemEl = document.getElementById(`step-item-${planId}-${idx}`);
  if (itemEl) {
    itemEl.classList.remove('active');
    itemEl.classList.add('done');
  }
  refreshIcons();
  renderTasksUI();
  playNotificationSound();

  if (settings.gitAutoCommit && activeProject?.workspacePath) {
    try {
      const gitStatus = await window.electronAPI.executeCommand('git status', activeProject.workspacePath);
      if (gitStatus.code === 0) {
        await window.electronAPI.executeCommand('git add -A', activeProject.workspacePath);
        const diffRes = await window.electronAPI.executeCommand('git diff --cached', activeProject.workspacePath);
        const diff = diffRes.stdout || '';
        
        if (diff.trim()) {
          const stepText = planSteps[idx].text;
          appendBubble('Система', `🤖 ${t('Генерирую коммит для шага:')} "${stepText}"...`, true);
          const commitMsg = await generateCommitMessage(diff, stepText);
          
          if (settings.gitVerifyCommit) {
            await showCommitVerificationCard(planId, commitMsg, activeProject.workspacePath);
          } else {
            const prefix = settings.gitCommitPrefix || '[AI]';
            const fullMsg = `${prefix} ${commitMsg}`;
            const commitRes = await window.electronAPI.executeCommand(`git commit -m "${fullMsg.replace(/"/g, "'")}"`, activeProject.workspacePath);
            
            if (commitRes.code === 0) {
              appendBubble('Система', `✅ ${t('Авто-коммит успешно создан:')} <code>${esc(fullMsg)}</code>`, true);
            } else {
              console.warn('Git commit failed:', commitRes.stderr);
              appendBubble('Система', `⚠️ ${t('Не удалось создать коммит:')} ${commitRes.stderr}`, true);
            }
          }
        }
      }
    } catch (gitErr) {
      console.error('Git auto-commit failed:', gitErr);
    }
  }
  
  if (nextStepTimer !== null) clearTimeout(nextStepTimer);
  nextStepTimer = setTimeout(() => {
    nextStepTimer = null;
    // The user might have hit Stop or switched projects in this 1s gap.
    if (isExecutingPlan) executeNextStep(planId);
  }, 1000);
}

// Pause and render self-healing card on command error
function translateErrorMessage(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('npm err!') || m.includes('npm error')) {
    if (m.includes('enoent') || m.includes('package.json')) {
      return 'Ошибка NPM: Не найден файл package.json в рабочей папке проекта. Пожалуйста, убедитесь, что проект инициализирован.';
    }
    if (m.includes('missing') || m.includes('not found') || m.includes('cannot find module')) {
      return 'Ошибка NPM: Отсутствует необходимый пакет или модуль. Возможно, требуется запустить "npm install".';
    }
    return 'Ошибка NPM при сборке или установке пакетов. Возможно, версия Node.js/NPM несовместима с зависимостями.';
  }
  if (m.includes('cannot find module') || m.includes('module not found')) {
    return 'Ошибка импорта: Файл или модуль не найден в путях сборки. Проверьте правильность путей в импортах.';
  }
  if (m.includes('typescript') || m.includes('ts2307') || m.includes('ts2304')) {
    return 'Ошибка компиляции TypeScript: Обнаружены синтаксические нестыковки или отсутствующие типы данных.';
  }
  if (m.includes('eslint') || m.includes('biome') || m.includes('lint')) {
    return 'Ошибка линтинга: Код не прошел проверку качества (форматирование или потенциальные баги).';
  }
  if (m.includes('permission denied') || m.includes('eacces') || m.includes('eperm')) {
    return 'Ошибка прав доступа: Недостаточно прав для выполнения команды или записи файлов в этой директории.';
  }
  if (m.includes('timeout') || m.includes('timed out')) {
    return 'Превышено время ожидания: Команда выполнялась слишком долго и была принудительно остановлена.';
  }
  return 'Неизвестная системная ошибка или сбой компиляции при сборке.';
}

function showSelfHealingErrorCard(planId: string, command: string, errorMessage: string): Promise<'heal' | 'rebuild'> {
  return new Promise((resolve) => {
    const statusIcon = document.getElementById(`status-icon-${planId}-${currentStepIndex}`);
    if (statusIcon) {
      statusIcon.className = 'plan-step-status-icon failed';
      statusIcon.innerHTML = '<i data-lucide="alert-circle"></i>';
      refreshIcons();
    }
    if (planSteps[currentStepIndex]) {
      planSteps[currentStepIndex].status = 'failed';
      savePlanSteps();
      renderTasksUI();
    }
    
    const friendlyDesc = translateErrorMessage(errorMessage);
    const div = document.createElement('div');
    div.className = 'chat-message ai';
    div.innerHTML = `
      <div class="message-meta"><span class="sender-name">Обработка ошибки</span></div>
      <div class="message-text">
        <div class="plan-error-card">
          <div class="plan-error-title">
            <i data-lucide="alert-triangle" style="color: var(--accent-red);"></i>
            <span>${t('Ошибка сборки на шаге')} ${currentStepIndex + 1}</span>
          </div>
          <div class="plan-error-friendly" style="font-weight: 500; font-size: 13px; color: var(--text-primary); margin-top: 6px;">
            ${friendlyDesc}
          </div>
          <div class="plan-error-desc" style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
            Команда: <code>${esc(command)}</code>
          </div>
          <div class="plan-error-message" style="margin-top: 8px; font-family: monospace; background: var(--bg-panel-alt); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-default); max-height: 150px; overflow-y: auto; font-size: 11px;">
            ${esc(errorMessage)}
          </div>
          <div class="plan-error-actions" style="margin-top: 12px; display: flex; gap: 8px;">
            <button class="primary-btn btn-heal-error"><i data-lucide="heart-pulse"></i><span>${t('Исправить автоматически')}</span></button>
            <button class="ghost-btn btn-rebuild-plan" style="border: 1px solid var(--border-default);"><i data-lucide="git-branch"></i><span>${t('Перестроить план')}</span></button>
          </div>
        </div>
      </div>
    `;
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    refreshIcons();

    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification(
        t('Ошибка'),
        `${t('Ошибка сборки на шаге')} ${currentStepIndex + 1}: ${friendlyDesc}`
      );
    }
    
    div.querySelector('.btn-heal-error')?.addEventListener('click', () => {
      div.remove();

      // Restore the step from "failed" back to "active" so the UI doesn't
      // show a red icon while we retry. The micro-agent loop already has
      // the failed command's result in its history and will pick it up.
      if (planSteps[currentStepIndex]) {
        planSteps[currentStepIndex].status = 'active';
        savePlanSteps();
        renderTasksUI();
      }
      const statusIcon = document.getElementById(`status-icon-${planId}-${currentStepIndex}`);
      if (statusIcon) {
        statusIcon.className = 'plan-step-status-icon active';
        statusIcon.innerHTML = '<i data-lucide="loader-2"></i>';
        refreshIcons();
      }

      // Push the explicit fix-prompt as a HINT for the next agent turn. It
      // lands in the project history (and consequently in the fitted context
      // of the next runAgentStep / micro-agent) so the model knows the user
      // explicitly asked to retry.
      const fixPrompt = `Произошла ошибка при выполнении команды "${command}":\n${errorMessage}\n\nИсправь файлы кода (используя <edit_file> или <write_file>), чтобы команда прошла успешно, затем повтори её.`;
      activeProject?.chatHistory.push({ role: 'user', content: fixPrompt });
      saveProjects();

      resolve('heal');
    });

    div.querySelector('.btn-rebuild-plan')?.addEventListener('click', () => {
      div.remove();
      planSteps[currentStepIndex].status = 'failed';
      savePlanSteps();
      rebuildPlan(planId);
      resolve('rebuild');
    });
  });
}


async function injectMcpToolsIntoPrompt(prompt: string): Promise<string> {
  let mcpTools: any[] = [];
  if (window.electronAPI?.mcpListTools) {
    try {
      mcpTools = await window.electronAPI.mcpListTools();
    } catch (err) {
      console.error('Failed to list MCP tools:', err);
    }
  }

  if (mcpTools.length > 0) {
    prompt += '\n\n## ДОСТУПНЫЕ MCP ИНСТРУМЕНТЫ (Model Context Protocol):\n';
    prompt += 'Ты можешь вызывать следующие внешние инструменты с помощью XML-тегов. Имя тега формируется как mcp__{имя_сервера}__{имя_инструмента}.\n';
    for (const tool of mcpTools) {
      const tag = `mcp__${tool.serverName}__${tool.name}`;
      prompt += `- <${tag}`;
      
      const schema = tool.inputSchema || {};
      const props = schema.properties || {};
      const required = schema.required || [];
      const paramList: string[] = [];
      for (const [propName, propVal] of Object.entries<any>(props)) {
        const desc = propVal.description ? ` (${propVal.description})` : '';
        const reqStr = required.includes(propName) ? ' [REQUIRED]' : '';
        paramList.push(`${propName}="${propVal.type || 'string'}${reqStr}${desc}"`);
      }
      
      if (paramList.length > 0) {
        prompt += ` ${paramList.join(' ')}`;
      }
      prompt += `/> — ${tool.description || ''}\n`;
    }
  }
  return prompt;
}

// ═══════════════════════════════════════════
// SKILLS & TOKEN SAVINGS
// ═══════════════════════════════════════════
function detectActiveSkills(userQuery: string, files: any[]): Skill[] {
  const query = userQuery.toLowerCase();

  // Load dynamic (self-learned) skills from localStorage
  let dynamicSkills: Skill[] = [];
  try {
    const saved = localStorage.getItem('ag_dynamic_skills');
    if (saved) dynamicSkills = JSON.parse(saved);
  } catch (e) {}

  // Score every candidate skill; higher score = more relevant
  const scored: { skill: Skill; score: number; dynamic: boolean }[] = [];
  const consider = (skill: Skill, dynamic: boolean) => {
    let score = 0;
    if (skill.keywords) {
      for (const k of skill.keywords) {
        if (k && query.includes(k.toLowerCase())) score += 2;
      }
    }
    if (skill.files && files && files.length > 0) {
      if (skill.files.some(sf => files.some(f => f.path.toLowerCase().endsWith(sf.toLowerCase())))) {
        score += 1;
      }
    }
    // Self-learned skills get a small priority bump when otherwise tied
    if (score > 0) scored.push({ skill, score: score + (dynamic ? 0.5 : 0), dynamic });
  };

  for (const s of BUILTIN_SKILLS) consider(s, false);
  for (const s of dynamicSkills) consider(s, true);

  // Keep only the 3 most relevant skills to limit prompt size (token economy)
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.skill);
}

function updateTokenStats(promptToks: number, completionToks: number) {
  tokenAccumulated.prompt += promptToks;
  tokenAccumulated.completion += completionToks;
  lastRequestTokens = { prompt: promptToks, completion: completionToks };
  saveTokenAccumulated();
  updateContextBar();
  setTokenIndicator(promptToks, completionToks);
}

function estimateCost(promptToks: number, completionToks: number): number {
  const model = settings.cachedModels.find(m => m.id === settings.model);
  if (!model) return 0;
  // Prefer real pricing from OpenRouter ($ per token)
  if (model.pricePrompt !== undefined || model.priceCompletion !== undefined) {
    const pIn = model.pricePrompt || 0;
    const pOut = model.priceCompletion || 0;
    return promptToks * pIn + completionToks * pOut;
  }
  // Fallback heuristic ($ per 1M tokens) for older cached entries without pricing
  const id = model.id.toLowerCase();
  let inputPrice = 2;   // $ per 1M tokens
  let outputPrice = 8;
  if (id.includes('claude-3-haiku')) { inputPrice = 0.25; outputPrice = 1.25; }
  else if (id.includes('claude-3-sonnet')) { inputPrice = 3; outputPrice = 15; }
  else if (id.includes('claude-3-opus')) { inputPrice = 15; outputPrice = 75; }
  else if (id.includes('claude-3.5-sonnet')) { inputPrice = 3; outputPrice = 15; }
  else if (id.includes('gpt-4o')) { inputPrice = 2.5; outputPrice = 10; }
  else if (id.includes('gpt-4o-mini')) { inputPrice = 0.15; outputPrice = 0.6; }
  else if (id.includes('gpt-4-turbo')) { inputPrice = 10; outputPrice = 30; }
  else if (id.includes('gpt-4')) { inputPrice = 30; outputPrice = 60; }
  else if (id.includes('gpt-3.5')) { inputPrice = 0.5; outputPrice = 1.5; }
  else if (id.includes('deepseek')) { inputPrice = 0.14; outputPrice = 0.28; }
  else if (id.includes('gemini')) { inputPrice = 0.5; outputPrice = 1.5; }
  else if (id.includes('mistral')) { inputPrice = 0.15; outputPrice = 0.6; }
  else if (id.includes('llama')) { inputPrice = 0.18; outputPrice = 0.72; }
  return (promptToks / 1_000_000) * inputPrice + (completionToks / 1_000_000) * outputPrice;
}

function updateContextBar() {
  const barEl = document.getElementById('context-bar-fill');
  const labelEl = document.getElementById('context-bar-label');
  if (!barEl || !labelEl || !settings.model) return;
  const model = settings.cachedModels.find(m => m.id === settings.model);
  const maxCtx = model?.contextLength || 128000;
  const lastUsed = lastRequestTokens.prompt + lastRequestTokens.completion;
  const pct = Math.min((lastUsed / maxCtx) * 100, 100);
  barEl.style.width = pct + '%';
  barEl.classList.toggle('warning', pct > 60);
  barEl.classList.toggle('danger', pct > 85);
  const total = tokenAccumulated.prompt + tokenAccumulated.completion;
  labelEl.textContent = `${(lastUsed / 1000).toFixed(1)}K (${t('запрос')}) · ${(total / 1000).toFixed(0)}K (${t('всего')}) / ${(maxCtx / 1000).toFixed(0)}K`;
  labelEl.title = `${t('Последний запрос')}: ${lastRequestTokens.prompt.toLocaleString()} prompt + ${lastRequestTokens.completion.toLocaleString()} completion\n${t('Всего за сессию')}: ${tokenAccumulated.prompt.toLocaleString()} + ${tokenAccumulated.completion.toLocaleString()}`;
}

// Rough token estimate: ~4 chars per token for mixed RU/EN.
// Cyrillic typically tokenises slightly higher, so this is conservative for English.
function roughTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function totalTokens(messages: { content: string }[]): number {
  let s = 0;
  for (const m of messages) s += roughTokens(m.content || '');
  return s + messages.length * 6; // overhead per message
}

// Drop or summarise old turns until the message list fits the model context.
// Keeps the system prompt + last N important messages intact.
function fitToContext(messages: ChatMessage[], maxCtx: number, reserveForReply: number = 4096): ChatMessage[] {
  const budget = Math.max(2048, Math.floor(maxCtx * 0.85) - reserveForReply);
  if (totalTokens(messages) <= budget) return messages;

  const out = messages.slice();
  // Always keep first system message and last 4 messages
  const KEEP_TAIL = 4;
  while (totalTokens(out) > budget && out.length > 1 + KEEP_TAIL) {
    // Remove the oldest non-system message after the leading system prompt
    let removeIdx = 1;
    if (out[0].role !== 'system') removeIdx = 0;
    out.splice(removeIdx, 1);
  }

  // If still over budget — truncate remaining old messages aggressively
  for (let i = 1; i < out.length - KEEP_TAIL && totalTokens(out) > budget; i++) {
    if (out[i].content && out[i].content.length > 600) {
      out[i] = { ...out[i], content: out[i].content.slice(0, 600) + '\n…[усечено для лимита контекста]' };
    }
  }
  return out;
}


function compressHistory(history: ChatMessage[]): ChatMessage[] {
  // Drop the stored initial system prompt — it is superseded by the dynamic
  // system prompt that is prepended on every request (avoids sending it twice).
  let msgs = history.filter(m => !(m.role === 'system' && !m.content.includes('[Результат выполнения инструментов]')));

  const KEEP_RECENT = 6;       // last N messages are always kept verbatim
  const MAX_OLD_TOOL = 600;    // max chars for an old tool-result message
  const cutoff = msgs.length - KEEP_RECENT;

  const compressed: ChatMessage[] = [];
  for (let i = 0; i < msgs.length; i++) {
    const isRecent = i >= cutoff;
    const msg = { ...msgs[i] };

    if (!isRecent) {
      // Drop trivial short "continue"-style user prompts from old history
      if (msg.role === 'user' && msg.content.trim().length < 20) continue;

      // Aggressively summarise old tool-result blocks
      if (msg.role === 'system' && msg.content.includes('[Результат выполнения инструментов]')) {
        // Collapse long stdout/stderr dumps
        msg.content = msg.content.replace(/Stdout:\n[\s\S]*?(?=\nStderr:|$)/g, (m) =>
          m.length > 200 ? 'Stdout:\n[вывод сжат для экономии токенов]' : m);
        // Hard cap the whole block
        if (msg.content.length > MAX_OLD_TOOL) {
          msg.content = msg.content.slice(0, MAX_OLD_TOOL) + '\n…[старый результат инструментов усечён]';
        }
      }

      // Trim very long old assistant/user messages, keeping the head
      if ((msg.role === 'assistant' || msg.role === 'user') && msg.content.length > 1200) {
        msg.content = msg.content.slice(0, 1200) + '\n…[сообщение усечено]';
      }
    }

    compressed.push(msg);
  }

  return compressed;
}

// Total token accumulator (loaded per project from localStorage)
let tokenAccumulated = { prompt: 0, completion: 0 };
let lastRequestTokens = { prompt: 0, completion: 0 };

function loadTokenAccumulated() {
  if (activeProject) {
    tokenAccumulated = {
      prompt: activeProject.totalTokensPrompt || 0,
      completion: activeProject.totalTokensCompletion || 0,
    };
  } else {
    tokenAccumulated = { prompt: 0, completion: 0 };
  }
  lastRequestTokens = { prompt: 0, completion: 0 };
}

function saveTokenAccumulated() {
  if (activeProject) {
    activeProject.totalTokensPrompt = tokenAccumulated.prompt;
    activeProject.totalTokensCompletion = tokenAccumulated.completion;
    saveProjects();
  }
}

// ═══════════════════════════════════════════
// AGENT CONCURRENCY LOOP
// ═══════════════════════════════════════════
function parseTools(text: string): AgentTool[] {
  const tools: AgentTool[] = [];
  let match;

  // 1. Read dir
  const rawReadDir = /<read_dir\b([^>]*)\s*(?:\/>|>\s*<\/read_dir>|>)/g;
  while ((match = rawReadDir.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (attrs.path) tools.push({ type: 'read_dir', params: { path: attrs.path }, rawTag: match[0] });
  }

  // 2. Read file
  const rawReadFile = /<read_file\b([^>]*)\s*(?:\/>|>\s*<\/read_file>|>)/g;
  while ((match = rawReadFile.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (attrs.path) {
      tools.push({
        type: 'read_file',
        params: {
          path: attrs.path,
          full: attrs.full === 'true'
        },
        rawTag: match[0]
      });
    }
  }

  // 3. Write file
  const rawWriteFile = /<write_file\b([^>]*)>([\s\S]*?)(?:<\/write_file>|$)/g;
  while ((match = rawWriteFile.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (attrs.path) tools.push({ type: 'write_file', params: { path: attrs.path, content: match[2] }, rawTag: match[0] });
  }

  // 4. Edit file
  const rawEditFile = /<edit_file\b([^>]*)>([\s\S]*?)(?:<\/edit_file>|$)/g;
  while ((match = rawEditFile.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    const innerContent = match[2];
    const searchMatch = innerContent.match(/<search>([\s\S]*?)(?:<\/search>|$)/);
    const replaceMatch = innerContent.match(/<replace>([\s\S]*?)(?:<\/replace>|$)/);
    if (attrs.path && searchMatch && replaceMatch) {
      tools.push({
        type: 'edit_file',
        params: { path: attrs.path, search: searchMatch[1], replace: replaceMatch[1] },
        rawTag: match[0]
      });
    }
  }

  // 5. Execute command
  const rawExecCmd = /<execute_command\b([^>]*)\s*(?:\/>|>\s*<\/execute_command>|>)/g;
  while ((match = rawExecCmd.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (attrs.command) tools.push({ type: 'execute_command', params: { command: attrs.command }, rawTag: match[0] });
  }

  // 6. List components
  const rawListComp = /<list_components\s*(?:\/>|>\s*<\/list_components>)/g;
  while ((match = rawListComp.exec(text)) !== null) {
    tools.push({ type: 'list_components', params: {}, rawTag: match[0] });
  }

  // 7. Check image size
  const rawCheckImgSize = /<check_image_size\b([^>]*)\s*(?:\/>|>\s*<\/check_image_size>)/g;
  while ((match = rawCheckImgSize.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (attrs.path) tools.push({ type: 'check_image_size', params: { path: attrs.path }, rawTag: match[0] });
  }

  // 8. Search code (lightweight codebase search)
  const rawSearchCode = /<search_code\b([^>]*)\s*(?:\/>|>\s*<\/search_code>|>)/g;
  while ((match = rawSearchCode.exec(text)) !== null) {
    const attrs = parseXmlAttrs(match[1]);
    if (attrs.query) tools.push({ type: 'search_code', params: { query: attrs.query }, rawTag: match[0] });
  }

  // 9. Generic MCP tools parsing
  const rawMcpTool = /<(mcp__[a-zA-Z0-9_-]+__[a-zA-Z0-9_-]+)\s+([^>]*?)(?:\/>|>\s*<\/\1>)/g;
  while ((match = rawMcpTool.exec(text)) !== null) {
    const fullTagName = match[1];
    const attrString = match[2];
    
    // Parse attributes key="value" or key='value'
    const params: Record<string, string> = {};
    Object.assign(params, parseXmlAttrs(attrString));
    
    tools.push({ type: fullTagName, params, rawTag: match[0] });
  }

  return tools;
}

function setGeneratingState(generating: boolean) {
  isGenerating = generating;
  btnSend.disabled = generating || chatInput.value.trim().length === 0;

  const btnStop = document.getElementById('btn-stop-generation');
  if (btnStop) {
    btnStop.classList.toggle('hidden', !generating);
  }

  const ghostUi = document.getElementById('ghost-ui-overlay');
  if (ghostUi) {
    ghostUi.classList.add('hidden');
  }

  // Modern activity bar replaces the old "Generating..." pill + current-action.
  // Honour the "show generation indicator" setting (settings.showLoading).
  const activityBar = document.getElementById('agent-activity-bar');
  if (activityBar) activityBar.classList.toggle('hidden', !(generating && settings.showLoading !== false));

  if (!generating) {
    removeThinking();
    setCurrentAction('');
    setActivityTool('');
    // Counters are sticky for one cycle — they reset before the next request
    // (see resetActivityCounters() below). We don't reset them here, so the
    // user can see "8 files changed" even after generation finishes.
    updatePlanProgressBar();
  } else {
    updatePlanProgressBar();
  }
}

function setCurrentAction(text: string) {
  // New: drives the activity-bar caption. Old DOM nodes are kept hidden via CSS
  // for backwards compatibility but no longer reflect anything.
  const aabText = document.getElementById('aab-text');
  if (aabText) {
    aabText.textContent = text || (isGenerating ? t('Подготовка...') : '');
  }
}

function setActivityTool(line: string) {
  const el = document.getElementById('aab-tool');
  if (!el) return;
  el.textContent = line || '';
}

// ─── Activity counters: files touched + tokens of last request ──
const touchedFilesThisRun = new Set<string>();

function noteFileTouched(filePath: string) {
  if (!filePath) return;
  touchedFilesThisRun.add(filePath);
  const counter = document.getElementById('aab-files');
  const num = document.getElementById('aab-files-n');
  if (counter && num) {
    counter.classList.remove('hidden');
    num.textContent = String(touchedFilesThisRun.size);
  }
}

function resetActivityCounters() {
  touchedFilesThisRun.clear();
  const fc = document.getElementById('aab-files');
  if (fc) fc.classList.add('hidden');
  const tc = document.getElementById('aab-tokens');
  if (tc) tc.classList.add('hidden');
}

function setTokenIndicator(prompt: number, completion: number) {
  const counter = document.getElementById('aab-tokens');
  const num = document.getElementById('aab-tokens-n');
  if (!counter || !num) return;
  const total = (prompt || 0) + (completion || 0);
  if (total <= 0) return;
  counter.classList.remove('hidden');
  num.textContent = total >= 1000 ? `${(total / 1000).toFixed(1)}K` : String(total);
}

// ─── Sticky plan-progress bar above the chat ──
function updatePlanProgressBar() {
  const bar = document.getElementById('plan-progress-bar');
  const titleEl = document.getElementById('ppb-title');
  const countsEl = document.getElementById('ppb-counts');
  const fillEl = document.getElementById('ppb-fill');
  const currentEl = document.getElementById('ppb-current');
  if (!bar || !titleEl || !countsEl || !fillEl || !currentEl) return;

  // Hide unless there's an actual plan being built (or just finished).
  const enabled = planSteps.filter(s => s.enabled);
  const hasPlan = enabled.length > 0 && (isExecutingPlan || planApproved || enabled.some(s => s.status === 'done' || s.status === 'active' || s.status === 'failed'));
  if (!hasPlan) {
    bar.classList.add('hidden');
    return;
  }

  bar.classList.remove('hidden');

  const total = enabled.length;
  const done = enabled.filter(s => s.status === 'done').length;
  const failed = enabled.find(s => s.status === 'failed');
  const active = enabled.find(s => s.status === 'active');

  countsEl.textContent = `${done}/${total}`;

  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  fillEl.style.width = `${pct}%`;

  if (failed) {
    titleEl.textContent = t('Ошибка на шаге') + ' ' + (planSteps.indexOf(failed) + 1);
    currentEl.textContent = failed.text;
  } else if (active) {
    titleEl.textContent = `${t('Шаг')} ${planSteps.indexOf(active) + 1}: ${t('идёт сборка')}`;
    currentEl.textContent = active.text;
  } else if (done === total) {
    titleEl.textContent = t('План завершён');
    currentEl.textContent = '';
  } else {
    titleEl.textContent = t('Выполнение плана');
    const next = enabled.find(s => s.status === 'pending');
    currentEl.textContent = next ? next.text : '';
  }
}

function applyTheme() {
  const theme = settings.theme || 'light';
  document.body.classList.remove('theme-dark');
  
  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
  } else if (theme === 'system') {
    const darkMatches = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (darkMatches) {
      document.body.classList.add('theme-dark');
    }
  }
}

// Re-apply the theme live when the OS scheme changes (only matters for "system").
let _systemThemeListenerAttached = false;
function setupSystemThemeListener() {
  if (_systemThemeListenerAttached) return;
  _systemThemeListenerAttached = true;
  try {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', () => {
      if ((settings.theme || 'light') === 'system') applyTheme();
    });
  } catch {
    /* matchMedia change events unsupported — non-fatal */
  }
}

function applyVisualSettings() {
  const root = document.documentElement;
  root.style.setProperty('--font-ui', `"${settings.uiFont || 'Inter'}", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`);
  root.style.setProperty('--font-code', `"${settings.codeFont || 'JetBrains Mono'}", Menlo, Monaco, Consolas, monospace`);
  document.body.style.fontSize = (settings.fontSize || 13) + 'px';
}

function renderAttachedFiles() {
  const bar = document.getElementById('attached-files-bar');
  if (!bar) return;
  
  bar.innerHTML = '';
  if (attachedFiles.size === 0) {
    bar.classList.add('hidden');
    return;
  }
  
  bar.classList.remove('hidden');
  
  // Add clear all button
  const clearBtn = document.createElement('button');
  clearBtn.className = 'attached-clear-all';
  clearBtn.title = t('Очистить все');
  clearBtn.innerHTML = `<i data-lucide="x-circle"></i> ${esc(t('Очистить'))}`;
  clearBtn.addEventListener('click', () => {
    attachedFiles.clear();
    renderAttachedFiles();
  });
  bar.appendChild(clearBtn);
  
  for (const f of attachedFiles) {
    const chip = document.createElement('div');
    chip.className = 'file-chip';
    const basename = f.split(/[\\/]/).pop() || f;
    
    chip.innerHTML = `
      <i data-lucide="file-code"></i>
      <span class="file-chip-name" title="${esc(f)}">${esc(basename)}</span>
      <span class="file-chip-remove" data-path="${esc(f)}">
        <i data-lucide="x"></i>
      </span>
    `;
    
    chip.querySelector('.file-chip-remove')?.addEventListener('click', (e) => {
      e.stopPropagation();
      attachedFiles.delete(f);
      renderAttachedFiles();
    });
    
    bar.appendChild(chip);
  }
  refreshIcons();
}

function renderPinnedFiles() {
  const bar = document.getElementById('pinned-files-bar');
  const list = document.getElementById('pinned-files-list');
  if (!bar || !list || !activeProject) return;
  
  const pinned = activeProject.pinnedFiles || [];
  if (pinned.length === 0) {
    bar.classList.add('hidden');
    return;
  }
  
  bar.classList.remove('hidden');
  list.innerHTML = '';
  for (const f of pinned) {
    const chip = document.createElement('div');
    chip.className = 'pinned-file-chip';
    const basename = f.split(/[\\/]/).pop() || f;
    chip.innerHTML = `
      <i data-lucide="file-text"></i>
      <span class="pinned-file-chip-name" title="${esc(f)}">${esc(basename)}</span>
      <span class="pinned-file-remove" data-path="${esc(f)}"><i data-lucide="x"></i></span>
    `;
    chip.querySelector('.pinned-file-remove')?.addEventListener('click', () => {
      removePinnedFile(f);
    });
    list.appendChild(chip);
  }
  refreshIcons();
}

function addPinnedFile(filePath: string) {
  if (!activeProject) return;
  if (!activeProject.pinnedFiles) activeProject.pinnedFiles = [];
  if (activeProject.pinnedFiles.includes(filePath)) return;
  activeProject.pinnedFiles.push(filePath);
  saveProjects();
  renderPinnedFiles();
}

function removePinnedFile(filePath: string) {
  if (!activeProject || !activeProject.pinnedFiles) return;
  activeProject.pinnedFiles = activeProject.pinnedFiles.filter(f => f !== filePath);
  saveProjects();
  renderPinnedFiles();
}

async function handleUserMessage(text: string) {
  if (isGenerating || !text.trim()) return;
  if (!settings.apiKey) { openSettings(); return; }
  if (!settings.model) { appendBubble('7/24 IDE', t('⚠️ Выберите модель в Настройках → Модели.'), true); return; }

  // Auto-update user profile from query
  autoUpdateUserProfile(text);

  // Query routing analysis to recommend Plan mode (only on the first message of a chat,
  // and only if the user hasn't already chosen to continue in Build)
  const queryLower = text.toLowerCase();
  const scratchKeywords = ['с нуля', 'создай', 'сделать проект', 'разработай', 'новый проект', 'создай приложение', 'сделать приложение'];
  const isFirstMessage = !activeProject || activeProject.chatHistory.filter(m => m.role === 'user').length === 0;
  if (appMode === 'build' && !skipPlanSuggestion && isFirstMessage && scratchKeywords.some(kw => queryLower.includes(kw))) {
    showPlanSuggestion(text);
    return;
  }
  skipPlanSuggestion = false;

  if (!activeProject) {
    const p = createProject(text.slice(0, 40));
    switchToProject(p);
  }

  if (!activeProject!.workspacePath) {
    appendBubble('Система', t('📂 Рабочая папка не выбрана. Агент не сможет читать и сохранять файлы. Нажмите «Открыть» внизу боковой панели слева, чтобы выбрать папку.'), true);
  }

  setGeneratingState(true);

  appendBubble('Вы', text, false);
  autoScrollEnabled = true;
  buildSessionWroteFiles = false;
  resetActivityCounters();
  chatMessages.scrollTop = chatMessages.scrollHeight;

  // Read attached files context
  let contextPayload = '';
  const filesToRead = new Set<string>();
  // Add attached files (temporary)
  for (const f of attachedFiles) filesToRead.add(f);
  // Add pinned files (persistent)
  if (activeProject?.pinnedFiles) {
    for (const f of activeProject.pinnedFiles) filesToRead.add(f);
  }
  if (filesToRead.size > 0 && activeProject && activeProject.workspacePath) {
    contextPayload = '=== ПРИКРЕПЛЕННЫЙ КОНТЕКСТ ФАЙЛОВ ===\n';
    for (const filePath of filesToRead) {
      // Skip image files — text model cannot read them
      const imgExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg', '.avif'];
      const ext = filePath.toLowerCase().split('.').pop();
      if (ext && imgExts.includes('.' + ext)) {
        contextPayload += `Файл ${filePath} пропущен — модель не поддерживает изображения.\n\n`;
        continue;
      }
      try {
        const content = await window.electronAPI.readFile(filePath, activeProject.workspacePath, settings.sandboxEnabled);
        contextPayload += `Файл: ${filePath}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      } catch (err: any) {
        contextPayload += `Не удалось прочитать файл ${filePath}: ${err.message}\n\n`;
      }
    }
contextPayload += '=====================================\n\n';
  }

  let userQuery = text;
  if (selectedComponentContext) {
    userQuery = `${selectedComponentContext}\n\nПользовательский запрос по этому конкретному компоненту: ${text}`;
    selectedComponentContext = null;
    updateComponentContextUI();
    // Restore placeholder based on current mode
    chatInput.placeholder = appMode === 'plan' ? t('Опишите, что хотите спроектировать и спланировать...') : t('Опишите, что хотите создать или исправить...');
  }

  const fullPrompt = contextPayload ? `${contextPayload}${userQuery}` : userQuery;

  // Clear attached files context after sending
  attachedFiles.clear();
  renderAttachedFiles();

  activeProject!.chatHistory.push({ role: 'user', content: fullPrompt });
  saveProjects();
  renderSidebarProjects();

  // Silent auto-checkpoint before the agent modifies anything
  await autoCheckpoint(`Перед запросом ${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`);

  agentStepCount = 0;
  runAgentStep();
}

// ═══════════════════════════════════════════
// MESSAGE EDIT & REGENERATE
// ═══════════════════════════════════════════

function getMsgIndexInHistory(msgEl: HTMLElement): number {
  const msgText = msgEl.querySelector('.message-text')?.textContent?.trim() || '';
  const isAi = msgEl.classList.contains('ai');
  for (let i = activeProject!.chatHistory.length - 1; i >= 0; i--) {
    const h = activeProject!.chatHistory[i];
    if (!isAi && h.role === 'user' && h.content.includes(msgText.substring(0, 20))) return i;
    if (isAi && h.role === 'assistant') {
      // AI content is raw markdown with XML tags; DOM textContent strips all HTML.
      // Use a fuzzy prefix match instead of strict equality.
      const stripped = h.content.replace(/<[^>]*>/g, '').trim();
      if (stripped.substring(0, 80) === msgText.substring(0, 80) || h.content.substring(0, 80) === msgText.substring(0, 80)) return i;
    }
  }
  return -1;
}

function startEditMessage(msgEl: HTMLElement) {
  if (!activeProject || isGenerating) return;
  const idx = getMsgIndexInHistory(msgEl);
  if (idx < 0) return;
  const msg = activeProject.chatHistory[idx];
  if (msg.role !== 'user') return;

  const textDiv = msgEl.querySelector('.message-text') as HTMLElement;
  if (!textDiv || msgEl.querySelector('.edit-input-inline')) return;
  textDiv.style.display = 'none';

  const input = document.createElement('textarea');
  input.className = 'edit-input-inline';
  input.value = msg.content;
  textDiv.after(input);

  const btns = document.createElement('div');
  btns.className = 'edit-actions-inline';
  btns.innerHTML = '<button class="btn-cancel-edit">Отмена</button><button class="btn-save-edit">Отправить</button>';
  input.after(btns);

  // Hide action bar while editing
  const actionsBar = msgEl.querySelector('.msg-actions') as HTMLElement;
  if (actionsBar) actionsBar.style.display = 'none';

  input.focus();
  const finish = (save: boolean) => {
    const newText = input.value.trim();
    input.remove();
    btns.remove();
    if (actionsBar) actionsBar.style.display = '';
    textDiv.style.display = '';
    if (save && newText && newText !== msg.content) {
      // Remove messages from this point onward
      activeProject!.chatHistory.splice(idx);
      // Re-render
      renderChatHistory();
      saveProjects();
      // Send the new message
      if (newText) {
        chatInput.value = '';
        handleUserMessage(newText);
      }
    }
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) finish(true);
    else if (ev.key === 'Escape') finish(false);
  });
  btns.querySelector('.btn-save-edit')?.addEventListener('click', () => finish(true));
  btns.querySelector('.btn-cancel-edit')?.addEventListener('click', () => finish(false));
}

function regenerateFromMessage(msgEl: HTMLElement) {
  if (!activeProject || isGenerating) return;
  const idx = getMsgIndexInHistory(msgEl);
  if (idx < 0) return;
  const msg = activeProject.chatHistory[idx];
  if (msg.role !== 'assistant') return;

  // Find the last user message before this AI message
  let userIdx = -1;
  for (let i = idx - 1; i >= 0; i--) {
    if (activeProject.chatHistory[i].role === 'user') { userIdx = i; break; }
  }
  if (userIdx < 0) return;

  // Truncate history from the AI message onward (keep everything before it)
  activeProject.chatHistory.splice(idx);
  saveProjects();

  // Re-render chat
  renderChatHistory();

  // Re-run the agent from the last user message
  agentStepCount = 0;
  setGeneratingState(true);
  runAgentStep();
}

function branchFromMessage(msgEl: HTMLElement) {
  if (!activeProject || isGenerating) return;
  const idx = getMsgIndexInHistory(msgEl);
  if (idx < 0) return;

  // Clone history up to and including this message
  const branchHistory = activeProject.chatHistory.slice(0, idx + 1).map(m => ({ ...m }));

  // Create a new project with branched history
  const branchName = `${activeProject.name} (ветка)`;
  const newProject: Project = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: branchName,
    workspacePath: activeProject.workspacePath,
    chatHistory: branchHistory,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    code: '',
    scopePath: activeProject.scopePath || '',
    pinnedFiles: [...(activeProject.pinnedFiles || [])],
  };
  projects.unshift(newProject);
  saveProjects();
  renderSidebarProjects();
  switchToProject(newProject);
  appendBubble('7/24 IDE', t('🔀 Ветка создана. История скопирована до выбранного сообщения.'), true);
}

function rerunToolFromIndex(toolIdx: number) {
  if (!activeProject || isGenerating) return;
  if (toolIdx < 0) return;

  // Find the last AI message
  const aiMessages = activeProject.chatHistory.filter(m => m.role === 'assistant');
  if (aiMessages.length === 0) return;
  const lastAi = aiMessages[aiMessages.length - 1];

  // Find the user message that triggered the last AI response
  const lastAiIdx = activeProject.chatHistory.indexOf(lastAi);
  let userIdx = -1;
  for (let i = lastAiIdx - 1; i >= 0; i--) {
    if (activeProject.chatHistory[i].role === 'user') {
      userIdx = i;
      break;
    }
  }
  if (userIdx < 0) return;

  // Truncate everything after the user message and re-run
  activeProject.chatHistory.splice(userIdx + 1);
  saveProjects();
  renderChatHistory();

  agentStepCount = 0;
  setGeneratingState(true);
  runAgentStep();
}


async function runAgentStep() {
  try {
    if (!activeProject) {
      setGeneratingState(false);
      return;
    }
    if (agentStepCount >= MAX_AGENT_STEPS) {
      setGeneratingState(false);
      appendBubble('Ассистент', t('⚠️ Достигнут лимит автономной сессии (20 шагов). Для продолжения отправьте новое сообщение.'), true);
      playNotificationSound();
      return;
    }

    agentStepCount++;
    showThinking();
    
    if (appMode === 'plan' && !planApproved) {
      setCurrentAction(t('🧠 Планирование...'));
    } else if (isExecutingPlan && currentStepIndex >= 0) {
      setCurrentAction(`📋 ${t('Шаг')} ${currentStepIndex + 1}: ${planSteps[currentStepIndex]?.text || ''}`);
    } else {
      setCurrentAction(t('🔧 Выполнение задачи...'));
    }

    // Detect dynamic skills
    let workspaceFiles: any[] = [];
    if (activeProject && activeProject.workspacePath) {
      try {
        workspaceFiles = await window.electronAPI.readDir(activeProject.workspacePath);
      } catch (e) {}
    }
    const lastUserMsg = activeProject!.chatHistory.filter(m => m.role === 'user').pop()?.content || '';
    const activeSkills = detectActiveSkills(lastUserMsg, workspaceFiles);

    let dynamicSystemPrompt = appMode === 'plan' && !planApproved ? SYSTEM_PROMPT_PLAN : SYSTEM_PROMPT_BUILD;
    dynamicSystemPrompt = await injectMcpToolsIntoPrompt(dynamicSystemPrompt);

    // Language-aware addendum: tell the model to answer in the user's UI language.
    const lang = settings.language || 'ru';
    if (lang === 'en') {
      dynamicSystemPrompt += '\n\n## LANGUAGE: Reply in clear, concise English. UI strings in code may stay in any language the user prefers.';
    } else if (lang === 'zh') {
      dynamicSystemPrompt += '\n\n## 语言：用简洁的中文回复用户。代码中的 UI 字符串可以保留用户偏好的任何语言。';
    } // ru — default; existing prompts already require Russian

    // Inject the user-defined system prompt override, if set in Settings
    if (settings.systemPrompt && settings.systemPrompt.trim() && settings.systemPrompt !== DEFAULT_SYSTEM_PROMPT) {
      dynamicSystemPrompt += `\n\n## ПОЛЬЗОВАТЕЛЬСКИЕ ПРАВИЛА (custom system prompt)\n${settings.systemPrompt.trim()}`;
    }
    
    // Inject User Profile preferences
    let profile = { codingStyle: '', libraries: [] as string[], customNotes: '' };
    try {
      const saved = localStorage.getItem('ag_user_profile');
      if (saved) profile = JSON.parse(saved);
    } catch (e) {}

    if (profile.codingStyle || (profile.libraries && profile.libraries.length > 0) || profile.customNotes) {
      dynamicSystemPrompt += '\n\n## ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ И ПРЕДПОЧТЕНИЯ (User Model)\nУчитывай следующие требования пользователя при написании кода:\n';
      if (profile.codingStyle) dynamicSystemPrompt += `- Стиль кода: ${profile.codingStyle}\n`;
      if (profile.libraries && profile.libraries.length > 0) dynamicSystemPrompt += `- Библиотеки: ${profile.libraries.join(', ')}\n`;
      if (profile.customNotes) dynamicSystemPrompt += `- Примечания: ${profile.customNotes}\n`;
    }

    if (activeSkills.length > 0) {
      dynamicSystemPrompt += '\n\nПОДКЛЮЧЕННЫЕ НАВЫКИ И ПРАВИЛА:\n';
      for (const skill of activeSkills) {
        dynamicSystemPrompt += `\n--- НАВЫК: ${skill.name} ---\n${skill.content}\n`;
      }
    }

    // Inject Plan-mode specific prompt configurations
    if (appMode === 'plan' && !planApproved) {
      dynamicSystemPrompt += `\n\nВНИМАНИЕ: Пользователь хочет спроектировать/спланировать проект. Твоя единственная задача на этом этапе — составить пошаговый план разработки.
      Ты ДОЛЖЕН перечислить все необходимые шаги внутри специальных XML-тегов:
      <plan>
        <step>Описание шага 1</step>
        <step>Описание шага 2</step>
      </plan>
      Не пиши исходный код и не вызывай инструменты записи/изменения файлов (<write_file> и <edit_file>). Только подготовить план. Отвечай кратко на русском языке.`;
    } else if (isExecutingPlan && currentStepIndex !== -1) {
      dynamicSystemPrompt += `\n\nВНИМАНИЕ: Мы находимся в режиме сборки проекта по плану.
      Сейчас выполняется ШАГ ${currentStepIndex + 1}: "${planSteps[currentStepIndex].text}".
      Твоя задача — реализовать именно этот шаг. Когда шаг будет полностью выполнен, выведи в конце фразу "Шаг выполнен." для продвижения FSM автомата.`;
    }

    // Construct chat completion history with context-window safety
    const compressed = compressHistory(activeProject!.chatHistory);
    const modelInfo = settings.cachedModels.find(m => m.id === settings.model);
    const maxCtx = modelInfo?.contextLength || 128000;
    const fitted = fitToContext(
      [{ role: 'system', content: dynamicSystemPrompt }, ...compressed],
      maxCtx,
      settings.maxTokens || 4096
    );
    const messages = fitted;

    let result: any = null;
    try {
      result = await streamChatCompletionWithFallback(messages);
    } catch (innerError: any) {
      if (innerError?.message === 'Генерация прервана.') {
        setGeneratingState(false);
        return;
      }
      throw innerError;
    }
      
    // Update token stats with usage from this response
    if (result.usage) {
      updateTokenStats(result.usage.prompt_tokens || 0, result.usage.completion_tokens || 0);
    }

    // Guard against the user deleting/switching the project mid-generation.
    if (!activeProject) {
      setGeneratingState(false);
      return;
    }

    // Log assistant reply
    activeProject.chatHistory.push({
      role: 'assistant',
      content: result.content,
      reasoningContent: result.reasoningContent,
      usage: result.usage ? { prompt: result.usage.prompt_tokens, completion: result.usage.completion_tokens } : undefined
    });
    saveProjects();

    const tools = (result as any).nativeTools && (result as any).nativeTools.length > 0
      ? (result as any).nativeTools as AgentTool[]
      : parseTools(result.content);

    if (tools.length === 0) {
      setGeneratingState(false);
      
      // If plan mode, parse the plan steps from XML
      if (appMode === 'plan' && !planApproved) {
        const planMatch = result.content.match(/<plan>([\s\S]*?)<\/plan>/);
        if (planMatch) {
          const steps = [];
          const stepRegex = /<step>([\s\S]*?)<\/step>/g;
          let sm;
          while ((sm = stepRegex.exec(planMatch[1])) !== null) {
            steps.push(sm[1].trim());
          }
          if (steps.length > 0) {
            // Remove the raw text bubble and render our custom plan card widget
            const bubbles = chatMessages.querySelectorAll('.chat-message.ai');
            if (bubbles.length > 0) {
              bubbles[bubbles.length - 1].remove();
            }
            renderPlanWidgetInChat(steps);
          }
        }
      } else if (isExecutingPlan && currentStepIndex !== -1) {
        // Automatically advance steps if agent finished the step
        const planId = document.querySelector('.plan-widget')?.id?.replace('plan-widget-', '') || '';
        markStepCompleted(planId, currentStepIndex);
      } else if (!isExecutingPlan && buildSessionWroteFiles) {
        // Self-learning: after a Build session that actually changed files,
        // run a lightweight reflection to capture a reusable skill.
        buildSessionWroteFiles = false;
        runReflection();
      }
    } else {
      await executeToolsSequentially(tools);
    }
  } catch (error: any) {
    setGeneratingState(false);
    console.error('Agent loop crashed:', error);
    showResumeCard(error?.message || String(error));
    playNotificationSound();
  }
}



async function executeToolsSequentially(tools: AgentTool[]) {
  const results: string[] = [];
  
  const aiBubbles = chatMessages.querySelectorAll('.chat-message.ai');
  const lastAiBubble = aiBubbles[aiBubbles.length - 1];

  for (let i = 0; i < tools.length; i++) {
    if (!isGenerating) {
      break;
    }

    const tool = tools[i];
    const accordion = lastAiBubble?.querySelector(`.tool-step-${i}`);
    
    let opLabel = tool.type === 'read_dir' ? `📁 Чтение: ${tool.params.path}` :
                    tool.type === 'read_file' ? `📄 Исследование: ${tool.params.path}` :
                    tool.type === 'write_file' ? `✏️ Создание: ${tool.params.path}` :
                    tool.type === 'edit_file' ? `✏️ Правка: ${tool.params.path}` :
                    tool.type === 'execute_command' ? `⚡ Выполнение: ${tool.params.command.substring(0, 40)}` :
                    tool.type === 'list_components' ? `🔍 Поиск компонентов...` :
                    tool.type === 'search_code' ? `🔎 Поиск в коде: ${tool.params.query}` :
                    tool.type === 'check_image_size' ? `🖼️ Анализ: ${tool.params.path}` : '⚙️ Выполнение...';

    if (tool.type.startsWith('mcp__')) {
      const parts = tool.type.split('__');
      const server = parts[1];
      const name = parts.slice(2).join('__');
      opLabel = `🛠️ [MCP] ${server}/${name}`;
    }
    showActiveOp(opLabel);
    setCurrentAction(opLabel);
    
    if (accordion) {
      const statusEl = accordion.querySelector('.tool-accordion-status');
      if (statusEl) {
        statusEl.className = 'tool-accordion-status running';
        statusEl.innerHTML = '<i data-lucide="loader-2"></i> <span>Запуск...</span>';
        refreshIcons();
      }
    }

    let res = '';
    let success = true;
    try {
      res = await handleToolExecution(tool);
      results.push(`Результат выполнения ${tool.rawTag}:\n${res}`);
    } catch (err: any) {
      success = false;
      res = err.message;
      results.push(`Ошибка при выполнении ${tool.rawTag}:\n${err.message}`);
    }

    if (!isGenerating) {
      break;
    }

    if (accordion) {
      const statusEl = accordion.querySelector('.tool-accordion-status');
      const contentEl = accordion.querySelector('.tool-accordion-content');
      
      const isFailed = !success || res.startsWith('Ошибка') || res.includes('ОШИБКА') || res.includes('отклонено');
      const codeMatch = res.match(/Код завершения:\s*(\d+)/);
      const isCommandError = codeMatch && codeMatch[1] !== '0';
      const failedStatus = isFailed || isCommandError;

      if (statusEl) {
        statusEl.className = `tool-accordion-status ${failedStatus ? 'failed' : 'success'}`;
        statusEl.innerHTML = `<i data-lucide="${failedStatus ? 'alert-circle' : 'check-circle-2'}"></i> <span>${failedStatus ? 'Ошибка' : 'Выполнено'}</span>`;
      }
      
      if (tool.type !== 'edit_file' && contentEl) {
        contentEl.textContent = res;
      }
      
      refreshIcons();
    }
  }

  hideActiveOp();
  if (!isGenerating) {
    return;
  }

  removeThinking();
  refreshWorkspaceFilesUI();
  updateLivePreviewFromFiles();

  const systemResultText = results.join('\n\n');
  if (!activeProject) {
    setGeneratingState(false);
    return;
  }
  activeProject.chatHistory.push({ role: 'system', content: `[Результат выполнения инструментов]\n${systemResultText}` });
  saveProjects();

  runAgentStep();
}



// Wrapper that tries the primary model and, on failure (network/quota/auth),
// retries once with the user-configured fallback model. AbortError is propagated.
async function streamChatCompletionWithFallback(messages: any[]) {
  const primary = settings.model;
  try {
    return await streamChatCompletion(messages, primary, settings.apiKey);
  } catch (err: any) {
    if (err?.message === 'Генерация прервана.') throw err;
    // Auth errors are not transient — switching to a different model on the
    // same provider with the same broken key would just fail again. Surface
    // the error to the user instead of swallowing it via fallback.
    const msg = String(err?.message || '');
    if (/401|unauthorized|403/i.test(msg)) throw err;
    const fb = settings.fallbackModel;
    if (!fb || fb === primary) throw err;
    appendBubble('Система', `⚠️ ${primary}: ${err.message}. ${t('Переключаюсь на резервную модель')} → ${fb}`, true);
    return await streamChatCompletion(messages, fb, settings.apiKey);
  }
}

async function streamChatCompletion(messages: any[], model: string, apiKey: string) {
  setCurrentAction(t('🧠 Генерация ответа...'));
  removeThinking();
  const modelLabel = settings.model ? esc(settings.model.split('/').pop() || settings.model) : '';
  const bubble = document.createElement('div');
  bubble.className = 'chat-message ai streaming';
  bubble.innerHTML = `
    <div class="msg-header">
      <span class="msg-sender-name">7/24 IDE</span>
    </div>
    <div class="message-bubble">
      <div class="message-text stream-text"><span class="stream-cursor">|</span></div>
    </div>
    <div class="msg-bottom hidden">
      <div class="msg-actions">${buildMsgActions(true)}</div>
      <div class="msg-footer">${modelLabel ? `<span class="msg-footer-model">${modelLabel}</span>` : ''}</div>
    </div>
  `;
  const textEl = bubble.querySelector('.stream-text')!;
  const bottomBar = bubble.querySelector('.msg-bottom')!;
  chatMessages.appendChild(bubble);
  refreshIcons();

  let fullContent = '';
  let fullReasoning = '';
  const toolCallsAcc: { id: string; name: string; argsRaw: string }[] = [];
  let usage: any = {};
  let lastRenderTime = 0;
  let pendingRender = false;
  const scrollToBottom = () => {
    if (autoScrollEnabled) {
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  };

  const debouncedRender = () => {
    if (pendingRender) return;
    const now = performance.now();
    const elapsed = now - lastRenderTime;
    if (elapsed < 32) {
      pendingRender = true;
      requestAnimationFrame(() => {
        pendingRender = false;
        lastRenderTime = performance.now();
        let html = parseMarkdown(fullContent);
        html = formatToolTags(html);
        textEl.innerHTML = html;
        // Show partial tool call indicator during streaming
        const partialTools = toolCallsAcc.filter(tc => tc && tc.name && !tc.argsRaw.includes('</'));
        if (partialTools.length > 0 && !textEl.querySelector('.tool-accordion')) {
          const indicator = document.createElement('div');
          indicator.className = 'streaming-tool-indicator';
          indicator.innerHTML = `<i data-lucide="loader-2" class="action-spinner"></i> ${esc(t('Выполнение инструмента...'))}`;
          textEl.appendChild(indicator);
          refreshIcons();
        }
        scrollToBottom();
        if (!fullContent.trim()) {
          textEl.innerHTML = '<span class="stream-cursor">|</span>';
        }
      });
      return;
    }
    lastRenderTime = now;
    let html = parseMarkdown(fullContent);
    html = formatToolTags(html);
    textEl.innerHTML = html;
    scrollToBottom();
  };

  let isTruncated = true;
  let continueAttempts = 0;
  const maxContinueAttempts = 3;
  let currentMessages = [...messages];

  while (isTruncated && continueAttempts < maxContinueAttempts) {
    if (continueAttempts > 0) {
      currentMessages = [
        ...messages,
        { role: 'assistant', content: fullContent },
        { role: 'user', content: '[Предыдущий ответ был прерван на полуслове. Продолжи ровно с того места, где он остановился. Начни сразу с продолжения текста, без лишних вступлений или повторений!]' }
      ];
      setCurrentAction(t('⏳ Продолжение генерации...'));
    }

    const abortController = createAbortController();
    try {
      const resp = await fetchWithRetry(getLLMUrl('/chat/completions'), {
        method: 'POST',
        headers: getLLMHeaders(apiKey),
        signal: abortController.signal,
        body: JSON.stringify(getLLMBody({
          model,
          messages: currentMessages.map((m: any, i: number) => {
            const cleanMsg: any = { role: m.role, content: m.content };
            if (m.name) cleanMsg.name = m.name;
            if (m.tool_calls) cleanMsg.tool_calls = m.tool_calls;
            if (m.tool_call_id) cleanMsg.tool_call_id = m.tool_call_id;
            
            if (cleanMsg.role === 'system' && i === 0 && model.includes('anthropic')) {
              cleanMsg.cache_control = { type: 'ephemeral' };
            }
            return cleanMsg;
          }),
          temperature: settings.temperature ?? 0.2,
          stream: true,
          max_tokens: settings.maxTokens || 4096,
        })),
      });

      if (!resp.ok) {
        if (continueAttempts === 0) bubble.remove();
        const errorBody = await resp.text().catch(() => '');
        let errorMsg = `HTTP ${resp.status}`;
        if (resp.status === 401) {
          errorMsg = `${t('Неверный или устаревший API-ключ')} (401 Unauthorized). ${t('Пожалуйста, проверьте ключ в Настройках → Провайдер')}.`;
        } else {
          try {
            const parsed = JSON.parse(errorBody);
            errorMsg = parsed.error?.message || errorMsg;
          } catch {}
        }
        throw new Error(errorMsg);
      }

      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.usage) {
              usage = parsed.usage;
            }

            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              fullContent += delta.content;
              debouncedRender();
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const piece of delta.tool_calls) {
                const idx = piece.index ?? toolCallsAcc.length;
                if (!toolCallsAcc[idx]) toolCallsAcc[idx] = { id: '', name: '', argsRaw: '' };
                const acc = toolCallsAcc[idx];
                if (piece.id) acc.id = piece.id;
                if (piece.function?.name) acc.name = piece.function.name;
                if (piece.function?.arguments) acc.argsRaw += piece.function.arguments;
              }
            }

            const reasoning = delta.reasoning_content || delta.reasoning || delta.thought;
            if (reasoning) {
              fullReasoning += reasoning;
              let reasoningBlock = bubble.querySelector('.reasoning-block') as HTMLElement | null;
              if (!reasoningBlock) {
                reasoningBlock = document.createElement('div');
                reasoningBlock.className = 'reasoning-block';
                reasoningBlock.innerHTML = `
                  <div class="reasoning-header">
                    <i data-lucide="brain"></i>
                    <span>${esc(t('Размышления'))}</span>
                  </div>
                  <div class="reasoning-content"></div>
                `;
                bubble.querySelector('.stream-text')?.before(reasoningBlock);
                refreshIcons();
              }
              const reasoningContent = reasoningBlock.querySelector('.reasoning-content');
              if (reasoningContent) {
                reasoningContent.textContent = (reasoningContent.textContent || '') + reasoning;
              }
              scrollToBottom();
            }
          } catch (e) {
            console.error('[Stream error/warn] Unparseable SSE chunk:', e, data);
          }
        }
      }
    } catch (error: any) {
      // Always remove bubble on error (including retry failures)
      bubble.remove();
      if (error.name === 'AbortError') {
        throw new Error('Генерация прервана.');
      }
      throw error;
    } finally {
      activeAbortController = null;
    }

    isTruncated = isResponseTruncated(fullContent);
    if (isTruncated) {
      continueAttempts++;
    } else {
      break;
    }
  }

  if (bottomBar) bottomBar.classList.remove('hidden');
  bubble.classList.remove('streaming');

  if (usage.prompt_tokens || usage.completion_tokens) {
    const footerEl = bubble.querySelector('.msg-bottom .msg-footer') as HTMLElement;
    if (footerEl) {
      const p = usage.prompt_tokens || 0;
      const c = usage.completion_tokens || 0;
      const cost = estimateCost(p, c);
      const costStr = cost > 0 ? ` · ~$${cost.toFixed(4)}` : '';
      const titleText = `Prompt: ${p.toLocaleString()}, Completion: ${c.toLocaleString()}\n${t('Всего за сессию')}: ${tokenAccumulated.prompt.toLocaleString()} prompt + ${tokenAccumulated.completion.toLocaleString()} completion`;
      const modelLabel = settings.model ? esc(settings.model.split('/').pop() || settings.model) : '';
      const usageSpan = `<span class="msg-footer-tokens" title="${esc(titleText)}">🧮 ${p.toLocaleString()}+${c.toLocaleString()}${costStr}</span>`;
      footerEl.innerHTML = `${modelLabel ? `<span class="msg-footer-model">${modelLabel}</span>` : ''}${usageSpan}`;
    }
  }

  let formattedText = parseMarkdown(fullContent);
  formattedText = formatToolTags(formattedText);

  const hasAccordion = formattedText.includes('tool-accordion');
  const hasReasoning = !!bubble.querySelector('.reasoning-block');
  const hasTextContent = formattedText.replace(/<[^>]*>/g, '').trim().length > 0;

  if (!hasAccordion && !hasReasoning && !hasTextContent) {
    bubble.remove();
  } else {
    textEl.innerHTML = formattedText;
    scrollToBottom();
    refreshIcons();
  }

  const nativeTools: AgentTool[] = [];
  for (const tc of toolCallsAcc) {
    if (!tc || !tc.name) continue;
    let args: any = {};
    try { args = tc.argsRaw ? JSON.parse(tc.argsRaw) : {}; } catch {}
    if (tc.name === 'edit_file' && args.search !== undefined && args.replace !== undefined) {
      nativeTools.push({ type: 'edit_file', params: { path: args.path, search: args.search, replace: args.replace }, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'write_file') {
      nativeTools.push({ type: 'write_file', params: { path: args.path, content: args.content }, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'read_file') {
      nativeTools.push({ type: 'read_file', params: { path: args.path, full: !!args.full }, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'read_dir') {
      nativeTools.push({ type: 'read_dir', params: { path: args.path || '.' }, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'execute_command') {
      nativeTools.push({ type: 'execute_command', params: { command: args.command }, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'search_code') {
      nativeTools.push({ type: 'search_code', params: { query: args.query }, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'list_components') {
      nativeTools.push({ type: 'list_components', params: {}, rawTag: `[tool:${tc.id || tc.name}]` });
    } else if (tc.name === 'check_image_size') {
      nativeTools.push({ type: 'check_image_size', params: { path: args.path }, rawTag: `[tool:${tc.id || tc.name}]` });
    }
  }

  return {
    content: fullContent,
    reasoningContent: fullReasoning || undefined,
    nativeTools,
    usage: usage.prompt_tokens ? { prompt_tokens: usage.prompt_tokens, completion_tokens: usage.completion_tokens || 0 } : undefined
  };
}


// ═══════════════════════════════════════════
// LIVE TERMINAL PANEL (XTERM.JS)
// ═══════════════════════════════════════════
let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let terminalHasContent = false;

function initTerminal() {
  if (term) return;
  const out = document.getElementById('terminal-output');
  if (!out) return;
  out.innerHTML = '';
  
  term = new Terminal({
    theme: {
      background: 'transparent',
      foreground: '#d4d4d4',
      cursor: '#ffffff',
    },
    fontFamily: 'var(--font-code), monospace',
    fontSize: 12,
    cursorBlink: true,
    disableStdin: true // Output only for now, input handled by input bar
  });
  
  fitAddon = new FitAddon();
  term.loadAddon(fitAddon);
  term.open(out);
  fitAddon.fit();
  
  window.addEventListener('resize', () => {
    if (fitAddon && document.getElementById('terminal-view')?.style.display !== 'none') {
      fitAddon.fit();
    }
  });

  // Watch for tab visibility changes
  const observer = new MutationObserver(() => {
    if (document.getElementById('terminal-view')?.style.display !== 'none') {
      setTimeout(() => fitAddon?.fit(), 50);
    }
  });
  observer.observe(document.getElementById('terminal-view')!, { attributes: true, attributeFilter: ['style'] });
}

function appendTerminal(stream: string, chunk: string) {
  if (!term) initTerminal();
  if (!term) return;
  
  if (!terminalHasContent) {
    term.clear();
    terminalHasContent = true;
  }
  
  // Format based on stream
  let formatted = chunk.replace(/\n/g, '\r\n');
  if (stream === 'stderr') {
    formatted = `\x1b[31m${formatted}\x1b[0m`; // Red
  } else if (stream === 'system') {
    formatted = `\x1b[33m${formatted}\x1b[0m`; // Yellow
  }
  
  term.write(formatted);
}

function clearTerminal() {
  if (term) {
    term.clear();
    term.write('\x1b[3mЗдесь появляется живой вывод команд, которые запускает агент.\x1b[0m\r\n');
  }
  terminalHasContent = false;
}

function setTerminalStatus(text: string) {
  const el = document.getElementById('terminal-status');
  if (el) el.textContent = text;
}

async function handleToolExecution(tool: AgentTool): Promise<string> {
  const workspacePath = activeProject?.workspacePath || '';
  const scopePath = activeProject?.scopePath || '';

  // Block file modifications and commands if plan is not approved yet
  if ((tool.type === 'write_file' || tool.type === 'edit_file' || tool.type === 'execute_command') && appMode === 'plan' && !planApproved) {
    return 'Ошибка: Запись файлов, редактирование и выполнение команд заблокированы. Вы находитесь в режиме планирования (Plan), и план разработки ещё не был утвержден пользователем (нажмите кнопку 🚀 Начать сборку). Попроси пользователя сначала утвердить план.';
  }

  if (!workspacePath) {
    return 'ОШИБКА: Рабочая папка не выбрана. Скажите пользователю: «Пожалуйста, нажмите кнопку «Открыть» внизу боковой панели слева и выберите папку для работы.»';
  }

  // Prepend .shadow-workspace/ to path if plan execution is active (disabled here to avoid double-prepend in API)
  const mapPath = (p: string) => p;
  const activeWorkspace = isExecutingPlan ? `${workspacePath}/.shadow-workspace` : workspacePath;

  // Scope filter: ensure operations stay within scopePath if set
  const checkScope = (p: string): boolean => {
    if (!scopePath) return true;
    const normalized = p.replace(/\\/g, '/');
    const scope = scopePath.replace(/\\/g, '/').replace(/\/$/, '');
    return normalized === scope || normalized.startsWith(scope + '/');
  };

  if (tool.type === 'read_dir') {
    if (settings.permRead === 'ask') {
      const allowed = await requestPermission('read', `Просмотр содержимого папки: "${tool.params.path}"`);
      if (!allowed) return 'Действие отклонено пользователем.';
    }
    const files = await window.electronAPI.readDir(activeWorkspace);
    const subpath = tool.params.path === '.' || tool.params.path === '/' ? '' : tool.params.path;
    let filtered = files.filter(f => subpath ? f.path.startsWith(subpath) : true);
    // Apply scope filter
    if (scopePath) {
      const scope = scopePath.replace(/\\/g, '/').replace(/\/$/, '');
      filtered = filtered.filter(f => f.path === scope || f.path.startsWith(scope + '/'));
    }
    return JSON.stringify(filtered.map(f => ({ path: f.path, isDir: f.isDir, size: f.size })), null, 2);
  }

  if (tool.type === 'read_file') {
    if (!checkScope(tool.params.path)) {
      return `Ошибка: Файл "${tool.params.path}" находится за пределами области работы "${scopePath}".`;
    }
    // Block reading binary/image files — the model is text-only
    const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.ico', '.svg', '.avif'];
    const ext = tool.params.path.toLowerCase().split('.').pop();
    if (ext && imageExts.includes('.' + ext)) {
      return `ОШИБКА: Невозможно прочитать "${tool.params.path}" — модель не поддерживает изображения. Используй <check_image_size> для проверки размеров. Не пытайся читать изображения через <read_file>.`;
    }
    if (settings.permRead === 'ask') {
      const allowed = await requestPermission('read', `Чтение содержимого файла: "${tool.params.path}"`);
      if (!allowed) return 'Действие отклонено пользователем.';
    }
    const content = await window.electronAPI.readFile(mapPath(tool.params.path), activeWorkspace, settings.sandboxEnabled);
    if (tool.params.full) {
      return content;
    }
    return compressCodeContext(tool.params.path, content);
  }

  if (tool.type === 'write_file') {
    if (!checkScope(tool.params.path)) {
      return `Ошибка: Путь "${tool.params.path}" находится за пределами области работы "${scopePath}".`;
    }
    if (settings.permWrite === 'deny') {
      return 'ОШИБКА: Запись файлов запрещена настройками. Скажите пользователю: «В настройках (кнопка ⚙️ внизу) → раздел «Разрешения», измените «Запись файлов» на «Спрашивать с Ревью» или «Всегда записывать».»';
    }

    // Shadow Linting: check syntax
    const validation = validateCodeSyntax(tool.params.path, tool.params.content);
    if (!validation.valid) {
      return `ОШИБКА СИНТАКСИСА: Запись файла отклонена из-за некорректного синтаксиса: ${validation.error}. Пожалуйста, исправь ошибки в коде.`;
    }

    if (settings.permWrite === 'review') {
      let oldContent = '';
      try {
        oldContent = await window.electronAPI.readFile(mapPath(tool.params.path), activeWorkspace, settings.sandboxEnabled);
      } catch (e) {}
      const allowed = await requestWritePermissionWithDiff(tool.params.path, oldContent, tool.params.content);
      if (!allowed) return 'Действие отклонено пользователем в режиме Авто-Ревью.';
    } else if (settings.permWrite === 'ask') {
      const allowed = await requestPermission('write', `Запись файла: "${tool.params.path}"`);
      if (!allowed) return 'Действие отклонено пользователем.';
    }

    await window.electronAPI.writeFile(mapPath(tool.params.path), tool.params.content, activeWorkspace, settings.sandboxEnabled);
    buildSessionWroteFiles = true;
    noteFileTouched(tool.params.path);
    return 'Успешно записано на диск.';
  }

  if (tool.type === 'edit_file') {
    if (!checkScope(tool.params.path)) {
      return `Ошибка: Путь "${tool.params.path}" находится за пределами области работы "${scopePath}".`;
    }
    if (settings.permWrite === 'deny') {
      return 'ОШИБКА: Запись файлов запрещена настройками. Скажите пользователю: «В настройках (кнопка ⚙️ внизу) → раздел «Разрешения», измените «Запись файлов» на «Спрашивать с Ревью» или «Всегда записывать».»';
    }

    let oldContent = '';
    try {
      oldContent = await window.electronAPI.readFile(mapPath(tool.params.path), activeWorkspace, settings.sandboxEnabled);
    } catch (e: any) {
      return `Ошибка: Не удалось прочитать оригинальный файл для редактирования: ${e.message}`;
    }

    const searchContent = tool.params.search as string;
    const replaceContent = tool.params.replace as string;

    // Strict block: Do not allow replacing more than 80% of a large file via edit_file
    if (oldContent.length > 500 && searchContent.length > oldContent.length * 0.8) {
      return 'ОШИБКА ПАТЧА: Запрещено переписывать весь файл целиком! Твой патч слишком большой. Используй <edit_file> только для замены конкретных функций или блоков (до 50-100 строк за раз). Это необходимо для экономии токенов.';
    }

    let matchIndex = oldContent.indexOf(searchContent);
    let matchLength = searchContent.length;

    // Смягченный поиск (Soft matching)
    if (matchIndex === -1) {
      const trimmedSearch = searchContent.trim();
      matchIndex = oldContent.indexOf(trimmedSearch);
      matchLength = trimmedSearch.length;
      
      // Поиск по строкам с игнорированием отступов (если обычный trim не помог)
      if (matchIndex === -1) {
        const searchLines = searchContent.split('\n').map(l => l.trim()).filter(l => l);
        const oldLines = oldContent.split('\n');
        
        for (let i = 0; i <= oldLines.length - searchLines.length; i++) {
          let matches = true;
          for (let j = 0; j < searchLines.length; j++) {
            if (oldLines[i + j].trim() !== searchLines[j]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            // Нашли приблизительное совпадение, вычисляем индексы
            const startStr = oldLines.slice(0, i).join('\n');
            matchIndex = startStr.length > 0 ? startStr.length + 1 : 0;
            matchLength = oldLines.slice(i, i + searchLines.length).join('\n').length;
            break;
          }
        }
      }

      // Fuzzy fallback: нормализуем все внутренние пробелы (отступы + множественные пробелы)
      if (matchIndex === -1) {
        const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
        const searchLines = searchContent.split('\n').map(norm).filter(l => l);
        const oldLinesRaw = oldContent.split('\n');
        const oldLinesNorm = oldLinesRaw.map(norm);

        for (let i = 0; i <= oldLinesNorm.length - searchLines.length; i++) {
          let matches = searchLines.length > 0;
          for (let j = 0; j < searchLines.length; j++) {
            if (oldLinesNorm[i + j] !== searchLines[j]) {
              matches = false;
              break;
            }
          }
          if (matches) {
            const startStr = oldLinesRaw.slice(0, i).join('\n');
            matchIndex = startStr.length > 0 ? startStr.length + 1 : 0;
            matchLength = oldLinesRaw.slice(i, i + searchLines.length).join('\n').length;
            break;
          }
        }
      }
    }

    // Защита от неоднозначности: если точный фрагмент встречается несколько раз — требуем больше контекста
    if (matchIndex !== -1 && searchContent.length > 0) {
      const exactCount = oldContent.split(searchContent).length - 1;
      if (exactCount > 1) {
        return `ОШИБКА ПАТЧА: Блок <search> встречается в файле ${tool.params.path} ${exactCount} раз — невозможно однозначно определить место замены. Добавь в <search> больше окружающего контекста (соседние строки), чтобы фрагмент стал уникальным.`;
      }
    }

    if (matchIndex === -1) {
      return `ОШИБКА ПАТЧА: Не удалось найти блок <search> в файле ${tool.params.path}. Ожидаемый код не найден. Перечитай файл с помощью <read_file> и сформируй новый <edit_file> с точным фрагментом, соблюдая отступы.`;
    }

    const newContent = oldContent.substring(0, matchIndex) + replaceContent + oldContent.substring(matchIndex + matchLength);

    // Shadow Linting: check syntax
    const validation = validateCodeSyntax(tool.params.path, newContent);
    if (!validation.valid) {
      return `ОШИБКА СИНТАКСИСА: Изменение файла отклонено из-за некорректного синтаксиса: ${validation.error}. Пожалуйста, исправь ошибки в коде.`;
    }

    if (settings.permWrite === 'review') {
      const allowed = await requestWritePermissionWithDiff(tool.params.path, oldContent, newContent);
      if (!allowed) return 'Действие отклонено пользователем в режиме Авто-Ревью.';
    } else if (settings.permWrite === 'ask') {
      const allowed = await requestPermission('write', `Редактирование файла: "${tool.params.path}"`);
      if (!allowed) return 'Действие отклонено пользователем.';
    }

    await window.electronAPI.writeFile(mapPath(tool.params.path), newContent, activeWorkspace, settings.sandboxEnabled);
    buildSessionWroteFiles = true;
    noteFileTouched(tool.params.path);
    return 'Изменения успешно применены к файлу.';
  }

  if (tool.type === 'execute_command') {
    if (settings.permExec === 'deny') {
      return 'ОШИБКА: Выполнение команд терминала запрещено настройками. Скажите пользователю: «В настройках (кнопка ⚙️ внизу) → раздел «Разрешения», измените «Запуск терминальных команд» на «Спрашивать перед запуском».»';
    }

    if (settings.permExec === 'ask') {
      const allowed = await requestPermission('exec', `Запуск консольной команды: "${tool.params.command}"`);
      if (!allowed) return 'Выполнение команды отклонено пользователем.';
    }

    // Render an inline shell-exec card that streams the live output and
    // then collapses into a clickable summary. Unlike the previous bubble
    // it is NOT removed when the command finishes — the user can re-open
    // the output later from chat history.
    const cardId = `shell-card-${genId()}`;
    const card = document.createElement('div');
    card.className = 'chat-message ai';
    card.id = cardId;
    card.innerHTML = `
      <div class="message-meta"><span class="sender-name">${esc(t('Команда'))}</span></div>
      <div class="message-text">
        <div class="shell-exec-card running">
          <div class="shell-exec-row">
            <span class="shell-exec-status">${esc(t('выполняется'))}…</span>
            <span class="shell-exec-cmd">${esc(tool.params.command)}</span>
            <button type="button" class="shell-exec-toggle" data-action="toggle">${esc(t('Показать вывод'))}</button>
          </div>
          <pre class="shell-exec-output"></pre>
        </div>
      </div>
    `;
    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    refreshIcons();

    const cardEl = card.querySelector('.shell-exec-card') as HTMLElement;
    const statusEl = card.querySelector('.shell-exec-status') as HTMLElement;
    const outputEl = card.querySelector('.shell-exec-output') as HTMLElement;
    const toggleBtn = card.querySelector('.shell-exec-toggle') as HTMLButtonElement | null;
    toggleBtn?.addEventListener('click', () => {
      cardEl.classList.toggle('expanded');
      toggleBtn.textContent = cardEl.classList.contains('expanded') ? t('Скрыть вывод') : t('Показать вывод');
    });

    const execId = genId();
    activeCommandExecId = execId;

    // Live-stream chunks straight into the card while the command runs.
    const unsubscribe = window.electronAPI.onCommandChunk?.(({ execId: eid, chunk }) => {
      if (eid !== execId) return;
      outputEl.textContent = (outputEl.textContent || '') + chunk;
      // Keep the output panel auto-scrolled if the user has it open.
      if (cardEl.classList.contains('expanded')) {
        outputEl.scrollTop = outputEl.scrollHeight;
      }
    });

    setActivityTool(`$ ${tool.params.command}`);

    // Toggle terminal input bar visibility
    const inputBar = document.getElementById('terminal-input-bar');
    const stdinInput = document.getElementById('terminal-stdin-input') as HTMLInputElement;
    if (inputBar) inputBar.style.display = 'flex';
    if (stdinInput) {
      stdinInput.value = '';
      stdinInput.focus();
    }

    setTerminalStatus('● выполняется');
    const killBtn = document.getElementById('btn-kill-terminal');
    if (killBtn) killBtn.classList.remove('hidden');

    const res = await window.electronAPI.executeCommandStream(tool.params.command, activeWorkspace, execId);
    setTerminalStatus(res.code === 0 ? '✓ завершено' : `✗ код ${res.code}`);

    // Detach the live stream listener to avoid leaks.
    if (typeof unsubscribe === 'function') {
      try { unsubscribe(); } catch {}
    }

    // Finalise the card with the exit code + the full captured stdout/stderr.
    cardEl.classList.remove('running');
    cardEl.classList.add(res.code === 0 ? 'success' : 'failed');
    statusEl.textContent = res.code === 0 ? `✓ ${t('успех')}` : `✗ ${t('ошибка')} (${res.code})`;
    const finalOut = (res.stdout || '') + (res.stderr ? `\n${res.stderr}` : '');
    if (finalOut.trim()) {
      outputEl.textContent = finalOut;
    } else if (!(outputEl.textContent || '').trim()) {
      outputEl.textContent = `(${t('нет вывода')})`;
    }

    if (killBtn) killBtn.classList.add('hidden');
    if (inputBar) inputBar.style.display = 'none';
    activeCommandExecId = null;
    setActivityTool('');

    // Pause build and show error recovery prompt if command failed during plan execution
    if (res.code !== 0 && isExecutingPlan) {
      const planId = (document.querySelector('.plan-widget') as HTMLElement)?.id?.replace('plan-widget-', '') || '';
      const choice = await showSelfHealingErrorCard(planId, tool.params.command, res.stderr || res.stdout || 'Неизвестная ошибка выполнения команды');
      if (choice === 'rebuild') {
        // Plan is being rebuilt — abort this step's tool result so the agent
        // doesn't try to "continue" on a stale plan.
        return `Команда не выполнена (код ${res.code}). Пользователь запросил пересборку плана. Остановись и дождись новых инструкций.`;
      }
      // 'heal' — let the result fall through, but tag it so the agent's
      // next turn understands that a retry was explicitly requested.
      return `Код завершения: ${res.code}\nStdout:\n${res.stdout}\nStderr:\n${res.stderr}\n\n[Пользователь нажал «Исправить автоматически» — исправь файлы кода и повтори команду.]`;
    }

    return `Код завершения: ${res.code}\nStdout:\n${res.stdout}\nStderr:\n${res.stderr}`;
  }

  if (tool.type === 'list_components') {
    try {
      let list = await window.electronAPI.listComponents(activeWorkspace);
      if (scopePath) {
        const scope = scopePath.replace(/\\/g, '/').replace(/\/$/, '');
        list = list.filter(p => p === scope || p.startsWith(scope + '/'));
      }
      return JSON.stringify(list, null, 2);
    } catch (e: any) {
      return `Ошибка при получении списка компонентов: ${e.message}`;
    }
  }

  if (tool.type === 'check_image_size') {
    if (!checkScope(tool.params.path)) {
      return `Ошибка: Путь "${tool.params.path}" находится за пределами области работы "${scopePath}".`;
    }
    try {
      const info = await window.electronAPI.checkImageSize(mapPath(tool.params.path), activeWorkspace);
      return JSON.stringify(info, null, 2);
    } catch (e: any) {
      return `Ошибка при проверке размера изображения: ${e.message}`;
    }
  }

  if (tool.type === 'search_code') {
    const query = String(tool.params.query || '').trim();
    if (!query) return 'Ошибка: пустой поисковый запрос.';

    // Try the native Rust BM25 engine first. If it's been indexed, results
    // come back instantly with proper relevance ranking.
    try {
      const status = window.electronAPI?.coreStatus
        ? await window.electronAPI.coreStatus()
        : null;
      if (status?.available && status.docs && status.docs > 0 && window.electronAPI?.coreSearchRag) {
        const native = await window.electronAPI.coreSearchRag(query, 20);
        if (native && Array.isArray(native.results) && native.results.length > 0) {
          let hits = native.results;
          if (scopePath) {
            const scope = scopePath.replace(/\\/g, '/').replace(/\/$/, '');
            hits = hits.filter(h => h.file_path === scope || h.file_path.startsWith(scope + '/'));
          }
          if (hits.length > 0) {
            const out = hits.map(h => {
              const snippet = h.chunk_content.split('\n').slice(0, 3).join('\n').slice(0, 320);
              return `${h.file_path}:${h.line_start}-${h.line_end} (score=${h.score.toFixed(2)}):\n${snippet}`;
            }).join('\n---\n');
            return `[native BM25] Найдено: ${hits.length}\n${out}`;
          }
        }
      }
    } catch (err) {
      console.warn('[search_code] native engine path failed, falling back to TS scan:', err);
    }

    // ── TS fallback: linear keyword scan over text files in the workspace ──
    try {
      let files = await window.electronAPI.readDir(activeWorkspace);
      if (scopePath) {
        const scope = scopePath.replace(/\\/g, '/').replace(/\/$/, '');
        files = files.filter(f => f.path === scope || f.path.startsWith(scope + '/'));
      }
      const textExts = ['js','ts','jsx','tsx','vue','svelte','html','css','scss','json','md','py','rs','go','java','c','cpp','h','php','rb','yml','yaml','txt','sql'];
      const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
      const matches: { path: string; line: number; text: string; score: number }[] = [];

      for (const f of files) {
        if (f.isDir) continue;
        if (f.path.startsWith('.shadow-workspace')) continue;
        const ext = f.path.toLowerCase().split('.').pop() || '';
        if (!textExts.includes(ext)) continue;
        if (f.size > 500_000) continue; // skip very large files
        let content = '';
        try {
          content = await window.electronAPI.readFile(f.path, activeWorkspace, settings.sandboxEnabled);
        } catch { continue; }
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const lower = lines[i].toLowerCase();
          let score = 0;
          for (const t of terms) {
            if (lower.includes(t)) score++;
          }
          if (score > 0) {
            matches.push({ path: f.path, line: i + 1, text: lines[i].trim().slice(0, 200), score });
          }
        }
      }

      matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
      const top = matches.slice(0, 20);
      if (top.length === 0) {
        return `По запросу "${query}" совпадений не найдено в файлах проекта.`;
      }
      const out = top.map(m => `${m.path}:${m.line}: ${m.text}`).join('\n');
      return `Найдено совпадений: ${matches.length} (показаны топ-${top.length}):\n${out}`;
    } catch (e: any) {
      return `Ошибка поиска по коду: ${e.message}`;
    }
  }

  if (tool.type.startsWith('mcp__')) {
    const parts = tool.type.split('__');
    if (parts.length >= 3) {
      const serverName = parts[1];
      const toolName = parts.slice(2).join('__');
      
      if (settings.permExec === 'deny') {
        return 'Ошибка: Выполнение внешних инструментов (MCP) запрещено настройками безопасности.';
      }
      if (settings.permExec === 'ask') {
        const allowed = await requestPermission('exec', `Запуск MCP инструмента: "${serverName}/${toolName}" с параметрами ${JSON.stringify(tool.params)}`);
        if (!allowed) return 'Действие отклонено пользователем.';
      }
      
      try {
        const result = await window.electronAPI.mcpCallTool(serverName, toolName, tool.params);
        if (result && result.content) {
          const texts = result.content
            .filter((c: any) => c.type === 'text')
            .map((c: any) => c.text)
            .join('\n');
          return texts || 'Инструмент выполнен успешно без текстового вывода.';
        }
        return JSON.stringify(result, null, 2);
      } catch (err: any) {
        return `Ошибка вызова MCP инструмента: ${err.message || String(err)}`;
      }
    }
  }

  return 'Инструмент не поддерживается.';
}

// ═══════════════════════════════════════════
// PERMISSION DIALOGS & DIFF GENERATION
// ═══════════════════════════════════════════
function requestPermission(type: string, desc: string): Promise<boolean> {
  const pendingIndicator = $('#permission-pending');
  if (pendingIndicator) pendingIndicator.classList.remove('hidden');
  return new Promise((resolve) => {
    const card = document.createElement('div');
    card.className = 'chat-message ai';
    card.innerHTML = `
      <div class="message-meta"><span class="sender-name">${esc(t('Безопасность'))}</span></div>
      <div class="message-text">
        <div class="permission-card">
          <div class="permission-card-title">
            <i data-lucide="shield-alert"></i>
            <span>${esc(t('Запрос разрешения'))}</span>
          </div>
          <div class="permission-card-desc">
            ${esc(t('Разрешить агенту следующее действие?'))}<br>
            <code>${esc(desc)}</code>
          </div>
          <div class="permission-card-buttons">
            <button class="permission-card-btn deny btn-deny">${esc(t('Запретить'))}</button>
            <button class="permission-card-btn allow btn-allow">${esc(t('Разрешить'))}</button>
          </div>
        </div>
      </div>
    `;
    chatMessages.appendChild(card);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    refreshIcons();

    if (!document.hasFocus() && window.electronAPI?.showNotification) {
      window.electronAPI.showNotification(t('Запрос разрешения'), desc);
    }

    const cleanup = () => {
      card.remove();
      if (pendingIndicator) pendingIndicator.classList.add('hidden');
    };

    card.querySelector('.btn-allow')?.addEventListener('click', () => {
      cleanup();
      appendBubble('Вы', `${t('Разрешено')}: ${desc}`, false);
      resolve(true);
    });

    card.querySelector('.btn-deny')?.addEventListener('click', () => {
      cleanup();
      appendBubble('Вы', `${t('Запрещено')}: ${desc}`, false);
      resolve(false);
    });
  });
}

function alignLines(oldLines: string[], newLines: string[]): { left: (string | null)[], right: (string | null)[] } {
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  const leftAligned: (string | null)[] = [];
  const rightAligned: (string | null)[] = [];
  let i = m, j = n;
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      leftAligned.push(oldLines[i - 1]);
      rightAligned.push(newLines[j - 1]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      leftAligned.push(null);
      rightAligned.push(newLines[j - 1]);
      j--;
    } else {
      leftAligned.push(oldLines[i - 1]);
      rightAligned.push(null);
      i--;
    }
  }
  
  return {
    left: leftAligned.reverse(),
    right: rightAligned.reverse()
  };
}
let monacoDiffEditor: any = null;
let monacoOriginalModel: any = null;
let monacoModifiedModel: any = null;

function buildSideBySideDiff(filePath: string, oldContent: string, newContent: string) {
  const filePathEl = document.getElementById('diff-file-path');
  if (filePathEl) filePathEl.textContent = filePath;

  const initDiffEditor = () => {
    const container = document.getElementById('monaco-diff-container');
    if (!container) return;
    
    // Determine language by extension
    const ext = filePath.split('.').pop()?.toLowerCase() || '';
    let lang = 'text';
    const langMap: Record<string, string> = {
      'ts': 'typescript', 'js': 'javascript', 'tsx': 'typescript', 'jsx': 'javascript',
      'json': 'json', 'html': 'html', 'css': 'css', 'py': 'python', 'rs': 'rust',
      'go': 'go', 'md': 'markdown', 'c': 'c', 'cpp': 'cpp', 'java': 'java'
    };
    if (langMap[ext]) lang = langMap[ext];

    if (!monacoDiffEditor) {
      monacoDiffEditor = (window as any).monaco.editor.createDiffEditor(container, {
        theme: document.body.classList.contains('theme-dark') ? 'vs-dark' : 'vs',
        readOnly: true,
        automaticLayout: true,
        renderSideBySide: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: 'var(--font-code), monospace',
        fontSize: 12
      });
      monacoOriginalModel = (window as any).monaco.editor.createModel(oldContent || '', lang);
      monacoModifiedModel = (window as any).monaco.editor.createModel(newContent || '', lang);
      monacoDiffEditor.setModel({
        original: monacoOriginalModel,
        modified: monacoModifiedModel
      });
    } else {
      (window as any).monaco.editor.setModelLanguage(monacoOriginalModel, lang);
      (window as any).monaco.editor.setModelLanguage(monacoModifiedModel, lang);
      monacoOriginalModel.setValue(oldContent || '');
      monacoModifiedModel.setValue(newContent || '');
    }
  };

  if ((window as any).monaco) {
    initDiffEditor();
  } else {
    // Try to load via AMD loader
    if ((window as any).require) {
      (window as any).require(['vs/editor/editor.main'], () => {
        initDiffEditor();
      });
    } else {
      const c = document.getElementById('monaco-diff-container');
      if (c) c.innerHTML = '<div style="padding:20px; color:red;">Ошибка загрузки редактора (Monaco loader not found)</div>';
    }
  }
}

function requestWritePermissionWithDiff(filePath: string, oldContent: string, newContent: string): Promise<boolean> {
  const pendingIndicator = $('#permission-pending');
  if (pendingIndicator) pendingIndicator.classList.remove('hidden');
  
  if (!document.hasFocus() && window.electronAPI?.showNotification) {
    window.electronAPI.showNotification(t('Запрос разрешения'), `${t('Авто-Ревью')}: ${filePath}`);
  }

  return new Promise((resolve) => {
    const modal = document.getElementById('diff-modal')!;
    modal.classList.remove('hidden');
    
    buildSideBySideDiff(filePath, oldContent, newContent);
    
    const btnApprove = document.getElementById('btn-diff-approve')!;
    const btnReject = document.getElementById('btn-diff-reject')!;
    const btnClose = document.getElementById('btn-close-diff-modal')!;
    
    const cleanup = () => {
      modal.classList.add('hidden');
      if (pendingIndicator) pendingIndicator.classList.add('hidden');
      btnApprove.removeEventListener('click', handleApprove);
      btnReject.removeEventListener('click', handleReject);
      btnClose.removeEventListener('click', handleReject);
      modal.removeEventListener('click', handleBackdrop);
    };

    const handleApprove = () => {
      cleanup();
      appendBubble('Вы', `${t('Приняты изменения в файле')}: ${filePath}`, false);
      resolve(true);
    };

    const handleReject = () => {
      cleanup();
      appendBubble('Вы', `${t('Отклонены изменения в файле')}: ${filePath}`, false);
      resolve(false);
    };

    // Clicking the dimmed backdrop (outside the dialog) rejects the change.
    const handleBackdrop = (e: MouseEvent) => {
      if (e.target === modal) handleReject();
    };

    btnApprove.addEventListener('click', handleApprove);
    btnReject.addEventListener('click', handleReject);
    btnClose.addEventListener('click', handleReject);
    modal.addEventListener('click', handleBackdrop);
  });
}

// ═══════════════════════════════════════════
// UI EVENT HANDLERS
// ═══════════════════════════════════════════

// Apply saved visual settings
if (settings.uiFont !== 'Inter') document.body.style.fontFamily = `'${settings.uiFont}', system-ui, sans-serif`;
if (settings.fontSize !== 13) document.body.style.fontSize = settings.fontSize + 'px';

// Mode toggles
const tabBuild = document.getElementById('mode-tab-build');
const tabPlan = document.getElementById('mode-tab-plan');

// Mode toggles and welcome folder button are set up inside init() to avoid duplicate listeners.

btnSend.addEventListener('click', () => { 
  const t = chatInput.value.trim(); 
  if (t) { 
    chatInput.value = ''; 
    chatInput.style.height = 'auto'; 
    handleUserMessage(t); 
  } 
});

// Workspace selection from starting preview prompt
document.getElementById('btn-welcome-select-folder')?.addEventListener('click', () => {
  btnSidebarSelectFolder.click();
});

$$('.example-chip').forEach(c => c.addEventListener('click', () => { 
  const p = (c as HTMLElement).dataset.prompt || ''; 
  if (p) { 
    chatInput.value = p; 
    chatInput.dispatchEvent(new Event('input'));
    btnSend.click(); 
  } 
}));

$$('.ptab').forEach(t => t.addEventListener('click', () => { 
  $$('.ptab').forEach(x => x.classList.remove('active')); 
  t.classList.add('active'); 
  renderPreview();
  if ((t as HTMLElement).dataset.tab === 'terminal') {
    setTimeout(() => { initTerminal(); }, 50);
  }
}));

// Device toggle
$$('.device-btn').forEach(b => b.addEventListener('click', () => {
  $$('.device-btn').forEach(x => x.classList.remove('active')); b.classList.add('active');
  const d = (b as HTMLElement).dataset.device;
  const wrap = document.getElementById('iframe-wrapper');
  if (!wrap) return;
  // Remove previous device classes
  wrap.classList.remove('device-mobile', 'device-tablet');
  if (d === 'mobile') {
    wrap.classList.add('device-mobile');
  } else if (d === 'tablet') {
    wrap.classList.add('device-tablet');
  }
}));

// Select Workspace folder from Sidebar
btnSidebarSelectFolder.addEventListener('click', async () => {
  try {
    const folder = await window.electronAPI.selectFolder();
    if (folder) {
      await setWorkspaceFolder(folder);
    }
  } catch (err: any) {
    alert(`${t('Ошибка выбора папки: ')}${err.message}`);
  }
});

// Clickable folder path - also opens folder selection
sidebarFolderPath.addEventListener('click', async () => {
  if (activeProject?.workspacePath) {
    // If folder already set, click opens it in explorer
    await window.electronAPI.openInExplorer(activeProject.workspacePath);
  } else {
    btnSidebarSelectFolder.click();
  }
});

// Clear folder button
btnSidebarClearFolder.addEventListener('click', async () => {
  if (!activeProject) return;
  const ok = await confirmDialog('Открепить рабочую папку от этого проекта?', 'Открепление папки');
  if (ok) {
    activeProject.workspacePath = '';
    activeProject.scopePath = '';
    saveProjects();
    updateSidebarFolderUI(activeProject);
    renderSidebarProjects();
    renderAgentTabs();
    renderPreview();
    appendBubble('Система', t('🗑️ Рабочая папка откреплена от проекта.'), true);
  }
});

btnRefreshFiles.addEventListener('click', () => {
  refreshWorkspaceFilesUI();
});

// Sidebar New Chat Click
btnSidebarNewChat.addEventListener('click', () => {
  const p = createProject();
  switchToProject(p);
});
document.getElementById('btn-agentic-new-chat-mini')?.addEventListener('click', () => {
  btnSidebarNewChat.click();
});
document.getElementById('agentic-chat-title')?.addEventListener('click', () => {
  document.getElementById('btn-rename-active-project')?.click();
});
document.getElementById('btn-chat-attach-context')?.addEventListener('click', () => {
  btnSidebarSelectFolder.click();
});
document.getElementById('btn-chat-focus-search')?.addEventListener('click', () => {
  const bar = document.getElementById('chat-search-bar');
  const input = document.getElementById('chat-search-input') as HTMLInputElement | null;
  bar?.classList.remove('hidden');
  input?.focus();
  input?.select();
});
document.getElementById('btn-lowcode-context-expand')?.addEventListener('click', () => {
  document.querySelector('.preview-panel')?.classList.toggle('show-advanced-tools');
});
document.getElementById('btn-lowcode-context-refresh')?.addEventListener('click', () => {
  refreshWorkspaceFilesUI();
});

function initCustomModelDropdown() {
  const slot = document.getElementById('agentic-topbar-model-slot');
  const dropdown = document.getElementById('custom-model-dropdown');
  const searchInput = document.getElementById('custom-model-search') as HTMLInputElement | null;
  const listContainer = document.getElementById('custom-model-list');
  const chatModelSelect = document.getElementById('chat-model-select') as HTMLSelectElement | null;

  if (!slot || !dropdown || !listContainer) return;
  const modelDropdown = dropdown;

  slot.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).closest('#custom-model-dropdown')) {
      return;
    }
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      renderCustomModelItems('');
      if (searchInput) {
        searchInput.value = '';
        searchInput.focus();
      }
    }
  });

  searchInput?.addEventListener('input', () => {
    renderCustomModelItems(searchInput.value.toLowerCase().trim());
  });

  document.addEventListener('click', (e) => {
    if (!slot.contains(e.target as Node)) {
      dropdown.classList.add('hidden');
    }
  });

  function renderCustomModelItems(query: string) {
    listContainer!.innerHTML = '';
    
    let filteredModels = settings.cachedModels;
    if (query) {
      filteredModels = filteredModels.filter(m => 
        (m.name || m.id).toLowerCase().includes(query) || 
        m.id.toLowerCase().includes(query)
      );
    }

    if (filteredModels.length === 0) {
      const emptyItem = document.createElement('div');
      emptyItem.className = 'custom-model-item';
      emptyItem.style.color = 'var(--text-muted)';
      emptyItem.style.cursor = 'default';
      emptyItem.textContent = t('Модели не найдены');
      listContainer!.appendChild(emptyItem);
      return;
    }

    for (const m of filteredModels) {
      const item = document.createElement('div');
      item.className = 'custom-model-item' + (m.id === settings.model ? ' active' : '');
      item.dataset.id = m.id;

      const cleanName = (m.name || m.id).split(' · ')[0];
      const nameSpan = document.createElement('span');
      nameSpan.className = 'custom-model-item-name';
      nameSpan.textContent = cleanName;
      item.appendChild(nameSpan);

      const badgesContainer = document.createElement('div');
      badgesContainer.style.display = 'flex';
      badgesContainer.style.alignItems = 'center';
      badgesContainer.style.gap = '4px';

      if (m.isFree) {
        const freeBadge = document.createElement('span');
        freeBadge.className = 'custom-model-item-badge';
        freeBadge.textContent = 'FREE';
        badgesContainer.appendChild(freeBadge);
      }
      if (m.contextLength) {
        const ctxBadge = document.createElement('span');
        ctxBadge.className = 'custom-model-item-badge';
        ctxBadge.textContent = `${(m.contextLength / 1000).toFixed(0)}K`;
        badgesContainer.appendChild(ctxBadge);
      }

      if (badgesContainer.children.length > 0) {
        item.appendChild(badgesContainer);
      }

      item.addEventListener('click', () => {
        settings.model = m.id;
        saveSettings();
        
        if (chatModelSelect) {
          chatModelSelect.value = m.id;
          chatModelSelect.dispatchEvent(new Event('change'));
        }
        
        updateModelLabel();
        modelDropdown.classList.add('hidden');
      });

      listContainer!.appendChild(item);
    }
  }

  updateModelLabel();
}

function initCustomFiltersDropdown() {
  const btn = document.getElementById('btn-chat-more-actions');
  const dropdown = document.getElementById('custom-filters-dropdown');
  const scopeInput = document.getElementById('topbar-scope-input') as HTMLInputElement | null;

  if (!btn || !dropdown) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
    if (!dropdown.classList.contains('hidden')) {
      if (scopeInput && activeProject) {
        scopeInput.value = activeProject.scopePath || '';
        scopeInput.focus();
      }
    }
  });

  dropdown.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  });

  scopeInput?.addEventListener('input', () => {
    if (!activeProject) return;
    activeProject.scopePath = scopeInput.value.trim();
    saveProjects();
    updateFilterButtonUI();
    
    const sidebarScopeInput = document.getElementById('sidebar-scope-input') as HTMLInputElement | null;
    if (sidebarScopeInput) {
      sidebarScopeInput.value = activeProject.scopePath;
    }
  });
}

function updateFilterButtonUI() {
  const btn = document.getElementById('btn-chat-more-actions');
  if (!btn) return;
  if (activeProject && activeProject.scopePath) {
    btn.classList.add('filter-active');
  } else {
    btn.classList.remove('filter-active');
  }
}

function updateLowcodeContextPlaceholder() {
  const placeholder = document.getElementById('lowcode-context-placeholder');
  const content = document.getElementById('lowcode-context-content');
  const expandBtn = document.getElementById('btn-lowcode-context-expand');
  
  const hasPath = !!(activeProject && activeProject.workspacePath);
  
  if (placeholder) placeholder.classList.toggle('hidden', hasPath);
  if (content) content.classList.toggle('hidden', !hasPath);
  if (expandBtn) expandBtn.classList.toggle('hidden', !hasPath);
}

function initLowcodeContextPanelClicks() {
  const panel = document.querySelector('.lowcode-context-panel');
  if (!panel) return;

  const expandBtn = document.getElementById('btn-lowcode-context-expand');
  const previewPanel = document.querySelector('.preview-panel');

  const ensureExpanded = () => {
    if (previewPanel && !previewPanel.classList.contains('show-advanced-tools')) {
      expandBtn?.click();
    }
  };

  const syncTabClick = (tabName: string) => {
    ensureExpanded();
    const tabBtn = document.getElementById(`tab-${tabName}`);
    if (tabBtn) tabBtn.click();
  };

  document.getElementById('lowcode-context-files')?.parentElement?.addEventListener('click', () => syncTabClick('files'));
  document.getElementById('lowcode-context-pages')?.parentElement?.addEventListener('click', () => syncTabClick('files'));
  document.getElementById('lowcode-context-api')?.parentElement?.addEventListener('click', () => syncTabClick('files'));
  document.getElementById('lowcode-context-db')?.parentElement?.addEventListener('click', () => syncTabClick('files'));

  const rows = panel.querySelectorAll('.lowcode-context-row');
  rows.forEach((row) => {
    row.addEventListener('click', () => {
      const text = row.querySelector('span')?.textContent?.trim();
      if (text === t('Деплой')) {
        syncTabClick('terminal');
      } else {
        syncTabClick('files');
      }
    });
  });
}

initCustomModelDropdown();
initCustomFiltersDropdown();
initLowcodeContextPanelClicks();

document.getElementById('btn-chat-detach-context')?.addEventListener('click', async (e) => {
  e.stopPropagation();
  if (!activeProject) return;
  const ok = await confirmDialog('Открепить рабочую папку от этого проекта?', 'Открепление папки');
  if (ok) {
    activeProject.workspacePath = '';
    activeProject.scopePath = '';
    saveProjects();
    updateSidebarFolderUI(activeProject);
    renderSidebarProjects();
    renderAgentTabs();
    renderPreview();
    refreshWorkspaceFilesUI();
    appendBubble('Система', t('🗑️ Рабочая папка откреплена от проекта.'), true);
  }
});

document.getElementById('btn-context-select-folder')?.addEventListener('click', () => {
  btnSidebarSelectFolder.click();
});

// Sidebar Settings Click
btnSidebarSettings.addEventListener('click', () => {
  openSettings();
});

// Sidebar workspace details toggle
const btnToggleWorkspace = document.getElementById('btn-sidebar-toggle-workspace');
const workspaceDetails = document.getElementById('sidebar-workspace-details');
const sidebarFolderMini = document.getElementById('sidebar-folder-mini');
function toggleWorkspaceDetails() {
  workspaceDetails?.classList.toggle('hidden');
  if (workspaceDetails && !workspaceDetails.classList.contains('hidden')) {
    renderRecentFolders();
  }
}
btnToggleWorkspace?.addEventListener('click', toggleWorkspaceDetails);
sidebarFolderMini?.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).closest('button')) return;
  toggleWorkspaceDetails();
});

// Sidebar chat search filter
const sidebarChatSearch = document.getElementById('sidebar-chat-search') as HTMLInputElement;
sidebarChatSearch?.addEventListener('input', () => {
  const query = sidebarChatSearch.value.toLowerCase().trim();
  const items = sidebarProjectsList.querySelectorAll('.sidebar-project-item');
  items.forEach(el => {
    const name = (el.querySelector('.sidebar-project-name') as HTMLElement)?.textContent?.toLowerCase() || '';
    const folder = (el.querySelector('.sidebar-project-folder') as HTMLElement)?.textContent?.toLowerCase() || '';
    el.classList.toggle('hidden', query !== '' && !name.includes(query) && !folder.includes(query));
  });
});

// Scope input change
sidebarScopeInput.addEventListener('change', () => {
  if (!activeProject) return;
  activeProject.scopePath = sidebarScopeInput.value.trim();
  saveProjects();
  appendBubble('Система', `🎯 ${t('Область работы установлена')}: "${activeProject.scopePath || t('весь проект')}"`, true);
});


// ─── Click-to-Plan visual inspector ───
let isInspectMode = false;
let selectedComponentContext: string | null = null;
let hoveredElement: HTMLElement | null = null;
let originalOutline = '';

function setupIframeInspection() {
  try {
    const iframeDoc = previewIframe.contentDocument || previewIframe.contentWindow?.document;
    if (!iframeDoc) return;

    // Mouse over event
    iframeDoc.addEventListener('mouseover', (e: MouseEvent) => {
      if (!isInspectMode) return;
      const target = e.target as HTMLElement;
      if (hoveredElement && hoveredElement !== target) {
        hoveredElement.style.outline = originalOutline;
      }
      hoveredElement = target;
      originalOutline = target.style.outline || '';
      target.style.outline = '2px solid var(--accent-purple)';
      target.style.outlineOffset = '-2px';
      target.style.cursor = 'crosshair';
    });

    // Mouse out event
    iframeDoc.addEventListener('mouseout', (e: MouseEvent) => {
      if (!isInspectMode) return;
      const target = e.target as HTMLElement;
      if (target === hoveredElement) {
        target.style.outline = originalOutline;
        target.style.cursor = '';
        hoveredElement = null;
      }
    });

    // Click event (intercept)
    iframeDoc.addEventListener('click', (e: MouseEvent) => {
      if (!isInspectMode) return;
      e.preventDefault();
      e.stopPropagation();

      const target = e.target as HTMLElement;
      target.style.outline = originalOutline;
      target.style.cursor = '';
      hoveredElement = null;

      // Extract DOM tree & global style vars
      selectedComponentContext = extractComponentContext(target, iframeDoc);

      // Update context UI
      updateComponentContextUI(target);

      // Disable inspect mode
      toggleInspectMode(false);

      // Add system message to chat about selected element
      let tagDesc = target.tagName.toLowerCase();
      if (target.id) tagDesc += `#${target.id}`;

      appendBubble('Система', `🔍 ${t('Выбран элемент')} <${tagDesc}>. ${t('Контекст этого элемента будет добавлен к вашему следующему сообщению. Опишите в чате, что хотите изменить.')}`, true);

      // Show a brief focus hint on the chat input
      chatInput.placeholder = '✏️ Опишите, что изменить в выбранном элементе...';
      chatInput.focus();

      // Do NOT force switch to plan mode - user stays in current mode
      // But also try to generate a draft step if user is in plan mode
      if (appMode === 'plan') {
        const planWidgets = document.querySelectorAll('.plan-widget');
        if (planWidgets.length === 0) {
          renderPlanWidgetInChat([]);
        }
        generateDraftStepForComponent(selectedComponentContext, tagDesc);
      }
    }, true); // Use capture phase to intercept clicks before other handlers
  } catch (err: any) {
    console.warn('Failed to setup iframe inspection:', err.message);
  }
}

function sanitizeHTMLForContext(html: string): string {
  // Replace img tags with placeholders to prevent AI from trying to read image files
  return html.replace(/<img\s[^>]*src="([^"]*)"[^>]*>/gi, (match, src) => {
    return `<!-- image: ${src} (removed: text model cannot read images) -->`;
  }).replace(/<img\s[^>]*src='([^']*)'[^>]*>/gi, (match, src) => {
    return `<!-- image: ${src} (removed: text model cannot read images) -->`;
  });
}

function extractComponentContext(element: HTMLElement, doc: Document): string {
  let brandStyles = '';
  try {
    const styleTags = doc.querySelectorAll('style');
    styleTags.forEach(style => {
      const text = style.textContent || '';
      if (text.includes(':root') || text.includes('--')) {
        const matches = text.match(/:root\s*\{[^}]+\}/g);
        if (matches) {
          brandStyles += matches.join('\n') + '\n';
        } else {
          brandStyles += text.split('\n').slice(0, 30).join('\n') + '\n';
        }
      }
    });
  } catch (e) {}

  let tagDesc = element.tagName.toLowerCase();
  if (element.id) tagDesc += `#${element.id}`;
  if (element.className) tagDesc += `.${element.className.split(' ').filter(Boolean).join('.')}`;

  const sanitizedHTML = sanitizeHTMLForContext(element.outerHTML);

  return `=== CLICK-TO-PLAN ACTIVE COMPONENT CONTEXT ===
Selected Element: <${tagDesc}>
DOM Tree (без изображений — модель не поддерживает изображения):
${sanitizedHTML}

Global Brand Styles:
${brandStyles.trim() || 'No global style variables detected.'}
==============================================`;
}

function updateComponentContextUI(element?: HTMLElement) {
  const bar = document.getElementById('selected-component-bar');
  const nameEl = document.getElementById('selected-component-name');
  if (!bar || !nameEl) return;

  if (selectedComponentContext && element) {
    let tagDesc = element.tagName.toLowerCase();
    if (element.id) tagDesc += `#${element.id}`;
    nameEl.textContent = `Компонент: <${tagDesc}>`;
    bar.classList.remove('hidden');
  } else {
    bar.classList.add('hidden');
    selectedComponentContext = null;
  }
}

function toggleInspectMode(forceVal?: boolean) {
  const btn = document.getElementById('btn-inspect-element');
  if (!btn) return;
  
  isInspectMode = forceVal !== undefined ? forceVal : !isInspectMode;
  
  if (isInspectMode) {
    btn.classList.add('active');
    previewIframe.style.outline = '2px dashed var(--accent-purple)';
    previewIframe.style.outlineOffset = '-2px';
    previewIframe.style.cursor = 'crosshair';
    // Show inspect hint overlay
    let hint = document.getElementById('inspect-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'inspect-hint';
      hint.style.cssText = 'position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:100; background:var(--accent-purple); color:#fff; padding:6px 14px; border-radius:8px; font-size:12px; font-weight:600; pointer-events:none; box-shadow:0 2px 8px rgba(0,0,0,0.15); display:flex; align-items:center; gap:6px;';
      hint.innerHTML = '<i data-lucide="mouse-pointer-2"></i> Кликните на любой элемент в превью, чтобы выбрать его';
      document.getElementById('iframe-wrapper')?.appendChild(hint);
      refreshIcons();
    }
  } else {
    btn.classList.remove('active');
    previewIframe.style.outline = '';
    previewIframe.style.outlineOffset = '';
    previewIframe.style.cursor = '';
    const hint = document.getElementById('inspect-hint');
    if (hint) hint.remove();
    if (hoveredElement) {
      hoveredElement.style.outline = originalOutline;
      hoveredElement.style.cursor = '';
      hoveredElement = null;
    }
  }
}


  // Download / Copy / New / Clear
$('#btn-external-preview').addEventListener('click', () => {
  if (!activeProject?.code) return;
  if (window.electronAPI?.openExternalPreview) {
    window.electronAPI.openExternalPreview(activeProject.code).catch(e => console.error(e));
  }
});

$('#btn-download').addEventListener('click', () => { 
  if (!activeProject?.code) return; 
  const b = new Blob([activeProject.code], { type: 'text/html' }); 
  const a = document.createElement('a'); 
  a.href = URL.createObjectURL(b); 
  a.download = (activeProject.name || 'project') + '.html'; 
  a.click(); 
  URL.revokeObjectURL(a.href); 
});

$('#btn-copy-code').addEventListener('click', () => { 
  if (!activeProject?.code) return; 
  navigator.clipboard.writeText(activeProject.code).then(() => { 
    const b = $('#btn-copy-code'); 
    b.innerHTML = `<i data-lucide="check"></i> ${esc(t('Скопировано'))}`;
    refreshIcons(); 
    setTimeout(() => { b.innerHTML = `<i data-lucide="copy"></i> ${esc(t('Копировать'))}`; refreshIcons(); }, 2000);
  }); 
});

// ═══════════════════════════════════════════
// SETTINGS PAGE CONTROL
// ═══════════════════════════════════════════
function openSettings() {
  workspaceView.classList.add('hidden');
  settingsPage.classList.remove('hidden');
  setupBanner.classList.add('hidden');
  
  // Populate settings fields
  apiKeyInput.value = settings.apiKey;
  (document.getElementById('s-language') as HTMLSelectElement).value = settings.language || 'ru';
  (document.getElementById('s-show-examples') as HTMLInputElement).checked = settings.showExamples;
  (document.getElementById('s-show-loading') as HTMLInputElement).checked = settings.showLoading;
  (document.getElementById('s-sounds') as HTMLInputElement).checked = settings.sounds;
  (document.getElementById('s-theme') as HTMLSelectElement).value = settings.theme;
  (document.getElementById('s-ui-font') as HTMLSelectElement).value = settings.uiFont;
  (document.getElementById('s-code-font') as HTMLSelectElement).value = settings.codeFont;
  (document.getElementById('s-font-size') as HTMLSelectElement).value = String(settings.fontSize);

  // Generation & checkpoint settings
  const sTemp = document.getElementById('s-temperature') as HTMLInputElement;
  const sTempVal = document.getElementById('s-temperature-val');
  if (sTemp) {
    sTemp.value = String(settings.temperature ?? 0.2);
    if (sTempVal) sTempVal.textContent = String(settings.temperature ?? 0.2);
    sTemp.oninput = () => { if (sTempVal) sTempVal.textContent = sTemp.value; };
  }
  const sMaxTokens = document.getElementById('s-max-tokens') as HTMLSelectElement;
  if (sMaxTokens) sMaxTokens.value = String(settings.maxTokens || 4096);
  const sAutoCheck = document.getElementById('s-auto-checkpoint') as HTMLInputElement;
  if (sAutoCheck) sAutoCheck.checked = settings.autoCheckpoint !== false;

  // Populate fallback model selector
  const sFallback = document.getElementById('s-fallback-model') as HTMLSelectElement;
  if (sFallback && settings.cachedModels.length > 0) {
    sFallback.innerHTML = '<option value="">— ' + t('нет') + ' —</option>';
    for (const m of settings.cachedModels) {
      const o = document.createElement('option');
      o.value = m.id;
      const freeBadge = m.isFree ? ' [FREE]' : '';
      const ctxInfo = m.contextLength ? ` · ${(m.contextLength / 1000).toFixed(0)}K` : '';
      o.textContent = (m.name || m.id).split(' · ')[0] + freeBadge + ctxInfo;
      if (m.id === settings.fallbackModel) o.selected = true;
      sFallback.appendChild(o);
    }
  }

  // Permissions settings populating
  sSandboxEnabled.checked = settings.sandboxEnabled;
  sPermRead.value = settings.permRead;
  sPermWrite.value = settings.permWrite;
  sPermExec.value = settings.permExec;
  const sMinToTray = document.getElementById('s-minimize-to-tray') as HTMLInputElement;
  if (sMinToTray) sMinToTray.checked = !!settings.minimizeToTray;

  // Provider and auto-commit populating
  const sProvider = document.getElementById('s-provider') as HTMLSelectElement;
  const sOllamaUrl = document.getElementById('s-ollama-url') as HTMLInputElement;
  const rowApiKey = document.getElementById('row-api-key') as HTMLElement;
  const rowOllamaUrl = document.getElementById('row-ollama-url') as HTMLElement;
  const sGitAutoCommit = document.getElementById('s-git-auto-commit') as HTMLInputElement;

  const sGitVerifyCommit = document.getElementById('s-git-verify-commit') as HTMLInputElement;
  const sGitCommitPrefix = document.getElementById('s-git-commit-prefix') as HTMLInputElement;
  const sOllamaContext = document.getElementById('s-ollama-context') as HTMLSelectElement;

  if (sProvider) sProvider.value = settings.llmProvider || 'openrouter';
  if (sOllamaUrl) sOllamaUrl.value = settings.ollamaUrl || 'http://localhost:11434';
  if (sGitAutoCommit) sGitAutoCommit.checked = !!settings.gitAutoCommit;
  if (sGitVerifyCommit) sGitVerifyCommit.checked = !!settings.gitVerifyCommit;
  if (sGitCommitPrefix) sGitCommitPrefix.value = settings.gitCommitPrefix || '[AI]';
  if (sOllamaContext) sOllamaContext.value = String(settings.ollamaContextSize || 4096);

  const provVal = settings.llmProvider || 'openrouter';
  const rowOllamaContext = document.getElementById('row-ollama-context');
  if (provVal === 'ollama') {
    if (rowApiKey) rowApiKey.style.display = 'none';
    if (rowOllamaUrl) rowOllamaUrl.style.display = 'flex';
    if (rowOllamaContext) rowOllamaContext.style.display = 'flex';
  } else {
    if (rowApiKey) rowApiKey.style.display = 'flex';
    if (rowOllamaUrl) rowOllamaUrl.style.display = 'none';
    if (rowOllamaContext) rowOllamaContext.style.display = 'none';
  }

  const rowVerify = document.getElementById('row-git-verify-commit');
  const rowPrefix = document.getElementById('row-git-commit-prefix');
  if (rowVerify) rowVerify.style.display = settings.gitAutoCommit ? 'flex' : 'none';
  if (rowPrefix) rowPrefix.style.display = settings.gitAutoCommit ? 'flex' : 'none';

  if (settings.cachedModels.length > 0) populateModelSelect(settings.cachedModels, settings.model);
  else if (settings.apiKey || settings.llmProvider === 'ollama') {
    fetchModels(settings.llmProvider, settings.ollamaUrl, settings.apiKey).then(m => {
      settings.cachedModels = m;
      saveSettings();
      populateModelSelect(m, settings.model);
    });
  }
  
  // Populate Profile fields
  let profile = { codingStyle: '', libraries: [] as string[], customNotes: '' };
  try {
    const saved = localStorage.getItem('ag_user_profile');
    if (saved) profile = JSON.parse(saved);
  } catch (e) {}

  const sProfileStyle = document.getElementById('s-profile-style') as HTMLTextAreaElement;
  const sProfileLibs = document.getElementById('s-profile-libs') as HTMLInputElement;
  const sProfileNotes = document.getElementById('s-profile-notes') as HTMLTextAreaElement;
  
  if (sProfileStyle) sProfileStyle.value = profile.codingStyle;
  if (sProfileLibs) sProfileLibs.value = profile.libraries.join(', ');
  if (sProfileNotes) sProfileNotes.value = profile.customNotes;
  const sSysPrompt = document.getElementById('s-system-prompt') as HTMLTextAreaElement;
  if (sSysPrompt) sSysPrompt.value = (settings.systemPrompt && settings.systemPrompt !== DEFAULT_SYSTEM_PROMPT) ? settings.systemPrompt : '';

  renderSkillsList();
  renderMcpServers();

  refreshIcons();
}

function closeSettings() {
  // Save settings values
  settings.apiKey = apiKeyInput.value.trim();
  settings.model = modelSelect.value;
  const prevLang = settings.language;
  settings.language = (document.getElementById('s-language') as HTMLSelectElement).value;
  settings.showExamples = (document.getElementById('s-show-examples') as HTMLInputElement).checked;
  settings.showLoading = (document.getElementById('s-show-loading') as HTMLInputElement).checked;
  settings.sounds = (document.getElementById('s-sounds') as HTMLInputElement).checked;
  settings.theme = (document.getElementById('s-theme') as HTMLSelectElement).value;
  settings.uiFont = (document.getElementById('s-ui-font') as HTMLSelectElement).value;
  settings.codeFont = (document.getElementById('s-code-font') as HTMLSelectElement).value;
  settings.fontSize = parseInt((document.getElementById('s-font-size') as HTMLSelectElement).value);

  // Generation & checkpoint settings
  const sTemp = document.getElementById('s-temperature') as HTMLInputElement;
  if (sTemp) settings.temperature = parseFloat(sTemp.value);
  const sMaxTokens = document.getElementById('s-max-tokens') as HTMLSelectElement;
  if (sMaxTokens) settings.maxTokens = parseInt(sMaxTokens.value) || 4096;
  const sAutoCheck = document.getElementById('s-auto-checkpoint') as HTMLInputElement;
  if (sAutoCheck) settings.autoCheckpoint = sAutoCheck.checked;
  const sFallback = document.getElementById('s-fallback-model') as HTMLSelectElement;
  if (sFallback) settings.fallbackModel = sFallback.value || '';

  // Permissions saving
  settings.sandboxEnabled = sSandboxEnabled.checked;
  settings.permRead = sPermRead.value as any;
  settings.permWrite = sPermWrite.value as any;
  settings.permExec = sPermExec.value as any;

  const sProvider = document.getElementById('s-provider') as HTMLSelectElement;
  if (sProvider) settings.llmProvider = sProvider.value as any;
  const sOllamaUrl = document.getElementById('s-ollama-url') as HTMLInputElement;
  if (sOllamaUrl) settings.ollamaUrl = sOllamaUrl.value.trim();
  const sGitAutoCommit = document.getElementById('s-git-auto-commit') as HTMLInputElement;
  if (sGitAutoCommit) settings.gitAutoCommit = sGitAutoCommit.checked;
  const sGitVerifyCommit = document.getElementById('s-git-verify-commit') as HTMLInputElement;
  if (sGitVerifyCommit) settings.gitVerifyCommit = sGitVerifyCommit.checked;
  const sGitCommitPrefix = document.getElementById('s-git-commit-prefix') as HTMLInputElement;
  if (sGitCommitPrefix) settings.gitCommitPrefix = sGitCommitPrefix.value.trim() || '[AI]';
  const sOllamaContext = document.getElementById('s-ollama-context') as HTMLSelectElement;
  if (sOllamaContext) settings.ollamaContextSize = parseInt(sOllamaContext.value) || 4096;
  const sMinToTraySave = document.getElementById('s-minimize-to-tray') as HTMLInputElement;
  if (sMinToTraySave) {
    settings.minimizeToTray = sMinToTraySave.checked;
    if (window.electronAPI?.setMinimizeToTray) {
      window.electronAPI.setMinimizeToTray(settings.minimizeToTray).catch(() => {});
    }
  }

  // Save Profile fields
  const sProfileStyle = document.getElementById('s-profile-style') as HTMLTextAreaElement;
  const sProfileLibs = document.getElementById('s-profile-libs') as HTMLInputElement;
  const sProfileNotes = document.getElementById('s-profile-notes') as HTMLTextAreaElement;

  if (sProfileStyle && sProfileLibs && sProfileNotes) {
    const profileObj = {
      codingStyle: sProfileStyle.value.trim(),
      libraries: sProfileLibs.value.split(',').map(s => s.trim()).filter(s => s),
      customNotes: sProfileNotes.value.trim()
    };
    localStorage.setItem('ag_user_profile', JSON.stringify(profileObj));
  }

  // Save user-defined system prompt override
  const sSysPrompt = document.getElementById('s-system-prompt') as HTMLTextAreaElement;
  if (sSysPrompt) settings.systemPrompt = sSysPrompt.value.trim() || DEFAULT_SYSTEM_PROMPT;

  saveSettings();
  
  // Apply changes
  applyVisualSettings();

  // Language change requires a reload to re-render all static UI cleanly
  if (prevLang !== settings.language) {
    location.reload();
    return;
  }
  
  const examplesEl = $('.welcome-examples');
  if (examplesEl) {
    examplesEl.style.display = settings.showExamples ? 'flex' : 'none';
  }

  updateModelLabel();
  updateSetupBanner();
  applyTheme();
  document.dispatchEvent(new Event('ag:models-updated'));
  settingsPage.classList.add('hidden');
  workspaceView.classList.remove('hidden');
}

$('#btn-open-setup')?.addEventListener('click', openSettings);
// The setup banner itself acts as a call-to-action to open Settings.
setupBanner?.addEventListener('click', openSettings);
setupBanner?.addEventListener('keydown', (e: any) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSettings(); }
});
$('#btn-close-settings').addEventListener('click', closeSettings);

$('#btn-save-settings')?.addEventListener('click', closeSettings);

$('#btn-add-mcp-server')?.addEventListener('click', () => openMcpEditForm(null));
$('#btn-mcp-save')?.addEventListener('click', saveMcpServer);
$('#btn-mcp-cancel')?.addEventListener('click', closeMcpEditForm);

// Settings sidebar nav
$$('.settings-nav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.settings-nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const section = (btn as HTMLElement).dataset.section;
  $$('.settings-section-page').forEach(p => p.classList.remove('active'));
  document.querySelector(`.settings-section-page[data-section="${section}"]`)?.classList.add('active');
}));

// Toggle API key visibility
$('#btn-toggle-key').addEventListener('click', () => { apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password'; });

// API key auto-fetch models
let fetchTimeout: any = null;
apiKeyInput.addEventListener('input', () => {
  clearTimeout(fetchTimeout);
  const key = apiKeyInput.value.trim();
  if (key.length > 10) {
    fetchTimeout = setTimeout(async () => {
      const models = await fetchModels(key);
      if (models.length > 0) { settings.cachedModels = models; populateModelSelect(models, settings.model); }
    }, 600);
  } else { modelSelect.innerHTML = `<option value="">${t('Сначала введите API-ключ...')}</option>`; modelSelect.disabled = true; modelsStatus.textContent = ''; }
});

// Test connection
$('#btn-test-connection').addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { providerStatus.textContent = t('Введите API-ключ'); return; }
  providerStatus.textContent = t('Проверяем...');
  try {
    const resp = await fetch(`${API_BASE}/models`, { headers: { 'Authorization': `Bearer ${key}` } });
    if (resp.ok) { providerStatus.textContent = t('✅ Подключено! Модели доступны.'); providerStatus.style.color = 'var(--accent-green)'; }
    else { providerStatus.textContent = `❌ ${t('Ошибка')}: HTTP ${resp.status}`; providerStatus.style.color = 'var(--accent-red)'; }
  } catch (e: any) { providerStatus.textContent = `❌ ${e.message}`; providerStatus.style.color = 'var(--accent-red)'; }
});

// Refresh models
$('#btn-refresh-models').addEventListener('click', async () => {
  const key = apiKeyInput.value.trim();
  if (!key) { modelsStatus.textContent = t('Введите API-ключ'); return; }
  // Use the same background refresh path so the user gets the same diff messages
  // and price/model-removal handling as on startup.
  if (key !== settings.apiKey) { settings.apiKey = key; saveSettings(); }
  await refreshModelsInBackground();
  populateModelSelect(settings.cachedModels, settings.model);
});

// Clear all data
$('#btn-clear-all-data').addEventListener('click', async () => {
  const ok = await confirmDialog(t('Вы уверены? Все проекты, чаты и настройки будут удалены!'), t('Очистить все данные'));
  if (!ok) return;
  try {
    // Stop any pending debounced project save so it can't rewrite data after the wipe.
    if (saveProjectsTimer) { clearTimeout(saveProjectsTimer); saveProjectsTimer = null; }
    projects = [];
    activeProject = null;

    // 1. Plain localStorage — settings, user profile, skills, recent folders, chat width.
    localStorage.clear();

    // 2. Persistent project/chat store (a separate JSON file in userData, NOT localStorage).
    if (window.electronAPI?.storeSet) {
      await window.electronAPI.storeSet('projects', '[]').catch(() => {});
    }

    // 3. Encrypted OpenRouter API key (stored in secure-key.bin via safeStorage,
    //    so localStorage.clear() never removed it — this was the reported bug).
    if (window.electronAPI?.secureKeySet) {
      await window.electronAPI.secureKeySet('').catch(() => {});
    }
  } finally {
    location.reload();
  }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === ',') { e.preventDefault(); if (settingsPage.classList.contains('hidden')) openSettings(); else closeSettings(); }
  if (e.ctrlKey && e.key === 'n') { e.preventDefault(); const p = createProject(); switchToProject(p); }
  // Esc: stop generation if the agent is currently working
  if (e.key === 'Escape' && isGenerating) {
    const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (!inInput) {
      e.preventDefault();
      document.getElementById('btn-stop-generation')?.dispatchEvent(new Event('click'));
    }
  }
  // Ctrl+Shift+P or Ctrl+O: quick folder select
  if ((e.ctrlKey && e.shiftKey && e.key === 'P') || (e.ctrlKey && e.key === 'o')) {
    e.preventDefault();
    btnSidebarSelectFolder.click();
  }
  // Alt+Left/Right: switch between projects (agent tabs)
  if (e.altKey && e.key === 'ArrowLeft' && projects.length > 1 && activeProject) {
    e.preventDefault();
    const idx = projects.findIndex(p => p.id === activeProject!.id);
    const prev = (idx - 1 + projects.length) % projects.length;
    switchToProject(projects[prev]);
  }
  if (e.altKey && e.key === 'ArrowRight' && projects.length > 1 && activeProject) {
    e.preventDefault();
    const idx = projects.findIndex(p => p.id === activeProject!.id);
    const next = (idx + 1) % projects.length;
    switchToProject(projects[next]);
  }
  // Ctrl+K: focus chat search
  if (e.ctrlKey && e.key === 'k') {
    e.preventDefault();
    const searchInput = document.getElementById('chat-search-input') as HTMLInputElement;
    const searchBar = document.getElementById('chat-search-bar');
    if (searchBar && searchInput) {
      searchBar.classList.remove('hidden');
      searchInput.focus();
    }
  }
  // Ctrl+L: clear chat and start new
  if (e.ctrlKey && e.key === 'l' && !e.shiftKey) {
    e.preventDefault();
    if (activeProject && !isGenerating) {
      activeProject.chatHistory = [];
      saveProjects();
      renderChatHistory();
      chatInput.focus();
    }
  }
  // Ctrl+Shift+M: toggle Build/Plan mode
  if (e.ctrlKey && e.shiftKey && e.key === 'M') {
    e.preventDefault();
    const newMode = appMode === 'build' ? 'plan' : 'build';
    appMode = newMode;
    const tb = document.getElementById('mode-tab-build');
    const tp = document.getElementById('mode-tab-plan');
    if (newMode === 'build') {
      tb?.classList.add('active');
      tp?.classList.remove('active');
      chatInput.placeholder = t('Опишите, что хотите создать или исправить...');
    } else {
      tp?.classList.add('active');
      tb?.classList.remove('active');
      chatInput.placeholder = t('Опишите, что хотите спроектировать и спланировать...');
    }
  }
});

$$('.modal-backdrop').forEach(b => b.addEventListener('click', e => {
  // The diff-modal owns a pending Promise (requestDiffApproval). Hiding it via
  // the generic backdrop click would resolve nothing and hang the write — so
  // skip it here; the user closes it with Approve/Reject/✕ instead.
  if ((b as HTMLElement).id === 'diff-modal') return;
  if (e.target === b) b.classList.add('hidden');
}));

// @-references autocomplete
const atRefs = document.getElementById('at-references')!;
let atRefFiles: { path: string; isDir: boolean }[] = [];
let atRefIdx = -1;
let atPos = -1;

const loadAtRefs = async (query: string) => {
  if (!activeProject?.workspacePath) { atRefs.classList.add('hidden'); return; }
  try {
    const files = await window.electronAPI.readDir(activeProject.workspacePath);
    atRefFiles = files.filter(f => !f.path.startsWith('.shadow-workspace'));
  } catch { atRefFiles = []; }
  const matched = atRefFiles.filter(f => {
    const name = f.path.split('/').pop() || f.path;
    return name.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 15);
  atRefs.innerHTML = '';
  if (matched.length === 0) { atRefs.classList.add('hidden'); return; }
  atRefIdx = 0;
  matched.forEach((f, i) => {
    const d = document.createElement('div');
    d.className = 'at-ref-item' + (i === 0 ? ' active' : '');
    d.innerHTML = `<i data-lucide="${f.isDir ? 'folder' : 'file-code'}"></i><span class="at-ref-name">${esc(f.path)}</span>`;
    d.addEventListener('mousedown', (e) => { e.preventDefault(); insertAtRef(f.path); });
    atRefs.appendChild(d);
  });
  atRefs.classList.remove('hidden');
  refreshIcons();
};

const insertAtRef = (path: string) => {
  const before = chatInput.value.substring(0, atPos);
  const after = chatInput.value.substring(atPos).replace(/^@\w*/, '');
  chatInput.value = before + '@' + path + ' ' + after;
  atRefs.classList.add('hidden');
  chatInput.focus();
  chatInput.dispatchEvent(new Event('input'));
};

chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); btnSend.click(); }
  if (!atRefs.classList.contains('hidden')) {
    if (e.key === 'ArrowDown') { e.preventDefault(); atRefIdx = Math.min(atRefIdx + 1, atRefs.children.length - 1); atRefs.querySelectorAll('.at-ref-item').forEach((el, i) => el.classList.toggle('active', i === atRefIdx)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); atRefIdx = Math.max(atRefIdx - 1, 0); atRefs.querySelectorAll('.at-ref-item').forEach((el, i) => el.classList.toggle('active', i === atRefIdx)); return; }
    if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); if (atRefIdx >= 0 && atRefIdx < atRefs.children.length) insertAtRef(atRefFiles.filter(f => { const n = (f.path.split('/').pop() || f.path); return n.toLowerCase().includes((chatInput.value.substring(atPos).match(/@(\w*)/) || ['',''])[1].toLowerCase()); }).slice(0, 15)[atRefIdx]?.path || ''); return; }
  }
});

chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto'; chatInput.style.height = Math.min(chatInput.scrollHeight, 500) + 'px';
  // Disable send when empty (unless generating, which is handled separately)
  if (!isGenerating) {
    btnSend.disabled = chatInput.value.trim().length === 0;
  }
  const pos = chatInput.selectionStart;
  const textBefore = chatInput.value.substring(0, pos);
  const atMatch = textBefore.match(/@(\w*)$/);
  if (atMatch) {
    atPos = atMatch.index!;
    loadAtRefs(atMatch[1]);
  } else {
    atRefs.classList.add('hidden');
  }
});

// Image paste support (Ctrl+V / Cmd+V)
chatInput.addEventListener('paste', (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of Array.from(items)) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (blob) handleImageFile(blob);
      return;
    }
  }
});

// Image drag-and-drop support on chat input area
const chatInputArea = document.querySelector('.chat-input-area') as HTMLElement;
if (chatInputArea) {
  chatInputArea.addEventListener('dragover', (e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    chatInputArea.classList.add('drag-over');
  });
  chatInputArea.addEventListener('dragleave', () => {
    chatInputArea.classList.remove('drag-over');
  });
  chatInputArea.addEventListener('drop', (e: DragEvent) => {
    e.preventDefault();
    chatInputArea.classList.remove('drag-over');
    const files = e.dataTransfer?.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        handleImageFile(file);
      }
    }
  });
}

async function handleImageFile(file: File) {
  if (!activeProject) {
    appendBubble('7/24 IDE', t('⚠️ Сначала откройте проект для работы с изображениями.'), true);
    return;
  }
  if (!activeProject.workspacePath) {
    appendBubble('7/24 IDE', t('⚠️ Рабочая папка не выбрана. Невозможно сохранить изображение.'), true);
    return;
  }
  // Convert image to base64 and save to workspace
  const ext = file.name.split('.').pop() || 'png';
  const filename = `.7-24-images/paste-${Date.now()}.${ext}`;
  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result as string;
    const base64Content = dataUrl.split(',')[1];
    try {
      // Use writeFile with base64 content marker
      const content = `BASE64:${base64Content}`;
      await window.electronAPI.writeFile(filename, content, activeProject!.workspacePath, true);
      attachedFiles.add(filename);
      renderAttachedFiles();
      appendBubble('7/24 IDE', t('🖼️ Изображение прикреплено к контексту.'), true);
    } catch (_) {
      appendBubble('7/24 IDE', t('⚠️ Не удалось сохранить изображение. Попробуйте прикрепить файл через браузер файлов.'), true);
    }
  };
  reader.readAsDataURL(file);
}

// ═══════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════
function esc(t: string): string { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
function showActiveOp(text: string) {
  // Routed into the new activity bar's middle slot (tool/path display).
  setActivityTool(text);
}
function hideActiveOp() {
  setActivityTool('');
}
function updateModelLabel() {
  const activeModelLabel = document.getElementById('active-model-label');
  const agenticLabel = document.getElementById('agentic-topbar-model-label');
  const m = settings.cachedModels.find(x => x.id === settings.model);
  
  if (m) {
    const ctxInfo = m.contextLength ? ` · ${(m.contextLength / 1000).toFixed(0)}K контекст` : '';
    const cleanName = (m.name || m.id).split(' · ')[0];
    const textVal = cleanName + ctxInfo;
    const titleVal = m.id + (m.isFree ? ' [Бесплатно]' : '') + ctxInfo;

    if (activeModelLabel) {
      activeModelLabel.textContent = textVal;
      activeModelLabel.title = titleVal;
    }
    if (agenticLabel) {
      agenticLabel.textContent = cleanName;
      agenticLabel.title = titleVal;
    }
  } else {
    const textVal = settings.model || 'Модель не выбрана';
    if (activeModelLabel) {
      activeModelLabel.textContent = textVal;
      activeModelLabel.title = '';
    }
    if (agenticLabel) {
      agenticLabel.textContent = settings.model ? settings.model.split('/').pop() || settings.model : 'Auto';
      agenticLabel.title = '';
    }
  }
}
function updateSetupBanner() { setupBanner.classList.toggle('hidden', !!settings.apiKey); }
function refreshIcons() { (window as any).lucide?.createIcons(); }

let sharedAudioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!sharedAudioContext) {
    sharedAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (sharedAudioContext.state === 'suspended') {
    sharedAudioContext.resume();
  }
  return sharedAudioContext;
}

function playNotificationSound() {
  if (!settings.sounds) return;
  try {
    const context = getAudioContext();
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, context.currentTime); // D5
    osc.frequency.setValueAtTime(880, context.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.08, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start();
    osc.stop(context.currentTime + 0.35);
  } catch (e) {}
}

// ═══════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════
function init() {
  loadSettings(); 
  if (window.electronAPI?.mcpReinit) {
    window.electronAPI.mcpReinit(JSON.stringify(settings.mcpServers || [])).catch(() => {});
  }
  if (settings.minimizeToTray !== undefined && window.electronAPI?.setMinimizeToTray) {
    window.electronAPI.setMinimizeToTray(settings.minimizeToTray).catch(() => {});
  }
  setLang((settings.language as Lang) || 'ru');
  document.documentElement.dataset.lang = (settings.language as Lang) || 'ru';
  translateDOM();
  // Show first-run onboarding (language picker + API key) before loading projects
  const startApp = () => {
    loadProjects().then(() => {
      loadActiveProject();
      if (activeProject) {
        loadTokenAccumulated();
        switchToProject(activeProject);
      }
      renderSidebarProjects();
    });
  };
  if (!settings.onboardingDone) {
    showOnboarding().then(startApp);
  } else {
    startApp();
  }
  loadActiveProject();
  loadRecentFolders();
  updateModelLabel(); 
  updateSetupBanner();
  applyTheme();
  setupSystemThemeListener();
  applyVisualSettings();

  // Populate version labels from the real app version (no more hardcoded "v1.3.7").
  if (window.electronAPI?.getAppVersion) {
    window.electronAPI.getAppVersion().then(v => {
      if (!v) return;
      const settingsVer = document.getElementById('settings-version');
      if (settingsVer) settingsVer.textContent = `7/24 IDE v${v}`;
      const aboutVer = document.getElementById('about-version');
      if (aboutVer) aboutVer.textContent = `v${v}`;
    }).catch(() => {});
  }
  
  const examplesEl = $('.welcome-examples');
  if (examplesEl) {
    examplesEl.style.display = settings.showExamples ? 'flex' : 'none';
  }

  renderRecentFolders();
  renderAgentTabs();
  if (!activeProject) {
    addWelcomeMessage();
  }
  
  // Load API key from secure storage (migrating legacy plaintext key), then refresh models.
  // Strategy: always do a quiet background refresh at startup so new models / price
  // changes from the provider propagate without user action. If the cache is empty,
  // we wait for the result to populate the dropdowns.
  loadSecureApiKey().then(async () => {
    updateSetupBanner();
    if (!settings.apiKey) return;
    if (settings.cachedModels.length === 0) {
      // First run — block briefly to populate the UI
      await refreshModelsInBackground();
    } else {
      // Subsequent runs — refresh in the background, show diff if any
      refreshModelsInBackground();
    }
    // Periodic refresh: every 6 hours while the app is open
    setInterval(refreshModelsInBackground, 6 * 60 * 60 * 1000);
  });

  // Mode toggles
  const tabBuild = document.getElementById('mode-tab-build');
  const tabPlan = document.getElementById('mode-tab-plan');
  
  tabBuild?.addEventListener('click', () => {
    if (isExecutingPlan) return;
    appMode = 'build';
    tabBuild.classList.add('active');
    tabBuild.setAttribute('aria-selected', 'true');
    tabPlan?.classList.remove('active');
    tabPlan?.setAttribute('aria-selected', 'false');
    chatInput.placeholder = t('Опишите, что хотите создать или исправить...');
  });

  tabPlan?.addEventListener('click', () => {
    if (isExecutingPlan) return;
    appMode = 'plan';
    tabPlan.classList.add('active');
    tabPlan.setAttribute('aria-selected', 'true');
    tabBuild?.classList.remove('active');
    tabBuild?.setAttribute('aria-selected', 'false');
    chatInput.placeholder = t('Опишите, что хотите спроектировать и спланировать...');
  });

  // Workspace selection from starting preview prompt
  document.getElementById('btn-welcome-select-folder')?.addEventListener('click', async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        await setWorkspaceFolder(folder);
      }
    } catch (err: any) {
      alert(`${t('Ошибка выбора папки: ')}${err.message}`);
    }
  });

  // Click-to-Plan inspect mode toggle & clear handlers
  $('#btn-inspect-element')?.addEventListener('click', () => {
    // If inspect mode is currently active, turning it off also clears the selection
    if (isInspectMode) {
      selectedComponentContext = null;
      updateComponentContextUI();
      chatInput.placeholder = appMode === 'plan' ? t('Опишите, что хотите спроектировать и спланировать...') : t('Опишите, что хотите создать или исправить...');
    }
    toggleInspectMode();
  });

  $('#btn-clear-selected-component')?.addEventListener('click', () => {
    selectedComponentContext = null;
    updateComponentContextUI();
    chatInput.placeholder = appMode === 'plan' ? t('Опишите, что хотите спроектировать и спланировать...') : t('Опишите, что хотите создать или исправить...');
  });

  previewIframe.addEventListener('load', () => {
    setupIframeInspection();
    const ghostUi = document.getElementById('ghost-ui-overlay');
    if (ghostUi) ghostUi.classList.add('hidden');
  });

  // Open active folder in native explorer from Sidebar button
  document.getElementById('btn-sidebar-open-explorer')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (activeProject && activeProject.workspacePath) {
      await window.electronAPI.openInExplorer(activeProject.workspacePath);
    }
  });

  // Open active folder in native explorer from files header button
  document.getElementById('btn-files-open-explorer')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (activeProject && activeProject.workspacePath) {
      await window.electronAPI.openInExplorer(activeProject.workspacePath);
    }
  });

  // Edit/Rename active project from titlebar click listener
  document.getElementById('btn-rename-active-project')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!activeProject) return;

    const container = document.getElementById('project-name-display-container');
    const titleSpan = document.getElementById('titlebar-project-name');
    const renameBtn = document.getElementById('btn-rename-active-project');

    if (!container || !titleSpan || container.querySelector('.titlebar-rename-input')) return;

    titleSpan.style.display = 'none';
    if (renameBtn) renameBtn.style.display = 'none';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'titlebar-rename-input';
    input.value = activeProject.name;

    container.insertBefore(input, renameBtn);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      let newName = input.value.trim();
      if (save && newName && newName !== activeProject!.name) {
        activeProject!.name = newName;
        saveProjects();
        updateProjectNameUI();
        renderSidebarProjects();
      }
      input.remove();
      titleSpan.style.display = '';
      if (renameBtn) renameBtn.style.display = '';
    };

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') finish(true);
      else if (ev.key === 'Escape') finish(false);
    });
    input.addEventListener('blur', () => finish(true));
  });

  // Custom window controls
  const btnMin = document.getElementById('btn-window-min');
  const btnMax = document.getElementById('btn-window-max');
  const btnClose = document.getElementById('btn-window-close');

  btnMin?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.windowMinimize();
  });

  btnMax?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.windowToggleMaximize();
  });

  btnClose?.addEventListener('click', (e) => {
    e.stopPropagation();
    window.electronAPI.windowClose();
  });

  // Double-click on titlebar to toggle maximize (standard behaviour)
  const titlebarEl = document.querySelector('.titlebar');
  titlebarEl?.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.window-control-btn, .project-name-display, .titlebar-rename-input, button')) return;
    window.electronAPI.windowToggleMaximize();
  });

  // Setup banner: clicking anywhere on it opens settings
  setupBanner.addEventListener('click', () => {
    openSettings();
  });
  setupBanner.style.cursor = 'pointer';

  // ═══ Resizable chat panel ═══
  const chatPanel = document.getElementById('chat-panel');
  const resizeHandle = document.getElementById('resize-handle');
  if (chatPanel && resizeHandle) {
    const savedWidth = localStorage.getItem('ag_chat_width');
    if (savedWidth) chatPanel.style.width = savedWidth + 'px';

    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      resizeHandle.classList.add('active');
      const startX = e.clientX;
      const startWidth = chatPanel.offsetWidth;

      const dragOverlay = document.createElement('div');
      dragOverlay.style.position = 'fixed';
      dragOverlay.style.inset = '0';
      dragOverlay.style.zIndex = '999999';
      dragOverlay.style.cursor = 'ew-resize';
      document.body.appendChild(dragOverlay);

      const onMove = (ev: MouseEvent) => {
        const newWidth = startWidth + (ev.clientX - startX);
        const minW = parseInt(getComputedStyle(chatPanel).minWidth) || 280;
        const maxW = chatPanel.parentElement!.offsetWidth * 0.6;
        chatPanel.style.width = Math.max(minW, Math.min(newWidth, maxW)) + 'px';
      };
      const onUp = () => {
        resizeHandle.classList.remove('active');
        dragOverlay.remove();
        localStorage.setItem('ag_chat_width', String(chatPanel.offsetWidth));
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  // ═══ Chat model selector (custom dropdown) ═══
  const chatModelSelect = document.getElementById('chat-model-select') as HTMLSelectElement | null;

  // ── Custom model picker (replaces the native <select>) ──────────────────────
  const pickerEl = document.getElementById('chat-model-picker');
  const triggerEl = document.getElementById('chat-model-picker-trigger');
  const panelEl = document.getElementById('chat-model-picker-panel');
  const listEl = document.getElementById('chat-model-picker-list');
  const searchEl = document.getElementById('chat-model-picker-search') as HTMLInputElement | null;
  const tabsEl = document.getElementById('chat-model-picker-tabs');
  const labelEl = document.getElementById('chat-model-picker-label');
  const metaEl = document.getElementById('chat-model-picker-meta');
  const footerEl = document.getElementById('chat-model-picker-footer');

  // UI state for the picker
  let pickerTab: 'all' | 'free' | 'favorites' = 'all';
  let pickerQuery = '';

  function formatContext(n: number): string {
    if (!n || n <= 0) return '';
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1000) return `${Math.round(n / 1000)}K`;
    return String(n);
  }

  function formatPrice(p?: number): string {
    if (p === undefined || p === null || isNaN(p) || p <= 0) return '';
    // OpenRouter returns price in $ per token, convert to per 1M for readability
    const per1M = p * 1_000_000;
    if (per1M < 0.1) return `$${per1M.toFixed(3)}/M`;
    if (per1M < 10) return `$${per1M.toFixed(2)}/M`;
    return `$${per1M.toFixed(1)}/M`;
  }

  /** Build the meta-text (tiny pill next to model name in the trigger). */
  function updateChatModelTrigger() {
    const m = settings.cachedModels.find(x => x.id === settings.model);
    if (!labelEl || !metaEl) return;
    if (!m) {
      labelEl.textContent = settings.cachedModels.length ? '—' : t('Загрузка моделей...');
      metaEl.textContent = '';
      metaEl.classList.remove('free');
      return;
    }
    const cleanName = (m.name || m.id).split(' · ')[0];
    labelEl.textContent = cleanName;
    if (m.isFree) {
      metaEl.textContent = 'FREE';
      metaEl.classList.add('free');
    } else {
      metaEl.classList.remove('free');
      metaEl.textContent = m.contextLength ? formatContext(m.contextLength) : '';
    }
  }

  function setChatModelPickerOpen(open: boolean) {
    if (!panelEl || !triggerEl) return;
    if (open) {
      panelEl.classList.remove('hidden');
      triggerEl.setAttribute('aria-expanded', 'true');
      pickerQuery = '';
      if (searchEl) {
        searchEl.value = '';
        setTimeout(() => searchEl.focus(), 30);
      }
      renderChatModelPickerList();
    } else {
      panelEl.classList.add('hidden');
      triggerEl.setAttribute('aria-expanded', 'false');
    }
  }

  /** Whether the panel is currently open. */
  function isChatModelPickerOpen(): boolean {
    return !!panelEl && !panelEl.classList.contains('hidden');
  }

  function selectChatModel(mId: string) {
    if (!mId) return;
    settings.model = mId;
    saveSettings();
    if (chatModelSelect) {
      chatModelSelect.value = mId;
      chatModelSelect.dispatchEvent(new Event('change'));
    }
    updateChatModelTrigger();
    updateModelLabel();
    updateContextBar();
    renderChatModelPickerList();
    setChatModelPickerOpen(false);
  }

  function toggleFavorite(mId: string, favBtn?: HTMLElement) {
    if (!settings.favoriteModels) settings.favoriteModels = [];
    const idx = settings.favoriteModels.indexOf(mId);
    const nowFav = idx < 0;
    if (idx >= 0) {
      settings.favoriteModels.splice(idx, 1);
    } else {
      settings.favoriteModels.push(mId);
    }
    saveSettings();

    // On the Favorites tab the row must appear/disappear → full re-render.
    // Elsewhere update the star in place to avoid a scroll jump / flicker.
    if (pickerTab === 'favorites') {
      renderChatModelPickerList();
      return;
    }
    if (favBtn) {
      favBtn.classList.toggle('is-fav', nowFav);
      favBtn.title = nowFav ? t('Убрать из избранного') : t('Добавить в избранное');
    } else {
      renderChatModelPickerList();
    }
    updateChatModelPickerCounts();
  }

  /** Update tab counters. */
  function updateChatModelPickerCounts() {
    if (!tabsEl) return;
    const all = settings.cachedModels.length;
    const free = settings.cachedModels.filter(m => m.isFree).length;
    const favs = (settings.favoriteModels || []).filter(id =>
      settings.cachedModels.some(m => m.id === id)
    ).length;
    const setCount = (sel: string, n: number) => {
      const el = tabsEl.querySelector(`[data-count="${sel}"]`);
      if (el) el.textContent = String(n);
    };
    setCount('all', all);
    setCount('free', free);
    setCount('favorites', favs);
  }

  function renderChatModelPickerList() {
    if (!listEl) return;
    updateChatModelPickerCounts();
    listEl.innerHTML = '';

    if (settings.cachedModels.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-model-picker-empty';
      empty.textContent = settings.apiKey || settings.llmProvider === 'ollama'
        ? t('Загрузка моделей...')
        : t('Сначала введите API-ключ...');
      listEl.appendChild(empty);
      if (footerEl) footerEl.textContent = '';
      return;
    }

    const fav = new Set(settings.favoriteModels || []);
    const q = pickerQuery.toLowerCase().trim();

    const matches = (m: ModelInfo) => {
      if (!q) return true;
      return (
        (m.name || '').toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q)
      );
    };

    let tabFiltered: ModelInfo[];
    if (pickerTab === 'free') {
      tabFiltered = settings.cachedModels.filter(m => m.isFree && matches(m));
    } else if (pickerTab === 'favorites') {
      tabFiltered = settings.cachedModels.filter(m => fav.has(m.id) && matches(m));
    } else {
      tabFiltered = settings.cachedModels.filter(matches);
    }

    if (tabFiltered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-model-picker-empty';
      if (pickerTab === 'favorites' && fav.size === 0) {
        empty.textContent = t('Нажмите на ★ рядом с любой моделью, чтобы добавить её в избранное.');
      } else if (q) {
        empty.textContent = t('По запросу ничего не найдено.');
      } else {
        empty.textContent = t('Модели не найдены');
      }
      listEl.appendChild(empty);
      if (footerEl) footerEl.textContent = '';
      return;
    }

    // ── Group: favourites (pinned at the top in the "all" tab) ──
    let groups: { title?: string; items: ModelInfo[] }[];
    if (pickerTab === 'all') {
      const favItems = tabFiltered.filter(m => fav.has(m.id));
      const freeItems = tabFiltered.filter(m => !fav.has(m.id) && m.isFree);
      const paidItems = tabFiltered.filter(m => !fav.has(m.id) && !m.isFree);
      groups = [];
      if (favItems.length) groups.push({ title: t('★ Избранные'), items: favItems });
      if (freeItems.length) groups.push({ title: t('Бесплатные'), items: freeItems });
      if (paidItems.length) groups.push({ title: t('Все модели'), items: paidItems });
    } else if (pickerTab === 'free') {
      groups = [{ items: tabFiltered }];
    } else {
      // favourites tab: maintain user's order
      const ordered = (settings.favoriteModels || [])
        .map(id => tabFiltered.find(m => m.id === id))
        .filter(Boolean) as ModelInfo[];
      groups = [{ items: ordered }];
    }

    for (const g of groups) {
      if (g.title) {
        const h = document.createElement('div');
        h.className = 'chat-model-picker-group-header';
        h.textContent = g.title;
        listEl.appendChild(h);
      }
      for (const m of g.items) {
        listEl.appendChild(buildChatModelItem(m, fav));
      }
    }

    if (footerEl) {
      const totalShown = groups.reduce((acc, g) => acc + g.items.length, 0);
      footerEl.textContent = totalShown === settings.cachedModels.length
        ? `${totalShown} ${t('моделей')}`
        : `${totalShown} ${t('из')} ${settings.cachedModels.length} ${t('моделей')}`;
    }

    if ((window as any).lucide) {
      try { (window as any).lucide.createIcons(); } catch {}
    }
  }

  function buildChatModelItem(m: ModelInfo, fav: Set<string>): HTMLElement {
    const item = document.createElement('div');
    item.className = 'chat-model-picker-item' + (m.id === settings.model ? ' active' : '');
    item.setAttribute('role', 'option');
    item.setAttribute('aria-selected', m.id === settings.model ? 'true' : 'false');

    const main = document.createElement('div');
    main.className = 'chat-model-picker-item-main';

    const cleanName = (m.name || m.id).split(' · ')[0];
    const nameEl = document.createElement('div');
    nameEl.className = 'chat-model-picker-item-name';
    nameEl.textContent = cleanName;
    main.appendChild(nameEl);

    const idEl = document.createElement('div');
    idEl.className = 'chat-model-picker-item-id';
    idEl.textContent = m.id;
    main.appendChild(idEl);

    item.appendChild(main);

    const meta = document.createElement('div');
    meta.className = 'chat-model-picker-item-meta';

    if (m.isFree) {
      const b = document.createElement('span');
      b.className = 'chat-model-picker-badge free';
      b.textContent = 'FREE';
      b.title = t('Бесплатная модель');
      meta.appendChild(b);
    } else {
      const promptPrice = formatPrice(m.pricePrompt);
      if (promptPrice) {
        const b = document.createElement('span');
        b.className = 'chat-model-picker-badge price';
        b.textContent = promptPrice;
        b.title = `${t('Цена prompt-токенов')} (per 1M)`;
        meta.appendChild(b);
      }
    }

    if (m.contextLength) {
      const b = document.createElement('span');
      b.className = 'chat-model-picker-badge context';
      b.textContent = formatContext(m.contextLength);
      b.title = `${m.contextLength.toLocaleString()} ${t('токенов контекста')}`;
      meta.appendChild(b);
    }

    item.appendChild(meta);

    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'chat-model-picker-item-fav' + (fav.has(m.id) ? ' is-fav' : '');
    favBtn.title = fav.has(m.id) ? t('Убрать из избранного') : t('Добавить в избранное');
    favBtn.innerHTML = '<i data-lucide="star"></i>';
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(m.id, favBtn);
    });
    item.appendChild(favBtn);

    item.addEventListener('click', () => selectChatModel(m.id));
    return item;
  }

  // Initial trigger label
  updateChatModelTrigger();

  // Open / close
  triggerEl?.addEventListener('click', (e) => {
    e.stopPropagation();
    setChatModelPickerOpen(!isChatModelPickerOpen());
  });

  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!pickerEl) return;
    if (!isChatModelPickerOpen()) return;
    if (pickerEl.contains(e.target as Node)) return;
    setChatModelPickerOpen(false);
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isChatModelPickerOpen()) {
      setChatModelPickerOpen(false);
    }
  });

  // Search
  searchEl?.addEventListener('input', () => {
    pickerQuery = (searchEl.value || '').trim();
    renderChatModelPickerList();
  });

  // Tabs
  tabsEl?.querySelectorAll<HTMLButtonElement>('.chat-model-picker-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab as 'all' | 'free' | 'favorites' | undefined;
      if (!tab) return;
      pickerTab = tab;
      tabsEl.querySelectorAll('.chat-model-picker-tab').forEach(t => {
        t.classList.toggle('active', t === btn);
        t.setAttribute('aria-selected', t === btn ? 'true' : 'false');
      });
      renderChatModelPickerList();
    });
  });

  // Hidden <select> kept in sync for legacy code paths that still read its value.
  if (chatModelSelect) {
    const syncHiddenSelect = () => {
      chatModelSelect.innerHTML = '';
      if (settings.cachedModels.length === 0) {
        chatModelSelect.innerHTML = '<option value="">—</option>';
        return;
      }
      for (const m of settings.cachedModels) {
        const o = document.createElement('option');
        o.value = m.id;
        const freeBadge = m.isFree ? ' [FREE]' : '';
        const ctxInfo = m.contextLength ? ` · ${formatContext(m.contextLength)}` : '';
        o.textContent = (m.name || m.id).split(' · ')[0] + freeBadge + ctxInfo;
        if (m.id === settings.model) o.selected = true;
        chatModelSelect.appendChild(o);
      }
    };
    syncHiddenSelect();

    // If anything else dispatches a `change` on the hidden select, mirror it.
    chatModelSelect.addEventListener('change', () => {
      if (chatModelSelect.value && chatModelSelect.value !== settings.model) {
        selectChatModel(chatModelSelect.value);
      }
    });
  }

  // Sync model selector when settings change (event raised after fetchModels)
  document.addEventListener('ag:models-updated', () => {
    if (chatModelSelect) {
      chatModelSelect.innerHTML = '';
      for (const m of settings.cachedModels) {
        const o = document.createElement('option');
        o.value = m.id;
        const freeBadge = m.isFree ? ' [FREE]' : '';
        o.textContent = (m.name || m.id).split(' · ')[0] + freeBadge;
        if (m.id === settings.model) o.selected = true;
        chatModelSelect.appendChild(o);
      }
    }
    updateChatModelTrigger();
    renderChatModelPickerList();
  });

// "Open Tasks tab" button inside the sticky plan-progress bar
document.getElementById('ppb-open-tab')?.addEventListener('click', () => {
  switchToPreviewTab('tasks');
});

// Stop Generation Button Click Listener
document.getElementById('btn-stop-generation')?.addEventListener('click', () => {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (activeCommandExecId && window.electronAPI?.killCommand) {
    window.electronAPI.killCommand(activeCommandExecId).catch(err => {
      console.error('Failed to kill terminal command during generation stop:', err);
    });
    activeCommandExecId = null;
  }
  // Cancel a deferred "next step" hop so a stopped plan doesn't auto-resume.
  if (nextStepTimer !== null) {
    clearTimeout(nextStepTimer);
    nextStepTimer = null;
  }
  setGeneratingState(false);
  isExecutingPlan = false;
  planApproved = false;
  chatInput.disabled = false;
  removeThinking();
  setCurrentAction('');
  // Reset an in-progress task back to pending so the plan can be resumed
  if (currentStepIndex >= 0 && planSteps[currentStepIndex] && planSteps[currentStepIndex].status === 'active') {
    planSteps[currentStepIndex].status = 'pending';
    savePlanSteps();
    renderTasksUI();
  }
  const streamingBubble = document.querySelector('.chat-message.streaming');
  if (streamingBubble) {
    streamingBubble.classList.remove('streaming');
  }
});

// Copy chat button
document.getElementById('btn-copy-chat')?.addEventListener('click', () => {
  if (!activeProject || activeProject.chatHistory.length === 0) return;
  const lines: string[] = [];
  for (const msg of activeProject.chatHistory) {
    if (msg.role === 'system') continue;
    const sender = msg.role === 'user' ? 'Вы' : 'Ассистент';
    lines.push(`### ${sender}`);
    lines.push(msg.content);
    lines.push('');
  }
  const text = lines.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    appendBubble('Система', t('📋 Чат скопирован в буфер обмена.'), true);
  }).catch(() => {
    appendBubble('Система', t('❌ Не удалось скопировать чат.'), true);
  });
});

// Export chat to Markdown button
document.getElementById('btn-export-chat')?.addEventListener('click', () => {
  if (!activeProject || !activeProject.chatHistory || activeProject.chatHistory.length === 0) return;
  
  let md = `# Chat History - Project: ${activeProject.name || 'Untitled'}\n`;
  md += `Created: ${new Date(activeProject.createdAt).toLocaleString()}\n`;
  md += `Updated: ${new Date(activeProject.updatedAt).toLocaleString()}\n\n`;
  md += `---\n\n`;
  
  for (const msg of activeProject.chatHistory) {
    if (msg.role === 'system') {
      md += `> **System Prompt**:\n> ${msg.content.replace(/\n/g, '\n> ')}\n\n`;
    } else if (msg.role === 'user') {
      md += `## 👤 User\n\n${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      md += `## 🤖 Assistant\n\n${msg.content}\n\n`;
    }
  }
  
  const b = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  const cleanName = (activeProject.name || 'project').toLowerCase().replace(/[^a-z0-9]/g, '-');
  a.download = `${cleanName}-chat-history.md`;
  a.click();
  URL.revokeObjectURL(a.href);
});

  // Media Query Listener for System Color Scheme Changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.theme === 'system') {
      applyTheme();
    }
  });

  // Copy Code Button Delegate Listener on Chat Messages
  chatMessages.addEventListener('click', (e) => {
    const copyBtn = (e.target as HTMLElement).closest('.btn-copy-chat-code');
    if (copyBtn) {
      const pre = copyBtn.closest('.code-block-chat')?.querySelector('pre');
      if (pre) {
        navigator.clipboard.writeText(pre.textContent || '').then(() => {
          copyBtn.innerHTML = `<i data-lucide="check"></i> <span>${esc(t('Готово'))}</span>`;
          refreshIcons();
          setTimeout(() => {
            copyBtn.innerHTML = `<i data-lucide="copy"></i> <span>${esc(t('Копировать'))}</span>`;
            refreshIcons();
          }, 2000);
        });
      }
    }

    // Run Code Button Delegate Listener
    const runBtn = (e.target as HTMLElement).closest('.btn-run-chat-code');
    if (runBtn) {
      const codeBlock = runBtn.closest('.code-block-chat') as HTMLElement | null;
      const pre = codeBlock?.querySelector('pre');
      const lang = codeBlock?.dataset.lang || '';
      if (pre && activeProject?.workspacePath) {
        const code = pre.textContent || '';
        runCodeSnippet(code, lang);
      }
    }
  });

  // Accordion Expand/Collapse Delegate Listener on Chat Messages
  chatMessages.addEventListener('click', (e) => {
    // Clickable file paths inside chat
    const fileLink = (e.target as HTMLElement).closest('.chat-file-link') as HTMLElement;
    if (fileLink) {
      e.preventDefault();
      const relativePath = fileLink.dataset.path;
      if (relativePath && activeProject?.workspacePath) {
        (async () => {
          try {
            const content = await window.electronAPI.readFile(relativePath, activeProject!.workspacePath, settings.sandboxEnabled);
            codeDisplay.textContent = content;
            
            $$('.ptab').forEach(x => x.classList.remove('active'));
            $('#tab-code').classList.add('active');
            iframeWrapper.style.display = 'none';
            filesView.style.display = 'none';
            codeView.style.display = 'flex';
          } catch (err: any) {
            console.warn(`Could not open file from chat link: ${relativePath}`, err);
            const notice = document.createElement('div');
            notice.className = 'chat-file-link-error';
            notice.style.cssText = 'position:fixed; bottom:20px; right:20px; background:var(--accent-red); color:white; padding:8px 12px; border-radius:4px; font-size:12px; z-index:10000; box-shadow:var(--shadow-lg);';
            notice.textContent = `${t('Не удалось открыть файл')}: ${relativePath}`;
            document.body.appendChild(notice);
            setTimeout(() => notice.remove(), 3000);
          }
        })();
      }
      return;
    }

    // Clickable external links inside chat
    const extLink = (e.target as HTMLElement).closest('.chat-external-link') as HTMLAnchorElement;
    if (extLink) {
      e.preventDefault();
      const url = extLink.getAttribute('href');
      if (url && window.electronAPI?.openExternal) {
        window.electronAPI.openExternal(url).catch(err => {
          console.error('Failed to open external link:', err);
        });
      }
      return;
    }

    const header = (e.target as HTMLElement).closest('.tool-accordion-header');
    if (header) {
      const accordion = header.closest('.tool-accordion');
      if (accordion) {
        accordion.classList.toggle('expanded');
      }
    }
    
    // Reasoning Header Collapse/Expand Delegate Listener
    const reasoningHeader = (e.target as HTMLElement).closest('.reasoning-header');
    if (reasoningHeader) {
      const reasoningBlock = reasoningHeader.closest('.reasoning-block');
      if (reasoningBlock) {
        reasoningBlock.classList.toggle('collapsed');
      }
    }
    // Message action buttons
    const actionBtn = (e.target as HTMLElement).closest('.msg-action-btn') as HTMLElement;
    if (actionBtn) {
      const msgEl = actionBtn.closest('.chat-message') as HTMLElement;
      const action = actionBtn.dataset.action;
      if (action === 'copy') {
        const msgText = msgEl.querySelector('.message-text')?.textContent || '';
        navigator.clipboard.writeText(msgText).then(() => {
          actionBtn.innerHTML = `<i data-lucide="check"></i><span>${esc(t('Скопировано'))}</span>`;
          refreshIcons();
          setTimeout(() => { actionBtn.innerHTML = `<i data-lucide="copy"></i><span>${esc(t('Копировать'))}</span>`; refreshIcons(); }, 2000);
        });
      } else if (action === 'edit') {
        startEditMessage(msgEl);
      } else if (action === 'regenerate') {
        regenerateFromMessage(msgEl);
      } else if (action === 'branch') {
        branchFromMessage(msgEl);
      }
    }

    // Tool accordion action buttons (copy/rerun)
    const toolActionBtn = (e.target as HTMLElement).closest('.tool-action-btn') as HTMLElement;
    if (toolActionBtn) {
      const accordion = toolActionBtn.closest('.tool-accordion') as HTMLElement;
      const toolIdx = parseInt(accordion?.dataset.toolIdx || '-1');
      const action = toolActionBtn.dataset.action;
      const contentEl = accordion?.querySelector('.tool-accordion-content, .diff-widget-body');

      if (action === 'copy' && contentEl) {
        navigator.clipboard.writeText(contentEl.textContent || '').then(() => {
          toolActionBtn.innerHTML = `<i data-lucide="check"></i>`;
          refreshIcons();
          setTimeout(() => { toolActionBtn.innerHTML = `<i data-lucide="copy"></i>`; refreshIcons(); }, 2000);
        });
      } else if (action === 'rerun' && toolIdx >= 0) {
        rerunToolFromIndex(toolIdx);
      }
    }
  });

  // Scroll-to-bottom button visibility
  const scrollBottomBtn = document.getElementById('btn-scroll-bottom');
  chatMessages.addEventListener('scroll', () => {
    const threshold = 300;
    const isNearBottom = chatMessages.scrollHeight - chatMessages.scrollTop - chatMessages.clientHeight < threshold;
    autoScrollEnabled = isNearBottom;
    if (!scrollBottomBtn) return;
    scrollBottomBtn.classList.toggle('hidden', isNearBottom);
  });
  scrollBottomBtn?.addEventListener('click', () => {
    autoScrollEnabled = true;
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
  });

  // Chat search
  const chatSearchBar = document.getElementById('chat-search-bar');
  const chatSearchInput = document.getElementById('chat-search-input') as HTMLInputElement;
  const chatSearchCount = document.getElementById('chat-search-count');
  const chatSearchPrev = document.getElementById('chat-search-prev');
  const chatSearchNext = document.getElementById('chat-search-next');
  const chatSearchClose = document.getElementById('chat-search-close');
  let searchMatches: { el: HTMLElement }[] = [];
  let searchCurrentIdx = -1;

  const clearSearchHighlights = () => {
    chatMessages.querySelectorAll('.chat-search-highlight').forEach(el => {
      const parent = el.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(el.textContent || ''), el);
        parent.normalize();
      }
    });
    searchMatches = [];
    searchCurrentIdx = -1;
    if (chatSearchCount) chatSearchCount.textContent = '';
  };

  const runSearch = (query: string) => {
    clearSearchHighlights();
    if (!query.trim()) return;
    const texts = chatMessages.querySelectorAll('.message-text');
    const results: { el: HTMLElement }[] = [];
    const lowerQuery = query.toLowerCase();
    texts.forEach(textEl => {
      const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const idx = node.textContent?.toLowerCase().indexOf(lowerQuery) ?? -1;
        if (idx !== -1) {
          const range = document.createRange();
          range.setStart(node, idx);
          range.setEnd(node, idx + query.length);
          const span = document.createElement('span');
          span.className = 'chat-search-highlight';
          range.surroundContents(span);
          results.push({ el: span });
        }
      }
    });
    searchMatches = results;
    if (results.length > 0) {
      searchCurrentIdx = 0;
      results[0].el.classList.add('active');
      results[0].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (chatSearchCount) {
      chatSearchCount.textContent = results.length ? `1/${results.length}` : '0/0';
    }
  };

  const goToMatch = (dir: 1 | -1) => {
    if (searchMatches.length === 0) return;
    searchMatches.forEach(m => m.el.classList.remove('active'));
    searchCurrentIdx = (searchCurrentIdx + dir + searchMatches.length) % searchMatches.length;
    searchMatches[searchCurrentIdx].el.classList.add('active');
    searchMatches[searchCurrentIdx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (chatSearchCount) {
      chatSearchCount.textContent = `${searchCurrentIdx + 1}/${searchMatches.length}`;
    }
  };

  chatSearchInput?.addEventListener('input', () => runSearch(chatSearchInput.value));
  chatSearchPrev?.addEventListener('click', () => goToMatch(-1));
  chatSearchNext?.addEventListener('click', () => goToMatch(1));
  chatSearchClose?.addEventListener('click', () => {
    clearSearchHighlights();
    chatSearchBar?.classList.add('hidden');
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'f') {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (!inInput && chatSearchBar) {
        e.preventDefault();
        chatSearchBar.classList.toggle('hidden');
        if (!chatSearchBar.classList.contains('hidden')) {
          chatSearchInput?.focus();
          chatSearchInput?.select();
        } else {
          clearSearchHighlights();
        }
      }
    }
    if (e.key === 'Escape' && chatSearchBar && !chatSearchBar.classList.contains('hidden')) {
      clearSearchHighlights();
      chatSearchBar.classList.add('hidden');
    }
  });

  // Snapshot Milestones creation button listener
  document.getElementById('btn-create-snapshot')?.addEventListener('click', () => {
    showSnapshotDialog();
  });

  // ─── Auto-updater UI ───
  setupAutoUpdaterUI();

  // ─── Drag & drop files into the chat input ───
  const dropZone = chatInput.parentElement?.parentElement || chatInput; // chat-input-area
  const showDropHint = (on: boolean) => {
    dropZone.classList.toggle('is-dragover', on);
  };
  ['dragenter', 'dragover'].forEach(ev =>
    dropZone.addEventListener(ev, (e) => {
      const dt = (e as DragEvent).dataTransfer;
      if (!dt || !Array.from(dt.types).includes('Files')) return;
      e.preventDefault();
      showDropHint(true);
    })
  );
  ['dragleave', 'drop'].forEach(ev =>
    dropZone.addEventListener(ev, (e) => {
      e.preventDefault();
      showDropHint(false);
    })
  );
  dropZone.addEventListener('drop', async (e) => {
    if (!activeProject || !activeProject.workspacePath) {
      appendBubble('Система', t('📂 Сначала выберите рабочую папку, чтобы прикрепить файлы.'), true);
      return;
    }
    const files = Array.from((e as DragEvent).dataTransfer?.files || []);
    if (files.length === 0) return;
    const wsAbs = activeProject.workspacePath.replace(/\\/g, '/').toLowerCase();
    let added = 0;
    let outside = 0;
    for (const f of files) {
      // Electron exposes file.path on dropped files
      const abs = (f as any).path as string | undefined;
      if (!abs) continue;
      const norm = abs.replace(/\\/g, '/');
      if (!norm.toLowerCase().startsWith(wsAbs + '/') && norm.toLowerCase() !== wsAbs) {
        outside++;
        continue;
      }
      const rel = norm.slice(wsAbs.length + 1);
      attachedFiles.add(rel);
      added++;
    }
    if (added > 0) renderAttachedFiles();
    if (outside > 0) appendBubble('Система', t('⚠️ Часть файлов вне рабочей папки и пропущена.'), true);
  });

  // Live terminal: subscribe to streamed command output + clear button
  if (window.electronAPI.onCommandChunk) {
    window.electronAPI.onCommandChunk((data) => {
      appendTerminal(data.stream, data.chunk);
    });
  }
  document.getElementById('btn-clear-terminal')?.addEventListener('click', () => {
    clearTerminal();
    setTerminalStatus('');
  });

  // Kill terminal process listener
  document.getElementById('btn-kill-terminal')?.addEventListener('click', () => {
    if (activeCommandExecId && window.electronAPI?.killCommand) {
      window.electronAPI.killCommand(activeCommandExecId).then(success => {
        if (success) {
          appendTerminal('system', `\n[${t('Сигнал завершения отправлен пользователем')}]\n`);
        }
      }).catch(err => {
        console.error('Failed to kill terminal process:', err);
      });
    }
  });

  // Terminal Stdin Input
  const stdinInput = document.getElementById('terminal-stdin-input') as HTMLInputElement;
  const btnStdinSend = document.getElementById('btn-terminal-stdin-send');
  
  const handleStdinSend = () => {
    if (!stdinInput || !activeCommandExecId) return;
    const text = stdinInput.value;
    if (!text) return;
    
    // Add to history
    if (stdinHistory.length === 0 || stdinHistory[stdinHistory.length - 1] !== text) {
      stdinHistory.push(text);
    }
    stdinHistoryIdx = -1;

    appendTerminal('stdout', text + '\n');
    if (window.electronAPI?.sendStdin) {
      window.electronAPI.sendStdin(activeCommandExecId, text + '\n').catch(err => {
        console.error('Failed to send stdin:', err);
      });
    }
    stdinInput.value = '';
  };

  stdinInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      handleStdinSend();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (stdinHistory.length === 0) return;
      if (stdinHistoryIdx === -1) {
        stdinHistoryIdx = stdinHistory.length - 1;
      } else if (stdinHistoryIdx > 0) {
        stdinHistoryIdx--;
      }
      stdinInput.value = stdinHistory[stdinHistoryIdx];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (stdinHistoryIdx === -1) return;
      if (stdinHistoryIdx < stdinHistory.length - 1) {
        stdinHistoryIdx++;
        stdinInput.value = stdinHistory[stdinHistoryIdx];
      } else {
        stdinHistoryIdx = -1;
        stdinInput.value = '';
      }
    }
  });

  btnStdinSend?.addEventListener('click', handleStdinSend);

  // Sync scroll for side-by-side diff Modal
  const paneLeft = document.getElementById('diff-pane-left');
  const paneRight = document.getElementById('diff-pane-right');
  if (paneLeft && paneRight) {
    let isScrollingLeft = false;
    let isScrollingRight = false;
    
    paneLeft.addEventListener('scroll', () => {
      if (isScrollingRight) return;
      if (paneRight.scrollTop === paneLeft.scrollTop && paneRight.scrollLeft === paneLeft.scrollLeft) return;
      isScrollingLeft = true;
      paneRight.scrollTop = paneLeft.scrollTop;
      paneRight.scrollLeft = paneLeft.scrollLeft;
      setTimeout(() => { isScrollingLeft = false; }, 20);
    });
    
    paneRight.addEventListener('scroll', () => {
      if (isScrollingLeft) return;
      if (paneLeft.scrollTop === paneRight.scrollTop && paneLeft.scrollLeft === paneRight.scrollLeft) return;
      isScrollingRight = true;
      paneLeft.scrollTop = paneRight.scrollTop;
      paneLeft.scrollLeft = paneRight.scrollLeft;
      setTimeout(() => { isScrollingRight = false; }, 20);
    });
  }

  // Ollama & OpenRouter provider switches
  const sProvider = document.getElementById('s-provider') as HTMLSelectElement;
  const sOllamaUrl = document.getElementById('s-ollama-url') as HTMLInputElement;
  const rowApiKey = document.getElementById('row-api-key') as HTMLElement;
  const rowOllamaUrl = document.getElementById('row-ollama-url') as HTMLElement;

  sProvider?.addEventListener('change', async () => {
    const provVal = sProvider.value;
    const rowOllamaContext = document.getElementById('row-ollama-context');
    if (provVal === 'ollama') {
      if (rowApiKey) rowApiKey.style.display = 'none';
      if (rowOllamaUrl) rowOllamaUrl.style.display = 'flex';
      if (rowOllamaContext) rowOllamaContext.style.display = 'flex';
    } else {
      if (rowApiKey) rowApiKey.style.display = 'flex';
      if (rowOllamaUrl) rowOllamaUrl.style.display = 'none';
      if (rowOllamaContext) rowOllamaContext.style.display = 'none';
    }
    
    const models = await fetchModels(provVal, sOllamaUrl?.value.trim(), apiKeyInput?.value.trim());
    if (models.length > 0) {
      settings.cachedModels = models;
      populateModelSelect(models, settings.model);
    } else {
      modelSelect.innerHTML = `<option value="">${provVal === 'ollama' ? t('Не удалось загрузить модели с Ollama') : t('Сначала введите API-ключ...')}</option>`;
      modelSelect.disabled = true;
      modelsStatus.textContent = '';
    }
  });

  // Git auto-commit switches toggling
  const sGitAutoCommit = document.getElementById('s-git-auto-commit') as HTMLInputElement;
  const rowVerify = document.getElementById('row-git-verify-commit');
  const rowPrefix = document.getElementById('row-git-commit-prefix');

  sGitAutoCommit?.addEventListener('change', () => {
    const active = sGitAutoCommit.checked;
    if (rowVerify) rowVerify.style.display = active ? 'flex' : 'none';
    if (rowPrefix) rowPrefix.style.display = active ? 'flex' : 'none';
  });

  let ollamaFetchTimeout: any = null;
  sOllamaUrl?.addEventListener('input', () => {
    clearTimeout(ollamaFetchTimeout);
    if (sProvider?.value === 'ollama') {
      ollamaFetchTimeout = setTimeout(async () => {
        const models = await fetchModels('ollama', sOllamaUrl.value.trim(), '');
        if (models.length > 0) {
          settings.cachedModels = models;
          populateModelSelect(models, settings.model);
        }
      }, 600);
    }
  });

  // Start the background keep-alive ping loop for prompt caching
  startKeepAlivePing();

  // Send button starts disabled until the user types something
  btnSend.disabled = chatInput.value.trim().length === 0;

  // Initialize audio context on first user gesture (autoplay policy)
  const initAudio = () => {
    getAudioContext();
    document.removeEventListener('click', initAudio, true);
    document.removeEventListener('keydown', initAudio, true);
  };
  document.addEventListener('click', initAudio, true);
  document.addEventListener('keydown', initAudio, true);
}

// ═══════════════════════════════════════════
// PROFILE AI CORE ENGINE
// ═══════════════════════════════════════════

function autoUpdateUserProfile(text: string) {
  let profile = { codingStyle: '', libraries: [] as string[], customNotes: '' };
  try {
    const saved = localStorage.getItem('ag_user_profile');
    if (saved) profile = JSON.parse(saved);
  } catch (e) {}

  const textLower = text.toLowerCase();
  
  // Detect libraries
  const libs = ['react', 'vue', 'tailwind', 'bootstrap', 'sqlite', 'prisma', 'express', 'node', 'jquery', 'next.js', 'vite'];
  libs.forEach(lib => {
    if (textLower.includes(lib) && !profile.libraries.includes(lib)) {
      profile.libraries.push(lib);
    }
  });

  // Detect style/language preferences
  if (textLower.includes('typescript') || textLower.includes(' ts ')) {
    if (!profile.codingStyle.includes('TypeScript')) {
      profile.codingStyle = (profile.codingStyle ? profile.codingStyle + ', ' : '') + 'Предпочитает TypeScript';
    }
  }
  if (textLower.includes('javascript') || textLower.includes(' js ')) {
    if (!profile.codingStyle.includes('JavaScript')) {
      profile.codingStyle = (profile.codingStyle ? profile.codingStyle + ', ' : '') + 'Предпочитает JavaScript';
    }
  }
  if (textLower.includes('таб') || textLower.includes('tab')) {
    if (!profile.codingStyle.includes('табы')) {
      profile.codingStyle = (profile.codingStyle ? profile.codingStyle + ', ' : '') + 'Использует табы для отступов';
    }
  }
  if (textLower.includes('пробел') || textLower.includes('space')) {
    if (!profile.codingStyle.includes('пробелы')) {
      profile.codingStyle = (profile.codingStyle ? profile.codingStyle + ', ' : '') + 'Использует пробелы для отступов';
    }
  }

  // Detect language for comments
  if (textLower.includes('русский') || textLower.includes('на русском')) {
    if (!profile.customNotes.includes('русском языке')) {
      profile.customNotes = (profile.customNotes ? profile.customNotes + '. ' : '') + 'Писать комментарии к коду на русском языке';
    }
  }
  if (textLower.includes('английский') || textLower.includes('на английском')) {
    if (!profile.customNotes.includes('английском языке')) {
      profile.customNotes = (profile.customNotes ? profile.customNotes + '. ' : '') + 'Писать комментарии к коду на английском языке';
    }
  }
  
  localStorage.setItem('ag_user_profile', JSON.stringify(profile));
}

function renderSkillsList() {
  const container = document.getElementById('profile-skills-list');
  if (!container) return;
  
  let dynamicSkills: Skill[] = [];
  try {
    const saved = localStorage.getItem('ag_dynamic_skills');
    if (saved) dynamicSkills = JSON.parse(saved);
  } catch (e) {}

  if (dynamicSkills.length === 0) {
    container.innerHTML = `<div style="padding: 16px; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); text-align: center; color: var(--text-muted); font-size: 12px;">${t('Список навыков пуст. Выполните план в режиме Plan или завершите Build-сессию с изменением файлов — ассистент проведёт рефлексию и создаст навык.')}</div>`;
    return;
  }

  container.innerHTML = '';
  dynamicSkills.forEach((skill, idx) => {
    const el = document.createElement('div');
    el.className = 'profile-skill-item';
    el.style.cssText = 'border: 1px solid var(--border-default); border-radius: var(--radius-md); padding: 10px; margin-bottom: 8px; background: var(--bg-panel);';
    el.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="font-weight: 600; color: var(--text-primary); font-size: 13px;">${esc(skill.name)}</span>
        <button class="ghost-btn delete-skill-btn" data-id="${esc(skill.id)}" title="${esc(t('Удалить навык'))}" style="padding: 2px 6px; color: var(--accent-red); font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
          <i data-lucide="trash-2" style="width:12px; height:12px;"></i> ${esc(t('Удалить'))}
        </button>
      </div>
      <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 6px;">
        Ключевые слова: ${skill.keywords.map(k => `<span style="background: var(--bg-panel-alt); padding: 1px 4px; border-radius: 2px; margin-right: 4px; border: 1px solid var(--border-default);">${esc(k)}</span>`).join('')}
      </div>
      <div style="font-size: 11px; background: var(--bg-panel-alt); padding: 8px; border-radius: 4px; max-height: 80px; overflow-y: auto; font-family: monospace; white-space: pre-wrap; border: 1px solid var(--border-default);">${esc(skill.content)}</div>
    `;

    el.querySelector('.delete-skill-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(`Удалить навык «${skill.name}»?`, 'Удаление навыка');
      if (ok) {
        dynamicSkills.splice(idx, 1);
        localStorage.setItem('ag_dynamic_skills', JSON.stringify(dynamicSkills));
        renderSkillsList();
      }
    });

    container.appendChild(el);
  });
  refreshIcons();
}

let editingMcpIndex: number | null = null;

function renderMcpServers() {
  const container = document.getElementById('mcp-servers-list');
  if (!container) return;
  
  const mcpServers = settings.mcpServers || [];
  if (mcpServers.length === 0) {
    container.innerHTML = `<div style="padding: 16px; border: 1px dashed var(--border-strong); border-radius: var(--radius-md); text-align: center; color: var(--text-muted); font-size: 12px;">${t('Список MCP серверов пуст.')}</div>`;
    return;
  }
  
  container.innerHTML = '';
  mcpServers.forEach((s, idx) => {
    const el = document.createElement('div');
    el.className = 'mcp-server-card';
    el.innerHTML = `
      <div class="mcp-server-details">
        <div class="mcp-server-title">
          <div class="mcp-server-status ${s.active ? 'active' : 'inactive'}"></div>
          <span>${esc(s.name)}</span>
        </div>
        <div class="mcp-server-command">${esc(s.command)} ${esc((s.args || []).join(' '))}</div>
      </div>
      <div class="mcp-server-actions">
        <button class="ghost-btn edit-mcp-btn" data-index="${idx}" style="padding: 2px 6px; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
          <i data-lucide="edit" style="width:12px; height:12px;"></i> ${esc(t('Редактировать'))}
        </button>
        <button class="ghost-btn delete-mcp-btn" data-index="${idx}" style="padding: 2px 6px; color: var(--accent-red); font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
          <i data-lucide="trash-2" style="width:12px; height:12px;"></i> ${esc(t('Удалить'))}
        </button>
      </div>
    `;
    
    el.querySelector('.edit-mcp-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openMcpEditForm(idx);
    });
    
    el.querySelector('.delete-mcp-btn')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const ok = await confirmDialog(`Удалить MCP сервер «${s.name}»?`, 'Удаление MCP сервера');
      if (ok) {
        settings.mcpServers?.splice(idx, 1);
        saveSettings();
        renderMcpServers();
        if (window.electronAPI?.mcpReinit) {
          window.electronAPI.mcpReinit(JSON.stringify(settings.mcpServers || []));
        }
      }
    });
    
    container.appendChild(el);
  });
  refreshIcons();
}

function openMcpEditForm(idx: number | null) {
  const form = document.getElementById('mcp-add-form');
  const btnAdd = document.getElementById('btn-add-mcp-server');
  if (!form) return;
  
  form.classList.remove('hidden');
  if (btnAdd) btnAdd.style.display = 'none';
  
  editingMcpIndex = idx;
  
  const titleEl = document.getElementById('mcp-form-title');
  const nameInput = document.getElementById('mcp-name') as HTMLInputElement;
  const activeInput = document.getElementById('mcp-active') as HTMLInputElement;
  const commandInput = document.getElementById('mcp-command') as HTMLInputElement;
  const argsTextarea = document.getElementById('mcp-args') as HTMLTextAreaElement;
  const envTextarea = document.getElementById('mcp-env') as HTMLTextAreaElement;
  
  if (idx !== null) {
    if (titleEl) titleEl.textContent = t('Редактировать MCP сервер') || 'Редактировать MCP сервер';
    const s = (settings.mcpServers || [])[idx];
    if (s) {
      if (nameInput) { nameInput.value = s.name; nameInput.disabled = true; }
      if (activeInput) activeInput.checked = !!s.active;
      if (commandInput) commandInput.value = s.command;
      if (argsTextarea) argsTextarea.value = (s.args || []).join('\n');
      if (envTextarea) {
        envTextarea.value = Object.entries(s.env || {}).map(([k, v]) => `${k}=${v}`).join('\n');
      }
    }
  } else {
    if (titleEl) titleEl.textContent = t('Новый MCP сервер');
    if (nameInput) { nameInput.value = ''; nameInput.disabled = false; }
    if (activeInput) activeInput.checked = true;
    if (commandInput) commandInput.value = '';
    if (argsTextarea) argsTextarea.value = '';
    if (envTextarea) envTextarea.value = '';
  }
}

function closeMcpEditForm() {
  const form = document.getElementById('mcp-add-form');
  const btnAdd = document.getElementById('btn-add-mcp-server');
  if (form) form.classList.add('hidden');
  if (btnAdd) btnAdd.style.display = 'inline-flex';
  editingMcpIndex = null;
}

function saveMcpServer() {
  const nameInput = document.getElementById('mcp-name') as HTMLInputElement;
  const activeInput = document.getElementById('mcp-active') as HTMLInputElement;
  const commandInput = document.getElementById('mcp-command') as HTMLInputElement;
  const argsTextarea = document.getElementById('mcp-args') as HTMLTextAreaElement;
  const envTextarea = document.getElementById('mcp-env') as HTMLTextAreaElement;
  
  if (!nameInput || !commandInput) return;
  
  const name = nameInput.value.trim();
  const command = commandInput.value.trim();
  const active = activeInput ? activeInput.checked : true;
  
  if (!name) {
    alert(t('Введите имя сервера'));
    return;
  }
  if (!command) {
    alert(t('Введите команду для запуска'));
    return;
  }
  
  const args = argsTextarea ? argsTextarea.value.split('\n').map(a => a.trim()).filter(a => a) : [];
  
  const env: Record<string, string> = {};
  if (envTextarea) {
    envTextarea.value.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim();
        if (key) env[key] = val;
      }
    });
  }
  
  if (!settings.mcpServers) settings.mcpServers = [];
  
  const existingServer = editingMcpIndex !== null ? settings.mcpServers[editingMcpIndex] : null;
  const newServer: MCPServerConfig = { id: existingServer?.id || genId(), name, active, command, args, env };
  
  if (editingMcpIndex !== null) {
    settings.mcpServers[editingMcpIndex] = newServer;
  } else {
    if (settings.mcpServers.some(s => s.name.toLowerCase() === name.toLowerCase())) {
      alert(t('Сервер с таким именем уже существует'));
      return;
    }
    settings.mcpServers.push(newServer);
  }
  
  saveSettings();
  renderMcpServers();
  closeMcpEditForm();
  
  if (window.electronAPI?.mcpReinit) {
    window.electronAPI.mcpReinit(JSON.stringify(settings.mcpServers)).catch(err => {
      console.error('Failed to reinitialize MCP servers:', err);
    });
  }
}

async function runReflection() {
  if (!activeProject || !settings.apiKey || !settings.model) return;

  const time = new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  const bubble = document.createElement('div');
  bubble.className = 'chat-message ai';
  bubble.innerHTML = `
    <div class="message-meta"><span class="sender-name">Рефлексия</span><span class="time">${time}</span></div>
    <div class="message-text">
      <div class="reflection-indicator" style="display: flex; align-items: center; gap: 8px;">
        <span class="thinking-indicator"><span></span><span></span><span></span></span>
        <span>${t('🧠 Запущена фаза рефлексии: выделение и формулирование нового навыка...')}</span>
      </div>
    </div>
  `;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  refreshIcons();

  const planTexts = planSteps.map(s => s.text).join('\n');
  const chatContext = activeProject.chatHistory
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .slice(-10)
    .map(m => `${m.role === 'user' ? 'Пользователь' : 'Ассистент'}: ${m.content}`)
    .join('\n');

  const reflectionMessages: ChatMessage[] = [
    {
      role: 'system',
      content: `Ты — модуль рефлексии Ассистента. Твоя задача — проанализировать диалог разработки (и план, если он есть), выявить ключевые технические требования, используемые библиотеки и устойчивые паттерны решения, и сформулировать новый переиспользуемый НАВЫК (Skill) для будущих сессий.
Навык должен содержать конкретные правила/руководство для ИИ-агента, как работать с этими технологиями, чтобы не тратить время на повторное исследование.

ВАЖНО:
- Формулируй навык обобщённо (по технологии/паттерну), а не под одну конкретную задачу.
- keywords — это слова, по которым навык будет автоматически подключаться в будущем (на русском и английском).
- Если в этой сессии нет ничего достойного переиспользования (тривиальная правка), верни строго: {"skip": true}

Верни ТОЛЬКО валидный JSON без markdown и лишнего текста. Пример:
{
  "id": "react-tailwind-todo",
  "name": "React + Tailwind: списки задач",
  "keywords": ["todo", "задач", "чеклист", "react", "tailwind"],
  "files": ["package.json", "index.html"],
  "content": "Используй функциональные компоненты и хуки. Храни данные в localStorage. Стилизуй утилитарными классами Tailwind..."
}`
    },
    {
      role: 'user',
      content: `${planTexts ? `План проекта:\n${planTexts}\n\n` : ''}История диалога:\n${chatContext}\n\nСформулируй навык на основе этого (или {"skip": true}, если переиспользовать нечего).`
    }
  ];

  try {
    const resp = await fetchWithRetry(getLLMUrl('/chat/completions'), {
      method: 'POST',
      headers: getLLMHeaders(),
      body: JSON.stringify({
        model: settings.model,
        messages: reflectionMessages,
        temperature: 0.3,
        stream: false,
        max_tokens: 1500,
      }),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content?.trim() || '';
    
    let jsonStr = reply;
    if (jsonStr.includes('```')) {
      const match = jsonStr.match(/```(?:json)?([\s\S]*?)```/);
      if (match) jsonStr = match[1].trim();
    }
    
    const parsed = JSON.parse(jsonStr) as any;
    // Model decided there's nothing reusable — quietly skip
    if (parsed && parsed.skip) {
      bubble.remove();
      return;
    }
    const parsedSkill = parsed as Skill;
    if (parsedSkill.id && parsedSkill.name && parsedSkill.content) {
      // Normalise keywords to an array
      if (!Array.isArray(parsedSkill.keywords)) parsedSkill.keywords = [];
      if (!Array.isArray(parsedSkill.files)) parsedSkill.files = [];
      let dynamicSkills: Skill[] = [];
      try {
        const saved = localStorage.getItem('ag_dynamic_skills');
        if (saved) dynamicSkills = JSON.parse(saved);
      } catch (e) {}

      dynamicSkills = dynamicSkills.filter(s => s.id !== parsedSkill.id);
      dynamicSkills.push(parsedSkill);
      // Cap the number of learned skills to keep storage and detection efficient
      if (dynamicSkills.length > 30) dynamicSkills = dynamicSkills.slice(-30);
      localStorage.setItem('ag_dynamic_skills', JSON.stringify(dynamicSkills));

      bubble.querySelector('.message-text')!.innerHTML = `
        <div style="background: rgba(0,0,0,0.02); border-left: 3px solid var(--accent-purple); padding: 12px; border-radius: 8px; border: 1px solid var(--border-default); border-left-width: 4px;">
          <div style="font-weight: 600; margin-bottom: 6px; display: flex; align-items: center; gap: 6px; font-size: 13px;">
            <i data-lucide="brain-circuit" style="color: var(--text-primary); width:16px; height:16px;"></i>
            <span>${t('Рефлексия завершена: сформирован навык')} «${esc(parsedSkill.name)}»!</span>
          </div>
          <p style="margin: 0 0 8px 0; font-size: 11.5px; color: var(--text-secondary); line-height:1.45;">
            Этот навык автоматически активируется в следующий раз при обнаружении схожих ключевых слов: 
            ${parsedSkill.keywords.map(k => `<span style="background: var(--bg-panel-alt); padding: 1px 4px; border-radius: 2px; font-size:10px; border: 1px solid var(--border-default);">${esc(k)}</span>`).join(' ')}.
          </p>
          <div style="margin: 0; padding: 8px; background: var(--bg-panel-alt); border-radius: 4px; font-family: monospace; font-size: 11px; max-height: 120px; overflow-y: auto; border: 1px solid var(--border-default);">${esc(parsedSkill.content)}</div>
        </div>
      `;
      refreshIcons();
    } else {
      throw new Error('Некорректный формат навыка');
    }
  } catch (err: any) {
    console.error('Reflection failed', err);
    bubble.querySelector('.message-text')!.innerHTML = `
      <div style="color: var(--text-muted); font-size: 11.5px; display: flex; align-items: center; gap: 6px;">
        <i data-lucide="info" style="width:14px; height:14px;"></i>
        <span>${t('Рефлексия завершена. Подходящий навык не обнаружен.')}</span>
      </div>
    `;
    refreshIcons();
  }
}

async function executeStepWithMicroAgent(planId: string, stepIdx: number) {
  const workspacePath = activeProject?.workspacePath || '';
  if (workspacePath) {
    try {
      await window.electronAPI.prepareShadowWorkspace(workspacePath);
    } catch (err) {
      console.error('Failed to prepare shadow workspace:', err);
    }
  }

  currentStepIndex = stepIdx;
  planSteps[stepIdx].status = 'active';
  savePlanSteps();

  const itemEl = document.getElementById(`step-item-${planId}-${stepIdx}`);
  if (itemEl) {
    itemEl.classList.add('active');
    const statusIcon = document.getElementById(`status-icon-${planId}-${stepIdx}`);
    if (statusIcon) {
      statusIcon.className = 'plan-step-status-icon active';
      statusIcon.innerHTML = '<i data-lucide="loader-2"></i>';
      refreshIcons();
    }
  }

  setGeneratingState(true);
  setCurrentAction(`📋 ${t('Шаг')} ${stepIdx + 1}: ${planSteps[stepIdx].text}`);
  renderTasksUI();

  const stepText = planSteps[stepIdx].text;

  // ── New micro-agent card ──────────────────────────────────────────────
  // Flat card design, status pill, structured "trace" instead of an emoji log.
  const card = document.createElement('div');
  card.className = 'chat-message ai micro-agent-card';
  card.innerHTML = `
    <div class="ma-header">
      <div class="ma-icon"><i data-lucide="bot"></i></div>
      <div class="ma-title">
        <div class="ma-name">${esc(t('Микро-агент'))} · ${esc(t('Шаг'))} ${stepIdx + 1}</div>
        <div class="ma-task" title="${esc(stepText)}">${esc(stepText)}</div>
      </div>
      <div class="ma-status running" role="status">
        <span class="ma-dot" aria-hidden="true"></span>
        <span class="ma-status-label">${esc(t('выполняется'))}</span>
      </div>
    </div>
    <div class="ma-body">
      <div class="ma-trace" role="log" aria-live="polite"></div>
    </div>
    <div class="ma-footer hidden"></div>
  `;
  chatMessages.appendChild(card);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  refreshIcons();

  const traceEl = card.querySelector('.ma-trace') as HTMLElement;
  const statusEl = card.querySelector('.ma-status') as HTMLElement;
  const statusLabelEl = card.querySelector('.ma-status-label') as HTMLElement;
  const footerEl = card.querySelector('.ma-footer') as HTMLElement;

  type TraceKind = 'info' | 'tool' | 'success' | 'error' | 'warn';
  function addTraceLine(opts: { icon: string; text: string; type?: TraceKind }): HTMLElement {
    const line = document.createElement('div');
    line.className = `ma-trace-line type-${opts.type || 'info'}`;
    line.innerHTML = `<i data-lucide="${opts.icon}" class="ma-trace-icon"></i><span class="ma-trace-content"></span>`;
    (line.querySelector('.ma-trace-content') as HTMLElement).textContent = opts.text;
    traceEl.appendChild(line);
    if (autoScrollEnabled) chatMessages.scrollTop = chatMessages.scrollHeight;
    refreshIcons();
    return line;
  }

  function setLineStatus(line: HTMLElement, type: 'success' | 'error' | 'warn', icon?: string) {
    line.classList.remove('type-info', 'type-tool', 'type-success', 'type-error', 'type-warn');
    line.classList.add(`type-${type}`);
    if (icon) {
      const ic = line.querySelector('.ma-trace-icon');
      if (ic) ic.setAttribute('data-lucide', icon);
    }
    refreshIcons();
  }

  function setStatus(state: 'running' | 'success' | 'failed', label: string) {
    statusEl.classList.remove('running', 'success', 'failed');
    statusEl.classList.add(state);
    statusLabelEl.textContent = label;
  }

  // Map agent tool types to UI metadata.
  const TOOL_META: Record<string, { icon: string; label: string }> = {
    read_file:        { icon: 'file-text',     label: t('Чтение') },
    read_dir:         { icon: 'folder-open',   label: t('Просмотр папки') },
    write_file:       { icon: 'file-plus',     label: t('Запись') },
    edit_file:        { icon: 'edit-3',        label: t('Правка') },
    execute_command:  { icon: 'terminal',      label: t('Команда') },
    search_code:      { icon: 'search',        label: t('Поиск') },
    list_components:  { icon: 'layout-grid',   label: t('Компоненты') },
    check_image_size: { icon: 'image',         label: t('Изображение') },
  };
  function metaFor(tool: AgentTool): { icon: string; label: string } {
    if (tool.type.startsWith('mcp__')) {
      return { icon: 'plug', label: 'MCP' };
    }
    return TOOL_META[tool.type] || { icon: 'wrench', label: tool.type };
  }
  function targetFor(tool: AgentTool): string {
    return tool.params?.path
        || tool.params?.command
        || tool.params?.query
        || (tool.type.startsWith('mcp__') ? tool.type.replace('mcp__', '') : '')
        || '';
  }

  // Build the system prompt — same logic as before, just trimmed.
  let dynamicSystemPrompt = SYSTEM_PROMPT_BUILD;
  dynamicSystemPrompt = await injectMcpToolsIntoPrompt(dynamicSystemPrompt);

  let profile = { codingStyle: '', libraries: [] as string[], customNotes: '' };
  try {
    const saved = localStorage.getItem('ag_user_profile');
    if (saved) profile = JSON.parse(saved);
  } catch (e) { /* ignore corrupted profile */ }

  if (profile.codingStyle || profile.libraries.length > 0 || profile.customNotes) {
    dynamicSystemPrompt += `\n\n## ПРОФИЛЬ ПОЛЬЗОВАТЕЛЯ И ПРЕДПОЧТЕНИЯ (User Model)
Учитывай следующие требования пользователя при написании кода:
${profile.codingStyle ? `- Стиль кода: ${profile.codingStyle}\n` : ''}${profile.libraries.length > 0 ? `- Библиотеки: ${profile.libraries.join(', ')}\n` : ''}${profile.customNotes ? `- Примечания: ${profile.customNotes}\n` : ''}`;
  }

  let workspaceFiles: any[] = [];
  if (activeProject && activeProject.workspacePath) {
    try {
      workspaceFiles = await window.electronAPI.readDir(activeProject.workspacePath);
    } catch (e) { /* listing might fail on transient FS errors; non-fatal */ }
  }
  const activeSkills = detectActiveSkills(stepText, workspaceFiles);
  if (activeSkills.length > 0) {
    dynamicSystemPrompt += '\n\nПОДКЛЮЧЕННЫЕ НАВЫКИ И ПРАВИЛА:\n';
    for (const skill of activeSkills) {
      dynamicSystemPrompt += `\n--- НАВЫК: ${skill.name} ---\n${skill.content}\n`;
    }
  }

  dynamicSystemPrompt += `\n\nВНИМАНИЕ: Ты — короткоживущий изолированный Микро-агент. Твоя единственная задача: полностью выполнить Шаг ${stepIdx + 1} плана: "${stepText}".
Выполняй любые чтения, записи, правки файлов или терминальные команды.
Когда ты полностью закончишь работу по шагу, напиши: "Шаг выполнен." и останови генерацию. Не пиши лишних рассуждений в конце.`;

  const microHistory: ChatMessage[] = [
    { role: 'system', content: dynamicSystemPrompt },
    { role: 'user', content: `Выполни шаг: "${stepText}". Используй инструменты для редактирования/записи файлов и запуска необходимых команд.` }
  ];

  let stepSuccess = true;
  let microStepCount = 0;
  let toolsExecuted = 0;
  const maxMicroSteps = 8;

  while (microStepCount < maxMicroSteps && isGenerating) {
    microStepCount++;

    try {
      const resp = await fetchWithRetry(getLLMUrl('/chat/completions'), {
        method: 'POST',
        headers: getLLMHeaders(),
        signal: createAbortController().signal,
        body: JSON.stringify(getLLMBody({
          model: settings.model,
          messages: microHistory,
          temperature: settings.temperature ?? 0.2,
          stream: false,
          max_tokens: settings.maxTokens || 4096,
        })),
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const reply = data.choices?.[0]?.message?.content || '';
      microHistory.push({ role: 'assistant', content: reply });

      if (data.usage) {
        updateTokenStats(data.usage.prompt_tokens, data.usage.completion_tokens);
      }

      const tools = parseTools(reply);
      if (tools.length === 0) {
        if (reply.includes('Шаг выполнен') || reply.toLowerCase().includes('готово') || reply.toLowerCase().includes('выполнено')) {
          break;
        }
        if (reply.includes('```')) {
          addTraceLine({ icon: 'alert-triangle', text: t('Агент вывел код текстом — переспрашиваю'), type: 'warn' });
          microHistory.push({
            role: 'user',
            content: 'ОШИБКА: Ты вывел исходный код в виде обычного текста. Перепиши ответ, используя ТОЛЬКО инструменты <write_file> или <edit_file>.'
          });
          continue;
        }
        // Empty reply — treat as "the agent has nothing else to do".
        break;
      }

      for (const tool of tools) {
        if (!isGenerating) break;
        const meta = metaFor(tool);
        const target = targetFor(tool);
        const line = addTraceLine({
          icon: meta.icon,
          text: target ? `${meta.label}: ${target}` : meta.label,
          type: 'tool',
        });
        try {
          const toolRes = await handleToolExecution(tool);
          microHistory.push({ role: 'system', content: `Результат выполнения ${tool.rawTag}:\n${toolRes}` });
          // If the underlying execute_command returned a non-zero code, mark
          // the line as a warning even though no JS exception was thrown.
          if (tool.type === 'execute_command' && /Код завершения:\s*(?!0\b)\d+/.test(toolRes)) {
            setLineStatus(line, 'warn', 'alert-triangle');
          } else {
            setLineStatus(line, 'success', 'check');
          }
          toolsExecuted++;
        } catch (toolErr: any) {
          microHistory.push({ role: 'system', content: `Ошибка при выполнении ${tool.rawTag}:\n${toolErr.message}` });
          setLineStatus(line, 'error', 'x');
          if (tool.type === 'execute_command') {
            microHistory.push({
              role: 'user',
              content: 'Произошла ошибка сборки при запуске команды. Исправь файлы кода, чтобы сборка проходила успешно.'
            });
          }
        }
      }
    } catch (e: any) {
      addTraceLine({ icon: 'alert-circle', text: `${t('Ошибка')}: ${e.message}`, type: 'error' });
      stepSuccess = false;
      break;
    }
  }

  if (!isGenerating) {
    stepSuccess = false;
  }

  if (stepSuccess) {
    if (workspacePath) {
      try {
        await window.electronAPI.mergeShadowWorkspace(workspacePath);
      } catch (err) {
        console.error('Failed to merge shadow workspace:', err);
      }
    }
    setStatus('success', t('готово'));
    footerEl.classList.remove('hidden');
    footerEl.classList.add('success');
    footerEl.innerHTML = `<i data-lucide="check-circle-2"></i><span>${esc(t('Микро-агент успешно завершил работу. Изменения из теневой песочницы влиты в основной проект.'))}</span><span class="ma-footer-meta">${toolsExecuted} ${esc(t('действий'))} · ${microStepCount} ${esc(t('шагов'))}</span>`;
    refreshIcons();

    activeProject?.chatHistory.push({
      role: 'assistant',
      content: `[Выполнен Шаг ${stepIdx + 1} плана] Микро-агент успешно реализовал задачу: "${stepText}".`
    });
    saveProjects();

    if (nextStepTimer !== null) clearTimeout(nextStepTimer);
    nextStepTimer = setTimeout(() => {
      nextStepTimer = null;
      if (isExecutingPlan) markStepCompleted(planId, stepIdx);
    }, 1000);
  } else {
    if (workspacePath) {
      try {
        await window.electronAPI.discardShadowWorkspace(workspacePath);
      } catch (err) {
        console.error('Failed to discard shadow workspace:', err);
      }
    }

    const abortMessage = !isGenerating
      ? t('Выполнение шага остановлено пользователем. Изменения в теневой песочнице сброшены.')
      : t('Микро-агент завершился с ошибкой. Изменения в теневой песочнице сброшены.');

    setStatus('failed', t('ошибка'));
    footerEl.classList.remove('hidden');
    footerEl.classList.add('failed');
    footerEl.innerHTML = `<i data-lucide="alert-circle"></i><span>${esc(abortMessage)}</span>`;
    refreshIcons();
    setGeneratingState(false);
  }
}

function switchToPlanMode() {
  if (isExecutingPlan) return;
  appMode = 'plan';
  const tabBuild = document.getElementById('mode-tab-build');
  const tabPlan = document.getElementById('mode-tab-plan');
  tabPlan?.classList.add('active');
  tabBuild?.classList.remove('active');
  chatInput.placeholder = t('Опишите, что хотите спроектировать и спланировать...');
}

async function generateDraftStepForComponent(selectedContext: string, elementDesc: string) {
  const stepIdx = planSteps.length;
  planSteps.push({ text: `[Авто-подбор...] Анализ элемента <${elementDesc}>`, enabled: true, status: 'pending' });
  savePlanSteps();

  const latestWidget = document.querySelector('.plan-widget');
  if (!latestWidget) return;
  const planId = latestWidget.id.replace('plan-widget-', '');
  const listContainer = document.getElementById(`plan-steps-list-${planId}`);
  if (listContainer) {
    renderPlanStepElement(planId, stepIdx, listContainer);
    refreshIcons();
  }

  const draftPrompt = `Ты — экспертный ИИ-архитектор в Cognitive No-Code IDE.
Пользователь кликнул по элементу в Live Preview и хочет сгенерировать шаг плана для его модификации или улучшения.

Контекст выбранного элемента:
${selectedContext}

Сформулируй ОДНУ конкретную и полезную задачу (шаг плана на русском языке, до 10-12 слов), описывающую улучшение или логическое действие над этим элементом. Например:
- "Добавить валидацию и маску телефона для формы ввода"
- "Сделать кнопку отправки анимированной при наведении"
- "Добавить кнопку переключения темы оформления в шапку сайта"

Ответь ТОЛЬКО этой одной строкой без кавычек и дополнительных пояснений.`;

  try {
    const resp = await fetchWithRetry(getLLMUrl('/chat/completions'), {
      method: 'POST',
      headers: getLLMHeaders(),
      body: JSON.stringify(getLLMBody({
        model: settings.model,
        messages: [{ role: 'user', content: draftPrompt }],
        temperature: 0.5,
        max_tokens: 100,
      })),
    });

    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const suggestedStep = data.choices?.[0]?.message?.content?.trim() || `Изменить элемент <${elementDesc}>`;

    planSteps[stepIdx].text = suggestedStep;
    savePlanSteps();

    const stepTextEl = document.getElementById(`step-text-${planId}-${stepIdx}`);
    if (stepTextEl) {
      stepTextEl.textContent = suggestedStep;
    }
  } catch (err: any) {
    const errorStep = `Изменить элемент <${elementDesc}> (ошибка автоподбора)`;
    planSteps[stepIdx].text = errorStep;
    savePlanSteps();
    const stepTextEl = document.getElementById(`step-text-${planId}-${stepIdx}`);
    if (stepTextEl) {
      stepTextEl.textContent = errorStep;
    }
  }
}

async function runPlanCritic(_lastUserMsg: string, _steps: string[]) {
  // Critic agent removed in v1.4.3 — the extra LLM round-trip after every plan
  // creation noticeably slowed planning down and the review was rarely useful.
  // The function body is intentionally a no-op so legacy callers keep compiling.
  return;
}

// Note: the previous "keep-alive ping" was removed — it sent real billable requests
// every 45s without providing effective caching. Prompt caching is handled via the
// `cache_control` marker on the system message (see streamChatCompletion).
function startKeepAlivePing() {
  /* intentionally disabled */
}

async function loadProjectSnapshots(): Promise<ProjectSnapshot[]> {
  if (!activeProject || !activeProject.workspacePath) return [];
  try {
    const raw = await window.electronAPI.readFile('.snapshots.json', activeProject.workspacePath, settings.sandboxEnabled);
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

async function saveProjectSnapshots(snapshots: ProjectSnapshot[]): Promise<boolean> {
  if (!activeProject || !activeProject.workspacePath) return false;
  try {
    await window.electronAPI.writeFile('.snapshots.json', JSON.stringify(snapshots, null, 2), activeProject.workspacePath, settings.sandboxEnabled);
    // Best-effort: ensure .snapshots.json is gitignored so it doesn't pollute repos
    await ensureGitignored('.snapshots.json');
    return true;
  } catch (err) {
    console.error('Failed to save project snapshots:', err);
    return false;
  }
}

async function ensureGitignored(entry: string) {
  if (!activeProject || !activeProject.workspacePath) return;
  try {
    let content = '';
    try {
      content = await window.electronAPI.readFile('.gitignore', activeProject.workspacePath, settings.sandboxEnabled);
    } catch {
      // file doesn't exist — only create one if there's a .git folder around (real git repo)
      try {
        const files = await window.electronAPI.readDir(activeProject.workspacePath);
        if (!files.some(f => f.path === '.git' || f.path.startsWith('.git/'))) return;
      } catch { return; }
    }
    const lines = content.split(/\r?\n/);
    if (lines.some(l => l.trim() === entry)) return;
    const next = (content.trim() ? content.trimEnd() + '\n' : '') + entry + '\n';
    await window.electronAPI.writeFile('.gitignore', next, activeProject.workspacePath, settings.sandboxEnabled);
  } catch (err) {
    console.warn('ensureGitignored failed (non-critical):', err);
  }
}

function showSnapshotDialog() {
  if (!activeProject || !activeProject.workspacePath) {
    alert(t('Пожалуйста, выберите рабочую папку проекта для создания снапшота.'));
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="snapshot-dialog" style="background:var(--bg-panel); border-radius:var(--radius-lg); padding:20px; max-width:400px; width:90%; box-shadow:var(--shadow-lg);">
      <h3 style="margin:0 0 12px; font-size:14px; display:flex; align-items:center; gap:6px;">
        <i data-lucide="camera" style="width:16px;height:16px;"></i> ${t('Создать снапшот')}
      </h3>
      <div style="margin-bottom:10px;">
        <label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:3px;">${t('Название')}</label>
        <input id="snapshot-dialog-name" class="setting-input" style="width:100%;" placeholder="${t('Например: Перед рефакторингом')}" value="${t('Веха от')} ${new Date().toLocaleTimeString('ru')}" />
      </div>
      <div style="margin-bottom:14px;">
        <label style="font-size:11px; color:var(--text-secondary); display:block; margin-bottom:3px;">${t('Описание (необязательно)')}</label>
        <input id="snapshot-dialog-desc" class="setting-input" style="width:100%;" placeholder="${t('Краткое описание состояния...')}" />
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="snapshot-dialog-cancel" class="ghost-btn" style="padding:6px 14px; font-size:12px;">Отмена</button>
        <button id="snapshot-dialog-confirm" class="primary-btn" style="padding:6px 14px; font-size:12px;">
          <i data-lucide="check"></i> Создать
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#snapshot-dialog-cancel')?.addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('#snapshot-dialog-confirm')?.addEventListener('click', async () => {
    const nameInput = backdrop.querySelector('#snapshot-dialog-name') as HTMLInputElement;
    const descInput = backdrop.querySelector('#snapshot-dialog-desc') as HTMLInputElement;
    const name = nameInput?.value?.trim() || `Веха от ${new Date().toLocaleTimeString('ru')}`;
    const desc = descInput?.value?.trim() || '';
    backdrop.remove();
    await createSnapshot(name, desc);
  });

  const nameInput = backdrop.querySelector('#snapshot-dialog-name') as HTMLInputElement;
  if (nameInput) { nameInput.focus(); nameInput.select(); }
  refreshIcons();
}

// Silent automatic checkpoint before an agent run (no UI noise, capped history)
async function autoCheckpoint(label: string) {
  if (!settings.autoCheckpoint) return;
  if (!activeProject || !activeProject.workspacePath) return;
  try {
    const files = await window.electronAPI.readDir(activeProject.workspacePath);
    const filesData: Record<string, string> = {};
    for (const f of files) {
      if (f.isDir) continue;
      if (f.path === '.snapshots.json' || f.path.startsWith('.shadow-workspace/')) continue;
      if (f.size > 500_000) continue;
      try {
        filesData[f.path] = await window.electronAPI.readFile(f.path, activeProject.workspacePath, settings.sandboxEnabled);
      } catch {}
    }
    if (Object.keys(filesData).length === 0) return;

    const snap: ProjectSnapshot = {
      id: genId(),
      name: `⚡ ${label}`,
      desc: 'Автоматический чекпоинт перед действием агента (можно откатиться).',
      timestamp: Date.now(),
      planSteps: JSON.parse(JSON.stringify(planSteps)),
      files: filesData,
    };
    let snapshots = await loadProjectSnapshots();
    snapshots.push(snap);
    // Keep only the latest 15 auto-checkpoints to avoid unbounded growth
    const autos = snapshots.filter(s => s.name.startsWith('⚡'));
    if (autos.length > 15) {
      const toRemove = new Set(autos.sort((a, b) => a.timestamp - b.timestamp).slice(0, autos.length - 15).map(s => s.id));
      snapshots = snapshots.filter(s => !toRemove.has(s.id));
    }
    await saveProjectSnapshots(snapshots);
  } catch (err) {
    console.warn('Auto-checkpoint failed (non-critical):', err);
  }
}

async function createSnapshot(name: string, desc: string) {
  if (!activeProject || !activeProject.workspacePath) {
    alert(t('Пожалуйста, выберите рабочую папку проекта для создания снапшота.'));
    return;
  }
  showThinking();
  try {
    const files = await window.electronAPI.readDir(activeProject.workspacePath);
    const filesData: Record<string, string> = {};
    let totalSize = 0;

    for (const f of files) {
      if (f.isDir) continue;
      if (f.path === '.snapshots.json' || f.path.startsWith('.shadow-workspace/')) continue;
      try {
        const content = await window.electronAPI.readFile(f.path, activeProject.workspacePath, settings.sandboxEnabled);
        filesData[f.path] = content;
        totalSize += content.length;
      } catch (err) {
        console.warn(`Failed to read file ${f.path} during snapshot:`, err);
      }
    }

    if (Object.keys(filesData).length === 0) {
      appendBubble('Система', t('⚠️ Не удалось создать снапшот: нет файлов для сохранения.'), true);
      removeThinking();
      return;
    }

    const newSnapshot: ProjectSnapshot = {
      id: genId(),
      name: name || `Веха от ${new Date().toLocaleTimeString('ru')}`,
      desc: desc || `Снапшот состояния файлов проекта и текущего плана.`,
      timestamp: Date.now(),
      planSteps: JSON.parse(JSON.stringify(planSteps)),
      files: filesData
    };

    const snapshots = await loadProjectSnapshots();
    snapshots.push(newSnapshot);
    await saveProjectSnapshots(snapshots);
    
    appendBubble('Система', `📸 ${t('Снапшот создан')}: "${newSnapshot.name}" (${Object.keys(filesData).length}, ${formatBytes(totalSize)}).`, true);
    await renderSnapshotsUI();
  } catch (err: any) {
    alert(`${t('Ошибка создания снапшота: ')}${err.message}`);
  } finally {
    removeThinking();
  }
}

async function rollbackToSnapshot(snapshotId: string) {
  if (!activeProject || !activeProject.workspacePath) return;

  const confirmRollback = await confirmDialog('Вы уверены, что хотите откатиться к этому снапшоту? Текущие несохраненные изменения будут перезаписаны.', 'Откат снапшота');
  if (!confirmRollback) return;

  showThinking();
  try {
    const snapshots = await loadProjectSnapshots();
    const snap = snapshots.find(s => s.id === snapshotId);
    if (!snap) {
      alert(t('Снапшот не найден.'));
      return;
    }

    for (const [filePath, content] of Object.entries(snap.files)) {
      try {
        await window.electronAPI.writeFile(filePath, content, activeProject.workspacePath, settings.sandboxEnabled);
      } catch (err) {
        console.warn(`Failed to restore file ${filePath} during rollback:`, err);
      }
    }

    planSteps = JSON.parse(JSON.stringify(snap.planSteps || []));

    const latestPlanWidget = document.querySelector('.plan-widget');
    if (latestPlanWidget) {
      const planId = latestPlanWidget.id.replace('plan-widget-', '');
      const listContainer = document.getElementById(`plan-steps-list-${planId}`);
      if (listContainer) {
        listContainer.innerHTML = '';
        planSteps.forEach((_, idx) => {
          renderPlanStepElement(planId, idx, listContainer);
        });
      }
    } else {
      if (planSteps.length > 0) {
        renderPlanWidgetInChat(planSteps.map(s => s.text));
      }
    }

    appendBubble('Система', `⏪ ${t('Откат к снапшоту выполнен')}: "${snap.name}".`, true);
    
    renderPreview();
    refreshWorkspaceFilesUI();
    
  } catch (err: any) {
    alert(`${t('Ошибка восстановления снапшота: ')}${err.message}`);
  } finally {
    removeThinking();
  }
}

async function deleteSnapshot(snapshotId: string) {
  const confirmDelete = await confirmDialog('Удалить этот снапшот?', 'Удаление снапшота');
  if (!confirmDelete) return;

  try {
    const snapshots = await loadProjectSnapshots();
    const filtered = snapshots.filter(s => s.id !== snapshotId);
    await saveProjectSnapshots(filtered);
    await renderSnapshotsUI();
  } catch (err: any) {
    alert(`${t('Ошибка удаления снапшота: ')}${err.message}`);
  }
}

async function renderSnapshotsUI() {
  const container = document.getElementById('snapshots-list');
  if (!container) return;

  if (!activeProject || !activeProject.workspacePath) {
    container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-muted);">Папка проекта не выбрана. Снапшоты недоступны.</div>';
    return;
  }

  const snapshots = await loadProjectSnapshots();
  if (snapshots.length === 0) {
    container.innerHTML = `
      <div class="empty-preview" style="padding:40px 20px; text-align:center; color:var(--text-muted);">
        <i data-lucide="history" style="width:48px; height:48px; margin-bottom:12px; opacity:0.3;"></i>
        <p>${t('Снапшотов пока нет.')}</p>
        <p style="font-size:12px; margin-top:4px;">${t('Нажмите «Создать веху», чтобы зафиксировать рабочую версию.')}</p>
      </div>
    `;
    refreshIcons();
    return;
  }

  snapshots.sort((a, b) => b.timestamp - a.timestamp);

  container.innerHTML = '';
  snapshots.forEach(snap => {
    const card = document.createElement('div');
    card.className = 'snapshot-card';
    card.innerHTML = `
      <div class="snapshot-card-header">
        <span class="snapshot-card-title">${esc(snap.name)}</span>
        <span class="snapshot-card-time">${new Date(snap.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} ${new Date(snap.timestamp).toLocaleDateString('ru')}</span>
      </div>
      <div class="snapshot-card-desc">
        ${esc(snap.desc)}
      </div>
      <div style="font-size: 11px; color: var(--text-muted); display:flex; gap:12px; margin-top:2px;">
        <span>📄 ${Object.keys(snap.files || {}).length}</span>
        <span>📋 ${(snap.planSteps || []).length} шагов</span>
        <span>💾 ${formatBytes(new Blob([JSON.stringify(snap.files)]).size)}</span>
      </div>
      <div class="snapshot-card-actions">
        <button class="primary-btn btn-rollback" data-id="${snap.id}" style="padding:4px 8px; font-size:12px; border-radius: var(--radius-sm);">
          <i data-lucide="undo-2" style="width:14px; height:14px;"></i><span>${t('Применить')}</span>
        </button>
        <button class="ghost-btn btn-delete-snap" data-id="${snap.id}" style="padding:4px 8px; font-size:12px; color: var(--accent-red);">
          <i data-lucide="trash-2" style="width:14px; height:14px;"></i><span>${t('Удалить')}</span>
        </button>
      </div>
    `;

    card.querySelector('.btn-rollback')?.addEventListener('click', () => rollbackToSnapshot(snap.id));
    card.querySelector('.btn-delete-snap')?.addEventListener('click', () => deleteSnapshot(snap.id));

    container.appendChild(card);
  });

  refreshIcons();
}

function rebuildPlan(planId: string) {
  planApproved = false;
  isExecutingPlan = false;
  currentStepIndex = -1;
  
  chatInput.disabled = false;
  btnSend.disabled = false;

  const footer = document.getElementById(`plan-widget-footer-${planId}`);
  if (footer) footer.style.display = 'flex';

  const listContainer = document.getElementById(`plan-steps-list-${planId}`);
  if (listContainer) {
    listContainer.innerHTML = '';
    planSteps.forEach((step, idx) => {
      if (step.status === 'failed' || step.status === 'active') {
        step.status = 'pending';
      }
      renderPlanStepElement(planId, idx, listContainer);
    });
  }
  refreshIcons();
}

async function loadWelcomeGitStatus(workspacePath: string, container: HTMLElement) {
  const gitContent = container.querySelector('#welcome-git-content');
  const branchContainer = container.querySelector('#welcome-git-branch-container');
  if (!gitContent) return;

  gitContent.innerHTML = `
    <div class="dashboard-git-clean">
      <i data-lucide="loader-2" class="action-spinner"></i>
      <span>${t('Проверка статуса Git...')}</span>
    </div>
  `;
  refreshIcons();

  try {
    const branchRes = await window.electronAPI.executeCommand('git branch --show-current', workspacePath);
    const branchName = branchRes.code === 0 ? branchRes.stdout.trim() : '';

    if (branchContainer) {
      if (branchName) {
        branchContainer.innerHTML = `
          <div class="dashboard-git-branch-badge" title="${t('Текущая ветка Git')}">
            <i data-lucide="git-branch" style="width: 10px; height: 10px;"></i>
            <span>${esc(branchName)}</span>
          </div>
        `;
      } else {
        branchContainer.innerHTML = '';
      }
    }

    const statusRes = await window.electronAPI.executeCommand('git status --porcelain', workspacePath);
    if (statusRes.code !== 0) {
      gitContent.innerHTML = `
        <div class="dashboard-git-clean">
          <i data-lucide="git-pull-request" style="color: var(--text-muted); width: 16px; height: 16px;"></i>
          <span style="font-size: 11px;">${t('Папка не является репозиторием Git')}</span>
          <button class="secondary-btn tiny" id="btn-welcome-git-init" style="margin-top: 4px; padding: 2px 6px; font-size: 10px;">${t('Инициализировать')}</button>
        </div>
      `;
      container.querySelector('#btn-welcome-git-init')?.addEventListener('click', async () => {
        await window.electronAPI.executeCommand('git init', workspacePath);
        loadWelcomeGitStatus(workspacePath, container);
      });
    } else {
      const lines = statusRes.stdout.split('\n').map(l => l.trim()).filter(l => l !== '');
      if (lines.length === 0) {
        gitContent.innerHTML = `
          <div class="dashboard-git-clean">
            <i data-lucide="check-circle-2" style="color: var(--accent-green); width: 16px; height: 16px;"></i>
            <span style="font-weight: 550; color: var(--text-primary); font-size: 11px;">${t('Рабочая копия чиста')}</span>
            <span style="font-size: 10px;">${t('Все изменения зафиксированы.')}</span>
          </div>
        `;
      } else {
        let fileListHTML = '<div class="git-file-list" style="max-height: 120px;">';
        for (const line of lines.slice(0, 10)) {
          const status = line.slice(0, 2);
          const filepath = line.slice(3).trim();
          const filename = filepath.split(/[\\/]/).pop() || filepath;

          let statusLabel = 'M';
          let statusClass = 'modified';
          if (status.includes('?') || status.includes('A')) {
            statusLabel = 'A';
            statusClass = 'added';
          } else if (status.includes('D')) {
            statusLabel = 'D';
            statusClass = 'deleted';
          } else if (status.includes('U')) {
            statusLabel = 'U';
            statusClass = 'untracked';
          }

          fileListHTML += `
            <div class="git-file-item" title="${esc(filepath)}" style="padding: 4px 6px;">
              <span class="git-file-name" style="max-width: 70%;">${esc(filename)}</span>
              <span class="git-file-status ${statusClass}" style="font-size: 8px; padding: 1px 3px;">${statusLabel}</span>
            </div>
          `;
        }
        if (lines.length > 10) {
          fileListHTML += `
            <div style="font-size: 10px; color: var(--text-muted); text-align: center; margin-top: 4px;">
              ... и еще ${lines.length - 10} файлов
            </div>
          `;
        }
        fileListHTML += '</div>';

        gitContent.innerHTML = `
          <div style="font-size: 11px; color: var(--text-muted); margin-bottom: 4px;">
            ${t('Изменения')} (${lines.length}):
          </div>
          ${fileListHTML}
        `;
      }
    }
    refreshIcons();
  } catch (err) {
    gitContent.innerHTML = `<div class="dashboard-git-clean"><span>${t('Ошибка статуса Git')}</span></div>`;
  }
}

init();

export {};

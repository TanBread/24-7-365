import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // Select folder via native dialog
  selectFolder: () => ipcRenderer.invoke('select-folder'),

  // List directory contents
  readDir: (workspacePath: string) => ipcRenderer.invoke('read-dir', workspacePath),

  // Read file contents
  readFile: (filePath: string, workspacePath: string, sandbox: boolean) =>
    ipcRenderer.invoke('read-file', filePath, workspacePath, sandbox),

  // Write file contents
  writeFile: (filePath: string, content: string, workspacePath: string, sandbox: boolean) =>
    ipcRenderer.invoke('write-file', filePath, content, workspacePath, sandbox),

  // Delete a file (path-checked, used for temp cleanup)
  deleteFile: (filePath: string, workspacePath: string) =>
    ipcRenderer.invoke('delete-file', filePath, workspacePath),

  // App version (for the Settings/About labels)
  getAppVersion: () => ipcRenderer.invoke('get-app-version') as Promise<string>,

  // Server-side sandbox preference
  setSandboxEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('set-sandbox-enabled', enabled) as Promise<boolean>,

  // Server-side language preference
  setLanguage: (lang: string) =>
    ipcRenderer.invoke('set-language', lang) as Promise<boolean>,

  // Shadow workspace operations
  prepareShadowWorkspace: (workspacePath: string) =>
    ipcRenderer.invoke('prepare-shadow-workspace', workspacePath),
  mergeShadowWorkspace: (workspacePath: string) =>
    ipcRenderer.invoke('merge-shadow-workspace', workspacePath),
  discardShadowWorkspace: (workspacePath: string) =>
    ipcRenderer.invoke('discard-shadow-workspace', workspacePath),

  // Execute terminal commands
  executeCommand: (command: string, workspacePath: string) =>
    ipcRenderer.invoke('exec-command', command, workspacePath),

  // Create a git commit (message passed as an argument, no shell)
  gitCommit: (message: string, workspacePath: string) =>
    ipcRenderer.invoke('git-commit', message, workspacePath),

  // Execute terminal command with live streaming output
  executeCommandStream: (command: string, workspacePath: string, execId: string) =>
    ipcRenderer.invoke('exec-command-stream', command, workspacePath, execId),

  // Subscribe to live command output chunks
  onCommandChunk: (callback: (data: { execId: string; stream: string; chunk: string }) => void) => {
    const listener = (_e: any, data: any) => callback(data);
    ipcRenderer.on('command-chunk', listener);
    return () => ipcRenderer.removeListener('command-chunk', listener);
  },

  // Secure API key storage (OS-level encryption)
  secureKeySet: (apiKey: string) => ipcRenderer.invoke('secure-key-set', apiKey),
  secureKeyGet: () => ipcRenderer.invoke('secure-key-get') as Promise<string>,

  // Persistent large-JSON store (replaces localStorage for projects/snapshots)
  storeGet: (name: string) => ipcRenderer.invoke('store-get', name) as Promise<string | null>,
  storeSet: (name: string, value: string) => ipcRenderer.invoke('store-set', name, value) as Promise<boolean>,

  // Auto-updater
  updaterCheck: () => ipcRenderer.invoke('updater-check'),
  updaterDownload: () => ipcRenderer.invoke('updater-download'),
  updaterInstall: () => ipcRenderer.invoke('updater-install'),
  onUpdaterStatus: (callback: (data: any) => void) => {
    const listener = (_e: any, data: any) => callback(data);
    ipcRenderer.on('updater-status', listener);
    return () => ipcRenderer.removeListener('updater-status', listener);
  },

  // Open folder path in system file manager
  openInExplorer: (folderPath: string) =>
    ipcRenderer.invoke('open-in-explorer', folderPath),

  // Open external URL in user's default browser
  openExternal: (url: string) =>
    ipcRenderer.invoke('open-external', url),

  // Check image size
  checkImageSize: (filePath: string, workspacePath: string) =>
    ipcRenderer.invoke('check-image-size', filePath, workspacePath),

  // List components in workspace
  listComponents: (workspacePath: string) =>
    ipcRenderer.invoke('list-components', workspacePath),

  // Custom window controls
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowToggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  windowIsMaximized: () => ipcRenderer.invoke('window-is-maximized') as Promise<boolean>,

  // Native confirm dialog
  showConfirm: (message: string, title?: string, lang?: string) =>
    ipcRenderer.invoke('show-confirm', message, title, lang) as Promise<boolean>,

  // Minimize-to-tray toggle
  setMinimizeToTray: (enabled: boolean) =>
    ipcRenderer.invoke('set-minimize-to-tray', enabled) as Promise<boolean>,

  // Show native OS notification
  showNotification: (title: string, body: string) =>
    ipcRenderer.invoke('show-notification', title, body) as Promise<boolean>,

  // External preview window management
  openExternalPreview: (html: string) =>
    ipcRenderer.invoke('open-external-preview', html) as Promise<boolean>,
  updateExternalPreview: (html: string) =>
    ipcRenderer.invoke('update-external-preview', html) as Promise<boolean>,

  // Interactive Terminal Stdin
  sendStdin: (execId: string, text: string) =>
    ipcRenderer.invoke('exec-command-stdin', execId, text) as Promise<boolean>,

  // Kill running command process
  killCommand: (execId: string) =>
    ipcRenderer.invoke('exec-command-kill', execId) as Promise<boolean>,

  // MCP support
  mcpReinit: (serversJson: string) =>
    ipcRenderer.invoke('mcp-reinit', serversJson) as Promise<boolean>,
  mcpListTools: () =>
    ipcRenderer.invoke('mcp-list-tools') as Promise<any[]>,
  mcpCallTool: (serverName: string, toolName: string, args: any) =>
    ipcRenderer.invoke('mcp-call-tool', serverName, toolName, args) as Promise<any>,

  // Native core-backend (Rust AST + BM25) — methods return null when the
  // native engine is unavailable, so callers can fall back to TS implementations.
  coreStatus: () =>
    ipcRenderer.invoke('core-status') as Promise<{
      available: boolean;
      version?: string;
      files?: number;
      docs?: number;
      languages?: string[];
      reason?: string;
    }>,
  coreParseAst: (code: string, ext: string) =>
    ipcRenderer.invoke('core-parse-ast', code, ext) as Promise<{
      status: 'success' | 'skipped' | 'error';
      language: string;
      nodes_count: number;
      nodes: { name: string; node_type: string; line_start: number; line_end: number }[];
    } | null>,
  coreIndexFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('core-index-file', filePath, content) as Promise<{ status: string; chunks: number } | null>,
  coreIndexFiles: (files: { file_path: string; content: string }[]) =>
    ipcRenderer.invoke('core-index-files', files) as Promise<{ files_indexed: number; chunks: number } | null>,
  coreRemoveFile: (filePath: string) =>
    ipcRenderer.invoke('core-remove-file', filePath) as Promise<{ status: string; removed: boolean } | null>,
  coreSearchRag: (query: string, limit?: number) =>
    ipcRenderer.invoke('core-search-rag', query, limit) as Promise<{
      status: 'success';
      query: string;
      results_count: number;
      results: { file_path: string; line_start: number; line_end: number; chunk_content: string; score: number }[];
    } | null>,
  coreClearIndex: () =>
    ipcRenderer.invoke('core-clear-index') as Promise<{ status: string } | null>,
});


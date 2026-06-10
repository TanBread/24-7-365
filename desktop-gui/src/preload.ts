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
  showConfirm: (message: string, title?: string) =>
    ipcRenderer.invoke('show-confirm', message, title) as Promise<boolean>,

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
});


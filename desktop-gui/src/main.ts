import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, safeStorage, Tray, Menu, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import { McpClient } from './lib/mcp';
import { CoreEngineClient, findCoreBinary } from './lib/coreEngine';

let activeProcesses: Map<string, childProcess.ChildProcess> = new Map();
let activeMcpClients: Map<string, McpClient> = new Map();
let coreEngine: CoreEngineClient | null = null;
let coreEngineStartPromise: Promise<void> | null = null;
let coreEngineFailureReason: string | null = null;

async function ensureCoreEngine(): Promise<CoreEngineClient | null> {
  // Already running.
  if (coreEngine && coreEngine.isReady) return coreEngine;
  // A previous start attempt is in flight.
  if (coreEngineStartPromise) {
    try {
      await coreEngineStartPromise;
      return coreEngine && coreEngine.isReady ? coreEngine : null;
    } catch {
      return null;
    }
  }

  const binary = findCoreBinary(__dirname, process.resourcesPath);
  if (!binary) {
    coreEngineFailureReason = 'binary not found';
    console.log('[core-backend] no native binary found — falling back to TS implementations');
    return null;
  }
  console.log(`[core-backend] starting native engine: ${binary}`);
  const client = new CoreEngineClient(binary);
  coreEngine = client;
  coreEngineStartPromise = client
    .start()
    .then(() => {
      coreEngineFailureReason = null;
      console.log(`[core-backend] ready (v${client.version})`);
    })
    .catch((err) => {
      coreEngineFailureReason = err?.message || String(err);
      console.warn('[core-backend] start failed:', coreEngineFailureReason);
      coreEngine = null;
    })
    .finally(() => {
      // Allow future ensure() calls to retry after a clean stop.
      if (!coreEngine) coreEngineStartPromise = null;
    });
  await coreEngineStartPromise;
  return coreEngine && coreEngine.isReady ? coreEngine : null;
}

async function reinitMcpServers(servers: any[]) {
  // Stop all active servers
  for (const client of activeMcpClients.values()) {
    try {
      await client.stop();
    } catch (err) {
      console.error('Error stopping MCP client:', err);
    }
  }
  activeMcpClients.clear();

  // Start active servers
  for (const s of servers) {
    if (!s.active) continue;
    try {
      const client = new McpClient(s.name, s.command, s.args, s.env);
      await client.start();
      activeMcpClients.set(s.name, client);
      console.log(`[MCP] Server started: ${s.name}`);
    } catch (err) {
      console.error(`[MCP] Failed to start server ${s.name}:`, err);
    }
  }
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
// When true, closing the window hides it to the tray instead of quitting.
let minimizeToTray = false;

// ─── Secure storage for the API key (OS-level encryption via safeStorage) ───
function getKeyStorePath(): string {
  return path.join(app.getPath('userData'), 'secure-key.bin');
}

ipcMain.handle('secure-key-set', async (_event, apiKey: string) => {
  try {
    const file = getKeyStorePath();
    if (!apiKey) {
      if (fs.existsSync(file)) fs.rmSync(file);
      return true;
    }
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(apiKey);
      await fs.promises.writeFile(file, encrypted);
    } else {
      // Fallback: store as-is (encryption unavailable on this OS/session)
      await fs.promises.writeFile(file, Buffer.from('PLAIN:' + apiKey, 'utf-8'));
    }
    return true;
  } catch (err) {
    console.error('Failed to store API key securely:', err);
    return false;
  }
});

ipcMain.handle('secure-key-get', async () => {
  try {
    const file = getKeyStorePath();
    if (!fs.existsSync(file)) return '';
    const buf = await fs.promises.readFile(file);
    if (buf.slice(0, 6).toString('utf-8') === 'PLAIN:') {
      return buf.slice(6).toString('utf-8');
    }
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    return '';
  } catch (err) {
    console.error('Failed to read API key:', err);
    return '';
  }
});

// ─── Persistent JSON store (replaces localStorage for large data) ───
function getStorePath(name: string): string {
  // Sanitize: only allow alphanumeric + dash + underscore in store names
  const safe = name.replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(app.getPath('userData'), `${safe}.json`);
}

ipcMain.handle('store-get', async (_event, name: string) => {
  try {
    const file = getStorePath(name);
    if (!fs.existsSync(file)) return null;
    const text = await fs.promises.readFile(file, 'utf-8');
    return text;
  } catch (err) {
    console.error(`store-get failed for "${name}":`, err);
    return null;
  }
});

ipcMain.handle('store-set', async (_event, name: string, value: string) => {
  try {
    const file = getStorePath(name);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    await fs.promises.writeFile(tmp, value, 'utf-8');
    await fs.promises.rename(tmp, file);
    return true;
  } catch (err) {
    console.error(`store-set failed for "${name}":`, err);
    return false;
  }
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    backgroundColor: '#FAFAFA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  // Minimize-to-tray: intercept the close button when the option is enabled.
  mainWindow.on('close', (e) => {
    if (minimizeToTray && !isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── System tray ──────────────────────────────────────────────────────────────
function getTrayIconPath(): string {
  // Packaged: icon.ico ships in build resources; dev: fall back to repo icon.
  const candidates = [
    path.join(process.resourcesPath || '', 'build', 'icon.ico'),
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../../build/icon.ico'),
    path.join(__dirname, '../../../icon.png'),
  ];
  for (const c of candidates) {
    try { if (c && fs.existsSync(c)) return c; } catch {}
  }
  return '';
}

function setupTray() {
  if (tray) return;
  const iconPath = getTrayIconPath();
  let image = iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
  if (!image.isEmpty() && process.platform !== 'win32') {
    image = image.resize({ width: 16, height: 16 });
  }
  try {
    tray = new Tray(image);
  } catch (err) {
    console.warn('[tray] failed to create tray:', err);
    return;
  }
  tray.setToolTip('7/24 IDE');
  const showWindow = () => {
    if (!mainWindow) { createWindow(); return; }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  };
  const menu = Menu.buildFromTemplate([
    { label: 'Открыть 7/24 IDE', click: showWindow },
    { type: 'separator' },
    { label: 'Выход', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on('click', showWindow);
}

// Renderer toggles "minimize to tray" from settings.
ipcMain.handle('set-minimize-to-tray', (_event, enabled: boolean) => {
  minimizeToTray = !!enabled;
  if (minimizeToTray) {
    setupTray();
  } else if (tray) {
    tray.destroy();
    tray = null;
  }
  return true;
});

// ═══════════════════════════════════════════
// IPC HANDLERS FOR DESKTOP AGENT
// ═══════════════════════════════════════════

// Select folder via native dialog
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Выбрать рабочую папку'
  });
  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
});

// Recursively list files in directory (excluding node_modules, .git, etc.)
// Guarded against symlink loops (via a visited realpath set) and runaway
// trees (depth + total file caps) so a malicious/huge repo can't hang the app.
async function getFilesRecursively(
  dir: string,
  baseDir: string,
  depth: number = 0,
  visited: Set<string> = new Set(),
  counter: { n: number } = { n: 0 },
): Promise<{ path: string; isDir: boolean; size: number }[]> {
  let files: { path: string; isDir: boolean; size: number }[] = [];

  const MAX_DEPTH = 25;
  const MAX_FILES = 20000;
  if (depth > MAX_DEPTH || counter.n >= MAX_FILES) return files;

  // Resolve symlinks to a canonical path and bail if we've seen it (cycle).
  let realDir: string;
  try {
    realDir = await fs.promises.realpath(dir);
  } catch {
    return files;
  }
  if (visited.has(realDir)) return files;
  visited.add(realDir);

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (counter.n >= MAX_FILES) break;
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

    // Skip heavy/system folders
    if (
      entry.name === 'node_modules' ||
      entry.name === '.git' ||
      entry.name === 'dist' ||
      entry.name === 'build' ||
      entry.name === '.next' ||
      entry.name === 'out' ||
      entry.name === 'package-lock.json' ||
      entry.name === 'yarn.lock' ||
      entry.name === 'pnpm-lock.yaml'
    ) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push({ path: relativePath, isDir: true, size: 0 });
      counter.n++;
      try {
        const subFiles = await getFilesRecursively(fullPath, baseDir, depth + 1, visited, counter);
        files = files.concat(subFiles);
      } catch (err) {
        // Skip folders that throw permissions/read errors
      }
    } else {
      try {
        const stat = await fs.promises.stat(fullPath);
        files.push({ path: relativePath, isDir: false, size: stat.size });
        counter.n++;
      } catch (err) {}
    }
  }
  return files;
}

ipcMain.handle('read-dir', async (_event, workspacePath: string) => {
  try {
    if (!fs.existsSync(workspacePath)) return [];
    return await getFilesRecursively(workspacePath, workspacePath);
  } catch (err: any) {
    console.error('Error reading directory:', err);
    throw err;
  }
});

// Read file contents (with optional sandbox check)
ipcMain.handle('read-file', async (_event, filePath: string, workspacePath: string, sandbox: boolean) => {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
  const resolvedPath = path.resolve(absolutePath);
  const resolvedWorkspace = path.resolve(workspacePath);

  // Use path.relative for robust containment check (prevents path traversal)
  const rel = path.relative(resolvedWorkspace, resolvedPath);
  if (sandbox && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(`Access Denied: Path is outside the sandbox: ${resolvedPath}`);
  }

  return await fs.promises.readFile(resolvedPath, 'utf-8');
});

// Write file contents (with optional sandbox check)
ipcMain.handle('write-file', async (_event, filePath: string, content: string, workspacePath: string, sandbox: boolean) => {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
  const resolvedPath = path.resolve(absolutePath);
  const resolvedWorkspace = path.resolve(workspacePath);

  // Use path.relative for robust containment check (prevents path traversal)
  const rel = path.relative(resolvedWorkspace, resolvedPath);
  if (sandbox && (rel.startsWith('..') || path.isAbsolute(rel))) {
    throw new Error(`Access Denied: Path is outside the sandbox: ${resolvedPath}`);
  }

  // Ensure parent directory exists
  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
  // Atomic write: write to a sibling temp file and rename — prevents truncated
  // files if the process is interrupted mid-write.
  const tmpPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    // Support BASE64: prefix for binary data (images)
    let writeData: string | Buffer;
    if (content.startsWith('BASE64:')) {
      writeData = Buffer.from(content.slice(7), 'base64');
    } else {
      writeData = content;
    }
    await fs.promises.writeFile(tmpPath, writeData);
    await fs.promises.rename(tmpPath, resolvedPath);
  } catch (err) {
    // Best-effort cleanup of the temp file on failure
    try { if (fs.existsSync(tmpPath)) await fs.promises.unlink(tmpPath); } catch {}
    throw err;
  }
  return true;
});

// Delete a file (path-checked, cross-platform). Used for temp cleanup.
ipcMain.handle('get-app-version', () => {
  try { return app.getVersion(); } catch { return ''; }
});

ipcMain.handle('delete-file', async (_event, filePath: string, workspacePath: string) => {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
    const resolvedPath = path.resolve(absolutePath);
    const resolvedWorkspace = path.resolve(workspacePath);
    const rel = path.relative(resolvedWorkspace, resolvedPath);
    // Always enforce containment for deletion — never delete outside the workspace.
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Access Denied: Path is outside the workspace: ${resolvedPath}`);
    }
    if (fs.existsSync(resolvedPath)) {
      await fs.promises.unlink(resolvedPath);
    }
    return true;
  } catch (err) {
    console.warn('delete-file failed:', err);
    return false;
  }
});

// Helper to recursively copy directories (async)
async function copyDirAsync(src: string, dest: string, excludeList: string[]) {
  const name = path.basename(src);
  if (excludeList.includes(name)) return;

  const stat = await fs.promises.stat(src);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src);
    for (const entry of entries) {
      await copyDirAsync(path.join(src, entry), path.join(dest, entry), excludeList);
    }
  } else {
    await fs.promises.copyFile(src, dest);
  }
}

// Shadow Workspace IPC Handlers
ipcMain.handle('prepare-shadow-workspace', async (_event, workspacePath: string) => {
  const shadowPath = path.join(workspacePath, '.shadow-workspace');
  try {
    // 1. Clean old shadow workspace
    if (fs.existsSync(shadowPath)) {
      fs.rmSync(shadowPath, { recursive: true, force: true });
    }
    
    // 2. Create shadow folder
    fs.mkdirSync(shadowPath, { recursive: true });
    
    // 3. Copy files from root to shadow workspace, excluding .git, node_modules, .shadow-workspace
    const excludeList = ['.git', 'node_modules', '.shadow-workspace', 'dist', 'dist-win'];
    const entries = await fs.promises.readdir(workspacePath);
    for (const entry of entries) {
      if (excludeList.includes(entry)) continue;
      const src = path.join(workspacePath, entry);
      const dest = path.join(shadowPath, entry);
      await copyDirAsync(src, dest, excludeList);
    }
    
    // 4. Create directory junction/symlink for node_modules so commands run fine
    const nodeModulesPath = path.join(workspacePath, 'node_modules');
    const shadowNodeModules = path.join(shadowPath, 'node_modules');
    if (fs.existsSync(nodeModulesPath)) {
      try {
        fs.symlinkSync(nodeModulesPath, shadowNodeModules, 'junction');
      } catch (symErr) {
        console.warn('Failed to symlink node_modules, copying junction failed:', symErr);
      }
    }
    return true;
  } catch (err: any) {
    console.error('Error preparing shadow workspace:', err);
    throw err;
  }
});

ipcMain.handle('merge-shadow-workspace', async (_event, workspacePath: string) => {
  const shadowPath = path.join(workspacePath, '.shadow-workspace');
  if (!fs.existsSync(shadowPath)) return false;
  
  try {
    // Copy back from shadow to root (excluding node_modules)
    const excludeList = ['node_modules', '.git', '.shadow-workspace'];
    const entries = await fs.promises.readdir(shadowPath);
    for (const entry of entries) {
      if (excludeList.includes(entry)) continue;
      const src = path.join(shadowPath, entry);
      const dest = path.join(workspacePath, entry);
      await copyDirAsync(src, dest, excludeList);
    }
    
    // Clean up shadow workspace
    fs.rmSync(shadowPath, { recursive: true, force: true });
    return true;
  } catch (err: any) {
    console.error('Error merging shadow workspace:', err);
    throw err;
  }
});

ipcMain.handle('discard-shadow-workspace', async (_event, workspacePath: string) => {
  const shadowPath = path.join(workspacePath, '.shadow-workspace');
  try {
    if (fs.existsSync(shadowPath)) {
      fs.rmSync(shadowPath, { recursive: true, force: true });
    }
    return true;
  } catch (err: any) {
    console.error('Error discarding shadow workspace:', err);
    throw err;
  }
});


// Execute shell commands inside the workspace folder
ipcMain.handle('exec-command', async (_event, command: string, workspacePath: string) => {
  return new Promise((resolve) => {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      resolve({ code: 1, stdout: '', stderr: 'Ошибка: Рабочая папка не выбрана или не существует.' });
      return;
    }

    childProcess.exec(command, { cwd: workspacePath, timeout: 180000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code || 1) : 0,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
});

// Create a git commit with the message passed as an argument array.
// Uses execFile (no shell), so the message can never inject commands.
ipcMain.handle('git-commit', async (_event, message: string, workspacePath: string) => {
  return new Promise((resolve) => {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      resolve({ code: 1, stdout: '', stderr: 'Ошибка: Рабочая папка не выбрана или не существует.' });
      return;
    }
    childProcess.execFile('git', ['commit', '-m', message], { cwd: workspacePath, timeout: 180000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code || 1) : 0,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
});

// Execute shell command with LIVE streaming output to the renderer terminal panel
// Execute shell command with LIVE streaming output to the renderer terminal panel
ipcMain.handle('exec-command-stream', async (_event, command: string, workspacePath: string, execId: string) => {
  return new Promise((resolve) => {
    if (!workspacePath || !fs.existsSync(workspacePath)) {
      resolve({ code: 1, stdout: '', stderr: 'Ошибка: Рабочая папка не выбрана или не существует.' });
      return;
    }

    const send = (stream: 'stdout' | 'stderr' | 'system', chunk: string) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('command-chunk', { execId, stream, chunk });
      }
    };

    send('system', `$ ${command}\n`);

    // Use a shell so pipes / built-ins work cross-platform
    const child = childProcess.spawn(command, {
      cwd: workspacePath,
      shell: true,
      windowsHide: true,
    });

    activeProcesses.set(execId, child);

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        send('system', '\n⏱️ Превышено время ожидания (180с). Процесс остановлен.\n');
        try {
          if (process.platform === 'win32' && child.pid) {
            childProcess.exec(`taskkill /pid ${child.pid} /t /f`);
          } else {
            child.kill('SIGTERM');
          }
        } catch {}
        // The 'close' handler below will resolve the promise and clean up.
      }
    }, 180000);

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      send('stdout', text);
    });
    child.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      send('stderr', text);
    });
    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeProcesses.delete(execId);
      send('system', `\n❌ Ошибка запуска: ${err.message}\n`);
      resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeProcesses.delete(execId);
      send('system', `\n[Процесс завершён с кодом ${code ?? 0}]\n`);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
});

// Write to terminal process stdin
ipcMain.handle('exec-command-stdin', async (_event, execId: string, text: string) => {
  const child = activeProcesses.get(execId);
  if (child && child.stdin && !child.stdin.destroyed) {
    child.stdin.write(text);
    return true;
  }
  return false;
});

// Kill terminal process
ipcMain.handle('exec-command-kill', async (_event, execId: string) => {
  const child = activeProcesses.get(execId);
  if (child) {
    try {
      if (process.platform === 'win32') {
        childProcess.exec(`taskkill /pid ${child.pid} /t /f`);
      } else {
        child.kill('SIGINT');
      }
      return true;
    } catch (err) {
      console.error('Failed to kill process:', err);
    }
  }
  return false;
});

// MCP IPC Handlers
ipcMain.handle('mcp-reinit', async (_event, serversJson: string) => {
  try {
    const servers = JSON.parse(serversJson);
    await reinitMcpServers(servers);
    return true;
  } catch (err) {
    console.error('mcp-reinit failed:', err);
    return false;
  }
});

ipcMain.handle('mcp-list-tools', async () => {
  const allTools: any[] = [];
  for (const [serverName, client] of activeMcpClients.entries()) {
    if (!client.isReady) continue;
    try {
      const res = await client.request('tools/list', {});
      if (res && res.tools) {
        for (const t of res.tools) {
          allTools.push({
            serverName,
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to list tools from MCP server ${serverName}:`, err);
    }
  }
  return allTools;
});

ipcMain.handle('mcp-call-tool', async (_event, serverName: string, toolName: string, args: any) => {
  const client = activeMcpClients.get(serverName);
  if (!client) {
    throw new Error(`MCP server "${serverName}" is not active or found`);
  }
  try {
    const res = await client.request('tools/call', {
      name: toolName,
      arguments: args,
    });
    return res;
  } catch (err: any) {
    console.error(`Failed to call tool "${toolName}" on server "${serverName}":`, err);
    throw err;
  }
});

// ─── Native core-backend (Rust AST + BM25) IPC ───────────────────────────────
ipcMain.handle('core-status', async () => {
  const engine = await ensureCoreEngine();
  if (!engine) {
    return { available: false, reason: coreEngineFailureReason || 'unavailable' };
  }
  try {
    const status = await engine.status();
    return {
      available: true,
      version: status.version,
      files: status.files,
      docs: status.docs,
      languages: engine.supportedAstLanguages,
    };
  } catch (err: any) {
    return { available: false, reason: err?.message || String(err) };
  }
});

ipcMain.handle('core-parse-ast', async (_event, code: string, ext: string) => {
  const engine = await ensureCoreEngine();
  if (!engine) return null;
  try {
    return await engine.parseAst(code, ext);
  } catch (err: any) {
    console.warn('[core-backend] parse_ast failed:', err?.message || err);
    return null;
  }
});

ipcMain.handle('core-index-file', async (_event, filePath: string, content: string) => {
  const engine = await ensureCoreEngine();
  if (!engine) return null;
  try {
    return await engine.indexFile(filePath, content);
  } catch (err: any) {
    console.warn('[core-backend] index_file failed:', err?.message || err);
    return null;
  }
});

ipcMain.handle('core-index-files', async (_event, files: { file_path: string; content: string }[]) => {
  const engine = await ensureCoreEngine();
  if (!engine) return null;
  try {
    return await engine.indexFiles(files);
  } catch (err: any) {
    console.warn('[core-backend] index_files failed:', err?.message || err);
    return null;
  }
});

ipcMain.handle('core-remove-file', async (_event, filePath: string) => {
  const engine = await ensureCoreEngine();
  if (!engine) return null;
  try {
    return await engine.removeFile(filePath);
  } catch (err: any) {
    console.warn('[core-backend] remove_file failed:', err?.message || err);
    return null;
  }
});

ipcMain.handle('core-search-rag', async (_event, query: string, limit?: number) => {
  const engine = await ensureCoreEngine();
  if (!engine) return null;
  try {
    return await engine.searchRag(query, limit ?? 20);
  } catch (err: any) {
    console.warn('[core-backend] search_rag failed:', err?.message || err);
    return null;
  }
});

ipcMain.handle('core-clear-index', async () => {
  const engine = await ensureCoreEngine();
  if (!engine) return null;
  try {
    return await engine.clearIndex();
  } catch (err: any) {
    console.warn('[core-backend] clear_index failed:', err?.message || err);
    return null;
  }
});

// Check image dimensions and size
ipcMain.handle('check-image-size', async (_event, filePath: string, workspacePath: string) => {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
    const resolvedPath = path.resolve(absolutePath);
    const resolvedWorkspace = path.resolve(workspacePath);
    // Use path.relative for robust containment check (prevents path traversal)
    const rel = path.relative(resolvedWorkspace, resolvedPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Access Denied: Path is outside the sandbox.`);
    }
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    const img = nativeImage.createFromPath(resolvedPath);
    const size = img.getSize();
    const stat = await fs.promises.stat(resolvedPath);
    return {
      width: size.width,
      height: size.height,
      sizeBytes: stat.size
    };
  } catch (err: any) {
    console.error('Error checking image size:', err);
    throw err;
  }
});

// Scan the workspace and list files that are components
ipcMain.handle('list-components', async (_event, workspacePath: string) => {
  try {
    if (!fs.existsSync(workspacePath)) return [];
    const files = await getFilesRecursively(workspacePath, workspacePath);
    const componentFiles = files.filter(f => {
      if (f.isDir) return false;
      const lower = f.path.toLowerCase();
      return (
        lower.includes('/components/') ||
        lower.startsWith('components/') ||
        lower.includes('/ui/') ||
        lower.startsWith('ui/') ||
        lower.endsWith('.jsx') ||
        lower.endsWith('.tsx') ||
        lower.endsWith('.vue') ||
        lower.endsWith('.svelte')
      );
    });
    return componentFiles.map(f => f.path);
  } catch (err: any) {
    console.error('Error listing components:', err);
    throw err;
  }
});

// Open folder in native file manager
ipcMain.handle('open-in-explorer', async (_event, folderPath: string) => {
  try {
    if (folderPath && fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return true;
    }
  } catch (err) {
    console.error('Error opening folder in explorer:', err);
  }
  return false;
});

// Open external URL in user's default browser
ipcMain.handle('open-external', async (_event, url: string) => {
  try {
    if (url && (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:'))) {
      await shell.openExternal(url);
      return true;
    }
  } catch (err) {
    console.error('Error opening external URL:', err);
  }
  return false;
});

// Native confirm dialog
ipcMain.handle('show-confirm', async (_event, message: string, title: string) => {
  if (!mainWindow) return false;
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Отмена', 'OK'],
    defaultId: 1,
    cancelId: 0,
    title: title || 'Подтверждение',
    message: message,
  });
  return result.response === 1;
});

// Show native OS notification
ipcMain.handle('show-notification', async (_event, title: string, body: string) => {
  const iconPath = getTrayIconPath();
  const notif = new Notification({
    title,
    body,
    icon: iconPath ? nativeImage.createFromPath(iconPath) : undefined
  });
  notif.show();
  return true;
});

// External preview window management
let externalPreviewWindow: BrowserWindow | null = null;

ipcMain.handle('open-external-preview', async (_event, html: string) => {
  if (externalPreviewWindow && !externalPreviewWindow.isDestroyed()) {
    externalPreviewWindow.focus();
    return true;
  }

  externalPreviewWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    title: '7/24 IDE - Preview',
    autoHideMenuBar: true,
    backgroundColor: '#FAFAFA',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    }
  });

  const tempDir = app.getPath('userData');
  const tempPath = path.join(tempDir, 'external-preview.html');
  await fs.promises.writeFile(tempPath, html, 'utf-8');
  
  externalPreviewWindow.loadFile(tempPath);
  externalPreviewWindow.on('closed', () => {
    externalPreviewWindow = null;
  });
  return true;
});

ipcMain.handle('update-external-preview', async (_event, html: string) => {
  if (!externalPreviewWindow || externalPreviewWindow.isDestroyed()) {
    return false;
  }
  try {
    const tempDir = app.getPath('userData');
    const tempPath = path.join(tempDir, 'external-preview.html');
    await fs.promises.writeFile(tempPath, html, 'utf-8');
    externalPreviewWindow.reload();
    return true;
  } catch (err) {
    console.error('Failed to update external preview:', err);
    return false;
  }
});

// ═══════════════════════════════════════════
// CUSTOM WINDOW CONTROLS
// ═══════════════════════════════════════════
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

ipcMain.handle('window-is-maximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

app.whenReady().then(() => {
  createWindow();
  setupAutoUpdater();
  // Kick off the native engine in the background — failure is non-fatal,
  // the renderer will use TS fallbacks if it never becomes ready.
  ensureCoreEngine().catch(() => {});

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// ─── Auto-updater (GitHub Releases) ───────────────────────────────────────────
function setupAutoUpdater() {
  // Disable in dev (no published release / no installer to replace)
  if (!app.isPackaged) {
    console.log('[updater] dev build, auto-updater disabled');
    return;
  }
  // Manual control: we want to notify the user before downloading
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Disable signature verification on Windows for self-signed or unsigned setups
  (autoUpdater as any).verifyUpdateCodeSignature = async () => {
    return null;
  };

  const send = (channel: string, payload: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, payload);
    }
  };

  autoUpdater.on('checking-for-update', () => send('updater-status', { type: 'checking' }));
  autoUpdater.on('update-available', (info) => send('updater-status', { type: 'available', version: info.version, releaseNotes: info.releaseNotes }));
  autoUpdater.on('update-not-available', () => send('updater-status', { type: 'none' }));
  autoUpdater.on('error', (err) => send('updater-status', { type: 'error', message: err?.message || String(err) }));
  autoUpdater.on('download-progress', (p) => send('updater-status', { type: 'progress', percent: Math.round(p.percent || 0), bytesPerSecond: p.bytesPerSecond, transferred: p.transferred, total: p.total }));
  autoUpdater.on('update-downloaded', (info) => send('updater-status', { type: 'downloaded', version: info.version }));

  // First check shortly after launch
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(err => console.warn('[updater] check failed:', err?.message || err));
  }, 4000);
  // Recurring check every 6 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(err => console.warn('[updater] check failed:', err?.message || err));
  }, 6 * 60 * 60 * 1000);
}

ipcMain.handle('updater-check', async () => {
  try {
    const r = await autoUpdater.checkForUpdates();
    return r ? { ok: true, version: r.updateInfo.version } : { ok: false };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
});
ipcMain.handle('updater-download', async () => {
  try { await autoUpdater.downloadUpdate(); return { ok: true }; }
  catch (err: any) { return { ok: false, error: err?.message || String(err) }; }
});
ipcMain.handle('updater-install', () => {
  // Closes the app, runs the installer silently, then relaunches
  autoUpdater.quitAndInstall(false, true);
});

app.on('before-quit', () => {
  isQuitting = true;
  for (const client of activeMcpClients.values()) {
    try { client.stop(); } catch {}
  }
  if (coreEngine) {
    try { coreEngine.stop(); } catch {}
    coreEngine = null;
  }
  // Terminate any running terminal child processes so they don't get orphaned.
  for (const [execId, child] of activeProcesses.entries()) {
    try {
      if (process.platform === 'win32' && child.pid) {
        childProcess.exec(`taskkill /pid ${child.pid} /t /f`);
      } else {
        child.kill('SIGTERM');
      }
    } catch (err) {
      console.warn(`[quit] failed to kill process ${execId}:`, err);
    }
  }
  activeProcesses.clear();
});

app.on('window-all-closed', () => {
  if (minimizeToTray) return; // keep running in tray
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

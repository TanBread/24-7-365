import { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, safeStorage } from 'electron';
import { autoUpdater } from 'electron-updater';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';

let mainWindow: BrowserWindow | null = null;

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
    },
  });

  mainWindow.loadFile(path.join(__dirname, '../src/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

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
async function getFilesRecursively(dir: string, baseDir: string): Promise<{ path: string; isDir: boolean; size: number }[]> {
  let files: { path: string; isDir: boolean; size: number }[] = [];
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
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
      try {
        const subFiles = await getFilesRecursively(fullPath, baseDir);
        files = files.concat(subFiles);
      } catch (err) {
        // Skip folders that throw permissions/read errors
      }
    } else {
      try {
        const stat = await fs.promises.stat(fullPath);
        files.push({ path: relativePath, isDir: false, size: stat.size });
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

  if (sandbox && !resolvedPath.startsWith(resolvedWorkspace)) {
    throw new Error(`Access Denied: Path is outside the sandbox: ${resolvedPath}`);
  }

  return await fs.promises.readFile(resolvedPath, 'utf-8');
});

// Write file contents (with optional sandbox check)
ipcMain.handle('write-file', async (_event, filePath: string, content: string, workspacePath: string, sandbox: boolean) => {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
  const resolvedPath = path.resolve(absolutePath);
  const resolvedWorkspace = path.resolve(workspacePath);

  if (sandbox && !resolvedPath.startsWith(resolvedWorkspace)) {
    throw new Error(`Access Denied: Path is outside the sandbox: ${resolvedPath}`);
  }

  // Ensure parent directory exists
  await fs.promises.mkdir(path.dirname(resolvedPath), { recursive: true });
  // Atomic write: write to a sibling temp file and rename — prevents truncated
  // files if the process is interrupted mid-write.
  const tmpPath = `${resolvedPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.promises.writeFile(tmpPath, content, 'utf-8');
    await fs.promises.rename(tmpPath, resolvedPath);
  } catch (err) {
    // Best-effort cleanup of the temp file on failure
    try { if (fs.existsSync(tmpPath)) await fs.promises.unlink(tmpPath); } catch {}
    throw err;
  }
  return true;
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

    childProcess.exec(command, { cwd: workspacePath, timeout: 180000 }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code || 1) : 0,
        stdout: stdout || '',
        stderr: stderr || ''
      });
    });
  });
});

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

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        send('system', '\n⏱️ Превышено время ожидания (180с). Процесс остановлен.\n');
        try { child.kill(); } catch {}
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
      send('system', `\n❌ Ошибка запуска: ${err.message}\n`);
      resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message });
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      send('system', `\n[Процесс завершён с кодом ${code ?? 0}]\n`);
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
});

// Check image dimensions and size
ipcMain.handle('check-image-size', async (_event, filePath: string, workspacePath: string) => {
  try {
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(workspacePath, filePath);
    const resolvedPath = path.resolve(absolutePath);
    const resolvedWorkspace = path.resolve(workspacePath);
    if (!resolvedPath.startsWith(resolvedWorkspace)) {
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

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


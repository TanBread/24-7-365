# Build resources

Files in this folder are used by **electron-builder** when packaging the
installer. They are NOT bundled into the application.

## icon.ico (recommended)
For a polished installer place a Windows icon here:

- File: `build/icon.ico`
- Size: at least **256×256** (multi-size ICO is best: 16, 32, 48, 64, 128, 256).
- After adding the file, uncomment the icon-related lines in
  `package.json` → `build.win.icon` and `build.nsis.installerIcon`,
  `uninstallerIcon`, `installerHeaderIcon`.

If `icon.ico` is missing electron-builder uses a default Electron icon —
the installer still works, just looks generic.

## license.txt
Replace the placeholder with your actual EULA text. Shown by NSIS during
installation.

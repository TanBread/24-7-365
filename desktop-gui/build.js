const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

async function copyDir(src, dest) {
  await fs.promises.mkdir(dest, { recursive: true });
  let entries = await fs.promises.readdir(src, { withFileTypes: true });

  for (let entry of entries) {
    let srcPath = path.join(src, entry.name);
    let destPath = path.join(dest, entry.name);

    entry.isDirectory() ?
      await copyDir(srcPath, destPath) :
      await fs.promises.copyFile(srcPath, destPath);
  }
}

async function build() {
  try {
    // 1. Compile Main Process
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/main.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(__dirname, 'dist/main.js'),
      // electron-updater pulls native deps and is loaded from node_modules at runtime
      external: ['electron', 'electron-updater'],
    });

    // 2. Compile Preload Script
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/preload.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(__dirname, 'dist/preload.js'),
      external: ['electron'],
    });

    // 3. Compile Renderer Process
    await esbuild.build({
      entryPoints: [path.join(__dirname, 'src/renderer.ts')],
      bundle: true,
      platform: 'browser',
      target: 'chrome116',
      outfile: path.join(__dirname, 'dist/renderer.js'),
      loader: {
        '.ttf': 'file',
        '.css': 'css'
      }
    });

    // 4. Copy Monaco Editor AMD
    console.log('Copying Monaco Editor...');
    let monacoDir = path.dirname(require.resolve('monaco-editor/package.json'));
    await copyDir(
      path.join(monacoDir, 'min/vs'),
      path.join(__dirname, 'dist/vs')
    );

    console.log('✓ Electron builds completed successfully.');
  } catch (err) {
    console.error('✗ Build failed:', err);
    process.exit(1);
  }
}

build();

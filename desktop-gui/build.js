const esbuild = require('esbuild');
const path = require('path');

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
    });

    console.log('✓ Electron builds completed successfully.');
  } catch (err) {
    console.error('✗ Build failed:', err);
    process.exit(1);
  }
}

build();

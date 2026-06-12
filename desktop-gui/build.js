const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const tsconfig = require('./tsconfig.json');

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

/**
 * Optionally build the native Rust core-backend and copy the resulting
 * binary into `dist/`. Skipped (with a non-fatal warning) if `cargo` is not
 * on PATH, or if `SKIP_NATIVE=1` is set, or `--skip-native` is passed.
 *
 * Returns the absolute path to the copied binary, or null on skip.
 */
async function buildNativeCore() {
  const skipFlag = process.env.SKIP_NATIVE === '1' || process.argv.includes('--skip-native');
  if (skipFlag) {
    console.log('Native core: SKIP_NATIVE set, skipping cargo build.');
    return null;
  }

  const exe = process.platform === 'win32' ? 'core-backend.exe' : 'core-backend';
  const coreRoot = path.join(__dirname, '..', 'core-backend');
  const manifest = path.join(coreRoot, 'Cargo.toml');
  if (!fs.existsSync(manifest)) {
    console.log('Native core: core-backend/Cargo.toml not found, skipping.');
    return null;
  }

  // Probe for cargo without crashing the build.
  // Note: avoid spawn() with `shell: true` + arg array — that's deprecated in Node 22+.
  // We use `cargo --version` as a single argv-less command instead.
  const probeCmd = process.platform === 'win32' ? 'cargo.exe --version' : 'cargo --version';
  const probe = spawnSync(probeCmd, {
    stdio: 'ignore',
    shell: true,
  });
  if (probe.status !== 0) {
    console.log('Native core: cargo not on PATH, skipping (TS fallback will be used at runtime).');
    return null;
  }

  console.log('Native core: building core-backend (cargo build --release)...');
  // Quote the manifest path for the shell to be safe with spaces.
  const manifestQuoted = JSON.stringify(manifest);
  const buildRes = spawnSync(`cargo build --release --manifest-path ${manifestQuoted}`, {
    stdio: 'inherit',
    shell: true,
  });
  if (buildRes.status !== 0) {
    console.warn('Native core: cargo build failed (exit ' + buildRes.status + '). TS fallback will be used.');
    return null;
  }

  const builtBin = path.join(coreRoot, 'target', 'release', exe);
  if (!fs.existsSync(builtBin)) {
    console.warn('Native core: build succeeded but binary not found at ' + builtBin);
    return null;
  }

  const distBin = path.join(__dirname, 'dist', exe);
  await fs.promises.copyFile(builtBin, distBin);
  console.log('Native core: copied ' + exe + ' to dist/');
  return distBin;
}

async function build() {
  try {
    const common = {
      absWorkingDir: __dirname,
      tsconfigRaw: tsconfig,
    };

    // 1. Compile Main Process
    await esbuild.build({
      ...common,
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
      ...common,
      entryPoints: [path.join(__dirname, 'src/preload.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: path.join(__dirname, 'dist/preload.js'),
      external: ['electron'],
    });

    // 3. Compile Renderer Process
    await esbuild.build({
      ...common,
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

    // 5. (Optional) Build native Rust core-backend
    await buildNativeCore();

    console.log('✓ Electron builds completed successfully.');
  } catch (err) {
    console.error('✗ Build failed:', err);
    process.exit(1);
  }
}

build();

#!/usr/bin/env node
/**
 * Release script for 7/24 IDE
 * 
 * Usage:
 *   node release.js [version]
 * 
 * If no version is provided, reads from package.json.
 * 
 * Steps:
 *   1. Bumps version in package.json (if provided)
 *   2. Builds the app (JS + Rust)
 *   3. Creates portable exe
 *   4. Commits changes
 *   5. Creates git tag
 *   6. Pushes to GitHub
 *   7. Creates GitHub Release with the portable exe
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

const pkgPath = path.join(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

// ─── Parse args ──────────────────────────────────────────────────────────────
const newVersion = process.argv[2];

if (newVersion) {
  // Validate semver-ish
  if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error(`Invalid version: ${newVersion} (expected X.Y.Z)`);
    process.exit(1);
  }
  pkg.version = newVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`✓ Version bumped to ${newVersion}`);
}

const version = pkg.version;
const tag = `v${version}`;
const exeName = `7-24-IDE-Portable-${version}.exe`;
const exePath = path.join(__dirname, '..', 'dist-installer', exeName);

function run(cmd) {
  console.log(`> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: __dirname });
}

// ─── 1. Build ────────────────────────────────────────────────────────────────
console.log('\n═══ Building app ═══');
run('node build.js');

// ─── 2. Build portable exe ───────────────────────────────────────────────────
console.log('\n═══ Building portable exe ═══');
run(`$env:CSC_IDENTITY_AUTO_DISCOVERY="false"; npx electron-builder --win portable --config.win.signAndEditExecutable=false`);

if (!fs.existsSync(exePath)) {
  console.error(`Portable exe not found at ${exePath}`);
  process.exit(1);
}
console.log(`✓ Portable exe: ${exePath} (${(fs.statSync(exePath).size / 1024 / 1024).toFixed(1)} MB)`);

// ─── 3. Git operations ───────────────────────────────────────────────────────
console.log('\n═══ Git commit & tag ═══');
run('git add -A');
try {
  run(`git commit -m "release: ${tag}"`);
} catch (e) {
  console.log('(nothing to commit)');
}
try {
  run(`git tag -d ${tag}`);
} catch (e) {}
run(`git tag ${tag}`);

// ─── 4. Push ─────────────────────────────────────────────────────────────────
console.log('\n═══ Pushing to GitHub ═══');
run('git push origin main --tags');

// ─── 5. Create GitHub Release ────────────────────────────────────────────────
console.log('\n═══ Creating GitHub Release ═══');

async function createRelease() {
  // Try using gh CLI first (simpler)
  try {
    run(`gh release delete ${tag} --yes --cleanup-tag 2>$null`);
  } catch (e) {}

  try {
    run(`gh release create ${tag} "${exePath}" --title "${tag}" --notes "7/24 IDE ${version}" --latest`);
    console.log(`\n✅ Release ${tag} published!`);
    console.log(`   https://github.com/TanBread/27-7-365/releases/tag/${tag}`);
  } catch (e) {
    console.error('Failed to create release via gh CLI. Make sure `gh` is authenticated.');
    console.error('You can create the release manually at:');
    console.error(`  https://github.com/TanBread/27-7-365/releases/new`);
    console.error(`Upload: ${exePath}`);
    process.exit(1);
  }
}

createRelease();

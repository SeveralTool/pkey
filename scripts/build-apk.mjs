/**
 * Build debug APK (Metro / dev-client compatible) and copy to builds/android/.
 * Usage: npm run build:apk  (after prebuild:mobile + expo prebuild if needed)
 *
 * If builds/android/pkey_v{versionCode}.apk already exists, increments
 * expo.version, android.versionCode, package.json, and Gradle defaultConfig
 * so the new APK installs over the previous one instead of overwriting it.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const appJsonPath = path.join(root, 'app.json');
const packageJsonPath = path.join(root, 'package.json');
const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
const outDir = path.join(root, 'builds', 'android');

/**
 * @param {string} version
 * @returns {string}
 */
function bumpPatch(version) {
  const parts = String(version).split('.');
  const last = Number(parts[parts.length - 1]);
  if (!Number.isInteger(last)) {
    throw new Error(`Cannot bump version: ${version}`);
  }
  parts[parts.length - 1] = String(last + 1);
  return parts.join('.');
}

/**
 * @param {string} dir
 * @returns {number[]}
 */
function listNumberedCodes(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const match = entry.isFile() && /^pkey_v(\d+)\.apk$/.exec(entry.name);
    return match ? [Number(match[1])] : [];
  });
}

/**
 * @param {string} filePath
 * @param {unknown} value
 */
function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * @param {string} version
 * @param {number} versionCode
 */
function persistNativeVersion(version, versionCode) {
  if (!fs.existsSync(gradlePath)) return;
  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const next = gradle
    .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
    .replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
  if (next === gradle) {
    console.warn(
      'android/app/build.gradle version fields were not updated; run expo prebuild if the APK version is stale',
    );
    return;
  }
  fs.writeFileSync(gradlePath, next);
}

const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
let version = appJson?.expo?.version || '0.0.0';
let versionCode = appJson?.expo?.android?.versionCode;
const currentCode =
  typeof versionCode === 'number' ? versionCode : Number(String(version).split('.').pop());
if (!Number.isInteger(currentCode) || currentCode < 1) {
  throw new Error('expo.android.versionCode must be a positive integer');
}

fs.mkdirSync(outDir, { recursive: true });
const existingCodes = listNumberedCodes(outDir);
const maxExisting = existingCodes.length > 0 ? Math.max(...existingCodes) : 0;
const numberedPath = (code) => path.join(outDir, `pkey_v${code}.apk`);

if (fs.existsSync(numberedPath(currentCode))) {
  const nextCode = Math.max(currentCode, maxExisting) + 1;
  const nextVersion = bumpPatch(version);
  appJson.expo.version = nextVersion;
  appJson.expo.android = { ...appJson.expo.android, versionCode: nextCode };
  writeJson(appJsonPath, appJson);

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = nextVersion;
  writeJson(packageJsonPath, packageJson);

  persistNativeVersion(nextVersion, nextCode);
  console.log(
    `pkey_v${currentCode}.apk already exists → bumped to ${nextVersion} / versionCode ${nextCode}`,
  );
  version = nextVersion;
  versionCode = nextCode;
} else {
  versionCode = currentCode;
}

execSync('node scripts/ensure-android-sdk.mjs', { stdio: 'inherit', cwd: root });

const isWin = process.platform === 'win32';
const gradle = isWin ? 'gradlew.bat' : './gradlew';
execSync(`${gradle} assembleDebug`, { stdio: 'inherit', cwd: path.join(root, 'android') });

const src = path.join(root, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

const versioned = path.join(outDir, `pkey-${version}-debug.apk`);
const latest = path.join(outDir, 'pkey-debug.apk');
const numbered = numberedPath(versionCode);

fs.copyFileSync(src, versioned);
fs.copyFileSync(src, latest);
fs.copyFileSync(src, numbered);

/** Number of numbered debug APK versions retained locally. */
const MAX_NUMBERED_BUILDS = 3;
const numberedBuilds = listNumberedCodes(outDir)
  .map((code) => ({ path: numberedPath(code), versionCode: code }))
  .sort((a, b) => b.versionCode - a.versionCode);

const removedBuilds = numberedBuilds.slice(MAX_NUMBERED_BUILDS);
for (const build of removedBuilds) {
  fs.rmSync(build.path);
}

const semanticBuilds = fs
  .readdirSync(outDir, { withFileTypes: true })
  .flatMap((entry) => {
    const match = entry.isFile() && /^pkey-(\d+)\.(\d+)\.(\d+)-debug\.apk$/.exec(entry.name);
    return match
      ? [{ path: path.join(outDir, entry.name), version: match.slice(1).map(Number) }]
      : [];
  })
  .sort((a, b) => {
    for (let i = 0; i < a.version.length; i += 1) {
      if (a.version[i] !== b.version[i]) return b.version[i] - a.version[i];
    }
    return 0;
  });

const removedSemanticBuilds = semanticBuilds.slice(MAX_NUMBERED_BUILDS);
for (const build of removedSemanticBuilds) {
  fs.rmSync(build.path);
}

const legacyBuilds = fs
  .readdirSync(outDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /^pkey v\d+\.apk$/.test(entry.name))
  .map((entry) => path.join(outDir, entry.name));
for (const build of legacyBuilds) {
  fs.rmSync(build);
}

const mb = (fs.statSync(numbered).size / (1024 * 1024)).toFixed(2);
console.log(`APK ready (Metro/debug): ${numbered} (${mb} MB)`);
console.log(`Also copied: ${versioned}`);
console.log(`Also copied: ${latest}`);
const removedArtifacts = [
  ...removedBuilds.map((build) => build.path),
  ...removedSemanticBuilds.map((build) => build.path),
  ...legacyBuilds,
];
if (removedArtifacts.length > 0) {
  console.log(`Removed old APKs: ${removedArtifacts.join(', ')}`);
}

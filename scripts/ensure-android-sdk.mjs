/**
 * Ensures android/local.properties exists with sdk.dir for local Gradle builds.
 * Run after `expo prebuild --clean` when ANDROID_HOME is unset.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const candidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk'),
  path.join(os.homedir(), 'Library', 'Android', 'sdk'),
  '/opt/android-sdk',
].filter(Boolean);

const sdkDir = candidates.find((dir) => fs.existsSync(dir));
if (!sdkDir) {
  console.error('Android SDK not found. Install Android Studio or set ANDROID_HOME, then retry.');
  process.exit(1);
}

const androidDir = path.join(process.cwd(), 'android');
const localProps = path.join(androidDir, 'local.properties');
const escaped = sdkDir.replace(/\\/g, '\\\\');
const content = `sdk.dir=${escaped}\n`;

fs.mkdirSync(androidDir, { recursive: true });
fs.writeFileSync(localProps, content, 'utf8');
console.log(`Wrote ${localProps} -> ${sdkDir}`);

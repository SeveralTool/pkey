/**
 * Metro / @expo/cli are tested on Node.js 20 LTS and 22 LTS (see CI).
 * Node 23+ (including current 24.x) can throw ERR_STREAM_UNABLE_TO_PIPE or
 * "Unexpected end of stream" when a dev client downloads the JS bundle.
 */
const version = process.versions.node;
const major = Number.parseInt(version.split('.')[0], 10);

const MIN = 20;
const MAX = 22;

if (Number.isNaN(major) || major < MIN || major > MAX) {
  console.error('');
  console.error('PKey: incompatible Node.js for Metro dev server');
  console.error(`  Current: v${version}`);
  console.error(`  Use:     Node.js ${MIN} or ${MAX} LTS (project CI uses 22)`);
  console.error('');
  console.error('  Windows (nvm-windows):  nvm install 22 && nvm use 22');
  console.error('  macOS/Linux (nvm):      nvm install 22 && nvm use 22');
  console.error('  Then:                   npm ci && npm start');
  console.error('');
  console.error('  See docs/GETTING_STARTED.md — Troubleshooting Metro');
  console.error('');
  process.exit(1);
}

/**
 * Embeds Ionicons SVGs as data URIs for the PWA CardIconView (no CDN).
 * Run: node scripts/generate-preset-icon-uris.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'packages/web-client/src/assets/preset-icons');
const outFile = path.join(root, 'packages/web-client/src/components/presetIconDataUris.ts');

const map = {
  'logo-instagram': 'logo-instagram.svg',
  'logo-tiktok': 'logo-tiktok.svg',
  'logo-facebook': 'logo-facebook.svg',
  'logo-linkedin': 'logo-linkedin.svg',
  'logo-github': 'logo-github.svg',
  'logo-google': 'logo-google.svg',
  'mail-outline': 'mail-outline.svg',
  'bank-outline': 'cash-outline.svg',
  'briefcase-outline': 'briefcase-outline.svg',
  'heart-outline': 'heart-outline.svg',
  'shield-outline': 'shield-outline.svg',
  'game-controller-outline': 'game-controller-outline.svg',
  'finger-print-outline': 'finger-print-outline.svg',
  'link-outline': 'link-outline.svg',
  'globe-outline': 'globe-outline.svg',
  'key-outline': 'key-outline.svg',
};

const out = {};
for (const [key, file] of Object.entries(map)) {
  let svg = fs.readFileSync(path.join(dir, file), 'utf8').trim();
  svg = svg.replace(/currentColor/g, '#87cb28');
  if (!svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  out[key] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const body = `/** Auto-generated local preset icon data URIs (Ionicons). Regenerate: node scripts/generate-preset-icon-uris.mjs */
export const PRESET_ICON_DATA_URIS: Record<string, string> = ${JSON.stringify(out, null, 2)};

export function presetIconDataUri(name: string): string | undefined {
  return PRESET_ICON_DATA_URIS[name];
}
`;

fs.writeFileSync(outFile, body);
console.log(`Wrote ${Object.keys(out).length} icons → ${outFile}`);

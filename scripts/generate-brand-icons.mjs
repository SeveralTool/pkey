#!/usr/bin/env node
/**
 * Generates launcher, splash, PWA, and notification assets from the canonical v6 master.
 * Master (`assets/logo/v6/v6.png`) is never overwritten.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const masterPath = join(root, 'assets/logo/v6/v6.png');

const OPAQUE_BLACK = { r: 0, g: 0, b: 0, alpha: 1 };
const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

const out = {
  icon: join(root, 'assets/images/icon.png'),
  adaptive: join(root, 'assets/images/adaptive-icon.png'),
  iosIcon: join(root, 'assets/AppIcon.icon/Assets/icon.png'),
  favicon: join(root, 'assets/images/favicon.png'),
  splash: join(root, 'assets/images/splash-icon.png'),
  brand: join(root, 'assets/images/brand-logo.png'),
  notification: join(root, 'assets/images/notification-icon.png'),
  monochrome: join(root, 'assets/images/adaptive-icon-monochrome.png'),
  webPublic: join(root, 'packages/web-client/public'),
  webBrand: join(root, 'packages/web-client/src/assets/brand-logo.png'),
};

mkdirSync(out.webPublic, { recursive: true });
mkdirSync(dirname(out.webBrand), { recursive: true });
mkdirSync(dirname(out.iosIcon), { recursive: true });

/**
 * Centers the master art at `innerRatio` of a square canvas.
 * @param {number} size Canvas edge in px
 * @param {number} innerRatio Fraction of the canvas occupied by the art (1 = full bleed)
 * @param {{ r: number, g: number, b: number, alpha: number }} bg
 * @returns {Promise<Buffer>}
 */
async function padIntoCanvas(size, innerRatio, bg) {
  const inner = Math.max(1, Math.round(size * innerRatio));
  const resized = await sharp(masterPath)
    .resize(inner, inner, { fit: 'contain', background: TRANSPARENT })
    .png()
    .toBuffer();
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: resized, gravity: 'centre' }])
    .png()
    .toBuffer();
}

/** PNG-in-ICO container so `/favicon.ico` stays a real ICO. */
function pngToIco(pngBuf, edge) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry.writeUInt8(edge >= 256 ? 0 : edge, 0);
  entry.writeUInt8(edge >= 256 ? 0 : edge, 1);
  entry.writeUInt16LE(0, 2);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(pngBuf.length, 8);
  entry.writeUInt32LE(22, 12);
  return Buffer.concat([header, entry, pngBuf]);
}

/** White silhouette for Android notification tray (green channel → alpha). */
async function whiteSilhouette(pngBuf) {
  const { data, info } = await sharp(pngBuf)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const outPixels = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    const greenScore = Math.max(0, g - Math.max(r, b) * 0.6);
    const lum = (r + g + b) / 3;
    const onIcon = a > 20 && (greenScore > 40 || (lum > 30 && lum < 200 && g > r));
    const alpha = onIcon ? Math.min(255, Math.round(greenScore * 2.5 + lum * 0.3)) : 0;
    outPixels[i * 4] = 255;
    outPixels[i * 4 + 1] = 255;
    outPixels[i * 4 + 2] = 255;
    outPixels[i * 4 + 3] = alpha > 40 ? Math.min(255, alpha) : 0;
  }

  return sharp(outPixels, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png()
    .toBuffer();
}

const iconPng = await padIntoCanvas(1024, 0.56, OPAQUE_BLACK);
await sharp(iconPng).toFile(out.icon);

const adaptivePng = await padIntoCanvas(1024, 0.47, TRANSPARENT);
await sharp(adaptivePng).toFile(out.adaptive);

const iosPng = await padIntoCanvas(1024, 0.56, OPAQUE_BLACK);
await sharp(iosPng).toFile(out.iosIcon);

const faviconPng = await padIntoCanvas(48, 1, OPAQUE_BLACK);
await sharp(faviconPng).toFile(out.favicon);

const splashPng = await padIntoCanvas(400, 1, OPAQUE_BLACK);
await sharp(splashPng).toFile(out.splash);

const brandPng = await padIntoCanvas(400, 1, TRANSPARENT);
await sharp(brandPng).toFile(out.brand);
await sharp(brandPng).toFile(out.webBrand);
await sharp(brandPng).toFile(join(out.webPublic, 'brand-logo.png'));

const notifPadded = await padIntoCanvas(96, 0.48, TRANSPARENT);
const notifPng = await whiteSilhouette(notifPadded);
await sharp(notifPng).toFile(out.notification);

const monoPadded = await padIntoCanvas(1024, 0.47, TRANSPARENT);
const monoPng = await whiteSilhouette(monoPadded);
await sharp(monoPng).toFile(out.monochrome);

const pwa192 = await padIntoCanvas(192, 1, OPAQUE_BLACK);
await sharp(pwa192).toFile(join(out.webPublic, 'pwa-192.png'));

const pwa512 = await padIntoCanvas(512, 1, OPAQUE_BLACK);
await sharp(pwa512).toFile(join(out.webPublic, 'pwa-512.png'));

const pwaMaskable = await padIntoCanvas(512, 0.8, OPAQUE_BLACK);
await sharp(pwaMaskable).toFile(join(out.webPublic, 'pwa-512-maskable.png'));

const appleTouch = await padIntoCanvas(180, 0.8, OPAQUE_BLACK);
await sharp(appleTouch).toFile(join(out.webPublic, 'apple-touch-icon.png'));

for (const size of [16, 32, 48]) {
  const fav = await padIntoCanvas(size, 1, OPAQUE_BLACK);
  await sharp(fav).toFile(join(out.webPublic, `favicon-${size}.png`));
}

const icoPng = await padIntoCanvas(32, 1, OPAQUE_BLACK);
writeFileSync(join(out.webPublic, 'favicon.ico'), pngToIco(icoPng, 32));

console.log('Generated brand icons from', masterPath);

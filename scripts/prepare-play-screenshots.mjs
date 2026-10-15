/**
 * Play Store screenshots from originals in assets/app_screenshots/.
 * Writes only under assets/app_screenshots/app_screenshots_store/. Never deletes originals.
 * Run: npm run screenshots:play
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const SRC_DIR = join(root, 'assets', 'app_screenshots');
const OUT_DIR = join(SRC_DIR, 'app_screenshots_store');

const PHONE_W = 1080;
const PHONE_H = 2340;
const DESKTOP_W = 1920;
const DESKTOP_H = 1080;

/** App chrome behind the Android status bar (sampled from the captures). */
const CHROME = { r: 240, g: 242, b: 245 };
const ICON = '#1C1C1E';

/**
 * Covers notification icons and the punch-hole at source 1440×3120.
 * Search / cards start around y=160; status glyphs live in y=43–93.
 */
const STATUS_BAR_H = 112;

const PHONE_JOBS = [
  {
    src: 'Screenshot_20261001_181612_PKEY[1].png',
    dest: '01-keys-list.png',
  },
  {
    src: 'Screenshot_20261001_180518_PKEY[1].png',
    dest: '02-keys-grouped-google.png',
  },
  {
    src: 'Screenshot_20260929_190321_PKEY[1].png',
    dest: '03-vault-health.png',
  },
  {
    src: 'Screenshot_20260929_190350_PKEY[1].png',
    dest: '04-web-lan.png',
  },
  {
    src: 'Screenshot_20260929_190427_PKEY[1].png',
    dest: '05-settings-lock.png',
  },
];

const DESKTOP_JOBS = [
  {
    src: 'dasdad.png',
    dest: '01-pwa-keys-and-health.png',
    /** Keep the right edge (FAB); left margin is empty. */
    crop: 'keepRight',
  },
  {
    src: 'image.png',
    dest: '02-pwa-unlock.png',
    /** Unlock card is centered; crop both sides. */
    crop: 'center',
    /** Hide the leftover session-id fragment after the 16:9 crop. */
    scrubBottomLeft: { width: 200, height: 24 },
  },
];

/**
 * Drop Android bytes after IEND so decoders (and Play) see a well-formed PNG.
 * @param {Buffer} buf
 * @returns {Buffer}
 */
export function stripPngTrailer(buf) {
  const marker = Buffer.from('IEND');
  const iend = buf.indexOf(marker);
  if (iend < 0) return buf;
  return buf.subarray(0, iend + 8);
}

/**
 * Full-width status bar: time, full cell/Wi-Fi/battery, no notifications or notch.
 * Built as a raster canvas so the overlay size is exact for sharp.composite.
 * @param {number} width
 * @param {number} height
 * @returns {Promise<Buffer>}
 */
async function buildStatusBar(width, height) {
  const pad = Math.round(width * 0.045);
  const timeSize = Math.round(height * 0.38);
  const iconH = Math.round(height * 0.42);
  const timeW = Math.round(timeSize * 3.4);
  const timeH = Math.round(height * 0.7);
  const timeSvg = Buffer.from(
    `<svg width="${timeW}" height="${timeH}" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="${Math.round(timeH * 0.78)}" font-family="Arial, Helvetica, sans-serif"
        font-size="${timeSize}" font-weight="600" fill="${ICON}">12:00</text>
    </svg>`
  );
  const iconsW = Math.round(iconH * 5.2);
  const iconsH = Math.round(height * 0.7);
  const iconsSvg = Buffer.from(
    `<svg width="${iconsW}" height="${iconsH}" xmlns="http://www.w3.org/2000/svg">
      <g fill="${ICON}">
        <rect x="${iconH * 0.05}" y="${iconsH * 0.58}" width="${iconH * 0.16}" height="${iconH * 0.22}" rx="1"/>
        <rect x="${iconH * 0.28}" y="${iconsH * 0.46}" width="${iconH * 0.16}" height="${iconH * 0.34}" rx="1"/>
        <rect x="${iconH * 0.51}" y="${iconsH * 0.34}" width="${iconH * 0.16}" height="${iconH * 0.46}" rx="1"/>
        <rect x="${iconH * 0.74}" y="${iconsH * 0.22}" width="${iconH * 0.16}" height="${iconH * 0.58}" rx="1"/>
      </g>
      <g fill="none" stroke="${ICON}" stroke-width="${Math.max(2, iconH * 0.1)}" stroke-linecap="round">
        <path d="M ${iconH * 1.2} ${iconsH * 0.38} a ${iconH * 0.55} ${iconH * 0.55} 0 0 1 ${iconH * 0.9} 0"/>
        <path d="M ${iconH * 1.35} ${iconsH * 0.52} a ${iconH * 0.32} ${iconH * 0.32} 0 0 1 ${iconH * 0.6} 0"/>
      </g>
      <circle cx="${iconH * 1.65}" cy="${iconsH * 0.72}" r="${iconH * 0.07}" fill="${ICON}"/>
      <rect x="${iconH * 2.3}" y="${iconsH * 0.28}" width="${iconH * 1.55}" height="${iconH * 0.55}"
        rx="${iconH * 0.12}" fill="none" stroke="${ICON}" stroke-width="${Math.max(2, iconH * 0.08)}"/>
      <rect x="${iconH * 3.85}" y="${iconsH * 0.4}" width="${iconH * 0.14}" height="${iconH * 0.3}" rx="1" fill="${ICON}"/>
      <rect x="${iconH * 2.4}" y="${iconsH * 0.36}" width="${iconH * 1.35}" height="${iconH * 0.38}"
        rx="${iconH * 0.08}" fill="${ICON}"/>
    </svg>`
  );

  const timePng = await sharp(timeSvg).resize(timeW, timeH).png().toBuffer();
  const iconsPng = await sharp(iconsSvg).resize(iconsW, iconsH).png().toBuffer();
  const iconTop = Math.round((height - iconsH) / 2);
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: CHROME,
    },
  })
    .composite([
      { input: timePng, left: pad, top: iconTop },
      { input: iconsPng, left: width - pad - iconsW, top: iconTop },
    ])
    .png()
    .toBuffer();
}

/**
 * @param {string} srcName
 * @param {string} destName
 */
async function writePhone(srcName, destName) {
  const png = stripPngTrailer(readFileSync(join(SRC_DIR, srcName)));
  const resized = await sharp(png)
    .resize(PHONE_W, PHONE_H, { fit: 'fill' })
    .flatten({ background: CHROME })
    .removeAlpha()
    .png()
    .toBuffer();
  const barH = Math.round((STATUS_BAR_H * PHONE_W) / 1440);
  const bar = await buildStatusBar(PHONE_W, barH);
  const outPath = join(OUT_DIR, 'phone', destName);
  await sharp(resized)
    .composite([{ input: bar, left: 0, top: 0 }])
    .flatten({ background: CHROME })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return outPath;
}

/**
 * PWA capture is ~2:1. Crop to 16:9 then scale to 1920×1080, 24-bit, no alpha.
 * @param {object} job
 * @param {string} job.src
 * @param {string} job.dest
 * @param {'keepRight' | 'center'} [job.crop]
 * @param {{ width: number, height: number }} [job.scrubBottomLeft]
 */
async function writeDesktop(job) {
  const png = stripPngTrailer(readFileSync(join(SRC_DIR, job.src)));
  const meta = await sharp(png).metadata();
  const width = meta.width ?? DESKTOP_W;
  const height = meta.height ?? DESKTOP_H;
  const targetW = Math.round((height * 16) / 9);
  const extractW = Math.min(width, targetW);
  const spare = Math.max(0, width - extractW);
  const left = job.crop === 'keepRight' ? spare : Math.floor(spare / 2);
  const outPath = join(OUT_DIR, 'desktop', job.dest);
  const cropped = await sharp(png)
    .extract({ left, top: 0, width: extractW, height })
    .resize(DESKTOP_W, DESKTOP_H, { fit: 'fill' })
    .flatten({ background: CHROME })
    .removeAlpha()
    .png()
    .toBuffer();

  const composites = [];
  if (job.scrubBottomLeft) {
    const patch = await sharp({
      create: {
        width: job.scrubBottomLeft.width,
        height: job.scrubBottomLeft.height,
        channels: 3,
        background: CHROME,
      },
    })
      .png()
      .toBuffer();
    composites.push({
      input: patch,
      left: 0,
      top: DESKTOP_H - job.scrubBottomLeft.height - 12,
    });
  }

  let pipeline = sharp(cropped);
  if (composites.length > 0) {
    pipeline = pipeline.composite(composites);
  }
  await pipeline
    .flatten({ background: CHROME })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  return outPath;
}

const TABLET_README = `# Tablet screenshots

Empty on purpose. Play Console 7" / 10" slots need the **real Android tablet UI**
(minimum 4 shots, 9:16 or 16:9, 1080–7680 px, 24-bit PNG or JPEG, no alpha).

Phone captures in \`../phone/\` must not be stretched or letterboxed into these
slots. Do not upload until a tablet has been checked in portrait.

See \`docs/store/PLAY_LISTING.md\`.
`;

/**
 * Regenerates store-ready phone + desktop PNGs. Leaves originals untouched.
 */
export async function preparePlayScreenshots() {
  mkdirSync(join(OUT_DIR, 'phone'), { recursive: true });
  mkdirSync(join(OUT_DIR, 'tablet'), { recursive: true });
  mkdirSync(join(OUT_DIR, 'desktop'), { recursive: true });
  writeFileSync(join(OUT_DIR, 'tablet', 'README.md'), TABLET_README, 'utf8');

  const written = [];
  for (const job of PHONE_JOBS) {
    written.push(await writePhone(job.src, job.dest));
  }
  for (const job of DESKTOP_JOBS) {
    written.push(await writeDesktop(job));
  }
  return written;
}

const isDirectRun =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const paths = await preparePlayScreenshots();
  for (const p of paths) {
    const meta = await sharp(p).metadata();
    const alpha = meta.hasAlpha ? 'ALPHA' : 'rgb';
    console.log(`${p}  ${meta.width}x${meta.height}  ${alpha}  ${meta.size ?? ''}`.trim());
  }
}

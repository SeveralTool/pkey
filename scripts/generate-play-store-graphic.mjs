/**
 * Play Store feature graphic 1024×500, opaque black (Play rejects alpha).
 * Run: node scripts/generate-play-store-graphic.mjs
 */
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const masterPath = join(root, 'assets/logo/v6/v6.png');
const outPath = join(root, 'assets/logo/v6/all formats/play-store/play_store_feature_graphic.png');

const WIDTH = 1024;
const HEIGHT = 500;
const ICON_BOX = 268;
const CORNER = 60;
const LOGO_INNER = Math.round(ICON_BOX * 0.62);
const GAP = 44;
const WORD_W = 430;
const WORD_H = 168;

/**
 * Builds the store banner: white squircle + v6 mark + white PKEY on black.
 */
export async function generatePlayStoreFeatureGraphic() {
  mkdirSync(dirname(outPath), { recursive: true });

  const logo = await sharp(masterPath)
    .resize(LOGO_INNER, LOGO_INNER, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  const squircle = Buffer.from(
    `<svg width="${ICON_BOX}" height="${ICON_BOX}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${ICON_BOX}" height="${ICON_BOX}" rx="${CORNER}" ry="${CORNER}" fill="#ffffff"/>
    </svg>`
  );

  const appIcon = await sharp(squircle)
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toBuffer();

  const wordmark = Buffer.from(
    `<svg width="${WORD_W}" height="${WORD_H}" xmlns="http://www.w3.org/2000/svg">
      <text x="8" y="118" font-family="Arial, Helvetica, sans-serif" font-size="108"
        font-weight="700" fill="#ffffff" letter-spacing="6">PKEY</text>
    </svg>`
  );

  const total = ICON_BOX + GAP + WORD_W;
  const left = Math.round((WIDTH - total) / 2);
  const iconTop = Math.round((HEIGHT - ICON_BOX) / 2);
  const textTop = Math.round((HEIGHT - WORD_H) / 2) + 6;

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .composite([
      { input: appIcon, left, top: iconTop },
      { input: await sharp(wordmark).png().toBuffer(), left: left + ICON_BOX + GAP, top: textTop },
    ])
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  return outPath;
}

const isDirectRun =
  Boolean(process.argv[1]) && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  const path = await generatePlayStoreFeatureGraphic();
  console.log('Wrote', path);
}

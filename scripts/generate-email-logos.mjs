import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';

const SVG_PATH = 'public/logo-dark.svg';
const OUT_DIR = 'public';
const TARGET_SIZE = 480;

async function main() {
  const sourceSvg = readFileSync(SVG_PATH, 'utf8');

  // Light version (light email backgrounds): dark mark on transparent
  await sharp(Buffer.from(sourceSvg))
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, 'logo-email-light.png'));

  // Dark version (dark email backgrounds): invert #111111 -> #FFFFFF
  const inverted = sourceSvg.replace(/fill="#111111"/gi, 'fill="#FFFFFF"');

  await sharp(Buffer.from(inverted))
    .resize(TARGET_SIZE, TARGET_SIZE, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, 'logo-email-dark.png'));

  console.log('Generated:');
  console.log('  public/logo-email-light.png (dark mark, for light email bg)');
  console.log('  public/logo-email-dark.png  (white mark, for dark email bg)');
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});

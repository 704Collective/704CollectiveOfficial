import sharp from "sharp";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";

const OUTPUT_DIR = "supabase/functions/generate-apple-wallet-pass/assets";
const SOURCE_LOGO_PATH = "public/logo-email-dark.png"; // White 704 mark on transparent

async function main() {
  if (!existsSync(OUTPUT_DIR)) {
    await mkdir(OUTPUT_DIR, { recursive: true });
    console.log(`Created ${OUTPUT_DIR}`);
  }

  if (!existsSync(SOURCE_LOGO_PATH)) {
    console.error(`Source logo not found at ${SOURCE_LOGO_PATH}`);
    process.exit(1);
  }

  const source = await readFile(SOURCE_LOGO_PATH);

  // ICONS - square, just the 704 mark (use the dark variant which is white on transparent)
  const iconSpecs = [
    { name: "icon.png", size: 29 },
    { name: "icon@2x.png", size: 58 },
    { name: "icon@3x.png", size: 87 },
  ];

  for (const spec of iconSpecs) {
    const buffer = await sharp(source)
      .resize(spec.size, spec.size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await writeFile(`${OUTPUT_DIR}/${spec.name}`, buffer);
    console.log(`Wrote ${spec.name} (${spec.size}x${spec.size}, ${buffer.length} bytes)`);
  }

  // LOGOS - horizontal banner shape. Apple expects max 160x50pt area, so the logo
  // should be centered within that aspect ratio with padding. The square source
  // image will be letterboxed transparently.
  const logoSpecs = [
    { name: "logo.png", width: 160, height: 50 },
    { name: "logo@2x.png", width: 320, height: 100 },
  ];

  for (const spec of logoSpecs) {
    const buffer = await sharp(source)
      .resize(spec.width, spec.height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await writeFile(`${OUTPUT_DIR}/${spec.name}`, buffer);
    console.log(`Wrote ${spec.name} (${spec.width}x${spec.height}, ${buffer.length} bytes)`);
  }

  console.log("\nDone. All 5 assets generated.");
}

main().catch((err) => {
  console.error("Asset generation failed:", err);
  process.exit(1);
});

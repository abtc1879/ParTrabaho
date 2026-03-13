import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const rootDir = process.cwd();
const outputDir = path.join(rootDir, "public", "brand");

const assets = [
  {
    input: path.join(rootDir, "src", "assets", "partrabaho-mark.svg"),
    baseName: "partrabaho-mark",
    sizes: [
      { width: 1024, height: 1024 },
      { width: 2048, height: 2048 },
      { width: 4096, height: 4096 }
    ]
  },
  {
    input: path.join(rootDir, "src", "assets", "partrabaho-logo.svg"),
    baseName: "partrabaho-logo",
    sizes: [
      { width: 2048, height: 501 },
      { width: 4096, height: 1002 }
    ]
  }
];

await fs.mkdir(outputDir, { recursive: true });

for (const asset of assets) {
  const inputBuffer = await fs.readFile(asset.input);
  for (const size of asset.sizes) {
    const outputPath = path.join(outputDir, `${asset.baseName}-${size.width}.png`);
    await sharp(inputBuffer, { density: 1200 })
      .resize({
        width: size.width,
        height: size.height,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 9, quality: 100 })
      .toFile(outputPath);

    console.log(`Generated: ${path.relative(rootDir, outputPath)}`);
  }
}


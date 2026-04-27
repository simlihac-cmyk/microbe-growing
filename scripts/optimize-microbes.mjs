import { mkdir, readdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const sourceDir = join(rootDir, "assets", "microbes-source");
const fallbackDir = join(rootDir, "public", "microbes");
const outputDir = join(rootDir, "public", "microbes-optimized");
const widths = [512, 1024];
const cropPadding = 24;

await rm(fallbackDir, { recursive: true, force: true });
await rm(outputDir, { recursive: true, force: true });
await mkdir(fallbackDir, { recursive: true });
await mkdir(outputDir, { recursive: true });

const files = (await readdir(sourceDir))
  .filter((file) => /^\d+\.png$/.test(file))
  .sort((left, right) => Number.parseInt(left, 10) - Number.parseInt(right, 10));

let originalBytes = 0;
let fallbackBytes = 0;
let optimizedBytes = 0;

for (const file of files) {
  const level = basename(file, ".png");
  const inputPath = join(sourceDir, file);
  const sourceStats = await stat(inputPath);
  originalBytes += sourceStats.size;

  const croppedPng = await removeConnectedWhiteBackground(inputPath);
  const fallbackPath = join(fallbackDir, file);

  await sharp(croppedPng)
    .resize({ width: 1024, withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10 })
    .toFile(fallbackPath);
  fallbackBytes += (await stat(fallbackPath)).size;

  for (const width of widths) {
    const base = join(outputDir, `${level}-${width}`);
    const webpPath = `${base}.webp`;
    const avifPath = `${base}.avif`;

    await sharp(croppedPng)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82, effort: 6, smartSubsample: true })
      .toFile(webpPath);

    await sharp(croppedPng)
      .resize({ width, withoutEnlargement: true })
      .avif({ quality: 54, effort: 5 })
      .toFile(avifPath);

    optimizedBytes += (await stat(webpPath)).size + (await stat(avifPath)).size;
  }

  console.log(`optimized microbe ${level}`);
}

console.log(
  `microbes optimized: ${formatBytes(originalBytes)} source -> ${formatBytes(fallbackBytes)} PNG fallback + ${formatBytes(optimizedBytes)} AVIF/WebP srcsets`,
);

async function removeConnectedWhiteBackground(inputPath) {
  const { data, info } = await sharp(inputPath)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const tryQueue = (index) => {
    if (visited[index] || !isBackgroundPixel(data, index, channels)) return;
    visited[index] = 1;
    queue[tail] = index;
    tail += 1;
  };

  for (let x = 0; x < width; x += 1) {
    tryQueue(x);
    tryQueue((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    tryQueue(y * width);
    tryQueue(y * width + width - 1);
  }

  while (head < tail) {
    const index = queue[head];
    head += 1;
    data[index * channels + 3] = 0;

    const x = index % width;
    const y = Math.floor(index / width);
    if (x > 0) tryQueue(index - 1);
    if (x < width - 1) tryQueue(index + 1);
    if (y > 0) tryQueue(index - width);
    if (y < height - 1) tryQueue(index + width);
  }

  const bounds = getOpaqueBounds(data, width, height, channels);
  if (!bounds) {
    throw new Error(`No visible pixels left after trimming ${inputPath}`);
  }

  const left = Math.max(0, bounds.left - cropPadding);
  const top = Math.max(0, bounds.top - cropPadding);
  const right = Math.min(width - 1, bounds.right + cropPadding);
  const bottom = Math.min(height - 1, bounds.bottom + cropPadding);

  return sharp(data, { raw: { width, height, channels } })
    .extract({
      left,
      top,
      width: right - left + 1,
      height: bottom - top + 1,
    })
    .png()
    .toBuffer();
}

function isBackgroundPixel(data, index, channels) {
  const offset = index * channels;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  const alpha = data[offset + 3];
  const brightest = Math.max(red, green, blue);
  const darkest = Math.min(red, green, blue);

  return alpha === 0 || (red >= 205 && green >= 205 && blue >= 205 && brightest - darkest <= 70);
}

function getOpaqueBounds(data, width, height, channels) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = data[(y * width + x) * channels + 3];
      if (alpha === 0) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  return right >= left && bottom >= top ? { left, top, right, bottom } : null;
}

function formatBytes(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

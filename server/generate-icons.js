import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ (-1)) >>> 0;
}

export function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, "ascii");
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = zlib.crc32 ? zlib.crc32(typeAndData) : crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

export function verifyPng(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (buffer.length < 8) {
    throw new Error("Buffer too short to be a PNG");
  }
  for (let i = 0; i < 8; i++) {
    if (buffer[i] !== signature[i]) {
      throw new Error(`Invalid PNG signature at byte ${i}: expected ${signature[i]}, got ${buffer[i]}`);
    }
  }
  let offset = 8;
  while (offset < buffer.length) {
    if (offset + 12 > buffer.length) {
      throw new Error(`Truncated PNG chunk header at offset ${offset}`);
    }
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    if (offset + 12 + length > buffer.length) {
      throw new Error(`Truncated PNG chunk data for ${type} at offset ${offset}`);
    }
    const dataAndType = buffer.subarray(offset + 4, offset + 8 + length);
    const expectedCrc = buffer.readUInt32BE(offset + 8 + length);
    const actualCrc = (zlib.crc32 ? zlib.crc32(dataAndType) : crc32(dataAndType)) >>> 0;
    if (expectedCrc !== actualCrc) {
      throw new Error(`CRC mismatch in chunk ${type}: expected ${expectedCrc}, got ${actualCrc}`);
    }
    offset += 12 + length;
  }
  return true;
}

export function createPng(width, height) {
  // Correct PNG signature: 137, 80, 78, 71, 13, 10, 26, 10
  const header = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8 bits per channel
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdr = makeChunk("IHDR", ihdrData);

  // Generate raw RGBA image data with row filter byte (0)
  const rowLength = 1 + width * 4;
  const rawData = Buffer.alloc(rowLength * height);

  const cx = width / 2;
  const cy = height / 2;
  const r = width * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowLength;
    rawData[rowOffset] = 0; // Filter byte: None

    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Rounded squircle / circular badge
      if (dist <= r) {
        // Gradient from vibrant blue (#2563eb) to deep indigo (#1d4ed8)
        const t = (x + y) / (width + height);
        const rColor = Math.round(37 * (1 - t) + 29 * t);
        const gColor = Math.round(99 * (1 - t) + 78 * t);
        const bColor = Math.round(235 * (1 - t) + 216 * t);

        // Draw an inner academic "E" or star symbol
        const relX = dx / r;
        const relY = dy / r;

        // Diamond / spark icon in center
        const diamondDist = Math.abs(relX) + Math.abs(relY);
        if (diamondDist < 0.48) {
          // Bright white / cyan spark
          rawData[pxOffset] = 255;
          rawData[pxOffset + 1] = 255;
          rawData[pxOffset + 2] = 255;
          rawData[pxOffset + 3] = 255;
        } else {
          rawData[pxOffset] = rColor;
          rawData[pxOffset + 1] = gColor;
          rawData[pxOffset + 2] = bColor;
          rawData[pxOffset + 3] = 255;
        }
      } else {
        // Transparent outside
        rawData[pxOffset] = 0;
        rawData[pxOffset + 1] = 0;
        rawData[pxOffset + 2] = 0;
        rawData[pxOffset + 3] = 0;
      }
    }
  }

  const compressedData = zlib.deflateSync(rawData);
  const idat = makeChunk("IDAT", compressedData);
  const iend = makeChunk("IEND", Buffer.alloc(0));

  const png = Buffer.concat([header, ihdr, idat, iend]);
  verifyPng(png);
  return png;
}

export function generateIcons(targetDir) {
  const iconsDir = targetDir || path.resolve(__dirname, "../extension/icons");
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  const generated = [];
  [16, 48, 128].forEach(size => {
    const buf = createPng(size, size);
    const dest = path.join(iconsDir, `icon-${size}.png`);
    fs.writeFileSync(dest, buf);
    generated.push({ size, dest, bytes: buf.length });
    console.log(`Generated icon: ${dest} (${size}x${size}, ${buf.length} bytes)`);
  });
  return generated;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  generateIcons();
}

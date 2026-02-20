#!/usr/bin/env node
/**
 * Generate .icns app icon from the radar icon renderer.
 *
 * Reuses the PNG builder from createIcon.js to render the radar at every
 * size required by iconutil, writes them to build/icon.iconset/, then
 * shells out to `iconutil -c icns` (ships with macOS).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const zlib = require('zlib');

// ── CRC32 (copied from createIcon.js — no Electron dependency) ──────────

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ── PNG builder (copied from createIcon.js — no Electron dependency) ─────

function buildPNG(width, height, pixels) {
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(td), 0);
    return Buffer.concat([len, td, crcBuf]);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowSize = 1 + width * 4;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter: None
    pixels.copy(raw, y * rowSize + 1, y * width * 4, (y + 1) * width * 4);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Radar renderer (adapted from createIcon.js for arbitrary sizes) ──────

function renderRadarIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;
  const scale = size / 22; // original icon is 22px

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy) / scale;
      const idx = (y * size + x) * 4;

      let alpha = 0;

      // Concentric rings
      if (Math.abs(dist - 9.5) < 0.7) alpha = 180;
      if (Math.abs(dist - 6.5) < 0.6) alpha = 140;
      if (Math.abs(dist - 3.5) < 0.5) alpha = 120;

      // Center dot
      if (dist < 1.8) alpha = 220;

      // Sweep line (pointing upper-right)
      const angle = Math.atan2(dy, dx);
      if (angle > -1.2 && angle < -0.4 && dist > 1.8 && dist < 10) {
        alpha = Math.max(alpha, 200);
      }

      // Full-color icon for .icns (not a template image)
      // Use a dark background with green/cyan radar tones
      if (alpha > 0) {
        buf[idx] = 0;       // R
        buf[idx + 1] = 200; // G
        buf[idx + 2] = 160; // B
        buf[idx + 3] = alpha;
      }
    }
  }

  return buildPNG(size, size, buf);
}

// ── Main ─────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, '..');
const ICONSET = path.join(ROOT, 'build', 'icon.iconset');
const ICNS = path.join(ROOT, 'build', 'icon.icns');

// Required sizes for iconutil: name → pixel size
const SIZES = {
  'icon_16x16.png':        16,
  'icon_16x16@2x.png':     32,
  'icon_32x32.png':        32,
  'icon_32x32@2x.png':     64,
  'icon_128x128.png':      128,
  'icon_128x128@2x.png':   256,
  'icon_256x256.png':      256,
  'icon_256x256@2x.png':   512,
  'icon_512x512.png':      512,
  'icon_512x512@2x.png':   1024,
};

fs.mkdirSync(ICONSET, { recursive: true });

for (const [name, px] of Object.entries(SIZES)) {
  const png = renderRadarIcon(px);
  fs.writeFileSync(path.join(ICONSET, name), png);
  console.log(`  ${name} (${px}×${px})`);
}

console.log('Running iconutil...');
execSync(`iconutil -c icns "${ICONSET}" -o "${ICNS}"`);
console.log(`Icon written to ${ICNS}`);

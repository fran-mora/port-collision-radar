const { nativeImage } = require('electron');
const zlib = require('zlib');

// Pre-compute CRC32 lookup table
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

// Cache icons so we don't regenerate on every scan
let cachedNormal = null;
let cachedCollision = null;

function createTrayIcon(hasCollision) {
  if (hasCollision && cachedCollision) return cachedCollision;
  if (!hasCollision && cachedNormal) return cachedNormal;

  const size = 22;
  const buf = Buffer.alloc(size * size * 4);
  const cx = size / 2, cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
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

      // Template images: black pixels with varying alpha
      buf[idx] = 0;
      buf[idx + 1] = 0;
      buf[idx + 2] = 0;
      buf[idx + 3] = alpha;

      // If collision, tint the sweep line red
      if (hasCollision && angle > -1.2 && angle < -0.4 && dist > 1.8 && dist < 10) {
        buf[idx] = 255;
        buf[idx + 1] = 50;
        buf[idx + 2] = 50;
      }
    }
  }

  const png = buildPNG(size, size, buf);
  const icon = nativeImage.createFromBuffer(png, { width: size, height: size });
  icon.setTemplateImage(true);

  if (hasCollision) cachedCollision = icon;
  else cachedNormal = icon;

  return icon;
}

module.exports = { createTrayIcon };

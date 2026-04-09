/**
 * Generates a minimal valid 256x256 ICO file for electron-builder.
 * Uses only Node.js built-ins — no external dependencies.
 */
const fs = require('fs');
const path = require('path');

const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

// Create a 256x256 32-bit BMP bitmap embedded in an ICO container.
// ICO format: ICONDIR header + ICONDIRENTRY + BMP data (BITMAPINFOHEADER + pixel data)

const SIZE = 256;
const BPP = 32; // bits per pixel (RGBA)
const PIXEL_DATA_SIZE = SIZE * SIZE * 4; // RGBA bytes
const BMP_HEADER_SIZE = 40; // BITMAPINFOHEADER
const BMP_TOTAL = BMP_HEADER_SIZE + PIXEL_DATA_SIZE;

// ICONDIR (6 bytes)
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);       // reserved
iconDir.writeUInt16LE(1, 2);       // type: 1 = ICO
iconDir.writeUInt16LE(1, 4);       // image count: 1

// ICONDIRENTRY (16 bytes)
const iconDirEntry = Buffer.alloc(16);
iconDirEntry.writeUInt8(0, 0);     // width: 0 = 256
iconDirEntry.writeUInt8(0, 1);     // height: 0 = 256
iconDirEntry.writeUInt8(0, 2);     // color count: 0 = no palette
iconDirEntry.writeUInt8(0, 3);     // reserved
iconDirEntry.writeUInt16LE(1, 4);  // color planes
iconDirEntry.writeUInt16LE(BPP, 6); // bits per pixel
iconDirEntry.writeUInt32LE(BMP_TOTAL, 8); // size of image data
iconDirEntry.writeUInt32LE(6 + 16, 12);   // offset to image data

// BITMAPINFOHEADER (40 bytes)
const bmpHeader = Buffer.alloc(BMP_HEADER_SIZE);
bmpHeader.writeUInt32LE(BMP_HEADER_SIZE, 0); // header size
bmpHeader.writeInt32LE(SIZE, 4);             // width
bmpHeader.writeInt32LE(SIZE * 2, 8);         // height * 2 (ICO convention)
bmpHeader.writeUInt16LE(1, 12);              // color planes
bmpHeader.writeUInt16LE(BPP, 14);            // bits per pixel
bmpHeader.writeUInt32LE(0, 16);              // compression: none
bmpHeader.writeUInt32LE(PIXEL_DATA_SIZE, 20); // image size
bmpHeader.writeInt32LE(0, 24);               // X pixels per meter
bmpHeader.writeInt32LE(0, 28);               // Y pixels per meter
bmpHeader.writeUInt32LE(0, 32);              // colors in table
bmpHeader.writeUInt32LE(0, 36);              // important colors

// Pixel data — draw a simple icon design (dark bg + red play triangle)
// BMP rows are stored bottom-up
const pixels = Buffer.alloc(PIXEL_DATA_SIZE, 0);

function setPixel(x, y, r, g, b, a) {
  // BMP is bottom-up
  const flippedY = SIZE - 1 - y;
  const offset = (flippedY * SIZE + x) * 4;
  pixels[offset] = b;     // BMP is BGRA
  pixels[offset + 1] = g;
  pixels[offset + 2] = r;
  pixels[offset + 3] = a;
}

// Fill background: dark navy #1a1a2e
for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    // Rounded rect feel — darken corners
    const cx = x - SIZE / 2, cy = y - SIZE / 2;
    const dist = Math.sqrt(cx * cx + cy * cy);
    if (dist > 115) {
      setPixel(x, y, 0, 0, 0, 0); // transparent corners
    } else {
      setPixel(x, y, 26, 26, 46, 255); // #1a1a2e
    }
  }
}

// Draw rounded rectangle background: #0f3460
for (let y = 40; y < 216; y++) {
  for (let x = 20; x < 236; x++) {
    setPixel(x, y, 15, 52, 96, 255); // #0f3460
  }
}

// Draw play triangle: #e94560
// Triangle pointing right, centered
const tx = 90, ty = 80, tw = 90, th = 96;
for (let y = 0; y < th; y++) {
  const halfW = Math.round((y / th) * tw);
  for (let x = 0; x <= halfW; x++) {
    setPixel(tx + x, ty + y, 233, 69, 96, 255); // #e94560
  }
}
// Mirror bottom half
for (let y = 0; y < th; y++) {
  const halfW = Math.round(((th - y) / th) * tw);
  for (let x = 0; x <= halfW; x++) {
    setPixel(tx + x, ty + th + y, 233, 69, 96, 255);
  }
}

const icoBuffer = Buffer.concat([iconDir, iconDirEntry, bmpHeader, pixels]);
fs.writeFileSync(icoPath, icoBuffer);
console.log('ICO written to', icoPath, '(' + icoBuffer.length + ' bytes)');

/**
 * Generates a professional 256x256 ICO file — green & black theme.
 * Film strip with a play button design. No external dependencies.
 */
const fs = require('fs');
const path = require('path');

const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

const SIZE = 256;
const PIXEL_DATA_SIZE = SIZE * SIZE * 4;
const BMP_HEADER_SIZE = 40;
const BMP_TOTAL = BMP_HEADER_SIZE + PIXEL_DATA_SIZE;

// ICO container headers
const iconDir = Buffer.alloc(6);
iconDir.writeUInt16LE(0, 0);
iconDir.writeUInt16LE(1, 2);
iconDir.writeUInt16LE(1, 4);

const iconDirEntry = Buffer.alloc(16);
iconDirEntry.writeUInt8(0, 0);
iconDirEntry.writeUInt8(0, 1);
iconDirEntry.writeUInt8(0, 2);
iconDirEntry.writeUInt8(0, 3);
iconDirEntry.writeUInt16LE(1, 4);
iconDirEntry.writeUInt16LE(32, 6);
iconDirEntry.writeUInt32LE(BMP_TOTAL, 8);
iconDirEntry.writeUInt32LE(6 + 16, 12);

const bmpHeader = Buffer.alloc(BMP_HEADER_SIZE);
bmpHeader.writeUInt32LE(BMP_HEADER_SIZE, 0);
bmpHeader.writeInt32LE(SIZE, 4);
bmpHeader.writeInt32LE(SIZE * 2, 8);
bmpHeader.writeUInt16LE(1, 12);
bmpHeader.writeUInt16LE(32, 14);
bmpHeader.writeUInt32LE(0, 16);
bmpHeader.writeUInt32LE(PIXEL_DATA_SIZE, 20);
bmpHeader.writeInt32LE(0, 24);
bmpHeader.writeInt32LE(0, 28);
bmpHeader.writeUInt32LE(0, 32);
bmpHeader.writeUInt32LE(0, 36);

const pixels = Buffer.alloc(PIXEL_DATA_SIZE, 0);

// BMP is stored bottom-up, BGRA channel order
function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const flippedY = SIZE - 1 - y;
  const offset = (flippedY * SIZE + x) * 4;
  pixels[offset]     = b;
  pixels[offset + 1] = g;
  pixels[offset + 2] = r;
  pixels[offset + 3] = a;
}

function fillRect(x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = y1; y < y2; y++)
    for (let x = x1; x < x2; x++)
      setPixel(x, y, r, g, b, a);
}

// Smooth circle helper
function fillCircle(cx, cy, radius, r, g, b, a = 255) {
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius)
        setPixel(x, y, r, g, b, a);
    }
  }
}

// Rounded rectangle
function fillRoundRect(x1, y1, x2, y2, radius, r, g, b, a = 255) {
  fillRect(x1 + radius, y1, x2 - radius, y2, r, g, b, a);
  fillRect(x1, y1 + radius, x1 + radius, y2 - radius, r, g, b, a);
  fillRect(x2 - radius, y1 + radius, x2, y2 - radius, r, g, b, a);
  fillCircle(x1 + radius, y1 + radius, radius, r, g, b, a);
  fillCircle(x2 - radius, y1 + radius, radius, r, g, b, a);
  fillCircle(x1 + radius, y2 - radius, radius, r, g, b, a);
  fillCircle(x2 - radius, y2 - radius, radius, r, g, b, a);
}

// Colors — green & black theme
const BLACK      = [10, 10, 10];
const DARKGRAY   = [28, 28, 28];
const FILMSTRIP  = [20, 20, 20];
const GREEN      = [0, 200, 80];
const DARKGREEN  = [0, 140, 55];
const WHITE      = [255, 255, 255];

// --- Background: black rounded square ---
fillRoundRect(0, 0, SIZE, SIZE, 32, ...BLACK);

// --- Film strip body (dark gray bar across middle) ---
const stripTop = 72, stripBot = 184;
fillRect(0, stripTop, SIZE, stripBot, ...FILMSTRIP);

// --- Film strip sprocket holes (top and bottom rows) ---
const holeSize = 18;
const holeMargin = 10;
const holeY1 = stripTop + holeMargin;
const holeY2 = stripBot - holeMargin - holeSize;
const holeCount = 7;
const holeSpacing = Math.floor(SIZE / holeCount);

for (let i = 0; i < holeCount; i++) {
  const hx = Math.floor(i * holeSpacing + (holeSpacing - holeSize) / 2);
  // top holes
  fillRoundRect(hx, holeY1, hx + holeSize, holeY1 + holeSize, 3, ...DARKGRAY);
  // bottom holes
  fillRoundRect(hx, holeY2, hx + holeSize, holeY2 + holeSize, 3, ...DARKGRAY);
}

// --- Green circle background for play button ---
const cx = SIZE / 2, cy = SIZE / 2;
fillCircle(cx, cy, 52, ...DARKGREEN);
fillCircle(cx, cy, 48, ...GREEN);

// --- Play triangle (white, centered in circle) ---
// Pointing right, vertically centered
const triLeft  = cx - 14;
const triRight = cx + 22;
const triMidY  = cy;
const triHeight = 34;

for (let row = 0; row < triHeight; row++) {
  const half = row < triHeight / 2 ? row : triHeight - 1 - row;
  const progress = half / (triHeight / 2);
  const width = Math.round(progress * (triRight - triLeft));
  const y = triMidY - triHeight / 2 + row;
  for (let x = triLeft; x <= triLeft + width; x++) {
    setPixel(Math.round(x), Math.round(y), ...WHITE);
  }
}

// --- Top & bottom film strip accent lines (green) ---
fillRect(0, stripTop, SIZE, stripTop + 3, ...DARKGREEN);
fillRect(0, stripBot - 3, SIZE, stripBot, ...DARKGREEN);

const icoBuffer = Buffer.concat([iconDir, iconDirEntry, bmpHeader, pixels]);
fs.writeFileSync(icoPath, icoBuffer);
console.log('Icon written:', icoPath, '(' + icoBuffer.length + ' bytes)');

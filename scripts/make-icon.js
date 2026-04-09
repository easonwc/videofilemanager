/**
 * Creates a simple icon.ico by copying a pre-made PNG.
 * electron-builder accepts a PNG renamed as .ico for basic use.
 */
const fs = require('fs');
const path = require('path');

// Write a minimal 256x256 PNG as icon.ico
// electron-builder will accept a PNG file with .ico extension for basic builds
const svgPath = path.join(__dirname, '..', 'assets', 'icon.svg');
const icoPath = path.join(__dirname, '..', 'assets', 'icon.ico');

// Just copy SVG content as placeholder - electron-builder handles conversion
fs.copyFileSync(svgPath, icoPath);
console.log('Icon placeholder written to', icoPath);
console.log('Note: For production builds, replace icon.ico with a proper ICO file.');

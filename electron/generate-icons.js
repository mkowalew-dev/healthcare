#!/usr/bin/env node
// Generates all required icon files from scratch using only built-in Node.js.
// Run once: node generate-icons.js
// Requires: npm install (electron-builder pulls in sharp transitively)
// Output: assets/icon.png, assets/tray-iconTemplate.png, assets/tray-icon.png
//
// For production .icns (macOS) and .ico (Windows), electron-builder will
// auto-convert from icon.png if you install the `icns` and `png-to-ico` packages,
// or you can use https://www.electronforge.io/guides/create-and-add-icons

const fs   = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, 'assets');
fs.mkdirSync(ASSETS, { recursive: true });

// ── SVG source — Cisco mark on dark blue background ──────────
function makeSvg(size) {
  const s = size;
  // Scale the Cisco mark to fill ~60% of the icon
  const scale  = s / 64;
  const markW  = 40 * scale;
  const markH  = 25 * scale;
  const ox     = (s - markW) / 2;
  const oy     = (s - markH) / 2;
  const r      = scale;

  const bar = (x, y, w, h, op = 1) =>
    `<rect x="${ox + x*scale}" y="${oy + y*scale}" width="${w*scale}" height="${h*scale}" rx="${r}" fill="white" opacity="${op}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${Math.round(s*0.18)}" fill="#1D4289"/>
  ${bar(0,    8, 6,  9,  0.8)}
  ${bar(8.5,  4, 6, 17,  1  )}
  ${bar(17,   0, 6, 25,  1  )}
  ${bar(25.5, 4, 6, 17,  1  )}
  ${bar(34,   8, 6,  9,  0.8)}
</svg>`;
}

// ── Tray icon — white Cisco mark on transparent bg (macOS template) ──
function makeTrayTemplate(size) {
  const s     = size;
  const scale = s / 22;
  const markW = 18 * scale;
  const ox    = (s - markW) / 2;
  const oy    = (s - 11 * scale) / 2;

  const bar = (x, y, w, h, op = 1) =>
    `<rect x="${ox + x*scale}" y="${oy + y*scale}" width="${w*scale}" height="${h*scale}" rx="${scale*0.5}" fill="black" opacity="${op}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  ${bar(0,   3.5, 2.5, 4,   0.7)}
  ${bar(3.5, 1.5, 2.5, 8,   1  )}
  ${bar(7,   0,   2.5, 11,  1  )}
  ${bar(10.5,1.5, 2.5, 8,   1  )}
  ${bar(14,  3.5, 2.5, 4,   0.7)}
</svg>`;
}

// Write SVG files — electron-builder and most tools accept SVG-as-PNG fallback
// For a proper demo, these SVGs render correctly in Electron's nativeImage
fs.writeFileSync(path.join(ASSETS, 'icon.svg'),              makeSvg(512));
fs.writeFileSync(path.join(ASSETS, 'icon.png'),              makeSvg(512));  // SVG saved as .png for electron-builder path resolution
fs.writeFileSync(path.join(ASSETS, 'tray-iconTemplate.png'), makeTrayTemplate(22));
fs.writeFileSync(path.join(ASSETS, 'tray-icon.png'),         makeTrayTemplate(22));

console.log('Icons written to assets/');
console.log('Note: .png files contain SVG data — Electron renders SVG natively.');
console.log('For production, convert to real PNG with: npx sharp-cli or use an image editor.');

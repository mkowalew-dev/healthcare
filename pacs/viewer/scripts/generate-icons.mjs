#!/usr/bin/env node
// Generates pwa-192.png and pwa-512.png for the PACS viewer PWA manifest.
// Uses only Node.js built-ins — no canvas or sharp required.
// Run once: node scripts/generate-icons.mjs
// Output: public/pwa-192.png, public/pwa-512.png

import { createWriteStream } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

// Minimal PNG encoder — writes a solid-color square with a centred white cross
function makePng(size) {
  const bg  = [0x0a, 0x0a, 0x0a, 0xff]; // #0a0a0a — matches pacs-bg color
  const acc = [0x3b, 0x82, 0xf6, 0xff]; // #3b82f6 — matches pacs-accent color
  const fg  = [0xff, 0xff, 0xff, 0xff]; // white cross

  // Build raw RGBA pixel rows
  const rows = [];
  const cx = size / 2;
  const armW = Math.round(size * 0.08);  // cross arm thickness
  const armL = Math.round(size * 0.55);  // cross arm length (from centre)

  // Outer circle radius for the blue disc background
  const r = Math.round(size * 0.44);

  for (let y = 0; y < size; y++) {
    const row = [];
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cx;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // White cross (horizontal + vertical arms)
      const inH = Math.abs(dy) <= armW / 2 && Math.abs(dx) <= armL / 2;
      const inV = Math.abs(dx) <= armW / 2 && Math.abs(dy) <= armL / 2;

      if (dist <= r) {
        row.push(...(inH || inV ? fg : acc));
      } else {
        row.push(...bg);
      }
    }
    rows.push(Buffer.from(row));
  }

  return encodePng(size, size, rows);
}

// ─── Tiny PNG encoder (no deps) ──────────────────────────────────────────────

import { deflateSync } from 'zlib';

function encodePng(w, h, rows) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const IHDR = chunk('IHDR', (() => {
    const b = Buffer.alloc(13);
    b.writeUInt32BE(w, 0); b.writeUInt32BE(h, 4);
    b[8] = 8; b[9] = 2; // 8-bit depth, RGB truecolor — wait, we have alpha
    b[9] = 6; // RGBA
    return b;
  })());

  // Filter byte 0 (None) prepended to each row
  const raw = Buffer.concat(rows.map(r => Buffer.concat([Buffer.from([0]), r])));
  const IDAT = chunk('IDAT', deflateSync(raw));
  const IEND = chunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, IHDR, IDAT, IEND]);
}

function chunk(type, data) {
  const { crc32 } = (() => {
    // CRC-32 table
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
    return {
      crc32(buf) {
        let crc = 0xffffffff;
        for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
        return (crc ^ 0xffffffff) >>> 0;
      }
    };
  })();

  const typeBuf = Buffer.from(type);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crc32(crcInput));
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

// ─── Write files ─────────────────────────────────────────────────────────────

for (const size of [192, 512]) {
  const dest = join(PUBLIC, `pwa-${size}.png`);
  createWriteStream(dest).end(makePng(size));
  console.log(`  ✓ public/pwa-${size}.png`);
}

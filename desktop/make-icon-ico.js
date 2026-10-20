/* 把多张 PNG 打包成 Windows .ico（PNG 压缩条目，Vista+ 支持） */
'use strict';
const fs = require('fs');
const path = require('path');

const assets = path.join(__dirname, '..', 'assets');
const sizes = [16, 32, 48, 256];
const files = sizes.map(function (s) {
  if (s === 16) return path.join(__dirname, 'tray-16.png');
  if (s === 32) return path.join(__dirname, 'tray-32.png');
  return path.join(assets, 'icon-' + s + '.png');
});
const bufs = files.map(function (f) { return fs.readFileSync(f); });

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(bufs.length, 4);

let offset = 6 + 16 * bufs.length;
const entries = bufs.map(function (b, i) {
  const size = sizes[i];
  const e = Buffer.alloc(16);
  e.writeUInt8(size === 256 ? 0 : size, 0);
  e.writeUInt8(size === 256 ? 0 : size, 1);
  e.writeUInt8(0, 2);
  e.writeUInt8(0, 3);
  e.writeUInt16LE(1, 4);
  e.writeUInt16LE(32, 6);
  e.writeUInt32LE(b.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += b.length;
  return e;
});

const out = path.join(__dirname, 'build', 'icon.ico');
fs.writeFileSync(out, Buffer.concat([header].concat(entries).concat(bufs)));
console.log('ICO written:', out, fs.statSync(out).size, 'bytes');

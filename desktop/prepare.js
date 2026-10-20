/* =====================================================================
   构建前准备：把 NoteHub 根目录下的 notehub_server.js 复制到本工程内，
   让 electron-builder 能把它打进安装包（同名源文件只保留一份，始终最新）。
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'notehub_server.js');
const dir = path.join(__dirname, '_generated');
const dst = path.join(dir, 'notehub_server.js');

fs.mkdirSync(dir, { recursive: true });
fs.copyFileSync(src, dst);
console.log('已同步 notehub_server.js → _generated/notehub_server.js');

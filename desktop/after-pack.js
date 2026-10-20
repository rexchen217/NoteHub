/* =====================================================================
   打包后钩子：给主程序 exe 写入图标与版本信息
   因为 win.signAndEditExecutable=false（避免 electron-builder 下载含 macOS 符号
   链接的 winCodeSign 包，Windows 下创建符号链接需要管理员权限），
   rcedit 步骤被跳过，这里用本地 rcedit 在「打包进压缩包之前」补上，
   这样便携版与安装版内层的主程序都带正确图标。
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  const rcedit = path.join(__dirname, 'build', 'rcedit.exe');
  const ico = path.join(__dirname, 'build', 'icon.ico');
  const exe = path.join(context.appOutDir, context.packager.appInfo.productFilename + '.exe');

  if (!fs.existsSync(rcedit) || !fs.existsSync(ico) || !fs.existsSync(exe)) {
    console.log('afterPack: 跳过图标写入（缺少 rcedit / icon.ico / 目标 exe）');
    return;
  }

  execFileSync(rcedit, [
    exe,
    '--set-icon', ico,
    '--set-version-string', 'ProductName', 'NoteHub',
    '--set-version-string', 'FileDescription', 'NoteHub 笔记桌面版',
    '--set-version-string', 'CompanyName', 'NoteHub'
  ], { stdio: 'inherit' });

  console.log('afterPack: 图标与版本信息已写入 ' + path.basename(exe));
};

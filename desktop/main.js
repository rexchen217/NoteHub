/* =====================================================================
   NoteHub 桌面版（Electron 主进程）
   1) 内嵌 notehub_server.js，在本机固定端口 8080 提供站点 + 同步/AI 接口
   2) 打开窗口加载 http://localhost:8080/，与网页版功能完全一致
   固定端口是为了让 localStorage 来源稳定，笔记不会因端口变化而丢失。
   ===================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, Menu, Tray, nativeImage, shell } = require('electron');

const PORT = 8080;
let mainWindow = null;
let tray = null;
let lastPort = PORT;
let forceQuit = false;

/* 启动过程写入日志，方便排查（GUI 应用看不到控制台输出） */
function log() {
  try {
    const line = new Date().toISOString() + ' ' +
      Array.prototype.join.call(arguments, ' ') + '\n';
    fs.appendFileSync(path.join(app.getPath('userData'), 'desktop.log'), line);
  } catch (e) { /* 忽略日志写入失败 */ }
}

/* 站点目录：打包后在 app.asar 内，开发态在上一级目录 */
function resolveSiteDir() {
  return app.isPackaged
    ? path.join(__dirname, 'site')
    : path.join(__dirname, '..', 'site');
}

/* 内嵌同步服务；端口被占用或加载失败时不阻断使用 */
function startServer() {
  var srv;
  try {
    srv = require('./_generated/notehub_server.js');
  } catch (e) {
    log('加载同步服务失败：' + (e && e.message));
    return Promise.resolve(PORT);
  }
  return new Promise(function (resolve) {
    srv.server.on('error', function (err) {
      log('同步服务启动异常：' + (err && err.message));
      resolve(PORT);
    });
    srv.start(PORT, function (p) {
      log('同步服务已就绪，端口 ' + p);
      resolve(p);
    }, resolveSiteDir());
  });
}

function showWindow() {
  if (mainWindow) {
    mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  } else {
    createWindow(lastPort);
  }
}

/* 系统托盘：点关闭按钮只隐藏到托盘，从托盘菜单才真正退出 */
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'tray-16.png'));
  tray = new Tray(icon);
  tray.setToolTip('NoteHub');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 NoteHub', click: showWindow },
    { type: 'separator' },
    { label: '退出', click: function () { forceQuit = true; app.quit(); } }
  ]));
  tray.on('click', showWindow);
}

function createWindow(port) {
  lastPort = port;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 520,
    title: 'NoteHub',
    icon: path.join(__dirname, 'window-icon.png'),
    backgroundColor: '#1e1e1e',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false
    }
  });

  mainWindow.loadURL('http://localhost:' + port + '/');

  mainWindow.webContents.on('did-fail-load', function (e, code, desc, url) {
    log('页面加载失败 ' + code + ' ' + desc + ' ' + url);
  });

  /* 外部链接交给系统浏览器，不在应用内开新窗口 */
  mainWindow.webContents.setWindowOpenHandler(function (d) {
    if (/^https?:/i.test(d.url)) shell.openExternal(d.url);
    return { action: 'deny' };
  });

  /* 关闭按钮 → 隐藏到托盘，保持同步服务在线 */
  mainWindow.on('close', function (e) {
    if (!forceQuit) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', function () { mainWindow = null; });
}

/* 只允许单实例：重复双击时聚焦已打开的窗口 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(function () {
    log('应用启动，打包态=' + app.isPackaged + '，站点目录=' + resolveSiteDir());

    /* 打包版注册开机自启（登录 Windows 后自动启动，手机随时可同步）。
       便携版运行在临时解压目录，execPath 会失效，必须显式指向持久的 exe 路径。 */
    if (app.isPackaged) {
      try {
        const portable = process.env.PORTABLE_EXECUTABLE_FILE;
        app.setLoginItemSettings(portable
          ? { openAtLogin: true, path: portable }
          : { openAtLogin: true });
      } catch (e) { log('自启注册失败：' + e.message); }
    }

    createTray();
    return startServer().then(function (port) { createWindow(port); });
  });

  /* 所有窗口关闭后仍驻留托盘，由托盘菜单显式退出 */
  app.on('window-all-closed', function () { /* 保持托盘运行 */ });

  app.on('before-quit', function () { forceQuit = true; });
}

# NoteHub · 你的笔记，你自己的服务器

一个**完全自托管**的多端笔记应用：网页站点 + 本机零依赖同步服务 + Electron 桌面版 + Capacitor 安卓版。
笔记数据只落在你自己的电脑上——不注册、不上传、不看任何第三方云。

## 为什么是自托管

- **数据不出本机**：笔记存在 `%USERPROFILE%\NoteHub\data.json`，同步打到你自己机器的服务上。
- **服务端零依赖**：`notehub_server.js` 只用 Node 内置模块，单文件即可跑起来。
- **一套前端三端复用**：网页、桌面版、安卓版共用同一个 `site/`，改一处三端同时生效。

## 功能

- Markdown 富文本编辑：`contenteditable` 所见即所得，字号与颜色直接渲染，不露源码标签
- 代码高亮与公式渲染（自带 `highlight.js` / `math.js` / `markdown.js`，不依赖 CDN）
- 多设备同步与冲突合并：按 `note.id` 合并，`updatedAt` 大者胜；删除走墓碑机制
- 局域网直连（同一 Wi-Fi，速度最快）+ cloudflared 隧道外网访问
- 服务端每次写入前自动保留最近 5 份快照（`data.json.bak.1~5`），误删可回滚
- 桌面版常驻托盘、支持开机自启；安装版与便携版双产物

## 目录结构

```
site/                    纯前端站点（网页版入口，也是桌面 / 安卓版的唯一前端来源）
  index.html  manifest.webmanifest  sw.js
  css/styles.css
  js/app.js  markdown.js  highlight.js  math.js  seeds.js
notehub_server.js        零依赖同步服务（静态分发 + /api/sync）
启动NoteHub.bat           一键启动：本机服务 + 公网隧道，并打印局域网地址
assets/                  应用图标源文件与生成脚本
desktop/                 Electron 桌面版工程
android-app/             Capacitor 安卓版工程
```

## 快速开始（本机）

1. 装好 Node 18+；
2. 在仓库根目录运行：

```bash
node notehub_server.js 8080
```

3. 浏览器打开 `http://localhost:8080`。首次启动会在根目录生成 `key.txt`（同步密钥）并在控制台打印，把它填进各端的「同步设置」即可。

## 局域网 / 外网访问

双击 `启动NoteHub.bat`：它会打印本机内网地址（手机连同一 Wi-Fi 时用它直连），并另开一个窗口跑 cloudflared 隧道。

- 同一 Wi-Fi：`http://<你的内网IP>:8080`
- 不同网络：使用隧道窗口里显示的 `https://xxxx.trycloudflare.com`（**每次重启都会变**，需重新填入手机端）

cloudflared 不随仓库分发（52 MB 二进制）。到 [cloudflared Releases](https://github.com/cloudflare/cloudflared/releases) 下载 `cloudflared.exe` 放到仓库根目录即可。

## 构建桌面版

```bash
cd desktop
npm install
npm run dist        # 先跑 prepare.js 同步服务端源码，再 electron-builder 打包
```

产物输出到 `../dist-desktop/`：`NoteHub-Desktop.exe`（便携版）与 `NoteHub-Setup.exe`（NSIS 安装版）。

## 构建安卓版

```bash
cd android-app
npm install
# 把站点内容同步为安卓工程的 web 资源
xcopy /E /Y ..\site www\
npx cap sync android
npm run apk          # 等价于 cd android && gradlew.bat assembleDebug
```

安卓工程需要 JDK 17 与 Android SDK。`AndroidManifest.xml` 已声明 `usesCleartextTraffic="true"`，否则 Android 9+ 会禁止明文 HTTP 请求。

**签名说明**：仓库不含任何签名文件（`*.keystore` 与 `keystore.properties` 已在 `.gitignore` 排除）。要出 release 签名包请自备 keystore，并在 `android-app/android/keystore.properties` 里填好别名与口令。

## 同步协议

```json
{ "version": 1, "updatedAt": "…", "notes": [], "tombstones": [] }
```

- 请求走本机服务：`GET/POST /api/sync`，`?key=<同步密钥>` 校验
- 本地改动 1.5s 防抖推送；启动、回到前台（节流 60s）、`online` 事件时拉取；失败静默降级
- 墓碑保留 90 天：`deletedAt >= note.updatedAt` 时丢弃该笔记

## 安全与隐私

- 仓库**不含**你的笔记数据（`data.json`）、同步密钥（`key.txt`）、签名文件（`notehub.keystore` / `keystore.properties`），这些都写在 `.gitignore` 里，请勿手动提交。
- `?key=` 只是轻量校验，不是强鉴权。把服务暴露到公网前，请先修改 `key.txt`，并注意隧道地址等同于对外入口。
- 所有笔记都留在你自己设备上，本项目不含任何统计上报。

## 发布

Releases 提供安卓版 APK 与桌面版安装包（便携版 / 安装版），下载即用。

## 许可

桌面工程声明为 MIT；如果你的用途需要明确的开源协议，可在此基础上补一份 `LICENSE`。

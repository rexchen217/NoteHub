# NoteHub · 专为理工科学生打造的轻量笔记

> **258 KB、零框架、断网可用**：能排版数学公式，能高亮代码，手机和电脑自动同步。
> 上课记公式、写实验报告、整理代码片段、复盘错题——一个 App 全装下。

**为什么专门为理工类专业的学生做？** 因为文科笔记只要「打字 + 排版」，理工科笔记还要**公式**和**代码**。
大多数轻量笔记工具在这两点上都要求你装插件、连外网、或者干脆不支持；NoteHub 把这两件事做进了内核，
并且整个应用只有 258 KB。

## 四个硬指标

### 一、极致轻量

- 网页版整个 `site/` 只有 **12 个文件、258 KB**，其中业务代码约 213 KB
- **没有框架、没有打包步骤、不用 npm install**——打开浏览器就能用
- 同步服务 `notehub_server.js` **314 行、零依赖**，只用 Node 内置模块，一个文件跑起来
- **没有一行 CDN 外链**：公式渲染器、高亮器、Markdown 解析器全部本地自带，断网、内网、实验室没外网也能正常编辑
- 前端核心逻辑 `app.js` 1620 行，代码全部可读可改

### 二、代码高亮

内置自研轻量高亮器（`highlight.js`，658 行，配色对应 VS Code 默认深色主题 Dark+），开箱覆盖：

`C` `C++` `C#` `Java` `Python` `JavaScript` `TypeScript` `Go` `Rust` `PHP` `Ruby` `SQL` `HTML` `XML` `Vue` `CSS` `SCSS` `JSON` `YAML` `Bash / Shell` `Markdown` `Dockerfile` `Makefile` `INI` `TOML` `Properties`

代码块直接在笔记里按行高亮，实验报告、课程设计、刷题记录贴进去就能看。

### 三、数学渲染

内置轻量 LaTeX 子集渲染器（`math.js`，354 行，**纯 HTML + CSS 排版，不依赖 KaTeX / MathJax**），针对数学笔记的常用写法：

- 分数 `\frac` `\dfrac` `\tfrac`、根式 `\sqrt{x}` `\sqrt[n]{x}`
- 上下标 `x^{2}` `a_{i}`，正体文本 `\text{}` `\mathrm{}`
- 大型算符 `\lim` `\sum` `\prod` 及其上下限
- 多行对齐 `\begin{aligned}...\end{aligned}`、上划线 `\bar{x}`、上下叠放 `\overset{?}{=}`
- 定界符 `\left( \right)` `\big(` `\Big[`
- 希腊字母、逻辑与集合符号、间距命令 `\,` `\;` `\quad`

**写错了也不会崩**：未知命令按正体文本原样输出，一个手误不会毁掉整段推导。

### 四、手机 · 电脑 · 云同步

同一份笔记，在实验室台式机、宿舍笔记本、手机上随时接着改。

| 场景 | 怎么连 |
| --- | --- |
| 同一 Wi-Fi（推荐，最快） | 直连本机服务 `http://<内网IP>:8080`，地址固定 |
| 不同网络 / 在外 | cloudflared 隧道 `https://xxxx.trycloudflare.com`（重启会变，可重新填入） |

- **数据在你自己的电脑上**：笔记落在 `data.json`，同步打到自己机器的服务，不经过任何第三方云
- **冲突自动合并**：按 `note.id` 合并、`updatedAt` 大者胜，两个设备同时改同一条不会互相覆盖丢失
- **删除也有记录**：墓碑机制保留 90 天，误删可从其他设备恢复
- **双保险**：服务端每次写入前自动保留最近 5 份快照 `data.json.bak.1~5`

## 打开就能懂：内置三篇理工科示例笔记

- **Python 学习笔记：字符串 / 列表 / 字典**
- **高等数学笔记：高阶无穷小**
- **数理逻辑与集合论笔记：命题运算与主合取范式**

首次打开就有这三篇真实笔记（含公式、代码块与表格），能直接看出公式和代码是怎么渲染的。

## 理工科的典型用法

- **课堂速记**：老师写推导，你直接敲 LaTeX，公式当场成形，不用切 App
- **实验报告 / 课程设计**：代码块贴进去自动高亮，步骤、参数、结论混排
- **错题与证明整理**：公式、列表、表格、代码同框，复盘一遍就够
- **跨场地作业**：实验室台式机写一半，回宿舍用手机接着改，进度不断

## 目录结构

```
site/                    纯前端站点（网页版入口，也是桌面 / 安卓版的唯一前端来源）
  index.html  manifest.webmanifest  sw.js
  css/styles.css
  js/app.js  markdown.js  highlight.js  math.js  seeds.js
notehub_server.js        零依赖同步服务（静态分发 + /api/sync），314 行
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
- 不同网络：用隧道窗口里显示的 `https://xxxx.trycloudflare.com`（**每次重启都会变**，需重新填入手机端）

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
